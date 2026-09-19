// 紹介動画の収録スクリプト（Playwright）。promo.html を index.html と同じ階層で配信した上で実行する
//   node record.js <出力ディレクトリ> [配信URL]   例: node record.js /tmp/out http://localhost:5960
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const OUT = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:5960';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctxStart = Date.now();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT + '/raw', size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  await p.route(/nominatim|photon|overpass/, r => r.fulfill({ json: [] }));
  await p.goto(BASE + '/promo2.html');
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
  cap('S0 cold'); await p.evaluate(() => Stage.show('s-cold', false)); await wait(5000);
  cap('S1 insight'); await p.evaluate(() => Stage.show('s-insight', false)); await wait(8000);
  cap('S2 title'); await p.evaluate(() => Stage.show('s-title', false)); await wait(4800);
  cap('S3 register'); await p.evaluate(() => Stage.show('s-reg', true));
  await f.evaluate(() => App.switchTab('register')); await wait(1600);
  await f.click('#f-shop-name'); await f.type('#f-shop-name', '焼鳥 とり匠 別邸', { delay: 130 });
  await p.evaluate(() => Stage.pill('pill1')); await wait(900);
  await p.evaluate(() => Stage.pill('pill2'));
  const stars = await f.$$('#f-rating button');
  if (stars.length >= 5) {
    const b4 = await stars[3].boundingBox(); if (b4) await p.mouse.click(b4.x + b4.width * 0.75, b4.y + b4.height / 2);
    await wait(900);
    const b5 = await stars[4].boundingBox(); if (b5) await p.mouse.click(b5.x + b5.width * 0.25, b5.y + b5.height / 2);
  }
  await p.evaluate(() => Stage.pill('pill3')); await wait(3800);
  cap('S4 album'); await p.evaluate(() => Stage.show('s-album', true));
  await f.evaluate(() => App.switchTab('profile')); await wait(2000);
  await f.evaluate(() => { const sc = [document.scrollingElement, document.querySelector('main')].find(el => el && el.scrollHeight > el.clientHeight + 40); if (sc) sc.scrollBy({ top: 160, behavior: 'smooth' }); });
  await wait(1400);
  await f.evaluate(() => { const c = document.querySelectorAll('#pf-photo-grid .ppc')[7]; if (c) c.click(); }); await wait(3800);
  await f.evaluate(() => { const sc = document.querySelector('.shopfeed-modal .vl-body'); if (sc) sc.scrollBy({ top: 300, behavior: 'smooth' }); }); await wait(2600);
  await f.evaluate(() => { const m = document.querySelector('.shopfeed-modal'); if (m) m.remove(); }); await wait(800);
  cap('S5 map'); await p.evaluate(() => Stage.show('s-map', false)); await wait(6800);
  await p.evaluate(() => Stage.count(190, 1800)); await wait(4200);
  cap('S5b map-real'); await p.evaluate(() => Stage.show('s-map2', true));
  await f.evaluate(() => document.querySelector('[data-tab="map"]').click()); await wait(1200);
  await f.evaluate(() => window.__map && window.__map.jumpTo({ center: [136.5, 36.0], zoom: 5.3 })); await wait(1500);
  await f.evaluate(() => window.__map.flyTo({ center: [139.72, 35.66], zoom: 11.2, duration: 3000, essential: true })); await wait(3800);
  await f.evaluate(() => window.__map.flyTo({ center: [139.700, 35.660], zoom: 13.0, duration: 2400, essential: true })); await wait(3000);
  await f.evaluate(() => {
    const m = window.__map; const c = m.getCanvas(); const cx = c.clientWidth / 2, cy = c.clientHeight / 2;
    const fs = m.queryRenderedFeatures([[cx - 160, cy - 200], [cx + 160, cy + 200]]).filter(x => x.source === 'shops' && !x.properties.cluster);
    if (!fs.length) return;
    fs.sort((a, b) => { const pa = m.project(a.geometry.coordinates), pb = m.project(b.geometry.coordinates); return Math.hypot(pa.x - cx, pa.y - cy) - Math.hypot(pb.x - cx, pb.y - cy); });
    const pt = m.project(fs[0].geometry.coordinates);
    m.fire('click', { lngLat: m.unproject(pt), point: pt, originalEvent: new MouseEvent('click') });
  });
  await wait(3000);
  await f.evaluate(() => { const b = document.querySelector('.msh-back'); if (b) b.click(); }); await wait(500);
  cap('S6 sns'); await p.evaluate(() => Stage.show('s-sns', true));
  await f.evaluate(() => { document.querySelector('[data-tab="feed"]').click(); }); await wait(2600);
  await f.evaluate(() => { const cands = [document.scrollingElement, document.querySelector('main'), document.querySelector('#feed-list')];
    const sc = cands.find(el => el && el.scrollHeight > el.clientHeight + 40) || document.scrollingElement;
    let i = 0; const iv = setInterval(() => { sc.scrollBy(0, 14); if (++i > 100) clearInterval(iv); }, 60); });
  await wait(3200);
  await p.evaluate(() => Stage.swapSub('s-sns', '近い人の高評価ほど、おすすめに。<br>評価も<b>あなた仕様</b>に並び替え。')); await wait(5400);
  cap('S7 outro'); await p.evaluate(() => Stage.show('s-outro', false)); await wait(7000);
  marks.total = (Date.now() - t0) / 1000;
  fs.writeFileSync(OUT + '/marks.json', JSON.stringify(marks, null, 2));
  await ctx.close(); await b.close();
  console.log('recorded', JSON.stringify(marks));
})();
