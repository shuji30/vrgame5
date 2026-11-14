// TREAD REVOLT のオンライン対戦用:Cloudflare Realtime の TURN の一時的な合言葉(ICE サーバーの一覧)を発行する Worker
//   GET /ice → { iceServers: [...], ttl }
// TURN の API トークンはページに書けないので、ここで預かって短い期限の合言葉だけをゲームへ渡す。
// 設定(Cloudflare のダッシュボードの Worker → 設定 → 変数とシークレット):
//   TURN_KEY_ID        … TURN キーの ID(Realtime → TURN Server で作ったもの)
//   TURN_KEY_API_TOKEN … TURN キーの API トークン(シークレットとして入れる)
//   ALLOWED_ORIGINS    … 使ってよいゲームの URL(カンマ区切り)。例: https://shuji30.github.io,http://localhost:8090

const TTL = 4 * 3600; // 合言葉の有効期限(秒)。1 回の対戦より十分長く

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://shuji30.github.io,http://localhost:8090').split(',').map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors });
    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ ok: true, configured: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) }, 200, cors);
    if (url.pathname !== '/ice' || req.method !== 'GET') return json({ error: 'not found' }, 404, cors);
    // ほかのサイトから無料枠を使われないよう、許可したゲームからだけ答える
    if (!ok) return json({ error: 'origin not allowed' }, 403, cors);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: 'TURN_KEY_ID / TURN_KEY_API_TOKEN が設定されていません' }, 500, cors);

    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!r.ok) return json({ error: `TURN の API がエラーを返しました (${r.status})` }, 502, cors);
    const data = await r.json();
    // 応答の形は { iceServers: [ {urls,...}, ... ] }(古い API では { iceServers: {urls, username, credential} })
    let list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    // ブラウザは 53 番ポートへつなぐと待たされるので外す(Cloudflare の資料の勧め)
    list = list.map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
    return json({ iceServers: list, ttl: TTL }, 200, { ...cors, 'Cache-Control': 'no-store' });
  },
};

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
