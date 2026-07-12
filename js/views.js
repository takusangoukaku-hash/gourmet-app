// =====================================================
// 表示系: 地図(§6) / 一覧・検索(§7,8) / 写真(§9) / 統計・ランキング(§11)
// / 店舗詳細モーダル
// =====================================================
const Views = (() => {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const starStr = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  // 白黒ピクトグラム（駅・住所）
  const IC_STATION = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 11h12"/><path d="M9 20l1.5-4"/><path d="M15 20l-1.5-4"/></svg>';
  const IC_PIN = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>';
  const IC_EDIT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('ja-JP') : '－';
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
    if (!urlCache.has(rec.id)) urlCache.set(rec.id, URL.createObjectURL(rec.blob));
    return urlCache.get(rec.id);
  }

  // ========== 地図（MapLibre GLネイティブ: 2本指で回転可能） ==========
  let map = null, heatOn = false, mapLoaded = false, pendingRefresh = false, mapPopup = null;

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
        { id: 'boundary', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 5,
          filter: ['<=', ['get', 'admin_level'], 4],
          paint: { 'line-color': c.boundary, 'line-width': 1, 'line-dasharray': [3, 2] } },
        // ===== ラベル（都市名・駅名・主要施設のみ）=====
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
  const PIN_COLORS = ['#9e9e9e', '#9e9e9e', '#64b5f6', '#4caf50', '#ff9800', '#e53935'];
  const colorByR = (prop) => ['match', ['get', prop],
    0, PIN_COLORS[0], 1, PIN_COLORS[1], 2, PIN_COLORS[2], 3, PIN_COLORS[3], 4, PIN_COLORS[4], 5, PIN_COLORS[5],
    PIN_COLORS[3]];
  // ズームに応じたピンの半径（広域=極小の点、拡大しても控えめ。従来の直径3〜12pxと同等）
  const PIN_RADIUS = ['interpolate', ['linear'], ['zoom'], 8, 1.5, 10, 1.8, 12, 3.6, 14, 5.4, 15, 6, 20, 6];
  // zoom式は最上位のinterpolateにしか置けないため、件数による加算は出力側に入れる
  const CSTEP = ['step', ['get', 'point_count'], 1, 10, 2, 30, 3];
  const CLUSTER_RADIUS = ['interpolate', ['linear'], ['zoom'],
    8, ['+', 2, CSTEP], 10, ['+', 2.4, CSTEP], 12, ['+', 4.4, CSTEP],
    14, ['+', 6.2, CSTEP], 15, ['+', 7, CSTEP], 20, ['+', 7, CSTEP]];
  // 料理ジャンルフィルタ（複数選択可。空 = すべて表示）
  const mapGenreFilter = new Set();

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
    if (tasteMin > 0 && Store.avgRating(shop.id) < tasteMin) return false;
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
      center: [139.7671, 35.6812], zoom: 11, minZoom: 3, maxZoom: 20,
      attributionControl: { compact: true },
    });
    // ズーム＋コンパス（回転リセット）は右下へ（左上は検索バーが重なるため）
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('error', (e) => console.warn('MapLibre:', e && e.error));

    map.on('load', () => {
      mapLoaded = true;
      // 店舗ピン（クラスター付き）。クラスターの色は中で一番評価の高い店の色
      map.addSource('shops', {
        type: 'geojson', data: { type: 'FeatureCollection', features: [] },
        cluster: true, clusterMaxZoom: 16, clusterRadius: 40,
        clusterProperties: { maxR: ['max', ['get', 'r']] },
      });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'shops',
        filter: ['has', 'point_count'],
        paint: { 'circle-color': colorByR('maxR'), 'circle-radius': CLUSTER_RADIUS,
          'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 1] } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'shops', minzoom: 13,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['to-string', ['get', 'point_count']], 'text-font': FONT, 'text-size': 9, 'text-allow-overlap': true },
        paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'pins', type: 'circle', source: 'shops',
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': colorByR('r'), 'circle-radius': PIN_RADIUS,
          'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 1] } });
      // お気に入り★（拡大時のみ）
      map.addLayer({ id: 'pin-fav', type: 'symbol', source: 'shops', minzoom: 14,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'fav'], 1]],
        layout: { 'text-field': '★', 'text-font': FONT, 'text-size': 11,
          'text-offset': [0.8, -0.8], 'text-allow-overlap': true },
        paint: { 'text-color': '#f5b301', 'text-halo-color': '#fff', 'text-halo-width': 1 } });
      // 店名＋ジャンルのラベル（z14以上）
      map.addLayer({ id: 'pin-labels', type: 'symbol', source: 'shops', minzoom: 14,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['case', ['==', ['get', 'genre'], ''], ['get', 'name'],
            ['concat', ['get', 'name'], '\n', ['get', 'genre']]],
          'text-font': FONT, 'text-size': 10, 'text-anchor': 'bottom',
          'text-offset': [0, -0.9], 'text-max-width': 12,
        },
        paint: { 'text-color': dark ? '#e8e6e1' : '#3a3833',
          'text-halo-color': dark ? '#1a1b1f' : '#ffffff', 'text-halo-width': 1.2 } });

      // タップ: ピン → 店舗ポップアップ / クラスター → ズームイン
      map.on('click', 'pins', (e) => openPinPopup(e.features[0]));
      map.on('click', 'clusters', (e) => {
        const f = e.features[0];
        map.getSource('shops').getClusterExpansionZoom(f.properties.cluster_id)
          .then(z => map.easeTo({ center: f.geometry.coordinates, zoom: z }));
      });
      ['pins', 'clusters'].forEach(id => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });

      refreshMapData(true);
      if (pendingRefresh) { pendingRefresh = false; }
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

    // 検索バー: タップで絞り込みパネルを開き、入力でピンをキーワード絞り込み
    $('#map-search').addEventListener('focus', () => $('#map-filter-panel').classList.remove('hidden'));
    let mapKwTimer = null;
    $('#map-search').addEventListener('input', () => {
      clearTimeout(mapKwTimer);
      mapKwTimer = setTimeout(() => {
        mapKeyword = $('#map-search').value.trim();
        refreshMap();
      }, 300);
    });
    $('#map-panel-close').addEventListener('click', () => {
      $('#map-filter-panel').classList.add('hidden');
      $('#map-search').blur();
    });

    $('#map-locate').addEventListener('click', () => {
      if (!navigator.geolocation) { App.toast('位置情報が利用できません'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => map.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 }),
        () => App.toast('現在地を取得できませんでした')
      );
    });
    $('#map-heat').addEventListener('click', toggleHeat);
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

  // ピンをタップ → 店舗ポップアップ（写真・評価・詳細ボタン）
  async function openPinPopup(feature) {
    const s = Store.getShop(feature.properties.id);
    if (!s) return;
    const avg = Store.avgRating(s.id);
    const vs = Store.visitsOf(s.id);
    const rep = await Store.repPhoto(s.id);
    const last = vs[0];
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
    if (mapPopup) mapPopup.remove();
    mapPopup = new maplibregl.Popup({ offset: 12, maxWidth: '240px' })
      .setLngLat([s.lon, s.lat]).setDOMContent(node).addTo(map);
  }

  // フィルタ適用後の店舗一覧 → GeoJSONに変換して地図へ反映
  function refreshMapData(fit) {
    const shops = Store.shops().filter(s =>
      s.lat != null && s.lon != null && shopMatchesGenre(s.id) && shopMatchesAxes(s) && shopMatchesKeyword(s));
    // フィルタ選択中は件数を表示
    const axisActive = ['taste', 'casual', 'atmosphere', 'speed']
      .filter(k => +($('#mf-' + k).value || 0) > 0)
      .map(k => AXIS_LABEL[k] + '★' + $('#mf-' + k).value + '+');
    const labels = [...mapGenreFilter, ...axisActive];
    $('#map-filter-count').textContent = labels.length ? `${labels.join('・')}: ${shops.length}件` : '';

    const features = shops.map(s => {
      const avg = Store.avgRating(s.id);
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { id: s.id, name: s.name, genre: shopLabelGenre(s),
          r: Math.round(avg) || 0, fav: s.favorite ? 1 : 0 } };
    });
    map.getSource('shops').setData({ type: 'FeatureCollection', features });

    if (fit && shops.length) {
      const b = new maplibregl.LngLatBounds();
      shops.forEach(s => b.extend([s.lon, s.lat]));
      try { map.fitBounds(b, { padding: 70, maxZoom: 16, duration: 0 }); } catch { /* noop */ }
    }
    if (heatOn) buildHeat();
  }

  function refreshMap() {
    initMap();
    map.resize(); // タブ切り替えで表示された直後はキャンバスサイズが0のため
    if (!mapLoaded) { pendingRefresh = true; return; } // load後に反映される
    refreshMapData(true);
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
    // 検索バーをタップしたら詳細な絞り込みを開く（地図と同じ操作感）
    $('#flt-keyword').addEventListener('focus', () => $('#list-filter-panel').classList.remove('hidden'));
    $('#list-panel-close').addEventListener('click', () => $('#list-filter-panel').classList.add('hidden'));

    // パネルの外側をタップしたら閉じて検索バーだけに戻す（地図・一覧共通）
    // captureで登録: 地図などがタップイベントの伝播を止めても先に検知できる
    document.addEventListener('pointerdown', (e) => {
      const mapPanel = $('#map-filter-panel');
      if (mapPanel && !mapPanel.classList.contains('hidden') && !e.target.closest('.map-overlay')) {
        mapPanel.classList.add('hidden');
      }
      const listPanel = $('#list-filter-panel');
      if (listPanel && !listPanel.classList.contains('hidden') && !e.target.closest('.filters')) {
        listPanel.classList.add('hidden');
      }
    }, true);
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
        <div class="s-sub">${esc(shopLabelGenre(s) || '')}${s.station ? '　' + IC_STATION + ' ' + esc(s.station) : ''}${s.city ? '　' + IC_PIN + ' ' + esc(s.city) : ''}</div>
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
    $('#ph-dish-genre').innerHTML = '<option value="">ジャンル</option>' + Api.DISH_GENRES.map(g => `<option>${g}</option>`).join('');
    $('#ph-dish-genre').addEventListener('change', renderPhotos);
  }

  const TYPE_LABEL = { dish: '料理', exterior: '外観', interior: '店内', menu: 'メニュー' };

  async function renderPhotos() {
    const box = $('#photo-grid');
    const type = ''; // 種別フィルタは廃止（すべての写真を表示）
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
      // 拡大表示は店名＋日付、写真の下のキャプションは店名のみ
      const cap = `${shop ? shop.name : ''}　${visit ? fmtDate(visit.datetime) : ''}`;
      const div = document.createElement('div');
      div.className = 'photo-cell';
      div.innerHTML = `<img src="${photoUrl(p)}" alt=""><div class="cap">${esc(shop ? shop.name : '')}</div>`;
      div.addEventListener('click', () => openLightbox(photoUrl(p), cap));
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
    // カウントのタップ: 画面移動（店舗）／フォロー・フォロワーは近日公開の案内
    document.querySelectorAll('.pstat').forEach(b =>
      b.addEventListener('click', () => {
        if (b.dataset.goto) App.switchTab(b.dataset.goto);
        else App.toast('👥 フォロー機能は近日公開予定です');
      }));

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
      $('#pf-login').addEventListener('click', async () => {
        $('#pf-login').textContent = 'ログイン中…';
        try { await Cloud.login(); }
        catch (e) {
          $('#pf-login').textContent = '🔗 Googleでログインして同期';
          App.toast('⚠️ ログインに失敗しました: ' + (e && e.message || e));
        }
      });
      $('#pf-logout').addEventListener('click', () => Cloud.logout());
      // 同期状態の表示更新
      const SYNC_MSG = { loading: 'ログイン中…', syncing: '☁️ 同期中…', synced: '✅ 同期済み', error: '⚠️ 同期エラー' };
      Cloud.onStatus((state, u, detail) => {
        const inNow = !!u;
        $('#pf-login').classList.toggle('hidden', inNow);
        $('#pf-account-in').classList.toggle('hidden', !inNow);
        if (inNow) {
          let msg = (u.email ? u.email + '　' : '') + (SYNC_MSG[state] || '');
          if (state === 'error' && detail) {
            const code = detail.code || detail.message || String(detail);
            // 原因の切り分け用にエラーコードを表示。権限エラーはルール未設定の案内を出す
            msg += /permission|denied/i.test(code)
              ? '（アクセス権の設定が必要です: Firebaseのルール設定を確認）'
              : `（${String(code).slice(0, 60)}）`;
          }
          $('#pf-sync').textContent = msg;
        }
        if (state === 'synced') renderProfile(); // 復元されたデータを反映
      });
    } else {
      $('#pf-login').textContent = 'この端末では同期を利用できません';
      $('#pf-login').disabled = true;
    }

    $('#pf-map').addEventListener('click', () => App.switchTab('map'));
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
    $('#ptab-stats').classList.toggle('hidden', name !== 'stats');
    // グラフは表示中のcanvasでないと大きさが0になるため、表示時に描画する
    if (name === 'stats') renderStats();
    else renderProfilePhotos();
  }

  // プロフィールの写真グリッド（全写真・新しい順・タップで拡大）
  async function renderProfilePhotos() {
    const box = $('#pf-photo-grid');
    const photos = await Store.allPhotos();
    photos.sort((a, b) => b.createdAt - a.createdAt);
    box.innerHTML = '';
    if (!photos.length) {
      box.innerHTML = '<div class="empty"><p>まだ写真がありません。＋から最初の一皿を記録しましょう。</p></div>';
      return;
    }
    for (const ph of photos) {
      const shop = Store.getShop(ph.shopId);
      const visit = Store.visits().find(v => v.id === ph.visitId);
      const cap = `${shop ? shop.name : ''}　${visit ? fmtDate(visit.datetime) : ''}`;
      const div = document.createElement('div');
      div.className = 'photo-cell';
      div.innerHTML = `<img src="${photoUrl(ph)}" alt=""><div class="cap">${esc(shop ? shop.name : '')}</div>`;
      div.addEventListener('click', () => openLightbox(photoUrl(ph), cap));
      box.appendChild(div);
    }
  }

  async function renderProfile() {
    const p = Store.getProfile();
    $('#pf-name').textContent = p.name;
    $('#pf-bio').textContent = p.bio;
    $('#pf-bio').classList.toggle('hidden', !p.bio);
    // プロフィール写真（未設定なら🍜）
    const av = $('#pf-avatar');
    if (p.avatar) av.innerHTML = `<img src="${esc(p.avatar)}" alt="">`;
    else av.textContent = '🍜';
    $('#pf-shops').textContent = Store.shops().length;
    // フォロー/フォロワーは将来機能（今は0固定のプレースホルダ）
    $('#pf-following').textContent = p.following || 0;
    $('#pf-followers').textContent = p.followers || 0;
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
  const PALETTE = ['#e1306c', '#fa7e1e', '#962fbf', '#4f5bd5', '#feda75', '#fd5949', '#8a3ab9', '#f77737', '#c13584', '#5851db', '#ffdc80', '#e95950', '#bc2a8d', '#9e9e9e', '#4caf50'];

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
      data: { labels: months, datasets: [{ label: '訪問件数', data: counts, backgroundColor: '#e1306c', borderRadius: 6 }] },
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
    doughnut('chart-dish-genre', tally(visits.flatMap(v => v.dishGenres || [])));

    // 都道府県別
    const prefEntries = tally(shops.map(s => (s.country && s.country !== '日本') ? s.country : s.pref));
    chart('chart-pref', {
      type: 'bar',
      data: { labels: prefEntries.map(e => e[0]), datasets: [{ label: '店舗数', data: prefEntries.map(e => e[1]), backgroundColor: '#fa7e1e', borderRadius: 6 }] },
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
  }

  // ========== 店舗詳細モーダル ==========
  // 編集モードの料理ジャンル選択状態（vid → Set）
  let editGenreSets = new Map();

  async function showShop(shopId, editMode = false, editVid = null) {
    const s = Store.getShop(shopId);
    if (!s) return;
    const vs = Store.visitsOf(shopId);
    const avg = Store.avgRating(shopId);
    const body = $('#modal-body');

    // ヘッダー
    const headHtml = editMode ? `
      <div class="detail-head"><h2>✏️ 店舗情報の編集</h2>
        <div class="d-sub">店名・住所などを変更して「💾 保存」を押してください。</div>
      </div>` : `
      <div class="detail-head">
        <h2>${esc(s.name)} ${s.favorite ? '⭐' : ''}</h2>
        <div class="d-stars">${starStr(avg)} 味${avg || '評価なし'}　<span style="color:var(--muted);font-size:13px">訪問${vs.length}回</span></div>
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

    const axisHtml = `
      <div class="axis-box">
        <div class="axis-title">お店の評価（タップで変更・その場で保存されます）</div>
        ${['casual', 'atmosphere', 'speed'].map(k => `
          <div class="axis-row"><span>${AXIS_LABEL[k]}</span>
            <div class="stars small d-axis" data-axis="${k}">
              ${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" class="${(s[k] || 0) >= i ? 'on' : ''}">★</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>`;

    const actionsHtml = editMode ? `
      <div class="detail-actions">
        <button class="btn primary" id="d-save-all">💾 保存</button>
        <button class="btn" id="d-cancel">キャンセル</button>
      </div>` : `
      <div class="detail-actions">
        <button class="btn small" id="d-add-visit">＋ 訪問を追加</button>
        <button class="btn small" id="d-edit">${IC_EDIT} 店舗情報</button>
        <button class="btn small" id="d-fav">${s.favorite ? '⭐ お気に入り解除' : '☆ お気に入り登録'}</button>
        <button class="btn small" id="d-closed">${s.status === 'closed' ? '営業中に戻す' : '閉店にする'}</button>
        <button class="btn small danger" id="d-delete">店舗を削除</button>
      </div>`;

    // 編集モードは「店舗情報のみ」。各訪問の編集は表示モードの訪問カードから個別に行う
    body.innerHTML = editMode ? `
      ${headHtml}
      ${shopFormHtml}
      ${actionsHtml}` : `
      ${headHtml}
      ${axisHtml}
      ${actionsHtml}
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

    if (editMode) {
      $('#d-save-all').addEventListener('click', saveShopInfo);
      $('#d-cancel').addEventListener('click', () => showShop(shopId, false));
    } else {
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
      for (const v of vs) {
        const block = document.createElement('div');
        block.className = 'visit-block';
        block.dataset.vid = v.id;
        if (editVid === v.id) {
          // ---- この訪問だけをインライン編集 ----
          block.innerHTML = `
            <div class="ve-row">味の評価 <span class="stars small ve-stars" data-rating="${v.rating}"></span></div>
            <div class="ve-sub">料理ジャンル</div>
            <div class="ve-genres"></div>
            <div class="ve-row">訪問日 <input type="date" class="ve-date" value="${toDateInput(v.datetime)}"></div>
            <textarea rows="2" class="ve-comment" placeholder="コメント・感想">${esc(v.comment || '')}</textarea>
            <div class="v-btns">
              <button type="button" class="btn small primary ve-save">💾 保存</button>
              <button type="button" class="btn small ve-cancel">キャンセル</button>
            </div>`;
          vbox.appendChild(block);
          const starsEl = block.querySelector('.ve-stars');
          const paint = (r) => [...starsEl.children].forEach((x, i) => x.classList.toggle('on', i < r));
          for (let i = 1; i <= 5; i++) {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = '★';
            b.addEventListener('click', () => { starsEl.dataset.rating = i; paint(i); });
            starsEl.appendChild(b);
          }
          paint(v.rating || 0);
          const set = new Set(v.dishGenres || []);
          Api.buildGenrePicker(block.querySelector('.ve-genres'), set);
          block.querySelector('.ve-cancel').addEventListener('click', () => showShop(shopId, false, null));
          block.querySelector('.ve-save').addEventListener('click', () => {
            const dateVal = block.querySelector('.ve-date').value;
            if (!dateVal) { App.toast('訪問日を入力してください'); return; }
            Store.updateVisit(v.id, {
              datetime: new Date(dateVal + 'T12:00:00').toISOString(),
              rating: +(starsEl.dataset.rating || 3),
              dishGenres: [...set],
              comment: block.querySelector('.ve-comment').value.trim(),
            });
            App.toast('✅ 保存しました');
            showShop(shopId, false, null);
            App.refreshCurrent();
          });
        } else {
          // ---- 読み取り表示（編集・削除ボタン付き） ----
          block.innerHTML = `
            <div class="v-head">
              <span class="v-date">${new Date(v.datetime).toLocaleDateString('ja-JP', { dateStyle: 'medium' })}</span>
              <span class="v-stars">${starStr(v.rating)}</span>
              ${(v.dishGenres || []).map(g => `<span class="chip tag">${esc(g)}</span>`).join('')}
            </div>
            ${v.comment ? `<div class="v-comment">${esc(v.comment)}</div>` : ''}
            <div class="v-photos"></div>
            <div class="v-btns">
              <button type="button" class="btn small ve-edit">${IC_EDIT} この記録を編集</button>
              <button type="button" class="btn small danger ve-del">削除</button>
            </div>`;
          Store.photosOfVisit(v.id).then(ps => {
            const row = block.querySelector('.v-photos');
            ps.forEach(p => {
              const img = document.createElement('img');
              img.src = photoUrl(p);
              img.addEventListener('click', () => openLightbox(photoUrl(p), `${s.name}　${fmtDate(v.datetime)}`));
              row.appendChild(img);
            });
          });
          block.querySelector('.ve-edit').addEventListener('click', () => showShop(shopId, false, v.id));
          block.querySelector('.ve-del').addEventListener('click', async () => {
            if (!confirm('この記録を削除しますか？')) return;
            await Store.deleteVisit(v.id);
            showShop(shopId, false, null);
            App.refreshCurrent();
          });
          vbox.appendChild(block);
        }
      }
    }

    $('#modal').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
  }

  return { refreshMap, initList, renderList, initPhotos, renderPhotos, renderStats, initProfile, renderProfile, showShop, closeModal, openLightbox, getMap: () => map, baseMapStyle };
})();
