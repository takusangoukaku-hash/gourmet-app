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
  let miniMap = null, miniMarker = null;
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
  // 店舗が自動選択されたか（案内メッセージの出し分けに使用）
  let autoPicked = false;
  // 直近に解析した写真のGPS（名前検索の基準位置に使う）
  let lastGps = null;
  // 検索の世代番号（古い検索の遅延結果で新しい結果を上書きしないため）
  let searchSeq = 0;

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

    // サブタブ切り替え
    document.querySelectorAll('#shop-subtabs .subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#shop-subtabs .subtab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $('#subtab-' + btn.dataset.subtab).classList.add('active');
        if (btn.dataset.subtab === 'manual') initMiniMap();
      });
    });

    $('#shop-search-btn').addEventListener('click', doSearch);
    $('#shop-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    // 料理ジャンル: カテゴリ→ジャンルの2段階選択
    dishPicker = Api.buildGenrePicker($('#f-dish-genres'), selectedDishGenres);

    // 評価スター（味）＋ 店の評価3軸
    mountStars($('#f-rating'), 0, v => { currentRating = v; });
    mountAxisStars();

    // 訪問日時の初期値 = 現在
    $('#f-datetime').value = toLocalInput(new Date());

    $('#save-btn').addEventListener('click', save);
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

  // ---------- 写真の追加・EXIF解析 ----------
  async function addFiles(fileList) {
    for (const f of fileList) {
      if (!f.type.startsWith('image/')) continue;
      pendingPhotos.push({ file: f, url: URL.createObjectURL(f), type: 'dish' });
    }
    renderPreviews();
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
        <button type="button" class="remove" data-i="${i}">✕</button>
        <select data-i="${i}">
          <option value="dish">料理写真</option>
          <option value="exterior">外観写真</option>
          <option value="interior">店内写真</option>
          <option value="menu">メニュー写真</option>
        </select>`;
      div.querySelector('select').value = p.type;
      div.querySelector('select').addEventListener('change', (e) => { p.type = e.target.value; });
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

    // 訪問日時の初期値（撮影日時＝訪問日時とは限らないため編集可能 — §4.5）
    if (earliest) $('#f-datetime').value = toLocalInput(new Date(earliest));

    if (gps) {
      status.innerHTML = `✅ 撮影日時: <b>${earliest ? new Date(earliest).toLocaleString('ja-JP') : '不明'}</b> ／ 位置情報あり → 周辺の店舗候補を検索中…`;
      await loadCandidates(gps.lat, gps.lon);
      status.innerHTML = `✅ 撮影日時: <b>${earliest ? new Date(earliest).toLocaleString('ja-JP') : '不明'}</b> ／ 位置情報から周辺の店舗候補を表示しました。下から選択してください。`;
    } else {
      status.classList.add('warn');
      status.innerHTML = `ℹ️ この写真に位置情報はありません（撮影日時: ${earliest ? new Date(earliest).toLocaleString('ja-JP') : '不明'}）。「🔍 名前で検索」または「🗺️ 地図で指定」で店舗を選んでください。`;
      switchSubtab('search');
    }

    await classifyPhotos();
  }

  // AIによる料理ジャンル判定（仕様書v2 §5）。判定結果はすべて修正可能。
  async function classifyPhotos() {
    const ai = $('#ai-status');
    const dishPhoto = pendingPhotos.find(p => p.type === 'dish') || pendingPhotos[0];
    if (!dishPhoto) { ai.classList.add('hidden'); return; }

    if (!Api.hasApiKey()) {
      ai.classList.remove('hidden');
      ai.classList.add('warn');
      ai.innerHTML = '💡 AIによる料理ジャンル判定を使うには、右上の ⚙️ からAnthropic APIキーを設定してください（未設定でも店舗情報からの推定は動作します）。';
      return;
    }

    ai.classList.remove('hidden', 'warn');
    ai.textContent = '🤖 AIが料理ジャンルを判定しています…';
    try {
      const result = await Api.classifyDishPhoto(dishPhoto.file);
      if (result && (result.dishGenres.length || result.shopGenre)) {
        aiClassified = true;
        selectedDishGenres.clear();
        result.dishGenres.forEach(g => selectedDishGenres.add(g));
        dishPicker.reset();
        if (result.shopGenre) derivedShopGenre = result.shopGenre; // 内部保持のみ
        ai.innerHTML = `🤖 AI判定: <b>${result.dishGenres.map(esc).join('・') || '－'}</b>`
          + ' — 違っていたら下のフォームで修正できます。';
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

  function switchSubtab(name) {
    document.querySelectorAll('#shop-subtabs .subtab').forEach(b => b.classList.toggle('active', b.dataset.subtab === name));
    document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
    $('#subtab-' + name).classList.add('active');
    if (name === 'manual') initMiniMap();
  }

  // ---------- フローA: 周辺候補 ----------
  async function loadCandidates(lat, lon) {
    const box = $('#shop-candidates');
    box.innerHTML = '<p class="hint">検索中…</p>';
    switchSubtab('candidates');
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
          <div class="c-sub">${esc(c.amenity || '')}${c.cuisine ? '・' + esc(c.cuisine) : ''}${c.address ? '・' + esc(c.address) : ''}</div>
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

  // ---------- フローB: 名前検索（複数の情報源を統合、個人店対応） ----------
  async function doSearch() {
    const q = $('#shop-search-input').value.trim();
    const box = $('#shop-search-results');
    if (!q) { box.innerHTML = '<p class="hint">キーワードを入力してください。</p>'; return; }
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

  // ---------- フローB: 地図で指定 ----------
  function initMiniMap() {
    if (miniMap) { setTimeout(() => miniMap.invalidateSize(), 50); return; }
    miniMap = L.map('register-map').setView([35.6812, 139.7671], 13);
    Views.addBaseTiles(miniMap); // 地図タブと同じApple Maps風のクリーンなタイル
    miniMap.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      if (miniMarker) miniMarker.setLatLng(e.latlng);
      else miniMarker = L.marker(e.latlng).addTo(miniMap);
      await applyLocation({ osmId: '', name: $('#f-shop-name').value, lat, lon: lng }, { keepName: true });
      note('📍 位置を指定しました。店舗名を入力して保存してください。');
    });
    setTimeout(() => miniMap.invalidateSize(), 50);
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
    if (!aiClassified) {
      const g = Api.guessGenres(c);
      if (g.shop) derivedShopGenre = g.shop; // 内部保持のみ
      if (g.dish) {
        selectedDishGenres.clear();
        selectedDishGenres.add(g.dish);
        dishPicker.reset();
      }
    }
    const auto = autoPicked ? '🤖 一番近い店舗を自動選択しました。違う場合は上の候補から選び直せます。\n' : '';
    note(`${auto}✅ 「${c.name}」を選択しました。あとは★評価をつけて保存するだけです。`);
    await applyLocation(c);
  }

  async function applyLocation(c, opts = {}) {
    selected = { existingShopId: null, osmId: c.osmId || '', name: c.name || '', address: c.address || '', lat: c.lat, lon: c.lon, pref: '', city: '', station: '', country: '日本' };
    if (!opts.keepName) $('#f-shop-name').value = c.name || '';
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
    const dtVal = $('#f-datetime').value;
    if (!name) { App.toast('店舗名を入力してください'); return; }
    if (!dtVal) { App.toast('訪問日を入力してください'); return; }
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
        visitType: $('#f-visit-type').value,
      });

      // --- 写真（圧縮して保存 — §9.1） ---
      for (const p of pendingPhotos) {
        const blob = await Api.compressImage(p.file);
        await Store.addPhoto(shop.id, visit.id, p.type, blob);
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
    $('#exif-status').classList.add('hidden');
    $('#ai-status').classList.add('hidden');
    $('#shop-candidates').innerHTML = '';
    $('#shop-search-results').innerHTML = '';
    $('#shop-search-input').value = '';
    $('#selected-shop-note').classList.add('hidden');
    ['#f-shop-name', '#f-address', '#f-station', '#f-pref', '#f-city', '#f-comment'].forEach(s => { $(s).value = ''; });
    derivedShopGenre = '';
    $('#f-visit-type').value = '店内飲食';
    $('#f-fav').checked = false;
    $('#f-datetime').value = toLocalInput(new Date());
    selectedDishGenres.clear();
    dishPicker.reset();
    mountStars($('#f-rating'), 0, v => { currentRating = v; });
    shopRatings = { casual: 0, atmosphere: 0, speed: 0 };
    mountAxisStars();
    if (miniMarker) { miniMarker.remove(); miniMarker = null; }
    switchSubtab('candidates');
  }

  // 店舗詳細から「訪問を追加」（§4.4 再訪の登録）
  function preselectShop(shopId) {
    resetForm();
    const shop = Store.getShop(shopId);
    if (shop) chooseExisting(shop);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, preselectShop };
})();
