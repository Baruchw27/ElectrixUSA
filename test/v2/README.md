# Scanner V2 — automated tests (staging only)

| File | What it tests | Run |
|---|---|---|
| `barcode_suite.js` | 1,556 checks: UPC-A, UPC-E, EAN-8, EAN-13, GTIN-14 / ITF-14 box codes, GS1-128 (with counts), Code 128 text; every one-digit misread and swapped digits rejected; makers from company numbers; product memory (confirmed → instant, box ↔ single asks first, conflicts, deleted items, 200 neighbouring numbers never merged) | `node barcode_suite.js` |
| `fuzzy_suite.js` | 591 Levenshtein / OCR look-alike queries: damaged part numbers, misspelled names, and 90 part numbers that are NOT in the list (must never get "Is it this one?") | `node fuzzy_suite.js` |
| `gen_labels.py` + `eval_labels.js` | 650 label photos (50 products × 13 conditions: clean, light/heavy blur, tilted, turned 90°/180°, dark, overexposed, shadow, noise+JPEG, half covered, low resolution, small packaging) read with the real Tesseract engine in the app's exact pass order | `python3 gen_labels.py && node eval_labels.js` (~1 h for the OCR) |
| `real_photos.py` + `eval_real.js` | Baruch's 3 real garage photos × 6 versions (as taken, turned, blurry, dark, far away, tilted) | `python3 real_photos.py && node eval_real.js` |
| `eval_live_baseline.js` | What the LIVE (pre-V2) scanner offers for the same 650 photos | `node eval_live_baseline.js` |
| `t_v2_flows.py` | 49 browser checks of every scanner screen on the staging app | `python3 t_v2_flows.py` |
| `t_v2_twophones.py` | Two worker phones at once + offline, real sync code against the local stand-in server | `python3 t_v2_twophones.py` |
| `../../tests/stock_regression_v2_scanner.sql` | Server stock rules on the staging database (rolled back) | run in the staging SQL editor |
