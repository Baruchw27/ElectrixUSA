# Builds the label-photo test set: every product label in 12 photo conditions, then reads each one with the
# real Tesseract OCR engine (the same engine the phone runs), the same way the app does:
#   contrast-boost → page modes 6, 11, 3 → if unsure, the photo turned 90°, 270°, 180° (mode 11).
# Output: test/v2/out/ocr.json  (one entry per photo, all OCR texts) — scored by eval_labels.js
import json, os, random, subprocess, sys, io
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); IMG = os.path.join(OUT, 'img')
os.makedirs(IMG, exist_ok=True)
random.seed(7)
F = '/usr/share/fonts/truetype/dejavu/'
def font(sz, bold=False, cond=False):
    n = 'DejaVuSans' + ('Condensed' if cond else '') + ('-Bold' if bold else '') + '.ttf'
    return ImageFont.truetype(F + n, sz)
def ck(b):
    s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(b))); return str((10 - s % 10) % 10)

P = json.load(open(os.path.join(HERE, 'products.json')))
def codes(p, i):
    pre = p['prefix'] or ('6' + ''.join(random.choice('0123456789') for _ in range(5)))  # unknown makers get a made-up company number
    body = '0' + pre + '%05d' % (10000 + i * 37) if len(pre) == 6 else pre
    upc11 = (pre + '%05d' % (10000 + i * 37))[:11]
    upc = upc11 + ck(upc11)
    box = ''
    if p['pack'] > 1:
        b13 = str(1 + i % 3) + '0' + upc11
        box = b13 + ck(b13)
    return upc, box

FR = {'Single-Pole': 'Interrupteur unipolaire', '3-Way': 'Interrupteur a 3-voies', '4-Way': 'Interrupteur a 4-voies'}
def bars(d, x, y, w, h):
    r = random.Random(x * 7 + y)
    xx = x
    while xx < x + w:
        bw = r.choice([2, 2, 3, 4, 6]); d.rectangle([xx, y, xx + bw - 1, y + h], fill=0); xx += bw + r.choice([2, 3, 4])

def draw_label(p, upc, box):
    tpl = p['tpl']; W, H = 900, 600
    im = Image.new('L', (W, H), 250); d = ImageDraw.Draw(im)
    code = box or upc
    if tpl == 'leviton':
        d.rectangle([40, 40, 860, 560], outline=20, width=4)
        d.line([40, 140, 860, 140], fill=20, width=3); d.line([520, 40, 520, 140], fill=20, width=3); d.line([680, 40, 680, 140], fill=20, width=3)
        d.text((60, 62), p['part'], font=font(52, True, True), fill=0)
        d.text((535, 50), 'QTY\nQTE\nCANT', font=font(14), fill=0); d.text((590, 66), str(p['pack']), font=font(44, True), fill=0)
        d.text((700, 62), '242', font=font(40), fill=0)
        y = 160
        if p['color']: d.text((60, y), (p['color'].upper() + ' / ' + {'White': 'BLANC / BLANCO', 'Ivory': 'IVOIRE / MARFIL'}.get(p['color'], '')), font=font(28, True), fill=0); y += 50
        d.text((60, y), p['desc'].upper(), font=font(30, True, True), fill=0); y += 44
        fr = next((v for k, v in FR.items() if k in p['desc']), 'Produit electrique')
        d.text((60, y), fr.upper(), font=font(26, False, True), fill=0); y += 38
        d.text((60, y), 'PRODUCTO ELECTRICO', font=font(26, False, True), fill=0); y += 40
        d.text((640, 200), 'UL  CSA  NOM', font=font(24, True), fill=0)
        bars(d, 300, 420, 480, 90); d.text((330, 515), code, font=font(24), fill=0)
        d.text((60, 500), 'LEVITON', font=font(34, True), fill=0)
        d.text((60, 400), 'COUNTRY OF ORIGIN - MEXICO', font=font(16), fill=0)
    elif tpl == 'luxrite':
        d.text((70, 50), 'LUXRITE', font=font(78, True), fill=0)
        y = 160
        for ln in [p['desc'].upper()[:26], p['desc'].upper()[26:]]:
            if ln.strip(): d.text((70, y), ln.strip(), font=font(38, True), fill=0); y += 50
        d.text((70, y), 'ITEM# ' + p['part'], font=font(38, True), fill=0); y += 52
        d.text((70, y), 'LED/' + p['part'][-4:] + '/RD/WT', font=font(30), fill=0)
        if p['pack'] > 1: d.text((70, y + 50), 'PACK OF %d' % p['pack'], font=font(30, True), fill=0)
        bars(d, 560, 420, 280, 80); d.text((560, 505), upc[0] + '  ' + upc[1:6] + '  ' + upc[6:11] + '  ' + upc[11], font=font(22), fill=0)
        d.text((600, 540), 'MADE IN CHINA', font=font(16), fill=0)
    elif tpl == 'lutron':
        d.rectangle([0, 0, W, 110], fill=30); d.text((60, 22), 'LUTRON', font=font(64, True), fill=250)
        d.text((60, 140), p['desc'], font=font(40, True, True), fill=0)
        d.text((60, 205), 'for dimmable LED, CFL, halogen and incandescent bulbs', font=font(22), fill=0)
        d.text((60, 270), 'Model ' + p['part'], font=font(40, True), fill=0)
        if p['color']: d.text((60, 330), p['color'] + ' / ' + {'White': 'Blanc / Blanco', 'Ivory': 'Ivoire / Marfil'}[p['color']], font=font(28), fill=0)
        bars(d, 520, 430, 320, 80); d.text((540, 515), upc, font=font(22), fill=0)
        d.text((60, 520), 'www.lutron.com', font=font(20), fill=0)
    elif tpl == 'eaton':
        d.text((60, 40), 'EATON', font=font(70, True), fill=0)
        d.text((60, 140), p['desc'], font=font(34, True, True), fill=0)
        d.text((60, 200), '120/240 Vac  10 kA  UL Listed', font=font(26), fill=0)
        d.text((60, 260), 'Cat. No. ' + p['part'], font=font(42, True), fill=0)
        if p['pack'] > 1: d.text((60, 320), 'Qty %d' % p['pack'], font=font(32), fill=0)
        bars(d, 520, 420, 320, 80); d.text((540, 505), code, font=font(22), fill=0)
    elif tpl == 'wire':
        d.text((60, 40), p['brand'].upper(), font=font(70, True), fill=0)
        d.text((60, 150), p['desc'], font=font(40, True, True), fill=0)
        d.text((60, 220), '600V  Copper  UL Listed', font=font(28), fill=0)
        d.text((60, 280), 'Made in USA - Carrollton GA', font=font(24), fill=0)
        bars(d, 520, 420, 320, 80); d.text((540, 505), upc, font=font(22), fill=0)
    elif tpl == 'retail':
        d.text((60, 40), p['brand'].upper(), font=font(60, True), fill=0)
        d.text((60, 130), p['desc'][:34], font=font(34, True, True), fill=0)
        if len(p['desc']) > 34: d.text((60, 180), p['desc'][34:], font=font(34, True, True), fill=0)
        d.text((60, 250), 'MODEL ' + p['part'], font=font(34, True), fill=0)
        if p['color']: d.text((60, 300), p['color'], font=font(30), fill=0)
        d.text((60, 360), 'Read instructions before installing', font=font(20), fill=0)
        bars(d, 520, 430, 320, 80); d.text((540, 515), upc, font=font(22), fill=0)
    else:  # generic box label
        d.rectangle([30, 30, 870, 570], outline=40, width=3)
        d.text((60, 50), p['brand'].upper(), font=font(56, True), fill=0)
        d.text((60, 140), 'CAT# ' + p['part'], font=font(44, True), fill=0)
        d.text((60, 210), p['desc'][:38], font=font(30, True, True), fill=0)
        if len(p['desc']) > 38: d.text((60, 252), p['desc'][38:], font=font(30, True, True), fill=0)
        if p['color']: d.text((60, 300), p['color'].upper(), font=font(28), fill=0)
        if p['pack'] > 1: d.text((60, 350), 'QTY: %d' % p['pack'], font=font(30, True), fill=0)
        bars(d, 520, 430, 320, 80); d.text((540, 515), code, font=font(22), fill=0)
    return im

def cond(im, c, seed):
    r = random.Random(seed)
    bg = Image.new('L', (1100, 800), 150)  # the photo is bigger than the label (box around it)
    lab = im
    if c == 'small_pack':
        lab = im.resize((450, 300))
    x0 = (bg.width - lab.width) // 2; y0 = (bg.height - lab.height) // 2
    bg.paste(lab, (x0, y0)); out = bg
    if c == 'clean': pass
    elif c == 'blur_light': out = out.filter(ImageFilter.GaussianBlur(1.3))
    elif c == 'blur_heavy': out = out.filter(ImageFilter.GaussianBlur(2.8))
    elif c == 'tilt': out = out.rotate(r.choice([-8, -6, 6, 8]), expand=False, fillcolor=150)
    elif c == 'rot90': out = out.rotate(90, expand=True, fillcolor=150)
    elif c == 'rot180': out = out.rotate(180, expand=True, fillcolor=150)
    elif c == 'dark': out = ImageEnhance.Brightness(out).enhance(0.38)
    elif c == 'overexposed': out = ImageEnhance.Contrast(ImageEnhance.Brightness(out).enhance(1.45)).enhance(0.55)
    elif c == 'shadow':
        g = Image.linear_gradient('L').rotate(r.choice([0, 90, 45]), expand=True).resize(out.size)
        out = Image.composite(out, ImageEnhance.Brightness(out).enhance(0.35), g)
    elif c == 'noise_jpeg':
        px = out.load()
        for _ in range(out.width * out.height // 12):
            x, y = r.randrange(out.width), r.randrange(out.height); px[x, y] = r.randrange(256)
        b = io.BytesIO(); out.save(b, 'JPEG', quality=18); out = Image.open(io.BytesIO(b.getvalue())).convert('L')
    elif c == 'partial':  # label half covered / cut off on the right
        d = ImageDraw.Draw(out); d.rectangle([x0 + int(lab.width * 0.6), 0, out.width, out.height], fill=120)
    elif c == 'lowres': out = out.resize((out.width // 3, out.height // 3)).resize(out.size)
    elif c == 'small_pack': out = out.filter(ImageFilter.GaussianBlur(0.6))
    return out

CONDS = ['clean', 'blur_light', 'blur_heavy', 'tilt', 'rot90', 'rot180', 'dark', 'overexposed', 'shadow', 'noise_jpeg', 'partial', 'lowres', 'small_pack']

def prep(im):  # same contrast boost as the app's ocrPrep()
    lut = [max(0, min(255, int((l - 128) * 1.6 + 140))) for l in range(256)]
    return im.point(lut)

import numpy as np
def adaptive_delines(im, r=25, k=0.12, dark=100):
    # same as the app's labelClean(): local-mean threshold (window 2r+1), then long table lines removed
    a = np.asarray(im.convert('L'), dtype=np.float64); h, w = a.shape
    ii = np.pad(a, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    ys = np.arange(h); xs = np.arange(w)
    y0 = np.clip(ys - r, 0, h); y1 = np.clip(ys + r + 1, 0, h); x0 = np.clip(xs - r, 0, w); x1 = np.clip(xs + r + 1, 0, w)
    S = ii[y1][:, x1] - ii[y0][:, x1] - ii[y1][:, x0] + ii[y0][:, x0]
    cnt = (y1 - y0)[:, None] * (x1 - x0)[None, :]
    b = np.where(a < (S / cnt) * (1 - k), 0, 255).astype(np.uint8)
    d = b < dark
    def runs(mask, lim):
        out = np.zeros_like(mask)
        for i in range(mask.shape[0]):
            row = mask[i]; j = 0; n = len(row)
            idx = np.flatnonzero(np.diff(np.concatenate(([0], row.astype(np.int8), [0]))))
            for s0, e0 in zip(idx[::2], idx[1::2]):
                if e0 - s0 > lim: out[i, s0:e0] = True
        return out
    kill = runs(d, w * 0.25) | runs(d.T, h * 0.12).T
    b[kill] = 255
    return Image.fromarray(b)

def ocr(path, psm):
    r = subprocess.run(['tesseract', path, '-', '--psm', str(psm)], capture_output=True, text=True, timeout=60)
    return r.stdout

def job(a):
    name, path = a
    im = Image.open(path)
    pp = prep(im); base = path.replace('.png', '')
    texts = {}
    pp.save(base + '_p.png')
    for m in (6, 11, 3): texts['m%d' % m] = ocr(base + '_p.png', m)
    for deg in (90, 270, 180):
        pp.rotate(deg, expand=True).save(base + '_r%d.png' % deg); texts['r%d' % deg] = ocr(base + '_r%d.png' % deg, 11)
        os.remove(base + '_r%d.png' % deg)
    os.remove(base + '_p.png')
    ad = adaptive_delines(im); ad.save(base + '_a.png')
    for m in (6, 11): texts['a%d' % m] = ocr(base + '_a.png', m)
    for deg in (90, 270, 180):
        adaptive_delines(im.rotate(deg, expand=True)).save(base + '_ar.png'); texts['ar%d' % deg] = ocr(base + '_ar.png', 11)
    for deg in (-6, 6):
        adaptive_delines(im.rotate(deg, expand=False, fillcolor=150)).save(base + '_ad.png'); texts['ad%d' % deg] = ocr(base + '_ad.png', 6)
    for f in ('_a.png', '_ar.png', '_ad.png'):
        try: os.remove(base + f)
        except Exception: pass
    return name, texts

if __name__ == '__main__':
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    meta = []; jobs = []
    for i, p in enumerate(P):
        upc, box = codes(p, i)
        lab = draw_label(p, upc, box)
        for c in CONDS:
            nm = p['id'] + '__' + c
            if only and only not in nm: continue
            fp = os.path.join(IMG, nm + '.png'); cond(lab, c, hash(nm) & 0xffff).save(fp)
            meta.append({'name': nm, 'product': p['id'], 'cond': c, 'upc': upc, 'box': box, 'scan': box if p['tpl'] in ('leviton', 'generic', 'eaton') and box else upc})
            jobs.append((nm, fp))
    res = {}
    with Pool(2) as pool:
        for k, (nm, tx) in enumerate(pool.imap_unordered(job, jobs)):
            res[nm] = tx
            if k % 50 == 0: print(k, '/', len(jobs), flush=True)
    for m in meta: m['texts'] = res.get(m['name'], {})
    json.dump(meta, open(os.path.join(OUT, 'ocr.json'), 'w'))
    print('done', len(meta))
