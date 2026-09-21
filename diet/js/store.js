// =====================================================
// データ層: localStorage（食事・体重・運動・プロフィール）+ IndexedDB（写真サムネイル）
// キーは diet.* で名前空間を分け、同一オリジンの BITEMAP と衝突させない
// =====================================================
window.Store = (() => {
  const KEY = 'diet.v1';
  const DB_NAME = 'diet-photos';

  const defaults = () => ({
    profile: {
      sex: 'male', age: null, height: null,
      activity: 1.4,          // 座位中心+通学程度
      goalKgPerWeek: 0.5,     // 週あたり減量目標
      proteinPerKg: 2.0,      // 体重1kgあたりタンパク質(g)
      fatRatio: 0.25,         // 脂質のカロリー比
      targets: null,          // {kcal,p,f,c} 手動指定（null なら自動計算）
      addExerciseToBudget: false,
      commute: { distanceKm: null, minutes: null },
      targetWeight: null,
    },
    meals: [],      // {id,date,slot,name,kcal,p,f,c,photoId,ai,ts}
    weights: [],    // {date,kg}
    exercises: [],  // {id,date,type:'bike'|'strength',...}
  });

  let data = load();

  function load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY));
      if (j && typeof j === 'object') {
        const d = defaults();
        d.profile = Object.assign(d.profile, j.profile || {});
        d.profile.commute = Object.assign({ distanceKm: null, minutes: null }, (j.profile || {}).commute || {});
        d.meals = Array.isArray(j.meals) ? j.meals : [];
        d.weights = Array.isArray(j.weights) ? j.weights : [];
        d.exercises = Array.isArray(j.exercises) ? j.exercises : [];
        return d;
      }
    } catch { /* 壊れていれば初期化 */ }
    return defaults();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(data)); }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const z = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const today = () => fmtDate(new Date());
  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return fmtDate(new Date(y, m - 1, d + n));
  }

  // ---------- 食事 ----------
  const mealsOn = date => data.meals.filter(m => m.date === date).sort((a, b) => a.ts - b.ts);
  function addMeal(m) {
    const rec = { id: uid(), ts: Date.now(), ai: false, photoId: null, ...m };
    rec.kcal = Math.round(+rec.kcal || 0); rec.p = round1(rec.p); rec.f = round1(rec.f); rec.c = round1(rec.c);
    data.meals.push(rec); save(); return rec;
  }
  function updateMeal(id, patch) {
    const m = data.meals.find(x => x.id === id); if (!m) return;
    Object.assign(m, patch);
    m.kcal = Math.round(+m.kcal || 0); m.p = round1(m.p); m.f = round1(m.f); m.c = round1(m.c);
    save();
  }
  function deleteMeal(id) {
    const m = data.meals.find(x => x.id === id); if (!m) return;
    data.meals = data.meals.filter(x => x.id !== id); save();
    if (m.photoId && !data.meals.some(x => x.photoId === m.photoId)) deletePhoto(m.photoId);
  }
  const round1 = v => Math.round((+v || 0) * 10) / 10;

  // ---------- 体重 ----------
  const weights = () => data.weights.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  function setWeight(date, kg) {
    const w = data.weights.find(x => x.date === date);
    if (w) w.kg = +kg; else data.weights.push({ date, kg: +kg });
    save();
  }
  function deleteWeight(date) { data.weights = data.weights.filter(x => x.date !== date); save(); }
  function latestWeight(onOrBefore) {
    const list = weights().filter(w => !onOrBefore || w.date <= onOrBefore);
    return list.length ? list[list.length - 1] : null;
  }

  // ---------- 運動 ----------
  const exercisesOn = date => data.exercises.filter(e => e.date === date).sort((a, b) => a.ts - b.ts);
  function addExercise(e) { const rec = { id: uid(), ts: Date.now(), ...e }; data.exercises.push(rec); save(); return rec; }
  function deleteExercise(id) { data.exercises = data.exercises.filter(x => x.id !== id); save(); }
  // 同名種目の直近記録（前回比較用）
  function lastStrength(name, beforeDate) {
    const n = (name || '').trim();
    return data.exercises
      .filter(e => e.type === 'strength' && e.name === n && (!beforeDate || e.date < beforeDate))
      .sort((a, b) => a.date < b.date ? 1 : -1)[0] || null;
  }
  function strengthNames() {
    const seen = new Map();
    data.exercises.filter(e => e.type === 'strength').forEach(e => seen.set(e.name, Math.max(seen.get(e.name) || 0, e.ts)));
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  }
  function exercisesBetween(from, to) { return data.exercises.filter(e => e.date >= from && e.date <= to); }

  // ---------- プロフィール ----------
  const profile = () => data.profile;
  function setProfile(patch) { Object.assign(data.profile, patch); save(); }

  // ---------- 書き出し / 読み込み ----------
  function exportJson() { return JSON.stringify({ app: 'pfc-log', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2); }
  function importJson(text) {
    const j = JSON.parse(text);
    if (!j || !Array.isArray(j.meals) || !Array.isArray(j.weights)) throw new Error('形式が違います');
    localStorage.setItem(KEY, JSON.stringify({ profile: j.profile, meals: j.meals, weights: j.weights, exercises: j.exercises || [] }));
    data = load();
  }
  function clearAll() { localStorage.removeItem(KEY); data = defaults(); }

  // ---------- 写真（IndexedDB） ----------
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('photos');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function savePhoto(blob) {
    const id = uid();
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(blob, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return id;
  }
  const urlCache = new Map();
  async function photoUrl(id) {
    if (!id) return null;
    if (urlCache.has(id)) return urlCache.get(id);
    const d = await db();
    const blob = await new Promise((res, rej) => {
      const req = d.transaction('photos').objectStore('photos').get(id);
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
    if (!blob) return null;
    const url = URL.createObjectURL(blob); urlCache.set(id, url); return url;
  }
  async function deletePhoto(id) {
    try {
      const d = await db();
      d.transaction('photos', 'readwrite').objectStore('photos').delete(id);
      if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
    } catch { /* 無視 */ }
  }

  return {
    today, addDays, fmtDate,
    mealsOn, addMeal, updateMeal, deleteMeal,
    weights, setWeight, deleteWeight, latestWeight,
    exercisesOn, addExercise, deleteExercise, lastStrength, strengthNames, exercisesBetween,
    profile, setProfile,
    exportJson, importJson, clearAll,
    savePhoto, photoUrl, deletePhoto,
  };
})();
