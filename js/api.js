// =====================================================
// 外部サービス連携（仕様書v2 §1.1 / §15）
//  - 周辺店舗検索・最寄駅: Overpass API (OpenStreetMap)
//  - 逆ジオコーディング・地名検索: Nominatim
//  - EXIF解析: exifr
//  - 料理ジャンルのAI判定: Claude API（APIキー設定時）
//  - フォールバック: OSMのcuisine/amenityタグから推定
// =====================================================
const Api = (() => {

  const DISH_GENRES = ['ラーメン', 'つけ麺', 'チャーハン', '寿司', '焼肉', 'カレー',
    'ハンバーガー', 'パスタ', 'ピザ', '定食', '丼もの', 'カフェメニュー', 'スイーツ', 'ドリンク', 'その他'];
  const SHOP_GENRES = ['ラーメン店', '焼肉店', '寿司店', '中華料理店', 'イタリアン',
    'カフェ', '居酒屋', 'ファミリーレストラン', 'バー', 'その他'];

  const CUISINE_MAP = {
    ramen: { dish: 'ラーメン', shop: 'ラーメン店' },
    noodle: { dish: 'ラーメン', shop: 'ラーメン店' },
    sushi: { dish: '寿司', shop: '寿司店' },
    yakiniku: { dish: '焼肉', shop: '焼肉店' },
    barbecue: { dish: '焼肉', shop: '焼肉店' },
    korean: { dish: '焼肉', shop: '焼肉店' },
    chinese: { dish: 'チャーハン', shop: '中華料理店' },
    italian: { dish: 'パスタ', shop: 'イタリアン' },
    pasta: { dish: 'パスタ', shop: 'イタリアン' },
    pizza: { dish: 'ピザ', shop: 'イタリアン' },
    curry: { dish: 'カレー', shop: 'その他' },
    indian: { dish: 'カレー', shop: 'その他' },
    burger: { dish: 'ハンバーガー', shop: 'その他' },
    coffee_shop: { dish: 'カフェメニュー', shop: 'カフェ' },
    dessert: { dish: 'スイーツ', shop: 'カフェ' },
    ice_cream: { dish: 'スイーツ', shop: 'カフェ' },
    cake: { dish: 'スイーツ', shop: 'カフェ' },
    japanese: { dish: '定食', shop: 'その他' },
    donburi: { dish: '丼もの', shop: 'その他' },
  };
  const AMENITY_SHOP = {
    cafe: 'カフェ', bar: 'バー', pub: '居酒屋', izakaya: '居酒屋',
    fast_food: 'その他', restaurant: 'その他', food_court: 'その他', ice_cream: 'カフェ',
  };

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
  async function overpass(query) {
    let lastErr;
    for (const url of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
        });
        if (res.ok) return await res.json();
        lastErr = new Error('Overpass error ' + res.status);
      } catch (e) { lastErr = e; }
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
    DISH_GENRES, SHOP_GENRES, parseExif, nearbyShops, nearestStation,
    reverseGeocode, searchPlaces, guessGenres, compressImage,
    classifyDishPhoto, getApiKey, setApiKey, hasApiKey, resetAnthropicClient,
  };
})();
