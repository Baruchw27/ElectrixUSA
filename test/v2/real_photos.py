# Baruch's real garage photos (Leviton 5603-P2W box, Leviton 80409-NW box, Luxrite LR25022) — cropped the way the
# phone's scanner crops its camera frame, plus harder versions (turned, blurry, dark, far away), through the same passes.
import json, os, sys
from PIL import Image, ImageFilter, ImageEnhance
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_labels as g
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out', 'real'); os.makedirs(OUT, exist_ok=True)
SRC = [
  ('leviton_5603P2W', '/mnt/user-data/uploads/photo.jpeg', '30078477339641', {'brand': 'Leviton', 'part': '5603-P2W', 'pack': 10}, (0.5, 0.42)),
  ('leviton_80409NW', '/root/.claude/uploads/a06c9d9d-3aa1-55dc-9524-944a7304869d/df64104b-photo.jpeg', '30078477488509', {'brand': 'Leviton', 'part': '80409-NW', 'pack': 25}, (0.42, 0.33)),
  ('luxrite_LR25022', '/root/.claude/uploads/a06c9d9d-3aa1-55dc-9524-944a7304869d/e0c881dc-image.jpg', '0793888426948', {'brand': 'Luxrite', 'part': 'LR25022', 'pack': None}, (0.55, 0.55)),
]
def snap(im, cx, cy):
    # the phone frame is ~16:9 portrait; the scanner keeps the middle 94% wide × 60% tall, scaled to ≤1600 px wide
    W, H = im.size; fw, fh = W, int(W * 16 / 9 * 0.75)
    x0 = max(0, int(cx * W - fw / 2)); y0 = max(0, min(H - fh, int(cy * H - fh / 2))); fr = im.crop((x0, y0, x0 + fw, y0 + fh))
    sw, sh = fr.width * 0.94, fr.height * 0.6; c = fr.crop((int((fr.width - sw) / 2), int((fr.height - sh) / 2), int((fr.width + sw) / 2), int((fr.height + sh) / 2)))
    sc = min(2, 1600 / c.width); return c.resize((int(c.width * sc), int(c.height * sc)))
VAR = {'as_taken': lambda i: i, 'turned_90': lambda i: i.rotate(90, expand=True), 'blurry': lambda i: i.filter(ImageFilter.GaussianBlur(2.2)),
       'dark': lambda i: ImageEnhance.Brightness(i).enhance(0.4), 'far_away': lambda i: i.resize((i.width // 2, i.height // 2)), 'tilted': lambda i: i.rotate(7, expand=False, fillcolor=(120, 120, 120))}
meta = []; jobs = []
for name, path, code, truth, (cx, cy) in SRC:
    im = Image.open(path).convert('RGB'); s0 = snap(im, cx, cy)
    for v, f in VAR.items():
        nm = name + '__' + v; fp = os.path.join(OUT, nm + '.png'); f(s0).convert('L').save(fp)
        meta.append({'name': nm, 'scan': code, 'truth': truth, 'cond': v}); jobs.append((nm, fp))
from multiprocessing import Pool
with Pool(2) as pool: res = dict(pool.map(g.job, jobs))
for m in meta: m['texts'] = res[m['name']]
json.dump(meta, open(os.path.join(HERE, 'out', 'real_ocr.json'), 'w')); print('done', len(meta))
