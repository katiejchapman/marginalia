# .claude/rules/cloudflare-d1.md
---
paths:
  - "functions/**/*.js"
  - "schema.sql"
  - "wrangler.toml"
---

# Cloudflare D1 Rules

- Use Cloudflare Pages Functions for API routes.
- Use D1 for cross-device highlight storage.
- Use prepared statements and bound parameters.
- Do not save uploaded page images.
- API route should support:
  - `GET /api/highlights`
  - `POST /api/highlights`