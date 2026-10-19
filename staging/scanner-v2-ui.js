/* Electrix USA — Smart Inventory Scanner V2: the scanner screens. Loaded after the app; replaces the old scanner steps.
 * Order for every scan: check digit → confirmed barcodes (instant, offline) → box/single family (ask) → part numbers →
 * online product databases → label reading (several passes, turned) → AI (only if switched on) → ask the person.
 * Nothing is saved or counted without a tap, except a barcode a person already confirmed. */
(function () {
  'use strict';
  if (!window.SV2) return;
  const S = window.SV2; const OCR0 = window.ocrText;
  const T = (x) => (typeof t === 'function' ? t(x) : x);
  const E = (x) => (typeof esc === 'function' ? esc(x) : String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const J = (x) => (typeof jsq === 'function' ? jsq(x) : String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  const $ = (id) => document.getElementById(id);
  function staff() { try { return typeof mhStaff === 'function' ? mhStaff() : true; } catch (e) { return false; } }
  function maps() { if (!D.bc || typeof D.bc !== 'object' || Array.isArray(D.bc)) D.bc = {}; return D.bc; }
  function ctx() { return { items: D.stock, maps: maps() }; }
  function learned() { try { return S.learnPrefixes(D.stock, Object.values(maps())); } catch (e) { return {}; } }
  function stockById(id) { return D.stock.find(x => x && x.id === id); }
  function sheet(html) { const sh = $('scSheet'); if (!sh) return; sh.innerHTML = '<div class="scQ">' + html + '</div>'; sh.classList.add('on'); const h = $('scHint'); if (h) h.innerHTML = ''; }
  function head(title, sub) { return '<div class="scItem sm">' + scPic(scM && scM.thumb) + '<div><b>' + title + '</b>' + (sub ? ' <span style="color:var(--g4);font-size:12px">' + sub + '</span>' : '') + '</div></div>'; }
  function codeLabel(pc) { return E(pc.type) + ' ' + E(pc.raw) + (pc.level === 'box' ? ' · 📦 ' + T('box barcode') : ''); }
  const css = document.createElement('style');
  css.textContent = '.v2c{border:1px solid #d6dbe1;border-radius:10px;padding:9px 11px;margin:6px 0;background:#fff;cursor:pointer;display:block;width:100%;text-align:left;font:inherit;color:inherit}' +
    '.v2c b{display:block;font-size:14px}.v2c small{color:#666;font-size:12px}.v2c.top{border-color:#2e9e5b;background:#ecfdf3}' +
    '.v2f{display:grid;grid-template-columns:92px 1fr;gap:5px 8px;align-items:center;margin:6px 0}.v2f label{margin:0;font-size:12px;color:#555}.v2f input{margin:0;padding:8px}' +
    '.v2st{font-size:12px;color:#555;margin:2px 0 6px}.v2warn{background:#fff6e5;border:1px solid #f0c36d;border-radius:10px;padding:8px 10px;font-size:13px;margin:6px 0}' +
    '.v2tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:8px;background:#eef;color:#334;margin-left:4px}.v2tag.lo{background:#fde8e8;color:#922}.v2tag.hi{background:#e3f6ea;color:#185c34}';
  document.head.appendChild(css);

  // ── barcode reader: also pass along what kind of barcode it was (UPC-A / UPC-E / EAN / ITF-14 / Code 128)
  const _bcEngine = window.bcEngine;
  window.bcEngine = async function (video, onCode) {
    if (window.EX_fakeScan) return window.EX_fakeScan(video, onCode);
    if ('BarcodeDetector' in window) {
      try {
        const fm = await BarcodeDetector.getSupportedFormats();
        const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix'].filter(f => fm.includes(f));
        if (want.length) {
          const det = new BarcodeDetector({ formats: want }); let on = true;
          const tick = async () => { if (!on) return; try { if (video.readyState >= 2) { const r = await det.detect(video); if (r && r[0] && r[0].rawValue) onCode(r[0].rawValue, r[0].format); } } catch (e) { } setTimeout(tick, 200); };
          tick(); return () => { on = false; };
        }
      } catch (e) { }
    }
    // ZXing path: wrap to report the format too
    const ZX = await loadZX();
    const fmtName = (r) => { try { return ZX.BarcodeFormat[r.getBarcodeFormat()]; } catch (e) { return ''; } };
    const hints = new Map();
    try { hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.ITF, ZX.BarcodeFormat.QR_CODE, ZX.BarcodeFormat.DATA_MATRIX]); hints.set(ZX.DecodeHintType.TRY_HARDER, true); } catch (e) { }
    const rd = new ZX.MultiFormatReader(); rd.setHints(hints);
    const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true }); let on = true, n = 0;
    const read = (sx, sy, sw, sh, rot) => {
      const sc = Math.min(1, (rot ? 720 : 1000) / Math.max(sw, sh)); const w = Math.max(1, Math.round(sw * sc)), hh = Math.max(1, Math.round(sh * sc));
      if (rot) { cv.width = hh; cv.height = w; cx.save(); cx.translate(hh, 0); cx.rotate(Math.PI / 2); cx.drawImage(video, sx, sy, sw, sh, 0, 0, w, hh); cx.restore(); } else { cv.width = w; cv.height = hh; cx.drawImage(video, sx, sy, sw, sh, 0, 0, w, hh); }
      const src = new ZX.HTMLCanvasElementLuminanceSource(cv);
      for (const B of [ZX.HybridBinarizer, ZX.GlobalHistogramBinarizer]) { try { const r = rd.decodeWithState(new ZX.BinaryBitmap(new B(src))); if (r && r.getText()) return [r.getText(), fmtName(r)]; } catch (e) { } finally { try { rd.reset(); } catch (e) { } } }
      return null;
    };
    const tick = () => {
      if (!on) return; let got = null;
      try { const vw = video.videoWidth, vh = video.videoHeight; if (video.readyState >= 2 && vw && vh) { const k = n++ % 3; if (k === 0) { const sw = vw * 0.9, sh = vh * 0.5; got = read((vw - sw) / 2, (vh - sh) / 2, sw, sh, false); } else if (k === 1) got = read(0, 0, vw, vh, false); else got = read(0, 0, vw, vh, true); } } catch (e) { }
      if (got) try { onCode(got[0], got[1]); } catch (e) { }
      setTimeout(tick, got ? 400 : 90);
    };
    tick(); return () => { on = false; };
  };
  void _bcEngine;

  // ── 1. every scan starts here
  window.scHit = function (raw, format) {
    if (!scM || scM.pausedCode) return;
    const pc = S.parseCode(raw, format); const now = Date.now();
    const sig = pc.key || String(raw);
    if (sig === scM.last && now - scM.lastT < 1800) return;
    scM.last = sig; scM.lastT = now;
    if (!pc.ok) { // failed check digit / unreadable: never guess
      scM.bad = (scM.bad || 0) + 1;
      const h = $('scHint'); if (h) h.innerHTML = '⚠️ ' + T('That barcode did not read cleanly — hold steady and scan again');
      try { navigator.vibrate && navigator.vibrate([30, 60, 30]); } catch (e) { }
      return;
    }
    scBeep(); scM.pausedCode = pc.key; scM.pc = pc; scM.thumb = scThumb(); scM.snap = null; scM.part = '';
    const r = S.identify(pc, ctx());
    scM.idr = r;
    if (r.status === 'known') { v2Qty(r.item, r.pack); return; }
    scM.snap = scSnap();
    if (r.status === 'conflict') { v2Conflict(r); return; }
    if (r.status === 'family') { v2Family(r); return; }
    v2New();
  };

  // ── saving a confirmed barcode → item link (one record per barcode, same id on every phone)
  function v2Link(itemId, pack) {
    const pc = scM && scM.pc; const it = stockById(itemId); if (!pc || !it) return null;
    const id = S.linkId(pc); const M = maps();
    M[id] = { id, code: pc.key, raw: pc.raw, type: pc.type, item: itemId, pack: pack == null ? (pc.level === 'box' ? null : 1) : Math.max(1, Math.floor(+pack)), level: pc.level, by: (me() || {}).id, ts: Date.now(), verified: true };
    // the old list on the item: drop this barcode from any OTHER item (it was wrong there); never touch names
    D.stock.forEach(x => { if (x && x.id !== itemId && (x.codes || []).some(c => S.parseCode(c).key === pc.key)) x.codes = x.codes.filter(c => S.parseCode(c).key !== pc.key); });
    try { save(); } catch (e) { }
    return M[id];
  }
  window.v2Link = v2Link;

  // ── 2. known item: how many?
  function v2Qty(it, pack) {
    if (!scM) return; const out = scM.mode === 'out';
    if (pack == null && scM.pc && scM.pc.level === 'box') { v2AskPack(it, scM.pc.count || (scM.lp && scM.lp.pack) || null); return; }
    pack = pack == null ? 1 : +pack;
    scM.qItem = it.id; scM.pack = pack; scM.q = 1;
    const L = scLines(); const ex = L.find(l => l.id === it.id);
    const unit = E(it.unit || 'pc');
    sheet('<div class="scItem">' + scPic(it.img || scM.thumb) + '<div><b>' + E(it.name) + '</b><small>' + T('In the garage') + ': ' + (+it.qty || 0) + ' ' + unit + (pack > 1 ? ' · 📦 ' + T('box of') + ' ' + pack : '') + '</small></div></div>' +
      (ex ? '<div class="v2st">' + T('Already in this list') + ': ' + ex.qty + ' ' + unit + '</div>' : '') +
      '<div style="font-weight:700;margin:12px 0 6px">' + (pack > 1 ? (out ? T('How many boxes are you taking?') : T('How many boxes are you putting back?')) : (out ? T('How many are you taking out?') : T('How many are you putting back?'))) + '</div>' +
      '<div class="scStep"><button type="button" aria-label="less" onclick="scQ(-1)">−</button><input id="scQn" type="number" inputmode="numeric" pattern="[0-9]*" min="1" value="1" onfocus="this.select()" oninput="scQ(0,parseInt(this.value)||0,1)"><button type="button" aria-label="more" onclick="scQ(1)">+</button></div>' +
      '<div class="scChips">' + (pack > 1 ? [1, 2, 3, 4, 5, 10] : [1, 2, 5, 10, 25, 50, 100]).map(n => '<button type="button" class="chip" onclick="scQ(0,' + n + ')">' + n + '</button>').join('') + '</div>' +
      '<div class="v2st" id="v2tot"></div>' +
      '<button type="button" class="btn gr" id="scQok" style="margin-top:10px;padding:14px;font-size:17px" onclick="scQOk()"></button>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><button type="button" class="btn sec2" style="flex:1;padding:9px" onclick="scSkip()">' + T('Cancel') + '</button><button type="button" class="btn sec2" style="flex:1;padding:9px" onclick="scWrong()">✗ ' + T('Wrong item') + '</button></div>');
    scQ(0, 1);
  }
  window.scAskQty = function (s) { const pc = scM && scM.pc; let pack = 1; if (pc) { const r = S.identify(pc, ctx()); if (r.status === 'known' && r.item.id === s.id) pack = r.pack; } v2Qty(s, pack); };
  window.scQ = function (d, set, typing) {
    if (!scM) return; scM.q = set != null ? Math.max(0, Math.min(100000, set)) : Math.max(1, (scM.q || 0) + d);
    const i = $('scQn'); if (i && !typing) i.value = scM.q;
    const it = stockById(scM.qItem); const pack = scM.pack || 1; const units = S.unitsFor(scM.q, pack); const u = (it && it.unit) || 'pc';
    const tot = $('v2tot'); if (tot) tot.textContent = pack > 1 ? '= ' + units + ' ' + u + ' (' + scM.q + ' × ' + pack + ')' : '';
    const b = $('scQok'); if (b) { b.textContent = '✓ ' + (scM.mode === 'out' ? T('Take out') : T('Put back')) + ' ' + (pack > 1 ? scM.q + ' ' + T(scM.q === 1 ? 'box' : 'boxes') + ' (' + units + ' ' + u + ')' : scM.q); b.disabled = !scM.q; }
  };
  window.scQOk = function () {
    if (!scM || !scM.q) return; const s = stockById(scM.qItem); if (!s) { scResume(); return; }
    if (!s.img && scM.thumb) { s.img = scM.thumb; try { save(); } catch (e) { delete s.img; } }
    const units = S.unitsFor(scM.q, scM.pack || 1);
    const L = scLines(); const ex = L.find(l => l.id === s.id);
    if (ex) ex.qty += units; else L.push({ id: s.id, name: s.name, unit: s.unit || 'pc', qty: units, code: true });
    scList(s.name); scResume(); const h = $('scHint'); if (h) h.innerHTML = '✓ ' + units + '× ' + E(s.name);
  };

  // ── a box barcode the first time: how many are inside?
  function v2AskPack(it, guess) {
    scM.packFor = it.id;
    sheet(head(T('Box barcode'), codeLabel(scM.pc)) +
      '<div style="margin:6px 0"><b>' + E(it.name) + '</b></div>' +
      '<div style="font-weight:700;margin:8px 0 6px">' + T('How many are in ONE box?') + '</div>' +
      '<div class="scStep"><button type="button" onclick="v2PackStep(-1)">−</button><input id="v2pack" type="number" inputmode="numeric" min="1" value="' + (guess || '') + '" placeholder="' + T('e.g. 10') + '"><button type="button" onclick="v2PackStep(1)">+</button></div>' +
      '<div class="scChips">' + [5, 10, 20, 25, 50, 100].map(n => '<button type="button" class="chip" onclick="document.getElementById(\'v2pack\').value=' + n + '">' + n + '</button>').join('') + '</div>' +
      (guess ? '<div class="v2st">📷 ' + T('Read on the box') + ': ' + guess + '</div>' : '') +
      '<button type="button" class="btn gr" style="margin-top:10px;padding:13px" onclick="v2PackOk()">✓ ' + T('Save box size') + '</button>' +
      '<button type="button" class="btn sec2" style="margin-top:6px;padding:9px" onclick="scSkip()">' + T('Cancel') + '</button>');
  }
  window.v2PackStep = function (d) { const i = $('v2pack'); i.value = Math.max(1, (parseInt(i.value) || 0) + d); };
  window.v2PackOk = function () { const n = parseInt(($('v2pack') || {}).value) || 0; if (n < 1) { toast(T('Type how many are in the box')); return; } const it = stockById(scM.packFor); if (!it) return; v2Link(it.id, n); toast('📦 ' + T('Box of') + ' ' + n + ' — ' + it.name, 'green'); v2Qty(it, n); };

  // ── same barcode confirmed on two items (two phones, or a past mistake): the person picks
  function v2Conflict(r) {
    sheet(head(T('Pick the right item'), codeLabel(r.pc)) + '<div class="v2warn">' + T('This barcode is saved on more than one item. Tap the right one — the other link is removed.') + '</div>' +
      r.candidates.map(c => '<button type="button" class="v2c" onclick="v2Choose(\'' + J(c.item.id) + '\')"><b>' + E(c.item.name) + '</b><small>' + T('In the garage') + ': ' + (+c.item.qty || 0) + ' ' + E(c.item.unit || 'pc') + '</small></button>').join('') +
      '<button type="button" class="btn sec2" style="margin-top:6px;padding:9px" onclick="v2New()">' + T('None of these') + '</button>');
  }
  window.v2Choose = function (id) {
    const it = stockById(id); if (!it || !scM) return; const pc = scM.pc;
    const prev = S.allLinks(D.stock, maps()).find(l => l.key === pc.key && l.item === id);
    v2Link(id, prev ? prev.pack : null);
    // remove the other items' old links to this barcode
    Object.keys(maps()).forEach(k => { const m = maps()[k]; if (m && m.item !== id && S.parseCode(m.code || '').key === pc.key) delete maps()[k]; });
    try { save(); } catch (e) { }
    const r = S.identify(pc, ctx()); v2Qty(it, r.status === 'known' ? r.pack : null);
  };

  // ── box ↔ single barcode of an item we know: ask, never assume
  function v2Family(r) {
    const pc = r.pc; const c = r.candidates[0];
    sheet(head(pc.level === 'box' ? T('New box barcode') : T('New barcode'), codeLabel(pc)) +
      '<div style="font-size:13px;margin:4px 0">' + (pc.level === 'box' ? T('This looks like the BOX of an item you already have:') : T('This looks like the SINGLE item of a box you already have:')) + '</div>' +
      r.candidates.map(x => '<button type="button" class="v2c top" onclick="v2FamilyYes(\'' + J(x.item.id) + '\')"><b>' + E(x.item.name) + '</b><small>' + T('Same number family — please check the label') + '</small></button>').join('') +
      '<button type="button" class="btn sec2" style="margin-top:6px;padding:10px" onclick="v2New()">' + T('No — it is a different item') + '</button>');
    void c;
  }
  window.v2FamilyYes = function (id) {
    const it = stockById(id); if (!it) return;
    if (scM.pc.level === 'box') v2AskPack(it, scM.pc.count || null); else { v2Link(id, 1); v2Qty(it, 1); }
  };

  // ── 3. not known: find out what it is
  window.v2New = function () {
    if (!scM) return; const pc = scM.pc; if (!pc) return;
    scM.lp = null; scM.online = null; scM.ai = null; scM.ocrText = '';
    sheet(head(pc.level === 'box' ? T('New box barcode') : T('New barcode'), codeLabel(pc)) +
      '<div style="font-size:13px;margin:2px 0 6px">' + T('Which item is this? You only do this once — next time it knows.') + '</div>' +
      '<div id="v2steps" class="v2st"></div><div id="scLook"></div><div id="v2cands"></div>' +
      '<input id="scFind" type="search" placeholder="🔍 ' + T('Search your items or type a new one…') + '" oninput="scMatch()" autocomplete="off"><div id="scRes"></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><button type="button" class="btn sec2" style="flex:1;padding:9px" onclick="scSkip()">' + T('Skip') + '</button></div>');
    v2Find(pc.key);
  };
  window.scAsk = function () { window.v2New(); };
  function step(txt) { const s = $('v2steps'); if (s) s.innerHTML = txt; }
  function still(key) { return scM && scM.pc && scM.pc.key === key && $('v2steps'); }

  async function v2Find(key) {
    const pc = scM.pc;
    let best = null; const props = [];
    // a) Code 128 text that IS a part number
    if (pc.text) { const pcs = S.partCandidates(pc.text); if (pcs[0]) props.push({ brand: S.brandFromText(pc.text), part: pcs[0].p, desc: '', name: '', conf: 'medium', why: ['part number in the barcode'], src: 'code' }); }
    // b) online product databases (numeric barcodes)
    if (pc.gtin && typeof window.EX_upc === 'function' && !(window.EX_SYNC && window.EX_SYNC.online === false)) {
      step('🔎 ' + T('Looking up this barcode online…'));
      let r = null; try { r = await window.EX_upc(pc.level === 'box' ? pc.family.slice(1) : pc.gtin.slice(1)); } catch (e) { }
      if (!still(key)) return;
      if (r && r.found && r.title) { const o = S.parseOnline(r, pc); if (o) { o.img = /^https:/.test(r.image || '') ? r.image : ''; props.push(o); scM.online = o; } }
    }
    // c) read the label (photo around the barcode)
    const good = props.find(p => p.conf === 'high' || (p.src !== 'code' && p.part));
    if (!good && scM.snap) {
      step('📷 ' + T('Reading the label…'));
      let lp = null;
      try { lp = await v2ReadLabel(scM.snap, pc, (m) => still(key) && step(m)); } catch (e) { }
      if (!still(key)) return;
      if (lp) { scM.lp = lp; if (lp.name || lp.part) props.push(Object.assign({ src: 'label' }, lp)); }
      // d) AI, only if the label reading is unsure and AI is switched on
      if ((!lp || lp.conf === 'low') && window.EX_CFG && window.EX_CFG.ai && window.EX_sb) {
        step('🤖 ' + T('Asking AI to read the label…'));
        const a = await v2AI(scM.snap, scM.ocrText, scM.online);
        if (!still(key)) return;
        if (a) { scM.ai = a; props.push(Object.assign({ src: 'ai' }, a)); }
      }
    }
    step('');
    // the best reading, by confidence (high beats medium; label/online beat a bare code)
    const rank = { high: 3, medium: 2, low: 1 };
    props.sort((a, b) => (rank[b.conf] || 0) - (rank[a.conf] || 0) || (b.part ? 1 : 0) - (a.part ? 1 : 0));
    best = props.find(p => p.conf !== 'low' && (p.name || p.part)) || props.find(p => p.src === 'ai' && p.part) || null; // an unverified AI reading is shown only with a warning
    scM.best = best; scM.part = best && best.part || '';
    v2Show(best, props);
  }
  window.v2Find = v2Find;

  // label reading, stopping as soon as it is sure:
  //  1) contrast-boosted photo, 3 text layouts  2) "clean label" (local threshold, box lines removed), 2 layouts
  //  3) clean label turned ¼, ¾, ½  4) clean label straightened ±6°
  // (test/v2/eval_labels.js scores this exact order on 650 label photos)
  async function v2ReadLabel(snap, pc, onStep) {
    const lt = learned(); let text = ''; let lp = null;
    const go = async (img, modes) => { const tx = await ocrMulti(img, modes); text += '\n' + tx; const l2 = S.parseLabel(text, { code: pc, learned: lt }); if (!lp || l2.conf === 'high' || rankOf(l2) > rankOf(lp) || (rankOf(l2) === rankOf(lp) && l2.score > lp.score)) lp = l2; return lp.conf === 'high'; };
    const say = (m) => onStep && onStep('📷 ' + T('Reading the label…') + (m ? ' (' + T(m) + ')' : ''));
    const prep = await ocrPrep(snap);
    if (await go(prep, ['6', '11', '3'])) return done();
    say('cleaning up the photo'); const clean = await labelClean(snap);
    if (await go(clean, ['6', '11'])) return done();
    for (const deg of [90, 270, 180]) { say('turning the photo'); if (await go(await labelClean(snap, deg), ['11'])) return done(); }
    for (const deg of [-6, 6]) { say('straightening the photo'); if (await go(await labelClean(snap, deg, true), ['6'])) return done(); }
    return done();
    function done() { scM && (scM.ocrText = text); return lp; }
  }
  const rankOf = (l) => ({ high: 3, medium: 2, low: 1 }[l && l.conf] || 0);
  // "clean label": gray → local-mean threshold (window 51 px, 12% darker than the area = ink) → long box/table lines removed.
  // deg rotates first (90/180/270 turns, or a small ±6° straightening on a gray background)
  function labelClean(dataUrl, deg, small) {
    return new Promise(ok => {
      const im = new Image();
      im.onload = () => {
        try {
          deg = deg || 0; const q = !small && deg % 180 !== 0;
          const W = q ? im.height : im.width, H = q ? im.width : im.height;
          const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
          g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, W, H);
          g.translate(W / 2, H / 2); g.rotate(-deg * Math.PI / 180); /* counter-clockwise, same as the tests */ g.drawImage(im, -im.width / 2, -im.height / 2); g.setTransform(1, 0, 0, 1, 0, 0);
          const d = g.getImageData(0, 0, W, H), p = d.data, n = W * H;
          const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
          const ii = new Float64Array((W + 1) * (H + 1));
          for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += a[y * W + x]; ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + row; } }
          const r = 25, k = 0.12; const b = new Uint8Array(n);
          for (let y = 0; y < H; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1); for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
            const S2 = ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0]; const m = S2 / ((y1 - y0) * (x1 - x0)); b[y * W + x] = a[y * W + x] < m * (1 - k) ? 0 : 255; } }
          const kill = new Uint8Array(n);
          for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x <= W; x++) { if (x < W && b[y * W + x] < 100) run++; else { if (run > W * 0.25) for (let xx = x - run; xx < x; xx++) kill[y * W + xx] = 1; run = 0; } } }
          for (let x = 0; x < W; x++) { let run = 0; for (let y = 0; y <= H; y++) { if (y < H && b[y * W + x] < 100) run++; else { if (run > H * 0.12) for (let yy = y - run; yy < y; yy++) kill[yy * W + x] = 1; run = 0; } } }
          for (let i = 0; i < n; i++) { const v = kill[i] ? 255 : b[i]; p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; p[i * 4 + 3] = 255; }
          g.putImageData(d, 0, 0); ok(c.toDataURL('image/png'));
        } catch (e) { ok(dataUrl); }
      };
      im.onerror = () => ok(dataUrl); im.src = dataUrl;
    });
  }
  async function ocrMulti(img, modes) {
    if (window.ocrText !== OCR0) return window.ocrText(img, modes); // a test (or another reader) replaced it
    const Tz = await loadTess(); if (!window._tessV2) window._tessV2 = await Tz.createWorker('eng');
    let out = '';
    for (const m of modes) { try { await window._tessV2.setParameters({ tessedit_pageseg_mode: m }); const r = await window._tessV2.recognize(img); out += ((r && r.data && r.data.text) || '') + '\n'; } catch (e) { } }
    return out;
  }
  window.labelClean = labelClean;
  function rotate(dataUrl, deg) {
    return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); const q = deg % 180 !== 0; c.width = q ? im.height : im.width; c.height = q ? im.width : im.height; const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(im, -im.width / 2, -im.height / 2); ok(c.toDataURL('image/jpeg', 0.9)); }; im.onerror = () => ok(dataUrl); im.src = dataUrl; });
  }
  async function v2AI(snap, ocrTxt, online) {
    try {
      const b64 = String(snap).split(',')[1]; if (!b64) return null;
      const r = await window.EX_sb.functions.invoke('ai', { body: { messages: [{ role: 'user', content: S.AI_PROMPT }], images: [{ type: 'image/jpeg', data: b64 }], tier: 'quick' } });
      const txt = r && r.data && r.data.text; if (!txt) return null;
      const m = String(txt).match(/\{[\s\S]*\}/); if (!m) return null;
      return S.checkAI(JSON.parse(m[0]), ocrTxt, online);
    } catch (e) { return null; }
  }

  // show: matches already in the garage list (tap to confirm), the reading as a new item (editable), or "type it"
  function v2Show(best, props) {
    const box = $('scLook'); const cb = $('v2cands'); if (!box || !cb) return;
    const q = best || {};
    let cands = [];
    if (best) cands = S.matchInventory(best, D.stock);
    else if (scM.lp) cands = S.matchInventory({ parts: scM.lp.parts, part: scM.lp.parts[0], brand: scM.lp.brand, desc: scM.lp.desc }, D.stock).filter(c => c.score >= 0.7);
    scM.cands = cands;
    const strong = cands.filter(c => c.score >= 0.85);
    cb.innerHTML = cands.length ? '<div style="font-size:12px;color:#555;margin:6px 0 2px">' + (strong.length ? T('Is it one of these? (already in your items)') : T('Possible matches — check before tapping:')) + '</div>' +
      cands.slice(0, 4).map((c, i) => '<button type="button" class="v2c' + (c.score >= 0.85 && i === 0 ? ' top' : '') + '" onclick="v2Pick(\'' + J(c.item.id) + '\')"><b>' + E(c.item.name) + '</b><small>' + E(T(c.why)) + ' · ' + Math.round(c.score * 100) + '%</small></button>').join('') : '';
    if (best) {
      const src = { label: '📷 ' + T('read on the label'), online: '🔎 ' + T('online product database'), upcitemdb: '🔎 ' + T('online product database'), ai: '🤖 AI', code: '▦ ' + T('barcode') };
      const tag = best.conf === 'high' ? '<span class="v2tag hi">' + T('sure') + '</span>' : '<span class="v2tag">' + T('check it') + '</span>';
      const pack = scM.pc.level === 'box' ? (scM.pc.count || best.pack || '') : '';
      box.innerHTML = '<div class="scLk on" style="display:block">' + (best.img ? '<img src="' + E(best.img) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()" style="float:right">' : '') +
        '<small>' + (src[best.src] || src.label) + tag + '</small>' +
        '<div class="v2f"><label>' + T('Maker') + '</label><input id="v2b" value="' + E(best.brand || '') + '">' +
        '<label>' + T('Part #') + '</label><input id="v2p" value="' + E(best.part || '') + '" autocapitalize="characters">' +
        '<label>' + T('Description') + '</label><input id="v2d" value="' + E(best.desc || '') + '">' +
        '<label>' + T('Color') + '</label><input id="v2c" value="' + E(best.color || '') + '">' +
        '<label>' + T('Unit') + '</label><input id="v2u" value="' + E(best.unit || 'pc') + '">' +
        (scM.pc.level === 'box' ? '<label>📦 ' + T('In one box') + '</label><input id="v2n" type="number" inputmode="numeric" min="1" value="' + E(pack) + '" placeholder="' + T('how many') + '">' : '') +
        '</div>' + (best.why && best.why.length ? '<small>' + E(best.why.join(' · ')) + '</small>' : '') + '</div>' +
        (best.src === 'ai' && !best.verified ? '<div class="v2warn">' + T('AI could not find this part number printed on the label. Check it before saving.') + '</div>' : '') +
        '<button type="button" class="btn gr" style="margin:6px 0 4px;padding:12px" onclick="v2SaveNew()">✓ ' + (strong.length ? T('No, save as a NEW item') : T('Save as new item')) + '</button>';
      const f = $('scFind'); if (f && !f.value) { f.value = [best.brand, best.part].filter(Boolean).join(' ') || (best.desc || ''); }
    } else {
      const seen = scM.lp ? S.descLines(scM.ocrText).slice(0, 3).map(o => o.l) : [];
      const br = (scM.lp && scM.lp.brand) || S.brandFromCode(scM.pc, learned());
      box.innerHTML = '<div class="v2warn">' + T('Could not identify this item for sure. Search your items, or type the name.') + (br ? ' ' + T('Maker') + ': <b>' + E(br) + '</b>' : '') + '</div>' +
        (seen.length ? '<div style="font-size:12px;color:#555">' + T('Words seen on the label (tap to use):') + '</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0">' + seen.map(l => '<button type="button" class="chip" onclick="v2UseWords(this)">' + E(l) + '</button>').join('') + '</div>' : '');
      const f = $('scFind'); if (f && !f.value && br) f.value = br + ' ';
      try { f && f.focus(); } catch (e) { }
    }
    scMatch();
  }
  window.v2UseWords = function (b) { const f = $('scFind'); if (f) { f.value = ((f.value || '').trim() + ' ' + b.textContent).trim(); scMatch(); } };

  // search / type: fuzzy suggestions from the items list (tap to link) + "new item" with exactly what was typed
  window.scMatch = function () {
    const q = (($('scFind') || {}).value || '').trim(); const el = $('scRes'); if (!el) return;
    let list = [];
    if (q.length >= 2) {
      const pcs = S.partCandidates(q);
      const scored = D.stock.map(x => { let s = 0; try { s = typeof toolScore === 'function' ? toolScore(x, q) : 0; } catch (e) { } const f = S.nameSim(q, x.name); const pk = pcs[0] ? S.matchInventory({ part: pcs[0].p }, [x]) : []; return { x, s: Math.max(s > 0 ? 0.5 + Math.min(0.4, s / 100) : 0, f * 0.9, pk[0] ? pk[0].score : 0) }; }).filter(r => r.s >= 0.5);
      list = scored.sort((a, b) => b.s - a.s).slice(0, 6).map(r => r.x);
    }
    const exact = D.stock.some(x => typeof norm === 'function' ? norm(x.name) === norm(q) : x.name.toLowerCase() === q.toLowerCase());
    el.innerHTML = list.map(x => '<div class="pk" style="padding:9px 12px" onclick="v2Pick(\'' + J(x.id) + '\')"><span>' + E(x.name) + '</span><small>' + (+x.qty || 0) + ' ' + E(x.unit || '') + '</small></div>').join('') +
      (q && !exact ? '<div class="pk" style="padding:9px 12px;border-style:dashed" onclick="v2SaveTyped()"><span>+ ' + T('New item') + ': <b>' + E(q) + '</b></span></div>' : '');
  };

  // tapping an existing item = the person confirms it
  window.v2Pick = function (id) {
    const it = stockById(id); if (!it || !scM) return;
    if (scM.pc.level === 'box') { const n = parseInt(($('v2n') || {}).value) || scM.pc.count || (scM.best && scM.best.pack) || null; if (n) { v2Link(id, n); toast('🔗 ' + T('Barcode saved for') + ' ' + it.name, 'green'); v2Qty(it, n); return; } v2AskPack(it, null); return; }
    v2Link(id, 1);
    // fill in a missing part number / maker on the item (only empty fields; staff only, like the server rule)
    const b = scM.best; if (b && staff()) { let ch = false; if (b.part && !it.model) { it.model = b.part; ch = true; } if (b.brand && !it.brand) { it.brand = b.brand; ch = true; } if (ch) try { save(); } catch (e) { } }
    toast('🔗 ' + T('Barcode saved for') + ' ' + it.name, 'green'); v2Qty(it, 1);
  };
  window.scLink = window.v2Pick;

  function createItem(fields) {
    const pc = scM.pc; let id = S.newItemId(pc);
    const ex = stockById(id);
    if (ex) return ex; // another phone already made it from this barcode
    const s = { id, name: fields.name, unit: fields.unit || 'pc', qty: 0, min: 0 };
    if (fields.brand) s.brand = fields.brand; if (fields.part) s.model = fields.part; if (fields.color) s.color = fields.color;
    if (scM.thumb) s.img = scM.thumb; else if (fields.img) s.img = fields.img;
    s.created = { by: (me() || {}).id, ts: Date.now(), src: fields.src || 'typed' };
    D.stock.push(s); try { save(); } catch (e) { }
    return s;
  }
  // saving the reading as a new item — the person saw every field
  window.v2SaveNew = function () {
    if (!scM) return; const b = scM.best || {};
    const f = { brand: (($('v2b') || {}).value || '').trim(), part: S.normPart(($('v2p') || {}).value || ''), desc: (($('v2d') || {}).value || '').trim(), color: (($('v2c') || {}).value || '').trim(), unit: (($('v2u') || {}).value || 'pc').trim() || 'pc', src: b.src, img: b.img };
    let desc = f.desc; if (f.color && desc && !new RegExp('\\b' + f.color + '\\b', 'i').test(desc)) desc += ' ' + f.color;
    f.name = [f.brand, f.part, desc].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!f.name) { toast(T('Type the item')); return; }
    // still catch duplicates by part number before making a new item
    if (f.part) { const dup = S.matchInventory({ part: f.part, brand: f.brand }, D.stock).find(c => c.score >= 0.97); if (dup && !scM.dupOk) { scM.dupOk = true; const cb = $('v2cands'); if (cb) cb.innerHTML = '<div class="v2warn">' + T('You already have an item with this part number:') + '</div><button type="button" class="v2c top" onclick="v2Pick(\'' + J(dup.item.id) + '\')"><b>' + E(dup.item.name) + '</b><small>' + T('Tap to use it') + '</small></button><div style="font-size:12px;color:#666">' + T('Tap Save again only if it really is a different item.') + '</div>'; return; } }
    const s = createItem(f); const n = parseInt(($('v2n') || {}).value) || null;
    if (scM.pc.level === 'box') { if (n) { v2Link(s.id, n); v2Qty(s, n); } else v2AskPack(s, scM.pc.count || b.pack || null); }
    else { v2Link(s.id, 1); toast('✓ ' + s.name, 'green'); v2Qty(s, 1); }
  };
  window.v2SaveTyped = function () {
    const q = (($('scFind') || {}).value || '').trim(); if (!q || !scM) return;
    const pcs = S.partCandidates(q); const f = { name: q, unit: 'pc', brand: S.brandFromText(q) || '', part: pcs[0] ? pcs[0].p : '', src: 'typed' };
    const s = createItem(f);
    if (scM.pc.level === 'box') v2AskPack(s, scM.pc.count || null); else { v2Link(s.id, 1); v2Qty(s, 1); }
  };
  window.scNew = window.v2SaveTyped;
  window.scUseLook = window.v2SaveNew;

  // wrong item: take this barcode off it and identify again
  window.scWrong = function () {
    if (!scM || !scM.pc) return; const pc = scM.pc;
    Object.keys(maps()).forEach(k => { const m = maps()[k]; if (m && S.parseCode(m.code || '').key === pc.key) delete maps()[k]; });
    D.stock.forEach(x => { if (x && (x.codes || []).some(c => S.parseCode(c).key === pc.key)) x.codes = x.codes.filter(c => S.parseCode(c).key !== pc.key); });
    try { save(); } catch (e) { }
    scM.snap = scM.snap || scSnap(); window.v2New();
  };

  // the old lookup/label steps are replaced
  window.scLookup = function () { };
  window.scReadLabel = async function () { return false; };
  window.bcItem = function (code) { const r = S.identify(code, ctx()); return r.status === 'known' ? r.item : null; };
  window.bcNorm = function (c) { const p = S.parseCode(c); return p.ok ? p.key : String(c || ''); };

  // Spanish
  try {
    const ES2 = { 'box barcode': 'código de caja', 'That barcode did not read cleanly — hold steady and scan again': 'El código no se leyó bien — quédate quieto y escanea otra vez', 'box of': 'caja de', 'Box of': 'Caja de', 'Already in this list': 'Ya en esta lista',
      'How many boxes are you taking?': '¿Cuántas cajas llevas?', 'How many boxes are you putting back?': '¿Cuántas cajas devuelves?', 'box': 'caja', 'boxes': 'cajas', 'Box barcode': 'Código de caja', 'How many are in ONE box?': '¿Cuántos hay en UNA caja?',
      'e.g. 10': 'ej. 10', 'Read on the box': 'Leído en la caja', 'Save box size': 'Guardar tamaño de caja', 'Type how many are in the box': 'Escribe cuántos hay en la caja', 'Pick the right item': 'Elige el artículo correcto',
      'This barcode is saved on more than one item. Tap the right one — the other link is removed.': 'Este código está en más de un artículo. Toca el correcto — se quita el otro.', 'None of these': 'Ninguno de estos',
      'New box barcode': 'Nuevo código de caja', 'This looks like the BOX of an item you already have:': 'Parece la CAJA de un artículo que ya tienes:', 'This looks like the SINGLE item of a box you already have:': 'Parece la PIEZA de una caja que ya tienes:',
      'Same number family — please check the label': 'Misma familia de número — revisa la etiqueta', 'No — it is a different item': 'No — es otro artículo', 'Search your items or type a new one…': 'Busca tus artículos o escribe uno nuevo…',
      'Looking up this barcode online…': 'Buscando este código en línea…', 'turning the photo': 'girando la foto', 'cleaning up the photo': 'limpiando la foto', 'straightening the photo': 'enderezando la foto', 'Asking AI to read the label…': 'Pidiendo a la IA que lea la etiqueta…', 'Is it one of these? (already in your items)': '¿Es uno de estos? (ya en tus artículos)',
      'Possible matches — check before tapping:': 'Posibles coincidencias — revisa antes de tocar:', 'read on the label': 'leído en la etiqueta', 'online product database': 'base de productos en línea', 'barcode': 'código', 'sure': 'seguro', 'check it': 'revísalo',
      'Maker': 'Marca', 'Part #': 'Nº de parte', 'Description': 'Descripción', 'Color': 'Color', 'Unit': 'Unidad', 'In one box': 'En una caja', 'how many': 'cuántos', 'AI could not find this part number printed on the label. Check it before saving.': 'La IA no encontró este número de parte en la etiqueta. Revísalo antes de guardar.',
      'No, save as a NEW item': 'No, guardar como artículo NUEVO', 'Save as new item': 'Guardar como artículo nuevo', 'Could not identify this item for sure. Search your items, or type the name.': 'No se pudo identificar con seguridad. Busca en tus artículos o escribe el nombre.',
      'Words seen on the label (tap to use):': 'Palabras en la etiqueta (toca para usar):', 'You already have an item with this part number:': 'Ya tienes un artículo con este número de parte:', 'Tap to use it': 'Toca para usarlo', 'Tap Save again only if it really is a different item.': 'Toca Guardar otra vez solo si de verdad es otro artículo.',
      'same part number': 'mismo número de parte', 'same part number (OCR look-alike letters)': 'mismo número de parte (letras parecidas)', 'part number 1 character apart': 'número de parte con 1 carácter distinto', 'part number 2 characters apart': 'número de parte con 2 caracteres distintos', 'matches another part number on the label': 'coincide con otro número de la etiqueta' };
    if (typeof ES === 'object' && ES) Object.assign(ES, ES2);
  } catch (e) { }
  window.SV2_UI = { version: 'v2.0', v2Link, v2Qty, v2Find };
})();
