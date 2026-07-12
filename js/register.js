// =====================================================
// 登録フロー（仕様書v2 §4）
//  フローA: 写真のGPS → 周辺店舗候補から選択
//  フローB: 位置情報なし → 名前検索 / 地図で指定（主要フロー）
// =====================================================
const Register = (() => {
  const $ = (sel) => document.querySelector(sel);

  // 選択中の写真: [{ file, url, type }]
  let pendingPhotos = [];
  // 選択中の店舗情報
  let selected = null; // { existingShopId?, osmId, name, address, lat, lon, pref, city, station, country }
  // 訪問日（YYYY-MM-DD）: 入力欄は廃止し、写真の撮影日→なければ当日を自動記録
  let visitDate = '';
  let currentRating = 0; // 味の評価（訪問ごと・必須）
  // 店の性質の評価（任意・店舗に1つ）: 0 = 未評価
  const AXES = ['casual', 'atmosphere', 'speed'];
  let shopRatings = { casual: 0, atmosphere: 0, speed: 0 };
  // AIが料理ジャンルを判定済みか（OSMタグ推定で上書きしないためのフラグ）
  let aiClassified = false;
  // AI/OSM由来の店舗ジャンル（UIには出さず内部保持。地図ラベルのフォールバック用）
  let derivedShopGenre = '';
  // 料理ジャンルの選択状態（2段階ピッカーと共有）
  const selectedDishGenres = new Set();
  let dishPicker = null;
  // 利用者が手動でジャンルを触ったか。trueの間はAI判定・OSM推定で上書きしない
  let userTouchedGenres = false;
  // 現在の選択がAI判定・OSM推定による自動入力か（手動選択が始まったら破棄する）
  let autoFilledGenres = false;
  // 店舗が自動選択されたか（案内メッセージの出し分けに使用）
  let autoPicked = false;
  // 直近に解析した写真のGPS（名前検索の基準位置に使う）
  let lastGps = null;
  // 検索の世代番号（古い検索の遅延結果で新しい結果を上書きしないため）
  let searchSeq = 0;
  // 予測検索の状態（入力が止まったら自動で候補を出す）
  let suggestSeq = 0;
  let suggestTimer = null;
  let suggestRef = null; // 予測検索の基準位置（一度だけ取得して使い回す）

  // 現在地の取得（拒否・失敗時は null。検索精度向上のための任意情報）
  function getCurrentPos(timeout = 3500) {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolve(null),
        { timeout, maximumAge: 300000 }
      );
    });
  }

  // ---------- 初期化 ----------
  function init() {
    $('#photo-input').addEventListener('change', (e) => addFiles(e.target.files));
    $('#camera-input').addEventListener('change', (e) => addFiles(e.target.files));
    // 独自カメラ画面の操作
    $('#cam-shutter').addEventListener('click', capturePhoto);
    $('#cam-library').addEventListener('click', () => { stopCamera(); $('#photo-input').click(); });
    $('#cam-close').addEventListener('click', () => { stopCamera(); App.switchTab('profile'); });

    // 店舗検索（店舗名欄に統合: 店舗名を入力して検索 → 下に候補を表示）
    $('#shop-search-btn').addEventListener('click', doSearch);
    $('#f-shop-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    // 予測検索: 入力が止まったら自動で候補を表示（Chromeの検索補完風）
    // 日本語入力の変換中（composition中）は発火させず、確定したタイミングで検索する
    const nameInput = $('#f-shop-name');
    let composing = false;
    const queueSuggest = () => {
      clearTimeout(suggestTimer);
      const q = nameInput.value.trim();
      if (q.length < 2) { suggestSeq++; return; } // 短すぎる入力では出さない
      suggestTimer = setTimeout(() => suggest(q), 400);
    };
    nameInput.addEventListener('compositionstart', () => { composing = true; });
    nameInput.addEventListener('compositionend', () => { composing = false; queueSuggest(); });
    nameInput.addEventListener('input', () => { if (!composing) queueSuggest(); });


    // 料理ジャンル: カテゴリ→ジャンルの2段階選択
    dishPicker = Api.buildGenrePicker($('#f-dish-genres'), selectedDishGenres);
    // 手動操作を検知（capture指定でピッカー本体の処理より先に実行される）
    $('#f-dish-genres').addEventListener('click', (e) => {
      if (e.target.closest('.chip[data-g]')) {
        userTouchedGenres = true;
        // AI判定・自動推定で入った初期値は、手動で選び始めた時点で消す
        // （自動のラーメン等が残って手動の選択と混ざるのを防ぐ）
        if (autoFilledGenres) { selectedDishGenres.clear(); autoFilledGenres = false; }
      } else if (e.target.closest('.chip.cat')) {
        // カテゴリを開いた＝選択操作中。以降はAI判定・自動推定で上書きしない
        userTouchedGenres = true;
      }
    }, true);

    // 詳細欄（コメント・住所など）の開閉
    $('#detail-toggle').addEventListener('click', () => {
      const fields = $('#detail-fields');
      const open = fields.classList.toggle('hidden'); // true = 閉じた
      $('#detail-toggle').textContent = open
        ? '▸ もっと見る（コメント・住所など）'
        : '▾ 閉じる（コメント・住所など）';
    });

    // お気に入りの★トグル（店名の右の星）
    $('#f-fav-btn').addEventListener('click', () => {
      const cb = $('#f-fav');
      cb.checked = !cb.checked;
      updateFavStar();
    });

    // 評価スター（味）＋ 店の評価3軸
    mountStars($('#f-rating'), 0, v => { currentRating = v; });
    mountAxisStars();

    // 訪問日の初期値 = 今日（写真を選ぶと撮影日に更新される）
    visitDate = toLocalInput(new Date());

    $('#save-btn').addEventListener('click', save);
  }

  // お気に入り★（店名右）の表示を #f-fav の状態に合わせる
  function updateFavStar() {
    const on = $('#f-fav').checked;
    const btn = $('#f-fav-btn');
    btn.textContent = on ? '★' : '☆';
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // 店の評価3軸のスターを（再）描画する
  function mountAxisStars() {
    for (const k of AXES) {
      mountStars($('#f-ax-' + k), shopRatings[k], v => { shopRatings[k] = v; });
    }
  }

  function mountStars(el, initial, onChange) {
    el.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '★'; b.dataset.v = i;
      b.addEventListener('click', () => {
        el.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.v <= i));
        onChange(i);
      });
      if (i <= initial) b.classList.add('on');
      el.appendChild(b);
    }
  }

  // 訪問は日付のみ（YYYY-MM-DD）で扱う
  function toLocalInput(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // 下のバー中央の＋から呼ぶ: 写真の撮影/選択画面（端末のカメラ・ライブラリ）を開く
  // ---------- 独自カメラ画面（＋から起動） ----------
  let camStream = null;
  // ＋タップで呼ぶ: アプリ内カメラを開く。撮影ボタン＋右下に「写真から選択」＋×
  function openCamera() {
    const overlay = $('#camera-overlay');
    const video = $('#cam-video');
    $('#cam-error').classList.add('hidden');
    overlay.classList.remove('hidden');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      overlay.classList.add('hidden'); $('#camera-input').click(); return; // 非対応→端末カメラ
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => { camStream = stream; video.srcObject = stream; video.play().catch(() => {}); })
      .catch(() => {
        // 権限拒否・非対応 → 端末標準のカメラにフォールバック
        overlay.classList.add('hidden');
        $('#camera-input').click();
      });
  }
  function stopCamera() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    $('#cam-video').srcObject = null;
    $('#camera-overlay').classList.add('hidden');
  }
  function capturePhoto() {
    const video = $('#cam-video'), canvas = $('#cam-canvas');
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return; // まだ映像が来ていない
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      stopCamera();
      const file = new File([blob], 'camera-' + Date.now() + '.jpg', { type: 'image/jpeg' });
      addFiles([file]); // 記録の入力画面へ進む（addFiles内でタブ切替）
    }, 'image/jpeg', 0.9);
  }

  // ---------- 写真の追加・EXIF解析 ----------
  async function addFiles(fileList) {
    const before = pendingPhotos.length;
    const dupMsgs = [];
    for (const f of fileList) {
      if (!f.type.startsWith('image/')) continue;
      const hash = await Api.fileHash(f);
      // 二重登録の防止: 登録済みの写真・選択済みの写真は追加しない
      if (hash) {
        const dup = Store.findPhotoByHash(hash);
        if (dup) {
          const shop = Store.getShop(dup.shopId);
          const visit = Store.visits().find(v => v.id === dup.visitId);
          const when = visit ? new Date(visit.datetime).toLocaleDateString('ja-JP') : '';
          dupMsgs.push(`「${f.name}」は${shop ? `「${shop.name}」${when ? `（${when}）` : ''}に` : ''}すでに登録されています`);
          continue;
        }
        if (pendingPhotos.some(p => p.hash === hash)) {
          dupMsgs.push(`「${f.name}」はすでに選択されています`);
          continue;
        }
      }
      pendingPhotos.push({ file: f, url: URL.createObjectURL(f), type: 'dish', hash });
    }
    const dupBox = $('#dup-status');
    if (dupMsgs.length) {
      dupBox.classList.remove('hidden');
      dupBox.textContent = '⚠️ ' + dupMsgs.join(' ／ ');
    } else {
      dupBox.classList.add('hidden');
    }
    renderPreviews();
    // 写真を撮った／選んだら、記録の入力画面へ進める
    if (pendingPhotos.length > before) {
      App.switchTab('register');
      window.scrollTo({ top: 0 });
    }
    await analyzeExif();
  }

  function renderPreviews() {
    const box = $('#photo-previews');
    box.innerHTML = '';
    pendingPhotos.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'photo-preview';
      div.innerHTML = `
        <img src="${p.url}" alt="">
        <button type="button" class="remove" data-i="${i}">✕</button>`;
      div.querySelector('.remove').addEventListener('click', () => {
        URL.revokeObjectURL(p.url);
        pendingPhotos.splice(i, 1);
        renderPreviews();
      });
      box.appendChild(div);
    });
  }

  async function analyzeExif() {
    if (!pendingPhotos.length) { $('#exif-status').classList.add('hidden'); return; }
    const status = $('#exif-status');
    status.classList.remove('hidden');
    status.classList.remove('warn');
    status.textContent = '🔎 写真を解析しています…';

    let gps = null, earliest = null;
    for (const p of pendingPhotos) {
      const ex = await Api.parseExif(p.file);
      if (!gps && ex.lat != null && ex.lon != null) gps = { lat: ex.lat, lon: ex.lon };
      if (ex.date && (!earliest || ex.date < earliest)) earliest = ex.date;
    }
    lastGps = gps; // 名前検索の基準位置としても使う

    // 訪問日 = 撮影日として自動記録（あとから一覧の✏️編集で修正可能）
    if (earliest) visitDate = toLocalInput(new Date(earliest));

    if (gps) {
      status.classList.remove('hidden');
      status.innerHTML = `位置情報から周辺の店舗候補を検索中…`;
      await loadCandidates(gps.lat, gps.lon);
      status.classList.add('hidden'); // 案内は消し、候補だけ表示する
    } else {
      status.classList.add('hidden'); // 位置情報なしの案内は表示しない
    }

    await classifyPhotos();
  }

  // AIによる料理ジャンル判定（仕様書v2 §5）。判定結果はすべて修正可能。
  async function classifyPhotos() {
    const ai = $('#ai-status');
    const dishPhoto = pendingPhotos.find(p => p.type === 'dish') || pendingPhotos[0];
    if (!dishPhoto) { ai.classList.add('hidden'); return; }

    if (!Api.hasApiKey()) { ai.classList.add('hidden'); return; } // キー未設定時は案内を出さない

    ai.classList.remove('hidden', 'warn');
    ai.textContent = '🤖 AIが料理ジャンルを判定しています…';
    try {
      const result = await Api.classifyDishPhoto(dishPhoto.file);
      if (result && (result.dishGenres.length || result.shopGenre)) {
        if (result.shopGenre) derivedShopGenre = result.shopGenre; // 内部保持のみ
        if (userTouchedGenres) {
          // 手動選択を優先: AIの結果では上書きしない（参考として表示のみ）
          ai.innerHTML = `🤖 AIの判定は <b>${result.dishGenres.map(esc).join('・') || '－'}</b> でした（手動で選択中のためそのままにしています）。`;
        } else {
          aiClassified = true;
          autoFilledGenres = true;
          selectedDishGenres.clear();
          result.dishGenres.forEach(g => selectedDishGenres.add(g));
          dishPicker.reset();
          ai.innerHTML = `🤖 AI判定: <b>${result.dishGenres.map(esc).join('・') || '－'}</b>`
            + ' — 違っていたら下のフォームで修正できます。';
        }
      } else {
        ai.classList.add('warn');
        ai.textContent = '🤖 AIはこの写真からジャンルを特定できませんでした。下のフォームから選択してください。';
      }
    } catch (e) {
      console.error('AI classification failed:', e);
      ai.classList.add('warn');
      const msg = (e && e.status === 401) ? 'APIキーが無効です。⚙️ から設定を確認してください。'
        : (e && e.status === 429) ? 'レート制限中です。しばらく待ってから再度お試しください。'
        : '通信エラーのため判定できませんでした。';
      ai.textContent = '⚠️ AI判定に失敗: ' + msg;
    }
  }

  // ---------- フローA: 周辺候補 ----------
  async function loadCandidates(lat, lon) {
    const box = $('#shop-candidates');
    box.innerHTML = '<p class="hint">検索中…</p>';
    try {
      // 登録済み店舗（200m以内）を先頭に表示
      const existing = Store.shops()
        .filter(s => s.lat != null && Store.distMeters(lat, lon, s.lat, s.lon) < 200)
        .map(s => ({ shop: s, distance: Store.distMeters(lat, lon, s.lat, s.lon) }))
        .sort((a, b) => a.distance - b.distance);

      const results = await Api.nearbyShops(lat, lon, 200);
      renderCandidates(box, existing, results, '周辺に店舗候補が見つかりませんでした。「🔍 名前で検索」をお試しください。');
      autoSelectBest(box, existing, results);
    } catch (e) {
      box.innerHTML = '<p class="hint">⚠️ 店舗検索に失敗しました（通信エラー）。「🔍 名前で検索」または「🗺️ 地図で指定」をご利用ください。</p>';
    }
  }

  function renderCandidates(box, existing, results, emptyMsg) {
    box.innerHTML = '';
    const seenOsm = new Set();

    const markSelected = (div) => {
      box.querySelectorAll('.candidate').forEach(x => x.classList.remove('selected'));
      div.classList.add('selected');
    };

    for (const { shop, distance } of existing) {
      if (shop.osmId) seenOsm.add(shop.osmId);
      const div = document.createElement('div');
      div.className = 'candidate';
      div.innerHTML = `
        <div class="c-main">
          <div class="c-name">${esc(shop.name)}<span class="badge">登録済み・再訪</span></div>
          <div class="c-sub">訪問${Store.visitCount(shop.id)}回　味★${Store.avgRating(shop.id) || '－'}</div>
        </div>
        <div class="c-dist">${distance != null ? Math.round(distance) + 'm' : ''}</div>`;
      div.addEventListener('click', () => { autoPicked = false; markSelected(div); chooseExisting(shop); });
      box.appendChild(div);
    }

    for (const c of results) {
      if (c.osmId && seenOsm.has(c.osmId)) continue;
      const div = document.createElement('div');
      div.className = 'candidate';
      div.innerHTML = `
        <div class="c-main">
          <div class="c-name">${esc(c.name)}</div>
          <div class="c-sub">${esc(c.amenity || '')}${c.cuisine ? '・' + esc(String(c.cuisine).split(/[;,]/).join('・')) : ''}${c.address ? '・' + esc(c.address) : ''}</div>
        </div>
        <div class="c-dist">${c.distance != null && isFinite(c.distance) ? Math.round(c.distance) + 'm' : ''}</div>`;
      div.addEventListener('click', () => { autoPicked = false; markSelected(div); chooseCandidate(c); });
      box.appendChild(div);
    }

    if (!box.children.length) box.innerHTML = `<p class="hint">${emptyMsg}</p>`;
  }

  // 一番近い候補を自動選択する（操作を最小化 — 写真と★評価だけで登録できる導線）
  // 登録済み店舗が近くにある場合はそちらを優先（再訪の可能性が高いため）
  function autoSelectBest(box, existing, results) {
    const els = box.querySelectorAll('.candidate');
    if (!els.length) return;
    let idx = 0;
    if (existing.length && results.length) {
      // 既存店舗は30mのハンデ付きで優先
      idx = (existing[0].distance <= results[0].distance + 30) ? 0 : existing.length;
    }
    const el = els[Math.min(idx, els.length - 1)];
    autoPicked = true;
    el.classList.add('selected');
    if (idx < existing.length) chooseExisting(existing[idx].shop);
    else chooseCandidate(results[idx - existing.length] || results[0]);
    // 残る操作は★評価だけなので、評価欄まで自動スクロール
    setTimeout(() => {
      const rating = document.querySelector('#f-rating');
      if (rating) rating.scrollIntoView({ block: 'center' });
    }, 600);
  }

  // ---------- 予測検索（入力中の自動候補） ----------
  async function suggest(q) {
    const mySeq = ++suggestSeq;
    const box = $('#shop-candidates');

    // 登録済み店舗は即時に出せる（再訪の最短導線）
    const existing = Store.shops()
      .filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 3)
      .map(s => ({ shop: s, distance: null }));

    // 基準位置: 写真のGPS → 現在地（1回だけ取得して以後使い回す）
    if (!suggestRef) suggestRef = lastGps || await getCurrentPos(2500);
    if (mySeq !== suggestSeq) return;

    let results = [];
    try { results = await Api.suggestShops(q, suggestRef); } catch { /* 通信エラー時は登録済みのみ */ }
    if (mySeq !== suggestSeq) return;                        // 入力が進んだ・手動検索が始まった
    if ($('#f-shop-name').value.trim() !== q) return;        // 入力値が変わっていたら破棄

    if (!existing.length && !results.length) return; // 何もなければ表示を変えない
    renderCandidates(box, existing, results, '');
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '💡 入力に合わせた予測候補です。見つからないときは🔍検索でさらに広く探せます。';
    box.appendChild(p);
  }

  // ---------- フローB: 名前検索（複数の情報源を統合、個人店対応） ----------
  async function doSearch() {
    clearTimeout(suggestTimer);
    suggestSeq++; // 進行中の予測検索を無効化（手動検索を優先）
    const q = $('#f-shop-name').value.trim();
    const box = $('#shop-candidates');
    if (!q) { box.innerHTML = '<p class="hint">店舗名を入力してから🔍検索を押してください。</p>'; return; }
    box.innerHTML = '<p class="hint">🔎 検索中…（周辺の店舗情報も含めて探しています）</p>';

    // 登録済み店舗を先に（§4.3: 再訪の登録を最短に）
    const existing = Store.shops()
      .filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
      .map(s => ({ shop: s, distance: null }));

    // 基準位置の決定: 写真のGPS →「店名 地名」の地名 → 現在地
    let ref = lastGps;
    let nameQuery = q;
    if (!ref) {
      const parts = q.split(/[\s　]+/);
      if (parts.length >= 2) {
        const loc = await Api.searchPlaces(parts[parts.length - 1]).catch(() => []);
        if (loc.length && loc[0].lat != null) {
          ref = { lat: loc[0].lat, lon: loc[0].lon };
          nameQuery = parts.slice(0, -1).join(' ');
        }
      }
    }
    if (!ref) ref = await getCurrentPos();

    const emptyMsg = '見つかりませんでした。「店名 地名」（例: ○○軒 渋谷）で再検索するか、「🗺️ 地図で指定」から位置を指定して店舗名を入力してください。';
    const mySeq = ++searchSeq;

    // まず高速な検索（Photon + Nominatim）を即表示
    let results = [];
    try { results = await Api.searchShopsFast(q, nameQuery, ref); } catch { /* 通信エラー時は登録済みのみ */ }
    if (mySeq !== searchSeq) return; // 新しい検索が始まっていたら破棄
    renderCandidates(box, existing, results, emptyMsg);

    // Google検索の状態を表示（エラー原因の切り分け用）
    const gs = Api.googleSearchStatus();
    if (gs.state === 'error') {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = `⚠️ Googleマップ検索でエラー: ${gs.message}｜⚙️のキーが正しいか、Google Cloudで「Places API (New)」の有効化と課金設定が済んでいるか確認してください。`;
      box.appendChild(p);
    } else if (gs.state === 'disabled' && !results.length && !existing.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '💡 ⚙️からGoogle Maps APIキーを設定すると、Googleマップのデータからも検索できるようになります（個人店に強い）。';
      box.appendChild(p);
    }

    // 周辺の詳細検索（個人店に強いが遅い）を裏で実行し、結果が来たら追加表示
    if (ref) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = '🔎 周辺の店舗をさらに検索中…';
      box.appendChild(note);
      const more = await Api.searchShopsNearby(nameQuery, ref).catch(() => []);
      note.remove();
      if (mySeq !== searchSeq) return;      // 別の検索が始まった
      if (selected) return;                  // すでに店舗選択済みなら邪魔しない
      if (more.length) {
        results = Api.mergeCandidates([more, results], ref);
        renderCandidates(box, existing, results, emptyMsg);
      }
    }
  }

  // ---------- 店舗の選択 ----------
  function chooseExisting(shop) {
    selected = { existingShopId: shop.id, osmId: shop.osmId, name: shop.name, address: shop.address, lat: shop.lat, lon: shop.lon, pref: shop.pref, city: shop.city, station: shop.station, country: shop.country };
    $('#f-shop-name').value = shop.name;
    $('#f-address').value = shop.address || '';
    $('#f-station').value = shop.station || '';
    $('#f-pref').value = shop.pref || '';
    $('#f-city').value = shop.city || '';
    derivedShopGenre = ''; // 既存店舗のジャンルはそのまま維持
    $('#f-fav').checked = !!shop.favorite;
    updateFavStar();
    // 店の評価は既存の値を引き継ぐ（再訪時は入力不要）
    shopRatings = { casual: shop.casual || 0, atmosphere: shop.atmosphere || 0, speed: shop.speed || 0 };
    mountAxisStars();
    const auto = autoPicked ? '🤖 一番近い店舗を自動選択しました。違う場合は上の候補から選び直せます。\n' : '';
    note(`${auto}🔁 「${shop.name}」への再訪として記録します（訪問${Store.visitCount(shop.id)}回目 → ${Store.visitCount(shop.id) + 1}回目）`);
    backfillMissing(shop);
  }

  // 登録済み店舗の欠損項目（最寄駅・住所・地域）を再取得して補完する。
  // 初回登録時にAPIが失敗して空のまま保存されたケースの救済（保存時に永続化される）。
  async function backfillMissing(shop) {
    if (shop.lat == null || shop.lon == null) return;
    const needStation = !shop.station;
    const needGeo = !shop.pref || !shop.city || !shop.address;
    if (!needStation && !needGeo) return;

    const stationInput = $('#f-station');
    if (needStation) stationInput.placeholder = '🔎 最寄駅を検索中…';
    try {
      const [geo, station] = await Promise.all([
        needGeo ? Api.reverseGeocode(shop.lat, shop.lon) : Promise.resolve({}),
        needStation ? Api.nearestStation(shop.lat, shop.lon) : Promise.resolve(''),
      ]);
      // ユーザーが手入力済みの欄は上書きしない
      if (needStation && station && !stationInput.value) stationInput.value = station;
      if (geo.pref && !$('#f-pref').value) $('#f-pref').value = geo.pref;
      if (geo.city && !$('#f-city').value) $('#f-city').value = geo.city;
      if (geo.address && !$('#f-address').value) $('#f-address').value = geo.address;
      // 取得できた値は店舗データにも保存し、選択しただけで欠損が直るようにする
      const patch = {};
      if (needStation && station && !shop.station) patch.station = station;
      if (geo.pref && !shop.pref) patch.pref = geo.pref;
      if (geo.city && !shop.city) patch.city = geo.city;
      if (geo.address && !shop.address) patch.address = geo.address;
      if (Object.keys(patch).length) Store.updateShop(shop.id, patch);
    } finally {
      stationInput.placeholder = '自動入力されます';
    }
  }

  async function chooseCandidate(c) {
    // OSMタグからのジャンル推定（AIが判定済みの場合は上書きしない — §5）
    {
      const g = Api.guessGenres(c);
      if (g.shop) derivedShopGenre = g.shop; // 内部保持のみ
      // 地図データからの推定は「まだ何も選ばれていないとき」だけ初期値として設定
      // （手動選択・AI判定を上書きしない）
      if (g.dish && !aiClassified && !userTouchedGenres && selectedDishGenres.size === 0) {
        selectedDishGenres.add(g.dish);
        autoFilledGenres = true;
        dishPicker.reset();
      }
    }
    const auto = autoPicked ? '🤖 一番近い店舗を自動選択しました。違う場合は上の候補から選び直せます。\n' : '';
    note(`${auto}✅ 「${c.name}」を選択しました。あとは★評価をつけて保存するだけです。`);
    await applyLocation(c);
  }

  async function applyLocation(c) {
    selected = { existingShopId: null, osmId: c.osmId || '', name: c.name || '', address: c.address || '', lat: c.lat, lon: c.lon, pref: '', city: '', station: '', country: '日本' };
    $('#f-shop-name').value = c.name || '';
    if (c.address) $('#f-address').value = c.address;

    if (c.lat != null && c.lon != null) {
      // 逆ジオコーディング＋最寄駅（店舗確定時に1回のみ — §15.1）
      const stationInput = $('#f-station');
      stationInput.placeholder = '🔎 最寄駅を検索中…';
      try {
        const [geo, station] = await Promise.all([
          Api.reverseGeocode(c.lat, c.lon),
          Api.nearestStation(c.lat, c.lon),
        ]);
        if (geo.address && !c.address) { $('#f-address').value = geo.address; selected.address = geo.address; }
        if (geo.pref) { $('#f-pref').value = geo.pref; selected.pref = geo.pref; }
        if (geo.city) { $('#f-city').value = geo.city; selected.city = geo.city; }
        if (geo.country) selected.country = geo.country;
        if (station) { stationInput.value = station; selected.station = station; }
      } finally {
        stationInput.placeholder = '自動入力されます';
      }
    }
  }

  function note(msg) {
    const n = $('#selected-shop-note');
    n.classList.remove('hidden');
    n.textContent = msg;
  }

  // ---------- 保存 ----------
  async function save() {
    const name = $('#f-shop-name').value.trim();
    // 訪問日は自動記録（写真の撮影日→なければ当日）。編集画面から修正可能
    const dtVal = visitDate || toLocalInput(new Date());
    if (!name) { App.toast('店舗名を入力してください'); return; }
    if (!currentRating) { App.toast('味の評価（★）を選択してください'); return; }

    const btn = $('#save-btn');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      // --- 店舗の確定（既存 → 照合 → 新規） ---
      let shop = selected && selected.existingShopId ? Store.getShop(selected.existingShopId) : null;
      if (!shop) {
        shop = Store.matchShop({
          osmId: selected ? selected.osmId : '',
          name,
          lat: selected ? selected.lat : null,
          lon: selected ? selected.lon : null,
        });
      }
      const shopData = {
        name,
        address: $('#f-address').value.trim(),
        station: $('#f-station').value.trim(),
        pref: $('#f-pref').value.trim(),
        city: $('#f-city').value.trim(),
        favorite: $('#f-fav').checked,
      };
      // AI/OSM由来の店舗ジャンル（UI廃止後も地図ラベルのフォールバック用に内部保存）
      if (derivedShopGenre) shopData.shopGenre = derivedShopGenre;
      // 店の評価（3軸）: つけた値のみ反映（0のままなら既存値を消さない）
      for (const k of AXES) if (shopRatings[k] > 0) shopData[k] = shopRatings[k];
      if (shop) {
        Store.updateShop(shop.id, shopData);
      } else {
        shop = Store.addShop(Object.assign(shopData, {
          lat: selected ? selected.lat : null,
          lon: selected ? selected.lon : null,
          osmId: selected ? selected.osmId : '',
          country: selected && selected.country ? selected.country : '日本',
        }));
      }

      // --- 訪問記録 ---
      const dishGenres = [...selectedDishGenres];
      const visit = Store.addVisit({
        shopId: shop.id,
        // 日付のみ入力。タイムゾーンで日付がずれないよう正午として保存
        datetime: new Date(dtVal + 'T12:00:00').toISOString(),
        dishGenres,
        rating: currentRating,
        comment: $('#f-comment').value.trim(),
        visitType: '店内飲食', // 入力欄は廃止（データ互換のため既定値を保存）
      });

      // --- 写真（圧縮して保存 — §9.1） ---
      for (const p of pendingPhotos) {
        const blob = await Api.compressImage(p.file);
        await Store.addPhoto(shop.id, visit.id, p.type, blob, p.hash);
      }

      App.toast(`✅ 「${shop.name}」に記録しました（訪問${Store.visitCount(shop.id)}回目）`);
      resetForm();
      App.switchTab('list');
    } catch (e) {
      console.error(e);
      App.toast('⚠️ 保存に失敗しました: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'この内容で記録する';
    }
  }

  function resetForm() {
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.url));
    pendingPhotos = [];
    selected = null;
    currentRating = 0;
    aiClassified = false;
    autoPicked = false;
    lastGps = null;
    renderPreviews();
    $('#photo-input').value = '';
    $('#camera-input').value = '';
    $('#dup-status').classList.add('hidden');
    $('#exif-status').classList.add('hidden');
    $('#ai-status').classList.add('hidden');
    $('#shop-candidates').innerHTML = '';
    $('#selected-shop-note').classList.add('hidden');
    clearTimeout(suggestTimer);
    suggestSeq++; // 進行中の予測検索を無効化
    ['#f-shop-name', '#f-address', '#f-station', '#f-pref', '#f-city', '#f-comment'].forEach(s => { $(s).value = ''; });
    derivedShopGenre = '';
    $('#f-fav').checked = false;
    updateFavStar();
    // 詳細欄は閉じた状態に戻す
    $('#detail-fields').classList.add('hidden');
    $('#detail-toggle').textContent = '▸ もっと見る（コメント・住所など）';
    visitDate = toLocalInput(new Date());
    selectedDishGenres.clear();
    userTouchedGenres = false;
    autoFilledGenres = false;
    dishPicker.reset();
    mountStars($('#f-rating'), 0, v => { currentRating = v; });
    shopRatings = { casual: 0, atmosphere: 0, speed: 0 };
    mountAxisStars();
  }

  // 店舗詳細から「訪問を追加」（§4.4 再訪の登録）
  function preselectShop(shopId) {
    resetForm();
    const shop = Store.getShop(shopId);
    if (shop) chooseExisting(shop);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, preselectShop, openCamera };
})();
