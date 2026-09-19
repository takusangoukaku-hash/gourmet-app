// 紹介動画の収録スクリプト（Playwright）。promo.html を index.html と同じ階層で配信した上で実行する
//   node record.js <出力ディレクトリ> [配信URL]   例: node record.js /tmp/out http://localhost:5960
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const GROW_SRC = "// ページ内（アプリの iframe）で実行する。window.__map と Store を使う\nwindow.growMap = async function (opts) {\n  const { stepMs = 55, onTick } = opts || {};\n  const m = window.__map;\n  const src = m.getSource('shops');\n  const full = src._data || (await new Promise(r => r({ type: 'FeatureCollection', features: [] })));\n  const feats = full.features.slice();\n  const firstDate = (f) => {\n    const vs = Store.visitsOf(f.properties.id);\n    return vs.length ? Math.min(...vs.map(v => new Date(v.datetime).getTime())) : Infinity;\n  };\n  feats.sort((a, b) => firstDate(a) - firstDate(b));\n  // 落ちたてのピンを光らせるレイヤー（age: 0=いま落ちた → 1=落ち着いた）\n  if (!m.getLayer('pin-pop')) {\n    m.addLayer({ id: 'pin-pop', type: 'circle', source: 'shops', filter: ['all', ['!', ['has', 'point_count']], ['has', 'age'], ['<', ['get', 'age'], 1]],\n      paint: { 'circle-color': '#C6613F', 'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0.55, 1, 0],\n        'circle-radius': ['interpolate', ['linear'], ['get', 'age'], 0, 22, 1, 6], 'circle-blur': 0.4 } });\n  }\n  src.setData({ type: 'FeatureCollection', features: [] });\n  const shown = [];\n  let i = 0;\n  await new Promise(resolve => {\n    let last = performance.now();\n    const tick = (now) => {\n      // 新しいピンを追加\n      while (i < feats.length && now - last >= stepMs) { const f = feats[i++]; f.properties = Object.assign({}, f.properties, { age: 0, born: now }); shown.push(f); last += stepMs; }\n      for (const f of shown) f.properties.age = Math.min(1, (now - f.properties.born) / 700);\n      src.setData({ type: 'FeatureCollection', features: shown });\n      if (onTick) onTick(shown.length, feats.length, shown.length ? firstDate(shown[shown.length - 1]) : 0);\n      if (i < feats.length || shown.some(f => f.properties.age < 1)) requestAnimationFrame(tick); else resolve();\n    };\n    requestAnimationFrame(tick);\n  });\n  return feats.length;\n};\n";
const OUT = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:5960';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctxStart = Date.now();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT + '/raw', size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  await p.route(/nominatim|photon|overpass/, r => r.fulfill({ json: [] }));
  await p.goto(BASE + '/promo4.html');
  await p.waitForTimeout(1200);
  const appFrame = () => p.frames().find(f => f.url().endsWith('/index.html') || /:\d+\/$/.test(f.url()));
  let f = appFrame();
  await f.waitForSelector('.tabs', { timeout: 15000 }).catch(() => {});
  await f.evaluate(() => { document.querySelectorAll('button').forEach(b => { if ((b.textContent || '').includes('はじめる')) b.click(); }); });
  await p.waitForTimeout(400);
  // 実データ（写真込みバックアップ）を読み込む
  const r = await f.evaluate(async () => { const d = await (await fetch('real.json')).json(); return await App.restoreBackup(d); });
  console.log('restore', JSON.stringify(r));
  await f.evaluate(() => location.reload());
  await p.waitForTimeout(1500);
  f = appFrame();
  await f.evaluate(() => {
    Cloud.getUser = () => ({ uid: 'demo' });
    Cloud.fetchFeed = async () => JSON.parse(localStorage.getItem('gourmet.feedCache')).posts;
    Cloud.fetchNetworkPosts = async () => JSON.parse(localStorage.getItem('gourmet.netCache')).posts;
    Cloud.getLikeInfo = async () => ({ count: 3, liked: true }); Cloud.commentCount = async () => 1;
    Cloud.followCounts = async () => ({ following: 1, followers: 1 }); Cloud.unreadNotifCount = async () => 0;
  });
  // 事前に各画面を開いてサムネイル生成を済ませておく（収録中に空の枠が映らないように）
  await f.evaluate(() => document.querySelector('[data-tab="feed"]').click()); await p.waitForTimeout(2500);
  await f.evaluate(() => document.querySelector('[data-tab="profile"]').click()); await p.waitForTimeout(3000);
  await f.evaluate(() => new Promise(res => { const sc = document.scrollingElement; let i = 0; const iv = setInterval(() => { sc.scrollBy(0, 400); if (++i > 20) { clearInterval(iv); res(); } }, 150); }));
  await p.waitForTimeout(4000);
  await f.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
  await f.evaluate(() => document.querySelector('[data-tab="map"]').click()); await p.waitForTimeout(6000);
  await f.evaluate(() => document.querySelector('[data-tab="register"]').click()); await p.waitForTimeout(600);
  if (process.env.BGM_CREDIT) await p.evaluate((t) => Stage.credit(t), process.env.BGM_CREDIT);
  await p.waitForTimeout(400);

  const marks = { marks: [] }; const t0 = Date.now(); marks.trimSec = (t0 - ctxStart) / 1000;
  const cap = (t) => marks.marks.push({ t: (Date.now() - t0) / 1000, text: t });
  const wait = (ms) => p.waitForTimeout(ms);

  cap('S1 title'); await p.evaluate(() => Stage.show('s-title', false)); await wait(4500);
  cap('S2 hook'); await p.evaluate(() => Stage.show('s-hook', false)); await wait(6500);

  cap('S3 register'); await p.evaluate(() => Stage.show('s-reg', true));
  await f.evaluate(() => App.switchTab('register')); await wait(1600);
  await f.click('#f-shop-name'); await f.type('#f-shop-name', '焼鳥 とり匠 別邸', { delay: 130 }); await wait(900);
  const stars = await f.$$('#f-rating button');
  if (stars.length >= 5) {
    const b4 = await stars[3].boundingBox(); if (b4) await p.mouse.click(b4.x + b4.width * 0.75, b4.y + b4.height / 2);
    await wait(900);
    const b5 = await stars[4].boundingBox(); if (b5) await p.mouse.click(b5.x + b5.width * 0.25, b5.y + b5.height / 2);
  }
  await wait(3800);

  cap('S4 album'); await p.evaluate(() => Stage.show('s-album', true));
  await f.evaluate(() => App.switchTab('profile')); await wait(2000);
  await f.evaluate(() => { const sc = [document.scrollingElement, document.querySelector('main')].find(el => el && el.scrollHeight > el.clientHeight + 40); if (sc) sc.scrollBy({ top: 160, behavior: 'smooth' }); }); await wait(1200);
  await f.evaluate(() => { const c = document.querySelectorAll('#pf-photo-grid .ppc')[7]; if (c) c.click(); }); await wait(3800);
  await f.evaluate(() => { const sc = document.querySelector('.shopfeed-modal .vl-body'); if (sc) sc.scrollBy({ top: 300, behavior: 'smooth' }); }); await wait(2600);
  await f.evaluate(() => { const m = document.querySelector('.shopfeed-modal'); if (m) m.remove(); }); await wait(900);

  cap('S5 map'); await p.evaluate(() => Stage.show('s-map', false)); await wait(11000);

  cap('S6 sns'); await p.evaluate(() => Stage.show('s-sns', true));
  await f.evaluate(() => { document.querySelector('[data-tab="feed"]').click(); }); await wait(2800);
  await f.evaluate(() => {
    const cands = [document.scrollingElement, document.querySelector('main'), document.querySelector('#feed-list')];
    const sc = cands.find(el => el && el.scrollHeight > el.clientHeight + 40) || document.scrollingElement;
    let i = 0; const iv = setInterval(() => { sc.scrollBy(0, 14); if (++i > 90) clearInterval(iv); }, 60);
  });
  await wait(8700);

  cap('S7 outro'); await p.evaluate(() => Stage.show('s-outro', false)); await wait(8000);

  marks.total = (Date.now() - t0) / 1000;
  fs.writeFileSync(OUT + '/marks.json', JSON.stringify(marks, null, 2));
  await ctx.close(); await b.close();
  console.log('recorded', JSON.stringify(marks));
})();
