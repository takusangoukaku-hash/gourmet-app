// =====================================================
// 日程あわせ サービスワーカー（スコープ: /yotei/）
//  何もキャッシュしない。置いている理由は1つ: 同じサイトの BITEMAP 本体の Service Worker（スコープが上の階層）に
//  この画面を扱わせないため（より狭いスコープの SW が優先される）。fetch を扱わないので、通信はいつもネットワークへ行く。
// =====================================================
const VERSION = 'v1'; // 最初の版
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('yotei-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
