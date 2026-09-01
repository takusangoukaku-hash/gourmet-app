// 紹介動画の収録スクリプト（Playwright）。promo.html を index.html と同じ階層で配信した上で実行する
//   node record.js <出力ディレクトリ> [配信URL]   例: node record.js /tmp/out http://localhost:5960
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const OUT = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:5960';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
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
  // デモデータ（写真はジャンルイラスト）
  await f.evaluate(async () => {
    const iso = (mAgo, day, h) => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() - mAgo, day, h, 0).toISOString(); };
    const data = [
      { shop: { name: '麺屋 こがね', lat: 35.6595, lon: 139.7005, pref: '東京都', city: '渋谷区', station: '渋谷駅', shopGenre: 'ラーメン店', favorite: true },
        visits: [ { d: iso(0, 3, 12), g: ['ラーメン'], r: 5, c: '鶏白湯が絶品。', icon: 'ramen' }, { d: iso(2, 15, 19), g: ['つけ麺'], r: 4.5, c: '魚介つけ汁が濃厚。', icon: 'tsukemen' }, { d: iso(4, 8, 19), g: ['餃子'], r: 4, c: '羽根つき。', icon: 'gyoza' } ] },
      { shop: { name: '寿司処 まる海', lat: 35.6654, lon: 139.7707, pref: '東京都', city: '中央区', station: '築地駅', shopGenre: '寿司店', favorite: true },
        visits: [ { d: iso(1, 20, 13), g: ['寿司'], r: 5, c: '中トロと穴子が最高。', icon: 'sushi' }, { d: iso(3, 6, 12), g: ['海鮮丼'], r: 4.5, c: 'ランチがお得。', icon: 'kaisendon' } ] },
      { shop: { name: '炭火焼肉 炎', lat: 35.6938, lon: 139.7034, pref: '東京都', city: '新宿区', station: '新宿駅', shopGenre: '焼肉店' }, visits: [ { d: iso(0, 10, 19), g: ['焼肉'], r: 4, c: 'ハラミが柔らかい。', icon: 'yakiniku' } ] },
      { shop: { name: 'カフェ ひだまり', lat: 35.6684, lon: 139.7126, pref: '東京都', city: '港区', station: '表参道駅', shopGenre: 'カフェ' }, visits: [ { d: iso(1, 5, 15), g: ['スイーツ'], r: 4.5, c: '季節のパフェ。', icon: 'parfait' }, { d: iso(2, 25, 14), g: ['ケーキ'], r: 3.5, c: 'チーズケーキ。', icon: 'cake' } ] },
      { shop: { name: 'スパイス食堂 コルマ', lat: 35.647, lon: 139.71, pref: '東京都', city: '目黒区', station: '中目黒駅', shopGenre: 'カレー店' }, visits: [ { d: iso(0, 18, 12), g: ['カレー'], r: 4.5, c: 'スパイスが本格的。', icon: 'curry' } ] },
      { shop: { name: '天ぷら 松波', lat: 35.671, lon: 139.765, pref: '東京都', city: '中央区', station: '銀座駅', shopGenre: '天ぷら店' }, visits: [ { d: iso(2, 12, 12), g: ['天ぷら'], r: 5, c: '揚げたてを一品ずつ。', icon: 'tempura' } ] },
      { shop: { name: 'とり匠', lat: 35.652, lon: 139.705, pref: '東京都', city: '渋谷区', station: '恵比寿駅', shopGenre: '焼き鳥店' }, visits: [ { d: iso(1, 9, 19), g: ['焼き鳥'], r: 4, c: 'つくねが名物。', icon: 'yakitori' } ] },
    ];
    for (const s of data) {
      const shop = Store.addShop(s.shop);
      for (const v of s.visits) {
        const visit = Store.addVisit({ shopId: shop.id, datetime: v.d, dishGenres: v.g, rating: v.r, comment: v.c, visitType: '店内飲食' });
        const blob = await (await fetch('icons/genre/' + v.icon + '.png')).blob();
        await Store.addPhoto(shop.id, visit.id, 'dish', blob);
      }
    }
    Store.setProfile({ name: 'たくみ', username: 'takumi' });
  });
  await p.waitForTimeout(600);
  await f.evaluate(() => {
    const shops = Store.shops(); const myAvg = (s) => Store.avgRating(s.id);
    const icons = { 'ラーメン店': 'ramen', '寿司店': 'sushi', '焼肉店': 'yakiniku', 'カフェ': 'parfait', 'カレー店': 'curry', '天ぷら店': 'tempura', '焼き鳥店': 'yakitori' };
    const mk = (u, dn, s, r, extra) => ({ id: 'np-' + u + '-' + (s ? s.name : extra.name) + r, username: u, displayName: dn, avatar: '',
      photoUrl: 'icons/genre/' + (s ? (icons[s.shopGenre] || 'washoku') : extra.icon) + '.png', rating: r, shopName: s ? s.name : extra.name,
      lat: s ? s.lat : extra.lat, lon: s ? s.lon : extra.lon, datetime: new Date(Date.now() - Math.random() * 5 * 86400e3).toISOString(), genre: s ? s.shopGenre : 'そば店', station: s ? s.station : '恵比寿駅' });
    const rated = shops.filter(s => myAvg(s)); const posts = [];
    for (const s of rated) posts.push(mk('yukari', 'ゆかり', s, Math.max(1, Math.min(5, Math.round(myAvg(s) * 2) / 2))));
    for (const s of rated.slice(0, 2)) posts.push(mk('takuya', 'たくや', s, myAvg(s) >= 3 ? 1.5 : 5));
    posts.push(mk('yukari', 'ゆかり', null, 5, { name: '隠れ家そば 胡座', lat: 35.66, lon: 139.702, icon: 'soba' }));
    posts.push(mk('takuya', 'たくや', null, 2, { name: '隠れ家そば 胡座', lat: 35.66, lon: 139.702, icon: 'soba' }));
    localStorage.setItem('gourmet.netCache', JSON.stringify({ posts, time: 0 }));
    localStorage.setItem('gourmet.feedCache', JSON.stringify({ posts, time: Date.now() }));
  });
  await f.evaluate(() => location.reload());
  await p.waitForTimeout(1500);
  f = appFrame();
  await f.evaluate(() => {
    Cloud.getUser = () => ({ uid: 'demo' });
    Cloud.fetchFeed = async () => JSON.parse(localStorage.getItem('gourmet.feedCache')).posts;
    Cloud.fetchNetworkPosts = async () => JSON.parse(localStorage.getItem('gourmet.netCache')).posts;
    Cloud.getLikeInfo = async () => ({ count: 3, liked: true }); Cloud.commentCount = async () => 1;
    Cloud.followCounts = async () => ({ following: 2, followers: 2 }); Cloud.unreadNotifCount = async () => 0;
  });
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
  await f.evaluate(() => { const c = document.querySelectorAll('#pf-photo-grid .ppc')[1]; if (c) c.click(); }); await wait(3800);
  await f.evaluate(() => { const sc = document.querySelector('.shopfeed-modal .vl-body'); if (sc) sc.scrollBy({ top: 300, behavior: 'smooth' }); }); await wait(2600);
  await f.evaluate(() => { const m = document.querySelector('.shopfeed-modal'); if (m) m.remove(); }); await wait(800);
  cap('S5 map'); await p.evaluate(() => Stage.show('s-map', false)); await wait(6800);
  await p.evaluate(() => Stage.count(201, 1800)); await wait(5400);
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
