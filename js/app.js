// =====================================================
// アプリ全体の制御: タブ切り替え・共通イベント・サンプルデータ
// =====================================================
const App = (() => {
  const $ = (sel) => document.querySelector(sel);
  const APP_VERSION = 'v413'; // sw.js の VERSION・index.html の ?v= と合わせる
  // v396: 保存領域が使えない環境（プライベート・サイトデータを消した直後など）でも起動が止まらないよう、読み取りは例外を握る
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  let currentTab = 'register';

  // ---------- 外部ライブラリの遅延読み込み ----------
  // 起動時に全部読むと 1MB 超になるため、必要になった画面で初めて読み込む。
  // バージョン固定＋integrity（内容のハッシュ）で改ざん・差し替えを防ぐ
  const LIBS = {
    maplibre: {
      css: { href: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', integrity: 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V' },
      js: { src: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', integrity: 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj' },
      ready: () => typeof maplibregl !== 'undefined',
    },
    exifr: { js: { src: 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js', integrity: 'sha384-KrOocIA+lZcNUz2MDavnT/FuX+CbTREJihUi0bp8QUSwhE2AkGTNpv2b7yMbBkx5' }, ready: () => typeof exifr !== 'undefined' },
    chart: { js: { src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.js', integrity: 'sha384-4W8gMhOYqk0FPg9sAMkb3g/P2fXtzbUyDUUgMlA1EEig8z/U/13EYUjErc1H382b' }, ready: () => typeof Chart !== 'undefined' },
  };
  const libLoads = {};
  function loadLib(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('unknown lib ' + name));
    if (lib.ready()) return Promise.resolve();
    if (libLoads[name]) return libLoads[name];
    // ハーネス等で同梱版を使うときは window.__libOverride[name] = { js, css } で差し替えられる
    const ov = (window.__libOverride || {})[name] || {};
    const add = (tag, attrs) => new Promise((resolve, reject) => {
      const el = document.createElement(tag);
      Object.assign(el, attrs);
      if (attrs.integrity) el.crossOrigin = 'anonymous';
      el.onload = () => resolve();
      el.onerror = () => reject(new Error((attrs.src || attrs.href) + ' の読み込みに失敗'));
      document.head.appendChild(el);
    });
    const jobs = [];
    if (lib.css) jobs.push(add('link', { rel: 'stylesheet', href: ov.css || lib.css.href, integrity: ov.css ? '' : lib.css.integrity }));
    jobs.push(add('script', { src: ov.js || lib.js.src, integrity: ov.js ? '' : lib.js.integrity }));
    libLoads[name] = Promise.all(jobs).then(() => { if (!lib.ready()) throw new Error(name + ' が初期化されませんでした'); })
      .catch(e => { libLoads[name] = null; throw e; });
    return libLoads[name];
  }

  // キーボード（IME）の高さを CSS 変数 --kb に（v355〜 Edge-to-Edge の作法: 下に固定した「記録する」やトーストをキーボードの上に出す）。
  // iOS はキーボードが出ても position: fixed の基準（レイアウトビューポート）が縮まないので、visualViewport との差で求める
  let kbApply = null;
  function watchKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      // v394: --kb を使う部品（トースト・記録する・更新の帯）は文字の大きさの zoom の中にあり、値も拡縮されるので、先に割っておく
      // （以前は 特大 1.22 倍でキーボードの高さの 1.22 倍だけ上に浮き、小 0.92 倍ではキーボードに隠れていた）
      const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
      document.documentElement.style.setProperty('--kb', kb > 40 ? Math.round(kb / z) + 'px' : '0px'); // 40px 未満はアドレスバー等の揺れとみなす
    };
    kbApply = apply;
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
  }

  // 新しい版の帯（v359〜）: 下のタブの上に「新しい版があります ・ 更新」。更新でその場で切り替わる
  function showUpdateBar(onUpdate) {
    if (document.querySelector('.update-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '<span>新しい版があります</span><button type="button" class="btn small primary">更新</button>';
    bar.querySelector('button').addEventListener('click', () => {
      const btn = bar.querySelector('button');
      btn.disabled = true; bar.querySelector('span').textContent = '切り替えています…';
      userWantsUpdate = true;
      onUpdate();
      // v396: 待機中の版が無くなっていた（さらに新しい版が来た等）と切り替えが起きないので、4 秒で帯を戻して取り直す
      setTimeout(() => {
        if (!bar.isConnected) return;
        btn.disabled = false; bar.querySelector('span').textContent = '新しい版があります';
        if (swReg) swReg.update().catch(() => {});
      }, 4000);
    });
    document.body.appendChild(bar);
  }

  // 引っ張って更新（v363〜）: クラウドと同期 → 新しい版があればその場で切り替え → いまの画面を描き直す
  let swReg = null, swActivate = null;
  let userWantsUpdate = false; // v396: 利用者が自分で切り替えを頼んだ（帯の「更新」・引っ張って更新）。それ以外の切り替えは入力中を避けて待つ
  async function checkUpdate() {
    if (!swReg) return false;
    try { await swReg.update(); } catch { /* noop */ }
    if (swReg.waiting && navigator.serviceWorker.controller && swActivate) { userWantsUpdate = true; swActivate(swReg.waiting); return true; }
    return false;
  }
  async function refreshAll() {
    if (typeof Cloud !== 'undefined' && Cloud.getUser && Cloud.getUser() && Cloud.syncNow) {
      try { await Cloud.syncNow(); } catch { /* 同期失敗は描き直しに影響させない */ }
    }
    const updating = await checkUpdate(); // 新版があれば controllerchange → 再読み込み
    if (updating) return;
    if (currentTab === 'feed') await Views.renderFeed(true); else refreshCurrent();
  }

  // ---------- 文字の大きさ（v371〜）。設定の「文字の大きさ」: iPhone に合わせる（既定）／小／標準／大／特大 ----------
  // px で組んだ画面をまとめて拡縮する（CSS の zoom。地図は除く）。「iPhone に合わせる」は端末の文字サイズ設定（-apple-system-body の実寸）から倍率を取る
  const FONT_SCALES = { s: 0.92, m: 1, l: 1.1, xl: 1.22 };
  function systemFontScale() {
    try {
      // v392: -apple-system-body が無い環境（Android・PC）では指定が無視され、本文の 15px ÷ 17 ＝ 0.88 倍になっていた。対応していなければ等倍
      if (!(window.CSS && CSS.supports && CSS.supports('font', '-apple-system-body'))) return 1;
      const el = document.createElement('span');
      el.style.cssText = 'position:absolute;visibility:hidden;font:-apple-system-body;';
      el.textContent = 'A';
      document.body.appendChild(el);
      const px = parseFloat(getComputedStyle(el).fontSize) || 17;
      el.remove();
      return Math.min(1.35, Math.max(0.85, Math.round((px / 17) * 100) / 100));
    } catch { return 1; }
  }
  function applyFontScale() {
    let pref = 'auto';
    try { pref = localStorage.getItem('gourmet.fontScale') || 'auto'; } catch { /* noop */ }
    const scale = pref === 'auto' ? systemFontScale() : ((Object.prototype.hasOwnProperty.call(FONT_SCALES, pref) && FONT_SCALES[pref]) || 1);
    document.documentElement.style.setProperty('--ui-zoom', String(scale));
    if (kbApply) kbApply();
    const sel = $('#set-font');
    if (sel) sel.value = pref;
    const sub = $('#sub-font'); // v381〜 行の下に倍率と見本（画面ごと拡縮されるので、この行がそのまま見本になる）
    if (sub) sub.textContent = `${scale.toFixed(2)}倍 ・ 麺屋 こがね`;
  }

  // ---------- 表示の好み（v390〜 端末間で同期） ----------
  //  文字の大きさ・ホームの写真・全画面の ‹ › を1つの組にして、変えた時刻 `gourmet.prefsAt` と一緒に
  //  クラウド `users/{uid}/meta/prefs` と新しい方を採用で同期する（cloud.js の `syncPrefs()`）。
  const PREF_KEYS = { fontScale: 'gourmet.fontScale', homeSquare: 'gourmet.homeSquare', pvNavOff: 'gourmet.pvNavOff' };
  const PREFS_AT = 'gourmet.prefsAt';
  function getDisplayPrefs() {
    let at = 0, fontScale = 'auto', homeSquare = false, pvNavOff = false;
    try {
      at = Number(localStorage.getItem(PREFS_AT)) || 0;
      fontScale = localStorage.getItem(PREF_KEYS.fontScale) || 'auto';
      homeSquare = !!localStorage.getItem(PREF_KEYS.homeSquare);
      pvNavOff = !!localStorage.getItem(PREF_KEYS.pvNavOff);
    } catch { /* noop */ }
    return { fontScale, homeSquare, pvNavOff, updatedAt: at };
  }
  // クラウドの値をこの端末に写す（値は検証してから）。画面の選択肢と見た目も合わせる
  function applyDisplayPrefs(p) {
    const o = p || {};
    const fs = (o.fontScale === 'auto' || (typeof o.fontScale === 'string' && Object.prototype.hasOwnProperty.call(FONT_SCALES, o.fontScale))) ? o.fontScale : 'auto'; // v396: 継承したキー（constructor など）を通さない
    try {
      localStorage.setItem(PREF_KEYS.fontScale, fs);
      if (o.homeSquare) localStorage.setItem(PREF_KEYS.homeSquare, '1'); else localStorage.removeItem(PREF_KEYS.homeSquare);
      if (o.pvNavOff) localStorage.setItem(PREF_KEYS.pvNavOff, '1'); else localStorage.removeItem(PREF_KEYS.pvNavOff);
      localStorage.setItem(PREFS_AT, String(Number(o.updatedAt) || Date.now()));
    } catch { /* noop */ }
    applyFontScale();
    syncPrefControls();
    if (currentTab === 'feed') Views.renderFeed();
  }
  function syncPrefControls() {
    const hs = $('#set-home-square'); if (hs) hs.value = lsGet(PREF_KEYS.homeSquare) ? '1' : '';
    const pn = $('#set-pv-nav'); if (pn) pn.value = lsGet(PREF_KEYS.pvNavOff) ? '1' : '';
  }
  // 設定で変えたとき: 時刻を控え、ログイン中ならすぐクラウドへ
  function prefChanged() {
    try { localStorage.setItem(PREFS_AT, String(Date.now())); } catch { /* noop */ }
    if (typeof Cloud !== 'undefined' && Cloud.getUser && Cloud.getUser() && Cloud.syncPrefs) Cloud.syncPrefs().catch(() => {});
  }

  // ---------- 接続なし・同期中の帯（v368〜。見出しの下。普段は出さない） ----------
  //  接続なし: すぐ出す（記録は端末に残り、つながると同期される）。同期中: 2秒以上続いたときだけ出す（ちらつかせない）
  let netSyncTimer = 0, netSyncing = false;
  function updateNetBar() {
    const mo = $('#map-offline'); if (mo) mo.classList.toggle('hidden', navigator.onLine); // 地図の上の小さな帯（v377〜）
    const bar = $('#net-bar');
    if (!bar) return;
    if (!navigator.onLine) { const inCloud = typeof Cloud !== 'undefined' && Cloud.getUser && Cloud.getUser(); bar.textContent = inCloud ? '接続なし ・ 記録は端末に保存され、つながると同期します' : '接続なし ・ 記録は端末に保存されます'; bar.classList.remove('hidden'); return; } // v394: 未ログインに「同期します」と言わない
    // v409: つながっているのに同期が2回続けて失敗したら知らせる（以前は設定の中にしか出ず、ルールの拒否・ログイン切れに気づけなかった）
    if (syncErrs >= 2 && typeof Cloud !== 'undefined' && Cloud.getUser && Cloud.getUser()) {
      bar.textContent = '同期できていません ・ ';
      const a = document.createElement('button'); a.type = 'button'; a.className = 'nb-link'; a.textContent = '設定で確かめる';
      a.addEventListener('click', () => { const sb = $('#settings-btn'); if (sb) sb.click(); });
      bar.appendChild(a); bar.classList.remove('hidden'); return;
    }
    if (netSyncing) { bar.textContent = '同期しています…'; bar.classList.remove('hidden'); return; }
    bar.classList.add('hidden');
  }
  let syncErrs = 0; // v409: 続けて失敗した同期の回数（同期できたら 0）
  function watchNet() {
    window.addEventListener('online', updateNetBar);
    window.addEventListener('offline', updateNetBar);
    if (typeof Cloud !== 'undefined' && Cloud.onStatus) Cloud.onStatus((s) => {
      clearTimeout(netSyncTimer);
      if (s === 'error' && navigator.onLine) syncErrs++;
      else if (s === 'synced' || s === 'signedout') syncErrs = 0;
      if (s === 'syncing') { netSyncTimer = setTimeout(() => { netSyncing = true; updateNetBar(); }, 2000); }
      else { netSyncing = false; updateNetBar(); }
    });
    updateNetBar();
  }

  function init() {
    const params = new URLSearchParams(location.search);
    watchKeyboard();
    watchNet();
    applyFontScale();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) applyFontScale(); }); // 端末の文字サイズを変えて戻ってきたとき
    const hs = $('#set-home-square'); // ホームの写真を正方形に（v378〜）
    if (hs) { hs.value = lsGet('gourmet.homeSquare') ? '1' : ''; hs.addEventListener('change', () => { try { if (hs.value) localStorage.setItem('gourmet.homeSquare', '1'); else localStorage.removeItem('gourmet.homeSquare'); } catch { /* noop */ } prefChanged(); if (currentTab === 'feed') Views.renderFeed(); }); }
    const pn = $('#set-pv-nav'); // 写真の全画面の ‹ ›（v389〜）
    if (pn) { pn.value = lsGet('gourmet.pvNavOff') ? '1' : ''; pn.addEventListener('change', () => { try { if (pn.value) localStorage.setItem('gourmet.pvNavOff', '1'); else localStorage.removeItem('gourmet.pvNavOff'); } catch { /* noop */ } prefChanged(); }); }
    $('#set-font').addEventListener('change', () => { try { localStorage.setItem('gourmet.fontScale', $('#set-font').value); } catch { /* noop */ } prefChanged(); applyFontScale(); });
    Register.init();
    if (typeof Import !== 'undefined') Import.init(); // 過去の写真のまとめて取り込み（v326〜）
    Views.initList();
    Views.initProfile();

    // タブ切り替え
    document.querySelectorAll('#tabs .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        // 下のバー中央の＋（登録）は入力フォームを直接開く（写真はフォーム内の「＋写真」から追加）
        switchTab(btn.dataset.tab);
      });
    });

    // 共通イベント委譲（店舗詳細を開く / お気に入り切替 / モーダルを閉じる）
    document.addEventListener('click', (e) => {
      const fav = e.target.closest('[data-fav]');
      if (fav) {
        e.stopPropagation();
        const shop = Store.getShop(fav.dataset.fav);
        if (shop) {
          Store.updateShop(shop.id, { favorite: !shop.favorite });
          fav.classList.toggle('on', shop.favorite); // updateShop で同一オブジェクトが更新済み
        }
        return;
      }
      const open = e.target.closest('[data-shop-open]');
      if (open) { Views.showShop(open.dataset.shopOpen); return; }
      const close = e.target.closest('[data-close]');
      if (close) {
        const modal = close.closest('.modal');
        if (modal) modal.classList.add('hidden');
      }
    });
    // モーダル背景クリックで閉じる
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
    });

    // 設定モーダル（Anthropic APIキー — AI料理ジャンル判定用）
    const settingsStatus = () => {
      const parts = [];
      // 'own' = ⚙️で設定したキー、'proxy' = 開発者提供（キーはアプリに置かず中継サーバーが持つ）
      const keyLabel = (name, label) => { const k = Api.keySource(name); return k === 'own' ? `${label}: 設定済み` : k === 'proxy' ? `${label}: 開発者提供` : `${label}: 未設定`; };
      parts.push(keyLabel('anthropic', 'AI判定'));
      parts.push(keyLabel('yahoo', 'Yahoo!'));
      parts.push(keyLabel('hotpepper', 'ホットペッパー'));
      parts.push(keyLabel('google', 'Googleキー'));
      // 検索でタップした候補の情報源の内訳（どの検索源が役に立っているか）
      const hs = Store.hitSummary(); const total = Store.hitLog().length; // 内訳は情報源ごと（重複して見つかった分は両方に数える）
      if (total) parts.push('検索ヒット ' + total + '件（' + Object.entries(hs).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join('・') + '）');
      // 部品(api.js)のバージョンも表示: アプリと違えば古いキャッシュ混在のサイン
      const partVer = Api.FILE_VERSION || '旧';
      parts.push('アプリ ' + APP_VERSION + (partVer !== APP_VERSION ? '（部品 ' + partVer + '）' : ''));
      return parts.join(' ／ ');
    };
    // このアカウントに紐づくメールアドレスを表示（ログイン中のみ）
    const renderSettingsAccount = () => {
      const user = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
      const box = $('#settings-account');
      // ログイン中だけアカウント行を出す（未ログインなら下の「ログイン」行が案内になる）
      box.classList.toggle('hidden', !user);
      if (!user) { box.innerHTML = ''; return; }
      box.innerHTML = '<span class="set-ic set-ic-gray">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'
        + '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg></span>'
        + '<span class="sa-main"><span class="sa-label">ログイン中のアカウント</span>'
        + '<span class="sa-value"></span></span>';
      box.querySelector('.sa-value').textContent = user.email || user.displayName || 'Googleアカウント';
    };
    const settingsHooks = []; // 設定を開いたときに描き直す関数（v376〜）
    // 設定上部のプロフィール行（名前・@ユーザー名・アイコン）
    const renderSettingsProfile = () => {
      const p = Store.getProfile();
      $('#set-name').textContent = p.name || 'BITEMAP';
      $('#set-sub').textContent = p.username ? '@' + p.username : 'マイページを見る'; // v372〜 この行はプロフィールのタブを開くだけなので「編集」と言わない
      const av = $('#set-avatar');
      av.textContent = '';
      // 画像はDOM経由で設定する（文字列連結でHTMLに埋め込まない）
      if (p.avatar && /^data:image\//.test(p.avatar)) { const img = document.createElement('img'); img.src = p.avatar; img.alt = ''; av.appendChild(img); }
      else av.innerHTML = Views.icons.bowl;
    };
    $('#settings-btn').addEventListener('click', () => {
      $('#settings-api-key').value = Api.getApiKey();
      $('#settings-google-key').value = Api.getGoogleKey();
      $('#settings-yahoo-key').value = Api.getYahooKey();
      $('#settings-hotpepper-key').value = Api.getHotpepperKey();
      $('#settings-status').textContent = settingsStatus();
      Api.refreshProxyStatus().then(() => { $('#settings-status').textContent = settingsStatus(); });
      renderSettingsAccount();
      renderSettingsProfile();
      settingsHooks.forEach(f => { try { f(); } catch { /* noop */ } }); // v376〜 データの行の「前回 …」
      $('#settings-modal').classList.remove('hidden');
    });
    $('#settings-save').addEventListener('click', () => {
      const ak = $('#settings-api-key').value.trim();
      const gk = $('#settings-google-key').value.trim();
      // 空欄のまま保存しても、設定済みのキーは消さない（消すのは「キーを削除」ボタンだけ）
      if (ak) { Api.setApiKey(ak); Api.resetAnthropicClient(); }
      if (gk) Api.setGoogleKey(gk);
      const yk = $('#settings-yahoo-key').value.trim(), hk = $('#settings-hotpepper-key').value.trim();
      if (yk) Api.setYahooKey(yk);
      if (hk) Api.setHotpepperKey(hk);
      // ログイン中はアカウントにも控えを保存（ブラウザ都合で消えても自動復元される）
      if (typeof Cloud !== 'undefined' && Cloud.getUser()) Cloud.syncApiKeys().catch(() => {});
      $('#settings-modal').classList.add('hidden');
      toast('設定を保存しました');
    });
    $('#settings-clear').addEventListener('click', () => {
      Api.setApiKey('');
      Api.resetAnthropicClient();
      Api.setGoogleKey('');
      Api.setYahooKey(''); Api.setHotpepperKey('');
      $('#settings-api-key').value = '';
      $('#settings-google-key').value = '';
      $('#settings-yahoo-key').value = ''; $('#settings-hotpepper-key').value = '';
      // クラウドの控えも消す（残すと次回ログインで復活してしまう）
      if (typeof Cloud !== 'undefined') Cloud.clearApiKeys().catch(() => {});
      $('#settings-status').textContent = settingsStatus();
      toast('APIキーを削除しました');
    });

    // バックアップ（記録の書き出し・読み込み）
    //  - 通常: 店舗・訪問・行きたい店・プロフィール（写真なし・軽量）
    //  - 写真込み: 上記＋各写真を長辺640pxのJPEGにして同梱（別端末や検証環境で
    //    写真ごと再現できる。容量が大きいので専用ボタン）
    const downloadJson = (data, name) => {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const backupName = (suffix) => {
      const d = new Date();
      return `bitemap-backup${suffix}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    };
    // データの行の下に前回の実行（v376〜）。日時は端末に控える
    const fmtWhen = (ts) => { const d = new Date(+ts || 0); if (!+ts) return ''; const now = new Date(); const same = d.toDateString() === now.toDateString(); const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; return same ? `今日 ${hm}` : (d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`); };
    const noteRow = (id, text) => { const el = $(id); if (el) el.textContent = text || ''; };
    const renderDataRows = () => {
      const ex = lsGet('gourmet.lastBackupAt'); noteRow('#sub-backup-export', ex ? `前回 ${fmtWhen(ex)}` : '');
      const im = lsGet('gourmet.lastRestoreAt'); noteRow('#sub-backup-import', im ? `前回 ${fmtWhen(im)}` : '');
      let cl = null; try { cl = JSON.parse(localStorage.getItem('gourmet.lastCleanup') || 'null'); } catch { cl = null; }
      noteRow('#sub-cleanup', cl && cl.at ? `前回 ${fmtWhen(cl.at)}${cl.visits || cl.photos ? ` ・ 記録 ${cl.visits}件・写真 ${cl.photos}枚` : ' ・ 無し'}` : '');
      noteRow('#sub-merge', `店 ${Store.shops().length}件`);
      Store.listBackups().then(list => noteRow('#sub-auto-backups', list.length ? `前回 ${fmtWhen(list[0].at)} ・ ${list.length}世代` : '週に1回、記録を端末内に残します')).catch(() => {});
    };
    // 端末内の自動バックアップ（v379〜）: 週に1回、記録（写真なし）を IndexedDB に残す（最大4世代）。設定から書き出し・復元できる
    const AUTO_BACKUP_MS = 7 * 24 * 3600 * 1000;
    const autoBackupLocal = async () => {
      try {
        if (!Store.shops().length) return;
        const last = +lsGet('gourmet.lastAutoBackupAt') || 0;
        if (Date.now() - last < AUTO_BACKUP_MS) return;
        await Store.putBackup(await buildBackup(false));
        localStorage.setItem('gourmet.lastAutoBackupAt', String(Date.now()));
      } catch (e) { console.warn('自動バックアップ:', e); }
    };
    setTimeout(autoBackupLocal, 20000); // 起動の 20 秒後（起動を遅らせない）
    // v404: 端末のデータ（記録・写真）をブラウザに勝手に消されないよう頼む（容量が減ったときの自動の削除の対象から外す）。
    //   記録が1件でもあるときだけ。断られても何も変わらない
    const persistStorage = async () => {
      try {
        if (!(navigator.storage && navigator.storage.persist) || !Store.rawShops().length) return;
        if (!(await navigator.storage.persisted())) await navigator.storage.persist();
      } catch { /* noop */ }
    };
    setTimeout(persistStorage, 8000);
    setInterval(autoBackupLocal, 6 * 3600 * 1000); // 開きっぱなしでも1日に数回は確かめる
    $('#auto-backups').addEventListener('click', async () => {
      const list = await Store.listBackups().catch(() => []);
      const pick = (b) => Views.openActionSheet([
        { label: 'ファイルに書き出す', onClick: async () => { const data = await Store.getBackup(b.at); if (!data) { toast('見つかりませんでした'); return; } downloadJson(data, backupName('-auto-' + new Date(b.at).toISOString().slice(0, 10).replace(/-/g, ''))); toast('書き出しました'); } },
        { label: 'この内容を復元する（今の記録は消えません）', onClick: async () => {
          const data = await Store.getBackup(b.at); if (!data) { toast('見つかりませんでした'); return; }
          // v384〜 何が戻るかを先に出す（無ければ確認を出さない）
          let d; try { d = backupDiff(data); } catch (err) { toast('' + (err && err.message || err)); return; }
          if (!d.total) { toast('今の記録と同じです（取り込むものはありません）'); return; }
          if (!confirm(`${fmtWhen(b.at)} のバックアップから取り込むもの\n${diffLines(d)}\n\n今の記録は消えません。取り込みますか？`)) return;
          try { const r = await restoreBackup(data); toast(r.added ? `復元しました（記録${r.added}件を追加・更新）` : '追加の記録はありませんでした'); refreshCurrent(); } catch (err) { toast('復元できませんでした: ' + (err && err.message || err)); }
        } },
      ]);
      const acts = list.map(b => ({ label: `${fmtWhen(b.at)} ・ 店 ${b.n.shops || 0}・記録 ${b.n.visits || 0}`, onClick: () => pick(b) }));
      acts.push({ label: 'いま残す', onClick: async () => { try { await Store.putBackup(await buildBackup(false)); localStorage.setItem('gourmet.lastAutoBackupAt', String(Date.now())); renderDataRows(); toast('端末内に残しました'); } catch (e) { toast('残せませんでした: ' + (e && e.message || e)); } } });
      Views.openActionSheet(acts);
    });
    settingsHooks.push(renderDataRows);
    // v404: 設定の「このアプリ」に端末で使っている容量（と、自動で消されない設定になっているか）
    settingsHooks.push(async () => {
      const el = $('#settings-storage'); if (!el || !(navigator.storage && navigator.storage.estimate)) return;
      try {
        const [est, kept] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : false]);
        const mb = (Number(est.usage) || 0) / 1048576;
        el.textContent = `端末で使っている容量 ${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB` + (kept ? ' ・ 自動では消されない設定' : '');
        el.hidden = false;
      } catch { el.hidden = true; }
    });
    $('#backup-export').addEventListener('click', async () => {
      downloadJson(await buildBackup(false), backupName(''));
      try { localStorage.setItem('gourmet.lastBackupAt', String(Date.now())); } catch { /* noop */ }
      renderDataRows();
      toast('バックアップを書き出しました');
    });
    $('#backup-export-photos').addEventListener('click', async () => {
      const btn = $('#backup-export-photos');
      btn.disabled = true;
      try {
        const data = await buildBackup(true, (done, total, label) => { toast(`${label || '写真'}を準備中… ${done}/${total}`); });
        downloadJson(data, backupName('-photos'));
        try { localStorage.setItem('gourmet.lastBackupAt', String(Date.now())); } catch { /* noop */ }
        renderDataRows();
        toast(`写真込みで書き出しました（写真${(data.photos || []).length}枚）`);
      } catch (err) {
        toast('書き出せませんでした: ' + (err && err.message || err));
      } finally { btn.disabled = false; }
    });
    $('#backup-import').addEventListener('click', () => $('#backup-file').click());
    $('#merge-shops').addEventListener('click', () => Views.openMergeShops()); // 重複した店の統合（v364〜）
    $('#cleanup-orphans').addEventListener('click', async () => { // 店の無い記録の掃除（v370〜）
      // v396: ログイン中は先にクラウドを全件読み直す（別端末の、まだ届いていない店・記録を「無い」とみなして消さない）
      if (typeof Cloud !== 'undefined' && Cloud.getUser && Cloud.getUser() && Cloud.syncFull) {
        toast('クラウドと照らし合わせています…');
        let full = false;
        try { full = await Cloud.syncFull(); } catch { full = false; }
        if (!full) { toast('クラウドと照らし合わせられませんでした。つながってからもう一度'); return; }
      }
      const r = await Store.cleanupOrphans().catch(() => null);
      if (!r) { toast('掃除できませんでした'); return; }
      try { localStorage.setItem('gourmet.lastCleanup', JSON.stringify({ at: Date.now(), visits: r.visits || 0, photos: r.photos || 0 })); } catch { /* noop */ }
      renderDataRows();
      toast(r.visits || r.photos ? `店の無い記録 ${r.visits}件・写真 ${r.photos}枚を消しました` : '掃除する記録はありませんでした');
      if (r.visits || r.photos) refreshCurrent();
    });
    $('#backup-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const r = await restoreBackup(data);
        try { localStorage.setItem('gourmet.lastRestoreAt', String(Date.now())); } catch { /* noop */ }
        renderDataRows();
        toast(r.added || r.photos
          ? `読み込みました（記録${r.added}件・写真${r.photos}枚を追加・更新）`
          : '追加の記録はありませんでした（すべて登録済み）');
        refreshCurrent();
      } catch (err) {
        toast('読み込めませんでした: ' + (err && err.message || err));
      }
    });

    // クラウド同期の初期化（既存ログインがあればセッションを復元して同期）。
    // Firebase SDK は大きいので、最初の画面を描いたあと・端末が手すきのときに読み込む。
    // この端末でログインしたことがない場合は、ログインを押すまで読み込まない
    if (typeof Cloud !== 'undefined') {
      let pendingRedirect = false;
      try { pendingRedirect = Object.keys(sessionStorage).some(k => k.startsWith('firebase:pendingRedirect')); } catch { /* noop */ }
      let hadSession = false;
      try { hadSession = !!localStorage.getItem('gourmet.lastUid') || !!Store.getProfile().username; } catch { /* noop */ }
      const startCloud = () => Cloud.init();
      if (hadSession || pendingRedirect || params.get('u')) {
        if ('requestIdleCallback' in window) requestIdleCallback(startCloud, { timeout: 1500 });
        else setTimeout(startCloud, 600);
      }
      // 同期が済んだら、ホーム・地図のフォロー中の投稿と写真を裏で先読みしておく
      // （タブを開いたときの読み込み待ちを短くする。1セッション1回だけ）
      let warmed = false;
      Cloud.onStatus((s) => {
        if (s === 'synced' && !warmed) { warmed = true; setTimeout(() => Views.warmNetwork(), 500); }
      });
    }

    // サービスワーカー登録（PWA: ホーム画面追加・オフライン起動）
    // ※ https または localhost でのみ有効。LANのhttpでは無視される
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        swReg = reg;
        // 起動のたびに新バージョンを確認（PWAはこれをしないと古いSWが残り続ける）。
        // v359〜 開いたまま使っている間も、前面に戻ったとき・30分ごとに確認する
        const check = () => reg.update().catch(() => {});
        check();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
        setInterval(check, 30 * 60 * 1000);
        const startedAt = Date.now();
        // v367〜 利用者が一度でも触ったら（タップ・キー入力）、起動直後でも黙って切り替えない（画面が戻って見えるため）
        let userActed = false;
        const acted = () => { userActed = true; };
        document.addEventListener('pointerdown', acted, { capture: true, passive: true });
        document.addEventListener('keydown', acted, { capture: true });
        // 新しいSWに切り替わったら一度だけ再読み込みして、全ファイルを最新に揃える
        let reloaded = false, reloadPending = false;
        let reloadWait = 0;
        const tryReload = () => {
          if (reloaded) return;
          // 記録の入力中（写真・店名・評価あり）は保存が終わるまでリロードを待つ
          if (typeof Register !== 'undefined' && Register.isDirty && Register.isDirty()) {
            if (!reloadPending) { reloadPending = true; toast('新しい版があります ・ 記録を保存すると切り替わります'); }
            return;
          }
          // v396: 別のタブで切り替えた等、自分で頼んでいない切り替えは、文字を打っている・シートを開いている間は待つ（打った内容が消えていた）
          const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
          if (!userWantsUpdate && (typing || document.querySelector('.modal:not(.hidden)'))) {
            if (!reloadWait) reloadWait = setInterval(() => { const t = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName); if (!t && !document.querySelector('.modal:not(.hidden)')) { clearInterval(reloadWait); reloadWait = 0; tryReload(); } }, 3000);
            return;
          }
          reloaded = true;
          try { sessionStorage.setItem('bitemap.resumeTab', currentTab); } catch { /* noop */ } // 再読み込み後に同じタブへ戻る（v367〜）
          location.reload();
        };
        // v392: 初めての訪問では SW が画面を引き取るだけ（clients.claim）なので再読み込みしない。以前は初回に数秒後の再読み込みが入っていた
        let hadController = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController) { hadController = true; return; } tryReload(); });
        document.addEventListener('bitemap:saved', () => { if (reloadPending) tryReload(); });
        // 待機中の新版を切り替える（SW に合図 → controllerchange → 再読み込み）
        const activate = (sw) => { try { sw.postMessage({ type: 'SKIP_WAITING' }); } catch { /* noop */ } };
        // 新版が「待機」に入ったとき: 起動直後（20秒以内）なら黙って切り替え、使用中なら下の帯で知らせてタップで切り替え
        swActivate = activate;
        const onWaiting = (sw) => {
          if (!sw) return;
          if (!userActed && Date.now() - startedAt < 20000 && !(typeof Register !== 'undefined' && Register.isDirty && Register.isDirty())) { activate(sw); return; }
          showUpdateBar(() => activate(reg.waiting || sw)); // v392: 帯を出したあとにさらに新しい版が来ると、最初の worker は無効になり「更新」が効かなかった
        };
        if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) onWaiting(nw);
          });
        });
      }).catch(() => { /* 非対応環境では何もしない */ });
    }

    // 起動時: URLの?tab=指定 → データがあれば一覧 → なければ登録タブ
    const urlTab = params.get('tab');
    let resumeTab = '';
    try { resumeTab = sessionStorage.getItem('bitemap.resumeTab') || ''; sessionStorage.removeItem('bitemap.resumeTab'); } catch { /* noop */ }
    const TAB_NAMES = ['feed', 'list', 'register', 'map', 'profile']; // v392: URL の ?tab= はこの中だけ（そのままセレクタに入れない）
    const firstTab = TAB_NAMES.includes(urlTab) ? urlTab
      : TAB_NAMES.includes(resumeTab) ? resumeTab // 新版への切り替えで再読み込みしたときは元のタブへ（v367〜）
      : (Store.shops().length ? 'list' : 'register');
    switchTab(firstTab);

    // 共有リンク(?u=ユーザー名)で開かれた場合は、その人の公開プロフィールを表示
    const shareUser = params.get('u');
    if (shareUser) Views.showPublicProfile(shareUser);
    // 地図アプリなどから「共有」で開かれた場合（manifest の share_target。Android）: 行きたい店の追加を開く
    if (params.has('share') || params.has('title') || params.has('text') || params.has('url')) { // v392: manifest の share_target（GET）は share= を付けられないので、title/text/url でも入る（Android の共有が開かなかった）
      const text = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join('\n');
      history.replaceState(null, '', location.pathname); // 再読み込みで二度開かないよう消す
      if (text) setTimeout(() => Views.openWishAdd(text), 400);
    }

    // 初回起動の案内（一度だけ。共有リンクで開いた時はプロフィール表示を優先して出さない）
    // ※「見た」フラグは閉じた時に立てる。初回はSW登録直後の自動リロードが入るため、
    //   表示した時に立てるとリロード後に消えてしまう
    const welcome = $('#welcome-modal');
    if (!shareUser && !lsGet('bm-welcomed')) {
      welcome.classList.remove('hidden');
    }
    const welcomeDone = () => { try { localStorage.setItem('bm-welcomed', '1'); } catch { /* 保存できなくても閉じる */ } };
    welcome.addEventListener('click', (e) => {
      // ✕ボタンや背景タップで閉じた場合もフラグを立てる
      if (e.target === welcome || e.target.closest('[data-close]')) welcomeDone();
    });
    $('#welcome-start').addEventListener('click', () => { welcomeDone(); welcome.classList.add('hidden'); });
    // 設定の「使い方を見る」は今の画面に合わせた使い方（v380〜。初回の「ようこそ」は出さない）
    $('#show-welcome').addEventListener('click', () => {
      $('#settings-modal').classList.add('hidden');
      Views.showHelp();
    });
  }

  function switchTab(name) {
    flushUndo(); // 保留中の削除があれば確定してから移る（v375〜）
    if (name !== 'map' && Views.closeMapSheets) Views.closeMapSheets(); // v392: 地図の店シートを残さない
    if (Views.mzSelEnd) Views.mzSelEnd(); // v392: 写真の選択モードを残さない
    currentTab = name;
    document.body.dataset.tab = name; // 検索・登録・地図ではアプリの見出しを隠す（CSS。v337〜）
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + name).classList.add('active');
    // 検索タブは開くたびに最初の画面（発見グリッド）へ戻す
    if (name === 'list') Views.enterListTab();
    else if (name === 'map') Views.enterMapTab(); // 地図は毎回「自分」から
    else if (name === 'profile') Views.enterProfileTab(); // 開いたときは「写真」から。描き直しでは今の小タブを保つ（v367〜）
    else refreshCurrent();
  }

  function refreshCurrent() {
    if (currentTab === 'feed') Views.renderFeed();
    else if (currentTab === 'map') Views.refreshMap();
    else if (currentTab === 'list') Views.renderList();
    else if (currentTab === 'profile') Views.renderProfile(); // 統計もプロフィール内で描画
  }

  // ---------- トースト ----------
  let toastTimer = null;
  let pendingUndo = null; // 取り消しつきトーストの保留（{commit}）。次のトースト・タブ移動・画面を離れるとき確定する
  function toast(msg, ms) {
    flushUndo();
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 3000); // 長文の案内は長めに表示できる
  }
  // 「元に戻す」付きのトースト（v375〜）。ms 以内にボタンを押せば undo()、押さなければ commit()（本当に消す）。
  // 削除は Store.deferDelete で一覧から外しておき、ここで確定する
  function toastUndo(msg, o) {
    flushUndo();
    const t = $('#toast');
    t.textContent = '';
    const span = document.createElement('span'); span.textContent = msg;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'toast-undo'; btn.textContent = '元に戻す';
    t.append(span, btn);
    t.classList.add('has-undo');
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    const hide = () => { t.classList.add('hidden'); t.classList.remove('has-undo'); t.textContent = ''; };
    const entry = { commit: () => { pendingUndo = null; clearTimeout(toastTimer); hide(); try { const r = o.commit && o.commit(); if (r && r.catch) r.catch(() => {}); } catch { /* noop */ } } };
    pendingUndo = entry;
    btn.addEventListener('click', () => { if (pendingUndo !== entry) return; pendingUndo = null; clearTimeout(toastTimer); hide(); if (o.undo) o.undo(); });
    toastTimer = setTimeout(entry.commit, o.ms || 5000);
  }
  function flushUndo() { if (pendingUndo) pendingUndo.commit(); }
  window.addEventListener('pagehide', flushUndo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushUndo(); });

  // ---------- サンプルデータ（動作確認用） ----------
  function placeholderPhoto(label, color) {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 600;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 800, 600);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.arc(400, 300, 200, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 64px sans-serif'; g.textAlign = 'center';
    g.fillText(label, 400, 322);
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  }

  // ---------- バックアップの作成・復元 ----------
  // 写真は長辺640pxのJPEG（データURL）にして同梱する。元画像は大きいため、
  // 別端末で「見返す・共有する」用途に十分な大きさに抑える
  async function photoToDataUrl(rec) {
    // サムネイル（640px）があればそれを使う。無ければ本体を1枚だけ読んで縮小する
    let blob = null;
    if (rec.thumbV === 2) { try { const t = await Store.getThumb(rec.id); if (t && t.v === 2) blob = t.blob; } catch { blob = null; } }
    // クラウド同期で入った写真は端末に本体が無い（URLだけ）ことがある。
    // その場合はこの端末で取得してから縮小する（書き出す本人の操作の中で完結させる）
    let src = rec.blob || null;
    if (!blob && !src && rec.hasBlob) { try { src = await Store.getPhotoBlob(rec.id); } catch { src = null; } }
    if (!blob && !src && rec.remoteUrl) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(rec.remoteUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) src = await res.blob();
      } catch { src = null; }
    }
    if (!blob && src) {
      try {
        const bmp = await createImageBitmap(src);
        const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * scale));
        c.height = Math.max(1, Math.round(bmp.height * scale));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
      } catch { blob = src; }
    }
    if (!blob) return null;
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  async function buildBackup(withPhotos, onProgress) {
    const data = {
      app: 'BITEMAP', version: APP_VERSION, exportedAt: new Date().toISOString(),
      shops: Store.shops(), visits: Store.visits(), wishes: Store.allWishes(), profile: Store.getProfile(),
      hitLog: Store.hitLog(), // 検索でタップした候補の記録（どの機能・情報源で見つかったか）
    };
    if (!withPhotos) return data;
    const all = await Store.allPhotos();
    const photos = [];
    for (let i = 0; i < all.length; i++) {
      const rec = all[i];
      const item = { id: rec.id, shopId: rec.shopId, visitId: rec.visitId, type: rec.type || 'dish', createdAt: rec.createdAt || 0, hash: rec.hash || '' };
      const dataUrl = await photoToDataUrl(rec);
      if (dataUrl) item.data = dataUrl; else if (rec.remoteUrl) item.remoteUrl = rec.remoteUrl; else continue;
      photos.push(item);
      if (onProgress && (i % 5 === 0 || i === all.length - 1)) onProgress(i + 1, all.length);
    }
    data.photos = photos;
    // フォロー中の人の投稿の控え（ホーム・地図の表示に使う）も同梱。別端末での再現用
    const social = {};
    for (const k of ['gourmet.netCache', 'gourmet.feedCache']) { const v = localStorage.getItem(k); if (v) social[k] = v; }
    if (Object.keys(social).length) data.social = social;
    // フォロー中の人の投稿写真（公開投稿）も縮小して同梱。URLごとに1回だけ取得
    const urls = new Set();
    for (const k of Object.keys(social)) { try { for (const p of (JSON.parse(social[k]).posts || [])) if (p.photoUrl && /^https?:/.test(p.photoUrl)) urls.add(p.photoUrl); } catch { /* 壊れた控えは無視 */ } }
    if (urls.size) {
      const socialPhotos = {};
      let n = 0;
      for (const u of urls) {
        const dataUrl = await photoToDataUrl({ remoteUrl: u });
        if (dataUrl) socialPhotos[u] = dataUrl;
        n++;
        if (onProgress) onProgress(n, urls.size, 'フォロー中の投稿の写真');
      }
      data.socialPhotos = socialPhotos;
    }
    return data;
  }
  // ---- バックアップの検証（外部から渡されるファイルなので、形式と型を確かめてから取り込む） ----
  const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
  const DATA_IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const MAX_RECORD_CHARS = 200000;     // 1レコードのJSON上限（Firestoreの1MB制限より十分小さく）
  const MAX_PHOTO_CHARS = 6 * 1024 * 1024; // 写真1枚のデータURL上限（約4.5MB）
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : dflt);
  const numOrNull = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const latOrNull = (v) => { const n = numOrNull(v); return n != null && Math.abs(n) <= 90 ? n : null; };  // v395: 範囲外の位置は捨てる
  const lonOrNull = (v) => { const n = numOrNull(v); return n != null && Math.abs(n) <= 180 ? n : null; };
  // 既知の項目だけを型を確かめて写し取る（__proto__ 等の余計なキーは捨てる）
  function sanitizeRecord(kind, r) {
    if (!isPlain(r) || typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
    if (JSON.stringify(r).length > MAX_RECORD_CHARS) return null;
    const base = { id: r.id, createdAt: num(r.createdAt, 0, 1e13, Date.now()), updatedAt: num(r.updatedAt, 0, 1e13, 0) };
    if (kind === 'shop') {
      return Object.assign(base, {
        name: str(r.name, 200), address: str(r.address, 500), lat: latOrNull(r.lat), lon: lonOrNull(r.lon),
        country: str(r.country, 50) || '日本', pref: str(r.pref, 50), city: str(r.city, 100), station: str(r.station, 100),
        shopGenre: str(r.shopGenre, 50) || 'その他', favorite: !!r.favorite, status: str(r.status, 20) || 'open', osmId: str(r.osmId, 80),
        casual: num(r.casual, 0, 5, 0), atmosphere: num(r.atmosphere, 0, 5, 0), speed: num(r.speed, 0, 5, 0),
        dataSource: str(r.dataSource, 20), foundBy: str(r.foundBy, 30), foundQuery: str(r.foundQuery, 100), posLevel: str(r.posLevel, 10),
        dataLicenses: Array.isArray(r.dataLicenses) ? r.dataLicenses.filter(x => typeof x === 'string').map(x => x.slice(0, 80)).slice(0, 10) : [],
        dataAttributions: Array.isArray(r.dataAttributions) ? r.dataAttributions.filter(x => typeof x === 'string').map(x => x.slice(0, 200)).slice(0, 10) : [],
      });
    }
    if (kind === 'visit') {
      if (typeof r.shopId !== 'string' || !ID_RE.test(r.shopId)) return null;
      const dt = new Date(r.datetime); if (isNaN(dt)) return null;
      return Object.assign(base, {
        shopId: r.shopId, datetime: dt.toISOString(),
        dishGenres: Array.isArray(r.dishGenres) ? r.dishGenres.filter(g => typeof g === 'string').map(g => g.slice(0, 50)).slice(0, 20) : [],
        rating: num(r.rating, 0, 5, 0), comment: str(r.comment, 2000), visitType: str(r.visitType, 30) || '店内飲食',
        ...(r.quick === true ? { quick: true } : {}), // 写真なしの「また来た」記録
      });
    }
    if (kind === 'wish') {
      return Object.assign(base, {
        name: str(r.name, 200), lat: latOrNull(r.lat), lon: lonOrNull(r.lon), genre: str(r.genre, 100), address: str(r.address, 200),
        fromUsername: str(r.fromUsername, 30), postId: str(r.postId, 80),
        // 達成（行けた）記録。v303〜
        ...(num(r.doneAt, 1, 1e13, 0) ? { doneAt: r.doneAt,
          doneShopId: (typeof r.doneShopId === 'string' && ID_RE.test(r.doneShopId)) ? r.doneShopId : '',
          doneVisitId: (typeof r.doneVisitId === 'string' && ID_RE.test(r.doneVisitId)) ? r.doneVisitId : '' } : {}),
      });
    }
    return null;
  }
  // 復元で何が戻るか（v384〜）: 種類ごとに 無い（こちらに無い id）・古い（バックアップの方が新しい）の数。restoreBackup と同じ判定
  function backupDiff(data) {
    if (!isPlain(data) || data.app !== 'BITEMAP') throw new Error('BITEMAPのバックアップファイルではありません');
    const one = (kind, locals, list) => {
      const map = new Map(locals.map(x => [x.id, x]));
      let missing = 0, older = 0;
      for (const raw of (Array.isArray(list) ? list : [])) {
        const r = sanitizeRecord(kind, raw);
        if (!r) continue;
        const l = map.get(r.id);
        if (!l) missing++; else if ((r.updatedAt || 0) > (l.updatedAt || 0)) older++;
      }
      return { missing, older };
    };
    const d = { shop: one('shop', Store.rawShops(), data.shops), visit: one('visit', Store.rawVisits(), data.visits), wish: one('wish', Store.rawWishes(), data.wishes) };
    d.total = Object.values(d).reduce((s, x) => s + x.missing + x.older, 0);
    return d;
  }
  function diffLines(d) {
    const f = (x) => [x.missing ? `無い ${x.missing}` : '', x.older ? `古い ${x.older}` : ''].filter(Boolean).join('・') || 'なし';
    return `店: ${f(d.shop)}\n記録: ${f(d.visit)}\n行きたい: ${f(d.wish)}`;
  }
  async function restoreBackup(data) {
    if (!isPlain(data) || data.app !== 'BITEMAP') throw new Error('BITEMAPのバックアップファイルではありません');
    // 新しい方を採用して取り込む（既存の記録は消さない）
    let added = 0;
    const merge = (kind, locals, list) => {
      const map = new Map(locals.map(x => [x.id, x]));
      const take = []; // v396: まとめて書き出す（1件ごとに全件を保存していた）
      for (const raw of (Array.isArray(list) ? list : [])) {
        const r = sanitizeRecord(kind, raw);
        if (!r) continue;
        if ('lat' in r && (r.lat == null || r.lon == null)) { r.lat = null; r.lon = null; } // v396: 緯度か経度の片方だけの位置は捨てる
        const l = map.get(r.id);
        if (!l) {
          // v392: こちらに無い記録を戻すときは「今」直したことにし、端末の削除の控えも外す。元の updatedAt のままだと、
          // 消したときのクラウドの控え（削除の時刻）より古いので、次の同期でまた消えていた
          r.updatedAt = Date.now();
          try { Store.clearDeleted(kind, r.id); } catch { /* noop */ }
          take.push(r); added++;
        } else if ((r.updatedAt || 0) > (l.updatedAt || 0)) { take.push(r); added++; }
      }
      Store.applyRemoteMany(kind, take);
    };
    merge('shop', Store.rawShops(), data.shops);
    merge('visit', Store.rawVisits(), data.visits);
    merge('wish', Store.rawWishes(), data.wishes);
    if (Array.isArray(data.hitLog)) {
      const FLOWS = ['nearby', 'suggest', 'search', 'search-nearby', 'map', 'unknown'];
      const clean = data.hitLog.filter(isPlain).map(h => ({
        t: num(h.t, 0, 1e13, 0), flow: FLOWS.includes(h.flow) ? h.flow : 'unknown', source: str(h.source, 20) || 'unknown',
        name: str(h.name, 200), query: str(h.query, 100), rank: (typeof h.rank === 'number' && h.rank >= 0 && h.rank < 1000) ? h.rank : null,
        auto: !!h.auto, ...(typeof h.shopId === 'string' && ID_RE.test(h.shopId) ? { shopId: h.shopId } : {}),
        ...(Array.isArray(h.sources) ? { sources: h.sources.filter(x => typeof x === 'string').map(x => x.slice(0, 20)).slice(0, 8) } : {}),
      })).filter(h => h.t > 0).slice(-1000);
      Store.mergeHits(clean);
    }
    // プロフィールは名前・自己紹介・アイコンだけ取り込む。@ユーザー名はクラウド側の予約と結びついているため
    // ファイルからは復元せず、ログイン時にクラウドから戻す
    if (isPlain(data.profile) && !Store.getProfile().username) {
      // v392: 今の名前・自己紹介・アイコンは上書きしない（空いている欄だけ埋める。古いバックアップで今の値が戻っていた）
      const cur = Store.getProfile(), pf = {};
      const nm = str(data.profile.name, 50), bio = str(data.profile.bio, 500);
      if (nm && (!cur.name || cur.name === 'BITEMAP')) pf.name = nm;
      if (bio && !cur.bio) pf.bio = bio;
      if (!cur.avatar && typeof data.profile.avatar === 'string' && DATA_IMG_RE.test(data.profile.avatar) && data.profile.avatar.length < 300000) pf.avatar = data.profile.avatar;
      if (Object.keys(pf).length) Store.setProfile(pf);
    }
    // 写真: 同じ訪問に同じ指紋（または同じ撮影登録時刻）の写真があれば二重に入れない
    let photos = 0;
    const PHOTO_TYPES = ['dish', 'exterior', 'interior', 'menu'];
    for (const p of (Array.isArray(data.photos) ? data.photos : [])) {
      if (!isPlain(p) || typeof p.visitId !== 'string' || typeof p.shopId !== 'string' || !ID_RE.test(p.visitId) || !ID_RE.test(p.shopId)) continue;
      if (!Store.visits().some(v => v.id === p.visitId)) continue;
      // 写真データは画像のデータURLだけを受け付ける（外部URLへ通信させない・巨大データを入れない）
      if (typeof p.data !== 'string' || p.data.length > MAX_PHOTO_CHARS || !DATA_IMG_RE.test(p.data)) continue;
      const have = await Store.photosOfVisit(p.visitId);
      if (have.some(x => (p.hash && x.hash === p.hash) || (p.createdAt && x.createdAt === p.createdAt))) continue;
      let blob = null;
      try { blob = await (await fetch(p.data)).blob(); } catch { blob = null; }
      if (!blob || !blob.type.startsWith('image/')) continue;
      const ptype = PHOTO_TYPES.includes(p.type) ? p.type : 'dish';
      const phash = (typeof p.hash === 'string' && /^[0-9a-f]{0,64}$/.test(p.hash)) ? p.hash : '';
      const newId = await Store.addPhoto(p.shopId, p.visitId, ptype, blob, phash);
      // 取り込んだ写真の登録時刻を元の値に揃える（並び順を保つ）
      if (p.createdAt && newId) { try { await Store.setPhotoCreatedAt(newId, p.createdAt); } catch { /* 任意 */ } }
      photos++;
    }
    // 他人の投稿の控え: 決まった2つのキーだけ、投稿配列の形をしているものだけ取り込む
    if (isPlain(data.social)) {
      for (const k of ['gourmet.netCache', 'gourmet.feedCache']) {
        if (typeof data.social[k] !== 'string' || localStorage.getItem(k)) continue;
        let obj;
        try { obj = JSON.parse(data.social[k]); } catch { continue; }
        if (!isPlain(obj) || !Array.isArray(obj.posts)) continue;
        obj.posts = obj.posts.filter(isPlain).slice(0, 300);
        if (isPlain(data.socialPhotos)) {
          for (const p of obj.posts) {
            const d = p.photoUrl && data.socialPhotos[p.photoUrl];
            if (typeof d === 'string' && d.length < MAX_PHOTO_CHARS && DATA_IMG_RE.test(d)) p.photoUrl = d;
          }
        }
        // v396: 画像は data:image か Firebase Storage の URL だけ（ファイルに書かれた任意の URL を読み込ませない）。数値は数に
        const okImg = (u) => typeof u === 'string' && (DATA_IMG_RE.test(u) || /^https:\/\/firebasestorage\.googleapis\.com\//.test(u));
        for (const p of obj.posts) {
          if (!okImg(p.photoUrl)) p.photoUrl = '';
          if (p.avatar && !(typeof p.avatar === 'string' && DATA_IMG_RE.test(p.avatar))) p.avatar = '';
          for (const f of ['lat', 'lon', 'rating', 'ar']) if (f in p) p[f] = (typeof p[f] === 'number' && isFinite(p[f])) ? p[f] : (f === 'lat' || f === 'lon' ? null : 0);
        }
        try { localStorage.setItem(k, JSON.stringify({ posts: obj.posts, time: 0 })); } catch { /* 容量超過なら控えは諦める */ }
      }
    }
    return { added, photos };
  }

  async function seedSample() {
    toast('サンプルデータを作成中…');
    const now = new Date();
    const iso = (mAgo, day, h) => new Date(now.getFullYear(), now.getMonth() - mAgo, day, h, 0).toISOString();

    const samples = [
      {
        shop: { name: '麺屋 こがね', lat: 35.6595, lon: 139.7005, pref: '東京都', city: '渋谷区', station: '渋谷駅', shopGenre: 'ラーメン店', address: '東京都渋谷区道玄坂2丁目', favorite: true, casual: 5, atmosphere: 3, speed: 5 },
        visits: [
          { datetime: iso(0, 3, 12), dishGenres: ['ラーメン'], rating: 5, comment: '鶏白湯が絶品。麺の硬さも完璧だった。', label: '🍜', color: '#c0392b' },
          { datetime: iso(2, 15, 19), dishGenres: ['つけ麺'], rating: 4, comment: 'つけ麺も美味しいがラーメンの方が好み。', label: '🍜', color: '#d35400' },
          { datetime: iso(5, 8, 12), dishGenres: ['ラーメン'], rating: 5, comment: '初訪問。行列に納得の味。', label: '🍜', color: '#c0392b' },
        ],
      },
      {
        shop: { name: '寿司処 まる海', lat: 35.6654, lon: 139.7707, pref: '東京都', city: '中央区', station: '築地駅', shopGenre: '寿司店', address: '東京都中央区築地4丁目', favorite: true, casual: 2, atmosphere: 5, speed: 3 },
        visits: [
          { datetime: iso(1, 20, 13), dishGenres: ['寿司'], rating: 5, comment: '中トロと穴子が最高。ランチセットがお得。', label: '🍣', color: '#16a085' },
        ],
      },
      {
        shop: { name: '炭火焼肉 炎', lat: 35.6938, lon: 139.7034, pref: '東京都', city: '新宿区', station: '新宿駅', shopGenre: '焼肉店', address: '東京都新宿区歌舞伎町1丁目', favorite: false },
        visits: [
          { datetime: iso(0, 10, 19), dishGenres: ['焼肉'], rating: 4, comment: 'ハラミが柔らかい。タレは甘め。', label: '🥩', color: '#8e44ad' },
          { datetime: iso(3, 22, 20), dishGenres: ['焼肉'], rating: 4, comment: '', label: '🥩', color: '#7f3f98' },
        ],
      },
      {
        shop: { name: 'カフェ ひだまり', lat: 35.6684, lon: 139.7126, pref: '東京都', city: '港区', station: '表参道駅', shopGenre: 'カフェ', address: '東京都港区北青山3丁目', favorite: false, casual: 4, atmosphere: 5, speed: 2 },
        visits: [
          { datetime: iso(1, 5, 15), dishGenres: ['カフェメニュー', 'スイーツ'], rating: 3, comment: 'チーズケーキは普通。雰囲気は良い。', label: '☕', color: '#a67c52' },
        ],
      },
      {
        shop: { name: '洋食 グリル大宮', lat: 35.9063, lon: 139.6238, pref: '埼玉県', city: 'さいたま市', station: '大宮駅', shopGenre: 'ファミリーレストラン', address: '埼玉県さいたま市大宮区', favorite: false },
        visits: [
          { datetime: iso(4, 12, 12), dishGenres: ['定食'], rating: 4, comment: 'オムライスの卵がふわとろ。', label: '🍳', color: '#e67e22' },
        ],
      },
    ];

    try {
      for (const s of samples) {
        const shop = Store.addShop(s.shop);
        for (const v of s.visits) {
          const visit = Store.addVisit({
            shopId: shop.id, datetime: v.datetime, dishGenres: v.dishGenres,
            rating: v.rating, comment: v.comment, visitType: '店内飲食',
          });
          const blob = await placeholderPhoto(v.label, v.color);
          await Store.addPhoto(shop.id, visit.id, 'dish', blob);
        }
      }
      toast('サンプルデータを登録しました');
    } catch (e) {
      console.error(e);
      toast('サンプルデータの作成に失敗しました: ' + (e && e.message || e));
    }
    refreshCurrent();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { switchTab, refreshCurrent, refreshAll, checkUpdate, toast, toastUndo, flushUndo, seedSample, buildBackup, restoreBackup, backupDiff, loadLib, getDisplayPrefs, applyDisplayPrefs, currentTab: () => currentTab };
})();
