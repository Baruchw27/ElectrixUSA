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
    '.v2nocode{position:absolute;right:10px;bottom:10px;z-index:3;border:0;border-radius:18px;background:rgba(0,0,0,.6);color:#fff;font-size:13px;padding:8px 12px}.v2ft{position:absolute;left:10px;top:10px;z-index:3;background:#6a1b9a;color:#fff;font-size:12px;padding:5px 10px;border-radius:10px;cursor:pointer}' +
    '.v2tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:8px;background:#eef;color:#334;margin-left:4px}.v2tag.lo{background:#fde8e8;color:#922}.v2tag.hi{background:#e3f6ea;color:#185c34}';
  document.head.appendChild(css);

  // ── FIELD TEST (staging only, EX_CFG.fieldtest): one record per scan in the staging table scan_field_log —
  //    what the camera read and how fast, what the scanner suggested, what the person confirmed, whether AI was used,
  //    and whether the person had to correct anything. No names, no location; the phone is recorded only as
  //    "iPhone iOS 18.1"; a small label photo is kept only when a scan failed or was corrected. Never on the live app.
  const FT = !!(window.EX_CFG && window.EX_CFG.fieldtest);
  const ftQ = []; let ftBusy = false; let ftCount = 0;
  let ftSess = ''; try { ftSess = localStorage.getItem('ex_ft_sess') || ''; } catch (e) { }
  if (!ftSess) { ftSess = new Date().toISOString().slice(0, 10) + '-' + Math.random().toString(36).slice(2, 7); try { localStorage.setItem('ex_ft_sess', ftSess); } catch (e) { } }
  window.v2FtNewSession = function () { ftSess = new Date().toISOString().slice(0, 10) + '-' + Math.random().toString(36).slice(2, 7); ftCount = 0; try { localStorage.setItem('ex_ft_sess', ftSess); } catch (e) { } return ftSess; };
  window.v2FtSession = () => ftSess;
  window.EX_ftQueue = ftQ; // (read by the staging tests)
  function devLabel() { const u = navigator.userAgent || ''; let m;
    if ((m = u.match(/iPhone OS (\d+)[_.](\d+)/))) return 'iPhone iOS ' + m[1] + '.' + m[2];
    if ((m = u.match(/iPad.*OS (\d+)[_.](\d+)/))) return 'iPad iOS ' + m[1] + '.' + m[2];
    if ((m = u.match(/Android (\d+(?:\.\d+)?)/))) return 'Android ' + m[1];
    return /Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'other'; }
  function ftRow(o) { if (!FT) return; try { ftQ.push(Object.assign({ ev: 'scan', session: ftSess, device: devLabel() }, o)); ftFlush(); } catch (e) { } }
  function ftStart(o) { if (!FT || !scM) return; scM.ft = Object.assign({ scan_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t0: Date.now(), ai_used: false }, o || {}); }
  function ftConfirm(o) { if (!FT || !scM || !scM.ft) return; scM.ft.confirmed = Object.assign(scM.ft.confirmed || {}, o); }
  function ftEnd(outcome) {
    if (!FT || !scM || !scM.ft) return; const f = scM.ft; scM.ft = null; const pc = scM.pc || {};
    const sg = f.sugg || null, cf = f.confirmed || null; const pk = (x) => S.partKey(x || '');
    const corrected = !!(f.wrong || (sg && cf && sg.item && cf.item && sg.item !== cf.item) ||
      (sg && cf && sg.part && cf.part && pk(sg.part) !== pk(cf.part)) || (sg && cf && sg.pack && cf.pack && +sg.pack !== +cf.pack));
    ftRow({ scan_id: f.scan_id, engine: f.engine || null, format: pc.type || null, raw: pc.raw ? String(pc.raw).slice(0, 80) : null, ok: f.ok !== false, code_key: pc.key || null, level: pc.level || null,
      via: f.via || null, status: f.status || null, ms: f.ms || null, total_ms: Date.now() - f.t0, ai_used: !!f.ai_used, ai_ms: f.ai_ms || null,
      sugg: sg ? Object.assign({}, sg, f.wrong ? { wrong: true } : {}) : (f.wrong ? { wrong: true } : null), confirmed: cf, corrected,
      note: outcome + (f.ai_err ? ' · AI: ' + f.ai_err : ''), item: cf && cf.item || null, item_name: cf && cf.name || null, pack: cf && cf.pack || null, units: f.units || null,
      thumb: (outcome !== 'counted' || corrected || f.ok === false) ? (scM.thumb || null) : null });
    ftCount++; const b = $('v2ftn'); if (b) b.textContent = ftCount;
  }
  async function ftFlush() {
    if (ftBusy || !ftQ.length || !window.EX_sb || (window.EX_SYNC && window.EX_SYNC.online === false)) return; ftBusy = true;
    let rows = [];
    try { rows = ftQ.splice(0, 20); const r = await window.EX_sb.from('scan_field_log').insert(rows); if (r && r.error) throw r.error; rows = []; }
    catch (e) { if (rows.length && ftQ.length < 300) ftQ.unshift(...rows); } // keep them and try again later
    finally { ftBusy = false; if (ftQ.length) setTimeout(ftFlush, 4000); }
  }
  { const _res = window.scResume; window.scResume = function () { const r = _res.apply(this, arguments); if (scM) scM.readyAt = Date.now(); return r; }; }
  { const _sk = window.scSkip; window.scSkip = function () { ftEnd('skipped'); return _sk.apply(this, arguments); }; }
  { const _cl = window.scanClose; window.scanClose = function () { try { if (scM && scM.ft) ftEnd('closed before finishing'); else if (FT && scM && !scM.pausedCode && scM.readyAt && Date.now() - scM.readyAt > 8000) ftRow({ ok: false, status: 'nothing read', note: 'closed the camera without a read', ms: Date.now() - scM.readyAt, total_ms: Date.now() - scM.readyAt }); } catch (e) { } return _cl.apply(this, arguments); }; }

  // ── barcode reader: also pass along what kind of barcode it was (UPC-A / UPC-E / EAN / ITF-14 / Code 128)
  const _bcEngine = window.bcEngine;
  window.bcEngine = async function (video, onCode) {
    if (window.EX_fakeScan) return window.EX_fakeScan(video, onCode);
    if (scM) scM.readyAt = scM.readyAt || Date.now();
    const t0 = () => (scM && scM.readyAt) || Date.now();
    // EAN-8, UPC-E and ITF have weak protection against misreads (in the camera test a damaged Code 128 once came out
    // as a valid EAN-8): those only count when the same number is read twice in a row.
    let prev = { k: '', t: 0 };
    const weak = (f) => /ean[_-]?8|upc[_-]?e|itf/i.test(String(f || ''));
    const report = (eng) => (raw, fmt) => {
      if (weak(fmt)) { const now = Date.now(); if (!(prev.k === raw && now - prev.t < 1500)) { prev = { k: raw, t: now }; return; } }
      prev = { k: '', t: 0 };
      if (scM && !scM.pausedCode) { scM.engine = eng; scM.decodeMs = Date.now() - t0(); } onCode(raw, fmt); };
    if ('BarcodeDetector' in window) {
      try {
        const fm = await BarcodeDetector.getSupportedFormats();
        const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix'].filter(f => fm.includes(f));
        if (want.length) {
          const det = new BarcodeDetector({ formats: want }); let on = true;
          const tick = async () => { if (!on) return; try { if (video.readyState >= 2) { const r = await det.detect(video); if (r && r[0] && r[0].rawValue) report('native')(r[0].rawValue, r[0].format); } } catch (e) { } setTimeout(tick, 200); };
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
      // full camera detail (1280) for small / far barcodes
      const sc = Math.min(1, (rot ? 720 : 1280) / Math.max(sw, sh)); const w = Math.max(1, Math.round(sw * sc)), hh = Math.max(1, Math.round(sh * sc));
      if (rot) { cv.width = hh; cv.height = w; cx.save(); cx.translate(hh, 0); cx.rotate(Math.PI / 2); cx.drawImage(video, sx, sy, sw, sh, 0, 0, w, hh); cx.restore(); } else { cv.width = w; cv.height = hh; cx.drawImage(video, sx, sy, sw, sh, 0, 0, w, hh); }
      const src = new ZX.HTMLCanvasElementLuminanceSource(cv);
      for (const B of [ZX.HybridBinarizer, ZX.GlobalHistogramBinarizer]) { try { const r = rd.decodeWithState(new ZX.BinaryBitmap(new B(src))); if (r && r.getText()) return [r.getText(), fmtName(r)]; } catch (e) { } finally { try { rd.reset(); } catch (e) { } } }
      // UPC-E (small parts): this ZXing version has no UPC-E reader, so read it from the same black/white rows
      try { const bm = new ZX.BinaryBitmap(new ZX.HybridBinarizer(src)); const W = bm.getWidth(), H = bm.getHeight();
        const u = S.upceFromRows(y => { const ba = bm.getBlackRow(y, null); const a = new Uint8Array(W); for (let i = 0; i < W; i++) a[i] = ba.get(i) ? 1 : 0; return a; }, W, H);
        if (u) return [u, 'UPC_E']; } catch (e) { }
      return null;
    };
    const tick = () => {
      if (!on) return; let got = null;
      try { const vw = video.videoWidth, vh = video.videoHeight; if (video.readyState >= 2 && vw && vh) { const k = n++ % 3; if (k === 0) { const sw = vw * 0.9, sh = vh * 0.5; got = read((vw - sw) / 2, (vh - sh) / 2, sw, sh, false); } else if (k === 1) got = read(0, 0, vw, vh, false); else got = read(0, 0, vw, vh, true); } } catch (e) { }
      if (got) try { report('zxing')(got[0], got[1]); } catch (e) { }
      setTimeout(tick, got ? 400 : 90);
    };
    tick(); return () => { on = false; };
  };
  void _bcEngine;

  // ── 1. every scan starts here
  window.scHit = function (raw, format, via) {
    if (!scM || scM.pausedCode) return;
    const pc = S.parseCode(raw, format); const now = Date.now();
    scM.via = via || 'camera';
    const sig = pc.key || String(raw);
    if (sig === scM.last && now - scM.lastT < 1800) return;
    scM.last = sig; scM.lastT = now;
    if (!pc.ok) { // failed check digit / unreadable: never guess
      scM.bad = (scM.bad || 0) + 1; ftRow({ raw: String(raw).slice(0, 80), format: format || null, ok: false, status: 'bad read (' + (pc.reason || '?') + ')', note: 'refused, scanning again', engine: scM.engine || null, ms: scM.decodeMs || null });
      const h = $('scHint'); if (h) h.innerHTML = '⚠️ ' + T('That barcode did not read cleanly — hold steady and scan again');
      try { navigator.vibrate && navigator.vibrate([30, 60, 30]); } catch (e) { }
      return;
    }
    scBeep(); scM.pausedCode = pc.key; scM.pc = pc; scM.wrongSkip = null; scM.thumb = scThumb(); scM.snap = null; scM.part = '';
    const r = S.identify(pc, ctx());
    scM.idr = r;
    if (scM.ft && scM.ft.pending) Object.assign(scM.ft, { pending: false, status: r.status, ok: true }); // number read from the label print
    else ftStart({ ok: true, status: r.status, ms: scM.decodeMs || null, engine: scM.engine || null, via: via || 'camera' });
    if (r.status === 'known' && scM.ft) scM.ft.sugg = { src: 'remembered barcode', conf: 'high', item: r.item.id, name: r.item.name, pack: r.pack || 1 };
    if (r.status === 'known') { v2Qty(r.item, r.pack); return; }
    scM.snap = scSnap();
    if (r.status === 'conflict') { v2Conflict(r); return; }
    if (r.status === 'family') { v2Family(r); return; }
    v2New();
  };

  // ── saving a confirmed barcode → item link (one record per barcode, same id on every phone)
  function v2Link(itemId, pack) {
    const pc = scM && scM.pc; const it = stockById(itemId); if (!pc || !it) return null;
    if (pc.label) return null; // found from the label words (no barcode): nothing to remember
    if (scM.wrongSkip === pc.key && !catMgr()) return null; // H46: after "Wrong item" only the material office changes the saved link
    const id = S.linkId(pc); const M = maps();
    M[id] = { id, code: pc.key, raw: pc.raw, type: pc.type, item: itemId, pack: pack == null ? (pc.level === 'box' ? null : 1) : Math.max(1, Math.floor(+pack)), level: pc.level, by: (me() || {}).id, ts: Date.now(), verified: true };
    // the old list on the item: drop this barcode from any OTHER item (it was wrong there); never touch names
    if (catMgr()) D.stock.forEach(x => { if (x && x.id !== itemId && (x.codes || []).some(c => S.parseCode(c).key === pc.key)) x.codes = x.codes.filter(c => S.parseCode(c).key !== pc.key); });
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
    const pc = scM.pc || {}; const canChange = pc.ok && !pc.label;
    const nm = String(it.name || '').match(/\b(\d{1,3})\s*-?\s*(?:pk|pack|pcs|pc\b|ct|count|per box|\/box|bx)\b/i); const namePack = nm ? +nm[1] : 0;
    sheet('<div class="scItem">' + scPic(it.img || scM.thumb) + '<div><b>' + E(it.name) + '</b><small>' + T('In the garage') + ': ' + (+it.qty || 0) + ' ' + unit + '</small></div></div>' +
      (scM.via === 'ocr' ? '<div class="v2warn">' + T('The barcode number was read from the print on the label — check this is the right item.') + '</div>' : '') +
      (canChange ? '<div class="v2st">' + (pack > 1 ? '📦 ' + T('One scan = a box of') + ' <b>' + pack + '</b>' : T('One scan = 1 piece')) + ' · <a href="#" onclick="v2ChangePack();return false">' + T('change') + '</a></div>' : '') +
      (canChange && pack === 1 && namePack > 1 ? '<div class="v2warn">' + T('The name says') + ' ' + namePack + '-' + T('pack') + '. ' + T('If this barcode is on the box, tap change.') + '</div>' : '') +
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
    if (scM.ft) { if (!scM.ft.confirmed || !scM.ft.confirmed.item) ftConfirm({ how: 'counted the suggested item', item: s.id, name: s.name }); ftConfirm({ pack: scM.pack || 1 }); scM.ft.units = units; } ftEnd('counted');
    scList(s.name); scResume(); const h = $('scHint'); if (h) h.innerHTML = '✓ ' + units + '× ' + E(s.name);
  };

  // ── a box barcode the first time: how many are inside?
  // allowOne: the barcode could be on a single piece OR on a box (UPC/EAN); a GTIN-14 / ITF-14 carton code is always a box
  function v2AskPack(it, guess, allowOne) {
    scM.packFor = it.id; guess = guess > 1 ? guess : null;
    sheet(head(allowOne ? T('What does one scan count?') : T('Box barcode'), codeLabel(scM.pc)) +
      '<div style="margin:6px 0"><b>' + E(it.name) + '</b></div>' +
      (allowOne ? '<div style="font-size:13px;margin:2px 0 8px">' + T('Look where this barcode is printed. You answer this once — it is remembered for this barcode.') + '</div>' +
        '<button type="button" class="v2c' + (guess ? '' : ' top') + '" onclick="v2PackOne()"><b>1 — ' + T('a single piece') + '</b><small>' + T('the barcode is on one item') + '</small></button>' +
        '<div style="font-weight:700;margin:10px 0 6px">' + T('…or it is on a BOX of:') + '</div>'
        : '<div style="font-weight:700;margin:8px 0 6px">' + T('How many are in ONE box?') + '</div>') +
      '<div class="scStep"><button type="button" onclick="v2PackStep(-1)">−</button><input id="v2pack" type="number" inputmode="numeric" min="1" value="' + (guess || '') + '" placeholder="' + T('e.g. 10') + '"><button type="button" onclick="v2PackStep(1)">+</button></div>' +
      '<div class="scChips">' + [5, 10, 20, 25, 50, 100].map(n => '<button type="button" class="chip" onclick="document.getElementById(\'v2pack\').value=' + n + '">' + n + '</button>').join('') + '</div>' +
      (guess ? '<div class="v2st">📷 ' + T('Read on the box') + ': ' + guess + '</div>' : '') +
      '<button type="button" class="btn gr" style="margin-top:10px;padding:13px" onclick="v2PackOk()">✓ ' + T('Save box size') + '</button>' +
      '<button type="button" class="btn sec2" style="margin-top:6px;padding:9px" onclick="scSkip()">' + T('Cancel') + '</button>');
  }
  window.v2PackOne = function () { const it = stockById(scM && scM.packFor); if (!it) return; v2Link(it.id, 1); ftConfirm({ pack: 1 }); v2Qty(it, 1); };
  window.v2ChangePack = function () { const it = stockById(scM && scM.qItem); if (!it || !scM.pc) return; v2AskPack(it, scM.pack, scM.pc.level !== 'box'); };
  window.v2PackStep = function (d) { const i = $('v2pack'); i.value = Math.max(1, (parseInt(i.value) || 0) + d); };
  window.v2PackOk = function () { const n = parseInt(($('v2pack') || {}).value) || 0; if (n < 1) { toast(T('Type how many are in the box')); return; } const it = stockById(scM.packFor); if (!it) return; v2Link(it.id, n); ftConfirm({ pack: n }); toast('📦 ' + T('Box of') + ' ' + n + ' — ' + it.name, 'green'); v2Qty(it, n); };

  // ── same barcode confirmed on two items (two phones, or a past mistake): the person picks
  function v2Conflict(r) {
    sheet(head(T('Pick the right item'), codeLabel(r.pc)) + '<div class="v2warn">' + T('This barcode is saved on more than one item. Tap the right one — the other link is removed.') + '</div>' +
      r.candidates.map(c => '<button type="button" class="v2c" onclick="v2Choose(\'' + J(c.item.id) + '\')"><b>' + E(c.item.name) + '</b><small>' + T('In the garage') + ': ' + (+c.item.qty || 0) + ' ' + E(c.item.unit || 'pc') + '</small></button>').join('') +
      '<button type="button" class="btn sec2" style="margin-top:6px;padding:9px" onclick="v2New()">' + T('None of these') + '</button>');
  }
  window.v2Choose = function (id) {
    const it = stockById(id); if (!it || !scM) return; const pc = scM.pc; ftConfirm({ how: 'picked from items sharing this barcode', item: id, name: it.name });
    const prev = S.allLinks(D.stock, maps()).find(l => l.key === pc.key && l.item === id);
    v2Link(id, prev ? prev.pack : null);
    // remove the other items' old links to this barcode
    if (catMgr()) Object.keys(maps()).forEach(k => { const m = maps()[k]; if (m && m.item !== id && S.parseCode(m.code || '').key === pc.key) delete maps()[k]; });   // H46: others' links are removed only by the material office
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
    const it = stockById(id); if (!it) return; if (scM && scM.ft) { scM.ft.sugg = scM.ft.sugg || { src: 'same number family', conf: 'medium', item: id, name: it.name }; ftConfirm({ how: 'confirmed box/single of a known item', item: id, name: it.name }); }
    if (scM.pc.level === 'box') v2AskPack(it, scM.pc.count || null); else { v2Link(id, 1); v2Qty(it, 1); }
  };

  // ── 3. not known: find out what it is
  window.v2New = function () {
    if (!scM) return; const pc = scM.pc; if (!pc) return;
    scM.lp = null; scM.online = null; scM.ai = null; scM.ocrText = '';
    sheet(head(pc.label ? T('Item without a barcode') : pc.level === 'box' ? T('New box barcode') : T('New barcode'), pc.label ? '' : codeLabel(pc)) +
      '<div style="font-size:13px;margin:2px 0 6px">' + (pc.label ? T('Which item is this? Pick it from your items or save it as new.') : T('Which item is this? You only do this once — next time it knows.')) + '</div>' +
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
    // a2) the product list built from supplier pages (catalog-real.json): exact barcode match
    if (pc.gtin) { const cat = await catalog(); if (!still(key)) return; const x = cat.byG[pc.gtin] || (pc.level === 'box' ? cat.byG[pc.family] : null);
      if (x) props.push({ brand: x.b, part: x.p, desc: String(x.d || '').split(',')[0].trim(), color: x.c || '', pack: pc.level === 'box' ? (pc.count || null) : (x.n > 1 ? x.n : null), name: '', conf: 'high', why: [pc.level === 'box' ? 'the single-item barcode inside this box is in the product list' : 'barcode found in the product list'], src: 'catalog' }); }
    // b) online product databases (numeric barcodes)
    if (pc.gtin && !props.some(p => p.src === 'catalog') && typeof window.EX_upc === 'function' && !(window.EX_SYNC && window.EX_SYNC.online === false)) {
      step('🔎 ' + T('Looking up this barcode online…'));
      let r = null; try { r = await window.EX_upc(pc.level === 'box' ? pc.family.slice(1) : pc.gtin.slice(1)); } catch (e) { }
      if (!still(key)) return;
      if (r && r.found && r.title) { const o = S.parseOnline(r, pc); if (o) { o.img = /^https:/.test(r.image || '') ? r.image : ''; props.push(o); scM.online = o; } }
    }
    // c) read the label (photo around the barcode)
    const good = props.find(p => p.conf === 'high' || (p.src !== 'code' && p.part));
    if (!good && scM.snap) {
      // d) AI (when switched on) starts right away and reads the label while the phone does its own reading
      const useAI = !!(window.EX_CFG && window.EX_CFG.ai && window.EX_sb && !(window.EX_SYNC && window.EX_SYNC.online === false));
      const aiP = useAI ? v2AIraw(scM.snap) : Promise.resolve(null);
      step('📷 ' + T('Reading the label…'));
      let lp = null;
      try { lp = await v2ReadLabel(scM.snap, pc, (m) => still(key) && step(m)); } catch (e) { }
      if (!still(key)) return;
      if (lp) { scM.lp = lp; if (lp.name || lp.part) props.push(Object.assign({ src: 'label' }, lp)); }
      if (useAI) {
        step('🤖 ' + T('Checking with AI…'));
        const raw = await aiP; if (!still(key)) return;
        const a = raw && raw.json ? await v2MergeAI(raw.json, lp) : null;
        if (a) { scM.ai = a; props.push(a);
          // the phone's reading and AI disagree on the part number → neither is "sure"
          const lab = props.find(p => p.src === 'label');
          if (lab && lab.conf === 'high' && lab.part && a.part && S.partKey(lab.part) !== S.partKey(a.part)) { lab.conf = 'medium'; lab.why = (lab.why || []).concat('AI read ' + a.part + ' — check'); } }
      }
    }
    step('');
    // the best reading, by confidence (high beats medium; label/online beat a bare code)
    const rank = { high: 3, medium: 2, low: 1 };
    // equal confidence: AI first (staging photo tests: AI 71/71 part numbers, the phone's own reading 54/71)
    props.sort((a, b) => (rank[b.conf] || 0) - (rank[a.conf] || 0) || (b.src === 'ai' ? 1 : 0) - (a.src === 'ai' ? 1 : 0) || (b.part ? 1 : 0) - (a.part ? 1 : 0));
    best = props.find(p => p.conf !== 'low' && (p.name || p.part)) || props.find(p => p.src === 'ai' && p.part) || null;
    if (scM.ft && !scM.ft.wrong) scM.ft.sugg = best ? { src: best.src, conf: best.conf, brand: best.brand || '', part: best.part || '', name: best.name || best.desc || '', pack: best.pack || null } : { src: 'none' };
    scM.best = best; scM.part = best && best.part || '';
    v2Show(best, props);
  }
  window.v2Find = v2Find;
  let _cat = null;
  async function catalog() { if (_cat) return _cat; try { const r = await fetch('catalog-real.json', { cache: 'force-cache' }); const a = await r.json(); const by = {}; (a || []).forEach(x => { if (x && x.g) by[x.g] = x; }); _cat = { list: a || [], byG: by }; } catch (e) { _cat = { list: [], byG: {} }; } return _cat; }
  window.v2Catalog = catalog;

  // label reading, stopping as soon as it is sure:
  //  1) contrast-boosted photo, 3 text layouts  2) "clean label" (local threshold, box lines removed), 2 layouts
  //  3) clean label turned ¼, ¾, ½  4) clean label straightened ±6°
  // (test/v2/eval_labels.js scores this exact order on 650 label photos)
  async function v2ReadLabel(snap, pc, onStep) {
    const lt = learned(); let text = ''; let lp = null;
    // real part numbers we know (product list + your items): a reading 1 character away from one of them is never "sure"
    const cat = await catalog(); const known = cat.list.map(x => ({ b: x.b, p: x.p })).concat(D.stock.filter(x => x && x.model).map(x => ({ b: x.brand || '', p: x.model })));
    const go = async (img, modes) => { const tx = await ocrMulti(img, modes); text += '\n' + tx; const l2 = S.parseLabel(text, { code: pc, learned: lt, known }); if (!lp || l2.conf === 'high' || rankOf(l2) > rankOf(lp) || (rankOf(l2) === rankOf(lp) && l2.score > lp.score)) lp = l2; return lp.conf === 'high'; };
    const say = (m) => onStep && onStep('📷 ' + T('Reading the label…') + (m ? ' (' + T(m) + ')' : ''));
    // a tilted photo is straightened first (in the label test this took tilted photos from 11 to 40 right out of 50)
    let ang = 0; try { ang = await labelAngle(snap); } catch (e) { }
    if (Math.abs(ang) >= 1.5) { say('straightening the photo'); if (await go(await labelClean(snap, ang, true), ['11', '3'])) return done(); }
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
    const Tz = await loadTess(); if (!window._tessV2) window._tessV2 = await Tz.createWorker('eng', 1, window.TESS_OPT || {});
    let out = '';
    for (const m of modes) { try { await window._tessV2.setParameters({ tessedit_pageseg_mode: m }); const r = await window._tessV2.recognize(img); out += ((r && r.data && r.data.text) || '') + '\n'; } catch (e) { } }
    return out;
  }
  window.labelClean = labelClean;
  // how much the label is tilted: on a small black/white copy, try −15°…15° (½° steps) and keep the angle where the
  // text rows line up best (sharpest row profile). Same steps as test/v2/add_deskew.py. Returns the counter-clockwise turn to apply.
  function labelAngle(dataUrl) {
    return new Promise(ok => {
      const im = new Image();
      im.onload = () => {
        try {
          const s = 400 / Math.max(im.width, im.height); const W = Math.max(1, Math.round(im.width * s)), H = Math.max(1, Math.round(im.height * s));
          const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, W, H);
          const p = g.getImageData(0, 0, W, H).data, n = W * H; const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
          const ii = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += a[y * W + x]; ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + row; } }
          const r = 12, k = 0.12; const ink = new Uint8Array(n);
          for (let y = 0; y < H; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1); for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
            const S2 = ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0]; ink[y * W + x] = a[y * W + x] < S2 / ((y1 - y0) * (x1 - x0)) * (1 - k) ? 1 : 0; } }
          // long box/table lines out (they would dominate the profile)
          for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x <= W; x++) { if (x < W && ink[y * W + x]) run++; else { if (run > W * 0.25) for (let xx = x - run; xx < x; xx++) ink[y * W + xx] = 0; run = 0; } } }
          for (let x = 0; x < W; x++) { let run = 0; for (let y = 0; y <= H; y++) { if (y < H && ink[y * W + x]) run++; else { if (run > H * 0.12) for (let yy = y - run; yy < y; yy++) ink[yy * W + x] = 0; run = 0; } } }
          const pts = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) pts.push(x - W / 2, y - H / 2);
          let best = -1, ba = 0; const prof = new Float64Array(H + 2);
          for (let a10 = -150; a10 <= 150; a10 += 5) {
            const t = a10 / 10 * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t); prof.fill(0);
            for (let i = 0; i < pts.length; i += 2) { const yy = Math.round(-pts[i] * sn + pts[i + 1] * cs + H / 2); if (yy >= 0 && yy < H) prof[yy]++; }
            let v = 0; for (let y = 1; y < H; y++) { const d = prof[y] - prof[y - 1]; v += d * d; }
            if (v > best) { best = v; ba = a10 / 10; }
          }
          ok(ba);
        } catch (e) { ok(0); }
      };
      im.onerror = () => ok(0); im.src = dataUrl;
    });
  }
  window.labelAngle = labelAngle;
  function rotate(dataUrl, deg) {
    return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); const q = deg % 180 !== 0; c.width = q ? im.height : im.width; c.height = q ? im.width : im.height; const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(im, -im.width / 2, -im.height / 2); ok(c.toDataURL('image/jpeg', 0.9)); }; im.onerror = () => ok(dataUrl); im.src = dataUrl; });
  }
  // AI label reading through the team's own server function (key stays on the server; daily and monthly limits there).
  async function v2AIraw(snap) {
    const t0 = Date.now(); if (scM && scM.ft) scM.ft.ai_used = true;
    try {
      const b64 = String(snap).split(',')[1]; if (!b64) return null;
      const call = window.EX_sb.functions.invoke('ai', { body: { messages: [{ role: 'user', content: S.AI_PROMPT }], images: [{ type: 'image/jpeg', data: b64 }], tier: 'label' } });
      const r = await Promise.race([call, new Promise(ok => setTimeout(() => ok(null), 20000))]);
      if (scM && scM.ft) scM.ft.ai_ms = Date.now() - t0;
      const txt = r && r.data && r.data.text; if (!txt) { if (scM && scM.ft) scM.ft.ai_err = (r && r.error && String(r.error.message || r.error).slice(0, 80)) || (r ? 'no answer' : 'timeout'); return null; }
      const m = String(txt).match(/\{[\s\S]*\}/); if (!m) return null;
      return { json: JSON.parse(m[0]), ms: Date.now() - t0 };
    } catch (e) { if (scM && scM.ft) { scM.ft.ai_ms = Date.now() - t0; scM.ft.ai_err = 'error'; } return null; }
  }
  // AI is "sure" only when the phone's own label reading also shows that part number (in its text or as its answer).
  // A match in the product list alone is not enough: a look-alike sibling (…-WH / …-IV) is in the list too.
  async function v2MergeAI(j, lp) {
    const a = S.checkAI(j, scM.ocrText, scM.online); if (!a) return null;
    const cat = await catalog(); const pk = S.partKey(a.part || '');
    const known = pk && (cat.list.some(x => S.partKey(x.p) === pk) || D.stock.some(x => x && x.model && S.partKey(x.model) === pk));
    const agree = !!(lp && lp.part && pk && S.partKey(lp.part) === pk);
    const sure = !!(a.part && (a.verified || agree));
    a.conf = a.part ? (sure ? 'high' : 'medium') : (a.desc ? 'medium' : 'low');
    a.src = 'ai'; a.why = [sure ? 'AI reading, part number also read on the label' : 'AI reading — check the part number'].concat(known ? ['it is a real part number (product list / your items)'] : []);
    if (lp && lp.part && !agree && a.part) a.nearPart = lp.part;
    if (!a.pack && lp && lp.pack) a.pack = lp.pack;
    return a;
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
    if (scM.ft && !scM.ft.wrong) { scM.ft.sugg = scM.ft.sugg || { src: 'none' }; if (strong[0]) Object.assign(scM.ft.sugg, { item: strong[0].item.id, item_name: strong[0].item.name, match: Math.round(strong[0].score * 100) }); }
    cb.innerHTML = cands.length ? '<div style="font-size:12px;color:#555;margin:6px 0 2px">' + (strong.length ? T('Is it one of these? (already in your items)') : T('Possible matches — check before tapping:')) + '</div>' +
      cands.slice(0, 4).map((c, i) => '<button type="button" class="v2c' + (c.score >= 0.85 && i === 0 ? ' top' : '') + '" onclick="v2Pick(\'' + J(c.item.id) + '\')"><b>' + E(c.item.name) + '</b><small>' + E(T(c.why)) + ' · ' + Math.round(c.score * 100) + '%</small></button>').join('') : '';
    if (best) {
      const src = { ai: '🤖 ' + T('read by AI'), catalog: '📗 ' + T('product list'), label: '📷 ' + T('read on the label'), online: '🔎 ' + T('online product database'), upcitemdb: '🔎 ' + T('online product database'), code: '▦ ' + T('barcode') };
      const tag = best.conf === 'high' ? '<span class="v2tag hi">' + T('sure') + '</span>' : '<span class="v2tag">' + T('check it') + '</span>';
      const pack = scM.pc.level === 'box' ? (scM.pc.count || best.pack || '') : (best.pack > 1 ? best.pack : 1);
      box.innerHTML = '<div class="scLk on" style="display:block">' + (best.img ? '<img src="' + E(best.img) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()" style="float:right">' : '') +
        '<small>' + (src[best.src] || src.label) + tag + '</small>' +
        '<div class="v2f"><label>' + T('Maker') + '</label><input id="v2b" value="' + E(best.brand || '') + '">' +
        '<label>' + T('Part #') + '</label><input id="v2p" value="' + E(best.part || '') + '" autocapitalize="characters">' +
        '<label>' + T('Description') + '</label><input id="v2d" value="' + E(best.desc || '') + '">' +
        '<label>' + T('Color') + '</label><input id="v2c" value="' + E(best.color || '') + '">' +
        '<label>' + T('Unit') + '</label><input id="v2u" value="' + E(best.unit || 'pc') + '">' +
        (scM.pc.label ? '' : '<label>📦 ' + (scM.pc.level === 'box' ? T('In one box') : T('One scan counts')) + '</label><input id="v2n" type="number" inputmode="numeric" min="1" value="' + E(pack) + '" placeholder="' + T('how many') + '">' +
          (scM.pc.level === 'box' ? '' : '<small style="grid-column:1/-1">' + T('1 = the barcode is on one piece. If it is on a box, type how many are in the box.') + '</small>')) +
        '</div>' + (best.nearPart && best.nearPart !== best.part ? '<button type="button" class="chip" style="margin:4px 0" onclick="document.getElementById(\'v2p\').value=\'' + J(best.nearPart) + '\';this.remove()">' + T('Did you mean') + ' <b>' + E(best.nearPart) + '</b>?</button>' : '') +
        (best.why && best.why.length ? '<small>' + E(best.why.join(' · ')) + '</small>' : '') + '</div>' +
        (best.src === 'ai' && best.conf !== 'high' ? '<div class="v2warn">' + T('Read by AI — check the part number against the label before saving.') + '</div>' : '') +
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
    ftConfirm({ how: 'picked an item from the list', item: id, name: it.name, part: it.model || '' });
    // fill in a missing part number / maker on the item (only empty fields; staff only, like the server rule)
    const b = scM.best; if (b && staff()) { let ch = false; if (b.part && !it.model) { it.model = b.part; ch = true; } if (b.brand && !it.brand) { it.brand = b.brand; ch = true; } if (ch) try { save(); } catch (e) { } }
    if (scM.pc.label) { v2Qty(it, 1); return; }
    const guess = parseInt(($('v2n') || {}).value) || scM.pc.count || (b && b.pack) || (scM.lp && scM.lp.pack) || null;
    if (scM.pc.level === 'box') { if (guess && $('v2n')) { v2Link(id, guess); toast('🔗 ' + T('Barcode saved for') + ' ' + it.name, 'green'); v2Qty(it, guess); return; } v2AskPack(it, guess, false); return; }
    v2AskPack(it, guess, true); // single piece or a box? asked once per barcode, before anything is counted
  };
  window.scLink = window.v2Pick;

  function createItem(fields) {
    const pc = scM.pc; let id = pc.label ? (typeof nid === 'function' ? nid('s') : 's_' + Date.now().toString(36)) : S.newItemId(pc);
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
    if (f.part) { const dup = S.matchInventory({ part: f.part, brand: f.brand }, D.stock).find(c => c.score >= 0.97); const dk = dup ? scM.pc.key + '|' + dup.item.id : ''; if (dup && scM.dupOk !== dk) { scM.dupOk = dk; /* M13: warn for every new barcode / part number, not once per session */ const cb = $('v2cands'); if (cb) cb.innerHTML = '<div class="v2warn">' + T('You already have an item with this part number:') + '</div><button type="button" class="v2c top" onclick="v2Pick(\'' + J(dup.item.id) + '\')"><b>' + E(dup.item.name) + '</b><small>' + T('Tap to use it') + '</small></button><div style="font-size:12px;color:#666">' + T('Tap Save again only if it really is a different item.') + '</div>'; return; } }
    const s = createItem(f); const n = parseInt(($('v2n') || {}).value) || null;
    ftConfirm({ how: 'saved as a new item', item: s.id, name: s.name, brand: f.brand, part: f.part, pack: n || null });
    if (scM.pc.label) { toast('✓ ' + s.name, 'green'); v2Qty(s, 1); return; }
    if (scM.pc.level === 'box') { if (n) { v2Link(s.id, n); v2Qty(s, n); } else v2AskPack(s, scM.pc.count || b.pack || null, false); }
    else { v2Link(s.id, n || 1); toast('✓ ' + s.name, 'green'); v2Qty(s, n || 1); }
  };
  window.v2SaveTyped = function () {
    const q = (($('scFind') || {}).value || '').trim(); if (!q || !scM) return;
    const pcs = S.partCandidates(q); const f = { name: q, unit: 'pc', brand: S.brandFromText(q) || '', part: pcs[0] ? pcs[0].p : '', src: 'typed' };
    const s = createItem(f);
    ftConfirm({ how: 'typed the item', item: s.id, name: s.name, part: f.part || '' });
    if (scM.pc.label) { v2Qty(s, 1); return; }
    v2AskPack(s, scM.pc.count || (scM.lp && scM.lp.pack) || null, scM.pc.level !== 'box');
  };
  window.scNew = window.v2SaveTyped;
  window.scUseLook = window.v2SaveNew;

  // wrong item: take this barcode off it and identify again
  // H46: the saved link is shared by every phone. Only the people who manage the material list may remove it (after a
  // confirmation; the server keeps the old link in history). Everyone else: this scan is identified again, the link stays,
  // and Menachem gets a message to check it.
  function catMgr() { try { return typeof mcIsMgr === 'function' && mcIsMgr(); } catch (e) { return false; } }
  function wrongReport(pc, itemId) { try { const it = stockById(itemId); const to = (D.emps || []).filter(e => !e.inactive && e.role === 'office' && e.title === 'Material').map(e => e.id);
      if (to.length && typeof pushTo === 'function') pushTo(to, () => '▦ ' + T('Barcode may be on the wrong item') + ': ' + (pc.raw || pc.key) + ' → ' + ((it && it.name) || itemId) + ' (' + ((me() || {}).name || '') + ')', 'mat'); } catch (e) { } }
  function wrongUnlink(pc) {
    Object.keys(maps()).forEach(k => { const m = maps()[k]; if (m && S.parseCode(m.code || '').key === pc.key) delete maps()[k]; });
    D.stock.forEach(x => { if (x && (x.codes || []).some(c => S.parseCode(c).key === pc.key)) x.codes = x.codes.filter(c => S.parseCode(c).key !== pc.key); });
    try { save(); } catch (e) { }
  }
  window.scWrong = function () {
    if (!scM || !scM.pc) return; const pc = scM.pc; const was = scM.qItem; if (scM.ft) { scM.ft.wrong = true; if (scM.ft.confirmed) delete scM.ft.confirmed.item; }
    scM.snap = scM.snap || scSnap(); scM.wrongSkip = pc.key; window.v2New();          // identify this scan again (nothing removed yet)
    if (pc.label) return;
    if (catMgr() && typeof askConfirm === 'function') {
      const it = stockById(was);
      askConfirm(T('Remove this barcode from') + ' “' + ((it && it.name) || '') + '” ' + T('for everyone?'), () => wrongUnlink(pc), T('Remove'));
      return;
    }
    wrongReport(pc, was); toast('📨 ' + T('Menachem will check this barcode. Pick the right item for this scan.'), 'green');
  };

  // ── barcode won't scan (torn, wrinkled, no barcode at all): read the label instead.
  // 1) the numbers printed under the barcode, accepted only with a valid check digit and seen in BOTH reading passes
  //    (one pass only → the person compares the number with the label first)  2) otherwise the words on the label.
  function digitRuns(txt) {
    const out = []; const re = /\d(?:[ \-]?\d){7,15}/g; let m;
    // a whole printed number only (12–14 digits, spaces allowed) — never a piece cut out of a longer number
    while ((m = re.exec(String(txt || '')))) { const d = m[0].replace(/\D/g, ''); if (d.length >= 12 && d.length <= 14 && S.parseCode(d).ok) out.push(d); }
    const g = /\(\s*01\s*\)\s*(\d{14})/g; while ((m = g.exec(String(txt || '')))) if (S.parseCode(m[1]).ok) out.push(m[1]);
    return [...new Set(out)];
  }
  window.v2NoCode = async function () {
    if (!scM || scM.pausedCode) return; const snap = scSnap(); if (!snap) { toast(T('Point the camera at the label first')); return; }
    scM.pausedCode = 'label?'; scM.snap = snap; scM.thumb = scThumb();
    ftStart({ ok: false, pending: true, status: 'barcode not read by the camera', via: 'label print', ms: scM.readyAt ? Date.now() - scM.readyAt : null });
    sheet(head(T('Reading the label…'), '') + '<div id="v2steps" class="v2st">📷 ' + T('Looking for the barcode number printed on the label…') + '</div>' +
      '<button type="button" class="btn sec2" style="margin-top:6px;padding:9px" onclick="scSkip()">' + T('Cancel') + '</button>');
    let a = '', b = '';
    try { const prep = await ocrPrep(snap); a = await ocrMulti(prep, ['6']); if (!scM || scM.pausedCode !== 'label?') return; b = await ocrMulti(prep, ['11']); } catch (e) { }
    if (!scM || scM.pausedCode !== 'label?') return;
    const ra = digitRuns(a), rb = digitRuns(b); const both = ra.filter(x => rb.some(y => S.parseCode(y).key === S.parseCode(x).key)); const one = [...new Set(ra.concat(rb))];
    scM.ocrText = a + '\n' + b;
    if (both.length === 1) { scM.pausedCode = null; scM.last = ''; window.scHit(both[0], null, 'ocr'); return; }
    if (one.length >= 1 && one.length <= 3) {
      sheet(head(T('Is this the barcode number?'), '') + '<div style="font-size:13px;margin:2px 0 8px">' + T('Compare with the numbers printed under the barcode:') + '</div>' +
        one.map(c => '<button type="button" class="v2c" onclick="v2OcrCode(\'' + J(c) + '\')"><b style="font-family:monospace;font-size:18px;letter-spacing:1px">' + E(c) + '</b></button>').join('') +
        '<button type="button" class="btn sec2" style="margin-top:6px;padding:10px" onclick="v2LabelOnly()">' + T('None of these — read the words') + '</button>');
      return;
    }
    window.v2LabelOnly();
  };
  window.v2OcrCode = function (c) { if (!scM) return; if (scM.ft) scM.ft.via = 'label print (person compared the number)'; scM.pausedCode = null; scM.last = ''; window.scHit(c, null, 'ocr'); };
  window.v2LabelOnly = function () {
    if (!scM) return; const pc = { ok: true, raw: '', type: T('label'), key: 'L:' + Date.now(), gtin: '', level: 'each', family: '', count: null, label: true };
    scM.pc = pc; scM.pausedCode = pc.key; scM.via = 'label'; scM.idr = { status: 'new', pc }; if (scM.ft) Object.assign(scM.ft, { pending: false, status: 'no barcode — identified from the label words', via: 'label words' }); else ftStart({ ok: false, status: 'no barcode — identified from the label words', via: 'label words' });
    window.v2New();
  };
  // the button on the camera screen
  { const _open = window.scanOpen; window.scanOpen = async function () { const r = await _open.apply(this, arguments);
      try { const cam = document.querySelector('#scanOv .scCam'); if (cam && !$('v2nocode')) { const bt = document.createElement('button'); bt.type = 'button'; bt.id = 'v2nocode'; bt.className = 'v2nocode'; bt.textContent = '🏷 ' + T("Won't scan? Read the label"); bt.onclick = () => window.v2NoCode(); cam.appendChild(bt); } } catch (e) { }
      // no barcode read for a while → tell the person what helps (most misses in the camera test were "too far" or "out of focus")
      try { const iv = setInterval(() => { if (!scM) { clearInterval(iv); return; } const h = $('scHint'); if (!h || scM.pausedCode) return;
          const idle = Date.now() - (scM.readyAt || Date.now());
          if (idle > 9000) h.innerHTML = '🏷 ' + T("Still nothing? Tap “Won't scan? Read the label”"); else if (idle > 4500) h.innerHTML = '🔍 ' + T('Hold the phone closer — the barcode should fill the box, and keep it still'); }, 1000); } catch (e) { }
      if (FT) { try { const cam = document.querySelector('#scanOv .scCam'); if (cam) { const tg = document.createElement('div'); tg.className = 'v2ft'; tg.innerHTML = '🧪 ' + E(T('Field test')) + ' · <span id="v2ftn">' + ftCount + '</span> ' + E(T('scans logged')) + ' ›'; tg.onclick = () => window.v2FtResults(); cam.appendChild(tg); } } catch (e) { } }
      return r; }; }

  // ── FIELD TEST RESULTS (staging): what the scanner suggested vs what the person confirmed, per scan and in total.
  // Owner / managers only (the database only lets them read the log).
  window.v2FtResults = async function (sess) {
    if (!FT) return; sess = sess || ftSess; let ov = $('v2ftr');
    if (!ov) { ov = document.createElement('div'); ov.id = 'v2ftr'; ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#f6f5f2;overflow:auto;-webkit-overflow-scrolling:touch;font-size:14px;color:#1F1E2A'; document.body.appendChild(ov); }
    const bar = '<div style="position:sticky;top:0;background:#1F1E2A;color:#fff;display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 12px 10px"><b style="flex:1">🧪 ' + E(T('Field test results')) + '</b><button type="button" class="btn sec2" style="width:auto;padding:6px 12px" onclick="v2FtResults(\'' + J(sess) + '\')">↻</button><button type="button" class="btn sec2" style="width:auto;padding:6px 12px" onclick="document.getElementById(\'v2ftr\').remove()">✕</button></div>';
    ov.innerHTML = bar + '<div style="padding:16px">' + E(T('Loading…')) + '</div>';
    let rows = [], sessions = [];
    try {
      const r = await window.EX_sb.from('scan_field_log').select('at,session,scan_id,device,engine,format,raw,ok,status,via,ms,total_ms,ai_used,ai_ms,sugg,confirmed,corrected,note,pack,units,thumb').eq('ev', 'scan').order('at', { ascending: false }).limit(1000);
      if (r.error) throw r.error; const all = r.data || [];
      sessions = [...new Set(all.map(x => x.session))]; rows = all.filter(x => x.session === sess);
    } catch (e) { ov.innerHTML = bar + '<div style="padding:16px">' + E(T('Only the owner or a manager can see the results.')) + '</div>'; return; }
    const scans = rows.filter(x => !/^bad read/.test(x.status || ''));
    const misreads = rows.length - scans.length;
    const wrongMatch = (x) => !!(x.sugg && (x.sugg.wrong || (x.sugg.item && x.confirmed && x.confirmed.item && x.sugg.item !== x.confirmed.item) || (x.sugg.conf === 'high' && x.corrected)));
    const failed = (x) => !/^counted/.test(x.note || '');
    const okClean = scans.filter(x => x.ok && !failed(x) && !x.corrected && !wrongMatch(x));
    const read = scans.filter(x => x.ok);
    const avg = (a) => a.length ? (a.reduce((p, c) => p + c, 0) / a.length / 1000).toFixed(1) + ' s' : '—';
    const tile = (n, label, tone) => '<div style="flex:1 1 140px;background:#fff;border-radius:12px;padding:12px;border:1px solid #e3e1db"><div style="font-size:24px;font-weight:700;color:' + (tone || '#1F1E2A') + '">' + n + '</div><div style="font-size:12px;color:#555">' + E(T(label)) + '</div></div>';
    const pct = (a) => scans.length ? ' (' + Math.round(a.length * 100 / scans.length) + '%)' : '';
    const descS = (g) => !g ? '—' : g.src === 'none' && !g.item ? E(T('nothing — asked you')) : [g.src && g.src !== 'none' ? '<small style="color:#666">' + E(T(g.src)) + (g.conf ? ' · ' + E(T(g.conf === 'high' ? 'sure' : 'check it')) : '') + '</small>' : '', [g.brand, g.part].filter(Boolean).map(E).join(' '), g.item_name || g.name ? E(g.item_name || g.name) : '', g.match ? '<small>' + g.match + '% ' + E(T('match in your items')) + '</small>' : '', g.pack > 1 ? '📦 ' + g.pack : ''].filter(Boolean).join('<br>');
    const descC = (c, x) => !c ? '<span style="color:#b00">' + E(T(x.note || 'not finished')) + '</span>' : ['<small style="color:#666">' + E(T(c.how || '')) + '</small>', E(c.name || ''), c.part ? E(c.part) : '', c.pack ? '📦 ' + (c.pack > 1 ? c.pack : '1 ' + T('piece')) : ''].filter(Boolean).join('<br>');
    const badge = (x) => !x.ok && failed(x) ? ['#fde8e8', '#922', 'Failed'] : wrongMatch(x) ? ['#fde8e8', '#922', 'Wrong match'] : failed(x) ? ['#fff3e0', '#8a4b00', 'Not finished'] : x.corrected ? ['#fff3e0', '#8a4b00', 'Corrected'] : ['#e3f6ea', '#185c34', 'OK'];
    ov.innerHTML = bar + '<div style="padding:12px 12px 40px;max-width:900px;margin:0 auto">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><select id="v2fts" style="flex:1;min-width:180px" onchange="v2FtResults(this.value)">' + (sessions.includes(sess) ? sessions : [sess].concat(sessions)).map(x => '<option' + (x === sess ? ' selected' : '') + '>' + E(x) + '</option>').join('') + '</select>' +
      '<button type="button" class="btn gr" style="width:auto;padding:8px 14px" onclick="v2FtResults(v2FtNewSession())">' + E(T('Start a new test')) + '</button></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' + tile(scans.length, 'scans') + tile(okClean.length + pct(okClean), 'right with no changes', '#185c34') + tile(scans.filter(x => x.corrected && !wrongMatch(x)).length, 'needed a correction', '#8a4b00') +
        tile(scans.filter(wrongMatch).length, 'wrong product suggested', '#922') + tile(scans.filter(failed).length, 'failed or not finished', '#922') + tile(read.length + pct(read), 'barcode read by the camera') +
        tile(avg(read.filter(x => x.ms).map(x => x.ms)), 'average time to read the barcode') + tile(avg(scans.filter(x => !failed(x)).map(x => x.total_ms || 0)), 'average time, scan to confirmed') +
        tile(scans.filter(x => x.ai_used).length, 'used AI') + tile(avg(scans.filter(x => x.ai_ms).map(x => x.ai_ms)), 'average AI time') + '</div>' +
      (misreads ? '<div class="v2st" style="margin-top:8px">' + misreads + ' ' + E(T('unclear barcode reads were refused and scanned again (not counted as scans).')) + '</div>' : '') +
      '<div style="margin-top:14px;display:grid;gap:8px">' + (scans.length ? scans.map(x => { const bd = badge(x); return '<div style="background:#fff;border:1px solid #e3e1db;border-radius:12px;padding:10px">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="background:' + bd[0] + ';color:' + bd[1] + ';border-radius:8px;padding:1px 8px;font-size:12px;font-weight:600">' + E(T(bd[2])) + '</span><small style="color:#666">' + E(new Date(x.at).toLocaleTimeString()) + ' · ' + E(x.format || x.via || '') + ' ' + E(x.raw || '') + (x.ms ? ' · ' + T('read in') + ' ' + (x.ms / 1000).toFixed(1) + ' s' : '') + (x.ai_used ? ' · 🤖 AI' + (x.ai_ms ? ' ' + (x.ai_ms / 1000).toFixed(1) + ' s' : '') : '') + ' · ' + E(x.device || '') + '</small></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px"><div><div style="font-size:11px;color:#888;text-transform:uppercase">' + E(T('Scanner suggested')) + '</div>' + descS(x.sugg) + '</div><div><div style="font-size:11px;color:#888;text-transform:uppercase">' + E(T('You confirmed')) + '</div>' + descC(x.confirmed, x) + '</div></div>' +
        (x.thumb ? '<img src="' + E(x.thumb) + '" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;margin-top:6px">' : '') + '</div>'; }).join('') : '<div class="v2st">' + E(T('No scans in this test yet. Open the scanner and scan your products.')) + '</div>') + '</div></div>';
  };
  window.addEventListener('load', () => { if (FT && /#fieldtest/.test(location.hash)) { const t = setInterval(() => { if (window.EX_sb && typeof me === 'function' && me()) { clearInterval(t); window.v2FtResults(); } }, 500); setTimeout(() => clearInterval(t), 60000); } });

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
      'What does one scan count?': '¿Cuánto cuenta un escaneo?', 'Look where this barcode is printed. You answer this once — it is remembered for this barcode.': 'Mira dónde está impreso este código. Solo respondes una vez — se recuerda para este código.',
      'a single piece': 'una pieza', 'the barcode is on one item': 'el código está en una pieza', '…or it is on a BOX of:': '…o está en una CAJA de:', 'One scan = a box of': 'Un escaneo = una caja de', 'One scan = 1 piece': 'Un escaneo = 1 pieza', 'change': 'cambiar',
      'The name says': 'El nombre dice', 'pack': 'paquete', 'If this barcode is on the box, tap change.': 'Si este código está en la caja, toca cambiar.', 'The barcode number was read from the print on the label — check this is the right item.': 'El número se leyó de la etiqueta impresa — revisa que sea el artículo correcto.',
      'product list': 'lista de productos', 'One scan counts': 'Un escaneo cuenta', '1 = the barcode is on one piece. If it is on a box, type how many are in the box.': '1 = el código está en una pieza. Si está en una caja, escribe cuántos hay en la caja.',
      'Item without a barcode': 'Artículo sin código', 'Which item is this? Pick it from your items or save it as new.': '¿Qué artículo es? Elígelo de tus artículos o guárdalo como nuevo.', 'Point the camera at the label first': 'Primero apunta la cámara a la etiqueta',
      'Reading the label…': 'Leyendo la etiqueta…', 'Looking for the barcode number printed on the label…': 'Buscando el número del código impreso en la etiqueta…', 'Is this the barcode number?': '¿Es este el número del código?', 'Compare with the numbers printed under the barcode:': 'Compara con los números impresos bajo el código:',
      'None of these — read the words': 'Ninguno — leer las palabras', 'Did you mean': '¿Quisiste decir', "Still nothing? Tap “Won't scan? Read the label”": '¿Nada todavía? Toca “¿No escanea? Leer la etiqueta”', 'Hold the phone closer — the barcode should fill the box, and keep it still': 'Acerca el teléfono — el código debe llenar el cuadro, y no lo muevas', "Won't scan? Read the label": '¿No escanea? Leer la etiqueta', 'Field test': 'Prueba de campo', 'scans logged': 'escaneos registrados', 'Field test results': 'Resultados de la prueba', 'Loading…': 'Cargando…', 'Only the owner or a manager can see the results.': 'Solo el dueño o un gerente puede ver los resultados.',
      'Start a new test': 'Empezar una prueba nueva', 'scans': 'escaneos', 'right with no changes': 'correctos sin cambios', 'needed a correction': 'necesitaron corrección', 'wrong product suggested': 'producto equivocado sugerido', 'failed or not finished': 'fallidos o sin terminar',
      'barcode read by the camera': 'código leído por la cámara', 'average time to read the barcode': 'tiempo promedio para leer el código', 'average time, scan to confirmed': 'tiempo promedio, de escanear a confirmar', 'used AI': 'usaron IA', 'average AI time': 'tiempo promedio de IA',
      'unclear barcode reads were refused and scanned again (not counted as scans).': 'lecturas poco claras fueron rechazadas y escaneadas otra vez (no cuentan).', 'Scanner suggested': 'El escáner sugirió', 'You confirmed': 'Tú confirmaste', 'Failed': 'Falló', 'Wrong match': 'Coincidencia equivocada', 'Not finished': 'Sin terminar', 'Corrected': 'Corregido', 'OK': 'OK',
      'read in': 'leído en', 'nothing — asked you': 'nada — te preguntó', 'match in your items': 'coincidencia en tus artículos', 'piece': 'pieza', 'No scans in this test yet. Open the scanner and scan your products.': 'Aún no hay escaneos en esta prueba. Abre el escáner y escanea tus productos.',
      'Checking with AI…': 'Revisando con IA…', 'Read by AI — check the part number against the label before saving.': 'Leído por IA — revisa el número de parte con la etiqueta antes de guardar.', 'read by AI': 'leído por IA', 'label': 'etiqueta',
      'same part number': 'mismo número de parte', 'same part number (OCR look-alike letters)': 'mismo número de parte (letras parecidas)', 'part number 1 character apart': 'número de parte con 1 carácter distinto', 'part number 2 characters apart': 'número de parte con 2 caracteres distintos', 'matches another part number on the label': 'coincide con otro número de la etiqueta' };
    if (typeof ES === 'object' && ES) Object.assign(ES, ES2);
  } catch (e) { }
  window.SV2_UI = { version: 'v2.0', v2Link, v2Qty, v2Find };
})();
