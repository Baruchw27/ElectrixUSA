# Adds the "straightened" reading (projection-profile deskew → clean label → OCR psm 11 + psm 3) to out/ocr.json as texts['ask'], texts['ask3'].
# The same angle search runs in the app (scanner-v2-ui.js labelAngle): binarize small copy, try -15°..15° in 0.5° steps,
# keep the angle whose row profile is sharpest (text lines line up), straighten, then the normal "clean label" step.
import json, os, sys, subprocess
from multiprocessing import Pool
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from gen_labels import adaptive_delines, ocr
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); IMG = os.path.join(OUT, os.environ.get('IMG_DIR', 'img'))
def label_angle(im):
    s = 400 / max(im.size); sm = im.convert('L').resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
    b = np.asarray(adaptive_delines(sm, r=12), dtype=np.uint8) < 128
    ink = Image.fromarray((b * 255).astype(np.uint8))
    best, ba = -1, 0.0
    for a10 in range(-150, 151, 5):
        a = a10 / 10; r = np.asarray(ink.rotate(a, resample=Image.NEAREST, fillcolor=0)) > 0
        prof = r.sum(1).astype(np.float64); v = float(((prof[1:] - prof[:-1]) ** 2).sum())
        if v > best: best, ba = v, a
    return ba
def job(m):
    p = os.path.join(IMG, m['name'] + '.png'); im = Image.open(p).convert('L'); a = label_angle(im)
    if abs(a) < 1.5: return m['name'], a, ('', '')
    t = p.replace('.png', '_dsk.png'); adaptive_delines(im.rotate(a, expand=False, fillcolor=150)).save(t)
    tx = (ocr(t, 11), ocr(t, 3)); os.remove(t); return m['name'], a, tx  # sparse-text and auto layouts: the straightened box lines confuse the block layout
if __name__ == '__main__':
    f = os.path.join(OUT, sys.argv[1] if len(sys.argv) > 1 else 'ocr.json'); M = json.load(open(f))
    with Pool(2) as pool: res = {n: (a, t) for n, a, t in pool.imap_unordered(job, M)}
    for m in M: a, t = res[m['name']]; m['texts']['ask'] = t[0]; m['texts']['ask3'] = t[1]; m['angle'] = a
    json.dump(M, open(f, 'w')); print('done', len(M), 'tilted found:', sum(1 for m in M if abs(m.get('angle', 0)) >= 1.5))
