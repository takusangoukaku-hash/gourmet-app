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
              .then(() => {
                App.refreshCurrent();
                // 投稿化は負荷が高いので1セッション1回だけ
                if (!postsPublishedThisSession) { postsPublishedThisSession = true; return publishAllPosts(); }
              })
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
  async function syncRecords() {
    await pullCollection('shops', 'shop');
    await pullCollection('visits', 'visit');
    await pullWishes();
    await pullProfile();
    await pushAllRecords();
  }

  // 行きたい店リスト: クラウド → ローカル（新しい方を採用）
  async function pullWishes() {
    try {
      const snap = await fb.fs.getDocs(cref('wishes'));
      const localMap = new Map(Store.rawWishes().map(w => [w.id, w]));
      snap.forEach(docSnap => {
        const remote = docSnap.data();
        const local = localMap.get(remote.id);
        if (!local || (remote.updatedAt || 0) >= (local.updatedAt || 0)) Store.applyRemote('wish', remote);
      });
    } catch (e) { console.warn('行きたい店の同期に失敗:', e); }
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
    for (const w of Store.rawWishes()) writes.push(['wishes', w.id, clean(w)]);
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

    // クラウドにあってローカルに無い写真 → 公開URLを取り込み（<img>で表示。CORS不要）
    for (const m of cloudMetas) {
      if (localIds.has(m.id)) continue;
      try {
        const remoteUrl = await photoDownloadUrl(m.path);
        await Store.putPhotoRaw({ id: m.id, shopId: m.shopId, visitId: m.visitId, type: m.type || 'dish', hash: m.hash || '', createdAt: m.createdAt || Date.now(), remoteUrl });
      } catch (e) { console.warn('写真URL取得失敗:', m.id, e); }
    }
    // ローカルにあってクラウドに無い写真 → アップロード
    const localPhotos = await Store.allPhotos();
    for (const p of localPhotos) {
      if (cloudIds.has(p.id) || !p.blob) continue; // 既にクラウド済み or URL参照のみは上げない
      try { await withTimeout(uploadPhoto(p), 25000, 'アップロード'); } catch (e) { console.warn('写真アップロード失敗:', p.id, e); }
    }
  }

  async function uploadPhoto(p) {
    const path = `users/${user.uid}/photos/${p.id}.jpg`;
    await fb.st.uploadBytes(fb.st.ref(storage, path), p.blob, { contentType: 'image/jpeg' });
    const { blob, ...meta } = p; // blobはStorageへ。Firestoreにはメタ情報のみ
    await fb.fs.setDoc(dref('photos', p.id), clean({ ...meta, path }));
    // フィード用の公開投稿も更新（@ユーザー名を設定している人のみ）
    try { await publishPostForVisit(p.visitId, path); } catch (e) { console.warn('投稿の公開に失敗:', e); }
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
    const post = clean({
      id: visitId, uid: user.uid, username: prof.username,
      displayName: prof.name || 'BITEMAP',
      avatar: (prof.avatar && prof.avatar.length < 60000) ? prof.avatar : '',
      shopName: shop.name || '', shopId: visit.shopId,
      rating: visit.rating || 0, genre: (visit.dishGenres || []).join('・'),
      comment: visit.comment || '', photoUrl,
      // 詳細表示・ナビ用の店舗情報
      shopGenre: shop.shopGenre || '', pref: shop.pref || '', city: shop.city || '',
      station: shop.station || '', address: shop.address || '',
      casual: shop.casual || 0, atmosphere: shop.atmosphere || 0, speed: shop.speed || 0,
      lat: (shop.lat != null ? shop.lat : null), lon: (shop.lon != null ? shop.lon : null),
      datetime: visit.datetime, createdAt: Date.now(),
    });
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
    const arr = []; snap.forEach(d => arr.push(Object.assign({ cid: d.id }, d.data())));
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
    const arr = []; snap.forEach(d => arr.push(d.data()));
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
    const photos = await Store.allPhotos();
    const seen = new Set();
    for (const p of photos) {
      if (seen.has(p.visitId)) continue; // 1訪問につき代表1枚
      seen.add(p.visitId);
      try {
        // 写真URLの取得を多段で試す: ①取り込み済みURL ②StorageのURL ③未アップならアップロード（完了時に投稿も更新される）
        if (p.remoteUrl) { await publishPostForVisit(p.visitId, null, p.remoteUrl); continue; }
        const path = `users/${user.uid}/photos/${p.id}.jpg`;
        let url = '';
        try { url = await photoDownloadUrl(path); } catch { /* まだStorageに無い */ }
        if (url) await publishPostForVisit(p.visitId, null, url);
        else if (p.blob) await uploadPhoto(p); // アップロード成功時にURL付きで投稿される
      } catch (e) { console.warn('投稿公開に失敗:', p.visitId, e); }
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
    for (let i = 0; i < uids.length; i += 30) {
      const batch = uids.slice(i, i + 30);
      const q = fb.fs.query(fb.fs.collection(db, 'publicPosts'), fb.fs.where('uid', 'in', batch));
      const snap = await fb.fs.getDocs(q);
      snap.forEach(d => posts.push(d.data()));
    }
    return posts.filter(p => p.lat != null && p.lon != null);
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
    for (let i = 0; i < uids.length; i += 30) {
      const batch = uids.slice(i, i + 30);
      const q = fb.fs.query(fb.fs.collection(db, 'publicPosts'), fb.fs.where('uid', 'in', batch));
      const snap = await fb.fs.getDocs(q);
      snap.forEach(d => posts.push(d.data()));
    }
    posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return posts.slice(0, 60);
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
    if (kind === 'visit') {
      if (action === 'del') {
        await fb.fs.deleteDoc(dref('visits', obj.id)).catch(() => {});
        await fb.fs.deleteDoc(fb.fs.doc(db, 'publicPosts', obj.id)).catch(() => {}); // フィード投稿も削除
        return;
      }
      return fb.fs.setDoc(dref('visits', obj.id), clean(obj));
    }
    if (kind === 'wish') return action === 'del' ? fb.fs.deleteDoc(dref('wishes', obj.id)).catch(() => {}) : fb.fs.setDoc(dref('wishes', obj.id), clean(obj));
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
    const data = clean({
      uid: user.uid, username: p.username,
      displayName: p.name || 'BITEMAP', bio: p.bio || '',
      // アバターはデータURL（小さければ同梱。大きすぎる場合は省略）
      avatar: (p.avatar && p.avatar.length < 60000) ? p.avatar : '',
      shopCount: shops.length, topShops: top, updatedAt: Date.now(),
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
    const res = []; snap.forEach(d => res.push(d.data()));
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
    await fb.fs.setDoc(fb.fs.doc(db, 'follows', user.uid, 'following', targetUid), { uid: targetUid, createdAt: now });
    await fb.fs.setDoc(fb.fs.doc(db, 'followers', targetUid, 'followers', user.uid), { uid: user.uid, createdAt: now });
    // 相手に「フォローされました」通知を作成（doc id = 自分のuid なので重複しない）
    const prof = Store.getProfile();
    await fb.fs.setDoc(fb.fs.doc(db, 'notifications', targetUid, 'items', user.uid), clean({
      type: 'follow', fromUid: user.uid, fromUsername: prof.username || '',
      fromDisplayName: prof.name || 'BITEMAP',
      fromAvatar: (prof.avatar && prof.avatar.length < 60000) ? prof.avatar : '',
      createdAt: now, read: false,
    })).catch((e) => console.warn('通知作成に失敗:', e));
  }
  async function unfollow(targetUid) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    await fb.fs.deleteDoc(fb.fs.doc(db, 'follows', user.uid, 'following', targetUid));
    await fb.fs.deleteDoc(fb.fs.doc(db, 'followers', targetUid, 'followers', user.uid));
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
      return p.exists() ? p.data() : null;
    }));
    return profs.filter(Boolean);
  }

  // 写真の強制再同期: ローカル全写真をアップロードし直し、未取得の写真をダウンロード
  //  （Storageルール未設定で画像本体だけ欠けたケースの穴埋め用。メタ情報の有無に関わらず上げ直す）
  async function resyncPhotos(onProgress) {
    await ensureLoaded();
    if (!user) throw new Error('ログインが必要です');
    setStatus('syncing');
    let up = 0, down = 0, fail = 0, error = null;
    const noteErr = (e) => { if (!error) error = (e && (e.code || e.message)) || String(e); };
    const report = (phase, i, total) => { if (onProgress) { try { onProgress({ phase, i, total, up, down, fail }); } catch { /* noop */ } } };
    try {
      // ローカルの全写真を強制アップロード（画像本体の欠損を埋める）。各処理はタイムアウト付き
      const localPhotos = (await Store.allPhotos()).filter(p => p.blob); // URL参照のみの写真は上げ直し不要
      for (let i = 0; i < localPhotos.length; i++) {
        try { await withTimeout(uploadPhoto(localPhotos[i]), 25000, 'アップロード'); up++; }
        catch (e) { fail++; noteErr(e); console.warn('再アップロード失敗:', localPhotos[i].id, e); }
        report('upload', i + 1, localPhotos.length);
      }
      // クラウドにあってローカルに無い写真をダウンロード
      const metaSnap = await fb.fs.getDocs(cref('photos'));
      const metas = []; metaSnap.forEach(d => metas.push(d.data()));
      const localIds = await Store.photoIds();
      const need = metas.filter(m => !localIds.has(m.id));
      for (let i = 0; i < need.length; i++) {
        const m = need[i];
        try {
          const remoteUrl = await photoDownloadUrl(m.path);
          await Store.putPhotoRaw({ id: m.id, shopId: m.shopId, visitId: m.visitId, type: m.type || 'dish', hash: m.hash || '', createdAt: m.createdAt || Date.now(), remoteUrl });
          down++;
        } catch (e) { fail++; noteErr(e); console.warn('URL取得失敗:', m.id, e); }
        report('download', i + 1, need.length);
      }
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
    return pSnap.exists() ? pSnap.data() : null;
  }

  return { init, login, logout, onStatus, getUser, isSupported,
    setUsername, publishPublicProfile, fetchPublicProfile, resyncPhotos,
    searchUsers, isFollowing, follow, unfollow, followCounts, followProfiles,
    fetchFeed, fetchNetworkPosts, fetchNotifications, unreadNotifCount, markNotificationsRead,
    getLikeInfo, toggleLike, getComments, commentCount, addComment, deleteComment };
})();
