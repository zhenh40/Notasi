"""
Ekstraksi acuan independen memakai music21 (bukan kode NOTASI).
Untuk setiap berkas: daftar nada (indeks birama, offset, durasi, midi) serta
angka & tanda kres/mol yang DIHARAPKAN, dihitung dari KeySignature music21.

python m21_expected.py <daftar-berkas.txt> <keluaran.json>
"""
import json, sys
from fractions import Fraction
import music21 as m21

LET = 'CDEFGAB'


def expected_for(path):
    s = m21.converter.parse(path, forceSource=True)
    out = []
    for part in s.parts:
        ks = None
        for mi, meas in enumerate(part.getElementsByClass('Measure')):
            kss = list(meas.recurse().getElementsByClass(m21.key.KeySignature))
            if kss:
                ks = kss[0]
            if ks is None:
                ks = m21.key.KeySignature(0)
            for n in meas.recurse().notes:
                if isinstance(n, m21.harmony.ChordSymbol) or n.duration.isGrace or n.style.hideObjectOnPrint:
                    continue
                pitches = n.pitches if n.isChord else [n.pitch]
                off = Fraction(n.getOffsetInHierarchy(meas))
                ql = Fraction(n.duration.quarterLength)
                for p in pitches:
                    alter = int(p.accidental.alter) if p.accidental else 0
                    ka = ks.accidentalByStep(p.step)
                    kalter = int(ka.alter) if ka else 0
                    tonic = ks.asKey('major').tonic.step
                    degree = (LET.index(p.step) - LET.index(tonic)) % 7 + 1
                    out.append([mi, str(off), str(ql), p.midi, degree, alter - kalter])
    return out


def main():
    files = [l.strip() for l in open(sys.argv[1]) if l.strip()]
    res = {}
    for f in files:
        try:
            res[f] = expected_for(f)
        except Exception as e:  # noqa
            res[f] = {'error': str(e)[:200]}
    json.dump(res, open(sys.argv[2], 'w'))


if __name__ == '__main__':
    main()
