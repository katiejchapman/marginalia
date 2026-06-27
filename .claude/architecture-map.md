# Architecture Map — marginalia

## Files & load order (index.html, end of <body>)
1. js/highlights.js  — term annotation/tooltips: annotateTerms, populateTip,
   fetchWiki, fetchWiktionary, fetchTatoebaExample
2. js/app.js         — all definitions (model, parse, render, persistence)
3. js/ocr-highlight.js — placeholder (empty)
4. js/boot.js        — ALL immediate top-level code (wiring, restoreSession, loadSample)

Other:
- styles.css                     — all CSS; scriptorium theme; --paper/--ink/--accent;
                                   [data-mode=light|dark]
- js/handoff.js                  — QR phone→desktop handoff, receiveHandoff(), Add-highlight modal
- js/scan.js + scan.html         — phone /scan: camera, tesseract OCR, crop, cover/page parse
- functions/api/relay/[token].js — Cloudflare Pages fn; KV "RELAY" one-shot mailbox (TTL 300s)
- wrangler.toml                  — KV namespace binding
- test/*.py                      — Playwright headless tests

## Data model
clip = {id,batch,title,author,text,type,page,loc,added,cat,fp,edited,catLocked,review,flagged,incoming}
- clipFp(c) = type|title|author|loc(||page)  — stable identity across edits/re-imports
- notes (type:"note") pair to highlights by locKey=(loc||page).split(/[-–]/)[0] within same book
- Synthetic loc (manual…/scan…/handoff…) keeps each manual/scan clip unique; hidden from card UI

## State & persistence
- STATE={clips,decks} = projection of the ACTIVE library
- LIBRARIES[] + ACTIVE_LIB; syncActiveLib() writes globals→lib, loadLibIntoState() lib→globals
- saveState() (debounced) → localStorage "marginalia.v2"; loadState() migrates v1
- IS_SAMPLE + per-lib isSample; sample rebuilt when SAMPLE_VERSION changes
- ALWAYS go through sync/load helpers — never mutate LIBRARIES[x].clips and STATE.clips separately

## Key flows
- Import: ingest(text,filename,fromSample,opts) → parseClippings|parseHtml|parseCsv → dedup/merge by fp
- Backup: exportLibraryJson() / importLibraryJson() (merge into current OR restore as new library)
- Handoff: desktop QR (handoff.js) ↔ phone scan (scan.js) via relay; receiveHandoff() merges into current lib
- Views (tabs, PAGE): Library render()→groupByBook()→renderShelf(); Timeline; Explore/Connections; Review
