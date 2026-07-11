// =====================================================
// アプリ全体の制御: タブ切り替え・共通イベント・サンプルデータ
// =====================================================
const App = (() => {
  const $ = (sel) => document.querySelector(sel);
  const APP_VERSION = 'v54'; // sw.js の VERSION・index.html の ?v= と合わせる
  let currentTab = 'register';

  function init() {
    Register.init();
    Views.initList();
    Views.initPhotos();
    Views.initProfile();

    // タブ切り替え
    document.querySelectorAll('#tabs .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        // 下のバー中央の＋（登録）はアプリ内カメラを開く（撮影→記録入力／×でプロフィールへ）
        if (btn.dataset.tab === 'register') { Register.openCamera(); return; }
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
      parts.push(Api.hasApiKey() ? '✅ Anthropicキー: 設定済み' : 'Anthropicキー: 未設定');
      parts.push(Api.hasGoogleKey() ? '✅ Googleキー: 設定済み' : 'Googleキー: 未設定');
      // 部品(api.js)のバージョンも表示: アプリと違えば古いキャッシュ混在のサイン
      const partVer = Api.FILE_VERSION || '旧';
      parts.push('アプリ ' + APP_VERSION + (partVer !== APP_VERSION ? '（⚠️部品 ' + partVer + '）' : ''));
      return parts.join(' ／ ');
    };
    // このアカウントに紐づくメールアドレスを表示（ログイン中のみ）
    const renderSettingsAccount = () => {
      const user = (typeof Cloud !== 'undefined') ? Cloud.getUser() : null;
      const box = $('#settings-account');
      box.innerHTML = '<span class="sa-icon">👤</span><div class="sa-main">'
        + '<div class="sa-label"></div><div class="sa-value"></div></div>';
      const label = box.querySelector('.sa-label');
      const value = box.querySelector('.sa-value');
      if (user) {
        label.textContent = 'ログイン中のアカウント';
        value.textContent = user.email || user.displayName || 'Googleアカウント';
      } else {
        label.textContent = 'アカウント';
        value.textContent = '未ログイン（プロフィール画面からログインできます）';
        value.style.fontWeight = '400'; value.style.color = 'var(--muted)';
      }
    };
    $('#settings-btn').addEventListener('click', () => {
      $('#settings-api-key').value = Api.getApiKey();
      $('#settings-google-key').value = Api.getGoogleKey();
      $('#settings-status').textContent = settingsStatus();
      renderSettingsAccount();
      $('#settings-modal').classList.remove('hidden');
    });
    $('#settings-save').addEventListener('click', () => {
      Api.setApiKey($('#settings-api-key').value.trim());
      Api.resetAnthropicClient();
      Api.setGoogleKey($('#settings-google-key').value.trim());
      $('#settings-modal').classList.add('hidden');
      toast('✅ 設定を保存しました。');
    });
    $('#settings-clear').addEventListener('click', () => {
      Api.setApiKey('');
      Api.resetAnthropicClient();
      Api.setGoogleKey('');
      $('#settings-api-key').value = '';
      $('#settings-google-key').value = '';
      $('#settings-status').textContent = settingsStatus();
      toast('APIキーを削除しました。');
    });

    // クラウド同期の初期化（既存ログインがあればセッションを復元して同期）
    if (typeof Cloud !== 'undefined') Cloud.init();

    // サービスワーカー登録（PWA: ホーム画面追加・オフライン起動）
    // ※ https または localhost でのみ有効。LANのhttpでは無視される
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        // 起動のたびに新バージョンを確認（PWAはこれをしないと古いSWが残り続ける）
        reg.update().catch(() => {});
        // 新しいSWに切り替わったら一度だけ自動リロードして、全ファイルを最新に揃える
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          location.reload();
        });
      }).catch(() => { /* 非対応環境では何もしない */ });
    }

    // 起動時: URLの?tab=指定 → データがあれば一覧 → なければ登録タブ
    const urlTab = new URLSearchParams(location.search).get('tab');
    switchTab(urlTab && document.querySelector('#view-' + urlTab)
      ? urlTab : (Store.shops().length ? 'list' : 'register'));
  }

  function switchTab(name) {
    currentTab = name;
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + name).classList.add('active');
    refreshCurrent();
  }

  function refreshCurrent() {
    if (currentTab === 'map') Views.refreshMap();
    else if (currentTab === 'list') Views.renderList();
    else if (currentTab === 'photos') Views.renderPhotos();
    else if (currentTab === 'profile') Views.renderProfile(); // 統計もプロフィール内で描画
  }

  // ---------- トースト ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
  }

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
    toast('✅ サンプルデータを登録しました');
    refreshCurrent();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { switchTab, refreshCurrent, toast, seedSample };
})();
