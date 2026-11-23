/* ==========================================================================
   NOTASI — musicxml.js
   Membaca .musicxml / .xml / .mxl (zip) lalu mengubahnya menjadi model skor
   netral. Tidak ada tebakan di sini: semua nada, durasi, ikatan, triol,
   lirik dan simbol akor diambil persis dari berkas.
   ========================================================================== */
(function (root) {
  'use strict';
  const T = root.NotasiTheory;
  const { Frac, ZERO } = T;

  /* ---------- ZIP (.mxl) minimal, memakai DecompressionStream bawaan browser ---------- */
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum mendukung DecompressionStream. Ekspor sebagai .musicxml (tidak terkompres).');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Berkas .mxl rusak (direktori zip tidak ditemukan).');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commLen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
      const lNameLen = dv.getUint16(local + 26, true);
      const lExtraLen = dv.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      files[name] = { method, data: u8.subarray(start, start + csize) };
      off += 46 + nameLen + extraLen + commLen;
    }
    const read = async (name) => {
      const f = files[name]; if (!f) return null;
      if (f.method === 0) return f.data;
      if (f.method === 8) return inflateRaw(f.data);
      throw new Error('Metode kompresi zip tidak didukung: ' + f.method);
    };
    let target = null;
    if (files['META-INF/container.xml']) {
      const cx = decodeText(await read('META-INF/container.xml'));
      const m = cx.match(/full-path\s*=\s*"([^"]+)"/);
      if (m) target = m[1];
    }
    if (!target) target = Object.keys(files).find(k => !k.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(k));
    if (!target) throw new Error('Tidak ada berkas MusicXML di dalam .mxl.');
    return decodeText(await read(target));
  }

  /** Dekode teks XML dengan deteksi BOM (UTF-8 / UTF-16 LE / UTF-16 BE) */
  function decodeText(u8) {
    if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    if (u8[0] === 0x3c && u8[1] === 0x00) return new TextDecoder('utf-16le').decode(u8);
    if (u8[0] === 0x00 && u8[1] === 0x3c) return new TextDecoder('utf-16be').decode(u8);
    return new TextDecoder('utf-8').decode(u8).replace(/^\uFEFF/, '');
  }

  async function readFile(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return unzip(buf);
    return decodeText(u8);
  }

  /* ---------- Util DOM ---------- */
  const kids = (el, name) => el ? Array.from(el.children).filter(c => c.localName === name) : [];
  const kid = (el, name) => el ? Array.from(el.children).find(c => c.localName === name) || null : null;
  const txt = (el, name, def = null) => { const k = kid(el, name); return k ? k.textContent.trim() : def; };
  const num = (el, name, def = null) => { const v = txt(el, name); return v === null || v === '' ? def : Number(v); };

  /** pecahan dari angka desimal yang mungkin muncul di <duration> (umumnya bilangan bulat) */
  function fracFromNumber(x) {
    if (Number.isInteger(x)) return new Frac(x);
    const d = 10080; // kelipatan 2^5*3^2*5*7: cukup untuk triol/kuintol/septol
    return new Frac(Math.round(x * d), d);
  }

  const KIND_SUFFIX = {
    'major': '', 'minor': 'm', 'augmented': '+', 'diminished': 'dim',
    'dominant': '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7', 'diminished-seventh': 'dim7',
    'augmented-seventh': '+7', 'half-diminished': 'm7♭5', 'major-minor': 'm(maj7)',
    'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9',
    'dominant-11th': '11', 'major-11th': 'maj11', 'minor-11th': 'm11', 'dominant-13th': '13', 'major-13th': 'maj13',
    'minor-13th': 'm13', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', 'power': '5',
    'Neapolitan': 'N6', 'Italian': 'It+6', 'French': 'Fr+6', 'German': 'Ger+6', 'pedal': 'ped', 'other': '', 'none': 'N.C.'
  };
  // kualitas dasar untuk angka romawi
  const KIND_QUALITY = {
    'minor': 'min', 'minor-seventh': 'min', 'minor-sixth': 'min', 'minor-ninth': 'min', 'minor-11th': 'min', 'minor-13th': 'min', 'major-minor': 'min',
    'diminished': 'dim', 'diminished-seventh': 'dim', 'half-diminished': 'hdim', 'augmented': 'aug', 'augmented-seventh': 'aug'
  };

  function parseHarmony(h, pos) {
    const rootEl = kid(h, 'root');
    const kindEl = kid(h, 'kind');
    const kind = kindEl ? kindEl.textContent.trim() : 'major';
    const off = num(h, 'offset', 0);
    const out = {
      pos, offsetDivs: off, source: 'score', kind,
      kindText: kindEl && kindEl.getAttribute('text') !== null ? kindEl.getAttribute('text') : null,
      root: null, bass: null, degrees: []
    };
    if (rootEl) out.root = { step: txt(rootEl, 'root-step'), alter: num(rootEl, 'root-alter', 0) };
    const bassEl = kid(h, 'bass');
    if (bassEl) out.bass = { step: txt(bassEl, 'bass-step'), alter: num(bassEl, 'bass-alter', 0) };
    for (const d of kids(h, 'degree')) {
      out.degrees.push({ value: num(d, 'degree-value', 0), alter: num(d, 'degree-alter', 0), type: txt(d, 'degree-type', 'add') });
    }
    if (!out.root && kind !== 'none') return null; // misal function-only harmony
    return out;
  }

  const ACC_ALTER = { 'sharp': 1, 'flat': -1, 'natural': 0, 'double-sharp': 2, 'sharp-sharp': 2, 'flat-flat': -2, 'double-flat': -2 };

  /* ---------- Parser utama ---------- */
  function parse(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    if (err) throw new Error('XML tidak valid: ' + err.textContent.slice(0, 160));
    const scoreEl = doc.documentElement;
    if (scoreEl.localName === 'score-timewise') throw new Error('Format score-timewise belum didukung. Ekspor ulang sebagai MusicXML biasa (partwise).');
    if (scoreEl.localName !== 'score-partwise') throw new Error('Ini bukan berkas MusicXML (elemen akar: ' + scoreEl.localName + ').');

    const title = txt(kid(scoreEl, 'work'), 'work-title') || txt(scoreEl, 'movement-title') ||
      (Array.from(doc.getElementsByTagName('credit-words')).map(c => c.textContent.trim()).find(Boolean)) || 'Tanpa judul';
    const composer = Array.from(kids(kid(scoreEl, 'identification'), 'creator')).filter(c => c.getAttribute('type') === 'composer').map(c => c.textContent.trim()).join(', ');

    const partNames = {};
    for (const sp of kids(kid(scoreEl, 'part-list'), 'score-part')) partNames[sp.getAttribute('id')] = txt(sp, 'part-name') || sp.getAttribute('id');

    let tempo = null;
    const parts = [];
    for (const partEl of kids(scoreEl, 'part')) {
      const id = partEl.getAttribute('id');
      const part = { id, name: partNames[id] || id, measures: [], staves: 1, clefs: {} };
      let divisions = 1;
      let key = { fifths: 0, mode: 'major' };
      let time = { beats: 4, beatType: 4 };
      let staves = 1;
      const clefs = {};

      for (const mEl of kids(partEl, 'measure')) {
        const measure = { number: mEl.getAttribute('number'), implicit: mEl.getAttribute('implicit') === 'yes', events: [], harmonies: [], keyChanged: false, timeChanged: false, barRight: null, repeatStart: false, repeatEnd: false };
        let cursor = ZERO, maxCursor = ZERO;
        let lastEvent = null;
        const pendingHarm = [];

        for (const el of Array.from(mEl.children)) {
          switch (el.localName) {
            case 'attributes': {
              const dv = num(el, 'divisions'); if (dv) divisions = dv;
              const k = kid(el, 'key');
              if (k && kid(k, 'fifths')) { key = { fifths: num(k, 'fifths', 0), mode: (txt(k, 'mode') || 'major').toLowerCase() === 'minor' ? 'minor' : 'major' }; measure.keyChanged = true; }
              const t = kid(el, 'time');
              if (t && kid(t, 'beats')) {
                const beatsTxt = txt(t, 'beats');
                const beats = beatsTxt.split('+').reduce((a, b) => a + Number(b), 0);
                time = { beats, beatType: num(t, 'beat-type', 4), symbol: t.getAttribute('symbol') || null };
                measure.timeChanged = true;
              }
              const st = num(el, 'staves'); if (st) staves = st;
              for (const c of kids(el, 'clef')) clefs[c.getAttribute('number') || '1'] = (txt(c, 'sign') || 'G') + (txt(c, 'line') || '');
              break;
            }
            case 'sound': if (el.getAttribute('tempo') && !tempo) tempo = Number(el.getAttribute('tempo')); break;
            case 'direction': {
              const s = kid(el, 'sound');
              if (s && s.getAttribute('tempo') && !tempo) tempo = Number(s.getAttribute('tempo'));
              if (!tempo) {
                const met = el.getElementsByTagName('metronome')[0];
                if (met) {
                  const pm = num(met, 'per-minute'); const bu = txt(met, 'beat-unit');
                  const mult = { half: 2, quarter: 1, eighth: 0.5 }[bu] || 1;
                  if (pm) tempo = pm * mult * (kid(met, 'beat-unit-dot') ? 1.5 : 1);
                }
              }
              break;
            }
            case 'harmony': pendingHarm.push(parseHarmony(el, cursor)); break;
            case 'backup': cursor = cursor.sub(fracFromNumber(num(el, 'duration', 0)).div(divisions)); if (cursor.lt(ZERO)) cursor = ZERO; break;
            case 'forward': cursor = cursor.add(fracFromNumber(num(el, 'duration', 0)).div(divisions)); if (cursor.gt(maxCursor)) maxCursor = cursor; break;
            case 'barline': {
              const rep = kid(el, 'repeat');
              if (rep && rep.getAttribute('direction') === 'forward') measure.repeatStart = true;
              if (rep && rep.getAttribute('direction') === 'backward') measure.repeatEnd = true;
              const bs = txt(el, 'bar-style'); if (bs && (el.getAttribute('location') || 'right') === 'right') measure.barRight = bs;
              break;
            }
            case 'note': {
              if (kid(el, 'cue')) {
                // not isyarat (cue) tidak ditampilkan, tetapi tetap memakan waktu
                if (!kid(el, 'chord') && !kid(el, 'grace')) {
                  cursor = cursor.add(fracFromNumber(num(el, 'duration', 0)).div(divisions));
                  if (cursor.gt(maxCursor)) maxCursor = cursor;
                }
                lastEvent = null;
                break;
              }
              const isGrace = !!kid(el, 'grace');
              const isChord = !!kid(el, 'chord');
              const restEl = kid(el, 'rest');
              const pitchEl = kid(el, 'pitch') || kid(el, 'unpitched');
              const durDivs = num(el, 'duration', 0);
              const voice = txt(el, 'voice', '1');
              const staff = num(el, 'staff', 1);
              const type = txt(el, 'type');
              const dots = kids(el, 'dot').length;
              const tm = kid(el, 'time-modification');
              const ties = kids(el, 'tie').map(t => t.getAttribute('type'));
              const notations = kid(el, 'notations');
              const tiedEls = notations ? kids(notations, 'tied').map(t => t.getAttribute('type')) : [];
              const tieStart = ties.includes('start') || tiedEls.includes('start');
              const tieStop = ties.includes('stop') || tiedEls.includes('stop');
              const tupletMarks = notations ? kids(notations, 'tuplet').map(t => t.getAttribute('type')) : [];
              const fermata = notations ? !!kid(notations, 'fermata') : false;
              const lyrics = kids(el, 'lyric').map(l => ({
                number: l.getAttribute('number') || '1',
                text: kids(l, 'text').map(t => t.textContent).join(''),
                syllabic: txt(l, 'syllabic', 'single'),
                extend: !!kid(l, 'extend')
              })).filter(l => l.text);

              if (isGrace) break; // not hias tidak memiliki nilai ketukan

              let pitch = null;
              if (pitchEl && pitchEl.localName === 'pitch') {
                let alter = num(pitchEl, 'alter', null);
                if (alter === null) {
                  // <alter> tidak ada tetapi tanda kromatis tercetak: ikuti yang terlihat di partitur
                  const acc = txt(el, 'accidental');
                  alter = ACC_ALTER[acc] ?? 0;
                }
                pitch = { step: txt(pitchEl, 'step'), alter: Math.round(alter), octave: num(pitchEl, 'octave', 4), tieStart, tieStop };
              }
              else if (pitchEl) pitch = { step: txt(pitchEl, 'display-step') || 'B', alter: 0, octave: num(pitchEl, 'display-octave', 4), tieStart, tieStop, unpitched: true };

              if (isChord && lastEvent) {
                if (pitch) lastEvent.pitches.push(pitch);
                for (const ly of lyrics) if (!lastEvent.lyrics.find(x => x.number === ly.number)) lastEvent.lyrics.push(ly);
                break;
              }
              const dur = fracFromNumber(durDivs).div(divisions);
              const ev = {
                start: cursor, dur, voice, staff, type, dots,
                rest: !!restEl, measureRest: !!(restEl && restEl.getAttribute('measure') === 'yes'),
                hidden: el.getAttribute('print-object') === 'no',
                pitches: pitch ? [pitch] : [],
                tuplet: tm ? { actual: num(tm, 'actual-notes', 3), normal: num(tm, 'normal-notes', 2), marks: tupletMarks } : null,
                lyrics, fermata
              };
              measure.events.push(ev);
              lastEvent = ev;
              cursor = cursor.add(dur);
              if (cursor.gt(maxCursor)) maxCursor = cursor;
              break;
            }
          }
        }
        // posisi harmoni: posisi kursor + offset
        for (const h of pendingHarm) {
          if (!h) continue;
          h.pos = h.pos.add(fracFromNumber(h.offsetDivs || 0).div(divisions));
          measure.harmonies.push(h);
        }
        const nominal = new Frac(time.beats * 4, time.beatType);
        measure.key = { ...key };
        measure.time = { ...time };
        measure.nominal = nominal;
        measure.length = maxCursor.isZero() ? nominal : maxCursor;
        // Not yang ditandai measure-rest mengambil panjang birama penuh
        for (const ev of measure.events) if (ev.measureRest && ev.dur.isZero()) ev.dur = nominal;
        part.measures.push(measure);
      }
      part.staves = staves;
      part.clefs = { ...clefs };
      parts.push(part);
    }
    if (!parts.length || !parts[0].measures.length) throw new Error('Berkas tidak berisi birama.');

    const score = { title, composer, tempo: tempo || 90, parts, KIND_SUFFIX, KIND_QUALITY };
    finalize(score);
    return score;
  }

  /**
   * Menyelaraskan panjang birama antarpart dan menggeser birama pickup.
   * Dipanggil lagi setelah koreksi manual (mode periksa).
   */
  function finalize(score) {
    const parts = score.parts;
    const nMeasures = Math.max(...parts.map(p => p.measures.length));
    const measureInfo = [];
    let absStart = ZERO;
    for (let i = 0; i < nMeasures; i++) {
      let len = ZERO, nominal = null, implicit = false, key = null, time = null;
      for (const p of parts) {
        const m = p.measures[i]; if (!m) continue;
        if (m.length.gt(len)) len = m.length;
        nominal = nominal || m.nominal; implicit = implicit || m.implicit; key = key || m.key; time = time || m.time;
      }
      // Pickup: birama implisit/pertama yang lebih pendek dari tanda birama -> rata kanan
      const isPickup = len.lt(nominal) && (implicit || i === 0);
      const shift = isPickup ? nominal.sub(len) : ZERO;
      for (const p of parts) {
        const m = p.measures[i]; if (!m) continue;
        m.shift = shift;
        m.pickup = isPickup;
      }
      measureInfo.push({ index: i, length: len, nominal, shift, pickup: isPickup, key, time, absStart, number: (parts[0].measures[i] || {}).number });
      absStart = absStart.add(len);
    }
    score.measureInfo = measureInfo;
    score.totalLength = absStart;
    return score;
  }

  /** Setelah durasi sebuah not diubah: geser not berikutnya di suara yang sama, hitung ulang panjang birama. */
  function relayoutMeasure(measure, voiceKey, fromEv, delta) {
    for (const ev of measure.events) {
      if (ev === fromEv) continue;
      if ((ev.staff + '|' + ev.voice) === voiceKey && ev.start.gt(fromEv.start)) ev.start = ev.start.add(delta);
    }
    let end = ZERO;
    for (const ev of measure.events) { const e = ev.start.add(ev.dur); if (e.gt(end)) end = e; }
    measure.length = end.gt(measure.nominal) || measure.implicit ? end : measure.nominal;
    if (end.isZero()) measure.length = measure.nominal;
  }

  root.NotasiMusicXML = { readFile, parse, unzip, finalize, relayoutMeasure, KIND_SUFFIX, KIND_QUALITY };
})(typeof window !== 'undefined' ? window : globalThis);
