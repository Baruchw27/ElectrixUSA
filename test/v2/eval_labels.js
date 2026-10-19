// Scores the label-photo test set (out/ocr.json from gen_labels.py) with the real scanner V2 code.
// Three situations for every photo:
//   NEW   — the item is not in the garage list yet: does the scanner propose the right maker + part number?
//   KNOWN — the item IS in the list: does "Is it this one?" point at the right item?
//   SIB   — only a look-alike sibling is in the list (5603-2W 3-way vs 5604-2W 4-way): it must NOT say "this one".
const S = require('../../staging/scanner-v2.js');
const fs = require('fs'); const path = require('path');
const P = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8')); const byId = {}; P.forEach(p => byId[p.id] = p);
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', process.env.OCR_FILE || 'ocr.json'), 'utf8'));
const items = P.map((p, i) => {
  const name = [p.brand, p.part, p.desc, p.color].filter(Boolean).join(' ');
  const it = { id: p.id, name: i % 2 ? (p.desc + ' ' + p.brand + ' ' + p.part + ' ' + (p.color || '')).trim() : name, unit: 'pc', qty: 5 };
  if (i % 2 === 0) { it.brand = p.brand; it.model = p.part; }
  return it;
});
// exactly the app's order (scanner-v2-ui.js v2ReadLabel): stop as soon as the reading is sure
const RANK = { high: 3, medium: 2, low: 1 };
const STEPS = process.env.V1_PIPELINE ? [['m6', 'm11', 'm3'], ['r90'], ['r270'], ['r180']] : [['m6', 'm11', 'm3'], ['a6', 'a11'], ['ar90'], ['ar270'], ['ar180'], ['ad-6'], ['ad6']];
function pipeline(m) {
  const tx = m.texts || {}; let text = ''; let lp = null; let passes = 0;
  for (const st of STEPS) {
    if (st.some(k => tx[k] == null)) continue;
    text += '\n' + st.map(k => tx[k]).join('\n'); passes += st.length;
    const l2 = S.parseLabel(text, { code: m.scan });
    if (!lp || l2.conf === 'high' || RANK[l2.conf] > RANK[lp.conf] || (RANK[l2.conf] === RANK[lp.conf] && l2.score > lp.score)) lp = l2;
    if (lp.conf === 'high') break;
  }
  return { lp, text, passes };
}
function candsFor(lp, inv) {
  if (lp.conf !== 'low' && (lp.name || lp.part)) return S.matchInventory(lp, inv);
  return S.matchInventory({ parts: lp.parts, part: lp.parts[0], brand: lp.brand, desc: lp.desc }, inv).filter(c => c.score >= 0.7);
}
const R = { NEW: {}, KNOWN: {}, SIB: {} }; const byCond = {}; const rows = [];
const inc = (o, k) => o[k] = (o[k] || 0) + 1;
for (const m of M) {
  const p = byId[m.product]; const { lp, passes } = pipeline(m);
  // NEW
  let nw;
  if (lp.conf === 'low' || !(lp.name || lp.part)) nw = 'asks';
  else if (p.part) {
    const okPart = S.partKey(lp.part) === S.partKey(p.part); const okBrand = !lp.brand || lp.brand === p.brand;
    nw = okPart && lp.brand === p.brand ? 'correct' : okPart && okBrand ? 'correct_no_maker' : lp.part && !okPart ? 'wrong_part' : !okBrand ? 'wrong_maker' : 'no_part';
  } else {
    const okBrand = !lp.brand || lp.brand === p.brand; const okDesc = S.nameSim(lp.desc || lp.name, p.desc) >= 0.6;
    nw = lp.part ? 'wrong_part' : okBrand && okDesc ? 'correct' : !okBrand ? 'wrong_maker' : 'weak_desc';
  }
  if (/wrong/.test(nw)) nw = nw + (lp.conf === 'high' ? '_SURE' : '_checkit');
  else if (/correct/.test(nw)) nw = nw + (lp.conf === 'high' ? '_sure' : '_checkit');
  inc(R.NEW, nw);
  // KNOWN
  const c1 = candsFor(lp, items); const strong1 = c1.filter(c => c.score >= 0.85);
  let kn = strong1.length ? (strong1[0].item.id === p.id ? 'right_item_first' : 'wrong_item_first') : (c1.some(c => c.item.id === p.id) ? 'right_item_in_list' : (lp.conf === 'low' ? 'asks' : 'not_offered'));
  inc(R.KNOWN, kn);
  // SIB: remove the true item; any strong answer is wrong
  const inv2 = items.filter(x => x.id !== p.id); const c2 = candsFor(lp, inv2); const strong2 = c2.filter(c => c.score >= 0.85);
  const sb = strong2.length ? 'WRONG_strong_sibling' : (c2.length ? 'shown_as_possible_only' : 'none');
  inc(R.SIB, sb);
  (byCond[m.cond] = byCond[m.cond] || { n: 0, NEW: {}, KNOWN: {}, SIB: {} }).n++; inc(byCond[m.cond].NEW, nw); inc(byCond[m.cond].KNOWN, kn); inc(byCond[m.cond].SIB, sb);
  rows.push({ photo: m.name, passes_used: passes, product: p.brand + ' ' + (p.part || p.desc), cond: m.cond, read_maker: lp.brand, read_part: lp.part, conf: lp.conf, name: lp.name, pack_read: lp.pack, pack_true: p.pack, NEW: nw, KNOWN: kn, SIB: sb, top_known: strong1[0] ? strong1[0].item.id : '', passes });
}
const n = M.length;
const pct = (o, k) => (100 * (o[k] || 0) / n).toFixed(1) + '%';
console.log('Label photos:', n, '(' + P.length + ' products × ' + Object.keys(byCond).length + ' photo conditions)');
console.log('\nNEW item (not in list yet):', JSON.stringify(R.NEW));
console.log('KNOWN item (in list):      ', JSON.stringify(R.KNOWN));
console.log('Only a look-alike in list: ', JSON.stringify(R.SIB));
console.log('\nBy photo condition (NEW correct / asks / WRONG):');
Object.keys(byCond).forEach(c => { const b = byCond[c]; const sum = re => Object.keys(b.NEW).filter(k => re.test(k)).reduce((a, k) => a + b.NEW[k], 0); console.log('  ' + c.padEnd(12), String(b.n).padStart(3), ' right', String(sum(/^correct/)).padStart(3), ' asks', String((b.NEW.asks || 0) + (b.NEW.no_part || 0) + (b.NEW.weak_desc || 0)).padStart(3), ' wrong(check-it)', String(sum(/wrong.*checkit/)).padStart(2), ' WRONG(sure)', sum(/_SURE/), ' | known→right', b.KNOWN.right_item_first || 0, ' wrong', b.KNOWN.wrong_item_first || 0, ' | sibling strong', b.SIB.WRONG_strong_sibling || 0); });
const packs = rows.filter(r => r.pack_true > 1); const packOk = packs.filter(r => r.pack_read === r.pack_true).length, packWrong = packs.filter(r => r.pack_read && r.pack_read !== r.pack_true).length;
console.log('\nBox quantity read from label: right', packOk, '/', packs.length, ' wrong', packWrong, ' not read', packs.length - packOk - packWrong);
fs.writeFileSync(path.join(__dirname, 'out', process.env.OUT_FILE || 'label_results.json'), JSON.stringify({ n, summary: R, byCond, packs: { total: packs.length, right: packOk, wrong: packWrong }, rows }, null, 1));
const wrong = rows.filter(r => /wrong/.test(r.NEW) || /wrong/.test(r.KNOWN) || /WRONG/.test(r.SIB));
console.log('\nWrong answers (' + wrong.length + '):'); wrong.slice(0, 40).forEach(r => console.log('  ', r.photo, '| read:', r.read_maker, r.read_part, r.conf, '|', r.NEW, r.KNOWN, r.SIB, r.top_known));
