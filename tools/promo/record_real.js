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
  await p.goto(BASE + '/promo5.html');
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
  // 先にフィードを開いておく（S5で即スクロールできるように）
  await f.evaluate(() => { document.querySelector('[data-tab="feed"]').click(); }); await wait(2500);
  await f.evaluate(() => window.scrollTo(0, 0));

  cap('S1'); await p.evaluate(() => Stage.show('s1', false)); await wait(4000);
  cap('S2'); await p.evaluate(() => Stage.show('s2', false)); await wait(4500);
  cap('S3'); await p.evaluate(() => Stage.show('s3', false)); await wait(5500);
  cap('S4'); await p.evaluate(() => Stage.show('s4', false)); await wait(7000);
  cap('S5'); await p.evaluate(() => Stage.show('s5', true));
  await wait(1200);
  await f.evaluate(() => {
    const cands = [document.scrollingElement, document.querySelector('main'), document.querySelector('#feed-list')];
    const sc = cands.find(el => el && el.scrollHeight > el.clientHeight + 40) || document.scrollingElement;
    let i = 0; const iv = setInterval(() => { sc.scrollBy(0, 14); if (++i > 95) clearInterval(iv); }, 60);
  });
  await wait(6800);
  cap('S6'); await p.evaluate(() => Stage.show('s6', false)); await wait(7000);
  cap('S7'); await p.evaluate(() => Stage.show('s7', false)); await wait(8000);
  cap('S8'); await p.evaluate(() => Stage.show('s8', false)); await wait(8000);
  cap('S9'); await p.evaluate(() => Stage.show('s9', false)); await wait(5000);
  cap('S10'); await p.evaluate(() => Stage.show('s10', false)); await wait(6000);

  marks.total = (Date.now() - t0) / 1000;
  fs.writeFileSync(OUT + '/marks.json', JSON.stringify(marks, null, 2));
  await ctx.close(); await b.close();
  console.log('recorded', JSON.stringify(marks));
})();
