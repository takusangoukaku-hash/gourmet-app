// =====================================================
// 百名店チェック: 百名店の一覧を取り込み、行った店をチェックする PWA
//  - 店のデータはアプリに含めない。利用者が貼り付け／ファイルで取り込み、localStorage にだけ保存する
//  - lists: meimon.lists.v1 = [{title, shops:[{n, a, p?, c?, x?, u?, h?, t?, r?, o?, w?, q?, m?, g?}]}]（u: 店のページの URL、h: 定休日の文、t: 電話番号、r: 予約サイト、o: 営業時間の文）（p: [緯度, 経度]。x: 1＝店の位置、何も無ければ駅の位置、c: 1＝市の中心のおおよその位置）
//  - visited: meimon.visited.v1 = {店名 + '\u0000' + 都道府県: 1}（行った店だけ。一覧をまたいで共通＝
//    年が替わって一覧を貼り替えても、同じ店が別の一覧にあっても「行った」が残る）
//  - 取り込んだ文字は textContent / DOM API だけで入れる（innerHTML に入れない）
// =====================================================
const APP_VERSION = 'v25';
const LISTS_KEY = 'meimon.lists.v1';
const VISITED_KEY = 'meimon.visited.v1';
const POS_KEY = 'meimon.pos.v1'; // 自分で直した店の位置 {店名 + '\u0000' + 都道府県: [緯度, 経度]}（一覧の位置より優先。貼り替えても残る）
const MAX_NAME = 100, MAX_AREA = 60, MAX_TITLE = 60, MAX_SHOPS = 20000, MAX_KEY = 300, MAX_HOL = 60, MAX_HOURS = 200, MAX_CITY = 20, MAX_GROUP = 30;
const SEARCH_CAP = 200, LIST_CAP = 500;
const DEFAULT_TITLE = 'リスト';
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 小さな DOM 部品（子は文字列なら textNode）
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
// アイコンは固定の文字列だけ（取り込んだ文字は入らない）
const ICONS = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.5" cy="6.5" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="17.5" r=".6"/>',
  map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5l-6-2zM9 4.5v13M15 6.5v13"/>',
  locate: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}

// ---------- 文字のそろえ（検索用）----------
function norm(x) {
  return String(x ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/\s+/g, '');
}
const keyOf = (s) => s.n + '\u0000' + prefOf(s.a);
// 位置: 数が2つで日本の範囲（緯度 20〜50・経度 120〜155）だけ受ける
const okPos = (la, lo) => Number.isFinite(la) && Number.isFinite(lo) && la >= 20 && la <= 50 && lo >= 120 && lo <= 155;
function parseCoord(t) {
  const m = typeof t === 'string' && t.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)(?:\s*,\s*([cx]))?$/);
  if (!m) return null;
  const la = Number(m[1]), lo = Number(m[2]);
  return okPos(la, lo) ? { p: [la, lo], c: m[3] === 'c' ? 1 : 0, x: m[3] === 'x' ? 1 : 0 } : null;
}
// 保存済みの p / c を確かめる（正しくなければ空）
// 店のページの URL（食べログの店のページだけ受ける。ほかは捨てる）
const okUrl = (u) => typeof u === 'string' && u.length <= 120 && /^https:\/\/tabelog\.com\/[a-z]+\/A\d+\/A\d+\/\d+\/$/.test(u);
// 電話番号（0 で始まる 10〜11 桁の数字だけ。ハイフンなどは落とす）と予約サイト（https の URL だけ）
const okTel = (t) => { const d = typeof t === 'string' ? t.replace(/[\s\-‐－ー()（）]/g, '') : ''; return /^0\d{9,10}$/.test(d) ? d : ''; };
const okRsv = (u) => {
  if (typeof u !== 'string' || u.length > 200 || !/^https:\/\//.test(u)) return false;
  try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && x.hostname.includes('.'); } catch (e) { return false; }
};
// 店の公式サイト（http か https の URL。古い店のサイトは http だけのことがある）
const okSite = (u) => {
  if (typeof u !== 'string' || u.length > 200 || !/^https?:\/\//.test(u)) return false;
  try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') && !x.username && !x.password && x.hostname.includes('.'); } catch (e) { return false; }
};
// 待ち時間のページ（「ラーメン店待ち時間まとめ」の店ごとの記事だけ受ける）
const okWait = (u) => typeof u === 'string' && /^https:\/\/gyouretsu-yosoku\.com\/entry\/\d{4}\/\d{2}\/\d{2}\/\d{6}$/.test(u);
function cleanPos(s) {
  const out = okUrl(s && s.u) ? { u: s.u } : {};
  if (s && okTel(s.t)) out.t = okTel(s.t);
  if (s && okRsv(s.r)) out.r = s.r;
  if (s && okSite(s.w)) out.w = s.w;
  if (s && okWait(s.q)) out.q = s.q;
  if (s && typeof s.m === 'string' && s.m.trim()) out.m = cap(s.m.trim(), MAX_CITY);
  if (s && typeof s.g === 'string' && s.g.trim()) out.g = cap(s.g.trim(), MAX_GROUP);
  if (s && typeof s.o === 'string' && s.o.trim()) out.o = cap(s.o.trim(), MAX_HOURS);
  if (s && typeof s.h === 'string' && s.h.trim()) out.h = cap(s.h.trim(), MAX_HOL);
  const p = s && s.p;
  if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !okPos(p[0], p[1])) return out;
  out.p = [p[0], p[1]];
  if (s.c === 1) out.c = 1; else if (s.x === 1) out.x = 1;
  return out;
}
const cap = (s, n) => String(s).slice(0, n);

// ---------- データ ----------
let lists = loadLists();
let visited = loadVisited();
let fixedPos = loadFixedPos();
let normCache = new WeakMap(); // shop -> 検索用の文字

function cleanList(l) {
  if (!l || typeof l.title !== 'string' || !Array.isArray(l.shops)) return null;
  const shops = [];
  for (const s of l.shops) {
    if (!s || typeof s.n !== 'string' || !s.n.trim()) continue;
    shops.push(Object.assign({ n: cap(s.n, MAX_NAME), a: typeof s.a === 'string' ? cap(s.a, MAX_AREA) : '' }, cleanPos(s)));
  }
  return { title: cap(l.title, MAX_TITLE) || DEFAULT_TITLE, shops };
}
function loadLists() {
  try {
    const a = JSON.parse(localStorage.getItem(LISTS_KEY) || '[]');
    if (!Array.isArray(a)) return [];
    const out = [];
    for (const l of a) { const c = cleanList(l); if (c) out.push(c); }
    return out;
  } catch { return []; }
}
function loadVisited() {
  const m = Object.create(null);
  try {
    const o = JSON.parse(localStorage.getItem(VISITED_KEY) || '{}');
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const k of Object.keys(o)) if (o[k] && !BAD_KEYS.has(k) && k.length <= MAX_KEY) m[k] = 1;
    }
  } catch {}
  return m;
}
function cleanFixedPos(o) {
  const m = Object.create(null);
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (BAD_KEYS.has(k) || k.length > MAX_KEY || !Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number' || !okPos(v[0], v[1])) continue;
      m[k] = [v[0], v[1]];
    }
  }
  return m;
}
function loadFixedPos() {
  try { return cleanFixedPos(JSON.parse(localStorage.getItem(POS_KEY) || '{}')); } catch { return Object.create(null); }
}
function saveFixedPos() {
  try { localStorage.setItem(POS_KEY, JSON.stringify(fixedPos)); return true; }
  catch { toast('保存できませんでした ・ 端末の空きが足りないかもしれません'); return false; }
}
// 地図に出す位置: 自分で直した位置 → 一覧の位置。{p, x, c} か null
function posOf(s) {
  const f = fixedPos[keyOf(s)];
  if (f) return { p: f, x: 1, c: 0, fixed: 1 };
  return s.p ? { p: s.p, x: s.x ? 1 : 0, c: s.c ? 1 : 0 } : null;
}
function saveAll() {
  try {
    localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
    localStorage.setItem(VISITED_KEY, JSON.stringify(visited));
    return true;
  } catch { toast('保存できませんでした ・ 端末の空きが足りないかもしれません'); return false; }
}
function saveVisited() {
  try { localStorage.setItem(VISITED_KEY, JSON.stringify(visited)); }
  catch { toast('保存できませんでした ・ 端末の空きが足りないかもしれません'); }
}
const totalShops = () => lists.reduce((n, l) => n + l.shops.length, 0);
const isVisited = (l, s) => visited[keyOf(s)] === 1;
const doneCount = (l) => { let n = 0; for (const s of l.shops) if (isVisited(l, s)) n++; return n; };
function shopNorm(s) {
  let v = normCache.get(s);
  if (v == null) { v = norm(s.n + ' ' + s.a); normCache.set(s, v); }
  return v;
}

// ---------- 取り込み ----------
// "# タイトル" で一覧を始め、ほかの行は「店名<TAB>エリア」か「店名<TAB>エリア<TAB>緯度,経度[,c]」。# より前の店は「リスト」へ
function parseText(text) {
  const out = []; // [{title, shops}]（同じタイトルは1つにまとめる）
  let cur = null;
  const start = (t) => {
    t = cap(t.trim(), MAX_TITLE) || DEFAULT_TITLE;
    cur = out.find(l => l.title === t);
    if (!cur) { cur = { title: t, shops: [] }; out.push(cur); }
  };
  for (let line of String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    if (line.trimStart().startsWith('#')) { start(line.trimStart().slice(1)); continue; }
    const parts = line.split('\t');
    const n = cap(parts[0].trim(), MAX_NAME);
    const a = cap((parts[1] || '').trim(), MAX_AREA);
    if (!n) continue;
    if (!cur) start(DEFAULT_TITLE);
    const pc = parts.length > 2 ? parseCoord(parts[2]) : null;
    const shop = pc ? (pc.c ? { n, a, p: pc.p, c: 1 } : pc.x ? { n, a, p: pc.p, x: 1 } : { n, a, p: pc.p }) : { n, a };
    const url = parts.slice(2, 5).map(x => x.trim()).find(okUrl); // 4つ目の欄（位置が無ければ3つ目）: 店のページ
    if (url) shop.u = url;
    const hol = cap((parts[4] || '').trim(), MAX_HOL); // 5つ目の欄: 定休日（例「月曜日、日曜日」）
    if (hol) shop.h = hol;
    const tel = okTel((parts[5] || '').trim()); // 6つ目の欄: 電話番号
    if (tel) shop.t = tel;
    const rsv = (parts[6] || '').trim(); // 7つ目の欄: 予約サイト
    if (okRsv(rsv)) shop.r = rsv;
    const hrs = cap((parts[7] || '').trim(), MAX_HOURS); // 8つ目の欄: 営業時間（例「月・火 11:30 - 14:00、17:00 - 22:00 / 土 11:30 - 15:00」）
    if (hrs) shop.o = hrs;
    const site = (parts[8] || '').trim(); // 9つ目の欄: 店の公式サイト
    if (okSite(site)) shop.w = site;
    const wait = (parts[9] || '').trim(); // 10 個目の欄: 待ち時間のページ
    if (okWait(wait)) shop.q = wait;
    const cty = cap((parts[10] || '').trim(), MAX_CITY); // 11 個目の欄: 市区町村（「渋谷区」「横浜市中区」）
    if (cty) shop.m = cty;
    const grp = cap((parts[11] || '').trim(), MAX_GROUP); // 12 個目の欄: 同じ場所の駅のまとまり（「新宿駅周辺」）
    if (grp) shop.g = grp;
    cur.shops.push(shop);
  }
  return out;
}
// 同じタイトルの一覧は店を置き換える。上限を超えた分は入れない。入れた {lists, shops} を返す
function mergeLists(incoming) {
  let nl = 0, ns = 0;
  for (const l of incoming) {
    const idx = lists.findIndex(x => x.title === l.title);
    const room = MAX_SHOPS - totalShops() + (idx >= 0 ? lists[idx].shops.length : 0);
    const shops = l.shops.slice(0, Math.max(0, room));
    if (!shops.length) continue;
    const entry = { title: l.title, shops };
    if (idx >= 0) lists[idx] = entry; else lists.push(entry);
    nl++; ns += shops.length;
  }
  return { lists: nl, shops: ns };
}
function importText(text) {
  const parsed = parseText(text);
  if (!parsed.length) { toast('取り込める店がありませんでした'); return false; }
  const r = mergeLists(parsed);
  if (!r.lists) { toast('店が多すぎて取り込めませんでした'); return false; }
  if (!saveAll()) return false;
  try { localStorage.setItem('meimon.importedAt', String(Date.now())); } catch (e) {}
  toast(`${r.lists} リスト・${r.shops} 店を取り込みました`);
  return true;
}
const readFile = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error);
  r.readAsText(f, 'utf-8');
});

// ---------- バックアップ ----------
function exportBackup() {
  const data = { app: 'meimon', version: 1, lists, visited: Object.assign({}, visited), pos: Object.assign({}, fixedPos) };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const a = h('a', { href: URL.createObjectURL(blob), download: `meimon-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// 形と型を厳しく確かめる。問題があれば null
function validateBackup(o) {
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(o) || o.app !== 'meimon' || o.version !== 1) return null;
  if (!Array.isArray(o.lists) || !isObj(o.visited)) return null;
  const ls = []; let total = 0;
  for (const l of o.lists) {
    if (!isObj(l) || typeof l.title !== 'string' || !Array.isArray(l.shops)) return null;
    const shops = [];
    for (const s of l.shops) {
      if (!isObj(s) || typeof s.n !== 'string' || typeof s.a !== 'string') return null;
      if (!s.n.trim()) continue;
      shops.push(Object.assign({ n: cap(s.n, MAX_NAME), a: cap(s.a, MAX_AREA) }, cleanPos(s)));
    }
    total += shops.length;
    if (total > MAX_SHOPS) return null;
    ls.push({ title: cap(l.title, MAX_TITLE) || DEFAULT_TITLE, shops });
  }
  const vis = [];
  for (const k of Object.keys(o.visited)) {
    if (BAD_KEYS.has(k)) return null;
    if (k.length > MAX_KEY) continue;
    if (o.visited[k]) vis.push(k);
  }
  return { lists: ls, visited: vis, pos: cleanFixedPos(o.pos) };
}
async function importBackup(file) {
  let data = null;
  try { data = validateBackup(JSON.parse(await readFile(file))); } catch {}
  if (!data) { toast('バックアップの形式が正しくありません'); return; }
  const before = lists.slice();
  const r = mergeLists(data.lists);
  if (data.lists.length && !r.lists) { toast('店が多すぎて読み込めませんでした'); lists = before; return; }
  for (const k of data.visited) visited[k] = 1;
  Object.assign(fixedPos, data.pos); saveFixedPos();
  if (saveAll()) toast(`${r.lists} リスト・${r.shops} 店を読み込みました`);
}

// ---------- 画面の状態 ----------
const view = { list: null, status: 'all', pref: '', q: '', map: false, mg: '', mt: false, mo: false, open: false, genre: '' }; // list: タイトル（詳細を開いているとき）／map: 地図を開いているとき（mg: ジャンル、mt: まだだけ）
let homeQ = '';

const app = $('#app');
function render() {
  leaveMap();
  app.replaceChildren();
  if (view.map) renderMap();
  else if (view.list != null && currentList()) renderDetail();
  else { view.list = null; renderHome(); }
  paintTabs();
}
// 下のタブ（リスト／地図）
function paintTabs() {
  for (const b of document.querySelectorAll('#tabs .tab')) {
    const on = (b.dataset.open === 'map') === !!view.map;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}
function initTabs() {
  const nav = $('#tabs');
  nav.append(
    h('button', { class: 'tab', type: 'button', 'data-open': 'list', onclick: () => { closeSheet(); if (view.map) view.map = false; else view.list = null; render(); window.scrollTo(0, 0); } }, icon('list'), h('span', null, 'リスト')),
    h('button', { class: 'tab', type: 'button', 'data-open': 'map', onclick: () => { if (view.map) return; closeSheet(); openMap(); } }, icon('map'), h('span', null, '地図')));
}

// 一覧のジャンル（末尾の西暦4桁・「3.7以上」・地域の語を除く）
function genreOf(title) {
  let t = title.trim();
  for (let i = 0; i < 2; i++) {
    t = t.replace(/\s*\d{4}$/, '').replace(/\s*\d(\.\d)?以上$/, '').replace(/\s*(TOKYO|EAST|WEST|HOKKAIDO|KANAGAWA|AICHI|OSAKA|KAGAWA)$/, '');
  }
  return t.trim() || title;
}
function prefOf(a) { return String(a || '').trim().split(/\s+/)[0] || ''; }

// ---------- ホーム ----------
let homeBody = null;
let homeMode = 'genre'; try { if (localStorage.getItem('meimon.home') === 'area') homeMode = 'area'; } catch (e) {}
function renderHome() {
  const all = totalShops();
  let done = 0; for (const l of lists) done += doneCount(l);
  const wrap = h('div', { class: 'wrap' });
  wrap.append(h('div', { class: 'bar' },
    h('h1', null, '百名店チェック', h('small', { class: 'hver' }, APP_VERSION)),
    h('button', { class: 'btn small', 'data-open': 'data', onclick: () => openSheet() }, 'データ')));
  if (!lists.length) {
    wrap.append(h('div', { class: 'empty' }, h('p', null, 'まだ一覧がありません'),
      h('button', { class: 'btn primary', onclick: () => openSheet(true) }, '一覧を取り込む')));
    app.append(wrap); homeBody = null; return;
  }
  const sum = h('div', { class: 'summary' },
    h('div', { class: 'big' }, `行った ${done}`, h('small', null, `/ 全 ${all} ・ ${pct(done, all)}`)),
    progress(done, all));
  const q = h('input', { class: 'search', type: 'search', placeholder: '店名・エリアを全リストから探す', maxlength: 100, 'aria-label': '店を探す', value: homeQ, autocomplete: 'off' });
  q.value = homeQ;
  q.addEventListener('input', () => { homeQ = q.value; renderHomeBody(); });
  homeBody = h('div');
  wrap.append(sum, q, homeBody);
  app.append(wrap);
  renderHomeBody();
}
// 割合の文字（10% 未満は小数1桁。0 は 0%）
function pct(done, all) {
  if (!all || !done) return '0%';
  const v = done / all * 100;
  return (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)) + '%';
}
const countText = (done, all) => `${done} / ${all} ・ ${pct(done, all)}`;
// エリア（都道府県）ごとの店。同じ店（店名＋都道府県）が複数の一覧にあっても1店と数える
const PREF_ORDER = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
const AREA_KEY = '\u0001area:';
function areaGroups() {
  const m = new Map();
  for (const l of lists) for (const s of l.shops) {
    const pf = prefOf(s.a) || 'その他';
    let g = m.get(pf);
    if (!g) { g = { pref: pf, seen: new Set(), shops: [], src: new Map() }; m.set(pf, g); }
    const k = keyOf(s);
    if (g.seen.has(k)) continue;
    g.seen.add(k); g.shops.push(s); g.src.set(s, l);
  }
  const ord = (pf) => { const i = PREF_ORDER.indexOf(pf); return i < 0 ? 999 : i; };
  return [...m.values()].sort((a, b) => ord(a.pref) - ord(b.pref));
}
// 一覧の詳細に渡す「エリアの一覧」（題＝都道府県。src: 店 → もとの一覧）
// 鍵: AREA_KEY + 都道府県 [+ SUB_SEP + 'c'（区・市）か 's'（駅）+ ':' + 名前]
const SUB_SEP = '\u0002';
// 駅ごと: 同じ場所の駅のまとまり（g）があればそれ、無ければ駅の名前
const subName = (s, kind) => (kind === 'c' ? s.m : (s.g || areaOf(s))) || 'その他';
function areaList(key) {
  if (typeof key !== 'string' || !key.startsWith(AREA_KEY)) return null;
  const [pf, sub] = key.slice(AREA_KEY.length).split(SUB_SEP);
  const g = areaGroups().find(x => x.pref === pf);
  if (!g) return null;
  if (!sub) return { title: g.pref, shops: g.shops, src: g.src, area: true, pref: g.pref };
  const kind = sub[0], name = sub.slice(2);
  const shops = g.shops.filter(s => subName(s, kind) === name);
  return shops.length ? { title: name, shops, src: g.src, area: true, pref: g.pref, sub: kind } : null;
}
// 1つ上の画面の鍵（区・駅 → 都道府県。それ以外はホーム＝null）
const parentKey = (key) => typeof key === 'string' && key.startsWith(AREA_KEY) && key.includes(SUB_SEP) ? key.split(SUB_SEP)[0] : null;
let areaSub = 'shops'; try { const v = localStorage.getItem('meimon.sub'); if (v === 'c' || v === 's') areaSub = v; } catch (e) {}
const SUB_MIN = 3;
let subMin = false; try { subMin = localStorage.getItem('meimon.submin') === '1'; } catch (e) {}
let subSort = 'n'; try { const v = localStorage.getItem('meimon.subsort'); if (v === 'p' || v === 'r') subSort = v; } catch (e) {}
const currentList = () => lists.find(x => x.title === view.list) || areaList(view.list);
// 「一覧 11月27日 12:34 に取り込み」（取り込んだ日時を控えていれば）
function importedText() {
  let t = 0; try { t = Number(localStorage.getItem('meimon.importedAt')) || 0; } catch (e) {}
  if (!t) return '';
  const d = new Date(t), z = (n) => String(n).padStart(2, '0');
  return `一覧 ${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${z(d.getMinutes())} に取り込み`;
}
const verLine = () => h('div', { class: 'ver' }, [`アプリ ${APP_VERSION}`, importedText()].filter(Boolean).join(' ・ '));
function progress(done, all) {
  const i = h('i'); i.style.width = (all ? Math.round(done / all * 100) : 0) + '%';
  return h('div', { class: 'progress' }, i);
}
function renderHomeBody() {
  if (!homeBody) return;
  homeBody.replaceChildren();
  const nq = norm(homeQ);
  if (nq) {
    const hits = [];
    for (const l of lists) for (const s of l.shops) if (shopNorm(s).includes(nq)) hits.push([l, s]);
    if (!hits.length) { homeBody.append(h('div', { class: 'more' }, '見つかりませんでした')); return; }
    const frag = document.createDocumentFragment();
    for (const [l, s] of hits.slice(0, SEARCH_CAP)) frag.append(shopRow(l, s, true, () => { updateSummary(); renderHomeBody(); }));
    homeBody.append(frag);
    if (hits.length > SEARCH_CAP) homeBody.append(h('div', { class: 'more' }, `ほか ${hits.length - SEARCH_CAP} 件`));
    return;
  }
  // ジャンル別／エリア別の切り替え（覚える）
  const segs = h('div', { class: 'filters homesegs' });
  for (const [k, label] of [['genre', 'ジャンル別'], ['area', 'エリア別']]) {
    segs.append(h('button', { class: 'chip' + (homeMode === k ? ' on' : ''), 'aria-pressed': homeMode === k ? 'true' : 'false',
      onclick: () => { homeMode = k; try { localStorage.setItem('meimon.home', k); } catch (e) {} renderHomeBody(); } }, label));
  }
  homeBody.append(segs);
  if (homeMode === 'area') {
    for (const g of areaGroups()) {
      let d = 0; for (const s of g.shops) if (visited[keyOf(s)] === 1) d++;
      homeBody.append(h('button', { class: 'lrow' + (d ? '' : ' zero'), onclick: () => openList(AREA_KEY + g.pref) },
        h('div', { class: 'top' }, h('span', { class: 't' }, g.pref), h('span', { class: 'count' }, countText(d, g.shops.length))),
        progress(d, g.shops.length)));
    }
    homeBody.append(verLine());
    return;
  }
  const groups = new Map();
  for (const l of lists) {
    const g = genreOf(l.title);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(l);
  }
  for (const [g, ls] of groups) {
    homeBody.append(h('div', { class: 'genre' }, g));
    for (const l of ls) {
      const d = doneCount(l);
      homeBody.append(h('button', { class: 'lrow', onclick: () => openList(l.title) },
        h('div', { class: 'top' }, h('span', { class: 't' }, l.title), h('span', { class: 'count' }, countText(d, l.shops.length))),
        progress(d, l.shops.length)));
    }
  }
  homeBody.append(verLine());
}
function updateSummary() {
  const big = app.querySelector('.summary');
  if (!big) return;
  let done = 0; for (const l of lists) done += doneCount(l);
  const all = totalShops();
  big.replaceWith(h('div', { class: 'summary' },
    h('div', { class: 'big' }, `行った ${done}`, h('small', null, `/ 全 ${all} ・ ${pct(done, all)}`)), progress(done, all)));
}

// 定休日（h）: 「月曜日、第3火曜日、祝日」のような文から、毎週の曜日・第N曜日・祝日を拾う。
// 「不定休」「年末年始」は拾わない（その日が休みか決められないので、休みとは言わない）
const WD = '日月火水木金土';
const closedCache = new Map();
function closedInfo(hText) {
  const key = String(hText || '');
  if (closedCache.has(key)) return closedCache.get(key);
  const out = { wd: new Set(), nth: [], hol: false };
  for (const tok of key.split(/[、,，\/／\s]+/)) {
    const m = tok.match(/^第([1-5１-５一二三四五・第]+)([日月火水木金土])(曜日?)?$/);
    if (m) {
      const n = new Set();
      for (const ch of m[1]) { const i = '12345'.indexOf(ch) + 1 || '１２３４５'.indexOf(ch) + 1 || '一二三四五'.indexOf(ch) + 1; if (i) n.add(i); }
      if (n.size) out.nth.push({ n, wd: WD.indexOf(m[2]) });
      continue;
    }
    for (const raw of tok.split('・')) {
      if (/^祝(日|祭日)?$/.test(raw)) { out.hol = true; continue; }
      const w = raw.replace(/^毎週/, '').match(/^([日月火水木金土])(曜日?)?(定休|休み?)?$/);
      if (w) out.wd.add(WD.indexOf(w[1]));
    }
  }
  if (closedCache.size > 20000) closedCache.clear();
  closedCache.set(key, out);
  return out;
}
const closedDays = (hText) => closedInfo(hText).wd; // 毎週休む曜日（0=日〜6=土）

// 祝日（国民の祝日・振替休日・国民の休日）。年ごとに「月-日」の集合を作って控える
const holCache = new Map();
function holidaysOf(y) {
  if (holCache.has(y)) return holCache.get(y);
  const set = new Set(), add = (m, d) => set.add(m + '-' + d);
  const nthMon = (m, n) => { const first = new Date(y, m - 1, 1).getDay(); return 1 + ((8 - first) % 7) + (n - 1) * 7; };
  const eq = (base) => Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  add(1, 1); add(1, nthMon(1, 2)); add(2, 11); add(2, 23); add(3, eq(20.8431)); add(4, 29);
  add(5, 3); add(5, 4); add(5, 5); add(7, nthMon(7, 3)); add(8, 11); add(9, nthMon(9, 3));
  add(9, eq(23.2488)); add(10, nthMon(10, 2)); add(11, 3); add(11, 23);
  const has = (dt) => set.has((dt.getMonth() + 1) + '-' + dt.getDate());
  // 振替休日: 祝日が日曜なら、その後の最初の祝日でない日
  for (const k of [...set]) {
    const [m, d] = k.split('-').map(Number); const dt = new Date(y, m - 1, d);
    if (dt.getDay() !== 0) continue;
    do dt.setDate(dt.getDate() + 1); while (has(dt));
    if (dt.getFullYear() === y) add(dt.getMonth() + 1, dt.getDate());
  }
  // 国民の休日: 前後が祝日の平日
  for (const k of [...set]) {
    const [m, d] = k.split('-').map(Number);
    const mid = new Date(y, m - 1, d + 1), nx = new Date(y, m - 1, d + 2);
    if (!has(mid) && has(nx) && mid.getDay() !== 0) add(mid.getMonth() + 1, mid.getDate());
  }
  holCache.set(y, set);
  return set;
}
const isHoliday = (dt) => holidaysOf(dt.getFullYear()).has((dt.getMonth() + 1) + '-' + dt.getDate());
const addDays = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);

// ---- 営業時間（o）----
// 形: 「月・火・木 16:30 - 22:30 / 水・土 11:30 - 14:00、16:30 - 22:30」。曜日が無い区切りは毎日。「平日」は月〜金。
// 終わりが始まり以下なら翌日まで（17:00 - 00:00）。「12:00」「18:00～」のように始まりだけの時刻は 2 時間とみなす。
// 祝日・祝前日・祝後日の付いた区切りは、その日に当たればそちらを使う。読めない区切りが1つでもあれば null＝分からない。
const SEAT_MIN = 120;
const hoursCache = new Map();
function parseHours(text) {
  if (hoursCache.has(text)) return hoursCache.get(text);
  const hm = (t) => { const m = t.match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] <= 29 && +m[2] <= 59 ? +m[1] * 60 + +m[2] : -1; };
  let out = [];
  for (const seg of String(text || '').split(/\s*[\/／]\s*/)) {
    const m = seg.trim().match(/^(?:([^\d\s]+)\s+)?(\d.*)$/);
    if (!m) { out = null; break; }
    const g = { days: null, hol: false, pre: false, post: false, ranges: [] };
    if (m[1]) {
      g.days = new Set();
      for (const d of m[1].split('・')) {
        if (d === '祝日' || d === '祝') { g.hol = true; continue; }
        if (d === '祝前日') { g.pre = true; continue; }
        if (d === '祝後日') { g.post = true; continue; }
        if (d === '平日') { for (let i = 1; i <= 5; i++) g.days.add(i); continue; }
        const i = d.length === 1 ? WD.indexOf(d) : -1;
        if (i < 0) { out = null; break; }
        g.days.add(i);
      }
      if (!out) break;
    }
    for (const r of m[2].split(/\s*[、,，]\s*/)) {
      if (/^24時間(営業)?$/.test(r.trim())) { g.ranges.push([0, 1440]); continue; }
      // 終わりの無い「18:00 -」「11:00～完売」「10:00 - 売り切れまで」は始まりだけの時刻として読む
      const x = r.replace(/\s*[-－–~～〜]\s*(?:[^\d\s].*)?$/, '').split(/\s*[-－–~～〜]\s*/);
      const a = hm(x[0].trim()), b = x.length > 1 ? hm(x[1].trim()) : -2;
      if (a < 0 || b === -1 || x.length > 2) { out = null; break; }
      g.ranges.push([a, b === -2 ? a + SEAT_MIN : (b <= a ? b + 1440 : b)]);
    }
    if (!out) break;
    out.push(g);
  }
  if (out && !out.length) out = null;
  if (hoursCache.size > 20000) hoursCache.clear();
  hoursCache.set(text, out);
  return out;
}
const fmtHM = (m) => { m %= 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
// その日の営業時間（[[始まり, 終わり]]。終わりは 1440 を超えることがある）。祝日 → 祝前日 → 祝後日 → 曜日 の順で当たる区切りを使う
function dayRanges(ph, dt) {
  const wd = dt.getDay();
  const pick = (f) => { const out = []; for (const g of ph) if (f(g)) out.push(...g.ranges); return out.sort((a, b) => a[0] - b[0]); };
  if (ph.some(g => g.hol) && isHoliday(dt)) return pick(g => g.hol);
  if (ph.some(g => g.pre) && isHoliday(addDays(dt, 1))) return pick(g => g.pre);
  if (ph.some(g => g.post) && isHoliday(addDays(dt, -1))) return pick(g => g.post);
  return pick(g => !g.days || g.days.has(wd));
}
// その日が定休日か（毎週の曜日・第N曜日・祝日）。祝日用の営業時間がある店は、祝日なら開いているとみなす
function closedOn(s, dt, ph) {
  if (!s.h) return false;
  const c = closedInfo(s.h), wd = dt.getDay(), hol = isHoliday(dt);
  if (hol && ph && ph.some(g => g.hol)) return false;
  if (hol && c.hol) return true;
  if (c.wd.has(wd)) return true;
  const n = Math.floor((dt.getDate() - 1) / 7) + 1;
  return c.nth.some(x => x.wd === wd && x.n.has(n));
}
// いまの営業: {st: 'open'／'closed'／''（分からない）, until: 終わり, from: 次の始まり, dayOff: 今日は休み, ended: 今日は終了}
function openInfo(s, now) {
  now = now || new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  const ph = s.o ? parseHours(s.o) : null;
  if (!ph) return closedOn(s, now, null) ? { st: 'closed', dayOff: true } : { st: '' };
  const yd = addDays(now, -1);
  if (!closedOn(s, yd, ph)) { // 前の日からの続き（深夜）
    const r = dayRanges(ph, yd).find(r => r[1] > 1440 && min < r[1] - 1440);
    if (r) return { st: 'open', until: r[1] - 1440 };
  }
  if (closedOn(s, now, ph)) return { st: 'closed', dayOff: true };
  const rs = dayRanges(ph, now);
  if (!rs.length) return { st: 'closed', dayOff: true };
  const cur = rs.find(r => min >= r[0] && min < r[1]);
  if (cur) return { st: 'open', until: cur[1] };
  const nx = rs.find(r => r[0] > min);
  return nx ? { st: 'closed', from: nx[0] } : { st: 'closed', ended: true };
}
const openState = (s, now) => openInfo(s, now).st;
// 今日の営業時間の文（「11:30 - 14:00、17:00 - 22:00」。今日の分が無ければ ''）
function todayHours(s, now) {
  const ph = s.o ? parseHours(s.o) : null;
  if (!ph) return '';
  return dayRanges(ph, now || new Date()).map(r => fmtHM(r[0]) + ' - ' + fmtHM(r[1])).join('、');
}
// 店の行の営業の1行: 「営業中 ・ 22:30 まで」「営業時間外 ・ 17:00 から」「今日は休み」。full（地図のシート）は下に営業時間と定休日の全文
function hoursLine(s, full) {
  if (!s.h && !s.o) return null;
  const ph = s.o ? parseHours(s.o) : null, i = openInfo(s);
  const tag = i.st === 'open' ? h('span', { class: 'open' }, '営業中')
    : i.st === 'closed' ? h('span', { class: 'off' }, !ph ? '今日は定休日' : i.dayOff ? '今日は休み' : '営業時間外') : null;
  const rest = ph ? (i.until != null ? fmtHM(i.until) + ' まで' : i.from != null ? fmtHM(i.from) + ' から' : i.ended ? '今日は終了' : '')
    : [s.o || null, s.h ? '定休 ' + s.h : null].filter(Boolean).join(' ・ ');
  const line = (tag || rest) ? h('div', { class: 'ar hol' }, tag, tag && rest ? ' ・ ' : null, rest) : null;
  if (!full || !ph) return line;
  return [line, h('div', { class: 'ar hrs' }, s.o), s.h ? h('div', { class: 'ar hrs' }, '定休 ' + s.h) : null];
}

// 店のページ（食べログ）を開くリンク
const pageLink = (s) => h('a', { class: 'mlink', href: s.u, target: '_blank', rel: 'noopener noreferrer' }, '食べログ');
// 店の行の右のリンク: 予約サイト・電話・食べログ（あるものだけ）
const shopLinks = (s) => [
  s.r ? h('a', { class: 'mlink rsv', href: s.r, target: '_blank', rel: 'noopener noreferrer' }, '予約') : null,
  s.q ? h('a', { class: 'mlink', href: s.q, target: '_blank', rel: 'noopener noreferrer' }, '待ち時間') : null,
  s.w ? h('a', { class: 'mlink', href: s.w, target: '_blank', rel: 'noopener noreferrer' }, '公式サイト') : null,
  s.t ? h('a', { class: 'mlink', href: 'tel:' + s.t, 'aria-label': '電話 ' + s.t }, '電話') : null,
  s.u ? pageLink(s) : null
];
// 「地図」: その店の場所へ地図を寄せて、店のシートを開く（位置のある店だけ）
const mapLink = (s) => posOf(s) ? h('button', { class: 'mlink', type: 'button', onclick: () => showOnMap(s) }, '地図') : null;

// 店の行（タップで行った／まだ）
function shopRow(l, s, withTitle, after, opts) {
  opts = opts || {};
  const on = isVisited(l, s);
  const row = h('button', { class: 'srow' + (on ? ' done' : ''), 'aria-pressed': on ? 'true' : 'false' },
    h('span', { class: 'tx' },
      h('div', { class: 'nm' }, s.n),
      (s.a || withTitle || opts.extra) ? h('div', { class: 'ar' }, [withTitle ? l.title : null, s.a, opts.extra].filter(Boolean).join(' ・ ')) : null,
      hoursLine(s, opts.full)),
    h('span', { class: 'chk' }, icon('check')));
  row.addEventListener('click', () => {
    const k = keyOf(s);
    if (visited[k]) delete visited[k]; else visited[k] = 1;
    saveVisited();
    after();
  });
  return row;
}

// ---------- 一覧の詳細 ----------
function openList(title) {
  view.list = title; view.status = 'all'; view.pref = ''; view.q = ''; view.open = false; view.genre = '';
  try { history.pushState({ d: 1 }, ''); } catch {}
  render(); window.scrollTo(0, 0);
}
function closeList() {
  if (history.state && history.state.d) history.back();
  else { view.list = parentKey(view.list); render(); }
}
window.addEventListener('popstate', () => { if (!view.map && view.list != null) { view.list = parentKey(view.list); view.status = 'all'; view.q = ''; view.open = false; view.genre = ''; render(); } });

function renderDetail() {
  const l = currentList();
  const wrap = h('div', { class: 'wrap' });
  const cnt = h('span', { class: 'count' });
  const prog = h('div');
  wrap.append(h('div', { class: 'bar' },
    h('button', { class: 'ibtn', 'aria-label': '戻る', onclick: closeList }, icon('back')),
    h('h2', null, l.title), cnt));
  wrap.append(prog);
  // 都道府県の画面は「店／区・市／駅」で切り替えられる（区・市は市区町村の入った一覧のときだけ）
  if (l.area && !l.sub) {
    const kinds = [['shops', '店'], ...(l.shops.some(s => s.m) ? [['c', '区・市ごと']] : []), ['s', '駅ごと']];
    if (!kinds.some(k => k[0] === areaSub)) areaSub = 'shops';
    const segs = h('div', { class: 'filters subsegs' });
    for (const [k, label] of kinds) segs.append(h('button', { class: 'chip' + (areaSub === k ? ' on' : ''), 'aria-pressed': areaSub === k ? 'true' : 'false',
      onclick: () => { areaSub = k; try { localStorage.setItem('meimon.sub', k); } catch (e) {} render(); } }, label));
    wrap.append(segs);
    if (areaSub !== 'shops') {
      const d0 = doneCount(l);
      cnt.textContent = countText(d0, l.shops.length);
      prog.replaceChildren(progress(d0, l.shops.length));
      const m = new Map();
      for (const s of l.shops) { const n = subName(s, areaSub); let g = m.get(n); if (!g) { g = { n, all: 0, done: 0 }; m.set(n, g); } g.all++; if (visited[keyOf(s)] === 1) g.done++; }
      // 並び: 店の多い順／割合の高い順（同じ割合なら行った数 → 店の数 → 名前）。「その他」は最後
      const sorts = h('div', { class: 'filters subsort' });
      // 並びは1つのボタンにまとめ、押すと選択肢のシートが開く（今の並びを文字で出す）
      sorts.append(h('button', { class: 'chip sortbtn', 'aria-haspopup': 'dialog', 'aria-label': '並び: ' + SUB_SORTS.find(x => x[0] === subSort)[1],
        onclick: openSubSort }, h('span', null, SUB_SORTS.find(x => x[0] === subSort)[1]), h('span', { class: 'caret', 'aria-hidden': 'true' }, '⌄')));
      // 店の少ない駅（1/1 で 100%）を外す絞り込み
      sorts.append(h('button', { class: 'chip sep' + (subMin ? ' on' : ''), 'aria-pressed': subMin ? 'true' : 'false',
        onclick: () => { subMin = !subMin; try { localStorage.setItem('meimon.submin', subMin ? '1' : '0'); } catch (e) {} render(); } }, SUB_MIN + '店以上'));
      wrap.append(sorts);
      const byN = (a, b) => b.all - a.all || a.n.localeCompare(b.n, 'ja');
      const rows = [...m.values()].filter(g => !subMin || g.all >= SUB_MIN).sort((a, b) => (a.n === 'その他') - (b.n === 'その他') ||
        (subSort === 'p' ? (b.done / b.all - a.done / a.all || b.done - a.done) :
          // 残りの少ない順: 全部行った所は後ろ（あと少しの所を上に）。同じ残りなら行った数の多い方
          subSort === 'r' ? ((a.all === a.done) - (b.all === b.done) || (a.all - a.done) - (b.all - b.done) || b.done - a.done) : 0) || byN(a, b));
      if (!rows.length) wrap.append(h('p', { class: 'empty' }, SUB_MIN + '店以上の' + (areaSub === 'c' ? '区・市' : '駅') + 'はありません'));
      for (const g of rows) wrap.append(h('button', { class: 'lrow', onclick: () => openList(AREA_KEY + l.pref + SUB_SEP + areaSub + ':' + g.n) },
        h('div', { class: 'top' }, h('span', { class: 't' }, g.n), h('span', { class: 'count' }, subSort === 'r' && g.all > g.done ? 'あと ' + (g.all - g.done) + ' ・ ' + countText(g.done, g.all) : countText(g.done, g.all))), progress(g.done, g.all)));
      app.append(wrap);
      return;
    }
  }
  const chips = h('div', { class: 'filters' });
  for (const [k, label] of [['all', 'すべて'], ['todo', 'まだ'], ['done', '行った']]) {
    const c = h('button', { class: 'chip', onclick: () => { view.status = k; paintChips(); paintRows(); } }, label);
    c.dataset.k = k; chips.append(c);
  }
  // 営業時間のある一覧だけ「営業中」の絞り込み
  const hasHours = l.shops.some(s => s.o);
  if (!hasHours) view.open = false;
  const chipO = hasHours ? h('button', { class: 'chip sep', onclick: () => { view.open = !view.open; paintChips(); paintRows(); } }, '営業中') : null;
  if (chipO) chips.append(chipO);
  wrap.append(chips);
  const prefs = [...new Set(l.shops.map(s => prefOf(s.a)).filter(Boolean))];
  const fx = h('div', { class: 'fx' });
  if (prefs.length >= 2) {
    const sel = h('select', { 'aria-label': '都道府県' }, h('option', { value: '' }, 'すべての地域'),
      prefs.map(p => h('option', { value: p }, p)));
    sel.value = view.pref;
    sel.addEventListener('change', () => { view.pref = sel.value; paintRows(); });
    fx.append(sel);
  }
  // エリアの一覧では、ジャンルで絞れる
  const srcOf = (s) => l.src ? l.src.get(s) : l;
  if (l.area) {
    const gs = [...new Set(l.shops.map(s => genreOf(srcOf(s).title)))];
    if (gs.length >= 2) {
      const sel = h('select', { 'aria-label': 'ジャンル' }, h('option', { value: '' }, 'すべてのジャンル'), gs.map(g => h('option', { value: g }, g)));
      sel.value = gs.includes(view.genre) ? view.genre : (view.genre = '');
      sel.addEventListener('change', () => { view.genre = sel.value; paintRows(); });
      fx.append(sel);
    }
  }
  const q = h('input', { type: 'search', placeholder: '店名・エリア', maxlength: 100, 'aria-label': '絞り込み', autocomplete: 'off' });
  q.addEventListener('input', () => { view.q = q.value; paintRows(); });
  fx.append(q);
  wrap.append(fx);
  const rows = h('div');
  wrap.append(rows);
  app.append(wrap);

  function paintChips() {
    for (const c of chips.children) if (c !== chipO) c.className = 'chip' + (c.dataset.k === view.status ? ' on' : '');
    if (chipO) { chipO.className = 'chip sep' + (view.open ? ' on' : ''); chipO.setAttribute('aria-pressed', view.open ? 'true' : 'false'); }
  }
  function paintHead() {
    const d = doneCount(l);
    cnt.textContent = countText(d, l.shops.length);
    prog.replaceChildren(progress(d, l.shops.length));
  }
  function paintRows() {
    paintHead();
    const nq = norm(view.q);
    const list = [];
    for (const s of l.shops) {
      if (view.status !== 'all' && (view.status === 'done') !== isVisited(l, s)) continue;
      if (view.pref && prefOf(s.a) !== view.pref) continue;
      if (l.area && view.genre && genreOf(srcOf(s).title) !== view.genre) continue;
      if (nq && !shopNorm(s).includes(nq)) continue;
      if (view.open && openState(s) !== 'open') continue;
      list.push(s);
    }
    rows.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const s of list.slice(0, LIST_CAP)) frag.append((s.u || s.t || s.r || s.w || s.q || posOf(s)) ? h('div', { class: 'mrow' }, shopRow(srcOf(s), s, !!l.area, paintRows), h('span', { class: 'macts' }, shopLinks(s), mapLink(s))) : shopRow(srcOf(s), s, !!l.area, paintRows));
    rows.append(frag);
    if (list.length > LIST_CAP) rows.append(h('div', { class: 'more' }, `ほか ${list.length - LIST_CAP} 件`));
    else if (!list.length) rows.append(h('div', { class: 'more' }, '該当する店がありません'));
  }
  paintChips(); paintRows();
}

// ---------- 地図 ----------
// MapLibre は地図を開いたときだけ読み込む。店のデータは外へ送らない（地図の部品とタイルの取得だけ）
const ML_VER = '4.7.1';
const ML_CSS = { href: `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`, integrity: 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V' };
const ML_JS = { src: `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`, integrity: 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj' };
// 地図の見た目は js/mapstyle.js の baseMapStyle(dark)（BITEMAP 本体と同じ）
const PIN_COLOR = '#C6613F', PIN_DONE = '#9A9891';
// 料理の系統（地図の丸の色）。ジャンルは一覧の題から。どれにも入らない・同じ位置に違う系統 → PIN_MIX
const PIN_MIX = '#55524C';
const FAMS = [
  ['肉', '#C2352B', ['焼き鳥', 'すき焼き・しゃぶしゃぶ', '焼肉', 'ステーキ・鉄板焼き', '鳥料理', 'とんかつ', 'ハンバーガー']],
  ['和食', '#1F7A5C', ['日本料理', '寿司', '天ぷら', '食堂', 'お好み焼き']],
  ['麺', '#D98A00', ['ラーメン', 'そば', 'うどん']],
  ['洋食', '#2F6FB7', ['フレンチ', 'イタリアン', 'ピザ', 'スペイン料理', '洋食', '創作料理・イノベーティブ']],
  ['中華・アジア', '#8E44AD', ['中国料理', 'アジア・エスニック', 'カレー', '餃子']],
  ['酒', '#7A5230', ['居酒屋', '立ち飲み', 'バー']],
  ['甘味・喫茶', '#D6468C', ['和菓子・甘味処', '喫茶店', 'カフェ']]
];
function famOf(genre) { for (let i = 0; i < FAMS.length; i++) if (FAMS[i][2].includes(genre)) return i; return -1; }
// 系統の番号（f・fmin）から色へ
function famColor(prop) { const e = ['match', ['get', prop]]; FAMS.forEach((f, i) => e.push(i, f[1])); e.push(PIN_MIX); return e; }
let mapObj = null, mapReady = false, mapToken = 0, mapLib = null, lastCam = null, mapPlaces = new Map();
let myPos = null, geoWatch = null, meMarker = null; // 現在地（[経度, 緯度]）

const hasCoords = () => lists.some(l => l.shops.some(s => s.p || fixedPos[keyOf(s)]));
const areaOf = (s) => String(s.a || '').trim().split(/\s+/).slice(1).join(' '); // 都道府県を除いたエリア
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  if (mapLib) return mapLib;
  const els = [];
  mapLib = new Promise((res, rej) => {
    const css = h('link', { rel: 'stylesheet', href: ML_CSS.href, integrity: ML_CSS.integrity, crossorigin: 'anonymous' });
    const js = h('script', { src: ML_JS.src, integrity: ML_JS.integrity, crossorigin: 'anonymous' });
    els.push(css, js);
    js.onload = () => (window.maplibregl ? res() : rej(new Error('maplibre')));
    js.onerror = () => rej(new Error('maplibre'));
    document.head.append(css, js);
  }).catch(e => { mapLib = null; for (const x of els) x.remove(); throw e; });
  return mapLib;
}

function openMap() {
  view.map = true;
  render();
}
// 店を地図で見る: 絞り込みを外し、その店の場所へ寄せて店のシートを開く。地図を開いていなければ開く
let pendingFocus = null;
function showOnMap(s) {
  const ps = posOf(s);
  if (!ps) return;
  const k = ps.p[0] + ',' + ps.p[1];
  if (view.map && mapObj && mapReady && mapPlaces.has(k)) {
    closeSheet();
    mapObj.easeTo({ center: [ps.p[1], ps.p[0]], zoom: Math.max(mapObj.getZoom(), 16) });
    openPlace(k);
    return;
  }
  view.mg = ''; view.mt = false; view.mo = false;
  pendingFocus = { center: [ps.p[1], ps.p[0]], k };
  closeSheet();
  view.map = true;
  render();
}
function leaveMap() {
  mapToken++;
  if (document.querySelector('#sheet-root .sheet-wrap.place')) closeSheet();
  if (mapObj) {
    try { const c = mapObj.getCenter(); lastCam = { center: [c.lng, c.lat], zoom: mapObj.getZoom() }; } catch {}
    try { mapObj.remove(); } catch {}
  }
  stopGeo(); endPick();
  mapObj = null; mapReady = false; mapPlaces = new Map();
  window.__meimonMap = null;
}

// 絞り込み後の店を同じ位置ごとにまとめる
function buildPlaces() {
  const m = new Map();
  for (const l of lists) {
    if (view.mg && genreOf(l.title) !== view.mg) continue;
    for (const s of l.shops) {
      const ps = posOf(s);
      if (!ps) continue;
      if (view.mt && isVisited(l, s)) continue;
      if (view.mo && openState(s) !== 'open') continue;
      const k = ps.p[0] + ',' + ps.p[1];
      let pl = m.get(k);
      if (!pl) { pl = { k, lat: ps.p[0], lon: ps.p[1], coarse: !!ps.c, exact: !!ps.x, label: ps.x ? s.n : (areaOf(s) || s.a || s.n), items: [] }; m.set(k, pl); }
      else if (pl.exact && s.n !== pl.label) pl.label = areaOf(pl.items[0][1]) || pl.label; // 同じ位置に別の店（同じ建物など）
      pl.items.push([l, s]);
    }
  }
  return m;
}
function placesData() {
  mapPlaces = buildPlaces();
  const features = [];
  for (const pl of mapPlaces.values()) {
    const n = pl.items.length;
    let d = 0, off = 0, g = null, f = null;
    for (const [l, s] of pl.items) {
      if (isVisited(l, s)) d++; if (openState(s) === 'closed') off++;
      const gg = genreOf(l.title), ff = famOf(gg);
      g = g === null || g === gg ? gg : ''; f = f === null || f === ff ? ff : -1;
    }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [pl.lon, pl.lat] },
      properties: { k: pl.k, n, d, todo: n - d, c: pl.coarse ? 1 : 0, x: pl.exact ? 1 : 0, off: off === n ? 1 : 0, label: pl.label, g: g || '', f } });
  }
  const fc = { type: 'FeatureCollection', features };
  window.__meimonPlaces = fc;
  return fc;
}
function refreshPlaces() {
  const fc = placesData();
  if (mapObj && mapReady) mapObj.getSource('places').setData(fc);
}
// 営業中かどうかは時刻で変わるので、地図を開いている間は 5 分おきと前面に戻ったときに丸を作り直す
setInterval(() => { if (view.map && mapObj && !document.hidden) refreshPlaces(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && view.map && mapObj) refreshPlaces(); });

function renderMap() {
  if (!hasCoords()) {
    app.append(h('div', { class: 'wrap' }, h('div', { class: 'empty' }, h('p', null, '位置つきの一覧を取り込むと、ここに地図が出ます'),
      h('button', { class: 'btn primary', onclick: () => openSheet(true) }, '一覧を取り込む'))));
    return;
  }
  const genres = [];
  for (const l of lists) if (l.shops.some(s => s.p)) { const g = genreOf(l.title); if (!genres.includes(g)) genres.push(g); }
  const sel = h('select', { 'aria-label': 'ジャンル' }, h('option', { value: '' }, 'すべてのジャンル'), genres.map(g => h('option', { value: g }, g)));
  sel.value = view.mg;
  const chip = h('button', { class: 'chip', 'aria-pressed': view.mt ? 'true' : 'false' }, 'まだだけ');
  const paintChip = () => { chip.className = 'chip' + (view.mt ? ' on' : ''); chip.setAttribute('aria-pressed', view.mt ? 'true' : 'false'); };
  paintChip();
  const changed = () => { closeSheet(); refreshPlaces(); };
  sel.addEventListener('change', () => { view.mg = sel.value; changed(); });
  chip.addEventListener('click', () => { view.mt = !view.mt; paintChip(); changed(); });
  // 営業時間のある一覧のときだけ「営業中」の絞り込み
  const hasHours = lists.some(l => l.shops.some(s => s.o));
  if (!hasHours) view.mo = false;
  const chipO = hasHours ? h('button', { class: 'chip' }, '営業中') : null;
  const paintO = () => { if (chipO) { chipO.className = 'chip' + (view.mo ? ' on' : ''); chipO.setAttribute('aria-pressed', view.mo ? 'true' : 'false'); } };
  paintO();
  if (chipO) chipO.addEventListener('click', () => { view.mo = !view.mo; paintO(); changed(); });
  const box = h('div', { class: 'mapbox' });
  const fail = h('div', { class: 'mapfail', hidden: true });
  app.append(h('div', { class: 'mapview' }, box, fail,
    // 左下: 「近い順の一覧」のボタンと色の説明
    h('div', { class: 'mapleft' },
      h('button', { class: 'nearbtn', type: 'button', 'aria-label': 'この範囲の店を一覧で', onclick: openInView }, icon('list'), h('span', null, '近い順の一覧')),
      mapLegend()),
    h('div', { class: 'mapbar' }, sel, chipO, chip)));
  startMap(box, fail);
}
// 凡例: 系統の色・行った・今日は定休日。タップで畳む（覚える）
function mapLegend() {
  let mini = true; try { mini = localStorage.getItem('meimon.legend') !== '1'; } catch (e) {} // 最初は畳んでおく（開いたら覚える）
  const item = (cls, color, text) => h('span', { class: 'lgi' }, h('i', { class: 'lg ' + cls, style: color ? 'background:' + color : null }), text);
  const body = h('span', { class: 'lgbody' }, FAMS.map(f => item('on', f[1], f[0])), item('on', PIN_DONE, '行った'), item('off', '', '営業時間外・定休日'));
  const el = h('button', { class: 'maplegend', type: 'button', 'aria-label': '色の説明' }, h('span', { class: 'lgt' }, '色の説明'), body);
  const paint = () => { el.classList.toggle('mini', mini); el.setAttribute('aria-expanded', mini ? 'false' : 'true'); };
  el.addEventListener('click', () => { mini = !mini; paint(); try { localStorage.setItem('meimon.legend', mini ? '0' : '1'); } catch (e) {} });
  paint();
  return el;
}
function startMap(box, fail) {
  const token = ++mapToken;
  fail.hidden = true; fail.replaceChildren();
  loadMapLib().then(() => {
    if (token !== mapToken) return;
    const fc = placesData();
    const dark = !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const opt = { container: box, style: baseMapStyle(dark), attributionControl: { compact: true }, dragRotate: false };
    const focus = pendingFocus; pendingFocus = null;
    if (focus) { opt.center = focus.center; opt.zoom = 16; }
    else if (lastCam) { opt.center = lastCam.center; opt.zoom = lastCam.zoom; }
    else {
      const ps = [...mapPlaces.values()];
      const la = ps.map(p => p.lat), lo = ps.map(p => p.lon);
      opt.bounds = [[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]];
      opt.fitBoundsOptions = { padding: 40, maxZoom: 13 };
    }
    const map = new maplibregl.Map(opt);
    mapObj = map; window.__meimonMap = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(locateControl(), 'bottom-right');
    startGeo(!lastCam && !focus);
    map.on('error', () => {}); // 文字（グリフ）やタイルが読めなくても地図は止めない
    map.on('load', () => {
      if (token !== mapToken) return;
      map.addSource('places', { type: 'geojson', data: fc, cluster: true, clusterRadius: 44, clusterMaxZoom: 13,
        clusterProperties: { n: ['+', ['get', 'n']], todo: ['+', ['get', 'todo']], fmin: ['min', ['get', 'f']], fmax: ['max', ['get', 'f']] } });
      // まだの店は料理の系統の色、行った店は灰。まとまりは中が全部同じ系統のときだけその色
      const ptColor = ['case', ['>', ['get', 'todo'], 0], famColor('f'), PIN_DONE];
      const clColor = ['case', ['==', ['get', 'todo'], 0], PIN_DONE, ['==', ['get', 'fmin'], ['get', 'fmax']], famColor('fmin'), PIN_MIX];
      const isCl = ['has', 'point_count'];
      const txt = { 'text-field': ['to-string', ['get', 'n']], 'text-font': FONT, 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true };
      const txtPaint = { 'text-color': '#ffffff' };
      map.addLayer({ id: 'clusters', type: 'circle', source: 'places', filter: isCl,
        paint: { 'circle-color': clColor, 'circle-radius': ['step', ['get', 'n'], 16, 10, 20, 30, 25], 'circle-opacity': .85, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'cluster-n', type: 'symbol', source: 'places', filter: isCl, layout: txt, paint: txtPaint });
      map.addLayer({ id: 'places-pt', type: 'circle', source: 'places', filter: ['!', isCl],
        paint: { 'circle-color': ['case', ['==', ['get', 'off'], 1], '#ffffff', ptColor], 'circle-radius': ['case', ['==', ['get', 'x'], 1], 8, 11],
          'circle-opacity': ['case', ['==', ['get', 'off'], 1], .9, ['==', ['get', 'c'], 1], .5, ['==', ['get', 'x'], 1], 1, .8],
          // 今日が定休日の店（同じ位置の店が全部休み）は白抜き。縁の色が 行った／まだ
          'circle-stroke-color': ['case', ['==', ['get', 'off'], 1], ptColor, '#ffffff'],
          'circle-stroke-width': ['case', ['==', ['get', 'off'], 1], 3, 2] } });
      map.addLayer({ id: 'places-n', type: 'symbol', source: 'places', filter: ['all', ['!', isCl], ['>', ['get', 'n'], 1]], layout: txt,
        paint: { 'text-color': ['case', ['==', ['get', 'off'], 1], ptColor, '#ffffff'] } });
      // 寄ったら丸の下に 店名（駅・市の位置ならその名前）とジャンル。重なるものは出さない
      map.addLayer({ id: 'places-label', type: 'symbol', source: 'places', filter: ['!', isCl], minzoom: 14,
        layout: { 'text-field': ['format', ['get', 'label'], {}, ['case', ['==', ['get', 'g'], ''], '', ['concat', '\n', ['get', 'g']]], { 'font-scale': .85, 'text-color': ptColor }],
          'text-font': FONT, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 1.1], 'text-max-width': 9, 'text-padding': 4 },
        paint: { 'text-color': dark ? '#F0EEE6' : '#33322E', 'text-halo-color': dark ? '#1F1E1C' : '#ffffff', 'text-halo-width': 1.4 } });
      map.on('click', 'clusters', (e) => {
        const f = e.features && e.features[0]; if (!f) return;
        map.getSource('places').getClusterExpansionZoom(f.properties.cluster_id)
          .then(z => map.easeTo({ center: f.geometry.coordinates, zoom: z })).catch(() => {});
      });
      map.on('click', 'places-pt', (e) => { const f = e.features && e.features[0]; if (f) openPlace(f.properties.k); });
      for (const id of ['clusters', 'places-pt']) {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      }
      // 出典の表示は畳んでおく（ⓘ を押すと開く。幅の狭い画面では開いたままだと下の1割をふさぐ）
      const at = box.querySelector('.maplibregl-ctrl-attrib');
      if (at) { at.classList.remove('maplibregl-compact-show'); at.removeAttribute('open'); }
      mapReady = true; box.dataset.ready = '1';
      if (focus) openPlace(focus.k);
    });
  }).catch(() => {
    if (token !== mapToken) return;
    fail.hidden = false;
    fail.append(h('p', null, '地図を読み込めませんでした ・ 接続を確かめてください'),
      h('button', { class: 'btn', onclick: () => startMap(box, fail) }, 'もう一度'));
  });
}

// 現在地: 地図を開いている間だけ位置を見て、青い点で出す。最初に開いたときだけ現在地へ寄せる
function showMe(first) {
  if (!mapObj || !myPos || !window.maplibregl) return;
  if (!meMarker) {
    meMarker = new maplibregl.Marker({ element: h('div', { class: 'medot', role: 'img', 'aria-label': '現在地' }) }).setLngLat(myPos).addTo(mapObj);
    if (first && okPos(myPos[1], myPos[0])) mapObj.jumpTo({ center: myPos, zoom: 14 });
  } else meMarker.setLngLat(myPos);
}
function startGeo(first) {
  if (!navigator.geolocation || geoWatch != null) return;
  const token = mapToken;
  try {
    geoWatch = navigator.geolocation.watchPosition((pos) => {
      if (token !== mapToken) return;
      myPos = [pos.coords.longitude, pos.coords.latitude];
      showMe(first); first = false;
    }, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
  } catch { geoWatch = null; }
}
function stopGeo() {
  if (geoWatch != null) { try { navigator.geolocation.clearWatch(geoWatch); } catch {} }
  geoWatch = null;
  if (meMarker) { try { meMarker.remove(); } catch {} }
  meMarker = null;
}
// 現在地へ寄せるボタン（地図の右下）
function locateControl() {
  let el = null;
  return {
    onAdd() {
      el = h('div', { class: 'maplibregl-ctrl maplibregl-ctrl-group' },
        h('button', { type: 'button', class: 'locbtn', 'aria-label': '現在地へ', onclick: () => {
          if (myPos && mapObj) { showMe(false); mapObj.easeTo({ center: myPos, zoom: Math.max(mapObj.getZoom(), 14) }); }
          else { if (geoWatch == null) startGeo(true); toast(navigator.geolocation ? '現在地を調べています' : 'この端末では現在地を使えません'); }
        } }, icon('locate')));
      return el;
    },
    onRemove() { if (el) el.remove(); el = null; },
  };
}

// 店の位置を自分で直す: 地図の中央の印を店の場所に合わせて「この位置にする」
let pickEl = null;
function endPick() { if (pickEl) { pickEl.remove(); pickEl = null; } }
function startPick(s) {
  const view0 = document.querySelector('.mapview');
  if (!mapObj || !view0) return;
  closeSheet(); endPick();
  const k = keyOf(s);
  const done = (msg) => { endPick(); refreshPlaces(); if (msg) toast(msg); };
  pickEl = h('div', { class: 'pick' },
    h('div', { class: 'pickpin', 'aria-hidden': 'true' }),
    h('div', { class: 'pickbar' },
      h('div', { class: 'pickname' }, s.n),
      h('div', { class: 'hint' }, '地図を動かして、印を店の場所に合わせます'),
      h('div', { class: 'rowb' },
        h('button', { class: 'btn', type: 'button', onclick: () => endPick() }, 'やめる'),
        fixedPos[k] ? h('button', { class: 'btn', type: 'button', onclick: () => { delete fixedPos[k]; saveFixedPos(); done('元の位置に戻しました'); } }, '元に戻す') : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          const c = mapObj.getCenter();
          const la = Math.round(c.lat * 1e5) / 1e5, lo = Math.round(c.lng * 1e5) / 1e5;
          if (!okPos(la, lo)) return toast('この位置は使えません');
          fixedPos[k] = [la, lo];
          if (saveFixedPos()) done('位置を直しました');
        } }, 'この位置にする'))));
  view0.append(pickEl);
  if (mapObj.getZoom() < 16) mapObj.easeTo({ zoom: 16 });
}

// 店の行＋リンク（地図のシート用）。onChange: 行った／まだを切り替えたあと
function placeRow(l, s, onChange, extra, jump) {
  const q = [s.n, areaOf(s)].filter(Boolean).join(' ');
  return h('div', { class: 'mrow' },
    shopRow(l, s, true, onChange, { full: !jump, extra }),
    h('span', { class: 'macts' },
      shopLinks(s),
      jump ? mapLink(s) : null,
      h('a', { class: 'mlink', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), target: '_blank', rel: 'noopener noreferrer' }, '地図アプリ'),
      jump ? null : h('button', { class: 'mlink', type: 'button', onclick: () => startPick(s) }, '位置を直す')));
}
const distM = (a, b) => { const R = 6371000, r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos((a[1] + b[1]) * r / 2), y = (b[1] - a[1]) * r; return Math.sqrt(x * x + y * y) * R; };
const fmtDist = (m) => m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'km';
// いま見えている範囲の店を、現在地（無ければ地図の中央）から近い順に並べたシート。絞り込み（ジャンル・営業中・まだだけ）はそのまま効く
const INVIEW_CAP = 60;
function openInView() {
  if (!mapObj || !mapReady) return;
  closeSheet();
  const b = mapObj.getBounds(), c = mapObj.getCenter();
  const me = myPos && b.contains(myPos) ? myPos : null, ref = me || [c.lng, c.lat];
  const all = [];
  for (const pl of mapPlaces.values()) {
    if (!b.contains([pl.lon, pl.lat])) continue;
    const d = distM(ref, [pl.lon, pl.lat]);
    for (const [l, s] of pl.items) all.push([l, s, d]);
  }
  all.sort((x, y) => x[2] - y[2]);
  const items = all.slice(0, INVIEW_CAP);
  const cnt = h('span', { class: 'count' }), rows = h('div');
  const paint = () => {
    cnt.textContent = all.length > INVIEW_CAP ? `近い ${INVIEW_CAP} 店 / ${all.length} 店` : `${all.length} 店`;
    rows.replaceChildren();
    for (const [l, s, d] of items) rows.append(placeRow(l, s, () => { paint(); refreshPlaces(); }, me ? fmtDist(d) : '', true));
    if (!items.length) rows.append(h('div', { class: 'more' }, 'この範囲に店がありません'));
  };
  paint();
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'この範囲の店' },
    h('div', { class: 'bar' }, h('h2', null, me ? '近い順' : 'この範囲の店'), cnt,
      h('button', { class: 'ibtn', 'aria-label': '閉じる', onclick: closeSheet }, icon('close'))),
    rows);
  sheetEl = h('div', { class: 'sheet-wrap place inview' }, sheet);
  $('#sheet-root').append(sheetEl);
}
// 場所（同じ位置の店）のシート。開いた時点の店を持ち、行った／まだを切り替えたら数と地図を更新する
function openPlace(k) {
  const pl = mapPlaces.get(k);
  if (!pl) return;
  closeSheet();
  const items = pl.items.slice();
  const cnt = h('span', { class: 'count' });
  const rows = h('div');
  const paint = () => {
    let d = 0; for (const [l, s] of items) if (isVisited(l, s)) d++;
    cnt.textContent = `${items.length} 店 ・ 行った ${d}`;
    rows.replaceChildren();
    for (const [l, s] of items) rows.append(placeRow(l, s, () => { paint(); refreshPlaces(); }));
  };
  paint();
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': pl.label },
    h('div', { class: 'bar' }, h('h2', null, pl.label), cnt,
      h('button', { class: 'ibtn', 'aria-label': '閉じる', onclick: closeSheet }, icon('close'))),
    pl.exact ? null : h('p', { class: 'hint pnote' }, pl.coarse ? '町か市までのおおよその位置です（店の正確な場所ではありません）' : '駅の位置です（店の正確な場所ではありません）'),
    rows);
  sheetEl = h('div', { class: 'sheet-wrap place' }, sheet);
  $('#sheet-root').append(sheetEl);
}
window.__meimonOpenPlace = openPlace;

// ---------- 設定・データのシート ----------
let sheetEl = null;
// 区・市ごと／駅ごとの並びを選ぶシート
const SUB_SORTS = [['n', '店の多い順'], ['p', '割合の高い順'], ['r', '残りの少ない順']];
function openSubSort() {
  closeSheet();
  const pick = (k) => { subSort = k; try { localStorage.setItem('meimon.subsort', k); } catch (e) {} closeSheet(); render(); };
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '並び' },
    h('div', { class: 'bar' }, h('h2', null, '並び'),
      h('button', { class: 'ibtn', 'aria-label': '閉じる', onclick: closeSheet }, icon('close'))),
    ...SUB_SORTS.map(([k, label]) => h('button', { class: 'optrow' + (subSort === k ? ' on' : ''), 'aria-pressed': subSort === k ? 'true' : 'false', onclick: () => pick(k) },
      h('span', null, label), h('span', { class: 'mark', 'aria-hidden': 'true' }, subSort === k ? '✓' : ''))));
  sheetEl = h('div', { class: 'sheet-wrap sortsheet' }, sheet);
  sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) closeSheet(); });
  $('#sheet-root').append(sheetEl);
}
function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
function openSheet(focusText) {
  closeSheet();
  const ta = h('textarea', { placeholder: '# 一覧のタイトル\n店名<タブ>都道府県 駅名\n…', maxlength: 2000000, 'aria-label': '取り込む一覧のテキスト', autocomplete: 'off' });
  const txtIn = h('input', { type: 'file', accept: '.txt,text/plain', multiple: true, 'aria-label': 'テキストファイルを選ぶ' });
  const bakIn = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'バックアップファイルを選ぶ' });
  const done = () => { closeSheet(); render(); };
  txtIn.addEventListener('change', async () => {
    const files = [...txtIn.files].slice(0, 20);
    txtIn.value = '';
    let all = '';
    for (const f of files) { try { all += (await readFile(f)) + '\n'; } catch {} }
    if (all.trim() && importText(all)) done();
    else if (!all.trim()) toast('ファイルを読めませんでした');
  });
  bakIn.addEventListener('change', async () => {
    const f = bakIn.files[0]; bakIn.value = '';
    if (!f) return;
    await importBackup(f); done();
  });
  const listBox = h('div');
  const paintLists = () => {
    listBox.replaceChildren();
    for (const l of lists) {
      listBox.append(h('div', { class: 'dlrow' }, h('span', { class: 't' }, `${l.title}（${l.shops.length}）`),
        h('button', { class: 'ibtn', 'aria-label': `${l.title} を削除`, onclick: () => {
          if (!confirm(`「${l.title}」を削除しますか？（行った記録は残ります）`)) return;
          lists = lists.filter(x => x !== l);
          saveAll(); paintLists(); render();
        } }, icon('trash'))));
    }
    if (!lists.length) listBox.append(h('div', { class: 'hint' }, '一覧はありません'));
  };
  paintLists();
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'データ' },
    h('div', { class: 'bar' }, h('h2', null, 'データ'),
      h('button', { class: 'ibtn', 'aria-label': '閉じる', onclick: closeSheet }, icon('close'))),
    h('div', { class: 'sect' }, h('h3', null, '取り込む'), ta,
      h('div', { class: 'rowb' },
        h('button', { class: 'btn', onclick: () => txtIn.click() }, 'ファイルを選ぶ'),
        h('button', { class: 'btn primary', onclick: () => { if (importText(ta.value)) { ta.value = ''; done(); } } }, '取り込む')),
      txtIn),
    h('div', { class: 'sect' }, h('h3', null, 'バックアップ'),
      h('div', { class: 'rowb' },
        h('button', { class: 'btn', onclick: exportBackup }, '書き出す'),
        h('button', { class: 'btn', onclick: () => bakIn.click() }, '読み込む')),
      bakIn),
    h('div', { class: 'sect' }, h('h3', null, 'リストを削除'), listBox),
    h('div', { class: 'sect' }, h('button', { class: 'btn danger block', onclick: () => {
      if (!lists.length && !Object.keys(visited).length) return toast('消すデータはありません');
      if (!confirm('すべての一覧と行った記録を消しますか？')) return;
      lists = []; visited = Object.create(null); fixedPos = Object.create(null); saveFixedPos(); view.list = null;
      saveAll(); toast('すべて消しました'); done();
    } }, 'すべて消す')),
    h('p', { class: 'hint' }, '店の一覧はこの端末の中だけに保存されます'),
    verLine());
  sheetEl = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === sheetEl) closeSheet(); } }, sheet);
  $('#sheet-root').append(sheetEl);
  if (focusText) ta.focus();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// ---------- トースト ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

initTabs();
render();
// 版が変わったら知らせる（初めて開いたときは出さない）
try {
  const prev = localStorage.getItem('meimon.ver');
  if (prev && prev !== APP_VERSION) setTimeout(() => toast(`${APP_VERSION} に更新しました`), 400);
  localStorage.setItem('meimon.ver', APP_VERSION);
} catch (e) {}
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // 前面に戻ったときに新しい版が無いか見に行く
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  // 開いている間に新しい版が入ったら、下に帯を出す（押すと読み直す）
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.querySelector('.upbar')) return;
    document.body.append(h('button', { class: 'upbar', type: 'button', onclick: () => location.reload() }, '新しい版があります ・ 更新'));
  });
}
