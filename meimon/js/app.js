// =====================================================
// 百名店チェック: 百名店の一覧を取り込み、行った店をチェックする PWA
//  - 店のデータはアプリに含めない。利用者が貼り付け／ファイルで取り込み、localStorage にだけ保存する
//  - lists: meimon.lists.v1 = [{title, shops:[{n, a, p?, c?, x?, u?, h?}]}]（u: 店のページの URL、h: 定休日の文）（p: [緯度, 経度]。x: 1＝店の位置、何も無ければ駅の位置、c: 1＝市の中心のおおよその位置）
//  - visited: meimon.visited.v1 = {店名 + '\u0000' + 都道府県: 1}（行った店だけ。一覧をまたいで共通＝
//    年が替わって一覧を貼り替えても、同じ店が別の一覧にあっても「行った」が残る）
//  - 取り込んだ文字は textContent / DOM API だけで入れる（innerHTML に入れない）
// =====================================================
const APP_VERSION = 'v8';
const LISTS_KEY = 'meimon.lists.v1';
const VISITED_KEY = 'meimon.visited.v1';
const POS_KEY = 'meimon.pos.v1'; // 自分で直した店の位置 {店名 + '\u0000' + 都道府県: [緯度, 経度]}（一覧の位置より優先。貼り替えても残る）
const MAX_NAME = 100, MAX_AREA = 60, MAX_TITLE = 60, MAX_SHOPS = 20000, MAX_KEY = 300, MAX_HOL = 60;
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
function cleanPos(s) {
  const out = okUrl(s && s.u) ? { u: s.u } : {};
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
const view = { list: null, status: 'all', pref: '', q: '', map: false, mg: '', mt: false }; // list: タイトル（詳細を開いているとき）／map: 地図を開いているとき（mg: ジャンル、mt: まだだけ）
let homeQ = '';

const app = $('#app');
function render() {
  leaveMap();
  app.replaceChildren();
  if (view.map) renderMap();
  else if (view.list != null && lists.some(l => l.title === view.list)) renderDetail();
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
    h('button', { class: 'tab', type: 'button', 'data-open': 'list', onclick: () => { closeSheet(); view.map = false; view.list = null; render(); window.scrollTo(0, 0); } }, icon('list'), h('span', null, 'リスト')),
    h('button', { class: 'tab', type: 'button', 'data-open': 'map', onclick: () => { if (view.map) return; closeSheet(); openMap(); } }, icon('map'), h('span', null, '地図')));
}

// 一覧のジャンル（末尾の西暦4桁と地域の語を除く）
function genreOf(title) {
  let t = title.trim();
  for (let i = 0; i < 2; i++) {
    t = t.replace(/\s*\d{4}$/, '').replace(/\s*(TOKYO|EAST|WEST|HOKKAIDO|KANAGAWA|AICHI|OSAKA|KAGAWA)$/, '');
  }
  return t.trim() || title;
}
function prefOf(a) { return String(a || '').trim().split(/\s+/)[0] || ''; }

// ---------- ホーム ----------
let homeBody = null;
function renderHome() {
  const all = totalShops();
  let done = 0; for (const l of lists) done += doneCount(l);
  const wrap = h('div', { class: 'wrap' });
  wrap.append(h('div', { class: 'bar' },
    h('h1', null, '百名店チェック'),
    h('button', { class: 'btn small', 'data-open': 'data', onclick: () => openSheet() }, 'データ')));
  if (!lists.length) {
    wrap.append(h('div', { class: 'empty' }, h('p', null, 'まだ一覧がありません'),
      h('button', { class: 'btn primary', onclick: () => openSheet(true) }, '一覧を取り込む')));
    app.append(wrap); homeBody = null; return;
  }
  const sum = h('div', { class: 'summary' },
    h('div', { class: 'big' }, `行った ${done}`, h('small', null, `/ 全 ${all}`)),
    progress(done, all));
  const q = h('input', { class: 'search', type: 'search', placeholder: '店名・エリアを全リストから探す', maxlength: 100, 'aria-label': '店を探す', value: homeQ, autocomplete: 'off' });
  q.value = homeQ;
  q.addEventListener('input', () => { homeQ = q.value; renderHomeBody(); });
  homeBody = h('div');
  wrap.append(sum, q, homeBody);
  app.append(wrap);
  renderHomeBody();
}
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
        h('div', { class: 'top' }, h('span', { class: 't' }, l.title), h('span', { class: 'count' }, `${d} / ${l.shops.length}`)),
        progress(d, l.shops.length)));
    }
  }
}
function updateSummary() {
  const big = app.querySelector('.summary');
  if (!big) return;
  let done = 0; for (const l of lists) done += doneCount(l);
  const all = totalShops();
  big.replaceWith(h('div', { class: 'summary' },
    h('div', { class: 'big' }, `行った ${done}`, h('small', null, `/ 全 ${all}`)), progress(done, all)));
}

// 定休日: 「月曜日、日曜日」のような文から、毎週休む曜日（0=日〜6=土）を拾う。
// 「第3月曜日」「祝日」「不定休」は拾わない（その日が休みか決められないので、休みとは言わない）
const WD = '日月火水木金土';
function closedDays(hText) {
  const out = new Set();
  for (const raw of String(hText || '').split(/[、,，・\/／\s]+/)) {
    const m = raw.replace(/^毎週/, '').match(/^([日月火水木金土])(曜日?)?(定休|休み?)?$/);
    if (m) out.add(WD.indexOf(m[1]));
  }
  return out;
}
const today = () => new Date().getDay();
const closedToday = (s) => !!s.h && closedDays(s.h).has(today());

// 店のページ（食べログ）を開くリンク
const pageLink = (s) => h('a', { class: 'mlink', href: s.u, target: '_blank', rel: 'noopener noreferrer' }, '食べログ');

// 店の行（タップで行った／まだ）
function shopRow(l, s, withTitle, after) {
  const on = isVisited(l, s);
  const row = h('button', { class: 'srow' + (on ? ' done' : ''), 'aria-pressed': on ? 'true' : 'false' },
    h('span', { class: 'tx' },
      h('div', { class: 'nm' }, s.n),
      (s.a || withTitle) ? h('div', { class: 'ar' }, withTitle ? [l.title, s.a].filter(Boolean).join(' ・ ') : s.a) : null,
      s.h ? h('div', { class: 'ar hol' }, closedToday(s) ? h('span', { class: 'off' }, '今日は定休日') : null, closedToday(s) ? ' ・ ' : null, '定休 ' + s.h) : null),
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
  view.list = title; view.status = 'all'; view.pref = ''; view.q = '';
  try { history.pushState({ d: 1 }, ''); } catch {}
  render(); window.scrollTo(0, 0);
}
function closeList() {
  if (history.state && history.state.d) history.back();
  else { view.list = null; render(); }
}
window.addEventListener('popstate', () => { if (!view.map && view.list != null) { view.list = null; render(); } });

function renderDetail() {
  const l = lists.find(x => x.title === view.list);
  const wrap = h('div', { class: 'wrap' });
  const cnt = h('span', { class: 'count' });
  const prog = h('div');
  wrap.append(h('div', { class: 'bar' },
    h('button', { class: 'ibtn', 'aria-label': '戻る', onclick: closeList }, icon('back')),
    h('h2', null, l.title), cnt));
  wrap.append(prog);
  const chips = h('div', { class: 'filters' });
  for (const [k, label] of [['all', 'すべて'], ['todo', 'まだ'], ['done', '行った']]) {
    const c = h('button', { class: 'chip', onclick: () => { view.status = k; paintChips(); paintRows(); } }, label);
    c.dataset.k = k; chips.append(c);
  }
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
  const q = h('input', { type: 'search', placeholder: '店名・エリア', maxlength: 100, 'aria-label': '絞り込み', autocomplete: 'off' });
  q.addEventListener('input', () => { view.q = q.value; paintRows(); });
  fx.append(q);
  wrap.append(fx);
  const rows = h('div');
  wrap.append(rows);
  app.append(wrap);

  function paintChips() { for (const c of chips.children) c.className = 'chip' + (c.dataset.k === view.status ? ' on' : ''); }
  function paintHead() {
    const d = doneCount(l);
    cnt.textContent = `${d} / ${l.shops.length}`;
    prog.replaceChildren(progress(d, l.shops.length));
  }
  function paintRows() {
    paintHead();
    const nq = norm(view.q);
    const list = [];
    for (const s of l.shops) {
      if (view.status !== 'all' && (view.status === 'done') !== isVisited(l, s)) continue;
      if (view.pref && prefOf(s.a) !== view.pref) continue;
      if (nq && !shopNorm(s).includes(nq)) continue;
      list.push(s);
    }
    rows.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const s of list.slice(0, LIST_CAP)) frag.append(s.u ? h('div', { class: 'mrow' }, shopRow(l, s, false, paintRows), pageLink(s)) : shopRow(l, s, false, paintRows));
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
    let d = 0, off = 0; for (const [l, s] of pl.items) { if (isVisited(l, s)) d++; if (closedToday(s)) off++; }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [pl.lon, pl.lat] },
      properties: { k: pl.k, n, d, todo: n - d, c: pl.coarse ? 1 : 0, x: pl.exact ? 1 : 0, off: off === n ? 1 : 0, label: pl.label } });
  }
  const fc = { type: 'FeatureCollection', features };
  window.__meimonPlaces = fc;
  return fc;
}
function refreshPlaces() {
  const fc = placesData();
  if (mapObj && mapReady) mapObj.getSource('places').setData(fc);
}

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
  const box = h('div', { class: 'mapbox' });
  const fail = h('div', { class: 'mapfail', hidden: true });
  app.append(h('div', { class: 'mapview' }, box, fail,
    h('div', { class: 'maplegend', 'aria-hidden': 'true' }, h('i', { class: 'lg off' }), '今日は定休日'),
    h('div', { class: 'mapbar' }, sel, chip)));
  startMap(box, fail);
}
function startMap(box, fail) {
  const token = ++mapToken;
  fail.hidden = true; fail.replaceChildren();
  loadMapLib().then(() => {
    if (token !== mapToken) return;
    const fc = placesData();
    const dark = !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const opt = { container: box, style: baseMapStyle(dark), attributionControl: { compact: true }, dragRotate: false };
    if (lastCam) { opt.center = lastCam.center; opt.zoom = lastCam.zoom; }
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
    startGeo(!lastCam);
    map.on('error', () => {}); // 文字（グリフ）やタイルが読めなくても地図は止めない
    map.on('load', () => {
      if (token !== mapToken) return;
      map.addSource('places', { type: 'geojson', data: fc, cluster: true, clusterRadius: 44, clusterMaxZoom: 13,
        clusterProperties: { n: ['+', ['get', 'n']], todo: ['+', ['get', 'todo']] } });
      const isCl = ['has', 'point_count'];
      const txt = { 'text-field': ['to-string', ['get', 'n']], 'text-font': FONT, 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true };
      const txtPaint = { 'text-color': '#ffffff' };
      map.addLayer({ id: 'clusters', type: 'circle', source: 'places', filter: isCl,
        paint: { 'circle-color': PIN_COLOR, 'circle-radius': ['step', ['get', 'n'], 16, 10, 20, 30, 25], 'circle-opacity': .85, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'cluster-n', type: 'symbol', source: 'places', filter: isCl, layout: txt, paint: txtPaint });
      map.addLayer({ id: 'places-pt', type: 'circle', source: 'places', filter: ['!', isCl],
        paint: { 'circle-color': ['case', ['==', ['get', 'off'], 1], '#ffffff', ['>', ['get', 'todo'], 0], PIN_COLOR, PIN_DONE], 'circle-radius': ['case', ['==', ['get', 'x'], 1], 8, 11],
          'circle-opacity': ['case', ['==', ['get', 'off'], 1], .9, ['==', ['get', 'c'], 1], .5, ['==', ['get', 'x'], 1], 1, .8],
          // 今日が定休日の店（同じ位置の店が全部休み）は白抜き。縁の色が 行った／まだ
          'circle-stroke-color': ['case', ['==', ['get', 'off'], 1], ['case', ['>', ['get', 'todo'], 0], PIN_COLOR, PIN_DONE], '#ffffff'],
          'circle-stroke-width': ['case', ['==', ['get', 'off'], 1], 3, 2] } });
      map.addLayer({ id: 'places-n', type: 'symbol', source: 'places', filter: ['all', ['!', isCl], ['>', ['get', 'n'], 1]], layout: txt,
        paint: { 'text-color': ['case', ['==', ['get', 'off'], 1], PIN_COLOR, '#ffffff'] } });
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
    for (const [l, s] of items) {
      const q = [s.n, areaOf(s)].filter(Boolean).join(' ');
      rows.append(h('div', { class: 'mrow' },
        shopRow(l, s, true, () => { paint(); refreshPlaces(); }),
        h('span', { class: 'macts' },
          s.u ? pageLink(s) : null,
          h('a', { class: 'mlink', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), target: '_blank', rel: 'noopener noreferrer' }, '地図アプリ'),
          h('button', { class: 'mlink', type: 'button', onclick: () => startPick(s) }, '位置を直す'))));
    }
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
    h('div', { class: 'ver' }, `百名店チェック ${APP_VERSION}`));
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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
