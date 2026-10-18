// BITEMAP 検索中継（Cloudflare Worker）
//
// Yahoo!ローカルサーチ／ホットペッパーグルメ／Google Places (New) のキーをアプリに置かず、
// この Worker の Secret に置いて、アプリ（GitHub Pages）からの検索だけを中継する。
// アプリ側は js/api.js の SEARCH_PROXY にこの Worker の URL を書く。
//
// 設定（Workers のダッシュボード → Settings → Variables and Secrets。すべて type: Secret）
//   GOOGLE_KEY       Google Maps Platform の API キー（Places API (New) のみ許可にしておく）
//   YAHOO_APPID      Yahoo! デベロッパーネットワークの Client ID（サーバーサイド用）
//   HOTPEPPER_KEY    リクルート Web サービスの API キー
//   ANTHROPIC_KEY    Anthropic（Claude Platform）の API キー。写真の料理ジャンル判定（/classify）に使う（v324〜）
//   ALLOWED_ORIGINS  （任意）許可する Origin をカンマ区切り。既定は本番の GitHub Pages のみ
//   PER_MINUTE       （任意）1 IP あたり 1 分間の上限回数。既定 60
//   GOOGLE_PER_MINUTE（任意）Google 中継の全体で 1 分間の上限回数。既定 30
//   CLASSIFY_PER_DAY （任意）AI判定の 1 端末（および 1 IP）あたり 1 日の上限枚数。既定 30
//   CLASSIFY_BULK_PER_DAY（任意）「過去の写真をまとめて取り込む」からの判定の 1 端末あたり 1 日の上限。既定 200（v326〜）
//   CLASSIFY_PER_MINUTE（任意）AI判定の全体で 1 分間の上限回数。既定 20
//   CLASSIFY_MODEL   （任意）AI判定に使うモデル。既定 claude-haiku-5-5（分類には十分で安価）
//
// 設定していないサービスは /status で false になり、アプリはそのサービスを呼ばない。
// ※ 本当の課金上限は Google Cloud コンソールの「割り当て（Quotas）」で設定すること。ここでの回数制限は補助。

const DEFAULT_ORIGINS = ['https://takusangoukaku-hash.github.io'];
const GOOGLE_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.location,places.types';
const CLASSIFY_MODEL_DEFAULT = 'claude-haiku-5-5';
const CLASSIFY_SYSTEM = 'あなたは料理写真の分類器です。写真に写っている料理を、指定されたジャンル一覧の中から最も近いものを1〜3つ選んで dishGenres に入れてください（一覧に完全に一致する料理が無くても、最も近いジャンルを選ぶこと。例: 牛肉のステーキ→「ステーキ」、ローストビーフ→「ステーキ」か「洋食」、パエリア→「スペイン料理」）。料理や飲み物が写っていれば confident は true にしてください。confident を false にするのは、料理が写っていない写真（外観・店内・メニュー表・人物など）のときだけです。shopGenre は写真から推定される店の種類で、判断できなければ「不明」。';

// 簡易レート制限（インスタンスごとのメモリ。厳密ではないが連打の抑止には足りる）
const buckets = new Map();
function limited(key, max, now) {
  const minute = Math.floor(now / 60000);
  let b = buckets.get(key);
  if (!b || b.minute !== minute) { b = { minute, n: 0 }; buckets.set(key, b); }
  if (buckets.size > 5000) buckets.clear();
  b.n += 1;
  return b.n > max;
}

// 1 日単位の簡易上限（AI判定用。インスタンスごとのメモリなので厳密ではないが、連続利用の抑止には足りる）
const dayBuckets = new Map();
function limitedDay(key, max, now) {
  const day = Math.floor(now / 86400000);
  let b = dayBuckets.get(key);
  if (!b || b.day !== day) { b = { day, n: 0 }; dayBuckets.set(key, b); }
  if (dayBuckets.size > 20000) dayBuckets.clear();
  b.n += 1;
  return b.n > max;
}
// 文字列の配列を安全な形に整える（ジャンル一覧用）
const strList = (v, maxItems, maxLen) => (Array.isArray(v) ? v : []).map(x => clean(x, maxLen)).filter(Boolean).slice(0, maxItems);

function allowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || '').trim();
  return raw ? raw.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean) : DEFAULT_ORIGINS;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin, extra) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, origin ? corsHeaders(origin) : {}, extra || {});
  return new Response(JSON.stringify(body), { status, headers: h });
}

const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const inJapan = (lat, lon) => lat != null && lon != null && lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154;
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

async function relay(url, init, origin) {
  let res;
  try { res = await fetch(url, init); }
  catch (e) { return json({ error: '上流サービスに接続できません' }, 502, origin); }
  const text = await res.text();
  // 上流の JSON をそのまま返す（Yahoo!/ホットペッパー/Google のエラー形式はアプリ側が解釈する）
  const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, corsHeaders(origin));
  return new Response(text, { status: res.ok ? 200 : res.status, headers });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
    const allowed = allowedOrigins(env);
    const ok = origin && allowed.includes(origin);

    if (req.method === 'OPTIONS') {
      return ok ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
    }
    // Origin の無い直叩き・他サイトからの呼び出しは拒否（キーの横流しを防ぐ）
    if (!ok) return json({ error: 'forbidden' }, 403, null);

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Date.now();
    if (limited('ip:' + ip, Number(env.PER_MINUTE) || 60, now)) return json({ error: '回数制限中です。少し待ってからお試しください' }, 429, origin);

    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/' || path === '/status') {
      return json({
        ok: true,
        services: { yahoo: !!env.YAHOO_APPID, hotpepper: !!env.HOTPEPPER_KEY, google: !!env.GOOGLE_KEY, classify: !!env.ANTHROPIC_KEY },
      }, 200, origin);
    }

    if (path === '/yahoo') {
      if (req.method !== 'GET') return json({ error: 'method' }, 405, origin);
      if (!env.YAHOO_APPID) return json({ error: 'Yahoo! は提供していません' }, 404, origin);
      const q = clean(url.searchParams.get('query'), 100);
      if (!q) return json({ error: 'query が必要です' }, 400, origin);
      const lat = num(url.searchParams.get('lat')), lon = num(url.searchParams.get('lon'));
      let u = 'https://map.yahooapis.jp/search/local/V1/localSearch?appid=' + encodeURIComponent(env.YAHOO_APPID)
        + '&query=' + encodeURIComponent(q) + '&gc=01&results=15&detail=simple&output=json';
      if (inJapan(lat, lon)) u += `&lat=${lat}&lon=${lon}&dist=20&sort=dist`;
      return relay(u, { headers: { 'User-Agent': 'BITEMAP-proxy' } }, origin);
    }

    if (path === '/hotpepper') {
      if (req.method !== 'GET') return json({ error: 'method' }, 405, origin);
      if (!env.HOTPEPPER_KEY) return json({ error: 'ホットペッパーは提供していません' }, 404, origin);
      const q = clean(url.searchParams.get('keyword'), 100);
      if (!q) return json({ error: 'keyword が必要です' }, 400, origin);
      const lat = num(url.searchParams.get('lat')), lng = num(url.searchParams.get('lng'));
      let u = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?key=' + encodeURIComponent(env.HOTPEPPER_KEY)
        + '&keyword=' + encodeURIComponent(q) + '&count=15&format=json';
      if (inJapan(lat, lng)) u += `&lat=${lat}&lng=${lng}&range=5`;
      return relay(u, { headers: { 'User-Agent': 'BITEMAP-proxy' } }, origin);
    }

    if (path === '/google') {
      if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);
      if (!env.GOOGLE_KEY) return json({ error: 'Google は提供していません' }, 404, origin);
      // Google は課金されるため、全体の回数も別枠で制限する
      if (limited('google', Number(env.GOOGLE_PER_MINUTE) || 30, now)) return json({ error: 'Google 検索の回数制限中です' }, 429, origin);
      let body = null;
      try { body = await req.json(); } catch { body = null; }
      const q = clean(body && body.textQuery, 200);
      if (!q) return json({ error: 'textQuery が必要です' }, 400, origin);
      // 送るのは店名と位置だけ。FieldMask（＝課金区分）とページ数は Worker 側で固定する
      const out = { textQuery: q, languageCode: 'ja', regionCode: 'JP', pageSize: 10 };
      const c = body && body.locationBias && body.locationBias.circle && body.locationBias.circle.center;
      const lat = c && num(c.latitude), lon = c && num(c.longitude);
      if (inJapan(lat, lon)) out.locationBias = { circle: { center: { latitude: lat, longitude: lon }, radius: 30000 } };
      return relay('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_KEY, 'X-Goog-FieldMask': GOOGLE_FIELDS },
        body: JSON.stringify(out),
      }, origin);
    }

    // 写真の料理ジャンル判定（v324〜）。アプリは縮小した写真（JPEG の base64）とジャンル一覧を送る。
    // キーは Worker だけが持ち、モデル・プロンプト・出力形式はここで固定する。
    if (path === '/classify') {
      if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);
      if (!env.ANTHROPIC_KEY) return json({ error: 'AI判定は提供していません' }, 404, origin);
      let body = null;
      try { body = await req.json(); } catch { body = null; }
      const image = clean(body && body.image, 2_000_000); // base64。768px の JPEG なら 150KB 程度
      if (!image || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: 'image が必要です' }, 400, origin);
      const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mediaType) ? body.mediaType : 'image/jpeg';
      const dishGenres = strList(body.dishGenres, 80, 30);
      const shopGenres = strList(body.shopGenres, 80, 30);
      if (!dishGenres.length) return json({ error: 'dishGenres が必要です' }, 400, origin);
      // 上限: 端末ごと・IP ごとに 1 日 N 枚、全体で 1 分 M 回（クレジットの消費を抑える）
      // 通常は 1 日 30 枚。まとめて取り込み（bulk）は別枠で 1 日 200 枚（過去の写真を一気に入れるため）
      const bulk = body.bulk === true;
      const perDay = bulk ? (Number(env.CLASSIFY_BULK_PER_DAY) || 200) : (Number(env.CLASSIFY_PER_DAY) || 30);
      const device = clean(body.device, 64) || ('ip:' + ip);
      const overDay = '今日の AI 判定の上限（' + perDay + '枚）に達しました。明日またお試しください';
      if (limitedDay((bulk ? 'clsb-dev:' : 'cls-dev:') + device, perDay, now)) return json({ error: overDay }, 429, origin);
      if (limitedDay((bulk ? 'clsb-ip:' : 'cls-ip:') + ip, perDay * 3, now)) return json({ error: overDay }, 429, origin);
      if (limited('classify', Number(env.CLASSIFY_PER_MINUTE) || 20, now)) return json({ error: 'AI 判定が混み合っています。少し待ってからお試しください' }, 429, origin);

      const schema = {
        type: 'object',
        properties: {
          dishGenres: { type: 'array', items: { type: 'string', enum: dishGenres }, description: '写真に写っている料理のジャンル（複数可）' },
          shopGenre: { type: 'string', enum: shopGenres.concat(['不明']), description: '写真から推定される店舗ジャンル。判断できなければ「不明」' },
          confident: { type: 'boolean', description: '判定に自信がある場合のみ true' },
        },
        required: ['dishGenres', 'shopGenre', 'confident'],
        additionalProperties: false,
      };
      const payload = {
        model: clean(env.CLASSIFY_MODEL, 60) || CLASSIFY_MODEL_DEFAULT,
        max_tokens: 512,
        system: CLASSIFY_SYSTEM,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'この料理写真を分類してください。' },
        ] }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      };
      let res;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(payload),
        });
      } catch (e) { return json({ error: 'AI に接続できません' }, 502, origin); }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || '';
        // 上流のエラー文はそのまま出さず、種類だけ伝える（キーや内部事情を漏らさない）
        const kind = res.status === 401 ? 'AI のキーが無効です（開発者側の設定）' : res.status === 429 ? 'AI の利用が混み合っています' : 'AI 判定に失敗しました';
        return json({ error: kind, status: res.status, detail: msg.slice(0, 120) }, res.status === 429 ? 429 : 502, origin);
      }
      if (!data || data.stop_reason === 'refusal') return json({ dishGenres: [], shopGenre: '', confident: false }, 200, origin);
      const text = (data.content || []).find(b => b.type === 'text');
      let out = null;
      try { out = text ? JSON.parse(text.text) : null; } catch { out = null; }
      if (!out) return json({ dishGenres: [], shopGenre: '', confident: false }, 200, origin);
      return json({
        dishGenres: strList(out.dishGenres, 5, 30).filter(g => dishGenres.includes(g)),
        shopGenre: shopGenres.includes(out.shopGenre) ? out.shopGenre : '',
        confident: !!out.confident,
      }, 200, origin);
    }

    return json({ error: 'not found' }, 404, origin);
  },
};
