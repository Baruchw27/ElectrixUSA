// "Before": what the LIVE app's scanner (root index.html, unchanged) would propose for the same 650 label photos.
// The live scanner reads the label once (one OCR pass) and offers the best-looking text line as the item name.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const skip = html.match(/const LBL_SKIP=([^\n]*?);\n/)[1];
const fn = html.match(/function labelLines\(text\)\{[\s\S]*?\n  return out\.sort\(\(a,b\)=>b\.sc-a\.sc\)\.map\(o=>o\.l\)\.slice\(0,4\);\}/)[0];
const labelLines = new Function(`const LBL_SKIP=${skip};${fn};return labelLines;`)();
const P = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8')); const byId = {}; P.forEach(p => byId[p.id] = p);
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'ocr.json'), 'utf8'));
const k = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const res = { name_has_right_part_number: 0, name_without_part_number: 0, nothing_offered: 0, total: M.length };
for (const m of M) {
  const p = byId[m.product]; const lines = labelLines(m.texts.m3 || '');   // the live app runs Tesseract once, default layout
  if (!lines.length) { res.nothing_offered++; continue; }
  if (p.part && k(lines[0]).includes(k(p.part))) res.name_has_right_part_number++; else res.name_without_part_number++;
}
console.log('LIVE APP (before V2) on the same photos:', JSON.stringify(res));
fs.writeFileSync(path.join(__dirname, 'out', 'live_baseline.json'), JSON.stringify(res, null, 1));
