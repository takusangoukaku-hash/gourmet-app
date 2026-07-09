// =====================================================
// 表示系: 地図(§6) / 一覧・検索(§7,8) / 写真(§9) / 統計・ランキング(§11)
// / 店舗詳細モーダル
// =====================================================
const Views = (() => {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const starStr = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('ja-JP') : '－';

  // object URL のキャッシュ（photoId → url）
  const urlCache = new Map();
  function photoUrl(rec) {
    if (!rec) return null;
    if (!urlCache.has(rec.id)) urlCache.set(rec.id, URL.createObjectURL(rec.blob));
    return urlCache.get(rec.id);
  }

  // ========== 地図 ==========
  let map = null, cluster = null, heat = null, heatOn = false;
  let pinMarkers = []; // ズーム変更時にアイコンを作り直すための参照

  // ズームレベルに応じたピンの直径（広域=極小の点3px、拡大=最大32px）
  function pinSize() {
    const z = map ? map.getZoom() : 12;
    return Math.round(Math.max(3, Math.min(32, (z - 8) * 4)));
  }

  // ピンのアイコン生成（数字なし・色で味を表現）。count指定でクラスター用
  function makePinIcon(avg, fav, count) {
    const base = pinSize();
    const size = count ? Math.max(base + 1, Math.round(base * 1.15)) : base;
    const r = Math.round(avg) || 0;
    // 極小サイズでは白フチが色を潰すため段階的に細く
    const border = size <= 5 ? 0 : (size < 10 ? 1 : 2);
    const favBadge = (fav && size >= 18) ? '<span class="pin-fav">⭐</span>' : '';
    const countBadge = (count && size >= 14)
      ? `<span class="pin-count" style="font-size:${Math.max(9, Math.round(size * 0.38))}px">${count}</span>` : '';
    return L.divIcon({
      className: '',
      html: `<div class="pin r${r}" style="position:relative;width:${size}px;height:${size}px;border-width:${border}px">${favBadge}${countBadge}</div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    });
  }
  // 料理ジャンルフィルタ（複数選択可。空 = すべて表示）
  const mapGenreFilter = new Set();

  function shopMatchesGenre(shopId) {
    if (!mapGenreFilter.size) return true;
    return Store.visitsOf(shopId).some(v => (v.dishGenres || []).some(g => mapGenreFilter.has(g)));
  }

  // 星評価フィルタ（味＝メイン＋店の評価3軸）
  const AXIS_LABEL = { taste: '味', casual: 'カジュアル度', atmosphere: '雰囲気', speed: '提供の早さ' };
  function shopMatchesAxes(shop) {
    const tasteMin = +($('#mf-taste').value || 0);
    if (tasteMin > 0 && Store.avgRating(shop.id) < tasteMin) return false;
    for (const k of ['casual', 'atmosphere', 'speed']) {
      const min = +($('#mf-' + k).value || 0);
      if (min > 0 && (shop[k] || 0) < min) return false;
    }
    return true;
  }

  function initMap() {
    if (map) return;
    map = L.map('map-canvas').setView([35.6812, 139.7671], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    // クラスター（重なり）は中で最も評価の高い店舗の色を代表として表示し、
    // 右上に件数バッジを付ける
    cluster = L.markerClusterGroup({
      iconCreateFunction: (cl) => {
        const children = cl.getAllChildMarkers();
        let best = 0;
        for (const ch of children) best = Math.max(best, ch._avgRating || 0);
        return makePinIcon(best, false, children.length);
      },
    });
    map.addLayer(cluster);

    // ズームに応じてピンの大きさを更新（広域=点、拡大=大きく）
    map.on('zoomend', () => {
      pinMarkers.forEach(m => m.setIcon(makePinIcon(m._avgRating, m._fav)));
      cluster.refreshClusters();
    });

    // 料理ジャンルフィルタのチップ（複数選択可）
    const bar = $('#map-genre-filter');
    bar.innerHTML = Api.DISH_GENRES.map(g => `<button type="button" class="chip" data-g="${esc(g)}">${esc(g)}</button>`).join('');
    bar.addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      const g = c.dataset.g;
      if (mapGenreFilter.has(g)) { mapGenreFilter.delete(g); c.classList.remove('on'); }
      else { mapGenreFilter.add(g); c.classList.add('on'); }
      refreshMap();
    });

    // 星評価フィルタ（味＋店の評価3軸）
    ['#mf-taste', '#mf-casual', '#mf-atmosphere', '#mf-speed'].forEach(sel =>
      $(sel).addEventListener('change', refreshMap));

    $('#map-locate').addEventListener('click', () => {
      if (!navigator.geolocation) { App.toast('位置情報が利用できません'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
        () => App.toast('現在地を取得できませんでした')
      );
    });
    $('#map-heat').addEventListener('click', toggleHeat);
  }

  function refreshMap() {
    initMap();
    setTimeout(() => map.invalidateSize(), 60);
    cluster.clearLayers();
    const shops = Store.shops().filter(s =>
      s.lat != null && s.lon != null && shopMatchesGenre(s.id) && shopMatchesAxes(s));
    // フィルタ選択中は件数を表示
    const axisActive = ['taste', 'casual', 'atmosphere', 'speed']
      .filter(k => +($('#mf-' + k).value || 0) > 0)
      .map(k => AXIS_LABEL[k] + '★' + $('#mf-' + k).value + '+');
    const labels = [...mapGenreFilter, ...axisActive];
    $('#map-filter-count').textContent = labels.length ? `${labels.join('・')}: ${shops.length}件` : '';
    pinMarkers = [];
    for (const s of shops) {
      const avg = Store.avgRating(s.id);
      // 評価が高いピンほど手前に描画（部分的な重なり対策）
      const m = L.marker([s.lat, s.lon], {
        icon: makePinIcon(avg, s.favorite),
        zIndexOffset: Math.round((avg || 0) * 100),
      });
      m._avgRating = avg; // クラスターの代表色・ズーム時の再描画に使用
      m._fav = s.favorite;
      pinMarkers.push(m);
      m.bindPopup('<div class="popup">読み込み中…</div>');
      m.on('popupopen', async () => {
        const vs = Store.visitsOf(s.id);
        const rep = await Store.repPhoto(s.id);
        const last = vs[0];
        // DOMノードで渡す（Leafletポップアップはクリック伝播を止めるため、
        // documentへの委譲ではなく直接リスナーを付ける必要がある）
        const node = document.createElement('div');
        node.className = 'popup';
        node.innerHTML = `
            ${rep ? `<img src="${photoUrl(rep)}" alt="">` : ''}
            <div class="p-name">${esc(s.name)}${s.favorite ? ' ⭐' : ''}</div>
            <div class="p-sub">${starStr(avg)} 味${avg || '－'}　訪問${vs.length}回</div>
            <div class="p-sub">${last ? '最終訪問: ' + fmtDate(last.datetime) : ''}</div>
            ${last && last.comment ? `<div class="p-comment">${esc(last.comment.slice(0, 60))}</div>` : ''}
            <button class="btn small popup-detail">店舗詳細 →</button>`;
        node.querySelector('.popup-detail').addEventListener('click', () => showShop(s.id));
        m.setPopupContent(node);
      });
      cluster.addLayer(m);
    }
    if (shops.length) {
      try { map.fitBounds(cluster.getBounds().pad(0.2)); } catch { /* noop */ }
    }
    if (heatOn) buildHeat();
  }

  function toggleHeat() {
    heatOn = !heatOn;
    $('#map-heat').classList.toggle('primary', heatOn);
    if (heatOn) buildHeat();
    else if (heat) { map.removeLayer(heat); heat = null; }
  }
  function buildHeat() {
    if (heat) map.removeLayer(heat);
    const pts = [];
    for (const v of Store.visits()) {
      // ジャンルフィルタ選択中は該当する訪問だけを対象にする
      if (mapGenreFilter.size && !(v.dishGenres || []).some(g => mapGenreFilter.has(g))) continue;
      const s = Store.getShop(v.shopId);
      if (s && s.lat != null) pts.push([s.lat, s.lon, 1]);
    }
    heat = L.heatLayer(pts, { radius: 32, blur: 22 }).addTo(map);
  }

  // ========== 一覧 ==========
  function initList() {
    ['#flt-keyword', '#flt-group', '#flt-sort', '#flt-pref', '#flt-shop-genre', '#flt-dish-genre', '#flt-rating', '#flt-fav']
      .forEach(sel => $(sel).addEventListener($(sel).tagName === 'INPUT' && $(sel).type === 'text' ? 'input' : 'change', renderList));
    // フィルタ選択肢
    $('#flt-shop-genre').innerHTML = '<option value="">店舗ジャンル</option>' + Api.SHOP_GENRES.map(g => `<option>${g}</option>`).join('');
    $('#flt-dish-genre').innerHTML = '<option value="">料理ジャンル</option>' + Api.DISH_GENRES.map(g => `<option>${g}</option>`).join('');
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
    const sg = $('#flt-shop-genre').value;
    const dg = $('#flt-dish-genre').value;
    const minR = +($('#flt-rating').value || 0);
    const favOnly = $('#flt-fav').checked;

    return Store.shops().filter(s => {
      if (favOnly && !s.favorite) return false;
      if (pref && s.pref !== pref) return false;
      if (sg && s.shopGenre !== sg) return false;
      const vs = Store.visitsOf(s.id);
      if (dg && !vs.some(v => (v.dishGenres || []).includes(dg))) return false;
      if (minR && (Store.avgRating(s.id) || 0) < minR) return false;
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
    };
    return list.sort(by[mode] || by.newest);
  }

  function groupKeyFns(mode) {
    switch (mode) {
      case 'station': return (s) => [s.station || '最寄駅なし'];
      case 'pref': return (s) => [s.country && s.country !== '日本' ? `🌏 ${s.country}` : (s.pref || '都道府県なし')];
      case 'city': return (s) => [s.city || '市区町村なし'];
      case 'shopGenre': return (s) => [s.shopGenre || 'その他'];
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

  function renderList() {
    refreshPrefOptions();
    const box = $('#shop-list');
    const shops = sortShops(filteredShops());

    if (!Store.shops().length) {
      box.innerHTML = `<div class="empty">
        <p>まだ記録がありません。<br>「＋ 登録」から料理の写真を登録してみましょう。</p>
        <button class="btn primary" id="seed-btn">サンプルデータで試す</button>
      </div>`;
      $('#seed-btn').addEventListener('click', () => App.seedSample());
      return;
    }
    if (!shops.length) {
      box.innerHTML = '<div class="empty"><p>条件に一致する店舗がありません。</p></div>';
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

  function shopCard(s) {
    const avg = Store.avgRating(s.id);
    const axes = [
      s.casual ? `気軽★${s.casual}` : '',
      s.atmosphere ? `雰囲気★${s.atmosphere}` : '',
      s.speed ? `早さ★${s.speed}` : '',
    ].filter(Boolean).join('　');
    const div = document.createElement('div');
    div.className = 'shop-card';
    div.dataset.shopOpen = s.id;
    div.innerHTML = `
      <div class="thumb" data-thumb="${s.id}">🍽️</div>
      <div class="s-main">
        <div class="s-name">${esc(s.name)}</div>
        <div class="s-stars">${starStr(avg)} <span class="num">味${avg || '－'}　訪問${Store.visitCount(s.id)}回</span></div>
        <div class="s-sub">${esc(s.shopGenre)}${s.station ? '　🚉 ' + esc(s.station) : ''}${s.city ? '　📍 ' + esc(s.city) : ''}</div>
        ${axes ? `<div class="s-sub s-axes">${axes}</div>` : ''}
        <div class="s-sub">最終訪問: ${fmtDate(Store.lastVisitDate(s.id))}</div>
      </div>
      <button class="s-fav ${s.favorite ? 'on' : ''}" data-fav="${s.id}" title="お気に入り">⭐</button>`;
    return div;
  }

  async function loadThumbs(root) {
    for (const el of root.querySelectorAll('[data-thumb]')) {
      const rep = await Store.repPhoto(el.dataset.thumb);
      if (rep) el.innerHTML = `<img src="${photoUrl(rep)}" alt="">`;
    }
  }

  // ========== 写真ギャラリー ==========
  function initPhotos() {
    $('#ph-dish-genre').innerHTML = '<option value="">すべての料理ジャンル</option>' + Api.DISH_GENRES.map(g => `<option>${g}</option>`).join('');
    $('#ph-type').addEventListener('change', renderPhotos);
    $('#ph-dish-genre').addEventListener('change', renderPhotos);
  }

  const TYPE_LABEL = { dish: '料理', exterior: '外観', interior: '店内', menu: 'メニュー' };

  async function renderPhotos() {
    const box = $('#photo-grid');
    const type = $('#ph-type').value;
    const dg = $('#ph-dish-genre').value;
    let photos = await Store.allPhotos();
    photos.sort((a, b) => b.createdAt - a.createdAt);

    const cells = [];
    for (const p of photos) {
      if (type && p.type !== type) continue;
      const visit = Store.visits().find(v => v.id === p.visitId);
      if (dg && !(visit && (visit.dishGenres || []).includes(dg))) continue;
      const shop = Store.getShop(p.shopId);
      cells.push({ p, shop, visit });
    }
    if (!cells.length) {
      box.innerHTML = '<div class="empty"><p>写真がありません。</p></div>';
      return;
    }
    box.innerHTML = '';
    for (const { p, shop, visit } of cells) {
      const cap = `${shop ? shop.name : ''}　${visit ? fmtDate(visit.datetime) : ''}`;
      const div = document.createElement('div');
      div.className = 'photo-cell';
      div.innerHTML = `<img src="${photoUrl(p)}" alt=""><div class="cap">${esc(TYPE_LABEL[p.type] || '')}｜${esc(cap)}</div>`;
      div.addEventListener('click', () => openLightbox(photoUrl(p), cap));
      box.appendChild(div);
    }
  }

  function openLightbox(url, caption) {
    $('#lightbox-img').src = url;
    $('#lightbox-caption').textContent = caption || '';
    $('#lightbox').classList.remove('hidden');
  }

  // ========== 統計・ランキング ==========
  const charts = {};
  function chart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), cfg);
  }
  const PALETTE = ['#e8590c', '#f5a623', '#4caf50', '#2196f3', '#9c27b0', '#795548', '#607d8b', '#e91e63', '#00bcd4', '#8bc34a', '#ff5722', '#3f51b5', '#cddc39', '#9e9e9e', '#f44336'];

  async function renderStats() {
    const shops = Store.shops();
    const visits = Store.visits();
    const photos = await Store.allPhotos();
    const year = new Date().getFullYear();
    const yearVisits = visits.filter(v => new Date(v.datetime).getFullYear() === year).length;
    const allAvg = visits.length ? Math.round(visits.reduce((s, v) => s + v.rating, 0) / visits.length * 10) / 10 : 0;

    $('#stat-cards').innerHTML = [
      [shops.length, '総店舗数'],
      [visits.length, '総訪問回数'],
      [photos.length, '保存写真枚数'],
      [allAvg || '－', '味の平均'],
      [yearVisits, `${year}年の訪問`],
      [shops.filter(s => s.favorite).length, 'お気に入り'],
    ].map(([v, l]) => `<div class="stat-card"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

    // 月別訪問（直近12ヶ月）
    const months = [], counts = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
      months.push(key);
      counts.push(visits.filter(v => {
        const vd = new Date(v.datetime);
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth();
      }).length);
    }
    chart('chart-monthly', {
      type: 'bar',
      data: { labels: months, datasets: [{ label: '訪問件数', data: counts, backgroundColor: '#e8590c' }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    });

    // ジャンル割合
    const tally = (arr) => {
      const m = new Map();
      arr.forEach(k => { if (k) m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const doughnut = (id, entries) => chart(id, {
      type: 'doughnut',
      data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: PALETTE }] },
      options: { plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } },
    });
    doughnut('chart-shop-genre', tally(shops.map(s => s.shopGenre)));
    doughnut('chart-dish-genre', tally(visits.flatMap(v => v.dishGenres || [])));

    // 都道府県別
    const prefEntries = tally(shops.map(s => (s.country && s.country !== '日本') ? s.country : s.pref));
    chart('chart-pref', {
      type: 'bar',
      data: { labels: prefEntries.map(e => e[0]), datasets: [{ label: '店舗数', data: prefEntries.map(e => e[1]), backgroundColor: '#f5a623' }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    });

    // ランキング（§11）
    const rank = (el, entries, fmt) => {
      $(el).innerHTML = entries.slice(0, 5).map(e => `<li>${fmt(e)}</li>`).join('') || '<li>データなし</li>';
    };
    rank('#rank-rating',
      shops.filter(s => Store.avgRating(s.id) > 0).sort((a, b) => Store.avgRating(b.id) - Store.avgRating(a.id)),
      s => `${esc(s.name)} <span class="rv">★${Store.avgRating(s.id)}</span>`);
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
    rank('#rank-shopgenre', visitTallyByShopField('shopGenre'), e => `${esc(e[0])} <span class="rv">${e[1]}回</span>`);
  }

  // ========== 店舗詳細モーダル ==========
  async function showShop(shopId) {
    const s = Store.getShop(shopId);
    if (!s) return;
    const vs = Store.visitsOf(shopId);
    const avg = Store.avgRating(shopId);
    const body = $('#modal-body');

    body.innerHTML = `
      <div class="detail-head">
        <h2>${esc(s.name)} ${s.favorite ? '⭐' : ''}</h2>
        <div class="d-stars">${starStr(avg)} 味${avg || '評価なし'}　<span style="color:var(--muted);font-size:13px">訪問${vs.length}回</span></div>
        <div class="d-sub">${esc(s.shopGenre)}${s.status === 'closed' ? '<span class="badge gray">閉店</span>' : ''}</div>
        <div class="d-sub">${s.station ? '🚉 ' + esc(s.station) + '　' : ''}${esc([s.pref, s.city].filter(Boolean).join(' '))}</div>
        <div class="d-sub">${esc(s.address || '')}</div>
      </div>
      <div class="axis-box">
        <div class="axis-title">お店の評価（タップで変更）</div>
        ${['casual', 'atmosphere', 'speed'].map(k => `
          <div class="axis-row"><span>${AXIS_LABEL[k]}</span>
            <div class="stars small d-axis" data-axis="${k}">
              ${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" class="${(s[k] || 0) >= i ? 'on' : ''}">★</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div class="detail-actions">
        <button class="btn small" id="d-add-visit">＋ 訪問を追加</button>
        <button class="btn small" id="d-fav">${s.favorite ? '⭐ お気に入り解除' : '☆ お気に入り登録'}</button>
        <button class="btn small" id="d-closed">${s.status === 'closed' ? '営業中に戻す' : '閉店にする'}</button>
        <button class="btn small danger" id="d-delete">店舗を削除</button>
      </div>
      <h3>訪問記録</h3>
      <div id="d-visits"></div>`;

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

    const vbox = $('#d-visits');
    for (const v of vs) {
      const block = document.createElement('div');
      block.className = 'visit-block';
      block.innerHTML = `
        <div class="v-head">
          <span class="v-date">${new Date(v.datetime).toLocaleDateString('ja-JP', { dateStyle: 'medium' })}</span>
          <span class="v-stars">${starStr(v.rating)}</span>
          <span class="chip tag">${esc(v.visitType || '店内飲食')}</span>
          ${(v.dishGenres || []).map(g => `<span class="chip tag">${esc(g)}</span>`).join('')}
        </div>
        ${v.comment ? `<div class="v-comment">${esc(v.comment)}</div>` : ''}
        <div class="v-photos"></div>
        <div class="v-btns">
          <button class="btn small v-edit">✏️ 編集</button>
          <button class="btn small danger v-del">削除</button>
        </div>
        <div class="visit-edit hidden">
          <div class="stars small v-edit-stars"></div>
          <textarea rows="2" class="v-edit-comment" style="margin-top:6px">${esc(v.comment || '')}</textarea>
          <button class="btn small primary v-edit-save" style="margin-top:6px">保存</button>
        </div>`;
      vbox.appendChild(block);

      // 写真
      Store.photosOfVisit(v.id).then(ps => {
        const row = block.querySelector('.v-photos');
        ps.forEach(p => {
          const img = document.createElement('img');
          img.src = photoUrl(p);
          img.addEventListener('click', () => openLightbox(photoUrl(p), `${s.name}　${fmtDate(v.datetime)}`));
          row.appendChild(img);
        });
      });

      // 編集（評価・コメントは後から変更可能 — §10）
      let editRating = v.rating;
      const editBox = block.querySelector('.visit-edit');
      block.querySelector('.v-edit').addEventListener('click', () => {
        editBox.classList.toggle('hidden');
        const starsEl = editBox.querySelector('.v-edit-stars');
        starsEl.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = '★';
          if (i <= editRating) b.classList.add('on');
          b.addEventListener('click', () => {
            editRating = i;
            [...starsEl.children].forEach((x, idx) => x.classList.toggle('on', idx < i));
          });
          starsEl.appendChild(b);
        }
      });
      block.querySelector('.v-edit-save').addEventListener('click', () => {
        Store.updateVisit(v.id, { rating: editRating, comment: editBox.querySelector('.v-edit-comment').value.trim() });
        showShop(shopId);
      });
      block.querySelector('.v-del').addEventListener('click', async () => {
        if (!confirm('この訪問記録を削除しますか？')) return;
        await Store.deleteVisit(v.id);
        showShop(shopId);
      });
    }

    $('#modal').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
  }

  return { refreshMap, initList, renderList, initPhotos, renderPhotos, renderStats, showShop, closeModal, openLightbox, getMap: () => map };
})();
