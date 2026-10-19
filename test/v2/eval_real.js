// Real garage photos through scanner V2's exact label-reading order (see eval_labels.js)
const S = require('../../staging/scanner-v2.js'); const fs = require('fs'); const path = require('path');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'real_ocr.json'), 'utf8'));
const RANK = { high: 3, medium: 2, low: 1 };
const STEPS = [['m6', 'm11', 'm3'], ['a6', 'a11'], ['ar90'], ['ar270'], ['ar180'], ['ad-6'], ['ad6']];
const P = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
// the synthetic catalog already has these three parts — leave those copies out so the list holds each part once
const inv = P.filter(p => !['5603-P2W', '80409-NW', 'LR25022'].includes(p.part)).map(p => ({ id: p.id, name: [p.brand, p.part, p.desc, p.color].filter(Boolean).join(' ') })).concat([
  { id: 'real-5603P2W', name: 'Leviton 3-way switch white contractor pack', model: '5603-P2W', brand: 'Leviton' },
  { id: 'real-80409NW', name: 'Leviton 2-gang decora plate white', model: '80409-NW', brand: 'Leviton' },
  { id: 'real-LR25022', name: 'Luxrite 2in round trim white', model: 'LR25022', brand: 'Luxrite' }]);
const rows = [];
for (const m of M) {
  let text = '', lp = null, used = 0;
  for (const st of STEPS) { text += '\n' + st.map(k => m.texts[k] || '').join('\n'); used += st.length; const l2 = S.parseLabel(text, { code: m.scan }); if (!lp || l2.conf === 'high' || RANK[l2.conf] > RANK[lp.conf] || (RANK[l2.conf] === RANK[lp.conf] && l2.score > lp.score)) lp = l2; if (lp.conf === 'high') break; }
  const t = m.truth; const okPart = S.partKey(lp.part) === S.partKey(t.part);
  const res = lp.conf === 'low' ? 'asks' : okPart && lp.brand === t.brand ? 'correct' : 'WRONG';
  const pc = S.parseCode(m.scan);
  const cands = lp.conf !== 'low' && (lp.name || lp.part) ? S.matchInventory(lp, inv) : S.matchInventory({ parts: lp.parts, part: lp.parts[0], brand: lp.brand, desc: lp.desc }, inv).filter(c => c.score >= 0.7);
  const want = 'real-' + t.part.replace(/-/g, ''); const strong = cands.filter(c => c.score >= 0.85);
  const known = strong.length ? (strong[0].item.id === want ? 'right_item_first' : 'WRONG_ITEM') : cands.some(c => c.item.id === want) ? 'right_item_in_list' : 'asks';
  rows.push({ photo: m.name, known, result: res, conf: lp.conf, name: lp.name, part: lp.part, maker: lp.brand, box_qty_read: lp.pack, box_qty_true: t.pack, passes: used, barcode: pc.type + ' ' + pc.level });
}
rows.forEach(r => console.log((r.result === 'correct' ? '✓' : r.result === 'asks' ? '?' : '✗') + ' ' + r.photo.padEnd(28) + ' ' + r.result.padEnd(8) + ' ' + r.conf.padEnd(7) + ' ' + (r.name || '(asks the person)').slice(0, 60) + (r.box_qty_true ? '  box qty read: ' + (r.box_qty_read || '—') + '/' + r.box_qty_true : '') + '  [' + r.passes + ' passes]  | already in list → ' + r.known));
const c = k => rows.filter(r => r.result === k).length;
console.log('REAL PHOTOS: ' + rows.length + ' — new item: correct ' + c('correct') + ', asks ' + c('asks') + ', wrong(check-it) ' + c('WRONG') + ' | already in list: right item first ' + rows.filter(r => r.known === 'right_item_first').length + ', right item in list ' + rows.filter(r => r.known === 'right_item_in_list').length + ', asks ' + rows.filter(r => r.known === 'asks').length + ', WRONG item ' + rows.filter(r => r.known === 'WRONG_ITEM').length);
fs.writeFileSync(path.join(__dirname, 'out', 'real_results.json'), JSON.stringify(rows, null, 1));
