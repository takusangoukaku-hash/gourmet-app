// =====================================================
// 百名店チェック: 百名店の一覧を取り込み、行った店をチェックする PWA
//  - 店のデータはアプリに含めない。利用者が貼り付け／ファイルで取り込み、localStorage にだけ保存する
//  - lists: meimon.lists.v1 = [{title, shops:[{n, a}]}]
//  - visited: meimon.visited.v1 = {店名 + '\u0000' + 都道府県: 1}（行った店だけ。一覧をまたいで共通＝
//    年が替わって一覧を貼り替えても、同じ店が別の一覧にあっても「行った」が残る）
//  - 取り込んだ文字は textContent / DOM API だけで入れる（innerHTML に入れない）
// =====================================================
const APP_VERSION = 'v1';
const LISTS_KEY = 'meimon.lists.v1';
const VISITED_KEY = 'meimon.visited.v1';
const MAX_NAME = 100, MAX_AREA = 60, MAX_TITLE = 60, MAX_SHOPS = 20000, MAX_KEY = 300;
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
const cap = (s, n) => String(s).slice(0, n);

// ---------- データ ----------
let lists = loadLists();
let visited = loadVisited();
let normCache = new WeakMap(); // shop -> 検索用の文字

function cleanList(l) {
  if (!l || typeof l.title !== 'string' || !Array.isArray(l.shops)) return null;
  const shops = [];
  for (const s of l.shops) {
    if (!s || typeof s.n !== 'string' || !s.n.trim()) continue;
    shops.push({ n: cap(s.n, MAX_NAME), a: typeof s.a === 'string' ? cap(s.a, MAX_AREA) : '' });
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
// "# タイトル" で一覧を始め、ほかの行は「店名<TAB>エリア」。# より前の店は「リスト」へ
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
    const i = line.indexOf('\t');
    const n = cap((i < 0 ? line : line.slice(0, i)).trim(), MAX_NAME);
    const a = i < 0 ? '' : cap(line.slice(i + 1).trim(), MAX_AREA);
    if (!n) continue;
    if (!cur) start(DEFAULT_TITLE);
    cur.shops.push({ n, a });
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
  const data = { app: 'meimon', version: 1, lists, visited: Object.assign({}, visited) };
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
      shops.push({ n: cap(s.n, MAX_NAME), a: cap(s.a, MAX_AREA) });
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
  return { lists: ls, visited: vis };
}
async function importBackup(file) {
  let data = null;
  try { data = validateBackup(JSON.parse(await readFile(file))); } catch {}
  if (!data) { toast('バックアップの形式が正しくありません'); return; }
  const before = lists.slice();
  const r = mergeLists(data.lists);
  if (data.lists.length && !r.lists) { toast('店が多すぎて読み込めませんでした'); lists = before; return; }
  for (const k of data.visited) visited[k] = 1;
  if (saveAll()) toast(`${r.lists} リスト・${r.shops} 店を読み込みました`);
}

// ---------- 画面の状態 ----------
const view = { list: null, status: 'all', pref: '', q: '' }; // list: タイトル（詳細を開いているとき）
let homeQ = '';

const app = $('#app');
function render() {
  app.replaceChildren();
  if (view.list != null && lists.some(l => l.title === view.list)) renderDetail();
  else { view.list = null; renderHome(); }
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

// 店の行（タップで行った／まだ）
function shopRow(l, s, withTitle, after) {
  const on = isVisited(l, s);
  const row = h('button', { class: 'srow' + (on ? ' done' : ''), 'aria-pressed': on ? 'true' : 'false' },
    h('span', { class: 'tx' },
      h('div', { class: 'nm' }, s.n),
      (s.a || withTitle) ? h('div', { class: 'ar' }, withTitle ? [l.title, s.a].filter(Boolean).join(' ・ ') : s.a) : null),
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
window.addEventListener('popstate', () => { if (view.list != null) { view.list = null; render(); } });

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
    for (const s of list.slice(0, LIST_CAP)) frag.append(shopRow(l, s, false, paintRows));
    rows.append(frag);
    if (list.length > LIST_CAP) rows.append(h('div', { class: 'more' }, `ほか ${list.length - LIST_CAP} 件`));
    else if (!list.length) rows.append(h('div', { class: 'more' }, '該当する店がありません'));
  }
  paintChips(); paintRows();
}

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
      lists = []; visited = Object.create(null); view.list = null;
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

render();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
