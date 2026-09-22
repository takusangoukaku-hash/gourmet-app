const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const GROW_SRC = "// ページ内（アプリの iframe）で実行する。window.__map と Store を使う\nwindow.growMap = async function (opts) {\n  const { stepMs = 55, onTick } = opts || {};\n  const m = window.__map;\n  const src = m.getSource('shops');\n  const full = src._data || (await new Promise(r => r({ type: 'FeatureCollection', features: [] })));\n  const feats = full.features.slice();\n  const firstDate = (f) => {\n    const vs = Store.visitsOf(f.properties.id);\n    return vs.length ? Math.min(...vs.map(v => new Date(v.datetime).getTime())) : Infinity;\n  };\n  feats.sort((a, b) => firstDate(a) - firstDate(b));\n  // 落ちたてのピンを光らせるレイヤー（age: 0=いま落ちた → 1=落ち着いた）\n  if (!m.getLayer('pin-pop')) {\n    m.addLayer({ id: 'pin-pop', type: 'circle', source: 'shops', filter: ['all', ['!', ['has', 'point_count']], ['has', 'age'], ['<', ['get', 'age'], 1]],\n      paint: { 'circle-color': '#C6613F', 'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0.55, 1, 0],\n        'circle-radius': ['interpolate', ['linear'], ['get', 'age'], 0, 22, 1, 6], 'circle-blur': 0.4 } });\n  }\n  src.setData({ type: 'FeatureCollection', features: [] });\n  const shown = [];\n  let i = 0;\n  await new Promise(resolve => {\n    let last = performance.now();\n    const tick = (now) => {\n      // 新しいピンを追加\n      while (i < feats.length && now - last >= stepMs) { const f = feats[i++]; f.properties = Object.assign({}, f.properties, { age: 0, born: now }); shown.push(f); last += stepMs; }\n      for (const f of shown) f.properties.age = Math.min(1, (now - f.properties.born) / 700);\n      src.setData({ type: 'FeatureCollection', features: shown });\n      if (onTick) onTick(shown.length, feats.length, shown.length ? firstDate(shown[shown.length - 1]) : 0);\n      if (i < feats.length || shown.some(f => f.properties.age < 1)) requestAnimationFrame(tick); else resolve();\n    };\n    requestAnimationFrame(tick);\n  });\n  return feats.length;\n};\n";
const OUT = '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/demo';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctxStart = Date.now();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT + '/raw', size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  await p.route(/nominatim|photon|overpass/, r => r.fulfill({ json: [] }));
  await p.goto('http://localhost:5960/demo.html'); await p.waitForTimeout(1200);
  const appFrame = () => p.frames().find(f => f.url().endsWith('/index.html') || /:\d+\/$/.test(f.url()));
  let f = appFrame();
  await f.waitForSelector('.tabs', { timeout: 15000 }).catch(() => {});
  await f.evaluate(() => { document.querySelectorAll('button').forEach(b => { if ((b.textContent || '').includes('はじめる')) b.click(); }); });
  const r = await f.evaluate(async () => { const d = await (await fetch('real.json')).json(); return await App.restoreBackup(d); });
  console.log('restore', JSON.stringify(r));
  await f.evaluate(() => location.reload()); await p.waitForTimeout(2000);
  f = appFrame();
  await f.evaluate(() => {
    Cloud.getUser = () => ({ uid: 'demo' });
    Cloud.fetchFeed = async () => JSON.parse(localStorage.getItem('gourmet.feedCache')).posts;
    Cloud.fetchNetworkPosts = async () => JSON.parse(localStorage.getItem('gourmet.netCache')).posts;
    Cloud.getLikeInfo = async () => ({ count: 0, liked: false }); Cloud.commentCount = async () => 0;
    Cloud.followCounts = async () => ({ following: 1, followers: 1 }); Cloud.unreadNotifCount = async () => 0;
  });
  // 各画面を先に開いてサムネイルを作っておく（収録中に空の枠が映らないように）
  await f.evaluate(() => document.querySelector('[data-tab="feed"]').click()); await p.waitForTimeout(2500);
  await f.evaluate(() => document.querySelector('[data-tab="profile"]').click()); await p.waitForTimeout(2500);
  await f.evaluate(() => new Promise(res => { const sc = document.scrollingElement; let i = 0; const iv = setInterval(() => { sc.scrollBy(0, 400); if (++i > 16) { clearInterval(iv); res(); } }, 150); })); await p.waitForTimeout(3000);
  await f.evaluate(() => window.scrollTo(0, 0));
  await f.evaluate(() => document.querySelector('[data-tab="list"]').click()); await p.waitForTimeout(1200);
  await f.evaluate(() => { [...document.querySelectorAll('#explore-cats button')].find(x => (x.textContent || '').includes('麺類'))?.click(); }); await p.waitForTimeout(1200);
  await f.evaluate(() => { [...document.querySelectorAll('#view-list button')].find(x => (x.textContent || '').trim().startsWith('ラーメン'))?.click(); }); await p.waitForTimeout(2500);
  await f.evaluate(() => new Promise(res => { const sc = document.scrollingElement; let i = 0; const iv = setInterval(() => { sc.scrollBy(0, 400); if (++i > 14) { clearInterval(iv); res(); } }, 150); })); await p.waitForTimeout(3000);
  await f.evaluate(() => window.scrollTo(0, 0));
  await f.evaluate(() => document.querySelector('[data-tab="map"]').click()); await p.waitForTimeout(6000);
  await f.evaluate(() => document.querySelector('[data-tab="feed"]').click()); await p.waitForTimeout(1500);
  await f.evaluate(() => window.scrollTo(0, 0));
  const scroller = async (px, steps, ms) => f.evaluate(([px, steps, ms]) => new Promise(res => {
    const cands = [document.scrollingElement, document.querySelector('main')];
    const sc = cands.find(el => el && el.scrollHeight > el.clientHeight + 40) || document.scrollingElement;
    let i = 0; const iv = setInterval(() => { sc.scrollBy(0, px); if (++i >= steps) { clearInterval(iv); res(); } }, ms);
  }), [px, steps, ms]);
  const marks = { marks: [] }; const t0 = Date.now(); marks.trimSec = (t0 - ctxStart) / 1000;
  const cap = (t) => marks.marks.push({ t: (Date.now() - t0) / 1000, text: t });
  const wait = (ms) => p.waitForTimeout(ms);

  cap('D0 intro'); await p.evaluate(() => Stage.show('d-intro', false)); await wait(5200);
  cap('D1 home'); await p.evaluate(() => Stage.show('d-home', true));
  await wait(1800); await scroller(12, 110, 50); await wait(1200);

  cap('D2 album'); await p.evaluate(() => Stage.show('d-album', true));
  await f.evaluate(() => document.querySelector('[data-tab="profile"]').click()); await wait(1800);
  await scroller(10, 120, 45); await wait(600);
  await f.evaluate(() => { const cards = document.querySelectorAll('#pf-photo-grid .ppc'); const c = cards[Math.min(7, cards.length - 1)]; if (c) c.click(); }); await wait(2200);
  await f.evaluate(() => { const sc = document.querySelector('.shopfeed-modal .vl-body'); if (sc) sc.scrollBy({ top: 420, behavior: 'smooth' }); }); await wait(2400);
  await f.evaluate(() => { const m = document.querySelector('.shopfeed-modal'); if (m) m.remove(); }); await wait(600);

  cap('D3 map'); await p.evaluate(() => Stage.show('d-map', true));
  await f.evaluate(() => document.querySelector('[data-tab="map"]').click()); await wait(1500);
  await f.evaluate(() => window.__map && window.__map.jumpTo({ center: [139.72, 35.66], zoom: 10.6 })); await wait(1200);
  await f.evaluate(GROW_SRC);
  // iframe と親は同一オリジンなので、親の Stage を直接呼んでカウンターを更新する
  await f.evaluate(async () => { await window.growMap({ stepMs: 55, onTick: null }); });
  await wait(1200);
  await f.evaluate(() => window.__map.flyTo({ center: [139.700, 35.660], zoom: 13.0, duration: 2600, essential: true })); await wait(3400);
  // 画面中央に近いピンをタップして店舗シートを開く
  await f.evaluate(() => {
    const m = window.__map; const c = m.getCanvas(); const cx = c.clientWidth / 2, cy = c.clientHeight / 2;
    const fs = m.queryRenderedFeatures([[cx - 160, cy - 200], [cx + 160, cy + 200]]).filter(x => x.source === 'shops' && !x.properties.cluster);
    if (!fs.length) return;
    fs.sort((a, b) => { const pa = m.project(a.geometry.coordinates), pb = m.project(b.geometry.coordinates); return Math.hypot(pa.x - cx, pa.y - cy) - Math.hypot(pb.x - cx, pb.y - cy); });
    const pt = m.project(fs[0].geometry.coordinates);
    const el = document.elementFromPoint(pt.x + c.getBoundingClientRect().left, pt.y + c.getBoundingClientRect().top);
    m.fire('click', { lngLat: m.unproject(pt), point: pt, originalEvent: new MouseEvent('click') });
  });
  await wait(3200);
  await f.evaluate(() => { const b = document.querySelector('.msh-back'); if (b) b.click(); }); await wait(800);

  cap('D4 search'); await p.evaluate(() => Stage.show('d-search', true));
  await f.evaluate(() => document.querySelector('[data-tab="list"]').click()); await wait(1600);
  await f.evaluate(() => { [...document.querySelectorAll('#explore-cats button')].find(x => (x.textContent || '').includes('麺類'))?.click(); }); await wait(1300);
  await f.evaluate(() => { [...document.querySelectorAll('#view-list button')].find(x => (x.textContent || '').trim().startsWith('ラーメン'))?.click(); }); await wait(2000);
  await scroller(10, 90, 45); await wait(800);

  cap('D5 stats'); await p.evaluate(() => Stage.show('d-stats', true));
  await f.evaluate(() => document.querySelector('[data-tab="profile"]').click()); await wait(900);
  await f.evaluate(() => window.scrollTo(0, 0));
  await f.evaluate(() => document.querySelector('[data-ptab="stats"]').click()); await wait(2500);
  await scroller(10, 80, 45); await wait(2000);

  cap('D6 outro'); await p.evaluate(() => Stage.show('d-outro', false)); await wait(4500);

  marks.total = (Date.now() - t0) / 1000;
  fs.writeFileSync(OUT + '/marks.json', JSON.stringify(marks, null, 2));
  await ctx.close(); await b.close();
  console.log('recorded', JSON.stringify(marks));
})();
