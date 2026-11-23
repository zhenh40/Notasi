/* ==========================================================================
   NOTASI — demo.js
   Partitur demo orisinal "Senja di Pelabuhan" dibangun sebagai MusicXML asli
   lalu diproses lewat parser yang sama dengan berkas unggahan.
   Format token ringkas:  NADA[:DURASI][flag]
     NADA   : r (diam) | G4 | F#5 | Bb3 | G3+B3+D4 (akor)
     DURASI : w h q e s (+ '.' bertitik)
     flag   : ~ ikat ke not berikutnya, 3 = triol
   ========================================================================== */
(function (root) {
  'use strict';
  const DIV = 24;
  const BASE = { w: 96, h: 48, q: 24, e: 12, s: 6 };
  const TYPE = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: '16th' };

  function parseTok(tok) {
    const m = tok.match(/^([^:]+):([whqes])(\.?)(~?)(3?)$/);
    if (!m) throw new Error('Token demo salah: ' + tok);
    const [, p, d, dot, tie, trip] = m;
    let dur = BASE[d] * (dot ? 1.5 : 1);
    if (trip) dur = dur * 2 / 3;
    const pitches = p === 'r' ? null : p.split('+').map(s => {
      const mm = s.match(/^([A-G])(#|b)?(\d)$/);
      return { step: mm[1], alter: mm[2] === '#' ? 1 : mm[2] === 'b' ? -1 : 0, octave: Number(mm[3]) };
    });
    return { pitches, dur, type: TYPE[d], dot: !!dot, tie: !!tie, trip: !!trip };
  }

  function buildXML(spec) {
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<score-partwise version="3.1">');
    out.push(`<work><work-title>${spec.title}</work-title></work>`);
    out.push(`<identification><creator type="composer">${spec.composer}</creator></identification>`);
    out.push('<part-list>' + spec.parts.map((p, i) => `<score-part id="P${i + 1}"><part-name>${p.name}</part-name></score-part>`).join('') + '</part-list>');
    spec.parts.forEach((part, pi) => {
      out.push(`<part id="P${pi + 1}">`);
      let tieOpen = false, tripCount = 0;
      part.measures.forEach((mstr, mi) => {
        out.push(`<measure number="${mi + 1}">`);
        if (mi === 0) {
          out.push(`<attributes><divisions>${DIV}</divisions><key><fifths>${spec.fifths}</fifths><mode>${spec.mode}</mode></key><time><beats>${spec.beats}</beats><beat-type>${spec.beatType}</beat-type></time><clef><sign>${part.clef[0]}</sign><line>${part.clef[1]}</line></clef></attributes>`);
          if (pi === 0) out.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${spec.tempo}</per-minute></metronome></direction-type><sound tempo="${spec.tempo}"/></direction>`);
        }
        const lyr = (part.lyrics && part.lyrics[mi]) ? part.lyrics[mi].split(/\s+/).filter(Boolean) : [];
        let li = 0;
        for (const raw of mstr.trim().split(/\s+/)) {
          const t = parseTok(raw);
          const stop = tieOpen;
          tieOpen = t.tie;
          const notes = t.pitches || [null];
          let tupMark = '';
          if (t.trip) { tripCount++; if (tripCount === 1) tupMark = '<tuplet type="start" bracket="yes"/>'; if (tripCount === 3) { tupMark = '<tuplet type="stop"/>'; tripCount = 0; } }
          let lyricXml = '';
          if (t.pitches && !stop && li < lyr.length) {
            const w = lyr[li++];
            const begin = w.endsWith('-'), cont = w.startsWith('-');
            const syl = begin && cont ? 'middle' : begin ? 'begin' : cont ? 'end' : 'single';
            lyricXml = `<lyric number="1"><syllabic>${syl}</syllabic><text>${w.replace(/^-|-$/g, '')}</text></lyric>`;
          }
          notes.forEach((p, k) => {
            const ties = (stop ? '<tie type="stop"/>' : '') + (t.tie ? '<tie type="start"/>' : '');
            const tieds = (stop ? '<tied type="stop"/>' : '') + (t.tie ? '<tied type="start"/>' : '');
            out.push('<note>' + (k > 0 ? '<chord/>' : '') +
              (p ? `<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>` : '<rest/>') +
              `<duration>${t.dur}</duration>${p ? ties : ''}<voice>1</voice><type>${t.type}</type>${t.dot ? '<dot/>' : ''}` +
              (t.trip ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' : '') +
              ((p && tieds) || (k === 0 && tupMark) ? `<notations>${p ? tieds : ''}${k === 0 ? tupMark : ''}</notations>` : '') +
              (k === 0 ? lyricXml : '') + '</note>');
          });
        }
        if (mi === part.measures.length - 1) out.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
        out.push('</measure>');
      });
      out.push('</part>');
    });
    out.push('</score-partwise>');
    return out.join('\n');
  }

  const SENJA = {
    title: 'Senja di Pelabuhan', composer: 'Demo NOTASI', fifths: 1, mode: 'major', beats: 4, beatType: 4, tempo: 84,
    parts: [
      {
        name: 'Vokal', clef: ['G', 2],
        measures: [
          'D5:q. B4:e G4:q A4:e B4:e',
          'G4:q. F#4:s E4:s E4:h',
          'E5:e D5:e C5:e B4:e A4:q G4:q',
          'F#4:q A4:e C5:e D5:h~',
          'D5:q C#5:e B4:e A4:q E5:q',
          'F#5:e. E5:s D5:e A4:e B4:e3 A4:e3 G4:e3 F#4:q',
          'C5:q A4:e F4:e F#4:e A4:e C5:q',
          'B4:q A4:e G4:e~ G4:h'
        ],
        lyrics: [
          'Sen- -ja tu- -run per-', '-la- -han di ma-', '-ta a- -ir yang te- -nang', 'ca- -ha- -ya- -ku',
          'ber- -la- -yar pu-', '-lang ke da- -lam i- -ra- -ma- -nya', 'rin- -du ber- -nya- -nyi- -lah', 'pa- -da- -ku'
        ]
      },
      {
        name: 'Iringan', clef: ['F', 4],
        measures: [
          'G2:h D3:h',
          'E2:h B2:h',
          'C3:h G2:h',
          'D3:q F#3+C4:q D3:q F#3+C4:q',
          'A2:q E3+G3:q A2:q E3+G3+C#4:q',
          'D3:h A2:h',
          'F2+C3:h D2+C3:h',
          'G2+D3:w'
        ]
      }
    ]
  };

  root.NotasiDemo = { xml: () => buildXML(SENJA), buildXML };
})(typeof window !== 'undefined' ? window : globalThis);
