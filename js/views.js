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
  const IC_CAR = '<svg class="nm-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l1.6-4.2A2 2 0 0 1 7.5 6.5h9A2 2 0 0 1 18.4 7.8L20 12"/><rect x="3" y="12" width="18" height="5" rx="1.6"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/></svg>';
  const IC_TRAIN = '<svg class="nm-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 11h12"/><circle cx="9" cy="13.5" r="0.6"/><circle cx="15" cy="13.5" r="0.6"/><path d="M9 20l1.5-3"/><path d="M15 20l-1.5-3"/></svg>';
  const IC_WALK = '<svg class="nm-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4.2" r="1.6"/><path d="M13 8l-1.5 3.5L14 14l1 6"/><path d="M11.5 11.5L8.5 13"/><path d="M14 12.5l3 1"/><path d="M11.5 13.5L9 20"/></svg>';
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
    // 別端末から取り込んだ写真はローカルにblobが無く、クラウドの公開URLで表示する
    if (!rec.blob && rec.remoteUrl) return rec.remoteUrl;
    if (!rec.blob) return null;
    if (!urlCache.has(rec.id)) urlCache.set(rec.id, URL.createObjectURL(rec.blob));
    return urlCache.get(rec.id);
  }

  // ---------- サムネイル（グリッド・一覧用の縮小画像） ----------
  // 元の写真は大きい（数MB）ので、一覧では320pxに縮小した画像を使って表示を軽くする。
  // 一度作ったサムネイルはIndexedDBに保存し、次回からは生成せずに即表示する。
  const thumbCache = new Map(); // photoId → Promise<url>
  function thumbUrl(rec) {
    if (!rec) return Promise.resolve(null);
    if (!rec.blob) return Promise.resolve(rec.remoteUrl || null); // 別端末の写真は公開URLのまま
    if (thumbCache.has(rec.id)) return thumbCache.get(rec.id);
    const p = (async () => {
      let blob = rec.thumb; // 保存済みならそれを使う
      if (!blob) {
        try {
          const bmp = await createImageBitmap(rec.blob);
          const scale = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
          const w = Math.max(1, Math.round(bmp.width * scale));
          const h = Math.max(1, Math.round(bmp.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(bmp, 0, 0, w, h);
          bmp.close();
          blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.75));
          if (blob) Store.putPhotoThumb(rec.id, blob).catch(() => {});
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

  // ========== 地図（MapLibre GLネイティブ: 2本指で回転可能） ==========
  let map = null, heatOn = false, mapLoaded = false, pendingRefresh = false, mapPopup = null;
  let userMarker = null;      // 現在地マーカー（青い点）
  let lastKnownPos = null;    // 直近の現在地 { lat, lon }（ナビの出発地に使う）
  let mapScope = 'me';        // 地図の表示範囲: 'me' 自分のみ / 'all' 自分＋つながり / 'wish' 行きたい店のみ
  let networkPosts = [];      // つながっている人の投稿（地図「みんな」用）
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
    return `<div class="p-sub">${t ? starStr(Math.round(+t)) : ''} 味 ${t || '－'}</div>`
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
  // 評価の色（色相を大きく離してくっきり）: ★1灰→★2青→★3緑→★4橙→★5赤。[0]=評価なし（薄灰）
  const PIN_COLORS = ['#CBD5E1', '#94A3B8', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444'];
  const WISH_COLOR = '#8B5CF6'; // 行きたい店のピン（評価色と混ざらない紫）
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
      // 店舗ピン（クラスター付き）。クラスターの色は中で一番評価の高い店の色
      map.addSource('shops', {
        type: 'geojson', data: { type: 'FeatureCollection', features: [] },
        cluster: true, clusterMaxZoom: 11, clusterRadius: 40, // z12以上でピンが個別化し店名を表示できる
        clusterProperties: { maxR: ['max', ['get', 'r']] },
      });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'shops',
        filter: ['has', 'point_count'],
        paint: { 'circle-color': colorByR('maxR'), 'circle-radius': CLUSTER_RADIUS,
          'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 1] } });
      // クラスターに件数の数字は表示しない（丸の大きさだけでまとまりを表す）
      map.addLayer({ id: 'pins', type: 'circle', source: 'shops',
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': colorByR('r'), 'circle-radius': PIN_RADIUS,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 12, 2] } });
      // 平均が .5 以上（あと一歩でワンランク上）の店は中心に白い点を重ねて区別する
      map.addLayer({ id: 'pin-dot', type: 'circle', source: 'shops',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'hi'], 1]],
        paint: { 'circle-color': '#ffffff',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.3, 14, 2, 15, 2.3, 20, 2.3] } });
      // お気に入り★（拡大時のみ）
      map.addLayer({ id: 'pin-fav', type: 'symbol', source: 'shops', minzoom: 12,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'fav'], 1]],
        layout: { 'text-field': '★', 'text-font': FONT, 'text-size': 11,
          'text-offset': [0.8, -0.8], 'text-allow-overlap': true },
        paint: { 'text-color': '#f5b301', 'text-halo-color': '#fff', 'text-halo-width': 1 } });
      // 店名＋ジャンルのラベル（z12以上：以前より低い倍率から表示）
      map.addLayer({ id: 'pin-labels', type: 'symbol', source: 'shops', minzoom: 12,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['case', ['==', ['get', 'genre'], ''], ['get', 'name'],
            ['concat', ['get', 'name'], '\n', ['get', 'genre']]],
          'text-font': FONT, 'text-size': 10, 'text-anchor': 'bottom',
          'text-offset': [0, -0.9], 'text-max-width': 12,
        },
        paint: { 'text-color': dark ? '#e8e6e1' : '#3a3833',
          'text-halo-color': dark ? '#1a1b1f' : '#ffffff', 'text-halo-width': 1.2 } });

      // 行きたい店（紫のピン）。評価色と混ざらないよう独立したソースで描く
      map.addSource('wishes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'wish-pins', type: 'circle', source: 'wishes',
        paint: { 'circle-color': WISH_COLOR, 'circle-radius': PIN_RADIUS,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 12, 2] } });
      map.addLayer({ id: 'wish-labels', type: 'symbol', source: 'wishes', minzoom: 12,
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 10,
          'text-anchor': 'bottom', 'text-offset': [0, -0.9], 'text-max-width': 12 },
        paint: { 'text-color': WISH_COLOR,
          'text-halo-color': dark ? '#1a1b1f' : '#ffffff', 'text-halo-width': 1.2 } });

      // タップ: ピン → 店舗ポップアップ / クラスター → ズームイン / 行きたい → 行きたいポップアップ
      map.on('click', 'pins', (e) => openPinPopup(e.features[0]));
      map.on('click', 'wish-pins', (e) => openWishPopup(e.features[0]));
      map.on('click', 'clusters', (e) => {
        const f = e.features[0];
        map.getSource('shops').getClusterExpansionZoom(f.properties.cluster_id)
          .then(z => map.easeTo({ center: f.geometry.coordinates, zoom: z }));
      });
      ['pins', 'clusters', 'wish-pins'].forEach(id => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });

      refreshMapData(true);
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
      refreshMap();
    });

    // 味の評価の星チップ（★3以上/★4以上/★5だけ。もう一度押すと解除）→ 内部の#mf-tasteへ
    document.querySelectorAll('.map-star-chip').forEach(b => b.addEventListener('click', () => {
      const next = $('#mf-taste').value === b.dataset.r ? '0' : b.dataset.r;
      $('#mf-taste').value = next;
      document.querySelectorAll('.map-star-chip').forEach(x => x.classList.toggle('on', x.dataset.r === next && next !== '0'));
      refreshMap();
    }));

    // 店の評価3軸（気軽さ・雰囲気・早さ）のセレクト
    ['#mf-casual', '#mf-atmosphere', '#mf-speed'].forEach(sel =>
      $(sel).addEventListener('change', refreshMap));

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
      refreshMap();
    }));

    // 検索バー横のしおり: 行きたい店（紫ピン）だけの表示に切り替え（もう一度押すと元へ）
    let prevScope = 'me';
    $('#map-wish-btn').addEventListener('click', () => {
      if (mapScope === 'wish') {
        mapScope = prevScope || 'me';
        $('#map-wish-btn').classList.remove('on');
        refreshMap();
        return;
      }
      if (!Store.wishes().some(w => w.lat != null)) {
        App.toast('行きたい店はまだありません。ホームの投稿のしおりマークから保存できます');
        return;
      }
      prevScope = mapScope;
      mapScope = 'wish';
      $('#map-wish-btn').classList.add('on');
      refreshMap();
    });

    $('#map-locate').addEventListener('click', () => locateUser(true));
    $('#map-nearby').addEventListener('click', () => openNearby());
    $('#map-heat').addEventListener('click', toggleHeat);
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
              <div class="nb-sub">${esc(shopLabelGenre(r.s) || '')}${avg ? '　★' + avg : ''}</div>
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

  // つながりの人のピン → 投稿ポップアップ（誰の・写真・評価・詳細）
  // 複数人が同じ店に行っている場合は1つのピンにまとまっており、全員の平均を表示する
  function openOtherPinPopup(feature) {
    const g = networkById.get(feature.properties.id);
    if (!g) return;
    const posts = g.posts;
    const latest = posts[0]; // 新しい順の先頭
    const multi = posts.length > 1;
    const names = [...new Set(posts.map(p => '@' + p.username))];
    const who = multi
      ? `${names.slice(0, 3).join('・')}${names.length > 3 ? ' ほか' : ''}が訪問`
      : `@${latest.username} さんの訪問`;
    const node = document.createElement('div');
    node.className = 'popup';
    node.innerHTML = `
        ${latest.photoUrl ? `<img src="${esc(latest.photoUrl)}" alt="">` : ''}
        <div class="p-who">${esc(who)}</div>
        <div class="p-name">${esc(g.name || '')}</div>
        ${mapStatsLine(mapStats.get(feature.properties.id))}
        ${latest.genre ? `<div class="p-sub">${esc(latest.genre)}</div>` : ''}
        ${latest.comment ? `<div class="p-comment">${esc(latest.comment.slice(0, 60))}</div>` : ''}
        <div class="p-actions">
          <button class="btn small popup-nav">${IC_NAV} ここへ行く</button>
          <button class="btn small popup-wish${wishStateForPost(latest) ? ' on-wish' : ''}">${IC_BOOKMARK} 行きたい</button>
          <button class="btn small popup-detail">${multi ? '最新の投稿 →' : '投稿を見る →'}</button>
        </div>`;
    node.querySelector('.popup-detail').addEventListener('click', () => showPostDetail(latest));
    node.querySelector('.popup-nav').addEventListener('click', () => openNav({ name: g.name, lat: g.lat, lon: g.lon }));
    node.querySelector('.popup-wish').addEventListener('click', (e) => {
      toggleWishForPost(latest, null);
      e.currentTarget.classList.toggle('on-wish', wishStateForPost(latest));
    });
    if (mapPopup) mapPopup.remove();
    mapPopup = new maplibregl.Popup({ offset: 12, maxWidth: '240px' })
      .setLngLat([g.lon, g.lat]).setDOMContent(node).addTo(map);
  }

  // ピンをタップ → 店舗ポップアップ（写真・評価・詳細ボタン）
  async function openPinPopup(feature) {
    if (feature.properties.kind === 'other') { openOtherPinPopup(feature); return; }
    const s = Store.getShop(feature.properties.id);
    if (!s) return;
    const vs = Store.visitsOf(s.id);
    const rep = await Store.repPhoto(s.id);
    const last = vs[0];
    // 「みんな」表示では本人＋フォロワーを合わせた平均（mapStatsに集約済み）
    const st = mapStats.get(s.id);
    const node = document.createElement('div');
    node.className = 'popup';
    node.innerHTML = `
        ${rep ? `<img alt="" decoding="async">` : ''}
        <div class="p-name">${esc(s.name)}${s.favorite ? ' ' + IC_FAV : ''}</div>
        ${mapStatsLine(st)}
        <div class="p-sub">訪問${vs.length}回${last ? '　最終: ' + fmtDate(last.datetime) : ''}</div>
        ${last && last.comment ? `<div class="p-comment">${esc(last.comment.slice(0, 60))}</div>` : ''}
        <div class="p-actions">
          <button class="btn small popup-nav">${IC_NAV} ここへ行く</button>
          <button class="btn small popup-detail">店舗詳細 →</button>
        </div>`;
    if (rep) setThumb(node.querySelector('img'), rep); // ポップアップも縮小画像で軽く
    node.querySelector('.popup-detail').addEventListener('click', () => showShop(s.id));
    node.querySelector('.popup-nav').addEventListener('click', () => openNav(s));
    if (mapPopup) mapPopup.remove();
    mapPopup = new maplibregl.Popup({ offset: 12, maxWidth: '240px' })
      .setLngLat([s.lon, s.lat]).setDOMContent(node).addTo(map);
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
          r: 0, hi: 0, fav: s.favorite ? 1 : 0 } };
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
        if (mapGenreFilter.size && !(p.genre || '').split('・').some(g => mapGenreFilter.has(g))) continue;
        const minT = +($('#mf-taste').value || 0);
        if (minT && (p.rating || 0) < minT) continue;
        if (kw) {
          const hay = [p.shopName, p.username, p.displayName, p.comment].join(' ').toLowerCase();
          if (!hay.includes(kw)) continue;
        }
        // 自分も行った店なら自分のピンへ合算（1つのピン・全員の平均になる）
        const mine = (p.lat != null) ? Store.matchShop({ name: p.shopName, lat: p.lat, lon: p.lon }) : null;
        if (mine && mapStats.has(mine.id)) {
          const st = mapStats.get(mine.id);
          if (p.rating) st.taste.push(p.rating);
          if (p.casual > 0) st.casual.push(p.casual);
          if (p.atmosphere > 0) st.atmosphere.push(p.atmosphere);
          if (p.speed > 0) st.speed.push(p.speed);
          continue;
        }
        // 他人だけの店: 同名＋近接（約100m）で1つにまとめる
        let g = netGroups.find(x => x.name === (p.shopName || '') &&
          Store.distMeters(x.lat, x.lon, p.lat, p.lon) < 100);
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
        const avg = avgOf(mapStats.get(fid).taste);
        g.avg = avg;
        networkById.set(fid, g);
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [g.lon, g.lat] },
          properties: { id: fid, kind: 'other', mine: 0, name: g.name, genre: '',
            r: Math.floor(avg) || 0, hi: bandOf(avg), fav: 0 } });
        bounds.push([g.lon, g.lat]);
      });
    }

    // 自分の店の色を確定（「みんな」ではフォロー中の人の評価も合算済みの平均）
    for (const s of shops) {
      const avg = avgOf(mapStats.get(s.id).taste);
      const f = featureByShopId.get(s.id);
      f.properties.r = Math.floor(avg) || 0;
      f.properties.hi = bandOf(avg);
    }
    map.getSource('shops').setData({ type: 'FeatureCollection', features });
    refreshWishData();

    if (fit && bounds.length) {
      const b = new maplibregl.LngLatBounds();
      bounds.forEach(c => b.extend(c));
      try { map.fitBounds(b, { padding: 70, maxZoom: 16, duration: 0 }); } catch { /* noop */ }
    }
    if (heatOn) buildHeat();
  }

  // 行きたい店のピンを地図へ反映（保存/削除のたびに呼べる）
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

  // つながっている人の投稿を読み込む（地図「みんな」用）
  async function loadNetworkPosts() {
    try { networkPosts = (typeof Cloud !== 'undefined') ? await Cloud.fetchNetworkPosts() : []; }
    catch { networkPosts = []; }
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

  // ---------- 発見グリッド（インスタ風: 検索タブの初期画面） ----------
  // 自分＋フォロー中の人の写真を名前なしで敷き詰め、タップでホームと同じ投稿表示を開く
  let exploreMode = true;
  let exploreNetCache = null; // { posts, time }: フォロー中の人の投稿の短時間キャッシュ

  function setListMode(explore) {
    exploreMode = explore;
    $('#explore-grid').classList.toggle('hidden', !explore);
    $('#shop-list').classList.toggle('hidden', explore);
    $('#list-back').classList.toggle('hidden', explore); // 検索モード中だけ←（戻る）を出す
    if (explore) renderExplore(); else renderList();
  }

  // 検索タブを開いたときは常に最初の画面（発見グリッド）から始める
  function enterListTab() {
    // プロフィールの「お店をさがす」に検索UIを移動していたら元の位置へ戻す
    const lv = $('#view-list');
    const fc = $('#list-filters-card');
    if (!lv.contains(fc)) {
      lv.insertBefore(fc, $('#explore-grid'));
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
      casual: shop.casual, atmosphere: shop.atmosphere, speed: shop.speed,
    };
  }

  async function renderExplore() {
    const box = $('#explore-grid');
    box.innerHTML = SKEL_GRID;
    // 自分の写真（訪問日の新しい順の材料に時刻を持たせる）
    const photos = await Store.allPhotos();
    const vById = new Map(Store.visits().map(v => [v.id, v]));
    const items = photos.map(ph => {
      const v = vById.get(ph.visitId);
      return { kind: 'mine', ph, time: (v && v.datetime ? new Date(v.datetime).getTime() : 0) || ph.createdAt || 0 };
    });
    // フォロー中の人の投稿（写真つきのみ）
    try {
      if (typeof Cloud !== 'undefined' && Cloud.getUser()) {
        if (!exploreNetCache || Date.now() - exploreNetCache.time > 60000) {
          exploreNetCache = { posts: await Cloud.fetchNetworkPosts(), time: Date.now() };
        }
        for (const p of exploreNetCache.posts) {
          if (p.photoUrl) items.push({ kind: 'net', p, time: p.datetime ? new Date(p.datetime).getTime() : 0 });
        }
      }
    } catch { /* 未ログイン・通信失敗時は自分の写真のみ */ }
    items.sort((a, b) => b.time - a.time);
    if (!items.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, 'まだ写真がありません。<br>「＋」から最初の一皿を記録しましょう。');
      return;
    }
    box.innerHTML = '';
    for (const it of items) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'explore-cell';
      cell.innerHTML = '<img alt="" loading="lazy" decoding="async">';
      if (it.kind === 'mine') setThumb(cell.querySelector('img'), it.ph);
      else cell.querySelector('img').src = it.p.photoUrl;
      cell.addEventListener('click', () => showPostDetail(it.kind === 'net' ? it.p : buildOwnPost(it.ph)));
      box.appendChild(cell);
    }
  }

  function renderList() {
    if (exploreMode) {
      // タブを開いた直後は発見グリッドを表示（検索バーをタップすると店舗検索へ）
      $('#explore-grid').classList.remove('hidden');
      $('#shop-list').classList.add('hidden');
      $('#list-back').classList.add('hidden');
      renderExplore();
      return;
    }
    refreshPrefOptions();
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
      <button class="s-fav ${s.favorite ? 'on' : ''}" data-fav="${s.id}" title="お気に入り" aria-label="お気に入り">${IC_HEART}</button>`;
    return div;
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
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, '写真がありません。');
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
      $('#pf-login').addEventListener('click', async () => {
        $('#pf-login').textContent = 'ログイン中…';
        try { await Cloud.login(); }
        catch (e) {
          $('#pf-login').textContent = 'Googleでログインして同期';
          App.toast('⚠️ ログインに失敗しました: ' + (e && e.message || e));
        }
      });
      $('#pf-logout').addEventListener('click', () => Cloud.logout());
      // 写真の強制再同期（Storageルール修正後の穴埋め・別端末への取り込み）
      $('#pf-resync').addEventListener('click', async () => {
        const btn = $('#pf-resync');
        btn.disabled = true; btn.textContent = '再同期中…';
        try {
          const r = await Cloud.resyncPhotos(({ phase, i, total }) => {
            const label = phase === 'upload' ? '↑' : '↓';
            btn.textContent = `${label}${i}/${total}…`;
          });
          const detail = r.fail ? `／失敗${r.fail}${r.error ? '（' + r.error + '）' : ''}` : '';
          App.toast(`写真同期: ↑${r.up} ↓${r.down} ${detail}`);
        } catch (e) { App.toast('⚠️ ' + (e && e.message || e)); }
        btn.disabled = false; btn.textContent = '写真を再同期';
      });
      // 同期状態の表示更新
      const SYNC_MSG = { loading: 'ログイン中…', syncing: '同期中…', synced: '✅ 同期済み', error: '⚠️ 同期エラー' };
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
        if (state === 'synced') { renderProfile(); refreshNotifBadge(); } // 復元されたデータ・通知を反映
        if (state === 'signedout') { const bd = $('#notif-badge'); if (bd) bd.classList.add('hidden'); }
      });
    } else {
      $('#pf-login').textContent = 'この端末では同期を利用できません';
      $('#pf-login').disabled = true;
    }

    $('#pf-share').addEventListener('click', () => openShareProfile());
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
      renderList();
    } else {
      renderProfilePhotos();
    }
  }

  // プロフィールの写真グリッド（全写真・撮影日の新しい順・タップで拡大）
  async function renderProfilePhotos() {
    const box = $('#pf-photo-grid');
    box.innerHTML = SKEL_GRID;
    const photos = await Store.allPhotos();
    // 撮影日（訪問日）の新しい順。日付が無ければ登録順で補完
    const vById = new Map(Store.visits().map(v => [v.id, v]));
    const shotTime = (p) => {
      const v = vById.get(p.visitId);
      const t = v && v.datetime ? new Date(v.datetime).getTime() : 0;
      return t || p.createdAt || 0;
    };
    photos.sort((a, b) => shotTime(b) - shotTime(a) || b.createdAt - a.createdAt);
    if (!photos.length) {
      box.innerHTML = emptyBox(EMPTY_IC_PHOTO, 'まだ写真がありません。<br>「＋」から最初の一皿を記録しましょう。');
      return;
    }
    box.innerHTML = '';
    for (const ph of photos) {
      const shop = Store.getShop(ph.shopId);
      const div = document.createElement('div');
      div.className = 'photo-cell';
      div.innerHTML = `<img alt="" loading="lazy" decoding="async"><div class="cap">${esc(shop ? shop.name : '')}</div>`;
      setThumb(div.querySelector('img'), ph);
      // タップでホームと同じ投稿表示（写真をさらにタップすると拡大）
      div.addEventListener('click', () => showPostDetail(buildOwnPost(ph)));
      box.appendChild(div);
    }
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
  const PALETTE = ['#e1306c', '#fa7e1e', '#962fbf', '#4f5bd5', '#feda75', '#fd5949', '#8a3ab9', '#f77737', '#c13584', '#5851db', '#ffdc80', '#e95950', '#bc2a8d', '#9e9e9e', '#4caf50'];

  async function renderStats() {
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
      memBox.innerHTML = `<span class="sm-ic">🕰</span> ${yearsAgo}年前の今ごろ、<b>${esc(s ? s.name : '')}</b> に行きました（${starStr(v.rating || 0)}）`;
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
      <div class="detail-head"><h2>${IC_EDIT} 店舗情報の編集</h2>
        <div class="d-sub">店名・住所などを変更して「保存」を押してください。</div>
      </div>` : `
      <div class="detail-head">
        <h2>${esc(s.name)} ${s.favorite ? IC_FAV : ''}</h2>
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
        <button class="btn primary" id="d-save-all">保存</button>
        <button class="btn" id="d-cancel">キャンセル</button>
      </div>` : `
      <div class="detail-actions">
        ${s.lat != null && s.lon != null ? `<button class="btn small primary" id="d-nav">${IC_NAV} ここへ行く</button>` : ''}
        <button class="btn small" id="d-add-visit">＋ 訪問を追加</button>
        <button class="btn small" id="d-edit">${IC_EDIT} 店舗情報</button>
        <button class="btn small ${s.favorite ? 'on-fav' : ''}" id="d-fav">${IC_FAV} ${s.favorite ? 'お気に入り解除' : 'お気に入り登録'}</button>
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
      const navBtn = $('#d-nav');
      if (navBtn) navBtn.addEventListener('click', () => openNav(s));
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
              <button type="button" class="btn small primary ve-save">保存</button>
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
            // フィードの公開投稿も新しい内容で更新（ログイン中のみ）
            if (typeof Cloud !== 'undefined' && Cloud.getUser()) {
              Cloud.publishPostForVisit(v.id).catch(() => {});
            }
            App.toast('✅ 保存しました');
            showShop(shopId, false, null);
            App.refreshCurrent();
          });
        } else {
          // ---- 読み取り表示: 写真＋左上に星の数＋下に日付。タップでその店の訪問記録一覧ページへ ----
          const dateStr = new Date(v.datetime).toLocaleDateString('ja-JP');
          block.innerHTML = `
            <button type="button" class="v-cover">
              <span class="v-cover-ph">🍽️</span>
              <span class="v-badge">★${v.rating || '－'}</span>
            </button>
            <div class="v-caption">${dateStr}</div>`;
          const cover = block.querySelector('.v-cover');
          cover.addEventListener('click', () => showVisitList(shopId));
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
    }

    $('#modal').classList.remove('hidden');
  }

  // その店の訪問記録を一覧で見るページ（日付・評価・ジャンル・コメント・写真・編集/削除）
  function showVisitList(shopId) {
    const s = Store.getShop(shopId);
    if (!s) return;
    const ov = document.createElement('div');
    ov.className = 'modal visitlist-modal';
    ov.innerHTML = `<div class="modal-box">
        <button type="button" class="modal-close vl-close" aria-label="閉じる">✕</button>
        <h2 class="vl-title">${esc(s.name)} の訪問記録</h2>
        <div class="vl-body"></div>
      </div>`;
    const body = ov.querySelector('.vl-body');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.vl-close').addEventListener('click', close);

    const render = () => {
      const list = Store.visitsOf(shopId);
      if (!list.length) { body.innerHTML = '<div class="empty"><p>訪問記録がありません。</p></div>'; return; }
      body.innerHTML = '';
      for (const v of list) {
        const card = document.createElement('div');
        card.className = 'visit-block';
        card.innerHTML = `
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
          const row = card.querySelector('.v-photos');
          ps.forEach(p => {
            const img = document.createElement('img');
            img.src = photoUrl(p);
            img.addEventListener('click', () => openLightbox(photoUrl(p), `${s.name}　${fmtDate(v.datetime)}`));
            row.appendChild(img);
          });
        });
        card.querySelector('.ve-edit').addEventListener('click', () => { close(); showShop(shopId, false, v.id); });
        card.querySelector('.ve-del').addEventListener('click', async () => {
          if (!confirm('この記録を削除しますか？')) return;
          await Store.deleteVisit(v.id);
          App.refreshCurrent();
          render();
        });
        body.appendChild(card);
      }
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

  // ---------- 下に引っ張って更新（プルリフレッシュ） ----------
  let ptrSetup = false;
  function setupPullToRefresh() {
    if (ptrSetup) return;
    ptrSetup = true;
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
    const box = $('#feed-list');
    const me = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
    if (!me) {
      box.innerHTML = `<div class="empty"><p>ホームではフォロー中の人の投稿が見られます。<br>プロフィール画面からGoogleログインしてください。</p></div>`;
      return;
    }
    // 直近に取得済みなら再取得せず即描画（ホームを開くたびの通信を減らす）
    let posts;
    if (!force && feedCache && (Date.now() - feedCache.time < FEED_TTL)) {
      posts = feedCache.posts;
    } else {
      box.innerHTML = SKEL_FEED;
      try { posts = await Cloud.fetchFeed(); } catch (e) { posts = []; }
      feedCache = { posts, time: Date.now() };
      feedStats.clear(); // 取り直したら数値キャッシュも作り直す
    }
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
    // 更新は下に引っ張るプルリフレッシュで行う（右上の更新ボタンは廃止）
    box.innerHTML = posts.map(postCard).join('');
    const applyStats = (card, s) => {
      const lb = card.querySelector('.fa-like');
      if (lb) { lb.querySelector('.fa-like-n').textContent = s.likes; lb.classList.toggle('liked', s.liked); }
      const cel = card.querySelector('.fa-cmt-n'); if (cel) cel.textContent = s.commentCount;
      // コメントのプレビュー（最新2件＋「すべて見る」）
      const cbox = card.querySelector('.feed-comments');
      if (cbox) {
        const list = s.commentList || [];
        let html = '';
        if (s.commentCount > 2) html += `<div class="feed-cmore">コメント${s.commentCount}件をすべて見る</div>`;
        html += list.slice(-2).map(c => `<div class="feed-crow"><b>${esc(c.displayName || 'BITEMAP')}</b> ${esc(c.text)}</div>`).join('');
        cbox.innerHTML = html;
      }
    };
    box.querySelectorAll('.feed-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.feed-author') || e.target.closest('.fa-like')) return;
        const p = feedPosts.get(card.dataset.post);
        if (p) showPostDetail(p);
      });
      const id = card.dataset.post;
      const cached = feedStats.get(id);
      if (cached) { applyStats(card, cached); } // キャッシュがあれば通信しない
      else {
        Promise.all([Cloud.getLikeInfo(id), Cloud.getComments(id)]).then(([info, list]) => {
          const s = { likes: info.count, liked: info.liked, commentList: list, commentCount: list.length };
          feedStats.set(id, s); applyStats(card, s);
        }).catch(() => {});
      }
    });
    box.querySelectorAll('.feed-author').forEach(el =>
      el.addEventListener('click', (e) => { e.stopPropagation(); showPublicProfile(el.dataset.u); }));
    box.querySelectorAll('.fa-like').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); toggleLikeUI(btn); }));
    box.querySelectorAll('.fa-save').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = feedPosts.get(btn.dataset.post);
      if (p) toggleWishForPost(p, btn);
    }));
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

  function postCard(p) {
    const av = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '🍜';
    const when = p.datetime ? fmtDate(p.datetime) : '';
    const stars = p.rating
      ? `<div class="feed-rating"><span class="feed-stars">${starStr(p.rating)}</span><span class="feed-rating-num">${p.rating}</span></div>`
      : '';
    return `<article class="feed-card" data-post="${esc(p.id)}">
        <div class="feed-head">
          <button type="button" class="feed-author" data-u="${esc(p.username)}">
            <span class="fc-avatar">${av}</span>
            <span class="fc-name">${esc(p.displayName || 'BITEMAP')}</span>
          </button>
          <span class="feed-date">${when}</span>
        </div>
        ${p.photoUrl ? `<img class="feed-photo" src="${esc(p.photoUrl)}" alt="" loading="lazy" decoding="async">` : ''}
        <div class="feed-actions">
          <button type="button" class="fa-like" data-post="${esc(p.id)}" aria-label="いいね">${IC_HEART}<span class="fa-n fa-like-n">·</span></button>
          <button type="button" class="fa-comment" data-post="${esc(p.id)}" aria-label="コメント">${IC_COMMENT}<span class="fa-n fa-cmt-n">·</span></button>
          <button type="button" class="fa-save${wishStateForPost(p) ? ' on' : ''}" data-post="${esc(p.id)}" aria-label="行きたい店に保存">${IC_BOOKMARK}</button>
        </div>
        <div class="feed-body">
          ${stars}
          <div class="feed-shop">${esc(p.shopName || '')}${p.genre ? ` <span class="feed-genre">${esc(p.genre)}</span>` : ''}</div>
          ${p.comment ? `<div class="feed-comment"><b>${esc(p.username)}</b> ${esc(p.comment)}</div>` : ''}
          <div class="feed-comments"></div>
        </div>
      </article>`;
  }

  // フィード投稿の詳細表示（写真・評価・お店の情報・場所・ナビ）
  function showPostDetail(p) {
    const av = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '🍜';
    const AX = { casual: '気軽さ', atmosphere: '雰囲気', speed: '提供の早さ' };
    const axes = ['casual', 'atmosphere', 'speed'].filter(k => p[k])
      .map(k => `<div class="pd-axis"><span>${AX[k]}</span><span class="pd-axstar">${starStr(p[k])}</span></div>`).join('');
    const loc = [p.station ? IC_STATION + ' ' + esc(p.station) : '', esc([p.pref, p.city].filter(Boolean).join(' '))]
      .filter(Boolean).join('　');
    const ov = document.createElement('div');
    ov.className = 'modal postdetail-modal';
    ov.innerHTML = `<div class="modal-box pd-full">
        <div class="pd-topbar">
          <button type="button" class="modal-close pd-close" aria-label="閉じる">✕</button>
          <button type="button" class="feed-author pd-author" data-u="${esc(p.username)}">
            <span class="fc-avatar">${av}</span>
            <span class="fc-name">${esc(p.displayName || 'BITEMAP')}${p.username ? `<span class="fc-handle">@${esc(p.username)}</span>` : ''}</span>
          </button>
        </div>
        <div class="pd-scroll">
        <div class="pd-photos"></div>
        <div class="pd-body">
          <div class="feed-rating"><span class="feed-stars">${starStr(p.rating || 0)}</span><span class="feed-rating-num">${p.rating || '－'}</span></div>
          <div class="pd-shop">${esc(p.shopName || '')}</div>
          <div class="pd-sub">${esc(p.shopGenre || '')}${p.genre ? '　🍽 ' + esc(p.genre) : ''}</div>
          ${loc ? `<div class="pd-sub">${loc}</div>` : ''}
          ${p.address ? `<div class="pd-sub">${esc(p.address)}</div>` : ''}
          ${axes ? `<div class="pd-axes"><div class="pd-axtitle">お店の評価</div>${axes}</div>` : ''}
          ${p.comment ? `<div class="pd-comment">${esc(p.comment)}</div>` : ''}
          <div class="pd-date">${p.datetime ? fmtDate(p.datetime) : ''}</div>
          ${(p.lat != null && p.lon != null) ? '<button type="button" class="btn primary pd-nav">' + IC_NAV + ' ここへ行く</button>' : ''}
          ${Store.visits().some(v => v.id === p.id) ? `<button type="button" class="btn full pd-edit">${IC_EDIT} この記録を編集</button>` : ''}
          <div class="pd-social">
            <button type="button" class="fa-like pd-like" data-post="${esc(p.id)}" aria-label="いいね">${IC_HEART}<span class="fa-n pd-like-n">·</span></button>
            <span class="pd-cmt-label">${IC_COMMENT} コメント</span>
            <button type="button" class="fa-save pd-save${wishStateForPost(p) ? ' on' : ''}" aria-label="行きたい店に保存">${IC_BOOKMARK}</button>
          </div>
          <div class="pd-comments"></div>
          <div class="pd-cadd">
            <input type="text" class="pd-cinput" placeholder="コメントを追加…" maxlength="300" autocomplete="off">
            <button type="button" class="btn small primary pd-csend">送信</button>
          </div>
        </div>
        </div>
      </div>`;
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.pd-close').addEventListener('click', close);
    ov.querySelector('.pd-author').addEventListener('click', () => { close(); showPublicProfile(p.username); });
    // 訪問記録の写真をすべて全幅で並べる（自分の投稿は端末内の全写真、他人の投稿は代表1枚）
    const cap = `${p.shopName || ''}　${p.datetime ? fmtDate(p.datetime) : ''}`;
    (async () => {
      let urls = [];
      if (Store.visits().some(v => v.id === p.id)) {
        const ps = await Store.photosOfVisit(p.id).catch(() => []);
        urls = ps.map(x => photoUrl(x)).filter(Boolean);
      }
      if (!urls.length && p.photoUrl) urls = [p.photoUrl];
      const box = ov.querySelector('.pd-photos');
      box.innerHTML = urls.map(u => `<img class="pd-photo" src="${esc(u)}" alt="">`).join('');
      box.querySelectorAll('.pd-photo').forEach((img, i) =>
        img.addEventListener('click', () => openLightbox(urls[i], cap)));
    })();
    const nav = ov.querySelector('.pd-nav');
    if (nav) nav.addEventListener('click', () => openNav({ name: p.shopName, lat: p.lat, lon: p.lon }));
    // 自分の投稿は編集できる（訪問記録の編集画面へ）
    const eb = ov.querySelector('.pd-edit');
    if (eb) eb.addEventListener('click', () => {
      const mv = Store.visits().find(v => v.id === p.id);
      if (!mv) return;
      close();
      showShop(mv.shopId, false, mv.id);
    });

    // いいね
    Cloud.getLikeInfo(p.id).then(info => {
      const lb = ov.querySelector('.pd-like');
      lb.querySelector('.pd-like-n').textContent = info.count;
      lb.classList.toggle('liked', info.liked);
    }).catch(() => {});
    ov.querySelector('.pd-like').addEventListener('click', () => toggleLikeUI(ov.querySelector('.pd-like')));
    ov.querySelector('.pd-save').addEventListener('click', () => toggleWishForPost(p, ov.querySelector('.pd-save')));

    // コメント一覧の読み込み・描画
    const loadComments = async () => {
      const box = ov.querySelector('.pd-comments');
      let list = [];
      try { list = await Cloud.getComments(p.id); } catch { list = []; }
      const me = Cloud.getUser();
      box.innerHTML = list.length ? list.map(c => {
        const av = c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : '🍜';
        return `<div class="pd-crow">
            <span class="pd-cav">${av}</span>
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
      const input = ov.querySelector('.pd-cinput');
      const t = input.value.trim();
      if (!t) return;
      if (!Cloud.getUser()) { App.toast('コメントするにはログインが必要です'); return; }
      input.value = '';
      try { await Cloud.addComment(p.id, t); feedStats.delete(p.id); await loadComments(); }
      catch (e) { App.toast('⚠️ ' + (e && e.message || e)); }
    };
    ov.querySelector('.pd-csend').addEventListener('click', sendComment);
    ov.querySelector('.pd-cinput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendComment(); } });

    document.body.appendChild(ov);
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
    ov.className = 'modal notif-modal';
    ov.innerHTML = `<div class="modal-box">
        <div class="modal-head">
          <h2 class="vl-title">お知らせ</h2>
          <button type="button" class="modal-close nt-close" aria-label="閉じる">✕</button>
        </div>
        <div class="nt-body"><div class="empty"><p>読み込み中…</p></div></div>
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
    ov.className = 'modal pubprofile-modal';
    ov.innerHTML = `<div class="modal-box">
        <button type="button" class="modal-close pp-close" aria-label="閉じる">✕</button>
        <div class="pp-body"><div class="empty"><p>読み込み中…</p></div></div>
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
        <div class="pp-shop-star">${s.rating ? '★' + s.rating : ''}</div>
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
        </div>
      </div>
      ${prof.bio ? `<div class="pp-bio">${esc(prof.bio)}</div>` : ''}
      ${isMe ? '' : '<button type="button" class="btn primary pp-follow" disabled>…</button>'}
      <h3 class="pp-h3">よく行くお店</h3>
      <div class="pp-shops">${shops || '<div class="empty"><p>公開されているお店がありません。</p></div>'}</div>`;

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
  }

  return { refreshMap, initList, renderList, enterListTab, initPhotos, renderPhotos, renderStats, initProfile, renderProfile, renderFeed, showShop, closeModal, openLightbox, showPublicProfile, getMap: () => map, baseMapStyle };
})();
