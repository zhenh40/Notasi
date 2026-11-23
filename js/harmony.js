/* ==========================================================================
   NOTASI — harmony.js
   1) Simbol akor yang TERTULIS di partitur (<harmony>) dibaca apa adanya.
   2) Bila partitur tidak memuat simbol akor, harmoni dianalisis dari semua
      nada yang berbunyi (melodi + iringan) per segmen ketukan, dengan
      pencocokan templat akor + pemrograman dinamis untuk titik ganti akor.
   ========================================================================== */
(function (root) {
  'use strict';
  const T = root.NotasiTheory;
  const { Frac, ZERO } = T;

  const TEMPLATES = [
    { id: 'maj', iv: [0, 4, 7], roles: ['R', '3', '5'], suffix: '', q: 'maj', cx: 0 },
    { id: 'min', iv: [0, 3, 7], roles: ['R', '3', '5'], suffix: 'm', q: 'min', cx: 0 },
    { id: 'dim', iv: [0, 3, 6], roles: ['R', '3', '5x'], suffix: 'dim', q: 'dim', cx: 0.03 },
    { id: 'aug', iv: [0, 4, 8], roles: ['R', '3', '5x'], suffix: '+', q: 'aug', cx: 0.06 },
    { id: 'sus4', iv: [0, 5, 7], roles: ['R', '3', '5'], suffix: 'sus4', q: 'maj', cx: 0.05 },
    { id: 'sus2', iv: [0, 2, 7], roles: ['R', '3', '5'], suffix: 'sus2', q: 'maj', cx: 0.06 },
    { id: '7', iv: [0, 4, 7, 10], roles: ['R', '3', '5', '7'], suffix: '7', q: 'maj', cx: 0.02, sev: '7' },
    { id: 'maj7', iv: [0, 4, 7, 11], roles: ['R', '3', '5', '7'], suffix: 'maj7', q: 'maj', cx: 0.03, sev: 'maj7' },
    { id: 'm7', iv: [0, 3, 7, 10], roles: ['R', '3', '5', '7'], suffix: 'm7', q: 'min', cx: 0.03, sev: '7' },
    { id: 'm7b5', iv: [0, 3, 6, 10], roles: ['R', '3', '5x', '7'], suffix: 'm7♭5', q: 'hdim', cx: 0.04, sev: '7' },
    { id: 'dim7', iv: [0, 3, 6, 9], roles: ['R', '3', '5x', '7'], suffix: 'dim7', q: 'dim', cx: 0.04, sev: '°7' },
    { id: '6', iv: [0, 4, 7, 9], roles: ['R', '3', '5', '7'], suffix: '6', q: 'maj', cx: 0.11, sev: '6' },
    { id: 'm6', iv: [0, 3, 7, 9], roles: ['R', '3', '5', '7'], suffix: 'm6', q: 'min', cx: 0.12, sev: '6' }
  ];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const MISSING_PEN = { R: 0.25, '3': 0.12, '5': 0.03, '5x': 0.1, '7': 0.22 };

  /* ---------- Ejaan ---------- */
  function spellPc(pc, fifths, observed) {
    if (observed && observed[pc]) {
      const best = Object.entries(observed[pc]).sort((a, b) => b[1] - a[1])[0][0];
      const [step, alter] = best.split(':'); return { step, alter: Number(alter) };
    }
    for (const L of T.LETTERS) { const a = T.keyAlter(L, fifths); if (T.pcOf(L, a) === pc) return { step: L, alter: a }; }
    const prefSharp = fifths >= 0;
    for (const L of T.LETTERS) for (const a of (prefSharp ? [1, -1, 0] : [-1, 1, 0])) if (T.pcOf(L, a) === pc) return { step: L, alter: a };
    return { step: 'C', alter: 0 };
  }

  /* ---------- Akor diatonik ---------- */
  function diatonicSet(key) {
    const f = T.clampFifths(key.fifths);
    const tonic = T.doTonic(key, 'do'); // tonika sesungguhnya (mayor/minor)
    const tL = T.letterIndex(tonic.step);
    const scale = [];
    for (let i = 0; i < 7; i++) { const L = T.LETTERS[(tL + i) % 7]; scale.push(T.pcOf(L, T.keyAlter(L, f))); }
    const set = new Set();
    const add = (rootPc, ivs) => {
      const t = TEMPLATES.find(tp => tp.iv.length === ivs.length && tp.iv.every((v, k) => v === ivs[k]));
      if (t) set.add(rootPc + ':' + t.id);
    };
    const build = (sc) => {
      for (let i = 0; i < 7; i++) {
        const r = sc[i];
        const iv = (k) => ((sc[(i + k) % 7] - r) % 12 + 12) % 12;
        add(r, [0, iv(2), iv(4)]);
        add(r, [0, iv(2), iv(4), iv(6)]);
      }
    };
    build(scale);
    if (key.mode === 'minor') { const h = scale.slice(); h[6] = (h[6] + 1) % 12; build(h); }
    return set;
  }

  /* ---------- Akor dari partitur ---------- */
  function fromScore(h) {
    if (h.kind === 'none' || !h.root) return { nc: true, source: 'score', symbol: 'N.C.' };
    let suffix = h.kindText !== null && h.kindText !== undefined && h.kindText !== '' ? h.kindText : (root.NotasiMusicXML.KIND_SUFFIX[h.kind] ?? '');
    for (const d of h.degrees || []) {
      const acc = d.alter > 0 ? '♯' : d.alter < 0 ? '♭' : '';
      if (d.type === 'add') suffix += '(add' + acc + d.value + ')';
      else if (d.type === 'alter') suffix += '(' + acc + d.value + ')';
      else if (d.type === 'subtract') suffix += '(no' + d.value + ')';
    }
    const q = root.NotasiMusicXML.KIND_QUALITY[h.kind] || 'maj';
    const sev = /seventh|dominant|ninth|11th|13th|half-diminished/.test(h.kind) ? (h.kind === 'diminished-seventh' ? '°7' : h.kind.startsWith('major-') && h.kind !== 'major-minor' && h.kind !== 'major-sixth' ? 'maj7' : '7') : (/sixth/.test(h.kind) ? '6' : null);
    return { root: h.root, bass: h.bass, suffix, q, sev, source: 'score' };
  }

  /* ---------- Simbol & angka romawi ---------- */
  function chordSymbol(c) {
    if (c.nc) return 'N.C.';
    let s = T.pitchName(c.root.step, c.root.alter) + c.suffix;
    if (c.bass && !(c.bass.step === c.root.step && (c.bass.alter || 0) === (c.root.alter || 0))) s += '/' + T.pitchName(c.bass.step, c.bass.alter);
    return s;
  }

  function chordRoman(c, key, tonic) {
    if (c.nc) return '—';
    const sec = secondaryDominant(c, key, tonic);
    if (sec) return sec;
    const deg = ((T.letterIndex(c.root.step) - T.letterIndex(tonic.step)) % 7 + 7) % 7;
    const acc = (c.root.alter || 0) - T.keyAlter(c.root.step, T.clampFifths(key.fifths));
    let r = ROMAN[deg];
    if (c.q === 'min' || c.q === 'dim' || c.q === 'hdim') r = r.toLowerCase();
    let pre = acc > 0 ? '♯'.repeat(acc) : acc < 0 ? '♭'.repeat(-acc) : '';
    let suf = '';
    if (c.q === 'dim') suf = c.sev === '°7' ? '°7' : '°';
    else if (c.q === 'hdim') suf = 'ø7';
    else if (c.q === 'aug') suf = '+';
    if (c.sev === '7' && c.q !== 'hdim') suf += '7';
    else if (c.sev === 'maj7') suf += 'maj7';
    else if (c.sev === '6') suf += '6';
    if (/sus4/.test(c.suffix)) suf += 'sus4'; else if (/sus2/.test(c.suffix)) suf += 'sus2';
    // inversi
    if (c.bass && !(c.bass.step === c.root.step && (c.bass.alter || 0) === (c.root.alter || 0))) {
      const bd = ((T.letterIndex(c.bass.step) - T.letterIndex(tonic.step)) % 7 + 7) % 7 + 1;
      const ba = (c.bass.alter || 0) - T.keyAlter(c.bass.step, T.clampFifths(key.fifths));
      suf += '/' + (ba > 0 ? '♯' : ba < 0 ? '♭' : '') + bd;
    }
    return pre + r + suf;
  }

  /**
   * Dominan sekunder: akor mayor / 7 non-diatonik yang akarnya kwint murni di atas
   * akar akor diatonik (bukan I) -> ditulis V/x atau V7/x.
   */
  function secondaryDominant(c, key, tonic) {
    if (c.q !== 'maj' || !(c.sev === '7' || !c.sev) || /sus|6/.test(c.suffix)) return null;
    const rootPc = T.pcOf(c.root.step, c.root.alter);
    const diat = diatonicSet(key);
    const id = c.sev === '7' ? '7' : 'maj';
    if (diat.has(rootPc + ':' + id)) return null;
    // akor tujuan: satu huruf turun kwint (4 huruf ke atas), alterasi mengikuti tanda kunci
    const tgtL = T.LETTERS[(T.letterIndex(c.root.step) + 3) % 7];
    const tgtAlter = T.keyAlter(tgtL, T.clampFifths(key.fifths));
    if ((T.pcOf(tgtL, tgtAlter) + 7) % 12 !== rootPc) return null;
    const tgtPc = T.pcOf(tgtL, tgtAlter);
    let tgtQ = null;
    if (diat.has(tgtPc + ':maj')) tgtQ = 'maj'; else if (diat.has(tgtPc + ':min')) tgtQ = 'min';
    if (!tgtQ) return null; // tujuan vii° tidak lazim ditonisasi
    const deg = ((T.letterIndex(tgtL) - T.letterIndex(tonic.step)) % 7 + 7) % 7;
    const realTonicL = T.doTonic(key, 'do').step;
    if (tgtL === realTonicL) return null; // V/I = V biasa
    let tr = ROMAN[deg]; if (tgtQ === 'min') tr = tr.toLowerCase();
    return 'V' + (c.sev === '7' ? '7' : '') + '/' + tr;
  }

  /** "Akor angka" ala Indonesia: derajat dasar + kualitas, mis. 6m, 5⁷, 4 */
  function chordNumber(c, key, tonic) {
    if (c.nc) return '—';
    const deg = ((T.letterIndex(c.root.step) - T.letterIndex(tonic.step)) % 7 + 7) % 7 + 1;
    const acc = (c.root.alter || 0) - T.keyAlter(c.root.step, T.clampFifths(key.fifths));
    // angka tambahan ditulis superskrip agar "5⁷" tidak terbaca "57"
    const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '(': '⁽', ')': '⁾' };
    const suf = c.suffix.replace(/^m(?!aj)/, 'm\u200A').replace(/[0-9]/g, d => SUP[d]);
    return (acc > 0 ? '♯' : acc < 0 ? '♭' : '') + deg + suf.replace('\u200A', '');
  }

  /* ---------- Analisis ---------- */
  function scoreCandidate(w, rootPc, tp, bassPc, diatonic) {
    const pcs = tp.iv.map(i => (rootPc + i) % 12);
    let inW = 0, outW = 0;
    for (let pc = 0; pc < 12; pc++) { if (!w[pc]) continue; if (pcs.includes(pc)) inW += w[pc]; else outW += w[pc]; }
    let s = inW - 0.85 * outW - tp.cx;
    tp.iv.forEach((iv, k) => { const need = tp.roles[k] === '7' ? 0.06 : 0.02; if (!w[pcs[k]] || w[pcs[k]] < need) s -= MISSING_PEN[tp.roles[k]]; });
    if (bassPc !== null) {
      if (bassPc === rootPc) s += 0.12;
      else if (pcs.includes(bassPc)) s += tp.iv.length === 3 ? 0.03 : -0.04;
      else s -= 0.06;
    }
    if (diatonic.has(rootPc + ':' + tp.id)) s += 0.05;
    return s;
  }

  function bestChord(notes, segStart, segEnd, key, diatonic) {
    const w = new Array(12).fill(0);
    const observed = {};
    let total = 0;
    let bassAtStart = null, bassAny = null;
    for (const n of notes) {
      const s = n.start.gt(segStart) ? n.start : segStart;
      const e = n.end.lt(segEnd) ? n.end : segEnd;
      if (!s.lt(e)) continue;
      const metric = (n.start.gte(segStart) && n.start.isInt() ? 1 : (n.start.lt(segStart) ? 0.9 : 0.7)) * (n.passing ? 0.5 : 1);
      const amount = e.sub(s).num() * metric;
      w[n.pc] += amount; total += amount;
      const sp = n.step + ':' + n.alter;
      observed[n.pc] = observed[n.pc] || {}; observed[n.pc][sp] = (observed[n.pc][sp] || 0) + amount;
      if (n.start.lte(segStart) && n.end.gt(segStart)) { if (!bassAtStart || n.midi < bassAtStart.midi) bassAtStart = n; }
      if (!bassAny || n.midi < bassAny.midi) bassAny = n;
    }
    if (total === 0) return null;
    for (let i = 0; i < 12; i++) w[i] /= total;
    const bassNote = bassAtStart || bassAny;
    const multiVoice = notes.some(n => n.line !== notes[0].line);
    const bassPc = multiVoice && bassNote ? bassNote.pc : null; // bas hanya bermakna bila ada iringan
    let best = null;
    for (let r = 0; r < 12; r++) for (const tp of TEMPLATES) {
      const s = scoreCandidate(w, r, tp, bassPc, diatonic);
      if (!best || s > best.score) best = { score: s, rootPc: r, tp };
    }
    const fifths = T.clampFifths(key.fifths);
    const rootSp = spellPc(best.rootPc, fifths, observed);
    let bass = null;
    if (bassPc !== null && bassPc !== best.rootPc && best.tp.iv.map(i => (best.rootPc + i) % 12).includes(bassPc)) bass = spellPc(bassPc, fifths, observed);
    return {
      root: rootSp, bass, suffix: best.tp.suffix, q: best.tp.q, sev: best.tp.sev || null, source: 'analysis',
      score: best.score, id: best.rootPc + ':' + best.tp.id + ':' + (bass ? bassPc : '')
    };
  }

  function harmonicUnit(time) {
    if (time.beatType === 8 && time.beats % 3 === 0 && time.beats > 3) return new Frac(3, 2);
    if (time.beatType === 8 && time.beats === 3) return new Frac(3, 2);
    return new Frac(4, time.beatType);
  }

  /**
   * Analisis seluruh skor. notesByMeasure[i] = [{start,end,pc,midi,step,alter,line}] (waktu lokal birama, sudah digeser pickup)
   * Hasil: per birama, daftar { pos, chord }.
   */
  function analyze(measureInfo, notesByMeasure) {
    const SPLIT_PEN = 0.14;
    const out = [];
    let prevId = null;
    for (let i = 0; i < measureInfo.length; i++) {
      const mi = measureInfo[i];
      const notes = notesByMeasure[i] || [];
      const key = mi.key;
      const diatonic = diatonicSet(key);
      const unit = harmonicUnit(mi.time);
      const start = mi.shift, end = mi.shift.add(mi.length);
      const bounds = [start];
      let b = new Frac(start.div(unit).floor() + 1).mul(unit);
      while (b.lt(end)) { bounds.push(b); b = b.add(unit); }
      bounds.push(end);
      const n = bounds.length - 1;
      const total = end.sub(start).num() || 1;
      const best = new Array(n + 1).fill(null); best[0] = { val: 0, segs: [] };
      for (let j = 1; j <= n; j++) {
        for (let k = 0; k < j; k++) {
          if (!best[k]) continue;
          // segmen harus diawali pada batas "kuat": awal birama, separuh birama, atau tiap ketukan bila birama pendek
          const c = bestChord(notes, bounds[k], bounds[j], key, diatonic);
          const frac = bounds[j].sub(bounds[k]).num() / total;
          const val = best[k].val + (c ? c.score : 0) * frac - (k > 0 ? SPLIT_PEN : 0);
          if (!best[j] || val > best[j].val) best[j] = { val, segs: best[k].segs.concat([{ pos: bounds[k], chord: c }]) };
        }
      }
      const segs = [];
      for (const s of best[n].segs) {
        if (!s.chord) continue;
        if (segs.length && segs[segs.length - 1].chord.id === s.chord.id) continue;
        segs.push(s);
      }
      out.push(segs);
      if (segs.length) prevId = segs[segs.length - 1].chord.id;
    }
    return out;
  }

  root.NotasiHarmony = { analyze, fromScore, chordSymbol, chordRoman, chordNumber, diatonicSet, TEMPLATES };
})(typeof window !== 'undefined' ? window : globalThis);
