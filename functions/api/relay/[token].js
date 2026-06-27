// Ephemeral, accountless relay — a temporary "mailbox" keyed by a random token.
// No login, no profiles, no durable storage. The token is the only capability:
// possession of it is the permission. Values live in Workers KV with a short TTL
// and are consumed on first read (one-shot).
//
// Routes (Cloudflare Pages Functions file-based routing -> /api/relay/:token):
//   POST /api/relay/:token  store JSON body under :token with TTL, return 200
//   GET  /api/relay/:token  return payload if present (then delete it), else 204
//
// KV binding name: RELAY  (see wrangler.toml / docs/RELAY.md)

const TTL_SECONDS = 600;          // ~10 min; KV minimum expirationTtl is 60s (matches the desktop poll window)
const MAX_BYTES = 8 * 1024;       // it's one highlight — a few KB is plenty

export async function onRequestPost(context) {
  const { params, env, request } = context;
  const token = params.token;
  if (!token) return new Response("missing token", { status: 400 });
  if (!env.RELAY) return new Response("relay storage unavailable: KV binding 'RELAY' is not configured", { status: 503 });

  // Accurate byte cap (not char count) so multibyte can't slip past.
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return new Response("payload too large", { status: 413 });
  }
  const body = new TextDecoder().decode(buf);

  // It's a JSON payload; reject anything that isn't valid JSON.
  try { JSON.parse(body); }
  catch { return new Response("invalid JSON", { status: 400 }); }

  await env.RELAY.put(token, body, { expirationTtl: TTL_SECONDS });
  return new Response(null, { status: 200 });
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const token = params.token;
  if (!token) return new Response("missing token", { status: 400 });
  if (!env.RELAY) return new Response("relay storage unavailable: KV binding 'RELAY' is not configured", { status: 503 });

  const value = await env.RELAY.get(token);
  if (value === null) {
    // Nothing waiting (never stored, already consumed, or TTL-expired).
    return new Response(null, { status: 204 });
  }

  // One-shot: consume on pickup so a token can't be replayed.
  await env.RELAY.delete(token);
  return new Response(value, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
