// Barcode + product-memory test suite for scanner V2 (pure logic, runs in Node). Prints every failure.
const S = require('../../staging/scanner-v2.js');
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0; const fails = []; const groups = {};
function chk(group, name, cond, extra) { groups[group] = groups[group] || { pass: 0, fail: 0 }; if (cond) { pass++; groups[group].pass++; } else { fail++; groups[group].fail++; fails.push(group + ': ' + name + (extra ? ' → ' + JSON.stringify(extra) : '')); } }
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const dig = n => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
const prefixes = ['078477', '793888', '027557', '782113', '785901', '783643', '032664', '085267', '012345', '614141'];

// 1. valid codes of every kind are read, keyed the same way, and get the right level
for (let i = 0; i < 120; i++) {
  const pre = prefixes[i % prefixes.length]; const b11 = (pre + dig(5)); const upc = b11 + S.ck(b11);
  const a = S.parseCode(upc), e13 = S.parseCode('0' + upc), g14 = S.parseCode('00' + upc);
  chk('read UPC-A / EAN-13 / GTIN-14', 'UPC-A ' + upc, a.ok && a.type === 'UPC-A' && a.level === 'each' && a.key === '00' + upc, a);
  chk('read UPC-A / EAN-13 / GTIN-14', 'same item as EAN-13 and GTIN-14 ' + upc, e13.key === a.key && g14.key === a.key);
  const ind = String(1 + (i % 8)); const b13 = ind + '0' + b11; const box = b13 + S.ck(b13); const bx = S.parseCode(box, i % 2 ? 'itf' : '');
  chk('box barcodes', 'box ' + box, bx.ok && bx.level === 'box' && bx.family === a.key && bx.key !== a.key, bx);
  const gs = S.parseCode('(01)' + box + '(37)' + (10 + i));
  chk('box barcodes', 'GS1-128 with count ' + box, gs.ok && gs.key === box && gs.count === 10 + i && gs.type === 'GS1-128', gs);
  const gs2 = S.parseCode(']C101' + box + '37' + (5 + i));
  chk('box barcodes', 'GS1-128 raw (no brackets) ' + box, gs2.ok && gs2.key === box && gs2.count === 5 + i, gs2);
  const e = '4' + dig(11); const ean = e + S.ck(e); const pe = S.parseCode(ean);
  chk('read UPC-A / EAN-13 / GTIN-14', 'EAN-13 ' + ean, pe.ok && pe.type === 'EAN-13' && pe.key === '0' + ean, pe);
}
// 2. UPC-E: build UPC-E codes, check they expand to the right UPC-A, and that both spellings are the same item
let ue = 0;
for (let i = 0; i < 400 && ue < 100; i++) {
  const s = rnd() < 0.5 ? '0' : '1'; const d = dig(6); const a = S.upcEtoA(s + d + '0'); // find the right check digit
  for (let c = 0; c < 10; c++) { const code = s + d + c; const A = S.upcEtoA(code); if (A) { ue++; const p = S.parseCode(code, 'upc_e'); const pa = S.parseCode(A); chk('UPC-E', 'UPC-E ' + code + ' = ' + A, p.ok && p.type === 'UPC-E' && p.key === pa.key, { p: p.key, pa: pa.key }); break; } }
  void a;
}
// known published UPC-E examples
[['04252614', '042100005264']].forEach(([e, a]) => chk('UPC-E', 'expand ' + e, S.upcEtoA(e) === a, S.upcEtoA(e)));
// 3. EAN-8
for (let i = 0; i < 40; i++) { const b = '9' + dig(6); const c = b + S.ck(b); const p = S.parseCode(c, 'ean_8'); chk('EAN-8', 'EAN-8 ' + c, p.ok && p.type === 'EAN-8' && p.key === '000000' + c, p); }
// 4. Code 128 / Code 39 text
['5603-P2W', 'LR25022', 'DVCL-153P-WH', 'HOM120', 'JOB-4471', 'BIN A12', 'ELX-000231'].forEach(t => { const p = S.parseCode(t, 'code_128'); chk('Code 128 text', t, p.ok && p.type === 'Code 128' && p.key === 'C:' + t.toUpperCase().replace(/\s+/g, ''), p); });
['1234567', '123456789012345678'].forEach(t => { const p = S.parseCode(t, 'code_128'); chk('Code 128 text', 'numeric ' + t, p.ok && p.key === 'C:' + t, p); });
// 5. a misread (any one digit wrong) is ALWAYS rejected, never guessed
let wrongDigit = 0, caught = 0;
for (let i = 0; i < 300; i++) {
  const b11 = prefixes[i % 10] + dig(5); const upc = b11 + S.ck(b11);
  const pos = Math.floor(rnd() * 12); const nd = (+upc[pos] + 1 + Math.floor(rnd() * 9)) % 10; const bad = upc.slice(0, pos) + nd + upc.slice(pos + 1);
  wrongDigit++; const p = S.parseCode(bad); if (!p.ok && p.reason === 'check') caught++;
  chk('misreads rejected', 'one digit wrong ' + bad, !p.ok && p.reason === 'check', p);
}
let swaps = 0, swapCaught = 0;
for (let i = 0; i < 200; i++) {
  const b11 = prefixes[i % 10] + dig(5); const upc = b11 + S.ck(b11); const pos = Math.floor(rnd() * 11);
  if (upc[pos] === upc[pos + 1] || Math.abs(upc[pos] - upc[pos + 1]) === 5) continue; // mod-10 can't see these swaps (a known GS1 limit)
  const bad = upc.slice(0, pos) + upc[pos + 1] + upc[pos] + upc.slice(pos + 2); swaps++; const p = S.parseCode(bad); if (!p.ok) swapCaught++;
  chk('misreads rejected', 'two digits swapped ' + bad, !p.ok, p);
}
chk('misreads rejected', 'wrong length for UPC/EAN', !S.parseCode('0784773396', 'upc_a').ok);
chk('misreads rejected', 'empty', !S.parseCode('').ok);
chk('misreads rejected', 'box code with bad check', !S.parseCode('30078477644688').ok);
// 6. makers from the company number (only numbers confirmed from real Electrix scans)
chk('maker from barcode', 'Leviton single', S.brandFromCode('078477339640') === 'Leviton');
chk('maker from barcode', 'Leviton box', S.brandFromCode('30078477339641') === 'Leviton');
chk('maker from barcode', 'Luxrite', S.brandFromCode('793888426948') === 'Luxrite');
chk('maker from barcode', 'Lutron (real Diva UPC)', S.brandFromCode('027557003056') === 'Lutron');
chk('maker from barcode', 'Eaton (real BR120 UPC)', S.brandFromCode('786676362108') === 'Eaton');
chk('maker from barcode', 'unknown maker → no guess', S.brandFromCode('012345678905') === '');
{ const it = [{ id: 'a', brand: 'Lutron', codes: ['027557' + '12345' + S.ck('02755712345')] }, { id: 'b', brand: 'Lutron', codes: ['027557' + '54321' + S.ck('02755754321')] }];
  const L = S.learnPrefixes(it, []); chk('maker from barcode', 'learned after 2 confirmed items', L['027557'] === 'Lutron', L);
  const L1 = S.learnPrefixes(it.slice(0, 1), []); chk('maker from barcode', 'not learned from 1 item', !L1['027557'], L1);
  const it3 = it.concat([{ id: 'c', brand: 'Eaton', codes: ['027557' + '11111' + S.ck('02755711111')] }]); const L3 = S.learnPrefixes(it3, []); chk('maker from barcode', 'not learned when makers disagree', !L3['027557'], L3); }

// 7. product memory: identify()
const sw = { id: 's1', name: 'Leviton 5603-2W 3-Way Switch White', unit: 'pc', qty: 30 };
const sw4 = { id: 's2', name: 'Leviton 5604-2W 4-Way Switch White', unit: 'pc', qty: 12 };
const upc3 = '078477' + '10037' + S.ck('07847710037'), upc4 = '078477' + '10038' + S.ck('07847710038');
const box3 = '20' + '07847710037'; const box3c = box3 + S.ck(box3);
const maps = {}; const link = (code, item, pack) => { const pc = S.parseCode(code); maps[S.linkId(pc)] = { code: pc.key, item, pack, level: pc.level }; };
link(upc3, 's1', 1);
const ctx = { items: [sw, sw4], maps };
let r = S.identify(upc3, ctx); chk('product memory', 'confirmed barcode → instant', r.status === 'known' && r.item.id === 's1' && r.pack === 1, r.status);
r = S.identify('0' + upc3, ctx); chk('product memory', 'same barcode read as EAN-13 → instant', r.status === 'known' && r.item.id === 's1');
r = S.identify(upc4, ctx); chk('product memory', 'neighbour number (next product) is NOT the same item', r.status === 'new', r.status);
r = S.identify(box3c, ctx); chk('product memory', 'box of a known item → ASK (family), never automatic', r.status === 'family' && r.candidates[0].item.id === 's1' && r.candidates[0].rel === 'box-of', r.status);
link(box3c, 's1', 10); r = S.identify(box3c, ctx); chk('product memory', 'after confirming the box → instant, 10 per box', r.status === 'known' && r.pack === 10);
chk('product memory', 'box count: 3 boxes of 10 = 30', S.unitsFor(3, 10) === 30 && S.unitsFor(1, null) === 1 && S.unitsFor(0, 10) === 0);
{ const c2 = { items: [sw, sw4], maps: {} }; const pc = S.parseCode(box3c); c2.maps[S.linkId(pc)] = { code: pc.key, item: 's1', pack: null, level: 'box' };
  const r2 = S.identify(box3c, c2); chk('product memory', 'box linked but size unknown → pack null (scanner asks size)', r2.status === 'known' && r2.pack === null, r2.pack); }
sw4.codes = [upc3]; // same barcode also saved on a 2nd item (old list on the item, or another phone's mistake)
r = S.identify(upc3, ctx); delete sw4.codes; chk('product memory', 'barcode on 2 items → CONFLICT, person picks', r.status === 'conflict' && r.candidates.length === 2, r.status);
{ const legacy = { id: 'old', name: 'GFCI old item', codes: ['0078477714836'] }; const r3 = S.identify('078477714836', { items: [legacy], maps: {} }); chk('product memory', 'older V1 barcode list on items still works', r3.status === 'known' && r3.item.id === 'old'); }
{ const del = { id: 'd', name: 'deleted', codes: ['0078477714836'], deleted: true }; const r4 = S.identify('078477714836', { items: [del], maps: {} }); chk('product memory', 'deleted item is never matched', r4.status === 'new'); }
{ const pc = S.parseCode(box3c); chk('product memory', 'same new-item id on every phone (no duplicates)', S.newItemId(pc) === S.newItemId(S.parseCode(box3c)) && S.newItemId(pc) === S.newItemId(S.parseCode(upc3)), [S.newItemId(pc), S.newItemId(S.parseCode(upc3))]);
  chk('product memory', 'same link id on every phone', S.linkId(pc) === S.linkId(S.parseCode('(01)' + box3c))); }
// different products whose numbers differ by one digit, 200 pairs: never the same
for (let i = 0; i < 200; i++) {
  const b = prefixes[i % 10] + dig(5); const a = b + S.ck(b); let b2 = b.slice(0, 10) + ((+b[10] + 1) % 10); const c = b2 + S.ck(b2);
  const m = {}; const pa = S.parseCode(a); m[S.linkId(pa)] = { code: pa.key, item: 'x', pack: 1 };
  const rr = S.identify(c, { items: [{ id: 'x', name: 'X' }], maps: m }); chk('similar numbers ≠ same product', a + ' vs ' + c, rr.status === 'new', rr.status);
}
console.log('BARCODE + MEMORY: ' + pass + ' passed, ' + fail + ' failed');
Object.keys(groups).forEach(g => console.log('  ' + g.padEnd(34), groups[g].pass + ' passed', groups[g].fail ? groups[g].fail + ' FAILED' : ''));
console.log('  one-digit misreads caught: ' + caught + '/' + wrongDigit + '; swapped digits caught: ' + swapCaught + '/' + swaps);
fails.slice(0, 30).forEach(f => console.log('  ✗ ' + f));
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'barcode_results.json'), JSON.stringify({ pass, fail, groups, fails, misreads: { caught, wrongDigit, swapCaught, swaps } }, null, 1));
process.exitCode = fail ? 1 : 0;
