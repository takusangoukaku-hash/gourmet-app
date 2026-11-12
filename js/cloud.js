// =====================================================
// クラウド同期（Firebase: Auth + Firestore + Storage）
//  - Googleアカウントでログインすると、記録・写真をクラウドへ自動保存
//  - アプリを削除して再ログインすればデータが復元される
//  - ローカル(Store)が正、クラウドはバックアップ兼別端末同期。変更は随時ミラーリング
//  ※ apiKey等はFirebaseの公開識別子（秘密情報ではない）。安全のためのアクセス制御は
//    Firebase側のセキュリティルール（本人のuidのみ読み書き可）で行う
// =====================================================
const Cloud = (() => {
  const CONFIG = {
    apiKey: 'AIzaSyCEGbK89rU7Wjaig6vZF9ecWe1nECIBmaY',
    authDomain: 'gourmet-app-62586.firebaseapp.com',
    projectId: 'gourmet-app-62586',
    storageBucket: 'gourmet-app-62586.firebasestorage.app',
    messagingSenderId: '618349574396',
    appId: '1:618349574396:web:25769369250afbe40e3f79',
  };
  const V = '10.12.5'; // Firebase JS SDK バージョン

  let fb = null, auth = null, db = null, storage = null, user = null;
  let ready = null;
  let postsPublishedThisSession = false; // 投稿化(publishAllPosts)は1セッション1回に制限
  let wishPubTimer = null; // 行きたい店の変更 → 公開プロフィール更新のデバウンス
  let status = 'signedout'; // signedout | loading | syncing | synced | error
  const statusCbs = [];
  function setStatus(s, detail) { status = s; statusCbs.forEach(cb => { try { cb(s, user, detail); } catch { /* noop */ } }); }
  function onStatus(cb) { statusCbs.push(cb); cb(status, user); }
  const getUser = () => user;
  // v396: 他人の公開データ（投稿・コメント・通知・プロフィール）を画面へ渡す前に整える。
  // 画像は data:image か Firebase Storage の URL だけ（ほかの URL を <img> に入れると、見た人の IP などが外へ漏れる）。数値は数に
  const SAFE_IMG = /^(data:image\/[a-z0-9.+-]+;base64,|https:\/\/firebasestorage\.googleapis\.com\/)/i;
  const safeImg = (u) => (typeof u === 'string' && SAFE_IMG.test(u) ? u : '');
  const numIn = (v, lo, hi) => { const n = Number(v); return v != null && v !== '' && isFinite(n) && n >= lo && n <= hi ? n : null; };
  function cleanPub(d) {
    if (!d || typeof d !== 'object') return d;
    const o = { ...d };
    for (const k of ['photoUrl', 'avatar', 'fromAvatar']) if (k in o) o[k] = safeImg(o[k]);
    if ('lat' in o || 'lon' in o) { o.lat = numIn(o.lat, -90, 90); o.lon = numIn(o.lon, -180, 180); if (o.lat == null || o.lon == null) o.lat = o.lon = null; }
    if ('rating' in o) o.rating = numIn(o.rating, 0, 5) || 0;
    if ('ar' in o) o.ar = numIn(o.ar, 0, 10) || 0;
    if (typeof o.username !== 'string') o.username = '';
    return o;
  }
  const isSupported = () => !!(window.indexedDB && window.fetch);

  // Firebase SDK を esm.sh から動的読み込みして初期化（初回のみ）
  async function ensureLoaded() {
    if (ready) return ready;
    ready = (async () => {
      // Firebase公式の gstatic 配信（ESM）を動的読み込み
      const base = `https://www.gstatic.com/firebasejs/${V}`;
      const [appM, authM, fsM, stM] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-firestore.js`),
        import(`${base}/firebase-storage.js`),
      ]);
      const app = appM.initializeApp(CONFIG);
      auth = authM.getAuth(app);
      db = fsM.getFirestore(app);
      storage = stM.getStorage(app);
      // 写真の読み書きが失敗したとき、既定2分もリトライして固まらないよう短縮
      try { storage.maxOperationRetryTime = 20000; storage.maxUploadRetryTime = 20000; } catch { /* noop */ }
      fb = { app: appM, auth: authM, fs: fsM, st: stM };
      // リダイレクト方式ログインの戻り（インストール済みPWA等）を回収
      authM.getRedirectResult(auth).catch(() => { /* 未使用時は無視 */ });
      // 自動バックアップの起動タイミングを仕込む（登録は1回だけ。実行はログイン中のみ）
      setInterval(() => autoBackupSweep(false), 5 * 60 * 1000); // v359〜 5分おき（前は15分）
      document.addEventListener('visibilitychange', () => { if (!document.hidden) autoBackupSweep(false); });
      window.addEventListener('online', () => autoBackupSweep(false));
      authM.onAuthStateChanged(auth, async (u) => {
        user = u;
        if (u) {
          // 同じ端末で別のアカウントにログインした場合は、前のアカウントの記録・写真・APIキー・
          // 他人の投稿の控えを消してから同期する（前の人のデータが新しいアカウントへ流れ込まないように）
          // v394: 前のアカウント（またはログアウト前）の同期が止まるのを待ってから消す・始める（assertUser で途中で抜ける）
          if (syncRun) await syncRun.catch(() => {});
          if (!user || user.uid !== u.uid) return;
          const LAST_UID = 'gourmet.lastUid';
          let last = null;
          try { last = localStorage.getItem(LAST_UID); } catch { /* noop */ }
          if (last && last !== u.uid) {
            try {
              await Store.wipeLocal();
              Api.setApiKey(''); Api.setGoogleKey(''); Api.setYahooKey(''); Api.setHotpepperKey('');
              try { localStorage.removeItem('gourmet.prefsAt'); } catch { /* noop */ } // v390〜 表示の好みは新しいアカウントのクラウド側を採用
              try { localStorage.removeItem('gourmet.keysClearPending'); } catch { /* noop */ } // v395: 前のアカウントで消し損ねた印で、次のアカウントのキーを消さない
              if (typeof Views !== 'undefined' && Views.clearSocialCaches) Views.clearSocialCaches();
              App.toast('別のアカウントでログインしたため、前のアカウントの端末内データを消去しました');
              App.refreshCurrent();
            } catch (e) { console.warn('端末データの消去に失敗:', e); }
          }
          try { localStorage.setItem(LAST_UID, u.uid); } catch { /* noop */ }
          Store.setSyncHook(onLocalChange);
          setStatus('syncing');
          const uid = u.uid;
          // v394: 写真の取り込みまでを1つの同期として排他にする（sweep と重ねない）
          const run = runExclusive(async () => {
            try {
              // 記録（店・訪問・プロフィール）を先に同期し、この時点で「同期済み」にする
              await retryDeletes(); // v396: 前回送れなかった削除を先に（以前は最初の sweep まで待っていた）
              await syncRecords();
              await cleanupAfterPull(); // 取り込みが済んだ後に、店の無い訪問・訪問の無い写真を消す（v370〜。v396: 全件を読んだときだけ）
              setStatus('synced');
              App.refreshCurrent();
            } catch (e) { console.error('sync error:', e); setStatus('error', e); return; }
            // 写真は容量が大きいので記録の後で取得（失敗しても同期状態は固めない）
            try {
              assertUser(uid);
              await syncPhotos();
              lastSweepAt = Date.now(); // 起動時に全同期したので自動バックアップの間引き起点にする
              App.refreshCurrent();
              return true;
            } catch (e) { console.warn('写真同期に失敗:', e); return false; }
          });
          // 公開投稿の出し直しは時間がかかるので排他の外で（引っ張って更新を待たせない）
          run.then((photosOk) => {
            if (!user || user.uid !== uid) return;
            // 投稿化は負荷が高いので1セッション1回だけ
            const pub = (photosOk && !postsPublishedThisSession) ? (postsPublishedThisSession = true, publishAllPosts()) : Promise.resolve();
            // 写真URLが欠けた投稿を埋め直す。写真同期が途中で失敗しても必ず実行する
            // （欠けが無ければ即終了で軽い。相手のプロフィールで写真が出ない問題の自動修復）
            pub.catch(() => {}).finally(() => { if (user && user.uid === uid) backfillPostPhotos().catch(() => {}); });
          }).catch(() => {});
        } else {
          Store.setSyncHook(null);
          try { pending.clear(); } catch { /* noop */ } // v392: 書き込み待ちを次のアカウントへ持ち越さない
          setStatus('signedout');
        }
      });
    })();
    ready.catch(() => { ready = null; }); // v394: SDK の読み込みに失敗したら次のログインで読み直す（失敗を持ち続けない）
    return ready;
  }

  // 起動時に呼ぶ: 既存ログインセッションがあれば復元して同期
  async function init() {
    if (!isSupported()) return;
    try { await ensureLoaded(); } catch (e) { console.warn('Firebase読み込み失敗:', e); }
  }

  async function login() {
    setStatus('loading');
    await ensureLoaded();
    const provider = new fb.auth.GoogleAuthProvider();
    try {
      await fb.auth.signInWithPopup(auth, provider);
    } catch (e) {
      // ポップアップが使えない環境（インストール済みPWA等）はリダイレクト方式へ
      if (e && ['auth/popup-blocked', 'auth/cancelled-popup-request',
        'auth/operation-not-supported-in-this-environment', 'auth/popup-closed-by-user'].includes(e.code)) {
        if (e.code === 'auth/popup-closed-by-user') { setStatus('signedout'); return; }
        await fb.auth.signInWithRedirect(auth, provider);
      } else {
        setStatus('error', e); throw e;
      }
    }
  }
  async function logout() {
    await ensureLoaded();
    await fb.auth.signOut(auth);
    // フォロー中の人の投稿の控えはこの端末の次の利用者に見せない（自分の記録は端末に残す）
    if (typeof Views !== 'undefined' && Views.clearSocialCaches) Views.clearSocialCaches();
  }

  // ---------- Firestore ヘルパー ----------
  const dref = (name, id) => fb.fs.doc(db, 'users', user.uid, name, id);
  const cref = (name) => fb.fs.collection(db, 'users', user.uid, name);
  // Firestoreは undefined を受け付けないので、プレーンなデータへ整える（blob等も除去）
  const clean = (obj) => JSON.parse(JSON.stringify(obj));
  // 通信が固まったときに永久待ちにならないよう、各処理へタイムアウトを付ける
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error((label || '処理') + 'がタイムアウトしました')), ms)),
  ]);
  // 写真の公開URLを取得（fetchでのbytes取得はCORS設定が要るため、URLを<img>で直接表示する）
  async function photoDownloadUrl(path) {
    return await withTimeout(fb.st.getDownloadURL(fb.st.ref(storage, path)), 15000, 'URL取得');
  }

  // ---------- 記録（店・訪問・プロフィール）の双方向同期 ----------
  // 削除の控え（v365〜）: 消した記録の id を users/{uid}/deleted/{kind_id} にも残し、別端末はそれを見て同じ記録を消す。
  // 90 日たった控えは取り込むときに掃除する
  const TOMB_KEEP = 90 * 24 * 3600 * 1000;
  // 控えを書く。失敗は呼び元へ投げる（v394〜。以前は握りつぶしていたので、届かなくても端末の墓標を消していた）。
  // at は削除した時刻（再送でも元の時刻のまま。「今」にすると、その後に別端末で直した・戻した記録まで消してしまう）
  function putTombstone(kind, id, at) {
    return fb.fs.setDoc(dref('deleted', `${kind}_${id}`), { kind, id, at: Number(at) || Date.now() });
  }
  // v394: 控えは取り込みより先に読み、読めなければ同期ごと止める（読めないまま全件を押し上げると、別端末で消した記録をクラウドへ戻してしまう）。
  // 返り値: kind → Map(id → at)
  let lastTombs = null; // 直近に読んだ控え（写真の同期で使う）
  // オフラインの getDocs はサーバーではなく端末の控え（fromCache）で答えることがあるので、それも「読めなかった」とみなす
  const assertFresh = (snap, what) => { if (snap && snap.metadata && snap.metadata.fromCache) throw new Error(what + 'をサーバーから読めませんでした（オフライン）'); };
  async function fetchTombs() {
    const snap = await fb.fs.getDocs(cref('deleted'));
    assertFresh(snap, '削除の控え');
    const byKind = { shop: new Map(), visit: new Map(), wish: new Map(), photo: new Map() };
    const now = Date.now(), old = [];
    snap.forEach(d => {
      const t = d.data() || {};
      if (typeof t.id !== 'string' || !byKind[t.kind]) return;
      const at = Number(t.at) || 0;
      if (!(at > now - TOMB_KEEP)) { old.push(d.id); return; }
      byKind[t.kind].set(t.id, at);
    });
    if (old.length) runPool(old.slice(0, 50), 4, (id) => fb.fs.deleteDoc(dref('deleted', id)).catch(() => {}));
    lastTombs = byKind;
    return byKind;
  }
  // 控えに合わせてこちらの記録を消す（v365〜）。控えより後に直した・バックアップから戻した記録は残し、
  // そのときはクラウドの控えを消す（残しておくと、次の同期でクラウドの記録とずっと食い違う。v394〜）
  async function applyTombs(tombs) {
    let n = 0;
    const local = {
      shop: new Map(Store.rawShops().map(x => [x.id, x])),
      visit: new Map(Store.rawVisits().map(x => [x.id, x])),
      wish: new Map(Store.rawWishes().map(x => [x.id, x])),
    };
    const stale = [];
    // v396: 写真の控えは 90 日残るので、端末にある写真だけを相手にする（以前は控え1件ごとに写真の一覧を全部読んでいた）
    const localPhotoIds = tombs.photo.size ? await Store.photoIds() : new Set();
    for (const kind of ['shop', 'visit', 'wish', 'photo']) {
      for (const [id, at] of tombs[kind]) {
        if (kind === 'photo' ? !localPhotoIds.has(id) : !local[kind].has(id)) continue;
        try { if (await Store.applyRemoteDelete(kind, id, at)) { n++; continue; } } catch { continue; }
        const r = local[kind] && local[kind].get(id);
        if (r && (Number(r.updatedAt) || 0) > at) { stale.push(`${kind}_${id}`); tombs[kind].delete(id); }
      }
    }
    if (stale.length) await runPool(stale, 4, (docId) => fb.fs.deleteDoc(dref('deleted', docId)).catch(() => {}));
    return n;
  }
  // 同期の途中でログアウト・別アカウントへの切り替えがあったら止める（前の人の記録を次の人の場所へ書かない）
  function assertUser(uid) { if (!user || user.uid !== uid) throw new Error('アカウントが変わったため同期を中止しました'); }
  async function syncRecords() {
    const uid = user.uid;
    let n = 0;
    if (!remoteAt || remoteAtUid !== uid) { remoteAt = { shop: new Map(), visit: new Map(), wish: new Map() }; remoteAtUid = uid; lastFullPullAt = 0; }
    const startedAt = Date.now();
    const full = !lastFullPullAt || startedAt - lastFullPullAt > PULL_FULL_EVERY;
    const since = full ? 0 : lastPullAt;
    const tombs = await fetchTombs();
    n += await pullCollection('shops', 'shop', tombs.shop, since);
    n += await pullCollection('visits', 'visit', tombs.visit, since);
    n += await pullCollection('wishes', 'wish', tombs.wish, since);
    assertUser(uid);
    n += await applyTombs(tombs); // 別端末で消した記録（店・訪問・行きたい・写真）をこちらでも消す（v365〜）
    await pullProfile();
    await syncApiKeys();
    await syncPrefs(); // 表示の好み（v390〜）
    assertUser(uid);
    await pushAllRecords();
    lastPullAt = startedAt; // 読み込みを始めた時刻（この後に直されたものは次の差分で拾う）
    if (full) lastFullPullAt = startedAt;
    lastPullWasFull = full;
    return n; // 別端末から取り込んだ記録の数
  }

  // APIキー（Anthropic/Google）を自分のアカウントにも保存して、消えたら自動復元する
  //  - localStorageはブラウザ都合で消えることがある（iOS Safariの自動削除・端末変更など）
  //  - 保存先は users/{uid}/meta/keys（本人しか読めない）
  async function syncApiKeys() {
    try {
      const ref = dref('meta', 'keys');
      let pendingClear = false;
      try { pendingClear = !!localStorage.getItem(KEYS_CLEAR); } catch { /* noop */ }
      if (pendingClear) { // 前に消し損ねた控えを消す。消すまでは復元しない（消したはずのキーが戻るのを防ぐ）
        await fb.fs.deleteDoc(ref);
        try { localStorage.removeItem(KEYS_CLEAR); } catch { /* noop */ }
      }
      const snap = await fb.fs.getDoc(ref);
      const remote = snap.exists() ? snap.data() : {};
      // ローカルに無ければクラウドから復元
      if (!Api.getApiKey() && remote.anthropic) Api.setApiKey(remote.anthropic);
      if (!Api.getGoogleKey() && remote.google) Api.setGoogleKey(remote.google);
      if (!localStorage.getItem('gourmet.yahooKey') && remote.yahoo) Api.setYahooKey(remote.yahoo);
      if (!localStorage.getItem('gourmet.hotpepperKey') && remote.hotpepper) Api.setHotpepperKey(remote.hotpepper);
      // ローカルにあるキーはクラウドへ保存（機種変更・消失対策）
      const data = {};
      if (Api.getApiKey()) data.anthropic = Api.getApiKey();
      if (Api.getGoogleKey()) data.google = Api.getGoogleKey();
      if (localStorage.getItem('gourmet.yahooKey')) data.yahoo = localStorage.getItem('gourmet.yahooKey');
      if (localStorage.getItem('gourmet.hotpepperKey')) data.hotpepper = localStorage.getItem('gourmet.hotpepperKey');
      if (Object.keys(data).length) await fb.fs.setDoc(ref, data, { merge: true });
    } catch (e) { console.warn('APIキーの同期に失敗:', e); }
  }

  // 表示の好み（文字の大きさ・ホームの写真・全画面の ‹ ›）を端末間で同期（v390〜）。
  // users/{uid}/meta/prefs に {fontScale, homeSquare, pvNavOff, updatedAt}。updatedAt の新しい方を採用し、
  // こちらが新しければ書く。同じ時刻は触らない。設定を変えたときは app.js の prefChanged() からも呼ばれる
  async function syncPrefs() {
    if (!user || !db) return;
    try {
      const ref = dref('meta', 'prefs');
      const snap = await fb.fs.getDoc(ref);
      const remote = snap.exists() ? snap.data() : null;
      const local = App.getDisplayPrefs();
      const rAt = remote ? (Number(remote.updatedAt) || 0) : 0;
      if (rAt > local.updatedAt) App.applyDisplayPrefs(remote);
      else if (local.updatedAt > rAt) await fb.fs.setDoc(ref, clean(local));
    } catch (e) { console.warn('表示の好みの同期に失敗:', e); }
  }

  // 設定の「キーを削除」用: クラウド側の控えも消す（残っていると次回ログインで復活してしまう）
  // v395: 消せなかったとき（オフラインなど）は印を残し、次の同期で消し直す（印があるうちはクラウドから復元しない）
  const KEYS_CLEAR = 'gourmet.keysClearPending';
  async function clearApiKeys() {
    try { localStorage.setItem(KEYS_CLEAR, '1'); } catch { /* noop */ }
    await ensureLoaded();
    if (!user) return;
    try { await fb.fs.deleteDoc(dref('meta', 'keys')); localStorage.removeItem(KEYS_CLEAR); } catch { /* 次の syncApiKeys で */ }
  }

  // クラウド → ローカル（新しい方を採用）。店・訪問・行きたい（v394〜 行きたいも同じ関数。以前は失敗を握りつぶしたまま押し上げていた）。
  // 読めなければ投げる（同期ごと止める）。控え（tombs: id → at）より古い記録はクラウドの消し残しなので取り込まず、クラウドから消す
  // v396: クラウドにある記録の updatedAt の控え（kind → Map(id → updatedAt)）。押し上げは「クラウドに無い／こちらが新しい」ものだけにする
  // （以前は毎回の同期で全件を書き直し、150店・400記録で1回 600 件、数時間で Firestore の無料枠の書き込み数を超えていた）。
  // 読み込みも、30分に1回の全件以外は「前回の読み込みから後に直されたもの」だけ（updatedAt の範囲。端末の時計のずれに 10 分の余裕）
  let remoteAt = null, remoteAtUid = '', lastFullPullAt = 0, lastPullAt = 0;
  // v396: 差分の読み込みは「書いた端末の時計」で切るので、オフラインで書いて後から届いた別端末の記録を見落とすことがある。
  // 見落としたまま「店の無い記録・記録の無い写真」を掃除すると、別端末の記録を消して全端末から消してしまうので、掃除は全件を読んだ直後だけにする。
  // 写真の同期で、こちらに無い記録の写真が見つかったら、次の読み込みを全件にする
  let lastPullWasFull = false;
  const cleanupAfterPull = () => (lastPullWasFull ? Store.cleanupOrphans().catch(() => {}) : Promise.resolve());
  const noteRemote = (kind, r) => { if (remoteAt && user && remoteAtUid === user.uid && r && r.id) remoteAt[kind].set(r.id, Number(r.updatedAt) || 0); };
  const PULL_FULL_EVERY = 30 * 60 * 1000, PULL_SKEW = 10 * 60 * 1000;
  async function pullCollection(name, kind, tombs, since) {
    const q = since ? fb.fs.query(cref(name), fb.fs.where('updatedAt', '>', since - PULL_SKEW)) : cref(name);
    const snap = await fb.fs.getDocs(q);
    assertFresh(snap, name);
    const atMap = remoteAt[kind];
    if (!since) atMap.clear();
    const localMap = new Map((kind === 'shop' ? Store.rawShops() : kind === 'visit' ? Store.rawVisits() : Store.rawWishes()).map(x => [x.id, x]));
    const gone = Store.deletedIds(kind);
    const take = [], zombies = [];
    snap.forEach(docSnap => {
      const remote = docSnap.data();
      if (!remote || typeof remote.id !== 'string') return;
      atMap.set(remote.id, Number(remote.updatedAt) || 0);
      if (gone.has(remote.id)) return; // この端末で削除済み → 復活させない
      const tAt = tombs && tombs.get(remote.id);
      if (tAt != null && (Number(remote.updatedAt) || 0) <= tAt) { zombies.push(remote.id); atMap.delete(remote.id); return; }
      const local = localMap.get(remote.id);
      // 新しい方を採用。同じ時刻は同じ内容とみなして触らない（毎回の書き戻しを避ける）
      if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) take.push(remote);
    });
    Store.applyRemoteMany(kind, take);
    if (zombies.length) await runPool(zombies, 4, (id) => fb.fs.deleteDoc(dref(name, id)).catch(() => {}));
    return take.length;
  }
  let remoteProfileAt = -1; // クラウドのプロフィールの updatedAt（-1 = 無い）
  async function pullProfile() {
    const snap = await fb.fs.getDoc(dref('meta', 'profile'));
    remoteProfileAt = -1;
    if (snap.exists()) {
      const remote = snap.data();
      remoteProfileAt = Number(remote.updatedAt) || 0;
      const local = Store.getProfile();
      if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) Store.applyRemote('profile', remote);
    }
  }

  // ローカル → クラウド（全レコードをupsert）
  // ローカル → クラウド。v396: クラウドに無い記録と、こちらの方が新しい記録だけ（remoteAt と比べる）
  async function pushAllRecords() {
    const writes = [];
    const need = (kind, r) => { const at = remoteAt[kind].get(r.id); return at === undefined || (Number(r.updatedAt) || 0) > at; };
    for (const s of Store.rawShops()) if (need('shop', s)) writes.push(['shops', 'shop', s]);
    for (const v of Store.rawVisits()) if (need('visit', v)) writes.push(['visits', 'visit', v]);
    for (const w of Store.rawWishes()) if (need('wish', w)) writes.push(['wishes', 'wish', w]);
    // 400件ずつバッチ書き込み（Firestoreの上限 500 件対策）
    for (let i = 0; i < writes.length; i += 400) {
      const chunk = writes.slice(i, i + 400);
      const batch = fb.fs.writeBatch(db);
      for (const [name, , r] of chunk) batch.set(dref(name, r.id), clean(r));
      await batch.commit();
      for (const [, kind, r] of chunk) remoteAt[kind].set(r.id, Number(r.updatedAt) || 0);
    }
    const prof = Store.getProfile();
    if (remoteProfileAt < 0 || (Number(prof.updatedAt) || 0) > remoteProfileAt) {
      await fb.fs.setDoc(dref('meta', 'profile'), clean(prof));
      remoteProfileAt = Number(prof.updatedAt) || 0;
    }
    return writes.length;
  }

  // 公開URLから画像の実体（バイト）を取得する。Firebaseの v0 ダウンロードURLは
  // CORSを許可しているため fetch できる（できない環境ではURL参照表示に落とす）
  async function fetchPhotoBlob(url) {
    const res = await withTimeout(fetch(url), 20000, '写真ダウンロード');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.blob();
  }

  // 並列実行（同時limit件まで）。1件ずつの逐次処理だと枚数分の往復時間がかかるため、
  // 写真の転送はこれで数件ずつ並行する。エラー処理は worker 側で行う
  async function runPool(items, limit, worker) {
    const q = [...items];
    const runners = Array.from({ length: Math.max(1, Math.min(limit, q.length)) }, async () => {
      while (q.length) {
        const item = q.shift();
        try { await worker(item); } catch { /* workerで記録済み */ }
      }
    });
    await Promise.all(runners);
  }

  // 写真: クラウド↔ローカルの差分を埋める。
  // 別端末でログインしたときも写真の実体ごとダウンロードして端末に保存する（本当の復元）。
  // 転送は数件ずつ並列で行い、1回あたりの取り込み上限を超えた分は次の自動同期で続きから
  async function syncPhotos() {
    const uid = user.uid;
    const metaSnap = await fb.fs.getDocs(cref('photos'));
    const cloudMetas = [];
    // v396: 本体の場所（path）の無いメタ（付け替えだけ先に届いた写真）は「クラウドにある」と数えない（こちらから上げ直す）。id は文書の id で補う
    metaSnap.forEach(d => { const m = d.data() || {}; if (!m.id) m.id = d.id; if (typeof m.path === 'string' && m.path) cloudMetas.push(m); });
    const cloudIds = new Set(cloudMetas.map(m => m.id));
    { // v396: こちらに無い記録・店の写真があれば、記録の読み込みに見落としがある（次は全件）
      const vIds = new Set(Store.rawVisits().map(v => v.id));
      if (cloudMetas.some(m => m.visitId && !vIds.has(m.visitId) && !(lastTombs && lastTombs.visit && lastTombs.visit.has(m.visitId)))) lastFullPullAt = 0;
    }
    const metaById = new Map(cloudMetas.map(m => [m.id, m]));
    const localIds = await Store.photoIds();
    let changed = 0;            // 取り込めた枚数（呼び出し側で画面を描き直す判断に使う）
    let fails = 0;
    const MAX_PULL = 60;        // 1回の同期でダウンロードする実体の上限（残りは次回）
    const MAX_FAIL = 8;         // 失敗が続いたら今回は諦めて次回に回す（永久リトライ防止）
    const localPhotos = await Store.allPhotos();

    // ダウンロード対象: ①クラウドにあってローカルに無い写真（新規取り込み）
    //                  ②URL参照だけで実体が無い写真（実体の取り直し）
    const gonePhotos = Store.deletedIds('photo');
    // v394: クラウドに削除の控えがある写真は取り込まず、消し残しのメタと本体をクラウドから消す
    const photoTombs = (lastTombs && lastTombs.photo) || new Map();
    const zombieMetas = cloudMetas.filter(m => photoTombs.has(m.id));
    if (zombieMetas.length) {
      runPool(zombieMetas, 3, async (m) => {
        await fb.fs.deleteDoc(dref('photos', m.id)).catch(() => {});
        await fb.st.deleteObject(fb.st.ref(storage, m.path || `users/${user.uid}/photos/${m.id}.jpg`)).catch(() => {});
      }).catch(() => {});
    }
    const newTargets = cloudMetas.filter(m => !localIds.has(m.id) && !gonePhotos.has(m.id) && !photoTombs.has(m.id));
    const hydrTargets = localPhotos.filter(p => !p.hasBlob && cloudIds.has(p.id));
    // 別端末で店を統合した写真（クラウドのメタの店 id が違う）は、こちらでも付け替える（v364〜）
    // v393: 付け替えの時刻 metaAt を比べて新しい方を採る。
    //  ・こちらが新しい（付け替えたがクラウドへの書き込みが届く前に閉じた等）→ クラウドのメタを直す。以前はクラウドを正として付け替えが戻されていた
    //  ・クラウドが新しい → こちらを付け替える。店が同じで記録だけ違う移動（v366「別の記録へ」）も届ける（以前は店が違うときだけだった）
    //  ・どちらにも時刻が無い（v392 以前の写真）→ 店が違うときだけ従来どおりクラウドに合わせる。記録だけの違いはどちらが正しいか分からないので触らない
    const visitIdsNow = new Set(Store.rawVisits().map(v => v.id));
    for (const p of localPhotos) {
      const m = metaById.get(p.id);
      if (!m || !m.shopId) continue;
      const shopDiff = m.shopId !== p.shopId, visitDiff = !!m.visitId && m.visitId !== p.visitId;
      if (!shopDiff && !visitDiff) continue;
      const cAt = Number(m.metaAt) || 0, lAt = Number(p.metaAt) || 0;
      if (lAt > cAt) {
        try { await fb.fs.setDoc(dref('photos', p.id), clean({ shopId: p.shopId, visitId: p.visitId, metaAt: lAt }), { merge: true }); } catch { /* 次の同期でもう一度 */ }
        continue;
      }
      if (!shopDiff && cAt === lAt) continue;
      if (Store.getShop(m.shopId) && (!m.visitId || visitIdsNow.has(m.visitId))) {
        try { if (await Store.relinkPhoto(p.id, m.shopId, m.visitId, cAt)) changed++; } catch { /* noop */ }
      }
    }
    const allTargets = [...newTargets.map(m => ({ kind: 'new', m })),
      ...hydrTargets.map(p => ({ kind: 'hydrate', p }))];
    // v359〜 60 枚ごとに区切って最後まで取り込む（以前は 60 枚で打ち切り、残りは次の起動に回していた）。
    // 区切りごとに画面を描き直し、届いた写真から順に見えるようにする
    for (let i = 0; i < allTargets.length && fails < MAX_FAIL; i += MAX_PULL) {
      assertUser(uid);
      const before = changed;
      await runPool(allTargets.slice(i, i + MAX_PULL), 5, async (t) => {
        if (fails >= MAX_FAIL || !user || user.uid !== uid) return;
      try {
        if (t.kind === 'new') {
          const m = t.m;
          const remoteUrl = await photoDownloadUrl(m.path);
          let blob = null;
          try { blob = await fetchPhotoBlob(remoteUrl); } catch { fails++; }
          if (!user || user.uid !== uid) return; // 取り込み中にアカウントが変わった
          await Store.putPhotoRaw({
            id: m.id, shopId: m.shopId, visitId: m.visitId, type: m.type || 'dish',
            hash: m.hash || '', createdAt: m.createdAt || Date.now(), metaAt: Number(m.metaAt) || 0, remoteUrl, ar: Number(m.ar) || 0,
            ...(blob ? { blob } : {}),
          });
        } else {
          const p = t.p;
          let url = p.remoteUrl, blob = null;
          if (url) { try { blob = await fetchPhotoBlob(url); } catch { blob = null; } }
          if (!blob) { // URLが古い可能性 → 取り直して再挑戦
            const m = metaById.get(p.id);
            url = await photoDownloadUrl((m && m.path) || `users/${user.uid}/photos/${p.id}.jpg`);
            blob = await fetchPhotoBlob(url);
          }
          if (!user || user.uid !== uid) return;
          await Store.putPhotoRaw({ ...p, remoteUrl: url, blob });
        }
        changed++;
      } catch (e) { fails++; console.warn('写真取り込み失敗:', e); }
      });
      if (changed > before && i + MAX_PULL < allTargets.length) { try { App.refreshCurrent(); } catch { /* noop */ } }
    }

    // ローカルにあってクラウドに無い写真 → 並列アップロード。
    // 投稿の公開は1枚ごとに行わず、アップロード後に訪問単位でまとめて行う（重複した通信を削減）
    assertUser(uid);
    const ups = localPhotos.filter(p => !cloudIds.has(p.id) && p.hasBlob);
    const okVisits = new Set();
    await runPool(ups, 3, async (p) => {
      try {
        await withTimeout(uploadPhoto(p, true), 25000, 'アップロード');
        okVisits.add(p.visitId);
      } catch (e) { console.warn('写真アップロード失敗:', p.id, e); }
    });
    await runPool([...okVisits], 4, (vid) => publishPostForVisit(vid, null).catch(() => {}));
    return changed;
  }

  // skipPublish: 一括同期では1枚ごとの投稿公開を省き、呼び出し側で訪問単位にまとめて公開する
  async function uploadPhoto(p, skipPublish) {
    const path = `users/${user.uid}/photos/${p.id}.jpg`;
    // 一覧用のメタ情報しか持っていないことが多いので、本体はここで1枚だけ読む
    const body = p.blob || await Store.getPhotoBlob(p.id);
    if (!body) throw new Error('写真の本体が端末にありません: ' + p.id);
    await fb.st.uploadBytes(fb.st.ref(storage, path), body, { contentType: 'image/jpeg' });
    const { blob, thumb, hasBlob, thumbV, ...meta } = p; // blobはStorageへ。Firestoreにはメタ情報のみ
    await fb.fs.setDoc(dref('photos', p.id), clean({ ...meta, path }));
    // フィード用の公開投稿も更新（@ユーザー名を設定している人のみ）
    if (!skipPublish) {
      try { await publishPostForVisit(p.visitId, path); } catch (e) { console.warn('投稿の公開に失敗:', e); }
    }
  }

  // ---------- SNS: フィード（フォロー中の人の投稿） ----------
  //  publicPosts/{visitId} : 写真つきの記録を、フォロワーが見られる公開投稿として保存
  async function publishPostForVisit(visitId, photoPath, presetUrl) {
    if (!user) return;
    const prof = Store.getProfile();
    if (!prof.username) return; // 公開名がなければフィードには出さない
    const visit = Store.visits().find(v => v.id === visitId);
    if (!visit) return;
    const shop = Store.getShop(visit.shopId) || {};
    let photoUrl = presetUrl || '';
    if (!photoUrl && photoPath) photoUrl = await photoDownloadUrl(photoPath).catch(() => '');
    const ps = await Store.photosOfVisit(visitId).catch(() => []);
    const p0 = ps && ps.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0]; // 投稿に使う写真（1枚目＝登録の早い順。v393: 以前は id 順で、どの写真になるか決まっていなかった）。縦横比 ar も一緒に公開する（v331〜）
    // 引数でURLが来ない場合（編集後の再発行など）は、訪問の写真から自力で取得する
    // （ここで空のまま保存すると既存投稿の写真が消えてしまうため）
    if (!photoUrl) {
      if (p0) {
        photoUrl = p0.remoteUrl ||
          await photoDownloadUrl(`users/${user.uid}/photos/${p0.id}.jpg`).catch(() => '');
      }
    }
    // 写真も評価もない記録（写真なしの「また来た」）はフィードに出さない（中身のない投稿で流れを埋めないため）
    if (!photoUrl && !(Number(visit.rating) > 0)) {
      // v393: 写真も★も無くなった記録（写真を全部消した評価なしの記録）は、前に出した投稿が残らないように消す。
      // 写真はあるのに URL が取れなかっただけ（通信の失敗）のときは消さない
      if (!ps || !ps.length) await fb.fs.deleteDoc(fb.fs.doc(db, 'publicPosts', visitId)).catch(() => {});
      return;
    }
    const post = clean({
      id: visitId, uid: user.uid, username: prof.username,
      displayName: String(prof.name || 'BITEMAP').slice(0, 50),
      avatar: (prof.avatar && prof.avatar.length < 60000) ? prof.avatar : '',
      shopName: String(shop.name || '').slice(0, 200), shopId: visit.shopId, // v396: ルールの長さの上限を超えると黙って公開されなかった
      rating: visit.rating || 0, genre: (visit.dishGenres || []).join('・').slice(0, 300),
      comment: String(visit.comment || '').slice(0, 2000), photoUrl, ar: (p0 && Number(p0.ar) > 0) ? Number(p0.ar) : 0,
      // 詳細表示・ナビ用の店舗情報
      shopGenre: shop.shopGenre || '', pref: shop.pref || '', city: shop.city || '',
      station: shop.station || '', address: String(shop.address || '').slice(0, 500),
      casual: shop.casual || 0, atmosphere: shop.atmosphere || 0, speed: shop.speed || 0,
      lat: (shop.lat != null ? shop.lat : null), lon: (shop.lon != null ? shop.lon : null),
      datetime: visit.datetime, createdAt: Number(visit.createdAt) || new Date(visit.datetime).getTime() || Date.now(), // v393: 記録を作った時刻。以前は出し直すたびに「今」になり、フォロワーのホームの新しい60件が「最後にアプリを開いた人の古い投稿」で埋まっていた
    });
    // v396: 写真はあるのに URL が取れなかった（通信の失敗）ときは、前の投稿の写真を消さないよう photoUrl を書かずに重ねる
    if (!photoUrl && ps && ps.length) { delete post.photoUrl; await fb.fs.setDoc(fb.fs.doc(db, 'publicPosts', visitId), post, { merge: true }); return; }
    await fb.fs.setDoc(fb.fs.doc(db, 'publicPosts', visitId), post);
  }

  // ---------- SNS: いいね・コメント（フィード投稿への反応） ----------
  //  publicPosts/{postId}/likes/{uid}      : いいね（本人のみ作成/削除）
  //  publicPosts/{postId}/comments/{cid}   : コメント（誰でも作成、本人のみ削除）
  async function getLikeInfo(postId) {
    await ensureLoaded();
    const snap = await fb.fs.getDocs(fb.fs.collection(db, 'publicPosts', postId, 'likes'));
    const liked = user ? snap.docs.some(d => d.id === user.uid) : false;
    return { count: snap.size, liked };
  }
  async function toggleLike(postId) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    const ref = fb.fs.doc(db, 'publicPosts', postId, 'likes', user.uid);
    const snap = await fb.fs.getDoc(ref);
    if (snap.exists()) { await fb.fs.deleteDoc(ref); return false; }
    await fb.fs.setDoc(ref, { uid: user.uid, createdAt: Date.now() });
    return true;
  }
  async function getComments(postId) {
    await ensureLoaded();
    const snap = await fb.fs.getDocs(fb.fs.collection(db, 'publicPosts', postId, 'comments'));
    const arr = []; snap.forEach(d => arr.push(cleanPub(Object.assign({ cid: d.id }, d.data()))));
    arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return arr;
  }
  async function commentCount(postId) {
    await ensureLoaded();
    const snap = await fb.fs.getDocs(fb.fs.collection(db, 'publicPosts', postId, 'comments'));
    return snap.size;
  }
  async function addComment(postId, text) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    const t = String(text || '').trim();
    if (!t) return;
    const prof = Store.getProfile();
    const ref = fb.fs.doc(fb.fs.collection(db, 'publicPosts', postId, 'comments'));
    await fb.fs.setDoc(ref, clean({
      uid: user.uid, username: prof.username || '', displayName: prof.name || 'BITEMAP',
      avatar: (prof.avatar && prof.avatar.length < 60000) ? prof.avatar : '',
      text: t, createdAt: Date.now(),
    }));
  }
  async function deleteComment(postId, cid) {
    await ensureLoaded();
    if (!user) return;
    await fb.fs.deleteDoc(fb.fs.doc(db, 'publicPosts', postId, 'comments', cid)).catch(() => {});
  }

  // ---------- SNS: 通知（フォローされたお知らせ） ----------
  async function fetchNotifications() {
    await ensureLoaded();
    if (!user) return [];
    const snap = await fb.fs.getDocs(fb.fs.collection(db, 'notifications', user.uid, 'items'));
    const arr = []; snap.forEach(d => arr.push(cleanPub(d.data())));
    arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return arr;
  }
  async function unreadNotifCount() {
    try { return (await fetchNotifications()).filter(n => !n.read).length; }
    catch { return 0; }
  }
  async function markNotificationsRead() {
    await ensureLoaded();
    if (!user) return;
    const snap = await fb.fs.getDocs(fb.fs.collection(db, 'notifications', user.uid, 'items'));
    const batch = fb.fs.writeBatch(db); let n = 0;
    snap.forEach(d => { if (!d.data().read) { batch.update(d.ref, { read: true }); n++; } });
    if (n) await batch.commit();
  }

  // 自分の写真つき記録をまとめてフィード投稿として公開（過去の記録もフィードに載せる）
  async function publishAllPosts() {
    if (!user) return;
    const prof = Store.getProfile();
    if (!prof.username) return; // @ユーザー名がなければ公開しない
    // 写真の有無にかかわらず「すべての訪問記録」を公開する
    // （以前は写真起点だったため、写真のない記録が相手に届かず地図の合算平均が欠けていた）
    const photos = await Store.allPhotos();
    const photoByVisit = new Map();
    for (const p of photos) if (!photoByVisit.has(p.visitId)) photoByVisit.set(p.visitId, p); // 代表1枚
    // 訪問数が多いと逐次では時間がかかるため、数件ずつ並列で公開する
    await runPool(Store.visits(), 4, async (v) => {
      try {
        const p = photoByVisit.get(v.id);
        if (!p) { await publishPostForVisit(v.id); return; } // 写真なしでも記録は公開
        // 写真URLの取得を多段で試す: ①取り込み済みURL ②StorageのURL ③未アップならアップロード（完了時に投稿も更新される）
        if (p.remoteUrl) { await publishPostForVisit(v.id, null, p.remoteUrl); return; }
        const path = `users/${user.uid}/photos/${p.id}.jpg`;
        let url = '';
        try { url = await photoDownloadUrl(path); } catch { /* まだStorageに無い */ }
        if (url) await publishPostForVisit(v.id, null, url);
        else if (p.hasBlob) await uploadPhoto(p); // アップロード成功時にURL付きで投稿される
        else await publishPostForVisit(v.id); // 写真が取れなくても記録自体は公開
      } catch (e) { console.warn('投稿公開に失敗:', v.id, e); }
    });
  }

  // 写真があるのに公開投稿(publicPosts)に写真URLが付いていない記録を埋め直す。
  // 写真アップロードより先に投稿が公開されると写真URLが空のまま残り、相手のプロフィールで
  // 「写真があるのに表示されない」原因になる。自分の投稿のうちURLが空のものだけを対象に軽く直す。
  async function backfillPostPhotos() {
    if (!user) return;
    if (!Store.getProfile().username) return; // 公開名がなければ投稿自体が無い
    let snap;
    try { snap = await fb.fs.getDocs(fb.fs.query(fb.fs.collection(db, 'publicPosts'), fb.fs.where('uid', '==', user.uid))); }
    catch { return; }
    const missing = [];
    snap.forEach(d => { const p = d.data(); if (!p.photoUrl) missing.push(p.id); });
    if (!missing.length) return;
    // 訪問ID → 代表写真1枚
    const byVisit = new Map();
    for (const ph of await Store.allPhotos()) if (!byVisit.has(ph.visitId)) byVisit.set(ph.visitId, ph);
    for (const vid of missing) {
      const ph = byVisit.get(vid);
      if (!ph) continue; // その記録に写真が無いなら埋めようがない（そのまま）
      try {
        if (ph.remoteUrl) await publishPostForVisit(vid, null, ph.remoteUrl);
        else if (ph.hasBlob) await uploadPhoto(ph); // アップロード完了時に写真URL付きで再公開される
        else {
          const path = `users/${user.uid}/photos/${ph.id}.jpg`;
          const url = await photoDownloadUrl(path).catch(() => '');
          if (url) await publishPostForVisit(vid, path);
        }
      } catch (e) { console.warn('写真URLの埋め直しに失敗:', vid, e); }
    }
  }

  // フォロー中の人（自分を除く）の投稿を取得（地図の「フォロー中」用）
  async function fetchNetworkPosts() {
    await ensureLoaded();
    if (!user) return [];
    const ing = await fb.fs.getDocs(fb.fs.collection(db, 'follows', user.uid, 'following'));
    const set = new Set();
    ing.forEach(d => set.add(d.data().uid));
    set.delete(user.uid);
    const uids = [...set];
    if (!uids.length) return [];
    const posts = [];
    // 30人ずつのinクエリを並列で投げる（直列だとフォローが多いとき遅い）
    const jobs = [];
    for (let i = 0; i < uids.length; i += 30) {
      const batch = uids.slice(i, i + 30);
      jobs.push(fb.fs.getDocs(fb.fs.query(fb.fs.collection(db, 'publicPosts'), fb.fs.where('uid', 'in', batch))));
    }
    for (const snap of await Promise.all(jobs)) snap.forEach(d => posts.push(cleanPub(d.data())));
    return posts.filter(p => p.lat != null && p.lon != null);
  }

  // 指定ユーザー(uid)の公開投稿を新しい順に取得（プロフィールの写真グリッド用）
  async function fetchUserPosts(uid) {
    await ensureLoaded();
    if (!uid) return [];
    const q = fb.fs.query(fb.fs.collection(db, 'publicPosts'), fb.fs.where('uid', '==', uid));
    const snap = await fb.fs.getDocs(q);
    const posts = [];
    snap.forEach(d => posts.push(cleanPub(d.data())));
    posts.sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
    return posts;
  }

  // フォロー中（＋自分）の投稿を新しい順に取得
  async function fetchFeed() {
    await ensureLoaded();
    if (!user) return [];
    const followSnap = await fb.fs.getDocs(fb.fs.collection(db, 'follows', user.uid, 'following'));
    const uids = []; followSnap.forEach(d => uids.push(d.data().uid)); // フォロー中の人のみ（自分は含めない）
    if (!uids.length) return [];
    const posts = [];
    // Firestoreの in クエリは最大30件ずつ。orderByは付けずに取得しクライアントで並べ替え（索引不要）
    // 30人ずつのクエリは並列で投げる
    const jobs = [];
    for (let i = 0; i < uids.length; i += 30) {
      const batch = uids.slice(i, i + 30);
      jobs.push(fb.fs.getDocs(fb.fs.query(fb.fs.collection(db, 'publicPosts'), fb.fs.where('uid', 'in', batch))));
    }
    for (const snap of await Promise.all(jobs)) snap.forEach(d => posts.push(cleanPub(d.data())));
    posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return posts.slice(0, 60);
  }

  // ---------- 変更の随時ミラーリング（デバウンス） ----------
  const pending = new Map(); // key -> {kind, action, obj}
  let flushTimer = null;
  function onLocalChange(kind, action, obj) {
    if (!user) return;
    const key = kind + ':' + (obj.id || 'profile');
    const prev = pending.get(key);
    // v396: 写真の追加（put）がまだ送られていないうちの付け替え（meta）は、put に店・記録を写して put のまま送る
    // （以前は meta が put を置き換え、本体の無い・id の無い写真のメタがクラウドにできていた）
    if (prev && prev.action === 'put' && action === 'meta' && kind === 'photo') {
      prev.obj = { ...prev.obj, shopId: obj.shopId, visitId: obj.visitId, metaAt: obj.metaAt };
      clearTimeout(flushTimer); flushTimer = setTimeout(flush, 900);
      return;
    }
    pending.set(key, { kind, action, obj, uid: user.uid });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 900);
  }
  async function flush() {
    if (!user || !pending.size) return;
    const items = [...pending.values()]; pending.clear();
    setStatus('syncing');
    for (const it of items) {
      // v396: 送っている途中でアカウントが変わったら、残りを次の人の場所へ書かない（作った人の uid と比べる）
      if (!user || (it.uid && it.uid !== user.uid)) break;
      try { await applyOneToCloud(it); } catch (e) { console.warn('同期の反映に失敗:', it.kind, e); }
    }
    setStatus('synced');
  }

  // ---------- 自動バックアップ（記録＋写真の取りこぼし回収） ----------
  // 変更時のプッシュが電波状況などで失敗しても、次回起動まで放置せず、
  // アプリを開いている間に全件の差分バックアップで拾い直す。
  //  実行タイミング: 15分おき / アプリを前面に戻したとき / オフライン→オンライン復帰時
  //  （前回から2分以内なら間引く。ログイン中のみ）
  //  v359〜 記録（店・訪問・行きたい）もクラウドから取り込む。以前は押し上げだけで、別端末で付けた記録は
  //  再起動するまで届かなかった。写真は差分を最後まで取り込む
  // v394: 同期の排他。ログイン時の全同期（写真の取り込みまで）・sweep・引っ張って更新は同時に1つだけ走らせる
  // （以前はログイン直後の写真の取り込み中に前面復帰・オンライン復帰の sweep が重なり、同じ写真を二重に取り込んでいた）
  let syncRun = null, lastSweepAt = 0;
  function runExclusive(fn) {
    const p = (async () => { try { return await fn(); } finally { if (syncRun === p) syncRun = null; } })();
    syncRun = p;
    return p;
  }
  async function autoBackupSweep(force) {
    if (!user) return;
    if (syncRun) {
      if (!force) return;
      // 引っ張って更新は、走っている同期が終わるのを待ってから（長い写真の取り込み中は 8 秒で諦め、二重には走らせない）
      const cur = syncRun;
      await Promise.race([cur.catch(() => {}), new Promise(r => setTimeout(r, 8000))]);
      if (syncRun || !user) return;
    }
    if (!force && Date.now() - lastSweepAt < 2 * 60 * 1000) return;
    const uid = user.uid;
    return runExclusive(async () => {
      try {
        await retryDeletes();    // 通信切れなどで届かなかった削除をクラウドへ反映し直す
        const recs = await syncRecords(); // 取り込み＋全件の押し上げ（差分ではなく全件上書き＝確実）
        await cleanupAfterPull(); // v370〜。v396: 全件を読んだときだけ
        if (recs) App.refreshCurrent(); // 別端末からの記録をすぐ画面に
        assertUser(uid);
        const got = await syncPhotos(); // 写真はクラウドとの差分だけアップロード/取り込み
        lastSweepAt = Date.now();
        setStatus('synced');
        if (got) App.refreshCurrent(); // 別端末から届いた写真をすぐ画面に反映
      } catch (e) { console.warn('自動バックアップに失敗（次回に再試行）:', e); }
    });
  }
  // 端末で削除済み（墓標あり）の記録がクラウドに残っていれば削除する。控えと本体の両方が書けたときだけ墓標を消す
  async function retryDeletes() {
    if (!user) return;
    const uid = user.uid;
    const jobs = [];
    for (const kind of ['visit', 'shop', 'wish', 'photo']) for (const d of Store.deletedList(kind)) jobs.push([kind, d.id, d.at]);
    await runPool(jobs, 4, async ([kind, id, at]) => {
      try {
        assertUser(uid);
        await applyOneToCloud({ kind, action: 'del', obj: { id, delAt: at } });
        Store.clearDeleted(kind, id);
      } catch (e) { console.warn('削除の再送に失敗:', kind, id, e); }
    });
  }
  // 削除（del）は控え → 本体の順に書き、どちらかが失敗したら投げる（v394〜。呼び元は端末の墓標を残し、次の sweep の retryDeletes で再送する）。
  // 公開投稿・Storage の本体は、もう無いと権限エラー・not-found になるので従来どおり握りつぶす
  async function applyOneToCloud({ kind, action, obj }) {
    const delAt = Number(obj && obj.delAt) || Date.now();
    if (kind === 'shop') {
      if (action === 'del') { await putTombstone('shop', obj.id, delAt); return fb.fs.deleteDoc(dref('shops', obj.id)); }
      return fb.fs.setDoc(dref('shops', obj.id), clean(obj)).then(() => noteRemote('shop', obj));
    }
    if (kind === 'visit') {
      if (action === 'del') {
        await putTombstone('visit', obj.id, delAt);
        await fb.fs.deleteDoc(dref('visits', obj.id));
        await fb.fs.deleteDoc(fb.fs.doc(db, 'publicPosts', obj.id)).catch(() => {}); // フィード投稿も削除
        return;
      }
      await fb.fs.setDoc(dref('visits', obj.id), clean(obj)); noteRemote('visit', obj);
      // 保存と同時にフィード投稿も公開・更新（写真なしの記録も相手の地図の合算に届くように）
      await publishPostForVisit(obj.id).catch(() => {});
      return;
    }
    if (kind === 'wish') {
      // 行きたい店は公開プロフィールにも載せているため、変更が落ち着いたら公開側も更新する
      clearTimeout(wishPubTimer);
      wishPubTimer = setTimeout(() => publishPublicProfile().catch(() => {}), 3000);
      if (action === 'del') { await putTombstone('wish', obj.id, delAt); return fb.fs.deleteDoc(dref('wishes', obj.id)); }
      return fb.fs.setDoc(dref('wishes', obj.id), clean(obj)).then(() => noteRemote('wish', obj));
    }
    if (kind === 'profile') return fb.fs.setDoc(dref('meta', 'profile'), clean(obj));
    if (kind === 'photo') {
      if (action === 'del') {
        await putTombstone('photo', obj.id, delAt);
        await fb.fs.deleteDoc(dref('photos', obj.id));
        await fb.st.deleteObject(fb.st.ref(storage, `users/${user.uid}/photos/${obj.id}.jpg`)).catch(() => {});
        if (obj.visitId && Store.visits().some(v => v.id === obj.visitId)) await publishPostForVisit(obj.visitId).catch(() => {}); // 残った写真で投稿を出し直す（v366〜）
        return;
      }
      if (action === 'meta') { // 店の統合・写真の付け替えなど、メタ情報（店・訪問）だけの変更（v364〜）
        await fb.fs.setDoc(dref('photos', obj.id), clean({ id: obj.id, shopId: obj.shopId, visitId: obj.visitId, metaAt: Number(obj.metaAt) || Date.now() }), { merge: true }); // metaAt: 付け替えの時刻（v393〜 端末間で新しい方を採る）。v396: id も書く
        for (const vid of [obj.visitId, obj.prevVisitId]) if (vid && Store.visits().some(v => v.id === vid)) await publishPostForVisit(vid).catch(() => {});
        return;
      }
      return uploadPhoto(obj);
    }
  }

  // ---------- 公開プロフィール（SNS: @ユーザー名で他人が閲覧できる） ----------
  //  publicProfiles/{uid} : 誰でも読める公開情報（本人だけ書ける）
  //  usernames/{name}     : @ユーザー名 → uid の予約（一意性の確保・検索用）
  const normalizeHandle = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();

  // @ユーザー名を設定（重複チェック付き）→ 公開プロフィールも発行
  async function setUsername(rawName) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    const name = normalizeHandle(rawName);
    if (!/^[a-z0-9_]{3,20}$/.test(name)) throw new Error('3〜20文字の半角英数字と _ が使えます');
    const prev = Store.getProfile().username;
    await fb.fs.runTransaction(db, async (tx) => {
      const nameRef = fb.fs.doc(db, 'usernames', name);
      const snap = await tx.get(nameRef);
      if (snap.exists() && snap.data().uid !== user.uid) throw new Error('このユーザー名は既に使われています');
      tx.set(nameRef, { uid: user.uid });
      if (prev && prev !== name) tx.delete(fb.fs.doc(db, 'usernames', prev));
    });
    Store.setProfile({ username: name });
    await publishPublicProfile();
    publishAllPosts().catch(() => {}); // ユーザー名設定と同時に過去の記録もフィードへ
    return name;
  }

  // 現在のプロフィール内容を公開プロフィールとしてクラウドへ書き出す
  async function publishPublicProfile() {
    await ensureLoaded();
    if (!user) return;
    const p = Store.getProfile();
    if (!p.username) return;
    const shops = Store.shops();
    const top = [...shops]
      .sort((a, b) => Store.avgRating(b.id) - Store.avgRating(a.id))
      .slice(0, 12)
      .map(s => ({ name: s.name, rating: Store.avgRating(s.id), genre: s.shopGenre || '', city: s.city || '' }));
    // 行きたい店も公開する（プロフィールの「2人とも行きたい店」の照合用。店名・ジャンル・位置のみ）
    const wishPub = Store.wishes().slice(0, 200).map(w => ({
      name: w.name || '', genre: w.genre || '',
      lat: (w.lat != null ? w.lat : null), lon: (w.lon != null ? w.lon : null),
    }));
    const data = clean({
      uid: user.uid, username: p.username,
      displayName: p.name || 'BITEMAP', bio: p.bio || '',
      // アバターはデータURL（小さければ同梱。大きすぎる場合は省略）
      avatar: (p.avatar && p.avatar.length < 60000) ? p.avatar : '',
      shopCount: Number(shops.length) || 0, topShops: top, wishes: wishPub, updatedAt: Date.now(),
    });
    await fb.fs.setDoc(fb.fs.doc(db, 'publicProfiles', user.uid), data);
  }

  // ---------- SNS: ユーザー検索・フォロー ----------
  //  follows/{me}/following/{target}   : 自分がフォローしている相手
  //  followers/{target}/followers/{me}: 相手のフォロワーとしての自分（フォロワー一覧・件数用）

  // @ユーザー名の前方一致でユーザーを検索
  async function searchUsers(qStr) {
    await ensureLoaded();
    const term = normalizeHandle(qStr);
    if (!term) return [];
    const col = fb.fs.collection(db, 'publicProfiles');
    const qq = fb.fs.query(col, fb.fs.orderBy('username'),
      fb.fs.startAt(term), fb.fs.endAt(term + String.fromCharCode(0xf8ff)), fb.fs.limit(20));
    const snap = await fb.fs.getDocs(qq);
    const res = []; snap.forEach(d => res.push(cleanPub(d.data())));
    return res;
  }

  async function isFollowing(targetUid) {
    await ensureLoaded();
    if (!user) return false;
    const snap = await fb.fs.getDoc(fb.fs.doc(db, 'follows', user.uid, 'following', targetUid));
    return snap.exists();
  }
  async function follow(targetUid) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    if (targetUid === user.uid) throw new Error('自分はフォローできません');
    const now = Date.now();
    // 「フォロー中」と「フォロワー」の2つの書き込みは1つのバッチで（片方だけ残らないように）
    const batch = fb.fs.writeBatch(db);
    batch.set(fb.fs.doc(db, 'follows', user.uid, 'following', targetUid), { uid: targetUid, createdAt: now });
    batch.set(fb.fs.doc(db, 'followers', targetUid, 'followers', user.uid), { uid: user.uid, createdAt: now });
    await batch.commit();
    // 相手に「フォローされました」通知を作成（doc id = 自分のuid なので重複しない）。
    // すでにあれば作り直さない（外して再フォローするたびに未読へ戻さない）
    const notifRef = fb.fs.doc(db, 'notifications', targetUid, 'items', user.uid);
    const existing = await fb.fs.getDoc(notifRef).catch(() => null);
    if (existing && existing.exists()) return;
    const prof = Store.getProfile();
    await fb.fs.setDoc(notifRef, clean({
      type: 'follow', fromUid: user.uid, fromUsername: prof.username || '',
      fromDisplayName: prof.name || 'BITEMAP',
      fromAvatar: (prof.avatar && prof.avatar.length < 60000) ? prof.avatar : '',
      createdAt: now, read: false,
    })).catch((e) => console.warn('通知作成に失敗:', e));
  }
  async function unfollow(targetUid) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    const batch = fb.fs.writeBatch(db);
    batch.delete(fb.fs.doc(db, 'follows', user.uid, 'following', targetUid));
    batch.delete(fb.fs.doc(db, 'followers', targetUid, 'followers', user.uid));
    await batch.commit();
  }
  // フォロー数・フォロワー数
  async function followCounts(uid) {
    await ensureLoaded();
    const [ing, ers] = await Promise.all([
      fb.fs.getDocs(fb.fs.collection(db, 'follows', uid, 'following')),
      fb.fs.getDocs(fb.fs.collection(db, 'followers', uid, 'followers')),
    ]);
    return { following: ing.size, followers: ers.size };
  }
  // フォロー中／フォロワーの公開プロフィール一覧
  async function followProfiles(uid, type) {
    await ensureLoaded();
    const path = type === 'followers' ? ['followers', uid, 'followers'] : ['follows', uid, 'following'];
    const snap = await fb.fs.getDocs(fb.fs.collection(db, ...path));
    const uids = []; snap.forEach(d => uids.push(d.data().uid));
    const profs = await Promise.all(uids.map(async u => {
      const p = await fb.fs.getDoc(fb.fs.doc(db, 'publicProfiles', u));
      return p.exists() ? cleanPub(p.data()) : null;
    }));
    return profs.filter(Boolean);
  }

  // 写真の強制再同期: ローカル全写真をアップロードし直し、未取得の写真をダウンロード
  //  （Storageルール未設定で画像本体だけ欠けたケースの穴埋め用。メタ情報の有無に関わらず上げ直す）
  async function resyncPhotos(onProgress) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    // v396: ほかの同期（ログイン時・sweep）と重ねない
    if (syncRun) await syncRun.catch(() => {});
    return runExclusive(() => resyncPhotos0(onProgress));
  }
  async function resyncPhotos0(onProgress) {
    if (!user) throw new Error('ログインが必要です');
    setStatus('syncing');
    let up = 0, down = 0, fail = 0, error = null;
    const noteErr = (e) => { if (!error) error = (e && (e.code || e.message)) || String(e); };
    const report = (phase, i, total) => { if (onProgress) { try { onProgress({ phase, i, total, up, down, fail }); } catch { /* noop */ } } };
    try {
      // ローカルの全写真を強制アップロード（画像本体の欠損を埋める）。数件ずつ並列で実行し、
      // 投稿の公開は1枚ごとではなく訪問単位でまとめて行う（時間短縮）
      const localPhotos = (await Store.allPhotos()).filter(p => p.hasBlob); // URL参照のみの写真は上げ直し不要
      let doneUp = 0;
      const upVisits = new Set();
      await runPool(localPhotos, 3, async (p) => {
        try { await withTimeout(uploadPhoto(p, true), 25000, 'アップロード'); up++; upVisits.add(p.visitId); }
        catch (e) { fail++; noteErr(e); console.warn('再アップロード失敗:', p.id, e); }
        report('upload', ++doneUp, localPhotos.length);
      });
      await runPool([...upVisits], 4, (vid) => publishPostForVisit(vid, null).catch(() => {}));
      // クラウドにあってローカルに無い写真＋URL参照だけの写真を、実体ごと並列ダウンロード
      const metaSnap = await fb.fs.getDocs(cref('photos'));
      const metas = []; metaSnap.forEach(d => metas.push(d.data()));
      const localIds = await Store.photoIds();
      const urlOnly = new Set((await Store.allPhotos()).filter(p => !p.hasBlob).map(p => p.id));
      const gone = Store.deletedIds('photo'), ptombs = (lastTombs && lastTombs.photo) || new Map();
      const need = metas.filter(m => (!localIds.has(m.id) || urlOnly.has(m.id)) && !gone.has(m.id) && !ptombs.has(m.id)); // v395: 消した写真は取り直さない
      let doneDown = 0;
      await runPool(need, 5, async (m) => {
        try {
          const remoteUrl = await photoDownloadUrl(m.path);
          let blob = null;
          try { blob = await fetchPhotoBlob(remoteUrl); } catch { /* 実体が取れなければURL参照で表示 */ }
          await Store.putPhotoRaw({ id: m.id, shopId: m.shopId, visitId: m.visitId, type: m.type || 'dish', hash: m.hash || '', createdAt: m.createdAt || Date.now(), metaAt: Number(m.metaAt) || 0, remoteUrl, ...(blob ? { blob } : {}) });
          down++;
        } catch (e) { fail++; noteErr(e); console.warn('写真ダウンロード失敗:', m.id, e); }
        report('download', ++doneDown, need.length);
      });
      setStatus('synced');
      App.refreshCurrent();
    } catch (e) { setStatus('error', e); throw e; }
    return { up, down, fail, error };
  }

  // @ユーザー名から公開プロフィールを取得（未ログインでも閲覧可能）
  async function fetchPublicProfile(username) {
    await ensureLoaded();
    const name = normalizeHandle(username);
    if (!name) return null;
    const nameSnap = await fb.fs.getDoc(fb.fs.doc(db, 'usernames', name));
    if (!nameSnap.exists()) return null;
    const uid = nameSnap.data().uid;
    const pSnap = await fb.fs.getDoc(fb.fs.doc(db, 'publicProfiles', uid));
    if (!pSnap.exists()) return null;
    const prof = cleanPub(pSnap.data());
    if (Array.isArray(prof.wishes)) prof.wishes = prof.wishes.map(cleanPub);
    return prof;
  }

  return { init, login, logout, onStatus, getUser, isSupported,
    setUsername, publishPublicProfile, fetchPublicProfile, resyncPhotos,
    searchUsers, isFollowing, follow, unfollow, followCounts, followProfiles,
    fetchFeed, fetchNetworkPosts, fetchUserPosts, fetchNotifications, unreadNotifCount, markNotificationsRead,
    getLikeInfo, toggleLike, getComments, commentCount, addComment, deleteComment,
    publishPostForVisit, syncApiKeys, clearApiKeys, autoBackupSweep, syncPrefs,
    syncNow: () => autoBackupSweep(true), // 引っ張って更新（v363〜）
    syncFull: async () => { const t0 = Date.now(); lastFullPullAt = 0; await autoBackupSweep(true); return lastPullWasFull && lastFullPullAt >= t0; } }; // v396: 全件を読み直す（設定の「店の無い記録を掃除」の前）。読み直せたら true
})();
