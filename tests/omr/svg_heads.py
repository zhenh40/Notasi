"""Ambil posisi kepala not kunci jawaban dari SVG Verovio -> JSON (koordinat piksel PNG bersih).
python svg_heads.py pages.json jobs.json OUT.json"""
import json, re, sys
pages = json.load(open(sys.argv[1])); jobs = {j['png']: j for j in json.load(open(sys.argv[2]))}
out = {}
for p in pages:
    png = p['png']
    job = next(j for k, j in jobs.items() if png.endswith(k.split('/')[-1]))
    svg = open(job['svg']).read()
    W = int(re.search(r'<svg width="(\d+)px"', svg).group(1))
    vb = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg)
    k = W / float(vb.group(1)) * job['scale']
    m = re.search(r'class="page-margin" transform="translate\((-?\d+),\s*(-?\d+)\)"', svg)
    ox, oy = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    heads = []
    for g in re.finditer(r'class="notehead">\s*<use xlink:href="#(E0A[2-4])-[^"]*" transform="translate\((-?\d+),\s*(-?\d+)\) scale\(([\d.]+)', svg):
        code, x, y, sc = g.group(1), int(g.group(2)), int(g.group(3)), float(g.group(4))
        wglyph = {'E0A4': 295, 'E0A3': 295, 'E0A2': 422}[code] * sc  # perkiraan lebar (satuan Bravura)
        heads.append({'x': (ox + x + wglyph / 2) * k, 'y': (oy + y) * k, 'kind': {'E0A4': 'black', 'E0A3': 'half', 'E0A2': 'whole'}[code]})
    out[png.split('/')[-1]] = heads
json.dump(out, open(sys.argv[3], 'w'))
print(sum(len(v) for v in out.values()), 'kepala not')
