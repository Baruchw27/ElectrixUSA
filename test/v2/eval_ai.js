// AI (Claude Haiku, reading the photo) vs the app's own label reading (Tesseract OCR + rules), same 78 photos.
// The AI answers were produced by Claude Haiku subagents in this test workspace (NOT through the app's AI function),
// with the exact instruction the app sends (SV2.AI_PROMPT). Run: node eval_ai.js <dir with ai_out_*.json>
const fs = require('fs'), path = require('path'); const S = require('../../staging/scanner-v2.js');
const dir = process.argv[2]; const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/ai_eval_set.json')));
const ai = {}; for (const f of fs.readdirSync(dir).filter(f => /^ai_out_\d+\.json$/.test(f))) JSON.parse(fs.readFileSync(path.join(dir, f))).forEach(x => ai[x.img] = x);
const ocrS = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/ocr.json'))); const ocrR = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/real_ocr.json')));
const txt = {}; ocrS.forEach(o => txt[o.name] = Object.values(o.texts || {}).join('\n')); ocrR.forEach(o => txt[o.name] = Object.values(o.texts || {}).join('\n'));
const pk = (s) => S.partKey(S.normPart(s || ''));
const rows = []; const T = { synthetic: {}, real: {} };
const inc = (s, k) => { T[s][k] = (T[s][k] || 0) + 1; };
for (const it of set) {
  const a = ai[it.img]; const truePart = it.product.split(' ').slice(1).join(' ').trim() || it.product;
  const want = pk(truePart.replace(/^(Square D|Wire)\s+/, '')); const s = it.set;
  inc(s, 'n');
  const aiPart = a ? pk(a.part) : ''; const aiRight = !!aiPart && (aiPart === want || want.endsWith(aiPart) && aiPart.length >= 5);
  const chk = a ? S.checkAI(a, txt[it.id] || '', null) : null; // the app only trusts an AI part number it can also find in the OCR text
  inc(s, aiRight ? 'ai_right' : aiPart ? 'ai_wrong' : 'ai_blank');
  if (chk && chk.verified) inc(s, aiRight ? 'ai_verified_right' : 'ai_verified_WRONG');
  const ocrRight = /^correct|right/.test(it.ocr_NEW) || (it.ocr_part && pk(it.ocr_part) === want);
  const ocrSure = /sure/i.test(it.ocr_NEW) || it.ocr_conf === 'high';
  inc(s, ocrRight ? 'ocr_right' : 'ocr_not');
  if (!ocrRight && aiRight) inc(s, 'ai_fixes_ocr_miss'); if (ocrRight && !aiRight) inc(s, 'ai_misses_ocr_hit');
  if (!ocrRight && !ocrSure && aiRight && chk && chk.verified) inc(s, 'ai_rescues_with_label_check');
  if (it.pack_true > 1) { inc(s, 'pack_n'); if (a && +a.pack === it.pack_true) inc(s, 'ai_pack_right'); else if (a && +a.pack > 0) inc(s, 'ai_pack_wrong'); }
  rows.push({ id: it.id, set: s, truth: truePart, ocr: it.ocr_part + ' (' + it.ocr_NEW + ')', ai: a ? a.part : null, ai_brand: a ? a.brand : null, ai_pack: a ? a.pack : null, aiRight, verified: !!(chk && chk.verified) });
}
const out = { totals: T, rows }; fs.writeFileSync(path.join(__dirname, 'out/ai_eval_results.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(T, null, 1)); console.log(rows.filter(r => !r.aiRight).map(r => `${r.id}: truth ${r.truth} | AI ${r.ai} | OCR ${r.ocr}`).join('\n'));
