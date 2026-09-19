// ページ内（アプリの iframe）で実行する。window.__map と Store を使う
window.growMap = async function (opts) {
  const { stepMs = 55, onTick } = opts || {};
  const m = window.__map;
  const src = m.getSource('shops');
  const full = src._data || (await new Promise(r => r({ type: 'FeatureCollection', features: [] })));
  const feats = full.features.slice();
  const firstDate = (f) => {
    const vs = Store.visitsOf(f.properties.id);
    return vs.length ? Math.min(...vs.map(v => new Date(v.datetime).getTime())) : Infinity;
  };
  feats.sort((a, b) => firstDate(a) - firstDate(b));
  // 落ちたてのピンを光らせるレイヤー（age: 0=いま落ちた → 1=落ち着いた）
  if (!m.getLayer('pin-pop')) {
    m.addLayer({ id: 'pin-pop', type: 'circle', source: 'shops', filter: ['all', ['!', ['has', 'point_count']], ['has', 'age'], ['<', ['get', 'age'], 1]],
      paint: { 'circle-color': '#C6613F', 'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0.55, 1, 0],
        'circle-radius': ['interpolate', ['linear'], ['get', 'age'], 0, 22, 1, 6], 'circle-blur': 0.4 } });
  }
  src.setData({ type: 'FeatureCollection', features: [] });
  const shown = [];
  let i = 0;
  await new Promise(resolve => {
    let last = performance.now();
    const tick = (now) => {
      // 新しいピンを追加
      while (i < feats.length && now - last >= stepMs) { const f = feats[i++]; f.properties = Object.assign({}, f.properties, { age: 0, born: now }); shown.push(f); last += stepMs; }
      for (const f of shown) f.properties.age = Math.min(1, (now - f.properties.born) / 700);
      src.setData({ type: 'FeatureCollection', features: shown });
      if (onTick) onTick(shown.length, feats.length, shown.length ? firstDate(shown[shown.length - 1]) : 0);
      if (i < feats.length || shown.some(f => f.properties.age < 1)) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  return feats.length;
};
