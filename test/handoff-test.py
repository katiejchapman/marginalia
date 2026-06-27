#!/usr/bin/env python3
"""
End-to-end test of the desktop<-phone handoff against the local dev server.

Proves the pairing + desktop pickup (no camera/OCR; the phone sends a hardcoded
test highlight, exercising the real /scan page + js/scan.js):

  1. Open the desktop app (real http origin via wrangler, NOT file://).
  2. Trigger Scan -> it mints a token; grab that token.
  3. Simulate the phone in a SECOND browser context: open /scan?token=<token>
     and click "Send" (POSTs the hardcoded payload to /api/relay/:token).
  4. Assert the desktop polls it up and the clip lands in STATE.clips with
     batch "handoff" (and persisted to localStorage).

Prereq (separate terminal, repo root, with Node >=18 on PATH):
  wrangler pages dev . --kv RELAY --port 8788

Run:  python3 test/handoff-test.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("RELAY_BASE", "http://127.0.0.1:8788").rstrip("/")
EXPECT_TEXT = "The unexamined life is not worth living."
SKIP_GATE = "try{localStorage.setItem('marginalia.gateSeen','1')}catch(e){}"


def main():
    fails = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---- Desktop receiver ----
        desktop = browser.new_context()
        desktop.add_init_script(SKIP_GATE)
        d = desktop.new_page()
        d.on("pageerror", lambda e: fails.append(f"desktop pageerror: {e}"))
        d.goto(BASE + "/", wait_until="load", timeout=30000)

        # Start the handoff (click a visible Scan button; fall back to the fn).
        d.wait_for_function("document.querySelector('.js-scan') !== null", timeout=15000)
        how = d.evaluate(
            "() => { const b=[...document.querySelectorAll('.js-scan')].find(x=>x.offsetParent!==null);"
            " if(b){b.click(); return 'click';}"
            " if(typeof startHandoff==='function'){startHandoff(); return 'eval';} return 'none'; }")
        print(f"[desktop] handoff started via: {how}")
        d.wait_for_function("typeof HANDOFF!=='undefined' && !!HANDOFF.token", timeout=15000)
        token = d.evaluate("HANDOFF.token")
        print(f"[desktop] token: {token[:12]}…  (len={len(token)})")
        if not token or len(token) < 32:
            fails.append("token missing or too short (not crypto-strong)")

        # ---- Phone sender (second context) ----
        phone = browser.new_context()
        ph = phone.new_page()
        ph.on("pageerror", lambda e: fails.append(f"phone pageerror: {e}"))
        scan_url = f"{BASE}/scan?token={token}"
        resp = ph.goto(scan_url, wait_until="load", timeout=20000)
        if resp and resp.status == 404:                      # clean-URL not served locally
            scan_url = f"{BASE}/scan.html?token={token}"
            resp = ph.goto(scan_url, wait_until="load", timeout=20000)
        print(f"[phone] opened {scan_url} -> {resp.status if resp else '??'}")
        ph.wait_for_selector("#sendBtn", timeout=10000)
        ph.click("#sendBtn")
        ph.wait_for_function(
            "document.getElementById('scanStatus') && /sent/i.test(document.getElementById('scanStatus').textContent)",
            timeout=15000)
        print(f"[phone] status: {ph.inner_text('#scanStatus')!r}")

        # ---- Desktop should pick it up (polls every 2s) ----
        try:
            d.wait_for_function(
                "typeof STATE!=='undefined' && STATE.clips.some(c=>c.batch==='handoff')",
                timeout=30000)
        except Exception as e:
            fails.append(f"desktop never picked up handoff clip: {e}")

        clip = d.evaluate(
            "() => { const c=STATE.clips.find(x=>x.batch==='handoff'); return c?{text:c.text,batch:c.batch,cat:c.cat,fp:c.fp}:null; }")
        print(f"[desktop] handoff clip: {clip}")
        if not clip:
            fails.append("no clip with batch 'handoff' in STATE.clips")
        else:
            if clip["text"] != EXPECT_TEXT:
                fails.append(f"clip text mismatch: {clip['text']!r}")
            if clip["batch"] != "handoff":
                fails.append("clip batch is not 'handoff'")

        # Persisted to localStorage? saveState() is debounced (~250ms), so wait.
        persist_check = ("() => { try { return (localStorage.getItem('marginalia.v2')||'').includes("
                         + repr(EXPECT_TEXT) + "); } catch(e){ return false; } }")
        try:
            d.wait_for_function(persist_check, timeout=5000)
            persisted = True
        except Exception:
            persisted = d.evaluate(persist_check)
        print(f"[desktop] persisted to localStorage: {persisted}")
        if not persisted:
            fails.append("handoff clip not persisted to localStorage")

        browser.close()

    print("\n==================== SUMMARY ====================")
    if fails:
        print("  RESULT: FAIL")
        for f in fails:
            print("   -", f)
        print("================================================")
        return 1
    print("  RESULT: PASS  (token mint -> phone POST -> desktop pickup -> batch 'handoff' -> persisted)")
    print("================================================")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\nHarness error (is the dev server running at {BASE}?)\n  "
              f"wrangler pages dev . --kv RELAY --port 8788\n  ({type(e).__name__}: {e})")
        sys.exit(2)
