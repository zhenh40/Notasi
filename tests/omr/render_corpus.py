"""
Render korpus: MusicXML -> SVG (Verovio) -> jobs.json untuk rasterize.js -> varian "scan"/"foto".

  python render_corpus.py render XML_DIR OUT_DIR [SEED]     # tulis SVG + jobs.json
  node rasterize.js OUT_DIR/jobs.json                       # SVG -> PNG
  python render_corpus.py degrade OUT_DIR [SEED]            # PNG bersih -> varian scan/foto + manifest.json
"""
import glob
import json
import math
import os
import random
import sys

FONTS = ['Leipzig', 'Bravura', 'Leland', 'Gootville']


def render(xml_dir, out_dir, seed=11):
    import verovio
    rng = random.Random(seed)
    os.makedirs(out_dir, exist_ok=True)
    jobs, pages = [], []
    for xml in sorted(glob.glob(os.path.join(xml_dir, '*.musicxml')) + sorted(glob.glob(os.path.join(xml_dir, '*.mxl')))):
        name = os.path.splitext(os.path.basename(xml))[0]
        font = rng.choice(FONTS)
        scale = rng.choice([34, 38, 40, 44, 48])
        tk = verovio.toolkit()
        tk.setOptions({'pageWidth': 2100, 'pageHeight': 2970, 'scale': scale, 'font': font,
                       'footer': 'none', 'adjustPageHeight': False, 'breaks': 'auto'})
        if not tk.loadFile(xml):
            print('gagal', xml)
            continue
        n = tk.getPageCount()
        # resolusi: 300 dpi (lebar 2480) atau 200 dpi (1650)
        dpi_scale = rng.choice([2.95, 2.95, 1.97])
        for pg in range(1, n + 1):
            svg = tk.renderToSVG(pg)
            base = f'{name}_p{pg}'
            sp = os.path.join(out_dir, base + '.svg')
            with open(sp, 'w') as f:
                f.write(svg)
            jobs.append({'svg': sp, 'png': os.path.join(out_dir, base + '.png'), 'scale': dpi_scale})
            pages.append({'piece': name, 'xml': os.path.abspath(xml), 'page': pg, 'pages': n,
                          'font': font, 'vscale': scale, 'png': os.path.abspath(os.path.join(out_dir, base + '.png'))})
    with open(os.path.join(out_dir, 'jobs.json'), 'w') as f:
        json.dump(jobs, f)
    with open(os.path.join(out_dir, 'pages.json'), 'w') as f:
        json.dump(pages, f, indent=1)
    print('svg', len(jobs))


def degrade(out_dir, seed=13):
    from PIL import Image, ImageFilter
    import numpy as np
    rng = random.Random(seed)
    nprng = np.random.default_rng(seed)
    pages = json.load(open(os.path.join(out_dir, 'pages.json')))
    manifest = []
    for p in pages:
        im = Image.open(p['png']).convert('L')
        manifest.append(dict(p, variant='bersih', img=p['png']))
        # --- scan: sedikit miring, abu-abu, noise, JPEG ---
        a = rng.uniform(-0.9, 0.9)
        s = im.rotate(a, resample=Image.BICUBIC, expand=False, fillcolor=255)
        s = s.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 0.7)))
        arr = np.asarray(s).astype(np.float32)
        arr = 235 - (255 - arr) * rng.uniform(0.8, 0.95) + nprng.normal(0, 6, arr.shape)
        s = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        sp = p['png'].replace('.png', '_scan.jpg')
        s.save(sp, quality=rng.randint(70, 88))
        manifest.append(dict(p, variant='scan', img=sp, angle=a))
        # --- foto: lebih miring, cahaya tidak rata, blur, resolusi lebih rendah ---
        a = rng.uniform(-2.2, 2.2)
        f = im.rotate(a, resample=Image.BICUBIC, expand=False, fillcolor=255)
        w, h = f.size
        target_w = rng.choice([1500, 1700, 2000])
        f = f.resize((target_w, int(h * target_w / w)), Image.LANCZOS)
        f = f.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 1.0)))
        arr = np.asarray(f).astype(np.float32)
        hh, ww = arr.shape
        yy, xx = np.mgrid[0:hh, 0:ww]
        cx, cy = rng.uniform(0, ww), rng.uniform(0, hh)
        light = 225 - 70 * (np.hypot(xx - cx, yy - cy) / math.hypot(ww, hh))
        ink = (255 - arr) / 255.0
        arr = light * (1 - ink * rng.uniform(0.78, 0.92)) + nprng.normal(0, 7, arr.shape)
        f = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        fp = p['png'].replace('.png', '_foto.jpg')
        f.save(fp, quality=rng.randint(60, 80))
        manifest.append(dict(p, variant='foto', img=fp, angle=a))
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print('manifest', len(manifest))


if __name__ == '__main__':
    if sys.argv[1] == 'render':
        render(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 11)
    else:
        degrade(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 13)
