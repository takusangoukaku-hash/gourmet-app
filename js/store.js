// =====================================================
// データ層: 店舗(Shop)/訪問記録(Visit) は localStorage、
// 写真は IndexedDB に保存する（仕様書v2 §2 のデータモデル）
// =====================================================
const Store = (() => {
  const SHOPS_KEY = 'gourmet.shops.v1';
  const VISITS_KEY = 'gourmet.visits.v1';
  const HASHES_KEY = 'gourmet.photoHashes.v1'; // 写真の指紋 → {shopId, visitId}（二重登録防止）

  let shops = load(SHOPS_KEY);
  let visits = load(VISITS_KEY);
  let photoHashes = loadObj(HASHES_KEY);

  function loadObj(k) {
    try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; }
  }
  function persistHashes() {
    localStorage.setItem(HASHES_KEY, JSON.stringify(photoHashes));
  }

  function load(k) {
    try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; }
  }
  function persist() {
    localStorage.setItem(SHOPS_KEY, JSON.stringify(shops));
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  // ---------- IndexedDB（写真） ----------
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('gourmet-photos', 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          const os = d.createObjectStore('photos', { keyPath: 'id' });
          os.createIndex('visitId', 'visitId');
          os.createIndex('shopId', 'shopId');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  // photo = { id, shopId, visitId, type('dish'|'exterior'|'interior'|'menu'), blob, hash, createdAt }
  // hash は圧縮前の元ファイルのSHA-256（同じ写真の二重登録を検出するための指紋）
  async function addPhoto(shopId, visitId, type, blob, hash) {
    const rec = { id: uid(), shopId, visitId, type: type || 'dish', blob, hash: hash || '', createdAt: Date.now() };
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(rec);
      tx.oncomplete = () => {
        if (rec.hash) { photoHashes[rec.hash] = { shopId, visitId }; persistHashes(); }
        resolve(rec.id);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  // 指紋が一致する登録済み写真を探す（なければ null）
  const findPhotoByHash = (hash) => (hash && photoHashes[hash]) || null;
  async function allPhotos() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('photos').objectStore('photos').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function photosOfVisit(visitId) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('photos').objectStore('photos').index('visitId').getAll(visitId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function photosOfShop(shopId) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('photos').objectStore('photos').index('shopId').getAll(shopId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function deletePhotosWhere(pred) {
    const all = await allPhotos();
    const d = await db();
    const tx = d.transaction('photos', 'readwrite');
    for (const p of all) {
      if (pred(p)) {
        tx.objectStore('photos').delete(p.id);
        if (p.hash) delete photoHashes[p.hash]; // 削除した写真は再登録できるように指紋も消す
      }
    }
    persistHashes();
    return new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
  }
  // 代表写真: 最新の訪問の写真（料理写真を優先）
  async function repPhoto(shopId) {
    const ps = await photosOfShop(shopId);
    if (!ps.length) return null;
    ps.sort((a, b) => b.createdAt - a.createdAt);
    return ps.find(p => p.type === 'dish') || ps[0];
  }

  // ---------- 店舗（Shop） ----------
  // shop = { id, name, address, lat, lon, country, pref, city, station,
  //          shopGenre, favorite, status, osmId, createdAt }
  function addShop(data) {
    const shop = Object.assign({
      id: uid(), name: '', address: '', lat: null, lon: null,
      country: '日本', pref: '', city: '', station: '',
      shopGenre: 'その他', favorite: false, status: 'open', osmId: '',
      // 店の性質の評価（1〜5、0 = 未評価）。訪問ごとではなく店舗に1つ
      casual: 0,      // カジュアル度（気軽に入れるか）
      atmosphere: 0,  // 雰囲気
      speed: 0,       // 提供の早さ
      createdAt: Date.now(),
    }, data);
    shops.push(shop); persist();
    return shop;
  }
  function updateShop(id, patch) {
    const s = shops.find(x => x.id === id);
    if (s) { Object.assign(s, patch); persist(); }
    return s;
  }
  async function deleteShop(id) {
    shops = shops.filter(s => s.id !== id);
    visits = visits.filter(v => v.shopId !== id);
    persist();
    await deletePhotosWhere(p => p.shopId === id);
  }
  const getShop = (id) => shops.find(s => s.id === id) || null;

  // 既存店舗との照合（外部ID → 名前＋距離50m以内）
  function matchShop({ osmId, name, lat, lon }) {
    if (osmId) { const m = shops.find(s => s.osmId === osmId); if (m) return m; }
    if (name && lat != null && lon != null) {
      return shops.find(s => s.name === name && s.lat != null &&
        distMeters(lat, lon, s.lat, s.lon) < 50) || null;
    }
    if (name) return shops.find(s => s.name === name) || null;
    return null;
  }
  function distMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---------- 訪問記録（Visit） ----------
  // visit = { id, shopId, datetime(ISO), dishGenres[], rating, comment, visitType, createdAt }
  function addVisit(data) {
    const visit = Object.assign({
      id: uid(), shopId: '', datetime: new Date().toISOString(),
      dishGenres: [], rating: 3, comment: '', visitType: '店内飲食',
      createdAt: Date.now(),
    }, data);
    visits.push(visit); persist();
    return visit;
  }
  function updateVisit(id, patch) {
    const v = visits.find(x => x.id === id);
    if (v) { Object.assign(v, patch); persist(); }
    return v;
  }
  async function deleteVisit(id) {
    visits = visits.filter(v => v.id !== id);
    persist();
    await deletePhotosWhere(p => p.visitId === id);
  }
  const visitsOf = (shopId) =>
    visits.filter(v => v.shopId === shopId).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

  // ---------- 集計（保存せず算出 — 仕様書v2 §2.3） ----------
  const visitCount = (shopId) => visitsOf(shopId).length;
  function avgRating(shopId) {
    const vs = visitsOf(shopId);
    if (!vs.length) return 0;
    return Math.round(vs.reduce((s, v) => s + (v.rating || 0), 0) / vs.length * 10) / 10;
  }
  function lastVisitDate(shopId) {
    const vs = visitsOf(shopId);
    return vs.length ? vs[0].datetime : null;
  }

  return {
    shops: () => shops.slice(), visits: () => visits.slice(),
    addShop, updateShop, deleteShop, getShop, matchShop, distMeters,
    addVisit, updateVisit, deleteVisit, visitsOf,
    visitCount, avgRating, lastVisitDate,
    addPhoto, allPhotos, photosOfVisit, photosOfShop, repPhoto, findPhotoByHash,
  };
})();
