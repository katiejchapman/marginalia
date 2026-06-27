# Task History — marginalia

## 2026-06 (uncommitted) — reading-mark rework, collapse persistence, dedup libraries, light polish
- read-mark (bookmark + inner circle) left of title; circle fills gold when reading
- bookmark on shelf cover (shown on hover) toggles reading; collapse state persists across re-render
- prevent duplicate library names; "Remove duplicates" also merges same-named libraries
- theme-map selected glow per-mode (white in dark, gold in light); light accent + tag color tuning

## cee2cad — reading-pace viz, currently-reading + empty books, term fixes, light-mode contrast
- Reading-pace scatter (date finished x days spent, hover covers) + Page-turners/Slow burners lists
- Currently-reading per book; delete whole book (undo); empty books kept + pinned to top
- Bookshelf push-aside hover (edge-aware), equal-length by-book/author bars
- Term ID: sentence-start names, leading-stopword strip, possessives, honorifics, coordinator split, Last/First dedup
- Manual-add clears fields; restore stays on import screen; light-mode accent root-cause fix (was clobbered by baked :root)

## 2026-06 — restore/merge + manual-entry batch (in cee2cad lineage)
- Restore-from-backup merges into current lib (identical = nothing to restore) or restores as new
- Manual/phone highlights add straight in (not logged as import); missing page renders "—"; no-op = no nav jump

## de375f9 — import successive files (stay in panel); show file modified date; handoff into current library
## 6399bb1 — backup indicator, delete-note-with-highlight, unique loc, edit page, title/brand fixes
## 08b51fe — Add-highlight (manual or phone), crop-before-OCR, successive sends, edit title/author, theme sync
## d21d79a — bind RELAY KV namespace in wrangler.toml
## fe13bb5 — scan: cover→title/author, auto page number, bigger text box, longer code TTL
## d946714 — drop placeholder KV id from wrangler.toml
## c6a1036 — phone→desktop handoff, offline OCR vendoring, relay backend, UI fixes
## 4676467 — Notes filter + verdigris notes, ink-drop timeline markers, mobile
## b03c065 — Timeline bar chart + tooltip, notes toggle, light-mode contrast
## f4b68de — Catalog-card random highlight, library switcher, smooth timeline
## 21d1adb — UI pass: doors/divider, review, deck contents, term ID & timeline
## 58e44c7 / 08f75f2 / 42a418d — index.html split: extract JS, extract CSS, reorg rules
## 48569f2 — feat: reading marks, collapse persistence, dedup libraries, light-mode overhaul (2026-06-27) <!--auto:48569f2-->
