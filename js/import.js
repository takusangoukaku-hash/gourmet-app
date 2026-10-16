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

  const loadSkipped = () => { try { return new Set(JSON.parse(localStorage.getItem(SKIP_LS) || '[]')); } catch { return new Set(); } };
  const saveSkipped = (set) => { try { localStorage.setItem(SKIP_LS, JSON.stringify([...set].slice(-5000))); } catch { /* noop */ } };

  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const fmtDay = (t) => new Date(t).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const fmtTime = (t) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const toTime = (d) => { if (d instanceof Date && !isNaN(d)) return d.getTime(); const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? null : t; };

  // ---------- 入口 ----------
  function init() {
    document.querySelectorAll('[data-import-open]').forEach(b => b.addEventListener('click', open));
  }
  function open() {
    if (ov) return;
    groups = [];
    ov = document.createElement('div');
    ov.className = 'modal import-modal';
    ov.innerHTML = `<div class="modal-box">
      <div class="modal-head"><button type="button" class="modal-close im-close" aria-label="閉じる">✕</button><h2>過去の写真をまとめて取り込む</h2></div>
      <div class="im-body">
        <div class="im-intro">
          <p>写真アプリから料理の写真を選ぶと、<b>撮った日と場所ごとに「1回の訪問」にまとめて</b>並べます。店名と★を付けて「記録する」を押すだけです。</p>
          <ul class="im-tips">
            <li>一度に <b>${IMPORT_BATCH}枚</b> まで。何回かに分けて取り込めます（取り込み済みの写真は自動で飛ばします）</li>
            <li>位置情報（撮影場所）が付いた写真ほど、店の候補が正確に出ます</li>
            <li>料理のジャンルは AI が自動で判定します（あとで直せます）</li>
          </ul>
          <label class="check im-inc"><input type="checkbox" id="im-include-skipped"> 前に「飛ばす」にした写真も表示する</label>
          <input type="file" id="im-files" accept="image/*" multiple hidden>
          <button type="button" class="btn primary big" id="im-pick">📷 写真を選ぶ（最大${IMPORT_BATCH}枚）</button>
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
  }
  function close() {
    if (busy && !confirm('取り込みの途中です。閉じますか？')) return;
    groups.forEach(g => g.photos.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); }));
    groups = [];
    if (ov) ov.remove();
    ov = null;
  }

  // ---------- 写真を読む → まとめる ----------
  async function handleFiles(all) {
    const files = all.filter(f => f.type.startsWith('image/')).slice(0, IMPORT_BATCH);
    if (all.length > IMPORT_BATCH) App.toast(`最初の${IMPORT_BATCH}枚だけ取り込みます。残りはもう一度「写真を選ぶ」から`);
    const prog = $('#im-progress', ov), bar = $('.im-bar i', prog), ptext = $('.im-ptext', prog);
    prog.classList.remove('hidden');
    $('.im-intro', ov).classList.add('hidden');
    busy = true;
    const skipped = loadSkipped();
    const items = [];
    let already = 0, wasSkipped = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      bar.style.width = `${Math.round((i / files.length) * 60)}%`;
      ptext.textContent = `写真を読んでいます… ${i + 1}/${files.length}`;
      const hash = await Api.fileHash(f);
      if (hash && Store.findPhotoByHash(hash)) { already++; continue; }
      if (hash && !includeSkipped && skipped.has(hash)) { wasSkipped++; continue; }
      const ex = await Api.parseExif(f);
      const time = toTime(ex.date) || f.lastModified || Date.now();
      let url = '';
      try { url = URL.createObjectURL(await Api.compressImage(f, 240, 0.6)); } catch { url = ''; }
      items.push({ file: f, hash, lat: ex.lat ?? null, lon: ex.lon ?? null, time, url, hasExifDate: !!toTime(ex.date) });
    }
    items.sort((a, b) => a.time - b.time);
    groups = groupItems(items);
    bar.style.width = '70%';
    ptext.textContent = `${groups.length}回の訪問にまとめました。店の候補を探しています…`;
    renderList();
    const head = [];
    if (already) head.push(`取り込み済み ${already}枚`);
    if (wasSkipped) head.push(`前に飛ばした ${wasSkipped}枚`);
    if (head.length) App.toast(head.join('・') + 'を除きました');
    await suggestShops();
    bar.style.width = '100%';
    prog.classList.add('hidden');
    busy = false;
    classifyAll(); // AI判定は裏で順に（終わった候補から表示が更新される）
    updateFoot();
  }

  // 同じ日・近い場所（または近い時間）の写真を 1 つの訪問候補に
  function groupItems(items) {
    const out = [];
    const near = (a, b) => a.lat != null && b.lat != null && Store.distMeters(a.lat, a.lon, b.lat, b.lon) <= GROUP_M;
    for (const it of items) {
      let g = null;
      for (let i = out.length - 1; i >= 0; i--) {
        const c = out[i];
        if (dayKey(c.end) !== dayKey(it.time)) break;
        const dt = it.time - c.end;
        if (c.lat != null && it.lat != null) { if (near(c, it) && dt <= 6 * 3600000) { g = c; break; } continue; }
        if (dt <= GROUP_HOURS * 3600000) { g = c; break; }
      }
      if (!g) { g = { id: 'g' + out.length, photos: [], lat: null, lon: null, start: it.time, end: it.time, name: '', shop: null, cand: null, cands: [], rating: 0, genres: [], state: 'pending', ai: 'idle' }; out.push(g); }
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
  async function suggestShops() {
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
        g.cands = (res || []).slice(0, 6);
        if (!g.shop && g.cands.length && !g.name) { g.cand = g.cands[0]; g.name = g.cands[0].name; }
        g.searched = true;
        paintGroup(g);
      }
    };
    await Promise.all([worker(), worker()]);
    groups.filter(g => g.lat == null).forEach(g => { g.searched = true; paintGroup(g); });
  }

  // AI判定（候補ごとに最初の写真だけ。bulk 枠）
  async function classifyAll() {
    if (!Api.canClassify()) { groups.forEach(g => { g.ai = 'off'; paintGroup(g); }); return; }
    let i = 0;
    const worker = async () => {
      while (i < groups.length) {
        const g = groups[i++];
        if (!ov || g.state === 'skip') continue;
        g.ai = 'busy'; paintGroup(g);
        try {
          const r = await Api.classifyDishPhoto(g.photos[0].file, { bulk: true });
          g.genres = (r && r.dishGenres) || [];
          if (r && r.shopGenre) g.shopGenre = r.shopGenre;
          g.ai = 'done';
        } catch (e) { g.ai = 'error'; g.aiMsg = (e && e.message) || ''; if (/上限/.test(g.aiMsg)) { i = groups.length; } }
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
    updateFoot();
  }
  function paintGroup(g) {
    if (!ov) return;
    const el = $(`.im-group[data-id="${g.id}"]`, ov);
    if (!el) return;
    const thumbs = g.photos.slice(0, 4).map(p => `<span class="im-th">${p.url ? `<img src="${p.url}" alt="">` : '🍽️'}</span>`).join('')
      + (g.photos.length > 4 ? `<span class="im-th im-more">+${g.photos.length - 4}</span>` : '');
    const when = fmtDay(g.start) + '　' + fmtTime(g.start) + (g.end - g.start > 60000 ? '〜' + fmtTime(g.end) : '');
    // 店の選択肢: 自分の店 → 候補 → 入力
    const opts = [];
    (g.own || []).forEach((s, i) => opts.push({ v: 'own:' + i, t: `📍 ${s.name}（記録済み）` }));
    (g.cands || []).forEach((c, i) => opts.push({ v: 'cand:' + i, t: `${c.name}${c.distance != null ? `（${Math.round(c.distance)}m）` : ''}` }));
    opts.push({ v: 'manual', t: '店名を入力する…' });
    const curV = g.shop ? 'own:' + (g.own || []).indexOf(g.shop) : g.cand ? 'cand:' + (g.cands || []).indexOf(g.cand) : 'manual';
    const ai = g.ai === 'busy' ? '<span class="im-ai">🤖 判定中…</span>'
      : g.ai === 'done' ? (g.genres.length ? `<span class="im-ai">🤖 ${esc(g.genres.join('・'))}</span>` : '<span class="im-ai dim">🤖 判定できず</span>')
      : g.ai === 'error' ? `<span class="im-ai dim" title="${esc(g.aiMsg || '')}">🤖 判定なし</span>` : '';
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
    busy = true;
    const btn = $('#im-save', ov); btn.disabled = true;
    const prog = $('#im-progress', ov), bar = $('.im-bar i', prog), ptext = $('.im-ptext', prog);
    prog.classList.remove('hidden');
    const skipped = loadSkipped();
    let done = 0, photosN = 0, newShops = 0;
    try {
      for (const g of todo) {
        ptext.textContent = `記録しています… ${done + 1}/${todo.length}`;
        bar.style.width = `${Math.round((done / todo.length) * 100)}%`;
        let shop = g.shop || null;
        if (!shop) shop = Store.matchShop({ osmId: g.cand ? g.cand.osmId : '', name: g.name, lat: g.lat, lon: g.lon });
        if (!shop) {
          const c = g.cand || {};
          shop = Store.addShop({
            name: g.name, lat: c.lat ?? g.lat, lon: c.lon ?? g.lon, address: c.address || '', pref: c.pref || '', city: c.city || '',
            station: c.station ? (c.station.endsWith('駅') ? c.station : c.station + '駅') : '',
            osmId: c.osmId || '', shopGenre: g.shopGenre || (c.shopGenre || 'その他'),
            dataSource: c.dataSource || c.source || (c.osmId ? 'osm' : ''), dataLicenses: c.licenses || [], dataAttributions: c.attributions || [],
            foundBy: 'import', foundQuery: '',
          });
          newShops++;
        }
        const visit = Store.addVisit({ shopId: shop.id, datetime: new Date(g.start).toISOString(), dishGenres: g.genres || [], rating: g.rating, comment: '', visitType: '店内飲食' });
        for (const p of g.photos) {
          const blob = await Api.compressImage(p.file);
          await Store.addPhoto(shop.id, visit.id, 'dish', blob, p.hash);
          photosN++;
        }
        g.state = 'saved';
        done++;
      }
      // 飛ばした写真は次回出さない
      groups.filter(g => g.state === 'skip').forEach(g => g.photos.forEach(p => { if (p.hash) skipped.add(p.hash); }));
      saveSkipped(skipped);
    } catch (e) {
      console.error(e);
      App.toast('⚠️ 途中で保存に失敗しました: ' + (e && e.message || e));
    }
    busy = false;
    prog.classList.add('hidden');
    const rest = groups.filter(g => g.state !== 'saved' && g.state !== 'skip').length;
    $('#im-list', ov).innerHTML = '';
    $('#im-foot', ov).classList.add('hidden');
    const sum = $('#im-summary', ov);
    sum.classList.remove('hidden');
    sum.innerHTML = `<div class="im-sum-t">✅ ${done}回の訪問・${photosN}枚の写真を記録しました</div>
      <div class="im-sum-s">${newShops ? `新しい店 ${newShops}件` : ''}${rest ? `　★や店名が無かった ${rest}件は記録していません（次回また出ます）` : ''}</div>
      <div class="im-sum-b"><button type="button" class="btn primary" id="im-again">続けて写真を選ぶ</button><button type="button" class="btn" id="im-done">閉じる</button></div>`;
    $('#im-again', ov).addEventListener('click', () => { groups = []; sum.classList.add('hidden'); $('.im-intro', ov).classList.remove('hidden'); });
    $('#im-done', ov).addEventListener('click', close);
    if (typeof App !== 'undefined' && App.refreshCurrent) App.refreshCurrent();
  }

  return { init, open, groupItems };
})();
