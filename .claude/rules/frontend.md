# .claude/rules/frontend.md
---
paths:
  - "index.html"
  - "styles.css"
  - "css/**/*.css"
  - "js/**/*.js"
---

# Frontend Rules

Marginalia is a browser-based, single-page app: no build, no server, no
dependencies, no framework. It runs from `file://` (double-click) as well as a
static server. CSS lives in `styles.css`; JS lives in `js/*.js` loaded as
classic `<script src>` tags (not modules). Keep it that way.

## Editing

- Make small, targeted edits. Find the relevant section first; don't rewrite
  whole files unless explicitly asked.
- Match the surrounding (terse, hand-minified) code density. Don't reformat.
- Put new CSS in `styles.css` (or a feature CSS file); new JS in a
  feature-specific file in `js/`. Avoid new inline `<style>`/`<script>` blocks.
- Keep features modular and easy to remove.

## JavaScript

- Vanilla JS only; no framework unless explicitly asked.
- Classic scripts, global scope — preserve load order in `index.html`; immediate
  boot code stays in `js/boot.js`, loaded last.
- Touch global state only when necessary. Before changing behavior, locate the
  current function/handler first.

## Visual style

Preserve the scriptorium / illuminated-manuscript aesthetic (serif fonts,
parchment colors, an oil-lamp cursor). Reuse existing CSS
variables (`--paper`, `--ink`, `--accent`, `--muted`, etc.) and the
`[data-mode="light"]` / `[data-mode="dark"]` overrides. New buttons, cards,
inputs, and panels should feel consistent with the existing UI.

## After changes, check

- Page loads via `file://` and via a static server, with no console errors.
- Tabs/buttons still work; search still filters; existing highlights still render.
- Works on desktop and mobile.
