"""
Generator korpus uji OMR piano: MusicXML acak yang realistis (balok, titik, ikatan,
triol, akor, tanda kromatis, diam) -> SVG (Verovio, berbagai font) -> PNG (Chromium)
-> versi "difoto" (miring, blur, noise, JPEG). Kunci jawaban = MusicXML aslinya.

python gen_corpus.py OUT_DIR N_PIECES [SEED]
"""
import json
import os
import random
import sys

LET = 'CDEFGAB'
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
SHARPS = 'FCGDAEB'
FLATS = 'BEADGCF'
DIV = 24
TYPES = {96: ('whole', 0), 72: ('half', 1), 48: ('half', 0), 36: ('quarter', 1), 24: ('quarter', 0),
         18: ('eighth', 1), 12: ('eighth', 0), 9: ('16th', 1), 6: ('16th', 0), 3: ('32nd', 0)}


def key_alter(letter, fifths):
    if fifths > 0:
        return 1 if SHARPS.index(letter) < fifths else 0
    if fifths < 0:
        return -1 if FLATS.index(letter) < -fifths else 0
    return 0


def dia(step, octave):
    return octave * 7 + LET.index(step)


def from_dia(d):
    return LET[d % 7], d // 7


class Note:
    def __init__(self, pitches, dur, rest=False, tie_start=False, triplet=None):
        self.pitches = pitches  # list of (step, alter, octave)
        self.dur = dur          # in divisions (real duration)
        self.rest = rest
        self.tie_start = tie_start
        self.tie_stop = False
        self.triplet = triplet  # None | 'start' | 'mid' | 'stop'
        self.beams = {}         # level -> begin/continue/end/forward hook/backward hook
        self.acc_print = {}     # index -> accidental text

    @property
    def base(self):
        return self.dur * 3 // 2 if self.triplet else self.dur


def rhythm_for_beat(rng, beat_len, style):
    """Daftar durasi yang mengisi satu ketukan (beat_len = 24 untuk x/4, 36 untuk x/8 majemuk)."""
    if beat_len == 36:
        return rng.choice([[36], [36], [24, 12], [12, 12, 12], [12, 12, 12], [18, 6, 12], [12, 24], [6, 6, 12, 12]])
    opts = [[24], [24], [24], [12, 12], [12, 12], [12, 12], [6, 6, 6, 6], [18, 6], [6, 6, 12], [12, 6, 6]]
    if style == 'busy':
        opts += [[6, 6, 6, 6], [12, 12], [6, 6, 12]]
    return rng.choice(opts)


def gen_measure_rhythm(rng, meas_len, beat_len, style, allow_triplet):
    """Rangkaian (durasi, flag) yang mengisi satu birama."""
    out = []
    pos = 0
    while pos < meas_len:
        rem = meas_len - pos
        r = rng.random()
        if beat_len == 24 and pos % 48 == 0 and rem >= 48 and r < 0.12:
            out.append((48, None)); pos += 48; continue
        if beat_len == 24 and pos % 24 == 0 and rem >= 72 and r < 0.16:
            out.append((72, None)); pos += 72; continue
        if beat_len == 24 and pos == 0 and rem == 96 and r < 0.2:
            out.append((96, None)); pos += 96; continue
        if beat_len == 24 and pos % 24 == 0 and rem >= 48 and 0.2 < r < 0.28:
            out.append((36, None)); out.append((12, None)); pos += 48; continue
        if allow_triplet and beat_len == 24 and rng.random() < 0.08:
            out += [(8, 'start'), (8, 'mid'), (8, 'stop')]; pos += 24; continue
        for d in rhythm_for_beat(rng, beat_len, style):
            out.append((d, None))
        pos += beat_len
    return out


def pick_pitch(rng, prev_d, lo, hi, fifths, chroma_p):
    step = rng.choice([-2, -1, -1, 1, 1, 2, -3, 3, 0, 4, -4])
    d = max(lo, min(hi, prev_d + step))
    s, o = from_dia(d)
    alter = key_alter(s, fifths)
    if rng.random() < chroma_p:
        alter = rng.choice([a for a in (-1, 0, 1) if a != alter])
    return d, (s, alter, o)


def build_staff(rng, n_meas, meas_len, beat_len, fifths, lo, hi, style, chord_p, rest_p, chroma_p, allow_triplet, tie_p):
    measures = []
    prev = (lo + hi) // 2
    for mi in range(n_meas):
        rh = gen_measure_rhythm(rng, meas_len, beat_len, style, allow_triplet)
        notes = []
        for (dur, trip) in rh:
            if not trip and rng.random() < rest_p:
                notes.append(Note([], dur, rest=True))
                continue
            prev, p = pick_pitch(rng, prev, lo, hi, fifths, chroma_p)
            pitches = [p]
            if not trip and rng.random() < chord_p:
                for k in rng.sample([2, 4, 5, 7], rng.choice([1, 1, 2])):
                    d2 = prev - k if prev - k >= lo - 2 else prev + k
                    s2, o2 = from_dia(d2)
                    pitches.append((s2, key_alter(s2, fifths), o2))
            # hindari unisono ganda dalam akor
            seen, uniq = set(), []
            for q in pitches:
                if (q[0], q[2]) not in seen:
                    seen.add((q[0], q[2])); uniq.append(q)
            notes.append(Note(uniq, dur, triplet=trip))
        measures.append(notes)
    # ikatan: not terakhir birama -> not pertama birama berikutnya (nada sama)
    for mi in range(n_meas - 1):
        a = measures[mi][-1]
        b = measures[mi + 1][0]
        if not a.rest and not b.rest and not a.triplet and not b.triplet and rng.random() < tie_p:
            b.pitches = list(a.pitches)
            a.tie_start = True
            b.tie_stop = True
    return measures


def assign_beams(measure, beat_len):
    """Balok per ketukan untuk not <= 1/8 (bukan diam)."""
    pos = 0
    groups, cur, cur_beat = [], [], None
    for n in measure:
        beat = pos // beat_len
        beamable = (not n.rest) and n.base <= 12
        if beamable and (cur_beat is None or beat == cur_beat):
            cur.append(n); cur_beat = beat
        else:
            if len(cur) >= 2:
                groups.append(cur)
            cur, cur_beat = ([n], beat) if beamable else ([], None)
        pos += n.dur
    if len(cur) >= 2:
        groups.append(cur)
    for g in groups:
        for i, n in enumerate(g):
            n.beams[1] = 'begin' if i == 0 else ('end' if i == len(g) - 1 else 'continue')
        # tingkat 2 (1/16)
        lvl2 = [n.base <= 6 for n in g]
        i = 0
        while i < len(g):
            if not lvl2[i]:
                i += 1; continue
            j = i
            while j + 1 < len(g) and lvl2[j + 1]:
                j += 1
            if j > i:
                for k in range(i, j + 1):
                    g[k].beams[2] = 'begin' if k == i else ('end' if k == j else 'continue')
            else:
                g[i].beams[2] = 'forward hook' if i == 0 else 'backward hook'
            i = j + 1


def accidental_display(measures, fifths):
    """Tentukan tanda kromatis yang tercetak (aturan standar: berlaku sampai akhir birama)."""
    for m in measures:
        state = {}
        for n in m:
            for idx, (s, a, o) in enumerate(n.pitches):
                key = (s, o)
                cur = state.get(key, key_alter(s, fifths))
                if n.tie_stop:
                    state[key] = a
                    continue
                if a != cur:
                    n.acc_print[idx] = {1: 'sharp', -1: 'flat', 0: 'natural', 2: 'double-sharp', -2: 'flat-flat'}[a]
                    state[key] = a


def note_xml(n, staff, voice, chord, idx, pitch):
    x = ['<note>']
    if chord:
        x.append('<chord/>')
    if n.rest:
        x.append('<rest/>')
    else:
        s, a, o = pitch
        x.append(f'<pitch><step>{s}</step>' + (f'<alter>{a}</alter>' if a else '') + f'<octave>{o}</octave></pitch>')
    x.append(f'<duration>{n.dur}</duration>')
    if not n.rest:
        if n.tie_stop:
            x.append('<tie type="stop"/>')
        if n.tie_start:
            x.append('<tie type="start"/>')
    x.append(f'<voice>{voice}</voice>')
    typ, dots = TYPES[n.base]
    x.append(f'<type>{typ}</type>' + '<dot/>' * dots)
    if not n.rest and idx in n.acc_print:
        x.append(f'<accidental>{n.acc_print[idx]}</accidental>')
    if n.triplet:
        x.append('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>')
    x.append(f'<staff>{staff}</staff>')
    if not chord:
        for lvl in sorted(n.beams):
            x.append(f'<beam number="{lvl}">{n.beams[lvl]}</beam>')
    notations = []
    if not n.rest:
        if n.tie_stop:
            notations.append('<tied type="stop"/>')
        if n.tie_start:
            notations.append('<tied type="start"/>')
    if not chord and n.triplet in ('start', 'stop'):
        notations.append(f'<tuplet type="{n.triplet}" bracket="no" show-number="actual"/>')
    if notations:
        x.append('<notations>' + ''.join(notations) + '</notations>')
    x.append('</note>')
    return ''.join(x)


def piece(rng, idx):
    fifths = rng.randint(-5, 5)
    mode = rng.choice(['major', 'major', 'minor'])
    beats, beat_type = rng.choice([(4, 4), (4, 4), (3, 4), (2, 4), (6, 8)])
    meas_len = beats * 96 // beat_type
    beat_len = 36 if beat_type == 8 else 24
    n_meas = rng.randint(12, 28)
    level = rng.random()
    rh = build_staff(rng, n_meas, meas_len, beat_len, fifths, dia('E', 4) - 1, dia('A', 5) + (3 if level > .6 else 0),
                     'busy' if level > .5 else 'plain', 0.18 if level > .3 else 0.05, 0.06, 0.07 if level > .4 else 0.02,
                     level > .55, 0.12)
    lh_style = rng.choice(['block', 'alberti', 'long'])
    if lh_style == 'long':
        lh = build_staff(rng, n_meas, meas_len, beat_len, fifths, dia('E', 2), dia('C', 4), 'plain', 0.35, 0.04, 0.02, False, 0.15)
        for m in lh:  # lebih banyak not panjang
            pass
    else:
        lh = build_staff(rng, n_meas, meas_len, beat_len, fifths, dia('F', 2), dia('D', 4),
                         'busy' if lh_style == 'alberti' else 'plain', 0.4 if lh_style == 'block' else 0.08, 0.05, 0.03, False, 0.1)
    for staff in (rh, lh):
        for m in staff:
            assign_beams(m, beat_len)
        accidental_display(staff, fifths)
    title = f'Uji Piano {idx + 1}'
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<score-partwise version="3.1">',
           f'<work><work-title>{title}</work-title></work>',
           '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">']
    for mi in range(n_meas):
        out.append(f'<measure number="{mi + 1}">')
        if mi == 0:
            out.append(f'<attributes><divisions>{DIV}</divisions><key><fifths>{fifths}</fifths><mode>{mode}</mode></key>'
                       f'<time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time><staves>2</staves>'
                       '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>')
        for si, (staff, voice) in enumerate(((rh, 1), (lh, 5))):
            if si == 1:
                out.append(f'<backup><duration>{meas_len}</duration></backup>')
            for n in staff[mi]:
                if n.rest:
                    out.append(note_xml(n, si + 1, voice, False, 0, None))
                else:
                    for k, p in enumerate(n.pitches):
                        out.append(note_xml(n, si + 1, voice, k > 0, k, p))
        if mi == n_meas - 1:
            out.append('<barline location="right"><bar-style>light-heavy</bar-style></barline>')
        out.append('</measure>')
    out.append('</part></score-partwise>')
    meta = dict(fifths=fifths, mode=mode, beats=beats, beatType=beat_type, measures=n_meas, lh=lh_style, level=round(level, 2))
    return '\n'.join(out), meta


def main():
    out_dir, n = sys.argv[1], int(sys.argv[2])
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 7
    rng = random.Random(seed)
    os.makedirs(out_dir, exist_ok=True)
    metas = {}
    for i in range(n):
        xml, meta = piece(rng, i)
        name = f'p{i + 1:03d}'
        with open(os.path.join(out_dir, name + '.musicxml'), 'w') as f:
            f.write(xml)
        metas[name] = meta
    with open(os.path.join(out_dir, 'meta.json'), 'w') as f:
        json.dump(metas, f, indent=1)
    print('ok', n)


if __name__ == '__main__':
    main()
