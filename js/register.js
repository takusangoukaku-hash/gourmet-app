// =====================================================
// 登録フロー（仕様書v2 §4）
//  フローA: 写真のGPS → 周辺店舗候補から選択
//  フローB: 位置情報なし → 名前検索 / 地図で指定（主要フロー）
// =====================================================
const Register = (() => {
  const $ = (sel) => document.querySelector(sel);

  // 選択中の写真: [{ file, url, type }]
  let pendingPhotos = [];
  // 選択中の店舗情報
  let selected = null; // { existingShopId?, osmId, name, address, lat, lon, pref, city, station, country }
  // 訪問日（YYYY-MM-DD）: 入力欄は廃止し、写真の撮影日→なければ当日を自動記録
  let visitDate = '';
  let currentRating = 0; // 味の評価（訪問ごと・必須）
  // 店の性質の評価（任意・店舗に1つ）: 0 = 未評価
  const AXES = ['casual', 'atmosphere', 'speed'];
  let shopRatings = { casual: 0, atmosphere: 0, speed: 0 };
  // AIが料理ジャンルを判定済みか（OSMタグ推定で上書きしないためのフラグ）
  let aiClassified = false;
  // AI/OSM由来の店舗ジャンル（UIには出さず内部保持。地図ラベルのフォールバック用）
  let derivedShopGenre = '';
  // 料理ジャンルの選択状態（2段階ピッカーと共有）
  const selectedDishGenres = new Set();
  let dishPicker = null;
  // 利用者が手動でジャンルを触ったか。trueの間はAI判定・OSM推定で上書きしない
  let userTouchedGenres = false;
  // 現在の選択がAI判定・OSM推定による自動入力か（手動選択が始まったら破棄する）
  let autoFilledGenres = false;
  // 店舗が自動選択されたか（案内メッセージの出し分けに使用）
  let autoPicked = false;
  // 直近に解析した写真のGPS（名前検索の基準位置に使う）
  let lastGps = null;
  // 編集中の下書きID（下書きから記録を完成させると、保存後に削除する）
  let activeDraftId = null;
  // 検索の世代番号（古い検索の遅延結果で新しい結果を上書きしないため）
  let searchSeq = 0;
  // 予測検索の状態（入力が止まったら自動で候補を出す）
  let suggestSeq = 0;
  let suggestTimer = null;
  let suggestRef = null; // 予測検索の基準位置（写真の GPS が無いときの現在地。記録ごとに取り直す）
  // v393: フォームの世代番号。resetForm() で進め、通信待ちから戻った処理が別の記録のフォームへ書き込まないようにする
  let formSeq = 0;
  let exifRun = 0; // v396: analyzeExif の世代（写真を続けて足したとき古い解析を捨てる）
  // v393: lastGps が写真の EXIF 由来か（現在地のフォールバックは false）。手入力の新しい店に位置を付けてよいのは写真由来だけ
  let lastGpsFromPhoto = false;

  // 現在地の取得（拒否・失敗時は null。検索精度向上のための任意情報）
  function getCurrentPos(timeout = 3500) {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolve(null),
        { timeout, maximumAge: 300000 }
      );
    });
  }

  // ---------- 初期化 ----------
  let forceStep2 = false; // 「写真なしで記録」で2枚目に進んだか（v337〜）

  // 登録の2段階（v337〜）: 写真があるか、店名が入っているか、「写真なしで記録」を押したら2枚目（#view-register.step2）
  function updateStep() {
    const step2 = pendingPhotos.length > 0 || forceStep2 || !!$('#f-shop-name').value.trim() || !!selected;
    $('#view-register').classList.toggle('step2', step2);
  }
  // 店名の下の1行: 最寄駅（自動入力の値）。無ければ何も出さない
  function syncMeta() {
    const st = $('#reg-station'); if (!st) return;
    const v = ($('#f-station').value || '').trim();
    if (st.textContent !== v) st.textContent = v;
  }
  // ジャンルの札: 選んだジャンル（AI判定で入った値も）を1つの札に。無ければ「ジャンルを選ぶ」
  function updateGenrePill(text) {
    const pill = $('#genre-pill'); if (!pill) return;
    const g = [...selectedDishGenres];
    pill.textContent = text != null ? text : (g.length ? g.join('・') : 'ジャンルを選ぶ');
    pill.classList.toggle('empty', !g.length && text == null);
  }

  // ジャンルを選ぶシート（v373〜）: 上に検索欄、「よく使う」（自分の記録で多い6つ。無ければ各くくりの先頭）、
  // その下に全ジャンル（#f-dish-genres＝くくり→ジャンルの2段階ピッカーをそのまま移す。閉じたら #reg-genres へ戻す）
  function openGenreSheet() {
    if (document.querySelector('.gp-modal')) return;
    const picker = $('#f-dish-genres');
    const home = picker.parentElement;
    const ov = document.createElement('div');
    ov.className = 'modal action-sheet gp-modal';
    ov.innerHTML = `<div class="as-box gp-sheet">
        <div class="as-handle"></div>
        <div class="gp-head"><span>料理ジャンル</span><button type="button" class="sheet-x gp-x" aria-label="閉じる">${Views.icons.x}</button></div>
        <input type="search" class="gp-q" placeholder="ジャンルを検索" autocomplete="off" enterkeyhint="search">
        <div class="gp-body">
          <div class="gp-sel"></div>
          <div class="gp-hits chips hidden"></div>
          <div class="gp-favwrap"><div class="fl-label">よく使う</div><div class="gp-fav chips"></div></div>
          <div class="fl-label">すべて</div>
          <div class="gp-all"></div>
        </div>
        <button type="button" class="btn primary big gp-done">決定</button>
      </div>`;
    document.body.appendChild(ov); // 先に文書へ入れてからピッカーを移す
    ov.querySelector('.gp-all').appendChild(picker);
    const favs = (() => {
      const count = new Map();
      for (const v of Store.visits()) for (const g of (v.dishGenres || [])) count.set(g, (count.get(g) || 0) + 1);
      const top = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g).filter(g => Api.DISH_GENRES.includes(g));
      for (const c of Api.DISH_CATEGORIES) { if (top.length >= 6) break; if (!top.includes(c.genres[0])) top.push(c.genres[0]); }
      return top.slice(0, 6);
    })();
    const chip = (g) => `<button type="button" class="chip${selectedDishGenres.has(g) ? ' on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`;
    const q = ov.querySelector('.gp-q');
    const paint = () => {
      ov.querySelector('.gp-sel').textContent = selectedDishGenres.size ? '選択中: ' + [...selectedDishGenres].join('・') : '';
      ov.querySelector('.gp-fav').innerHTML = favs.map(chip).join('');
      const kw = q.value.trim().toLowerCase();
      const hits = ov.querySelector('.gp-hits');
      if (kw) {
        const list = Api.DISH_GENRES.filter(g => g.toLowerCase().includes(kw));
        hits.innerHTML = list.length ? list.map(chip).join('') : '<span class="hint">見つかりません</span>';
      }
      hits.classList.toggle('hidden', !kw);
      ov.querySelector('.gp-favwrap').classList.toggle('hidden', !!kw);
      dishPicker.render();
    };
    const toggle = (g) => {
      if (selectedDishGenres.has(g)) selectedDishGenres.delete(g); else selectedDishGenres.add(g);
      userTouchedGenres = true; autoFilledGenres = false; // 手で選んだ＝以降は自動判定で上書きしない
      paint();
    };
    for (const sel of ['.gp-fav', '.gp-hits']) ov.querySelector(sel).addEventListener('click', (e) => { const b = e.target.closest('.chip[data-g]'); if (b) toggle(b.dataset.g); });
    const onPickerClick = () => setTimeout(paint, 0);
    picker.addEventListener('click', onPickerClick); // 全ジャンル側で選んだら「選択中」と「よく使う」にも反映
    q.addEventListener('input', paint);
    const close = () => { picker.removeEventListener('click', onPickerClick); home.appendChild(picker); ov.remove(); updateGenrePill(); };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.gp-done').addEventListener('click', close);
    ov.querySelector('.gp-x').addEventListener('click', close);
    paint();
  }

  function init() {
    $('#photo-input').addEventListener('change', (e) => addFiles(e.target.files));
    $('#camera-input').addEventListener('change', (e) => addFiles(e.target.files));
    // 独自カメラ画面の操作
    $('#cam-shutter').addEventListener('click', capturePhoto);
    $('#cam-library').addEventListener('click', () => { stopCamera(); $('#photo-input').click(); });
    $('#cam-close').addEventListener('click', () => { stopCamera(); App.switchTab('register'); }); // ✕で入力フォームへ戻る
    // 1枚目「写真を選ぶ」(v337〜): 撮る／写真から選ぶ／写真なしで記録／行きたい店に入れる
    $('#reg-pick-cam').addEventListener('click', openCamera);
    $('#reg-back').addEventListener('click', () => { if (resetFormConfirmed()) { resetForm(); } });
    $('#reg-pick-lib').addEventListener('click', () => $('#photo-input').click());
    $('#reg-pick-text').addEventListener('click', () => {
      forceStep2 = true; updateStep(); setTimeout(() => $('#f-shop-name').focus(), 250);
      nearbyForNoPhoto(); // v378〜 現在地の周辺の店を候補に（タップで選ぶ。自動では選ばない）
    });
    $('#reg-pick-wish').addEventListener('click', () => Views.openWishAdd());
    // 2枚目「記録」: ジャンルの札 → 選択肢の開閉。「ひとこと」「住所・最寄駅」の行 → 折りたたみの開閉
    $('#genre-pill').addEventListener('click', openGenreSheet); // v373〜 よく使う6つ＋検索＋全ジャンルのシート
    document.querySelectorAll('#record-card [data-reg-open]').forEach(b => b.addEventListener('click', () => {
      const box = $('#reg-' + b.dataset.regOpen) || $('#detail-fields');
      box.classList.toggle('hidden');
      b.classList.toggle('open', !box.classList.contains('hidden'));
      if (!box.classList.contains('hidden')) { const f = box.querySelector('textarea, input'); if (f) f.focus(); }
    }));
    $('#f-station').addEventListener('input', syncMeta);
    setInterval(() => { if ($('#view-register').classList.contains('active')) syncMeta(); }, 500); // 自動入力の最寄駅を札に反映

    // 店舗検索（店舗名欄に統合: 店舗名を入力して検索 → 下に候補を表示）
    $('#shop-search-btn').addEventListener('click', doSearch);
    $('#f-shop-name').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) doSearch(); });

    // 予測検索: 入力が止まったら自動で候補を表示（Chromeの検索補完風）
    // 日本語入力の変換中（composition中）は発火させず、確定したタイミングで検索する
    const nameInput = $('#f-shop-name');
    let composing = false;
    const queueSuggest = () => {
      clearTimeout(suggestTimer);
      const q = nameInput.value.trim();
      if (q.length < 2) { suggestSeq++; return; } // 短すぎる入力では出さない
      suggestTimer = setTimeout(() => suggest(q), 400);
    };
    nameInput.addEventListener('compositionstart', () => { composing = true; });
    nameInput.addEventListener('compositionend', () => { composing = false; queueSuggest(); });
    nameInput.addEventListener('input', () => { if (!composing) queueSuggest(); });


    // 料理ジャンル: カテゴリ→ジャンルの2段階選択
    dishPicker = Api.buildGenrePicker($('#f-dish-genres'), selectedDishGenres);
    // 手動操作を検知（capture指定でピッカー本体の処理より先に実行される）
    $('#f-dish-genres').addEventListener('click', () => setTimeout(updateGenrePill, 0)); // 選んだジャンルを札に反映（v337〜）
    $('#f-dish-genres').addEventListener('click', (e) => {
      if (e.target.closest('.chip[data-g]')) {
        userTouchedGenres = true;
        // 自動推定・AI判定で入った初期値は消さずに残す。手動タップはその上に
        // 2個目・3個目として追加できる（タップした本人がそのジャンルを外したいときは
        // ピッカー側のトグルで外れる）。以降は自動推定で上書きしないよう所有権を移す。
        autoFilledGenres = false;
      } else if (e.target.closest('.chip.cat')) {
        // カテゴリを開いた＝選択操作中。以降はAI判定・自動推定で上書きしない
        userTouchedGenres = true;
      }
    }, true);

    // 評価スター（味）＋ 店の評価3軸
    mountTasteStars();
    mountAxisStars();
    // 必須（店舗名・味の評価）の入力状況に合わせて保存ボタンの見た目と案内を更新
    $('#f-shop-name').addEventListener('input', () => {
      // v392: 自動で選ばれた店・登録済みの店を選んだあとに店名を打ち替えたら、その選択は外す。選んだままだと、保存で既存の店が
      // 打った名前に改名されたり、新しい店が別の候補の位置・ID を引き継いだりしていた
      const val = $('#f-shop-name').value.trim();
      if (selected && (autoPicked || selected.existingShopId) && val !== String(selected.name || '').trim()) {
        selected = null; autoPicked = false;
        document.querySelectorAll('#shop-candidates .candidate').forEach(x => x.classList.remove('selected', 'hidden'));
        // v393: 前の候補から自動で入ったジャンルは、店を外したら一緒に外す（手動・AI 判定のものは残す）
        if (autoFilledGenres && !userTouchedGenres && !aiClassified) {
          selectedDishGenres.clear(); derivedShopGenre = ''; autoFilledGenres = false;
          dishPicker.reset(); updateGenrePill();
        }
      }
      updateSaveState(); updateStep(); updateDupHint();
    });
    updateSaveState();

    // 訪問日: 空のまま（保存時に当日を入れる。写真を選ぶと撮影日になる）
    // v393: 起動時の日付を持ち続けると、日をまたいだ保存が前日の日付になっていた
    visitDate = '';

    $('#save-btn').addEventListener('click', save);
    // 行きたい店として保存（店舗名だけでOK。訪問を記録すると自動で外れる）
    // v372〜 「その他」の一覧に畳んだ（記録せずに行きたい店へ ／ あとで記録＝写真があるときだけ）
    $('#reg-more-row').addEventListener('click', () => Views.openActionSheet([
      { label: '記録せずに行きたい店へ', onClick: saveWish },
      ...(pendingPhotos.length ? [{ label: 'あとで記録（写真だけ保存）', onClick: saveLater }] : []),
    ]));
    $('#drafts-btn').addEventListener('click', openDrafts);
    refreshDraftsBanner();
    renderPreviews(); // 初期表示から「＋写真」タイルを出す
  }

  // ---------- 登録済みの店との重複（v365〜） ----------
  // 店名（と位置）が登録済みの店と同じ店らしいとき、店名の下に「登録済み: ○○」を出す。タップでその店への記録にする
  function updateDupHint() {
    const box = $('#reg-dup');
    if (!box) return;
    const name = $('#f-shop-name').value.trim();
    const hide = () => { box.classList.add('hidden'); box.innerHTML = ''; };
    if (!name || (selected && selected.existingShopId)) { hide(); return; }
    const pos = selected && selected.lat != null ? selected : (lastGps || {});
    const hits = Views.similarShops(name, pos.lat != null ? pos.lat : null, pos.lon != null ? pos.lon : null);
    if (!hits.length) { hide(); return; }
    const s = hits[0].shop;
    if (document.querySelector(`#shop-candidates .candidate:not(.hidden)[data-shop-id="${CSS.escape(s.id)}"]`)) { hide(); return; }
    box.innerHTML = `<span>登録済み: <b>${esc(s.name)}</b>${s.station ? ' ・ ' + esc(s.station) : ''} ・ ${Store.visitCount(s.id)}回</span><button type="button" class="btn small reg-dup-use">この店にする</button>`;
    box.classList.remove('hidden');
    box.querySelector('.reg-dup-use').addEventListener('click', () => { autoPicked = false; chooseExisting(s); $('#shop-candidates').innerHTML = ''; });
  }
  // 保存のとき、照合で見つからなくても似た店があれば確かめる → 既存の店 ／ null（別の店として登録） ／ undefined（やめる）
  function askSameShop(shop) {
    return new Promise((resolve) => {
      Views.openActionSheet([
        { label: `「${shop.name}」に記録する（同じ店）`, onClick: () => resolve(shop) },
        { label: '別の店として登録する', onClick: () => resolve(null) },
      ], () => resolve(undefined));
    });
  }

  // ---------- あとで記録（下書き） ----------
  // 下書き件数バナーの更新（登録画面上部）
  async function refreshDraftsBanner() {
    try {
      const n = await Store.draftCount();
      $('#drafts-count').textContent = n;
      $('#drafts-btn').classList.toggle('hidden', !n);
    } catch { /* noop */ }
  }

  // 行きたい店として保存: 店舗名だけでOK。検索で候補を選んでいれば位置・ジャンルも保存され、
  // 地図に紫のピンで表示される。その店の訪問を記録すると自動で行きたいから外れる
  function saveWish() {
    const name = $('#f-shop-name').value.trim();
    if (!name) { App.toast('店名を入れてください'); return; }
    const m = Store.matchShop({ name, lat: selected ? selected.lat : null, lon: selected ? selected.lon : null });
    if (m) { App.toast('この店はすでに記録があります'); return; }
    const w = Store.addWish({
      name,
      lat: selected && selected.lat != null ? selected.lat : null,
      lon: selected && selected.lon != null ? selected.lon : null,
      genre: derivedShopGenre || '',
    });
    App.toast(w.lat != null
      ? '行きたい店に保存しました。地図に紫のピンで表示されます'
      : '行きたい店に保存しました。検索から候補を選んで保存すると地図にもピンが出ます', 4500);
    resetForm();
  }

  // いまの写真を評価なしで下書き保存（食事中はサッと撮るだけ）
  async function saveLater() {
    if (!pendingPhotos.length) { App.toast('先に写真を撮ってください'); return; }
    const btn = $('#reg-more-row');
    btn.disabled = true;
    try {
      const photos = [];
      for (const p of pendingPhotos) {
        const blob = await Api.compressImage(p.file); // 端末容量のため圧縮して保存
        photos.push({ blob, hash: p.hash || '' });
      }
      await Store.addDraft({
        datetime: (visitDate || toLocalInput(new Date())),
        lat: lastGps ? lastGps.lat : null,
        lon: lastGps ? lastGps.lon : null,
        address: $('#f-address').value.trim(),
        station: $('#f-station').value.trim(),
        photos,
      });
      App.toast('下書きに保存しました。あとで評価を入力して完成できます');
      resetForm();
      await refreshDraftsBanner();
      App.switchTab('profile');
    } catch (e) {
      console.error(e); App.toast('下書きの保存に失敗しました');
    } finally {
      btn.disabled = false;
    }
  }

  // 下書き一覧モーダル
  async function openDrafts() {
    const drafts = await Store.getDrafts();
    const ov = document.createElement('div');
    ov.className = 'modal drafts-modal';
    ov.innerHTML = `<div class="modal-box">
        <button type="button" class="modal-close dr-close" aria-label="閉じる">${Views.icons.x}</button>
        <h2 class="vl-title">下書き（あとで記録）</h2>
        <div class="dr-body"></div>
      </div>`;
    const body = ov.querySelector('.dr-body');
    const urls = [];
    const close = () => { ov.remove(); urls.forEach(u => URL.revokeObjectURL(u)); };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.dr-close').addEventListener('click', close);
    if (!drafts.length) {
      body.innerHTML = '<div class="empty"><p>下書きはありません</p></div>';
    } else {
      body.innerHTML = drafts.map(d => {
        const url = d.photos && d.photos[0] ? URL.createObjectURL(d.photos[0].blob) : '';
        if (url) urls.push(url);
        const when = d.datetime ? Views.fmtDate(d.datetime) : ''; // v394: 日付の書き方を揃える（11月3日）
        return `<div class="draft-row" data-id="${d.id}">
            <div class="draft-thumb">${url ? `<img src="${url}" alt="">` : Views.icons.dish}</div>
            <div class="draft-main">
              <div class="draft-when">${when}${(d.photos || []).length > 1 ? '　写真' + d.photos.length + '枚' : ''}</div>
              <div class="draft-sub">${d.station ? esc(d.station) + '　' : ''}評価はまだ未入力</div>
            </div>
            <button type="button" class="btn small primary dr-do" data-id="${d.id}">記録する</button>
            <button type="button" class="btn small danger dr-del" data-id="${d.id}">削除</button>
          </div>`;
      }).join('');
      body.querySelectorAll('.dr-do').forEach(b => b.addEventListener('click', () => { close(); loadDraft(b.dataset.id); }));
      body.querySelectorAll('.dr-del').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('この下書きを削除しますか？')) return;
        await Store.deleteDraft(b.dataset.id);
        await refreshDraftsBanner();
        close(); openDrafts();
      }));
    }
    document.body.appendChild(ov);
  }

  // 下書きを読み込んで記録画面へ（保存すると下書きは削除される）
  async function loadDraft(id) {
    const d = await Store.getDraft(id);
    if (!d) { App.toast('下書きが見つかりません'); return; }
    if (!resetFormConfirmed()) return;
    activeDraftId = id;
    for (const ph of (d.photos || [])) {
      const file = new File([ph.blob], 'draft.jpg', { type: 'image/jpeg' });
      // v393: 下書きの日付を exifTime に持たせ、写真を外したときの日付の再計算で消えないようにする
      pendingPhotos.push({ file, url: URL.createObjectURL(ph.blob), type: 'dish', hash: ph.hash || '', exifTime: d.datetime ? new Date(d.datetime + 'T12:00:00') : null });
    }
    visitDate = d.datetime || '';
    if (d.lat != null && d.lon != null) { lastGps = { lat: d.lat, lon: d.lon }; lastGpsFromPhoto = false; } // v393: 下書きの位置の出どころは不明＝写真由来とは扱わない
    if (d.address) $('#f-address').value = d.address;
    if (d.station) $('#f-station').value = d.station;
    renderPreviews(); syncMeta();
    App.switchTab('register');
    window.scrollTo({ top: 0 });
    // 位置情報があれば周辺の店舗候補を出す（入力の手間を減らす）
    if (lastGps) loadCandidates(lastGps.lat, lastGps.lon).catch(() => {});
  }

  // お気に入りハート（店名右）の表示を #f-fav の状態に合わせる
  // （v323〜 ボタンは廃止。隠しチェック #f-fav の値だけ保存に使い、既存の記録の favorite を保つ）
  function updateFavStar() {
    const btn = $('#f-fav-btn');
    if (!btn) return;
    const on = $('#f-fav').checked;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // 店の評価3軸のスターを（再）描画する
  // 味の評価（0.5刻み）。選んだ値を星の右に数字でも出して、.5 が入ったか分かるようにする
  function mountTasteStars() {
    const val = $('#f-rating-val');
    const show = (v) => { if (val) val.innerHTML = v ? `${v.toFixed(1)}<small>${Views.ratingWord(v)}</small>` : ''; }; // v374〜 意味を1語で
    const old = $('#f-rating');
    const el = old.cloneNode(false); // リスナーを持たない空の要素に差し替える
    old.replaceWith(el);
    Views.mountRatingStars(el, 0, v => { currentRating = v; show(v); updateSaveState(); });
    show(0);
  }

  function mountAxisStars() {
    for (const k of AXES) {
      mountStars($('#f-ax-' + k), shopRatings[k], v => { shopRatings[k] = v; });
    }
  }

  function mountStars(el, initial, onChange) {
    el.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.innerHTML = Views.starBtn(); b.dataset.v = i;
      b.addEventListener('click', () => {
        el.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.v <= i));
        onChange(i);
      });
      if (i <= initial) b.classList.add('on');
      el.appendChild(b);
    }
  }

  // 訪問は日付のみ（YYYY-MM-DD）で扱う
  function toLocalInput(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  // v393: いま選んでいる写真の撮影日のうち一番古いもの（YYYY-MM-DD）。使える日付が無ければ ''（保存時に当日）
  function earliestPhotoDate() {
    const limit = Date.now() + 86400000;
    let e = null;
    for (const p of pendingPhotos) {
      const t = p.exifTime;
      if (!(t instanceof Date) || isNaN(t) || t.getFullYear() < 2000 || t.getTime() > limit) continue;
      if (!e || t < e) e = t;
    }
    return e ? toLocalInput(e) : '';
  }

  // 下のバー中央の＋から呼ぶ: 写真の撮影/選択画面（端末のカメラ・ライブラリ）を開く
  // ---------- 独自カメラ画面（＋から起動） ----------
  let camStream = null;
  // ＋タップで呼ぶ: アプリ内カメラを開く。撮影ボタン＋右下に「写真から選択」＋×
  function openCamera() {
    const overlay = $('#camera-overlay');
    const video = $('#cam-video');
    $('#cam-error').classList.add('hidden');
    overlay.classList.remove('hidden');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      overlay.classList.add('hidden'); $('#camera-input').click(); return; // 非対応→端末カメラ
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then(stream => {
        // 許可を待つ間に閉じられていたら、取れたストリームはすぐ止める（カメラの使用中表示が残る）
        if (overlay.classList.contains('hidden')) { stream.getTracks().forEach(t => t.stop()); return; }
        if (camStream) camStream.getTracks().forEach(t => t.stop());
        camStream = stream; video.srcObject = stream; video.play().catch(() => {}); })
      .catch(() => {
        // 権限拒否・非対応 → 端末標準のカメラにフォールバック
        overlay.classList.add('hidden');
        $('#camera-input').click();
      });
  }
  function stopCamera() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    $('#cam-video').srcObject = null;
    $('#camera-overlay').classList.add('hidden');
  }
  function capturePhoto() {
    const video = $('#cam-video'), canvas = $('#cam-canvas');
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return; // まだ映像が来ていない
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) { App.toast('うまく撮れませんでした'); return; } // カメラは開いたまま撮り直せる
      stopCamera();
      const file = new File([blob], 'camera-' + Date.now() + '.jpg', { type: 'image/jpeg' });
      addFiles([file]); // 記録の入力画面へ進む（addFiles内でタブ切替）
    }, 'image/jpeg', 0.9);
  }

  // ---------- 写真の追加・EXIF解析 ----------
  async function addFiles(fileList) {
    const before = pendingPhotos.length;
    const dupMsgs = [];
    const seq = formSeq; // v396: 指紋を取っている間に記録が終わった・やめたら、前の写真を新しいフォームへ入れない
    for (const f of fileList) {
      if (!f.type.startsWith('image/')) continue;
      const hash = await Api.fileHash(f);
      if (seq !== formSeq) return;
      // 二重登録の防止: 登録済みの写真・選択済みの写真は追加しない
      if (hash) {
        const dup = Store.findPhotoByHash(hash);
        if (dup) {
          const shop = Store.getShop(dup.shopId);
          const visit = Store.visits().find(v => v.id === dup.visitId);
          const when = visit ? ((d) => { const y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : ''; return `${y}${d.getMonth() + 1}月${d.getDate()}日`; })(new Date(visit.datetime)) : '';
          const where = shop ? `（「${shop.name}」${when ? ` ${when}` : ''}）` : '';
          dupMsgs.push(`この写真は登録されています。${where}`);
          continue;
        }
        if (pendingPhotos.some(p => p.hash === hash)) {
          dupMsgs.push(`この写真はすでに選択されています。`);
          continue;
        }
      }
      pendingPhotos.push({ file: f, url: URL.createObjectURL(f), type: 'dish', hash });
    }
    const dupBox = $('#dup-status');
    if (dupMsgs.length) {
      dupBox.classList.remove('hidden');
      dupBox.textContent = '' + dupMsgs.join(' ／ ');
      // 追加できた写真が1枚も無い（＝すべて重複）ときは登録画面に切り替わらず
      // #dup-status が見えないため、トーストでも知らせる
      if (pendingPhotos.length === before) App.toast('この写真は登録されています'); // v393: トーストに「。」を付けない
    } else {
      dupBox.classList.add('hidden');
    }
    renderPreviews();
    // 写真を撮った／選んだら、記録の入力画面へ進める
    if (pendingPhotos.length > before) {
      App.switchTab('register');
      window.scrollTo({ top: 0 });
      // 次に必要なのは店舗名なので、未入力なら自動でフォーカスして迷わせない
      // （タブ切り替えの描画が落ち着いてから。EXIFの候補が出たらそのままタップでもOK）
      const nameIn = $('#f-shop-name');
      if (!nameIn.value.trim()) setTimeout(() => nameIn.focus(), 350);
    }
    updateSaveState();
    // 読み取り済みのファイル選択を空に戻す（同じ写真を選び直したとき change が発火するように）
    $('#photo-input').value = '';
    $('#camera-input').value = '';
    await analyzeExif();
  }

  function renderPreviews() {
    // 1枚目: 全幅の写真（右下に「写真を変更」、右上に✕）。2枚目以降: 下の帯に小さく。帯の最後は「＋」
    const hero = $('#reg-photo');
    hero.innerHTML = '';
    hero.classList.toggle('no-photo', !pendingPhotos.length);
    if (!pendingPhotos.length) {
      // 写真が無い2枚目（店を選んで来たとき・写真なしで記録）: 写真を足す入口を置く（v348〜）
      hero.innerHTML = `<div class="reg-photo-empty">
          <button type="button" class="reg-photo-cam">${Views.icons.camera}<span>写真を撮る</span></button>
          <button type="button" class="reg-photo-lib">${Views.icons.images}<span>写真から選ぶ</span></button>
        </div>`;
      hero.querySelector('.reg-photo-cam').addEventListener('click', openCamera);
      hero.querySelector('.reg-photo-lib').addEventListener('click', () => $('#photo-input').click());
    }
    if (pendingPhotos.length) {
      const p = pendingPhotos[0];
      hero.innerHTML = `<img src="${p.url}" alt="">
        <button type="button" class="reg-photo-x remove" aria-label="この写真を外す">${Views.icons.x}</button>
        <button type="button" class="reg-photo-chg">${Views.icons.camera} 写真を追加</button>`;
      hero.querySelector('.remove').addEventListener('click', () => { URL.revokeObjectURL(p.url); pendingPhotos.splice(0, 1); visitDate = earliestPhotoDate(); renderPreviews(); updateStep(); }); // v393: 外した写真の日付を残さない
      hero.querySelector('.reg-photo-chg').addEventListener('click', openCamera);
    }
    const box = $('#photo-previews');
    box.innerHTML = '';
    pendingPhotos.slice(1).forEach((p, j) => {
      const i = j + 1;
      const div = document.createElement('div');
      div.className = 'photo-preview';
      div.innerHTML = `
        <img src="${p.url}" alt="">
        <button type="button" class="remove" data-i="${i}" aria-label="この写真を外す">${Views.icons.x}</button>`;
      div.querySelector('.remove').addEventListener('click', () => {
        URL.revokeObjectURL(p.url);
        pendingPhotos.splice(i, 1);
        visitDate = earliestPhotoDate(); // v393
        renderPreviews();
      });
      // 写真をタップ: 1枚目（代表）にする／左右へ動かす／外す（v371〜）
      div.querySelector('img').addEventListener('click', () => {
        const move = (to) => { const [x] = pendingPhotos.splice(i, 1); pendingPhotos.splice(to, 0, x); renderPreviews(); };
        Views.openActionSheet([
          { label: '1枚目（代表）にする', onClick: () => move(0) },
          ...(i > 1 ? [{ label: '左へ', onClick: () => move(i - 1) }] : []),
          ...(i < pendingPhotos.length - 1 ? [{ label: '右へ', onClick: () => move(i + 1) }] : []),
          { label: '外す', danger: true, onClick: () => { URL.revokeObjectURL(p.url); pendingPhotos.splice(i, 1); visitDate = earliestPhotoDate(); renderPreviews(); } } /* v393 */,
        ]);
      });
      box.appendChild(div);
    });
    if (pendingPhotos.length > 1) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'photo-add';
      add.title = '写真を追加';
      add.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
      add.addEventListener('click', openCamera);
      box.appendChild(add);
    }
    updateStep();
  }

  async function analyzeExif() {
    if (!pendingPhotos.length) { $('#exif-status').classList.add('hidden'); return; }
    const status = $('#exif-status');
    status.classList.remove('hidden');
    status.classList.remove('warn');
    status.textContent = '写真を解析しています…';

    const seq = formSeq; // v393: 解析中に記録が終わった・やめたら、結果は捨てる
    const run = ++exifRun; // v396: 写真を続けて足したとき、古い解析の結果で上書きしない
    let gps = null;
    for (const p of pendingPhotos.slice()) {
      // v396: 解析済みの写真（下書きの写真＝圧縮済みで EXIF が無い、を含む）は読み直さない。以前は下書きに写真を足すと下書きの日付・位置が消えた
      if (p.exifTime === undefined) {
        const ex = await Api.parseExif(p.file);
        if (seq !== formSeq || run !== exifRun) return;
        p.gps = ex.lat != null && ex.lon != null ? { lat: ex.lat, lon: ex.lon } : null;
        p.exifTime = ex.date instanceof Date ? ex.date : null; // v393: 写真を外したときに日付を計算し直せるよう控える
      }
      if (!gps && p.gps) gps = p.gps;
    }
    if (gps) { lastGps = gps; lastGpsFromPhoto = true; } // 名前検索の基準位置としても使う
    else if (lastGpsFromPhoto) { lastGps = null; lastGpsFromPhoto = false; } // 位置のあった写真を外した。下書き・現在地の位置は残す

    // 訪問日 = 撮影日として自動記録（あとから一覧の✏️編集で修正可能）
    // v393: 常にいまの写真から決める（使える撮影日が無ければ ''＝保存時に当日）
    visitDate = earliestPhotoDate();

    if (gps) {
      status.classList.remove('hidden');
      status.innerHTML = `位置情報から周辺の店の候補を検索中…`;
      await loadCandidates(gps.lat, gps.lon);
      if (seq !== formSeq) return;
      status.classList.add('hidden'); // 案内は消し、候補だけ表示する
    } else {
      status.classList.add('hidden'); // 位置情報なしの案内は表示しない
      // v396: 位置の無い写真（アプリ内のカメラ・位置を切った写真）でも、撮ったばかりなら今いる場所の周辺の店を出す（自動では選ばない）
      // 撮影日が2時間以内の写真か、アプリ内のカメラで撮った写真（camera-…）だけ。日付の無い画像（スクリーンショットなど）では現在地を聞かない
      const recent = pendingPhotos.every(p => (p.exifTime && Math.abs(Date.now() - p.exifTime.getTime()) < 2 * 3600 * 1000) || (!p.exifTime && p.file && /^camera-/.test(p.file.name || '')));
      if (recent && !lastGps && !selected && !$('#f-shop-name').value.trim()) {
        getCurrentPos(4000).then(pos => {
          if (!pos || seq !== formSeq || lastGps || selected || $('#f-shop-name').value.trim()) return;
          lastGps = pos; lastGpsFromPhoto = false; // 写真由来ではない（手入力の店の位置には使わない。v393）
          return loadCandidates(pos.lat, pos.lon, { auto: false });
        }).catch(() => {});
      }
    }

    if (seq !== formSeq) return;
    await classifyPhotos();
  }

  // AIによる料理ジャンル判定（仕様書v2 §5）。判定結果はすべて修正可能。
  async function classifyPhotos() {
    const ai = $('#ai-status');
    ai.classList.add('hidden');
    const dishPhoto = pendingPhotos.find(p => p.type === 'dish') || pendingPhotos[0];
    if (!dishPhoto) return;
    if (dishPhoto.classified) return;
    if (!Api.canClassify()) return; // 自分のキーも開発者提供も無いときは何もしない
    if (!userTouchedGenres) updateGenrePill('判定中…');
    const seq = formSeq; // v393
    try {
      dishPhoto.classified = true; // v394: 同じ写真を何度もAI判定しない
      const result = await Api.classifyDishPhoto(dishPhoto.file);
      if (seq !== formSeq) return; // 別の記録のフォームに結果を入れない
      if (result && (result.dishGenres.length || result.shopGenre)) {
        if (result.shopGenre) derivedShopGenre = result.shopGenre; // 内部保持のみ
        if (userTouchedGenres) {
          // 手動選択を優先: AIの結果では上書きしない
          updateGenrePill();
        } else if (result.confident === false && result.dishGenres.length) {
          // 自信なし: 勝手に入れず、札に「？」付きで候補を見せて選択肢を開く（v337〜）
          updateGenrePill(`${result.dishGenres[0]}？`); // v373〜 選択肢は開かない（札をタップするとシート）
        } else {
          aiClassified = true;
          autoFilledGenres = true;
          selectedDishGenres.clear();
          result.dishGenres.forEach(g => selectedDishGenres.add(g));
          dishPicker.reset();
          updateGenrePill();
        }
      } else {
        // 判定できず: 札は「ジャンルを選ぶ」のまま（v373〜 札をタップするとシート）
        updateGenrePill();
      }
    } catch (e) {
      if (seq !== formSeq) return; // v393
      console.error('AI classification failed:', e);
      updateGenrePill();
      const relayMsg = /中継サーバー HTTP \d+ — (.+)$/.exec(e && e.message || ''); // Worker 経由の説明（上限など）
      if (relayMsg || (e && e.status === 401)) { // 上限やキーの問題だけは1行で知らせる
        ai.classList.remove('hidden'); ai.classList.add('warn');
        ai.textContent = relayMsg ? relayMsg[1] : 'APIキーが無効です。設定から確認してください。';
      }
    }
  }

  // ---------- フローA: 周辺候補 ----------
  // 写真なしで記録（v378〜）: 現在地が取れれば周辺の店（登録済み → 候補）を出す。店名を打ち始めていたら出さない
  async function nearbyForNoPhoto() {
    const pos = await getCurrentPos(4000);
    if (!pos || !forceStep2 || pendingPhotos.length || $('#f-shop-name').value.trim() || selected) return;
    lastGps = pos; lastGpsFromPhoto = false; // v393: 現在地は写真由来ではない。候補の距離・重複の確認・位置の基準に（写真の GPS と同じ扱い）
    await loadCandidates(pos.lat, pos.lon, { auto: false });
  }
  async function loadCandidates(lat, lon, opt) {
    const box = $('#shop-candidates');
    box.innerHTML = '<p class="hint">検索中…</p>';
    const seq = formSeq; // v393
    try {
      // 登録済み店舗（200m以内）を先頭に表示
      const existing = Store.shops()
        .filter(s => s.lat != null && Store.distMeters(lat, lon, s.lat, s.lon) < 200)
        .map(s => ({ shop: s, distance: Store.distMeters(lat, lon, s.lat, s.lon) }))
        .sort((a, b) => a.distance - b.distance);

      const results = await Api.nearbyShops(lat, lon, 200);
      if (seq !== formSeq) return; // v393: 記録が終わった・やめたあとの結果は捨てる
      results.forEach(c => { c.flow = 'nearby'; });
      existing.forEach(e => { e.flow = 'nearby'; });
      lastQuery = '';
      renderCandidates(box, existing, results, '近くに店の候補が見つかりませんでした。店名を入れると名前で探せます');
      // 利用者が自分で店を選んだあと（2枚目の写真の追加など）は、自動選択で上書きしない
      if (selected && !autoPicked) return;
      if (opt && opt.auto === false) return; // v378〜 写真なしのときはタップで選んでもらう
      if ($('#f-shop-name').value.trim() && !autoPicked) return; // v393: 打ち始めた店名を遅れて届いた結果で上書きしない
      autoSelectBest(box, existing, results);
    } catch (e) {
      if (seq !== formSeq) return; // v393
      box.innerHTML = '<p class="hint">店を探せませんでした（通信エラー）。店名を入れると名前で探せます</p>';
    }
  }

  // 候補に距離を添え、登録済みは近い順に（v377〜）。基準位置が無ければ何もしない。検索結果の並び（関連度）は変えない
  function withDistances(existing, results, ref) {
    if (!ref || ref.lat == null) return;
    for (const e of existing) if (e.shop && e.shop.lat != null && e.shop.lon != null) e.distance = Store.distMeters(ref.lat, ref.lon, e.shop.lat, e.shop.lon);
    existing.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    for (const c of results || []) if ((c.distance == null || !isFinite(c.distance)) && c.lat != null && c.lon != null) c.distance = Store.distMeters(ref.lat, ref.lon, c.lat, c.lon);
  }
  function renderCandidates(box, existing, results, emptyMsg) {
    box.innerHTML = '';
    const seenOsm = new Set();

    // 店舗を選んだら、その候補だけ残して他は非表示にする（画面を短く保つ）
    const markSelected = (div) => {
      box.querySelectorAll('.candidate').forEach(x => {
        x.classList.remove('selected');
        if (x !== div) x.classList.add('hidden');
      });
      div.classList.remove('hidden');
      div.classList.add('selected');
    };

    for (const { shop, distance } of existing) {
      if (shop.osmId) seenOsm.add(shop.osmId);
      const div = document.createElement('div');
      div.className = 'candidate';
      div.dataset.shopId = shop.id;
      div.innerHTML = `
        <div class="c-main">
          <div class="c-name">${esc(shop.name)}<span class="badge">登録済み・再訪</span></div>
          <div class="c-sub">訪問${Store.visitCount(shop.id)}回　味★${Store.avgRating(shop.id) ? (Math.round(Store.avgRating(shop.id) * 10) / 10).toFixed(1) : '－'}</div>
        </div>
        <div class="c-dist">${distance != null ? Math.round(distance) + 'm' : ''}</div>`;
      div.addEventListener('click', () => { autoPicked = false; markSelected(div); recordHit(existing.find(e => e.shop === shop), [...box.querySelectorAll('.candidate')].indexOf(div), false); chooseExisting(shop); });
      box.appendChild(div);
    }

    for (const c of results) {
      if (c.osmId && seenOsm.has(c.osmId)) continue;
      const div = document.createElement('div');
      div.className = 'candidate';
      div.innerHTML = `
        <div class="c-main">
          <div class="c-name">${esc(c.name)}</div>
          <div class="c-sub">${esc(c.amenity || '')}${c.cuisine ? '・' + esc(String(c.cuisine).split(/[;,]/).join('・')) : ''}${c.address ? '・' + esc(c.address) : ''}</div>
        </div>
        <div class="c-dist">${c.distance != null && isFinite(c.distance) ? Math.round(c.distance) + 'm' : ''}</div>`;
      div.addEventListener('click', () => { autoPicked = false; markSelected(div); recordHit(c, [...box.querySelectorAll('.candidate')].indexOf(div), false); chooseCandidate(c); });
      box.appendChild(div);
    }

    if (!box.children.length) box.innerHTML = `<p class="hint">${emptyMsg}</p>`;
    updateDupHint(); // v395: 同じ店が候補の一覧に「登録済み」で出ているなら、上の案内は出さない（二重になる）
  }

  // 一番近い候補を自動選択する（操作を最小化 — 写真と★評価だけで登録できる導線）
  // 登録済み店舗が近くにある場合はそちらを優先（再訪の可能性が高いため）
  function autoSelectBest(box, existing, results) {
    const els = box.querySelectorAll('.candidate');
    if (!els.length) return;
    let idx = 0;
    if (existing.length && results.length) {
      // 既存店舗は30mのハンデ付きで優先
      idx = (existing[0].distance <= results[0].distance + 30) ? 0 : existing.length;
    }
    const el = els[Math.min(idx, els.length - 1)];
    autoPicked = true;
    els.forEach(x => { if (x !== el) x.classList.add('hidden'); }); // 選んだ候補以外を隠す
    el.classList.add('selected');
    if (idx < existing.length) { recordHit(existing[idx], idx, true); chooseExisting(existing[idx].shop); }
    else { const c = results[idx - existing.length] || results[0]; recordHit(c, idx, true); chooseCandidate(c); }
    // 残る操作は★評価だけなので、評価欄まで自動スクロール
    setTimeout(() => {
      const rating = document.querySelector('#f-rating');
      if (rating) rating.scrollIntoView({ block: 'center' });
    }, 600);
  }

  // ---------- 予測検索（入力中の自動候補） ----------
  async function suggest(q) {
    const mySeq = ++suggestSeq;
    const box = $('#shop-candidates');

    // 登録済み店舗は即時に出せる（再訪の最短導線）
    const existing = Store.shops()
      .filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
      .map(s => ({ shop: s, distance: null })); // v377〜 3件に絞るのは距離で並べたあと（下）

    // 基準位置: 写真のGPS → 現在地（現在地は記録の間だけ使い回す）
    // v393: いまの lastGps を優先（前の記録の基準位置を引きずらない）
    let ref = lastGps || suggestRef;
    if (!ref) {
      ref = await getCurrentPos(2500);
      if (mySeq !== suggestSeq) return;
      suggestRef = ref;
    }
    if (mySeq !== suggestSeq) return;

    let results = [];
    try { results = await Api.suggestShops(q, ref); } catch { /* 通信エラー時は登録済みのみ */ }
    if (mySeq !== suggestSeq) return;                        // 入力が進んだ・手動検索が始まった
    if ($('#f-shop-name').value.trim() !== q) return;        // 入力値が変わっていたら破棄
    withDistances(existing, results, ref); // v377〜 登録済みは近い順、候補にも距離
    existing.splice(3); // 近い3件だけ

    if (!existing.length && !results.length) return; // 何もなければ表示を変えない
    results.forEach(c => { c.flow = 'suggest'; });
    existing.forEach(e => { e.flow = 'suggest'; });
    lastQuery = q;
    renderCandidates(box, existing, results, ''); // v394: 下の説明文はやめた（一画面の情報は少なく。v335 の方針）
  }

  // ---------- フローB: 名前検索（複数の情報源を統合、個人店対応） ----------
  async function doSearch() {
    clearTimeout(suggestTimer);
    suggestSeq++; // 進行中の予測検索を無効化（手動検索を優先）
    const q = $('#f-shop-name').value.trim();
    const box = $('#shop-candidates');
    if (!q) { box.innerHTML = '<p class="hint">店名を入れてから検索してください</p>'; return; }
    const seq = formSeq; // v393
    box.innerHTML = '<p class="hint">検索中…（周辺の店の情報も含めて探しています）</p>';

    // 登録済み店舗を先に（§4.3: 再訪の登録を最短に）
    const existing = Store.shops()
      .filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
      .map(s => ({ shop: s, distance: null }));

    // 基準位置: 写真のGPS → 現在地。まず入力そのままの文字列で探し、
    // 何も見つからなかったときだけ「店名 地名」（最後の語を地名）に分けて探し直す（v394〜）
    let ref = lastGps || await getCurrentPos();
    if (seq !== formSeq) return;
    let nameQuery = q;
    withDistances(existing, [], ref); // v377〜 登録済みは近い順（検索結果の距離は結果が来てから）

    const emptyMsg = '見つかりませんでした。「店名 地名」（例: ○○軒 渋谷）で探し直すか、そのまま店名だけで記録できます';
    const mySeq = ++searchSeq;

    // まず高速な検索（Photon + Nominatim）を即表示
    let results = [];
    try { results = await Api.searchShopsFast(q, nameQuery, ref); } catch { /* 通信エラー時は登録済みのみ */ }
    if (mySeq !== searchSeq || seq !== formSeq) return;
    if (!results.length && !lastGps) {
      const parts = q.split(/[\s　]+/).filter(Boolean);
      if (parts.length >= 2) {
        const loc = await Api.searchPlaces(parts[parts.length - 1]).catch(() => []);
        if (mySeq !== searchSeq || seq !== formSeq) return;
        if (loc.length && loc[0].lat != null) {
          ref = { lat: loc[0].lat, lon: loc[0].lon };
          nameQuery = parts.slice(0, -1).join(' ');
          withDistances(existing, [], ref);
          try { results = await Api.searchShopsFast(q, nameQuery, ref); } catch { /* 通信エラー時は登録済みのみ */ }
          if (mySeq !== searchSeq || seq !== formSeq) return; // 新しい検索が始まっていたら破棄（v393: 記録が変わっていても）
        }
      }
    }
    withDistances(existing, results, ref); // v377〜 検索結果にも距離
    results.forEach(c => { c.flow = 'search'; });
    existing.forEach(e => { e.flow = 'search'; });
    lastQuery = q;
    renderCandidates(box, existing, results, emptyMsg);

    // 各検索源の状態を表示（エラー原因の切り分け用）
    const gs = Api.googleSearchStatus();
    const src = Api.searchSourcesStatus();
    const hint = (t) => { const p = document.createElement('p'); p.className = 'hint'; p.textContent = t; box.appendChild(p); };
    for (const [k, label] of [['openpoi', 'OpenPOI'], ['yahoo', 'Yahoo!ローカルサーチ'], ['hotpepper', 'ホットペッパー']]) {
      if (src[k] && src[k].state === 'error') {
        hint(`${label}でエラー: ${src[k].message}` + (Api.keySource(k) === 'own' ? '｜設定のキーが正しいか確認してください。' : '｜しばらくしてからもう一度お試しください。'));
      }
    }
    if (gs.state === 'error') {
      hint(`Googleマップ検索でエラー: ${gs.message}` + (Api.keySource('google') === 'own'
        ? '｜設定のキーが正しいか、Google Cloudで「Places API (New)」の有効化と課金設定が済んでいるか確認してください。'
        : '｜しばらくしてからもう一度お試しください。'));
    } else if (!results.length && !existing.length) {
      hint('見つからないときは「店名 地名」（例: ○○軒 渋谷）で探すか、「地図で指定」から位置を指定してください。');
    }

    // 周辺の詳細検索（個人店に強いが遅い）を裏で実行し、結果が来たら追加表示
    if (ref) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = '近くの店をさらに探しています…';
      box.appendChild(note);
      const more = await Api.searchShopsNearby(nameQuery, ref).catch(() => []);
      note.remove();
      if (mySeq !== searchSeq || seq !== formSeq) return;      // 別の検索が始まった
      if (selected) return;                  // すでに店舗選択済みなら邪魔しない
      if (more.length) {
        more.forEach(c => { c.flow = 'search-nearby'; });
        results = Api.mergeCandidates([more, results], ref);
        renderCandidates(box, existing, results, emptyMsg);
      }
    }
  }

  // ---------- 検索ヒットの記録 ----------
  // タップ（または自動選択）した候補が、どの機能（flow）・どの情報源（source）で見つかったかを残す。
  // 既存店舗の候補は {shop, flow}、外部の候補は {name, source, flow, …}
  let lastQuery = '';
  let lastHit = null;
  function recordHit(cand, rank, auto) {
    if (!cand) return;
    const isExisting = !!cand.shop;
    const entry = {
      flow: cand.flow || 'unknown',
      source: isExisting ? 'existing' : (cand.source || (cand.osmId ? 'osm' : 'unknown')),
      name: isExisting ? cand.shop.name : (cand.name || ''),
      query: lastQuery, rank: rank >= 0 ? rank : null, auto: !!auto,
    };
    // 複数の情報源で見つかった候補は、その全部を残す（例: ['osm', 'openpoi']。v317〜）
    if (!isExisting && Array.isArray(cand.sources) && cand.sources.length > 1) entry.sources = cand.sources.slice(0, 8);
    if (isExisting) entry.shopId = cand.shop.id;
    lastHit = Store.addHit(entry);
  }

  // ---------- 店舗の選択 ----------
  function chooseExisting(shop) {
    // v396: 前の候補から自動で入ったジャンルは外す（chooseCandidate と同じ。v393 の決めごと）
    if (autoFilledGenres && !userTouchedGenres && !aiClassified) {
      selectedDishGenres.clear(); derivedShopGenre = ''; autoFilledGenres = false;
      dishPicker.reset(); updateGenrePill();
    }
    selected = { existingShopId: shop.id, osmId: shop.osmId, name: shop.name, address: shop.address, lat: shop.lat, lon: shop.lon, pref: shop.pref, city: shop.city, station: shop.station, country: shop.country };
    $('#f-shop-name').value = shop.name;
    $('#f-address').value = shop.address || '';
    $('#f-station').value = shop.station || '';
    $('#f-pref').value = shop.pref || '';
    $('#f-city').value = shop.city || '';
    derivedShopGenre = ''; // 既存店舗のジャンルはそのまま維持
    updateDupHint(); // 登録済みの店を選んだので「登録済み: …」は消す（v365〜）
    $('#f-fav').checked = !!shop.favorite;
    updateFavStar();
    // 店の評価は既存の値を引き継ぐ（再訪時は入力不要）
    shopRatings = { casual: shop.casual || 0, atmosphere: shop.atmosphere || 0, speed: shop.speed || 0 };
    mountAxisStars();
    $('#selected-shop-note').classList.add('hidden'); // 選択後は候補行が確認になるため案内は出さない（画面内に収める）
    updateSaveState(); // 店舗名がプログラムから入るためここでも更新
    syncMeta(); updateStep();
    backfillMissing(shop);
  }

  // 登録済み店舗の欠損項目（最寄駅・住所・地域）を再取得して補完する。
  // 初回登録時にAPIが失敗して空のまま保存されたケースの救済（保存時に永続化される）。
  async function backfillMissing(shop) {
    if (shop.lat == null || shop.lon == null) return;
    const needStation = !shop.station;
    const needGeo = !shop.pref || !shop.city || !shop.address;
    if (!needStation && !needGeo) return;

    const stationInput = $('#f-station');
    if (needStation) stationInput.placeholder = '最寄駅を検索中…';
    const seq = formSeq; // v393
    try {
      const [geo, station] = await Promise.all([
        needGeo ? Api.reverseGeocode(shop.lat, shop.lon) : Promise.resolve({}),
        needStation ? Api.nearestStation(shop.lat, shop.lon) : Promise.resolve(''),
      ]);
      if (seq !== formSeq) return; // v393: 別の記録のフォームに住所・駅を入れない
      // ユーザーが手入力済みの欄は上書きしない
      if (needStation && station && !stationInput.value) stationInput.value = station;
      if (geo.pref && !$('#f-pref').value) $('#f-pref').value = geo.pref;
      if (geo.city && !$('#f-city').value) $('#f-city').value = geo.city;
      if (geo.address && !$('#f-address').value) $('#f-address').value = geo.address;
      // 取得できた値は店舗データにも保存し、選択しただけで欠損が直るようにする
      const patch = {};
      if (needStation && station && !shop.station) patch.station = station;
      if (geo.pref && !shop.pref) patch.pref = geo.pref;
      if (geo.city && !shop.city) patch.city = geo.city;
      if (geo.address && !shop.address) patch.address = geo.address;
      if (shop.id && Object.keys(patch).length) Store.updateShop(shop.id, patch); // 行きたい店から来たとき（店がまだ無い）はフォームの欄だけ
    } finally {
      stationInput.placeholder = '自動入力されます';
    }
  }

  async function chooseCandidate(c) {
    // OSMタグからのジャンル推定（AIが判定済みの場合は上書きしない — §5）
    {
      const g = Api.guessGenres(c);
      // v393: 前に選んだ候補から自動で入ったジャンルは、別の店を選んだら外す（スタバの「カフェ」が次の店に残らない）
      if (autoFilledGenres && !userTouchedGenres && !aiClassified) {
        selectedDishGenres.clear(); derivedShopGenre = ''; autoFilledGenres = false;
        dishPicker.reset(); updateGenrePill();
      }
      if (g.shop) derivedShopGenre = g.shop; // 内部保持のみ
      // 地図データからの推定は「まだ何も選ばれていないとき」だけ初期値として設定
      // （手動選択・AI判定を上書きしない）
      if (g.dish && !aiClassified && !userTouchedGenres && selectedDishGenres.size === 0) {
        selectedDishGenres.add(g.dish);
        autoFilledGenres = true;
        dishPicker.reset();
        updateGenrePill(); // v393: 札に反映
      }
    }
    $('#selected-shop-note').classList.add('hidden'); // 選択後は候補行が確認になるため案内は出さない（画面内に収める）
    await applyLocation(c);
  }

  async function applyLocation(c) {
    // v396: 前に選んだ店（登録済み・別の候補）の住所・駅・県・市が残らないよう、選び直したら空にしてから入れる
    if (selected) for (const id of ['#f-address', '#f-station', '#f-pref', '#f-city']) $(id).value = '';
    selected = { existingShopId: null, osmId: c.osmId || '', name: c.name || '', address: c.address || '', lat: c.lat, lon: c.lon, pref: '', city: '',
      coarse: !!c.coarse, posLevel: c.posLevel || (c.lat != null ? 'block' : ''), // 位置の精度（v340〜。町丁目までなら写真の位置を優先する）
      station: '', country: '日本',
      // 出どころと利用条件（OpenPOI 由来の店は licenses / attributions を記録と一緒に保存する）
      // 出典（ライセンス）付きのデータを出した情報源を優先（OSM と OpenPOI の両方で見つかった店は OpenPOI。v317〜）
      dataSource: c.dataSource || c.source || (c.osmId ? 'osm' : ''), dataLicenses: c.licenses || [], dataAttributions: c.attributions || [] };
    const mine = selected; // 通信中に別の候補が選ばれたら、この結果は捨てる
    $('#f-shop-name').value = c.name || '';
    if (c.address) $('#f-address').value = c.address;
    // 検索源が都道府県・市区町村を持っていれば先に入れておく（OpenPOI は営業許可データ由来）
    if (c.pref) { $('#f-pref').value = c.pref; selected.pref = c.pref; }
    if (c.city) { $('#f-city').value = c.city; selected.city = c.city; }
    // 検索源（Yahoo!／ホットペッパー）が最寄駅を持っていれば先に入れておく（通信待ちなしで確定）
    if (c.station) { const st = c.station.endsWith('駅') ? c.station : c.station + '駅'; $('#f-station').value = st; selected.station = st; }
    updateDupHint(); // 候補の名前・位置で登録済みの店と照らす（v365〜）

    if (c.lat != null && c.lon != null) {
      // 逆ジオコーディング＋最寄駅（店舗確定時に1回のみ — §15.1）
      const stationInput = $('#f-station');
      stationInput.placeholder = '最寄駅を検索中…';
      try {
        const [geo, station] = await Promise.all([
          Api.reverseGeocode(c.lat, c.lon),
          Api.nearestStation(c.lat, c.lon),
        ]);
        if (selected !== mine) return;
        if (geo.address && !c.address) { $('#f-address').value = geo.address; selected.address = geo.address; }
        if (geo.pref && !selected.pref) { $('#f-pref').value = geo.pref; selected.pref = geo.pref; }
        if (geo.city && !selected.city) { $('#f-city').value = geo.city; selected.city = geo.city; }
        if (geo.country) selected.country = geo.country;
        if (station && !selected.station) { stationInput.value = station; selected.station = station; }
      } finally {
        stationInput.placeholder = '自動入力されます';
        syncMeta();
      }
    }
    syncMeta(); updateStep();
  }

  // 店の位置を決める（v340〜）: 候補の位置が町丁目までの粗いもの（OpenPOI の営業許可データ）で、
  // 写真の撮影位置か現在地（gps）がその近く（600m 以内）にあれば、そちらを店の位置にする。
  // 遠ければ別の場所の写真なので候補の位置のまま。精度は posLevel（gps / block / town / manual / geocode）に残す
  function pickBestPos(sel, gps) {
    if (!sel || sel.lat == null || sel.lon == null) return { lat: null, lon: null, posLevel: '' };
    if (sel.coarse && gps && gps.lat != null && Store.distMeters(sel.lat, sel.lon, gps.lat, gps.lon) <= 600) {
      return { lat: gps.lat, lon: gps.lon, posLevel: 'gps' };
    }
    return { lat: sel.lat, lon: sel.lon, posLevel: sel.posLevel || (sel.coarse ? 'town' : 'block') };
  }

  // 店舗名・味の評価が埋まるまで保存ボタンを薄くする（案内文は出さない。v335〜。
  // ボタン自体は押せるままにして、押されたら save() のトーストで理由を伝える）
  function updateSaveState() {
    const btn = $('#save-btn');
    if (!btn) return;
    const ok = !!$('#f-shop-name').value.trim() && !!currentRating;
    btn.classList.toggle('is-disabled', !ok);
    const hint = $('#save-hint');
    if (hint) hint.classList.add('hidden');
  }

  function note(msg) {
    const n = $('#selected-shop-note');
    n.classList.remove('hidden');
    n.textContent = msg;
  }

  // ---------- 保存 ----------
  // 保存後の後追い（v394〜）: 通信が間に合わず駅・県・市・住所が空のまま保存された店に、空の欄だけ補う。
  // 保存先は店 id なので formSeq では捨てない（フォームは既にリセットされている）。失敗しても何も出さない
  async function fillMissingAfterSave(shopId, pos) {
    try {
      const sh = Store.getShop(shopId);
      if (!sh) return;
      const lat = sh.lat != null ? sh.lat : (pos && pos.lat);
      const lon = sh.lon != null ? sh.lon : (pos && pos.lon);
      if (lat == null || lon == null) return;
      const needStation = !sh.station;
      const needGeo = !sh.pref || !sh.city || !sh.address;
      if (!needStation && !needGeo) return;
      const [geo, station] = await Promise.all([
        needGeo ? Api.reverseGeocode(lat, lon).catch(() => ({})) : Promise.resolve({}),
        needStation ? Api.nearestStation(lat, lon).catch(() => '') : Promise.resolve(''),
      ]);
      const cur = Store.getShop(shopId); // 待っている間に直された値を上書きしないよう、書く直前に読み直す
      if (!cur) return;
      const patch = {};
      if (station && !cur.station) patch.station = station;
      if (geo && geo.pref && !cur.pref) patch.pref = geo.pref;
      if (geo && geo.city && !cur.city) patch.city = geo.city;
      if (geo && geo.address && !cur.address) patch.address = geo.address;
      if (Object.keys(patch).length) Store.updateShop(shopId, patch);
    } catch { /* 静かに諦める */ }
  }

  async function save() {
    const name = $('#f-shop-name').value.trim();
    // 訪問日は自動記録（写真の撮影日→なければ当日）。編集画面から修正可能
    const dtVal = visitDate || toLocalInput(new Date());
    if (!name) { App.toast('店名を入れてください'); return; }
    if (!currentRating) { App.toast('味の評価（★）を選択してください'); return; }

    const btn = $('#save-btn');
    btn.disabled = true; btn.textContent = '保存中…';
    let createdShopId = null, createdVisitId = null; // 途中で失敗したときに取り消すため
    try {
      // --- 店舗の確定（既存 → 照合 → 新規） ---
      // v393: 候補から選ばず手で打った店は位置が無い。写真の EXIF の GPS（現在地のフォールバックは除く）があれば、その位置で照合・登録する
      const selHasPos = !!(selected && selected.lat != null && selected.lon != null);
      const gpsPos = !selHasPos && lastGpsFromPhoto && lastGps && lastGps.lat != null && lastGps.lon != null ? lastGps : null;
      const qLat = selHasPos ? selected.lat : (gpsPos ? gpsPos.lat : null);
      const qLon = selHasPos ? selected.lon : (gpsPos ? gpsPos.lon : null);
      let shop = selected && selected.existingShopId ? Store.getShop(selected.existingShopId) : null;
      let asked = false;
      if (!shop) {
        shop = Store.matchShop({
          osmId: selected ? selected.osmId : '',
          name,
          lat: qLat,
          lon: qLon,
        });
        // v396: 位置が無いと名前だけで照合する（別の町の同じ名前の店＝チェーン店の別の店舗に黙って記録していた）。位置のある店なら確かめる
        const osmHit = shop && selected && selected.osmId && shop.osmId === selected.osmId;
        if (shop && qLat == null && !osmHit && shop.lat != null) {
          asked = true;
          const ans = await askSameShop(shop);
          if (ans === undefined) return; // やめた
          shop = ans;
        }
      }
      if (!shop && !asked) {
        // 照合（同じ名前＋50m）に掛からなくても、名前がよく似た登録済みの店があれば確かめる（二重登録を防ぐ。v365〜）
        const sim = Views.similarShops(name, qLat, qLon);
        if (sim.length) {
          const ans = await askSameShop(sim[0].shop);
          if (ans === undefined) return; // やめた
          if (ans) shop = ans;
        }
      }
      const shopData = {
        name,
        address: $('#f-address').value.trim(),
        station: $('#f-station').value.trim(),
        pref: $('#f-pref').value.trim(),
        city: $('#f-city').value.trim(),
        favorite: $('#f-fav').checked,
      };
      // AI/OSM由来の店舗ジャンル（UI廃止後も地図ラベルのフォールバック用に内部保存）
      if (derivedShopGenre) shopData.shopGenre = derivedShopGenre;
      // 店の評価（3軸）: つけた値のみ反映（0のままなら既存値を消さない）
      for (const k of AXES) if (shopRatings[k] > 0) shopData[k] = shopRatings[k];
      let pos = pickBestPos(selected, lastGps);
      if (pos.lat == null && gpsPos) pos = { lat: gpsPos.lat, lon: gpsPos.lon, posLevel: 'gps' }; // v393
      if (shop) {
        // 候補から選ばずに既存の店へ記録するとき（名前の照合・「同じ店」の確認）は、店名はそのまま・空の欄で既存の値を消さない（v365〜）
        if (!(selected && selected.existingShopId)) {
          shopData.name = shop.name;
          for (const k of ['address', 'station', 'pref', 'city']) if (!shopData[k]) shopData[k] = shop[k] || '';
          if (!$('#f-fav').checked) shopData.favorite = !!shop.favorite;
        }
        // 既存の店の位置が町丁目までの粗さで、今回より良い位置が分かったら直す
        if (shop.posLevel === 'town' && pos.lat != null && pos.posLevel !== 'town') Object.assign(shopData, { lat: pos.lat, lon: pos.lon, posLevel: pos.posLevel });
        Store.updateShop(shop.id, shopData);
      } else {
        shop = Store.addShop(Object.assign(shopData, {
          lat: pos.lat,
          lon: pos.lon,
          posLevel: pos.posLevel,
          osmId: selected ? selected.osmId : '',
          country: selected && selected.country ? selected.country : '日本',
          dataSource: (selected && selected.dataSource) || '',
          dataLicenses: (selected && selected.dataLicenses) || [],
          dataAttributions: (selected && selected.dataAttributions) || [],
          foundBy: (lastHit && lastHit.flow) || (selected && selected.lat != null ? 'map' : 'manual'),
          foundQuery: (lastHit && lastHit.query) || '',
        }));
        createdShopId = shop.id;
        if (lastHit) lastHit.shopId = shop.id;
      }

      // --- 訪問記録 ---
      const dishGenres = [...selectedDishGenres];
      const visit = Store.addVisit({
        shopId: shop.id,
        // 日付のみ入力。タイムゾーンで日付がずれないよう正午として保存
        datetime: new Date(dtVal + 'T12:00:00').toISOString(),
        dishGenres,
        rating: currentRating,
        comment: $('#f-comment').value.trim(),
        visitType: '店内飲食', // 入力欄は廃止（データ互換のため既定値を保存）
      });
      createdVisitId = visit.id;

      // --- 写真（圧縮して保存 — §9.1） ---
      for (const p of pendingPhotos) {
        const blob = await Api.compressImage(p.file);
        const pid = await Store.addPhoto(shop.id, visit.id, p.type, blob, p.hash);
        Views.warmThumb(pid, blob); // 一覧用のサムネを今のうちに作る（v358〜）
      }
      createdVisitId = null; createdShopId = null; // ここまで来れば取り消し不要

      // 下書きから完成させた場合は、その下書きを削除
      if (activeDraftId) { await Store.deleteDraft(activeDraftId).catch(() => {}); activeDraftId = null; refreshDraftsBanner(); }

      // 登録のたびに全体の差分同期を裏で実行（今回の写真に加え、過去に失敗した分も拾い直す）
      if (typeof Cloud !== 'undefined' && Cloud.getUser && Cloud.getUser()) {
        Cloud.autoBackupSweep(true).catch(() => {});
      }

      App.toast(`「${shop.name}」に記録しました（訪問${Store.visitCount(shop.id)}回目）`);
      fillMissingAfterSave(shop.id, pos); // v394: 駅・県・市の取得が間に合わなかった分を後追い
      resetForm();
      App.switchTab('list');
      document.dispatchEvent(new CustomEvent('bitemap:saved'));
    } catch (e) {
      console.error(e);
      // 写真の保存で失敗したときは、先に作った訪問（と新規の店）を取り消して、再送で二重にならないようにする
      if (createdVisitId) { try { await Store.deleteVisit(createdVisitId); } catch { /* noop */ } }
      if (createdShopId && !Store.visitsOf(createdShopId).length) { try { await Store.deleteShop(createdShopId); } catch { /* noop */ } }
      App.toast(Store.isQuotaError(e) ? Store.QUOTA_MSG : '保存に失敗しました: ' + e.message, Store.isQuotaError(e) ? 6000 : undefined);
    } finally {
      btn.disabled = false; btn.textContent = '記録する'; // v393: index.html の表記に合わせる
    }
  }

  function resetForm() {
    formSeq++; // v393: 通信待ちの処理の結果を新しいフォームに入れない
    setTimeout(updateDupHint, 0); // 店名を空にした後で隠す（v392。先に呼ぶと、保存した直後の店が「登録済み」として次の記録に残っていた）
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.url));
    pendingPhotos = [];
    activeDraftId = null;
    selected = null;
    lastHit = null; lastQuery = '';
    currentRating = 0;
    aiClassified = false;
    autoPicked = false;
    lastGps = null; lastGpsFromPhoto = false; suggestRef = null; // v393
    renderPreviews();
    $('#photo-input').value = '';
    $('#camera-input').value = '';
    $('#dup-status').classList.add('hidden');
    $('#exif-status').classList.add('hidden');
    $('#ai-status').classList.add('hidden');
    $('#shop-candidates').innerHTML = '';
    $('#selected-shop-note').classList.add('hidden');
    clearTimeout(suggestTimer);
    suggestSeq++; // 進行中の予測検索を無効化
    ['#f-shop-name', '#f-address', '#f-station', '#f-pref', '#f-city', '#f-comment'].forEach(s => { $(s).value = ''; });
    derivedShopGenre = '';
    $('#f-fav').checked = false;
    updateFavStar();
    // 折りたたみは閉じた状態に戻す
    $('#detail-fields').classList.add('hidden'); $('#reg-comment').classList.add('hidden'); $('#reg-genres').classList.add('hidden');
    document.querySelectorAll('#record-card [data-reg-open]').forEach(b => b.classList.remove('open'));
    forceStep2 = false;
    visitDate = ''; // v393: 保存時に当日を入れる
    selectedDishGenres.clear();
    userTouchedGenres = false;
    autoFilledGenres = false;
    dishPicker.reset();
    updateGenrePill();
    mountTasteStars();
    shopRatings = { casual: 0, atmosphere: 0, speed: 0 };
    mountAxisStars();
    updateSaveState();
    syncMeta();
    updateStep();
  }

  // 入力途中か（写真・店名・評価のどれかがある）
  const isDirty = () => pendingPhotos.length > 0 || !!$('#f-shop-name').value.trim() || currentRating > 0;
  // 入力途中の記録を捨ててよいか確認してから初期化する
  function resetFormConfirmed() {
    if (isDirty() && !confirm('入力途中の記録があります。破棄して続けますか？')) return false;
    resetForm();
    return true;
  }

  // 店舗詳細から「訪問を追加」（§4.4 再訪の登録）
  function preselectShop(shopId) {
    if (!resetFormConfirmed()) return;
    const shop = Store.getShop(shopId);
    if (shop) chooseExisting(shop);
  }

  // 行きたい店の「記録する」: 店の情報をフォームへ流し込む
  // （保存すると Store.addVisit が同じ店の「行きたい」を自動で外す）
  function prefillWish(w) {
    if (!resetFormConfirmed()) return;
    const m = Store.matchShop({ name: w.name, lat: w.lat, lon: w.lon });
    if (m) { chooseExisting(m); return; } // すでに登録済みの店なら訪問の追加になる
    selected = { name: w.name, lat: w.lat != null ? w.lat : null, lon: w.lon != null ? w.lon : null, address: w.address || '' };
    $('#f-shop-name').value = w.name || '';
    if (w.address) $('#f-address').value = w.address; // v396: 行きたい店の住所も入れる
    if (w.genre && !derivedShopGenre) derivedShopGenre = w.genre;
    forceStep2 = true; updateStep();
    backfillMissing(selected); // 最寄駅・住所を自動補完（フォームの欄に入る。保存で店に入る）
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, preselectShop, prefillWish, openCamera, isDirty, pickBestPos };
})();
