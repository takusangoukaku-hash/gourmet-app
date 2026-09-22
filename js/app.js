// =====================================================
// アプリ全体の制御: タブ切り替え・共通イベント・サンプルデータ
// =====================================================
const App = (() => {
  const $ = (sel) => document.querySelector(sel);
  const APP_VERSION = 'v297'; // sw.js の VERSION・index.html の ?v= と合わせる
  let currentTab = 'register';

  function init() {
    Register.init();
    Views.initList();
    Views.initPhotos();
    Views.initProfile();

    // タブ切り替え
    document.querySelectorAll('#tabs .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        // 下のバー中央の＋（登録）は入力フォームを直接開く（写真はフォーム内の「＋写真」から追加）
        switchTab(btn.dataset.tab);
      });
    });

    // 共通イベント委譲（店舗詳細を開く / お気に入り切替 / モーダルを閉じる）
    document.addEventListener('click', (e) => {
      const fav = e.target.closest('[data-fav]');
      if (fav) {
        e.stopPropagation();
        const shop = Store.getShop(fav.dataset.fav);
        if (shop) {
          Store.updateShop(shop.id, { favorite: !shop.favorite });
          fav.classList.toggle('on', shop.favorite); // updateShop で同一オブジェクトが更新済み
        }
        return;
      }
      const open = e.target.closest('[data-shop-open]');
      if (open) { Views.showShop(open.dataset.shopOpen); return; }
      const close = e.target.closest('[data-close]');
      if (close) {
        const modal = close.closest('.modal');
        if (modal) modal.classList.add('hidden');
      }
    });
    // モーダル背景クリックで閉じる
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
    });

    // 設定モーダル（Anthropic APIキー — AI料理ジャンル判定用）
    const settingsStatus = () => {
      const parts = [];
      parts.push(Api.hasApiKey() ? '✅ Anthropicキー: 設定済み' : 'Anthropicキー: 未設定');
      parts.push(Api.hasYahooKey() ? '✅ Yahoo!: 設定済み' : 'Yahoo!: 未設定');
      parts.push(Api.hasHotpepperKey() ? '✅ ホットペッパー: 設定済み' : 'ホットペッパー: 未設定');
      parts.push(Api.hasGoogleKey() ? '✅ Googleキー: 設定済み' : 'Googleキー: 未設定');
      // 部品(api.js)のバージョンも表示: アプリと違えば古いキャッシュ混在のサイン
      const partVer = Api.FILE_VERSION || '旧';
      parts.push('アプリ ' + APP_VERSION + (partVer !== APP_VERSION ? '（⚠️部品 ' + partVer + '）' : ''));
      return parts.join(' ／ ');
    };
    // このアカウントに紐づくメールアドレスを表示（ログイン中のみ）
    const renderSettingsAccount = () => {
      const user = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
      const box = $('#settings-account');
      // ログイン中だけアカウント行を出す（未ログインなら下の「ログイン」行が案内になる）
      box.classList.toggle('hidden', !user);
      if (!user) { box.innerHTML = ''; return; }
      box.innerHTML = '<span class="set-ic set-ic-gray">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'
        + '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg></span>'
        + '<span class="sa-main"><span class="sa-label">ログイン中のアカウント</span>'
        + '<span class="sa-value"></span></span>';
      box.querySelector('.sa-value').textContent = user.email || user.displayName || 'Googleアカウント';
    };
    // 設定上部のプロフィール行（名前・@ユーザー名・アイコン）
    const renderSettingsProfile = () => {
      const p = Store.getProfile();
      $('#set-name').textContent = p.name || 'BITEMAP';
      $('#set-sub').textContent = p.username ? '@' + p.username : 'プロフィールを編集';
      const av = $('#set-avatar');
      av.textContent = '';
      // 画像はDOM経由で設定する（文字列連結でHTMLに埋め込まない）
      if (p.avatar && /^data:image\//.test(p.avatar)) { const img = document.createElement('img'); img.src = p.avatar; img.alt = ''; av.appendChild(img); }
      else av.textContent = '🍜';
    };
    $('#settings-btn').addEventListener('click', () => {
      $('#settings-api-key').value = Api.getApiKey();
      $('#settings-google-key').value = Api.getGoogleKey();
      $('#settings-yahoo-key').value = Api.getYahooKey();
      $('#settings-hotpepper-key').value = Api.getHotpepperKey();
      $('#settings-status').textContent = settingsStatus();
      renderSettingsAccount();
      renderSettingsProfile();
      $('#settings-modal').classList.remove('hidden');
    });
    $('#settings-save').addEventListener('click', () => {
      const ak = $('#settings-api-key').value.trim();
      const gk = $('#settings-google-key').value.trim();
      // 空欄のまま保存しても、設定済みのキーは消さない（消すのは「キーを削除」ボタンだけ）
      if (ak) { Api.setApiKey(ak); Api.resetAnthropicClient(); }
      if (gk) Api.setGoogleKey(gk);
      const yk = $('#settings-yahoo-key').value.trim(), hk = $('#settings-hotpepper-key').value.trim();
      if (yk) Api.setYahooKey(yk);
      if (hk) Api.setHotpepperKey(hk);
      // ログイン中はアカウントにも控えを保存（ブラウザ都合で消えても自動復元される）
      if (typeof Cloud !== 'undefined' && Cloud.getUser()) Cloud.syncApiKeys().catch(() => {});
      $('#settings-modal').classList.add('hidden');
      toast('✅ 設定を保存しました。');
    });
    $('#settings-clear').addEventListener('click', () => {
      Api.setApiKey('');
      Api.resetAnthropicClient();
      Api.setGoogleKey('');
      Api.setYahooKey(''); Api.setHotpepperKey('');
      $('#settings-api-key').value = '';
      $('#settings-google-key').value = '';
      $('#settings-yahoo-key').value = ''; $('#settings-hotpepper-key').value = '';
      // クラウドの控えも消す（残すと次回ログインで復活してしまう）
      if (typeof Cloud !== 'undefined') Cloud.clearApiKeys().catch(() => {});
      $('#settings-status').textContent = settingsStatus();
      toast('APIキーを削除しました。');
    });

    // バックアップ（記録の書き出し・読み込み）
    //  - 通常: 店舗・訪問・行きたい店・プロフィール（写真なし・軽量）
    //  - 写真込み: 上記＋各写真を長辺640pxのJPEGにして同梱（別端末や検証環境で
    //    写真ごと再現できる。容量が大きいので専用ボタン）
    const downloadJson = (data, name) => {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const backupName = (suffix) => {
      const d = new Date();
      return `bitemap-backup${suffix}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    };
    $('#backup-export').addEventListener('click', async () => {
      downloadJson(await buildBackup(false), backupName(''));
      toast('✅ バックアップを書き出しました');
    });
    $('#backup-export-photos').addEventListener('click', async () => {
      const btn = $('#backup-export-photos');
      btn.disabled = true;
      try {
        const data = await buildBackup(true, (done, total, label) => { toast(`${label || '写真'}を準備中… ${done}/${total}`); });
        downloadJson(data, backupName('-photos'));
        toast(`✅ 写真込みで書き出しました（写真${(data.photos || []).length}枚）`);
      } catch (err) {
        toast('⚠️ 書き出せませんでした: ' + (err && err.message || err));
      } finally { btn.disabled = false; }
    });
    $('#backup-import').addEventListener('click', () => $('#backup-file').click());
    $('#backup-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const r = await restoreBackup(data);
        toast(r.added || r.photos
          ? `✅ 読み込みました（記録${r.added}件・写真${r.photos}枚を追加・更新）`
          : '追加の記録はありませんでした（すべて登録済み）');
        refreshCurrent();
      } catch (err) {
        toast('⚠️ 読み込めませんでした: ' + (err && err.message || err));
      }
    });

    // クラウド同期の初期化（既存ログインがあればセッションを復元して同期）
    if (typeof Cloud !== 'undefined') {
      Cloud.init();
      // 同期が済んだら、ホーム・地図のフォロー中の投稿と写真を裏で先読みしておく
      // （タブを開いたときの読み込み待ちを短くする。1セッション1回だけ）
      let warmed = false;
      Cloud.onStatus((s) => {
        if (s === 'synced' && !warmed) { warmed = true; setTimeout(() => Views.warmNetwork(), 500); }
      });
    }

    // サービスワーカー登録（PWA: ホーム画面追加・オフライン起動）
    // ※ https または localhost でのみ有効。LANのhttpでは無視される
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        // 起動のたびに新バージョンを確認（PWAはこれをしないと古いSWが残り続ける）
        reg.update().catch(() => {});
        // 新しいSWに切り替わったら一度だけ自動リロードして、全ファイルを最新に揃える
        let reloaded = false, reloadPending = false;
        const tryReload = () => {
          if (reloaded) return;
          // 記録の入力中（写真・店名・評価あり）は保存が終わるまでリロードを待つ
          if (typeof Register !== 'undefined' && Register.isDirty && Register.isDirty()) {
            if (!reloadPending) { reloadPending = true; toast('新しいバージョンがあります。記録を保存すると切り替わります'); }
            return;
          }
          reloaded = true;
          location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', tryReload);
        document.addEventListener('bitemap:saved', () => { if (reloadPending) tryReload(); });
      }).catch(() => { /* 非対応環境では何もしない */ });
    }

    // 起動時: URLの?tab=指定 → データがあれば一覧 → なければ登録タブ
    const params = new URLSearchParams(location.search);
    const urlTab = params.get('tab');
    switchTab(urlTab && document.querySelector('#view-' + urlTab)
      ? urlTab : (Store.shops().length ? 'list' : 'register'));

    // 共有リンク(?u=ユーザー名)で開かれた場合は、その人の公開プロフィールを表示
    const shareUser = params.get('u');
    if (shareUser) Views.showPublicProfile(shareUser);

    // 初回起動の案内（一度だけ。共有リンクで開いた時はプロフィール表示を優先して出さない）
    // ※「見た」フラグは閉じた時に立てる。初回はSW登録直後の自動リロードが入るため、
    //   表示した時に立てるとリロード後に消えてしまう
    const welcome = $('#welcome-modal');
    if (!shareUser && !localStorage.getItem('bm-welcomed')) {
      welcome.classList.remove('hidden');
    }
    const welcomeDone = () => localStorage.setItem('bm-welcomed', '1');
    welcome.addEventListener('click', (e) => {
      // ✕ボタンや背景タップで閉じた場合もフラグを立てる
      if (e.target === welcome || e.target.closest('[data-close]')) welcomeDone();
    });
    $('#welcome-start').addEventListener('click', () => { welcomeDone(); welcome.classList.add('hidden'); });
    // 設定の「使い方を見る」からいつでも再表示できる
    $('#show-welcome').addEventListener('click', () => {
      $('#settings-modal').classList.add('hidden');
      welcome.classList.remove('hidden');
    });
  }

  function switchTab(name) {
    currentTab = name;
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + name).classList.add('active');
    // 検索タブは開くたびに最初の画面（発見グリッド）へ戻す
    if (name === 'list') Views.enterListTab();
    else if (name === 'map') Views.enterMapTab(); // 地図は毎回「自分」から
    else refreshCurrent();
  }

  function refreshCurrent() {
    if (currentTab === 'feed') Views.renderFeed();
    else if (currentTab === 'map') Views.refreshMap();
    else if (currentTab === 'list') Views.renderList();
    else if (currentTab === 'photos') Views.renderPhotos();
    else if (currentTab === 'profile') Views.renderProfile(); // 統計もプロフィール内で描画
  }

  // ---------- トースト ----------
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 3000); // 長文の案内は長めに表示できる
  }

  // ---------- サンプルデータ（動作確認用） ----------
  function placeholderPhoto(label, color) {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 600;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 800, 600);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.arc(400, 300, 200, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 64px sans-serif'; g.textAlign = 'center';
    g.fillText(label, 400, 322);
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  }

  // ---------- バックアップの作成・復元 ----------
  // 写真は長辺640pxのJPEG（データURL）にして同梱する。元画像は大きいため、
  // 別端末で「見返す・共有する」用途に十分な大きさに抑える
  async function photoToDataUrl(rec) {
    let blob = (rec.thumbV === 2 && rec.thumb) ? rec.thumb : null;
    // クラウド同期で入った写真は端末に本体が無い（URLだけ）ことがある。
    // その場合はこの端末で取得してから縮小する（書き出す本人の操作の中で完結させる）
    let src = rec.blob || null;
    if (!blob && !src && rec.remoteUrl) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(rec.remoteUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) src = await res.blob();
      } catch { src = null; }
    }
    if (!blob && src) {
      try {
        const bmp = await createImageBitmap(src);
        const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * scale));
        c.height = Math.max(1, Math.round(bmp.height * scale));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
      } catch { blob = src; }
    }
    if (!blob) return null;
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  async function buildBackup(withPhotos, onProgress) {
    const data = {
      app: 'BITEMAP', version: APP_VERSION, exportedAt: new Date().toISOString(),
      shops: Store.shops(), visits: Store.visits(), wishes: Store.wishes(), profile: Store.getProfile(),
    };
    if (!withPhotos) return data;
    const all = await Store.allPhotos();
    const photos = [];
    for (let i = 0; i < all.length; i++) {
      const rec = all[i];
      const item = { id: rec.id, shopId: rec.shopId, visitId: rec.visitId, type: rec.type || 'dish', createdAt: rec.createdAt || 0, hash: rec.hash || '' };
      const dataUrl = await photoToDataUrl(rec);
      if (dataUrl) item.data = dataUrl; else if (rec.remoteUrl) item.remoteUrl = rec.remoteUrl; else continue;
      photos.push(item);
      if (onProgress && (i % 5 === 0 || i === all.length - 1)) onProgress(i + 1, all.length);
    }
    data.photos = photos;
    // フォロー中の人の投稿の控え（ホーム・地図の表示に使う）も同梱。別端末での再現用
    const social = {};
    for (const k of ['gourmet.netCache', 'gourmet.feedCache']) { const v = localStorage.getItem(k); if (v) social[k] = v; }
    if (Object.keys(social).length) data.social = social;
    // フォロー中の人の投稿写真（公開投稿）も縮小して同梱。URLごとに1回だけ取得
    const urls = new Set();
    for (const k of Object.keys(social)) { try { for (const p of (JSON.parse(social[k]).posts || [])) if (p.photoUrl && /^https?:/.test(p.photoUrl)) urls.add(p.photoUrl); } catch { /* 壊れた控えは無視 */ } }
    if (urls.size) {
      const socialPhotos = {};
      let n = 0;
      for (const u of urls) {
        const dataUrl = await photoToDataUrl({ remoteUrl: u });
        if (dataUrl) socialPhotos[u] = dataUrl;
        n++;
        if (onProgress) onProgress(n, urls.size, 'フォロー中の投稿の写真');
      }
      data.socialPhotos = socialPhotos;
    }
    return data;
  }
  // ---- バックアップの検証（外部から渡されるファイルなので、形式と型を確かめてから取り込む） ----
  const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
  const DATA_IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const MAX_RECORD_CHARS = 200000;     // 1レコードのJSON上限（Firestoreの1MB制限より十分小さく）
  const MAX_PHOTO_CHARS = 6 * 1024 * 1024; // 写真1枚のデータURL上限（約4.5MB）
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : dflt);
  const numOrNull = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  // 既知の項目だけを型を確かめて写し取る（__proto__ 等の余計なキーは捨てる）
  function sanitizeRecord(kind, r) {
    if (!isPlain(r) || typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
    if (JSON.stringify(r).length > MAX_RECORD_CHARS) return null;
    const base = { id: r.id, createdAt: num(r.createdAt, 0, 1e13, Date.now()), updatedAt: num(r.updatedAt, 0, 1e13, 0) };
    if (kind === 'shop') {
      return Object.assign(base, {
        name: str(r.name, 200), address: str(r.address, 500), lat: numOrNull(r.lat), lon: numOrNull(r.lon),
        country: str(r.country, 50) || '日本', pref: str(r.pref, 50), city: str(r.city, 100), station: str(r.station, 100),
        shopGenre: str(r.shopGenre, 50) || 'その他', favorite: !!r.favorite, status: str(r.status, 20) || 'open', osmId: str(r.osmId, 80),
        casual: num(r.casual, 0, 5, 0), atmosphere: num(r.atmosphere, 0, 5, 0), speed: num(r.speed, 0, 5, 0),
      });
    }
    if (kind === 'visit') {
      if (typeof r.shopId !== 'string' || !ID_RE.test(r.shopId)) return null;
      const dt = new Date(r.datetime); if (isNaN(dt)) return null;
      return Object.assign(base, {
        shopId: r.shopId, datetime: dt.toISOString(),
        dishGenres: Array.isArray(r.dishGenres) ? r.dishGenres.filter(g => typeof g === 'string').map(g => g.slice(0, 50)).slice(0, 20) : [],
        rating: num(r.rating, 0, 5, 0), comment: str(r.comment, 2000), visitType: str(r.visitType, 30) || '店内飲食',
      });
    }
    if (kind === 'wish') {
      return Object.assign(base, {
        name: str(r.name, 200), lat: numOrNull(r.lat), lon: numOrNull(r.lon), genre: str(r.genre, 100),
        fromUsername: str(r.fromUsername, 30), postId: str(r.postId, 80),
      });
    }
    return null;
  }
  async function restoreBackup(data) {
    if (!isPlain(data) || data.app !== 'BITEMAP') throw new Error('BITEMAPのバックアップファイルではありません');
    // 新しい方を採用して取り込む（既存の記録は消さない）
    let added = 0;
    const merge = (kind, locals, list) => {
      const map = new Map(locals.map(x => [x.id, x]));
      for (const raw of (Array.isArray(list) ? list : [])) {
        const r = sanitizeRecord(kind, raw);
        if (!r) continue;
        const l = map.get(r.id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) { Store.applyRemote(kind, r); added++; }
      }
    };
    merge('shop', Store.rawShops(), data.shops);
    merge('visit', Store.rawVisits(), data.visits);
    merge('wish', Store.rawWishes(), data.wishes);
    // プロフィールは名前・自己紹介・アイコンだけ取り込む。@ユーザー名はクラウド側の予約と結びついているため
    // ファイルからは復元せず、ログイン時にクラウドから戻す
    if (isPlain(data.profile) && !Store.getProfile().username) {
      const pf = { name: str(data.profile.name, 50) || 'BITEMAP', bio: str(data.profile.bio, 500) };
      if (typeof data.profile.avatar === 'string' && DATA_IMG_RE.test(data.profile.avatar) && data.profile.avatar.length < 300000) pf.avatar = data.profile.avatar;
      Store.setProfile(pf);
    }
    // 写真: 同じ訪問に同じ指紋（または同じ撮影登録時刻）の写真があれば二重に入れない
    let photos = 0;
    const PHOTO_TYPES = ['dish', 'exterior', 'interior', 'menu'];
    for (const p of (Array.isArray(data.photos) ? data.photos : [])) {
      if (!isPlain(p) || typeof p.visitId !== 'string' || typeof p.shopId !== 'string' || !ID_RE.test(p.visitId) || !ID_RE.test(p.shopId)) continue;
      if (!Store.visits().some(v => v.id === p.visitId)) continue;
      // 写真データは画像のデータURLだけを受け付ける（外部URLへ通信させない・巨大データを入れない）
      if (typeof p.data !== 'string' || p.data.length > MAX_PHOTO_CHARS || !DATA_IMG_RE.test(p.data)) continue;
      const have = await Store.photosOfVisit(p.visitId);
      if (have.some(x => (p.hash && x.hash === p.hash) || (p.createdAt && x.createdAt === p.createdAt))) continue;
      let blob = null;
      try { blob = await (await fetch(p.data)).blob(); } catch { blob = null; }
      if (!blob || !blob.type.startsWith('image/')) continue;
      const ptype = PHOTO_TYPES.includes(p.type) ? p.type : 'dish';
      const phash = (typeof p.hash === 'string' && /^[0-9a-f]{0,64}$/.test(p.hash)) ? p.hash : '';
      const newId = await Store.addPhoto(p.shopId, p.visitId, ptype, blob, phash);
      // 取り込んだ写真の登録時刻を元の値に揃える（並び順を保つ）
      if (p.createdAt && newId) { try { await Store.setPhotoCreatedAt(newId, p.createdAt); } catch { /* 任意 */ } }
      photos++;
    }
    // 他人の投稿の控え: 決まった2つのキーだけ、投稿配列の形をしているものだけ取り込む
    if (isPlain(data.social)) {
      for (const k of ['gourmet.netCache', 'gourmet.feedCache']) {
        if (typeof data.social[k] !== 'string' || localStorage.getItem(k)) continue;
        let obj;
        try { obj = JSON.parse(data.social[k]); } catch { continue; }
        if (!isPlain(obj) || !Array.isArray(obj.posts)) continue;
        obj.posts = obj.posts.filter(isPlain).slice(0, 300);
        if (isPlain(data.socialPhotos)) {
          for (const p of obj.posts) {
            const d = p.photoUrl && data.socialPhotos[p.photoUrl];
            if (typeof d === 'string' && d.length < MAX_PHOTO_CHARS && DATA_IMG_RE.test(d)) p.photoUrl = d;
          }
        }
        try { localStorage.setItem(k, JSON.stringify({ posts: obj.posts, time: 0 })); } catch { /* 容量超過なら控えは諦める */ }
      }
    }
    return { added, photos };
  }

  async function seedSample() {
    toast('サンプルデータを作成中…');
    const now = new Date();
    const iso = (mAgo, day, h) => new Date(now.getFullYear(), now.getMonth() - mAgo, day, h, 0).toISOString();

    const samples = [
      {
        shop: { name: '麺屋 こがね', lat: 35.6595, lon: 139.7005, pref: '東京都', city: '渋谷区', station: '渋谷駅', shopGenre: 'ラーメン店', address: '東京都渋谷区道玄坂2丁目', favorite: true, casual: 5, atmosphere: 3, speed: 5 },
        visits: [
          { datetime: iso(0, 3, 12), dishGenres: ['ラーメン'], rating: 5, comment: '鶏白湯が絶品。麺の硬さも完璧だった。', label: '🍜', color: '#c0392b' },
          { datetime: iso(2, 15, 19), dishGenres: ['つけ麺'], rating: 4, comment: 'つけ麺も美味しいがラーメンの方が好み。', label: '🍜', color: '#d35400' },
          { datetime: iso(5, 8, 12), dishGenres: ['ラーメン'], rating: 5, comment: '初訪問。行列に納得の味。', label: '🍜', color: '#c0392b' },
        ],
      },
      {
        shop: { name: '寿司処 まる海', lat: 35.6654, lon: 139.7707, pref: '東京都', city: '中央区', station: '築地駅', shopGenre: '寿司店', address: '東京都中央区築地4丁目', favorite: true, casual: 2, atmosphere: 5, speed: 3 },
        visits: [
          { datetime: iso(1, 20, 13), dishGenres: ['寿司'], rating: 5, comment: '中トロと穴子が最高。ランチセットがお得。', label: '🍣', color: '#16a085' },
        ],
      },
      {
        shop: { name: '炭火焼肉 炎', lat: 35.6938, lon: 139.7034, pref: '東京都', city: '新宿区', station: '新宿駅', shopGenre: '焼肉店', address: '東京都新宿区歌舞伎町1丁目', favorite: false },
        visits: [
          { datetime: iso(0, 10, 19), dishGenres: ['焼肉'], rating: 4, comment: 'ハラミが柔らかい。タレは甘め。', label: '🥩', color: '#8e44ad' },
          { datetime: iso(3, 22, 20), dishGenres: ['焼肉'], rating: 4, comment: '', label: '🥩', color: '#7f3f98' },
        ],
      },
      {
        shop: { name: 'カフェ ひだまり', lat: 35.6684, lon: 139.7126, pref: '東京都', city: '港区', station: '表参道駅', shopGenre: 'カフェ', address: '東京都港区北青山3丁目', favorite: false, casual: 4, atmosphere: 5, speed: 2 },
        visits: [
          { datetime: iso(1, 5, 15), dishGenres: ['カフェメニュー', 'スイーツ'], rating: 3, comment: 'チーズケーキは普通。雰囲気は良い。', label: '☕', color: '#a67c52' },
        ],
      },
      {
        shop: { name: '洋食 グリル大宮', lat: 35.9063, lon: 139.6238, pref: '埼玉県', city: 'さいたま市', station: '大宮駅', shopGenre: 'ファミリーレストラン', address: '埼玉県さいたま市大宮区', favorite: false },
        visits: [
          { datetime: iso(4, 12, 12), dishGenres: ['定食'], rating: 4, comment: 'オムライスの卵がふわとろ。', label: '🍳', color: '#e67e22' },
        ],
      },
    ];

    try {
      for (const s of samples) {
        const shop = Store.addShop(s.shop);
        for (const v of s.visits) {
          const visit = Store.addVisit({
            shopId: shop.id, datetime: v.datetime, dishGenres: v.dishGenres,
            rating: v.rating, comment: v.comment, visitType: '店内飲食',
          });
          const blob = await placeholderPhoto(v.label, v.color);
          await Store.addPhoto(shop.id, visit.id, 'dish', blob);
        }
      }
      toast('✅ サンプルデータを登録しました');
    } catch (e) {
      console.error(e);
      toast('⚠️ サンプルデータの作成に失敗しました: ' + (e && e.message || e));
    }
    refreshCurrent();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { switchTab, refreshCurrent, toast, seedSample, buildBackup, restoreBackup };
})();
