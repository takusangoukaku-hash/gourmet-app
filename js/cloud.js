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
      fb = { app: appM, auth: authM, fs: fsM, st: stM };
      // リダイレクト方式ログインの戻り（インストール済みPWA等）を回収
      authM.getRedirectResult(auth).catch(() => { /* 未使用時は無視 */ });
      authM.onAuthStateChanged(auth, async (u) => {
        user = u;
        if (u) {
          Store.setSyncHook(onLocalChange);
          setStatus('syncing');
          try { await fullSync(); setStatus('synced'); }
          catch (e) { console.error('sync error:', e); setStatus('error', e); }
          App.refreshCurrent();
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

  // ---------- 初回・ログイン時の全同期（双方向） ----------
  async function fullSync() {
    await pullCollection('shops', 'shop');
    await pullCollection('visits', 'visit');
    await pullProfile();
    await pushAllRecords();
    await syncPhotos();
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

  return { init, login, logout, onStatus, getUser, isSupported };
})();
