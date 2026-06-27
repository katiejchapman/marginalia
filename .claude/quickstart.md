# Quickstart — marginalia

Single-page vanilla-JS book-highlights organizer. **No build, no deps, no server.**
Classic `<script src>` tags (NOT ES modules). Must run from `file://` AND a static server.

## Run
- `open index.html`              — double-click / file:// (primary)
- `python3 -m http.server`       — static server (avoids file:// CORS on API calls)
- Phone scan + relay are hosted-only by nature (OCR worker + KV blocked over file://)

## Test (Playwright, Python, headless)
- `node --check js/<file>.js`            — syntax gate BEFORE any browser run
- `python3 test/backup-indicator-test.py`
- `python3 test/<feature>-test.py`
- file:// OCR test must NOT use `--allow-file-access-from-files`

## Relay backend (Cloudflare Pages Functions)
- `wrangler pages dev . --kv RELAY --port 8788`   — local dev
- KV binding lives in `wrangler.toml` ([[kv_namespaces]] binding="RELAY").
  Pages disables the dashboard binding UI when wrangler.toml is present.

## Git workflow
- Branch: `reorg`; merge target: `main`; remote `origin`.
- Commit/push/merge ONLY when explicitly asked.
- Commit messages MUST end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Never commit `.claude/settings.local.json`.

## Conventions (see CLAUDE.md + .claude/rules/)
- Small isolated edits; match terse hand-minified density.
- Never rename category KEYS (vocab|quotes|topic|none); quote label stays singular "quote".
- Toggles/segmented controls rectangular. Scriptorium aesthetic, reuse CSS vars.
