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
//   ALLOWED_ORIGINS  （任意）許可する Origin をカンマ区切り。既定は本番の GitHub Pages のみ
//   PER_MINUTE       （任意）1 IP あたり 1 分間の上限回数。既定 60
//   GOOGLE_PER_MINUTE（任意）Google 中継の全体で 1 分間の上限回数。既定 30
//
// 設定していないサービスは /status で false になり、アプリはそのサービスを呼ばない。
// ※ 本当の課金上限は Google Cloud コンソールの「割り当て（Quotas）」で設定すること。ここでの回数制限は補助。

const DEFAULT_ORIGINS = ['https://takusangoukaku-hash.github.io'];
const GOOGLE_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.location,places.types';

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
        services: { yahoo: !!env.YAHOO_APPID, hotpepper: !!env.HOTPEPPER_KEY, google: !!env.GOOGLE_KEY },
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

    return json({ error: 'not found' }, 404, origin);
  },
};
