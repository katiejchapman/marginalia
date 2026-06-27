#!/usr/bin/env python3
"""
Headless test of the /scan capture pipeline: OCR -> relay -> desktop ingest.

The camera can't be driven headlessly, so we feed a fixed SYNTHETIC test image
into the page's OCR function (window.SCAN.handleImage) — everything downstream
of the camera is exercised for real:
  1. Desktop app mints a token (Scan).
  2. Phone /scan?token=… runs OCR on the synthetic image (real tesseract.js,
     loaded from CDN, on this http://localhost origin where the worker is fine).
  3. Phone sends the recognized + (test-)edited clip to /api/relay/:token.
  4. Desktop polls it up; assert STATE.clips has a 'handoff' clip whose text
     contains the known string, edited:true.

The synthetic image is the same high-contrast PNG used by the offline-OCR test
(js/vendor/tesseract/test-sample.png -> "MARGINALIA OCR TEST 12345").

Prereq (separate terminal, repo root, Node >=18 on PATH):
  wrangler pages dev . --kv RELAY --port 8788
Run:  python3 test/scan-ocr-test.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("RELAY_BASE", "http://127.0.0.1:8788").rstrip("/")
EXPECT = "MARGINALIA OCR TEST 12345"
SKIP_GATE = "try{localStorage.setItem('marginalia.gateSeen','1')}catch(e){}"


def norm(s):
    return " ".join((s or "").split()).upper()


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
        d.wait_for_function("document.querySelector('.js-scan') !== null", timeout=15000)
        d.evaluate("() => { const b=[...document.querySelectorAll('.js-scan')].find(x=>x.offsetParent!==null);"
                   " if(b) b.click(); else if(typeof startHandoff==='function') startHandoff(); }")
        d.wait_for_function("typeof HANDOFF!=='undefined' && !!HANDOFF.token", timeout=15000)
        token = d.evaluate("HANDOFF.token")
        print(f"[desktop] token: {token[:12]}…")

        # ---- Phone /scan: run OCR on the synthetic image ----
        phone = browser.new_context()
        ph = phone.new_page()
        ph.on("pageerror", lambda e: fails.append(f"phone pageerror: {e}"))
        ph.on("console", lambda m: print(f"   [phone console:{m.type}] {m.text}") if m.type == "error" else None)
        scan_url = f"{BASE}/scan?token={token}"
        resp = ph.goto(scan_url, wait_until="load", timeout=20000)
        if resp and resp.status == 404:
            scan_url = f"{BASE}/scan.html?token={token}"
            ph.goto(scan_url, wait_until="load", timeout=20000)
        print(f"[phone] opened {scan_url}")

        # Feed the synthetic PNG into the real OCR function (reveals the form).
        print("[phone] running OCR on synthetic image (first run downloads wasm+lang)…")
        ocr_text = ph.evaluate(
            "async () => { const r = await fetch('/js/vendor/tesseract/test-sample.png');"
            " const b = await r.blob(); return await window.SCAN.handleImage(b); }")
        print(f"[phone] OCR result: {ocr_text!r}")
        if not ocr_text:
            fails.append("OCR produced no text (tesseract failed to load or recognize)")
        elif EXPECT not in norm(ocr_text):
            fails.append(f"OCR text missing known string: {ocr_text!r}")

        # Form is now visible; fill metadata, then send.
        ph.fill("#fTitle", "OCR Test Book")
        ph.fill("#fAuthor", "Test Author")
        ph.fill("#fPage", "7")
        sent_text = ph.input_value("#fText")
        ph.click("#sendBtn")
        ph.wait_for_function(
            "document.getElementById('scanStatus') && /sent/i.test(document.getElementById('scanStatus').textContent)",
            timeout=15000)
        print(f"[phone] status: {ph.inner_text('#scanStatus')!r}")

        # ---- Desktop pickup ----
        try:
            d.wait_for_function(
                "typeof STATE!=='undefined' && STATE.clips.some(c=>c.batch==='handoff')",
                timeout=30000)
        except Exception as e:
            fails.append(f"desktop never picked up handoff clip: {e}")
        clip = d.evaluate(
            "() => { const c=STATE.clips.find(x=>x.batch==='handoff'); "
            "return c?{text:c.text,edited:!!c.edited,title:c.title,cat:c.cat,batch:c.batch}:null; }")
        print(f"[desktop] handoff clip: {clip}")
        if not clip:
            fails.append("no clip with batch 'handoff' on desktop")
        else:
            if EXPECT not in norm(clip["text"]):
                fails.append(f"desktop clip text missing known string: {clip['text']!r}")
            if norm(clip["text"]) != norm(sent_text):
                fails.append(f"desktop text != sent text ({clip['text']!r} vs {sent_text!r})")
            if not clip["edited"]:
                fails.append("desktop clip not marked edited:true")
            if clip["title"] != "OCR Test Book":
                fails.append(f"desktop clip title not carried: {clip['title']!r}")

        browser.close()

    print("\n==================== SUMMARY ====================")
    if fails:
        print("  RESULT: FAIL")
        for f in fails: print("   -", f)
        print("================================================")
        return 1
    print("  RESULT: PASS  (OCR -> relay -> ingest; text matches, edited:true, metadata carried)")
    print("================================================")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\nHarness error (is the dev server running at {BASE}?)\n  "
              f"wrangler pages dev . --kv RELAY --port 8788\n  ({type(e).__name__}: {e})")
        sys.exit(2)
