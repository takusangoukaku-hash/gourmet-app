// =====================================================
// 画面制御: 今日（食事PFC）/ 体重 / 運動 / 設定
// =====================================================
const APP_VERSION = 'v5';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = v => (Math.round((+v || 0) * 10) / 10).toString();
  const SLOTS = [['breakfast', '朝食'], ['lunch', '昼食'], ['dinner', '夕食'], ['snack', '間食']];
  const SLOT_NAME = Object.fromEntries(SLOTS);
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  const state = { tab: 'today', date: Store.today(), range: 90 };

  // ---------- 共通UI ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  let sheetOpen = false;
  function openSheet(html) {
    const root = $('#sheet-root');
    root.innerHTML = `<div class="backdrop"></div><div class="sheet" role="dialog"><div class="handle"></div>${html}</div>`;
    root.hidden = false;
    $('.backdrop', root).onclick = () => closeSheet();
    if (!sheetOpen) history.pushState({ sheet: true }, '');
    sheetOpen = true;
    return $('.sheet', root);
  }
  function closeSheet(fromPopstate) {
    const root = $('#sheet-root'); root.hidden = true; root.innerHTML = '';
    const wasOpen = sheetOpen; sheetOpen = false;
    // ボタンで閉じた時は、積んだ履歴を1つ戻して「戻る」の二重押しを防ぐ
    // onclick = closeSheet のようにイベントが渡ってくることがあるので、true の時だけ戻る操作由来とみなす
    if (wasOpen && fromPopstate !== true && history.state && history.state.sheet) history.back();
  }
  window.addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });
  function fmtJa(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${m}月${d}日(${WD[dt.getDay()]})`;
  }
  function dateNav(onChange) {
    const isToday = state.date === Store.today();
    return `<div class="date-nav">
      <button data-nav="-1" aria-label="前日">‹</button>
      <div class="d">${fmtJa(state.date)}<small>${isToday ? '今日' : `<a href="#" data-nav="today">今日へ戻る</a>`}</small></div>
      <button data-nav="1" aria-label="翌日">›</button>
    </div>`;
  }
  function bindDateNav(root, render) {
    $$('[data-nav]', root).forEach(b => b.onclick = (e) => {
      e.preventDefault();
      const v = b.dataset.nav;
      state.date = v === 'today' ? Store.today() : Store.addDays(state.date, +v);
      render();
    });
  }
  function currentWeight() {
    const w = Store.latestWeight(state.date) || Store.latestWeight();
    return w ? w.kg : 0;
  }
  // 直近 days 日（昨日まで。今日は記録途中なので除く）の収支分析
  function balanceFor(days) {
    const to = Store.addDays(Store.today(), -1);
    const from = Store.addDays(to, -days + 1);
    const daily = Store.dailyIntake(from, to);
    const intakeDays = daily.filter(d => d.logged && !d.incomplete);
    // 体重は今日の分まで使う
    const weights = Store.weights().filter(w => w.date >= from && w.date <= Store.today());
    const p = Store.profile();
    const wNow = currentWeight();
    const exerciseAvg = Store.exercisesBetween(from, to).reduce((s, e) => s + (+e.kcal || 0), 0) / days;
    const r = Calc.energyBalance({ weights, intakeDays, days, formulaTdee: Calc.tdee(p, wNow), exerciseAvg });
    return Object.assign(r, { from, to, daily });
  }
  // 設定で「実測TDEEを使う」がオンで、実測値が妥当な時だけ返す
  function measuredTdeeForTargets() {
    const p = Store.profile();
    if (!p.useMeasuredTdee) return null;
    const r = [28, 14].map(balanceFor).find(x => x.ready);
    if (!r || !isPlausible(r)) return null;
    return r.measuredTdee;
  }
  // 式の推定から±35%を超える実測値は、記録漏れか測定ノイズとみなして採用しない
  const isPlausible = r => !r.expectedTdee || Math.abs(r.measuredTdee - r.expectedTdee) <= r.expectedTdee * 0.35;

  function exerciseKcalOn(date) {
    return Store.exercisesOn(date).reduce((s, e) => s + (+e.kcal || 0), 0);
  }

  // ---------- ホーム画面への追加（インストール） ----------
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (state.tab === 'today') renderToday(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; toast('ホーム画面に追加しました'); if (state.tab === 'today') renderToday(); });
  function installDismissed() { try { return localStorage.getItem('diet.installDismissed') === '1'; } catch { return false; } }
  function installCard() {
    if (isStandalone() || installDismissed()) return '';
    let how;
    if (installPrompt) how = `<button class="btn primary small" id="install-btn">インストール</button>`;
    else if (isIOS()) how = `<small>Safari で下の <b>共有ボタン</b>（□に↑）→ <b>「ホーム画面に追加」</b>。Safari 以外のブラウザでは追加できません。</small>`;
    else how = `<small>ブラウザのメニュー（︙）→ <b>「ホーム画面に追加」</b>または<b>「アプリをインストール」</b>。</small>`;
    return `<div class="card install"><div class="row between"><b>ホーム画面に追加するとアプリとして使えます</b><button class="btn small" id="install-close" aria-label="閉じる">×</button></div>
      <div style="margin-top:6px">${how}</div><small class="muted">全画面で開き、オフラインでも記録できます。</small></div>`;
  }
  function bindInstallCard(root) {
    const btn = $('#install-btn', root);
    if (btn) btn.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; renderToday(); };
    const close = $('#install-close', root);
    if (close) close.onclick = () => { try { localStorage.setItem('diet.installDismissed', '1'); } catch {} renderToday(); };
  }

  // ---------- タブ切替 ----------
  const TITLES = { today: '今日', weight: '体重', body: '体型', exercise: '運動', settings: '設定' };
  function switchTab(tab) {
    state.tab = tab;
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
    $$('.tabbtn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#page-title').textContent = TITLES[tab];
    window.scrollTo(0, 0);
    render();
  }
  $$('.tabbtn').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  function render() {
    ({ today: renderToday, weight: renderWeight, body: renderBody, exercise: renderExercise, settings: renderSettings })[state.tab]();
  }

  // =====================================================
  // 今日タブ
  // =====================================================
  function renderToday() {
    const root = $('#tab-today');
    const p = Store.profile();
    const weight = currentWeight();
    const tg = Calc.targets(p, weight, measuredTdeeForTargets());
    const meals = Store.mealsOn(state.date);
    const eaten = meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, f: a.f + m.f, c: a.c + m.c }), { kcal: 0, p: 0, f: 0, c: 0 });
    const exKcal = exerciseKcalOn(state.date);
    const budget = tg ? tg.kcal + (p.addExerciseToBudget ? exKcal : 0) : 0;

    let summary;
    if (!tg) {
      summary = `<div class="card"><div class="notice">目標を計算するには、設定タブで年齢・身長を入力し、体重タブで体重を記録してください。</div>
        <button class="btn primary block" data-go="settings">設定を開く</button></div>`;
    } else {
      const rem = budget - eaten.kcal;
      const bar = (cls, name, val, max, unit) => {
        const pct = max ? Math.min(100, val / max * 100) : 0;
        const over = max && val > max;
        return `<div class="bar ${cls}"><span class="name">${name}</span><div class="track"><div class="fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
          <span class="val"><b>${n1(val)}</b> / ${Math.round(max)}${unit} <span style="color:${over ? 'var(--danger)' : 'var(--muted)'}">(${over ? '+' : '残'}${n1(Math.abs(max - val))})</span></span></div>`;
      };
      summary = `<div class="card">
        <div class="hero"><div class="num ${rem < 0 ? 'over' : ''}">${rem < 0 ? '+' : ''}${Math.abs(Math.round(rem))}</div>
          <div class="lbl">${rem < 0 ? 'kcal 超過' : 'kcal 残り'} ・ 目標 ${budget} kcal${p.addExerciseToBudget && exKcal ? `（運動 +${exKcal}）` : ''}</div></div>
        <div class="bars">
          ${bar('p', 'P', eaten.p, tg.p, 'g')}
          ${bar('f', 'F', eaten.f, tg.f, 'g')}
          ${bar('c', 'C', eaten.c, tg.c, 'g')}
        </div>
        <div class="row between" style="margin-top:10px">
          <small>運動消費 ${exKcal} kcal ${p.addExerciseToBudget ? '（予算に加算）' : '（予算には加算しない）'}</small>
          <small>${tg.mode === 'manual' ? '目標: 手動' : `${tg.mode === 'measured' ? '実測' : ''}TDEE ${tg.tdee} kcal`}</small>
        </div>
        ${tg.belowBmr ? `<div class="notice">この減量ペースだと目標が基礎代謝(${tg.bmr}kcal)を下回ります。ペースを落とすか、手動で目標を設定してください。</div>` : ''}
      </div>`;
    }

    const slots = SLOTS.map(([slot, label]) => {
      const list = meals.filter(m => m.slot === slot);
      const sum = list.reduce((s, m) => s + m.kcal, 0);
      return `<div class="slot">
        <div class="slot-h"><h3>${label}</h3><div class="row"><span class="sum">${sum ? sum + ' kcal' : ''}</span><button class="btn ghost small" data-add="${slot}">＋ 追加</button></div></div>
        ${list.length ? `<div class="list">${list.map(m => `
          <button class="item" data-meal="${m.id}">
            ${m.photoId ? `<img class="thumb" data-photo="${m.photoId}" alt="">` : ''}
            <div class="body"><div class="t">${esc(m.name)}${m.ai ? ' <small>AI</small>' : ''}</div>
              <div class="s pfc-chip"><span><i class="p">P</i> ${n1(m.p)}</span><span><i class="f">F</i> ${n1(m.f)}</span><span><i class="c">C</i> ${n1(m.c)}</span></div></div>
            <div class="kcal">${m.kcal}<small> kcal</small></div>
          </button>`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    const incomplete = Store.isIncomplete(state.date);
    const incompleteToggle = `<div class="card toggle" style="padding:10px 16px">
        <span><b style="font-size:14px">この日は記録漏れあり</b><br><small class="muted">オンにすると体重との答え合わせから除外します</small></span>
        <input type="checkbox" id="incomplete" ${incomplete ? 'checked' : ''}></div>`;
    root.innerHTML = `${installCard()}${dateNav()}${summary}${slots}${incompleteToggle}
      <div style="height:70px"></div>
      <button class="fab" id="fab-meal"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>食事を記録</button>`;

    bindDateNav(root, renderToday);
    bindInstallCard(root);
    $('#incomplete', root).onchange = (e) => { Store.setIncomplete(state.date, e.target.checked); toast(e.target.checked ? '分析から除外しました' : '分析に含めます'); };
    $$('[data-go]', root).forEach(b => b.onclick = () => switchTab(b.dataset.go));
    $$('[data-add]', root).forEach(b => b.onclick = () => openMealSheet({ slot: b.dataset.add }));
    $('#fab-meal').onclick = () => openMealSheet({ slot: guessSlot() });
    $$('[data-meal]', root).forEach(b => b.onclick = () => openMealSheet({ id: b.dataset.meal }));
    $$('img[data-photo]', root).forEach(async img => { const u = await Store.photoUrl(img.dataset.photo); if (u) img.src = u; });
  }

  function guessSlot() {
    const h = new Date().getHours();
    if (h < 10) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 20) return 'dinner';
    return 'snack';
  }

  // 食事の追加・編集シート
  function openMealSheet({ slot, id }) {
    const editing = id ? Store.mealsOn(state.date).find(m => m.id === id) : null;
    const cur = editing || { slot: slot || 'lunch', name: '', kcal: '', p: '', f: '', c: '' };
    let photoFile = null;        // 送信用の元ファイル
    let aiItems = null;          // AI推定結果（複数料理）
    let photoBlobForSave = null; // 保存用サムネイル

    const sheet = openSheet(`
      <h2>${editing ? '食事を編集' : '食事を記録'}</h2>
      <div class="seg" id="slot-seg">${SLOTS.map(([k, v]) => `<button data-slot="${k}" class="${cur.slot === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      ${editing ? '' : `
      <div class="photo-box" id="photo-box" style="margin-top:10px">
        <div id="photo-preview"></div>
        <div id="photo-label">📷 写真を撮る / 選ぶ（AIでPFCを推定）</div>
        <input type="file" accept="image/*" capture="environment" id="photo-input">
      </div>
      <div class="field"><label>ヒント（任意・料理名やサイズなど）</label><input id="hint" placeholder="例: 牛丼 並盛 / コンビニのサラダチキン"></div>
      <button class="btn primary block" id="ai-btn" disabled>AIで推定する</button>
      <div id="ai-result"></div>
      <div class="muted" style="margin:10px 0 4px">または手入力</div>`}
      <div id="manual">
        <div class="field"><label>料理名</label><input id="m-name" value="${esc(cur.name)}" placeholder="例: 鶏むね肉のソテー"></div>
        <div class="grid2">
          <div class="field"><label>エネルギー</label><div class="unit"><input type="number" inputmode="decimal" id="m-kcal" value="${cur.kcal}"><span>kcal</span></div></div>
          <div class="field"><label>タンパク質</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="m-p" value="${cur.p}"><span>g</span></div></div>
          <div class="field"><label>脂質</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="m-f" value="${cur.f}"><span>g</span></div></div>
          <div class="field"><label>炭水化物</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="m-c" value="${cur.c}"><span>g</span></div></div>
        </div>
      </div>
      <div class="actions">
        ${editing ? `<button class="btn danger" id="m-del">削除</button>` : ''}
        <button class="btn" id="m-cancel">キャンセル</button>
        <button class="btn primary" id="m-save">保存</button>
      </div>`);

    let curSlot = cur.slot;
    $$('#slot-seg button', sheet).forEach(b => b.onclick = () => {
      curSlot = b.dataset.slot;
      $$('#slot-seg button', sheet).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#m-cancel', sheet).onclick = closeSheet;
    if (editing) {
      $('#m-del', sheet).onclick = () => { if (confirm('この食事を削除しますか？')) { Store.deleteMeal(editing.id); closeSheet(); renderToday(); } };
    }

    // 写真選択
    const input = $('#photo-input', sheet);
    if (input) {
      input.onchange = async () => {
        photoFile = input.files[0]; if (!photoFile) return;
        const thumb = await AI.compressImage(photoFile, 320, 0.7);
        photoBlobForSave = thumb;
        $('#photo-preview', sheet).innerHTML = `<img src="${URL.createObjectURL(thumb)}" alt="">`;
        $('#photo-label', sheet).textContent = '写真を変更';
        const btn = $('#ai-btn', sheet);
        btn.disabled = !AI.hasApiKey();
        if (!AI.hasApiKey()) $('#ai-result', sheet).innerHTML = `<div class="notice">AI推定には設定タブで Claude API キーを保存してください。写真だけ付けて手入力もできます。</div>`;
      };
      $('#ai-btn', sheet).onclick = async () => {
        const btn = $('#ai-btn', sheet);
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 推定中…';
        try {
          const r = await AI.estimateMeal(photoFile, $('#hint', sheet).value);
          aiItems = r.items;
          renderAiResult(sheet, r);
        } catch (e) {
          $('#ai-result', sheet).innerHTML = `<div class="notice">推定できませんでした: ${esc(e.message || e)}</div>`;
        } finally {
          btn.disabled = false; btn.textContent = 'もう一度推定する';
        }
      };
    }

    $('#m-save', sheet).onclick = async () => {
      // AI結果がある場合: 各料理をそれぞれ保存
      if (aiItems && aiItems.length && !$('#ai-result', sheet).hidden) {
        const rows = $$('.ai-item', sheet);
        const items = rows.map(r => ({
          name: $('[data-k="name"]', r).value.trim(), kcal: $('[data-k="kcal"]', r).value,
          p: $('[data-k="p"]', r).value, f: $('[data-k="f"]', r).value, c: $('[data-k="c"]', r).value,
        })).filter(x => x.name);
        if (!items.length) { toast('保存する料理がありません'); return; }
        const photoId = photoBlobForSave ? await Store.savePhoto(photoBlobForSave) : null;
        items.forEach(it => Store.addMeal({ ...it, slot: curSlot, date: state.date, photoId, ai: true }));
        closeSheet(); renderToday(); toast(`${items.length}件を記録しました`);
        return;
      }
      const name = $('#m-name', sheet).value.trim();
      const kcal = $('#m-kcal', sheet).value;
      if (!name) { toast('料理名を入力してください'); $('#m-name', sheet).focus(); return; }
      if (kcal === '') { toast('エネルギー(kcal)を入力してください'); $('#m-kcal', sheet).focus(); return; }
      const rec = { name, kcal, p: $('#m-p', sheet).value, f: $('#m-f', sheet).value, c: $('#m-c', sheet).value, slot: curSlot };
      if (editing) {
        Store.updateMeal(editing.id, rec);
      } else {
        const photoId = photoBlobForSave ? await Store.savePhoto(photoBlobForSave) : null;
        Store.addMeal({ ...rec, date: state.date, photoId, ai: false });
      }
      closeSheet(); renderToday(); toast('記録しました');
    };
  }

  function renderAiResult(sheet, r) {
    const box = $('#ai-result', sheet);
    const conf = { high: '確信度: 高', medium: '確信度: 中', low: '確信度: 低（量の見積もりを確認）' }[r.confidence] || '';
    if (!r.items.length) {
      box.innerHTML = `<div class="notice">料理を認識できませんでした。${esc(r.note)}</div>`;
      return;
    }
    const total = r.items.reduce((s, it) => s + it.kcal, 0);
    box.innerHTML = `
      <div class="notice info" style="margin-top:10px"><b>${conf}</b>　合計 約${total} kcal<br><small>${esc(r.note)}</small><br><small>数値は編集できます。保存すると料理ごとに記録されます。</small></div>
      ${r.items.map(it => `<div class="ai-item">
        <div class="head"><input data-k="name" value="${esc(it.name)}"><button class="btn small" data-rm>×</button></div>
        <small class="muted">${esc(it.amount)}</small>
        <div class="nums">
          <div><label>kcal</label><input type="number" inputmode="decimal" data-k="kcal" value="${it.kcal}"></div>
          <div><label>P</label><input type="number" inputmode="decimal" step="0.1" data-k="p" value="${it.p}"></div>
          <div><label>F</label><input type="number" inputmode="decimal" step="0.1" data-k="f" value="${it.f}"></div>
          <div><label>C</label><input type="number" inputmode="decimal" step="0.1" data-k="c" value="${it.c}"></div>
        </div></div>`).join('')}`;
    $$('[data-rm]', box).forEach(b => b.onclick = () => b.closest('.ai-item').remove());
    $('#manual', sheet).classList.add('hidden');
    $('#m-save', sheet).textContent = '推定結果を保存';
  }

  // ---------- 骨格筋・体脂肪は % でも kg でも入力できる（保存は % に統一） ----------
  // 単位の選択は端末に覚えておく
  const compUnit = k => { try { return localStorage.getItem('diet.unit.' + k) === 'kg' ? 'kg' : '%'; } catch { return '%'; } };
  const setCompUnit = (k, u) => { try { localStorage.setItem('diet.unit.' + k, u); } catch {} };
  const COMP_LABEL = { sm: ['骨格筋率', '骨格筋量'], bf: ['体脂肪率', '体脂肪量'] };
  // k: 'sm' | 'bf'、pct: 保存済みの % 値、weight: 表示用の換算に使う体重、suffix: ラベル末尾（「（任意）」など）
  function compField(id, k, pct, weight, suffix = '', style = '') {
    const u = compUnit(k);
    const val = pct ? (u === 'kg' && weight ? Math.round(weight * pct / 10) / 10 : pct) : '';
    const ph = k === 'sm' ? (u === 'kg' ? '例: 23.5' : '例: 34.5') : (u === 'kg' ? '例: 12.2' : '例: 18.0');
    return `<div class="field" style="${style}"><label data-lbl="${id}">${COMP_LABEL[k][u === 'kg' ? 1 : 0]}${suffix}</label><div class="unit">
      <input type="number" inputmode="decimal" step="0.1" id="${id}" data-comp="${k}" data-suffix="${suffix}" value="${val}" placeholder="${ph}">
      <button type="button" class="unit-btn" data-unit-for="${id}" aria-label="単位を切り替え">${u}<small>⇄</small></button></div></div>`;
  }
  // 単位ボタン: 押すと % ⇄ kg を切り替え、入力済みの値は weightEl の体重で換算する
  function bindCompUnits(root, weightEl) {
    $$('[data-unit-for]', root).forEach(btn => btn.onclick = () => {
      const input = $('#' + btn.dataset.unitFor, root), k = input.dataset.comp;
      const from = compUnit(k), to = from === '%' ? 'kg' : '%';
      const w = parseFloat(weightEl.value);
      if (input.value !== '') {
        if (!(w > 0)) { toast('先に体重を入力すると換算できます'); return; }
        const v = parseFloat(input.value);
        input.value = to === 'kg' ? Math.round(w * v / 10) / 10 : Math.round(v / w * 1000) / 10;
      }
      setCompUnit(k, to);
      btn.innerHTML = `${to}<small>⇄</small>`;
      $(`[data-lbl="${input.id}"]`, root).textContent = COMP_LABEL[k][to === 'kg' ? 1 : 0] + input.dataset.suffix;
      input.placeholder = k === 'sm' ? (to === 'kg' ? '例: 23.5' : '例: 34.5') : (to === 'kg' ? '例: 12.2' : '例: 18.0');
    });
  }
  // 骨格筋・体脂肪の入力を検証して { sm, bf }（%）を返す。kg で入力されていれば体重で割って % にする。空欄は削除扱い。不正なら null
  function readComposition(smEl, bfEl, weight) {
    const toPct = (el) => {
      if (el.value === '') return 0;
      const v = parseFloat(el.value);
      return compUnit(el.dataset.comp) === 'kg' ? (weight > 0 ? v / weight * 100 : NaN) : v;
    };
    const sm = toPct(smEl), bf = toPct(bfEl);
    // 範囲外のときは、選んでいる単位で範囲を示す（kg なら体重から換算）
    const rangeMsg = (el, lo, hi) => {
      const k = el.dataset.comp;
      if (compUnit(k) === 'kg' && weight > 0) return `${COMP_LABEL[k][1]}は ${(weight * lo / 100).toFixed(1)}〜${(weight * hi / 100).toFixed(1)}kg で入力してください`;
      return `${COMP_LABEL[k][0]}は ${lo}〜${hi}% で入力してください`;
    };
    if (sm && !(sm >= 10 && sm <= 60)) { toast(rangeMsg(smEl, 10, 60)); smEl.focus(); return null; }
    if (bf && !(bf >= 3 && bf <= 60)) { toast(rangeMsg(bfEl, 3, 60)); bfEl.focus(); return null; }
    return { sm: sm ? Math.round(sm * 10) / 10 : null, bf: bf ? Math.round(bf * 10) / 10 : null };
  }

  // =====================================================
  // 体重タブ
  // =====================================================
  function renderWeight() {
    const root = $('#tab-weight');
    const all = Store.weights();
    const p = Store.profile();
    const today = Store.today();
    const todayRec = all.find(w => w.date === today);
    const latest = all.length ? all[all.length - 1] : null;
    const ago7 = latest ? all.filter(w => w.date <= Store.addDays(latest.date, -7)).pop() : null;
    const first = all[0];
    const delta = (a, b) => (a && b) ? Math.round((a.kg - b.kg) * 10) / 10 : null;
    const fmtDelta = d => d == null ? '–' : (d > 0 ? '+' : '') + d.toFixed(1);
    const cls = d => d == null ? '' : (d < 0 ? 'down' : d > 0 ? 'up' : '');
    const d7 = delta(latest, ago7), dAll = delta(latest, first);

    root.innerHTML = `
      <div class="card">
        <h2>${todayRec ? '今日の体重（記録済み・上書き可）' : '今日の体重を記録'}</h2>
        <div class="row"><div class="unit row" style="flex:1"><input type="number" inputmode="decimal" step="0.1" id="w-input" value="${todayRec ? todayRec.kg : (latest ? latest.kg : '')}" placeholder="例: 65.2"><span>kg</span></div>
          <button class="btn primary" id="w-save">保存</button></div>
        <div class="grid2" style="margin-top:8px">
          ${compField('w-sm', 'sm', todayRec && todayRec.sm, todayRec ? todayRec.kg : (latest && latest.kg), '（任意）', 'margin:0')}
          ${compField('w-bf', 'bf', todayRec && todayRec.bf, todayRec ? todayRec.kg : (latest && latest.kg), '（任意）', 'margin:0')}
        </div>
        <div class="stats">
          <div><div class="v">${latest ? latest.kg.toFixed(1) : '–'}</div><div class="k">最新 (kg)</div></div>
          <div><div class="v ${cls(d7)}">${fmtDelta(d7)}</div><div class="k">7日前比</div></div>
          <div><div class="v ${cls(dAll)}">${fmtDelta(dAll)}</div><div class="k">開始時比${first ? ' (' + first.date.slice(5).replace('-', '/') + '〜)' : ''}</div></div>
        </div>
        ${latest && p.height ? `<div class="row between" style="margin-top:8px"><small>BMI ${Calc.bmi(latest.kg, p.height)}</small>${p.targetWeight ? `<small>目標 ${p.targetWeight} kg まで あと ${Math.max(0, Math.round((latest.kg - p.targetWeight) * 10) / 10)} kg</small>` : ''}</div>` : ''}
      </div>
      <div class="card">
        <div class="row between"><h2 style="margin:0">推移</h2>
          <div class="seg range" style="margin:0">${[30, 90, 365].map(r => `<button data-range="${r}" class="${state.range === r ? 'on' : ''}">${r === 365 ? '1年' : r + '日'}</button>`).join('')}</div></div>
        <div class="chart-wrap" id="chart"></div>
        <div class="legend"><span><i></i>体重</span><span><i class="ma"></i>7日平均</span>${p.targetWeight ? `<span><i style="border-top:1px dotted var(--muted)"></i>目標 ${p.targetWeight} kg</span>` : ''}</div>
      </div>
      <div class="card" id="balance-card"></div>
      <div class="card">
        <h2>履歴</h2>
        ${all.length ? `<table class="simple">${all.slice().reverse().slice(0, 30).map(w => `<tr><td>${w.date}</td><td>${w.kg.toFixed(1)} kg${w.sm || w.bf ? `<br><small class="muted">${w.sm ? `筋 ${compUnit('sm') === 'kg' ? (w.kg * w.sm / 100).toFixed(1) + 'kg' : w.sm + '%'}` : ''}${w.sm && w.bf ? '・' : ''}${w.bf ? `脂 ${compUnit('bf') === 'kg' ? (w.kg * w.bf / 100).toFixed(1) + 'kg' : w.bf + '%'}` : ''}</small>` : ''}</td><td><button class="btn small danger" data-wdel="${w.date}">削除</button></td></tr>`).join('')}</table>` : '<div class="empty">まだ記録がありません</div>'}
      </div>`;

    $('#w-save').onclick = () => {
      const v = parseFloat($('#w-input').value);
      if (!(v > 20 && v < 300)) { toast('体重を正しく入力してください'); return; }
      const comp = readComposition($('#w-sm'), $('#w-bf'), v);
      if (!comp) return;
      Store.setWeight(today, Math.round(v * 10) / 10, comp); renderWeight(); toast('体重を記録しました');
    };
    bindCompUnits(root, $('#w-input'));
    $$('[data-range]', root).forEach(b => b.onclick = () => { state.range = +b.dataset.range; renderWeight(); });
    $$('[data-wdel]', root).forEach(b => b.onclick = () => { if (confirm(`${b.dataset.wdel} の記録を削除しますか？`)) { Store.deleteWeight(b.dataset.wdel); renderWeight(); } });
    drawWeightChart($('#chart', root), all, p.targetWeight);
    renderBalance($('#balance-card', root));
  }

  // ---------- カロリー収支の答え合わせ ----------
  function renderBalance(card) {
    if (!state.balDays) state.balDays = balanceFor(28).ready ? 28 : 14;
    const r = balanceFor(state.balDays);
    const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString();
    const seg = `<div class="seg range" style="margin:0">${[14, 28].map(d => `<button data-bal="${d}" class="${state.balDays === d ? 'on' : ''}">${d}日</button>`).join('')}</div>`;
    const period = `${r.from.slice(5).replace('-', '/')}〜${r.to.slice(5).replace('-', '/')}`;

    let body;
    if (!r.ready) {
      const lacks = [];
      if (r.need.weighins) lacks.push(`体重 あと${r.need.weighins}回`);
      if (r.need.span) lacks.push(`体重の記録期間 あと${r.need.span}日`);
      if (r.need.intakeDays) lacks.push(`食事の記録 あと${r.need.intakeDays}日`);
      body = `<div class="notice info">答え合わせにはデータが足りません（${lacks.join('・')}）。</div>
        <small class="muted">体重は毎日ぶれるので（水分で±1kg ≒ 7,000kcal 相当）、最低でも2週間分の体重と食事の記録から傾向を出します。</small>`;
    } else {
      const ok = isPlausible(r);
      const verdict = r.gap == null ? '' :
        Math.abs(r.gap) <= Math.max(150, r.margin) ? '計算式の推定とほぼ一致しています。'
        : r.gap > 0 ? `計算式より <b>${r.gap} kcal/日 多く</b>消費している計算です（記録より食べていないか、活動量が多い）。`
        : `計算式より <b>${-r.gap} kcal/日 少なく</b>しか消費していない計算です（記録漏れ・量の過小評価、または活動量が少ない）。`;
      body = `
        <div class="kv"><span>平均摂取（記録 ${r.intakeDayCount}/${r.days}日）</span><b>${r.avgIntake.toLocaleString()} kcal/日</b></div>
        <div class="kv"><span>体重の傾向（体重 ${r.weighins}回）</span><b>${r.kgPerWeek > 0 ? '+' : ''}${r.kgPerWeek.toFixed(2)} kg/週</b></div>
        <div class="kv"><span>体重から逆算した実際の収支</span><b>${signed(r.actualBalance)} <small>±${r.margin.toLocaleString()}</small> kcal/日</b></div>
        ${r.plannedBalance != null ? `<div class="kv"><span>計算式どおりなら期待される収支</span><b>${signed(r.plannedBalance)} kcal/日</b></div>` : ''}
        <div class="kv"><span><b>実測TDEE</b>（摂取 − 収支）</span><b>${r.measuredTdee.toLocaleString()} kcal/日</b></div>
        ${r.expectedTdee ? `<div class="kv"><span>計算式のTDEE＋記録した運動</span><b>${r.expectedTdee.toLocaleString()} kcal/日</b></div>` : ''}
        ${verdict ? `<div class="notice ${ok ? 'info' : ''}" style="margin-top:10px">${verdict}${ok ? '' : '<br>差が大きすぎるので、記録漏れの日を除外するか期間を延ばしてください。目標計算には使いません。'}</div>` : ''}
        ${r.margin > 300 ? `<small class="muted">誤差幅が大きい（±${r.margin} kcal）ので、体重を毎日同じ条件で測るか、28日で見てください。</small>` : ''}`;
    }

    card.innerHTML = `<div class="row between"><h2 style="margin:0">カロリー収支の答え合わせ</h2>${seg}</div>
      <small class="muted">${period}・今日は記録途中のため除外</small>
      <div class="chart-wrap" id="intake-chart"></div>
      <div class="legend"><span><i style="border-top:8px solid var(--p);width:10px;border-radius:2px"></i>摂取 kcal</span>${r.ready ? `<span><i style="border-top-color:var(--ink2)"></i>実測TDEE</span>` : ''}${r.expectedTdee || (!r.ready && Calc.tdee(Store.profile(), currentWeight())) ? `<span><i style="border-top:1.5px dashed var(--muted)"></i>計算式TDEE</span>` : ''}<span><i style="border-top:8px solid var(--line);width:10px;border-radius:2px"></i>除外日</span></div>
      <div style="margin-top:8px">${body}</div>`;

    $$('[data-bal]', card).forEach(b => b.onclick = () => { state.balDays = +b.dataset.bal; renderBalance(card); });
    drawIntakeChart($('#intake-chart', card), r);
  }

  // 日ごとの摂取を棒で、実測TDEE・計算式TDEE を水平線で重ねる（単位は同じ kcal なので1軸）
  function drawIntakeChart(container, r) {
    const daily = r.daily;
    if (!daily.some(d => d.logged)) { container.innerHTML = '<div class="empty">この期間の食事記録がありません</div>'; return; }
    const formula = r.expectedTdee || Calc.tdee(Store.profile(), currentWeight()) || 0;
    const measured = r.ready ? r.measuredTdee : 0;
    const W = Math.max(280, container.clientWidth || 320), H = 180;
    const pad = { l: 38, r: 12, t: 10, b: 22 };
    const yMax = Math.ceil(Math.max(...daily.map(d => d.kcal), formula, measured, 1000) * 1.1 / 500) * 500;
    const step = niceStep(yMax / 4);
    const iw = W - pad.l - pad.r, bw = iw / daily.length;
    const X = i => pad.l + i * bw, Y = v => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
    const base = Y(0);
    const yTicks = []; for (let v = 0; v <= yMax; v += step) yTicks.push(v);
    const labelEvery = Math.ceil(daily.length / 5);
    const bar = (d, i) => {
      if (!d.logged) return '';
      const x = X(i) + 1, w = Math.max(2, bw - 2), y = Y(d.kcal), h = Math.max(0, base - y);
      const rr = Math.min(4, w / 2, h);
      // 上端だけ角丸、底は基線に接地
      const path = `M${x},${base} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${base} Z`;
      return `<path d="${path}" fill="${d.incomplete ? 'var(--line)' : 'var(--p)'}"/>`;
    };
    const hline = (v, cls, label) => v ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="${cls}"/>` : '';
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
      <g class="grid">${yTicks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
      <g class="axis">${yTicks.map(v => `<text x="${pad.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v >= 1000 ? (v / 1000) + 'k' : v}</text>`).join('')}
        ${daily.map((d, i) => ((daily.length - 1 - i) % labelEvery === 0) ? `<text x="${X(i) + bw / 2}" y="${H - 6}" text-anchor="middle">${d.date.slice(5).replace('-', '/')}</text>` : '').join('')}</g>
      <g>${daily.map(bar).join('')}</g>
      ${hline(formula, 'formula-line')}
      ${hline(measured, 'measured-line')}
      <g id="ihover"></g>
      ${daily.map((d, i) => `<rect class="hit" data-i="${i}" x="${X(i)}" y="0" width="${bw}" height="${H}"/>`).join('')}
    </svg><div class="tip hidden" id="itip"></div>`;

    const svg = $('svg', container), tip = $('#itip', container), hov = $('#ihover', container);
    const show = (i) => {
      const d = daily[i]; const rect = svg.getBoundingClientRect();
      hov.innerHTML = `<rect x="${X(i)}" y="${pad.t}" width="${bw}" height="${base - pad.t}" fill="var(--ink)" opacity=".06"/>`;
      const diff = measured && d.logged ? d.kcal - measured : null;
      tip.innerHTML = `${d.date.slice(5).replace('-', '/')}　${d.logged ? `<b>${d.kcal.toLocaleString()}</b> kcal${diff != null ? `　<span style="opacity:.7">実測TDEE比 ${diff > 0 ? '+' : ''}${diff}</span>` : ''}${d.incomplete ? '（除外）' : ''}` : '記録なし'}`;
      tip.classList.remove('hidden');
      tip.style.left = `${Math.min(Math.max((X(i) + bw / 2) / W * rect.width, 80), rect.width - 80)}px`;
      tip.style.top = `${(d.logged ? Y(d.kcal) : base) / H * rect.height - 6}px`;
    };
    const hide = () => { hov.innerHTML = ''; tip.classList.add('hidden'); };
    const idxAt = (clientX) => { const rect = svg.getBoundingClientRect(); return Math.min(daily.length - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width * W - pad.l) / bw))); };
    svg.onmousemove = e => show(idxAt(e.clientX));
    svg.onmouseleave = hide;
    svg.ontouchstart = svg.ontouchmove = e => show(idxAt(e.touches[0].clientX));
    svg.ontouchend = () => setTimeout(hide, 1500);
  }

  function drawWeightChart(container, all, targetWeight) {
    const from = Store.addDays(Store.today(), -state.range + 1);
    const pts = all.filter(w => w.date >= from);
    if (pts.length < 2) {
      container.innerHTML = `<div class="empty">${pts.length === 1 ? 'もう1日記録するとグラフになります' : 'この期間の記録がありません'}</div>`;
      return;
    }
    const ma = Calc.movingAvg(all).filter(w => w.date >= from);
    const W = Math.max(280, container.clientWidth || 320), H = 220;
    const pad = { l: 38, r: 12, t: 12, b: 24 };
    const x0 = Calc.dayNum(from), x1 = Calc.dayNum(Store.today());
    // y の範囲は実測値と移動平均で決める。目標線は範囲内に入る時だけ描く（遠い目標でグラフが潰れないように）
    const ys = pts.map(p => p.kg).concat(ma.map(m => m.kg));
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    const span = Math.max(1, yMax - yMin);
    yMin = Math.floor((yMin - span * 0.15) * 2) / 2; yMax = Math.ceil((yMax + span * 0.15) * 2) / 2;
    const showTarget = targetWeight && targetWeight >= yMin && targetWeight <= yMax;
    const X = d => pad.l + (Calc.dayNum(d) - x0) / Math.max(1, x1 - x0) * (W - pad.l - pad.r);
    const Y = v => pad.t + (yMax - v) / (yMax - yMin) * (H - pad.t - pad.b);
    const path = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ');

    // y 目盛（4本程度）
    const step = niceStep((yMax - yMin) / 4);
    const yTicks = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
    // x 目盛（月初 or 期間に応じて）
    const xTicks = [];
    const nTicks = state.range <= 30 ? 5 : 4;
    for (let i = 0; i <= nTicks; i++) {
      const d = Store.addDays(from, Math.round((x1 - x0) * i / nTicks));
      xTicks.push(d);
    }

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
      <g class="grid">${yTicks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
      <g class="axis">${yTicks.map(v => `<text x="${pad.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`).join('')}
        ${xTicks.map(d => `<text x="${X(d)}" y="${H - 6}" text-anchor="middle">${d.slice(5).replace('-', '/')}</text>`).join('')}</g>
      ${showTarget ? `<line class="target" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(targetWeight)}" y2="${Y(targetWeight)}"/>` : ''}
      <path class="ma" d="${path(ma)}"/>
      <path class="line" d="${path(pts)}"/>
      <g class="dots">${pts.length <= 60 ? pts.map(p => `<circle class="dot" r="3.5" cx="${X(p.date)}" cy="${Y(p.kg)}"/>`).join('') : ''}</g>
      <g id="hover"></g>
      <rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}"/>
    </svg><div class="tip hidden" id="tip"></div>`;

    const svg = $('svg', container), hover = $('#hover', container), tip = $('#tip', container);
    const show = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const mx = (clientX - rect.left) / rect.width * W;
      let best = pts[0], bd = Infinity;
      pts.forEach(p => { const d = Math.abs(X(p.date) - mx); if (d < bd) { bd = d; best = p; } });
      const cx = X(best.date), cy = Y(best.kg);
      hover.innerHTML = `<line class="cross" x1="${cx}" x2="${cx}" y1="${pad.t}" y2="${H - pad.b}"/><circle class="dot" r="5" cx="${cx}" cy="${cy}"/>`;
      const m = ma.find(x => x.date === best.date);
      tip.innerHTML = `${best.date.slice(5).replace('-', '/')}　<b>${best.kg.toFixed(1)}</b> kg${m ? `　<span style="opacity:.7">avg ${m.kg.toFixed(1)}</span>` : ''}`;
      tip.classList.remove('hidden');
      tip.style.left = `${cx / W * rect.width}px`; tip.style.top = `${cy / H * rect.height - 8}px`;
    };
    const hide = () => { hover.innerHTML = ''; tip.classList.add('hidden'); };
    svg.onmousemove = e => show(e.clientX);
    svg.onmouseleave = hide;
    svg.ontouchstart = svg.ontouchmove = e => { show(e.touches[0].clientX); };
    svg.ontouchend = () => setTimeout(hide, 1500);
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  // =====================================================
  // 体型タブ: 今の見た目と、体重ごとの見た目
  // =====================================================
  function currentBody() {
    const p = Store.profile();
    const w = Store.latestWeight();
    if (!w || !p.height) return null;
    // 骨格筋率・体脂肪率は、最新の体重の日に無ければ直近の測定値を使う
    const comp = (w.sm || w.bf) ? w : Store.latestComposition();
    // 除脂肪量・筋肉量は体重とセットの値なので、同じ日の測定のときだけ使う（別の日の体重と組み合わせると矛盾する）
    const sameDay = comp && comp.date === w.date;
    return Body.estimate({
      sex: p.sex, age: p.age, height: p.height, weight: w.kg, inseam: p.inseam,
      sm: comp && comp.sm, bf: comp && comp.bf,
      ffm: sameDay ? comp.ffm : null, mm: sameDay ? comp.mm : null, seg: comp && comp.seg,
    });
  }
  const METHOD_TEXT = {
    bf: '体組成計の体脂肪率をそのまま使っています。',
    ffm: '体重 − 除脂肪量 から体脂肪率を計算しています。',
    mm: '筋肉量に骨量（除脂肪量の約5%）を足して除脂肪量を推定し、体脂肪率を計算しています。',
    sm: '骨格筋率から体脂肪率を換算しています（体組成計の標準範囲からの近似。±5%程度ずれます）。体脂肪率も表示される機種なら、その値を入れると正確になります。',
    bmi: 'BMIと年齢からの推定です。筋肉が多い人は体脂肪率が高めに出ます。骨格筋率か体脂肪率を入れてください。',
  };
  const numField = (id, label, unit, val, ph) => `<div class="field"><label>${label}</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="${id}" value="${val}" placeholder="${ph}"><span>${unit}</span></div></div>`;
  function fmtSigned(v, unit) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1) + unit; }

  function renderBody() {
    const root = $('#tab-body');
    const p = Store.profile();
    const w = Store.latestWeight();
    const today = Store.today();
    const todayRec = Store.weights().find(x => x.date === today);
    const lastComp = Store.latestComposition();
    // 今日の記録があればそれ、無ければ直近の測定値を初期表示にする
    const src = todayRec && (todayRec.ffm || todayRec.mm || todayRec.seg) ? todayRec : lastComp;
    const detailVal = k => src && src[k] ? src[k] : '';
    const segVal = k => src && src.seg && src.seg[k] ? src.seg[k] : '';

    const inputCard = `<div class="card">
      <h2>あなたの数値</h2>
      <div class="seg" id="b-sex" style="margin-bottom:10px">${[['male', '男性'], ['female', '女性']].map(([k, l]) => `<button data-sex="${k}" class="${p.sex === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="grid2">
        <div class="field"><label>身長</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="b-height" value="${p.height ?? ''}" placeholder="例: 172"><span>cm</span></div></div>
        <div class="field"><label>股下（脚の長さ）</label><div class="unit"><input type="number" inputmode="decimal" step="0.5" id="b-inseam" value="${p.inseam ?? ''}" placeholder="例: 78"><span>cm</span></div></div>
        <div class="field"><label>体重（今日）</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="b-weight" value="${todayRec ? todayRec.kg : (w ? w.kg : '')}" placeholder="例: 68.0"><span>kg</span></div></div>
        ${compField('b-sm', 'sm', todayRec && todayRec.sm ? todayRec.sm : (lastComp && lastComp.sm), todayRec ? todayRec.kg : (w && w.kg))}
        ${compField('b-bf', 'bf', todayRec && todayRec.bf ? todayRec.bf : (lastComp && lastComp.bf), todayRec ? todayRec.kg : (w && w.kg), '（あれば）')}
      </div>
      <details class="more" ${lastComp && (lastComp.ffm || lastComp.mm || lastComp.seg) ? 'open' : ''}>
        <summary>体組成計の詳しい値（除脂肪量・筋肉量・部位別）</summary>
        <div class="grid2" style="margin-top:8px">
          ${numField('b-ffm', '除脂肪量', 'kg', detailVal('ffm'), '例: 55.6')}
          ${numField('b-mm', '筋肉量', 'kg', detailVal('mm'), '例: 52.8')}
        </div>
        <small class="muted">部位別筋肉量（右・左は本人から見た向き）</small>
        ${numField('b-trunk', '体幹部', 'kg', segVal('trunk'), '例: 27.5')}
        <div class="grid2">
          ${numField('b-ra', '右腕', 'kg', segVal('ra'), '例: 3.2')}
          ${numField('b-la', '左腕', 'kg', segVal('la'), '例: 3.1')}
          ${numField('b-rl', '右足', 'kg', segVal('rl'), '例: 10.1')}
          ${numField('b-ll', '左足', 'kg', segVal('ll'), '例: 10.0')}
        </div>
      </details>
      <button class="btn primary block" id="b-save">保存して見た目を更新</button>
      ${lastComp && lastComp.date !== today ? `<small class="muted">骨格筋率・体脂肪率は ${lastComp.date.slice(5).replace('-', '/')} の測定値を表示しています。</small>` : ''}
    </div>`;

    const cur = currentBody();
    if (!cur) {
      root.innerHTML = inputCard + `<div class="card"><div class="notice info">身長と体重を入れると、今の体のイラストと、体重ごとの見た目の予測を表示します。</div></div>`;
      bindBodyInputs(root);
      return;
    }

    const dCur = Body.describe(cur.sex, cur.bf);
    if (state.simW == null) state.simW = p.targetWeight || Math.round((cur.weight - 5) * 2) / 2;
    const minW = Math.max(35, Math.floor(cur.weight - 25)), maxW = Math.ceil(cur.weight + 10);
    state.simW = Math.min(maxW, Math.max(minW, state.simW));
    if (state.trained == null) state.trained = true;

    root.innerHTML = `${inputCard}
      <div class="card">
        <h2>今の体</h2>
        ${Body.svg(cur, { width: 150, label: '今の体' })}
        ${cur.segRatio || cur.inseam ? `<div class="muted" style="text-align:center;font-size:11px">正面から見た図（あなたの右側は画面の左）${cur.inseam ? `・股下 ${cur.inseam}cm` : ''}</div>` : ''}
        <div style="text-align:center"><div class="tier">${dCur.label}</div><div class="tier-text">${dCur.text}</div></div>
        <div class="bstats">
          <div><div class="v">${cur.bf}%</div><div class="k">体脂肪率${cur.method === 'sm' || cur.method === 'bmi' ? '（推定）' : ''}</div></div>
          <div><div class="v">${cur.ffm}</div><div class="k">除脂肪 kg</div></div>
          <div><div class="v">${cur.fatKg}</div><div class="k">脂肪 kg</div></div>
          <div><div class="v">${cur.ffmiNorm}</div><div class="k">FFMI</div></div>
        </div>
        <small class="muted" style="display:block;margin-top:8px">${METHOD_TEXT[cur.method]} FFMIは身長あたりの筋肉量で、一般男性18〜20・筋トレ継続者21〜23・天然の上限が約25（女性はおよそ−3）。</small>
      </div>
      ${segCard(cur)}
      <div class="card" id="sim-card"></div>
      <div class="card">
        <h2>体重ごとの見た目</h2>
        <small class="muted">タップすると上の比較に反映します。</small>
        <div class="strip" id="strip"></div>
      </div>`;
    bindBodyInputs(root);
    renderSim(cur);
    renderStrip(cur);
  }

  // 部位別の筋肉: 身長に対する標準を100%として比べる
  function segCard(cur) {
    if (!cur.segRatio) return '';
    const r = cur.segRatio, kg = cur.segKg;
    const rows = [['trunk', '体幹部'], ['ra', '右腕'], ['la', '左腕'], ['rl', '右足'], ['ll', '左足']].filter(([k]) => r[k]);
    const max = Math.max(1.4, ...rows.map(([k]) => r[k]));
    const bar = ([k, label]) => {
      const pct = Math.round(r[k] * 100);
      return `<div class="segrow"><span class="n">${label}</span>
        <div class="track"><div class="fill" style="width:${r[k] / max * 100}%"></div><div class="ref" style="left:${1 / max * 100}%"></div></div>
        <span class="v"><b>${kg[k].toFixed(1)}</b>kg <span class="${pct >= 100 ? 'up' : 'dn'}">${pct}%</span></span></div>`;
    };
    const notes = [];
    const diff = (a, b, name) => {
      if (!kg[a] || !kg[b]) return;
      const d = (kg[a] - kg[b]) / ((kg[a] + kg[b]) / 2) * 100;
      if (Math.abs(d) < 4) return;
      const big = d > 0 ? '右' : '左', small = d > 0 ? '左' : '右';
      notes.push(`${big}${name}が${small}${name}より <b>${Math.abs(d).toFixed(0)}%</b> 多い。${Math.abs(d) >= 10 ? `差が大きいので、${small}側から先に始めて回数をそろえる片側種目（${name === '腕' ? 'ダンベルカール・ワンハンドロー等' : 'ブルガリアンスクワット・ランジ等'}）で埋めるのがおすすめ。` : name === '腕' ? '利き腕側が多いのは普通の範囲。' : '日常の癖で出る程度の差。'}`);
    };
    diff('ra', 'la', '腕'); diff('rl', 'll', '足');
    const up = ['trunk', 'ra', 'la'].filter(k => r[k]).map(k => r[k]);
    const lo = ['rl', 'll'].filter(k => r[k]).map(k => r[k]);
    if (up.length && lo.length) {
      const u = up.reduce((a, b) => a + b) / up.length, l = lo.reduce((a, b) => a + b) / lo.length;
      if (l - u > 0.1) notes.push('上半身より下半身の筋肉が多め。自転車通学の効果が出やすい部位なので、上半身（胸・背中・肩）の種目を増やすと見た目のバランスが整う。');
      else if (u - l > 0.1) notes.push('下半身が上半身に比べて少なめ。スクワットやランジを入れると体全体の筋肉量が増え、消費カロリーも上がる。');
    }
    const sum = Object.values(kg).reduce((a, b) => a + b, 0);
    const mm = (Store.latestComposition() || {}).mm;
    const allSeg = rows.length === 5;
    return `<div class="card">
      <h2>部位別の筋肉</h2>
      <small class="muted">身長 ${cur.height}cm に対する標準（縦線）を100%として比べています。</small>
      <div class="segbars">${rows.map(bar).join('')}</div>
      ${notes.map(n => `<div class="notice info" style="margin:8px 0 0">${n}</div>`).join('')}
      ${allSeg && mm && Math.abs(sum - mm) / mm > 0.08 ? `<small class="muted" style="display:block;margin-top:8px">部位別の合計（${sum.toFixed(1)}kg）が筋肉量（${mm}kg）と8%以上ずれています。入力ミスがないか確認してください。</small>` : ''}
    </div>`;
  }

  function renderSim(cur) {
    const card = $('#sim-card');
    const minW = Math.max(35, Math.floor(cur.weight - 25)), maxW = Math.ceil(cur.weight + 10);
    // スライダーは作り直さない（ドラッグ中に作り直すと指が離れた扱いになる）ので、中身だけ別に更新する
    card.innerHTML = `<div class="row between"><h2 style="margin:0">体重を変えたら</h2>
        <div class="seg range" style="margin:0"><button data-tr="1" class="${state.trained ? 'on' : ''}">筋トレあり</button><button data-tr="0" class="${state.trained ? '' : 'on'}">なし</button></div></div>
      <input type="range" id="sim-range" min="${minW}" max="${maxW}" step="0.5" value="${state.simW}" aria-label="体重">
      <div class="row between" style="margin:-4px 2px 6px"><small class="muted">${minW} kg</small><small class="muted">${maxW} kg</small></div>
      <div id="sim-body"></div>`;
    $('#sim-range', card).oninput = (e) => { state.simW = +e.target.value; updateSim(cur); markStrip(); };
    $$('[data-tr]', card).forEach(b => b.onclick = () => { state.trained = b.dataset.tr === '1'; renderSim(cur); renderStrip(cur); });
    updateSim(cur);
  }
  function updateSim(cur) {
    const range = $('#sim-range'); if (range && +range.value !== state.simW) range.value = state.simW;
    const sim = Body.project(cur, state.simW, state.trained);
    const d = Body.describe(sim.sex, sim.bf, sim.depleted);
    const dw = Math.round((sim.weight - cur.weight) * 10) / 10, dFat = sim.fatKg - cur.fatKg, dFfm = sim.ffm - cur.ffm;
    const cls = v => v < 0 ? 'good' : v > 0 ? 'bad' : '';
    $('#sim-body').innerHTML = `
      <div class="fig-pair">
        <div>${Body.svg(cur, { width: 130, label: '今' })}<div class="cap">今<b>${cur.weight.toFixed(1)} kg</b>体脂肪 ${cur.bf}%</div></div>
        <div>${Body.svg(sim, { width: 130, label: sim.weight + 'kg' })}<div class="cap">${dw === 0 ? '同じ体重' : fmtSigned(dw, ' kg')}<b>${sim.weight.toFixed(1)} kg</b>体脂肪 ${sim.bf}%</div></div>
      </div>
      <div style="text-align:center;margin-top:6px"><div class="tier">${d.label}</div><div class="tier-text">${d.text}</div></div>
      ${dw !== 0 ? `<div class="row" style="justify-content:center;gap:14px;margin-top:6px">
        <span class="delta ${cls(dFat)}">脂肪 ${fmtSigned(dFat, 'kg')}</span><span class="delta ${dFfm < 0 ? 'bad' : dFfm > 0 ? 'good' : ''}">除脂肪 ${fmtSigned(dFfm, 'kg')}</span></div>` : ''}
      ${sim.depleted || Body.tooLean(sim.sex, sim.bf) ? `<div class="notice">この体脂肪率は健康を損なうリスクが高い水準です。目標にしないでください。</div>` : ''}
      <small class="muted" style="display:block;margin-top:8px">${state.trained ? '筋トレとタンパク質を続けた場合、減った体重の約85%が脂肪という前提です。' : '筋トレなしで食事だけで落とした場合、減った体重の約30%が筋肉などになる前提です。'}増量は増えた分の約60%が脂肪と仮定しています。</small>`;
  }

  function renderStrip(cur) {
    const p = Store.profile();
    const weights = new Set();
    for (let d = 5; d >= -20; d -= 2.5) { const x = Math.round((cur.weight + d) * 2) / 2; if (x >= 35) weights.add(x); }
    weights.add(cur.weight);
    if (p.targetWeight) weights.add(p.targetWeight);
    // 「痩せすぎ」は最初の1つだけ並べ、それより軽い体重は出さない
    const list = [];
    for (const x of [...weights].sort((a, b) => b - a)) {
      const e = x === cur.weight ? cur : Body.project(cur, x, state.trained);
      list.push([x, e]);
      if (e.depleted) break;
    }
    $('#strip').innerHTML = list.map(([x, e]) => {
      const d = Body.describe(e.sex, e.bf, e.depleted);
      const tag = x === cur.weight ? '<span class="tag gray">今</span>' : (p.targetWeight === x ? '<span class="tag">目標</span>' : '<span class="tag" style="visibility:hidden">-</span>');
      return `<button data-w="${x}" class="${x === cur.weight ? 'now' : ''}">${tag}${Body.svg(e, { width: 70, label: x + 'kg' })}
        <div class="w">${x.toFixed(1)}</div><div class="b">${e.bf}%</div><div class="l">${d.label}</div></button>`;
    }).join('');
    $$('#strip button').forEach(b => b.onclick = () => { state.simW = +b.dataset.w; updateSim(cur); markStrip(); $('#sim-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    markStrip();
  }
  function markStrip() { $$('#strip button').forEach(b => b.classList.toggle('sel', +b.dataset.w === state.simW)); }

  // 除脂肪量・筋肉量・部位別の検証。空欄はその項目を消す。不正なら null
  function readDetails(root, weight) {
    const v = id => { const el = $('#' + id, root); return el.value === '' ? 0 : parseFloat(el.value); };
    const checks = [
      ['b-ffm', '除脂肪量', 15, weight], ['b-mm', '筋肉量', 15, weight],
      ['b-trunk', '体幹部', 5, 60], ['b-ra', '右腕', 0.5, 10], ['b-la', '左腕', 0.5, 10], ['b-rl', '右足', 2, 25], ['b-ll', '左足', 2, 25],
    ];
    for (const [id, name, lo, hi] of checks) {
      const x = v(id);
      if (x && !(x >= lo && x <= hi)) { toast(`${name}は ${lo}〜${Math.round(hi * 10) / 10}kg の範囲で入力してください`); $('#' + id, root).focus(); return null; }
    }
    const ffm = v('b-ffm'), mm = v('b-mm');
    if (ffm && mm && mm > ffm) { toast('筋肉量が除脂肪量より多くなっています。入れ替わっていませんか'); return null; }
    return { ffm: ffm || null, mm: mm || null, seg: { trunk: v('b-trunk'), ra: v('b-ra'), la: v('b-la'), rl: v('b-rl'), ll: v('b-ll') } };
  }

  function bindBodyInputs(root) {
    bindCompUnits(root, $('#b-weight', root));
    let sex = Store.profile().sex;
    $$('#b-sex button', root).forEach(b => b.onclick = () => { sex = b.dataset.sex; $$('#b-sex button', root).forEach(x => x.classList.toggle('on', x === b)); });
    $('#b-save', root).onclick = () => {
      const h = parseFloat($('#b-height', root).value);
      const kg = parseFloat($('#b-weight', root).value);
      if (!(h > 100 && h < 230)) { toast('身長を正しく入力してください'); return; }
      if (!(kg > 20 && kg < 300)) { toast('体重を正しく入力してください'); return; }
      const comp = readComposition($('#b-sm', root), $('#b-bf', root), kg);
      if (!comp) return;
      const inseam = $('#b-inseam', root).value === '' ? null : parseFloat($('#b-inseam', root).value);
      if (inseam != null && !(inseam > h * 0.35 && inseam < h * 0.6)) { toast('股下は身長の35〜60%の範囲で入力してください'); $('#b-inseam', root).focus(); return; }
      const det = readDetails(root, kg);
      if (!det) return;
      Store.setProfile({ height: h, sex, inseam });
      Store.setWeight(Store.today(), Math.round(kg * 10) / 10, { ...comp, ...det });
      state.simW = null;
      renderBody(); toast('保存しました');
    };
  }

  // =====================================================
  // 運動タブ
  // =====================================================
  function renderExercise() {
    const root = $('#tab-exercise');
    const p = Store.profile();
    const weight = currentWeight();
    const list = Store.exercisesOn(state.date);
    const commute = p.commute || {};
    const hasCommute = commute.distanceKm || commute.minutes;
    const cm = hasCommute ? Calc.bike(commute.distanceKm, commute.minutes, weight) : null;

    // 今週（月曜始まり）
    const [y, m, d] = state.date.split('-').map(Number);
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
    const monday = Store.addDays(state.date, -dow);
    const week = Store.exercisesBetween(monday, Store.addDays(monday, 6));
    const wBikeKm = week.filter(e => e.type === 'bike').reduce((s, e) => s + (+e.km || 0), 0);
    const wStrength = week.filter(e => e.type === 'strength');
    const wVolume = wStrength.reduce((s, e) => s + (+e.volume || 0), 0);
    const wDays = new Set(wStrength.map(e => e.date)).size;

    root.innerHTML = `${dateNav()}
      ${!weight ? '<div class="notice">消費カロリーの計算には体重の記録が必要です（体重タブ）。</div>' : ''}
      <div class="card">
        <h2>自転車</h2>
        ${hasCommute ? `<button class="btn primary block" id="bike-commute" style="flex-direction:column;gap:0;line-height:1.3">通学を記録<small style="font-weight:400;color:inherit;opacity:.85">往復 ${cm.km} km・${cm.minutes} 分 ≈ ${cm.kcal} kcal</small></button>
          <div class="muted" style="margin:6px 0 10px">片道だけなら下の入力で。往復の距離・時間は設定タブで変更できます。</div>` :
          `<div class="notice">設定タブで通学の往復距離・時間を登録すると、1タップで記録できます。</div>`}
        <div class="grid2">
          <div class="field"><label>距離</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="bike-km" placeholder="${commute.distanceKm ? (commute.distanceKm / 2) : ''}"><span>km</span></div></div>
          <div class="field"><label>時間</label><div class="unit"><input type="number" inputmode="numeric" id="bike-min" placeholder="${commute.minutes ? Math.round(commute.minutes / 2) : ''}"><span>分</span></div></div>
        </div>
        <div class="row between"><small id="bike-preview">距離か時間を入れると消費カロリーを計算します</small><button class="btn" id="bike-save">記録</button></div>
      </div>
      <div class="card">
        <h2>筋トレ</h2>
        <button class="btn primary block" id="strength-add">＋ 種目を記録</button>
      </div>
      <div class="card">
        <h2>${fmtJa(state.date)} の運動</h2>
        ${list.length ? `<div class="list" style="margin:0 -16px -14px;border-radius:0 0 var(--radius) var(--radius)">${list.map(e => e.type === 'bike'
          ? `<div class="item"><div class="body"><div class="t">🚲 自転車 ${e.km} km・${e.minutes} 分</div><div class="s">${e.kmh} km/h ・ MET ${e.met}${e.note ? ' ・ ' + esc(e.note) : ''}</div></div><div class="kcal">${e.kcal}<small> kcal</small></div><button class="btn small danger" data-edel="${e.id}">削除</button></div>`
          : `<div class="item"><div class="body"><div class="t">🏋️ ${esc(e.name)}</div><div class="s">${e.sets.map(s => `${s.kg}kg×${s.reps}`).join(' / ')} ・ 総量 ${e.volume} kg${e.minutes ? ' ・ ' + e.minutes + '分' : ''}</div></div><div class="kcal">${e.kcal}<small> kcal</small></div><button class="btn small danger" data-edel="${e.id}">削除</button></div>`
        ).join('')}</div>` : '<div class="empty">まだ記録がありません</div>'}
      </div>
      <div class="card">
        <h2>今週（${monday.slice(5).replace('-', '/')}〜）</h2>
        <div class="week">
          <div><div class="v">${Math.round(wBikeKm * 10) / 10}</div><div class="k">自転車 km</div></div>
          <div><div class="v">${wDays}</div><div class="k">筋トレ日数</div></div>
          <div><div class="v">${wVolume.toLocaleString()}</div><div class="k">総挙上量 kg</div></div>
        </div>
      </div>`;

    bindDateNav(root, renderExercise);
    const preview = () => {
      const r = Calc.bike($('#bike-km').value, $('#bike-min').value, weight);
      $('#bike-preview').textContent = r.kcal ? `${r.km} km・${r.minutes} 分 → 約 ${r.kcal} kcal（${r.kmh} km/h, MET ${r.met}）` : '距離か時間を入れると消費カロリーを計算します';
    };
    $('#bike-km').oninput = $('#bike-min').oninput = preview;
    $('#bike-save').onclick = () => {
      const r = Calc.bike($('#bike-km').value, $('#bike-min').value, weight);
      if (!r.minutes) { toast('距離か時間を入力してください'); return; }
      Store.addExercise({ type: 'bike', date: state.date, ...r }); renderExercise(); toast('記録しました');
    };
    if (hasCommute) $('#bike-commute').onclick = () => {
      Store.addExercise({ type: 'bike', date: state.date, ...cm, note: '通学' }); renderExercise(); toast('通学を記録しました');
    };
    $('#strength-add').onclick = () => openStrengthSheet(weight);
    $$('[data-edel]', root).forEach(b => b.onclick = () => { if (confirm('この記録を削除しますか？')) { Store.deleteExercise(b.dataset.edel); renderExercise(); } });
  }

  function openStrengthSheet(weight) {
    const names = Store.strengthNames();
    const sheet = openSheet(`
      <h2>筋トレを記録</h2>
      <div class="field"><label>種目</label><input id="s-name" list="s-names" placeholder="例: ベンチプレス" autocomplete="off"><datalist id="s-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div id="s-prev"></div>
      <div class="sets" id="s-sets"></div>
      <button class="btn small" id="s-addset">＋ セット追加</button>
      <div class="field" style="margin-top:10px"><label>所要時間（任意・消費カロリー計算用）</label><div class="unit"><input type="number" inputmode="numeric" id="s-min" placeholder="例: 20"><span>分</span></div></div>
      <small id="s-preview" class="muted"></small>
      <div class="actions"><button class="btn" id="s-cancel">キャンセル</button><button class="btn primary" id="s-save">保存</button></div>`);

    const setsEl = $('#s-sets', sheet);
    const addSet = (kg = '', reps = '') => {
      const i = setsEl.children.length + 1;
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `<span class="n">${i}</span><div class="unit"><input type="number" inputmode="decimal" step="0.5" data-kg value="${kg}" placeholder="kg"></div><span class="x">×</span><div class="unit"><input type="number" inputmode="numeric" data-reps value="${reps}" placeholder="回"></div><button class="del" aria-label="削除">×</button>`;
      $('.del', row).onclick = () => { row.remove(); renumber(); preview(); };
      $$('input', row).forEach(x => x.oninput = preview);
      setsEl.appendChild(row);
    };
    const renumber = () => $$('.set-row .n', setsEl).forEach((n, i) => n.textContent = i + 1);
    const readSets = () => $$('.set-row', setsEl).map(r => ({ kg: +$('[data-kg]', r).value || 0, reps: +$('[data-reps]', r).value || 0 })).filter(s => s.reps > 0);
    const preview = () => {
      const sets = readSets();
      const vol = Calc.volume(sets);
      const kcal = Calc.strengthKcal($('#s-min', sheet).value, weight);
      $('#s-preview', sheet).textContent = sets.length ? `${sets.length} セット・総挙上量 ${vol.toLocaleString()} kg${kcal ? `・約 ${kcal} kcal` : ''}` : '';
    };
    const showPrev = () => {
      const last = Store.lastStrength($('#s-name', sheet).value, state.date);
      $('#s-prev', sheet).innerHTML = last ? `<div class="prev">前回 (${last.date.slice(5).replace('-', '/')}): ${last.sets.map(s => `${s.kg}kg×${s.reps}`).join(' / ')} ・ 総量 ${last.volume} kg　<a href="#" id="s-copy">コピー</a></div>` : '';
      const copy = $('#s-copy', sheet);
      if (copy) copy.onclick = (e) => { e.preventDefault(); setsEl.innerHTML = ''; last.sets.forEach(s => addSet(s.kg, s.reps)); preview(); };
    };
    $('#s-name', sheet).oninput = showPrev;
    $('#s-addset', sheet).onclick = () => { const prev = readSets().pop(); addSet(prev ? prev.kg : '', prev ? prev.reps : ''); };
    $('#s-min', sheet).oninput = preview;
    $('#s-cancel', sheet).onclick = closeSheet;
    $('#s-save', sheet).onclick = () => {
      const name = $('#s-name', sheet).value.trim();
      const sets = readSets();
      if (!name) { toast('種目名を入力してください'); return; }
      if (!sets.length) { toast('セットを入力してください'); return; }
      const minutes = +$('#s-min', sheet).value || 0;
      Store.addExercise({ type: 'strength', date: state.date, name, sets, volume: Calc.volume(sets), minutes, kcal: Calc.strengthKcal(minutes, weight) });
      closeSheet(); renderExercise(); toast('記録しました');
    };
    addSet(); addSet(); addSet();
  }

  // =====================================================
  // 設定タブ
  // =====================================================
  function renderSettings() {
    const root = $('#tab-settings');
    const p = Store.profile();
    const weight = currentWeight();
    const auto = Calc.targets({ ...p, targets: null }, weight, measuredTdeeForTargets());
    const manual = p.targets && p.targets.kcal;
    const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${l}</option>`).join('');

    root.innerHTML = `
      <div class="card">
        <h2>プロフィール</h2>
        <div class="grid2">
          <div class="field"><label>性別</label><select id="p-sex">${opt([['male', '男性'], ['female', '女性']], p.sex)}</select></div>
          <div class="field"><label>年齢</label><div class="unit"><input type="number" inputmode="numeric" id="p-age" value="${p.age ?? ''}"><span>歳</span></div></div>
          <div class="field"><label>身長</label><div class="unit"><input type="number" inputmode="decimal" id="p-height" value="${p.height ?? ''}"><span>cm</span></div></div>
          <div class="field"><label>目標体重（任意）</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="p-target-w" value="${p.targetWeight ?? ''}"><span>kg</span></div></div>
        </div>
        <div class="field"><label>活動レベル（運動は別途記録するので、日常生活の分だけ）</label>
          <select id="p-activity">${opt([[1.2, '1.2 ほぼ座っている'], [1.4, '1.4 通学・軽い移動あり（標準）'], [1.55, '1.55 立ち仕事や移動が多い'], [1.7, '1.7 肉体労働']], p.activity)}</select></div>
        <div class="field"><label>減量ペース</label>
          <select id="p-goal">${opt([[0, '維持（0 kg/週）'], [0.25, '-0.25 kg/週（ゆっくり）'], [0.5, '-0.5 kg/週（標準）'], [0.75, '-0.75 kg/週（速め）'], [1, '-1.0 kg/週（かなり厳しい）']], p.goalKgPerWeek)}</select></div>
        <div class="grid2">
          <div class="field"><label>タンパク質</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="p-prot" value="${p.proteinPerKg}"><span>g/kg</span></div></div>
          <div class="field"><label>脂質のカロリー比</label><div class="unit"><input type="number" inputmode="numeric" id="p-fat" value="${Math.round(p.fatRatio * 100)}"><span>%</span></div></div>
        </div>
        <button class="btn primary block" id="p-save">保存</button>
      </div>

      <div class="card">
        <h2>目標（自動計算）</h2>
        ${auto ? `
          <div class="kv"><span>基礎代謝 (BMR)</span><b>${auto.bmr} kcal</b></div>
          <div class="kv"><span>総消費 (TDEE)${auto.mode === 'measured' ? '・実測' : '・計算式'}</span><b>${auto.tdee} kcal</b></div>
          <div class="kv"><span>目標エネルギー</span><b>${auto.kcal} kcal</b></div>
          <div class="kv"><span>P / F / C</span><b>${auto.p} / ${auto.f} / ${auto.c} g</b></div>
          ${auto.belowBmr ? '<div class="notice">目標が基礎代謝を下回っています。ペースを緩めることを勧めます。</div>' : ''}
          <small class="muted">計算に使った体重: ${weight} kg（体重タブの最新値）</small>` : '<div class="empty">年齢・身長と体重の記録があると計算されます</div>'}
        <div class="toggle" style="margin-top:8px"><span>目標を手動で指定する</span><input type="checkbox" id="t-manual" ${manual ? 'checked' : ''}></div>
        <div id="t-fields" class="${manual ? '' : 'hidden'}">
          <div class="grid2">
            <div class="field"><label>kcal</label><input type="number" inputmode="numeric" id="t-kcal" value="${manual ? p.targets.kcal : (auto ? auto.kcal : '')}"></div>
            <div class="field"><label>P (g)</label><input type="number" inputmode="numeric" id="t-p" value="${manual ? p.targets.p : (auto ? auto.p : '')}"></div>
            <div class="field"><label>F (g)</label><input type="number" inputmode="numeric" id="t-f" value="${manual ? p.targets.f : (auto ? auto.f : '')}"></div>
            <div class="field"><label>C (g)</label><input type="number" inputmode="numeric" id="t-c" value="${manual ? p.targets.c : (auto ? auto.c : '')}"></div>
          </div>
          <button class="btn primary block" id="t-save">手動目標を保存</button>
        </div>
        <div class="toggle"><span>目標を実測TDEEで計算する<br><small class="muted">体重と食事の記録が2週間以上揃うと、計算式の代わりに実測値を使います</small></span><input type="checkbox" id="t-measured" ${p.useMeasuredTdee ? 'checked' : ''}></div>
        ${p.useMeasuredTdee ? `<small class="muted">現在: ${measuredTdeeForTargets() ? `実測TDEE ${measuredTdeeForTargets()} kcal を使用中` : 'データ不足または差が大きすぎるため、計算式を使用中'}</small>` : ''}
        <div class="toggle"><span>運動の消費カロリーを食事予算に加算する</span><input type="checkbox" id="t-addex" ${p.addExerciseToBudget ? 'checked' : ''}></div>
        <small class="muted">推定消費は過大になりがちなので、加算しない方が減量は安定します。</small>
      </div>

      <div class="card">
        <h2>自転車通学（往復）</h2>
        <div class="grid2">
          <div class="field"><label>往復距離</label><div class="unit"><input type="number" inputmode="decimal" step="0.1" id="c-km" value="${p.commute?.distanceKm ?? ''}"><span>km</span></div></div>
          <div class="field"><label>往復時間</label><div class="unit"><input type="number" inputmode="numeric" id="c-min" value="${p.commute?.minutes ?? ''}"><span>分</span></div></div>
        </div>
        <button class="btn primary block" id="c-save">保存</button>
      </div>

      <div class="card">
        <h2>写真からのAI推定（Claude API）</h2>
        <div class="field"><label>APIキー（この端末のブラウザにのみ保存）</label><input type="password" id="k-input" value="${esc(localStorage.getItem('diet.anthropicKey') || '')}" placeholder="sk-ant-..."></div>
        ${AI.keySource() === 'bitemap' ? '<small class="muted">BITEMAP で設定したキーを共用しています。ここで別のキーを保存すると、こちらが優先されます。</small>' : ''}
        <div class="row" style="margin-top:8px"><button class="btn primary" id="k-save">保存</button><button class="btn" id="k-clear">削除</button><small class="muted" style="margin-left:auto">状態: ${AI.hasApiKey() ? '設定済み' : '未設定'}</small></div>
        <small class="muted">モデル: ${AI.MODEL}。写真は縮小して送信し、料理ごとにkcal/PFCを推定します。量の見積もりは±30%程度ぶれるので、保存前に数値を確認してください。</small>
      </div>

      <div class="card">
        <h2>データ</h2>
        <div class="row"><button class="btn" id="d-export">書き出し (JSON)</button><button class="btn" id="d-import">読み込み</button><input type="file" id="d-file" accept="application/json" class="hidden"></div>
        <button class="btn danger" id="d-clear" style="margin-top:8px">すべて削除</button>
        <div style="margin-top:8px"><small class="muted">PFCログ ${APP_VERSION}</small></div>
      </div>`;

    $('#p-save').onclick = () => {
      Store.setProfile({
        sex: $('#p-sex').value, age: +$('#p-age').value || null, height: +$('#p-height').value || null,
        targetWeight: +$('#p-target-w').value || null, activity: +$('#p-activity').value, goalKgPerWeek: +$('#p-goal').value,
        proteinPerKg: +$('#p-prot').value || 2.0, fatRatio: Math.min(0.5, Math.max(0.1, (+$('#p-fat').value || 25) / 100)),
      });
      renderSettings(); toast('保存しました');
    };
    $('#t-manual').onchange = (e) => {
      if (e.target.checked) $('#t-fields').classList.remove('hidden');
      else { Store.setProfile({ targets: null }); renderSettings(); toast('自動計算に戻しました'); }
    };
    $('#t-save').onclick = () => {
      const t = { kcal: +$('#t-kcal').value, p: +$('#t-p').value, f: +$('#t-f').value, c: +$('#t-c').value };
      if (!(t.kcal > 0)) { toast('kcal を入力してください'); return; }
      Store.setProfile({ targets: t }); renderSettings(); toast('手動目標を保存しました');
    };
    $('#t-addex').onchange = (e) => { Store.setProfile({ addExerciseToBudget: e.target.checked }); };
    $('#t-measured').onchange = (e) => { Store.setProfile({ useMeasuredTdee: e.target.checked }); renderSettings(); };
    $('#c-save').onclick = () => {
      Store.setProfile({ commute: { distanceKm: +$('#c-km').value || null, minutes: +$('#c-min').value || null } });
      toast('保存しました');
    };
    $('#k-save').onclick = () => { AI.setApiKey($('#k-input').value); renderSettings(); toast('APIキーを保存しました'); };
    $('#k-clear').onclick = () => { AI.setApiKey(''); renderSettings(); toast('APIキーを削除しました'); };
    $('#d-export').onclick = () => {
      const blob = new Blob([Store.exportJson()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pfc-log-${Store.today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#d-import').onclick = () => $('#d-file').click();
    $('#d-file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm('現在のデータを読み込んだ内容で置き換えます。よろしいですか？')) return;
      try { Store.importJson(await f.text()); renderSettings(); toast('読み込みました'); }
      catch (err) { toast('読み込めませんでした: ' + err.message); }
    };
    $('#d-clear').onclick = () => { if (confirm('食事・体重・運動の記録をすべて削除します。よろしいですか？') && confirm('本当に削除しますか？')) { Store.clearAll(); renderSettings(); toast('削除しました'); } };
  }

  // ---------- 起動 ----------
  // ホーム画面アイコン長押しのショートカット（?tab=weight / ?action=meal）
  const params = new URLSearchParams(location.search);
  if (TITLES[params.get('tab')]) switchTab(params.get('tab')); else render();
  if (params.get('action') === 'meal') openMealSheet({ slot: guessSlot() });
  if (params.toString()) history.replaceState(null, '', location.pathname);

  // 開いたまま日付をまたいだら「今日」を進める（前日を見ていた場合はそのまま）
  let lastToday = Store.today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = Store.today();
    if (t !== lastToday) { if (state.date === lastToday) state.date = t; lastToday = t; if (!sheetOpen) render(); }
  });

  // ブラウザにデータを消されにくくする（ホーム画面追加時は通常許可される）
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener('resize', () => { if (state.tab === 'weight') renderWeight(); });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ローカル file:// 等では無視 */ });
  }
})();
