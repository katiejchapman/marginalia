# .claude/rules/reorg_indexhtml.md
---
paths:
  - "index.html"
  - "styles.css"
  - "js/**/*.js"
---

# One-Time index.html Split

Marginalia began as a single self-contained `index.html`. This rule governs a
one-time extraction of its inline CSS and JS into separate files. **Extract
only — do not refactor, rename, reorder logic, or change any behavior.**

## Hard constraints

- **Classic scripts only.** Use `<script src="...">`, NOT ES modules / `import`
  / `export`. The app must keep running from `file://` (double-click) and the
  existing inline `onclick="..."` handlers must keep working. Modules break both.
- **No build step, no dependencies, no server requirement.** Same as before the split.
- **Behavior frozen.** Byte-for-byte equivalent JS/CSS, just relocated. No
  tidying, no "while I'm here" edits.

## Target files

- `styles.css` — the entire inline `<style>` block from `<head>` (~lines 10–680).
  Replace it with `<link rel="stylesheet" href="styles.css">`.
  Leave the small generated `<style>` string inside `styleBlock()` (Anki export) in JS.
- `js/app.js` — all function/const/let/var **definitions** from the inline `<script>`.
- `js/highlights.js` — the highlight/tooltip/term-annotation function family
  (e.g. `annotateTerms`, `populateTip`, `fetchWiki`, `fetchWiktionary`,
  `fetchTatoebaExample`). Definitions only.
- `js/boot.js` — all **immediate top-level executable code**: the event-listener
  wiring blocks, `root.setAttribute(...)`, `toggleJumpTop()`, `updateVisitorInfo()`,
  the `restoreSession()` IIFE, the sample loader at the bottom — everything that
  runs on parse rather than being a definition.
- `js/ocr-highlight.js` — create empty (single comment placeholder). Do not implement.

## Load order (critical)

At the end of `<body>`, in this order — definitions before the boot that calls them:
```html
<script src="js/highlights.js"></script>
<script src="js/app.js"></script>
<script src="js/ocr-highlight.js"></script>
<script src="js/boot.js"></script>
```
Classic scripts share global scope, so cross-file function calls are fine. The
only failure mode is immediate code running before a function it calls is
defined — putting all immediate code in `boot.js` loaded last prevents it.

## Procedure

1. Extract CSS → `styles.css`, add the `<link>`. Commit.
2. Extract JS definitions → `js/app.js` + `js/highlights.js`; move immediate code
   → `js/boot.js`; stub `js/ocr-highlight.js`; wire the four `<script>` tags. Commit.
3. After each commit, verify (see below) before continuing.

## Verify after each step

- Page loads by double-clicking `index.html` (`file://`) AND via `python3 -m http.server`.
- No console errors (esp. "X is not defined" — that means load order or a
  definition landed in the wrong file).
- Gate opens, lamp cursor tracks, all tabs switch, search filters, a sample
  import renders, Review mode works.
