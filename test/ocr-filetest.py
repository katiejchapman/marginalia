#!/usr/bin/env python3
"""
Playwright harness: does vendored Tesseract.js v7 run OCR over file://?

This is a PLUMBING test (does the worker spawn, wasm execute, lang load, text
come back), not an accuracy test. It opens test/ocr-filetest.html with a real
file:// absolute URL (NO --allow-file-access-from-files flag — that would defeat
the point), waits on window.__ocrDone, and asserts the recognized text contains
the known string.

Because the file:// worker situation differs by browser engine, it runs the test
on Firefox, WebKit (Safari engine) and Chromium, and across the two documented
worker configs (blob-URL worker / direct worker). It reports, per engine, which
config (if any) actually works over file://.

Prereq: pip install playwright && python3 -m playwright install firefox webkit chromium
Run:    python3 test/ocr-filetest.py

Note: the inline JS of the test page is syntax-checked with `node --check`
elsewhere in the workflow, per the repo's existing verification pattern.
"""
import re, sys, pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
PAGE = HERE / "ocr-filetest.html"
EXPECT = "MARGINALIA OCR TEST 12345"
CONFIGS = ["blob", "noblob"]       # blob = importScripts/blob worker (default); noblob = new Worker(path)
ENGINES = ["firefox", "webkit", "chromium"]
TIMEOUT_MS = 60_000                # first run compiles wasm + loads 10MB lang data


def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip().upper()


def trial(engine, browser, cfg):
    url = PAGE.as_uri() + f"?cfg={cfg}"
    page = browser.new_page()
    page_errs = []
    page.on("pageerror", lambda e: page_errs.append(str(e)))
    r = {"engine": engine, "cfg": cfg, "ok": False, "text": None,
         "error": None, "timeout": False}
    try:
        page.goto(url, wait_until="load", timeout=30_000)
        try:
            page.wait_for_function("window.__ocrDone === true", timeout=TIMEOUT_MS)
        except Exception:
            r["timeout"] = True
        r["text"] = page.evaluate("window.__ocrText")
        r["error"] = page.evaluate("window.__ocrError")
        if not r["error"] and page_errs:
            r["error"] = page_errs[0]
        r["ok"] = EXPECT in norm(r["text"])
    except Exception as e:
        r["error"] = f"harness: {e}"
    finally:
        if not page.is_closed():
            page.close()
    first = (r["error"].splitlines()[0] if r["error"] else None)
    print(f"  [{engine:8} cfg={cfg:7}] {'PASS' if r['ok'] else 'FAIL'}"
          f"  timeout={r['timeout']}  text={r['text']!r}"
          + (f"  err={first}" if first else ""))
    return r


def main():
    if not PAGE.exists():
        print("missing", PAGE); return 2
    results = []
    with sync_playwright() as p:
        for engine in ENGINES:
            print(f"== {engine} ==")
            launcher = getattr(p, engine)
            # No special file-access flags: must reflect a real double-click.
            browser = launcher.launch(headless=True)
            try:
                for cfg in CONFIGS:
                    results.append(trial(engine, browser, cfg))
            finally:
                browser.close()

    print("\n==================== SUMMARY ====================")
    working = [(r["engine"], r["cfg"]) for r in results if r["ok"]]
    for r in results:
        print(f"  {r['engine']:8} cfg={r['cfg']:7} "
              f"{'PASS' if r['ok'] else 'FAIL'}  text={r['text']!r}")
    print("  expected substring:", repr(EXPECT))
    print("  working (engine, config) over file://:", working or "NONE")
    print("================================================")
    # Exit 0 if it works on at least one engine; the report explains the caveats.
    return 0 if working else 1


if __name__ == "__main__":
    sys.exit(main())
