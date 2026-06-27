# Relay backend (ephemeral desktop→phone handoff)

This is the first server-side piece in marginalia. The site is still a static
single-page app; this only adds a tiny serverless "courier" so a desktop can hand
one highlight to a phone (or vice-versa) without any account or durable storage.

## What it is

An **ephemeral, accountless relay** — a temporary mailbox keyed by a random
token. No login, no profiles. The token is the only capability: whoever has it
can read the mailbox once. Backed by **Workers KV** (short-lived keyed values —
exactly KV's use case; not D1).

- `POST /api/relay/:token` — stores the JSON request body under `:token` with a
  ~5 minute TTL. Body capped at 8 KB. Returns `200`.
- `GET /api/relay/:token` — returns the stored payload if present, then
  **deletes it** (one-shot: consumed on pickup). Returns `204` (empty) if there
  is nothing waiting (never stored, already consumed, or TTL-expired).

Code: `functions/api/relay/[token].js` (Cloudflare Pages Functions, file-based
routing). KV binding name: **`RELAY`**.

## KV setup

### Production (one-time)
1. Create the namespace:
   ```
   wrangler kv namespace create RELAY
   ```
   This prints an `id`. Two ways to bind it:
   - **wrangler.toml**: paste the `id` into the `[[kv_namespaces]]` block
     (`binding = "RELAY"`), or
   - **Pages dashboard**: Project → Settings → Functions → KV namespace
     bindings → add `RELAY` → select the namespace.
2. Deploy as usual (`wrangler pages deploy .` or via the Pages Git integration).

No TTL is configured at the namespace level — the TTL is set per write
(`expirationTtl`) in the function, so every key self-expires.

### Local development
`wrangler pages dev` simulates KV locally in `.wrangler/state/` — you do **not**
need a real namespace or `wrangler login` to develop or run the test. The `id`
in `wrangler.toml` is ignored locally.

## Run locally

From the repo root:

```
wrangler pages dev . --kv RELAY --port 8788
```

- Serves the static site + the `functions/` routes at `http://127.0.0.1:8788`.
- `--kv RELAY` provides a local, in-memory/disk-simulated `RELAY` binding.
- First run downloads the `workerd` runtime.

Requires Node ≥ 18 (wrangler 3). If your default `node` is older, run it under a
newer Node (e.g. via nvm) — wrangler itself is the only dependency.

## Test

`test/relay-test.py` exercises the round trip against the local dev server:
POST a known payload to a random token → GET it back and assert it matches →
GET again and assert it's now empty (proving one-shot consumption).

```
# terminal 1
wrangler pages dev . --kv RELAY --port 8788
# terminal 2
python3 test/relay-test.py            # uses http://127.0.0.1:8788 by default
```

Override the base URL with `RELAY_BASE`, e.g.
`RELAY_BASE=http://127.0.0.1:8788 python3 test/relay-test.py`.
