# Common Mistakes — marginalia (learn from these)

## Architecture / constraints
- DON'T use ES modules / import-export / a build step — breaks file:// and inline onclick. Classic scripts only.
- Immediate top-level code goes in js/boot.js (loaded last). Putting it in app.js → "X is not defined".
- Never rename category KEYS (vocab|quotes|topic|none). Only CAT_LABELS display strings change.
  The quotes label is singular "quote" everywhere — don't pluralize.

## Data / identity
- fp collision bug: scanned/manual clips that set loc=page share type|title|author|loc →
  second one staged as "incoming" edit instead of added. FIX: give each a UNIQUE synthetic loc.
- Synthetic loc then leaked into the card location slot → FIX: hide loc matching /^(manual|scan|handoff)/.
- Deleting a highlight must also delete its orphan note(s) (paired by locKey within the book).

## Relay / hosted
- KV binding "RELAY" must be in wrangler.toml — Pages DISABLES the dashboard binding UI when the file exists.
  Symptom of missing binding: 503 "KV binding 'RELAY' is not configured" / "no database found".
- tesseract OCR worker is blocked over file:// (Chrome/Safari) — /scan is hosted-only by nature.
- Relay code TTL = 5 minutes (300s). (Was wrongly set to 10 once.)

## Process
- Edit tool fails "File has not been read yet" after a compaction — Read the region again before editing.
- Don't commit .claude/settings.local.json. Commit/push/merge only when asked.
- macOS TCC can revoke ~/Documents access mid-session → every file op returns "Operation not permitted".
  Fix: grant terminal/Claude Code Full Disk Access (or Files & Folders → Documents), or move repo out of ~/Documents.
- receiveHandoff(payload,batch) takes the clip object or an array directly — NOT {items:[...]}.
