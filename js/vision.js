/* ==========================================================================
   NOTASI — vision.js
   Foto/scan partitur piano (JPG/PNG) -> transkripsi oleh Claude (penglihatan)
   -> MusicXML piano 2 paranada -> pipeline NOTASI yang sama.

   Claude hanya diminta MENYALIN apa yang tercetak (huruf, oktaf, tanda yang
   tertulis, durasi). Aturan musik yang pasti — tanda kunci, tanda kromatis
   yang berlaku sampai akhir birama, ikatan lintas birama — dihitung di sini
   secara deterministik, bukan ditebak.
   ========================================================================== */
(function (root) {
  'use strict';
  const T = root.NotasiTheory;

  const DIV = 24; // per not 1/4
  const BASE = { w: 96, h: 48, q: 24, e: 12, s: 6, t: 3 };
  const TYPE = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: '16th', t: '32nd' };
  const ACC = { '#': 1, 'b': -1, 'n': 0, 'x': 2, '##': 2, 'bb': -2 };

  const PROMPT = `You are a meticulous optical music recognition (OMR) engine. The attached image(s) show printed PIANO sheet music (grand staff: treble staff = right hand "rh", bass staff = left hand "lh"). If there are several images, they are consecutive pages in order.

Transcribe EVERY measure exactly as printed, system by system, left to right. Do not simplify, do not "correct" the composer, do not invent anything that is not printed. Count measures carefully: one object per measure, including an incomplete pickup measure at the start if there is one.

Return ONLY a JSON object, no prose, no code fences:
{
  "title": string (printed title, or ""),
  "fifths": integer -7..7 (key signature: number of sharps, negative = number of flats),
  "mode": "major" | "minor" (your best judgement from the music),
  "beats": integer, "beatType": integer (time signature; common time = 4/4, cut time = 2/2),
  "tempo": integer quarter-notes per minute if printed, otherwise 0,
  "measures": [ { "rh": string, "lh": string } ]
}
A measure may also carry "fifths", "beats", "beatType" when the key or time signature CHANGES at that measure.

Token grammar for "rh" and "lh": events in time order, separated by single spaces.
  EVENT   = NOTES ":" DUR [ "." ] [ "~" ] [ "3" ]
  NOTES   = "r" (rest) | "R" (whole-measure rest, write it as "R:w") | PITCH ( "+" PITCH )*   (simultaneous notes = chord)
  PITCH   = LETTER [ SIGN ] OCTAVE
  LETTER  = A B C D E F G
  SIGN    = ONLY an accidental sign that is PRINTED right in front of this notehead: "#" sharp, "b" flat, "n" natural, "x" double sharp, "bb" double flat. Do NOT write signs that come from the key signature or from an earlier accidental in the measure — those are applied automatically.
  OCTAVE  = scientific pitch octave, middle C = C4 (treble staff bottom line = E4, bass staff top line = A3). Watch ledger lines, 8va marks and clef changes.
  DUR     = w whole, h half, q quarter, e eighth, s sixteenth, t thirty-second
  "."     = dotted;  "~" = tied to the next note of the same pitch;  "3" = member of a triplet (write the printed note value, e.g. three triplet eighths = "C5:e3 D5:e3 E5:e3")
Examples: "C5:q E5+G5:e. F#5:s R:w"  ·  "C3+G3:h r:q G2:q"
If a staff has two voices with different rhythms, write the upper voice for rh / the main voice for lh, and merge notes into chords only where they start together with the same duration. Ignore grace notes, fingering, dynamics, pedal marks and lyrics. Write repeated sections once, as printed. Each staff's durations in a full measure must add up exactly to the time signature.`;

  /* ---------- pecah token ---------- */
  function parseToken(tok) {
    const m = tok.match(/^([^:]+):([whqest])(\.?)(~?)(3?)$/);
    if (!m) return null;
    const [, notes, d, dot, tie, trip] = m;
    if (notes === 'R') return { measureRest: true };
    let pitches = null;
    if (notes !== 'r') {
      pitches = [];
      for (const s of notes.split('+')) {
        const pm = s.match(/^([A-G])(##|bb|#|b|n|x)?(\d)$/);
        if (!pm) return null;
        pitches.push({ step: pm[1], sign: pm[2] ?? null, octave: Number(pm[3]) });
      }
    }
    let dur = BASE[d] * (dot ? 1.5 : 1);
    if (trip) dur = dur * 2 / 3;
    return { pitches, dur, type: TYPE[d], dot: !!dot, tie: !!tie, trip: !!trip };
  }

  const esc = s => String(s).replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' })[c]);

  /**
   * JSON transkripsi -> MusicXML (satu part piano, 2 paranada).
   * Tanda kromatis: tertulis > berlaku sampai akhir birama (per huruf+oktaf, per paranada) > tanda kunci.
   */
  function buildPianoXML(data) {
    const problems = [];
    let fifths = T.clampFifths(Number(data.fifths) || 0);
    let mode = data.mode === 'minor' ? 'minor' : 'major';
    let beats = Number(data.beats) || 4, beatType = Number(data.beatType) || 4;
    const tempo = Number(data.tempo) > 0 ? Math.round(Number(data.tempo)) : 90;
    const measures = Array.isArray(data.measures) ? data.measures : [];
    if (!measures.length) throw new Error('Tidak ada birama yang terbaca dari gambar.');

    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<score-partwise version="3.1">');
    out.push(`<work><work-title>${esc(data.title || 'Partitur dari gambar')}</work-title></work>`);
    out.push('<identification><creator type="composer"></creator></identification>');
    out.push('<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">');

    // ikatan lintas birama: alterasi not yang diikat terbawa ke birama berikutnya
    const tieCarry = { 1: {}, 2: {} };

    measures.forEach((m, mi) => {
      const changed = mi === 0 || m.fifths !== undefined || m.beats !== undefined;
      if (m.fifths !== undefined) fifths = T.clampFifths(Number(m.fifths) || 0);
      if (m.beats !== undefined) beats = Number(m.beats) || beats;
      if (m.beatType !== undefined) beatType = Number(m.beatType) || beatType;
      const full = beats * 96 / beatType;
      out.push(`<measure number="${mi + 1}"${mi === 0 ? '' : ''}>`);
      if (changed) {
        out.push(`<attributes>${mi === 0 ? `<divisions>${DIV}</divisions>` : ''}<key><fifths>${fifths}</fifths><mode>${mode}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>${mi === 0 ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>' : ''}</attributes>`);
        if (mi === 0) out.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>`);
      }
      let staff1Len = 0;
      [['rh', 1, '1'], ['lh', 2, '5']].forEach(([field, staff, voice], si) => {
        const raw = typeof m[field] === 'string' ? m[field].trim() : '';
        if (si === 1 && staff1Len > 0) out.push(`<backup><duration>${staff1Len}</duration></backup>`);
        const measAcc = {};             // "C4" -> alter yang berlaku di birama ini
        const prevTies = tieCarry[staff];
        const nextTies = {};
        let len = 0, tripCount = 0, prevTie = {};
        if (!raw) {
          out.push(`<note><rest measure="yes"/><duration>${full}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`);
          len = full;
        }
        for (const tok of raw ? raw.split(/\s+/) : []) {
          const t = parseToken(tok);
          if (!t) { problems.push(`birama ${mi + 1} (${field === 'rh' ? 'tangan kanan' : 'tangan kiri'}): token "${tok}" tidak dikenali, dilewati`); continue; }
          if (t.measureRest) {
            out.push(`<note><rest measure="yes"/><duration>${full}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`);
            len += full; continue;
          }
          let tupMark = '';
          if (t.trip) { tripCount++; if (tripCount === 1) tupMark = '<tuplet type="start"/>'; if (tripCount === 3) { tupMark = '<tuplet type="stop"/>'; tripCount = 0; } } else tripCount = 0;
          const notes = t.pitches || [null];
          const thisTie = {};
          notes.forEach((p, k) => {
            let pitchXml = '<rest/>', ties = '', tieds = '';
            if (p) {
              const id = p.step + p.octave;
              let alter;
              if (p.sign !== null) { alter = ACC[p.sign]; measAcc[id] = alter; }
              else if (id in measAcc) alter = measAcc[id];
              else if (prevTie[id] !== undefined) alter = prevTie[id];
              else if (len === 0 && prevTies[id] !== undefined) alter = prevTies[id];
              else alter = T.keyAlter(p.step, fifths);
              const stop = prevTie[id] !== undefined || (len === 0 && prevTies[id] !== undefined && !(id in prevTie));
              if (t.tie) thisTie[id] = alter;
              pitchXml = `<pitch><step>${p.step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`;
              ties = (stop ? '<tie type="stop"/>' : '') + (t.tie ? '<tie type="start"/>' : '');
              tieds = (stop ? '<tied type="stop"/>' : '') + (t.tie ? '<tied type="start"/>' : '');
            }
            const notations = (tieds || (k === 0 && tupMark)) ? `<notations>${tieds}${k === 0 ? tupMark : ''}</notations>` : '';
            out.push('<note>' + (k > 0 ? '<chord/>' : '') + pitchXml + `<duration>${t.dur}</duration>${ties}<voice>${voice}</voice><type>${t.type}</type>${t.dot ? '<dot/>' : ''}` +
              (t.trip ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' : '') +
              `<staff>${staff}</staff>${notations}</note>`);
          });
          // ikatan berakhir di event berikutnya
          if (Object.keys(prevTie).length && len > 0) { /* sudah dipakai */ }
          prevTie = thisTie;
          len += t.dur;
        }
        Object.assign(nextTies, prevTie);
        tieCarry[staff] = nextTies;
        if (si === 0) staff1Len = len;
      });
      if (mi === measures.length - 1) out.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
      out.push('</measure>');
    });
    out.push('</part></score-partwise>');
    return { xml: out.join('\n'), problems };
  }

  /* ---------- gambar -> blob yang ramah ukuran ---------- */
  async function prepareImage(file, maxSide = 2400) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 4.5 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
  }

  function extractJSON(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('Jawaban pembaca gambar tidak berisi data partitur.');
    return JSON.parse(text.slice(a, b + 1));
  }

  let samplePromise = null;
  function getSample() {
    if (!samplePromise) samplePromise = (root.claude && root.claude.use) ? root.claude.use('sample').catch(() => null) : Promise.resolve(null);
    return samplePromise;
  }
  async function available() {
    const s = await getSample();
    if (!s) return false;
    try { const lim = await s.limits(); return !!(lim && lim.images); } catch (e) { return false; }
  }

  /**
   * @param {File[]} files  gambar JPG/PNG (halaman berurutan)
   * @param {(n:number)=>void} onProgress  jumlah birama yang sudah tertulis
   */
  async function readImages(files, onProgress, signal) {
    const sample = await getSample();
    if (!sample) throw Object.assign(new Error('Pembaca gambar tidak tersedia di halaman ini.'), { code: 'unavailable' });
    const images = [];
    for (const f of files) images.push(await prepareImage(f));
    const res = await sample(PROMPT, {
      images, modelTier: 'complex', cache: false, signal,
      onText: ({ text }) => { if (onProgress) onProgress((text.match(/"rh"\s*:/g) || []).length); }
    });
    if (res.truncated) throw new Error('Partitur terlalu panjang untuk sekali baca. Unggah per halaman (satu gambar per kali).');
    const data = extractJSON(res.text);
    return Object.assign(buildPianoXML(data), { data });
  }

  root.NotasiVision = { available, readImages, buildPianoXML, parseToken, PROMPT };
})(typeof window !== 'undefined' ? window : globalThis);
