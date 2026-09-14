const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/final/shots';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.route(/nominatim|photon|overpass/, r => r.fulfill({ json: [] }));
  await p.goto('http://localhost:5960/');
  await p.waitForTimeout(900);
  await p.evaluate(() => { document.querySelectorAll('button').forEach(b => { if ((b.textContent||'').includes('はじめる')) b.click(); }); });
  // イラスト写真でデモデータ
  await p.evaluate(async () => {
    const iso = (mAgo, day, h) => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() - mAgo, day, h, 0).toISOString(); };
    const data = [
      { shop: { name: '麺屋 こがね', lat: 35.6595, lon: 139.7005, pref: '東京都', city: '渋谷区', station: '渋谷駅', shopGenre: 'ラーメン店', favorite: true }, visits: [ { d: iso(0,3,12), g:['ラーメン'], r:5, c:'鶏白湯が絶品。', icon:'ramen' }, { d: iso(2,15,19), g:['つけ麺'], r:4.5, c:'魚介つけ汁。', icon:'tsukemen' }, { d: iso(4,8,19), g:['餃子'], r:4, c:'羽根つき。', icon:'gyoza' } ] },
      { shop: { name: '寿司処 まる海', lat: 35.6654, lon: 139.7707, pref: '東京都', city: '中央区', station: '築地駅', shopGenre: '寿司店', favorite: true }, visits: [ { d: iso(1,20,13), g:['寿司'], r:5, c:'中トロが最高。', icon:'sushi' }, { d: iso(3,6,12), g:['海鮮丼'], r:4.5, c:'ランチがお得。', icon:'kaisendon' } ] },
      { shop: { name: '炭火焼肉 炎', lat: 35.6938, lon: 139.7034, pref: '東京都', city: '新宿区', station: '新宿駅', shopGenre: '焼肉店' }, visits: [ { d: iso(0,10,19), g:['焼肉'], r:4, c:'ハラミ。', icon:'yakiniku' } ] },
      { shop: { name: 'カフェ ひだまり', lat: 35.6684, lon: 139.7126, pref: '東京都', city: '港区', station: '表参道駅', shopGenre: 'カフェ' }, visits: [ { d: iso(1,5,15), g:['スイーツ'], r:4.5, c:'季節のパフェ。', icon:'parfait' }, { d: iso(2,25,14), g:['ケーキ'], r:3.5, c:'', icon:'cake' } ] },
      { shop: { name: 'スパイス食堂 コルマ', lat: 35.647, lon: 139.71, pref: '東京都', city: '目黒区', station: '中目黒駅', shopGenre: 'カレー店' }, visits: [ { d: iso(0,18,12), g:['カレー'], r:4.5, c:'本格スパイス。', icon:'curry' } ] },
      { shop: { name: '天ぷら 松波', lat: 35.671, lon: 139.765, pref: '東京都', city: '中央区', station: '銀座駅', shopGenre: '天ぷら店' }, visits: [ { d: iso(2,12,12), g:['天ぷら'], r:5, c:'揚げたて。', icon:'tempura' } ] },
      { shop: { name: 'とり匠', lat: 35.652, lon: 139.705, pref: '東京都', city: '渋谷区', station: '恵比寿駅', shopGenre: '焼き鳥店' }, visits: [ { d: iso(1,9,19), g:['焼き鳥'], r:4, c:'つくね。', icon:'yakitori' } ] },
    ];
    for (const s of data) { const shop = Store.addShop(s.shop); for (const v of s.visits) { const visit = Store.addVisit({ shopId: shop.id, datetime: v.d, dishGenres: v.g, rating: v.r, comment: v.c, visitType: '店内飲食' }); const blob = await (await fetch('icons/genre/' + v.icon + '.png')).blob(); await Store.addPhoto(shop.id, visit.id, 'dish', blob); } }
    Store.setProfile({ name: 'たくみ', username: 'takumi' });
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const shops = Store.shops(); const myAvg = (s) => Store.avgRating(s.id);
    const icons = { 'ラーメン店':'ramen','寿司店':'sushi','焼肉店':'yakiniku','カフェ':'parfait','カレー店':'curry','天ぷら店':'tempura','焼き鳥店':'yakitori' };
    const mk = (u, dn, s, r, extra) => ({ id: 'np-'+u+'-'+(s?s.name:extra.name)+r, username: u, displayName: dn, avatar: '', photoUrl: 'icons/genre/'+(s?(icons[s.shopGenre]||'washoku'):extra.icon)+'.png', rating: r, shopName: s?s.name:extra.name, lat: s?s.lat:extra.lat, lon: s?s.lon:extra.lon, datetime: new Date(Date.now()-Math.random()*5*86400e3).toISOString(), genre: s?s.shopGenre:'そば店', station: s?s.station:'恵比寿駅' });
    const rated = shops.filter(s => myAvg(s)); const posts = [];
    for (const s of rated) posts.push(mk('yukari','ゆかり',s,Math.max(1,Math.min(5,Math.round(myAvg(s)*2)/2))));
    for (const s of rated.slice(0,2)) posts.push(mk('takuya','たくや',s,myAvg(s)>=3?1.5:5));
    posts.push(mk('yukari','ゆかり',null,5,{ name:'隠れ家そば 胡座', lat:35.66, lon:139.702, icon:'soba' }));
    posts.push(mk('takuya','たくや',null,2,{ name:'隠れ家そば 胡座', lat:35.66, lon:139.702, icon:'soba' }));
    localStorage.setItem('gourmet.netCache', JSON.stringify({ posts, time: 0 }));
    localStorage.setItem('gourmet.feedCache', JSON.stringify({ posts, time: Date.now() }));
  });
  await p.reload(); await p.waitForTimeout(900);
  await p.evaluate(() => { Cloud.getUser = () => ({ uid: 'demo' }); Cloud.fetchFeed = async () => JSON.parse(localStorage.getItem('gourmet.feedCache')).posts; Cloud.fetchNetworkPosts = async () => JSON.parse(localStorage.getItem('gourmet.netCache')).posts; Cloud.getLikeInfo = async () => ({ count: 3, liked: true }); Cloud.commentCount = async () => 1; Cloud.followCounts = async () => ({ following: 2, followers: 2 }); Cloud.unreadNotifCount = async () => 0; });
  await p.click('[data-tab="feed"]'); await p.waitForTimeout(1800);
  await p.screenshot({ path: OUT + '/home.png' });
  await p.evaluate(() => App.switchTab('register')); await p.waitForTimeout(500);
  await p.fill('#f-shop-name', '焼鳥 とり匠 別邸');
  const stars = await p.$$('#f-rating button'); const b5 = await stars[4].boundingBox(); await p.mouse.click(b5.x + b5.width*0.25, b5.y + b5.height/2); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/register.png' });
  await p.click('[data-tab="list"]'); await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/explore.png' });
  await p.click('[data-tab="profile"]'); await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/profile.png' });
  await p.evaluate(() => { document.querySelectorAll('#pf-photo-grid .ppc')[1].click(); }); await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/shopfeed.png' });
  await p.evaluate(() => { const m = document.querySelector('.shopfeed-modal'); if (m) m.remove(); });
  await p.click('[data-ptab="stats"]'); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/stats.png' });
  await ctx.close();
  // 舞台（promo2）のシーンを静止画で
  const c2 = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const q = await c2.newPage();
  await q.goto('http://localhost:5960/promo2.html'); await q.waitForTimeout(1200);
  await q.evaluate(() => Stage.show('s-insight', false)); await q.waitForTimeout(5600);
  await q.screenshot({ path: OUT + '/insight.png' });
  await q.evaluate(() => Stage.show('s-map', false)); await q.waitForTimeout(6800);
  await q.screenshot({ path: OUT + '/mapanim.png', clip: { x: 870, y: 0, width: 1050, height: 1080 } });
  await q.evaluate(() => Stage.show('s-title', false)); await q.waitForTimeout(1800);
  await q.screenshot({ path: OUT + '/title.png' });
  await b.close();
  console.log('shots ok');
})();
