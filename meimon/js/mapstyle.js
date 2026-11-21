// =====================================================
// 地図の見た目: BITEMAP 本体（js/views.js の baseMapStyle）と同じ自前スタイルの写し（v8〜）
//  - 本体とコードを分ける決めごとのため、参照せず写しを持つ。本体の配色を変えたらここも合わせる
//  - タイルは OpenFreeMap（OpenMapTiles 形式）、文字は地理院の noto-jp
// =====================================================
const JA_NAME = ['coalesce', ['get', 'name:ja'], ['get', 'name']];
const FONT = ['NotoSansCJKjp-Regular'];
function baseMapStyle(dark) {
  // Apple Maps参考の配色（ライト/ダーク）
  const c = dark ? {
    bg: '#212227', water: '#17344d', park: '#26372a', wood: '#223125',
    building: '#2a2b31', roadMinor: '#33353b', roadMain: '#4a4d56',
    roadCasing: '#1b1c20', highway: '#8d7439', rail: '#50525a',
    boundary: '#4a4658', text: '#c9c7c2', halo: '#1a1b1f',
    station: '#8fb0e8', poi: '#98938a',
  } : {
    // iPhone のマップ（標準）の配色: 明るい生成りの陸・澄んだ水色の海・やわらかい緑の公園・
    // 白い道路に淡い縁・黄色い高速道路・薄いグレーの建物
    bg: '#f6f4ef', water: '#9fd2f3', park: '#c4e6af', wood: '#b7dea0',
    // v323: 幹線道路の縁・鉄道・駅名を少し強くし、位置関係をつかみやすくする（全体の薄さは保つ）
    building: '#e6e3dd', roadMinor: '#ffffff', roadMain: '#ffffff',
    roadCasing: '#d6d0c4', highway: '#fdd56a', rail: '#b9b4aa',
    boundary: '#b7aec9', text: '#4a4844', halo: '#ffffff',
    station: '#2457b8', poi: '#7d796f',
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
      { id: 'road-major-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk']]],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': c.roadCasing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.0, 12, 2.8, 14, 5.5, 18, 16] } },
      { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk']]],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': c.roadMain,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 12, 2.0, 14, 4.0, 18, 14] } },
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
        ['interpolate', ['linear'], ['zoom'], 12, 10.5, 16, 13.5], c.station, 1.5),
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
