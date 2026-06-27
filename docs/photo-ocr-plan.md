# docs/photo-ocr-plan.md
# Photo OCR Feature Plan

Flow:
1. User clicks "Scan page".
2. Browser opens camera/photo picker.
3. User takes a photo.
4. Tesseract.js runs OCR in the browser.
5. Extracted text appears in editable textarea.
6. User corrects text.
7. User adds book title, author, page, tags, and note.
8. User clicks Save.
9. Confirmed text is sent to `/api/highlights`.
10. Cloudflare Function saves it to D1.
11. Photo is discarded.
12. Highlight appears across devices.

Files:
- `index.html`: scanner UI
- `styles.css`: scanner styling
- `js/ocr-highlight.js`: camera + OCR
- `js/highlights-api.js`: save/load
- `functions/api/highlights.js`: backend API
- `schema.sql`: database schema