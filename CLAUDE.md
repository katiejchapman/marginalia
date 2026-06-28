# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**marginalia** is a Kindle notes organizer. It parses a Kindle `My Clippings.txt`
(or HTML/CSV export), auto-categorizes highlights, displays them as a virtual
bookshelf/library, and provides a spaced-repetition Review mode plus Anki deck
export. There is **no build, no server, no dependencies, no package manager**.
`index.html` loads `styles.css` plus classic `<script src>` files in `js/`
(`app.js`, `highlights.js`, `boot.js`, …) — vanilla JS, global scope, no
frameworks. Runs from `file://` (double-click) or a static server.

## Running / developing

- Open `index.html` directly in a browser (`open index.html`), or serve the
  folder (`python3 -m http.server`) to avoid any `file://` CORS quirks with the
  external API calls.

## Architecture

App logic lives in `js/` (classic scripts, global scope). Key pieces:

**Data model & persistence**
- `STATE = {clips, decks}` holds the *active* library's working data. A `clip` is
  `{id, batch, title, author, text, type, page, loc, added, cat, fp, edited,
  catLocked, review, flagged, incoming}`.
- Multiple libraries live in `LIBRARIES[]`; `ACTIVE_LIB` selects one. The live
  globals (`STATE`, `ACTIVE_DECK`, `CAT_RULES`, `REVIEW_LOG`, `IMPORT_LOG`,
  `IS_SAMPLE`) are a *projection* of the active library. `syncActiveLib()` writes
  globals back into the `LIBRARIES` object; `loadLibIntoState()` projects a
  library into the globals. **Always go through these — never mutate
  `LIBRARIES[x].clips` and `STATE.clips` independently.**
- Persistence is `localStorage` key `marginalia.v2` (debounced via `saveState()`),
  with one-time migration from the older `marginalia.v1` single-library format.
  `saveState()` calls `syncActiveLib()` first. Call `saveState()` after any state
  mutation that should persist.

**Identity / dedup**
- `clipFp(c)` computes a fingerprint (`type|title|author|location`, falling back
  to a text head when there's no location). This fingerprint is the stable
  identity across text edits and re-imports, and is used as the card id
  (`cardId`). Re-importing merges by `fp`: new clips are added, changed text
  updates in place (unless the user `edited` it, in which case it's staged as
  `incoming` for review).

**Categorization**
- `autoCategorize(c)` sorts each clip into `vocab` (single-word lookups),
  `quotes`, or `topic` (proper-noun / topic of interest). `CAT_RULES` stores
  user overrides keyed by text; `catLocked` prevents re-categorization on
  re-import. `isVocabWord`/`vocabTermOf` and the `isCapCore`/`lookupForm` family
  drive vocab vs. topic detection.

**Views (tabs)** — single-page, toggled by `.tabs` click handler setting `PAGE`
and showing/hiding `#pageLibrary`, `#pageTimeline`, `#pageConnections`,
`#pageReview`:
- **Library** — `render()` → `groupByBook()` → `renderShelf()` + per-book clip
  lists. `annotateTerms()` wraps notable terms with hover tooltips (`populateTip`).
  Margin notes always render inline under the highlight they annotate. The
  toolbar **notes** pill is a *filter*, not a show/hide: `NOTES_ONLY` off (default)
  shows all highlights; on shows only highlights that have an attached note.
- **Timeline** — `renderTimeline()`, a date-range slider over `added` dates.
- **Explore data** — `renderExplore()` / `renderConnections()`, vocab & topic
  aggregations, decks-by-tag, evolution chart.
- **Review** — spaced-repetition flashcards. `startReview()` builds a shuffled
  batch (mix of fresh/previously-seen), `drawReviewCard()`/`flipReviewCard()`
  render front/back, `gradeReview()` records a 1–4 grade (`GRADES`: Again/Hard/
  Good/Easy) into `c.review` and `REVIEW_LOG`. Grade 1 ("Again") re-queues the
  card in the same round. Sessions can be saved/resumed per library.

**Anki export** — `clipsForDeck()` / `buildDeckRows()` / `rowsToTsv()` build
Anki-importable TSV; `styleBlock()`+`wrapFront`/`wrapBackVocab`/`wrapBackWiki`
generate the inline-styled card HTML. Decks (`STATE.decks`) are tag filters
(`{vocab, quotes, topic}`) plus an explicit `include[]` list of card ids.

**Import** — `ingest(text, filename, fromSample)` dispatches to `parseClippings`
(the `==========`-delimited Kindle format), `parseHtml`, or `parseCsv` by
extension/content, then dedups and merges. Backup JSON round-trips via
`exportLibraryJson()` / `importLibraryJson()`.

**External APIs** (best-effort, cached in-memory, failures degrade gracefully):
Wikipedia REST summary, Wiktionary (REST + `w/api.php` + `dictionaryapi.dev`
fallback) for definitions/etymology, Tatoeba for example sentences, plus
countapi/ipapi for a visitor counter. These power vocab card backs and term
tooltips — code must tolerate them being slow or unreachable.

## Tags vs. labels (read before touching categories)

There are **two separate things** and they are easy to confuse:

- **Category keys** (the data): `vocab`, `quotes`, `topic`, `none`. These appear as
  `c.cat`, `data-cat="…"`, `deck.tags.quotes`, `CAT_FILTER.quotes`, etc.
  **Never rename a key.** Renaming `quotes`→`quote` breaks filters, decks,
  persistence, and saved libraries.
- **Display labels** (what the user sees): held in `CAT_LABELS` and a few inline
  strings. The agreed labels are: vocab → **"vocab"**, quotes → **"quote"**
  (singular), topic → **"topic of interest"**. The quotes label is the singular
  **"quote"** everywhere (toolbar chip, timeline legend, by-book legend, catpick,
  recap). Do not pluralize it to "quotes".

When the user says "the quote tag should say X", they mean the **label**, not the
key. Change `CAT_LABELS` / inline display strings only; leave `data-cat`,
`c.cat==="quotes"`, `deck.tags`, etc. untouched.

## UI preferences

- **Toggles / segmented controls are rectangular** (small `border-radius`, ~3–4px),
  not pill-shaped. This applies to group switches like the by-book/author toggle,
  deck group-by, S/M/L size toggle, and any similar segmented control added later.

> Editing conventions (small isolated edits, terse hand-minified density, vanilla
> JS, scriptorium aesthetic, CSS-variable theming) live in `.claude/rules/frontend.md`.
