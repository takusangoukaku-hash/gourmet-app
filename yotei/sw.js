// =====================================================
// 日程あわせ サービスワーカー（スコープ: /yotei/）
//  何もキャッシュしない。置いている理由は1つ: 同じサイトの BITEMAP 本体の Service Worker（スコープが上の階層）に
//  この画面を扱わせないため（より狭いスコープの SW が優先される）。fetch を扱わないので、通信はいつもネットワークへ行く。
// =====================================================
const VERSION = 'v4'; // 最初の画面に「最近の予定」を出さない ／ v3: 予定の人数を枠を作るときに入れられる（濃淡と「回答 n人／N人」の分母） ／ v2: // 結果の画面: 緑の濃淡（段階は回答人数から計算）・上位の日のチップ・下に固定の日の内訳
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('yotei-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
