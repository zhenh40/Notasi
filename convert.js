/* ==========================================================================
   NOTASI — convert.js
   Model skor (musicxml.js) -> model tata letak not angka + harmoni.
   ========================================================================== */
(function (root) {
  'use strict';
  const T = root.NotasiTheory;
  const H = root.NotasiHarmony;
  const { Frac, ZERO } = T;

  function lineKey(pi, staff, voice) { return pi + '|' + staff + '|' + voice; }

  function convert(score, opts = {}) {
    const minorMode = opts.minorMode || 'la';
    const harmonyMode = opts.harmonyMode || 'auto';

    /* ----- 1. Kumpulkan baris (part / paranada / suara) ----- */
    const lineMap = new Map();
    score.parts.forEach((p, pi) => {
      p.measures.forEach(m => m.events.forEach(ev => {
        if (ev.hidden && ev.rest) return;
        const k = lineKey(pi, ev.staff, ev.voice);
        if (!lineMap.has(k)) lineMap.set(k, { key: k, pi, staff: ev.staff, voice: ev.voice, pitches: [], count: 0 });
        const L = lineMap.get(k);
        if (!ev.rest) { L.count++; for (const pt of ev.pitches) if (!pt.unpitched) L.pitches.push(pt); }
      }));
    });
    let lines = Array.from(lineMap.values()).filter(l => l.count > 0);
    lines.sort((a, b) => a.pi - b.pi || a.staff - b.staff || (Number(a.voice) || 0) - (Number(b.voice) || 0) || String(a.voice).localeCompare(String(b.voice)));
    const firstKey = score.measureInfo[0].key;
    const firstTonic = T.doTonic(firstKey, minorMode);
    lines.forEach((l, idx) => {
      const part = score.parts[l.pi];
      const sameStaffVoices = lines.filter(o => o.pi === l.pi && o.staff === l.staff).length;
      const multiPart = score.parts.length > 1;
      let label = multiPart || part.staves > 1 ? part.name : (part.name || 'Melodi');
      if (part.staves === 2) label += l.staff === 1 ? ' · tangan kanan' : ' · tangan kiri';
      else if (part.staves > 1) label += ' · paranada ' + l.staff;
      if (sameStaffVoices > 1) label += ' · suara ' + l.voice;
      l.label = label;
      l.index = idx;
      const pKey0 = (part.measures[0] && part.measures[0].key) || firstKey;
      l.tonic = T.doTonic(pKey0, minorMode);
      l.doLabel = T.pitchName(l.tonic.step, l.tonic.alter);
      l.refOctave = T.bestRefOctave(l.pitches, l.tonic);
      l.maxStack = 1;
      l.verses = new Set();
      l.clef = part.clefs[String(l.staff)] || 'G2';
    });
    const lineIndex = new Map(lines.map(l => [l.key, l]));

    /* ----- 2. Harmoni ----- */
    const hasScoreHarmony = score.parts.some(p => p.measures.some(m => m.harmonies.length));
    const useScore = harmonyMode === 'score' || (harmonyMode === 'auto' && hasScoreHarmony);
    let chordsByMeasure = score.measureInfo.map(() => []);
    if (harmonyMode !== 'off') {
      if (useScore) {
        score.measureInfo.forEach((mi, i) => {
          const seen = new Set();
          for (const p of score.parts) {
            const m = p.measures[i]; if (!m) continue;
            for (const h of m.harmonies) {
              const pos = h.pos.add(mi.shift);
              const k = pos.toString(); if (seen.has(k)) continue; seen.add(k);
              chordsByMeasure[i].push({ pos, chord: H.fromScore(h) });
            }
          }
          chordsByMeasure[i].sort((a, b) => a.pos.cmp(b.pos));
        });
      } else {
        // Nada lewat/tetangga (didekati & ditinggalkan melangkah) diberi bobot lebih kecil
        const passing = new Set();
        score.parts.forEach((p, pi) => {
          const seqs = {};
          p.measures.forEach(m => m.events.forEach(ev => {
            const k = ev.staff + '|' + ev.voice;
            (seqs[k] = seqs[k] || []).push(ev);
          }));
          for (const k in seqs) {
            const seq = seqs[k];
            for (let j = 1; j < seq.length - 1; j++) {
              const a = seq[j - 1], b = seq[j], c = seq[j + 1];
              if (a.rest || b.rest || c.rest || b.pitches.length !== 1 || !a.pitches.length || !c.pitches.length) continue;
              const top = (ev) => Math.max(...ev.pitches.map(T.midiOf));
              const d1 = top(b) - top(a), d2 = top(c) - top(b);
              if (d1 !== 0 && d2 !== 0 && Math.abs(d1) <= 2 && Math.abs(d2) <= 2 && !b.dur.gt(new Frac(1))) passing.add(b);
            }
          }
        });
        const notesByMeasure = score.measureInfo.map((mi, i) => {
          const arr = [];
          score.parts.forEach((p, pi) => {
            const m = p.measures[i]; if (!m) return;
            for (const ev of m.events) {
              if (ev.rest || ev.hidden) continue;
              const s = ev.start.add(mi.shift);
              for (const pt of ev.pitches) {
                if (pt.unpitched) continue;
                arr.push({ start: s, end: s.add(ev.dur), pc: T.pcOf(pt.step, pt.alter), midi: T.midiOf(pt), step: pt.step, alter: pt.alter || 0, line: lineKey(pi, ev.staff, ev.voice), passing: passing.has(ev) });
              }
            }
          });
          return arr;
        });
        chordsByMeasure = H.analyze(score.measureInfo, notesByMeasure);
      }
    }

    /* ----- 3. Birama -> sel ketukan -> token ----- */
    const measures = score.measureInfo.map((mi, i) => {
      const key = mi.key;
      const tonic = T.doTonic(key, minorMode);
      const total = mi.shift.add(mi.length);
      const nBeats = Math.max(1, total.ceil());
      const cells = {}; // lineKey -> array[nBeats] of tokens[]
      lines.forEach(l => { cells[l.key] = null; });

      score.parts.forEach((p, pi) => {
        const m = p.measures[i]; if (!m) return;
        // tiap part memakai tanda kuncinya sendiri (mis. alat musik transposisi / partitur lama)
        const pKey = m.key || key;
        const pTonic = T.doTonic(pKey, minorMode);
        // kelompok triol per suara
        const lastTupletByVoice = {};
        for (const ev of m.events) {
          const L = lineIndex.get(lineKey(pi, ev.staff, ev.voice));
          if (!L) continue;
          if (!cells[L.key]) cells[L.key] = Array.from({ length: nBeats }, () => []);
          if (ev.hidden) continue;
          const s = ev.start.add(mi.shift);
          const abs = mi.absStart.add(ev.start);
          const numbers = ev.rest ? [] : ev.pitches.filter(pt => !pt.unpitched)
            .slice().sort((a, b) => T.midiOf(b) - T.midiOf(a))
            .map(pt => Object.assign(T.toNumber(pt, pKey, pTonic, L.refOctave), { midi: T.midiOf(pt), name: T.pitchName(pt.step, pt.alter) + pt.octave, pt }));
          if (numbers.length > L.maxStack) L.maxStack = numbers.length;
          const allTieStop = !ev.rest && ev.pitches.length > 0 && ev.pitches.every(pt => pt.tieStop);
          ev.lyrics.forEach(ly => L.verses.add(ly.number));

          let chunks;
          let tupletLabel = null;
          const vKey = ev.staff + '|' + ev.voice;
          if (ev.tuplet) {
            const ul = T.TYPE_UNDERLINES[ev.type] ?? 1;
            chunks = [{ start: s, dur: ev.dur, underlines: ul }];
            const startsGroup = ev.tuplet.marks.includes('start') || (!ev.tuplet.marks.length && !lastTupletByVoice[vKey]);
            if (startsGroup) tupletLabel = String(ev.tuplet.actual);
            lastTupletByVoice[vKey] = !ev.tuplet.marks.includes('stop');
          } else {
            lastTupletByVoice[vKey] = false;
            chunks = T.chunkDuration(s, ev.dur);
          }
          chunks.forEach((c, ci) => {
            let kind;
            if (ev.rest) kind = 'rest';
            else if (ci > 0 || allTieStop) kind = 'hold';
            else kind = 'note';
            const beat = Math.min(nBeats - 1, c.start.floor());
            cells[L.key][beat].push({
              kind, start: c.start, abs: abs.add(c.start.sub(s)), dur: c.dur, underlines: c.underlines, ev, pi, mIndex: i,
              numbers: kind === 'note' ? numbers : (kind === 'hold' ? numbers : []),
              lyrics: ci === 0 && kind === 'note' ? ev.lyrics : [],
              tuplet: ci === 0 ? tupletLabel : null,
              fermata: ci === chunks.length - 1 && ev.fermata,
              soundDur: ev.dur, tieStart: !ev.rest && ev.pitches.some(pt => pt.tieStart), tieCont: ci === 0 && allTieStop,
              line: L.key
            });
          });
        }
      });
      for (const k in cells) if (cells[k]) cells[k].forEach(arr => arr.sort((a, b) => a.start.cmp(b.start)));

      const chords = (chordsByMeasure[i] || []).map(({ pos, chord }) => ({
        pos, beat: Math.min(nBeats - 1, Math.max(0, pos.floor())),
        symbol: H.chordSymbol(chord), roman: H.chordRoman(chord, key, tonic), number: H.chordNumber(chord, key, tonic),
        source: chord.source, chord
      }));
      // Periksa ketukan: tiap suara harus genap mengisi birama (kecuali pickup / birama terakhir)
      const rhythmWarn = [];
      score.parts.forEach((p, pi) => {
        const m = p.measures[i]; if (!m) return;
        const ends = {};
        for (const ev of m.events) { const k = ev.staff + '|' + ev.voice; const e = ev.start.add(ev.dur); if (!ends[k] || e.gt(ends[k])) ends[k] = e; }
        for (const k in ends) {
          const full = mi.nominal || mi.length;
          if (ends[k].gt(full) || (ends[k].lt(full) && !mi.pickup && i !== score.measureInfo.length - 1 && k.split('|')[1] === '1')) rhythmWarn.push({ pi, voice: k, end: ends[k], full });
        }
      });
      return {
        rhythmWarn,
        index: i, number: mi.number, nBeats, shift: mi.shift, length: mi.length, pickup: mi.pickup,
        absStart: mi.absStart, key, time: mi.time, tonic, cells, chords,
        keyChange: i > 0 && (mi.key.fifths !== score.measureInfo[i - 1].key.fifths || mi.key.mode !== score.measureInfo[i - 1].key.mode),
        timeChange: i > 0 && (mi.time.beats !== score.measureInfo[i - 1].time.beats || mi.time.beatType !== score.measureInfo[i - 1].time.beatType),
        barRight: (score.parts[0].measures[i] || {}).barRight || null,
        repeatStart: score.parts.some(p => p.measures[i] && p.measures[i].repeatStart),
        repeatEnd: score.parts.some(p => p.measures[i] && p.measures[i].repeatEnd)
      };
    });

    return {
      title: score.title, composer: score.composer, tempo: score.tempo,
      key: firstKey, keyLabel: T.keyTonicName(firstKey), doLabel: T.pitchName(firstTonic.step, firstTonic.alter),
      time: score.measureInfo[0].time, minorMode,
      harmonySource: harmonyMode === 'off' ? 'off' : (useScore ? 'score' : 'analysis'),
      lines: lines.map(l => ({ key: l.key, label: l.label, refOctave: l.refOctave, doLabel: l.doLabel, maxStack: l.maxStack, verses: Array.from(l.verses).sort(), clef: l.clef })),
      measures, totalLength: score.totalLength
    };
  }

  root.NotasiConvert = { convert };
})(typeof window !== 'undefined' ? window : globalThis);
