// =====================================================
// データ層: 店舗(Shop)/訪問記録(Visit) は localStorage、
// 写真は IndexedDB に保存する（仕様書v2 §2 のデータモデル）
//  - クラウド同期(Cloud)が購読できるよう、変更をemit()で通知する
//  - クラウドからの取り込みは applyRemote()/putPhotoRaw() で行い、通知しない（ループ防止）
// =====================================================
const Store = (() => {
  const SHOPS_KEY = 'gourmet.shops.v1';
  const VISITS_KEY = 'gourmet.visits.v1';
  const HASHES_KEY = 'gourmet.photoHashes.v1'; // 写真の指紋 → {shopId, visitId}（二重登録防止）
  const PROFILE_KEY = 'gourmet.profile.v1';    // プロフィール（将来の共有機能の土台）
  const WISHES_KEY = 'gourmet.wishes.v1';      // 行きたい店リスト
  const DELETED_KEY = 'gourmet.deleted.v1';    // 削除の記録（墓標）。同期で消したはずの記録が復活しないように
  const HITS_KEY = 'gourmet.hitLog.v1';        // 検索でタップした候補が、どの機能・どの情報源で見つかったかの記録
  const SOCIAL_KEYS = ['gourmet.feedCache', 'gourmet.netCache']; // 他人の投稿の控え（再取得できる一時データ）

  let shops = load(SHOPS_KEY);
  let visits = load(VISITS_KEY);
  let photoHashes = loadObj(HASHES_KEY);
  let wishes = load(WISHES_KEY);
  let deleted = load(DELETED_KEY);
  let hits = load(HITS_KEY);
  let rev = 0; // 保存のたびに増える版番号（画面側のキャッシュ判定用）

  // ---------- クラウド同期のための変更通知 ----------
  let syncHook = null;      // Cloud が購読する変更通知の関数
  let remoteApply = false;  // クラウドから取り込み中は通知しない（同期ループ防止）
  function setSyncHook(fn) { syncHook = fn; }
  function emit(kind, action, obj) {
    if (remoteApply || !syncHook) return;
    try { syncHook(kind, action, obj); } catch { /* 同期失敗はローカル動作に影響させない */ }
  }

  function loadObj(k) {
    try { const v = JSON.parse(localStorage.getItem(k)); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch { return {}; }
  }
  function persistHashes() {
    setItemSafe(HASHES_KEY, JSON.stringify(photoHashes));
  }

  function load(k) {
    try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  // localStorage への保存。容量超過のときは、再取得できる控え（他人の投稿）を捨てて空きを作り、
  // それでも入らなければ利用者に知らせて例外を投げる（黙って記録が消えないように）
  // v405: 端末の空きが足りないときのエラーか（localStorage・IndexedDB とも）。お知らせの文は1つにそろえる
  const QUOTA_MSG = '端末の空きが足りず保存できませんでした ・ 写真を減らすか、端末の空きを増やしてください';
  function isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError' || e.code === 22 || /quota|exceeded the quota|容量/i.test(String(e.message || ''));
  }
  function setItemSafe(k, v) {
    try { localStorage.setItem(k, v); return; }
    catch (e) {
      for (const c of SOCIAL_KEYS) { try { localStorage.removeItem(c); } catch { /* noop */ } }
      try { localStorage.setItem(k, v); return; }
      catch (e2) {
        try { App.toast(QUOTA_MSG, 6000); } catch { /* noop */ }
        throw e2;
      }
    }
  }
  function persist() {
    rev++;
    setItemSafe(SHOPS_KEY, JSON.stringify(shops));
    setItemSafe(VISITS_KEY, JSON.stringify(visits));
  }
  // ---------- 削除の記録（墓標） ----------
  // 削除がクラウドへ届く前に通信が切れても、次回の同期で「クラウドにだけ残っている記録」として
  // 復活しないように、削除した id を30日間覚えておく
  function persistDeleted() { try { setItemSafe(DELETED_KEY, JSON.stringify(deleted)); } catch { /* noop */ } }
  function markDeleted(kind, id) { markDeletedMany(kind, [id]); }
  // v396: まとめて控える（店や記録を消して写真が数百枚あると、1枚ごとに控え全体を書き直していた）
  function markDeletedMany(kind, ids) {
    const set = new Set((ids || []).filter(Boolean));
    if (!set.size) return;
    const now = Date.now(), cutoff = now - 30 * 24 * 3600 * 1000;
    deleted = deleted.filter(d => d && d.at > cutoff && !(d.kind === kind && set.has(d.id)));
    for (const id of set) deleted.push({ kind, id, at: now });
    persistDeleted();
  }
  const deletedIds = (kind) => new Set(deleted.filter(d => d && d.kind === kind).map(d => d.id));
  // v394: 削除した時刻つき（クラウドへの再送で控えの時刻を「今」に進めないため）
  const deletedList = (kind) => deleted.filter(d => d && d.kind === kind && d.id).map(d => ({ id: d.id, at: Number(d.at) || 0 }));
  function clearDeleted(kind, id) {
    const n = deleted.length;
    deleted = deleted.filter(d => !(d && d.kind === kind && d.id === id));
    if (deleted.length !== n) persistDeleted();
  }
  // ---------- 別タブ（ブラウザとインストール済みアプリ）との整合 ----------
  // 他方のタブが保存したら、こちらのメモリ上のデータも読み直す（古い内容で上書きしないため）
  let storageTimer = null;
  window.addEventListener('storage', (e) => {
    if (!e || !e.key) return;
    if (e.key === SHOPS_KEY) shops = load(SHOPS_KEY);
    else if (e.key === VISITS_KEY) visits = load(VISITS_KEY);
    else if (e.key === WISHES_KEY) wishes = load(WISHES_KEY);
    else if (e.key === HASHES_KEY) photoHashes = loadObj(HASHES_KEY);
    else if (e.key === DELETED_KEY) deleted = load(DELETED_KEY);
    else return;
    rev++;
    clearTimeout(storageTimer);
    storageTimer = setTimeout(() => { try { App.refreshCurrent(); } catch { /* noop */ } }, 300);
  });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  // ---------- IndexedDB（写真） ----------
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        // v2: 下書き(drafts)ストアを追加
        // v3: 写真のメタ情報(meta)とサムネイル(thumbs)を本体(photos)から分離。
        //     一覧の描画で全写真の本体（数十MB）を読まずに済むようにする（速度と省メモリ）
        // v4: 端末内の自動バックアップ(backups)ストアを追加（v379〜。週に1回、記録だけを最大4世代）
        const req = indexedDB.open('gourmet-photos', 4);
        req.onupgradeneeded = (ev) => {
          const d = req.result;
          const tx = req.transaction;
          if (!d.objectStoreNames.contains('photos')) {
            const os = d.createObjectStore('photos', { keyPath: 'id' });
            os.createIndex('visitId', 'visitId');
            os.createIndex('shopId', 'shopId');
          }
          if (!d.objectStoreNames.contains('drafts')) {
            d.createObjectStore('drafts', { keyPath: 'id' }); // 「あとで記録」の下書き（端末内のみ）
          }
          if (!d.objectStoreNames.contains('meta')) {
            const ms = d.createObjectStore('meta', { keyPath: 'id' });
            ms.createIndex('visitId', 'visitId');
            ms.createIndex('shopId', 'shopId');
          }
          if (!d.objectStoreNames.contains('thumbs')) d.createObjectStore('thumbs', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('backups')) d.createObjectStore('backups', { keyPath: 'at' });
          if (ev.oldVersion > 0 && ev.oldVersion < 3) {
            // 既存の写真からメタ情報とサムネイルを1回だけ分離する（本体はそのまま）
            const ps = tx.objectStore('photos'), ms = tx.objectStore('meta'), ts = tx.objectStore('thumbs');
            ps.openCursor().onsuccess = (e) => {
              const cur = e.target.result;
              if (!cur) return;
              const r = cur.value;
              ms.put(metaOf(r));
              if (r.thumb) ts.put({ id: r.id, blob: r.thumb, v: r.thumbV || 1 });
              cur.continue();
            };
          }
        };
        req.onsuccess = () => {
          const d = req.result;
          // v392〜 接続が切られたら（iOS が背面で閉じる・別タブの版上げ）次の呼び出しで開き直す。握ったままだと再起動まで写真の操作が全部失敗する
          d.onclose = () => { dbPromise = null; };
          d.onversionchange = () => { try { d.close(); } catch { /* noop */ } dbPromise = null; };
          resolve(d);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('写真データベースが他のタブで使用中です'));
      });
      // 失敗したときは次回の呼び出しで開き直せるようにする（失敗が固定化しないように）
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  // photo（本体 photos ストア） = { id, shopId, visitId, type('dish'|'exterior'|'interior'|'menu'), blob, hash, createdAt, remoteUrl? }
  // meta（一覧用 meta ストア）   = { id, shopId, visitId, type, hash, createdAt, remoteUrl?, hasBlob, thumbV, ar }
  // ar は写真の縦横比（縦/横）。Pinterest 風の並び替えに使う（v331〜）。保存時か、サムネ作成・表示時に埋まる（無ければ 0）
  // thumbs ストア                = { id, blob(サムネイル), v(規格バージョン) }
  // hash は圧縮前の元ファイルのSHA-256（同じ写真の二重登録を検出するための指紋）
  // 一覧・グリッドは meta だけを読み、本体は getPhotoBlob(id)、サムネイルは getThumb(id) で1枚ずつ取る
  function metaOf(r) {
    return { id: r.id, shopId: r.shopId, visitId: r.visitId, type: r.type || 'dish', hash: r.hash || '',
      createdAt: r.createdAt || 0, remoteUrl: r.remoteUrl || '', hasBlob: !!r.blob, thumbV: r.thumb ? (r.thumbV || 1) : (r.thumbV || 0),
      ar: Number(r.ar) || 0, metaAt: Number(r.metaAt) || 0 };
  }
  // 本体＋メタ情報を書く共通処理（既存のサムネイル情報は保つ）
  function writePhoto(rec, notify) {
    return db().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(['photos', 'meta'], 'readwrite');
      const ms = tx.objectStore('meta');
      const { thumb, thumbV, hasBlob, ...body } = rec; // 本体には一覧用の項目を持ち込まない
      tx.objectStore('photos').put(body);
      const req = ms.get(rec.id);
      req.onsuccess = () => {
        const prev = req.result;
        const m = metaOf(body);
        if (prev && prev.thumbV) m.thumbV = prev.thumbV;
        if (prev && prev.ar && !m.ar) m.ar = prev.ar;
        ms.put(m);
      };
      tx.oncomplete = () => {
        if (rec.hash) { photoHashes[rec.hash] = { shopId: rec.shopId, visitId: rec.visitId }; try { persistHashes(); } catch { /* noop */ } }
        if (notify) emit('photo', 'put', body); // クラウドへ（Cloud側でblobをStorageへアップロード）
        resolve(rec.id);
      };
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました'));
    }));
  }
  // ar（縦/横）は Api.compressImage() が blob.aspect に付けてくる（v331〜）。無ければ後でサムネ作成時に埋まる
  async function addPhoto(shopId, visitId, type, blob, hash, ar) {
    const rec = { id: uid(), shopId, visitId, type: type || 'dish', blob, hash: hash || '', createdAt: Date.now(),
      ar: Number(ar) || Number(blob && blob.aspect) || 0 };
    return writePhoto(rec, true);
  }
  // クラウドから取り込んだ写真をそのまま保存（通知しない）
  async function putPhotoRaw(rec) { await writePhoto(rec, false); }
  // v419: 写真の記録を1つの取引の中で読んで直して書く（付け替え・統合用）。以前は読む取引と書く取引が別で、
  //   その間に同期が本体（blob）を書き戻すと、本体の無い古い記録で上書きして本体が消えることがあった。
  //   fn(rec) が false を返したら書かない。直した記録（無ければ null）を返す
  function patchPhoto(id, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(['photos', 'meta'], 'readwrite');
      const ps = tx.objectStore('photos'), ms = tx.objectStore('meta');
      let out = null;
      const req = ps.get(id);
      req.onsuccess = () => {
        const rec = req.result;
        if (!rec || fn(rec) === false) return;
        const { thumb, thumbV, hasBlob, ...body } = rec;
        ps.put(body);
        out = body;
        const mreq = ms.get(id);
        mreq.onsuccess = () => {
          const prev = mreq.result;
          const m = metaOf(body);
          if (prev && prev.thumbV) m.thumbV = prev.thumbV;
          if (prev && prev.ar && !m.ar) m.ar = prev.ar;
          ms.put(m);
        };
      };
      tx.oncomplete = () => {
        if (out && out.hash) { photoHashes[out.hash] = { shopId: out.shopId, visitId: out.visitId }; try { persistHashes(); } catch { /* noop */ } }
        resolve(out);
      };
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました'));
    }));
  }
  // バックアップから復元した写真の登録時刻を元の値に戻す（並び順を保つため）
  async function setPhotoCreatedAt(id, createdAt) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(['photos', 'meta'], 'readwrite');
      for (const name of ['photos', 'meta']) {
        const os = tx.objectStore(name);
        const req = os.get(id);
        req.onsuccess = () => { const rec = req.result; if (rec) { rec.createdAt = createdAt; os.put(rec); } };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました'));
    });
  }
  // グリッド表示用のサムネイルを保存（次回から縮小画像を即表示できる）
  // thumbV はサムネの規格バージョン。表示側が規格を上げたとき古いサムネは作り直される
  async function putPhotoThumb(id, thumbBlob, thumbV, ar) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(['thumbs', 'meta'], 'readwrite');
      const ms = tx.objectStore('meta');
      const req = ms.get(id);
      // v396: 写真がもう無ければサムネも書かない（作っている間に消された写真のサムネが残り続けていた）
      req.onsuccess = () => { const m = req.result; if (m) { tx.objectStore('thumbs').put({ id, blob: thumbBlob, v: thumbV || 1 }); m.thumbV = thumbV || 1; if (Number(ar) > 0) m.ar = Number(ar); ms.put(m); } };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました'));
    });
  }
  // 写真の縦横比（縦/横）をメタ情報にだけ書く（表示時の後追い。クラウドへは通知しない。v331〜）
  async function setPhotoAspect(id, ar) {
    ar = Number(ar);
    if (!(ar > 0)) return;
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('meta', 'readwrite');
      const ms = tx.objectStore('meta');
      const req = ms.get(id);
      req.onsuccess = () => { const m = req.result; if (m && !m.ar) { m.ar = ar; ms.put(m); } };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました'));
    });
  }
  // 写真の店・訪問の付け替え（v364〜 店の統合がクラウド経由で届いたとき。通知は出さない）
  // metaAt: クラウドのメタの時刻（同じ値を控えて、次の同期で「こちらが新しい」と誤って押し返さないように）。省略時は今
  async function relinkPhoto(id, shopId, visitId, metaAt) {
    const rec = await patchPhoto(id, (r) => {
      if (r.shopId === shopId && (!visitId || r.visitId === visitId)) return false;
      r.shopId = shopId;
      if (visitId) r.visitId = visitId;
      r.metaAt = Number(metaAt) || Date.now();
    }).catch(() => null);
    return !!rec;
  }
  // 写真1枚を別の訪問・別の店へ付け替える（v366〜 投稿詳細の「…」から）。クラウドにはメタ情報だけ送り、前後の訪問の公開投稿を出し直す
  async function movePhoto(id, shopId, visitId) {
    if (!shopId || !visitId) return false;
    let prevVisitId = '';
    const rec = await patchPhoto(id, (r) => {
      prevVisitId = r.visitId;
      r.shopId = shopId; r.visitId = visitId; r.metaAt = Date.now(); // v392〜 付け替えの時刻（端末間で新しい方を採る）
    });
    if (!rec) return false;
    emit('photo', 'meta', { id, shopId, visitId, prevVisitId, metaAt: rec.metaAt });
    return true;
  }
  // 写真1枚だけ消す（訪問は残る）
  const deletePhoto = (id) => deletePhotosWhere(p => p.id === id);
  // サムネイル1枚（{ blob, v } か null）
  async function getThumb(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('thumbs').objectStore('thumbs').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  // 写真の本体1枚（Blob か null）。拡大表示・アップロード・書き出しのときだけ読む
  async function getPhotoBlob(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('photos').objectStore('photos').get(id);
      req.onsuccess = () => resolve((req.result && req.result.blob) || null);
      req.onerror = () => reject(req.error);
    });
  }
  // ---------- 下書き（「あとで記録」: 端末内のみ・クラウド非同期） ----------
  // draft = { id, createdAt, datetime, lat, lon, address, station, photos:[{blob, hash}] }
  async function addDraft(data) {
    const rec = Object.assign({ id: uid(), createdAt: Date.now() }, data);
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(rec);
      tx.oncomplete = () => resolve(rec.id);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました'));
    });
  }
  async function getDrafts() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('drafts').objectStore('drafts').getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }
  async function getDraft(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('drafts').objectStore('drafts').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function deleteDraft(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました'));
    });
  }
  async function draftCount() { return (await getDrafts()).length; }

  // v397: 写真1枚のメタ（無ければ null）。同期で取り込みを書く直前に今の値を読み直すため
  async function photoMeta(id) {
    const d = await db();
    return new Promise((resolve) => {
      const req = d.transaction('meta').objectStore('meta').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }
  async function photoIds() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('meta').objectStore('meta').getAllKeys();
      req.onsuccess = () => resolve(new Set(req.result || []));
      req.onerror = () => reject(req.error);
    });
  }
  // 指紋が一致する登録済み写真を探す（なければ null）
  const findPhotoByHash = (hash) => (hash && photoHashes[hash]) || null;
  // 全写真のメタ情報（本体は含まない。表示は getThumb / getPhotoBlob で1枚ずつ）
  // 生の一覧（削除の保留中のものも含む）。削除・掃除・統合のように「本当にあるもの」を相手にする処理はこちらを読む（v392〜）
  async function rawPhotos() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('meta').objectStore('meta').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function allPhotos() { return livePhotos(await rawPhotos()); }
  async function photosOfVisit(visitId) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('meta').objectStore('meta').index('visitId').getAll(visitId);
      req.onsuccess = () => resolve(livePhotos(req.result || []));
      req.onerror = () => reject(req.error);
    });
  }
  // ---------- 端末内の自動バックアップ（v379〜） ----------
  const BACKUP_KEEP = 4;
  async function putBackup(data) {
    const d = await db();
    const rec = { at: Date.now(), n: { shops: (data.shops || []).length, visits: (data.visits || []).length, wishes: (data.wishes || []).length }, data };
    await new Promise((resolve, reject) => { const tx = d.transaction('backups', 'readwrite'); tx.objectStore('backups').put(rec); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('写真の保存に失敗しました')); });
    const all = await listBackups();
    for (const b of all.slice(BACKUP_KEEP)) await new Promise((resolve) => { const tx = d.transaction('backups', 'readwrite'); tx.objectStore('backups').delete(b.at); tx.oncomplete = resolve; tx.onerror = resolve; });
    return rec.at;
  }
  async function listBackups() { // 新しい順。中身は含まない
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('backups').objectStore('backups').getAll();
      req.onsuccess = () => resolve((req.result || []).map(r => ({ at: r.at, n: r.n || {} })).sort((a, b) => b.at - a.at));
      req.onerror = () => reject(req.error);
    });
  }
  async function getBackup(at) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('backups').objectStore('backups').get(at);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }
  async function photosOfShop(shopId) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('meta').objectStore('meta').index('shopId').getAll(shopId);
      req.onsuccess = () => resolve(livePhotos(req.result || []));
      req.onerror = () => reject(req.error);
    });
  }
  // v392: 以前は allPhotos()（削除の保留中を除いた一覧）を読んでいたため、「元に戻す」の時間が過ぎて確定するとき、
  // 消す対象の写真そのものが見えず、何も消えていなかった（その場では隠れるが、再起動で戻り、クラウドからも消えない）。生の一覧を読む
  async function deletePhotosWhere(pred) {
    const all = await rawPhotos();
    const d = await db();
    const tx = d.transaction(['photos', 'meta', 'thumbs'], 'readwrite');
    const removed = [];
    for (const p of all) {
      if (pred(p)) { for (const n of ['photos', 'meta', 'thumbs']) tx.objectStore(n).delete(p.id); removed.push(p); }
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        // 削除が確定してから指紋を消す（失敗時に「写真は残っているのに再登録できる」状態を防ぐ）
        for (const p of removed) { if (p.hash) delete photoHashes[p.hash]; }
        if (removed.length) { try { persistHashes(); } catch { /* noop */ } }
        markDeletedMany('photo', removed.map(p => p.id));
        for (const p of removed) emit('photo', 'del', { id: p.id, hash: p.hash, visitId: p.visitId }); // visitId は公開投稿の出し直し用（v366〜）
        for (const p of removed) pendingDel.photo.delete(p.id); // 確定したので保留から外す
        resolve();
      };
      tx.onerror = tx.onabort = () => resolve();
    });
  }
  // 代表写真: 最新の訪問の写真（料理写真を優先）
  async function repPhoto(shopId) {
    const ps = await photosOfShop(shopId);
    if (!ps.length) return null;
    ps.sort((a, b) => b.createdAt - a.createdAt);
    return ps.find(p => p.type === 'dish') || ps[0];
  }

  // ---------- 店舗（Shop） ----------
  // shop = { id, name, address, lat, lon, country, pref, city, station,
  //          shopGenre, favorite, status, osmId, createdAt, updatedAt }
  function addShop(data) {
    const shop = Object.assign({
      id: uid(), name: '', address: '', lat: null, lon: null,
      country: '日本', pref: '', city: '', station: '',
      shopGenre: 'その他', favorite: false, status: 'open', osmId: '',
      // 店の性質の評価（1〜5、0 = 未評価）。訪問ごとではなく店舗に1つ
      casual: 0,      // カジュアル度（気軽に入れるか）
      atmosphere: 0,  // 雰囲気
      speed: 0,       // 提供の早さ
      createdAt: Date.now(), updatedAt: Date.now(),
    }, data);
    shops.push(shop);
    try { persist(); } catch (e) { shops.pop(); throw e; }
    emit('shop', 'put', shop);
    return shop;
  }
  function updateShop(id, patch) {
    const s = shops.find(x => x.id === id);
    if (s) { Object.assign(s, patch, { updatedAt: Date.now() }); persist(); emit('shop', 'put', s); }
    return s;
  }
  async function deleteShop(id) {
    const removedVisits = visits.filter(v => v.shopId === id);
    shops = shops.filter(s => s.id !== id);
    visits = visits.filter(v => v.shopId !== id);
    persist();
    markDeleted('shop', id);
    for (const v of removedVisits) markDeleted('visit', v.id);
    emit('shop', 'del', { id });
    for (const v of removedVisits) emit('visit', 'del', { id: v.id });
    for (const v of removedVisits) { try { undoWishForVisit(v.id); } catch { /* noop */ } pendingDel.visit.delete(v.id); } // v392〜 その訪問で達成になっていた行きたい店は未達成へ戻す（deleteVisit と同じ）
    await deletePhotosWhere(p => p.shopId === id);
  }
  const getShop = (id) => shops.find(s => s.id === id) || null;

  // 重複した店の統合（v364〜）: drop の訪問・写真を keep へ移し、keep の空いている項目を drop で補い、drop を削除する。
  // 写真はクラウドにはメタ情報（店の id）だけ更新する（本体は上げ直さない）
  async function getPhotoRec(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('photos').objectStore('photos').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function mergeShops(keepId, dropId) {
    const keep = getShop(keepId), drop = getShop(dropId);
    if (!keep || !drop || keepId === dropId) return null;
    const patch = {};
    for (const k of ['address', 'station', 'pref', 'city', 'osmId', 'country']) if (!keep[k] && drop[k]) patch[k] = drop[k];
    if ((!keep.shopGenre || keep.shopGenre === 'その他') && drop.shopGenre && drop.shopGenre !== 'その他') patch.shopGenre = drop.shopGenre;
    if (keep.lat == null && drop.lat != null) { patch.lat = drop.lat; patch.lon = drop.lon; if (drop.posLevel) patch.posLevel = drop.posLevel; }
    for (const k of ['casual', 'atmosphere', 'speed']) if (!keep[k] && drop[k]) patch[k] = drop[k];
    if (drop.favorite && !keep.favorite) patch.favorite = true;
    if (Object.keys(patch).length) updateShop(keepId, patch);
    for (const v of visits.filter(x => x.shopId === dropId)) updateVisit(v.id, { shopId: keepId });
    const metas = (await rawPhotos()).filter(m => m.shopId === dropId);
    for (const m of metas) {
      try {
        const rec = await patchPhoto(m.id, (r) => { r.shopId = keepId; r.metaAt = Date.now(); }); // v419: 読み書きを1つの取引で
        if (rec) emit('photo', 'meta', metaOf(rec));
      } catch { /* 下で残りを確かめる */ }
    }
    if (metas.length) { try { persistHashes(); } catch { /* noop */ } }
    // v392〜 drop で達成になっていた行きたい店は keep を指すように（一覧の「記録」ボタンが消えないように）
    let wishTouched = false;
    for (const w of wishes) if (w.doneShopId === dropId) { w.doneShopId = keepId; w.updatedAt = Date.now(); wishTouched = true; emit('wish', 'put', w); }
    if (wishTouched) persistWishes();
    // v392〜 読み書きに失敗して drop に残った写真があるなら drop は消さない（deleteShop は店の写真も消すため、移し損ねた写真が失われる）。
    // 訪問は keep へ移っているので、次の cleanupOrphans が写真を訪問の店へ付け替える
    const left = await rawPhotos().then(all => all.some(m => m.shopId === dropId)).catch(() => true);
    if (!left) await deleteShop(dropId); // 訪問・写真は移した後なので店だけ消える
    return getShop(keepId);
  }

  // 既存店舗との照合（外部ID → 名前＋距離50m以内）
  function matchShop({ osmId, name, lat, lon }) {
    if (osmId) { const m = shops.find(s => s.osmId === osmId); if (m) return m; }
    if (name && lat != null && lon != null) {
      return shops.find(s => s.name === name && s.lat != null &&
        distMeters(lat, lon, s.lat, s.lon) < 50) || null;
    }
    if (name) return shops.find(s => s.name === name) || null;
    return null;
  }
  function distMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---------- プロフィール ----------
  function getProfile() {
    try { return Object.assign({ name: 'BITEMAP', bio: '' }, JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}); }
    catch { return { name: 'BITEMAP', bio: '' }; }
  }
  function setProfile(patch) {
    const p = Object.assign(getProfile(), patch, { updatedAt: Date.now() });
    setItemSafe(PROFILE_KEY, JSON.stringify(p));
    emit('profile', 'put', p);
    return p;
  }

  // ---------- 行きたい店（Wish） ----------
  // wish = { id, name, lat, lon, genre, fromUsername, postId, createdAt, updatedAt,
  //          doneAt?, doneShopId?, doneVisitId? }
  // フォロー中の人の投稿から保存する「行きたい」。訪問を記録したら「達成」として残す（v303〜）。
  // 以前は訪問で自動的に消していたが、達成度（行けた数/保存した数）を見られるよう記録として保持する。
  // wishes() は未達成（まだ行っていない）だけを返す。達成済みも含めるときは allWishes()
  function persistWishes() { rev++; setItemSafe(WISHES_KEY, JSON.stringify(wishes)); }
  const isDone = (w) => !!(w && w.doneAt);
  // 同じ店の判定: 店名が同じ（空白・全角半角・大文字小文字は無視。v334〜）、または「100m以内 かつ 店名の一方が他方を含む」。
  // 位置だけで同一視すると、同じビルの別の店の「行きたい」を消してしまうため。未達成の中から探す
  const normName = (x) => String(x || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase().replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)); // v411: ひらがな→カタカナも
  function findWish({ name, lat, lon }) {
    const near = (w) => lat != null && lon != null && w.lat != null && w.lon != null && distMeters(lat, lon, w.lat, w.lon) < 100;
    const n = normName(name);
    const similar = (a, b) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));
    // v418: 外した直後（元に戻すの待ち）の行きたい店は見ない（以前は5秒以内に同じ店を入れ直すと、隠れたほうに重なって確定で消えた）
    return wishes.find(w => !isDone(w) && !pendingDel.wish.has(w.id) && ((n && normName(w.name) === n) || (near(w) && (!n || !w.name || similar(n, normName(w.name)))))) || null;
  }
  function addWish(data) {
    const dup = findWish(data);
    if (dup) return dup; // 同じ店（同名 or 100m以内）は二重登録しない
    const w = Object.assign({ id: uid(), createdAt: Date.now(), updatedAt: Date.now() }, data);
    delete w.doneAt; delete w.doneShopId; delete w.doneVisitId;
    wishes.push(w); persistWishes();
    emit('wish', 'put', w);
    return w;
  }
  // 行きたい店を達成にする（訪問の記録時に呼ぶ）。取り消しは undoWishForVisit
  function markWishDone(w, shopId, visitId, at) {
    Object.assign(w, { doneAt: at || Date.now(), doneShopId: shopId || '', doneVisitId: visitId || '', updatedAt: Date.now() });
    persistWishes();
    emit('wish', 'put', w);
  }
  // 達成のきっかけになった訪問を削除したら、その行きたい店を未達成に戻す
  function undoWishForVisit(visitId) {
    let n = 0;
    for (const w of wishes) {
      if (w.doneVisitId && w.doneVisitId === visitId) {
        // v418: 同じ店にまだ別の記録があれば、達成のままその記録（一番古いもの）に付け替える（以前は2回行った店でも最初の記録を消すと未達成に戻った）
        const alt = w.doneShopId ? visits.filter(v => v.shopId === w.doneShopId && v.id !== visitId)
          .sort((a, b) => (Date.parse(a.datetime) || 0) - (Date.parse(b.datetime) || 0))[0] : null;
        if (alt) {
          w.doneVisitId = alt.id;
          w.doneAt = Math.max(Date.parse(alt.datetime) || Date.now(), Number(w.createdAt) || 0);
        } else { delete w.doneAt; delete w.doneShopId; delete w.doneVisitId; }
        w.updatedAt = Date.now(); n++;
        emit('wish', 'put', w);
      }
    }
    if (n) persistWishes();
    return n;
  }
  // 達成度: { done, total, rate(0〜100) }。外した（削除した）行きたいは数えない
  function wishProgress(filterFn) {
    const live = pendingDel.wish.size ? wishes.filter(w => !pendingDel.wish.has(w.id)) : wishes; // v392〜 外した直後（元に戻すの待ち）のものは数えない
    const list = filterFn ? live.filter(filterFn) : live;
    const done = list.filter(isDone).length, total = list.length;
    return { done, total, rate: total ? Math.round(done / total * 100) : 0 };
  }
  // 達成を取り消して「行きたい」に戻す（v367〜）
  function undoWish(id) {
    const w = wishes.find(x => x.id === id);
    if (!w || !w.doneAt) return false;
    delete w.doneAt; delete w.doneShopId; delete w.doneVisitId;
    w.updatedAt = Date.now();
    persistWishes();
    emit('wish', 'put', w);
    return true;
  }
  function removeWish(id) {
    const w = wishes.find(x => x.id === id);
    if (!w) return;
    markDeleted('wish', id); // v419: 墓標を先に（一覧の保存が空き不足で失敗しても、後で保存されたときに墓標の無い削除にならない）
    wishes = wishes.filter(x => x.id !== id); persistWishes();
    emit('wish', 'del', { id });
    pendingDel.wish.delete(id);
  }

  // ---------- 訪問記録（Visit） ----------
  // visit = { id, shopId, datetime(ISO), dishGenres[], rating, comment, visitType, createdAt, updatedAt }
  function addVisit(data) {
    const visit = Object.assign({
      id: uid(), shopId: '', datetime: new Date().toISOString(),
      dishGenres: [], rating: 3, comment: '', visitType: '店内飲食',
      createdAt: Date.now(), updatedAt: Date.now(),
    }, data);
    visits.push(visit);
    try { persist(); } catch (e) { visits.pop(); throw e; }
    emit('visit', 'put', visit);
    // 行きたい店に入っていた店を訪問したら「達成」にする（リストからは消さず、達成度として残す）
    const s = getShop(visit.shopId);
    if (s) {
      const w = findWish({ name: s.name, lat: s.lat, lon: s.lon });
      const vAt = new Date(visit.datetime).getTime() || Date.now();
      if (w) {
        // v395: 達成の日は行きたい店に入れた日より前にしない（過去の写真の取り込みで「入れる前に達成」になっていた）
        try { markWishDone(w, s.id, visit.id, Math.max(vAt, Number(w.createdAt) || 0)); } catch { /* 達成の記録は任意 */ }
        // 店に位置が無く、行きたい店には位置がある → 行きたい店の位置を店に写す（地図にピンが出るように。v334〜）
        if (s.lat == null && w.lat != null && w.lon != null) {
          try { updateShop(s.id, Object.assign({ lat: w.lat, lon: w.lon }, !s.address && w.address ? { address: w.address } : {})); } catch { /* noop */ }
        }
      }
    }
    return visit;
  }
  function updateVisit(id, patch) {
    const v = visits.find(x => x.id === id);
    if (v) { Object.assign(v, patch, { updatedAt: Date.now() }); persist(); emit('visit', 'put', v); }
    return v;
  }
  async function deleteVisit(id) {
    visits = visits.filter(v => v.id !== id);
    persist();
    markDeleted('visit', id);
    emit('visit', 'del', { id });
    try { undoWishForVisit(id); } catch { /* noop */ }
    await deletePhotosWhere(p => p.visitId === id);
    pendingDel.visit.delete(id); // 確定したので保留から外す（v392〜）
  }
  // 削除の保留（v375〜）: 「削除」を押してから数秒は本当には消さず、一覧からだけ外す（トーストの「元に戻す」で戻せる）。
  // visits()/visitsOf()/wishes()/allPhotos()/photosOfVisit()/photosOfShop() が保留中のものを除く。確定は呼び元が deleteVisit 等を呼ぶ
  // v396: 削除の保留（元に戻すの 5 秒）は端末にも控える。その間にアプリを閉じた・新版へ切り替わった・iOS に落とされたとき、
  // 写真の削除（IndexedDB）が途中で止まったり、確定そのものが走らなかったりして、消したはずのものが次に開くと戻っていた。
  // 次の起動で控えに残っているものを確定する（その間も一覧からは外しておく）
  const PEND_KEY = 'gourmet.pendingDel.v1';
  let pendLoading = true;
  const savePend = () => {
    if (pendLoading) return;
    try {
      const list = [];
      for (const k of Object.keys(pendingDel)) for (const id of pendingDel[k]) list.push([k, id]);
      if (list.length) localStorage.setItem(PEND_KEY, JSON.stringify(list)); else localStorage.removeItem(PEND_KEY);
    } catch { /* noop */ }
  };
  class PendSet extends Set {
    add(v) { super.add(v); savePend(); return this; }
    delete(v) { const r = super.delete(v); if (r) savePend(); return r; }
    clear() { super.clear(); savePend(); }
  }
  const pendingDel = { visit: new PendSet(), photo: new PendSet(), wish: new PendSet() };
  {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(PEND_KEY) || '[]'); } catch { saved = []; }
    for (const e of Array.isArray(saved) ? saved : []) if (Array.isArray(e) && pendingDel[e[0]] && typeof e[1] === 'string') pendingDel[e[0]].add(e[1]);
    pendLoading = false;
    if (saved.length) {
      setTimeout(async () => {
        for (const id of [...pendingDel.wish]) { try { removeWish(id); } catch { /* noop */ } }
        for (const id of [...pendingDel.visit]) { try { await deleteVisit(id); } catch { /* noop */ } }
        for (const id of [...pendingDel.photo]) { try { await deletePhoto(id); } catch { /* noop */ } }
        pendingDel.photo.clear(); // 本体が無くて消えなかった id も残さない
        try { if (typeof App !== 'undefined' && App.refreshCurrent) App.refreshCurrent(); } catch { /* noop */ }
      }, 1500);
    }
  }
  const deferDelete = (kind, id) => { if (pendingDel[kind]) pendingDel[kind].add(id); };
  const undoDelete = (kind, id) => { if (pendingDel[kind]) pendingDel[kind].delete(id); };
  const isPending = (kind, id) => !!(pendingDel[kind] && pendingDel[kind].has(id));
  const liveVisits = () => (pendingDel.visit.size ? visits.filter(v => !pendingDel.visit.has(v.id)) : visits);
  const livePhotos = (arr) => (pendingDel.photo.size || pendingDel.visit.size ? arr.filter(p => !pendingDel.photo.has(p.id) && !pendingDel.visit.has(p.visitId)) : arr);
  const visitsOf = (shopId) =>
    liveVisits().filter(v => v.shopId === shopId).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

  // ---------- クラウドからの取り込み（通知しない） ----------
  // 新しい方（updatedAtが新しい）を採用してローカルへ反映する
  function applyRemote(kind, obj) {
    remoteApply = true;
    try {
      if (kind === 'shop') {
        const i = shops.findIndex(s => s.id === obj.id);
        if (i >= 0) shops[i] = obj; else shops.push(obj);
        persist();
      } else if (kind === 'visit') {
        const i = visits.findIndex(v => v.id === obj.id);
        if (i >= 0) visits[i] = obj; else visits.push(obj);
        persist();
      } else if (kind === 'profile') {
        setItemSafe(PROFILE_KEY, JSON.stringify(obj));
      } else if (kind === 'wish') {
        const i = wishes.findIndex(w => w.id === obj.id);
        if (i >= 0) wishes[i] = obj; else wishes.push(obj);
        persistWishes();
      }
    } finally { remoteApply = false; }
  }
  // v394: まとめて取り込む（1件ごとに localStorage へ書き出さない。店・訪問・行きたい）
  function applyRemoteMany(kind, list) {
    if (!list || !list.length) return;
    const arr = kind === 'shop' ? shops : kind === 'visit' ? visits : kind === 'wish' ? wishes : null;
    if (!arr) return;
    remoteApply = true;
    try {
      const idx = new Map(arr.map((x, i) => [x.id, i]));
      for (const obj of list) {
        const i = idx.get(obj.id);
        if (i != null) arr[i] = obj; else { idx.set(obj.id, arr.length); arr.push(obj); }
      }
      if (kind === 'wish') persistWishes(); else persist();
    } finally { remoteApply = false; }
  }

  // 店の無い訪問・訪問の無い写真を消す（v370〜。同期で記録を取り込んだ後と、設定の「店の無い記録を掃除」から）。
  // 消したものはクラウドにも伝える（通常の削除と同じ）
  // v392: 写真は「訪問があるのに店の id が違う／店が無い」なら訪問の店へ付け替える（消さない）。別端末で店を統合すると、訪問は
  // 残す店へ移って届くのに写真のメタは古い店のまま、という瞬間があり、以前はここで孤児として消して他の端末からも消えていた。
  // 消すのは訪問そのものが無い写真だけ。判定に使う一覧は写真を読んだ後に作る（読む前の控えだと、その間に保存した記録の写真を消してしまう）
  async function cleanupOrphans() {
    const shopIds0 = new Set(shops.map(s => s.id));
    const orphanVisits = visits.filter(v => !shopIds0.has(v.shopId));
    for (const v of orphanVisits) await deleteVisit(v.id);
    let relinked = 0;
    for (const p of await rawPhotos()) {
      const v = visits.find(x => x.id === p.visitId);
      if (v && p.shopId !== v.shopId && getShop(v.shopId)) { try { if (await relinkPhoto(p.id, v.shopId, v.id)) { relinked++; emit('photo', 'meta', { id: p.id, shopId: v.shopId, visitId: v.id, prevVisitId: v.id, metaAt: Date.now() }); } } catch { /* noop */ } }
    }
    const before = (await rawPhotos()).length;
    let vById = null;
    await deletePhotosWhere(p => {
      if (!vById) vById = new Map(visits.map(v => [v.id, v])); // 写真を読んだ後の、今の訪問
      return !vById.has(p.visitId);
    });
    const after = (await rawPhotos()).length;
    return { visits: orphanVisits.length, photos: before - after, relinked };
  }
  // 別端末での削除をこちらにも反映する（v365〜）。通知も墓標も出さず、他の記録へ波及させない
  // （店を消したときの訪問・写真は、それぞれの削除の控えで消える）。削除より後に直した記録は残す
  async function applyRemoteDelete(kind, id, at) {
    if (kind === 'photo') return removePhotoLocal(id);
    remoteApply = true;
    try {
      const newer = (r) => at && (r.updatedAt || 0) > at;
      if (kind === 'shop') { const s = shops.find(x => x.id === id); if (!s || newer(s)) return false; shops = shops.filter(x => x.id !== id); persist(); return true; }
      if (kind === 'visit') { const v = visits.find(x => x.id === id); if (!v || newer(v)) return false; visits = visits.filter(x => x.id !== id); persist(); return true; }
      if (kind === 'wish') { const w = wishes.find(x => x.id === id); if (!w || newer(w)) return false; wishes = wishes.filter(x => x.id !== id); persistWishes(); return true; }
      return false;
    } finally { remoteApply = false; }
  }
  async function removePhotoLocal(id) {
    const p = (await rawPhotos()).find(x => x.id === id);
    if (!p) return false;
    pendingDel.photo.delete(id);
    const d = await db();
    await new Promise((resolve) => {
      const tx = d.transaction(['photos', 'meta', 'thumbs'], 'readwrite');
      for (const n of ['photos', 'meta', 'thumbs']) tx.objectStore(n).delete(id);
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => resolve();
    });
    if (p.hash && photoHashes[p.hash]) { delete photoHashes[p.hash]; try { persistHashes(); } catch { /* noop */ } }
    return true;
  }

  // ---------- 検索ヒットの記録 ----------
  // entry = { t, flow('nearby'|'suggest'|'search'|'search-nearby'|'map'), source('openpoi'|'osm'|'yahoo'|…|'existing'),
  //           name, query, rank, auto(自動選択か), shopId? }。最新1,000件を端末に残す（情報源の有用性を後から比べるため）
  function addHit(entry) {
    const e = Object.assign({ t: Date.now() }, entry);
    hits.push(e);
    if (hits.length > 1000) hits = hits.slice(-1000);
    try { setItemSafe(HITS_KEY, JSON.stringify(hits)); } catch { /* 記録は任意 */ }
    return e;
  }
  const hitLog = () => hits.slice();
  // 情報源ごとの件数（設定画面の表示用）
  // 情報源ごとの件数。複数の情報源で見つかった候補は、それぞれに1件ずつ数える（合計は件数より多くなる。v317〜）
  function hitSummary() {
    const by = {};
    for (const h of hits) {
      const srcs = Array.isArray(h.sources) && h.sources.length ? h.sources : [h.source || '?'];
      for (const k of srcs) by[k] = (by[k] || 0) + 1;
    }
    return by;
  }
  function mergeHits(list) {
    const have = new Set(hits.map(h => h.t + '|' + (h.name || '')));
    let n = 0;
    for (const h of list) { const k = h.t + '|' + (h.name || ''); if (!have.has(k)) { hits.push(h); have.add(k); n++; } }
    hits.sort((a, b) => (a.t || 0) - (b.t || 0));
    if (hits.length > 1000) hits = hits.slice(-1000);
    try { setItemSafe(HITS_KEY, JSON.stringify(hits)); } catch { /* noop */ }
    return n;
  }

  // ---------- この端末のデータをすべて消す（別アカウントでのログイン時など） ----------
  // 記録・写真・指紋・プロフィール・行きたい・他人の投稿の控えを消す。APIキーの扱いは呼び出し側で
  async function wipeLocal() {
    for (const k of [SHOPS_KEY, VISITS_KEY, HASHES_KEY, PROFILE_KEY, WISHES_KEY, DELETED_KEY, HITS_KEY, ...SOCIAL_KEYS]) {
      try { localStorage.removeItem(k); } catch { /* noop */ }
    }
    // v392〜 前の利用者のものが残らないように: 端末内の自動バックアップ（復元すると前のアカウントの記録が入る）・現在地の控え・取り込みと統合の覚え書き
    for (const k of ['gourmet.lastPos', 'gourmet.lastAutoBackupAt', 'gourmet.lastBackupAt', 'gourmet.lastRestoreAt', 'gourmet.lastCleanup', 'gourmet.mergeIgnored', 'gourmet.importSkipped.v1']) {
      try { localStorage.removeItem(k); } catch { /* noop */ }
    }
    shops = []; visits = []; wishes = []; photoHashes = {}; deleted = []; hits = []; rev++;
    pendingDel.visit.clear(); pendingDel.photo.clear(); pendingDel.wish.clear();
    try {
      const d = await db();
      await new Promise((resolve) => {
        const names = ['photos', 'drafts', 'meta', 'thumbs', 'backups'].filter(n => d.objectStoreNames.contains(n));
        const tx = d.transaction(names, 'readwrite');
        for (const n of names) tx.objectStore(n).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => resolve();
      });
    } catch { /* IndexedDB が使えない環境では localStorage だけ消す */ }
  }

  // ---------- 集計（保存せず算出 — 仕様書v2 §2.3） ----------
  const visitCount = (shopId) => visitsOf(shopId).length;
  // 星0（評価なし。写真なしの「また来た」記録など）は平均に入れない
  function avgRating(shopId) {
    const rs = visitsOf(shopId).map(v => v.rating || 0).filter(r => r > 0);
    if (!rs.length) return 0;
    return Math.round(rs.reduce((s, r) => s + r, 0) / rs.length * 10) / 10;
  }
  function lastVisitDate(shopId) {
    const vs = visitsOf(shopId);
    return vs.length ? vs[0].datetime : null;
  }

  return {
    shops: () => shops.slice(), visits: () => liveVisits().slice(),
    deferDelete, undoDelete, isPending, // 削除の保留（v375〜）
    addShop, updateShop, deleteShop, getShop, matchShop, distMeters, mergeShops, cleanupOrphans,
    addVisit, updateVisit, deleteVisit, visitsOf,
    visitCount, avgRating, lastVisitDate,
    addPhoto, allPhotos, photosOfVisit, photosOfShop, repPhoto, findPhotoByHash, putPhotoThumb, setPhotoAspect, setPhotoCreatedAt, relinkPhoto, movePhoto, deletePhoto, getThumb, getPhotoBlob,
    addDraft, getDrafts, getDraft, deleteDraft, draftCount,
    getProfile, setProfile,
    wishes: () => wishes.filter(w => !isDone(w) && !pendingDel.wish.has(w.id)), allWishes: () => wishes.filter(w => !pendingDel.wish.has(w.id)), doneWishes: () => wishes.filter(w => isDone(w) && !pendingDel.wish.has(w.id)),
    addWish, removeWish, undoWish, findWish, wishProgress, undoWishForVisit,
    // クラウド同期用
    setSyncHook, applyRemote, applyRemoteMany, applyRemoteDelete, putPhotoRaw, photoIds, photoMeta,
    putBackup, listBackups, getBackup, // 端末内の自動バックアップ（v379〜）
    isQuotaError, QUOTA_MSG,
    rawShops: () => shops, rawVisits: () => visits, rawWishes: () => wishes,
    deletedIds, deletedList, clearDeleted, wipeLocal, rev: () => rev,
    addHit, hitLog, hitSummary, mergeHits,
  };
})();
