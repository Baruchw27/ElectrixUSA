// STAGING ONLY — barcode reading test. Draws real product barcodes (UPC-A, EAN-13, UPC-E, EAN-8, ITF-14 boxes,
// Code 128 part numbers, GS1-128 box labels), spoils them the way a phone camera does (far away, blur, tilt, sideways,
// noise, dim/shiny, glare, torn bars, angled view), then reads them with the SAME decoder and settings the app uses
// on iPhones (ZXing 0.21.3, TRY_HARDER, Hybrid then Global binarizer, centre crop / full frame / turned 90°).
// Simulation: real phone cameras still need testing on real phones.
import bwipjs from "npm:bwip-js@4.5.1";
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer } from "npm:@zxing/library@0.21.3";
const KEY_SHA256 = "4e23c31051958e35d8cba790f8937422095bed6458d681fd91072b3af48b7eaf";
async function keyOk(k: string | null) { if (!k) return false; const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k))); return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("") === KEY_SHA256; }
const CASES: { t: string; x: string; want: string; src: string }[] = [{"t": "upca","x": "078477517086","want": "078477517086","src": "Leviton 5601-2W"},{"t": "upca","x": "078477517284","want": "078477517284","src": "Leviton 5603-2W"},{"t": "upca","x": "078477882672","want": "078477882672","src": "Leviton 5604-2W"},{"t": "upca","x": "078477882665","want": "078477882665","src": "Leviton 5604-2I"},{"t": "upca","x": "078477339565","want": "078477339565","src": "Leviton 5601-P2W"},{"t": "upca","x": "078477339640","want": "078477339640","src": "Leviton 5603-P2W"},{"t": "upca","x": "078477052662","want": "078477052662","src": "Leviton 5621-2W"},{"t": "upca","x": "078477519288","want": "078477519288","src": "Leviton 5623-2W"},{"t": "upca","x": "078477223437","want": "078477223437","src": "Leviton W5601-2W"},{"t": "upca","x": "078477223857","want": "078477223857","src": "Leviton W5603-2W"},{"t": "upca","x": "027557003056","want": "027557003056","src": "Lutron DVCL-153P-WH"},{"t": "upca","x": "027557003032","want": "027557003032","src": "Lutron DVCL-153P-IV"},{"t": "upca","x": "027557003322","want": "027557003322","src": "Lutron DVCL-153PH-WH"},{"t": "upca","x": "697333249185","want": "697333249185","src": "Luxrite LR23777-4PK"},{"t": "upca","x": "698746652609","want": "698746652609","src": "Luxrite LR22644-6PK"},{"t": "upca","x": "607609862819","want": "607609862819","src": "Luxrite LR22654-1PK"},{"t": "upca","x": "080083297320","want": "080083297320","src": "Halo HLB6LSFS5"},{"t": "upca","x": "080083863389","want": "080083863389","src": "Halo HLB6S099FS1EMWR"},{"t": "upca","x": "080083912407","want": "080083912407","src": "Halo HLBSL6099FS461EMWR"},{"t": "upca","x": "786676362054","want": "786676362054","src": "Eaton BR115"},{"t": "upca","x": "786676362108","want": "786676362108","src": "Eaton BR120"},{"t": "upca","x": "786676362207","want": "786676362207","src": "Eaton BR130"},{"t": "upca","x": "786676362801","want": "786676362801","src": "Eaton BR215"},{"t": "upca","x": "786676362856","want": "786676362856","src": "Eaton BR220"},{"t": "upca","x": "786676362955","want": "786676362955","src": "Eaton BR230"},{"t": "upca","x": "785901065203","want": "785901065203","src": "Square D HOM115"},{"t": "upca","x": "785901065210","want": "785901065210","src": "Square D HOM120"},{"t": "upca","x": "785901065227","want": "785901065227","src": "Square D HOM130"},{"t": "upca","x": "047569062728","want": "047569062728","src": "Square D HOM130CP"},{"t": "upca","x": "785901065265","want": "785901065265","src": "Square D HOM215"},{"t": "upca","x": "783585435107","want": "783585435107","src": "Hubbell HBL5262"},{"t": "upca","x": "783585435206","want": "783585435206","src": "Hubbell HBL5262W"},{"t": "upca","x": "783585435121","want": "783585435121","src": "Hubbell HBL5262BK"},{"t": "upca","x": "783585435169","want": "783585435169","src": "Hubbell HBL5262I"},{"t": "upca","x": "783585542416","want": "783585542416","src": "Hubbell HBL5262TR"},{"t": "upca","x": "050169902325","want": "050169902325","src": "Raco 232"},{"t": "upca","x": "050169500705","want": "050169500705","src": "Raco 232S"},{"t": "upca","x": "050169002322","want": "050169002322","src": "Raco 8232"},{"t": "upca","x": "032886163050","want": "032886163050","src": "Southwire 28828255"},{"t": "upca","x": "034481006107","want": "034481006107","src": "Carlon B114R-UPC"},{"t": "ean13","x": "4066966400182","want": "4066966400182","src": "real EAN-13"},{"t": "ean13","x": "7626018159085","want": "7626018159085","src": "synthetic EAN-13"},{"t": "ean13","x": "5001661318607","want": "5001661318607","src": "synthetic EAN-13"},{"t": "ean13","x": "8413909960306","want": "8413909960306","src": "synthetic EAN-13"},{"t": "ean13","x": "8424628194828","want": "8424628194828","src": "synthetic EAN-13"},{"t": "ean13","x": "4099351819092","want": "4099351819092","src": "synthetic EAN-13"},{"t": "ean13","x": "5078657975434","want": "5078657975434","src": "synthetic EAN-13"},{"t": "ean13","x": "5031948757492","want": "5031948757492","src": "synthetic EAN-13"},{"t": "ean13","x": "4018625276010","want": "4018625276010","src": "synthetic EAN-13"},{"t": "ean13","x": "8495559797112","want": "8495559797112","src": "synthetic EAN-13"},{"t": "upce","x": "04710493","want": "04710493","src": "synthetic UPC-E"},{"t": "upce","x": "05291755","want": "05291755","src": "synthetic UPC-E"},{"t": "upce","x": "03423684","want": "03423684","src": "synthetic UPC-E"},{"t": "upce","x": "07127694","want": "07127694","src": "synthetic UPC-E"},{"t": "upce","x": "04268482","want": "04268482","src": "synthetic UPC-E"},{"t": "upce","x": "05632169","want": "05632169","src": "synthetic UPC-E"},{"t": "upce","x": "02330792","want": "02330792","src": "synthetic UPC-E"},{"t": "upce","x": "02440286","want": "02440286","src": "synthetic UPC-E"},{"t": "upce","x": "08599568","want": "08599568","src": "synthetic UPC-E"},{"t": "upce","x": "08907882","want": "08907882","src": "synthetic UPC-E"},{"t": "ean8","x": "66617600","want": "66617600","src": "synthetic EAN-8"},{"t": "ean8","x": "31372152","want": "31372152","src": "synthetic EAN-8"},{"t": "ean8","x": "90109287","want": "90109287","src": "synthetic EAN-8"},{"t": "ean8","x": "15901392","want": "15901392","src": "synthetic EAN-8"},{"t": "ean8","x": "62459570","want": "62459570","src": "synthetic EAN-8"},{"t": "itf14","x": "10078477517083","want": "10078477517083","src": "Leviton 5601-2W box"},{"t": "itf14","x": "10078477517281","want": "10078477517281","src": "Leviton 5603-2W box"},{"t": "itf14","x": "20078477882676","want": "20078477882676","src": "Leviton 5604-2W box"},{"t": "itf14","x": "20078477882669","want": "20078477882669","src": "Leviton 5604-2I box"},{"t": "itf14","x": "20078477339569","want": "20078477339569","src": "Leviton 5601-P2W box"},{"t": "itf14","x": "20078477339644","want": "20078477339644","src": "Leviton 5603-P2W box"},{"t": "itf14","x": "20078477052666","want": "20078477052666","src": "Leviton 5621-2W box"},{"t": "itf14","x": "10078477519285","want": "10078477519285","src": "Leviton 5623-2W box"},{"t": "itf14","x": "10078477223434","want": "10078477223434","src": "Leviton W5601-2W box"},{"t": "itf14","x": "10078477223854","want": "10078477223854","src": "Leviton W5603-2W box"},{"t": "itf14","x": "30027557003057","want": "30027557003057","src": "Lutron DVCL-153P-WH box"},{"t": "itf14","x": "20027557003036","want": "20027557003036","src": "Lutron DVCL-153P-IV box"},{"t": "itf14","x": "30027557003323","want": "30027557003323","src": "Lutron DVCL-153PH-WH box"},{"t": "itf14","x": "20697333249189","want": "20697333249189","src": "Luxrite LR23777-4PK box"},{"t": "itf14","x": "20698746652603","want": "20698746652603","src": "Luxrite LR22644-6PK box"},{"t": "itf14","x": "30607609862810","want": "30607609862810","src": "Luxrite LR22654-1PK box"},{"t": "itf14","x": "10080083297327","want": "10080083297327","src": "Halo HLB6LSFS5 box"},{"t": "itf14","x": "30080083863380","want": "30080083863380","src": "Halo HLB6S099FS1EMWR box"},{"t": "itf14","x": "10080083912404","want": "10080083912404","src": "Halo HLBSL6099FS461EMWR box"},{"t": "itf14","x": "10786676362051","want": "10786676362051","src": "Eaton BR115 box"},{"t": "code128","x": "HBL5362GY","want": "HBL5362GY","src": "Hubbell"},{"t": "code128","x": "BRAF120","want": "BRAF120","src": "Eaton"},{"t": "code128","x": "LB220-T","want": "LB220-T","src": "Leviton"},{"t": "code128","x": "HBL1221I","want": "HBL1221I","src": "Hubbell"},{"t": "code128","x": "5621-2W","want": "5621-2W","src": "Leviton"},{"t": "code128","x": "RL560WH6940","want": "RL560WH6940","src": "Halo"},{"t": "code128","x": "63948455","want": "63948455","src": "Southwire"},{"t": "code128","x": "GFTR2-W","want": "GFTR2-W","src": "Leviton"},{"t": "code128","x": "LR31871-6PK","want": "LR31871-6PK","src": "Luxrite"},{"t": "code128","x": "HBL5261I","want": "HBL5261I","src": "Hubbell"},{"t": "code128","x": "BRP120GF","want": "BRP120GF","src": "Eaton"},{"t": "code128","x": "DVCL-153P-WH","want": "DVCL-153P-WH","src": "Lutron"},{"t": "code128","x": "BRACAF120","want": "BRACAF120","src": "Eaton"},{"t": "code128","x": "LR22654-1PK","want": "LR22654-1PK","src": "Luxrite"},{"t": "code128","x": "HBL5361","want": "HBL5361","src": "Hubbell"},{"t": "code128","x": "HBL1221","want": "HBL1221","src": "Hubbell"},{"t": "code128","x": "HBL5262W","want": "HBL5262W","src": "Hubbell"},{"t": "code128","x": "BR215","want": "BR215","src": "Eaton"},{"t": "code128","x": "28827455","want": "28827455","src": "Southwire"},{"t": "code128","x": "907C","want": "907C","src": "Raco"},{"t": "gs1-128","x": "(01)10078477517083(30)20","want": "01100784775170833020","src": "Leviton 5601-2W box label"},{"t": "gs1-128","x": "(01)10078477517281(30)20","want": "01100784775172813020","src": "Leviton 5603-2W box label"},{"t": "gs1-128","x": "(01)10078477882679(30)50","want": "01100784778826793050","src": "Leviton 5604-2W box label"},{"t": "gs1-128","x": "(01)10078477882662(30)20","want": "01100784778826623020","src": "Leviton 5604-2I box label"},{"t": "gs1-128","x": "(01)10078477339562(30)20","want": "01100784773395623020","src": "Leviton 5601-P2W box label"},{"t": "gs1-128","x": "(01)10078477339647(30)50","want": "01100784773396473050","src": "Leviton 5603-P2W box label"},{"t": "gs1-128","x": "(01)10078477052669(30)25","want": "01100784770526693025","src": "Leviton 5621-2W box label"},{"t": "gs1-128","x": "(01)10078477519285(30)10","want": "01100784775192853010","src": "Leviton 5623-2W box label"},{"t": "gs1-128","x": "(01)10078477223434(30)10","want": "01100784772234343010","src": "Leviton W5601-2W box label"},{"t": "gs1-128","x": "(01)10078477223854(30)25","want": "01100784772238543025","src": "Leviton W5603-2W box label"}];
// ── the app's own UPC-E reader (copied from staging/scanner-v2.js)
  function ck(body) { // GS1 mod-10 check digit for the digits before it
    let s = 0; for (let i = 0; i < body.length; i++) s += (+body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    return String((10 - s % 10) % 10);
  }
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

const CONDS = ["clean", "far away", "slight blur", "heavy blur", "tilted 8°", "tilted 20°", "sideways 90°", "upside down", "grainy (low light)", "dim / low contrast", "glare spot", "torn bars", "angled view", "blur+tilt+grain+dim", "indoor grain (phone-smoothed)"];
const W = 1000, H = 560, BG = 235, INK = 30;
let seed = 1; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function draw(c: { t: string; x: string }, far: boolean, maxW = 760) {
  const r: any = (bwipjs as any).raw({ bcid: c.t, text: c.x, includetext: false });
  const sbs: number[] = r[0].sbs; const mods = sbs.reduce((a, b) => a + b, 0) + 20;
  const m = far ? 1.3 : Math.min(4, maxW / mods); const bw = mods * m, bh = Math.min(220, Math.max(90, bw * 0.35));
  const img = new Float32Array(W * H).fill(BG); const x0 = (W - bw) / 2 + 10 * m, y0 = (H - bh) / 2;
  // bars with anti-aliased edges (sub-pixel coverage), like a camera image
  let pos = 0; const cov = new Float32Array(W);
  for (let i = 0; i < sbs.length; i++) { const w = sbs[i] * m; if (i % 2 === 0) { const a = x0 + pos, b = a + w; for (let x = Math.floor(a); x < Math.ceil(b); x++) { if (x < 0 || x >= W) continue; cov[x] += Math.max(0, Math.min(x + 1, b) - Math.max(x, a)); } } pos += w; }
  for (let y = Math.floor(y0); y < y0 + bh; y++) for (let x = 0; x < W; x++) if (cov[x] > 0) img[y * W + x] = BG - (BG - INK) * Math.min(1, cov[x]);
  return { img, bw, bh, x0: x0 - 10 * m, y0 };
}
function blur(img: Float32Array, r: number, passes = 3) { const t = new Float32Array(img.length); for (let p = 0; p < passes; p++) {
  for (let y = 0; y < H; y++) { let s = 0; const o = y * W; for (let x = -r; x <= r; x++) s += img[o + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { t[o + x] = s / (2 * r + 1); s += img[o + Math.min(W - 1, x + r + 1)] - img[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { img[y * W + x] = s / (2 * r + 1); s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } } } }
function warp(img: Float32Array, f: (x: number, y: number) => [number, number]) { const o = new Float32Array(img.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [sx, sy] = f(x, y); const ix = Math.floor(sx), iy = Math.floor(sy);
    if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) { o[y * W + x] = BG; continue; } const fx = sx - ix, fy = sy - iy, k = iy * W + ix;
    o[y * W + x] = img[k] * (1 - fx) * (1 - fy) + img[k + 1] * fx * (1 - fy) + img[k + W] * (1 - fx) * fy + img[k + W + 1] * fx * fy; } return o; }
const rot = (img: Float32Array, deg: number) => { const a = -deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = W / 2, cy = H / 2; return warp(img, (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
function contrast(img: Float32Array, lo: number, hi: number) { for (let i = 0; i < img.length; i++) img[i] = lo + (img[i] - INK) / (BG - INK) * (hi - lo); }
function noise(img: Float32Array, sd: number) { for (let i = 0; i < img.length; i++) img[i] += gauss() * sd; }
function frame(ci: number, cond: number, fr: number) {
  seed = ci * 7919 + cond * 104729 + fr * 13 + 1; const c = CASES[ci];
  const d = draw(c, cond === 1, cond === 6 ? 500 : 760); let img = d.img;
  switch (cond) {
    case 2: blur(img, 1); break;
    case 3: blur(img, 2); break;
    case 4: img = rot(img, 8); break;
    case 5: img = rot(img, 20); break;
    case 6: img = rot(img, 90); break;
    case 7: img = rot(img, 180); break;
    case 8: noise(img, 28); break;
    case 9: contrast(img, 150, 205); noise(img, 4); break;
    case 10: { const gx = d.x0 + d.bw * 0.35, gy = H / 2, R = Math.max(60, d.bw * 0.13); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = Math.hypot(x - gx, y - gy) / R; if (q < 1.6) img[y * W + x] += 230 * Math.exp(-q * q * 1.2); } break; }
    case 11: { const sx = d.x0 + d.bw * 0.55, sw = d.bw * 0.06; for (let y = Math.floor(d.y0); y < d.y0 + d.bh * 0.7; y++) for (let x = Math.floor(sx); x < sx + sw; x++) img[y * W + x] = BG; break; }
    case 12: { const cx = W / 2; img = warp(img, (x, y) => { const t = (x - cx) / W; const sc = 1 + 0.35 * t; return [cx + (x - cx) * (1 - 0.18 * t), H / 2 + (y - H / 2) * sc]; }); break; }
    case 13: blur(img, 1); img = rot(img, 6); contrast(img, 70, 210); noise(img, 15); break;
    case 14: noise(img, 10); blur(img, 1, 1); break;
  }
  const out = new Uint8ClampedArray(W * H); for (let i = 0; i < out.length; i++) out[i] = img[i];
  return out;
}
const hints = new Map<any, any>(); hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]); hints.set(DecodeHintType.TRY_HARDER, true);
const rd = new MultiFormatReader(); rd.setHints(hints);
function crop(g: Uint8ClampedArray, x: number, y: number, w: number, h: number) { const o = new Uint8ClampedArray(w * h); for (let j = 0; j < h; j++) o.set(g.subarray((y + j) * W + x, (y + j) * W + x + w), j * w); return o; }
function turn(g: Uint8ClampedArray, w: number, h: number) { const o = new Uint8ClampedArray(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[x * h + (h - 1 - y)] = g[y * w + x]; return o; }
function read(g: Uint8ClampedArray, w: number, h: number) { const src = new RGBLuminanceSource(g, w, h);
  for (const B of [HybridBinarizer, GlobalHistogramBinarizer]) { try { const r = rd.decodeWithState(new BinaryBitmap(new (B as any)(src))); if (r && r.getText()) return [r.getText(), BarcodeFormat[r.getBarcodeFormat()]]; } catch (_) { /* not found */ } finally { try { rd.reset(); } catch (_) { /* */ } } }
  try { const bm = new BinaryBitmap(new HybridBinarizer(src)); const W2 = bm.getWidth(), H2 = bm.getHeight();
    const u = upceFromRows((y: number) => { const ba = bm.getBlackRow(y, null as any); const a = new Uint8Array(W2); for (let i = 0; i < W2; i++) a[i] = ba.get(i) ? 1 : 0; return a; }, W2, H2);
    if (u) return [u, "UPC_E"]; } catch (_) { /* */ }
  return null; }
// the app cycles: centre crop → full frame → full frame turned 90°, one per camera frame
function appRead(g: Uint8ClampedArray) { const cw = Math.round(W * 0.9), ch = Math.round(H * 0.5);
  let r = read(crop(g, Math.round((W - cw) / 2), Math.round((H - ch) / 2), cw, ch), cw, ch); if (r) return [...r, "centre"];
  r = read(g, W, H); if (r) return [...r, "full"]; r = read(turn(g, W, H), H, W); if (r) return [...r, "turned"]; return null; }
const norm = (s: string) => s.replace(/^\]C1/, "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
Deno.serve(async (req) => {
  if (!(await keyOk(req.headers.get("x-race-key")))) return new Response("no", { status: 401 });
  const u = new URL(req.url); const from = +(u.searchParams.get("from") || 0), n = +(u.searchParams.get("n") || 10), frames = +(u.searchParams.get("frames") || 3);
  const out: unknown[] = []; const total = CASES.length * CONDS.length;
  const items = (u.searchParams.get("items") || "").split(",").filter(Boolean).map((x) => x.split(":").map(Number));
  const list = items.length ? items : Array.from({ length: Math.max(0, Math.min(total, from + n) - from) }, (_, i) => [Math.floor((from + i) / CONDS.length), (from + i) % CONDS.length]);
  for (const [ci, cond] of list) { const k = ci * 100 + cond; const c = CASES[ci]; const t0 = performance.now();
    let res: any = null, fr = 0, err = "";
    try { for (fr = 0; fr < frames; fr++) { res = appRead(frame(ci, cond, fr)); if (res) break; if (![8, 9, 13, 14].includes(cond)) break; } } catch (e) { err = String((e as Error).message || e).slice(0, 120); }
    const got = res ? norm(res[0]) : ""; const want = norm(c.want);
    out.push({ k, ci, ci_cond: cond, t: c.t, cond: CONDS[cond], src: c.src, want: c.want, got: res ? res[0] : null, fmt: res ? res[1] : null, via: res ? res[2] : null, frames: res ? fr + 1 : null, verdict: err ? "error" : !res ? "none" : got === want ? "ok" : "WRONG", err, ms: Math.round(performance.now() - t0) });
  }
  return new Response(JSON.stringify({ from, n, total, out }), { headers: { "Content-Type": "application/json" } });
});
