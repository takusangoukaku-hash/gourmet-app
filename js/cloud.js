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
  let status = 'signedout'; // signedout | loading | syncing | synced | error
  const statusCbs = [];
  function setStatus(s, detail) { status = s; statusCbs.forEach(cb => { try { cb(s, user, detail); } catch { /* noop */ } }); }
  function onStatus(cb) { statusCbs.push(cb); cb(status, user); }
  const getUser = () => user;
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
      authM.onAuthStateChanged(auth, async (u) => {
        user = u;
        if (u) {
          Store.setSyncHook(onLocalChange);
          setStatus('syncing');
          try {
            // 記録（店・訪問・プロフィール）を先に同期し、この時点で「同期済み」にする
            await syncRecords();
            setStatus('synced');
            App.refreshCurrent();
            // 写真は容量が大きいのでバックグラウンドで取得（失敗しても同期状態は固めない）
            syncPhotos()
              .then(() => App.refreshCurrent())
              .catch(e => console.warn('写真同期に失敗:', e));
          } catch (e) { console.error('sync error:', e); setStatus('error', e); }
        } else {
          Store.setSyncHook(null);
          setStatus('signedout');
        }
      });
    })();
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
  }

  // ---------- Firestore ヘルパー ----------
  const dref = (name, id) => fb.fs.doc(db, 'users', user.uid, name, id);
  const cref = (name) => fb.fs.collection(db, 'users', user.uid, name);
  // Firestoreは undefined を受け付けないので、プレーンなデータへ整える（blob等も除去）
  const clean = (obj) => JSON.parse(JSON.stringify(obj));

  // ---------- 記録（店・訪問・プロフィール）の双方向同期 ----------
  async function syncRecords() {
    await pullCollection('shops', 'shop');
    await pullCollection('visits', 'visit');
    await pullProfile();
    await pushAllRecords();
  }

  // クラウド → ローカル（新しい方を採用）
  async function pullCollection(name, kind) {
    const snap = await fb.fs.getDocs(cref(name));
    const localMap = new Map((kind === 'shop' ? Store.rawShops() : Store.rawVisits()).map(x => [x.id, x]));
    snap.forEach(docSnap => {
      const remote = docSnap.data();
      const local = localMap.get(remote.id);
      if (!local || (remote.updatedAt || 0) >= (local.updatedAt || 0)) Store.applyRemote(kind, remote);
    });
  }
  async function pullProfile() {
    const snap = await fb.fs.getDoc(dref('meta', 'profile'));
    if (snap.exists()) {
      const remote = snap.data();
      const local = Store.getProfile();
      if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) Store.applyRemote('profile', remote);
    }
  }

  // ローカル → クラウド（全レコードをupsert）
  async function pushAllRecords() {
    const writes = [];
    for (const s of Store.rawShops()) writes.push(['shops', s.id, clean(s)]);
    for (const v of Store.rawVisits()) writes.push(['visits', v.id, clean(v)]);
    // 500件ずつバッチ書き込み（Firestoreの上限対策）
    for (let i = 0; i < writes.length; i += 400) {
      const batch = fb.fs.writeBatch(db);
      for (const [name, id, data] of writes.slice(i, i + 400)) batch.set(dref(name, id), data);
      await batch.commit();
    }
    await fb.fs.setDoc(dref('meta', 'profile'), clean(Store.getProfile()));
  }

  // 写真: クラウド↔ローカルの差分を埋める
  async function syncPhotos() {
    const metaSnap = await fb.fs.getDocs(cref('photos'));
    const cloudMetas = [];
    metaSnap.forEach(d => cloudMetas.push(d.data()));
    const cloudIds = new Set(cloudMetas.map(m => m.id));
    const localIds = await Store.photoIds();

    // クラウドにあってローカルに無い写真 → ダウンロードして端末へ復元
    for (const m of cloudMetas) {
      if (localIds.has(m.id)) continue;
      try {
        const bytes = await fb.st.getBytes(fb.st.ref(storage, m.path));
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        await Store.putPhotoRaw({ id: m.id, shopId: m.shopId, visitId: m.visitId, type: m.type || 'dish', hash: m.hash || '', createdAt: m.createdAt || Date.now(), blob });
      } catch (e) { console.warn('写真ダウンロード失敗:', m.id, e); }
    }
    // ローカルにあってクラウドに無い写真 → アップロード
    const localPhotos = await Store.allPhotos();
    for (const p of localPhotos) {
      if (cloudIds.has(p.id)) continue;
      try { await uploadPhoto(p); } catch (e) { console.warn('写真アップロード失敗:', p.id, e); }
    }
  }

  async function uploadPhoto(p) {
    const path = `users/${user.uid}/photos/${p.id}.jpg`;
    await fb.st.uploadBytes(fb.st.ref(storage, path), p.blob, { contentType: 'image/jpeg' });
    const { blob, ...meta } = p; // blobはStorageへ。Firestoreにはメタ情報のみ
    await fb.fs.setDoc(dref('photos', p.id), clean({ ...meta, path }));
  }

  // ---------- 変更の随時ミラーリング（デバウンス） ----------
  const pending = new Map(); // key -> {kind, action, obj}
  let flushTimer = null;
  function onLocalChange(kind, action, obj) {
    if (!user) return;
    pending.set(kind + ':' + (obj.id || 'profile'), { kind, action, obj });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 900);
  }
  async function flush() {
    if (!user || !pending.size) return;
    const items = [...pending.values()]; pending.clear();
    setStatus('syncing');
    for (const it of items) {
      try { await applyOneToCloud(it); } catch (e) { console.warn('同期の反映に失敗:', it.kind, e); }
    }
    setStatus('synced');
  }
  async function applyOneToCloud({ kind, action, obj }) {
    if (kind === 'shop') return action === 'del' ? fb.fs.deleteDoc(dref('shops', obj.id)) : fb.fs.setDoc(dref('shops', obj.id), clean(obj));
    if (kind === 'visit') return action === 'del' ? fb.fs.deleteDoc(dref('visits', obj.id)) : fb.fs.setDoc(dref('visits', obj.id), clean(obj));
    if (kind === 'profile') return fb.fs.setDoc(dref('meta', 'profile'), clean(obj));
    if (kind === 'photo') {
      if (action === 'del') {
        await fb.fs.deleteDoc(dref('photos', obj.id)).catch(() => {});
        await fb.st.deleteObject(fb.st.ref(storage, `users/${user.uid}/photos/${obj.id}.jpg`)).catch(() => {});
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
    const data = clean({
      uid: user.uid, username: p.username,
      displayName: p.name || 'BITEMAP', bio: p.bio || '',
      // アバターはデータURL（小さければ同梱。大きすぎる場合は省略）
      avatar: (p.avatar && p.avatar.length < 60000) ? p.avatar : '',
      shopCount: shops.length, topShops: top, updatedAt: Date.now(),
    });
    await fb.fs.setDoc(fb.fs.doc(db, 'publicProfiles', user.uid), data);
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
    return pSnap.exists() ? pSnap.data() : null;
  }

  return { init, login, logout, onStatus, getUser, isSupported,
    setUsername, publishPublicProfile, fetchPublicProfile };
})();
