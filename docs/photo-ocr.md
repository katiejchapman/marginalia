# .claude/rules/photo-ocr.md

---
paths:
  - "js/ocr-highlight.js"
  - "js/highlights-api.js"
  - "index.html"
---

# Photo OCR Highlight Feature

Goal:
User clicks Scan Page, phone camera opens, Tesseract.js extracts text in browser, user edits the text, then only confirmed text is saved.

Rules:
- Do not store the original image.
- Use browser-side Tesseract.js for OCR.
- The image may be previewed temporarily with `URL.createObjectURL`.
- Revoke temporary object URLs after OCR.
- Save only confirmed highlight text and metadata.
- The editable textarea is required before saving because OCR may be imperfect.