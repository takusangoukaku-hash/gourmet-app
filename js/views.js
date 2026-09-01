// =====================================================
// 表示系: 地図(§6) / 一覧・検索(§7,8) / 写真(§9) / 統計・ランキング(§11)
// / 店舗詳細モーダル
// =====================================================
const Views = (() => {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  // ---------- 星評価の表示（角丸SVG・ゴールドグラデ・半星対応） ----------
  // 文字の「★」ベタ塗りをやめ、丸みのある星形にグラデーションで立体感を出す。
  // 平均値は 0.5 刻みに丸めて半星で表現する（例: 4.3 → ★4.5相当の半星）
  const STAR_PATH = 'M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2-5.6 3.2 1.3-6.2L3 9.5l6.3-.7z';
  const STAR_EMPTY = '#e8e0d0';
  const starIc = (kind, size) => {
    const p = `d="${STAR_PATH}" stroke-width="3" stroke-linejoin="round"`;
    let body;
    if (kind === 'full') body = `<path ${p} fill="url(#star-grad)" stroke="#f5a300"/>`;
    else if (kind === 'half') body = `<path ${p} fill="${STAR_EMPTY}" stroke="${STAR_EMPTY}"/>` +
      `<path ${p} clip-path="url(#star-half)" fill="url(#star-grad)" stroke="#f5a300"/>`;
    else body = `<path ${p} fill="${STAR_EMPTY}" stroke="${STAR_EMPTY}"/>`;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  };
  // 星5個の並び。size は星1個の1辺(px)
  const starSvg = (r, size = 14) => {
    const v = Math.max(0, Math.min(5, Math.round((+r || 0) * 2) / 2));
    let h = '';
    for (let i = 1; i <= 5; i++) h += starIc(v >= i ? 'full' : v >= i - 0.5 ? 'half' : 'empty', size);
    return `<span class="stars-svg" role="img" aria-label="星${v}">${h}</span>`;
  };
  // 入力用ボタンの星（塗りはCSSの .on で切り替える）
  const starBtn = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  // 味の評価の入力（0.5刻み対応）: 星の左半分タップ＝◯.5、右半分タップ＝◯.0
  // 登録フォームと記録の編集フォームで共用する
  function mountRatingStars(el, initial, onChange) {
    el.innerHTML = '';
    const btns = [];
    const paint = (val) => {
      btns.forEach((b, idx) => {
        const i = idx + 1;
        b.classList.toggle('on', val >= i);
        b.classList.toggle('half', val >= i - 0.5 && val < i);
      });
    };
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `星${i}（左半分で${i - 0.5}）`);
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sb-base" d="${STAR_PATH}"/><path class="sb-fill" d="${STAR_PATH}" clip-path="url(#star-half)"/></svg>`;
      b.addEventListener('click', (e) => {
        const r = b.getBoundingClientRect();
        const val = (e.clientX - r.left) < r.width / 2 ? i - 0.5 : i;
        paint(val);
        onChange(val);
      });
      el.appendChild(b);
      btns.push(b);
    }
    paint(+initial || 0);
  }
  // グラデーション・クリップの定義を文書に1回だけ入れる（各星が url(#…) で参照）
  (function () {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    d.innerHTML = '<svg><defs><linearGradient id="star-grad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffd75e"/><stop offset="1" stop-color="#f5a300"/></linearGradient>' +
      '<clipPath id="star-half"><rect x="0" y="0" width="12" height="24"/></clipPath></defs></svg>';
    document.body.appendChild(d);
  })();
  // 白黒ピクトグラム（駅・住所）
  const IC_STATION = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 11h12"/><path d="M9 20l1.5-4"/><path d="M15 20l-1.5-4"/></svg>';
  const IC_PIN = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>';
  const IC_EDIT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  // Instagram風の「⋯」（横に点3つ）。投稿ヘッダー右端のメニューボタンに使う
  const IC_MORE = '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
  const IC_HEART = '<svg class="heart-ic" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S3.5 15 3.5 9.2A4.2 4.2 0 0 1 12 6.8a4.2 4.2 0 0 1 8.5 2.4C20.5 15 12 20.5 12 20.5z"/></svg>';
  // ナビ用の白黒ピクトグラム（ナビ矢印・車・電車・徒歩）
  const IC_NAV = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2.2-7.8z"/></svg>';
  const IC_BOOKMARK = '<svg class="ic bm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  const IC_COMMENT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a8.4 8.4 0 0 1-.9-4A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>';
  // お気に入りマーク（小さな塗りハート）: 絵文字⭐の置き換え
  const IC_FAV = '<svg class="ic-fav" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5S3.5 15 3.5 9.2A4.2 4.2 0 0 1 12 6.8a4.2 4.2 0 0 1 8.5 2.4C20.5 15 12 20.5 12 20.5z"/></svg>';

  // 空状態・スケルトン（読み込み中の仮枠）の共通部品
  const emptyBox = (icon, msg, extra) => `<div class="empty">${icon ? `<div class="empty-ic">${icon}</div>` : ''}<p>${msg}</p>${extra || ''}</div>`;
  const BIG = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const EMPTY_IC_PEOPLE = BIG('<circle cx="9" cy="8" r="3.4"/><path d="M2.6 20c0-3.4 2.9-5.5 6.4-5.5s6.4 2.1 6.4 5.5"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.4"/><path d="M18 14.9c2.6.5 4.5 2.4 4.5 5.1"/>');
  const EMPTY_IC_PHOTO = BIG('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m3 17 5-4 4 3 4-3 5 4"/>');
  const EMPTY_IC_FORK = BIG('<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11"/><path d="M16 3c-1.5 0-2.5 2-2.5 4.5S15 12 16 12v9"/>');
  const SKEL_FEED = (() => {
    const card = '<div class="skel-card"><div class="skel-head"><div class="skeleton skel-avatar"></div><div class="skeleton skel-line" style="width:38%"></div></div><div class="skeleton skel-photo"></div><div class="skel-body"><div class="skeleton skel-line" style="width:28%;margin-bottom:8px"></div><div class="skeleton skel-line" style="width:62%"></div></div></div>';
    return card + card;
  })();
  const SKEL_GRID = '<div class="skel-grid">' + Array(9).fill('<div class="skeleton"></div>').join('') + '</div>';
  // 地図の店舗シート「フォロワーの写真」読み込み中の骨組み（人の行×2）
  const SKEL_FROWS = Array(2).fill(
    '<div class="msh-frow"><div class="skeleton skel-favatar"></div>'
    + '<div class="msh-fphotos">' + Array(3).fill('<div class="skeleton skel-fph"></div>').join('') + '</div></div>').join('');
  const IC_CAR = '<svg class="nm-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l1.6-4.2A2 2 0 0 1 7.5 6.5h9A2 2 0 0 1 18.4 7.8L20 12"/><rect x="3" y="12" width="18" height="5" rx="1.6"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/></svg>';
  const IC_TRAIN = '<svg class="nm-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 11h12"/><circle cx="9" cy="13.5" r="0.6"/><circle cx="15" cy="13.5" r="0.6"/><path d="M9 20l1.5-3"/><path d="M15 20l-1.5-3"/></svg>';
  const IC_WALK = '<svg class="nm-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4.2" r="1.6"/><path d="M13 8l-1.5 3.5L14 14l1 6"/><path d="M11.5 11.5L8.5 13"/><path d="M14 12.5l3 1"/><path d="M11.5 13.5L9 20"/></svg>';
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('ja-JP') : '－';
  // 評価の数値表示は全て小数第一位まで（3 → 3.0）。値なしは呼び出し側で分岐する
  const fmtR = (r) => (Math.round((+r || 0) * 10) / 10).toFixed(1);
  // 「2時間前」「3日前」のような相対表記（フォロワーの写真の撮影時期表示用）
  const relTime = (iso) => {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}分前`;
    if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}日前`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400 / 7)}週間前`;
    if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)}ヶ月前`;
    return `${Math.floor(s / 86400 / 365)}年前`;
  };
  // date input用 YYYY-MM-DD（ローカル日付）
  const toDateInput = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  // object URL のキャッシュ（photoId → url）
  const urlCache = new Map();
  function photoUrl(rec) {
    if (!rec) return null;
    // 別端末から取り込んだ写真はローカルにblobが無く、クラウドの公開URLで表示する
    if (!rec.blob && rec.remoteUrl) return rec.remoteUrl;
    if (!rec.blob) return null;
    if (!urlCache.has(rec.id)) urlCache.set(rec.id, URL.createObjectURL(rec.blob));
    return urlCache.get(rec.id);
  }

  // ---------- サムネイル（グリッド・一覧用の縮小画像） ----------
  // 元の写真は大きい（数MB）ので、一覧では縮小した画像を使って表示を軽くする。
  // 一度作ったサムネイルはIndexedDBに保存し、次回からは生成せずに即表示する。
  // Retina画面でぼやけないよう長辺640px。THUMB_Vを上げると古いサムネは作り直される
  const THUMB_DIM = 640, THUMB_V = 2;
  const thumbCache = new Map(); // photoId → Promise<url>
  function thumbUrl(rec) {
    if (!rec) return Promise.resolve(null);
    if (!rec.blob) return Promise.resolve(rec.remoteUrl || null); // 別端末の写真は公開URLのまま
    if (thumbCache.has(rec.id)) return thumbCache.get(rec.id);
    const p = (async () => {
      // 保存済みでも古い規格（小さい320px）のものは作り直す
      let blob = (rec.thumbV === THUMB_V) ? rec.thumb : null;
      if (!blob) {
        try {
          const bmp = await createImageBitmap(rec.blob);
          const scale = Math.min(1, THUMB_DIM / Math.max(bmp.width, bmp.height));
          const w = Math.max(1, Math.round(bmp.width * scale));
          const h = Math.max(1, Math.round(bmp.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(bmp, 0, 0, w, h);
          bmp.close();
          blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
          if (blob) Store.putPhotoThumb(rec.id, blob, THUMB_V).catch(() => {});
        } catch (e) { blob = null; } // 生成に失敗したら元画像で表示
      }
      return URL.createObjectURL(blob || rec.blob);
    })();
    thumbCache.set(rec.id, p);
    return p;
  }
  // <img> にサムネイルを非同期で差し込む
  function setThumb(img, rec) {
    thumbUrl(rec).then(u => { if (u && img.isConnected !== false) img.src = u; });
  }
  // 縦向きに撮った写真は横長・正方形の枠で切り抜くと大きく見切れるので、
  // 全ての<img>で読み込み完了時に縦横を比べ、縦長なら .portrait を付ける。
  // どの枠で「全体を収める」表示に切り替えるかはCSS側で指定する（アバター等は対象外）。
  // loadイベントはバブリングしないため、キャプチャで文書全体の<img>を拾う
  document.addEventListener('load', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.naturalWidth) {
      img.classList.toggle('portrait', img.naturalHeight > img.naturalWidth);
    }
  }, true);
  // 大きく表示する写真用: サムネイルを即出ししつつ、フル解像度が読めたら差し替える
  function setFullPhoto(img, rec) {
    setThumb(img, rec);
    const full = photoUrl(rec);
    if (!full) return;
    const pre = new Image();
    pre.onload = () => { if (img.isConnected !== false) img.src = full; };
    pre.src = full;
  }

  // ========== 地図（MapLibre GLネイティブ: 2本指で回転可能） ==========
  let map = null, heatOn = false, mapLoaded = false, pendingRefresh = false, mapPopup = null;
  let userMarker = null;      // 現在地マーカー（青い点）
  let placeMarker = null;     // 地名検索の目印ピン（検索した場所を示す。タップで消える）
  let lastKnownPos = null;    // 直近の現在地 { lat, lon }（ナビの出発地に使う）
  let mapScope = 'me';        // 地図の表示範囲: 'me' 自分のみ(既定) / 'all' 自分＋フォロー中 / 'wish' 行きたい店のみ
  let mapHasView = false;     // 一度でも視点が決まったらtrue。以降の再描画では視点を勝手に動かさない
                              // （店舗詳細を閉じたりタブを往復してもズームが戻らないように）
  let networkLoaded = false;  // フォロー中の人の記録を読み込み済みか（地図を開いたとき自動で読む）
  let networkPosts = [];      // つながっている人の投稿（地図「みんな」用）
  const mapContrib = new Map(); // 自分の店ピンに合算されたフォロワー（shopId → [{username, avatar}]）

  // 店名の表記ゆれを吸収して比較（全角半角・空白・大文字小文字の違いを無視）
  const normShopName = (x) => String(x || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  // 店名が同じ店を指しているか。完全一致に加えて「片方がもう片方を含む」も同一とみなす
  // （Google検索は「〇〇 渋谷店」、OSM検索は「〇〇」のように登録経路で名前の形式が違うため）
  function shopNamesMatch(x, y) {
    const a = normShopName(x), b = normShopName(y);
    if (!a || !b) return false;
    return a === b || (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a)));
  }
  // フォロー中の人の投稿がこの店のものか（店名が同一視でき＋300m以内）
  // 座標が無い場合だけは、誤結合を防ぐため完全一致のみ
  function postMatchesShop(p, s) {
    if (!p || !s || !shopNamesMatch(p.shopName, s.name)) return false;
    if (p.lat == null || p.lon == null || s.lat == null || s.lon == null) {
      return normShopName(p.shopName) === normShopName(s.name);
    }
    return Store.distMeters(s.lat, s.lon, p.lat, p.lon) < 300;
  }
  const followerPostsForShop = (s) => networkPosts.filter(p => postMatchesShop(p, s));

  // ========== 味覚一致率・あなた向け評価（BITEMAPの核） ==========
  // 全員の平均ではなく「自分と味覚が近い人の評価」を重視した、自分専用の店舗評価を作る。
  //  - 味覚一致率: 共通して評価した店舗での評価の近さを 0〜100% に数値化
  //  - あなた向け評価: 一致率が高い人の評価ほど重くした加重平均（自分の実体験は最重視）
  let tasteKey = '';
  let tasteRates = new Map(); // username → { rate, common }
  function tasteData() {
    const key = networkPosts.length + ':' + ((networkPosts[0] || {}).id || '') + ':' + Store.visits().length;
    if (key === tasteKey) return tasteRates;
    tasteKey = key;
    tasteRates = new Map();
    const myShops = Store.shops()
      .map(s => ({ s, avg: Store.avgRating(s.id) }))
      .filter(x => x.avg);
    const byUser = new Map();
    for (const p of networkPosts) {
      if (!p.username || !p.rating) continue;
      if (!byUser.has(p.username)) byUser.set(p.username, []);
      byUser.get(p.username).push(p);
    }
    for (const [name, posts] of byUser) {
      // 共通店舗ごとに [自分の平均, その人の平均] を集める
      const pairs = [];
      for (const { s, avg } of myShops) {
        const rs = posts.filter(p => postMatchesShop(p, s)).map(p => p.rating);
        if (!rs.length) continue;
        pairs.push([avg, rs.reduce((a, b) => a + b, 0) / rs.length]);
      }
      const n = pairs.length;
      if (!n) { tasteRates.set(name, { rate: null, common: 0, conf: 'none' }); continue; }
      // 仕様: ピアソン相関係数を基本に0〜1へ正規化。相関は「上下の付け方の一致」を見るので、
      // 評価水準のずれ（常に+2上に付ける等）を拾うため評価差の近さも3割混ぜる
      const avgDiff = pairs.reduce((a, [x, y]) => a + Math.abs(x - y), 0) / n;
      const closeness = 1 - avgDiff / 4; // 差0→1、真逆(差4)→0
      let sim = closeness;
      if (n >= 3) {
        const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
        const my = pairs.reduce((a, p) => a + p[1], 0) / n;
        let sxy = 0, sxx = 0, syy = 0;
        for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
        if (sxx > 0 && syy > 0) sim = ((sxy / Math.sqrt(sxx * syy) + 1) / 2) * 0.7 + closeness * 0.3;
      }
      // 信頼度: 共通5件未満は非表示・5〜19件は薄く・20件以上で通常表示（仕様書4-3）
      const conf = n < 5 ? 'low' : n < 20 ? 'mid' : 'high';
      tasteRates.set(name, { rate: Math.max(0, Math.min(100, Math.round(sim * 100))), common: n, conf });
    }
    return tasteRates;
  }
  function tasteMatch(username) {
    return tasteData().get(username) || { rate: null, common: 0 };
  }
  // 店（{name, lat, lon} があれば何でも）の「全体評価」と「あなた向け評価」。
  //  全体 = 自分＋評価した人たちの単純平均 ／ あなた向け = 一致率の2乗で重み付けした平均
  function ratingPair(shopLike) {
    const my = Store.matchShop({ name: shopLike.name, lat: shopLike.lat, lon: shopLike.lon });
    const mine = my ? Store.avgRating(my.id) : 0;
    const byUser = new Map();
    for (const p of networkPosts) {
      if (!p.rating || !postMatchesShop(p, shopLike)) continue;
      if (!byUser.has(p.username)) byUser.set(p.username, []);
      byUser.get(p.username).push(p.rating);
    }
    const parts = []; // { r, w }
    let sum = 0, n = 0;
    if (mine) { parts.push({ r: mine, w: 1.0 }); sum += mine; n++; } // 自分の評価は一致率100%扱い
    for (const [name, arr] of byUser) {
      const r = arr.reduce((a, b) => a + b, 0) / arr.length;
      sum += r; n++;
      const m = tasteMatch(name);
      // 重み＝味覚一致率。一致率が出せない人はごく弱く反映
      const w = m.rate == null ? 0.15 : Math.max(0.05, m.rate / 100);
      parts.push({ r, w });
    }
    if (!n) return { personal: 0, overall: 0, raters: 0 };
    const personal = parts.reduce((a, x) => a + x.r * x.w, 0) / parts.reduce((a, x) => a + x.w, 0);
    return {
      personal: Math.round(personal * 10) / 10,
      overall: Math.round(sum / n * 10) / 10,
      raters: n,
    };
  }
  // 一致率バッジ（緑）: 一致率が計算できる人にだけ出す
  function tasteBadge(username, small) {
    const m = tasteMatch(username);
    if (m.rate == null || m.conf === 'low') return ''; // 共通5件未満は信頼できないため出さない
    return `<span class="tm-badge${small ? ' small' : ''}${m.conf === 'mid' ? ' dim' : ''}"
      title="共通店舗${m.common}件">味覚一致 ${m.rate}%</span>`;
  }
  // あなた向け評価と全体評価を並べる共通部品（デザイン案の2枚の箱）
  function ratePairHtml(pair, opt) {
    const o = opt || {};
    if (!pair.raters) return '';
    return `<div class="rp-wrap${o.compact ? ' compact' : ''}">
      <div class="rp-box rp-you"><span class="rp-label">あなた向け評価</span>
        <span class="rp-val">${starIc('full', o.compact ? 14 : 18)}${fmtR(pair.personal)}</span></div>
      <div class="rp-box"><span class="rp-label">全体評価</span>
        <span class="rp-val muted">${starIc('full', o.compact ? 12 : 14)}${fmtR(pair.overall)}</span>
        ${o.count ? `<span class="rp-n">（${pair.raters}人の評価）</span>` : ''}</div>
    </div>`;
  }
  const networkById = new Map(); // ピンfeature id → 投稿データ（他人のピンのポップアップ用）
  // ピンfeature id → 本人＋フォロワーの評価プール（味＝各評価、店の3軸＝人ごとの値）
  //  { taste:[], casual:[], atmosphere:[], speed:[] }。ポップアップで平均を出すのに使う
  const mapStats = new Map();
  // 平均を出す小ヘルパー: 味は小数第1位、店の3軸(気軽さ/雰囲気/早さ)は .0/.5 に丸める
  const avgOf = (rs) => rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length * 10) / 10 : 0;
  const bandOf = (avg) => (Math.round(avg * 10) % 10) >= 5 ? 1 : 0; // .5以上か（白い点の有無）
  function fmtStatAvg(rs, half) {
    if (!rs || !rs.length) return null;
    let a = rs.reduce((x, y) => x + y, 0) / rs.length;
    a = half ? Math.round(a * 2) / 2 : Math.round(a * 10) / 10;
    return a.toFixed(1);
  }
  // 味＋店の3軸の平均をポップアップ用のHTMLにする（本人＋フォロワーを合わせた評価）
  function mapStatsLine(st) {
    if (!st) return '';
    const t = fmtStatAvg(st.taste, false);
    const axes = [['気軽さ', 'casual'], ['雰囲気', 'atmosphere'], ['早さ', 'speed']]
      .map(([label, k]) => { const v = fmtStatAvg(st[k], true); return v ? `${label} ${v}` : null; })
      .filter(Boolean);
    return `<div class="p-sub">${t ? starSvg(+t, 12) : ''} 味 ${t || '－'}</div>`
      + (axes.length ? `<div class="p-sub">${axes.join('　')}</div>` : '');
  }

  // ベクトル地図（MapLibre GL）: Apple Maps風の配色で自前スタイリング
  //  - ラベルは「都市名（広域のみ）・駅名（ズーム12以上）・主要施設」だけに限定
  //  - 道路名・番地・細かな地名は非表示ですっきりさせる
  //  - ベクトル描画なのでズーム中のちらつき（白黒タイル）も起きない
  const JA_NAME = ['coalesce', ['get', 'name:ja'], ['get', 'name']];
  const FONT = ['NotoSansCJKjp-Regular'];

  function baseMapStyle(dark) {
    // Apple Maps参考の配色（ライト/ダーク）
    const c = dark ? {
      bg: '#212227', water: '#17344d', park: '#26372a', wood: '#223125',
      building: '#2a2b31', roadMinor: '#33353b', roadMain: '#43464e',
      roadCasing: '#1b1c20', highway: '#8d7439', rail: '#45464c',
      boundary: '#4a4658', text: '#c9c7c2', halo: '#1a1b1f',
      station: '#8fb0e8', poi: '#98938a',
    } : {
      bg: '#f5f4ef', water: '#a9d1e6', park: '#c8e2ae', wood: '#b9d8a0',
      building: '#e8e4db', roadMinor: '#ffffff', roadMain: '#ffffff',
      roadCasing: '#e2ddd2', highway: '#f9d975', rail: '#cfc9bf',
      boundary: '#bcb2cb', text: '#55524c', halo: '#ffffff',
      station: '#3a6db4', poi: '#85806f',
    };
    const label = (id, layer, filter, minzoom, size, color, haloW) => ({
      id, type: 'symbol', source: 'omt', 'source-layer': layer, minzoom,
      filter,
      layout: {
        'text-field': JA_NAME, 'text-font': FONT, 'text-size': size,
        'text-max-width': 9, 'text-padding': 4,
      },
      paint: {
        'text-color': color,
        'text-halo-color': c.halo, 'text-halo-width': haloW,
      },
    });
    // 周辺施設（POI）: Google/Apple地図のように拡大すると店舗・コンビニ等を表示
    //  種別で色分け（飲食=オレンジ / 買い物・コンビニ=青 / その他=緑）
    const POI_COLOR = ['match', ['get', 'class'],
      ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'pub', 'ice_cream', 'food_court'], '#ef6c34',
      ['convenience', 'grocery', 'supermarket', 'shop', 'clothing_store', 'bakery',
        'books', 'gift', 'florist', 'butcher', 'bicycle', 'car', 'laundry', 'department_store'], '#3478f6',
      '#12a56b'];
    // 名前があり、かつ別途表示している種別（駅・大学・公園など）を除いたPOIのみ
    const POI_FILTER = ['all',
      ['has', 'name'],
      ['!', ['in', ['get', 'class'],
        ['literal', ['railway', 'bus', 'college', 'stadium', 'museum', 'zoo', 'aquarium',
          'theme_park', 'castle', 'airport', 'park', 'cemetery', 'ferry_terminal', 'harbor']]]]];
    return {
      version: 8,
      glyphs: 'https://maps.gsi.go.jp/xyz/noto-jp/{fontstack}/{range}.pbf',
      sources: {
        omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': c.bg } },
        { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': c.wood, 'fill-opacity': 0.6 } },
        { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['==', ['get', 'class'], 'grass'], paint: { 'fill-color': c.park, 'fill-opacity': 0.5 } },
        { id: 'landuse-green', type: 'fill', source: 'omt', 'source-layer': 'landuse',
          filter: ['in', ['get', 'class'], ['literal', ['pitch', 'cemetery', 'stadium']]],
          paint: { 'fill-color': c.park, 'fill-opacity': 0.6 } },
        { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
          paint: { 'fill-color': c.park, 'fill-opacity': 0.75 } },
        { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
          paint: { 'fill-color': c.water } },
        { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
          paint: { 'line-color': c.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 16, 3] } },
        { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14,
          paint: { 'fill-color': c.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 16, 0.9] } },
        // 道路（細い順に重ねる）
        { id: 'road-service', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14,
          filter: ['in', ['get', 'class'], ['literal', ['service', 'track', 'path']]],
          paint: { 'line-color': c.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 4] } },
        { id: 'road-minor-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
          filter: ['==', ['get', 'class'], 'minor'],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': c.roadCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.6, 18, 9] } },
        { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
          filter: ['==', ['get', 'class'], 'minor'],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': c.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 13, 1, 18, 7.5] } },
        { id: 'road-mid-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10,
          filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': c.roadCasing,
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.0, 13, 2.2, 18, 12] } },
        { id: 'road-mid', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10,
          filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': c.roadMain,
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 1.5, 18, 10] } },
        { id: 'road-major-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 8,
          filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk']]],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': c.roadCasing,
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 12, 2.2, 14, 4.5, 18, 14] } },
        { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 8,
          filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk']]],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': c.roadMain,
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 1.5, 14, 3.2, 18, 12] } },
        { id: 'motorway-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6,
          filter: ['==', ['get', 'class'], 'motorway'],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': dark ? '#5c4c22' : '#e8bd50',
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 10, 1.7, 13, 4.5, 18, 15] } },
        { id: 'motorway', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6,
          filter: ['==', ['get', 'class'], 'motorway'],
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': c.highway,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1.2, 13, 3.2, 18, 12] } },
        { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11,
          filter: ['==', ['get', 'class'], 'rail'],
          paint: { 'line-color': c.rail, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 2.2] } },
        // 国・都道府県の境界。世界全体まで引いても国の形が分かるよう z0 から表示する
        { id: 'boundary', type: 'line', source: 'omt', 'source-layer': 'boundary',
          filter: ['<=', ['get', 'admin_level'], 4],
          paint: { 'line-color': c.boundary,
            'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 5, 1],
            'line-dasharray': [3, 2] } },
        // ===== ラベル（国名・都市名・駅名・主要施設のみ）=====
        // 国名: 広域（z1〜）で表示。Googleマップのように引いた状態でも地名が分かる
        label('place-country', 'place',
          ['==', ['get', 'class'], 'country'], 1,
          ['interpolate', ['linear'], ['zoom'], 1, 10, 5, 13], c.text, 1.4),
        label('place-city', 'place',
          ['==', ['get', 'class'], 'city'], 4,
          ['interpolate', ['linear'], ['zoom'], 5, 10, 12, 13], c.text, 1.4),
        label('place-town', 'place',
          ['==', ['get', 'class'], 'town'], 9,
          ['interpolate', ['linear'], ['zoom'], 9, 9.5, 14, 12], c.text, 1.3),
        // 駅名: ある程度拡大したとき（z12〜）のみ表示
        label('station-label', 'poi',
          ['==', ['get', 'class'], 'railway'], 12,
          ['interpolate', ['linear'], ['zoom'], 12, 9.5, 16, 12], c.station, 1.2),
        // 主要施設のみ: 大学・スタジアム・博物館・動物園・遊園地・城など
        // （病院はOSM上でクリニックとの区別が曖昧なため表示しない）
        label('poi-major', 'poi',
          ['any',
            ['all', ['==', ['get', 'class'], 'college'], ['==', ['get', 'subclass'], 'university']],
            ['in', ['get', 'class'], ['literal', ['stadium', 'museum', 'zoo', 'aquarium', 'theme_park', 'castle']]],
          ], 14,
          10.5, c.poi, 1.2),
        // 空港
        label('airport-label', 'aerodrome_label',
          ['has', 'iata'], 9, 10.5, c.poi, 1.2),
        // 周辺施設の名前（拡大したz16〜）。点は出さず名前のみ。種別で色分け
        // 駅名などより優先度は低く、重なると隠れる
        { id: 'poi-labels', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 16,
          filter: POI_FILTER,
          layout: {
            'text-field': JA_NAME, 'text-font': FONT, 'text-size': 10.5,
            'text-max-width': 8,
            'symbol-sort-key': ['coalesce', ['get', 'rank'], 100], // rankが小さい=重要を優先
          },
          paint: {
            'text-color': POI_COLOR, 'text-halo-color': c.halo, 'text-halo-width': 1.2,
          } },
      ],
    };
  }

  // 味の評価(0〜5)→ピンの色（凡例のr1〜r5と同じ）
  // 評価の色（色相を大きく離してくっきり）: ★1灰→★2青→★3緑→★4橙→★5赤。[0]=評価なし（薄灰）
  const PIN_COLORS = ['#CBD5E1', '#94A3B8', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444'];
  const WISH_COLOR = '#8B5CF6'; // 行きたい店のピン（評価色と混ざらない紫）
  const colorByR = (prop) => ['match', ['get', prop],
    0, PIN_COLORS[0], 1, PIN_COLORS[1], 2, PIN_COLORS[2], 3, PIN_COLORS[3], 4, PIN_COLORS[4], 5, PIN_COLORS[5],
    PIN_COLORS[3]];
  // ピンの半径。低倍でも見えやすい一定サイズ（約4px＝23区が画面から外れるz9あたりの
  // 大きさ）。近い点をまとめたクラスタも件数で大きくせず、この同じサイズで表示する。
  // z12以降でやや大きくして詳細（しずく型）へ繋ぐ。
  // 日本全体〜世界（z0〜5）まで引くと点が現在地の青い点に埋もれるため、その帯だけ大きくする
  const PIN_RADIUS = ['interpolate', ['linear'], ['zoom'],
    0, 7, 5, 6.5, 7, 4.6, 10, 4, 12, 4.8, 13, 5.4];
  // ピンの白フチ。広域では地図の色に沈まないよう少し太くする
  const PIN_STROKE = ['interpolate', ['linear'], ['zoom'],
    0, 1.8, 7, 1.4, 11, 1.4, 12, 2];
  // 料理ジャンルフィルタ（複数選択可。空 = すべて表示）
  const mapGenreFilter = new Set();
  let buildMapGenreChips = null; // 地図の絞り込みパネルのジャンルチップを組み直す（initMapで実体を設定）

  function shopMatchesGenre(shopId) {
    if (!mapGenreFilter.size) return true;
    return Store.visitsOf(shopId).some(v => (v.dishGenres || []).some(g => mapGenreFilter.has(g)));
  }

  // 地図上の検索バーによるキーワード絞り込み（店名・駅・地名・ジャンル）
  let mapKeyword = '';
  function shopMatchesKeyword(s) {
    const kw = mapKeyword.toLowerCase();
    if (!kw) return true;
    const hay = [s.name, s.station, s.city, s.pref, s.address, s.shopGenre,
      ...Store.visitsOf(s.id).flatMap(v => v.dishGenres || [])].join(' ').toLowerCase();
    return hay.includes(kw);
  }

  // 星評価フィルタ（味＝メイン＋店の評価3軸）
  const AXIS_LABEL = { taste: '味', casual: 'カジュアル度', atmosphere: '雰囲気', speed: '提供の早さ' };
  function shopMatchesAxes(shop) {
    const tasteMin = +($('#mf-taste').value || 0);
    // 味は平均だけでなく、1回でも★tasteMin以上の記録があれば通す（検索タブと同じ基準。
    // ピンの色は平均評価のままなので、平均で超えている店との違いは色でわかる）
    if (tasteMin > 0 && Store.avgRating(shop.id) < tasteMin
      && !Store.visitsOf(shop.id).some(v => (v.rating || 0) >= tasteMin)) return false;
    for (const k of ['casual', 'atmosphere', 'speed']) {
      const min = +($('#mf-' + k).value || 0);
      if (min > 0 && (shop[k] || 0) < min) return false;
    }
    return true;
  }

  function initMap() {
    if (map) return;
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    // MapLibre GLネイティブ: 2本指ドラッグ（スマホ）/右ドラッグ（PC）で回転できる
    map = new maplibregl.Map({
      container: 'map-canvas',
      style: baseMapStyle(dark),
      // minZoom 0: Googleマップのように世界全体まで引いて見られるようにする
      center: [139.7671, 35.6812], zoom: 11, minZoom: 0, maxZoom: 20,
      attributionControl: { compact: true },
    });
    // ズーム＋コンパス（回転リセット）は右下へ（左上は検索バーが重なるため）
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    // 現在地ボタン: ワンタップで現在地周辺へ移動（ズーム16まで寄る）。現在地は青い点で表示
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 8000 },
      fitBoundsOptions: { maxZoom: 16 },
      trackUserLocation: false,
      showUserLocation: true,
    }), 'bottom-right');
    // 出典表示(ⓘ)は初期状態では閉じておき、タップしたときだけ詳細を開く
    // （MapLibreはデータ読み込みのたびに開き直すことがあるため、読み込み完了後に閉じる）
    const closeAttrib = () => {
      const attrib = document.querySelector('#map-canvas details.maplibregl-ctrl-attrib');
      if (!attrib) return;
      // MapLibreはopen属性とcompact-showクラスの両方で開閉を管理しているため、両方閉じる
      attrib.removeAttribute('open');
      attrib.classList.remove('maplibregl-compact-show');
    };
    map.once('idle', () => setTimeout(closeAttrib, 150));
    map.on('error', (e) => console.warn('MapLibre:', e && e.error));

    map.on('load', () => {
      mapLoaded = true;

      // 高倍率(z13以上)ではタップしやすい「しずく型」の大きなマーカーに切り替える
      // （評価5色×白点あり/なし＋行きたい紫をキャンバスで描いて登録）
      const DROP_ZOOM = 13;
      const makeDrop = (color, withDot) => {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 64;
        const g = c.getContext('2d');
        g.beginPath();
        g.moveTo(24, 60);                       // 先端（この点が店の位置）
        g.bezierCurveTo(14, 45, 6, 34, 6, 23);  // 左のふくらみ
        g.arc(24, 23, 18, Math.PI, 0);          // 頭の丸
        g.bezierCurveTo(42, 34, 34, 45, 24, 60); // 右のふくらみ
        g.closePath();
        g.fillStyle = color; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
        if (withDot) { g.beginPath(); g.arc(24, 23, 5.5, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); }
        return g.getImageData(0, 0, 48, 64);
      };
      PIN_COLORS.forEach((col, i) => {
        map.addImage('drop-' + i, makeDrop(col, false), { pixelRatio: 2 });
        map.addImage('drop-' + i + '-hi', makeDrop(col, true), { pixelRatio: 2 });
      });
      map.addImage('drop-wish', makeDrop(WISH_COLOR, false), { pixelRatio: 2 });

      // 店舗ピン（クラスター付き）。近い店の点は1つにまとめる。ただしクラスタも
      // 件数で大きくせず、個別ピンと同じ固定サイズで表示する（今の大きさを維持）
      map.addSource('shops', {
        type: 'geojson', data: { type: 'FeatureCollection', features: [] },
        cluster: true, clusterMaxZoom: 11, clusterRadius: 40, // z12以上でピンが個別化し店名を表示できる
        clusterProperties: { maxR: ['max', ['get', 'r']] }, // クラスタの色は中で一番評価の高い店の色
      });
      // クラスターは中に件数の数字を出すため、個別ピンより一回り大きい丸にする
      const CLUSTER_RADIUS = ['interpolate', ['linear'], ['zoom'],
        0, 10, 5, 9.5, 7, 8.5, 10, 8.5, 12, 9.5];
      map.addLayer({ id: 'clusters', type: 'circle', source: 'shops',
        filter: ['has', 'point_count'],
        paint: { 'circle-color': colorByR('maxR'), 'circle-radius': CLUSTER_RADIUS,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': PIN_STROKE } });
      // 重なっている件数をピンの中に白文字で表示
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'shops',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FONT,
          'text-size': 10.5, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' } });
      // 低〜中倍率は小さな丸ピン（z14からはしずく型に切り替え）
      // circle-sort-key / symbol-sort-key: 値が大きいほど上に描画される。
      // ピンが重なったとき、評価（平均）の高い店が上に来るよう ravg を指定する。
      const RATING_ONTOP = ['coalesce', ['get', 'ravg'], 0];
      map.addLayer({ id: 'pins', type: 'circle', source: 'shops', maxzoom: DROP_ZOOM,
        filter: ['!', ['has', 'point_count']],
        layout: { 'circle-sort-key': RATING_ONTOP },
        paint: { 'circle-color': colorByR('r'), 'circle-radius': PIN_RADIUS,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': PIN_STROKE } });
      // 平均が .5 以上（あと一歩でワンランク上）の店は中心に白い点を重ねて区別する
      map.addLayer({ id: 'pin-dot', type: 'circle', source: 'shops', maxzoom: DROP_ZOOM,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'hi'], 1]],
        layout: { 'circle-sort-key': RATING_ONTOP },
        paint: { 'circle-color': '#ffffff',
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            0, 2.4, 5, 2.2, 7, 1.5, 10, 1.5, 12, 1.9, 13, 2.2] } });
      // 高倍率: しずく型マーカー（白点＝平均.5以上もしずくの頭に表示）
      map.addLayer({ id: 'pin-drops', type: 'symbol', source: 'shops', minzoom: DROP_ZOOM,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['concat', 'drop-', ['to-string', ['get', 'r']],
            ['case', ['==', ['get', 'hi'], 1], '-hi', '']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true,
          'symbol-sort-key': RATING_ONTOP, // 重なり時は評価の高い方を上に
        } });
      // お気に入り★（拡大時のみ。しずく表示中は頭の右上に）
      map.addLayer({ id: 'pin-fav', type: 'symbol', source: 'shops', minzoom: 12, maxzoom: DROP_ZOOM,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'fav'], 1]],
        layout: { 'text-field': '★', 'text-font': FONT, 'text-size': 11,
          'text-offset': [0.8, -0.8], 'text-allow-overlap': true },
        paint: { 'text-color': '#f5b301', 'text-halo-color': '#fff', 'text-halo-width': 1 } });
      map.addLayer({ id: 'pin-fav-hi', type: 'symbol', source: 'shops', minzoom: DROP_ZOOM,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'fav'], 1]],
        layout: { 'text-field': '★', 'text-font': FONT, 'text-size': 12,
          'text-offset': [1.2, -2.4], 'text-allow-overlap': true },
        paint: { 'text-color': '#f5b301', 'text-halo-color': '#fff', 'text-halo-width': 1 } });
      // 店名＋ジャンルのラベル。しずく（drop）が出る倍率になってから表示する。
      // symbol-sort-key: 値が小さいほど優先。評価が高い店を優先表示したいので -ravg を使う
      // （重なって片方しか出せないときは評価が高いほうの店名が残る）
      const labelLayout = {
        'text-field': ['case', ['==', ['get', 'genre'], ''], ['get', 'name'],
          ['concat', ['get', 'name'], '\n', ['get', 'genre']]],
        'text-font': FONT, 'text-size': 10, 'text-anchor': 'bottom', 'text-max-width': 12,
        'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'ravg'], 0]],
      };
      const labelPaint = { 'text-color': dark ? '#e8e6e1' : '#3a3833',
        'text-halo-color': dark ? '#1a1b1f' : '#ffffff', 'text-halo-width': 1.2 };
      map.addLayer({ id: 'pin-labels-hi', type: 'symbol', source: 'shops', minzoom: DROP_ZOOM,
        filter: ['!', ['has', 'point_count']],
        layout: Object.assign({}, labelLayout, { 'text-offset': [0, -3.4] }), paint: labelPaint });

      // 行きたい店（紫のピン）。評価色と混ざらないよう独立したソースで描く
      map.addSource('wishes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'wish-pins', type: 'circle', source: 'wishes', maxzoom: DROP_ZOOM,
        paint: { 'circle-color': WISH_COLOR, 'circle-radius': PIN_RADIUS,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': PIN_STROKE } });
      map.addLayer({ id: 'wish-drops', type: 'symbol', source: 'wishes', minzoom: DROP_ZOOM,
        layout: { 'icon-image': 'drop-wish',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });
      map.addLayer({ id: 'wish-labels-hi', type: 'symbol', source: 'wishes', minzoom: DROP_ZOOM,
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 10,
          'text-anchor': 'bottom', 'text-offset': [0, -3.4], 'text-max-width': 12 },
        paint: { 'text-color': WISH_COLOR,
          'text-halo-color': dark ? '#1a1b1f' : '#ffffff', 'text-halo-width': 1.2 } });

      // タップ: ピン → 店舗ポップアップ / クラスター → ズームイン / 行きたい → 行きたいポップアップ
      map.on('click', 'pins', (e) => openPinPopup(e.features[0]));
      map.on('click', 'pin-drops', (e) => openPinPopup(e.features[0]));
      map.on('click', 'wish-pins', (e) => openWishPopup(e.features[0]));
      map.on('click', 'wish-drops', (e) => openWishPopup(e.features[0]));
      map.on('click', 'clusters', (e) => {
        const f = e.features[0];
        map.getSource('shops').getClusterExpansionZoom(f.properties.cluster_id)
          .then(z => map.easeTo({ center: f.geometry.coordinates, zoom: z }));
      });
      ['pins', 'pin-drops', 'clusters', 'wish-pins', 'wish-drops'].forEach(id => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });

      refreshMapData(true);
      ensureNetworkLoaded(); // 初回の地図読み込み後にもフォロー中の記録を重ねる
      if (pendingRefresh) { pendingRefresh = false; }
      // 現在地を青い点で表示（地図は動かさない。許可済みなら再確認なしで表示される）
      locateUser(false);
    });

    // 料理ジャンルフィルタのチップ（複数選択可）。記録したことのあるジャンルだけ出す
    const bar = $('#map-genre-filter');
    buildMapGenreChips = () => {
      const used = [...new Set(Store.visits().flatMap(v => v.dishGenres || []))];
      bar.innerHTML = used.map(g =>
        `<button type="button" class="chip${mapGenreFilter.has(g) ? ' on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
      bar.classList.toggle('hidden', !used.length);
    };
    buildMapGenreChips();
    bar.addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      const g = c.dataset.g;
      if (mapGenreFilter.has(g)) { mapGenreFilter.delete(g); c.classList.remove('on'); }
      else { mapGenreFilter.add(g); c.classList.add('on'); }
      refitMap();
    });

    // 味の評価の星チップ（★3以上/★4以上/★5だけ。もう一度押すと解除）→ 内部の#mf-tasteへ
    document.querySelectorAll('.map-star-chip').forEach(b => b.addEventListener('click', () => {
      const next = $('#mf-taste').value === b.dataset.r ? '0' : b.dataset.r;
      $('#mf-taste').value = next;
      document.querySelectorAll('.map-star-chip').forEach(x => x.classList.toggle('on', x.dataset.r === next && next !== '0'));
      refitMap();
    }));

    // 店の評価3軸（気軽さ・雰囲気・早さ）のセレクト
    ['#mf-casual', '#mf-atmosphere', '#mf-speed'].forEach(sel =>
      $(sel).addEventListener('change', refitMap));

    // 「詳細」で絞り込み（ジャンル・味・お店の評価）を開閉
    $('#map-detail-toggle').addEventListener('click', () => {
      $('#map-detail-filters').classList.toggle('hidden');
      $('#map-detail-toggle').classList.toggle('on', !$('#map-detail-filters').classList.contains('hidden'));
    });

    // 検索バー: タップで絞り込みパネルを開き、入力でピンをキーワード絞り込み
    $('#map-search').addEventListener('focus', () => {
      $('#map-filter-panel').classList.remove('hidden');
      $('.map-scope').classList.add('hidden'); // 詳細検索と重なるため、パネル表示中は隠す
      $('#map-detail-filters').classList.add('hidden'); // 開くたびに詳細は閉じた状態から
      $('#map-detail-toggle').classList.remove('on');
      buildMapGenreChips(); // 記録済みジャンルでチップを作り直す
      // 星チップの選択状態を現在の絞り込みに合わせる
      const tv = $('#mf-taste').value;
      document.querySelectorAll('.map-star-chip').forEach(x => x.classList.toggle('on', x.dataset.r === tv && tv !== '0'));
    });
    // 検索した場所へ移動して目印ピンを立てる（候補タップ・Enterの両方から使う）
    const gotoPlace = (r, label) => {
      hideMapSuggest();
      $('#map-search').blur(); // キーボードと絞り込みパネルを閉じて地図を見せる
      $('#map-filter-panel').classList.add('hidden');
      $('.map-scope').classList.remove('hidden');
      // 地名で自分のピンまで絞り込まれて消えないよう、キーワード絞り込みは解除して移動する
      if (mapKeyword) { mapKeyword = ''; if (mapLoaded) refreshMapData(false); }
      showPlaceMarker(r.lat, r.lon, label || r.name);
      map.easeTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 14), duration: 800 });
      mapHasView = true;
    };

    // 入力中の地名・駅名の候補（Photon。Nominatimは規約上、自動補完に使えない）
    const sugBox = $('#map-suggest');
    let sugTimer = null, sugSeq = 0;
    const hideMapSuggest = () => { sugBox.classList.add('hidden'); sugBox.innerHTML = ''; };
    const showMapSuggest = (q) => {
      clearTimeout(sugTimer);
      if (q.length < 2) { hideMapSuggest(); return; }
      sugTimer = setTimeout(async () => {
        const seq = ++sugSeq;
        const c = map ? map.getCenter() : null;
        const rows = await Api.suggestPlaces(q, c && c.lat, c && c.lng).catch(() => []);
        // 追い越された応答や、入力がもう変わっている場合は捨てる
        if (seq !== sugSeq || $('#map-search').value.trim() !== q) return;
        if (!rows.length) { hideMapSuggest(); return; }
        sugBox.innerHTML = rows.map((r, i) => `
          <button type="button" class="map-sug-row" data-i="${i}">
            <span class="ms-sug-name">${esc(r.name)}</span>
            ${r.kind ? `<span class="ms-sug-kind">${esc(r.kind)}</span>` : ''}
            <span class="ms-sug-addr">${esc(r.address || '')}</span>
          </button>`).join('');
        sugBox.classList.remove('hidden');
        sugBox.querySelectorAll('.map-sug-row').forEach(b => {
          b.addEventListener('click', () => {
            const r = rows[+b.dataset.i];
            $('#map-search').value = r.name;
            gotoPlace(r);
          });
        });
      }, 350);
    };
    // 候補の外（地図など）をタップしたら候補を閉じる
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#map-suggest') && !e.target.closest('.map-search-field')) hideMapSuggest();
    }, true);

    let mapKwTimer = null;
    $('#map-search').addEventListener('input', () => {
      clearTimeout(mapKwTimer);
      const q = $('#map-search').value.trim();
      // 入力を消したら地名検索の目印も片付ける
      if (!q && placeMarker) { placeMarker.remove(); placeMarker = null; }
      showMapSuggest(q);
      mapKwTimer = setTimeout(() => {
        mapKeyword = q;
        refitMap();
      }, 300);
    });
    // 検索キー（Enter）: 駅名・地名をジオコーディングしてその周辺へ飛び、目印ピンを立てる
    $('#map-search').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = $('#map-search').value.trim();
      if (!q) return;
      clearTimeout(mapKwTimer);
      clearTimeout(sugTimer);
      hideMapSuggest();
      App.toast('場所を検索中…');
      try {
        const results = await Api.searchPlaces(q);
        const r = (results || []).find(x => x.lat != null && x.lon != null);
        if (!r) { App.toast('場所が見つかりませんでした'); return; }
        gotoPlace(r, r.name || q);
      } catch { App.toast('場所の検索に失敗しました'); }
    });
    $('#map-panel-close').addEventListener('click', () => {
      $('#map-filter-panel').classList.add('hidden');
      $('.map-scope').classList.remove('hidden');
      $('#map-search').blur();
    });

    // 表示範囲の切替（自分のみ / 自分＋つながり）
    document.querySelectorAll('.ms-btn').forEach(b => b.addEventListener('click', async () => {
      const scope = b.dataset.scope;
      if (scope === mapScope) return;
      const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
      if (scope === 'all' && !me) { App.toast('「フォロー中」はログインすると使えます'); return; }
      mapScope = scope;
      $('#map-wish-btn').classList.remove('on'); // 行きたいのみ表示は解除
      document.querySelectorAll('.ms-btn').forEach(x => x.classList.toggle('on', x === b));
      if (scope === 'all') { App.toast('フォロー中の人の店を読み込み中…'); await loadNetworkPosts(); }
      refitMap();
    }));

    // 検索バー横のしおり: 行きたい店（紫ピン）だけの表示に切り替え（もう一度押すと元へ）
    let prevScope = 'me';
    $('#map-wish-btn').addEventListener('click', () => {
      if (mapScope === 'wish') {
        mapScope = prevScope || 'me';
        $('#map-wish-btn').classList.remove('on');
        refitMap();
        return;
      }
      if (!Store.wishes().some(w => w.lat != null)) {
        App.toast('行きたい店はまだありません。ホームの投稿のしおりマークから保存できます');
        return;
      }
      prevScope = mapScope;
      mapScope = 'wish';
      $('#map-wish-btn').classList.add('on');
      refitMap();
    });

    $('#map-locate').addEventListener('click', () => locateUser(true));
    $('#map-nearby').addEventListener('click', () => openNearby());
    $('#map-heat').addEventListener('click', toggleHeat);
  }

  // 地名検索の目印ピン（墨色のピン＋場所名のラベル）。もう一度検索すると付け替え、
  // ピンをタップするか検索欄を空にすると消える
  function showPlaceMarker(lat, lon, name) {
    if (placeMarker) { placeMarker.remove(); placeMarker = null; }
    const el = document.createElement('div');
    el.className = 'place-marker';
    el.innerHTML = `
      <span class="place-marker-label">${esc(name)}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22s7-7.6 7-12.5A7 7 0 0 0 5 9.5C5 14.4 12 22 12 22z" fill="#1F1E1D" stroke="#fff" stroke-width="1.5"/>
        <circle cx="12" cy="9.5" r="2.6" fill="#fff"/>
      </svg>`;
    el.addEventListener('click', () => { if (placeMarker) { placeMarker.remove(); placeMarker = null; } });
    placeMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map);
  }

  // 現在地を取得して地図上に青い点で表示（recenter=true なら地図を現在地へ移動）
  function locateUser(recenter) {
    if (!navigator.geolocation) { App.toast('位置情報が利用できません'); return; }
    if (recenter) App.toast('現在地を取得中…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = [pos.coords.longitude, pos.coords.latitude];
        lastKnownPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        if (!userMarker) {
          const el = document.createElement('div');
          el.className = 'user-loc';
          el.innerHTML = '<span class="user-loc-pulse"></span><span class="user-loc-dot"></span>';
          userMarker = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
        } else {
          userMarker.setLngLat(ll);
        }
        if (recenter) map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 15) });
      },
      () => App.toast('現在地を取得できませんでした（位置情報を許可してください）'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  // 指定した店舗へのナビ: 車/電車/徒歩を選んで地図アプリ（Googleマップ）でルート表示
  function openNav(s) {
    if (!s || s.lat == null || s.lon == null) { App.toast('この店舗には位置情報がありません'); return; }
    const dest = `${s.lat},${s.lon}`;
    const modes = [
      { key: 'driving', label: '車', icon: IC_CAR },
      { key: 'transit', label: '電車', icon: IC_TRAIN },
      { key: 'walking', label: '徒歩', icon: IC_WALK },
    ];
    const ov = document.createElement('div');
    ov.className = 'modal nav-sheet';
    ov.innerHTML = `<div class="nav-sheet-box">
        <div class="nav-sheet-title">${esc(s.name)} へのルート</div>
        <div class="nav-sheet-sub">移動手段を選ぶと地図アプリでルートを表示します</div>
        <div class="nav-modes">
          ${modes.map(m => `<button type="button" class="nav-mode" data-mode="${m.key}">
            <span class="nm-ic">${m.icon}</span><span class="nm-label">${m.label}</span></button>`).join('')}
        </div>
        <button type="button" class="btn nav-cancel">キャンセル</button>
      </div>`;
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.nav-cancel').addEventListener('click', close);
    ov.querySelectorAll('.nav-mode').forEach(btn => btn.addEventListener('click', () => {
      const origin = lastKnownPos ? `&origin=${lastKnownPos.lat},${lastKnownPos.lon}` : '';
      const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}${origin}&travelmode=${btn.dataset.mode}`;
      window.open(url, '_blank', 'noopener');
      close();
    }));
    document.body.appendChild(ov);
  }

  // 現在地を取得（キャッシュがあれば即返す）。Promiseで返す
  function currentPosition() {
    return new Promise((resolve, reject) => {
      if (lastKnownPos) { resolve(lastKnownPos); return; }
      if (!navigator.geolocation) { reject(); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          lastKnownPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          resolve(lastKnownPos);
        },
        () => reject(),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  }

  // 2点間の直線距離（メートル）: ハーサイン公式
  function haversine(a, b) {
    const R = 6371000, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // 移動手段ごとの平均速度（m/分）。直線距離に道のり係数1.3を掛けて概算
  const NEARBY_SPEED = { walk: 80, car: 400 };
  const DETOUR = 1.3;
  const fmtDist = (m) => m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
  const etaMin = (straightM, mode) => Math.max(1, Math.round(straightM * DETOUR / NEARBY_SPEED[mode]));
  // 分を「◯分／◯時間◯分」に整形（60分以上は時間表記）
  const fmtEta = (min) => {
    if (min < 60) return `約${min}分`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `約${h}時間${m}分` : `約${h}時間`;
  };

  // 出発地（現在地または指定した駅・地名）から、絞り込み条件に合う店を近い順に一覧表示
  async function openNearby() {
    // 地図と同じ絞り込み（ジャンル・星・キーワード）＋位置情報のある店だけ
    const shops = Store.shops().filter(s =>
      s.lat != null && s.lon != null &&
      shopMatchesGenre(s.id) && shopMatchesAxes(s) && shopMatchesKeyword(s));

    // 絞り込み条件の見出し
    const axisActive = ['taste', 'casual', 'atmosphere', 'speed']
      .filter(k => +($('#mf-' + k).value || 0) > 0)
      .map(k => AXIS_LABEL[k] + '★' + $('#mf-' + k).value + '+');
    const cond = [...mapGenreFilter, ...axisActive].join('・') || 'すべての店舗';

    let mode = 'walk';
    let origin = null;      // { lat, lon }
    let originLabel = '';   // 表示用（「現在地」や駅名）
    let rows = [];

    const ov = document.createElement('div');
    ov.className = 'modal nearby-modal';
    ov.innerHTML = `<div class="nearby-box">
        <div class="nearby-head">
          <div>
            <div class="nearby-title">近い順に表示</div>
            <div class="nearby-cond">${esc(cond)}　${shops.length}件</div>
          </div>
          <button type="button" class="nearby-close" aria-label="閉じる">✕</button>
        </div>
        <div class="nearby-origin">
          <div class="nb-origin-row">
            <input type="text" class="nb-origin-input" placeholder="駅・地名で出発地を指定" autocomplete="off">
            <button type="button" class="btn small nb-origin-search">検索</button>
            <button type="button" class="btn small nb-origin-here">現在地</button>
          </div>
          <div class="nb-origin-label"></div>
          <div class="nb-origin-results hidden"></div>
        </div>
        <div class="nearby-modes">
          <button type="button" class="nb-mode on" data-mode="walk">${IC_WALK}<span>徒歩</span></button>
          <button type="button" class="nb-mode" data-mode="car">${IC_CAR}<span>車</span></button>
        </div>
        <div class="nearby-list"></div>
      </div>`;
    const listEl = ov.querySelector('.nearby-list');
    const labelEl = ov.querySelector('.nb-origin-label');
    const resultsEl = ov.querySelector('.nb-origin-results');
    const inputEl = ov.querySelector('.nb-origin-input');

    const renderRows = () => {
      labelEl.textContent = origin ? `出発地: ${originLabel}` : '';
      if (!origin) {
        listEl.innerHTML = '<div class="empty"><p>出発地を指定してください。<br>「現在地」または駅・地名で検索できます。</p></div>';
        return;
      }
      if (!rows.length) {
        listEl.innerHTML = '<div class="empty"><p>条件に合う店舗が見つかりません。</p></div>';
        return;
      }
      listEl.innerHTML = rows.map((r, i) => {
        const avg = Store.avgRating(r.s.id);
        return `<div class="nearby-row" data-shop="${r.s.id}">
            <span class="nb-rank">${i + 1}</span>
            <div class="nb-main">
              <div class="nb-name">${esc(r.s.name)}</div>
              <div class="nb-sub">${esc(shopLabelGenre(r.s) || '')}${avg ? '　★' + fmtR(avg) : ''}</div>
            </div>
            <div class="nb-eta">
              <div class="nb-time">${fmtEta(etaMin(r.dist, mode))}</div>
              <div class="nb-dist">${fmtDist(r.dist * DETOUR)}</div>
            </div>
            <button type="button" class="btn small nb-go" data-shop="${r.s.id}">ここへ行く</button>
          </div>`;
      }).join('');
    };

    const recompute = () => {
      rows = origin
        ? shops.map(s => ({ s, dist: haversine(origin, { lat: s.lat, lon: s.lon }) }))
            .sort((a, b) => a.dist - b.dist)
        : [];
      renderRows();
    };

    const setOrigin = (lat, lon, label) => {
      origin = { lat, lon }; originLabel = label;
      resultsEl.classList.add('hidden'); resultsEl.innerHTML = '';
      recompute();
    };

    // 現在地を出発地にする
    const useCurrent = async () => {
      try { App.toast('現在地を取得中…'); const p = await currentPosition(); locateUser(false); setOrigin(p.lat, p.lon, '現在地'); }
      catch { App.toast('現在地を取得できませんでした（位置情報を許可してください）'); }
    };
    // 駅・地名で検索して出発地の候補を出す
    const searchOrigin = async () => {
      const q = inputEl.value.trim();
      if (!q) return;
      resultsEl.classList.remove('hidden');
      resultsEl.innerHTML = '<div class="nb-origin-loading">検索中…</div>';
      try {
        const places = await Api.searchPlaces(q);
        if (!places.length) { resultsEl.innerHTML = '<div class="nb-origin-loading">見つかりませんでした</div>'; return; }
        resultsEl.innerHTML = places.slice(0, 6).map((p, i) =>
          `<button type="button" class="nb-origin-item" data-i="${i}">
             <span class="nb-oi-name">${esc(p.name)}</span>
             <span class="nb-oi-addr">${esc(p.address || '')}</span>
           </button>`).join('');
        resultsEl.querySelectorAll('.nb-origin-item').forEach(btn => btn.addEventListener('click', () => {
          const p = places[+btn.dataset.i];
          setOrigin(p.lat, p.lon, p.name);
        }));
      } catch { resultsEl.innerHTML = '<div class="nb-origin-loading">検索に失敗しました</div>'; }
    };

    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.nearby-close').addEventListener('click', close);
    ov.querySelector('.nb-origin-here').addEventListener('click', useCurrent);
    ov.querySelector('.nb-origin-search').addEventListener('click', searchOrigin);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchOrigin(); } });
    ov.querySelectorAll('.nb-mode').forEach(btn => btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      ov.querySelectorAll('.nb-mode').forEach(b => b.classList.toggle('on', b === btn));
      renderRows();
    }));
    listEl.addEventListener('click', (e) => {
      const go = e.target.closest('.nb-go');
      if (go) { openNav(Store.getShop(go.dataset.shop)); return; }
      const row = e.target.closest('.nearby-row');
      if (row) { close(); showShop(row.dataset.shop); }
    });
    document.body.appendChild(ov);
    renderRows();

    // 初期は現在地を試す（取れなければ駅・地名の指定を促す）
    try { const p = await currentPosition(); locateUser(false); setOrigin(p.lat, p.lon, '現在地'); }
    catch { /* 現在地が取れなければユーザーが駅・地名を指定 */ }
  }

  // 店の代表ジャンル: よく食べる料理ジャンル → なければ店舗ジャンル
  function shopLabelGenre(s) {
    const tally = new Map();
    for (const v of Store.visitsOf(s.id)) {
      for (const g of (v.dishGenres || [])) tally.set(g, (tally.get(g) || 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : (s.shopGenre || '');
  }

  // フォロワーのアイコン（写真の右上に小さく重ねる）。タップでその人のプロフィールへ
  function contribAvatarsHtml(users) {
    if (!users || !users.length) return '';
    return `<span class="pp-avatars">` + users.slice(0, 3).map(u =>
      `<button type="button" class="pp-av" data-u="${esc(u.username)}" aria-label="@${esc(u.username)} のプロフィール">`
      + (u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : '🍜') + `</button>`).join('') + `</span>`;
  }
  function wireContribAvatars(node) {
    node.querySelectorAll('.pp-av').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mapPopup) mapPopup.remove();
      showPublicProfile(b.dataset.u);
    }));
  }


  // ピンをタップ → 自分の店はデザイン案準拠の店舗シート（上に地図が見えたまま）
  // つながりの人だけの店はポップアップ（誰の訪問か・平均・投稿へ）
  function openPinPopup(feature) {
    if (mapPopup) mapPopup.remove();
    if (feature.properties.kind === 'other') {
      // フォロワーだけの店も自分の店と同じ店舗シートで表示する
      const g = networkById.get(feature.properties.id);
      if (g) showNetShopSheet(g);
      return;
    }
    showMapShopSheet(feature.properties.id);
  }

  // 地図で自分の店をタップしたときの画面（デザイン案準拠）。
  // 上部は透過で地図（ピン）が見えたまま、下からシートが上がる:
  //  ＜戻る・♥・共有 / 店の写真＋名前＋★平均(N件の投稿)＋ジャンル・駅＋ボタン /
  //  あなたの写真（横スワイプ、★と日付） / フォロワーの写真（人ごとに3枚＋相対時刻）
  async function showMapShopSheet(shopId) {
    const s = Store.getShop(shopId);
    if (!s) return;
    const vs = Store.visitsOf(shopId);
    const photos = (await Store.allPhotos()).filter(p => p.shopId === shopId);
    const vById = new Map(vs.map(v => [v.id, v]));
    const shotTime = (p) => {
      const v = vById.get(p.visitId);
      return (v && v.datetime) ? new Date(v.datetime).getTime() : (p.createdAt || 0);
    };
    photos.sort((a, b) => shotTime(b) - shotTime(a) || (b.createdAt || 0) - (a.createdAt || 0));
    const fposts = followerPostsForShop(s)
      .slice().sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
    // ★平均と件数は自分の訪問＋フォロワーの投稿を合算（地図ピンの集計と同じ考え方）
    const pool = [...vs.map(v => v.rating), ...fposts.map(p => p.rating)].filter(Boolean);
    const avg = avgOf(pool);
    const genre = shopLabelGenre(s) || '';
    const hasPos = s.lat != null && s.lon != null;

    const ov = document.createElement('div');
    ov.className = 'modal mapshop-modal';
    ov.innerHTML = `
      <div class="msh-top">
        <button type="button" class="msh-round msh-back" aria-label="地図に戻る"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="msh-topright">
          <button type="button" class="msh-round msh-favbtn ${s.favorite ? 'on' : ''}" data-fav="${esc(s.id)}" aria-label="お気に入り">${IC_HEART}</button>
          <button type="button" class="msh-round msh-share" aria-label="共有"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 7l4-3.5L16 7"/><path d="M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7"/></svg></button>
        </div>
      </div>
      <div class="msh-sheet">
        <div class="msh-card">
          <button type="button" class="msh-thumb" aria-label="店舗詳細を開く">${photos.length ? '<img alt="" decoding="async">' : '🍽️'}</button>
          <div class="msh-info">
            <button type="button" class="msh-name">${esc(s.name)}</button>
            <div class="msh-rating">${(() => {
              const pair = ratingPair({ name: s.name, lat: s.lat, lon: s.lon });
              return pair.raters ? ratePairHtml(pair, { count: true })
                : `${starIc(avg ? 'full' : 'empty', 20)}<b>${avg ? fmtR(avg) : '－'}</b><span>（${vs.length + fposts.length}件の投稿）</span>`;
            })()}</div>
            ${(() => {
              // 星絞り込み中は検索タブと同じ通過理由バッジを出す（平均で超えた/記録だけで超えた）
              const minT = +($('#mf-taste').value || 0);
              if (!minT) return '';
              const myAvg = Store.avgRating(s.id) || 0;
              const lbl = minT === 5 ? '★5' : `★${minT}以上`;
              if (myAvg >= minT) return `<div class="msh-hitrow"><span class="ps-hit ps-hit-avg">平均で${lbl}</span></div>`;
              return vs.some(v => (v.rating || 0) >= minT)
                ? `<div class="msh-hitrow"><span class="ps-hit ps-hit-once">${lbl}の記録あり</span></div>` : '';
            })()}
            <div class="msh-meta">
              ${genre ? `<span>🍜 ${esc(genre)}</span>` : ''}
              ${genre && s.station ? '<span class="msh-sep"></span>' : ''}
              ${s.station ? `<span>${IC_PIN} ${esc(s.station)}</span>` : ''}
            </div>
            <div class="msh-btns">
              <button type="button" class="btn msh-mapbtn"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/></svg> 地図で見る</button>
              ${hasPos ? `<button type="button" class="btn primary msh-navbtn">${IC_NAV} ここへ行く</button>` : ''}
            </div>
          </div>
        </div>
        <div class="msh-sec msh-mine ${photos.length ? '' : 'hidden'}">
          <div class="msh-sechead">
            <span class="msh-secic">📷</span><b>あなたの写真</b><span class="msh-n">(${photos.length})</span>
            <button type="button" class="msh-all">すべて見る ›</button>
          </div>
          <div class="msh-myrow"></div>
        </div>
        <div class="msh-sec msh-follow hidden">
          <div class="msh-sechead">
            <span class="msh-secic">👥</span><b>フォロワーの写真</b><span class="msh-n msh-fn"></span>
            <button type="button" class="msh-sort">新しい順 ⇅</button>
          </div>
          <div class="msh-frows"></div>
        </div>
      </div>`;
    const close = () => ov.remove();
    ov.querySelector('.msh-back').addEventListener('click', close);
    ov.querySelector('.msh-top').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
    ov.querySelector('.msh-share').addEventListener('click', async () => {
      const text = `${s.name}${genre ? `（${genre}）` : ''}${s.station ? ` / ${s.station}` : ''} - BITEMAP`;
      if (navigator.share) { navigator.share({ title: s.name, text }).catch(() => {}); return; }
      try { await navigator.clipboard.writeText(text); App.toast('店舗情報をコピーしました'); } catch { /* noop */ }
    });
    // 店の写真・名前 → 全画面の店舗詳細（記録の閲覧・編集はこちらから）
    if (photos.length) setThumb(ov.querySelector('.msh-thumb img'), photos[0]);
    ov.querySelector('.msh-thumb').addEventListener('click', () => showShop(shopId));
    ov.querySelector('.msh-name').addEventListener('click', () => showShop(shopId));
    ov.querySelector('.msh-mapbtn').addEventListener('click', close); // 地図はこの画面の後ろに出ている
    const navBtn = ov.querySelector('.msh-navbtn');
    if (navBtn) navBtn.addEventListener('click', () => openNav(s));

    // あなたの写真: 横スワイプのカード。★はその訪問の評価、左下に日付
    const myrow = ov.querySelector('.msh-myrow');
    photos.forEach(ph => {
      const v = vById.get(ph.visitId) || {};
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'msh-mycard';
      c.innerHTML = `<img alt="" loading="lazy" decoding="async">
        ${v.rating ? `<span class="pd-photo-star">★${(+v.rating).toFixed(1)}</span>` : ''}
        ${v.datetime ? `<span class="msh-mydate">${fmtDate(v.datetime)}</span>` : ''}`;
      setFullPhoto(c.querySelector('img'), ph);
      c.addEventListener('click', () => openLightbox(photoUrl(ph), `${s.name}　${fmtDate(v.datetime)}`));
      myrow.appendChild(c);
    });
    ov.querySelector('.msh-all').addEventListener('click', () => showVisitList(shopId));

    // フォロワーの写真: 人ごとに1行（共通部品 renderFollowSection を使用）
    const renderFollow = () => {
      renderFollowSection(ov, followerPostsForShop(Store.getShop(shopId) || s), true);
    };
    ov.querySelector('.msh-sort').addEventListener('click', () => {
      const sec = ov.querySelector('.msh-follow');
      sec.dataset.sort = { match: 'new', new: 'old', old: 'match' }[sec.dataset.sort || 'match'];
      renderFollow();
    });
    // ★平均と件数（自分＋フォロワー）。フォロー中データが後から届いたら数字も更新する
    const updateHeader = () => {
      const list = followerPostsForShop(Store.getShop(shopId) || s);
      const pool2 = [...vs.map(v => v.rating), ...list.map(p => p.rating)].filter(Boolean);
      const a = avgOf(pool2);
      const pair2 = ratingPair({ name: s.name, lat: s.lat, lon: s.lon });
      ov.querySelector('.msh-rating').innerHTML = pair2.raters ? ratePairHtml(pair2, { count: true })
        : `${starIc(a ? 'full' : 'empty', 20)}<b>${a ? fmtR(a) : '－'}</b><span>（${vs.length + list.length}件の投稿）</span>`;
    };
    renderFollow();
    // フォロー中の投稿が未読込なら骨組みを見せて、読み込み完了後にもう一度描く
    if (!networkLoaded && typeof Cloud !== 'undefined' && Cloud.getUser()) {
      const sec = ov.querySelector('.msh-follow');
      sec.classList.remove('hidden');
      ov.querySelector('.msh-fn').textContent = '';
      ov.querySelector('.msh-frows').innerHTML = SKEL_FROWS;
    }
    ensureNetworkLoaded(() => { renderFollow(); updateHeader(); });

    document.body.appendChild(ov);
  }

  // 店舗シートの「フォロワーの写真」欄を描く共通部品（自分の店・フォロワーの店で共用）。
  // 人ごとに1行: アイコン・名前・@ID・投稿数（全店の合計）＋その店の写真最大3枚。
  // showTime=false のときは相対時刻を出さない（他人の店では日付を出さない方針）
  function renderFollowSection(ov, posts, showTime) {
    const sec = ov.querySelector('.msh-follow');
    const list = (posts || []).slice().sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
    if (!list.length) { sec.classList.add('hidden'); return; }
    const byUser = new Map();
    for (const p of list) {
      const g = byUser.get(p.username) || { username: p.username, avatar: p.avatar || '', name: p.displayName || '', posts: [] };
      if (!g.avatar && p.avatar) g.avatar = p.avatar;
      g.posts.push(p);
      byUser.set(p.username, g);
    }
    let rowsData = [...byUser.values()]; // 各ユーザーのposts[0]が最新（新しい順で回収済み）
    // 既定は「一致率順」（自分と味覚が近い人を先に）。タップで 新しい順 → 古い順 と切替
    const mode = sec.dataset.sort || 'match';
    rowsData.sort((a, b) => new Date(b.posts[0].datetime || 0) - new Date(a.posts[0].datetime || 0));
    if (mode === 'match') {
      rowsData.sort((a, b) => (tasteMatch(b.username).rate ?? -1) - (tasteMatch(a.username).rate ?? -1));
    } else if (mode === 'old') rowsData.reverse();
    sec.classList.remove('hidden');
    ov.querySelector('.msh-fn').textContent = `(${rowsData.length}人)`;
    ov.querySelector('.msh-sort').textContent = ({ match: '一致率順', new: '新しい順', old: '古い順' })[mode] + ' ⇅';
    const rows = ov.querySelector('.msh-frows');
    rows.innerHTML = '';
    for (const u of rowsData) {
      const total = networkPosts.filter(p => p.username === u.username).length; // その人の投稿数（全店）
      const row = document.createElement('div');
      row.className = 'msh-frow';
      row.innerHTML = `
        <button type="button" class="msh-fuser">
          <span class="msh-favatar">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : '🍜'}</span>
          <span class="msh-fname">${esc(u.name || u.username)}さん</span>
          ${tasteBadge(u.username, true)}
          <span class="msh-fhandle">@${esc(u.username)}</span>
          <span class="msh-fposts">${total}投稿</span>
        </button>
        <div class="msh-fphotos"></div>
        <button type="button" class="msh-chev" aria-label="プロフィールを見る"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>`;
      const ph = row.querySelector('.msh-fphotos');
      for (const p of u.posts.filter(x => x.photoUrl).slice(0, 3)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'msh-fph';
        b.innerHTML = `<img src="${esc(p.photoUrl)}" alt="" loading="lazy" decoding="async">
          ${p.rating ? `<span class="pd-photo-star">★${fmtR(p.rating)}</span>` : ''}
          ${showTime && p.datetime ? `<span class="msh-ftime">${relTime(p.datetime)}</span>` : ''}`;
        b.addEventListener('click', () => showPostDetail(p));
        ph.appendChild(b);
      }
      const toProfile = () => showPublicProfile(u.username);
      row.querySelector('.msh-fuser').addEventListener('click', toProfile);
      row.querySelector('.msh-chev').addEventListener('click', toProfile);
      rows.appendChild(row);
    }
  }

  // 地図でフォロワーだけが行っている店をタップしたときの画面。
  // 自分の店の店舗シートと同じ見た目（上に地図が見えたまま下からシート）。
  // 自分の記録が無いので「あなたの写真」欄は無し。他人の記録なので日付・相対時刻は出さない。
  // 右上は♥の代わりに「行きたい」のしおり（保存で色が付く）
  function showNetShopSheet(g) {
    const posts = g.posts.slice().sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
    const latest = posts[0];
    if (!latest) return;
    const avg = avgOf(posts.map(p => p.rating).filter(Boolean));
    const genre = latest.genre || '';
    const station = (posts.find(p => p.station) || {}).station || '';
    const hasPos = g.lat != null && g.lon != null;

    const ov = document.createElement('div');
    ov.className = 'modal mapshop-modal';
    ov.innerHTML = `
      <div class="msh-top">
        <button type="button" class="msh-round msh-back" aria-label="地図に戻る"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="msh-topright">
          <button type="button" class="msh-round msh-wishbtn ${wishStateForPost(latest) ? 'on' : ''}" aria-label="行きたい店に保存">${IC_BOOKMARK}</button>
          <button type="button" class="msh-round msh-share" aria-label="共有"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 7l4-3.5L16 7"/><path d="M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7"/></svg></button>
        </div>
      </div>
      <div class="msh-sheet">
        <div class="msh-card">
          <button type="button" class="msh-thumb" aria-label="投稿を見る">${latest.photoUrl ? '<img alt="" decoding="async">' : '🍽️'}</button>
          <div class="msh-info">
            <button type="button" class="msh-name">${esc(g.name || latest.shopName || '')}</button>
            <div class="msh-rating">${(() => {
              const pair = ratingPair({ name: g.name || latest.shopName, lat: g.lat, lon: g.lon });
              return pair.raters ? ratePairHtml(pair, { count: true })
                : `${starIc(avg ? 'full' : 'empty', 20)}<b>${avg ? fmtR(avg) : '－'}</b><span>（${posts.length}件の投稿）</span>`;
            })()}</div>
            <div class="msh-meta">
              ${genre ? `<span>🍜 ${esc(genre)}</span>` : ''}
              ${genre && station ? '<span class="msh-sep"></span>' : ''}
              ${station ? `<span>${IC_PIN} ${esc(station)}</span>` : ''}
            </div>
            <div class="msh-btns">
              <button type="button" class="btn msh-mapbtn"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/></svg> 地図で見る</button>
              ${hasPos ? `<button type="button" class="btn primary msh-navbtn">${IC_NAV} ここへ行く</button>` : ''}
            </div>
          </div>
        </div>
        <div class="msh-sec msh-follow hidden">
          <div class="msh-sechead">
            <span class="msh-secic">👥</span><b>フォロワーの写真</b><span class="msh-n msh-fn"></span>
            <button type="button" class="msh-sort">新しい順 ⇅</button>
          </div>
          <div class="msh-frows"></div>
        </div>
      </div>`;
    const close = () => ov.remove();
    ov.querySelector('.msh-back').addEventListener('click', close);
    ov.querySelector('.msh-top').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
    ov.querySelector('.msh-wishbtn').addEventListener('click', (e) => {
      toggleWishForPost(latest, null);
      e.currentTarget.classList.toggle('on', wishStateForPost(latest));
    });
    ov.querySelector('.msh-share').addEventListener('click', async () => {
      const name = g.name || latest.shopName || '';
      const text = `${name}${genre ? `（${genre}）` : ''}${station ? ` / ${station}` : ''} - BITEMAP`;
      if (navigator.share) { navigator.share({ title: name, text }).catch(() => {}); return; }
      try { await navigator.clipboard.writeText(text); App.toast('店舗情報をコピーしました'); } catch { /* noop */ }
    });
    // 店の写真・名前 → 最新の投稿（下スクロールでこの店の他の投稿へ）
    const openLatest = () => showPostDetail(latest, { list: posts, index: 0 });
    if (latest.photoUrl) {
      const im = ov.querySelector('.msh-thumb img');
      im.src = latest.photoUrl;
    }
    ov.querySelector('.msh-thumb').addEventListener('click', openLatest);
    ov.querySelector('.msh-name').addEventListener('click', openLatest);
    ov.querySelector('.msh-mapbtn').addEventListener('click', close); // 地図はこの画面の後ろに出ている
    const navBtn = ov.querySelector('.msh-navbtn');
    if (navBtn) navBtn.addEventListener('click', () => openNav({ name: g.name, lat: g.lat, lon: g.lon }));
    // フォロワーの写真（相対時刻なし）。並び替えも共通部品で
    renderFollowSection(ov, posts, false);
    ov.querySelector('.msh-sort').addEventListener('click', () => {
      const sec = ov.querySelector('.msh-follow');
      sec.dataset.sort = { match: 'new', new: 'old', old: 'match' }[sec.dataset.sort || 'match'];
      renderFollowSection(ov, posts, false);
    });

    document.body.appendChild(ov);
  }

  // フィルタ適用後の店舗一覧 → GeoJSONに変換して地図へ反映
  function refreshMapData(fit) {
    // 「行きたい」モード: 行った店のピンを消して、行きたい店（紫）だけを表示
    if (mapScope === 'wish') {
      networkById.clear();
      map.getSource('shops').setData({ type: 'FeatureCollection', features: [] });
      refreshWishData();
      $('#map-filter-count').textContent = '';
      const pts = Store.wishes().filter(w => w.lat != null && w.lon != null).map(w => [w.lon, w.lat]);
      if (fit && pts.length) {
        const b = new maplibregl.LngLatBounds();
        pts.forEach(c => b.extend(c));
        try { map.fitBounds(b, { padding: 70, maxZoom: 16, duration: 0 }); } catch { /* noop */ }
      }
      return;
    }
    refreshWishData(); // 行きたい店の紫ピンは通常表示でも出す
    const shops = Store.shops().filter(s =>
      s.lat != null && s.lon != null && shopMatchesGenre(s.id) && shopMatchesAxes(s) && shopMatchesKeyword(s));
    // フィルタ選択中は件数を表示
    const axisActive = ['taste', 'casual', 'atmosphere', 'speed']
      .filter(k => +($('#mf-' + k).value || 0) > 0)
      .map(k => AXIS_LABEL[k] + '★' + $('#mf-' + k).value + '+');
    const labels = [...mapGenreFilter, ...axisActive];
    $('#map-filter-count').textContent = labels.length ? `${labels.join('・')}: ${shops.length}件` : '';

    // 店ごとの評価プール（自分の評価。「みんな」ではフォロー中の人の評価も合算して平均し直す）
    //  味＝各訪問の評価、店の3軸(気軽さ/雰囲気/早さ)＝人ごとに1つの値
    mapStats.clear();
    mapContrib.clear();
    for (const s of shops) {
      mapStats.set(s.id, {
        taste: Store.visitsOf(s.id).map(v => v.rating || 0).filter(r => r > 0),
        casual: (s.casual > 0) ? [s.casual] : [],
        atmosphere: (s.atmosphere > 0) ? [s.atmosphere] : [],
        speed: (s.speed > 0) ? [s.speed] : [],
      });
    }

    const featureByShopId = new Map();
    const features = shops.map(s => {
      const f = { type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { id: s.id, kind: 'me', mine: 1, name: s.name, genre: shopLabelGenre(s),
          r: 0, hi: 0, ravg: 0, fav: s.favorite ? 1 : 0 } };
      featureByShopId.set(s.id, f);
      return f;
    });

    // 「みんな」モード: フォロー中の人の投稿もピンで表示。
    // 同じ店への複数人の投稿は1つのピンにまとめ、評価は全員の平均にする
    networkById.clear();
    const bounds = shops.map(s => [s.lon, s.lat]);
    if (mapScope === 'all') {
      const kw = mapKeyword.toLowerCase();
      const netGroups = [];
      for (const p of networkPosts) {
        // フィルタ: ジャンル・キーワード・味の星（他人の投稿にある情報の範囲で）
        if (mapGenreFilter.size && !genresFromStr(p.genre).some(g => mapGenreFilter.has(g))) continue;
        const minT = +($('#mf-taste').value || 0);
        if (minT && (p.rating || 0) < minT) continue;
        if (kw) {
          const hay = [p.shopName, p.username, p.displayName, p.comment].join(' ').toLowerCase();
          if (!hay.includes(kw)) continue;
        }
        // 自分も行った店なら自分のピンへ合算（1つのピン・全員の平均になる）
        // 照合は表記ゆれ＋300mまで許容（登録時のピン位置ズレ対策）
        const mine = shops.find(x => postMatchesShop(p, x)) || null;
        if (mine && mapStats.has(mine.id)) {
          const st = mapStats.get(mine.id);
          if (p.rating) st.taste.push(p.rating);
          if (p.casual > 0) st.casual.push(p.casual);
          if (p.atmosphere > 0) st.atmosphere.push(p.atmosphere);
          if (p.speed > 0) st.speed.push(p.speed);
          // 誰の記録が混ざっているかを覚えておく（ポップアップにアイコンを出す）
          if (!mapContrib.has(mine.id)) mapContrib.set(mine.id, []);
          if (!mapContrib.get(mine.id).some(c => c.username === p.username)) {
            mapContrib.get(mine.id).push({ username: p.username || '', avatar: p.avatar || '' });
          }
          continue;
        }
        // 他人だけの店: 店名が同一視でき＋300m以内なら1つにまとめる（登録経路の名前差も吸収）
        let g = netGroups.find(x => shopNamesMatch(x.name, p.shopName) &&
          Store.distMeters(x.lat, x.lon, p.lat, p.lon) < 300);
        if (!g) { g = { name: p.shopName || '', lat: p.lat, lon: p.lon, posts: [] }; netGroups.push(g); }
        g.posts.push(p);
      }
      netGroups.forEach((g, i) => {
        g.posts.sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0)); // 先頭が最新
        const fid = 'net_' + i;
        // このグループの評価プール（フォロー中の人だけ・全員分）
        mapStats.set(fid, {
          taste: g.posts.map(p => p.rating || 0).filter(r => r > 0),
          casual: g.posts.map(p => p.casual || 0).filter(r => r > 0),
          atmosphere: g.posts.map(p => p.atmosphere || 0).filter(r => r > 0),
          speed: g.posts.map(p => p.speed || 0).filter(r => r > 0),
        });
        let avg = avgOf(mapStats.get(fid).taste);
        const pairN = ratingPair({ name: g.name, lat: g.lat, lon: g.lon });
        if (pairN.raters > 1) avg = pairN.personal;
        g.avg = avg;
        networkById.set(fid, g);
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [g.lon, g.lat] },
          properties: { id: fid, kind: 'other', mine: 0, name: g.name, genre: '',
            r: Math.floor(avg) || 0, hi: bandOf(avg), ravg: avg || 0, fav: 0 } });
        bounds.push([g.lon, g.lat]);
      });
    }

    // 自分の店のピンの色は「あなた向け評価」（味覚一致率で重み付け。仕様書6-地図）。
    // フォロー中のデータが無い店は従来どおり自分の平均
    for (const s of shops) {
      let avg = avgOf(mapStats.get(s.id).taste);
      const pair = ratingPair({ name: s.name, lat: s.lat, lon: s.lon });
      if (pair.raters > 1) avg = pair.personal;
      const f = featureByShopId.get(s.id);
      f.properties.r = Math.floor(avg) || 0;
      f.properties.hi = bandOf(avg);
      f.properties.ravg = avg || 0;
    }
    map.getSource('shops').setData({ type: 'FeatureCollection', features });
    refreshWishData();

    // 視点合わせは「まだ視点が決まっていないとき」だけ。決まった後の再描画
    // （店舗詳細を閉じた・タブを往復した等）では現在のズーム・位置を維持する。
    // 絞り込みや表示範囲の切り替えは refitMap() 経由で mapHasView をリセットして再フィットする
    if (fit && bounds.length && !mapHasView) {
      const b = new maplibregl.LngLatBounds();
      bounds.forEach(c => b.extend(c));
      try { map.fitBounds(b, { padding: 70, maxZoom: 16, duration: 0 }); mapHasView = true; } catch { /* noop */ }
    }
    if (heatOn) buildHeat();
  }

  // 行きたい店のピンを地図へ反映（保存/削除のたびに呼べる）
  // 行きたいピン（紫）はどの表示モードでも出す。訪問を記録すると
  // Store.addVisit が行きたいから自動で外すので、ピンは訪問済み（通常ピン）に変わる
  function refreshWishData() {
    if (!map || !mapLoaded || !map.getSource('wishes')) return;
    const features = Store.wishes().filter(w => w.lat != null && w.lon != null)
      .map(w => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
        properties: { id: w.id, name: w.name || '' } }));
    map.getSource('wishes').setData({ type: 'FeatureCollection', features });
  }

  // 行きたいピンをタップ → 記録する / ここへ行く / リストから外す
  function openWishPopup(feature) {
    const w = Store.wishes().find(x => x.id === feature.properties.id);
    if (!w) return;
    const node = document.createElement('div');
    node.className = 'popup';
    node.innerHTML = `
        <div class="p-who">${IC_BOOKMARK} 行きたい店${w.fromUsername ? '（@' + esc(w.fromUsername) + ' さんの投稿から）' : ''}</div>
        <div class="p-name">${esc(w.name || '')}</div>
        ${w.genre ? `<div class="p-sub">${esc(w.genre)}</div>` : ''}
        <div class="p-actions">
          <button class="btn small primary popup-record">記録する</button>
          <button class="btn small popup-nav">${IC_NAV} ここへ行く</button>
          <button class="btn small popup-unwish">外す</button>
        </div>`;
    node.querySelector('.popup-record').addEventListener('click', () => {
      if (mapPopup) mapPopup.remove();
      Register.prefillWish(w);
      App.switchTab('register');
    });
    node.querySelector('.popup-nav').addEventListener('click', () => openNav({ name: w.name, lat: w.lat, lon: w.lon }));
    node.querySelector('.popup-unwish').addEventListener('click', () => {
      Store.removeWish(w.id);
      refreshWishData();
      if (mapPopup) mapPopup.remove();
      App.toast('行きたい店から外しました');
    });
    if (mapPopup) mapPopup.remove();
    mapPopup = new maplibregl.Popup({ offset: 12, maxWidth: '240px' })
      .setLngLat([w.lon, w.lat]).setDOMContent(node).addTo(map);
  }

  // つながっている人の投稿を読み込む（地図「みんな」用）。
  // 前回の結果を端末に控えておき、次回は即表示→裏で最新に差し替える
  const NET_LS = 'gourmet.netCache';
  function loadCachedNetwork() {
    if (networkPosts.length) return;
    try {
      const c = JSON.parse(localStorage.getItem(NET_LS) || 'null');
      if (c && Array.isArray(c.posts)) networkPosts = c.posts;
    } catch { /* noop */ }
  }
  async function loadNetworkPosts() {
    try {
      networkPosts = (typeof Cloud !== 'undefined') ? await Cloud.fetchNetworkPosts() : [];
      try { localStorage.setItem(NET_LS, JSON.stringify({ posts: networkPosts, time: Date.now() })); } catch { /* noop */ }
    } catch { loadCachedNetwork(); /* 取得失敗時は前回の控えを使う */ }
  }

  function refreshMap() {
    initMap();
    map.resize(); // タブ切り替えで表示された直後はキャンバスサイズが0のため
    if (!mapLoaded) { pendingRefresh = true; return; } // load後に反映される
    refreshMapData(true);
    ensureNetworkLoaded();
  }

  // 絞り込み・表示範囲の切り替え用: 視点を捨てて対象のピン全体に合わせ直す
  function refitMap() {
    mapHasView = false;
    refreshMap();
  }

  // 下のバーで地図タブを開いたとき: 表示範囲は必ず「自分」から始める
  // （視点は動かさない ― 店舗詳細を閉じたときにズームが戻らない仕様と揃える）
  function enterMapTab() {
    mapScope = 'me';
    document.querySelectorAll('.ms-btn').forEach(x => x.classList.toggle('on', x.dataset.scope === 'me'));
    const wb = $('#map-wish-btn');
    if (wb) wb.classList.remove('on'); // 「行きたいのみ」も解除
    refreshMap();
  }

  // フォロー中の人の訪問記録を自動で読み込む（ログイン中・初回のみ）。cbで読み込み後の再描画もできる
  function ensureNetworkLoaded(cb) {
    if (networkLoaded || typeof Cloud === 'undefined' || !Cloud.getUser()) return;
    networkLoaded = true;
    // 前回の控えがあれば、取得を待たずまず地図へ反映（体感を速くする）
    loadCachedNetwork();
    if (networkPosts.length && mapLoaded) refreshMapData(false);
    loadNetworkPosts().then(() => {
      if (mapLoaded) refreshMapData(false);
      if (cb) cb();
    }).catch(() => { if (cb) cb(); }); // 失敗しても骨組み表示のままにしない
  }

  // ログイン同期の完了直後に、ホーム・地図のフォロー中データと写真を裏で先読みする
  // （タブを開いた瞬間に読み込みを始めるのではなく、開く前に温めておく）
  function warmNetwork() {
    if (typeof Cloud === 'undefined' || !Cloud.getUser()) return;
    refetchFeed(false).catch(() => {});
    ensureNetworkLoaded(() => warmPhotos(networkPosts, 8));
  }

  function toggleHeat() {
    heatOn = !heatOn;
    $('#map-heat').classList.toggle('primary', heatOn);
    if (heatOn) buildHeat();
    else {
      if (map.getLayer('heat')) map.removeLayer('heat');
      if (map.getSource('heat')) map.removeSource('heat');
    }
  }
  function buildHeat() {
    const features = [];
    for (const v of Store.visits()) {
      // ジャンルフィルタ選択中は該当する訪問だけを対象にする
      if (mapGenreFilter.size && !(v.dishGenres || []).some(g => mapGenreFilter.has(g))) continue;
      const s = Store.getShop(v.shopId);
      if (s && s.lat != null && shopMatchesKeyword(s)) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: {} });
      }
    }
    const data = { type: 'FeatureCollection', features };
    if (map.getSource('heat')) { map.getSource('heat').setData(data); return; }
    map.addSource('heat', { type: 'geojson', data });
    map.addLayer({ id: 'heat', type: 'heatmap', source: 'heat',
      paint: {
        'heatmap-radius': 32, 'heatmap-opacity': 0.6,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 15, 2],
      } }, 'clusters'); // ピンの下に描画
  }

  // ========== 一覧 ==========
  function initList() {
    ['#flt-keyword', '#flt-group', '#flt-sort', '#flt-pref', '#flt-dish-genre', '#flt-rating', '#flt-fav']
      .forEach(sel => $(sel).addEventListener($(sel).tagName === 'INPUT' && $(sel).type === 'text' ? 'input' : 'change', renderList));
    // フィルタ選択肢
    $('#flt-dish-genre').innerHTML = '<option value="">料理ジャンル</option>' + Api.DISH_GENRES.map(g => `<option>${g}</option>`).join('');
    // 検索バーをタップしたら発見グリッドから店舗検索へ切り替え、絞り込みを開く（インスタと同じ操作感）
    // 最初はお気に入り・地図・詳細のみ。細かい絞り込みは「詳細」で開く
    $('#flt-keyword').addEventListener('focus', () => {
      // プロフィールの「お店をさがす」へ移動中はグリッド切り替えをせず、絞り込みだけ開く
      if ($('#view-list').contains($('#flt-keyword'))) setListMode(false);
      $('#list-filter-panel').classList.remove('hidden');
      $('#list-detail-filters').classList.add('hidden'); // 開くたびに詳細は閉じた状態から
      buildListGenreChips(); // 記録済みジャンルでチップを作り直す
    });
    $('#list-detail-toggle').addEventListener('click', () => {
      $('#list-detail-filters').classList.toggle('hidden');
      $('#list-detail-toggle').classList.toggle('on', !$('#list-detail-filters').classList.contains('hidden'));
    });
    // 料理ジャンルのチップ（1つ選択。もう一度押すと解除）— 値は内部のセレクトへ書き込む
    // 全ジャンル(70種以上)ではなく、自分が記録したことのあるジャンルだけを出す
    const gbar = $('#list-genre-chips');
    const buildListGenreChips = () => {
      const used = [...new Set(Store.visits().flatMap(v => v.dishGenres || []))];
      const cur = $('#flt-dish-genre').value;
      gbar.innerHTML = used.map(g =>
        `<button type="button" class="chip${g === cur ? ' on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
      gbar.classList.toggle('hidden', !used.length);
    };
    gbar.addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      const next = $('#flt-dish-genre').value === c.dataset.g ? '' : c.dataset.g;
      $('#flt-dish-genre').value = next;
      gbar.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.g === next));
      renderList();
    });
    // 星のチップ（★3以上/★4以上/★5。もう一度押すと解除）
    document.querySelectorAll('.star-chip').forEach(b => b.addEventListener('click', () => {
      const next = $('#flt-rating').value === b.dataset.r ? '' : b.dataset.r;
      $('#flt-rating').value = next;
      document.querySelectorAll('.star-chip').forEach(x => x.classList.toggle('on', x.dataset.r === next));
      renderList();
    }));
    // 検索結果の「お店/写真」切り替え（写真＝「ラーメン」等の検索で写真一覧を出すモード）
    document.querySelectorAll('#list-mode-segs .vl-seg').forEach(b => b.addEventListener('click', () => {
      listResultMode = b.dataset.m;
      document.querySelectorAll('#list-mode-segs .vl-seg').forEach(x => x.classList.toggle('on', x === b));
      renderList();
    }));
    // ←（戻る）で最初の画面（発見グリッド）へ。下の検索タブの再タップでも戻れる
    $('#list-back').addEventListener('click', enterListTab);
    // 行きたい店リスト
    $('#list-wishes').addEventListener('click', openWishlist);

    // パネルの外側をタップしたら閉じて検索バーだけに戻す（地図・一覧共通）
    // captureで登録: 地図などがタップイベントの伝播を止めても先に検知できる
    document.addEventListener('pointerdown', (e) => {
      const mapPanel = $('#map-filter-panel');
      if (mapPanel && !mapPanel.classList.contains('hidden') && !e.target.closest('.map-overlay')) {
        mapPanel.classList.add('hidden');
        $('.map-scope').classList.remove('hidden'); // パネルを閉じたら表示範囲アイコンを戻す
      }
      const listPanel = $('#list-filter-panel');
      if (listPanel && !listPanel.classList.contains('hidden') && !e.target.closest('.filters')) {
        listPanel.classList.add('hidden');
      }
    }, true);
  }

  // 行きたい店の一覧（保存した順に新しい方から）
  function openWishlist() {
    const wishes = Store.wishes().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const body = $('#modal-body');
    body.innerHTML = `<h2 class="wish-title">${IC_BOOKMARK} 行きたい店</h2>`
      + (wishes.length ? wishes.map(w => `
        <div class="wish-row">
          <div class="wish-main">
            <div class="wish-name">${esc(w.name || '')}</div>
            <div class="wish-sub">${esc(w.genre || '')}${w.fromUsername ? '　@' + esc(w.fromUsername) + ' さんの投稿から' : ''}</div>
          </div>
          ${w.lat != null ? `<button class="btn small wish-map" data-id="${esc(w.id)}">地図</button>` : ''}
          <button class="btn small wish-del" data-id="${esc(w.id)}">外す</button>
        </div>`).join('')
      : emptyBox(EMPTY_IC_FORK, 'まだありません。<br>ホームの投稿のしおりマークから保存できます。'));
    $('#modal').classList.remove('modal-full'); // 行きたいリストはカード表示に戻す
    $('#modal').classList.remove('hidden');
    body.querySelectorAll('.wish-del').forEach(b => b.addEventListener('click', () => {
      Store.removeWish(b.dataset.id);
      refreshWishData();
      openWishlist(); // 一覧を描き直す
    }));
    body.querySelectorAll('.wish-map').forEach(b => b.addEventListener('click', () => {
      const w = Store.wishes().find(x => x.id === b.dataset.id);
      if (!w) return;
      $('#modal').classList.add('hidden');
      App.switchTab('map');
      // 地図の初期化直後でも移動できるよう少し待ってから寄る
      setTimeout(() => { if (map) map.jumpTo({ center: [w.lon, w.lat], zoom: 15 }); }, 350);
    }));
  }

  function refreshPrefOptions() {
    const cur = $('#flt-pref').value;
    const prefs = [...new Set(Store.shops().map(s => s.pref).filter(Boolean))].sort();
    $('#flt-pref').innerHTML = '<option value="">都道府県</option>' + prefs.map(p => `<option>${esc(p)}</option>`).join('');
    $('#flt-pref').value = cur;
  }

  function filteredShops() {
    const kw = $('#flt-keyword').value.trim().toLowerCase();
    const pref = $('#flt-pref').value;
    const dg = $('#flt-dish-genre').value;
    const minR = +($('#flt-rating').value || 0);
    const favOnly = $('#flt-fav').checked;

    return Store.shops().filter(s => {
      if (favOnly && !s.favorite) return false;
      if (pref && s.pref !== pref) return false;
      const vs = Store.visitsOf(s.id);
      if (dg && !vs.some(v => (v.dishGenres || []).includes(dg))) return false;
      // 星の絞り込みは平均だけでなく、1回でも★minR以上の記録があれば表示する
      //（平均で超えている店とそうでない店はカード上のバッジで見分けられる）
      if (minR && (Store.avgRating(s.id) || 0) < minR
        && !vs.some(v => (v.rating || 0) >= minR)) return false;
      if (kw) {
        const hay = [s.name, s.station, s.pref, s.city, s.address, ...vs.map(v => v.comment || '')].join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function sortShops(list) {
    const mode = $('#flt-sort').value;
    const by = {
      newest: (a, b) => b.createdAt - a.createdAt,
      visitDate: (a, b) => new Date(Store.lastVisitDate(b.id) || 0) - new Date(Store.lastVisitDate(a.id) || 0),
      visitCount: (a, b) => Store.visitCount(b.id) - Store.visitCount(a.id),
      rating: (a, b) => Store.avgRating(b.id) - Store.avgRating(a.id),
      casual: (a, b) => (b.casual || 0) - (a.casual || 0),
      atmosphere: (a, b) => (b.atmosphere || 0) - (a.atmosphere || 0),
      speed: (a, b) => (b.speed || 0) - (a.speed || 0),
      name: (a, b) => a.name.localeCompare(b.name, 'ja'),
      // 一致率で重み付けした自分向けの評価が高い順
      personal: (a, b) => ratingPair({ name: b.name, lat: b.lat, lon: b.lon }).personal -
        ratingPair({ name: a.name, lat: a.lat, lon: a.lon }).personal,
      // 現在地から近い順（現在地が未取得なら★順に落とす）
      distance: (a, b) => {
        if (!lastKnownPos) return Store.avgRating(b.id) - Store.avgRating(a.id);
        const d = (s) => (s.lat != null && s.lon != null)
          ? Store.distMeters(lastKnownPos.lat, lastKnownPos.lon, s.lat, s.lon) : Infinity;
        return d(a) - d(b);
      },
    };
    return list.sort(by[mode] || by.newest);
  }

  function groupKeyFns(mode) {
    switch (mode) {
      case 'station': return (s) => [s.station || '最寄駅なし'];
      case 'pref': return (s) => [s.country && s.country !== '日本' ? `🌏 ${s.country}` : (s.pref || '都道府県なし')];
      case 'city': return (s) => [s.city || '市区町村なし'];
      case 'dishGenre': return (s) => {
        const gs = new Set();
        Store.visitsOf(s.id).forEach(v => (v.dishGenres || []).forEach(g => gs.add(g)));
        return gs.size ? [...gs] : ['料理ジャンルなし'];
      };
      case 'rating': return (s) => {
        const r = Math.round(Store.avgRating(s.id));
        return [r ? '★' + r : '評価なし'];
      };
      default: return null;
    }
  }

  // ---------- 発見（Podcast風: カテゴリータイル → ジャンル別の写真一覧） ----------
  // 検索タブの初期はカテゴリー一覧。「すべて」or各ジャンルをタップすると写真グリッドへ
  let exploreMode = true;      // true = 発見（カテゴリー/写真）、false = 店舗検索
  let exploreNetCache = null;  // { posts, time }: フォロー中の人の投稿の短時間キャッシュ
  let exploreItems = null;     // 読み込み済みの発見アイテム（写真＋ジャンル）
  // 複数ジャンルをまとめて1つのキーにするときの区切り。ジャンル名には「・」を含むもの
  //（例:「油そば・まぜそば」）があるため、「・」は区切りに使えない
  const GKEY_SEP = '|';
  // 表示用に「・」で連結されたジャンル文字列を配列へ戻す。
  // 「・」入りのジャンル名を先に取り出してから残りを分割する（そのままsplitすると
  //「油そば・まぜそば」が2つに割れて、どのジャンルにも一致しなくなる）
  function genresFromStr(str) {
    let rest = String(str || '');
    const out = [];
    for (const g of Api.DISH_GENRES) {
      if (!g.includes('・')) continue;
      while (rest.includes(g)) { out.push(g); rest = rest.replace(g, ''); }
    }
    for (const g of rest.split('・')) if (g) out.push(g);
    return out;
  }
  let exploreSub = null;       // 開いている大きなくくり（麺類・和食…）。nullなら最初の画面
  let exploreGenre = null;     // 開いている写真グリッド { genre, label }。nullならグリッド以外の画面
  let listResultMode = 'shop'; // 店舗検索の結果表示: 'shop'=店舗カード / 'photo'=写真グリッド
  let searchPhotoSeq = 0;      // 写真グリッドの描画順を守る（連続入力時に古い結果で上書きしない）

  // カテゴリータイルの配色（Podcastアプリ風のカラフルなタイル）

  // ========== カテゴリー/ジャンルの手描き風イラスト（線画SVG） ==========
  // デザイン案準拠: 温かい線画（茶色の輪郭＋クリーム系の塗り）。外部画像は使わず
  // インラインSVGで描く（オフラインでも表示され、Retinaでも滲まない）
  const GI = (body) => `<svg class="gi" viewBox="0 0 48 48" fill="none" stroke="#6E4F38" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  // 湯気（2本）。x は中心
  const gSteam = (x, y = 6) => `<path d="M${x - 4} ${y + 2}c-1.6 2 1.6 3.2 0 5.4M${x + 3} ${y}c-1.6 2 1.6 3.2 0 5.4" stroke-opacity=".55"/>`;
  // 茶碗/丼の器（下半分）
  const gBowl = (fill = '#F7EFE3') => `<path d="M7 23h34c0 8-5.5 13.5-12 15v3H19v-3C12.5 36.5 7 31 7 23z" fill="${fill}"/>`;
  // 平皿
  const gPlate = (y = 34) => `<ellipse cx="24" cy="${y}" rx="17" ry="5" fill="#FFFDF8"/>`;
  const GENRE_ICONS = {
    subete: GI('<rect x="10" y="10" width="11" height="11" rx="3" stroke="#D97757"/><rect x="27" y="10" width="11" height="11" rx="3" stroke="#D97757"/><rect x="10" y="27" width="11" height="11" rx="3" stroke="#D97757"/><rect x="27" y="27" width="11" height="11" rx="3" stroke="#D97757"/>'),
    ramen: GI(gSteam(20) + '<path d="M31 6l6 3M30 10l8-2" />' + gBowl() + '<path d="M12 23c2-4 6-7 12-7s10 3 12 7" fill="#F0D5B8"/><path d="M15 20c2.5-2 5-3 9-3M18 23c2-1.5 4-2 7-2" stroke-opacity=".7"/>'),
    tsukemen: GI('<path d="M27 8l7 4M26 12l9-1"/><rect x="6" y="18" width="17" height="8" rx="2" fill="#FFFDF8"/><path d="M8 22h13M9 25h11" stroke-opacity=".6"/><path d="M27 24h14c0 6-3.5 9.5-7 10.5V37h-1v-2.5c-3.5-1-6-4.5-6-10.5z" fill="#F7EFE3"/><path d="M6 30h17c-1 4-4 6-8.5 6S7 34 6 30z" fill="#F0D5B8"/>'),
    abura: GI(gBowl() + '<path d="M11 23c2-4.5 6.5-7.5 13-7.5S35 18.5 37 23" fill="#F0D5B8"/><circle cx="24" cy="17" r="4" fill="#FFFDF8"/><circle cx="24" cy="17" r="1.6" fill="#E8A33D" stroke="none"/><path d="M13 20c2-1.5 3.5-2 6-2.5M31 17.5c2 .5 3.5 1.2 5 2.5" stroke-opacity=".6"/>'),
    tantan: GI('<path d="M20 5c-2 2.5 2 4 0 6.5" stroke="#C8542E"/><path d="M27 4c-2 2.5 2 4 0 6.5" stroke="#C8542E"/>' + gBowl() + '<path d="M11 23c2-4 6.5-6.5 13-6.5S35 19 37 23" fill="#E8B27D"/><circle cx="24" cy="16.5" r="3.2" fill="#C8542E" stroke="none" opacity=".85"/>'),
    yakisoba: GI(gSteam(31, 8) + gPlate(33) + '<path d="M10 32c2-5 7-8 14-8s12 3 14 8" fill="#F0D5B8"/><path d="M13 28.5c3-2 6-3 10-3M20 30c3-1.5 6-2 9-2" stroke-opacity=".65"/><path d="M33 12v10M30 13.5l3-1.5 3 1.5" />'),
    udon: GI(gSteam(24) + '<path d="M32 7l6 4M31 11l8 0"/>' + gBowl() + '<path d="M12 23c2-3.5 6-6 12-6s10 2.5 12 6" fill="#FFFDF8"/><path d="M16 20.5c2-1.5 4.5-2.5 8-2.5M22 21c2.5-1 5-1.2 8 0" stroke-opacity=".7"/>'),
    soba: GI('<rect x="9" y="17" width="30" height="14" rx="3" fill="#FFFDF8"/><path d="M9 24h30"/><path d="M13 21.5c3-2 6-2.5 9-2M20 22c3-1.5 6-2 9-1.5M15 20.5c4-1.5 12-1.5 17 .5" stroke-opacity=".65"/><path d="M13 31v3M35 31v3"/>'),
    pasta: GI(gPlate(33) + '<path d="M11 32c2-4 6.5-7 13-7s11 3 13 7" fill="#F0D5B8"/><path d="M29 8v13M33 8v10M25 8v10"/><path d="M29 21a5 4.5 0 1 1-6-3.5" stroke-opacity=".8"/>'),
    sushi: GI('<path d="M8 20c0-3 3.5-5 8-5s8 2 8 5l-1 4H9z" fill="#F49A8A"/><path d="M9 24h14v5a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z" fill="#FFFDF8"/><path d="M26 24c0-3 3.5-5 8-5s8 2 8 5l-1 4h-14z" fill="#F4A96B"/><path d="M27 28h14v4a2 2 0 0 1-2 2H29a2 2 0 0 1-2-2z" fill="#FFFDF8"/><path d="M11 18.5c2-1 3.5-1.2 5.5-1M29 22.5c2-1 3.5-1.2 5.5-1" stroke-opacity=".55"/>'),
    fish: GI('<path d="M8 26c4-6 10-9 17-9 6 0 10 3 13 7-3 4-7 7-13 7-7 0-13-1-17-5z" fill="#BFD3E0"/><path d="M38 24l6-6-1 8 1 6-6-6" fill="#BFD3E0"/><circle cx="15" cy="24" r="1.2" fill="#6E4F38" stroke="none"/><path d="M22 19c1.5 2 1.5 6 0 9M28 18.5c1.5 2.5 1.5 7 0 10" stroke-opacity=".55"/>'),
    washoku: GI(gSteam(24) + '<path d="M11 20c2.5-4 7-6.5 13-6.5S34.5 16 37 20" fill="#FFFDF8"/><path d="M8 21h32c0 7-5 12-12 13.5V38H20v-3.5C13 33 8 28 8 21z" fill="#F7EFE3"/><path d="M14 27h20" stroke-opacity=".35"/>'),
    tempura: GI(gPlate(34) + '<path d="M20 12c1-2 3-2 4 0l7 14-5 3-8-1z" fill="#F0C27D"/><path d="M22 9c.5-2 3-2.5 4-1"/><path d="M16 20c-4 1-6 4-6 8l7 3z" fill="#F0D5B8"/><path d="M21 15l6 11M24 13l5 9" stroke-opacity=".5"/>'),
    katsu: GI(gPlate(34) + '<path d="M10 22c0-4 5-7 14-7s14 3 14 7-5 8-14 8-14-4-14-8z" fill="#E0A45B"/><path d="M17 16v13M23 15.5v14M29 16v13" stroke-opacity=".7"/><path d="M13 19c1.5-1 3-1.6 5-2" stroke-opacity=".5"/>'),
    kushi: GI('<path d="M12 8v32"/><circle cx="12" cy="13" r="3.4" fill="#DB8A63"/><circle cx="12" cy="21" r="3.4" fill="#A9BC8B"/><circle cx="12" cy="29" r="3.4" fill="#DB8A63"/><path d="M28 8v32"/><rect x="24" y="10" width="8" height="6" rx="2" fill="#DB8A63"/><rect x="24" y="18" width="8" height="6" rx="2" fill="#F0D5B8"/><rect x="24" y="26" width="8" height="6" rx="2" fill="#DB8A63"/>'),
    unagi: GI('<rect x="8" y="14" width="32" height="22" rx="3" fill="#3F3A35" stroke="#3F3A35"/><rect x="11" y="17" width="26" height="16" rx="1.5" fill="#FFFDF8" stroke="#6E4F38"/><path d="M13 25c4-3 8-3 11 0s7 3 11 0" stroke="#B9885C" stroke-width="4"/><path d="M15 21h6M27 29h6" stroke-opacity=".4"/>'),
    konamon: GI(gSteam(20) + '<ellipse cx="22" cy="28" rx="14" ry="8" fill="#E0A45B"/><ellipse cx="22" cy="26" rx="14" ry="7.5" fill="#F0C27D"/><path d="M12 24c3 1.5 7 2 10 2s7-.5 10-2" stroke-opacity=".4"/><path d="M39 14l3 14M36.5 15.5l5-1"/>'),
    takoyaki: GI('<ellipse cx="24" cy="33" rx="15" ry="5" fill="#FFFDF8"/><circle cx="15" cy="25" r="5.5" fill="#E0A45B"/><circle cx="27" cy="23" r="5.5" fill="#E0A45B"/><circle cx="34" cy="29" r="5" fill="#E0A45B"/><path d="M27 10v8"/><path d="M13 22c1-1 2.5-1.5 4-1.5M25 20c1-1 2.5-1.5 4-1.5" stroke-opacity=".5"/>'),
    nabe: GI(gSteam(24) + '<path d="M10 20h28v3c0 8-6 13-14 13s-14-5-14-13z" fill="#D97757" stroke="#B85F41"/><path d="M12 18c3-2.5 7.5-4 12-4s9 1.5 12 4" fill="#FFFDF8"/><circle cx="24" cy="12" r="2" fill="#F7EFE3"/><path d="M4 22h6M38 22h6"/>'),
    bento: GI('<rect x="7" y="15" width="34" height="20" rx="3" fill="#FFFDF8"/><path d="M24 15v20M24 25h17"/><circle cx="15.5" cy="25" r="4.5" fill="#F0D5B8"/><rect x="28" y="18.5" width="9" height="3.5" rx="1.5" fill="#DB8A63"/><rect x="28" y="28.5" width="9" height="3.5" rx="1.5" fill="#A9BC8B"/>'),
    don: GI(gSteam(24) + gBowl('#F7EFE3') + '<path d="M10 23c2.5-5 7.5-8 14-8s11.5 3 14 8" fill="#E0A45B"/><path d="M14 19.5c2-1.5 4-2.5 7-3M27 16.5c3 .5 5.5 1.5 7.5 3" stroke-opacity=".55"/>'),
    yakiniku: GI(gSteam(24, 4) + '<path d="M14 18c3-4 9-5 13-2 3 2 8 2 8 7 0 4-4 7-10 7s-13-2-13-7c0-2 1-4 2-5z" fill="#E2917C"/><path d="M17 21c2-1.5 4-2 7-2M22 25c2-1 4-1.2 6-1" stroke-opacity=".5"/><path d="M8 36h32M12 36l-2 4M24 36v4M36 36l2 4"/>'),
    steak: GI(gPlate(34) + '<path d="M10 24c0-5 5-8 12-8 8 0 16 2 16 8 0 5-6 8-14 8s-14-3-14-8z" fill="#B96A4B"/><path d="M15 20l16 9M15 27l14-8" stroke-opacity=".45"/><path d="M34 18c2 1.5 3.5 3.5 3.5 6" stroke-opacity=".5"/>'),
    wok: GI(gSteam(21, 4) + '<path d="M8 20h26c-1 8-6.5 13-13 13S9 28 8 20z" fill="#4A413A" stroke="#4A413A"/><path d="M10 20h22c-.8 6.5-5.5 11-11 11s-10.2-4.5-11-11z" fill="#F0D5B8" stroke="#6E4F38"/><path d="M34 21l10-4"/>'),
    gyoza: GI('<ellipse cx="24" cy="34" rx="16" ry="5" fill="#FFFDF8"/><path d="M10 28c0-6 5-10 11-10 3.5 0 5 2 3 4-4 4-8 6-14 6z" fill="#F0D5B8"/><path d="M22 28c0-6 5-10 11-10 3.5 0 5 2 3 4-4 4-8 6-14 6z" fill="#F0D5B8"/><path d="M13 24c2-.5 4-1.5 6-3M25 24c2-.5 4-1.5 6-3" stroke-opacity=".5"/>'),
    korean: GI(gSteam(24) + '<path d="M9 20h30v2c0 8-6.5 14-15 14S9 30 9 22z" fill="#4A413A" stroke="#4A413A"/><path d="M12 20c2-3.5 6.5-6 12-6s10 2.5 12 6" fill="#F0D5B8"/><circle cx="24" cy="16" r="3" fill="#FFFDF8"/><circle cx="24" cy="16" r="1.3" fill="#E8A33D" stroke="none"/><path d="M15 17.5c1.5-1 3-1.6 5-2M29 15.5c2 .4 3.5 1 5 2" stroke="#C8542E" stroke-opacity=".8"/>'),
    thai: GI(gSteam(28, 5) + gBowl() + '<path d="M11 23c2-4 6.5-6.5 13-6.5S35 19 37 23" fill="#E8B27D"/><path d="M18 15c1.5-3 5-4 7.5-2.5-1 2.5-4 4-7.5 2.5z" fill="#A9BC8B"/><path d="M27 13c2.5-1.5 5 .5 5 3-2.5 1-5-.5-5-3z" fill="#F49A8A"/>'),
    indian: GI('<path d="M8 18c0-5 5-8 10-8 4 0 7 2 6 6-1.5 6-6 12-12 12-3 0-4-2-4-4z" fill="#F0C27D"/><path d="M12 16c1.5-1.5 3.5-2.5 6-3" stroke-opacity=".5"/><circle cx="33" cy="28" r="8" fill="#FFFDF8"/><path d="M27.5 26.5c1.5-2 4-3 6.5-2.5s4 2 4.5 4.5" stroke="#C8542E"/><path d="M22 40h22"/>'),
    curry: GI(gPlate(32) + '<path d="M9 30c1.5-4 5-6.5 9-6.5 2.5 0 4 1 6 1s4.5-2.5 8-2.5c4.5 0 8 3.5 7 8H9z" fill="#B9885C"/><path d="M10 23c2-3 5-5 9-5.5" stroke-opacity=".55"/><path d="M40 14l-6 12M37 12.5l6 3"/>'),
    yoshoku: GI(gPlate(33) + '<path d="M12 30c0-4 4-7 9-7s9 3 9 7z" fill="#E0A45B"/><path d="M30 26c3-2 7-2 8 1 1 2-1 4-4 4s-4-2-4-5z" fill="#A9BC8B"/><circle cx="33" cy="22" r="2.5" fill="#D97757"/><path d="M15 26c1.5-1 3-1.6 5-2" stroke-opacity=".5"/>'),
    italian: GI('<path d="M20 8h6v5l2 3v16a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V16l2-3z" fill="#F2E4B8"/><path d="M18 22h10" stroke-opacity=".5"/><circle cx="35" cy="30" r="5.5" fill="#D97757"/><path d="M35 24.5c-.5-2 .5-3.5 2-4M33 25c.5-1.5 2-2.5 3.5-2.5" stroke="#5E7A44"/><path d="M8 38h32"/>'),
    pizza: GI('<path d="M12 10c8-4 18-4 26 0L25 40z" fill="#F0C27D"/><path d="M12 10c8-4 18-4 26 0l-1.5 3.5c-7.5-3.5-15.5-3.5-23 0z" fill="#D97757" stroke="#B85F41"/><circle cx="22" cy="20" r="2.5" fill="#D97757"/><circle cx="29" cy="24" r="2.2" fill="#D97757"/><circle cx="24" cy="29" r="2" fill="#D97757"/>'),
    french: GI('<path d="M12 8c0 6 3 9 6 9v13h-4v2h10v-2h-4V17c3 0 6-3 6-9z" fill="#F2E4EF" fill-opacity=".5"/><path d="M12 11h14" stroke-opacity=".4"/><ellipse cx="34" cy="32" rx="9" ry="3.5" fill="#FFFDF8"/><circle cx="34" cy="28" r="4" fill="#DB8A63"/>'),
    spanish: GI('<circle cx="24" cy="27" r="13" fill="#E8B27D"/><circle cx="24" cy="27" r="13" fill="none" stroke="#B85F41" stroke-width="2.4"/><path d="M4 27h7M37 27h7"/><path d="M19 23c2-2 5-2.5 7-1M25 29c2-.5 4-2 4.5-4" stroke="#C8542E"/><circle cx="18" cy="29" r="2" fill="#A9BC8B"/><circle cx="28" cy="33" r="1.8" fill="#F49A8A"/>'),
    burger: GI('<path d="M10 20c0-6 6-10 14-10s14 4 14 10z" fill="#F0C27D"/><path d="M10 23h28M8 27h32c-1 2.5-2 3-4 3H12c-2 0-3-.5-4-3z" fill="#A9BC8B"/><path d="M10 33h28v2a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#F0C27D"/><circle cx="18" cy="15" r=".8" fill="#6E4F38" stroke="none"/><circle cx="25" cy="14" r=".8" fill="#6E4F38" stroke="none"/><circle cx="31" cy="16" r=".8" fill="#6E4F38" stroke="none"/>'),
    sandwich: GI('<path d="M8 30l16-18 16 18z" fill="#F2E4B8"/><path d="M11 27l13-14 13 14" stroke="#DB8A63"/><path d="M8 30h32v4H8z" fill="#F0C27D"/>'),
    bread: GI('<path d="M7 24c0-5 4-8 9-8s9 3 9 8v9H7z" fill="#F0C27D"/><path d="M10 16.5c1-2 3-3.5 6-3.5s5 1.5 6 3.5" stroke-opacity=".55"/><path d="M28 32c4-6 9-8 12-6s2 7-4 10c-3 1.5-6 1-8-4z" fill="#E0A45B"/><path d="M31 30l6 4M34 27.5l4 5" stroke-opacity=".5"/>'),
    cafe: GI(gSteam(21) + '<path d="M10 17h22v9a10 10 0 0 1-10 10h-2a10 10 0 0 1-10-10z" fill="#FFFDF8"/><path d="M32 19h4a4 4 0 0 1 0 8h-4"/><path d="M13 20c5 2 11 2 16 0" stroke="#B9885C" stroke-opacity=".7"/><ellipse cx="21" cy="39" rx="12" ry="2.6"/>'),
    drink: GI('<path d="M14 14h20l-2.5 24a3 3 0 0 1-3 2.5h-9a3 3 0 0 1-3-2.5z" fill="#F7EFE3"/><path d="M13 20h22" stroke-opacity=".5"/><path d="M27 14l4-9 4 1.5"/><circle cx="20" cy="30" r="1.6" fill="#B9885C" stroke="none"/><circle cx="26" cy="27" r="1.6" fill="#B9885C" stroke="none"/><circle cx="24" cy="33" r="1.6" fill="#B9885C" stroke="none"/>'),
    pancake: GI('<ellipse cx="24" cy="15" rx="12" ry="4" fill="#F0C27D"/><path d="M12 15v5c0 2.2 5.4 4 12 4s12-1.8 12-4v-5" fill="#F0C27D"/><path d="M12 20v5c0 2.2 5.4 4 12 4s12-1.8 12-4v-5" fill="#E0A45B"/><rect x="20" y="11" width="8" height="4" rx="1" fill="#F2E4B8"/><ellipse cx="24" cy="33" rx="15" ry="3.5" fill="#FFFDF8"/>'),
    cake: GI('<path d="M10 22h20v14H10z" fill="#FFFDF8"/><path d="M10 27h20" stroke="#F49A8A"/><path d="M10 31h20" stroke="#F49A8A"/><path d="M30 22l8 14H30z" fill="#F7EFE3"/><path d="M17 17c0-2 1.5-3.5 3.5-3.5S24 15 24 17c0 1.5-1.5 3-3.5 4-2-1-3.5-2.5-3.5-4z" fill="#D97757"/><path d="M20.5 13v-3"/>'),
    parfait: GI('<path d="M14 12h20l-3 16h-14z" fill="#F7EFE3"/><path d="M15 17c3 1.5 6-1.5 9 0s6-1.5 9 0" stroke="#F49A8A"/><path d="M24 28v8M18 40h12M24 36h0"/><circle cx="24" cy="9" r="2.6" fill="#C8542E"/><path d="M19 12c1.5-2 3-3 5-3s3.5 1 5 3" stroke-opacity=".5"/>'),
    crepe: GI('<path d="M12 40L22 12c6-2 12 0 14 4z" fill="#F2E4B8"/><path d="M22 12c2 4 8 6 14 4" stroke-opacity=".7"/><path d="M24 13c2-3 5.5-4.5 8-3.5M28 15c2-1.5 4.5-2 6-1" stroke="#F49A8A"/><circle cx="31" cy="10" r="2" fill="#C8542E"/>'),
    ice: GI('<path d="M17 22h14L24 42z" fill="#E0A45B"/><path d="M19 26h10M21 31h6" stroke-opacity=".5"/><circle cx="24" cy="14" r="8" fill="#F7EFE3"/><path d="M18 11c1.5-1.5 3.5-2.5 6-2.5" stroke-opacity=".5"/>'),
    donut: GI('<circle cx="24" cy="26" r="14" fill="#F0C27D"/><path d="M11 24c3-3 7 1 13 0s9-3 13 0" fill="#DB8A63" stroke="#B85F41"/><circle cx="24" cy="26" r="4.5" fill="#FFFDF8"/><path d="M17 18l2 2M29 17l-1.5 2.5M33 22l-2 1.5" stroke="#FFFDF8"/>'),
    kakigori: GI('<path d="M12 20c0-7 5.5-12 12-12s12 5 12 12z" fill="#FFFDF8"/><path d="M15 14c1.5-2 3.5-3.5 6-4" stroke-opacity=".45"/><path d="M10 22h28l-3 4H13z" fill="#F7EFE3"/><path d="M14 26h20l-3 12H17z" fill="#F49A8A" fill-opacity=".45"/><path d="M31 8l3-5 3 1"/>'),
    wagashi: GI('<path d="M10 34h28"/><path d="M8 38h32" stroke-opacity=".4"/><path d="M14 30c8-6 12-6 20 0" stroke-opacity="0"/><path d="M12 12l24 18"/><circle cx="16" cy="16" r="4.5" fill="#F49A8A"/><circle cx="24" cy="22" r="4.5" fill="#FFFDF8"/><circle cx="32" cy="28" r="4.5" fill="#A9BC8B"/>'),
    tapioca: GI('<path d="M15 12h18l-2 26a3 3 0 0 1-3 2.5h-8a3 3 0 0 1-3-2.5z" fill="#F0D5B8" fill-opacity=".6"/><path d="M14 18h20" stroke-opacity=".5"/><path d="M26 12l3-8 4 1"/><circle cx="20" cy="34" r="1.8" fill="#4A413A" stroke="none"/><circle cx="25" cy="36" r="1.8" fill="#4A413A" stroke="none"/><circle cx="28" cy="32" r="1.8" fill="#4A413A" stroke="none"/><circle cx="22" cy="30" r="1.8" fill="#4A413A" stroke="none"/>'),
    cloche: GI('<path d="M8 32c1-9 7-15 16-15s15 6 16 15z" fill="#F7EFE3"/><circle cx="24" cy="13" r="2.5" fill="#FFFDF8"/><path d="M12 26c1.5-4 4.5-7 8.5-8.5" stroke-opacity=".5"/><path d="M5 34h38"/>'),
  };
  // ジャンル名 → アイコンの割り当て（専用の絵が無いジャンルは近い絵を使う）
  const GENRE_ICON_MAP = {
    'すべて': 'subete',
    '麺類': 'ramen', 'ラーメン': 'ramen', 'つけ麺': 'tsukemen', '油そば・まぜそば': 'abura', '担々麺': 'tantan',
    '焼きそば': 'yakisoba', 'うどん': 'udon', 'そば': 'soba', 'パスタ': 'pasta',
    '和食': 'washoku', '寿司': 'sushi', '海鮮・魚介': 'fish', '海鮮丼': 'fish', '日本料理': 'washoku',
    '天ぷら': 'tempura', 'とんかつ': 'katsu', '串揚げ': 'kushi', '焼鳥': 'kushi', 'うなぎ': 'unagi',
    'お好み焼き': 'konamon', 'たこ焼き': 'takoyaki', 'もんじゃ焼き': 'konamon',
    '鍋': 'nabe', 'もつ鍋': 'nabe', 'しゃぶしゃぶ': 'nabe', 'すき焼き': 'nabe', 'おでん': 'nabe',
    '釜飯': 'washoku', '郷土料理': 'washoku', '沖縄料理': 'washoku', '定食': 'washoku', '弁当': 'bento',
    '丼もの': 'don', '牛丼': 'don', '親子丼': 'don',
    '肉料理': 'yakiniku', '焼肉': 'yakiniku', 'ホルモン': 'yakiniku', 'ジンギスカン': 'yakiniku',
    'ステーキ': 'steak', 'ハンバーグ': 'steak',
    '中華': 'wok', '中華料理': 'wok', 'チャーハン': 'wok', '餃子': 'gyoza', '小籠包': 'gyoza',
    'アジア': 'thai', '韓国料理': 'korean', 'タイ料理': 'thai', 'ベトナム料理': 'thai', 'インド料理': 'indian', 'エスニック': 'thai',
    'カレー': 'curry', 'スープカレー': 'curry',
    '洋食': 'yoshoku', 'イタリアン': 'italian', 'ピザ': 'pizza', 'フレンチ': 'french', 'スペイン料理': 'spanish',
    'ハンバーガー': 'burger', 'サンドイッチ': 'sandwich', 'パン': 'bread',
    'カフェ・スイーツ': 'cake', 'カフェメニュー': 'cafe', 'パンケーキ': 'pancake', 'ケーキ': 'cake', 'パフェ': 'parfait',
    'クレープ': 'crepe', 'アイス・ジェラート': 'ice', 'ドーナツ': 'donut', 'かき氷': 'kakigori',
    '和菓子': 'wagashi', 'タピオカ': 'tapioca', 'スイーツ': 'cake', 'ドリンク': 'drink',
    'その他': 'cloche', 'ビュッフェ': 'cloche',
  };
  // デザイン案の画像から切り出した本物のイラスト（icons/genre/*.png）。
  // ここにあるジャンルは画像を使い、無いジャンルだけ上の線画SVGで補う
  const GENRE_IMG = {
    'すべて': 'subete',
    '麺類': 'ramen', 'ラーメン': 'ramen', 'つけ麺': 'tsukemen', '油そば・まぜそば': 'aburasoba',
    '担々麺': 'tantan', 'うどん': 'udon', 'そば': 'soba', 'パスタ': 'pasta', '焼きそば': 'yakisoba',
    'カレー': 'curry', 'スープカレー': 'soupcurry', '寿司': 'sushi',
    '肉料理': 'yakiniku', '焼肉': 'yakiniku', 'ホルモン': 'horumon', 'ジンギスカン': 'jingisukan',
    'ステーキ': 'steak', 'ハンバーグ': 'hamburg', 'ハンバーガー': 'burger', 'ピザ': 'pizza',
    '中華': 'chuka', '中華料理': 'chuka', 'チャーハン': 'chahan',
    'アジア': 'thai', '韓国料理': 'korean', 'タイ料理': 'thai', 'ベトナム料理': 'vietnam', 'エスニック': 'ethnic', 'インド料理': 'indian',
    'カフェ・スイーツ': 'sweets', 'カフェメニュー': 'cafe', 'スイーツ': 'sweets', 'ケーキ': 'cake', 'パン': 'bread',
    '和食': 'washoku', '日本料理': 'washoku', '定食': 'teishoku', '郷土料理': 'kyodo', '沖縄料理': 'okinawa',
    '洋食': 'yoshoku', 'イタリアン': 'italian', 'フレンチ': 'french', 'スペイン料理': 'spanish',
    '和菓子': 'dessert',
    // 2枚目のデザイン案（不足分33種）から切り出したイラスト
    '海鮮・魚介': 'kaisen', '海鮮丼': 'kaisendon', '天ぷら': 'tempura', 'とんかつ': 'tonkatsu', '串揚げ': 'kushiage',
    '焼鳥': 'yakitori', 'うなぎ': 'unagi', 'お好み焼き': 'okonomiyaki', 'たこ焼き': 'takoyaki', 'もんじゃ焼き': 'monja',
    '鍋': 'nabe', 'もつ鍋': 'motsunabe', 'しゃぶしゃぶ': 'shabushabu', 'すき焼き': 'sukiyaki', 'おでん': 'oden',
    '釜飯': 'kamameshi', '弁当': 'bento', '丼もの': 'donburi', '牛丼': 'gyudon', '親子丼': 'oyakodon',
    '餃子': 'gyoza', '小籠包': 'shoronpo', 'サンドイッチ': 'sandwich',
    'パンケーキ': 'pancake', 'パフェ': 'parfait', 'クレープ': 'crepe', 'アイス・ジェラート': 'icecream',
    'ドーナツ': 'donut', 'かき氷': 'kakigori', 'タピオカ': 'tapioca', 'ドリンク': 'drink',
    'ビュッフェ': 'buffet', 'その他': 'sonota',
  };
  // 「◯◯すべて」のような複合ラベルにも対応（先頭一致で探す）
  function genreIcon(label) {
    const l = String(label || '');
    // まず本物のイラスト（画像）から
    let img = GENRE_IMG[l];
    if (!img) {
      for (const name of Object.keys(GENRE_IMG)) {
        if (name !== 'すべて' && l.startsWith(name)) { img = GENRE_IMG[name]; break; }
      }
    }
    if (!img && l.endsWith('すべて')) img = 'subete';
    if (img) return `<img class="gi" src="icons/genre/${img}.png" alt="" loading="lazy" decoding="async">`;
    // 画像が無いジャンルは線画SVGで補う
    let key = GENRE_ICON_MAP[l];
    if (!key) {
      for (const name of Object.keys(GENRE_ICON_MAP)) {
        if (name !== 'すべて' && l.startsWith(name)) { key = GENRE_ICON_MAP[name]; break; }
      }
    }
    return GENRE_ICONS[key || 'cloche'];
  }

  const CAT_COLORS = ['#C6613F', '#C08A2E', '#6E8B54', '#5B84A8', '#8B6FA8', '#B04A3D',
    '#4E8E7F', '#A56A32', '#B65C77', '#4B7BA8', '#7C8F3F', '#96658F'];

  function setListMode(explore) {
    exploreMode = explore;
    $('#shop-list').classList.toggle('hidden', explore);
    $('#list-back').classList.toggle('hidden', explore); // 店舗検索モード中だけ←（戻る）を出す
    $('#list-mode-segs').classList.toggle('hidden', explore); // お店/写真の切り替えも検索モード中だけ
    if (explore) showExploreCats(); else { hideExplore(); renderList(); }
  }

  // 発見の各パーツの表示切替
  function hideExplore() {
    $('#explore-cats').classList.add('hidden');
    $('#explore-head').classList.add('hidden');
    $('#explore-grid').classList.add('hidden');
  }
  function showExploreCats() {
    exploreSub = null;
    exploreGenre = null;
    $('#shop-list').classList.add('hidden');
    $('#explore-head').classList.add('hidden');
    $('#explore-grid').classList.add('hidden');
    $('#explore-cats').classList.remove('hidden');
    $('#list-back').classList.add('hidden');
    renderExploreCats();
  }

  // 検索タブを開いたときは常に最初の画面（発見グリッド）から始める
  function enterListTab() {
    // プロフィールの「お店をさがす」に検索UIを移動していたら元の位置へ戻す
    const lv = $('#view-list');
    const fc = $('#list-filters-card');
    if (!lv.contains(fc)) {
      lv.insertBefore(fc, $('#explore-head')); // 検索バーは常に最上部
      lv.appendChild($('#shop-list'));
    }
    $('#flt-keyword').value = '';
    // 絞り込みも毎回まっさらに（見えない絞り込みが残って「表示されない」と混乱しないように）
    $('#flt-dish-genre').value = '';
    $('#flt-rating').value = '';
    $('#flt-pref').value = '';
    $('#flt-group').value = '';
    $('#flt-fav').checked = false;
    document.querySelectorAll('#list-genre-chips .chip, .star-chip').forEach(x => x.classList.remove('on'));
    $('#list-filter-panel').classList.add('hidden');
    // 結果表示は「お店」から（写真モードのまま残さない）
    listResultMode = 'shop';
    document.querySelectorAll('#list-mode-segs .vl-seg').forEach(x => x.classList.toggle('on', x.dataset.m === 'shop'));
    setListMode(true);
  }

  // 自分の写真から、ホームの投稿と同じ形のデータを組み立てる
  function buildOwnPost(ph) {
    const shop = Store.getShop(ph.shopId) || {};
    const v = Store.visits().find(x => x.id === ph.visitId) || {};
    const prof = Store.getProfile();
    return {
      id: ph.visitId, username: prof.username || '', displayName: prof.name || 'BITEMAP',
      avatar: prof.avatar || '', photoUrl: photoUrl(ph),
      rating: v.rating || 0, shopName: shop.name || '', genre: (v.dishGenres || []).join('・'),
      comment: v.comment || '', datetime: v.datetime || '',
      lat: shop.lat, lon: shop.lon, address: shop.address || '',
      pref: shop.pref || '', city: shop.city || '', station: shop.station || '',
      casual: shop.casual, atmosphere: shop.atmosphere, speed: shop.speed,
    };
  }

  // 発見アイテム（自分の写真＋フォロー中の人の写真つき投稿）をジャンル付きで読み込む
  async function loadExploreItems() {
    const photos = await Store.allPhotos();
    const vById = new Map(Store.visits().map(v => [v.id, v]));
    const items = photos.map(ph => {
      const v = vById.get(ph.visitId);
      return { kind: 'mine', ph,
        time: (v && v.datetime ? new Date(v.datetime).getTime() : 0) || ph.createdAt || 0,
        genres: (v && v.dishGenres) || [] };
    });
    try {
      if (typeof Cloud !== 'undefined' && Cloud.getUser()) {
        if (!exploreNetCache || Date.now() - exploreNetCache.time > 60000) {
          exploreNetCache = { posts: await Cloud.fetchNetworkPosts(), time: Date.now() };
        }
        for (const p of exploreNetCache.posts) {
          if (p.photoUrl) items.push({ kind: 'net', p,
            time: p.datetime ? new Date(p.datetime).getTime() : 0,
            genres: genresFromStr(p.genre) });
        }
      }
    } catch { /* 未ログイン・通信失敗時は自分の写真のみ */ }
    items.sort((a, b) => b.time - a.time);
    exploreItems = items;
    return items;
  }

  // ジャンルごとの件数（記録がまだ無いジャンルは0件として扱う）
  function genreCounts(items) {
    const count = new Map();
    for (const it of items) for (const g of it.genres) count.set(g, (count.get(g) || 0) + 1);
    return count;
  }
  // Podcast風カラータイル1枚。keyは開いたときに絞り込むジャンル（「・」区切りで複数可）
  function catTile(key, label, n, color, opt) {
    const o = opt || {};
    return `<button type="button" class="ex-cat${n ? '' : ' off'}${o.wide ? ' ex-all' : ''}"
      data-cat="${esc(key)}"${o.sub ? ` data-sub="${esc(o.sub)}"` : ''} style="--cat-c:${color}">
      <span class="ex-cat-ic">${genreIcon(label)}</span>
      <span class="ex-cat-label">${esc(label)}</span>
      <span class="ex-cat-count">${n}件</span>
    </button>`;
  }

  // 最初の画面: 「すべて」＋大きなくくり（麺類・和食…）。記録が無いくくりも表示
  async function renderExploreCats() {
    const box = $('#explore-cats');
    box.innerHTML = '<div class="ex-loading">読み込み中…</div>';
    const items = await loadExploreItems();
    if (!items.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, 'まだ写真がありません。<br>最初の一皿を記録してみましょう。',
        '<button class="btn primary empty-add">写真を登録する</button>');
      box.querySelector('.empty-add').addEventListener('click', () => Register.openCamera());
      return;
    }
    const count = genreCounts(items);
    const catCount = (c) => c.genres.reduce((s, g) => s + (count.get(g) || 0), 0);
    box.innerHTML = catTile('', 'すべて', items.length, CAT_COLORS[0], { wide: true }) +
      Api.DISH_CATEGORIES.map((c, i) =>
        catTile('', c.name, catCount(c), CAT_COLORS[(i + 1) % CAT_COLORS.length], { sub: c.name })).join('');
    box.querySelectorAll('.ex-cat').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.sub) openExploreSub(b.dataset.sub);   // 大きなくくり → 詳しいジャンル一覧へ
      else openExploreCat('', 'すべて');                   // すべて → 写真グリッドへ
    }));
  }

  // 大きなくくりを開く → 中の詳しいジャンル（ラーメン・うどん…）。0件のジャンルも表示
  async function openExploreSub(catName) {
    const cat = Api.DISH_CATEGORIES.find(c => c.name === catName);
    if (!cat) { showExploreCats(); return; }
    exploreSub = catName;
    exploreGenre = null;
    $('#explore-grid').classList.add('hidden');
    $('#explore-cats').classList.remove('hidden');
    const head = $('#explore-head');
    head.classList.remove('hidden');
    head.innerHTML = `<button type="button" class="ex-back" aria-label="カテゴリーへ戻る">‹</button><span class="ex-head-title">${esc(catName)}</span>`;
    head.querySelector('.ex-back').addEventListener('click', showExploreCats);
    const box = $('#explore-cats');
    box.innerHTML = '<div class="ex-loading">読み込み中…</div>';
    const items = await loadExploreItems();
    const count = genreCounts(items);
    const total = cat.genres.reduce((s, g) => s + (count.get(g) || 0), 0);
    box.innerHTML = catTile(cat.genres.join(GKEY_SEP), catName + 'すべて', total, CAT_COLORS[0], { wide: true }) +
      cat.genres.map((g, i) => catTile(g, g, count.get(g) || 0, CAT_COLORS[(i + 1) % CAT_COLORS.length])).join('');
    box.querySelectorAll('.ex-cat').forEach(b => b.addEventListener('click', () =>
      openExploreCat(b.dataset.cat, b.querySelector('.ex-cat-label').textContent)));
  }

  // ジャンルを開く → 写真グリッド（戻ると開いていたくくりのジャンル一覧へ）
  function openExploreCat(genre, label) {
    exploreGenre = { genre, label };
    $('#explore-cats').classList.add('hidden');
    const back = exploreSub;
    const head = $('#explore-head');
    head.classList.remove('hidden');
    head.innerHTML = `<button type="button" class="ex-back" aria-label="戻る">‹</button><span class="ex-head-title">${esc(label || 'すべて')}</span>`;
    head.querySelector('.ex-back').addEventListener('click', () =>
      back ? openExploreSub(back) : showExploreCats());
    $('#explore-grid').classList.remove('hidden');
    renderExploreGrid(genre);
  }

  // 選んだジャンルの写真を敷き詰める（genreが空なら全部、GKEY_SEP区切りで複数可）。タップで投稿表示
  async function renderExploreGrid(genre) {
    const box = $('#explore-grid');
    box.innerHTML = SKEL_GRID;
    const items = exploreItems || await loadExploreItems();
    const keys = String(genre || '').split(GKEY_SEP).filter(Boolean);
    const list = keys.length ? items.filter(it => it.genres.some(g => keys.includes(g))) : items;
    if (!list.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, 'このカテゴリーの写真はまだありません。');
      return;
    }
    box.innerHTML = '';
    // タップした写真から始めて、下スクロールで並び順に次の投稿が出るようリストごと渡す
    const posts = list.map(it => it.kind === 'net' ? it.p : buildOwnPost(it.ph));
    list.forEach((it, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'explore-cell';
      cell.innerHTML = '<img alt="" loading="lazy" decoding="async">';
      if (it.kind === 'mine') setThumb(cell.querySelector('img'), it.ph);
      else cell.querySelector('img').src = it.p.photoUrl;
      cell.addEventListener('click', () => showPostDetail(posts[i], { list: posts, index: i }));
      box.appendChild(cell);
    });
  }

  function renderList() {
    if (exploreMode) {
      // 同期完了などの再描画(App.refreshCurrent)で呼ばれても、開いている画面
      //（写真グリッド・ジャンル一覧）からカテゴリー一覧へ勝手に戻らないよう、
      // 今の画面をそのまま新しいデータで描き直す
      exploreItems = null; // 追加された写真を拾い直す
      if (exploreGenre) renderExploreGrid(exploreGenre.genre);
      else if (exploreSub) openExploreSub(exploreSub);
      else showExploreCats();
      return;
    }
    hideExplore();
    refreshPrefOptions();
    if (listResultMode === 'photo') { renderSearchPhotos(); return; }
    const box = $('#shop-list');
    const shops = sortShops(filteredShops());

    if (!Store.shops().length) {
      box.innerHTML = emptyBox(EMPTY_IC_FORK,
        'まだ記録がありません。<br>「＋」から料理の写真を登録してみましょう。',
        '<button class="btn primary" id="seed-btn">サンプルデータで試す</button>');
      $('#seed-btn').addEventListener('click', () => App.seedSample());
      return;
    }
    if (!shops.length) {
      box.innerHTML = emptyBox(EMPTY_IC_FORK, '条件に一致する店舗がありません。');
      return;
    }

    const groupFn = groupKeyFns($('#flt-group').value);
    box.innerHTML = '';

    if (!groupFn) {
      shops.forEach(s => box.appendChild(shopCard(s)));
    } else {
      const groups = new Map();
      for (const s of shops) {
        for (const key of groupFn(s)) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(s);
        }
      }
      [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([key, list]) => {
        const h = document.createElement('div');
        h.className = 'group-header';
        h.innerHTML = `${esc(key)} <span class="count">${list.length}件</span>`;
        box.appendChild(h);
        list.forEach(s => box.appendChild(shopCard(s)));
      });
    }
    loadThumbs(box);
  }

  // 検索結果を写真グリッドで表示（「お店/写真」切り替えで写真を選んだとき）。
  // キーワード・ジャンル・星・お気に入り・都道府県の絞り込みを写真1枚ごとに適用する
  async function renderSearchPhotos() {
    const seq = ++searchPhotoSeq;
    const box = $('#shop-list');
    box.innerHTML = `<div class="explore-grid">${SKEL_GRID}</div>`;
    const kw = $('#flt-keyword').value.trim().toLowerCase();
    const dg = $('#flt-dish-genre').value;
    const minR = +($('#flt-rating').value || 0);
    const favOnly = $('#flt-fav').checked;
    const pref = $('#flt-pref').value;
    const items = exploreItems || await loadExploreItems();
    if (seq !== searchPhotoSeq) return; // 入力が続いた場合は新しい方の描画に任せる
    const vById = new Map(Store.visits().map(v => [v.id, v]));
    const list = items.filter(it => {
      if (dg && !it.genres.includes(dg)) return false;
      if (it.kind === 'mine') {
        const shop = Store.getShop(it.ph.shopId) || {};
        const v = vById.get(it.ph.visitId) || {};
        if (favOnly && !shop.favorite) return false;
        if (pref && shop.pref !== pref) return false;
        if (minR && (v.rating || 0) < minR) return false;
        if (kw) {
          const hay = [shop.name, shop.station, shop.pref, shop.city, shop.address,
            v.comment, ...it.genres].map(x => x || '').join(' ').toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      }
      // フォロー中の人の投稿（お気に入りは自分の店だけの概念なので対象外）
      const p = it.p;
      if (favOnly) return false;
      if (pref && (p.pref || '') !== pref) return false;
      if (minR && (p.rating || 0) < minR) return false;
      if (kw) {
        const hay = [p.shopName, p.station, p.pref, p.city, p.comment, p.username,
          p.displayName, ...it.genres].map(x => x || '').join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    if (!list.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, '条件に一致する写真がありません。');
      return;
    }
    const grid = box.firstElementChild;
    grid.innerHTML = '';
    // タップした写真から始めて、下スクロールで並び順に次の投稿が出るようリストごと渡す
    const posts = list.map(it => it.kind === 'net' ? it.p : buildOwnPost(it.ph));
    list.forEach((it, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'explore-cell';
      cell.innerHTML = '<img alt="" loading="lazy" decoding="async">';
      if (it.kind === 'mine') setThumb(cell.querySelector('img'), it.ph);
      else cell.querySelector('img').src = it.p.photoUrl;
      cell.addEventListener('click', () => showPostDetail(posts[i], { list: posts, index: i }));
      grid.appendChild(cell);
    });
  }

  // 店舗一覧の1行（検索タブ・プロフィールの検索サブタブ共通）。
  // デザインカンプ準拠のカード型: 左＝代表写真、右＝店名・ジャンル・駅・★平均＋大きな数字・訪問回数
  function shopCard(s) {
    const avg = Store.avgRating(s.id);
    const genre = shopLabelGenre(s) || '';
    const div = document.createElement('div');
    div.className = 'pf-shopcard';
    div.dataset.shopOpen = s.id;
    div.innerHTML = `
      <div class="ps-thumb" data-thumb="${s.id}">🍽️</div>
      <div class="ps-main">
        <div class="ps-name">${esc(s.name)}</div>
        ${genre ? `<div class="ps-row">🍜 ${esc(genre)}</div>` : ''}
        ${(s.station || s.city) ? `<div class="ps-row">${s.station ? IC_STATION + ' ' + esc(s.station) : ''}${s.city ? (s.station ? '　' : '') + IC_PIN + ' ' + esc(s.city) : ''}</div>` : ''}
        <div class="ps-stars">${starSvg(avg, 17)}<span class="ps-avg">${avg ? fmtR(avg) : '－'}</span>${(() => {
          // フォロワーの評価があるお店は「あなた向け評価」を並べて出す（一致率で重み付け）
          const pair = ratingPair({ name: s.name, lat: s.lat, lon: s.lon });
          return pair.raters > 1 ? `<span class="ps-you">あなた向け <b>${fmtR(pair.personal)}</b></span>` : '';
        })()}</div>
        <div class="ps-meta"><span class="ps-chip">平均評価</span><span>${Store.visitCount(s.id)}回訪問</span>${(() => {
          // 星絞り込み中: 平均で超えている店は金色、1回の記録だけで超えている店は白抜きのバッジで区別
          const minR = +($('#flt-rating').value || 0);
          if (!minR) return '';
          const lbl = minR === 5 ? '★5' : `★${minR}以上`;
          if (avg >= minR) return `<span class="ps-hit ps-hit-avg">平均で${lbl}</span>`;
          const best = Math.max(0, ...Store.visitsOf(s.id).map(v => v.rating || 0));
          return best >= minR ? `<span class="ps-hit ps-hit-once">${lbl}の記録あり</span>` : '';
        })()}</div>
      </div>
      <button class="s-fav ps-favbtn ${s.favorite ? 'on' : ''}" data-fav="${s.id}" title="お気に入り" aria-label="お気に入り">${IC_HEART}</button>`;
    // 写真タップはホームの投稿と同じ表示（上下スクロールで検索結果の前後の店の投稿へ）。
    // カードの他の場所のタップは従来どおり店舗詳細（data-shopOpen の委譲）
    div.querySelector('.ps-thumb').addEventListener('click', (e) => {
      e.stopPropagation();
      openShopPostFeed(s.id, sortShops(filteredShops()));
    });
    return div;
  }

  // 店の一覧（検索結果など）から、写真がある店を投稿の形にして連続スクロールで見せる。
  // タップした店から始まり、下スクロールで一覧の並び順に次の店の投稿が出る（ホームと同じ）
  async function openShopPostFeed(shopId, shops) {
    const all = await Store.allPhotos();
    const vById = new Map(Store.visits().map(v => [v.id, v]));
    const t = (p) => {
      const v = vById.get(p.visitId);
      return (v && v.datetime) ? new Date(v.datetime).getTime() : (p.createdAt || 0);
    };
    const groups = (shops && shops.length ? shops : [Store.getShop(shopId)]).filter(Boolean)
      .map(s => ({ shopId: s.id, photos: all.filter(p => p.shopId === s.id) }))
      .filter(g => g.photos.length);
    groups.forEach(g => g.photos.sort((a, b) => t(b) - t(a) || (b.createdAt || 0) - (a.createdAt || 0)));
    const idx = groups.findIndex(g => g.shopId === shopId);
    if (idx < 0) { showShop(shopId); return; } // 写真のない店は従来の店舗詳細へ
    const posts = groups.map(g => buildOwnShopPost(g));
    showPostDetail(posts[idx], { list: posts, index: idx });
  }

  async function loadThumbs(root) {
    for (const el of root.querySelectorAll('[data-thumb]')) {
      const rep = await Store.repPhoto(el.dataset.thumb);
      if (rep) {
        el.innerHTML = `<img alt="" loading="lazy" decoding="async">`;
        setThumb(el.querySelector('img'), rep);
      }
    }
  }

  // ========== 写真ギャラリー ==========
  function initPhotos() {
    $('#ph-dish-genre').innerHTML = '<option value="">ジャンル</option>' + Api.DISH_GENRES.map(g => `<option>${g}</option>`).join('');
    $('#ph-dish-genre').addEventListener('change', renderPhotos);
  }

  const TYPE_LABEL = { dish: '料理', exterior: '外観', interior: '店内', menu: 'メニュー' };

  async function renderPhotos() {
    const box = $('#photo-grid');
    const type = ''; // 種別フィルタは廃止（すべての写真を表示）
    const dg = $('#ph-dish-genre').value;
    box.innerHTML = SKEL_GRID;
    let photos = await Store.allPhotos();
    // 味の評価が高い順。同点は 雰囲気→カジュアル度→提供の早さ の順に星の高い方を上へ
    const vById = new Map(Store.visits().map(v => [v.id, v]));
    photos.sort((a, b) => {
      const va = vById.get(a.visitId) || {}, vb = vById.get(b.visitId) || {};
      const sa = Store.getShop(a.shopId) || {}, sb = Store.getShop(b.shopId) || {};
      return (vb.rating || 0) - (va.rating || 0)
          || (sb.atmosphere || 0) - (sa.atmosphere || 0)
          || (sb.casual || 0) - (sa.casual || 0)
          || (sb.speed || 0) - (sa.speed || 0)
          || b.createdAt - a.createdAt;
    });

    const cells = [];
    for (const p of photos) {
      if (type && p.type !== type) continue;
      const visit = Store.visits().find(v => v.id === p.visitId);
      if (dg && !(visit && (visit.dishGenres || []).includes(dg))) continue;
      const shop = Store.getShop(p.shopId);
      cells.push({ p, shop, visit });
    }
    if (!cells.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, '写真がありません。',
        '<button class="btn primary empty-add">写真を登録する</button>');
      box.querySelector('.empty-add').addEventListener('click', () => Register.openCamera());
      return;
    }
    box.innerHTML = '';
    for (const { p, shop, visit } of cells) {
      // 拡大表示は店名＋日付、写真の下のキャプションは店名のみ
      const cap = `${shop ? shop.name : ''}　${visit ? fmtDate(visit.datetime) : ''}`;
      const div = document.createElement('div');
      div.className = 'photo-cell';
      div.innerHTML = `<img alt="" loading="lazy" decoding="async"><div class="cap">${esc(shop ? shop.name : '')}</div>`;
      setThumb(div.querySelector('img'), p);
      div.addEventListener('click', () => openLightbox(photoUrl(p), cap)); // 拡大表示は元画像
      box.appendChild(div);
    }
  }

  function openLightbox(url, caption) {
    $('#lightbox-img').src = url;
    $('#lightbox-caption').textContent = caption || '';
    $('#lightbox').classList.remove('hidden');
  }

  // ========== プロフィール（インスタ風・将来の共有機能の土台） ==========
  function initProfile() {
    // カウントのタップ: 画面移動（店舗）／フォロー・フォロワーは一覧を表示
    document.querySelectorAll('.pstat').forEach(b =>
      b.addEventListener('click', () => {
        if (b.dataset.goto) { App.switchTab(b.dataset.goto); return; }
        const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
        if (!me) { App.toast('ログインするとフォロー機能が使えます'); return; }
        openFollowList(me.uid, b.dataset.social, Store.getProfile().name);
      }));

    // ユーザーを探す
    $('#pf-search').addEventListener('click', () => {
      const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
      if (!me) { App.toast('ログインするとユーザーを探せます'); return; }
      openUserSearch();
    });

    // ヘッダーのお知らせ（フォロー通知）
    $('#notif-btn').addEventListener('click', () => openNotifications());

    // プロフィール写真の変更（端末から選択 → 小さく圧縮して保存）
    $('#pf-avatar-btn').addEventListener('click', () => $('#pf-avatar-input').click());
    $('#pf-avatar-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const blob = await Api.compressImage(file, 256, 0.85); // アイコン用に小さく
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result); r.onerror = () => rej(r.error);
          r.readAsDataURL(blob);
        });
        Store.setProfile({ avatar: dataUrl });
        renderProfile();
        App.toast('✅ プロフィール写真を変更しました');
      } catch { App.toast('⚠️ 写真の設定に失敗しました'); }
      e.target.value = '';
    });

    // クラウド同期（Googleログイン）
    if (typeof Cloud !== 'undefined' && Cloud.isSupported()) {
      // 設定は行リスト型なので、文字は行内の .set-label を書き換える
      const loginLabel = () => $('#pf-login').querySelector('.set-label') || $('#pf-login');
      $('#pf-login').addEventListener('click', async () => {
        loginLabel().textContent = 'ログイン中…';
        try { await Cloud.login(); }
        catch (e) {
          loginLabel().textContent = 'Googleでログインして同期';
          App.toast('⚠️ ログインに失敗しました: ' + (e && e.message || e));
        }
      });
      $('#pf-logout').addEventListener('click', () => Cloud.logout());
      // 写真の強制再同期（Storageルール修正後の穴埋め・別端末への取り込み）
      $('#pf-resync').addEventListener('click', async () => {
        const btn = $('#pf-resync');
        const lab = btn.querySelector('.set-label') || btn;
        btn.disabled = true; lab.textContent = '再同期中…';
        try {
          const r = await Cloud.resyncPhotos(({ phase, i, total }) => {
            const label = phase === 'upload' ? '↑' : '↓';
            lab.textContent = `${label}${i}/${total}…`;
          });
          const detail = r.fail ? `／失敗${r.fail}${r.error ? '（' + r.error + '）' : ''}` : '';
          App.toast(`写真同期: ↑${r.up} ↓${r.down} ${detail}`);
          // Storageルールで拒否されている場合は、アプリ側では直せないため対処法を案内する
          if (r.error && String(r.error).includes('unauthorized')) {
            setTimeout(() => App.toast(
              'Firebase側で写真の保存が拒否されています。Firebaseコンソール → Storage → ルール を「本人のみ読み書き可」に修正してください（READMEに設定例あり）', 9000), 400);
          }
        } catch (e) { App.toast('⚠️ ' + (e && e.message || e)); }
        btn.disabled = false; lab.textContent = '写真を再同期';
      });
      // 同期状態の表示更新
      const SYNC_MSG = { loading: 'ログイン中…', syncing: '同期中…', synced: '✅ 同期済み', error: '⚠️ 同期エラー' };
      Cloud.onStatus((state, u, detail) => {
        const inNow = !!u;
        $('#pf-login').classList.toggle('hidden', inNow);
        $('#pf-account-in').classList.toggle('hidden', !inNow);
        if (inNow) {
          let msg = SYNC_MSG[state] || '';
          if (state === 'error' && detail) {
            const code = detail.code || detail.message || String(detail);
            // 原因の切り分け用にエラーコードを表示。権限エラーはルール未設定の案内を出す
            msg += /permission|denied/i.test(code)
              ? '（アクセス権の設定が必要です: Firebaseのルール設定を確認）'
              : `（${String(code).slice(0, 60)}）`;
          }
          $('#pf-sync').textContent = msg;
        }
        if (state === 'synced') { renderProfile(); refreshNotifBadge(); } // 復元されたデータ・通知を反映
        if (state === 'signedout') { const bd = $('#notif-badge'); if (bd) bd.classList.add('hidden'); }
      });
    } else {
      const l0 = $('#pf-login').querySelector('.set-label') || $('#pf-login');
      l0.textContent = 'この端末では同期を利用できません';
      $('#pf-login').disabled = true;
    }

    $('#pf-share').addEventListener('click', () => openShareProfile());
    // 設定内の行: プロフィール行→マイページへ、共有→共有シート
    const hideSettings = () => { const m = $('#settings-modal'); if (m) m.classList.add('hidden'); };
    const setProf = $('#set-profile');
    if (setProf) setProf.addEventListener('click', () => { hideSettings(); App.switchTab('profile'); });
    const setShare = $('#set-share');
    if (setShare) setShare.addEventListener('click', () => { hideSettings(); openShareProfile(); });
    $('#pf-edit').addEventListener('click', () => {
      const p = Store.getProfile();
      $('#pf-name-input').value = p.name;
      $('#pf-bio-input').value = p.bio;
      $('#pf-edit-form').classList.toggle('hidden');
    });
    $('#pf-save').addEventListener('click', () => {
      Store.setProfile({
        name: $('#pf-name-input').value.trim() || 'BITEMAP',
        bio: $('#pf-bio-input').value.trim(),
      });
      $('#pf-edit-form').classList.add('hidden');
      renderProfile();
      App.toast('✅ プロフィールを保存しました');
    });
    // 一覧の詳細検索から地図を開けるように
    $('#list-open-map').addEventListener('click', () => App.switchTab('map'));

    // プロフィール内の 写真 / 統計 タブ切り替え（ヘッダーは常に表示）
    document.querySelectorAll('#profile-subtabs .psub').forEach(b =>
      b.addEventListener('click', () => showProfileTab(b.dataset.ptab)));
  }

  function showProfileTab(name) {
    document.querySelectorAll('#profile-subtabs .psub').forEach(b => b.classList.toggle('active', b.dataset.ptab === name));
    $('#ptab-photos').classList.toggle('hidden', name !== 'photos');
    $('#ptab-shops').classList.toggle('hidden', name !== 'shops');
    $('#ptab-stats').classList.toggle('hidden', name !== 'stats');
    if (name === 'stats') {
      // グラフは表示中のcanvasでないと大きさが0になるため、表示時に描画する
      renderStats();
    } else if (name === 'shops') {
      // 検索タブの検索バー・絞り込み・店舗リストをこのパネルへ移動して表示
      // （DOMごと移動するので機能は検索タブと完全に同じ。検索タブへ戻ると元の位置に戻る）
      const panel = $('#ptab-shops');
      panel.appendChild($('#list-filters-card'));
      panel.appendChild($('#shop-list'));
      exploreMode = false;
      $('#shop-list').classList.remove('hidden');
      $('#list-back').classList.add('hidden'); // プロフィール内では戻る矢印は不要
      // 検索タブと同じ「お店/写真」の切り替えをここでも使えるようにする（開くたびに「お店」から）
      listResultMode = 'shop';
      document.querySelectorAll('#list-mode-segs .vl-seg').forEach(x => x.classList.toggle('on', x.dataset.m === 'shop'));
      $('#list-mode-segs').classList.remove('hidden');
      renderList();
    } else {
      renderProfilePhotos();
    }
  }

  // プロフィールの写真グリッド（全写真・撮影日の新しい順・タップで拡大）
  async function renderProfilePhotos() {
    const box = $('#pf-photo-grid');
    box.className = 'photo-grid'; // 骨組み・空表示はグリッド、カード一覧のときだけ切り替える
    box.innerHTML = SKEL_GRID;
    const photos = await Store.allPhotos();
    // 撮影日（訪問日）の新しい順。日付が無ければ登録順で補完
    const vById = new Map(Store.visits().map(v => [v.id, v]));
    const shotTime = (p) => {
      const v = vById.get(p.visitId);
      const t = v && v.datetime ? new Date(v.datetime).getTime() : 0;
      return t || p.createdAt || 0;
    };
    if (!photos.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, 'まだ写真がありません。<br>最初の一皿を記録してみましょう。',
        '<button class="btn primary empty-add">写真を登録する</button>');
      box.querySelector('.empty-add').addEventListener('click', () => Register.openCamera());
      return;
    }
    // 同じ店舗の写真（複数訪問・複数枚）を1つのグループにまとめる
    const byShop = new Map();
    for (const ph of photos) {
      const g = byShop.get(ph.shopId) || { shopId: ph.shopId, photos: [] };
      g.photos.push(ph);
      byShop.set(ph.shopId, g);
    }
    // グループ内は新しい写真順。グループ自体も最新写真の新しい順
    const groups = [...byShop.values()].map(g => {
      g.photos.sort((a, b) => shotTime(b) - shotTime(a) || b.createdAt - a.createdAt);
      g.time = shotTime(g.photos[0]);
      return g;
    }).sort((a, b) => b.time - a.time);
    // 最初の画面はお店ごとの写真カード一覧: 写真に★平均バッジ（左上）と
    // ×訪問回数（右下）、下に店名・駅・ジャンル＋カテゴリ色の点。
    // カードをタップすると、その店舗から始まる連続スクロールのフィード画面が開く
    box.className = 'pf-photocards';
    box.innerHTML = '';
    groups.forEach((g, idx) => {
      const shop = Store.getShop(g.shopId) || {};
      const avg = Store.avgRating(g.shopId);
      const visits = Store.visitCount(g.shopId);
      const genre = shopLabelGenre(shop) || '';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ppc';
      card.innerHTML = `
        <span class="ppc-ph">
          <img alt="" loading="lazy" decoding="async">
          ${avg ? `<span class="ppc-badge">★${fmtR(avg)}</span>` : ''}
          ${visits > 1 ? `<span class="ppc-count">×${visits}</span>` : ''}
        </span>
        <span class="ppc-info">
          <span class="ppc-name">${esc(shop.name || '')}</span>
          ${shop.station ? `<span class="ppc-sub">${esc(shop.station)}</span>` : ''}
          ${genre ? `<span class="ppc-genre">${esc(genre)}<span class="ppc-dot" style="background:${catColorForGenre(genre)}"></span></span>` : ''}
        </span>`;
      setThumb(card.querySelector('img'), g.photos[0]); // 代表＝最新の写真
      card.addEventListener('click', () => showShopFeed(groups, idx));
      box.appendChild(card);
    });
  }

  // 「上への継ぎ足し」や「写真の非同期読み込み」で前方の内容が伸び縮みしても、
  // いま見ている投稿が画面から動かないようにする仕組み。
  // 基準となるセクション要素とその画面内位置(rel)を覚えておき、レイアウトが
  // 変わるたびに scrollTop を合わせ直す。挿入時に高さぶんを足すだけの方式だと、
  // 写真が未読込で内容が画面より短い間は scrollTop が端で切り詰められ、
  // 「タップした投稿より前の写真」が表示されてしまう
  function makeScrollAnchor(scroller, getSections) {
    let el = null, rel = 0, lastWrite = 0;
    const fix = () => {
      if (!el || !el.isConnected) return;
      const d = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - rel;
      if (Math.abs(d) < 0.5) return;
      lastWrite = performance.now();
      scroller.scrollTop += d;
    };
    // 利用者が自分でスクロールしたら、一番上に見えているセクションを新しい基準にする
    scroller.addEventListener('scroll', () => {
      if (performance.now() - lastWrite < 120) return; // 直前の自動補正によるスクロールは無視
      const top = scroller.getBoundingClientRect().top;
      for (const sec of getSections()) {
        const r = sec.getBoundingClientRect();
        if (r.bottom > top + 1) { el = sec; rel = r.top - top; break; }
      }
    }, { passive: true });
    return {
      set(newEl, newRel) { el = newEl; rel = newRel || 0; },
      fix,
      // セクションの高さ変化（写真読み込みなど）に追従して合わせ直す
      watch(sec) { const ro = new ResizeObserver(fix); ro.observe(sec); return ro; },
    };
  }

  // 写真タップ後の画面（デザイン案準拠）: 店舗ごとのセクションを縦に並べ、
  // ページ内スクロールで前後の店舗へ途切れず送れる。タップした店舗から表示を始め、
  // 下へスクロールすると次の店舗、上へスクロールすると前の店舗が現れる。
  // 一度に全件は作らず、スクロールが近づいた側に数件ずつ継ぎ足す
  function showShopFeed(groups, startIndex) {
    const ov = document.createElement('div');
    ov.className = 'modal modal-full visitlist-modal shopfeed-modal';
    ov.innerHTML = `<div class="modal-box">
        <div class="vl-topbar">
          <button type="button" class="modal-close sfm-close" aria-label="閉じる">✕</button>
          <span class="vl-title">お店の記録</span>
        </div>
        <div class="vl-body"><div class="pf-shopfeed"></div></div>
      </div>`;
    const scroller = ov.querySelector('.vl-body');
    const box = ov.querySelector('.pf-shopfeed');
    const ros = []; // セクションの高さ変化の監視（閉じるときに解除）
    const anchorCtl = makeScrollAnchor(scroller, () => box.querySelectorAll('.sfs'));
    ov.querySelector('.sfm-close').addEventListener('click', () => { ros.forEach(r => r.disconnect()); ov.remove(); });

    const CHUNK = 3;
    let below = startIndex; // 次に下へ足す添字
    let above = startIndex; // ここより手前(above-1以前)を上へ足す
    const topSentinel = document.createElement('div');
    const botSentinel = document.createElement('div');
    box.appendChild(topSentinel);
    box.appendChild(botSentinel);
    const appendChunk = () => {
      for (let n = 0; n < CHUNK && below < groups.length; n++, below++) {
        const sec = buildShopFeedSection(groups[below]);
        box.insertBefore(sec, botSentinel);
        if (below === startIndex) anchorCtl.set(sec, 0); // タップした店舗を画面最上部に固定
        ros.push(anchorCtl.watch(sec));
      }
    };
    const prependChunk = () => {
      // 上に足すと中身が押し下がるので、基準の店舗が動かないよう位置を合わせ直す
      const frag = document.createDocumentFragment();
      const from = Math.max(0, above - CHUNK);
      const added = [];
      for (let i = from; i < above; i++) { const sec = buildShopFeedSection(groups[i]); added.push(sec); frag.appendChild(sec); }
      above = from;
      topSentinel.after(frag);
      anchorCtl.fix();
      added.forEach(sec => ros.push(anchorCtl.watch(sec)));
    };
    const ioBot = new IntersectionObserver((es) => {
      if (es.some(en => en.isIntersecting)) {
        appendChunk();
        ioBot.unobserve(botSentinel); ioBot.observe(botSentinel); // 交差したままでも連続で継ぎ足す
        if (below >= groups.length) ioBot.disconnect();
      }
    }, { root: scroller, rootMargin: '1200px 0px' });
    const ioTop = new IntersectionObserver((es) => {
      if (es.some(en => en.isIntersecting)) {
        prependChunk();
        ioTop.unobserve(topSentinel); ioTop.observe(topSentinel);
        if (above <= 0) ioTop.disconnect();
      }
    }, { root: scroller, rootMargin: '600px 0px' });

    appendChunk();
    document.body.appendChild(ov);
    ioBot.observe(botSentinel);
    if (above > 0) ioTop.observe(topSentinel);
  }

  // 店舗セクション1つぶん（デザイン案準拠）:
  //  店名・ジャンル・駅（右上に♥） / 大きな代表写真＋N回訪問 /
  //  ★平均＋最終訪問日 / 訪問履歴サムネイル＋すべての訪問履歴 /
  //  地図で見る・ここへ行く・⋯
  function buildShopFeedSection(g) {
    const s = Store.getShop(g.shopId) || {};
    const avg = Store.avgRating(g.shopId);
    const vs = Store.visitsOf(g.shopId);
    const genre = shopLabelGenre(s) || '';
    const last = Store.lastVisitDate(g.shopId);
    const hasPos = s.lat != null && s.lon != null;
    const el = document.createElement('div');
    el.className = 'sfs';
    el.innerHTML = `
      <div class="sfs-head">
        <div class="sfs-titles">
          <div class="sfs-name">${esc(s.name || '')}</div>
          ${genre ? `<div class="sfs-sub">🍜 ${esc(genre)}</div>` : ''}
          ${s.station ? `<div class="sfs-sub">${IC_PIN} ${esc(s.station)}</div>` : ''}
        </div>
        <button type="button" class="s-fav ps-favbtn sfs-fav ${s.favorite ? 'on' : ''}" data-fav="${esc(s.id)}"
          title="お気に入り" aria-label="お気に入り">${IC_HEART}</button>
      </div>
      <div class="sfs-photos">
        <div class="sfs-carousel"></div>
        <span class="sfs-count">${vs.length}回訪問</span>
      </div>
      <div class="sfs-starrow">${starSvg(avg, 18)}<span class="sfs-avg">${avg ? fmtR(avg) : '－'}</span>
        ${last ? `<span class="sfs-last">最終訪問: ${fmtDate(last)}</span>` : ''}</div>
      <div class="sfs-visits"></div>
      <div class="sfs-actions">
        ${hasPos ? `
        <button type="button" class="btn sfs-map"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/></svg> 地図で見る</button>
        <button type="button" class="btn primary sfs-nav">${IC_NAV} ここへ行く</button>` : ''}
        <button type="button" class="pd-menu-btn sfs-menu" title="メニュー" aria-label="メニュー">${IC_MORE}</button>
      </div>`;
    // 大きな写真はその店の全写真を左右スワイプで見られるカルーセル（新しい順）。
    // 全幅表示なのでサムネではなくフル解像度で（サムネ→即差し替え）。ただし全枚数を
    // いきなりフルで読むと重いので、フル化は先頭と「スワイプで近づいた写真」だけ
    const vByIdSec = new Map(vs.map(v => [v.id, v]));
    const car = el.querySelector('.sfs-carousel');
    // 同じ訪問の写真をまとめる（写真は訪問日順に並んでいるので同じ訪問は連続する）。
    // 各写真に「7/3の訪問・2/3枚」のラベルを重ね、1回の訪問に複数枚あることを分かるようにする
    const byVisit = new Map();
    g.photos.forEach(ph => {
      const a = byVisit.get(ph.visitId) || [];
      a.push(ph);
      byVisit.set(ph.visitId, a);
    });
    const slides = g.photos.map((ph, i) => {
      const vv = vByIdSec.get(ph.visitId) || {};
      const r = vv.rating || 0;
      const grp = byVisit.get(ph.visitId) || [];
      const k = grp.indexOf(ph) + 1;
      const label = vv.datetime
        ? `${fmtDate(vv.datetime)}の訪問${grp.length > 1 ? `・${k}/${grp.length}枚` : ''}`
        : (grp.length > 1 ? `${k}/${grp.length}枚` : '');
      const slide = document.createElement('button');
      slide.type = 'button';
      slide.className = 'sfs-slide';
      slide.setAttribute('aria-label', '店舗詳細を開く');
      slide.innerHTML = `<img alt="" loading="lazy" decoding="async">${r ? `<span class="pd-photo-star">★${fmtR(r)}</span>` : ''}${label ? `<span class="sfs-visitlabel">${esc(label)}</span>` : ''}`;
      if (i === 0) { setFullPhoto(slide.querySelector('img'), ph); slide.dataset.full = '1'; }
      else setThumb(slide.querySelector('img'), ph);
      slide.addEventListener('click', () => showShop(g.shopId));
      car.appendChild(slide);
      return slide;
    });
    const upgrade = (i) => {
      const s = slides[i];
      if (!s || s.dataset.full) return;
      s.dataset.full = '1';
      setFullPhoto(s.querySelector('img'), g.photos[i]);
    };
    if (g.photos.length > 1) {
      // 何枚目かを示すドット。訪問ごとに小さな隙間で区切り、
      // 「どこからどこまでが同じ訪問か」を点の並びでも分かるようにする
      const dots = document.createElement('div');
      dots.className = 'pd-dots';
      let dotsHtml = '';
      let lastVid = null;
      g.photos.forEach((p2, i) => {
        if (i && p2.visitId !== lastVid) dotsHtml += '<span class="pd-gap"></span>';
        lastVid = p2.visitId;
        dotsHtml += `<span class="pd-dot${i === 0 ? ' on' : ''}"></span>`;
      });
      dots.innerHTML = dotsHtml;
      el.querySelector('.sfs-photos').after(dots);
      const dotEls = [...dots.querySelectorAll('.pd-dot')];
      car.addEventListener('scroll', () => {
        const i = Math.round(car.scrollLeft / car.clientWidth);
        dotEls.forEach((d, j) => d.classList.toggle('on', j === i));
        upgrade(i); upgrade(i + 1);
      }, { passive: true });
    }
    // 訪問履歴: 訪問ごとの代表写真（★バッジ＋日付）。最後に「すべての訪問履歴」
    const row = el.querySelector('.sfs-visits');
    const withPhoto = vs.map(v => ({ v, ph: g.photos.find(p => p.visitId === v.id) }))
      .filter(x => x.ph).slice(0, 6);
    withPhoto.forEach(({ v, ph }) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'dvt';
      t.innerHTML = `
        <span class="dvt-ph"><img alt="" loading="lazy" decoding="async">
          ${v.rating ? `<span class="pd-photo-star">★${fmtR(v.rating)}</span>` : ''}</span>
        <span class="dvt-date">${new Date(v.datetime).toLocaleDateString('ja-JP')}</span>
        <span class="dvt-stars">${starSvg(v.rating, 11)}</span>`;
      setThumb(t.querySelector('img'), ph);
      t.addEventListener('click', () => showVisitList(g.shopId));
      row.appendChild(t);
    });
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'dvt-all';
    allBtn.innerHTML = 'すべての<br>訪問履歴 ›';
    allBtn.addEventListener('click', () => showVisitList(g.shopId));
    row.appendChild(allBtn);
    // 操作
    const mapBtn = el.querySelector('.sfs-map');
    if (mapBtn) mapBtn.addEventListener('click', () => focusMapAt(s.lat, s.lon));
    const navBtn = el.querySelector('.sfs-nav');
    if (navBtn) navBtn.addEventListener('click', () => openNav(s));
    el.querySelector('.sfs-menu').addEventListener('click', () => {
      const latest = vs[0];
      openActionSheet([
        { label: '店舗の詳細を見る', onClick: () => showShop(g.shopId) },
        ...(latest ? [{ label: '最新の記録を編集', onClick: () => showShop(g.shopId, false, latest.id) }] : []),
      ]);
    });
    return el;
  }

  // 同じ店舗の写真グループ → 1つの投稿オブジェクトにまとめる。
  // 主評価はその店の平均、各写真にはその訪問の評価(photoItems)を添える
  function buildOwnShopPost(g) {
    const shop = Store.getShop(g.shopId) || {};
    const prof = Store.getProfile();
    const vById = new Map(Store.visitsOf(g.shopId).map(v => [v.id, v]));
    const repVisit = vById.get(g.photos[0].visitId) || {};
    const photoItems = g.photos.map(ph => ({ ph, rating: (vById.get(ph.visitId) || {}).rating || 0 }));
    // グループ内の各写真の訪問から料理ジャンルを集める（重複は除く）。
    // 例: 1枚目がラーメン・2枚目がつけ麺 → 「ラーメン・つけ麺」の2種類を表示
    const genres = [];
    for (const ph of g.photos) {
      for (const gn of ((vById.get(ph.visitId) || {}).dishGenres || [])) {
        if (gn && !genres.includes(gn)) genres.push(gn);
      }
    }
    return {
      id: repVisit.id || g.photos[0].visitId, username: prof.username || '', displayName: prof.name || 'BITEMAP',
      avatar: prof.avatar || '', photoUrl: photoUrl(g.photos[0]),
      rating: Store.avgRating(g.shopId), // 主評価＝店の平均
      shopName: shop.name || '', genre: genres.join('・'),
      comment: repVisit.comment || '', datetime: repVisit.datetime || '',
      lat: shop.lat, lon: shop.lon, address: shop.address || '',
      pref: shop.pref || '', city: shop.city || '', station: shop.station || '',
      casual: shop.casual, atmosphere: shop.atmosphere, speed: shop.speed,
      photoItems, // グループの各写真＋その訪問の評価（カルーセル用）
    };
  }

  async function renderProfile() {
    const p = Store.getProfile();
    $('#pf-name').textContent = p.name;
    // @ユーザー名（設定済みなら表示）
    $('#pf-username').textContent = p.username ? '@' + p.username : '';
    $('#pf-username').classList.toggle('hidden', !p.username);
    $('#pf-bio').textContent = p.bio;
    $('#pf-bio').classList.toggle('hidden', !p.bio);
    // プロフィール写真（未設定なら🍜）
    const av = $('#pf-avatar');
    if (p.avatar) av.innerHTML = `<img src="${esc(p.avatar)}" alt="">`;
    else av.textContent = '🍜';
    $('#pf-shops').textContent = Store.shops().length;
    // フォロー/フォロワー数（ログイン中はクラウドから実数を取得）
    $('#pf-following').textContent = p.following || 0;
    $('#pf-followers').textContent = p.followers || 0;
    const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
    if (me) {
      Cloud.followCounts(me.uid).then(c => {
        $('#pf-following').textContent = c.following;
        $('#pf-followers').textContent = c.followers;
      }).catch(() => {});
    }
    // プロフィールを開いたときは「写真」を表示（要望）。統計は統計タブで表示
    showProfileTab('photos');
  }

  // ========== 統計・ランキング ==========
  const charts = {};
  function chart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), cfg);
  }
  // Instagram風パレット（CSSのアクセントと統一）
  const PALETTE = ['#C6613F', '#D97757', '#8B6FA8', '#5B84A8', '#D9B36B', '#B04A3D', '#96658F', '#A56A32', '#B65C77', '#4E8E7F', '#E0C98F', '#C9705E', '#7C8F3F', '#A6A49B', '#6E8B54'];

  // 味覚が近いユーザー TOP5 と、自分の味覚の傾向（統計タブ）
  function renderTasteSections() {
    const rankBox = $('#taste-rank');
    const traitBox = $('#taste-traits');
    if (!rankBox || !traitBox) return;
    // --- 味覚が近いユーザー TOP5 ---
    loadCachedNetwork(); // 未読込なら前回の控えから
    const profs = new Map(networkPosts.map(p => [p.username, p]));
    const ranked = [...tasteData().entries()]
      .filter(([, m]) => m.rate != null && m.conf !== 'low') // 共通5件未満は信頼できないため載せない
      .sort((a, b) => b[1].rate - a[1].rate)
      .slice(0, 5);
    if (!ranked.length) {
      rankBox.classList.add('hidden');
    } else {
      rankBox.classList.remove('hidden');
      rankBox.innerHTML = '<h2>味覚が近いユーザー TOP5</h2>' + ranked.map(([name, m], i) => {
        const p = profs.get(name) || {};
        const av = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '🍜';
        return `<button type="button" class="tr-row" data-user="${esc(name)}">
          <span class="tr-rank">${i + 1}位</span>
          <span class="tr-avatar">${av}</span>
          <span class="tr-names"><b>${esc(p.displayName || name)}さん</b><span>共通店舗 ${m.common}件</span></span>
          <span class="tr-rate">${m.rate}%</span>
        </button>`;
      }).join('');
      rankBox.querySelectorAll('.tr-row').forEach(b =>
        b.addEventListener('click', () => showPublicProfile(b.dataset.user)));
    }
    // --- あなたの味覚の特徴（カテゴリーごとの評価の偏り） ---
    const visits = Store.visits().filter(v => v.rating);
    const all = visits.length ? visits.reduce((s, v) => s + v.rating, 0) / visits.length : 0;
    const lines = [];
    if (visits.length >= 5) {
      for (const c of Api.DISH_CATEGORIES) {
        const rs = visits.filter(v => (v.dishGenres || []).some(g => c.genres.includes(g))).map(v => v.rating);
        if (rs.length < 3) continue; // 数件では傾向と言えない
        const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
        if (avg <= all - 0.4) lines.push(`${c.name}は評価が厳しめです`);
        else if (avg >= all + 0.4) lines.push(`${c.name}は高評価をつける傾向があります`);
      }
    }
    if (!lines.length) {
      traitBox.classList.add('hidden');
    } else {
      traitBox.classList.remove('hidden');
      traitBox.innerHTML = '<h2>あなたの味覚の傾向</h2><div class="trait-box">' +
        lines.slice(0, 4).map(l => `・${esc(l)}`).join('<br>') + '</div>';
    }
  }

  async function renderStats() {
    renderTasteSections();
    const shops = Store.shops();
    const visits = Store.visits();
    const photos = await Store.allPhotos();
    const now0 = new Date();
    const year = now0.getFullYear();
    const yearVisits = visits.filter(v => new Date(v.datetime).getFullYear() === year).length;
    const monthVisits = visits.filter(v => {
      const d = new Date(v.datetime);
      return d.getFullYear() === year && d.getMonth() === now0.getMonth();
    }).length;
    const prefCount = new Set(shops.map(s => s.pref).filter(Boolean)).size;
    const allAvg = visits.length ? Math.round(visits.reduce((s, v) => s + v.rating, 0) / visits.length * 10) / 10 : 0;

    // 「1年前の今日ごろ」の振り返り（同じ月日±3日の過去の訪問）
    const memBox = $('#stat-memory');
    const past = visits.filter(v => {
      const d = new Date(v.datetime);
      if (d.getFullYear() >= year) return false;
      const thisYear = new Date(year, d.getMonth(), d.getDate());
      return Math.abs(thisYear - new Date(year, now0.getMonth(), now0.getDate())) <= 3 * 86400000;
    }).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    if (past.length) {
      const v = past[0];
      const s = Store.getShop(v.shopId);
      const yearsAgo = year - new Date(v.datetime).getFullYear();
      memBox.innerHTML = `<span class="sm-ic">🕰</span> ${yearsAgo}年前の今ごろ、<b>${esc(s ? s.name : '')}</b> に行きました（${starSvg(v.rating || 0, 12)}）`;
      memBox.classList.remove('hidden');
    } else {
      memBox.classList.add('hidden');
    }

    $('#stat-cards').innerHTML = [
      [shops.length, '総店舗数'],
      [visits.length, '総訪問回数'],
      [photos.length, '保存写真枚数'],
      [allAvg || '－', '味の平均'],
      [yearVisits, `${year}年の訪問`],
      [monthVisits, '今月の訪問'],
      [shops.filter(s => s.favorite).length, 'お気に入り'],
      [Store.wishes().length, '行きたい店'],
      [prefCount, '訪れた都道府県'],
    ].map(([v, l]) => `<div class="stat-card"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

    // 月別訪問。最初の記録の月から今月までを全部並べ、横スクロールで見られるようにする
    // （画面に収まらないので、幅は月数ぶん確保して .chart-scroll でスクロールさせる）
    const now = new Date();
    const monthCount = new Map(); // 'YYYY/M' → 件数
    for (const v of visits) {
      const d = new Date(v.datetime);
      if (isNaN(d)) continue;
      const k = `${d.getFullYear()}/${d.getMonth() + 1}`;
      monthCount.set(k, (monthCount.get(k) || 0) + 1);
    }
    let start = new Date(now.getFullYear(), now.getMonth() - 11, 1); // 記録が少なくても直近12ヶ月は出す
    const times = visits.map(v => new Date(v.datetime).getTime()).filter(t => t && !isNaN(t));
    if (times.length) {
      const f = new Date(Math.min(...times));
      const firstMonth = new Date(f.getFullYear(), f.getMonth(), 1);
      if (firstMonth < start) start = firstMonth;
    }
    let span = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
    if (span > 120) { span = 120; start = new Date(now.getFullYear(), now.getMonth() - 119, 1); } // 上限10年
    const months = [], counts = [];
    for (let i = 0; i < span; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
      months.push(key);
      counts.push(monthCount.get(key) || 0);
    }
    // 1ヶ月あたりの幅を確保（画面より狭くならないよう最低は画面幅）
    const wide = document.querySelector('.chart-wide');
    const scroller = document.querySelector('.chart-scroll');
    if (wide && scroller) wide.style.width = Math.max(scroller.clientWidth, months.length * 46) + 'px';
    const hint = document.querySelector('.chart-hint');
    if (hint) hint.classList.toggle('hidden', months.length <= 12);
    chart('chart-monthly', {
      type: 'bar',
      data: { labels: months, datasets: [{ label: '訪問件数', data: counts, backgroundColor: '#C6613F', borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { ticks: { autoSkip: false, maxRotation: 60, minRotation: 60, font: { size: 10 } } } },
      },
    });
    // 最新の月が見えるよう右端から表示する（グラフの描画完了後にもう一度合わせる）
    if (scroller) {
      const toEnd = () => { scroller.scrollLeft = scroller.scrollWidth; };
      requestAnimationFrame(toEnd);
      setTimeout(toEnd, 300);
    }

    // 味の評価（★1〜5）の割合。★1から右回り（時計回り）に★5まで並べる。
    // 色は星の値ごとに固定（★5→★1で濃い順）
    const RATING_COLORS = ['#C6613F', '#D97757', '#D9A23C', '#6E8B54', '#A6A49B'];
    const ratingEntries = [1, 2, 3, 4, 5]
      .map(r => [r, visits.filter(v => Math.round(v.rating || 0) === r).length])
      .filter(e => e[1] > 0);
    const rTotal = ratingEntries.reduce((a, e) => a + e[1], 0);
    chart('chart-rating', {
      type: 'doughnut',
      data: {
        labels: ratingEntries.map(e => '★'.repeat(e[0]) + `（${e[1]}件 ${rTotal ? Math.round(e[1] / rTotal * 100) : 0}%）`),
        datasets: [{ data: ratingEntries.map(e => e[1]),
          backgroundColor: ratingEntries.map(e => RATING_COLORS[5 - e[0]]) }],
      },
      options: {
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => {
            const total = c.dataset.data.reduce((a, b) => a + b, 0);
            return `${c.raw}件（${total ? Math.round(c.raw / total * 100) : 0}%）`;
          } } },
        },
      },
    });

    // ジャンル割合
    const tally = (arr) => {
      const m = new Map();
      arr.forEach(k => { if (k) m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const doughnut = (id, entries) => {
      const total = entries.reduce((a, e) => a + e[1], 0);
      return chart(id, {
        type: 'doughnut',
        data: { labels: entries.map(e => `${e[0]} ${total ? Math.round(e[1] / total * 100) : 0}%`),
          datasets: [{ data: entries.map(e => e[1]), backgroundColor: PALETTE }] },
        options: { plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.raw}件（${total ? Math.round(c.raw / total * 100) : 0}%）` } },
        } },
      });
    };
    // 料理ジャンルを大きなくくり（麺類・和食…）へ畳み込んで集計する。
    // 1回の訪問で同じくくりに複数該当（ラーメン＋つけ麺など）しても1件として数える。
    const catOfGenre = new Map();
    Api.DISH_CATEGORIES.forEach(c => (c.genres || []).forEach(g => catOfGenre.set(g, c.name)));
    const catTally = () => {
      const m = new Map();
      visits.forEach(v => {
        const cats = new Set();
        (v.dishGenres || []).forEach(g => { if (g) cats.add(catOfGenre.get(g) || 'その他'); });
        cats.forEach(c => m.set(c, (m.get(c) || 0) + 1));
      });
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    doughnut('chart-dish-genre', catTally());

    // 都道府県別
    const prefEntries = tally(shops.map(s => (s.country && s.country !== '日本') ? s.country : s.pref));
    chart('chart-pref', {
      type: 'bar',
      data: { labels: prefEntries.map(e => e[0]), datasets: [{ label: '店舗数', data: prefEntries.map(e => e[1]), backgroundColor: '#D97757', borderRadius: 6 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    });

    // ランキング（§11）
    const rank = (el, entries, fmt) => {
      $(el).innerHTML = entries.slice(0, 5).map(e => `<li>${fmt(e)}</li>`).join('') || '<li>データなし</li>';
    };
    rank('#rank-rating',
      shops.filter(s => Store.avgRating(s.id) > 0).sort((a, b) => Store.avgRating(b.id) - Store.avgRating(a.id)),
      s => `${esc(s.name)} <span class="rv">★${fmtR(Store.avgRating(s.id))}</span>`);
    rank('#rank-visits',
      shops.slice().sort((a, b) => Store.visitCount(b.id) - Store.visitCount(a.id)),
      s => `${esc(s.name)} <span class="rv">${Store.visitCount(s.id)}回</span>`);
    const visitTallyByShopField = (field) => {
      const m = new Map();
      visits.forEach(v => {
        const s = Store.getShop(v.shopId);
        const k = s && s[field];
        if (k) m.set(k, (m.get(k) || 0) + 1);
      });
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    rank('#rank-station', visitTallyByShopField('station'), e => `${esc(e[0])} <span class="rv">${e[1]}回</span>`);
    rank('#rank-city', visitTallyByShopField('city'), e => `${esc(e[0])} <span class="rv">${e[1]}回</span>`);
    rank('#rank-dish', tally(visits.flatMap(v => v.dishGenres || [])), e => `${esc(e[0])} <span class="rv">${e[1]}回</span>`);
  }

  // ========== 店舗詳細モーダル ==========
  // 編集モードの料理ジャンル選択状態（vid → Set）
  let editGenreSets = new Map();

  // 店舗詳細の上下スクロールでの店舗送り: 最下部でさらに下へスワイプ→次の店舗、
  // 最上部で下へ引っ張る→前の店舗（プロフィールの写真カードの並び順）
  let shopNavState = null, shopNavBound = false;
  function bindShopNavOnce() {
    if (shopNavBound) return;
    shopNavBound = true;
    const modal = $('#modal');
    const go = (dir) => {
      const { list, index } = shopNavState;
      const ni = index + dir;
      if (ni < 0 || ni >= list.length) return false;
      showShop(list[ni], false, null, { list, index: ni });
      modal.scrollTop = 0;
      return true;
    };
    // スマホ: 「端に張り付いた状態で、さらに動かした量」だけを差分で積算して判定する。
    // 指を置いた時点からの累計にすると、勢いよく端まで届いた瞬間に発火して
    // 普通のスクロールが途切れてしまう。端以外での動きが混ざったら積算はリセット
    let lastY = null, swipeAcc = 0, fired = false;
    modal.addEventListener('touchstart', (e) => { lastY = e.touches[0].clientY; swipeAcc = 0; fired = false; }, { passive: true });
    modal.addEventListener('touchmove', (e) => {
      if (!shopNavState || lastY == null) return;
      const y = e.touches[0].clientY;
      const dy = lastY - y; // 正=指を上へ（下方向へのスクロール）
      lastY = y;
      if (fired) return;
      const atBottom = modal.scrollTop + modal.clientHeight >= modal.scrollHeight - 4;
      const atTop = modal.scrollTop <= 4;
      if (atBottom && dy > 0) swipeAcc = Math.max(0, swipeAcc) + dy;       // 最下部でさらに下へ
      else if (atTop && dy < 0) swipeAcc = Math.min(0, swipeAcc) + dy;     // 最上部でさらに引っ張る
      else { swipeAcc = 0; return; }                                       // 通常のスクロールはリセット
      if (swipeAcc > 90) { fired = true; go(1); }
      else if (swipeAcc < -90) { fired = true; go(-1); }
    }, { passive: true });
    // PC: 端に到達した後もホイールを回し続けたら切り替え
    let wheelAcc = 0, wheelTimer = null;
    modal.addEventListener('wheel', (e) => {
      if (!shopNavState) return;
      const atBottom = modal.scrollTop + modal.clientHeight >= modal.scrollHeight - 4;
      const atTop = modal.scrollTop <= 4;
      if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) {
        wheelAcc += e.deltaY;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => { wheelAcc = 0; }, 400);
        if (wheelAcc > 260) { wheelAcc = 0; go(1); }
        else if (wheelAcc < -260) { wheelAcc = 0; go(-1); }
      } else wheelAcc = 0;
    }, { passive: true });
  }

  async function showShop(shopId, editMode = false, editVid = null, nav = null) {
    const s = Store.getShop(shopId);
    if (!s) return;
    const vs = Store.visitsOf(shopId);
    const body = $('#modal-body');
    // 上下スクロールでの店舗送り（プロフィールの写真カードから開いたとき）。
    // 編集中は誤って切り替わらないよう無効にする
    shopNavState = (nav && !editMode && !editVid) ? nav : null;
    bindShopNavOnce();

    // フォロー中の人のこの店の記録（未読込なら読み込んでから描き直す）
    if (!editMode && !networkLoaded) {
      ensureNetworkLoaded(() => {
        if (!$('#modal').classList.contains('hidden')) showShop(shopId, editMode, editVid, nav);
      });
    }
    // 店舗詳細は「店」が主役: 地図の表示切替に関係なく、この店に行った
    // フォロー中の人の記録も常に表示する（味覚一致率の高い順に並ぶ）
    loadCachedNetwork();
    const fps = followerPostsForShop(s).sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
    // 評価は本人＋フォロワーの合算平均（小数第1位）
    const allRatings = [...vs.map(v => v.rating || 0), ...fps.map(p => p.rating || 0)].filter(r => r > 0);
    const avg = allRatings.length ? Math.round(allRatings.reduce((a, b) => a + b, 0) / allRatings.length * 10) / 10 : 0;

    // ヘッダー
    const headHtml = editMode ? `
      <div class="detail-head"><h2>${IC_EDIT} 店舗情報の編集</h2>
        <div class="d-sub">店名・住所などを変更して「保存」を押してください。</div>
      </div>` : `
      <div class="detail-head">
        <h2>${esc(s.name)} ${s.favorite ? IC_FAV : ''}</h2>
        <div class="d-stars">${starSvg(avg, 16)}${avg ? ` <span class="d-avg">味 ${avg.toFixed(1)}</span>` : ''} <span style="color:var(--muted);font-size:13px">訪問${vs.length}回${fps.length ? '＋フォロー中' + fps.length + '件' : ''}</span></div>
        ${(() => { const pair = ratingPair({ name: s.name, lat: s.lat, lon: s.lon }); return pair.raters > 1 ? ratePairHtml(pair, { count: true }) : ''; })()}
        <div class="d-sub">${esc(shopLabelGenre(s) || '')}${s.status === 'closed' ? '<span class="badge gray">閉店</span>' : ''}</div>
        <div class="d-sub">${s.station ? IC_STATION + ' ' + esc(s.station) + '　' : ''}${esc([s.pref, s.city].filter(Boolean).join(' '))}</div>
        <div class="d-sub">${esc(s.address || '')}</div>
      </div>`;

    // 店舗情報の入力フォーム（編集モードのみ・一番下に配置）
    const shopFormHtml = editMode ? `
      <div class="axis-box">
        <div class="axis-title">店舗情報</div>
        <div class="form-grid">
          <label>店舗名
            <input type="text" id="de-name" value="${esc(s.name)}">
          </label>
          <label>最寄駅
            <input type="text" id="de-station" value="${esc(s.station || '')}">
          </label>
          <label>都道府県
            <input type="text" id="de-pref" value="${esc(s.pref || '')}">
          </label>
          <label>市区町村
            <input type="text" id="de-city" value="${esc(s.city || '')}">
          </label>
          <label class="full">住所
            <input type="text" id="de-address" value="${esc(s.address || '')}">
          </label>
        </div>
      </div>` : '';

    // 「詳細」の中身: お店の評価（3軸）＋店舗の操作（訪問を追加・店舗情報・閉店・削除）。
    // よく使う「ここへ行く」とお気に入り♥だけを外に出し、残りはここへ畳む
    const axisHtml = `
      <button type="button" class="btn small d-detail-toggle" id="d-detail-toggle">▸ 詳細</button>
      <div class="axis-box hidden" id="d-detail-box">
        <div class="axis-title">お店の評価（タップで変更・その場で保存されます）</div>
        ${['casual', 'atmosphere', 'speed'].map(k => `
          <div class="axis-row"><span>${AXIS_LABEL[k]}</span>
            <div class="stars small d-axis" data-axis="${k}">
              ${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" class="${(s[k] || 0) >= i ? 'on' : ''}">${starBtn()}</button>`).join('')}
            </div>
          </div>`).join('')}
        <div class="detail-actions d-sub-actions">
          <button class="btn small" id="d-add-visit">＋ 訪問を追加</button>
          <button class="btn small" id="d-edit">${IC_EDIT} 店舗情報</button>
          <button class="btn small" id="d-closed">${s.status === 'closed' ? '営業中に戻す' : '閉店にする'}</button>
          <button class="btn small danger" id="d-delete">店舗を削除</button>
        </div>
      </div>`;

    const actionsHtml = editMode ? `
      <div class="detail-actions">
        <button class="btn primary" id="d-save-all">保存</button>
        <button class="btn" id="d-cancel">キャンセル</button>
      </div>` : `
      <div class="d-mainrow">
        ${s.lat != null && s.lon != null ? `
        <button class="btn d-map-btn" id="d-showmap"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/></svg> 地図で見る</button>
        <button class="btn primary d-nav-btn" id="d-nav">${IC_NAV} ここへ行く</button>` : ''}
        <button class="d-fav-btn${s.favorite ? ' on' : ''}" id="d-fav"
          title="${s.favorite ? 'お気に入り解除' : 'お気に入り登録'}"
          aria-label="${s.favorite ? 'お気に入り解除' : 'お気に入り登録'}">${IC_FAV}</button>
      </div>`;

    // 編集モードは「店舗情報のみ」。各訪問の編集は表示モードの訪問カードから個別に行う
    // ここへ行く＋♥は一番下（スクロール中も画面下に張り付く）。
    // 訪問記録の見出しの右に✎（記録を見る）を置く
    // 店舗送りが有効なとき、前/次の店名のヒントを上下に出す
    const navPrev = shopNavState && shopNavState.index > 0
      ? (Store.getShop(shopNavState.list[shopNavState.index - 1]) || {}).name : '';
    const navNext = shopNavState && shopNavState.index < shopNavState.list.length - 1
      ? (Store.getShop(shopNavState.list[shopNavState.index + 1]) || {}).name : '';
    body.innerHTML = editMode ? `
      ${headHtml}
      ${shopFormHtml}
      ${actionsHtml}` : `
      ${navPrev ? `<div class="d-swipehint">︿ 下に引っ張って前の店舗: ${esc(navPrev)}</div>` : ''}
      ${headHtml}
      ${axisHtml}
      <div class="d-visits-head">
        <h3>訪問記録</h3>
        <button type="button" class="v-edit-link icon-only" id="d-visitlist"
          title="記録を見る" aria-label="記録を見る">${IC_EDIT}</button>
      </div>
      <div id="d-visits"></div>
      ${navNext ? `<div class="d-swipehint">さらにスクロールで次の店舗: ${esc(navNext)} ﹀</div>` : ''}
      ${actionsHtml}`;

    // 「詳細」ボタンでお店の評価（3軸）を開閉
    const detailToggle = $('#d-detail-toggle');
    if (detailToggle) {
      detailToggle.addEventListener('click', () => {
        const box = $('#d-detail-box');
        const open = box.classList.toggle('hidden'); // true = 閉じた
        detailToggle.textContent = open ? '▸ 詳細' : '▾ 詳細';
      });
    }

    // 店の評価3軸: タップで即保存（同じ星をもう一度タップすると解除）
    body.querySelectorAll('.d-axis').forEach(row => {
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const axis = row.dataset.axis;
        const v = +btn.dataset.v;
        const newVal = (s[axis] === v) ? 0 : v;
        Store.updateShop(shopId, { [axis]: newVal });
        row.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v <= newVal));
        s[axis] = newVal;
      });
    });

    if (editMode) {
      $('#d-save-all').addEventListener('click', saveShopInfo);
      $('#d-cancel').addEventListener('click', () => showShop(shopId, false));
    } else {
      const navBtn = $('#d-nav');
      if (navBtn) navBtn.addEventListener('click', () => openNav(s));
      const mapBtn2 = $('#d-showmap');
      if (mapBtn2) mapBtn2.addEventListener('click', () => { closeModal(); focusMapAt(s.lat, s.lon); });
      $('#d-visitlist').addEventListener('click', () => showVisitList(shopId));
      $('#d-edit').addEventListener('click', () => showShop(shopId, true));
      $('#d-add-visit').addEventListener('click', () => {
        closeModal();
        App.switchTab('register');
        Register.preselectShop(shopId);
      });
      $('#d-fav').addEventListener('click', () => {
        Store.updateShop(shopId, { favorite: !s.favorite });
        showShop(shopId);
      });
      $('#d-closed').addEventListener('click', () => {
        Store.updateShop(shopId, { status: s.status === 'closed' ? 'open' : 'closed' });
        showShop(shopId);
      });
      $('#d-delete').addEventListener('click', async () => {
        if (!confirm(`「${s.name}」と訪問記録・写真をすべて削除します。よろしいですか？`)) return;
        await Store.deleteShop(shopId);
        closeModal();
        App.refreshCurrent();
        App.toast('削除しました');
      });
    }

    // 店舗情報のみ保存（店名・住所など。各訪問は訪問カードから個別に編集）
    function saveShopInfo() {
      const name = $('#de-name').value.trim();
      if (!name) { App.toast('店舗名は空にできません'); return; }
      Store.updateShop(shopId, {
        name,
        station: $('#de-station').value.trim(),
        pref: $('#de-pref').value.trim(),
        city: $('#de-city').value.trim(),
        address: $('#de-address').value.trim(),
      });
      App.toast('✅ 保存しました');
      showShop(shopId, false);
      App.refreshCurrent();
    }

    // 訪問記録の一覧表示（訪問ごとに個別編集できる）
    if (!editMode) {
      const vbox = $('#d-visits');
      // 同じ店の写真は1つにまとめ、画面の横幅いっぱいで左右スワイプして見られるようにする
      // （投稿詳細と同じカルーセル）。写真をタップすると投稿として詳細を開く
      if (!editVid) {
        const block = document.createElement('div');
        block.className = 'visit-block d-photoblock';
        const avg = Store.avgRating(shopId);
        block.innerHTML = `
          <div class="pd-photos d-swipe">
            <button type="button" class="pd-slide d-noph">
              <span class="v-cover-ph">🍽️</span>
              <span class="pd-photo-star">★${avg ? fmtR(avg) : '－'}</span>
            </button>
          </div>`;
        const box = block.querySelector('.d-swipe');
        // 写真が無いときは🍽️のまま。タップで訪問記録の一覧へ
        // （各訪問の編集は「訪問記録」見出し横の✎＝訪問一覧から行う）
        block.querySelector('.d-noph').addEventListener('click', () => showVisitList(shopId));
        vbox.appendChild(block);
        Store.allPhotos().then(all => {
          const vMap = new Map(vs.map(v => [v.id, v]));
          const shot = (p) => {
            const v = vMap.get(p.visitId);
            return (v && v.datetime ? new Date(v.datetime).getTime() : 0) || p.createdAt || 0;
          };
          const photos = all.filter(p => p.shopId === shopId)
            .sort((a, b) => shot(b) - shot(a) || b.createdAt - a.createdAt);
          if (!photos.length) return;
          const post = buildOwnShopPost({ shopId, photos });
          // 各写真にその訪問の星の数バッジ（投稿詳細と同じ黒背景・金文字）
          const items = post.photoItems.map(it => ({ url: photoUrl(it.ph), rating: it.rating }))
            .filter(it => it.url);
          box.innerHTML = items.map(it =>
            `<div class="pd-slide"><img class="pd-photo" src="${esc(it.url)}" alt="" loading="lazy" decoding="async">${
              it.rating ? `<span class="pd-photo-star">★${fmtR(it.rating)}</span>` : ''}</div>`).join('');
          if (items.length > 1) {
            // 複数枚は左右スワイプで切り替え。下の点で何枚目かを示す
            box.classList.add('pd-carousel');
            const dots = document.createElement('div');
            dots.className = 'pd-dots';
            dots.innerHTML = items.map((_, i) => `<span class="pd-dot${i === 0 ? ' on' : ''}"></span>`).join('');
            box.after(dots);
            box.addEventListener('scroll', () => {
              const i = Math.round(box.scrollLeft / box.clientWidth);
              [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
            }, { passive: true });
          }
          box.querySelectorAll('.pd-photo').forEach(img =>
            img.addEventListener('click', () => showPostDetail(post)));

          // 訪問履歴: 訪問ごとの代表写真のサムネイル（横スクロール）。
          // 各サムネに★バッジ・日付・星の並び。タップで訪問記録の一覧へ
          const withPhoto = vs.map(v => ({ v, ph: photos.find(p => p.visitId === v.id) }))
            .filter(x => x.ph);
          if (withPhoto.length > 1) {
            const vh = document.createElement('div');
            vh.className = 'd-vh';
            vh.innerHTML = '<div class="d-vh-title">訪問履歴</div><div class="d-visit-thumbs"></div>';
            const row = vh.querySelector('.d-visit-thumbs');
            withPhoto.forEach(({ v, ph }) => {
              const el = document.createElement('button');
              el.type = 'button';
              el.className = 'dvt';
              el.innerHTML = `
                <span class="dvt-ph"><img alt="" loading="lazy" decoding="async">
                  ${v.rating ? `<span class="pd-photo-star">★${fmtR(v.rating)}</span>` : ''}</span>
                <span class="dvt-date">${new Date(v.datetime).toLocaleDateString('ja-JP')}</span>
                <span class="dvt-stars">${starSvg(v.rating, 11)}</span>`;
              setThumb(el.querySelector('img'), ph);
              el.addEventListener('click', () => showVisitList(shopId));
              row.appendChild(el);
            });
            block.appendChild(vh);
          }
        });
      }
      // 個別の訪問カードは、ある訪問をインライン編集しているときだけ並べる
      if (editVid) for (const v of vs) {
        const block = document.createElement('div');
        block.className = 'visit-block';
        block.dataset.vid = v.id;
        if (editVid === v.id) {
          // ---- この訪問だけをインライン編集 ----
          // どの記録か分かるよう、見出しにその訪問の日付、下に写真を出したまま編集する
          block.classList.add('ve-editing');
          block.innerHTML = `
            <div class="ve-title">${IC_EDIT} 記録を編集中 <span class="ve-title-date">${new Date(v.datetime).toLocaleDateString('ja-JP')}</span></div>
            <div class="v-photos ve-photos"></div>
            <div class="ve-row">味の評価 <span class="stars small ve-stars" data-rating="${v.rating}"></span></div>
            <div class="ve-sub">料理ジャンル</div>
            <div class="ve-genres"></div>
            <div class="ve-row">訪問日 <input type="date" class="ve-date" value="${toDateInput(v.datetime)}"></div>
            <textarea rows="2" class="ve-comment" placeholder="コメント・感想">${esc(v.comment || '')}</textarea>
            <div class="v-btns">
              <button type="button" class="btn small primary ve-save">保存</button>
              <button type="button" class="btn small ve-cancel">キャンセル</button>
              <button type="button" class="btn small danger ve-del">削除</button>
            </div>`;
          vbox.appendChild(block);
          // 編集対象の写真（タップで拡大）。写真がない訪問では行ごと消す
          Store.photosOfVisit(v.id).then(ps => {
            const row = block.querySelector('.ve-photos');
            if (!ps.length) { row.remove(); return; }
            ps.forEach(ph => {
              const img = document.createElement('img');
              img.src = photoUrl(ph);
              img.addEventListener('click', () => openLightbox(photoUrl(ph), `${s.name}　${fmtDate(v.datetime)}`));
              row.appendChild(img);
            });
          });
          // 0.5刻みで入力できる共通の星入力（左半分タップ＝◯.5）
          let veRating = v.rating || 0;
          mountRatingStars(block.querySelector('.ve-stars'), veRating, (val) => { veRating = val; });
          const set = new Set(v.dishGenres || []);
          Api.buildGenrePicker(block.querySelector('.ve-genres'), set);
          block.querySelector('.ve-cancel').addEventListener('click', () => showShop(shopId, false, null));
          // 編集中の記録をその場で削除できる（訪問一覧の削除と同じ処理。写真も一緒に消える）
          block.querySelector('.ve-del').addEventListener('click', async () => {
            if (!confirm('この記録を削除しますか？写真も一緒に削除されます。')) return;
            await Store.deleteVisit(v.id);
            App.toast('記録を削除しました');
            showShop(shopId, false, null);
            App.refreshCurrent();
          });
          block.querySelector('.ve-save').addEventListener('click', () => {
            const dateVal = block.querySelector('.ve-date').value;
            if (!dateVal) { App.toast('訪問日を入力してください'); return; }
            Store.updateVisit(v.id, {
              datetime: new Date(dateVal + 'T12:00:00').toISOString(),
              rating: veRating || 3,
              dishGenres: [...set],
              comment: block.querySelector('.ve-comment').value.trim(),
            });
            // フィードの公開投稿も新しい内容で更新（ログイン中のみ）
            if (typeof Cloud !== 'undefined' && Cloud.getUser()) {
              Cloud.publishPostForVisit(v.id).catch(() => {});
            }
            App.toast('✅ 保存しました');
            showShop(shopId, false, null);
            App.refreshCurrent();
          });
        } else {
          // ---- 読み取り表示: 写真＋左上に星の数＋下に日付・編集ボタン。写真タップで訪問一覧ページへ ----
          const dateStr = new Date(v.datetime).toLocaleDateString('ja-JP');
          block.innerHTML = `
            <button type="button" class="v-cover">
              <span class="v-cover-ph">🍽️</span>
              <span class="v-badge">★${v.rating ? fmtR(v.rating) : '－'}</span>
            </button>
            <div class="v-caption">
              <span>${dateStr}</span>
              <button type="button" class="v-edit-link">${IC_EDIT} 編集</button>
            </div>`;
          const cover = block.querySelector('.v-cover');
          cover.addEventListener('click', () => showVisitList(shopId));
          // 地図や店舗詳細から、その場で記録を編集できる（インライン編集を開く）
          block.querySelector('.v-edit-link').addEventListener('click', () => showShop(shopId, false, v.id));
          Store.photosOfVisit(v.id).then(ps => {
            if (ps.length) {
              const cimg = document.createElement('img');
              cimg.src = photoUrl(ps[0]);
              cover.querySelector('.v-cover-ph').replaceWith(cimg);
            }
          });
          vbox.appendChild(block);
        }
      }

      // フォロー中の人のこの店の記録（写真＋★＋アカウントアイコン。タップで投稿を表示）
      // 他人の記録なので日付は出さず、@ユーザー名のみ表示する。味覚一致率の高い人を先に
      fps.sort((a, b) => (tasteMatch(b.username).rate ?? -1) - (tasteMatch(a.username).rate ?? -1));
      for (const p of fps) {
        const block = document.createElement('div');
        block.className = 'visit-block';
        block.innerHTML = `
          <button type="button" class="v-cover">
            ${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="">` : '<span class="v-cover-ph">🍽️</span>'}
            <span class="v-badge">★${p.rating ? fmtR(p.rating) : '－'}</span>
            <span class="v-user">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '🍜'}</span>
          </button>
          <div class="v-caption">@${esc(p.username || '')} ${tasteBadge(p.username, true)}</div>`;
        block.querySelector('.v-cover').addEventListener('click', () => showPostDetail(p));
        vbox.appendChild(block);
      }
    }

    $('#modal').classList.add('modal-full'); // 店舗詳細は全画面表示
    $('#modal').classList.remove('hidden');
  }

  // その店の訪問記録を一覧で見るページ（日付・評価・ジャンル・コメント・写真・編集/削除）
  // 写真は投稿詳細と同じ見せ方: 画面の横幅いっぱい＋複数枚は左右スワイプ（Instagram風）
  function showVisitList(shopId) {
    const s = Store.getShop(shopId);
    if (!s) return;
    const ov = document.createElement('div');
    ov.className = 'modal modal-full visitlist-modal';
    ov.innerHTML = `<div class="modal-box">
        <div class="vl-topbar">
          <button type="button" class="vl-back" aria-label="閉じる">‹</button>
          <div class="vl-titles">
            <span class="vl-title">${esc(s.name)} の訪問記録</span>
            <span class="vl-sub"></span>
          </div>
        </div>
        <div class="vl-body"></div>
        <div class="vl-addbar">
          <button type="button" class="btn primary vl-add">＋ 新しい記録を追加</button>
        </div>
      </div>`;
    const body = ov.querySelector('.vl-body');
    const close = () => ov.remove();
    ov.querySelector('.vl-back').addEventListener('click', close);
    // 下部の固定ボタン: この店を選んだ状態で登録タブへ
    ov.querySelector('.vl-add').addEventListener('click', () => {
      close();
      App.switchTab('register');
      Register.preselectShop(shopId);
    });

    let mode = 'list';   // 'list'（写真主役のカード） | 'tl'（タイムライン）
    let genreSel = '';   // ジャンル絞り込み（'' = すべて）

    const editVisit = (v) => { close(); showShop(shopId, false, v.id); };
    const delVisit = async (v) => {
      if (!confirm('この記録を削除しますか？')) return;
      await Store.deleteVisit(v.id);
      App.refreshCurrent();
      render();
    };

    // カードを左へスワイプすると 編集/削除 ボタンが現れる（写真カルーセル上は除外）
    function attachSwipe(card, v) {
      const main = card.querySelector('.vlc-main');
      const W = 132;
      let sx = 0, sy = 0, dx = 0, open = false, drag = null;
      const set = (x, anim) => {
        main.style.transition = anim ? 'transform .18s ease' : 'none';
        main.style.transform = `translateX(${x}px)`;
      };
      card.addEventListener('touchstart', (e) => {
        const t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0;
        drag = e.target.closest('.pd-carousel') ? false : null;
      }, { passive: true });
      card.addEventListener('touchmove', (e) => {
        const t = e.touches[0]; dx = t.clientX - sx;
        const dy = t.clientY - sy;
        if (drag === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          drag = Math.abs(dx) > Math.abs(dy);
        }
        if (!drag) return;
        set(Math.max(-W, Math.min(0, (open ? -W : 0) + dx)), false);
      }, { passive: true });
      card.addEventListener('touchend', () => {
        if (!drag) return;
        open = (open ? -W : 0) + dx < -W / 2;
        set(open ? -W : 0, true);
        drag = null;
      });
      // 開いたまま本文をタップしたら閉じる
      main.addEventListener('click', () => { if (open) { open = false; set(0, true); } });
      // PC（マウス操作）はダブルクリックで開閉
      main.addEventListener('dblclick', () => { open = !open; set(open ? -W : 0, true); });
      card.querySelector('.vlc-a-edit').addEventListener('click', () => editVisit(v));
      card.querySelector('.vlc-a-del').addEventListener('click', () => delVisit(v));
    }

    // リスト表示: 角丸写真の上に 星バッジ（右上）・日付（左下）・ジャンル（右下）を重ねる
    function buildCard(v) {
      const card = document.createElement('div');
      card.className = 'vl-card2';
      const gtxt = (v.dishGenres || []).join('・');
      card.innerHTML = `
        <div class="vlc-actions">
          <button type="button" class="vlc-act vlc-a-edit">${IC_EDIT}<span>編集</span></button>
          <button type="button" class="vlc-act vlc-a-del"><span>削除</span></button>
        </div>
        <div class="vlc-main">
          <div class="vlc-photobox">
            <div class="pd-photos vl-photos"></div>
            ${v.rating ? `<span class="pd-photo-star vlc-star">★${fmtR(v.rating)}</span>` : ''}
            <span class="vlc-date">${new Date(v.datetime).toLocaleDateString('ja-JP')}</span>
            ${gtxt ? `<span class="vlc-genre">${esc(gtxt)}</span>` : ''}
          </div>
          <div class="vlc-info">
            <div class="vlc-raterow">
              <span class="v-stars">${starSvg(v.rating, 17)}</span>
              ${v.rating ? `<b class="vlc-num">${fmtR(v.rating)}</b>` : ''}
              ${gtxt ? `<span class="vlc-gtxt">${esc(gtxt)}</span>` : ''}
              <button type="button" class="v-edit-link icon-only ve-edit" title="この記録を編集"
                aria-label="この記録を編集">${IC_EDIT}</button>
            </div>
            ${v.comment ? `<div class="vlc-comment">「${esc(v.comment)}」</div>` : ''}
          </div>
        </div>`;
      Store.photosOfVisit(v.id).then(ps => {
        const box = card.querySelector('.vl-photos');
        const urls = ps.map(p => photoUrl(p)).filter(Boolean);
        if (!urls.length) { box.innerHTML = '<div class="vlc-noph">🍽️</div>'; return; }
        box.innerHTML = urls.map(u =>
          `<div class="pd-slide"><img class="pd-photo" src="${esc(u)}" alt="" loading="lazy" decoding="async"></div>`).join('');
        if (urls.length > 1) {
          box.classList.add('pd-carousel');
          const dots = document.createElement('div');
          dots.className = 'pd-dots';
          dots.innerHTML = urls.map((_, i) => `<span class="pd-dot${i === 0 ? ' on' : ''}"></span>`).join('');
          card.querySelector('.vlc-photobox').after(dots);
          box.addEventListener('scroll', () => {
            const i = Math.round(box.scrollLeft / box.clientWidth);
            [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
          }, { passive: true });
        }
        box.querySelectorAll('.pd-photo').forEach((img, i) =>
          img.addEventListener('click', () => openLightbox(urls[i], `${s.name}　${fmtDate(v.datetime)}`)));
      });
      card.querySelector('.ve-edit').addEventListener('click', () => editVisit(v));
      attachSwipe(card, v);
      return card;
    }

    // タイムライン表示: 縦の線と点で時系列に並べる
    function renderTimeline(list) {
      const tl = document.createElement('div');
      tl.className = 'vl-tl';
      for (const v of list) {
        const it = document.createElement('div');
        it.className = 'vl-tli';
        const gtxt = (v.dishGenres || []).join('・');
        it.innerHTML = `
          <div class="vl-tldate">${new Date(v.datetime).toLocaleDateString('ja-JP', { dateStyle: 'medium' })}<span>${relTime(v.datetime)}</span></div>
          <div class="vl-tlrow">
            <button type="button" class="vl-tlph">🍽️</button>
            <div class="vl-tlinfo">
              <div class="vl-tlstars">${starSvg(v.rating, 14)}${v.rating ? `<b>${fmtR(v.rating)}</b>` : ''}</div>
              ${gtxt ? `<div class="vl-tlg">${esc(gtxt)}</div>` : ''}
              ${v.comment ? `<div class="vl-tlcm">${esc(v.comment)}</div>` : ''}
            </div>
            <button type="button" class="v-edit-link icon-only ve-edit" title="この記録を編集"
              aria-label="この記録を編集">${IC_EDIT}</button>
          </div>`;
        Store.photosOfVisit(v.id).then(ps => {
          const u = ps.length ? photoUrl(ps[0]) : '';
          if (!u) return;
          it.querySelector('.vl-tlph').innerHTML = `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">`;
          it.querySelector('.vl-tlph').addEventListener('click', () =>
            openLightbox(u, `${s.name}　${fmtDate(v.datetime)}`));
        });
        it.querySelector('.ve-edit').addEventListener('click', () => editVisit(v));
        tl.appendChild(it);
      }
      body.appendChild(tl);
    }

    const render = () => {
      const all = Store.visitsOf(shopId);
      ov.querySelector('.vl-sub').textContent = `あなたの記録（${all.length}件）`;
      body.innerHTML = '';
      if (!all.length) { body.innerHTML = '<div class="empty"><p>訪問記録がありません。</p></div>'; return; }

      const genres = [...new Set(all.flatMap(v => v.dishGenres || []))];
      if (genreSel && !genres.includes(genreSel)) genreSel = '';
      const list = genreSel ? all.filter(v => (v.dishGenres || []).includes(genreSel)) : all;

      // ヘッダー: 訪問回数・平均評価・最終訪問 ＋ ジャンル絞り込み ＋ 表示切り替え
      const head = document.createElement('div');
      head.className = 'vl-head';
      head.innerHTML = `
        <div class="vl-stats">
          <div class="vl-stat"><b>${all.length}<small>回</small></b><span>訪問回数</span></div>
          <div class="vl-stat"><b class="vl-avg">★${fmtR(Store.avgRating(shopId))}</b><span>平均評価</span></div>
          <div class="vl-stat"><b>${relTime(all[0].datetime)}</b><span>最終訪問</span></div>
        </div>
        <div class="vl-tools">
          <div class="vl-chips"></div>
          <div class="vl-segs">
            <button type="button" class="vl-seg" data-m="list">リスト</button>
            <button type="button" class="vl-seg" data-m="tl">タイムライン</button>
          </div>
        </div>`;
      const chips = head.querySelector('.vl-chips');
      if (genres.length) {
        chips.innerHTML = `<button type="button" class="vl-chip${genreSel ? '' : ' on'}" data-g="">すべて</button>` +
          genres.map(g => `<button type="button" class="vl-chip${genreSel === g ? ' on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
        chips.querySelectorAll('.vl-chip').forEach(c =>
          c.addEventListener('click', () => { genreSel = c.dataset.g; render(); }));
      } else chips.remove();
      head.querySelectorAll('.vl-seg').forEach(b => {
        b.classList.toggle('on', b.dataset.m === mode);
        b.addEventListener('click', () => { mode = b.dataset.m; render(); });
      });
      body.appendChild(head);

      if (!list.length) {
        const e = document.createElement('div');
        e.className = 'empty';
        e.innerHTML = '<p>該当する記録がありません。</p>';
        body.appendChild(e);
        return;
      }
      if (mode === 'tl') { renderTimeline(list); return; }
      for (const v of list) body.appendChild(buildCard(v));
    };
    render();
    document.body.appendChild(ov);
  }

  // ========== SNS: 公開プロフィールの共有 / 閲覧 ==========
  const shareUrlFor = (username) => location.origin + location.pathname + '?u=' + encodeURIComponent(username);

  // 自分のプロフィールを共有（@ユーザー名の設定 → 共有リンクのコピー）
  function openShareProfile() {
    const cloudReady = (typeof Cloud !== 'undefined') && Cloud.isSupported();
    const loggedIn = cloudReady && Cloud.getUser();
    const p = Store.getProfile();
    const ov = document.createElement('div');
    ov.className = 'modal share-modal';
    ov.innerHTML = `<div class="modal-box">
        <button type="button" class="modal-close sh-close" aria-label="閉じる">✕</button>
        <h2 class="sh-title">プロフィールを共有</h2>
        <div class="sh-body"></div>
      </div>`;
    const body = ov.querySelector('.sh-body');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.sh-close').addEventListener('click', close);

    if (!loggedIn) {
      body.innerHTML = `<p class="sh-note">共有するにはGoogleログイン（同期）が必要です。<br>プロフィール画面の「ログイン」からサインインしてください。</p>`;
      document.body.appendChild(ov);
      return;
    }

    const renderShare = () => {
      const cur = Store.getProfile();
      if (!cur.username) {
        body.innerHTML = `
          <p class="sh-note">共有用の<strong>ユーザー名（@ハンドル）</strong>を決めてください。<br>半角英数字と _ が使えます（3〜20文字）。</p>
          <div class="sh-row"><span class="sh-at">@</span>
            <input type="text" class="sh-input" placeholder="username" maxlength="20" autocomplete="off">
            <button type="button" class="btn primary small sh-set">決定</button>
          </div>
          <div class="sh-msg"></div>`;
        const input = body.querySelector('.sh-input');
        const msg = body.querySelector('.sh-msg');
        body.querySelector('.sh-set').addEventListener('click', async () => {
          msg.textContent = '設定中…';
          try {
            await Cloud.setUsername(input.value);
            App.toast('✅ ユーザー名を設定しました');
            renderProfile();
            renderShare();
          } catch (e) { msg.textContent = '⚠️ ' + (e && e.message || e); }
        });
      } else {
        const url = shareUrlFor(cur.username);
        body.innerHTML = `
          <p class="sh-note">あなたのプロフィールURL（@${esc(cur.username)}）です。コピーして共有できます。</p>
          <div class="sh-row">
            <input type="text" class="sh-input sh-url" value="${esc(url)}" readonly>
            <button type="button" class="btn primary small sh-copy">コピー</button>
          </div>
          <div class="sh-actions">
            <button type="button" class="btn small sh-refresh">公開内容を最新に更新</button>
            <button type="button" class="btn small sh-rename">ユーザー名を変更</button>
          </div>
          <div class="sh-msg"></div>`;
        const msg = body.querySelector('.sh-msg');
        body.querySelector('.sh-copy').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(url); App.toast('✅ リンクをコピーしました'); }
          catch { body.querySelector('.sh-url').select(); App.toast('リンクを選択しました。コピーしてください'); }
        });
        body.querySelector('.sh-refresh').addEventListener('click', async () => {
          msg.textContent = '更新中…';
          try { await Cloud.publishPublicProfile(); msg.textContent = '✅ 最新の内容を公開しました'; }
          catch (e) { msg.textContent = '⚠️ ' + (e && e.message || e); }
        });
        body.querySelector('.sh-rename').addEventListener('click', () => {
          Store.setProfile({ username: '' }); // 入力欄を出すため一旦クリア（確定時に新名を予約）
          renderShare();
        });
      }
    };
    renderShare();
    document.body.appendChild(ov);
  }

  // ========== ホーム／フィード ==========
  const feedPosts = new Map();     // id → 投稿データ（詳細表示用）
  let feedCache = null;            // { posts, time }：短時間の再表示は再取得しない
  const feedStats = new Map();     // id → { likes, liked, comments }（いいね/コメント数のキャッシュ）
  const FEED_TTL = 45000;          // キャッシュ有効時間（ミリ秒）
  // 前回のフィードを端末に控えておき、次回起動では即表示→裏で最新に差し替える
  // （フォロー中の人の写真の読み込み待ちを見せない）
  const FEED_LS = 'gourmet.feedCache';
  try {
    const c = JSON.parse(localStorage.getItem(FEED_LS) || 'null');
    if (c && Array.isArray(c.posts) && c.posts.length) feedCache = { posts: c.posts, time: 0 }; // time0=要再取得
  } catch { /* noop */ }
  // 写真のURLを先読みしてブラウザのキャッシュを温める（表示時に待たせない）
  function warmPhotos(posts, n) {
    posts.slice(0, n || 6).forEach(p => { if (p.photoUrl) { const im = new Image(); im.src = p.photoUrl; } });
  }

  // ---------- 下に引っ張って更新（プルリフレッシュ） ----------
  let ptrSetup = false;
  function setupPullToRefresh() {
    if (ptrSetup) return;
    ptrSetup = true;
    initFeedSegs();
    const view = $('#view-feed');
    const bar = document.createElement('div');
    bar.className = 'ptr';
    bar.innerHTML = '<span class="ptr-spin"></span>';
    view.insertBefore(bar, view.firstChild);
    let startY = 0, pulling = false, busy = false;
    const atTop = () => (document.scrollingElement.scrollTop <= 0);
    document.addEventListener('touchstart', (e) => {
      if (busy || !view.classList.contains('active') || !atTop()) { pulling = false; return; }
      startY = e.touches[0].clientY;
      pulling = true;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { bar.style.height = '0px'; bar.classList.remove('ready'); return; }
      const h = Math.min(72, dy * 0.4); // 指の動きの4割だけ開く（引っ張り感を出す）
      bar.style.height = h + 'px';
      bar.classList.toggle('ready', h >= 58);
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (!pulling) return;
      pulling = false;
      if (bar.classList.contains('ready')) {
        busy = true;
        bar.classList.add('loading');
        bar.style.height = '48px';
        Promise.resolve(renderFeed(true)).catch(() => {}).finally(() => {
          busy = false;
          bar.classList.remove('ready', 'loading');
          bar.style.height = '0px';
        });
      } else {
        bar.classList.remove('ready');
        bar.style.height = '0px';
      }
    }, { passive: true });
  }

  async function renderFeed(force) {
    setupPullToRefresh();
    // 味覚一致率・あなた向け評価はフォロー中の記録(networkPosts)から計算するため、
    // 地図を開いていなくてもホーム表示時に読み込む（取得後は並びとバッジを描き直す）
    loadCachedNetwork();
    ensureNetworkLoaded(() => { if (feedCache) paintFeed(feedCache.posts); });
    const box = $('#feed-list');
    const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
    if (!me) {
      box.innerHTML = `<div class="empty"><p>ホームではフォロー中の人の投稿が見られます。<br>プロフィール画面からGoogleログインしてください。</p></div>`;
      return;
    }
    const fresh = feedCache && (Date.now() - feedCache.time < FEED_TTL);
    if (!force && fresh) {
      paintFeed(feedCache.posts); // 直近に取得済みなら再取得せず即描画
      return;
    }
    if (!force && feedCache) {
      // 前回の内容（端末の控え含む）をまず即表示し、裏で最新を取り直す
      paintFeed(feedCache.posts);
      refetchFeed(true);
      return;
    }
    // キャッシュが無い初回・プルリフレッシュは取得を待って描画
    if (!feedCache) box.innerHTML = SKEL_FEED;
    await refetchFeed(false);
    paintFeed(feedCache ? feedCache.posts : []);
  }

  // フィードを取得し直して控えを更新する。repaintChanged=true なら内容が変わったときだけ描き直す
  async function refetchFeed(repaintChanged) {
    let posts;
    try { posts = await Cloud.fetchFeed(); }
    catch { posts = (feedCache && feedCache.posts) || []; }
    const changed = !feedCache || JSON.stringify(feedCache.posts) !== JSON.stringify(posts);
    feedCache = { posts, time: Date.now() };
    try { localStorage.setItem(FEED_LS, JSON.stringify({ posts, time: Date.now() })); } catch { /* 容量超過時は諦める */ }
    if (changed) feedStats.clear(); // 取り直したら数値キャッシュも作り直す
    warmPhotos(posts);
    if (repaintChanged && changed) paintFeed(posts);
  }

  // 投稿一覧の描画（renderFeedの表示部分。裏の再取得後の差し替えでも使う）
  // ホームの表示モード: おすすめ（味覚一致率の高い人を優先）／最新／フォロー中
  let feedSeg = 'reco';
  function initFeedSegs() {
    document.querySelectorAll('#feed-segs .feed-seg').forEach(b => b.addEventListener('click', () => {
      feedSeg = b.dataset.seg;
      document.querySelectorAll('#feed-segs .feed-seg').forEach(x => x.classList.toggle('active', x === b));
      if (feedCache) paintFeed(feedCache.posts);
    }));
  }
  // モードに応じた並び。おすすめ = 投稿者の味覚一致率 → 新しさ、他 = 新しい順
  function orderFeed(posts) {
    const list = posts.slice();
    if (feedSeg === 'reco') {
      list.sort((a, b) => {
        const ma = tasteMatch(a.username).rate ?? -1;
        const mb = tasteMatch(b.username).rate ?? -1;
        return (mb - ma) || (new Date(b.datetime || 0) - new Date(a.datetime || 0));
      });
    } else {
      list.sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
    }
    return list;
  }

  function paintFeed(rawPosts) {
    const posts = orderFeed(rawPosts);
    const note = $('#feed-note');
    if (note) note.classList.toggle('hidden', feedSeg !== 'reco' || !posts.length);
    const box = $('#feed-list');
    if (!posts.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PEOPLE,
        'まだ投稿がありません。<br>ユーザーを探してフォローすると、その人の記録が並びます。',
        '<button class="btn primary" id="feed-search-btn">ユーザーを探す</button>');
      const b = $('#feed-search-btn');
      if (b) b.addEventListener('click', () => { if (Cloud.getUser()) openUserSearch(); else App.toast('ログインが必要です'); });
      return;
    }
    feedPosts.clear();
    posts.forEach(p => feedPosts.set(p.id, p));
    // ホームは写真が主役のカード型（店名・駅・ジャンルを写真に重ね、下段に投稿者とアクション）。
    // カードの写真をタップすると従来どおり投稿詳細（buildPostSection）が開く。
    // （更新は下に引っ張るプルリフレッシュ）
    box.innerHTML = '';
    posts.forEach((p, i) => box.appendChild(buildFeedCard(p, posts, i)));
  }

  // ジャンル名 → 発見タイルと同じカテゴリ色（チップの背景に使う）
  function catColorForGenre(g) {
    const i = Api.DISH_CATEGORIES.findIndex(c => c.name === g || c.genres.includes(g));
    return i >= 0 ? CAT_COLORS[(i + 1) % CAT_COLORS.length] : 'var(--accent)';
  }

  // 地図タブへ切り替えて指定の場所を表示（ホームカードのミニ地図から）
  function focusMapAt(lat, lon) {
    App.switchTab('map');
    setTimeout(() => { if (map) { map.jumpTo({ center: [lon, lat], zoom: 15 }); mapHasView = true; } }, 350);
  }

  // ホームのフィードカード1枚ぶん（デザインカンプ準拠）
  //  写真の上: 店名・最寄駅・ジャンルチップ（左上）／★評価バッジ（右上）／
  //            ミニ地図（左下）・ここへ行く（右下）
  //  写真の下: 投稿者、いいね・コメント・行きたい保存
  function buildFeedCard(p, list, index) {
    const card = document.createElement('div');
    card.className = 'fcard';
    const av = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '🍜';
    const genre = String(p.genre || p.shopGenre || '').split('・')[0];
    const rating = p.rating ? Math.round(p.rating * 10) / 10 : 0;
    const hasPos = p.lat != null && p.lon != null;
    const tm = tasteMatch(p.username);
    card.innerHTML = `
      <div class="fcard-head2">
        ${tasteBadge(p.username, true)}
        <button type="button" class="feed-author pd-author">
          <span class="fc-avatar">${av}</span>
          <span class="fc-name">${esc(p.displayName || 'BITEMAP')}
            <span class="fc-handle">${tm.common ? `共通店舗 ${tm.common}件` : (p.username ? '@' + esc(p.username) : '')}</span></span>
        </button>
        ${p.datetime ? `<span class="fcard-time">${relTime(p.datetime)}</span>` : ''}
      </div>
      <div class="fcard-photo">
        ${p.photoUrl ? `<img class="fcard-img" src="${esc(p.photoUrl)}" alt="" loading="lazy" decoding="async">`
          : '<div class="fcard-img fcard-noimg">🍽️</div>'}
        <div class="fcard-scrim"></div>
        <div class="fcard-head">
          <div class="fcard-name">${esc(p.shopName || '')}</div>
          ${p.station ? `<div class="fcard-sub">${IC_STATION} ${esc(p.station)}</div>` : ''}
          ${genre ? `<span class="fcard-genre" style="background:${catColorForGenre(genre)}">${esc(genre)}</span>` : ''}
        </div>
        ${rating ? `<div class="fcard-badge"><span class="fb-star">★</span>${fmtR(rating)}</div>` : ''}
        ${hasPos ? `
          <button type="button" class="fcard-dist hidden" title="地図で見る" aria-label="地図で見る">
            <span class="fd-row">${IC_PIN}<span>現在地から <b class="fd-m"></b></span></span>
            <span class="fd-row">${IC_WALK}<span>徒歩 <b class="fd-min"></b></span></span>
          </button>
          <button type="button" class="btn primary fcard-nav">${IC_NAV} ここへ行く</button>` : ''}
      </div>
      ${(() => {
        // 店舗と評価が主役: 写真の下に「あなた向け評価」と「全体評価」を並べる
        const pair = ratingPair({ name: p.shopName, lat: p.lat, lon: p.lon });
        if (!pair.raters && p.rating) return ''; // 情報が投稿1件だけなら右上の★バッジで足りる
        return ratePairHtml(pair, { compact: true });
      })()}
      <div class="fcard-foot acts-only">
        <div class="fcard-acts">
          <button type="button" class="fa-like pd-like" data-post="${esc(p.id)}" aria-label="いいね">${IC_HEART}<span class="fa-n fa-like-n">·</span></button>
          <button type="button" class="fa-comment fcard-cmt" aria-label="コメント">${IC_COMMENT}<span class="fa-n fcard-cmt-n"></span></button>
          <button type="button" class="fa-save pd-save${wishStateForPost(p) ? ' on' : ''}" aria-label="行きたい店に保存">${IC_BOOKMARK}</button>
        </div>
      </div>`;
    // 写真の解決: クラウドURLが欠けた投稿（写真より先に投稿だけ公開された等）や
    // URLの読み込み失敗時は、自分の記録なら端末内の写真で表示する（旧ホームと同じ挙動）
    const setImg = (url) => {
      if (!url) return;
      const cur = card.querySelector('.fcard-img');
      if (cur.tagName === 'IMG') { if (cur.src !== url) cur.src = url; return; }
      const im = document.createElement('img');
      im.className = 'fcard-img'; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
      im.src = url;
      cur.replaceWith(im);
    };
    const ownLocalPhoto = async () => {
      if (!Store.visits().some(v => v.id === p.id)) return '';
      const ps = await Store.photosOfVisit(p.id).catch(() => []);
      return ps.length ? photoUrl(ps[0]) : '';
    };
    if (!p.photoUrl) {
      // 端末内にも写真が無ければ、空の大きな四角を出さずコンパクト表示に切り替える
      ownLocalPhoto().then(u => { if (u) setImg(u); else card.classList.add('fcard-nophoto'); });
    } else {
      const imEl = card.querySelector('.fcard-img');
      imEl.addEventListener('error', () => ownLocalPhoto().then(u => {
        if (u) setImg(u); else card.classList.add('fcard-nophoto'); // 代わりが無ければコンパクト表示
      }), { once: true });
      // 自分の記録は端末内の写真のほうが速く確実なので、あれば差し替える
      ownLocalPhoto().then(u => { if (u) setImg(u); });
    }

    // 写真タップ → 投稿詳細（中のボタンは各自の動作を優先）
    const openDetail = () => showPostDetail(p, { list, index });
    card.querySelector('.fcard-photo').addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openDetail();
    });
    // 現在地からの距離・徒歩の目安（デザイン案準拠）。位置が取れたときだけ左下に出す。
    // タップで地図タブのその店へ（旧ミニ地図ボタンの役割を引き継ぐ）
    const distBox = card.querySelector('.fcard-dist');
    if (distBox) {
      distBox.addEventListener('click', () => focusMapAt(p.lat, p.lon));
      currentPosition().then(me => {
        const m = Store.distMeters(me.lat, me.lon, p.lat, p.lon);
        distBox.querySelector('.fd-m').textContent = fmtDist(m);
        distBox.querySelector('.fd-min').textContent = Math.max(1, Math.round(m / 80)) + '分'; // 分速80m
        distBox.classList.remove('hidden');
      }).catch(() => { /* 位置情報が使えないときは出さない */ });
    }
    const navBtn = card.querySelector('.fcard-nav');
    if (navBtn) navBtn.addEventListener('click', () => openNav({ name: p.shopName, lat: p.lat, lon: p.lon }));
    card.querySelector('.pd-author').addEventListener('click', () => showPublicProfile(p.username));
    // いいね・コメント数・行きたい保存
    Cloud.getLikeInfo(p.id).then(info => {
      const lb = card.querySelector('.pd-like');
      lb.querySelector('.fa-like-n').textContent = info.count;
      lb.classList.toggle('liked', info.liked);
    }).catch(() => {});
    Cloud.commentCount(p.id).then(n => { card.querySelector('.fcard-cmt-n').textContent = n || ''; }).catch(() => {});
    card.querySelector('.pd-like').addEventListener('click', () => toggleLikeUI(card.querySelector('.pd-like')));
    card.querySelector('.fcard-cmt').addEventListener('click', openDetail);
    card.querySelector('.pd-save').addEventListener('click', () => toggleWishForPost(p, card.querySelector('.pd-save')));
    return card;
  }

  // ---------- 行きたい店（投稿から保存） ----------
  function wishStateForPost(p) {
    return !!Store.findWish({ name: p.shopName, lat: p.lat, lon: p.lon });
  }
  function toggleWishForPost(p, btn) {
    const w = Store.findWish({ name: p.shopName, lat: p.lat, lon: p.lon });
    if (w) {
      Store.removeWish(w.id);
      if (btn) btn.classList.remove('on');
      App.toast('行きたい店から外しました');
    } else {
      if (!p.shopName) { App.toast('店名のない投稿は保存できません'); return; }
      Store.addWish({
        name: p.shopName || '', lat: p.lat != null ? p.lat : null, lon: p.lon != null ? p.lon : null,
        genre: p.genre || '', fromUsername: p.username || '', postId: p.id || '',
      });
      if (btn) btn.classList.add('on');
      App.toast('行きたい店に保存しました（地図に紫のピンで表示）');
    }
    refreshWishData();
  }

  // Instagram風のアクションシート（画面下から出るメニュー）。
  // actions = [{ label, onClick, danger }]。外側タップ・キャンセルで閉じる
  function openActionSheet(actions) {
    const ov = document.createElement('div');
    ov.className = 'modal action-sheet';
    ov.innerHTML = `<div class="as-box">
        <div class="as-handle"></div>
        <div class="as-group">
          ${actions.map((a, i) =>
            `<button type="button" class="as-item${a.danger ? ' danger' : ''}" data-i="${i}">${a.label}</button>`).join('')}
        </div>
        <button type="button" class="as-item as-cancel">キャンセル</button>
      </div>`;
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.as-cancel').addEventListener('click', close);
    ov.querySelectorAll('.as-item[data-i]').forEach(b =>
      b.addEventListener('click', () => { close(); actions[+b.dataset.i].onClick(); }));
    document.body.appendChild(ov);
  }

  // いいねのトグル（楽観的更新。失敗したら元に戻す）
  async function toggleLikeUI(btn) {
    const id = btn.dataset.post;
    if (typeof Cloud === 'undefined' || !Cloud.getUser()) { App.toast('いいねするにはログインが必要です'); return; }
    const nEl = btn.querySelector('.fa-like-n');
    const wasLiked = btn.classList.contains('liked');
    btn.classList.toggle('liked', !wasLiked);
    nEl.textContent = Math.max(0, (parseInt(nEl.textContent) || 0) + (wasLiked ? -1 : 1));
    const s = feedStats.get(id); // キャッシュも更新して整合を保つ
    if (s) { s.liked = !wasLiked; s.likes = Math.max(0, s.likes + (wasLiked ? -1 : 1)); }
    try { await Cloud.toggleLike(id); }
    catch (err) {
      btn.classList.toggle('liked', wasLiked);
      nEl.textContent = Math.max(0, (parseInt(nEl.textContent) || 0) + (wasLiked ? 1 : -1));
      if (s) { s.liked = wasLiked; s.likes = Math.max(0, s.likes + (wasLiked ? 1 : -1)); }
      App.toast('⚠️ ' + (err && err.message || err));
    }
  }

  // 投稿1件ぶんのセクションを組み立てて返す（写真・評価・お店の情報・いいね・コメント）
  // ホームの一覧と、投稿タップで開く詳細の両方で使う共通の描画関数
  function buildPostSection(p, close) {
    // 自分の記録かどうか（端末内の訪問に一致）。他人の投稿では日付・編集は出さない
    const isMine = Store.visits().some(v => v.id === p.id);
    const av = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '🍜';
    const AX = { casual: '気軽さ', atmosphere: '雰囲気', speed: '提供の早さ' };
    const axes = ['casual', 'atmosphere', 'speed'].filter(k => p[k])
      .map(k => `<div class="pd-axis"><span>${AX[k]}</span><span class="pd-axstar">${starSvg(p[k], 13)}</span></div>`).join('');
    const loc = [p.station ? IC_STATION + ' ' + esc(p.station) : '', esc([p.pref, p.city].filter(Boolean).join(' '))]
      .filter(Boolean).join('　');
    const sect = document.createElement('div');
    sect.className = 'pd-sect';
    sect.innerHTML = `
        <div class="pd-sect-head">
          <button type="button" class="feed-author pd-author" data-u="${esc(p.username)}">
            <span class="fc-avatar">${av}</span>
            <span class="fc-name">${esc(p.displayName || 'BITEMAP')}${p.username ? `<span class="fc-handle">@${esc(p.username)}</span>` : ''}</span>
          </button>
          ${isMine ? `<button type="button" class="pd-menu-btn pd-edit" title="メニュー"
            aria-label="メニュー">${IC_MORE}</button>` : ''}
        </div>
        <div class="pd-phwrap">
          <div class="pd-photos"></div>
        </div>
        <div class="pd-body">
          <div class="pd-toprow">
            ${starSvg(p.rating, 21)}
            <button type="button" class="fa-like pd-like" data-post="${esc(p.id)}" aria-label="いいね">${IC_HEART}<span class="fa-n fa-like-n">·</span></button>
            <button type="button" class="pd-cmt-btn" aria-label="コメント">${IC_COMMENT}</button>
            <button type="button" class="fa-save pd-save${wishStateForPost(p) ? ' on' : ''}" aria-label="行きたい店に保存">${IC_BOOKMARK}</button>
          </div>
          <div class="pd-shop">${esc(p.shopName || '')}</div>
          ${loc ? `<div class="pd-sub">${loc}</div>` : ''}
          <div class="pd-sub pd-genrow"><span>${esc(p.genre || p.shopGenre || '')}</span>
            <button type="button" class="pd-more">▸ 詳細</button></div>
          ${(p.lat != null && p.lon != null) ? '<button type="button" class="btn primary pd-nav pd-nav-main">' + IC_NAV + ' ここへ行く</button>' : ''}
          <div class="pd-morebox hidden">
            ${p.address ? `<div class="pd-sub">${esc(p.address)}</div>` : ''}
            ${axes ? `<div class="pd-axes"><div class="pd-axtitle">お店の評価</div>${axes}</div>` : ''}
            ${p.comment ? `<div class="pd-comment">${esc(p.comment)}</div>` : ''}
            ${isMine && p.datetime ? `<div class="pd-date">${fmtDate(p.datetime)}</div>` : ''}
          </div>
          <div class="pd-cmtbox hidden">
            <div class="pd-comments"></div>
            <div class="pd-cadd">
              <input type="text" class="pd-cinput" placeholder="コメントを追加…" maxlength="300" autocomplete="off">
              <button type="button" class="btn small primary pd-csend">送信</button>
            </div>
          </div>
        </div>`;
    sect.querySelector('.pd-author').addEventListener('click', () => { close(); showPublicProfile(p.username); });
    // 「▸ 詳細」で住所・お店の評価・感想・日付・ナビ・編集を開閉
    const moreBtn = sect.querySelector('.pd-more');
    moreBtn.addEventListener('click', () => {
      const hidden = sect.querySelector('.pd-morebox').classList.toggle('hidden');
      moreBtn.textContent = hidden ? '▸ 詳細' : '▾ 詳細';
    });
    // 星の横の「コメント」でコメント欄を開閉
    sect.querySelector('.pd-cmt-btn').addEventListener('click', () => {
      sect.querySelector('.pd-cmtbox').classList.toggle('hidden');
    });
    // 訪問記録の写真をすべて全幅で並べる（自分の投稿は端末内の全写真、他人の投稿は代表1枚）
    const cap = `${p.shopName || ''}${isMine && p.datetime ? '　' + fmtDate(p.datetime) : ''}`;
    (async () => {
      // 表示する写真の一覧。グループ投稿(photoItems)なら各写真にその訪問の評価を持つ
      const isGroup = Array.isArray(p.photoItems) && p.photoItems.length > 0;
      let items = [];
      if (isGroup) {
        items = p.photoItems.map(it => ({ url: photoUrl(it.ph), rating: it.rating })).filter(it => it.url);
      } else if (Store.visits().some(v => v.id === p.id)) {
        // 単独の訪問の投稿: 全写真にその訪問の評価を付ける（グループ投稿と同じ見た目に）
        const ps = await Store.photosOfVisit(p.id).catch(() => []);
        items = ps.map(x => ({ url: photoUrl(x), rating: p.rating || 0 })).filter(it => it.url);
      }
      if (!items.length && p.photoUrl) items = [{ url: p.photoUrl, rating: p.rating || 0 }];
      const box = sect.querySelector('.pd-photos');
      // 各写真の右上に、その訪問の星の数（★4のように）。ホーム・投稿詳細どの写真にも出す
      const badge = (r) => r ? `<span class="pd-photo-star">★${fmtR(r)}</span>` : '';
      const slide = (it) => `<div class="pd-slide"><img class="pd-photo" src="${esc(it.url)}" alt="" loading="lazy" decoding="async">${badge(it.rating)}</div>`;
      if (items.length > 1) {
        // 複数枚は左右スワイプで切り替え（Instagram風）。下の点で何枚目かを示す
        box.classList.add('pd-carousel');
        box.innerHTML = items.map(slide).join('');
        const dots = document.createElement('div');
        dots.className = 'pd-dots';
        dots.innerHTML = items.map((_, i) => `<span class="pd-dot${i === 0 ? ' on' : ''}"></span>`).join('');
        box.after(dots);
        box.addEventListener('scroll', () => {
          const i = Math.round(box.scrollLeft / box.clientWidth);
          [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
        }, { passive: true });
      } else {
        // 1枚でもバッジを出すためスライド枠で包む
        box.innerHTML = items.map(slide).join('');
      }
      box.querySelectorAll('.pd-photo').forEach((img, i) =>
        img.addEventListener('click', () => openLightbox(items[i].url, cap)));
    })();
    const nav = sect.querySelector('.pd-nav');
    if (nav) nav.addEventListener('click', () => openNav({ name: p.shopName, lat: p.lat, lon: p.lon }));
    // 自分の投稿は「⋯」からメニューを開き、「編集」を選ぶと記録の編集画面へ
    // （Instagramと同じく、⋯でいきなり編集にせずワンクッション挟む）
    const eb = sect.querySelector('.pd-edit');
    if (eb) eb.addEventListener('click', () => {
      const mv = Store.visits().find(v => v.id === p.id);
      if (!mv) return;
      openActionSheet([
        { label: '店舗の詳細を見る', onClick: () => { close(); showShop(mv.shopId); } },
        { label: '編集', onClick: () => { close(); showShop(mv.shopId, false, mv.id); } },
      ]);
    });

    // いいね（写真右上のハート）
    Cloud.getLikeInfo(p.id).then(info => {
      const lb = sect.querySelector('.pd-like');
      lb.querySelector('.fa-like-n').textContent = info.count;
      lb.classList.toggle('liked', info.liked);
    }).catch(() => {});
    sect.querySelector('.pd-like').addEventListener('click', () => toggleLikeUI(sect.querySelector('.pd-like')));
    sect.querySelector('.pd-save').addEventListener('click', () => toggleWishForPost(p, sect.querySelector('.pd-save')));

    // コメント一覧の読み込み・描画
    const loadComments = async () => {
      const box = sect.querySelector('.pd-comments');
      let list = [];
      try { list = await Cloud.getComments(p.id); } catch { list = []; }
      const me = Cloud.getUser();
      box.innerHTML = list.length ? list.map(c => {
        const av2 = c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : '🍜';
        return `<div class="pd-crow">
            <span class="pd-cav">${av2}</span>
            <div class="pd-cmain"><b>${esc(c.displayName || 'BITEMAP')}</b> ${esc(c.text)}</div>
            ${me && c.uid === me.uid ? `<button type="button" class="pd-cdel" data-cid="${esc(c.cid)}" aria-label="削除">✕</button>` : ''}
          </div>`;
      }).join('') : '<div class="pd-cempty">まだコメントはありません</div>';
      box.querySelectorAll('.pd-cdel').forEach(b => b.addEventListener('click', async () => {
        await Cloud.deleteComment(p.id, b.dataset.cid); feedStats.delete(p.id); loadComments();
      }));
    };
    loadComments();
    const sendComment = async () => {
      const input = sect.querySelector('.pd-cinput');
      const t = input.value.trim();
      if (!t) return;
      if (!Cloud.getUser()) { App.toast('コメントするにはログインが必要です'); return; }
      input.value = '';
      try { await Cloud.addComment(p.id, t); feedStats.delete(p.id); await loadComments(); }
      catch (e) { App.toast('⚠️ ' + (e && e.message || e)); }
    };
    sect.querySelector('.pd-csend').addEventListener('click', sendComment);
    sect.querySelector('.pd-cinput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendComment(); } });
    return sect;
  }

  // フィード投稿の詳細表示。ctx = { list, index } を渡すと、タップした投稿から始まり
  // 下にスクロールすると写真の並び順で次の投稿が続けて表示される（Instagram風）
  function showPostDetail(p, ctx) {
    const list = (ctx && ctx.list && ctx.list.length) ? ctx.list : [p];
    let next = (ctx && ctx.index != null) ? ctx.index : 0;
    let prev = next - 1; // タップした投稿より前（一覧で上にある）投稿は上へ継ぎ足す
    const ov = document.createElement('div');
    ov.className = 'modal postdetail-modal';
    ov.innerHTML = `<div class="modal-box pd-full">
        <div class="pd-topbar">
          <button type="button" class="modal-close pd-close" aria-label="閉じる">✕</button>
          <span class="pd-top-title">投稿</span>
        </div>
        <div class="pd-scroll"><div class="pd-sentinel-top"></div><div class="pd-sentinel"></div></div>
      </div>`;
    const ros = []; // セクションの高さ変化の監視（閉じるときに解除）
    const close = () => { io.disconnect(); ioTop.disconnect(); ros.forEach(r => r.disconnect()); ov.remove(); };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.pd-close').addEventListener('click', close);

    const scroll = ov.querySelector('.pd-scroll');
    const sentinel = ov.querySelector('.pd-sentinel');
    const sentinelTop = ov.querySelector('.pd-sentinel-top');
    const anchorCtl = makeScrollAnchor(scroll, () => scroll.querySelectorAll('.pd-sect'));
    const appendNext = () => {
      if (next >= list.length) { io.disconnect(); return; }
      const sec = buildPostSection(list[next], close);
      scroll.insertBefore(sec, sentinel);
      if (ctx && ctx.index != null ? next === ctx.index : next === 0) anchorCtl.set(sec, 0); // タップした投稿を画面最上部に固定
      ros.push(anchorCtl.watch(sec));
      next++;
      // 監視を貼り直して現在の状態を再評価させる（「交差したまま」だと
      // IntersectionObserverは再発火しないため、範囲内にいる限り連続で継ぎ足す）
      io.unobserve(sentinel);
      io.observe(sentinel);
    };
    // 上端が近づいたら前の投稿を上へ継ぎ足す。挿入した高さぶんスクロール位置を
    // ずらして、いま見ている投稿が動かないようにする
    const prependPrev = () => {
      if (prev < 0) { ioTop.disconnect(); return; }
      const sec = buildPostSection(list[prev], close);
      sentinelTop.after(sec);
      prev--;
      anchorCtl.fix(); // 基準の投稿が動かないよう位置を合わせ直す
      ros.push(anchorCtl.watch(sec));
      ioTop.unobserve(sentinelTop);
      ioTop.observe(sentinelTop);
    };
    // 末尾の見張り役が近づいたら次の投稿を継ぎ足す（画面2つ分手前から先読み）
    const io = new IntersectionObserver((entries) => {
      if (entries.some(en => en.isIntersecting)) appendNext();
    }, { root: scroll, rootMargin: '1200px 0px' });
    const ioTop = new IntersectionObserver((entries) => {
      if (entries.some(en => en.isIntersecting)) prependPrev();
    }, { root: scroll, rootMargin: '1200px 0px' });

    appendNext(); // タップした投稿
    io.observe(sentinel);
    document.body.appendChild(ov);
    ioTop.observe(sentinelTop); // DOMに載って高さが決まってから上方向の監視を始める
  }

  // ========== 通知（フォローされたお知らせ） ==========
  // ヘッダーのベルに未読件数バッジを反映
  async function refreshNotifBadge() {
    const badge = $('#notif-badge');
    if (!badge) return;
    const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
    if (!me) { badge.classList.add('hidden'); return; }
    try {
      const n = await Cloud.unreadNotifCount();
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.classList.toggle('hidden', !n);
    } catch { badge.classList.add('hidden'); }
  }

  async function openNotifications() {
    const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
    if (!me) { App.toast('ログインするとお知らせが届きます'); return; }
    const ov = document.createElement('div');
    ov.className = 'modal notif-modal panel-modal';
    ov.innerHTML = `<div class="modal-box">
        <div class="modal-head">
          <h2 class="vl-title">お知らせ</h2>
          <button type="button" class="modal-close nt-close" aria-label="閉じる">✕</button>
        </div>
        <div class="modal-scroll"><div class="nt-body"><div class="empty"><p>読み込み中…</p></div></div></div>
      </div>`;
    const body = ov.querySelector('.nt-body');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.nt-close').addEventListener('click', close);
    document.body.appendChild(ov);

    let list = [];
    try { list = await Cloud.fetchNotifications(); } catch { list = []; }
    if (!list.length) {
      body.innerHTML = `<div class="empty"><p>まだお知らせはありません。</p></div>`;
    } else {
      body.innerHTML = list.map((n, i) => {
        const av = n.fromAvatar ? `<img src="${esc(n.fromAvatar)}" alt="">` : '🍜';
        return `<div class="nt-row ${n.read ? '' : 'unread'}" data-i="${i}" data-u="${esc(n.fromUsername)}">
            <div class="ur-avatar">${av}</div>
            <div class="ur-main">
              <div class="nt-text"><b>${esc(n.fromDisplayName || 'BITEMAP')}</b> さんがあなたをフォローしました</div>
              <div class="ur-username">@${esc(n.fromUsername)}</div>
            </div>
            <button type="button" class="btn small nt-follow" data-uid="${esc(n.fromUid)}" data-u="${esc(n.fromUsername)}">…</button>
          </div>`;
      }).join('');
      // 各行: 本文タップで相手のプロフィール、ボタンでフォローバック
      body.querySelectorAll('.nt-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.nt-follow')) return;
          close(); showPublicProfile(row.dataset.u);
        });
      });
      // フォローバックボタンの状態を設定
      for (const btn of body.querySelectorAll('.nt-follow')) {
        const uid = btn.dataset.uid;
        let following = false;
        try { following = await Cloud.isFollowing(uid); } catch { /* noop */ }
        const paint = () => { btn.textContent = following ? 'フォロー中' : '＋ フォローバック'; btn.classList.toggle('following', following); };
        paint();
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          btn.disabled = true;
          try {
            if (following) await Cloud.unfollow(uid); else await Cloud.follow(uid);
            following = !following; paint();
          } catch (err) { App.toast('⚠️ ' + (err && err.message || err)); }
          btn.disabled = false;
        });
      }
    }
    // 既読にしてバッジを消す
    try { await Cloud.markNotificationsRead(); } catch { /* noop */ }
    refreshNotifBadge();
  }

  // 他人の公開プロフィールを閲覧（?u=ハンドル、またはフォロー一覧などから）
  async function showPublicProfile(username) {
    const ov = document.createElement('div');
    ov.className = 'modal pubprofile-modal panel-modal';
    ov.innerHTML = `<div class="modal-box">
        <div class="modal-head">
          <h2 class="pp-title">@${esc(username)}</h2>
          <button type="button" class="modal-close pp-close" aria-label="閉じる">✕</button>
        </div>
        <div class="modal-scroll"><div class="pp-body"><div class="empty"><p>読み込み中…</p></div></div></div>
      </div>`;
    const body = ov.querySelector('.pp-body');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.pp-close').addEventListener('click', close);
    document.body.appendChild(ov);

    let prof = null;
    try { prof = (typeof Cloud !== 'undefined') ? await Cloud.fetchPublicProfile(username) : null; }
    catch (e) { prof = null; }
    if (!prof) {
      body.innerHTML = `<div class="empty"><p>@${esc(username)} のプロフィールが見つかりませんでした。</p></div>`;
      return;
    }
    const avatar = prof.avatar ? `<img src="${esc(prof.avatar)}" alt="">` : '🍜';
    const shops = (prof.topShops || []).map(s =>
      `<div class="pp-shop">
        <div class="pp-shop-main">
          <div class="pp-shop-name">${esc(s.name)}</div>
          <div class="pp-shop-sub">${esc(s.genre || '')}${s.city ? '　' + esc(s.city) : ''}</div>
        </div>
        <div class="pp-shop-star">${s.rating ? '★' + fmtR(s.rating) : ''}</div>
      </div>`).join('');
    const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
    const isMe = me && me.uid === prof.uid;
    body.innerHTML = `
      <div class="pp-head">
        <div class="pp-avatar">${avatar}</div>
        <div class="pp-meta">
          <div class="pp-name">${esc(prof.displayName || 'BITEMAP')}</div>
          <div class="pp-username">@${esc(prof.username)}</div>
          <div class="pp-stats">
            <button type="button" class="pp-stat" data-social="following"><b class="pp-following">–</b> フォロー</button>
            <button type="button" class="pp-stat" data-social="followers"><b class="pp-followers">–</b> フォロワー</button>
            <span class="pp-stat"><b>${prof.shopCount || 0}</b> 店舗</span>
          </div>
          <div class="pp-match hidden"></div>
        </div>
      </div>
      ${prof.bio ? `<div class="pp-bio">${esc(prof.bio)}</div>` : ''}
      ${isMe ? '' : '<button type="button" class="btn primary pp-follow" disabled>…</button>'}
      <div class="pp-both hidden"></div>
      <div class="pp-photo-grid photo-grid"><div class="empty"><p>読み込み中…</p></div></div>`;

    // 2人とも行きたい店（相手の公開した行きたいリスト × 自分の行きたいリスト）
    // 店名の表記ゆれ照合＋位置300m以内のどちらかで同じ店とみなす
    if (!isMe && Array.isArray(prof.wishes) && prof.wishes.length) {
      const near = (a, b) => a.lat != null && a.lon != null && b.lat != null && b.lon != null
        && Store.distMeters(a.lat, a.lon, b.lat, b.lon) < 300;
      const myWishes = Store.wishes();
      const both = prof.wishes.filter(tw => tw.name &&
        myWishes.some(mw => shopNamesMatch(tw.name, mw.name) || near(tw, mw)));
      if (both.length) {
        const box = body.querySelector('.pp-both');
        box.classList.remove('hidden');
        box.innerHTML = `<h3 class="pp-h3">🤝 2人とも行きたい店</h3>` + both.slice(0, 10).map(w =>
          `<div class="pp-shop"><div class="pp-shop-main">
              <div class="pp-shop-name">${esc(w.name)}</div>
              <div class="pp-shop-sub">${esc(w.genre || '')}</div>
            </div></div>`).join('');
      }
    }

    // 投稿の写真をグリッド表示（タップで全画面の投稿表示）。写真が無ければ「よく行くお店」を出す
    (async () => {
      let posts = [];
      try { posts = (typeof Cloud !== 'undefined') ? await Cloud.fetchUserPosts(prof.uid) : []; }
      catch { posts = []; }

      // 食の趣味の一致度（Match%）: 相手の評価付き投稿と自分の記録で同じ店を照合し、
      // ★の近さ（1 - 差/4）を平均して%に。共通の店が無い場合は表示しない
      if (!isMe) {
        const myShops = Store.shops();
        let sum = 0, n = 0;
        for (const p of posts) {
          if (!p.rating) continue;
          const mine = myShops.find(s => postMatchesShop(p, s));
          if (!mine) continue;
          const my = Store.avgRating(mine.id);
          if (!my) continue;
          sum += 1 - Math.abs(my - p.rating) / 4;
          n++;
        }
        if (n) {
          const pct = Math.round((sum / n) * 100);
          const el = body.querySelector('.pp-match');
          if (el) {
            el.classList.remove('hidden');
            el.classList.add(pct >= 70 ? 'hi' : pct >= 40 ? 'mid' : 'lo');
            el.innerHTML = `食の一致度 <b>${pct}%</b> <span class="pp-match-n">共通${n}店</span>`;
          }
        }
      }

      const grid = body.querySelector('.pp-photo-grid');
      if (!grid) return;
      const withPhoto = posts.filter(p => p.photoUrl);
      if (withPhoto.length) {
        grid.innerHTML = '';
        withPhoto.forEach((p, i) => {
          const cell = document.createElement('button');
          cell.type = 'button'; cell.className = 'photo-cell';
          cell.innerHTML = `<img src="${esc(p.photoUrl)}" alt="" loading="lazy" decoding="async"><div class="cap">${esc(p.shopName || '')}</div>`;
          cell.addEventListener('click', () => showPostDetail(p, { list: withPhoto, index: i }));
          grid.appendChild(cell);
        });
      } else {
        grid.className = 'pp-shops'; // 写真が無ければ従来の「よく行くお店」リスト
        grid.innerHTML = (shops ? `<h3 class="pp-h3">よく行くお店</h3>${shops}` : '<div class="empty"><p>まだ公開された投稿がありません。</p></div>');
      }
    })();

    // フォロー数・フォロワー数を表示
    if (typeof Cloud !== 'undefined') {
      Cloud.followCounts(prof.uid).then(c => {
        const f1 = body.querySelector('.pp-following'), f2 = body.querySelector('.pp-followers');
        if (f1) f1.textContent = c.following; if (f2) f2.textContent = c.followers;
      }).catch(() => {});
    }
    // フォロー数/フォロワー数のタップで一覧
    body.querySelectorAll('.pp-stat[data-social]').forEach(b =>
      b.addEventListener('click', () => openFollowList(prof.uid, b.dataset.social, prof.displayName || prof.username)));

    // フォローボタン（本人以外・ログイン時のみ有効）
    const fbtn = body.querySelector('.pp-follow');
    if (fbtn) {
      if (!me) {
        fbtn.disabled = false; fbtn.textContent = 'フォローするにはログイン';
        fbtn.addEventListener('click', () => App.toast('プロフィール画面からログインしてください'));
      } else {
        let following = false;
        try { following = await Cloud.isFollowing(prof.uid); } catch { /* noop */ }
        const paint = () => { fbtn.textContent = following ? 'フォロー中' : '＋ フォロー'; fbtn.classList.toggle('following', following); };
        fbtn.disabled = false; paint();
        fbtn.addEventListener('click', async () => {
          fbtn.disabled = true;
          try {
            if (following) await Cloud.unfollow(prof.uid); else await Cloud.follow(prof.uid);
            following = !following; paint();
            Cloud.followCounts(prof.uid).then(c => {
              const f2 = body.querySelector('.pp-followers'); if (f2) f2.textContent = c.followers;
            }).catch(() => {});
          } catch (e) { App.toast('⚠️ ' + (e && e.message || e)); }
          fbtn.disabled = false;
        });
      }
    }
  }

  // フォロー中／フォロワーのユーザー一覧
  async function openFollowList(uid, type, name) {
    const ov = document.createElement('div');
    ov.className = 'modal followlist-modal';
    ov.innerHTML = `<div class="modal-box">
        <button type="button" class="modal-close fl-close" aria-label="閉じる">✕</button>
        <h2 class="vl-title">${esc(name || '')} の${type === 'followers' ? 'フォロワー' : 'フォロー'}</h2>
        <div class="fl-body"><div class="empty"><p>読み込み中…</p></div></div>
      </div>`;
    const body = ov.querySelector('.fl-body');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.fl-close').addEventListener('click', close);
    document.body.appendChild(ov);
    let list = [];
    try { list = await Cloud.followProfiles(uid, type); } catch { list = []; }
    if (!list.length) { body.innerHTML = `<div class="empty"><p>まだいません。</p></div>`; return; }
    body.innerHTML = list.map(p => userRow(p)).join('');
    body.querySelectorAll('.user-row').forEach(r =>
      r.addEventListener('click', () => { close(); showPublicProfile(r.dataset.u); }));
  }

  // ユーザー検索
  function openUserSearch() {
    const ov = document.createElement('div');
    ov.className = 'modal usersearch-modal';
    ov.innerHTML = `<div class="modal-box">
        <button type="button" class="modal-close us-close" aria-label="閉じる">✕</button>
        <h2 class="vl-title">ユーザーを探す</h2>
        <div class="us-row">
          <span class="sh-at">@</span>
          <input type="text" class="us-input" placeholder="ユーザー名で検索" autocomplete="off">
          <button type="button" class="btn primary small us-go">検索</button>
        </div>
        <div class="us-body"></div>
      </div>`;
    const body = ov.querySelector('.us-body');
    const input = ov.querySelector('.us-input');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.us-close').addEventListener('click', close);
    const run = async () => {
      const q = input.value.trim();
      if (!q) return;
      body.innerHTML = '<div class="empty"><p>検索中…</p></div>';
      let res = [];
      try { res = await Cloud.searchUsers(q); } catch (e) { body.innerHTML = `<div class="empty"><p>検索に失敗しました</p></div>`; return; }
      if (!res.length) { body.innerHTML = '<div class="empty"><p>見つかりませんでした。</p></div>'; return; }
      body.innerHTML = res.map(p => userRow(p)).join('');
      body.querySelectorAll('.user-row').forEach(r =>
        r.addEventListener('click', () => { close(); showPublicProfile(r.dataset.u); }));
    };
    ov.querySelector('.us-go').addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    document.body.appendChild(ov);
    input.focus();
  }

  // ユーザー一覧の1行（検索結果・フォロー一覧共通）
  function userRow(p) {
    const av = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '🍜';
    return `<div class="user-row" data-u="${esc(p.username)}">
        <div class="ur-avatar">${av}</div>
        <div class="ur-main">
          <div class="ur-name">${esc(p.displayName || 'BITEMAP')}</div>
          <div class="ur-username">@${esc(p.username)}　${p.shopCount || 0}店舗</div>
        </div>
      </div>`;
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    shopNavState = null; // 店舗送りの状態も解除（次に地図などから開いたとき誤作動しない）
  }

  return { refreshMap, enterMapTab, warmNetwork, initList, renderList, enterListTab, initPhotos, renderPhotos, renderStats, initProfile, renderProfile, renderFeed, showShop, showMapShopSheet, showNetShopSheet, closeModal, openLightbox, showPublicProfile, starBtn, mountRatingStars, getMap: () => map, baseMapStyle };
})();
