// =====================================================
// 日程あわせ（yotei/）
//  幹事が期間を決めてリンクを作り、各自がカレンダーのスクショを上げると、行ける人が多い日が分かる。
//  - スクショは読み取り（Cloudflare Worker の /calendar → Claude）にだけ使い、どこにも保存しない
//  - 予定の題は自分の画面の中だけ。共有されるのは 名前 と 日ごとの o／t／x／q（行ける・微妙・行けない・不明）
//  - 共有の置き場は Firestore（plans/{id} と plans/{id}/answers/{pid}）。ログインなし・SDK なしで REST を直接呼ぶ
//  - 他人が入れた文字は textContent でだけ画面に入れる
// =====================================================
(() => {
'use strict';
const APP_VERSION = 'v2';
const PROXY = 'https://bitemap-search.takusangoukaku.workers.dev';
const FS = 'https://firestore.googleapis.com/v1/projects/gourmet-app-62586/databases/(default)/documents';
const MAX_DAYS = 92;      // 期間の上限（Firestore のルールの days は 100 文字まで）
const MAX_SHOTS = 12;     // 1回に読むスクショの上限
const SHOT_LONG = 1568;   // 送る画像の長辺
const ID_RE = /^[a-z0-9]{20,40}$/;

// ---- 小物 ----
const $ = (s, r) => (r || document).querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}
const svg = (d) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p);
  return s;
};
// replaceChildren は null を「null」という文字にするので、無いものを除いてから入れる
const setKids = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
const IC_BACK = 'M15 5l-7 7 7 7', IC_RELOAD = 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5';
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } },
};
function randId(n) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789', b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = ''; for (let i = 0; i < n; i++) s += a[b[i] % 36];
  return s;
}

// ---- 日付 ----
const pad = (n) => String(n).padStart(2, '0');
const ymd = (dt) => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
function parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? d : null;
}
const addDays = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
const diffDays = (a, b) => Math.round((b - a) / 86400000);
const WD = '日月火水木金土';
const fmt = (dt) => (dt.getMonth() + 1) + '月' + dt.getDate() + '日(' + WD[dt.getDay()] + ')';
const fmtS = (s) => { const d = parse(s); return d ? fmt(d) : ''; };
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
function planDays(plan) {
  const a = parse(plan.start), n = diffDays(a, parse(plan.end)) + 1, out = [];
  for (let i = 0; i < n; i++) out.push(ymd(addDays(a, i)));
  return out;
}

// 祝日（国民の祝日・振替休日・国民の休日）。meimon/ と同じ計算
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
  for (const k of [...set]) {
    const [m, d] = k.split('-').map(Number); const dt = new Date(y, m - 1, d);
    if (dt.getDay() !== 0) continue;
    do dt.setDate(dt.getDate() + 1); while (has(dt));
    if (dt.getFullYear() === y) add(dt.getMonth() + 1, dt.getDate());
  }
  for (const k of [...set]) {
    const [m, d] = k.split('-').map(Number);
    const mid = new Date(y, m - 1, d + 1), nx = new Date(y, m - 1, d + 2);
    if (!has(mid) && has(nx) && mid.getDay() !== 0) add(mid.getMonth() + 1, mid.getDate());
  }
  holCache.set(y, set);
  return set;
}
const isHoliday = (dt) => holidaysOf(dt.getFullYear()).has((dt.getMonth() + 1) + '-' + dt.getDate());

// ---- Firestore（REST）----
const enc = (o) => { const f = {}; for (const k in o) f[k] = typeof o[k] === 'number' ? { integerValue: String(Math.round(o[k])) } : { stringValue: String(o[k]) }; return { fields: f }; };
function dec(doc) {
  const o = {}, f = (doc && doc.fields) || {};
  for (const k in f) {
    const v = f[k];
    o[k] = 'integerValue' in v ? Number(v.integerValue) || 0 : 'doubleValue' in v ? Number(v.doubleValue) || 0 : 'stringValue' in v ? String(v.stringValue) : null;
  }
  return o;
}
async function fsReq(method, path, body) {
  const res = await fetch(FS + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 404) return null;
  if (!res.ok) { const e = new Error('fs ' + res.status); e.status = res.status; throw e; }
  return method === 'DELETE' ? {} : res.json();
}
// 他人が書いた文書は形を確かめてから使う
function cleanPlan(o) {
  if (!o) return null;
  const a = parse(o.start), b = parse(o.end);
  if (!a || !b || b < a || diffDays(a, b) + 1 > MAX_DAYS) return null;
  return { title: String(o.title || '').slice(0, 60) || '予定', start: o.start, end: o.end };
}
const Db = {
  createPlan: (id, p) => fsReq('POST', '/plans?documentId=' + id, enc({ title: p.title, start: p.start, end: p.end, createdAt: Date.now() })),
  async getPlan(id) { return cleanPlan(dec(await fsReq('GET', '/plans/' + id))); },
  async listAnswers(id, n) {
    const r = await fsReq('GET', '/plans/' + id + '/answers?pageSize=100');
    return ((r && r.documents) || []).map(d => {
      const o = dec(d), pid = String(d.name || '').split('/').pop();
      const days = String(o.days || '').replace(/[^otxq]/g, 'q').slice(0, n).padEnd(n, 'q');
      return { pid, name: String(o.name || '').slice(0, 20) || '名前なし', days, at: Number(o.at) || 0 };
    }).filter(a => /^[a-z0-9]{16,40}$/.test(a.pid)).sort((a, b) => a.at - b.at);
  },
  putAnswer: (id, pid, a) => fsReq('PATCH', '/plans/' + id + '/answers/' + pid, enc({ name: a.name, days: a.days, at: Date.now() })),
  delAnswer: (id, pid) => fsReq('DELETE', '/plans/' + id + '/answers/' + pid),
};

// ---- この端末の控え ----
// yotei.plans: 開いたことのある予定 [{id, title, start, end, pid, at}]（pid＝この端末が出した答えの id）
function recent() { const v = ls.get('yotei.plans', []); return Array.isArray(v) ? v.filter(p => p && ID_RE.test(p.id)) : []; }
function remember(id, plan, pid) {
  const list = recent(), old = list.find(p => p.id === id) || {};
  const item = { id, title: plan.title, start: plan.start, end: plan.end, pid: pid === undefined ? (old.pid || '') : pid, at: Date.now() };
  ls.set('yotei.plans', [item, ...list.filter(p => p.id !== id)].slice(0, 20));
}
const myPid = (id) => (recent().find(p => p.id === id) || {}).pid || '';
function deviceId() { let d = ls.get('yotei.device', ''); if (!/^[a-z0-9]{16,40}$/.test(d)) { d = randId(24); ls.set('yotei.device', d); } return d; }

// ---- 共有 ----
async function share(text, url) {
  if (navigator.share) {
    try { await navigator.share(url ? { text, url } : { text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const all = url ? text + '\n' + url : text;
  try { await navigator.clipboard.writeText(all); toast('コピーしました'); }
  catch { window.prompt('コピーしてください', all); }
}
const planUrl = (id) => location.origin + location.pathname + '?p=' + id;

// ---- 画面の切り替え ----
const app = $('#app');
let cur = { id: '', plan: null, answers: [] };
let ans = null; // 入力中の答え（下の newAnswer）
function go(id, replace) {
  const url = id ? '?p=' + id : location.pathname;
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  route();
}
function route() {
  ans = null;
  const id = new URLSearchParams(location.search).get('p') || '';
  window.scrollTo(0, 0);
  if (ID_RE.test(id)) showPlan(id); else showHome();
}
window.addEventListener('popstate', route);

// ---- ホーム: 予定をつくる ----
function showHome() {
  cur = { id: '', plan: null, answers: [] };
  const t0 = addDays(today(), 1);
  const fTitle = h('input', { id: 'f-title', maxlength: 60, placeholder: '夏の旅行', autocomplete: 'off' });
  const fStart = h('input', { id: 'f-start', type: 'date', value: ymd(t0) });
  const fEnd = h('input', { id: 'f-end', type: 'date', value: ymd(addDays(t0, 60)) });
  const btn = h('button', { class: 'btn primary big', type: 'submit', text: 'リンクをつくる' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const title = fTitle.value.trim(), a = parse(fStart.value), b = parse(fEnd.value);
    if (!title) { shake(fTitle); toast('予定の名前を入れてください'); return; }
    if (!a || !b || b < a) { shake(fEnd); toast('期間を確かめてください'); return; }
    if (diffDays(a, b) + 1 > MAX_DAYS) { shake(fEnd); toast('期間は ' + MAX_DAYS + ' 日までです'); return; }
    btn.disabled = true;
    const id = randId(24), plan = { title, start: ymd(a), end: ymd(b) };
    try {
      await Db.createPlan(id, plan);
      remember(id, plan);
      go(id);
      toast('リンクができました ・ 「リンクを送る」で友達へ');
    } catch (err) { btn.disabled = false; toast('つくれませんでした ・ 通信を確かめてください'); }
  } },
    h('label', { class: 'field' }, h('span', { text: '予定の名前' }), fTitle),
    h('div', { class: 'row2' },
      h('label', { class: 'field' }, h('span', { text: 'いつから' }), fStart),
      h('label', { class: 'field' }, h('span', { text: 'いつまで' }), fEnd)),
    btn);
  const list = recent();
  app.replaceChildren(h('div', { class: 'wrap' },
    h('header', { class: 'bar' }, h('h1', { text: '日程あわせ' })),
    form,
    list.length ? h('h2', { class: 'sec', text: '最近の予定' }) : null,
    list.length ? h('div', { class: 'recent' }, list.map(p => h('button', { type: 'button', onclick: () => go(p.id) },
      h('b', { text: p.title }), h('small', { text: fmtS(p.start) + ' 〜 ' + fmtS(p.end) + (p.pid ? ' ・ 回答済み' : '') })))) : null,
  ));
}

// ---- 月の格子（結果と確認で共通）----
// cellOf(dayStr, dt) は {cls, mark, attrs, dots, onclick} を返す
function monthGrids(plan, cellOf) {
  const a = parse(plan.start), b = parse(plan.end), out = [];
  for (let m = new Date(a.getFullYear(), a.getMonth(), 1); m <= b; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const grid = h('div', { class: 'grid' }, [...WD].map(w => h('div', { class: 'wd', text: w })));
    for (let i = 0; i < m.getDay(); i++) grid.append(h('div'));
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const dt = new Date(m.getFullYear(), m.getMonth(), d), s = ymd(dt);
      const base = (dt.getDay() === 0 ? ' sun' : '') + (isHoliday(dt) ? ' hol' : '');
      if (dt < a || dt > b) { grid.append(h('div', { class: 'cell out' + base }, h('span', { class: 'd', text: d }))); continue; }
      const c = cellOf(s, dt);
      const cell = h('button', Object.assign({ type: 'button', class: 'cell ' + c.cls + base, 'data-day': s, 'aria-label': fmt(dt) + ' ' + (c.label || ''), onclick: c.onclick }, c.attrs || {}),
        h('span', { class: 'd', text: d }), h('span', { class: 'm', text: c.mark || '' }));
      if (c.style) cell.style.cssText = c.style;
      if (c.dots && c.dots.length) cell.append(h('span', { class: 'dots' }, c.dots.slice(0, 3).map(col => { const i = h('i'); i.style.background = col; return i; })));
      grid.append(cell);
    }
    out.push(h('section', { class: 'month' }, h('h3', { text: m.getFullYear() + '年' + (m.getMonth() + 1) + '月' }), grid));
  }
  return out;
}

// ---- 予定の画面: 結果 ----
function tally(plan, answers) {
  return planDays(plan).map((day, i) => {
    const r = { day, o: [], t: [], x: [], q: [] };
    for (const a of answers) r[a.days[i] || 'q'].push(a.name);
    r.score = r.o.length + r.t.length * 0.5;
    return r;
  });
}
const countsText = (r) => ['○' + r.o.length, r.t.length ? '△' + r.t.length : '', r.x.length ? '×' + r.x.length : '', r.q.length ? '不明' + r.q.length : ''].filter(Boolean).join(' ');
function ranked(rows) {
  const t = ymd(today());
  return rows.filter(r => r.day >= t && r.score > 0)
    .sort((p, q) => q.score - p.score || p.x.length - q.x.length || p.q.length - q.q.length || (p.day < q.day ? -1 : 1));
}
let lastLoad = 0;
async function showPlan(id, keepScroll) {
  const y = window.scrollY;
  if (cur.id !== id) { cur = { id, plan: null, answers: [] }; app.replaceChildren(h('div', { class: 'wrap' }, h('p', { class: 'empty', text: '読み込み中…' }))); }
  let plan, answers;
  try {
    plan = cur.plan || await Db.getPlan(id);
    if (!plan) {
      app.replaceChildren(h('div', { class: 'wrap' }, h('p', { class: 'empty', text: 'この予定は見つかりません' }),
        h('button', { class: 'btn big', type: 'button', text: '新しくつくる', onclick: () => go('') })));
      return;
    }
    answers = await Db.listAnswers(id, planDays(plan).length);
  } catch (e) {
    app.replaceChildren(h('div', { class: 'wrap' }, h('p', { class: 'empty', text: '読み込めませんでした' }),
      h('button', { class: 'btn big', type: 'button', text: '読み直す', onclick: () => showPlan(id) })));
    return;
  }
  if (new URLSearchParams(location.search).get('p') !== id || ans) return; // 待つ間に別の画面へ移った
  lastLoad = Date.now();
  cur = { id, plan, answers };
  let pid = myPid(id);
  if (pid && !answers.some(a => a.pid === pid)) pid = ''; // 消されていた
  remember(id, plan, pid);
  const rows = tally(plan, answers), n = answers.length, top = ranked(rows).slice(0, 8);
  // 濃淡の段階は回答した人数から決める（○の人数が 9割以上／7割以上／5割以上／それ未満）
  const T = [0.9, 0.7, 0.5].map(k => Math.max(1, Math.ceil(n * k)));
  const tierOf = (r) => { const o = r.o.length; return o >= T[0] ? 1 : o >= T[1] ? 2 : o >= T[2] ? 3 : 4; };
  const range = (a, b) => (a === b ? a : a + '–' + b) + '人';
  const legend = [[1, T[0], n], [2, T[1], T[0] - 1], [3, T[2], T[1] - 1], [4, 0, T[2] - 1]].filter(x => x[1] <= x[2]);
  const detail = h('div', { class: 'pday', id: 'p-detail' });
  function showDay(day) {
    const r = rows.find(x => x.day === day); if (!r) return;
    document.querySelectorAll('.cell.sel, .top.sel').forEach(c => c.classList.remove('sel'));
    document.querySelectorAll('[data-day="' + day + '"]').forEach(c => c.classList.add('sel'));
    const cnt = (mark, k, label) => h('div', { class: 'pc ' + k + (r[k].length ? '' : ' zero') },
      h('span', { class: 'pc-m', text: mark }), h('b', { text: r[k].length + '人' }), h('small', { text: label }));
    const who = (mark, names) => names.length ? h('div', { class: 'pday-who' }, h('span', { text: mark + ' ' }), h('span', { class: 'who', text: names.join('、') })) : null;
    setKids(detail, 
      h('div', { class: 'pday-top' },
        h('span', { class: 'pday-num t' + tierOf(r), text: parse(day).getDate() }),
        h('div', { class: 'pday-main' }, h('b', { text: fmtS(day) }), h('span', { class: 'who', text: r.o.length + '人が行ける ・ 回答 ' + n + '人' }))),
      h('div', { class: 'pday-counts' }, cnt('○', 'o', '行ける'), cnt('△', 't', '微妙'), cnt('×', 'x', '行けない'), cnt('？', 'q', '不明')),
      who('△', r.t), who('×', r.x), who('不明', r.q));
  }
  const grids = n ? monthGrids(plan, (day) => {
    const r = rows.find(x => x.day === day);
    return { cls: 'heat t' + tierOf(r), mark: '', label: countsText(r), onclick: () => showDay(day) };
  }) : [];
  app.replaceChildren(h('div', { class: 'wrap' },
    h('header', { class: 'bar' },
      h('button', { class: 'ibtn', type: 'button', 'aria-label': '予定の一覧へ', onclick: () => go('') }, svg(IC_BACK)),
      h('h1', { text: plan.title }),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': '読み直す', onclick: () => showPlan(id, true) }, svg(IC_RELOAD))),
    h('p', { class: 'sub', text: fmtS(plan.start) + ' 〜 ' + fmtS(plan.end) }),
    h('button', { class: 'btn primary big', id: 'p-answer', type: 'button', text: pid ? '自分の答えを直す' : 'カレンダーのスクショで答える', onclick: () => startAnswer(pid) }),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', id: 'p-share', type: 'button', text: 'リンクを送る', onclick: () => share('「' + plan.title + '」の日程あわせ ・ カレンダーのスクショで答えられます', planUrl(id)) }),
      top.length ? h('button', { class: 'btn', id: 'p-cands', type: 'button', text: '候補を送る', onclick: () =>
        share('「' + plan.title + '」の候補（' + n + '人が回答）\n' + top.slice(0, 5).map(r => fmtS(r.day) + ' ' + countsText(r)).join('\n')) }) : null),
    h('h2', { class: 'sec', text: '回答 ' + n + '人' }),
    n ? h('div', { class: 'chips' }, answers.map(a => h('span', { class: 'chip' + (a.pid === pid ? ' me' : ''), text: a.name })))
      : h('p', { class: 'empty', text: 'まだ答えがありません' }),
    top.length ? h('h2', { class: 'sec', text: '行ける人が多い日' }) : null,
    top.length ? h('div', { class: 'tops', id: 'p-tops' }, top.map(r => {
      const d = parse(r.day);
      return h('button', { class: 'top t' + tierOf(r), type: 'button', 'data-day': r.day, 'aria-label': fmtS(r.day) + ' ' + countsText(r), onclick: () => showDay(r.day) },
        h('b', { text: (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')' }), h('small', { text: r.o.length + '人' }));
    })) : null,
    n ? h('div', { class: 'tlegend', id: 'p-legend' }, legend.map(x => h('span', {}, h('i', { class: 't' + x[0] }), range(x[1], x[2])))) : null,
    grids, n ? detail : null,
  ));
  if (n) showDay(top.length ? top[0].day : rows[0].day);
  if (keepScroll) window.scrollTo(0, y);
}
// 前面に戻ったら読み直す（ほかの人の答えを拾う）
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && cur.id && cur.plan && !ans && Date.now() - lastLoad > 30000) showPlan(cur.id, true);
});

// ---- 答える ----
const COLORS = {
  red: ['赤', '#D9534F'], orange: ['オレンジ', '#F0923B'], yellow: ['黄', '#E3B92C'], green: ['緑', '#4FA36B'], blue: ['青', '#4C9BD9'],
  purple: ['紫', '#B04AD6'], pink: ['ピンク', '#E06C9F'], brown: ['茶', '#8D6748'], gray: ['灰', '#8E8E93'], other: ['その他', '#9AA0A6'],
};
const HOL_TITLE = /の日$|休日$|^元日$|記念日$/;
function newAnswer(pid) {
  const mine = pid ? cur.answers.find(a => a.pid === pid) : null;
  return {
    pid: pid || '', name: mine ? mine.name : String(ls.get('yotei.name', '') || '').slice(0, 20),
    saved: mine ? mine.days : '',            // 前に送った答え（スクショに写っていない日の代わり）
    shots: [], cover: new Set(), byDay: new Map(),
    rules: Object.assign({}, ls.get('yotei.colors', {})), // 色 → o／t／x（端末に覚える）
    over: {},                                 // 日 → 手で決めた値
    manual: !!mine,                           // スクショなしで格子へ進む
    busy: '', sel: '',
  };
}
function startAnswer(pid) { ans = newAnswer(pid); window.scrollTo(0, 0); renderAnswer(); }
function rebuild() {
  ans.cover = new Set(); ans.byDay = new Map();
  for (const s of ans.shots) {
    const a = parse(s.first), n = diffDays(a, parse(s.last)) + 1;
    for (let i = 0; i < n; i++) ans.cover.add(ymd(addDays(a, i)));
    for (const ev of s.events) {
      const from = ev.start < s.first ? s.first : ev.start, to = ev.end > s.last ? s.last : ev.end;
      for (let d = parse(from), e = parse(to); d && e && d <= e; d = addDays(d, 1)) {
        const day = ymd(d), list = ans.byDay.get(day) || [];
        const hol = ev.holiday || (isHoliday(d) && HOL_TITLE.test(ev.title));
        if (!list.some(x => x.title === ev.title && (x.color === ev.color || (hol && x.hol)))) list.push({ title: ev.title, color: ev.color, hol });
        ans.byDay.set(day, list);
      }
    }
  }
}
const realEvents = (day) => (ans.byDay.get(day) || []).filter(e => !e.hol);
function statusOf(day, i) {
  if (ans.over[day]) return ans.over[day];
  if (ans.cover.has(day)) {
    let s = 'o';
    for (const e of realEvents(day)) { const r = ans.rules[e.color] || 't'; if (r === 'x') return 'x'; if (r === 't') s = 't'; }
    return s;
  }
  const sv = ans.saved[i];
  if (sv === 'o' || sv === 't' || sv === 'x') return sv;
  return ans.manual && !ans.shots.length && !ans.saved ? 'o' : 'q';
}
const MARK = { o: '○', t: '△', x: '×', q: '？' }, LABEL = { o: '行ける', t: '微妙', x: '行けない', q: '不明' };

// 画像を縮めて JPEG の base64 に
async function toJpegB64(file) {
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((ok, ng) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ng; im.src = URL.createObjectURL(file); });
  }
  const w = src.width, hh = src.height, k = Math.min(1, SHOT_LONG / Math.max(w, hh));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('image');
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
// 読み取りの結果を確かめてから使う（形のおかしいものは捨てる）
function cleanShot(r) {
  if (!r || r.calendar !== true) return null;
  const a = parse(r.first_date), b = parse(r.last_date);
  if (!a || !b || b < a || diffDays(a, b) > 62) return null;
  const events = (Array.isArray(r.events) ? r.events : []).slice(0, 300).map(e => {
    const s = parse(e && e.start), t = parse(e && e.end);
    if (!s || !t || t < s || diffDays(s, t) > 45) return null;
    if (ymd(t) < r.first_date || ymd(s) > r.last_date) return null;
    return { start: ymd(s), end: ymd(t), title: String(e.title || '').slice(0, 40), color: COLORS[e.color] ? e.color : 'other', holiday: e.holiday === true };
  }).filter(Boolean);
  return { first: r.first_date, last: r.last_date, events };
}
async function readOne(file) {
  const image = await toJpegB64(file);
  let res;
  try {
    res = await fetch(PROXY + '/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mediaType: 'image/jpeg', device: deviceId(), today: ymd(today()) }) });
  } catch (e) { throw new Error('読み取りに接続できません ・ 通信を確かめてください'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || (res.status === 404 ? '読み取りはまだ使えません' : '読み取りに失敗しました'));
  return cleanShot(data);
}
async function readShots(files) {
  const list = [...files].filter(f => /^image\//.test(f.type || 'image/')).slice(0, MAX_SHOTS);
  if (!list.length || !ans) return;
  const mine = ans;
  let done = 0, bad = 0, err = '';
  const tick = () => { mine.busy = 'スクショを読んでいます… ' + done + ' / ' + list.length; if (ans === mine) renderAnswer(); };
  tick();
  const queue = list.slice();
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try { const s = await readOne(f); if (s) mine.shots.push(s); else bad++; }
      catch (e) { err = err || (e && e.message) || '読み取りに失敗しました'; }
      done++; if (mine.busy) tick();
    }
  };
  await Promise.all([worker(), worker()]);
  mine.busy = '';
  if (ans !== mine) return;
  rebuild();
  renderAnswer();
  if (err) toast(err);
  else if (bad) toast('カレンダーとして読めない画像が ' + bad + ' 枚ありました');
  else if (files.length > MAX_SHOTS) toast('最初の ' + MAX_SHOTS + ' 枚だけ読みました');
}
function pickFiles() {
  const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, id: 'a-file' });
  inp.addEventListener('change', () => { const fs = inp.files; inp.remove(); readShots(fs); });
  document.body.append(inp); inp.click();
}
// 写っていない日を「8月16日〜31日」の形に
function missingText(days) {
  const out = []; let from = '', prev = '';
  days.forEach((day, i) => {
    const q = statusOf(day, i) === 'q';
    if (q && !from) from = day;
    if (!q && from) { out.push(from === prev ? fmtS(from) : fmtS(from) + '〜' + fmtS(prev)); from = ''; }
    prev = day;
  });
  if (from) out.push(from === prev ? fmtS(from) : fmtS(from) + '〜' + fmtS(prev));
  return out.length > 3 ? out.slice(0, 3).join('、') + ' ほか' : out.join('、');
}
function renderAnswer() {
  const plan = cur.plan, days = planDays(plan), y = window.scrollY;
  const back = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'もどる', onclick: () => { ans = null; showPlan(cur.id); } }, svg(IC_BACK));
  const name = h('input', { id: 'a-name', maxlength: 20, placeholder: '名前', autocomplete: 'nickname', value: ans.name, oninput: () => { ans.name = name.value; } });
  const nameField = h('label', { class: 'field' }, h('span', { text: 'あなたの名前' }), name);
  const busy = ans.busy ? h('p', { class: 'note', id: 'a-busy' }, h('span', { class: 'spin' }), ' ' + ans.busy) : null;

  // 1枚目: スクショを選ぶ
  if (!ans.shots.length && !ans.manual) {
    app.replaceChildren(h('div', { class: 'wrap' },
      h('header', { class: 'bar' }, back, h('h1', { text: plan.title })),
      h('p', { class: 'sub', text: fmtS(plan.start) + ' 〜 ' + fmtS(plan.end) }),
      nameField,
      h('button', { class: 'btn primary big', id: 'a-pick', type: 'button', disabled: !!ans.busy, text: 'カレンダーのスクショを選ぶ', onclick: pickFiles }),
      busy,
      h('p', { class: 'note', text: '月表示のスクショを、期間の分だけ選んでください ・ 画像は読み取りにだけ使い、保存しません ・ ほかの人に見えるのは名前と ○△× だけです' }),
      h('button', { class: 'link', id: 'a-manual', type: 'button', text: 'スクショなしで入れる', onclick: () => { ans.manual = true; renderAnswer(); } }),
    ));
    return;
  }

  // 2枚目: 確かめて送る
  const counts = {};
  days.forEach(day => { const seen = new Set(); for (const e of realEvents(day)) if (!seen.has(e.color)) { seen.add(e.color); counts[e.color] = (counts[e.color] || 0) + 1; } });
  const colors = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const rules = colors.length ? h('div', { class: 'rules', id: 'a-rules' }, colors.map(c => {
    const sw = h('span', { class: 'sw' }); sw.style.background = COLORS[c][1];
    const curv = ans.rules[c] || 't';
    return h('div', { class: 'rule', 'data-color': c }, sw,
      h('span', { class: 'nm' }, COLORS[c][0] + 'の予定', h('small', { text: counts[c] + '日' })),
      h('div', { class: 'seg', role: 'group', 'aria-label': COLORS[c][0] + 'の予定がある日' }, ['o', 't', 'x'].map(v =>
        h('button', { type: 'button', class: v + (curv === v ? ' on' : ''), 'aria-pressed': curv === v ? 'true' : 'false', 'aria-label': LABEL[v], text: MARK[v], onclick: () => {
          ans.rules[c] = v;
          ls.set('yotei.colors', Object.assign({}, ls.get('yotei.colors', {}), { [c]: v }));
          // この色の日を手で直していたら、色の決めごとに合わせ直す
          days.forEach(day => { if (ans.over[day] && realEvents(day).some(e => e.color === c)) delete ans.over[day]; });
          renderAnswer();
        } }))));
  })) : null;
  const miss = missingText(days);
  const detail = h('div', { class: 'detail', id: 'a-detail' });
  function showDay(day) {
    ans.sel = day;
    const evs = ans.byDay.get(day) || [];
    const text = evs.length ? evs.map(e => (e.title || '（題なし）') + (e.hol ? '（祝日など）' : '')).join('、')
      : ans.cover.has(day) ? '予定なし' : ans.shots.length ? 'スクショに写っていません' : '';
    setKids(detail, h('b', { text: fmtS(day) + ' ・ ' + LABEL[statusOf(day, days.indexOf(day))] }), text ? h('span', { class: 'who', text }) : null);
  }
  const grids = monthGrids(plan, (day) => {
    const st = statusOf(day, days.indexOf(day));
    return { cls: 's-' + st + (ans.sel === day ? ' sel' : ''), mark: MARK[st], label: LABEL[st], attrs: { 'data-st': st },
      dots: realEvents(day).map(e => COLORS[e.color][1]),
      onclick: () => { ans.over[day] = st === 'o' ? 't' : st === 't' ? 'x' : 'o'; ans.sel = day; renderAnswer(); } };
  });
  const send = h('button', { class: 'btn primary big', id: 'a-send', type: 'button', disabled: !!ans.busy, text: 'この内容で送る', onclick: async () => {
    const nm = name.value.trim();
    if (!nm) { shake(name); name.focus(); toast('名前を入れてください'); return; }
    send.disabled = true;
    const pid = ans.pid || randId(20), str = days.map((d, i) => statusOf(d, i)).join('');
    try {
      await Db.putAnswer(cur.id, pid, { name: nm, days: str });
      ls.set('yotei.name', nm);
      remember(cur.id, plan, pid);
      ans = null;
      await showPlan(cur.id);
      window.scrollTo(0, 0);
      toast('送りました');
    } catch (e) { send.disabled = false; toast('送れませんでした ・ 通信を確かめてください'); }
  } });
  app.replaceChildren(h('div', { class: 'wrap' },
    h('header', { class: 'bar' }, back, h('h1', { text: '確かめて送る' })),
    nameField,
    rules,
    miss ? h('div', { class: 'warn', id: 'a-miss', text: miss + ' は' + (ans.shots.length ? 'スクショに写っていません' : 'まだ決めていません') + ' ・ 送ると「不明」になります' }) : null,
    h('div', { class: 'btns' }, h('button', { class: 'btn', id: 'a-more', type: 'button', disabled: !!ans.busy, text: ans.shots.length ? 'スクショを足す' : 'スクショから読む', onclick: pickFiles })),
    busy,
    h('p', { class: 'legend', text: '○ 行ける ・ △ 微妙 ・ × 行けない ／ 日をタップで切り替え' }),
    grids, detail,
    ans.pid ? h('button', { class: 'link danger', id: 'a-del', type: 'button', text: '自分の答えを消す', onclick: async () => {
      if (!window.confirm('自分の答えを消しますか？')) return;
      try { await Db.delAnswer(cur.id, ans.pid); remember(cur.id, plan, ''); ans = null; await showPlan(cur.id); toast('消しました'); }
      catch (e) { toast('消せませんでした'); }
    } }) : null,
    h('div', { class: 'sticky' }, send),
  ));
  if (ans.sel) showDay(ans.sel); else setKids(detail, h('span', { class: 'who', text: '色の点は予定のある日です ・ 題はあなたにしか見えません' }));
  window.scrollTo(0, y);
}

// ---- 起動 ----
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.Yotei = { version: APP_VERSION };
route();
})();
