// =====================================================
// ラボ片付け: 研究室の後片付け・依頼事項をトグルで管理する PWA
//  - 後片付け: 曜日で繰り返す。完了はその日だけ（翌日は自動でオフに戻る）
//  - 依頼事項: 一度きり。依頼者・期限つき。完了したら下に沈む
//  - データは localStorage（lab.tasks.v1）のみ
// =====================================================
const APP_VERSION = 'v3';
const KEY = 'lab.tasks.v1';
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 月曜はじまり

// iOS 17.4+ の Safari は <input switch> を本物のスイッチで描き、切り替えで振動する
const NATIVE_SWITCH = 'switch' in HTMLInputElement.prototype;
const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch {} };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 86400000);
}

// ---------- データ ----------
let tasks = load();
function load() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter(t => t && t.id && t.title) : [];
  } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch { toast('保存できませんでした'); }
}

const isToday = (t) => t.kind !== 'clean' || !t.days?.length || t.days.includes(new Date().getDay());
const isDone = (t) => t.kind === 'clean' ? t.doneDay === ymd() : !!t.doneAt;

function toggle(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  if (t.kind === 'clean') t.doneDay = isDone(t) ? null : ymd();
  else t.doneAt = t.doneAt ? null : new Date().toISOString();
  save();
  buzz();
  clearTimeout(toggle.timer);
  toggle.timer = setTimeout(renderAnimated, 280);
}

// 並べ替えを滑らかに（FLIP: 前の位置から新しい位置へ動かす）
function renderAnimated() {
  const before = new Map([...document.querySelectorAll('.item')].map(el => [el.dataset.id, el.getBoundingClientRect().top]));
  render();
  document.querySelectorAll('.item').forEach(el => {
    const top = before.get(el.dataset.id);
    if (top == null) return;
    const dy = top - el.getBoundingClientRect().top;
    if (!dy) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

// ---------- 描画 ----------
let editing = false;
let showRest = false;

function subText(t) {
  const parts = [];
  if (t.kind === 'clean') {
    const d = t.days || [];
    // 毎日（曜日の指定なし）は書かない
    if (d.length && d.length < 7) parts.push(esc(d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x)) ? '平日'
      : DAY_ORDER.filter(x => d.includes(x)).map(x => WD[x]).join('、')));
  } else {
    if (t.from) parts.push(esc(t.from));
    if (t.due) {
      const n = daysUntil(t.due);
      const [, m, d] = t.due.split('-').map(Number);
      const label = `${m}/${d}`;
      if (isDone(t)) parts.push(`期限 ${label}`);
      else if (n < 0) parts.push(`<span class="late">${-n}日超過</span>`);
      else if (n === 0) parts.push(`<span class="late">今日まで</span>`);
      else if (n === 1) parts.push(`<span class="soon">明日まで</span>`);
      else parts.push(`${label}まで`);
    }
  }
  if (t.note) parts.push(esc(t.note));
  return parts.join('、');
}

function itemHtml(t, rest = false) {
  const done = isDone(t);
  return `<div class="item${done ? ' done' : ''}${rest ? ' rest' : ''}" data-id="${esc(t.id)}">
    <button class="swipe-del" data-del="${esc(t.id)}">削除</button>
    <div class="item-in">
      <button class="del" data-del="${esc(t.id)}" aria-label="削除"></button>
      <div class="body">
        <div class="title">${esc(t.title)}</div>
        ${(() => { const st = subText(t); return st ? `<div class="sub">${st}</div>` : ''; })()}
      </div>
      <input type="checkbox" switch class="tg${NATIVE_SWITCH ? '' : ' custom'}" data-tg="${esc(t.id)}" ${done ? 'checked' : ''} ${rest ? 'disabled' : ''} aria-label="完了">
    </div>
  </div>`;
}

// 未完了を上、完了を下。依頼は期限の近い順
function sortReq(a, b) {
  const da = isDone(a), db = isDone(b);
  if (da !== db) return da ? 1 : -1;
  if (a.due !== b.due) return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1;
  return (a.created || 0) - (b.created || 0);
}
function sortClean(a, b) {
  const da = isDone(a), db = isDone(b);
  if (da !== db) return da ? 1 : -1;
  return (a.created || 0) - (b.created || 0);
}

function render() {
  openRow = null;
  document.body.classList.toggle('editing', editing);
  $('#btn-edit').textContent = editing ? '完了' : '編集';
  $('#btn-edit').classList.toggle('active', editing);
  $('#edit-tools').hidden = !editing || !tasks.some(t => t.kind === 'request' && t.doneAt);

  const reqs = tasks.filter(t => t.kind === 'request').sort(sortReq);
  const cleanToday = tasks.filter(t => t.kind === 'clean' && isToday(t)).sort(sortClean);
  const cleanRest = tasks.filter(t => t.kind === 'clean' && !isToday(t)).sort(sortClean);

  // 要約: 今日やるべきもの（今日の後片付け＋未完了の依頼）の残り
  const todo = [...cleanToday, ...reqs.filter(t => !t.doneAt)];
  const left = todo.filter(t => !isDone(t));
  const late = left.filter(t => t.kind === 'request' && t.due && daysUntil(t.due) <= 0).length;
  const doneToday = cleanToday.filter(isDone).length + reqs.filter(t => t.doneAt && ymd(new Date(t.doneAt)) === ymd()).length;
  const total = left.length + doneToday;
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日（${WD[now.getDay()]}）`;

  if (!tasks.length) {
    $('#summary').innerHTML = '';
  } else if (left.length === 0) {
    $('#summary').innerHTML = `<div class="big all">完了</div>
      <div class="meta">${dateLabel} ・ 今日の分はすべて済んでいます</div>
      <div class="bar-prog"><i style="width:100%"></i></div>`;
  } else {
    const pct = total ? Math.round(doneToday / total * 100) : 0;
    const lc = left.filter(t => t.kind === 'clean').length, lr = left.length - lc;
    const meta = [dateLabel];
    if (lc) meta.push(`後片付け ${lc}`);
    if (lr) meta.push(`依頼 ${lr}`);
    if (late) meta.push(`<b>期限 ${late}</b>`);
    $('#summary').innerHTML = `<div class="big">残り ${left.length}<small>件</small></div>
      <div class="meta">${meta.join(' ・ ')}</div>
      <div class="bar-prog"><i style="width:${pct}%"></i></div>`;
  }

  let html = '';
  if (!tasks.length) {
    html = `<div class="empty">右上の ＋ で項目を追加<br>後片付け（毎日・曜日）と依頼事項（期限つき）を登録できます</div>`;
  }
  if (reqs.length) {
    html += `<h2 class="sec-h">依頼事項<span class="n">${reqs.filter(t => !t.doneAt).length}件</span></h2>`;
    html += reqs.map(t => itemHtml(t)).join('');
  }
  if (cleanToday.length || cleanRest.length) {
    html += `<h2 class="sec-h">今日の後片付け<span class="n">${cleanToday.filter(t => !isDone(t)).length}件</span></h2>`;
    html += cleanToday.map(t => itemHtml(t)).join('');
    if (cleanRest.length) {
      html += `<button class="more" id="toggle-rest">${showRest ? 'ほかの曜日を隠す' : `ほかの曜日 ${cleanRest.length}件`}</button>`;
      if (showRest || editing) html += cleanRest.map(t => itemHtml(t, true)).join('');
    }
  }
  $('#list').innerHTML = html;
}

// ---------- 追加・編集シート ----------
let cur = null; // 編集中の下書き

function openSheet(t) {
  cur = t ? JSON.parse(JSON.stringify(t)) : { kind: 'clean', days: [] };
  $('#sh-title').textContent = t ? '編集' : '新規';
  $('#sh-name').value = cur.title || '';
  $('#sh-from').value = cur.from || '';
  $('#sh-due').value = cur.due || '';
  $('#sh-note').value = cur.note || '';
  $('#sh-delete').hidden = !t;
  syncSheet();
  $('#sheet').hidden = false;
  if (!t) setTimeout(() => $('#sh-name').focus(), 50);
}
function closeSheet() { $('#sheet').hidden = true; cur = null; }

function syncSheet() {
  document.querySelectorAll('#sh-kind button').forEach(b => b.classList.toggle('sel', b.dataset.kind === cur.kind));
  $('#g-days').hidden = cur.kind !== 'clean';
  $('#g-req').hidden = cur.kind !== 'request';
  $('#sh-days').innerHTML = DAY_ORDER.map(d =>
    `<button data-day="${d}" class="${cur.days?.includes(d) ? 'sel' : ''}">${WD[d]}</button>`).join('');
  $('#sh-name').placeholder = cur.kind === 'clean' ? 'タスク名（例: ピペット洗浄）' : '依頼内容（例: 試薬の発注）';
}

function saveSheet() {
  const title = $('#sh-name').value.trim();
  if (!title) { toast('名前を入れてください'); $('#sh-name').focus(); return; }
  const t = {
    ...cur, title,
    note: $('#sh-note').value.trim(),
  };
  if (t.kind === 'clean') {
    t.days = (t.days || []).slice().sort();
    delete t.from; delete t.due; delete t.doneAt;
  } else {
    t.from = $('#sh-from').value.trim();
    t.due = $('#sh-due').value || '';
    delete t.days; delete t.doneDay;
  }
  if (t.id) tasks = tasks.map(x => x.id === t.id ? t : x);
  else { t.id = uid(); t.created = Date.now(); tasks.push(t); }
  save(); closeSheet(); render();
}

function removeTask(id) {
  const i = tasks.findIndex(x => x.id === id); if (i < 0) return;
  const [t] = tasks.splice(i, 1);
  save(); render();
  toast(`「${t.title}」を削除`, '元に戻す', () => { tasks.splice(i, 0, t); save(); render(); });
}

// ---------- トースト ----------
let toastTimer;
function toast(msg, actLabel, act) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${actLabel ? `<button>${esc(actLabel)}</button>` : ''}`;
  if (act) el.querySelector('button').onclick = () => { el.remove(); act(); };
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 4000);
}

// ---------- イベント ----------
$('#btn-add').onclick = () => openSheet(null);
$('#btn-edit').onclick = () => { editing = !editing; render(); };
$('#btn-clear-done').onclick = () => {
  const gone = tasks.filter(t => t.kind === 'request' && t.doneAt);
  if (!gone.length) return;
  const before = tasks.slice();
  tasks = tasks.filter(t => !gone.includes(t));
  save(); render();
  toast(`${gone.length}件を消去`, '元に戻す', () => { tasks = before; save(); render(); });
};

$('#list').addEventListener('change', (e) => {
  const tg = e.target.closest('[data-tg]');
  if (tg) toggle(tg.dataset.tg);
});
$('#list').addEventListener('click', (e) => {
  if (swipedAt && Date.now() - swipedAt < 400) { e.preventDefault(); return; } // スワイプ直後の誤タップ
  if (e.target.closest('[data-tg]')) return;
  if (openRow && !e.target.closest('.swipe-del')) { closeSwipe(); return; }
  const del = e.target.closest('[data-del]');
  if (del) { removeTask(del.dataset.del); return; }
  if (e.target.closest('#toggle-rest')) { showRest = !showRest; render(); return; }
  const row = e.target.closest('.item');
  if (row) openSheet(tasks.find(t => t.id === row.dataset.id));
});

// ---------- 左スワイプで削除（iOS の一覧と同じ） ----------
const DEL_W = 88;
let openRow = null, swipedAt = 0;
function setX(row, x, anim) {
  const inner = row.querySelector('.item-in');
  inner.style.transition = anim ? 'transform .25s cubic-bezier(.2,.8,.2,1)' : 'none';
  inner.style.transform = x ? `translateX(${x}px)` : '';
  row.classList.toggle('swiping', x !== 0);
}
function closeSwipe() { if (openRow) { setX(openRow, 0, true); openRow = null; } }
(() => {
  let row = null, x0 = 0, y0 = 0, base = 0, dx = 0, mode = null;
  const list = $('#list');
  list.addEventListener('touchstart', (e) => {
    const r = e.target.closest('.item');
    if (!r || editing || e.target.closest('[data-tg]') || e.target.closest('.swipe-del')) { row = null; return; }
    if (openRow && openRow !== r) closeSwipe();
    row = r; mode = null; dx = 0;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    base = openRow === r ? -DEL_W : 0;
  }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    if (!row) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!mode) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; mode = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'; }
    if (mode !== 'h') return;
    e.preventDefault();
    dx = Math.min(0, base + mx);
    if (dx < -DEL_W) dx = -DEL_W + (dx + DEL_W) * 0.6; // 引っぱりすぎは重く
    setX(row, dx, false);
  }, { passive: false });
  list.addEventListener('touchend', () => {
    if (!row || mode !== 'h') { row = null; return; }
    swipedAt = Date.now();
    const w = row.offsetWidth;
    if (dx < -w * 0.55) { const id = row.dataset.id; buzz(15); removeTask(id); openRow = null; }
    else if (dx < -DEL_W / 2) { setX(row, -DEL_W, true); openRow = row; }
    else { setX(row, 0, true); if (openRow === row) openRow = null; }
    row = null;
  });
})();
document.addEventListener('touchstart', (e) => { if (openRow && !e.target.closest('.item')) closeSwipe(); }, { passive: true });

// ---------- シートを下に引いて閉じる ----------
(() => {
  const sheet = document.querySelector('.sheet');
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.grab, .sheet-head') || e.target.closest('button')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
    e.preventDefault();
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    y0 = null;
    sheet.style.transition = 'transform .22s ease-out';
    if (dy > 110) { sheet.style.transform = 'translateY(100%)'; setTimeout(() => { closeSheet(); sheet.style.transform = ''; }, 200); }
    else sheet.style.transform = '';
  });
})();

$('#sh-kind').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]'); if (!b) return;
  cur.kind = b.dataset.kind; syncSheet();
});
$('#sh-days').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  const d = Number(b.dataset.day);
  cur.days = cur.days || [];
  cur.days = cur.days.includes(d) ? cur.days.filter(x => x !== d) : [...cur.days, d];
  syncSheet();
});
$('#sh-cancel').onclick = closeSheet;
$('#sh-save').onclick = saveSheet;
$('#sh-name').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) saveSheet(); });
$('#sh-delete').onclick = () => { const id = cur?.id; closeSheet(); if (id) removeTask(id); };
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

// 日付が変わったら（翌朝アプリを開いたとき）後片付けをオフに戻して描き直す
let lastDay = ymd();
function checkDay() { if (ymd() !== lastDay) { lastDay = ymd(); showRest = false; render(); } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);

render();

// ---------- ホーム画面に追加の案内（ブラウザで開いているときだけ・一度閉じたら出さない） ----------
(() => {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let seen = false; try { seen = !!localStorage.getItem('lab.installHint'); } catch {}
  if (standalone || seen) return;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const el = $('#install');
  const show = () => { el.hidden = false; document.body.classList.add('has-install'); };
  const done = () => { el.hidden = true; document.body.classList.remove('has-install'); try { localStorage.setItem('lab.installHint', '1'); } catch {} };
  el.querySelector('.x').onclick = done;
  if (ios) {
    el.querySelector('.msg').innerHTML = 'ホーム画面に追加すると、アプリとして全画面で使えます。<br>下の <b>共有</b> ボタン → <b>ホーム画面に追加</b>';
    show();
  } else {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      el.querySelector('.msg').textContent = 'アプリとしてインストールできます';
      const b = el.querySelector('.go'); b.hidden = false;
      b.onclick = async () => { e.prompt(); await e.userChoice.catch(() => {}); done(); };
      show();
    });
  }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
