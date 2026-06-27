#!/usr/bin/env python3
"""
Headless test for the quiet "last backed up" indicator.

Pure client-side feature, so it runs over file:// (no relay/server needed).
Asserts:
  1. "never backed up" when no timestamp is stored.
  2. A real export (exportLibraryJson) writes marginalia.lastBackup.
  3. recordBackup(ts) writes that exact timestamp.
  4. The rendered line reads "3 days ago" for a timestamp 3 days in the past.
  5. relTimeAgo unit boundaries (just now / minutes / hours / days).

Run:  python3 test/backup-indicator-test.py
"""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.join(ROOT, "index.html")
SKIP_GATE = "try{localStorage.setItem('marginalia.gateSeen','1')}catch(e){}"
KNOWN = 1000000000000   # fixed epoch ms for deterministic relative-time checks


def main():
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(accept_downloads=True)
        ctx.add_init_script(SKIP_GATE)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: fails.append(f"pageerror: {e}"))
        pg.goto(URL, wait_until="load", timeout=30000)
        pg.wait_for_function(
            "typeof backupStatusHtml==='function' && typeof recordBackup==='function'"
            " && typeof relTimeAgo==='function' && typeof exportLibraryJson==='function'",
            timeout=15000)

        # 1. never backed up
        never = pg.evaluate("()=>{localStorage.removeItem('marginalia.lastBackup');return backupStatusHtml();}")
        if "never backed up" not in never:
            fails.append(f"expected 'never backed up', got {never!r}")

        # 2. a real export records the timestamp (this is the only new write)
        before = pg.evaluate("Date.now()")
        pg.evaluate("()=>{localStorage.removeItem('marginalia.lastBackup');try{exportLibraryJson();}catch(e){}}")
        ts = pg.evaluate("lastBackupTs()")
        if not ts or ts < before - 2000:
            fails.append(f"exportLibraryJson did not record a fresh backup ts (got {ts!r})")

        # 3. recordBackup writes the exact value
        written = pg.evaluate(f"()=>{{recordBackup({KNOWN});return lastBackupTs();}}")
        if written != KNOWN:
            fails.append(f"recordBackup wrote {written!r}, expected {KNOWN}")

        # 4. rendered relative string, 3 days after the known timestamp
        s3 = pg.evaluate(f"()=>backupStatusHtml({KNOWN}+3*86400000)")
        if "3 days ago" not in s3:
            fails.append(f"expected '3 days ago' in line, got {s3!r}")

        # 5. relTimeAgo unit boundaries
        got = pg.evaluate("()=>[relTimeAgo(0,1000),relTimeAgo(0,60000),relTimeAgo(0,7200000),relTimeAgo(0,86400000)]")
        exp = ["just now", "1 minute ago", "2 hours ago", "1 day ago"]
        for g, e in zip(got, exp):
            if g != e:
                fails.append(f"relTimeAgo expected {e!r}, got {g!r}")

        b.close()

    print("\n==================== SUMMARY ====================")
    if fails:
        print("  RESULT: FAIL")
        for f in fails:
            print("   -", f)
        print("================================================")
        return 1
    print("  RESULT: PASS  (never backed up / export writes ts / recordBackup / '3 days ago' / units)")
    print("================================================")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\nHarness error: {type(e).__name__}: {e}")
        sys.exit(2)
