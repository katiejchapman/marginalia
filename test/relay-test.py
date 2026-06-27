#!/usr/bin/env python3
"""
Verifies the ephemeral relay backend against a running local dev server.

Round trip:
  1. POST a known JSON payload to a random token  -> expect 200
  2. GET that token                               -> expect 200 + identical payload
  3. GET the SAME token again                      -> expect empty (one-shot consumed)
Plus a guard: an oversize body is rejected (413).

Prereq (separate terminal, from repo root):
  wrangler pages dev . --kv RELAY --port 8788

Run:
  python3 test/relay-test.py
  RELAY_BASE=http://127.0.0.1:8788 python3 test/relay-test.py   # override base URL

Stdlib only (urllib) — no extra deps, matching the project's no-deps stance.
"""
import json, os, sys, secrets, urllib.request, urllib.error

BASE = os.environ.get("RELAY_BASE", "http://127.0.0.1:8788").rstrip("/")


def req(method, path, data=None):
    url = BASE + path
    body = data.encode() if isinstance(data, str) else data
    r = urllib.request.Request(url, data=body, method=method)
    if body is not None:
        r.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    token = secrets.token_hex(16)
    payload = {
        "text": "He alone deserves freedom and life who must conquer them each day.",
        "title": "Faust", "author": "Goethe", "ts": 1719446400,
    }
    body = json.dumps(payload)
    print(f"base   : {BASE}")
    print(f"token  : {token}")

    fails = []

    # 1. store
    st, _ = req("POST", f"/api/relay/{token}", body)
    ok = st == 200
    print(f"[1] POST store           -> {st}  {'OK' if ok else 'EXPECTED 200'}")
    if not ok: fails.append("store != 200")

    # 2. pick up -> must match
    st, got = req("GET", f"/api/relay/{token}")
    match = st == 200 and got and json.loads(got) == payload
    print(f"[2] GET pickup           -> {st}  match={bool(match)}")
    if not match:
        fails.append("pickup mismatch")
        print(f"    expected: {body}")
        print(f"    got     : {got!r}")

    # 3. pick up AGAIN -> must be empty (one-shot consumed)
    st, got2 = req("GET", f"/api/relay/{token}")
    consumed = st in (204, 200) and (got2 == "" or got2 is None)
    # treat any non-empty body as a failure of one-shot semantics
    consumed = (st == 204) or (st == 200 and not got2)
    print(f"[3] GET again (one-shot) -> {st}  body={got2!r}  consumed={consumed}")
    if not consumed: fails.append("not consumed on first read")

    # 4. guard: oversize body rejected
    big = json.dumps({"x": "A" * (9 * 1024)})
    st, _ = req("POST", f"/api/relay/{secrets.token_hex(8)}", big)
    cap = st == 413
    print(f"[4] POST oversize (>8KB) -> {st}  {'OK (413)' if cap else 'EXPECTED 413'}")
    if not cap: fails.append("oversize not rejected")

    print("\n==================== SUMMARY ====================")
    if fails:
        print("  RESULT: FAIL")
        for f in fails: print("   -", f)
        print("================================================")
        return 1
    print("  RESULT: PASS  (store / one-shot pickup / consumption / size cap)")
    print("================================================")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.URLError as e:
        print(f"\nCould not reach {BASE} — is the dev server running?\n"
              f"  wrangler pages dev . --kv RELAY --port 8788\n  ({e})")
        sys.exit(2)
