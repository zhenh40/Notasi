"""
Ambil bentuk simbol (SMuFL) dari font Verovio -> js/omr/glyphs.js
Dipakai mesin OMR sebagai cetakan pembanding (template), digambar ulang di browser
sesuai ukuran paranada foto. Font berlisensi SIL OFL (Bravura, Leipzig, Leland, Gootville).

python extract_glyphs.py VEROVIO_DATA_DIR OUT_JS
"""
import json
import os
import re
import sys

FONTS = ['Bravura', 'Leipzig', 'Leland', 'Gootville', 'Petaluma']
GLYPHS = {
    'E050': 'gClef', 'E062': 'fClef', 'E05C': 'cClef',
    'E0A2': 'noteheadWhole', 'E0A3': 'noteheadHalf', 'E0A4': 'noteheadBlack',
    'E4E3': 'restWhole', 'E4E4': 'restHalf', 'E4E5': 'restQuarter', 'E4E6': 'rest8th',
    'E4E7': 'rest16th', 'E4E8': 'rest32nd',
    'E260': 'accidentalFlat', 'E261': 'accidentalNatural', 'E262': 'accidentalSharp',
    'E263': 'accidentalDoubleSharp', 'E264': 'accidentalDoubleFlat',
    'E080': 'timeSig0', 'E081': 'timeSig1', 'E082': 'timeSig2', 'E083': 'timeSig3', 'E084': 'timeSig4',
    'E085': 'timeSig5', 'E086': 'timeSig6', 'E087': 'timeSig7', 'E088': 'timeSig8', 'E089': 'timeSig9',
    'E08A': 'timeSigCommon', 'E08B': 'timeSigCutCommon',
    'E883': 'tuplet3', 'E1E7': 'augmentationDot',
    'E240': 'flag8thUp', 'E241': 'flag8thDown', 'E242': 'flag16thUp', 'E243': 'flag16thDown',
}


def main():
    data_dir, out = sys.argv[1], sys.argv[2]
    result = {}
    for font in FONTS:
        bb_xml = open(os.path.join(data_dir, font + '.xml'), encoding='utf-8').read()
        upm = int(re.search(r'units-per-em="(\d+)"', bb_xml).group(1))
        glyphs = {}
        for code, name in GLYPHS.items():
            p = os.path.join(data_dir, font, code + '.xml')
            if not os.path.exists(p):
                continue
            g = open(p, encoding='utf-8').read()
            paths = re.findall(r'<path[^>]*\sd="([^"]+)"', g)
            m = re.search(r'<g c="%s" x="([-\d.]+)" y="([-\d.]+)" w="([-\d.]+)" h="([-\d.]+)"' % code, bb_xml)
            if not paths or not m:
                continue
            x, y, w, h = (float(v) for v in m.groups())
            glyphs[name] = {'d': ' '.join(paths), 'b': [x, y, w, h]}
        result[font] = {'upm': upm, 'g': glyphs}
    js = ('/* Dihasilkan oleh tests/omr/extract_glyphs.py — bentuk simbol SMuFL (SIL Open Font License):\n'
          '   Bravura, Leipzig, Leland, Gootville, Petaluma. Satuan font: 1 em = 4 spasi paranada. */\n'
          '(function (root) { root.NotasiGlyphs = ' + json.dumps(result, separators=(',', ':')) +
          '; })(typeof self !== "undefined" ? self : globalThis);\n')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(js)
    print(out, len(js) // 1024, 'KB', {f: len(result[f]['g']) for f in result})


if __name__ == '__main__':
    main()
