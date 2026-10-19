/* Electrix USA — Smart Inventory Scanner V2: core logic (no screens here; works in the browser and in Node tests).
 *
 * Rules this file enforces:
 *  • A barcode is only trusted when its check digit is right. A bad read is rejected, never guessed.
 *  • Only a barcode someone already CONFIRMED identifies an item instantly. Everything else is a suggestion.
 *  • A box barcode and the single-item barcode share a "family" number, but they are only linked once a person
 *    confirms it — similar numbers alone never mean "same product".
 *  • Fuzzy (Levenshtein) matching only produces "possible matches" to tap. It never picks or merges on its own.
 *  • When nothing is identified, no name is made up: the result says "unknown" and the person types it.
 */
(function (root) {
  'use strict';

  // ───────────────────────── barcodes ─────────────────────────
  function ck(body) { // GS1 mod-10 check digit for the digits before it
    let s = 0; for (let i = 0; i < body.length; i++) s += (+body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    return String((10 - s % 10) % 10);
  }
  function validGS1(code) { return /^\d{8,14}$/.test(code) && ck(code.slice(0, -1)) === code.slice(-1); }
  function upcEtoA(e) { // 8-digit UPC-E (number system + 6 + check) → 12-digit UPC-A, or '' when not valid UPC-E
    if (!/^[01]\d{7}$/.test(e)) return '';
    const s = e[0], d = e.slice(1, 7), c = e[7], L = d[5]; let m, p;
    if (L <= '2') { m = d[0] + d[1] + L + '00'; p = '00' + d[2] + d[3] + d[4]; }
    else if (L === '3') { m = d[0] + d[1] + d[2] + '00'; p = '000' + d[3] + d[4]; }
    else if (L === '4') { m = d[0] + d[1] + d[2] + d[3] + '0'; p = '0000' + d[4]; }
    else { m = d.slice(0, 5); p = '0000' + L; }
    const a = s + m + p; return ck(a) === c ? a + c : '';
  }
  const SYM_ID = /^\][A-Za-z][0-9A-Za-z]/; // ]C1 ]E0 ]I1 … symbology prefix some scanners add
  const FMT = { ean_13: 'EAN-13', ean_8: 'EAN-8', upc_a: 'UPC-A', upc_e: 'UPC-E', itf: 'ITF-14', code_128: 'Code 128', code_39: 'Code 39', qr_code: 'QR',
    EAN_13: 'EAN-13', EAN_8: 'EAN-8', UPC_A: 'UPC-A', UPC_E: 'UPC-E', ITF: 'ITF-14', CODE_128: 'Code 128', CODE_39: 'Code 39', QR_CODE: 'QR' };
  // GS1-128 / GS1 QR: (01) GTIN, (30)/(37) count inside
  function gs1AIs(s) {
    const out = {}; let t = s.replace(/\u001d/g, '|');
    if (/\(\d{2,4}\)/.test(t)) { const re = /\((\d{2,4})\)([^(|]*)/g; let m; while ((m = re.exec(t))) out[m[1]] = m[2].trim(); return out; }
    if (/^01\d{14}/.test(t)) {
      out['01'] = t.slice(2, 16); let r = t.slice(16);
      while (r.length) {
        if (r[0] === '|') { r = r.slice(1); continue; }
        const ai2 = r.slice(0, 2);
        if (['11', '13', '15', '17'].includes(ai2)) { out[ai2] = r.slice(2, 8); r = r.slice(8); continue; }
        if (['10', '21', '30', '37'].includes(ai2)) { const i = r.indexOf('|', 2); out[ai2] = i < 0 ? r.slice(2) : r.slice(2, i); r = i < 0 ? '' : r.slice(i + 1); continue; }
        break;
      }
    }
    return out;
  }
  /* parseCode(raw, format) → {
   *   ok, raw, type, key (what we store/look up), gtin (14 digits, numeric codes only),
   *   level: 'each' | 'box' | 'unknown', ind (packaging digit), family (the 'each'-level GTIN of the same number family),
   *   count (items inside, only when the barcode itself says so — GS1 AI 30/37), reason (when !ok) }
   */
  function parseCode(raw, format) {
    let s = String(raw == null ? '' : raw).trim().replace(SYM_ID, '');
    const fmt = FMT[format] || (format ? String(format) : '');
    const res = { ok: false, raw: String(raw == null ? '' : raw), type: fmt || '', key: '', gtin: '', level: 'unknown', ind: '', family: '', count: null, reason: '' };
    if (!s) { res.reason = 'empty'; return res; }
    // GS1 application identifiers
    if (/^\(01\)|^01\d{14}(\D|$|\d{2})|\u001d/.test(s) && !/^\d{14}$/.test(s)) {
      const ai = gs1AIs(s);
      if (ai['01'] && /^\d{14}$/.test(ai['01'])) { const r = parseCode(ai['01']); r.type = 'GS1-128'; r.raw = res.raw; const n = +(ai['37'] || ai['30'] || 0); if (n > 0) r.count = n; return r; }
    }
    const d = s.replace(/[\s-]/g, '');
    if (/^\d+$/.test(d)) {
      let g = '';
      if (d.length === 8) {
        const a = upcEtoA(d), e8ok = validGS1(d);
        if (fmt === 'UPC-E' || (!e8ok && a) || (a && fmt !== 'EAN-8')) { if (!a) { res.reason = 'check'; return res; } g = '00' + a; res.type = 'UPC-E'; }
        else if (e8ok) { g = '000000' + d; res.type = 'EAN-8'; }
        else { res.reason = 'check'; return res; }
      } else if (d.length === 12) { if (!validGS1(d)) { res.reason = 'check'; return res; } g = '00' + d; res.type = res.type && res.type !== 'EAN-13' ? res.type : 'UPC-A'; }
      else if (d.length === 13) { if (!validGS1(d)) { res.reason = 'check'; return res; } g = '0' + d; res.type = d[0] === '0' ? 'UPC-A' : 'EAN-13'; }
      else if (d.length === 14) { if (!validGS1(d)) { res.reason = 'check'; return res; } g = d; res.type = res.type || 'GTIN-14'; if (res.type !== 'GTIN-14' && res.type !== 'ITF-14' && res.type !== 'GS1-128') res.type = 'GTIN-14'; }
      else if (d.length > 14 || d.length < 6) { // plain numeric Code 128 / internal number: no check digit to test
        if (fmt && /UPC|EAN|ITF/.test(fmt)) { res.reason = 'length'; return res; }
        res.ok = true; res.type = fmt || 'Code 128'; res.key = 'C:' + d; return res;
      } else { // 6, 7, 9, 10, 11 digits: only Code 128/39 can carry these
        if (fmt && /UPC|EAN|ITF/.test(fmt)) { res.reason = 'length'; return res; }
        res.ok = true; res.type = fmt || 'Code 128'; res.key = 'C:' + d; return res;
      }
      res.ok = true; res.gtin = g; res.key = g; res.ind = g[0];
      if (g[0] === '0') { res.level = 'each'; res.family = g; }
      else if (g[0] >= '1' && g[0] <= '8') { res.level = 'box'; const b = '0' + g.slice(1, 13); res.family = b + ck(b); }
      else { res.level = 'unknown'; res.family = ''; } // 9 = variable measure
      if (g[0] === '0' && g.startsWith('00') && res.type === 'UPC-A') res.type = 'UPC-A';
      return res;
    }
    // letters: Code 128 / Code 39 text (often a part number or an internal label)
    const t = s.toUpperCase().replace(/\s+/g, '');
    if (t.length < 3 || t.length > 48 || /[^\x20-\x7e]/.test(t)) { res.reason = 'unreadable'; return res; }
    res.ok = true; res.type = fmt || 'Code 128'; res.key = 'C:' + t; res.text = t; return res;
  }
  // company number (UPC/EAN prefix) of a numeric GTIN, as the 6-digit UPC-A prefix when it is a UPC
  function prefix6(gtin) { if (!/^\d{14}$/.test(gtin)) return ''; return gtin.slice(1, 2) === '0' ? gtin.slice(2, 8) : ''; }

  // ───────────────────────── manufacturers ─────────────────────────
  // Company numbers confirmed from real Electrix scans and labels (not guessed). More are learned from confirmed items.
  // (Lutron 027557 = DVCL-153P-WH UPC 027557003056, Eaton 786676 = BR120 UPC 786676362108, both from an Elliott Electric
  //  supply listing, Oct 2026. Eaton/Cooper use several company numbers — the others are learned from confirmed items.)
  const PREFIX_BRANDS = { '078477': 'Leviton', '793888': 'Luxrite', '085267': 'Honeywell', '194159': 'Honeywell', '027557': 'Lutron', '786676': 'Eaton' };
  // Names recognized on labels (OCR-tolerant). Short names only match exactly as their own word.
  const BRANDS = ['Leviton', 'Lutron', 'Eaton', 'Cooper', 'Cutler-Hammer', 'Luxrite', 'Square D', 'Schneider', 'Siemens', 'GE', 'Hubbell', 'Raco', 'Bell',
    'Pass & Seymour', 'Legrand', 'Southwire', 'Cerro', 'Encore', 'Halo', 'Lithonia', 'Juno', 'Carlon', 'Arlington', 'Intermatic', 'Honeywell', 'Wago',
    'Ideal', 'Klein', 'Greenlee', 'Milwaukee', '3M', 'Gardner Bender', 'Thomas & Betts', 'Bridgeport', 'Cantex', 'Westgate', 'Nicor', 'Satco', 'Sylvania',
    'Philips', 'Feit', 'Keystone', 'Topaz', 'Orbit', 'Madison', 'Taymac', 'Steel City', 'Allied', 'Coleman', 'RAB', 'Cree', 'Commercial Electric',
    'Elite', 'Liteline', 'Globe', 'Ecobee', 'Nest', 'Kidde', 'First Alert', 'BRK', 'Panasonic', 'Broan', 'NuTone', 'Air King', 'Delta', 'Generac',
    'Square-D', 'Mulberry', 'Wiremold', 'Morris', 'Elco', 'Progress', 'Kichler', 'Hinkley', 'Sea Gull', 'Generation', 'Lightolier', 'Prescolite',
    'Gotham', 'Dals', 'Wac', 'Nora', 'Halco', 'TCP', 'Westinghouse', 'Hampton Bay', 'Defiant', 'Woods', 'Coleman Cable', 'Utilitech', 'Enerlites',
    'Mircom', 'System Sensor', 'Lutron Caseta', 'Maestro', 'Decora'];
  const BRAND_ALIAS = { 'Square-D': 'Square D', 'Cutler-Hammer': 'Eaton', 'Lutron Caseta': 'Lutron', 'Maestro': 'Lutron', 'Decora': 'Leviton', 'Coleman Cable': 'Southwire' };
  function canonBrand(b) { return BRAND_ALIAS[b] || b; }

  // ───────────────────────── text distance ─────────────────────────
  // Plain Levenshtein (with adjacent swaps, Damerau-OSA)
  function lev(a, b) {
    a = String(a); b = String(b); if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let p2 = null, p = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const c = [i];
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        c.push(v);
      }
      p2 = p; p = c;
    }
    return p[b.length];
  }
  // Characters OCR mixes up. Swapping one of these costs only a little.
  const CONF = [['O', '0'], ['Q', '0'], ['D', '0'], ['I', '1'], ['L', '1'], ['|', '1'], ['S', '5'], ['Z', '2'], ['B', '8'], ['G', '6'], ['A', '4'], ['T', '7'], ['U', 'V'], ['C', 'G'], ['E', 'F'], ['M', 'N'], ['W', 'VV'], ['R', 'P']];
  const CONF1 = {}; CONF.forEach(([x, y]) => { if (y.length === 1) { (CONF1[x] = CONF1[x] || new Set()).add(y); (CONF1[y] = CONF1[y] || new Set()).add(x); } });
  function subCost(x, y) { if (x === y) return 0; if (CONF1[x] && CONF1[x].has(y)) return 0.3; return 1; }
  // Levenshtein where OCR look-alikes (O/0, I/1, S/5, B/8 …) are cheap. Upper-case compare.
  function levOCR(a, b) {
    a = String(a).toUpperCase(); b = String(b).toUpperCase(); if (a === b) return 0;
    let p = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const c = [i];
      for (let j = 1; j <= b.length; j++) c.push(Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + subCost(a[i - 1], b[j - 1])));
      p = c;
    }
    return Math.round(p[b.length] * 100) / 100;
  }
  function ratio(a, b) { a = String(a); b = String(b); const m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 1; }
  // OCR "skeleton": look-alikes folded together, punctuation dropped. Equal skeletons = same text as far as OCR can tell.
  const SK = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', Z: '2', B: '8', G: '6' };
  function skel(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9|]/g, '').replace(/[OQDIL|SZBG]/g, ch => SK[ch]); }
  function normPart(p) { return String(p || '').toUpperCase().replace(/[‐-―_]/g, '-').replace(/\s+/g, '').replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ''); }
  function partKey(p) { return normPart(p).replace(/[-\/.]/g, ''); }

  // ───────────────────────── brands from text / barcode ─────────────────────────
  function brandFromText(text) {
    const U = ' ' + String(text || '').toUpperCase().replace(/[^A-Z0-9&\- ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    const words = U.trim().split(' ');
    let best = null;
    for (const b of BRANDS) {
      const B = b.toUpperCase(); const BN = B.replace(/[^A-Z0-9&]/g, '');
      if (B.length <= 3) { if (new RegExp(' ' + B.replace(/[&]/g, '\\&') + ' ').test(U) && /ELECTRIC|GENERAL|CORP|LIGHTING|USA|INC/.test(U)) best = best || { brand: canonBrand(b), score: 0.7 }; continue; }
      // whole words only ("HALOGEN" is not Halo); a two-word maker may be read without its space (SQUARED)
      if (U.includes(' ' + B + ' ') || (B.includes(' ') && words.includes(BN))) { const sc = 1 + BN.length / 100; if (!best || sc > best.score) best = { brand: canonBrand(b), score: sc }; continue; }
      const n = B.split(' ').length;
      for (let i = 0; i + n <= words.length; i++) {
        const w = words.slice(i, i + n).join(' '); if (Math.abs(w.length - B.length) > 2) continue;
        const dd = levOCR(w, B); const lim = B.length >= 7 ? 1.3 : B.length >= 5 ? 1 : 0.3;
        if (dd <= lim) { const sc = 0.9 - dd * 0.2; if (!best || sc > best.score) best = { brand: canonBrand(b), score: sc }; }
      }
    }
    return best ? best.brand : '';
  }
  function brandFromCode(code, learned) {
    const pc = typeof code === 'string' ? parseCode(code) : code; if (!pc || !pc.ok) return '';
    const p = prefix6(pc.gtin) || prefix6(pc.family); if (!p) return '';
    return PREFIX_BRANDS[p] || (learned && learned[p]) || '';
  }
  // learn company numbers from confirmed items: a prefix counts once 2+ confirmed items agree and none disagree
  function learnPrefixes(items, maps) {
    const seen = {};
    const add = (code, brand) => { if (!brand) return; const pc = parseCode(code); const p = pc.ok ? (prefix6(pc.gtin) || prefix6(pc.family)) : ''; if (!p) return; (seen[p] = seen[p] || {})[brand] = ((seen[p] || {})[brand] || 0) + 1; };
    const byId = {}; (items || []).forEach(x => { byId[x.id] = x; (x.codes || []).forEach(c => add(c, x.brand)); });
    (maps || []).forEach(m => { const it = byId[m.item]; if (it) add(m.code || m.key, it.brand); });
    const out = {}; Object.keys(seen).forEach(p => { const k = Object.keys(seen[p]); if (k.length === 1 && seen[p][k[0]] >= 2) out[p] = k[0]; });
    return out;
  }

  // ───────────────────────── part numbers ─────────────────────────
  const PART_BAD = /^\d+(A|V|W|VA|AMP|AMPS|VAC|VDC|HZ|FT|IN|MM|CM|M|AWG|K|LM|PK|PC|PCS|LB|LBS|OZ|KW|MA|CT|G)$|^\d+\/\d+[VYA]?$|^(UL|CSA|NOM|ANCE|IP|NEMA|ETL|CUL|FCC|ROHS|ISO)\d|^(19|20)\d\d$|^\d{1,3}(V|A)\d{1,3}(V|A)?$/i;
  const LABEL_PART = /(?:\bITEM|\bCAT(?:ALOG)?|\bMODEL|\bPART|\bSKU|\bSTYLE|\bMFR|\bMFG|\bART|\bREF|\bNO|\bP\/N|\bPN)\s*(?:#|NO\.?|NUM(?:BER)?|N[°O])?\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,22})/g;
  // brand-specific shapes (used to fix OCR look-alikes and to raise confidence)
  const BRAND_PART = {
    Leviton: [/^\d{3,5}-[A-Z0-9]{1,6}(-[A-Z0-9]{1,4})?$/, /^[A-Z]{1,5}\d{1,4}[A-Z]{0,3}-[A-Z0-9]{1,4}$/, /^[A-Z]{2,5}\d{2,4}-?[A-Z0-9]{0,6}$/],
    Luxrite: [/^LR\d{5}$/],
    Lutron: [/^[A-Z]{2,5}-[A-Z0-9]{2,6}(-[A-Z]{2,3})?$/],             // colour codes are 2–3 letters (-WH, -IV, -LA)
    Eaton: [/^(BR|CH|BRN|CHF|TR|BAB|BJ|EBH|CHFGF|BRGF|BRAF|CHFAF|BRCAF|CHFCAF|BRDF|CHFDF)\d{3,4}[A-Z0-9]*$/, /^\d{3,5}[A-Z]{0,3}-?[A-Z0-9]{0,4}$/],
    'Square D': [/^(HOM|QO|HOMT|QOT|HOMC|QOC|QO1|SQD)\d{2,5}[A-Z0-9]*$/],
    Siemens: [/^(Q|QP|QT|QAF|QPF|QF|B|EQ|PN|W|SN)\d{2,5}[A-Z0-9]*$/],
    Hubbell: [/^[A-Z]{2,6}\d{2,5}[A-Z0-9]{0,4}$/],
    Kidde: [/^P?I\d{4,5}[A-Z0-9]{0,4}$/, /^\d{4}[A-Z]{0,2}$/, /^\d{8}$/],   // i12060, i4618AC, PI2010, 2040, 21026051
  };
  function fitsBrand(p, brand) { const pats = BRAND_PART[brand]; return !!(pats && pats.some(r => r.test(p))); }
  // fix look-alikes by context: a mostly-digit segment gets digits, a mostly-letter segment gets letters
  const TO_D = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', Z: '2', B: '8', G: '6' };
  const TO_L = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
  function fixPart(p, brand) {
    p = normPart(p); if (!p) return p;
    if (brand === 'Kidde' && /^[1Il|]\d{4,5}[A-Z]{0,3}$/.test(p)) return 'I' + p.slice(1); // Kidde "i12060": the small i reads as 1
    if (brand === 'Luxrite' && /^L[R8P]/.test(p)) { const t = 'LR' + p.slice(2).replace(/[OQDILSZBG|]/g, c => TO_D[c]); if (fitsBrand(t, brand)) return t; }
    const segs = p.split('-').map((sg, i) => {
      const dg = (sg.match(/\d/g) || []).length, lt = (sg.match(/[A-Z]/g) || []).length;
      // a number segment with one look-alike letter inside it (56O3, 8O4O9) — but never the first letter (i12060, T5325)
      // and never a segment that ends in a letter (color/style codes like 10Z, 2W, 1LZ)
      if (sg.length >= 3 && dg >= sg.length - 1 && lt <= 1 && /\d$/.test(sg) && !/^[A-Z]/.test(sg)) return sg.replace(/[OQDILSZBG|]/g, c => TO_D[c]);
      if (sg.length >= 4 && /^\d/.test(sg) && /\d$/.test(sg) && /^[0-9OQDILSZBG]+$/.test(sg) && dg * 2 >= sg.length) return sg.replace(/[OQDILSZBG]/g, c => TO_D[c]);
      return sg;
    });
    const out = segs.join('-');
    if (brand && fitsBrand(p, brand) && !fitsBrand(out, brand)) return p;
    return out;
  }
  function partCandidates(text, brand) {
    const T = String(text || '').toUpperCase().replace(/[|]/g, ' ').replace(/[‐-―]/g, '-');
    const c = [];
    const add = (raw, sc) => {
      let p = normPart(raw).replace(/[.\/]+$/, ''); const q = p.replace(/[-\/.]/g, '');
      const digitsOnlyOk = sc >= 10 && /^\d{3,7}$/.test(q); // "CAT# 8195" — labeled, digits only
      if (!digitsOnlyOk && (q.length < 4 || p.length > 22 || !/\d/.test(q) || !/[A-Z]/.test(q) && !/-/.test(p))) return;
      if (!digitsOnlyOk && /^\d{6,}$/.test(q) && !/-/.test(p)) return;
      if (PART_BAD.test(p) || (!/-/.test(p) && PART_BAD.test(q))) return;
      if (/^\d+-\d+$/.test(p) && !/^\d{3,5}-\d{1,3}$/.test(p)) return;
      // barcode bars read as letters (LIAA1, IL1I-1): mostly thin vertical-stroke characters → not a part number
      const an = q.replace(/[^A-Z0-9]/g, ''); if (an.length && (an.match(/[IL1J]/g) || []).length / an.length >= 0.6) return;
      const f = fixPart(p, brand);
      c.push({ p: f, raw: p, sc: sc + (/-/.test(p) ? 1 : 0) + (brand && fitsBrand(f, brand) ? 3 : 0), labeled: sc >= 10 });
    };
    let m; LABEL_PART.lastIndex = 0;
    while ((m = LABEL_PART.exec(T))) add(m[1], 10);
    const r2 = /(?:^|[^A-Z0-9\/])(\d{2,5}-[A-Z0-9]{1,6}(?:-[A-Z0-9]{1,4})?)(?![A-Z0-9])/g; while ((m = r2.exec(T))) add(m[1], 6);
    const r3 = /(?:^|[^A-Z0-9\/-])([A-Z]{1,5}\d{2,8}[A-Z0-9]{0,6}(?:-[A-Z0-9]{1,5}){0,2})(?![A-Z0-9])/g; while ((m = r3.exec(T))) add(m[1], 4);
    const r4 = /(?:^|[^A-Z0-9\/-])([A-Z]{2,5}-[A-Z0-9]{2,6}(?:-[A-Z0-9]{1,4})?)(?![A-Z0-9])/g; while ((m = r4.exec(T))) if (/\d/.test(m[1])) add(m[1], 5);
    const r5 = /(?:^|[^A-Z0-9\/-])([A-Z]{2,6}\d{1,4}[A-Z]{0,2}-[A-Z0-9]{1,5})(?![A-Z0-9])/g; while ((m = r5.exec(T))) add(m[1], 5);
    const f = {};
    c.forEach(x => { const k = x.p; if (f[k]) { f[k].sc = Math.max(f[k].sc, x.sc); f[k].n++; f[k].labeled = f[k].labeled || x.labeled; } else f[k] = { p: k, sc: x.sc, n: 1, labeled: !!x.labeled }; });
    // merge OCR look-alike duplicates (5603-P2W vs 56O3-P2W): keep the better-shaped one, add counts
    const L = Object.values(f);
    L.forEach(a => L.forEach(b => { if (a !== b && a.n && b.n && skel(a.p) === skel(b.p)) { const keep = (a.sc > b.sc || (a.sc === b.sc && a.n >= b.n)) ? a : b, drop = keep === a ? b : a; keep.n += drop.n; keep.labeled = keep.labeled || drop.labeled; drop.n = 0; } }));
    // OCR doubled the last letter next to a box line (5601-2WW): the shorter one is the real part number
    L.forEach(a => L.forEach(b => { if (a !== b && a.n && b.n && a.p.length === b.p.length + 1 && a.p === b.p + b.p.slice(-1) && /[A-Z]$/.test(b.p)) { b.n += a.n; b.sc = Math.max(a.sc, b.sc); b.labeled = b.labeled || a.labeled; a.n = 0; } }));
    return L.filter(x => x.n).sort((a, b) => b.sc - a.sc || b.n - a.n || b.p.length - a.p.length);
  }

  // ───────────────────────── label reading ─────────────────────────
  const VOCAB = ('SWITCH OUTLET RECEPTACLE GFCI AFCI BREAKER CIRCUIT WALLPLATE PLATE DECORA DIMMER TRIM LED DOWNLIGHT FIXTURE BOX COVER CONNECTOR WIRE ' +
    'CABLE CONDUIT FITTING LOAD CENTER PANEL TIMER SENSOR OCCUPANCY VACANCY FAN CONTROL TAMPER RESISTANT WEATHER USB DUPLEX POLE WAY GANG ROUND SQUARE ' +
    'RECESSED HOUSING BULB LAMP BALLAST DRIVER ADAPTER GROUNDING GROUND NEUTRAL STRAP CLAMP BUSHING LUG BAR ENCLOSURE DISCONNECT METER SURGE PROTECTOR ' +
    'SMOKE DETECTOR ALARM THERMOSTAT RELAY CONTACTOR NUT WAGO LEVER SPLICE TERMINAL TOGGLE ROCKER PADDLE SLIM CANLESS GIMBAL WAFER PANEL PUSH ' +
    'SINGLE DOUBLE TRIPLE DEVICE BLANK MIDWAY JUMBO STANDARD STD NYLON THERMOPLASTIC STAINLESS METAL PLASTIC PVC EMT RIGID FLEX MC BX ROMEX NM THHN ' +
    'COUPLING ELBOW STRAPS STAPLE STAPLES BRACKET HANGER OLD WORK NEW EXTENSION RING MUD DEEP SHALLOW OCTAGON HANDY UTILITY FLOOD SPOT VANITY ' +
    'CEILING WALL MOUNT FLUSH SURFACE PENDANT EXHAUST HEATER CHIME DOORBELL TRANSFORMER PHOTOCELL INDICATOR PILOT LIGHT NIGHT TAPE ELECTRICAL ' +
    'AMP VOLT PHASE MAIN LUGS PLUG-IN BOLT-ON DUAL FUNCTION SELF-TEST SMART WIFI BLUETOOTH WHITE IVORY ALMOND BLACK GRAY').split(' ');
  const VSET = new Set(VOCAB);
  const SKIP = /caution|warning|danger|attention|avertissement|advertencia|remove|made in|china|mexico|printed|tested|ages?\b|intended|retail|resale|recommended|choking|hazard|www|\.com|\.net|\bllc\b|\binc\b|\bltd\b|\bcorp\b|street|\bsuite\b|patent|copyright|©|all rights|distributed|imported|manufactured|keep away|children|see back|instructions|interrupteur|interruptor|\bavec\b|\bmalt\b|tierra|plaque|placa|thermoplastique|termoplastico|\bblanc\b|blanco|\bpays\b|origine|origen|country|\bprise\b|tomacorriente|disjoncteur|\bqte\b|\bcant\b|\bqty\b|\bpour\b|\bpara\b|couvercle|cubierta|lumi[eè]re|luminaire|bo[iî]te|caja|contacto|apagador|atenuador|gradateur|veilleuse|garantie|garant[ií]a|warranty|\bfcc\b|compliance|batter(y|ies)/i;
  function titleCase(s) { return s.toLowerCase().replace(/(^|[\s(\/-])([a-z])/g, (a, b, c) => b + c.toUpperCase()).replace(/\b(\d+)([a-z])\b/gi, (a, n, l) => n + l.toUpperCase()).replace(/\b(Gfci|Afci|Led|Usb|Nm-B|Thhn|Emt|Pvc|Tr|Wr|Ul|Ac|Dc|Mc|Bx|Cfl|Rgb|Cct|Wifi)\b/g, w => w.toUpperCase()); }
  function descLines(text) {
    const out = [];
    String(text || '').split(/\n+/).forEach(raw => {
      let l = raw.replace(/[|_~`^{}<>\[\]\\°™®]/g, ' ').replace(/\s+/g, ' ').trim();
      l = l.replace(/\s+(NOM|ANCE|CSA|UL|ETL|cUL|LISTED)\b.*$/i, '').replace(/(\s+[a-z]{1,2}\b)+\s*$/, '').replace(/(\s+\S{1,2})+\s*$/, m => /\d|"/.test(m) ? m : '');
      l = l.replace(/^[^A-Za-z0-9"]+|[^A-Za-z0-9".)]+$/g, '');
      if (/^(listed|ul listed)/i.test(l)) return;
      if (l.length < 4 || l.length > 64 || SKIP.test(l)) return;
      const toks = l.toUpperCase().split(/[\s,\/]+/).filter(Boolean);
      let voc = 0, good = 0, junk = 0;
      toks.forEach(w => {
        const x = w.replace(/[^A-Z0-9"\-]/g, '');
        if (!x) { junk++; return; }
        const core = x.replace(/[^A-Z]/g, '');
        if (VSET.has(core) || VSET.has(x)) { voc++; good++; return; }
        // OCR-tolerant vocabulary hit (SWITC, GROUNDIN, RECEPTACIE)
        if (core.length >= 5 && VOCAB.some(v => v.length >= 5 && Math.abs(v.length - core.length) <= 2 && levOCR(core, v) <= 1.3)) { voc += 0.7; good++; return; }
        if (/^\d+(-WAY|-POLE|G|A|V|W|"|IN|FT|AWG|\/\d+)?$/.test(x) || /^\d+-\d+\/?\d*[AV]?$/.test(x)) { good++; return; }
        if (core.length >= 3 && /[AEIOUY]/.test(core) && x.length <= 14) { good++; return; }
        if (x.length <= 2) { junk++; return; }
        junk++;
      });
      if (!toks.length || good / toks.length < 0.7 || junk > 1) return;
      if (voc < 1 && !/\d\s*("|IN\b|FT\b)/i.test(l)) return;
      const sc = voc * 10 + good - junk * 3;
      if (!out.some(o => o.l.toLowerCase() === l.toLowerCase())) out.push({ l, sc, voc });
    });
    return out.sort((a, b) => b.sc - a.sc);
  }
  // keep only words we trust: electrical words (OCR typos fixed: SWITC → Switch), sizes/numbers, and words read the
  // same way more than once on the label. Everything else (OCR junk) is dropped — never shown as part of a name.
  const VCANON = {}; VOCAB.forEach(v => { VCANON[v] = v; });
  const FOREIGN = ['INTERRUPTOR', 'INTERRUPTEUR', 'NTERRUPTOR', 'TIERRA', 'BLANCO', 'BLANC', 'PLAQUE', 'PLACA', 'VOIES', 'VIAS', 'MALT', 'AVEC', 'TERMOPLASTICO', 'THERMOPLASTIQUE', 'PRODUCTO', 'PRODUIT', 'ELECTRICO', 'MARFIL', 'IVOIRE', 'NEGRO', 'NOIR', 'CAJA', 'BOITE', 'COUVERCLE', 'CUBIERTA'];
  function cleanDesc(desc, U) {
    const seen = new Set(); const out = [];
    const count = w => (U.match(new RegExp('(^|[^A-Z])' + w.replace(/[^A-Z0-9]/g, '') + '($|[^A-Z])', 'g')) || []).length;
    for (const raw of String(desc || '').split(/\s+/)) {
      const w = raw.toUpperCase().replace(/[^A-Z0-9"\/\-+.]/g, '').replace(/^[-.]+|[-.]+$/g, ''); if (!w) continue;
      let keep = '';
      const core = w.replace(/[^A-Z]/g, '');
      if (VCANON[w] || VCANON[core] && core === w) keep = w;
      else if (/^\d+(-WAY|-POLE|-GANG|G|A|V|W|K|"|IN|FT|AWG|CCT)$/.test(w) || /^\d+(-\d+)?\/\d+("|V|A)?$/.test(w) || /^(A19|A21|BR30|BR40|PAR20|PAR30|PAR38|MR16|GU10)$/.test(w)) keep = w;
      else if (core.length >= 5 && core === w) { const v = VOCAB.find(x => x.length >= 5 && Math.abs(x.length - w.length) <= 1 && levOCR(w, x) <= 1.3); if (v) keep = v; }
      if (!keep && /^[A-Z]{4,}$/.test(w) && /[AEIOUY]/.test(w) && count(w) >= 2 && !FOREIGN.some(f => levOCR(w, f) <= 2)) keep = w;
      if (!keep && /^[A-Z]+-[A-Z]+$/.test(w) && w.split('-').every(x => VCANON[x] || x.length >= 3)) keep = w; // SELF-TEST, PLUG-IN
      if (keep && !seen.has(keep)) { seen.add(keep); out.push(keep); }
    }
    let r = out.join(' ').replace(/\bWALL PLATE\b/, 'WALLPLATE');
    r = [...new Set(r.split(' '))].join(' ');
    return titleCase(r);
  }
  const COLORS = [['LIGHT ALMOND', 'Light Almond'], ['WHITE', 'White'], ['IVORY', 'Ivory'], ['BLACK', 'Black'], ['GRAY', 'Gray'], ['GREY', 'Gray'], ['BROWN', 'Brown'],
    ['RED', 'Red'], ['STAINLESS', 'Stainless'], ['BRONZE', 'Bronze'], ['NICKEL', 'Nickel'], ['ALMOND', 'Almond'], ['BEIGE', 'Beige'], ['SILVER', 'Silver']];
  function colorOf(U) { for (const [k, v] of COLORS) if (new RegExp('\\b' + k + '\\b').test(U)) return v; return ''; }
  function packOf(U) {
    U = U.replace(/\d[\d ]{7,}\d/g, ' '); // the barcode's printed digits are not a quantity
    // the number must be on the same line as QTY/CANT (sparse reading puts other columns, like Leviton's line code, below it)
    let m = U.match(/\b(?:QTY|QTE|QUANTITY|CANT|PCS?[ \t]*\/[ \t]*(?:BOX|CTN|CASE)|PER[ \t]+(?:BOX|CASE|CTN))[ \t]*[:.]?[ \t]*(?:QTE|CANT|QTY|[:. \t])*[ \t]*(\d{2,4}(?![-\w])|\d(?: [\dOQ]){1,2}(?![-\w])|\d[OQ]{1,2}(?![-\w])|\d(?![-\w]))/);
    if (m) { const n = +m[1].replace(/ /g, '').replace(/[OQ]/g, '0'); if (n > 1 && n <= 2000) return n; }
    // …or alone on the very next line, and only a normal box size (≤ 100)
    m = U.match(/\b(?:QTY|QTE|QUANTITY|CANT)[ \t]*[:.]?[ \t]*\n[ \t]*(?:(?:QTE|CANT|QTY)[ \t]*\n[ \t]*)*(\d{1,3})[ \t]*(?:\||\n|$)/);
    if (m && +m[1] > 1 && +m[1] <= 100) return +m[1];
    m = U.match(/\b(?:BOX|CASE|PACK|PKG|CTN|CARTON)\s+OF\s+(\d{1,4})\b/) || U.match(/\b(\d{1,4})\s*(?:-|\s)?\s*(?:PACK|PK|PCS|PIECES|COUNT|CT)\b/) || U.match(/\bPK\s*\/?\s*(\d{1,4})\b/);
    if (m && +m[1] > 1 && +m[1] <= 2000) return +m[1];
    return null;
  }
  function unitOf(U) {
    const ft = U.match(/\b(\d{2,4})\s*(?:FT|FEET|')\b/);
    if (ft && /\b(WIRE|CABLE|NM-?B|THHN|ROMEX|MC|BX|UF-?B|CONDUIT|COIL|SPOOL|REEL)\b/.test(U)) return { unit: 'ft', perScan: +ft[1] };
    if (/\bROLL\b/.test(U)) return { unit: 'roll' };
    return { unit: 'pc' };
  }
  /* parseLabel(text, {code, learned}) → { brand, part, parts[], desc, color, unit, pack, conf: 'high'|'medium'|'low', name, why[] }
   * name is '' when confidence is low — the scanner then asks instead of guessing. */
  function parseLabel(text, ctx) {
    ctx = ctx || {};
    const T = String(text || ''); const U = T.toUpperCase();
    const fromCode = ctx.code ? brandFromCode(ctx.code, ctx.learned) : '';
    const fromText = brandFromText(T);
    const brand = fromCode || fromText;
    const why = [];
    if (fromCode) why.push('maker from barcode'); else if (fromText) why.push('maker read on label');
    const parts = partCandidates(T, brand);
    const top = parts[0] || null;
    let part = '', partConf = 0, partSure = false, nearPart = '';
    if (top) {
      part = top.p;
      const fit = !!(brand && fitsBrand(part, brand));
      // another, different part number read just as strongly → we can't be sure which one it is
      const rival = parts.slice(1).find(x => skel(x.p) !== skel(top.p) && x.sc >= top.sc - 1 && x.n >= top.n);
      partConf = 0.2 + (top.labeled ? 0.3 : 0) + Math.min(0.3, (top.n - 1) * 0.15) + (fit ? 0.2 : 0) - (rival ? 0.3 : 0);
      // a look-alike character where letters meet digits (L|0, T|5, R|1 …) is where OCR goes wrong most: never "sure" there
      const amb = /[A-Z][0O1I5S]|[0O1I5S][A-Z]/.test(part.replace(/-/g, ' ').split(' ').filter(sg => /\d/.test(sg) && /[A-Z]/.test(sg)).join(' '));
      const digitsOnly = /^\d+$/.test(part.replace(/-/g, ''));
      // the maker has a known part-number shape and this reading does not have it → a misread or a cut-off label
      const shapeWrong = !!(brand && BRAND_PART[brand] && !fit);
      // Leviton breaker suffixes only exist on LB… parts: "18120-DF" is "LB120-DF" with L|B read as 1|8
      const lbLike = brand === 'Leviton' && /^\d{4,6}-(AF|DF|GF|CAF|PAF|T)$/.test(part);
      // a part number 1 character away from a real one of the same maker (product list / your items) but not equal
      const known = Array.isArray(ctx.known) ? ctx.known : []; const pkTop = partKey(part);
      let exactKnown = known.some(k => partKey(k.p) === pkTop);
      // differs from a real part number only by look-alike characters (O/0, I/1, S/5, B/8 …): use the real spelling, never "sure"
      const snap = exactKnown ? null : known.find(k => (!brand || !k.b || canonBrand(k.b) === brand) && skel(partKey(k.p)) === skel(pkTop));
      if (snap) { part = normPart(snap.p); why.push('look-alike letters corrected to the real part number ' + part); }
      const near = exactKnown ? null : known.find(k => (!brand || !k.b || canonBrand(k.b) === brand) && Math.abs(partKey(k.p).length - pkTop.length) <= 1 && levOCR(partKey(k.p), pkTop) <= 1.0);
      partSure = !snap && !rival && !amb && !shapeWrong && !lbLike && !near && ((top.labeled && (fit || top.n >= 2 || (!BRAND_PART[brand] && !digitsOnly))) || (fit && top.n >= 2) || top.n >= 3 || (exactKnown && top.n >= 2));
      if (near) { why.push('close to ' + near.p + ' — check'); nearPart = normPart(near.p); }
      if (shapeWrong) why.push('unusual part number for ' + brand + ' — check');
      if (rival) why.push('also read ' + rival.p + ' — check');
      why.push('part ' + part + (top.n > 1 ? ' (read ' + top.n + '×)' : ''));
    }
    const pk = partKey(part);
    const dl = descLines(T).filter(o => { const u = o.l.toUpperCase(); const k = u.replace(/[-\/.\s]/g, ''); return !(pk && k.includes(pk) && k.length < pk.length + 8) && !(brand && k === brand.toUpperCase().replace(/\W/g, '')); });
    let desc = dl[0] ? dl[0].l : '';
    let voc = dl[0] ? dl[0].voc : 0;
    { const sec = dl.slice(1).find(o => o.voc >= 1 && nameSim(o.l, desc) < 0.5 && !tokens(o.l).every(w => tokens(desc).some(v => levOCR(v, w) <= 1)));
      if (desc && desc.length < 24 && sec && (desc + ' ' + sec.l).length <= 50) { desc = desc + ' ' + sec.l; voc += sec.voc; } }
    desc = desc.replace(/\s+(nom|ance|csa|ul|listed)\b.*$/i, '').trim();
    desc = cleanDesc(desc, U);
    if (desc === desc.toUpperCase()) desc = titleCase(desc);
    const color = colorOf(U);
    if (color && desc && !new RegExp('\\b' + color + '\\b', 'i').test(desc)) desc = desc + ' ' + color;
    let pack = packOf(U);
    // Leviton-style box label: "5603-P2W | 10 | 242" — the quantity column comes right after the part number
    if (!pack && part) {
      const pk2 = skel(part);
      for (const line of U.split(/\n+/)) {
        const m2 = line.match(/([A-Z0-9][A-Z0-9\-\/.]{3,22})[^A-Z0-9]{1,6}(\d{1,3})(?:\s|\||$)/);
        if (m2 && skel(m2[1].split('/')[0]) === pk2 && +m2[2] > 1 && +m2[2] <= 100) { pack = +m2[2]; break; } // the 3-digit column after QTY is a line code, not a count
      }
    }
    const unit = unitOf(U);
    let score = partConf + (voc >= 2 ? 0.35 : voc >= 1 ? 0.2 : 0) + (brand ? 0.15 : 0);
    const conf = part ? (partSure && (brand || voc >= 1) ? 'high' : partConf >= 0.35 ? 'medium' : 'low') : (voc >= 2 && brand ? 'medium' : 'low');
    let name = '';
    if (conf !== 'low') { name = [brand, part, desc].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); if (name.length > 80) name = name.slice(0, 80).replace(/\s\S*$/, ''); if (!part && !desc) name = ''; }
    return { brand, part, parts: parts.slice(0, 4).map(x => x.p), desc, color, unit: unit.unit, perScan: unit.perScan || null, pack, conf, name, why, nearPart, score: Math.round(score * 100) / 100 };
  }
  // what an online product database said → same shape as parseLabel
  function parseOnline(r, code) {
    if (!r || !r.title) return null;
    const title = String(r.title).replace(/\s+/g, ' ').trim();
    const brand = canonBrand(brandFromText((r.brand || '') + ' ' + title) || (r.brand ? String(r.brand).trim() : '')) || brandFromCode(code);
    let part = r.model ? normPart(r.model) : '';
    if (!part || part.length < 3) { const pc = partCandidates(title, brand); part = pc[0] ? pc[0].p : ''; }
    let desc = title;
    if (brand) desc = desc.replace(new RegExp('^\\s*' + brand.replace(/[-&]/g, '.') + '\\s*', 'i'), '');
    if (part) desc = desc.replace(new RegExp('\\b' + part.replace(/[-\/.]/g, '.?') + '\\b', 'i'), '').replace(/\s+/g, ' ').trim();
    const U = title.toUpperCase();
    const name = [brand, part, desc].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 90).replace(/\s\S*$/, s => (s.length < 4 ? '' : s)).trim();
    return { brand, part, desc, color: colorOf(U), unit: unitOf(U).unit, pack: packOf(U), conf: 'medium', name, why: ['online product database'], src: r.src || 'online' };
  }

  // ───────────────────────── matching against inventory ─────────────────────────
  function tokens(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9" ]+/g, ' ').split(/\s+/).filter(w => w.length >= 2); }
  // fuzzy word-set similarity: each word finds its closest word in the other name (OCR-tolerant)
  function nameSim(a, b) {
    const A = tokens(a), B = tokens(b); if (!A.length || !B.length) return 0;
    const one = (X, Y) => X.reduce((s, w) => { let best = 0; for (const v of Y) { const m = Math.max(w.length, v.length); const r = 1 - levOCR(w, v) / m; if (r > best) best = r; } return s + (best >= 0.7 ? best : 0); }, 0) / X.length;
    return Math.round(((one(A, B) + one(B, A)) / 2) * 1000) / 1000;
  }
  /* matchInventory(q, items) → [{item, score 0..1, why}] (possible matches, best first). Never used to auto-pick. */
  function matchInventory(q, items) {
    q = q || {}; const out = [];
    const qk = partKey(q.part), qs = skel(q.part), qb = q.brand || '';
    const qparts = (q.parts && q.parts.length ? q.parts : (q.part ? [q.part] : [])).map(partKey).filter(Boolean);
    for (const it of items || []) {
      if (!it || it.deleted) continue;
      let score = 0, why = '';
      const ib = it.brand || brandFromText(it.name);
      const iparts = [it.model, it.part, it.sku].filter(Boolean).map(partKey);
      partCandidates(it.name, ib).slice(0, 2).forEach(c => iparts.push(partKey(c.p)));
      // a part number written as its own word in the item name ("… Raco 232 …")
      if (qk && qk.length >= 3 && !iparts.includes(qk)) { const toks = String(it.name || '').toUpperCase().split(/[\s,()]+/).map(partKey); if (toks.includes(qk) && (/[A-Z]/.test(qk) || qk.length >= 4 || (qb && ib && canonBrand(qb) === canonBrand(ib)))) iparts.push(qk); }
      if (qk && iparts.length) {
        for (const ip of iparts) {
          if (!ip) continue;
          if (ip === qk) { score = Math.max(score, 0.97); why = 'same part number'; }
          else if (skel(ip) === qs && qs.length >= 4) { if (0.9 > score) { score = 0.9; why = 'same part number (OCR look-alike letters)'; } }
          else if (qk.length >= 5 && ip.length >= 5) {
            const d = levOCR(ip, qk);
            if (d <= 1 && 0.72 > score) { score = 0.72; why = 'part number 1 character apart'; }
            else if (d <= 2 && qk.length >= 7 && 0.55 > score) { score = 0.55; why = 'part number 2 characters apart'; }
          }
        }
        for (const op of qparts.slice(1)) if (iparts.includes(op) && 0.8 > score) { score = 0.8; why = 'matches another part number on the label'; }
      }
      if (score && qb && ib && canonBrand(qb) !== canonBrand(ib)) { score *= 0.6; why += ' — but a different maker'; }
      const qn = q.name || [q.brand, q.desc].filter(Boolean).join(' ');
      if (qn) {
        const ns = nameSim(qn, it.name);
        const ns2 = ns * (qb && ib && canonBrand(qb) !== canonBrand(ib) ? 0.6 : 1) * 0.8;
        if (ns2 > score) { score = ns2; why = 'similar name (' + Math.round(ns * 100) + '%)'; }
      }
      if (score >= 0.45) out.push({ item: it, score: Math.round(score * 100) / 100, why });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 6);
  }

  // ───────────────────────── product memory ─────────────────────────
  /* All confirmed barcode→item links. maps: {code(key) → {item, pack, level, by, ts}} plus older links kept on items (it.codes). */
  function allLinks(items, maps) {
    const L = [];
    Object.keys(maps || {}).forEach(id => { const m = maps[id]; if (!m || m.deleted || !m.item) return; const pc = parseCode(m.code || id.replace(/^bc_/, '')); if (!pc.ok) return; L.push({ key: pc.key, code: m.code, item: m.item, pack: m.pack == null ? (pc.level === 'box' ? null : 1) : +m.pack, level: m.level || pc.level, src: 'verified', ts: m.ts || 0, by: m.by }); });
    (items || []).forEach(it => { if (!it || it.deleted) return; (it.codes || []).forEach(c => { const pc = parseCode(c); if (!pc.ok) return; const pk = it.packs && it.packs[c]; L.push({ key: pc.key, code: c, item: it.id, pack: pk != null ? +pk : (pc.level === 'box' ? null : 1), level: pc.level, src: 'item', ts: 0 }); }); });
    return L;
  }
  /* identify(code, {items, maps}) — the barcode step, instant and offline:
   *  status 'bad'      → the read failed its check digit: scan again (nothing guessed)
   *  status 'known'    → a confirmed link: {item, pack}
   *  status 'conflict' → the same barcode was confirmed for different items: the person must pick
   *  status 'family'   → not confirmed, but a confirmed barcode in the same number family exists (box ↔ single). Ask.
   *  status 'new'      → never seen */
  function identify(code, ctx, format) {
    const pc = typeof code === 'object' && code && 'key' in code ? code : parseCode(code, format);
    if (!pc.ok) return { status: 'bad', pc };
    const items = (ctx && ctx.items) || []; const byId = {}; items.forEach(x => { if (x && !x.deleted) byId[x.id] = x; });
    const links = allLinks(items, ctx && ctx.maps).filter(l => byId[l.item]);
    const mine = links.filter(l => l.key === pc.key);
    const ids = [...new Set(mine.map(l => l.item))];
    if (ids.length === 1) { const ver = mine.find(l => l.src === 'verified') || mine[0]; return { status: 'known', pc, item: byId[ids[0]], pack: ver.pack, level: pc.level }; }
    if (ids.length > 1) return { status: 'conflict', pc, candidates: ids.map(id => ({ item: byId[id], pack: (mine.find(l => l.item === id) || {}).pack, why: 'this barcode was saved on more than one item' })) };
    if (pc.family) {
      const fam = links.filter(l => { const o = parseCode(l.code || ''); return o.ok && o.family === pc.family && o.key !== pc.key; });
      const fids = [...new Set(fam.map(l => l.item))];
      if (fids.length) return { status: 'family', pc, candidates: fids.map(id => { const l = fam.find(x => x.item === id); const o = parseCode(l.code); return { item: byId[id], rel: pc.level === 'box' && o.level === 'each' ? 'box-of' : pc.level === 'each' && o.level === 'box' ? 'single-of' : 'other-pack', why: pc.level === 'box' ? 'looks like the box barcode of this item — check before saving' : 'looks like the single-item barcode of this box — check before saving' }; }) };
    }
    return { status: 'new', pc };
  }
  // stable id for the link record of a barcode (two phones saving the same barcode write the same record)
  function linkId(pc) { return 'bc_' + String(pc.key).replace(/[^A-Za-z0-9]/g, '_').slice(0, 60); }
  // stable id for a brand-new item first created from a barcode (two phones → one item, not two)
  function newItemId(pc) { return 's_bc' + String(pc.family || pc.key).replace(/[^A-Za-z0-9]/g, '').slice(0, 40); }
  // base units counted for one scan: boxes × pack (pack = items in one box)
  function unitsFor(scans, pack) { const n = Math.max(0, Math.floor(+scans || 0)); const p = pack == null ? 1 : Math.max(1, Math.floor(+pack || 1)); return n * p; }

  // ───────────────────────── AI answer check ─────────────────────────
  /* An AI reading is only trusted as far as the label/barcode backs it up. The part number it gives must actually
   * appear (OCR-tolerant) in the text we read, or in the online result. Otherwise it is marked "unverified". */
  function checkAI(ai, ocrText, online) {
    if (!ai || typeof ai !== 'object') return null;
    const part = normPart(ai.part || ai.model || ''); const brand = canonBrand(ai.brand || ai.manufacturer || '');
    const desc = String(ai.description || ai.desc || '').trim().slice(0, 70);
    if (!part && !desc) return null;
    const toks = String(ocrText || '').toUpperCase().split(/[^A-Z0-9\-\/|]+/).filter(Boolean);
    const pk = partKey(part);
    const inText = pk && (toks.some(w => partKey(w) === pk || skel(w) === skel(pk) || (pk.length >= 5 && levOCR(partKey(w), pk) <= 1)) || (String(ocrText || '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(pk) && pk.length >= 5));
    const onlineOk = online && pk && partKey(online.part) === pk;
    const verified = !!(inText || onlineOk);
    const name = [brand, part, desc].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return { brand, part, desc, color: ai.color || '', unit: ai.unit || 'pc', pack: ai.pack && +ai.pack > 1 ? +ai.pack : null, conf: verified ? 'high' : 'low', verified, name: name, why: [verified ? 'AI reading, part number confirmed on the label' : 'AI reading — part number NOT found on the label, check it'] };
  }
  const AI_PROMPT = 'This is a photo of an electrical product label (box or package) in an electrical contractor\'s garage. Read ONLY what is printed. ' +
    'Reply ONLY with JSON: {"brand":"","part":"","description":"","color":"","pack":0,"unit":"pc"}. "part" is the manufacturer catalog/model/item number exactly as printed. ' +
    '"pack" is how many items the box holds if printed (QTY/QTE/CANT/BOX OF), else 0. Use "" for anything you cannot read clearly. Never guess a part number.';

  // ───────────────────────── UPC-E reader ─────────────────────────
  // The iPhone barcode library (ZXing-js 0.21.3) cannot read UPC-E at all (tested: 0 of 10 clean UPC-E codes), and
  // small electrical parts often carry UPC-E. This reads it from black/white rows (1 = black) of the camera frame.
  // Safety: every digit must match its pattern clearly, the parity must give a valid number system + check digit,
  // and at least two different rows must read the very same code.
  const UE_L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'].map(p => p.split('').map(Number));
  const UE_G = UE_L.map(p => p.slice().reverse());
  const UE_PAR = ['EEEOOO', 'EEOEOO', 'EEOOEO', 'EEOOOE', 'EOEEOO', 'EOOEEO', 'EOOOEE', 'EOEOEO', 'EOEOOE', 'EOOEOE'];
  function ueDigit(w) { // 4 widths → {d, par} or null
    const t = w[0] + w[1] + w[2] + w[3]; const n = w.map(x => x * 7 / t); let best = null, second = 9;
    for (const [tab, par] of [[UE_L, 'O'], [UE_G, 'E']]) for (let d = 0; d < 10; d++) { let e = 0; for (let j = 0; j < 4; j++) e += Math.abs(n[j] - tab[d][j]);
      if (!best || e < best.e) { if (best) second = Math.min(second, best.e); best = { d, par, e }; } else second = Math.min(second, e); }
    return best && best.e <= 1.25 && second - best.e >= 0.35 ? best : null;
  }
  function ueWindow(r) { // 33 run widths in reading order: guard(3) 6×digit(4) guard(6)
    const T = r.reduce((a, b) => a + b, 0), m = T / 51;
    for (let i = 0; i < 3; i++) if (r[i] < m * 0.45 || r[i] > m * 1.8) return null;
    for (let i = 27; i < 33; i++) if (r[i] < m * 0.45 || r[i] > m * 1.8) return null;
    let digits = '', par = '';
    for (let k = 0; k < 6; k++) { const g = ueDigit(r.slice(3 + k * 4, 7 + k * 4)); if (!g) return null; digits += g.d; par += g.par; }
    let ns = -1, chk = -1; for (let c = 0; c < 10; c++) { if (UE_PAR[c] === par) { ns = 0; chk = c; } else if (UE_PAR[c].replace(/./g, x => x === 'E' ? 'O' : 'E') === par) { ns = 1; chk = c; } }
    if (ns < 0) return null;
    const code = String(ns) + digits + chk; return upcEtoA(code) ? code : null;
  }
  function upceFromRows(getRow, width, height) {
    const ys = []; const mid = height >> 1; const step = Math.max(1, Math.floor(height / 24));
    for (let k = 0; k < 24; k++) { const y = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step; if (y >= 0 && y < height) ys.push(y); }
    const seen = {};
    for (const y of ys) {
      const row = getRow(y); if (!row) continue; const runs = []; const col = []; let cur = row[0], len = 0;
      for (let x = 0; x < width; x++) { if (row[x] === cur) len++; else { runs.push(len); col.push(cur); cur = row[x]; len = 1; } } runs.push(len); col.push(cur);
      for (let i = 1; i + 33 <= runs.length; i++) {
        if (col[i] !== 1 || col[i + 32] !== 1) continue; const w = runs.slice(i, i + 33); const T = w.reduce((a, b) => a + b, 0); const m = T / 51;
        const qL = runs[i - 1], qR = i + 33 < runs.length ? runs[i + 33] : 99999;
        let code = null;
        if (qL >= m * 3) code = ueWindow(w);                           // left to right
        if (!code && qR >= m * 3) code = ueWindow(w.slice().reverse()); // upside down
        if (code) { seen[code] = (seen[code] || 0) + 1; if (seen[code] >= 2) return code; }
      }
    }
    return null;
  }

  const SV2 = { upceFromRows, ck, validGS1, upcEtoA, parseCode, prefix6, PREFIX_BRANDS, BRANDS, brandFromText, brandFromCode, learnPrefixes, lev, levOCR, ratio, skel,
    normPart, partKey, fixPart, fitsBrand, partCandidates, descLines, parseLabel, parseOnline, nameSim, matchInventory, allLinks, identify, linkId,
    newItemId, unitsFor, checkAI, AI_PROMPT, packOf, colorOf, canonBrand };
  if (typeof module !== 'undefined' && module.exports) module.exports = SV2; else root.SV2 = SV2;
})(typeof window !== 'undefined' ? window : globalThis);
