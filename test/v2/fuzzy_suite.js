// Fuzzy matching (Levenshtein + OCR look-alikes) test suite for scanner V2.
// Every query is a part number or name as OCR might read it. We check:
//   • the right item comes first,
//   • a "strong" (≥85%, "Is it this one?") answer is never a DIFFERENT product,
//   • items that are not in the list never get a strong answer.
const S = require('../../staging/scanner-v2.js');
const fs = require('fs'); const path = require('path');
const P = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pick = a => a[Math.floor(rnd() * a.length)];
const items = P.map((p, i) => { const it = { id: p.id, name: [p.brand, p.part, p.desc, p.color].filter(Boolean).join(' '), unit: 'pc' }; if (i % 2 === 0) { it.brand = p.brand; it.model = p.part; } return it; })
  .concat([{ id: 'g1', name: '3-way switch', unit: 'pc' }, { id: 'g2', name: 'Single pole switch 15A white', unit: 'pc' }, { id: 'g3', name: 'Decora wallplate 2-gang white', unit: 'pc' }, { id: 'g4', name: '20A GFCI receptacle white', unit: 'pc' }, { id: 'g5', name: '4" square box 1-1/2" deep', unit: 'pc' }]);
const LOOK = { '0': 'O', O: '0', '1': 'I', I: '1', '5': 'S', S: '5', '8': 'B', B: '8', '2': 'Z', Z: '2', '6': 'G', G: '6' };
function ocrNoise(s, kind) {
  let a = s.split('');
  if (kind === 'lookalike') { const idx = a.map((c, i) => LOOK[c] ? i : -1).filter(i => i >= 0); if (!idx.length) return null; const i = pick(idx); a[i] = LOOK[a[i]]; if (idx.length > 2 && rnd() < 0.5) { const j = pick(idx); a[j] = LOOK[a[j]] || a[j]; } }
  else if (kind === 'nodash') { if (!s.includes('-')) return null; a = s.replace(/-/g, rnd() < 0.5 ? '' : ' ').split(''); }
  else if (kind === 'lower') a = s.toLowerCase().split('');
  else if (kind === 'drop') { if (s.replace(/[^A-Z0-9]/g, '').length < 6) return null; const i = 1 + Math.floor(rnd() * (a.length - 2)); a.splice(i, 1); }
  else if (kind === 'extra') { a.push(pick(['.', ',', ')', '|'])); }
  else if (kind === 'swap') { if (a.length < 5) return null; const i = 1 + Math.floor(rnd() * (a.length - 3)); [a[i], a[i + 1]] = [a[i + 1], a[i]]; }
  return a.join('');
}
const out = { part: {}, name: {}, notInList: {} }; const inc = (o, k) => o[k] = (o[k] || 0) + 1; const wrong = [];
let total = 0;
// A. part numbers as OCR reads them
for (const p of P) {
  if (!p.part) continue;
  for (const kind of ['exact', 'lookalike', 'lookalike', 'nodash', 'lower', 'drop', 'extra', 'swap']) {
    const q = kind === 'exact' ? p.part : ocrNoise(p.part, kind); if (!q) continue; total++;
    const c = S.matchInventory({ part: S.fixPart(q, p.brand), brand: p.brand }, items);
    const strong = c.filter(x => x.score >= 0.85);
    const res = strong.length ? (strong[0].item.id === p.id ? 'right_first_strong' : 'WRONG_strong') : c[0] && c[0].item.id === p.id ? 'right_first_possible' : c.some(x => x.item.id === p.id) ? 'right_in_list' : 'not_found';
    inc(out.part, kind + ':' + res); inc(out.part, res);
    if (/WRONG/.test(res)) wrong.push({ q, want: p.id, got: strong[0].item.id, why: strong[0].why });
  }
}
// B. product names / descriptions slightly misspelled
const typo = s => { const w = s.split(' '); const i = Math.floor(rnd() * w.length); if (w[i].length > 3) { const k = 1 + Math.floor(rnd() * (w[i].length - 2)); w[i] = w[i].slice(0, k) + w[i].slice(k + 1); } return w.join(' '); };
for (const p of P) {
  for (let t = 0; t < 3; t++) {
    const base = [p.brand, p.desc, p.color].filter(Boolean).join(' '); const q = t === 0 ? base : t === 1 ? typo(base) : typo(typo(base)).toUpperCase(); total++;
    const c = S.matchInventory({ name: q, brand: p.brand }, items); const strong = c.filter(x => x.score >= 0.85);
    // names alone are never strong enough to say "this one" when look-alike siblings exist; count where the right item sits
    const res = strong.length ? (strong[0].item.id === p.id ? 'right_first_strong' : 'WRONG_strong') : c[0] && c[0].item.id === p.id ? 'right_first_possible' : c.some(x => x.item.id === p.id) ? 'right_in_list' : 'not_found';
    inc(out.name, res); if (/WRONG/.test(res)) wrong.push({ q, want: p.id, got: strong[0].item.id, why: strong[0].why });
  }
}
// C. items NOT in the list: their part numbers (and look-alike reads) must never get a strong answer
const NOT = ['5602-2W', '5605-2W', '80405-NW', 'GFNT3-W', 'T5321-W', 'DSL06-1L', 'LB130-T', 'LR25024', 'LR23778', 'DVCL-153P-LA', 'MACL-153M-IV', 'BR125', 'BR240', 'CH115', 'HOM115', 'HOM240', 'QO115', 'HBL5362', '8196', '233', '221-415', 'B120R', 'ST02C', 'i12040', '5603-2I', '5604-2I', '80409-NI', 'LB120-DFT', 'CHFGF115', 'TR274W'];
for (const q0 of NOT) for (const kind of ['exact', 'lookalike', 'lower']) {
  const q = kind === 'exact' ? q0 : ocrNoise(q0, kind); if (!q) continue; total++;
  const c = S.matchInventory({ part: q }, items); const strong = c.filter(x => x.score >= 0.85);
  const res = strong.length ? 'WRONG_strong' : c.length ? 'shown_as_possible_only' : 'none';
  inc(out.notInList, res); if (strong.length) wrong.push({ q, want: '(not in list)', got: strong[0].item.id, why: strong[0].why });
}
// D. Levenshtein / OCR distance unit checks
const unit = [[S.lev('kitten', 'sitting') === 3, 'lev kitten/sitting = 3'], [S.lev('5603', '5630') === 1, 'adjacent swap = 1'], [S.levOCR('56O3-P2W', '5603-P2W') < 0.5, 'O vs 0 is cheap'], [S.levOCR('5603', '5604') === 1, '3 vs 4 is a real difference'],
  [S.skel('LR25O22') === S.skel('LR25022'), 'skeleton folds O/0'], [S.skel('5603') !== S.skel('5604'), 'skeleton keeps 3≠4'], [S.fixPart('56O3-P2W', 'Leviton') === '5603-P2W', 'fix 56O3-P2W'], [S.fixPart('LR25O22', 'Luxrite') === 'LR25022', 'fix LR25O22'],
  [S.fixPart('8O4O9-NW', 'Leviton') === '80409-NW', 'fix 8O4O9-NW'], [S.fixPart('BRI20', 'Eaton') === 'BRI20' || S.fixPart('BRI20', 'Eaton') === 'BR120', 'fix BRI20'], [S.brandFromText('LEVlTON') === 'Leviton', 'maker LEVlTON'], [S.brandFromText('LUTR0N') === 'Lutron', 'maker LUTR0N'], [S.brandFromText('EAT0N') === 'Eaton', 'maker EAT0N'], [S.brandFromText('LUXRlTE') === 'Luxrite', 'maker LUXRlTE'],
  [S.brandFromText('SWITCH GROUNDING') === '', 'no maker invented'], [S.nameSim('3-WAY SWlTCH GROUNDIN', '3-Way Switch Grounding') > 0.8, 'name with OCR errors still similar']];
const unitFail = unit.filter(u => !u[0]).map(u => u[1]);
console.log('FUZZY MATCHING: ' + total + ' queries');
console.log('  part numbers (OCR-damaged):', JSON.stringify(Object.fromEntries(Object.entries(out.part).filter(([k]) => !k.includes(':')))));
console.log('  by damage type:', JSON.stringify(Object.fromEntries(Object.entries(out.part).filter(([k]) => k.includes(':')))));
console.log('  names (misspelled):', JSON.stringify(out.name));
console.log('  NOT in the list:', JSON.stringify(out.notInList));
console.log('  distance unit checks: ' + (unit.length - unitFail.length) + '/' + unit.length + (unitFail.length ? ' FAILED: ' + unitFail.join('; ') : ''));
console.log('  wrong strong answers: ' + wrong.length); wrong.slice(0, 20).forEach(w => console.log('   ✗', JSON.stringify(w)));
fs.writeFileSync(path.join(__dirname, 'out', 'fuzzy_results.json'), JSON.stringify({ total, out, wrong, unit: { n: unit.length, fail: unitFail } }, null, 1));
