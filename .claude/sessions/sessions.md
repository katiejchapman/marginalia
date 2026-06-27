# Sessions — old work (newest first)

## Session: library/pace/reading UX + light-mode overhaul
Reading-pace Explore scatter (date-finished x days-spent, hover front-covers, month ticks) + Page-turner/
Slow-burner lollipops. Currently-reading marks (bookmark+circle by title, bookmark on shelf cover, spine ribbon).
Empty books kept + pinned to top with undo; delete-whole-book with undo; collapse state persists across re-render.
Bookshelf push-aside hover (edge-aware, no clip). Term-ID precision (sentence-start names, stopword strip,
possessives, honorifics, coordinator split, Last/First dedup). Dedup libraries + unique-name guard.
Light-mode overhaul: brightened jewel covers, distinct tags, accent root-cause fix, per-mode theme glow.
Files: js/app.js, js/highlights.js, js/handoff.js, styles.css.

## Session: bug-fix batch (post-handoff)
Restore dedup/merge, manual/phone not-an-import, hide synthetic loc, no-op nav guards,
remove View-library button, verify first-visit sample. Files: js/app.js, js/handoff.js.

## Session: phone handoff + scan + relay
Built QR phone→desktop handoff, Cloudflare Pages KV relay (one-shot mailbox, 5-min TTL),
phone /scan (camera, tesseract OCR, crop-before-OCR, cover→title/author, auto page),
Add-highlight manual modal, theme sync to phone, brand wordmark on /scan.
Edit title/author/page, delete-with-note, "last backed up" indicator, successive imports.

## Session: index.html split (reorg)
One-time extraction of inline CSS→styles.css and JS→js/{app,highlights,boot,ocr-highlight}.js,
classic scripts, behavior frozen. See .claude/rules/reorg_indexhtml.md.

## Session: early UI/feature passes
Timeline (slider→bar chart+tooltip), notes filter, library switcher, catalog-card random
highlight, review mode, deck contents, term identification, gate/spine/slider redesigns.

> Note: `.claude/sessions/snapshot.md` is auto-written each turn by the stop hook.
