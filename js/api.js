// =====================================================
// 外部サービス連携（仕様書v2 §1.1 / §15）
//  - 周辺店舗検索・最寄駅: Overpass API (OpenStreetMap)
//  - 逆ジオコーディング・地名検索: Nominatim
//  - EXIF解析: exifr
//  - 料理ジャンルのAI判定: Claude API（APIキー設定時）
//  - フォールバック: OSMのcuisine/amenityタグから推定
// =====================================================
const Api = (() => {

  // 食べログのジャンル体系に準拠した料理ジャンル
  // 料理ジャンル: カテゴリ → ジャンルの2段階（選択UIもこの構造で表示）
  const DISH_CATEGORIES = [
    { name: '麺類', genres: ['ラーメン', 'つけ麺', '油そば・まぜそば', '担々麺', '焼きそば', 'うどん', 'そば', 'パスタ'] },
    { name: '和食', genres: ['寿司', '海鮮・魚介', '海鮮丼', '日本料理', '天ぷら', 'とんかつ', '串揚げ', '焼鳥', 'うなぎ',
      'お好み焼き', 'たこ焼き', 'もんじゃ焼き', '鍋', 'もつ鍋', 'しゃぶしゃぶ', 'すき焼き', 'おでん',
      '釜飯', '郷土料理', '沖縄料理', '定食', '弁当', '丼もの', '牛丼', '親子丼'] },
    { name: '肉料理', genres: ['焼肉', 'ホルモン', 'ジンギスカン', 'ステーキ', 'ハンバーグ'] },
    { name: '中華', genres: ['中華料理', 'チャーハン', '餃子', '小籠包'] },
    { name: 'アジア', genres: ['韓国料理', 'タイ料理', 'ベトナム料理', 'インド料理', 'エスニック'] },
    { name: 'カレー', genres: ['カレー', 'スープカレー'] },
    { name: '洋食', genres: ['イタリアン', 'ピザ', 'フレンチ', 'スペイン料理', '洋食', 'ハンバーガー', 'サンドイッチ', 'パン'] },
    { name: 'カフェ・スイーツ', genres: ['カフェメニュー', 'パンケーキ', 'ケーキ', 'パフェ', 'クレープ', 'アイス・ジェラート',
      'ドーナツ', 'かき氷', '和菓子', 'タピオカ', 'スイーツ', 'ドリンク'] },
    { name: 'その他', genres: ['ビュッフェ', 'その他'] },
  ];
  const DISH_GENRES = DISH_CATEGORIES.flatMap(c => c.genres);

  // 2段階ジャンル選択UI（カテゴリ → ジャンル）。selected は Set<string>
  // 初期状態はカテゴリのみを全件表示し、タップしたカテゴリのジャンルを展開する
  function buildGenrePicker(container, selected) {
    let active = null; // null = どのカテゴリも開いていない
    const escH = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const render = () => {
      container.innerHTML =
        '<div class="cat-chips">' + DISH_CATEGORIES.map((c, i) => {
          const count = c.genres.filter(g => selected.has(g)).length;
          return `<button type="button" class="chip cat${c === active ? ' on' : ''}" data-ci="${i}" data-cat="${escH(c.name)}">${escH(c.name)}${count ? `<span class="cat-count">${count}</span>` : ''}</button>`;
        }).join('') + '</div>' +
        (active
          ? '<div class="chips genre-chips">' + active.genres.map(g =>
              `<button type="button" class="chip${selected.has(g) ? ' on' : ''}" data-g="${escH(g)}">${escH(g)}</button>`).join('') + '</div>'
          : '') +
        (selected.size ? `<div class="sel-genres">選択中: ${[...selected].map(escH).join('・')}</div>` : '');
    };
    container.onclick = (e) => {
      const cat = e.target.closest('.chip.cat');
      if (cat) {
        // 文字列一致ではなく番号で照合（端末による文字の扱い差の影響を受けない）
        const c = DISH_CATEGORIES[Number(cat.dataset.ci)] || null;
        active = (c === active) ? null : c; // 同じカテゴリを再タップで閉じる
        render();
        return;
      }
      const chip = e.target.closest('.chip[data-g]');
      if (chip) {
        const g = chip.dataset.g;
        if (selected.has(g)) selected.delete(g); else selected.add(g);
        render();
      }
    };
    render();
    // reset(): カテゴリを閉じた初期状態に戻して再描画
    return { render, reset: () => { active = null; render(); } };
  }
  const SHOP_GENRES = ['ラーメン店', '焼肉店', '寿司店', '中華料理店', 'イタリアン',
    'カフェ', '居酒屋', 'ファミリーレストラン', 'バー', 'その他'];

  const CUISINE_MAP = {
    ramen: { dish: 'ラーメン', shop: 'ラーメン店' },
    noodle: { dish: 'ラーメン', shop: 'ラーメン店' },
    udon: { dish: 'うどん', shop: 'その他' },
    soba: { dish: 'そば', shop: 'その他' },
    sushi: { dish: '寿司', shop: '寿司店' },
    seafood: { dish: '海鮮・魚介', shop: 'その他' },
    fish: { dish: '海鮮・魚介', shop: 'その他' },
    yakiniku: { dish: '焼肉', shop: '焼肉店' },
    barbecue: { dish: '焼肉', shop: '焼肉店' },
    korean: { dish: '韓国料理', shop: 'その他' },
    thai: { dish: 'タイ料理', shop: 'その他' },
    vietnamese: { dish: 'ベトナム料理', shop: 'その他' },
    indian: { dish: 'インド料理', shop: 'その他' },
    chinese: { dish: '中華料理', shop: '中華料理店' },
    gyoza: { dish: '餃子', shop: '中華料理店' },
    italian: { dish: 'パスタ', shop: 'イタリアン' },
    pasta: { dish: 'パスタ', shop: 'イタリアン' },
    pizza: { dish: 'ピザ', shop: 'イタリアン' },
    french: { dish: 'フレンチ', shop: 'その他' },
    spanish: { dish: 'スペイン料理', shop: 'その他' },
    steak_house: { dish: 'ステーキ', shop: 'その他' },
    steak: { dish: 'ステーキ', shop: 'その他' },
    curry: { dish: 'カレー', shop: 'その他' },
    burger: { dish: 'ハンバーガー', shop: 'その他' },
    sandwich: { dish: 'サンドイッチ', shop: 'カフェ' },
    kebab: { dish: 'エスニック', shop: 'その他' },
    yakitori: { dish: '焼鳥', shop: '居酒屋' },
    tempura: { dish: '天ぷら', shop: 'その他' },
    tonkatsu: { dish: 'とんかつ', shop: 'その他' },
    unagi: { dish: 'うなぎ', shop: 'その他' },
    eel: { dish: 'うなぎ', shop: 'その他' },
    okonomiyaki: { dish: 'お好み焼き', shop: 'その他' },
    takoyaki: { dish: 'たこ焼き', shop: 'その他' },
    hot_pot: { dish: '鍋', shop: 'その他' },
    coffee_shop: { dish: 'カフェメニュー', shop: 'カフェ' },
    dessert: { dish: 'スイーツ', shop: 'カフェ' },
    ice_cream: { dish: 'アイス・ジェラート', shop: 'カフェ' },
    cake: { dish: 'ケーキ', shop: 'カフェ' },
    crepe: { dish: 'クレープ', shop: 'カフェ' },
    donut: { dish: 'ドーナツ', shop: 'カフェ' },
    pancake: { dish: 'パンケーキ', shop: 'カフェ' },
    bubble_tea: { dish: 'タピオカ', shop: 'カフェ' },
    japanese: { dish: '定食', shop: 'その他' },
    donburi: { dish: '丼もの', shop: 'その他' },
    beef_bowl: { dish: '牛丼', shop: 'その他' },
    buffet: { dish: 'ビュッフェ', shop: 'ファミリーレストラン' },
  };
  const AMENITY_SHOP = {
    cafe: 'カフェ', bar: 'バー', pub: '居酒屋', izakaya: '居酒屋',
    fast_food: 'その他', restaurant: 'その他', food_court: 'その他', ice_cream: 'カフェ',
  };

  // ---------- 写真の指紋（二重登録防止） ----------
  // 元ファイルのSHA-256（16進文字列）。https/localhost以外では計算不可なので空を返す
  async function fileHash(file) {
    try {
      if (!crypto.subtle) return '';
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { return ''; }
  }

  // ---------- EXIF ----------
  async function parseExif(file) {
    try {
      const ex = await exifr.parse(file);
      if (!ex) return {};
      return {
        lat: (typeof ex.latitude === 'number') ? ex.latitude : null,
        lon: (typeof ex.longitude === 'number') ? ex.longitude : null,
        date: ex.DateTimeOriginal || ex.CreateDate || null,
      };
    } catch { return {}; }
  }

  // ---------- Overpass 共通（本家が混雑・レート制限時はミラーへフォールバック） ----------
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  async function overpass(query, abortMs, endpoints) {
    let lastErr;
    for (const url of (endpoints || OVERPASS_ENDPOINTS)) {
      const ctrl = abortMs ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), abortMs) : null;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (res.ok) { if (timer) clearTimeout(timer); return await res.json(); }
        lastErr = new Error('Overpass error ' + res.status);
      } catch (e) { lastErr = e; }
      finally { if (timer) clearTimeout(timer); }
    }
    throw lastErr;
  }

  // ---------- Overpass: 周辺の飲食店 ----------
  async function nearbyShops(lat, lon, radius = 200) {
    const q = `[out:json][timeout:15];
(
  nwr(around:${radius},${lat},${lon})[amenity~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream)$"];
  nwr(around:${radius},${lat},${lon})[shop~"^(bakery|confectionery|deli|pastry)$"];
);
out center 40;`;
    const json = await overpass(q);
    return (json.elements || []).map(e => {
      const la = e.lat != null ? e.lat : (e.center && e.center.lat);
      const lo = e.lon != null ? e.lon : (e.center && e.center.lon);
      const t = e.tags || {};
      return {
        osmId: e.type + '/' + e.id,
        name: t['name:ja'] || t.name || '(名称不明)',
        lat: la, lon: lo,
        cuisine: t.cuisine || '',
        amenity: t.amenity || t.shop || '',
        distance: (la != null) ? Store.distMeters(lat, lon, la, lo) : Infinity,
      };
    }).filter(s => s.lat != null && s.name !== '(名称不明)')
      .sort((a, b) => a.distance - b.distance);
  }

  // ---------- Overpass: 最寄駅 ----------
  async function nearestStation(lat, lon) {
    const q = `[out:json][timeout:15];node(around:2000,${lat},${lon})[railway=station];out 30;`;
    try {
      const json = await overpass(q);
      const st = (json.elements || [])
        .map(e => ({
          name: (e.tags && (e.tags['name:ja'] || e.tags.name)) || '',
          d: Store.distMeters(lat, lon, e.lat, e.lon),
        }))
        .filter(s => s.name)
        .sort((a, b) => a.d - b.d)[0];
      if (!st) return '';
      return st.name.endsWith('駅') ? st.name : st.name + '駅';
    } catch { return ''; }
  }

  // ISO 3166-2コード → 都道府県名（東京23区などでNominatimが都道府県名を返さないため）
  const PREF_BY_ISO = {
    'JP-01': '北海道', 'JP-02': '青森県', 'JP-03': '岩手県', 'JP-04': '宮城県', 'JP-05': '秋田県',
    'JP-06': '山形県', 'JP-07': '福島県', 'JP-08': '茨城県', 'JP-09': '栃木県', 'JP-10': '群馬県',
    'JP-11': '埼玉県', 'JP-12': '千葉県', 'JP-13': '東京都', 'JP-14': '神奈川県', 'JP-15': '新潟県',
    'JP-16': '富山県', 'JP-17': '石川県', 'JP-18': '福井県', 'JP-19': '山梨県', 'JP-20': '長野県',
    'JP-21': '岐阜県', 'JP-22': '静岡県', 'JP-23': '愛知県', 'JP-24': '三重県', 'JP-25': '滋賀県',
    'JP-26': '京都府', 'JP-27': '大阪府', 'JP-28': '兵庫県', 'JP-29': '奈良県', 'JP-30': '和歌山県',
    'JP-31': '鳥取県', 'JP-32': '島根県', 'JP-33': '岡山県', 'JP-34': '広島県', 'JP-35': '山口県',
    'JP-36': '徳島県', 'JP-37': '香川県', 'JP-38': '愛媛県', 'JP-39': '高知県', 'JP-40': '福岡県',
    'JP-41': '佐賀県', 'JP-42': '長崎県', 'JP-43': '熊本県', 'JP-44': '大分県', 'JP-45': '宮崎県',
    'JP-46': '鹿児島県', 'JP-47': '沖縄県',
  };

  // ---------- Nominatim: 逆ジオコーディング ----------
  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ja&zoom=18`);
      if (!res.ok) return {};
      const j = await res.json();
      const a = j.address || {};
      const address = (j.display_name || '').split(', ').reverse()
        .filter(p => p !== '日本' && !/^\d{3}-\d{4}$/.test(p)).join('');
      return {
        address,
        country: a.country || '日本',
        pref: a.province || a.state || a.region || PREF_BY_ISO[a['ISO3166-2-lvl4']] || '',
        city: a.city || a.town || a.village || a.municipality || a.county || '',
      };
    } catch { return {}; }
  }

  // ---------- Overpass: 周辺の店名部分一致検索（個人店に強い） ----------
  function escapeOverpassRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"');
  }
  async function overpassNameSearch(name, lat, lon, radius = 4000) {
    const n = escapeOverpassRegex(name.trim());
    if (!n) return [];
    // 重要: amenityは等価フィルタで（正規表現だとクエリプランが崩れ
    // サーバー側タイムアウト→空配列が返る）。node限定・半径4kmで20〜30秒
    // 後追い表示専用なので長めに待つ。ミラーはこのクエリに弱いため本家のみ
    const q = `[out:json][timeout:25];
(
node(around:${radius},${lat},${lon})[amenity=restaurant][name~"${n}"];
node(around:${radius},${lat},${lon})[amenity=fast_food][name~"${n}"];
node(around:${radius},${lat},${lon})[amenity=cafe][name~"${n}"];
);
out center 25;`;
    const json = await overpass(q, 40000, [OVERPASS_ENDPOINTS[0]]);
    return (json.elements || []).map(e => {
      const la = e.lat != null ? e.lat : (e.center && e.center.lat);
      const lo = e.lon != null ? e.lon : (e.center && e.center.lon);
      const t = e.tags || {};
      return {
        osmId: e.type + '/' + e.id,
        name: t['name:ja'] || t.name || '(名称不明)',
        lat: la, lon: lo,
        cuisine: t.cuisine || '',
        amenity: t.amenity || t.shop || '',
        address: '',
        distance: (la != null) ? Store.distMeters(lat, lon, la, lo) : null,
      };
    }).filter(s => s.lat != null && s.name !== '(名称不明)');
  }

  // ---------- Photon: あいまい一致に強いOSM検索 ----------
  async function photonSearch(query, lat, lon) {
    let url = 'https://photon.komoot.io/api/?limit=12&q=' + encodeURIComponent(query);
    if (lat != null && lon != null) url += `&lat=${lat}&lon=${lon}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    // 飲食関連のみ（地名・駅・病院・マッサージ店などを除外）
    const FOOD_AMENITY = ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'izakaya', 'biergarten'];
    const FOOD_SHOP = ['bakery', 'confectionery', 'pastry', 'deli', 'seafood', 'butcher', 'coffee', 'tea',
      'alcohol', 'beverages', 'ice_cream', 'chocolate', 'wine', 'convenience'];
    return (j.features || [])
      .filter(f => {
        const p = f.properties;
        if (!p || !p.name) return false;
        if (p.osm_key === 'amenity') return FOOD_AMENITY.includes(p.osm_value);
        if (p.osm_key === 'shop') return FOOD_SHOP.includes(p.osm_value);
        return false;
      })
      .map(f => ({
        osmId: ({ N: 'node', W: 'way', R: 'relation' }[f.properties.osm_type] || 'node') + '/' + f.properties.osm_id,
        name: f.properties.name,
        address: [f.properties.state, f.properties.county, f.properties.city, f.properties.district, f.properties.street]
          .filter(Boolean).join(''),
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
        cuisine: '', amenity: f.properties.osm_value || '',
        distance: null,
      }));
  }

  // ---------- 検索結果の統合（重複除去・距離計算・近い順ソート） ----------
  function mergeCandidates(lists, ref) {
    const norm = id => String(id || '').toLowerCase()
      .replace('relation', 'r').replace('node', 'n').replace('way', 'w');
    const seen = new Set();
    const out = [];
    // 情報源をまたぐ同一店舗の判定（座標が微妙に違うため、近接＋名前の包含で判定）
    const isDup = (c) => out.some(o =>
      o.lat != null && c.lat != null &&
      Store.distMeters(o.lat, o.lon, c.lat, c.lon) < 150 &&
      (o.name === c.name || o.name.includes(c.name) || c.name.includes(o.name)));
    for (const list of lists) {
      for (const c of list) {
        const key = c.googleId ? 'g/' + c.googleId
          : c.osmId ? norm(c.osmId)
          : c.name + '@' + (c.lat || 0).toFixed(3) + ',' + (c.lon || 0).toFixed(3);
        if (seen.has(key) || isDup(c)) continue;
        seen.add(key);
        if (ref && c.lat != null && c.distance == null) {
          c.distance = Store.distMeters(ref.lat, ref.lon, c.lat, c.lon);
        }
        out.push(c);
      }
    }
    if (ref) out.sort((a, b) => (a.distance != null ? a.distance : 1e12) - (b.distance != null ? b.distance : 1e12));
    return out.slice(0, 15);
  }

  // ---------- 高速検索: Google Places + Photon + Nominatim（即時表示用） ----------
  // Google検索の直近の状態（画面での原因表示用）
  let lastGoogleStatus = { state: 'disabled' }; // disabled | ok | error
  const googleSearchStatus = () => lastGoogleStatus;

  async function searchShopsFast(fullQuery, nameQuery, ref) {
    const googleJob = hasGoogleKey()
      ? googlePlacesSearch(fullQuery, ref)
          .then(r => { lastGoogleStatus = { state: 'ok', count: r.length }; return r; })
          .catch(e => {
            console.warn('Google Places:', e);
            lastGoogleStatus = { state: 'error', message: String(e && e.message || e) };
            return [];
          })
      : (lastGoogleStatus = { state: 'disabled' }, Promise.resolve([]));
    const [google, photon, nomi] = await Promise.all([
      googleJob,
      photonSearch(nameQuery, ref && ref.lat, ref && ref.lon).catch(() => []),
      searchPlaces(fullQuery).catch(() => []),
    ]);
    // Googleが最も網羅的なので優先
    return mergeCandidates([google, photon, nomi], ref);
  }

  // ---------- 予測検索: 入力中のリアルタイム候補（検索ボタンを押す前に表示） ----------
  // Google + Photon のみ使用（Nominatimは利用規約で自動補完への使用が禁止されているため使わない）
  async function suggestShops(query, ref) {
    const googleJob = hasGoogleKey()
      ? googlePlacesSearch(query, ref).catch(() => [])
      : Promise.resolve([]);
    const [google, photon] = await Promise.all([
      googleJob,
      photonSearch(query, ref && ref.lat, ref && ref.lon).catch(() => []),
    ]);
    return mergeCandidates([google, photon], ref).slice(0, 6);
  }

  // ---------- 周辺の詳細検索: Overpass部分一致（個人店に強い・遅いので後追い用） ----------
  async function searchShopsNearby(nameQuery, ref) {
    if (!ref) return [];
    return overpassNameSearch(nameQuery, ref.lat, ref.lon);
  }

  // ---------- Nominatim: 名前検索 ----------
  async function searchPlaces(query) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&accept-language=ja&limit=10`);
    if (!res.ok) throw new Error('Nominatim error ' + res.status);
    const j = await res.json();
    return j.map(e => ({
      osmId: (e.osm_type ? e.osm_type[0].toUpperCase() + e.osm_type.slice(1) : '') + '/' + e.osm_id,
      name: e.name || String(e.display_name || '').split(',')[0],
      address: (e.display_name || '').split(', ').reverse()
        .filter(p => p !== '日本' && !/^\d{3}-\d{4}$/.test(p)).join(''),
      lat: parseFloat(e.lat), lon: parseFloat(e.lon),
      cuisine: '', amenity: e.type || '',
      distance: null,
    }));
  }

  // ---------- Claude APIキー管理（localStorageにのみ保存） ----------
  const API_KEY_STORAGE = 'gourmet.anthropicKey';
  const getApiKey = () => localStorage.getItem(API_KEY_STORAGE) || '';
  function setApiKey(key) {
    if (key) localStorage.setItem(API_KEY_STORAGE, key.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  }
  const hasApiKey = () => !!getApiKey();

  // ---------- Google Maps APIキー管理（店舗検索の強化用・任意） ----------
  const GOOGLE_KEY_STORAGE = 'gourmet.googleKey';
  const getGoogleKey = () => localStorage.getItem(GOOGLE_KEY_STORAGE) || '';
  function setGoogleKey(key) {
    if (key) localStorage.setItem(GOOGLE_KEY_STORAGE, key.trim());
    else localStorage.removeItem(GOOGLE_KEY_STORAGE);
  }
  const hasGoogleKey = () => !!getGoogleKey();

  // ---------- Google Places (New) テキスト検索 ----------
  // Googleマップのデータからほぼすべての飲食店を検索できる（キー設定時のみ）
  async function googlePlacesSearch(query, ref) {
    const key = getGoogleKey();
    if (!key) return [];
    const body = {
      textQuery: query,
      languageCode: 'ja',
      regionCode: 'JP',
      pageSize: 10,
      includedType: 'restaurant',
    };
    // includedTypeで絞ると喫茶店などが漏れるため指定しない
    delete body.includedType;
    if (ref) {
      body.locationBias = {
        circle: { center: { latitude: ref.lat, longitude: ref.lon }, radius: 30000 },
      };
    }
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      const msg = (j && j.error && j.error.message) ? j.error.message : '';
      throw new Error('HTTP ' + res.status + (msg ? ' — ' + msg : ''));
    }
    const j = await res.json();
    return (j.places || []).map(p => ({
      osmId: '',
      googleId: p.id,
      name: (p.displayName && p.displayName.text) || '',
      address: String(p.formattedAddress || '').replace(/^日本、?\s*/, '').replace(/^〒?\d{3}-\d{4}\s*/, ''),
      lat: p.location && p.location.latitude,
      lon: p.location && p.location.longitude,
      // Googleのtype（例: ramen_restaurant）をcuisine相当に変換してジャンル推定に使う
      // point_of_interest 等の汎用typeは除外（候補表示にそのまま出て見づらいため）
      cuisine: (p.types || [])
        .filter(t => !['point_of_interest', 'food', 'establishment', 'restaurant',
          'store', 'meal_takeaway', 'meal_delivery'].includes(t))
        .map(t => t.replace(/_restaurant$/, ''))
        .slice(0, 3)
        .join(';'),
      amenity: 'restaurant',
      distance: null,
    })).filter(c => c.name && c.lat != null);
  }

  // 公式SDK（@anthropic-ai/sdk）を遅延ロードしてクライアントを生成
  let anthropicClientPromise = null;
  function anthropicClient() {
    if (!anthropicClientPromise) {
      anthropicClientPromise = import('https://esm.sh/@anthropic-ai/sdk@0.72.1')
        .then(({ default: Anthropic }) => new Anthropic({
          apiKey: getApiKey(),
          dangerouslyAllowBrowser: true, // 個人用ローカルアプリ: キーは利用者自身のブラウザにのみ保存
        }));
    }
    return anthropicClientPromise;
  }
  function resetAnthropicClient() { anthropicClientPromise = null; }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // ---------- AIによる料理ジャンル判定（仕様書v2 §5） ----------
  // 戻り値: { dishGenres: string[], shopGenre: string } / 判定不可・低確信時は空
  // APIキー未設定時は null（呼び出し側でOSMタグ推定にフォールバック）
  async function classifyDishPhoto(file) {
    if (!hasApiKey()) return null;

    // 送信サイズを抑えるため縮小してから送る（判定精度には十分）
    const blob = await compressImage(file, 768, 0.7);
    const base64 = await blobToBase64(blob);

    const schema = {
      type: 'object',
      properties: {
        dishGenres: {
          type: 'array',
          items: { type: 'string', enum: DISH_GENRES },
          description: '写真に写っている料理のジャンル（複数可）',
        },
        shopGenre: {
          type: 'string',
          enum: SHOP_GENRES.concat(['不明']),
          description: '写真から推定される店舗ジャンル。判断できなければ「不明」',
        },
        confident: {
          type: 'boolean',
          description: '判定に自信がある場合のみ true',
        },
      },
      required: ['dishGenres', 'shopGenre', 'confident'],
      additionalProperties: false,
    };

    const client = await anthropicClient();
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: 'あなたは料理写真の分類器です。写真に写っている料理を指定されたジャンル一覧から選んで分類してください。料理が写っていない写真（外観・店内・メニュー表など）や判別が難しい場合は dishGenres を空配列、confident を false にしてください。',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          { type: 'text', text: 'この料理写真を分類してください。' },
        ],
      }],
      output_config: { format: { type: 'json_schema', schema } },
    });

    const text = response.content.find(b => b.type === 'text');
    if (!text) return { dishGenres: [], shopGenre: '' };
    const result = JSON.parse(text.text);

    // 確信度が低い場合は空欄にして利用者に選択を促す（§5）
    if (!result.confident) return { dishGenres: [], shopGenre: '' };
    return {
      dishGenres: result.dishGenres || [],
      shopGenre: (result.shopGenre && result.shopGenre !== '不明') ? result.shopGenre : '',
    };
  }

  // ---------- ジャンル推定（OSMタグからのフォールバック） ----------
  function guessGenres(candidate) {
    const out = { dish: '', shop: '' };
    if (!candidate) return out;
    const cuisines = String(candidate.cuisine || '').toLowerCase().split(/[;,]/);
    for (const c of cuisines) {
      const m = CUISINE_MAP[c.trim()];
      if (m) { out.dish = m.dish; out.shop = m.shop; break; }
    }
    if (!out.shop && candidate.amenity) out.shop = AMENITY_SHOP[candidate.amenity] || '';
    return out;
  }

  // ---------- 画像圧縮（仕様書v2 §9.1: 長辺リサイズ＋JPEG圧縮） ----------
  async function compressImage(file, maxDim = 1600, quality = 0.82) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    } catch {
      return file; // 圧縮に失敗した場合は元ファイルをそのまま保存
    }
  }

  return {
    // このファイル自身のバージョン（設定画面でキャッシュ混在を検出するために表示）
    FILE_VERSION: 'v161',
    DISH_GENRES, DISH_CATEGORIES, buildGenrePicker, SHOP_GENRES, parseExif, nearbyShops, nearestStation,
    reverseGeocode, searchPlaces, searchShopsFast, searchShopsNearby, suggestShops, mergeCandidates,
    guessGenres, compressImage, fileHash,
    classifyDishPhoto, getApiKey, setApiKey, hasApiKey, resetAnthropicClient,
    getGoogleKey, setGoogleKey, hasGoogleKey, googleSearchStatus,
  };
})();
