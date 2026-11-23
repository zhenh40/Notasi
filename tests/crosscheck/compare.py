"""Bandingkan hasil NOTASI dengan acuan music21. python compare.py expected.json actual.json"""
import json, sys
from collections import Counter
from fractions import Fraction

exp = json.load(open(sys.argv[1]))
act = json.load(open(sys.argv[2]))

def norm(rows):
    return Counter((r[0], Fraction(r[1]), Fraction(r[2]), r[3], r[4], r[5]) for r in rows)

ok = bad = skipped = 0
total_notes = 0
fails = []
for f, e in exp.items():
    a = act.get(f)
    if isinstance(e, dict):
        skipped += 1
        continue
    if a is None or 'error' in a:
        bad += 1
        fails.append((f, 'NOTASI error: ' + (a or {}).get('error', 'missing')))
        continue
    ce, ca = norm(e), norm(a['notes'])
    total_notes += sum(ce.values())
    if ce == ca:
        ok += 1
    else:
        bad += 1
        miss = list((ce - ca).items())[:3]
        extra = list((ca - ce).items())[:3]
        fails.append((f, f'hilang={sum((ce-ca).values())} lebih={sum((ca-ce).values())} contoh-hilang={miss} contoh-lebih={extra}'))

print(f'berkas cocok 100%: {ok}  |  berbeda: {bad}  |  dilewati (music21 gagal): {skipped}  |  nada diperiksa: {total_notes}')
for f, msg in fails[:25]:
    print(' -', f.split('/corpus/')[-1], msg[:400])
