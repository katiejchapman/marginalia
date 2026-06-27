# Vendored Tesseract.js (offline OCR)

These files are vendored so OCR runs **fully offline over `file://`** — no build
step, no server, no network, no runtime npm dependency. They were fetched once
and committed into the repo; `node_modules` is **not** used at runtime.

## Pinned versions

| Package            | Version | Source (npm registry tarball)                                      |
|--------------------|---------|-------------------------------------------------------------------|
| `tesseract.js`     | 7.0.0   | https://registry.npmjs.org/tesseract.js/-/tesseract.js-7.0.0.tgz   |
| `tesseract.js-core`| 7.0.0   | https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-7.0.0.tgz |
| `eng.traineddata`  | tessdata_fast 4.0.0 | https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz |

## Files and their roles

| File                              | Role                                                              |
|-----------------------------------|------------------------------------------------------------------|
| `tesseract.min.js`                | Browser **UMD build** — the main API (`Tesseract.createWorker`). Load via `<script src>`. |
| `worker.min.js`                   | **Worker script** run inside the Web Worker; does the OCR work.   |
| `tesseract-core-simd-lstm.wasm.js`| **WASM core** glue (SIMD, LSTM-only) — the primary core. Loads the `.wasm` below. |
| `tesseract-core-simd-lstm.wasm`   | WASM core binary (SIMD, LSTM-only).                               |
| `tesseract-core-lstm.wasm.js`     | WASM core glue (non-SIMD, LSTM-only) — **fallback** for browsers without WASM SIMD. |
| `tesseract-core-lstm.wasm`        | WASM core binary (non-SIMD, LSTM-only).                           |
| `eng.traineddata.gz`              | **English language data** (gzipped). Trained model Tesseract reads. |
| `*.LICENSE.txt`, `tesseract-core.LICENSE` | Upstream licenses (Apache-2.0).                          |

## Notes for the (future) implementation

- The worker auto-selects among 6 core variants via WASM feature-detect
  (`relaxedsimd` → `simd` → base, each × lstm). That auto-select **fetches from a
  CDN by default and will request a variant we did not vendor** (e.g.
  `relaxedsimd`). For offline use, pin `corePath` to an **exact** vendored file
  (`js/vendor/tesseract/tesseract-core-simd-lstm.wasm.js`) so feature-detect is
  bypassed; use `tesseract-core-lstm.wasm.js` for the non-SIMD fallback.
- Set `workerPath` → `js/vendor/tesseract/worker.min.js` and `langPath` →
  `js/vendor/tesseract/` (so it loads `eng.traineddata.gz` locally).
- We vendored only the **LSTM-only** cores (smaller; match tesseract.js's default
  `OEM.LSTM_ONLY`). Keep OEM at the default LSTM-only — the legacy/combined OEMs
  need the larger full cores, which are intentionally not vendored.
- Source maps (`*.map`), ESM build, and the relaxedsimd/full/legacy core variants
  were intentionally omitted to keep the repo lean.

To re-vendor a new version, bump the versions above, re-fetch the npm tarballs and
`eng.traineddata.gz`, and replace these files. Do not add a runtime npm dependency.
