// 過去の写真のまとめて取り込み（v326〜）
//
// 写真アプリに眠っている食べ歩きの写真を、一度に最大 IMPORT_BATCH 枚選んで「日付×場所」ごとの訪問候補にまとめ、
// 店名（周辺検索の候補）と★を付けるだけで記録にする。1枚ずつ登録画面は開かない。
//  - 取り込み済みの写真は指紋（SHA-256）で判定して二重に入れない。飛ばした写真も端末に覚えて次回は出さない（切替可）
//  - 同じ日で、位置が GROUP_M 以内（位置情報が無ければ GROUP_HOURS 以内）の写真は 1 つの訪問候補
//  - 店は「自分の既存の店（120m以内）」→「周辺検索の候補（OpenPOI／地図データ）」の順に提案。無ければ店名の入力
//  - 料理ジャンルは AI 判定（開発者提供の中継 or 自分のキー）を候補ごとに 1 枚だけ自動で走らせる（bulk 枠: 1日200枚）
//  - ★が付いた候補だけを記録にする（★なしは飛ばす。仮の評価で統計を汚さない）
const Import = (() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const IMPORT_BATCH = 100;     // 一度に選べる枚数
  const GROUP_M = 100;          // 同じ訪問とみなす距離（m）
  const GROUP_HOURS = 3;        // 位置情報が無い写真を同じ訪問とみなす時間差
  const OWN_SHOP_M = 120;       // 既存の自分の店を提案する距離
  const SEARCH_RADIUS = 150;    // 周辺検索の半径
  const SKIP_LS = 'gourmet.importSkipped.v1'; // 飛ばした写真の指紋（端末に保存）

  let ov = null;          // モーダル
  let groups = [];        // 訪問候補
  let includeSkipped = false;
  let busy = false;
  let runToken = 0;
  let classifyPromise = null; // v396: 裏の AI 判定。記録するときに終わるのを待つ（待たずに保存するとジャンルが空になっていた）       // 開く・閉じる・「続けて写真を選ぶ」で進める。古い非同期の結果を捨てる印（v394〜）

  const loadSkipped = () => { try { return new Set(JSON.parse(localStorage.getItem(SKIP_LS) || '[]')); } catch { return new Set(); } };
  const saveSkipped = (set) => { try { localStorage.setItem(SKIP_LS, JSON.stringify([...set].slice(-5000))); } catch { /* noop */ } };

  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  // 「11月3日」（今年以外は「2025年11月3日」）。views.js の fmtDate と同じ形（Views からは公開されていないのでここに持つ）
  const fmtDay = (t) => { const d = new Date(t); if (isNaN(d)) return ''; const y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : ''; return `${y}${d.getMonth() + 1}月${d.getDate()}日`; };
  const fmtTime = (t) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const toTime = (d) => { if (d instanceof Date && !isNaN(d)) return d.getTime(); const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? null : t; };

  // ---------- 入口 ----------
  function init() {
    document.querySelectorAll('[data-import-open]').forEach(b => b.addEventListener('click', open));
  }
  function open() {
    if (ov) return;
    runToken++;
    groups = [];
    ov = document.createElement('div');
    ov.className = 'modal import-modal';
    ov.innerHTML = `<div class="modal-box">
      <div class="modal-head"><button type="button" class="modal-close im-close" aria-label="閉じる">${Views.icons.x}</button><h2>過去の写真をまとめて取り込む</h2></div>
      <div class="im-steps" id="im-steps">${['選ぶ', 'まとめる', '店名と★', '記録'].map((t, i) => `<span class="im-step" data-n="${i + 1}"><i>${i + 1}</i><span>${t}</span></span>`).join('')}</div><!-- 手順（v374〜） -->
      <div class="im-body">
        <div class="im-intro">
          <p>撮った日と場所ごとに1回の訪問にまとめます。店名と★を付けて記録します。</p><!-- v372〜 説明は1行に -->
          <label class="check im-inc"><input type="checkbox" id="im-include-skipped"> 前に「飛ばす」にした写真も表示する</label>
          <input type="file" id="im-files" accept="image/*" multiple hidden>
          <button type="button" class="btn primary big" id="im-pick">${Views.icons.camera} 写真を選ぶ（最大${IMPORT_BATCH}枚）</button>
        </div>
        <div class="im-progress hidden" id="im-progress"><div class="im-bar"><i></i></div><div class="im-ptext"></div></div>
        <div class="im-list" id="im-list"></div>
        <div class="im-summary hidden" id="im-summary"></div>
      </div>
      <div class="im-foot hidden" id="im-foot">
        <span class="im-count" id="im-count"></span>
        <button type="button" class="btn primary" id="im-save">記録する</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    $('.im-close', ov).addEventListener('click', close);
    $('#im-pick', ov).addEventListener('click', () => $('#im-files', ov).click());
    $('#im-files', ov).addEventListener('change', (e) => { const fs = [...e.target.files || []]; e.target.value = ''; if (fs.length) handleFiles(fs); });
    $('#im-include-skipped', ov).addEventListener('change', (e) => { includeSkipped = e.target.checked; });
    $('#im-save', ov).addEventListener('click', saveAll);
    setStep(1);
  }
  // いまの手順を上の帯に（1 選ぶ → 2 まとめる → 3 店名と★ → 4 記録。v374〜）
  function setStep(n) {
    if (!ov) return;
    ov.querySelectorAll('.im-step').forEach(s => { const k = +s.dataset.n; s.classList.toggle('on', k === n); s.classList.toggle('done', k < n); });
  }
  function close() {
    if (busy && !confirm('取り込みの途中です。閉じますか？')) return;
    runToken++; // 読み込み・判定の途中の結果は捨てる
    busy = false;
    groups.forEach(g => g.photos.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); }));
    groups = [];
    if (ov) ov.remove();
    ov = null;
  }

  // ---------- 写真を読む → まとめる ----------
  async function handleFiles(all) {
    const files = all.filter(f => f.type.startsWith('image/')).slice(0, IMPORT_BATCH);
    if (all.length > IMPORT_BATCH) App.toast(`最初の${IMPORT_BATCH}枚だけ取り込みます。残りはもう一度「写真を選ぶ」から`);
    const tok = runToken;
    const prog = $('#im-progress', ov), bar = $('.im-bar i', prog), ptext = $('.im-ptext', prog);
    prog.classList.remove('hidden');
    $('.im-intro', ov).classList.add('hidden');
    setStep(2);
    busy = true;
    const skipped = loadSkipped();
    const items = [];
    let already = 0, wasSkipped = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      bar.style.width = `${Math.round((i / files.length) * 60)}%`;
      ptext.textContent = `写真を読んでいます… ${i + 1}/${files.length}`;
      const hash = await Api.fileHash(f);
      if (tok !== runToken) { dropItems(items); return; }
      if (hash && Store.findPhotoByHash(hash)) { already++; continue; }
      if (hash && !includeSkipped && skipped.has(hash)) { wasSkipped++; continue; }
      const ex = await Api.parseExif(f);
      if (tok !== runToken) { dropItems(items); return; }
      // EXIF の日付が無い写真は「日付なし」の候補にし、日付はファイルの更新日（2000年〜今）。無ければ今（v394〜）
      const exT = toTime(ex.date);
      const lm = Number(f.lastModified) || 0;
      const time = exT || (lm >= Date.UTC(2000, 0, 1) && lm <= Date.now() ? lm : Date.now());
      let url = '';
      try { url = URL.createObjectURL(await Api.compressImage(f, 240, 0.6)); } catch { url = ''; }
      if (tok !== runToken) { if (url) URL.revokeObjectURL(url); dropItems(items); return; }
      items.push({ file: f, hash, lat: ex.lat ?? null, lon: ex.lon ?? null, time, url, hasExifDate: !!exT, noDate: !exT });
    }
    items.sort((a, b) => a.time - b.time);
    if (!items.length) { // v396: 全部が取り込み済み・前に飛ばした写真だったら、最初の画面に戻す（以前は空の画面のまま進めなかった）
      busy = false; prog.classList.add('hidden'); $('.im-intro', ov).classList.remove('hidden'); setStep(1);
      const head0 = [];
      if (already) head0.push(`取り込み済み ${already}枚`);
      if (wasSkipped) head0.push(`前に飛ばした ${wasSkipped}枚`);
      App.toast(head0.length ? head0.join('・') + 'で、新しい写真はありませんでした' : '取り込める写真がありませんでした');
      return;
    }
    groups = groupItems(items);
    bar.style.width = '70%';
    ptext.textContent = `${groups.length}回の訪問にまとめました。店の候補を探しています…`;
    renderList();
    const head = [];
    if (already) head.push(`取り込み済み ${already}枚`);
    if (wasSkipped) head.push(`前に飛ばした ${wasSkipped}枚`);
    if (head.length) App.toast(head.join('・') + 'を除きました');
    await suggestShops(tok);
    if (tok !== runToken) return;
    bar.style.width = '100%';
    prog.classList.add('hidden');
    busy = false;
    classifyPromise = classifyAll(tok).catch(() => {}); // AI判定は裏で順に（終わった候補から表示が更新される）
    updateFoot();
  }

  function dropItems(items) { items.forEach(it => { if (it.url) URL.revokeObjectURL(it.url); }); }

  // 同じ日・近い場所（または近い時間）の写真を 1 つの訪問候補に
  function groupItems(items) {
    const out = [];
    const near = (a, b) => a.lat != null && b.lat != null && Store.distMeters(a.lat, a.lon, b.lat, b.lon) <= GROUP_M;
    for (const it of items) {
      let g = null;
      for (let i = out.length - 1; i >= 0; i--) {
        const c = out[i];
        if (!!c.noDate !== !!it.noDate) continue; // 日付なしの写真は日付ありの訪問と混ぜない
        if (dayKey(c.end) !== dayKey(it.time)) break;
        const dt = it.time - c.end;
        if (c.lat != null && it.lat != null) { if (near(c, it) && dt <= 6 * 3600000) { g = c; break; } continue; }
        if (dt <= GROUP_HOURS * 3600000) { g = c; break; }
      }
      if (!g) { g = { id: 'g' + out.length, photos: [], lat: null, lon: null, start: it.time, end: it.time, noDate: !!it.noDate, name: '', shop: null, cand: null, cands: [], rating: 0, genres: [], state: 'pending', ai: 'idle' }; out.push(g); }
      g.photos.push(it);
      g.end = Math.max(g.end, it.time);
      if (it.lat != null) {
        // 位置は写真の平均
        const n = g.photos.filter(p => p.lat != null).length;
        g.lat = g.lat == null ? it.lat : g.lat + (it.lat - g.lat) / n;
        g.lon = g.lon == null ? it.lon : g.lon + (it.lon - g.lon) / n;
      }
    }
    return out;
  }

  // 店の提案: 既存の自分の店 → 周辺検索（同じ場所は1回だけ検索）
  async function suggestShops(tok) {
    const cache = new Map();
    const key = (g) => `${g.lat.toFixed(4)},${g.lon.toFixed(4)}`; // 約10m
    const queue = groups.filter(g => g.lat != null);
    for (const g of groups) {
      if (g.lat == null) continue;
      const own = Store.shops().filter(s => s.lat != null && Store.distMeters(g.lat, g.lon, s.lat, s.lon) <= OWN_SHOP_M)
        .sort((a, b) => Store.distMeters(g.lat, g.lon, a.lat, a.lon) - Store.distMeters(g.lat, g.lon, b.lat, b.lon));
      g.own = own;
      if (own.length) { g.shop = own[0]; g.name = own[0].name; }
    }
    let i = 0;
    const worker = async () => {
      while (i < queue.length) {
        const g = queue[i++];
        const k = key(g);
        if (!cache.has(k)) cache.set(k, Api.nearbyShops(g.lat, g.lon, SEARCH_RADIUS).catch(() => []));
        const res = await cache.get(k);
        if (tok !== runToken) return;
        g.cands = (res || []).slice(0, 6);
        if (!g.shop && g.cands.length && !g.name) { g.cand = g.cands[0]; g.name = g.cands[0].name; }
        g.searched = true;
        paintGroup(g);
      }
    };
    await Promise.all([worker(), worker()]);
    if (tok !== runToken) return;
    groups.filter(g => g.lat == null).forEach(g => { g.searched = true; paintGroup(g); });
  }

  // AI判定（候補ごとに最初の写真だけ。bulk 枠）
  async function classifyAll(tok) {
    if (!Api.canClassify()) { groups.forEach(g => { g.ai = 'off'; paintGroup(g); }); return; }
    let i = 0;
    const worker = async () => {
      while (i < groups.length) {
        const g = groups[i++];
        if (!ov || tok !== runToken) return;
        if (g.state === 'skip') continue;
        g.ai = 'busy'; paintGroup(g);
        try {
          const r = await Api.classifyDishPhoto(g.photos[0].file, { bulk: true });
          if (tok !== runToken) return;
          // v396: 自信なしの判定は記録に入れない（登録画面では「参考」止まり。v329 の決めごと）
          g.genres = (r && r.confident !== false && r.dishGenres) || [];
          if (r && r.shopGenre) g.shopGenre = r.shopGenre;
          g.ai = 'done';
        } catch (e) { if (tok !== runToken) return; g.ai = 'error'; g.aiMsg = (e && e.message) || ''; if (/上限/.test(g.aiMsg)) { i = groups.length; } }
        paintGroup(g);
      }
    };
    await Promise.all([worker(), worker()]);
  }

  // ---------- 描画 ----------
  function renderList() {
    const list = $('#im-list', ov);
    list.innerHTML = '';
    groups.forEach(g => {
      const el = document.createElement('div');
      el.className = 'im-group';
      el.dataset.id = g.id;
      list.appendChild(el);
      paintGroup(g);
    });
    $('#im-foot', ov).classList.remove('hidden');
    setStep(3);
    updateFoot();
  }
  function paintGroup(g) {
    if (!ov) return;
    const el = $(`.im-group[data-id="${g.id}"]`, ov);
    if (!el) return;
    // v396: 店名を打っている・選択肢を開いている最中に描き直すと入力（変換中の文字）が消えるので、離れてから描く
    const act = document.activeElement;
    if (act && el.contains(act) && /^(INPUT|SELECT|TEXTAREA)$/.test(act.tagName)) {
      if (!el.__repaintLater) { el.__repaintLater = true; act.addEventListener('blur', () => { el.__repaintLater = false; setTimeout(() => paintGroup(g), 0); }, { once: true }); }
      return;
    }
    const thumbs = g.photos.slice(0, 4).map(p => `<span class="im-th">${p.url ? `<img src="${p.url}" alt="">` : Views.icons.dish}</span>`).join('')
      + (g.photos.length > 4 ? `<span class="im-th im-more">+${g.photos.length - 4}</span>` : '');
    const when = g.noDate ? '日付なし' : fmtDay(g.start) + '　' + fmtTime(g.start) + (g.end - g.start > 60000 ? '〜' + fmtTime(g.end) : '');
    // 店の選択肢: 自分の店 → 候補 → 入力
    const opts = [];
    (g.own || []).forEach((s, i) => opts.push({ v: 'own:' + i, t: `${s.name}（記録済み）` }));
    (g.cands || []).forEach((c, i) => opts.push({ v: 'cand:' + i, t: `${c.name}${c.distance != null ? `（${Math.round(c.distance)}m）` : ''}` }));
    opts.push({ v: 'manual', t: '店名を入力する…' });
    const curV = g.shop ? 'own:' + (g.own || []).indexOf(g.shop) : g.cand ? 'cand:' + (g.cands || []).indexOf(g.cand) : 'manual';
    const ai = g.ai === 'busy' ? '<span class="im-ai">' + Views.icons.ai + ' 判定中…</span>'
      : g.ai === 'done' ? (g.genres.length ? `<span class="im-ai">${Views.icons.ai} ${esc(g.genres.join('・'))}</span>` : '<span class="im-ai dim">' + Views.icons.ai + ' 判定できず</span>')
      : g.ai === 'error' ? `<span class="im-ai dim" title="${esc(g.aiMsg || '')}">${Views.icons.ai} 判定なし</span>` : '';
    const skip = g.state === 'skip';
    el.classList.toggle('skip', skip);
    el.innerHTML = `
      <div class="im-thumbs">${thumbs}</div>
      <div class="im-main">
        <div class="im-when">${esc(when)}${g.lat == null ? '<span class="im-nogps">場所の情報なし</span>' : ''}</div>
        <div class="im-shop">
          ${(opts.length > 1 && g.searched) ? `<select class="im-sel" aria-label="店">${opts.map(o => `<option value="${esc(o.v)}"${o.v === curV ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select>` : (g.searched ? '' : '<span class="im-ai dim">候補を探しています…</span>')}
          <input type="text" class="im-name${(curV === 'manual' && g.searched) ? '' : ' hidden'}" placeholder="店名" value="${esc(g.name)}">
        </div>
        <div class="im-row"><div class="im-stars stars"></div>${ai}</div>
      </div>
      <button type="button" class="im-skip" aria-label="${skip ? '戻す' : '飛ばす'}">${skip ? '戻す' : '飛ばす'}</button>`;
    const sel = $('.im-sel', el), name = $('.im-name', el);
    if (sel) sel.addEventListener('change', () => {
      const v = sel.value;
      g.shop = null; g.cand = null;
      if (v.startsWith('own:')) { g.shop = g.own[+v.slice(4)]; g.name = g.shop.name; name.classList.add('hidden'); }
      else if (v.startsWith('cand:')) { g.cand = g.cands[+v.slice(5)]; g.name = g.cand.name; name.classList.add('hidden'); }
      else { g.name = ''; name.value = ''; name.classList.remove('hidden'); name.focus(); }
      updateFoot();
    });
    name.addEventListener('input', () => { g.name = name.value.trim(); updateFoot(); });
    Views.mountRatingStars($('.im-stars', el), g.rating, (v) => { g.rating = v; updateFoot(); });
    $('.im-skip', el).addEventListener('click', () => { g.state = g.state === 'skip' ? 'pending' : 'skip'; paintGroup(g); updateFoot(); });
  }
  const ready = (g) => g.state !== 'skip' && g.name && g.rating > 0;
  function updateFoot() {
    if (!ov) return;
    const n = groups.filter(ready).length, skip = groups.filter(g => g.state === 'skip').length, rest = groups.length - n - skip;
    $('#im-count', ov).textContent = `${n}件を記録${rest ? `・★か店名が未入力 ${rest}件は飛ばします` : ''}${skip ? `・飛ばす ${skip}件` : ''}`;
    $('#im-save', ov).disabled = !n || busy;
  }

  // ---------- 保存 ----------
  async function saveAll() {
    const todo = groups.filter(ready);
    if (!todo.length) return;
    const tok = runToken;
    busy = true;
    setStep(4);
    const btn = $('#im-save', ov); btn.disabled = true;
    const prog = $('#im-progress', ov), bar = $('.im-bar i', prog), ptext = $('.im-ptext', prog);
    prog.classList.remove('hidden');
    if (classifyPromise && todo.some(g => g.ai === 'busy' || g.ai === 'idle')) {
      ptext.textContent = 'ジャンルの判定を待っています…';
      await Promise.race([classifyPromise, new Promise(r => setTimeout(r, 20000))]);
      if (tok !== runToken || !ov) return;
    }
    const skipped = loadSkipped();
    let done = 0, photosN = 0, newShops = 0, failed = 0;
    const toFill = []; // 新しく作った店（保存後に駅・県・市を後追いで補う）
    for (const g of todo) {
      if (ov && tok === runToken) {
        ptext.textContent = `記録しています… ${done + failed + 1}/${todo.length}`;
        bar.style.width = `${Math.round(((done + failed) / todo.length) * 100)}%`;
      }
      // 候補ごとに保存。失敗したら、この候補で作ったものだけ元に戻す（保存済みの候補はそのまま。v394〜）
      let shop = null, createdShop = null, visit = null, n = 0;
      try {
        shop = g.shop || null;
        if (!shop) shop = Store.matchShop({ osmId: g.cand ? g.cand.osmId : '', name: g.name, lat: g.lat, lon: g.lon });
        if (!shop) {
          const c = g.cand || {};
          // 位置は登録画面と同じ決め方（粗い候補は写真の位置を優先）。候補が無ければ写真の位置
          const gps = g.lat != null ? { lat: g.lat, lon: g.lon } : null;
          let pos = (typeof Register !== 'undefined' && Register.pickBestPos) ? Register.pickBestPos(c, gps) : { lat: c.lat ?? null, lon: c.lon ?? null, posLevel: '' };
          if (pos.lat == null && gps) pos = { lat: gps.lat, lon: gps.lon, posLevel: 'gps' };
          shop = createdShop = Store.addShop({
            name: g.name, lat: pos.lat, lon: pos.lon, posLevel: pos.posLevel || '', address: c.address || '', pref: c.pref || '', city: c.city || '',
            station: c.station ? (c.station.endsWith('駅') ? c.station : c.station + '駅') : '',
            osmId: c.osmId || '', shopGenre: g.shopGenre || c.shopGenre || (Api.guessGenres(c) || {}).shop || 'その他', // v396: 候補の種類からも推定（登録画面と同じ）
            dataSource: c.dataSource || c.source || (c.osmId ? 'osm' : ''), dataLicenses: c.licenses || [], dataAttributions: c.attributions || [],
            foundBy: 'import', foundQuery: '',
          });
        }
        visit = Store.addVisit({ shopId: shop.id, datetime: new Date(g.start).toISOString(), dishGenres: g.genres || [], rating: g.rating, comment: '', visitType: '店内飲食' });
        for (const p of g.photos) {
          const blob = await Api.compressImage(p.file);
          const pid = await Store.addPhoto(shop.id, visit.id, 'dish', blob, p.hash);
          Views.warmThumb(pid, blob); // 一覧用のサムネを今のうちに作る（v358〜）
          n++;
        }
        g.state = 'saved';
        done++;
        photosN += n;
        if (createdShop) { newShops++; toFill.push(createdShop.id); }
      } catch (e) {
        console.error(e);
        failed++;
        g.state = 'failed';
        // 半端な訪問と、この候補で作った（もう訪問の無い）店を消す。写真と指紋は deleteVisit が一緒に消すので、やり直せる
        try { if (visit) await Store.deleteVisit(visit.id); } catch (e2) { console.error(e2); }
        try { if (createdShop && !Store.rawVisits().some(v => v.shopId === createdShop.id)) await Store.deleteShop(createdShop.id); } catch (e2) { console.error(e2); }
      }
    }
    try {
      // 飛ばした写真は次回出さない
      groups.filter(g => g.state === 'skip').forEach(g => g.photos.forEach(p => { if (p.hash) skipped.add(p.hash); }));
      saveSkipped(skipped);
    } catch (e) { console.error(e); }
    if (tok === runToken) busy = false;
    App.toast(`${done}件を記録しました${failed ? ` ・ ${failed}件は失敗` : ''}`);
    if (ov && tok === runToken) {
      prog.classList.add('hidden');
      const rest = groups.filter(g => g.state !== 'saved' && g.state !== 'skip' && g.state !== 'failed').length;
      $('#im-list', ov).innerHTML = '';
      $('#im-foot', ov).classList.add('hidden');
      const sum = $('#im-summary', ov);
      sum.classList.remove('hidden');
      sum.innerHTML = `<div class="im-sum-t">${done}回の訪問・${photosN}枚の写真を記録しました</div>
      <div class="im-sum-s">${newShops ? `新しい店 ${newShops}件` : ''}${failed ? `　${failed}件は保存に失敗しました（次回また出ます）` : ''}${rest ? `　★や店名が無かった ${rest}件は記録していません（次回また出ます）` : ''}</div>
      <div class="im-sum-b"><button type="button" class="btn primary" id="im-again">続けて写真を選ぶ</button><button type="button" class="btn" id="im-done">閉じる</button></div>`;
      $('#im-again', ov).addEventListener('click', () => { runToken++; groups = []; sum.classList.add('hidden'); $('.im-intro', ov).classList.remove('hidden'); setStep(1); });
      $('#im-done', ov).addEventListener('click', close);
    }
    if (typeof App !== 'undefined' && App.refreshCurrent) App.refreshCurrent();
    fillShopInfo(toFill); // 裏で住所・県・市・最寄駅を補う（失敗は黙る）
  }

  // 取り込みで作った店の、空いている 住所・県・市・最寄駅 だけを位置から後追いで埋める（v394〜。入っている値は上書きしない）
  async function fillShopInfo(ids) {
    for (const id of ids) {
      try {
        const s0 = Store.getShop(id);
        if (!s0 || s0.lat == null || s0.lon == null) continue;
        const needGeo = !s0.address || !s0.pref || !s0.city;
        const [geo, station] = await Promise.all([
          needGeo ? Api.reverseGeocode(s0.lat, s0.lon) : Promise.resolve({}),
          s0.station ? Promise.resolve('') : Api.nearestStation(s0.lat, s0.lon),
        ]);
        const s = Store.getShop(id); // 待っている間に編集されたかもしれないので取り直す
        if (!s) continue;
        const patch = {};
        if (!s.address && geo && geo.address) patch.address = geo.address;
        if (!s.pref && geo && geo.pref) patch.pref = geo.pref;
        if (!s.city && geo && geo.city) patch.city = geo.city;
        if (!s.station && station) patch.station = station.endsWith('駅') ? station : station + '駅';
        if (Object.keys(patch).length) Store.updateShop(id, patch);
      } catch { /* 後追いなので失敗は黙る */ }
    }
  }

  return { init, open, groupItems };
})();
