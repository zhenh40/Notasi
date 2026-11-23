/* ==========================================================================
   NOTASI — theory.js
   Pecahan eksak, kunci nada, pemetaan not balok -> not angka, pemecahan ritme.
   Semua perhitungan durasi memakai pecahan (bukan float) agar tidak ada
   pembulatan: satu ketukan = satu not 1/4 (quarter).
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- Pecahan rasional ---------- */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a || 1; }
  class Frac {
    constructor(n, d = 1) {
      if (d === 0) throw new Error('Pembagi nol');
      if (d < 0) { n = -n; d = -d; }
      const g = gcd(n, d);
      this.n = n / g; this.d = d / g;
    }
    static of(x) { return x instanceof Frac ? x : new Frac(x, 1); }
    add(o) { o = Frac.of(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { o = Frac.of(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { o = Frac.of(o); return new Frac(this.n * o.n, this.d * o.d); }
    div(o) { o = Frac.of(o); return new Frac(this.n * o.d, this.d * o.n); }
    cmp(o) { o = Frac.of(o); return this.n * o.d - o.n * this.d; }
    eq(o) { return this.cmp(o) === 0; }
    lt(o) { return this.cmp(o) < 0; }
    lte(o) { return this.cmp(o) <= 0; }
    gt(o) { return this.cmp(o) > 0; }
    gte(o) { return this.cmp(o) >= 0; }
    floor() { return Math.floor(this.n / this.d); }
    ceil() { return Math.ceil(this.n / this.d); }
    isInt() { return this.d === 1; }
    isZero() { return this.n === 0; }
    num() { return this.n / this.d; }
    /** true jika this adalah kelipatan bulat dari o */
    isMultipleOf(o) { return this.div(o).isInt(); }
    toString() { return this.d === 1 ? String(this.n) : this.n + '/' + this.d; }
  }
  const ZERO = new Frac(0);
  const ONE = new Frac(1);

  /* ---------- Huruf & kunci ---------- */
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  // Tonika mayor untuk fifths -7..7
  const MAJOR_TONICS = [
    ['C', -1], ['G', -1], ['D', -1], ['A', -1], ['E', -1], ['B', -1], ['F', 0], ['C', 0],
    ['G', 0], ['D', 0], ['A', 0], ['E', 0], ['B', 0], ['F', 1], ['C', 1]
  ];
  const MINOR_TONICS = [
    ['A', -1], ['E', -1], ['B', -1], ['F', 0], ['C', 0], ['G', 0], ['D', 0], ['A', 0],
    ['E', 0], ['B', 0], ['F', 1], ['C', 1], ['G', 1], ['D', 1], ['A', 1]
  ];

  function letterIndex(step) { const i = LETTERS.indexOf(step); if (i < 0) throw new Error('Huruf not tidak dikenal: ' + step); return i; }

  /** alterasi tanda kunci untuk sebuah huruf (mis. fifths=1 -> F = +1) */
  function keyAlter(letter, fifths) {
    if (fifths > 0) return SHARP_ORDER.indexOf(letter) < fifths ? 1 : 0;
    if (fifths < 0) return FLAT_ORDER.indexOf(letter) < -fifths ? -1 : 0;
    return 0;
  }

  function clampFifths(f) { return Math.max(-7, Math.min(7, f | 0)); }

  /**
   * Menentukan "do" (angka 1).
   * minorMode 'la' (standar Indonesia): lagu minor ditulis dengan do = tangga mayor relatifnya (minor = 6).
   * minorMode 'do': tonika minor menjadi angka 1.
   */
  function doTonic(key, minorMode) {
    const f = clampFifths(key.fifths) + 7;
    if (key.mode === 'minor' && minorMode === 'do') { const t = MINOR_TONICS[f]; return { step: t[0], alter: t[1] }; }
    const t = MAJOR_TONICS[f]; return { step: t[0], alter: t[1] };
  }

  function keyTonicName(key) {
    const f = clampFifths(key.fifths) + 7;
    const t = key.mode === 'minor' ? MINOR_TONICS[f] : MAJOR_TONICS[f];
    return pitchName(t[0], t[1]) + (key.mode === 'minor' ? ' minor' : ' mayor');
  }

  function accSymbol(alter) {
    return ({ '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' })[String(alter)] ?? (alter > 0 ? '♯'.repeat(alter) : '♭'.repeat(-alter));
  }
  function pitchName(step, alter) { return step + accSymbol(alter || 0); }

  function midiOf(p) { return (p.octave + 1) * 12 + LETTER_PC[p.step] + (p.alter || 0); }
  function pcOf(step, alter) { return ((LETTER_PC[step] + (alter || 0)) % 12 + 12) % 12; }

  /**
   * Not balok -> angka.
   * degree   : 1..7 berdasarkan jarak huruf (ejaan dipertahankan, enharmonik tidak tertukar)
   * accidental: selisih alterasi terhadap tanda kunci (+1 = kres '/', -1 = mol '\')
   * octave   : 0 = oktaf acuan, +1 = satu titik di atas, -1 = satu titik di bawah
   */
  function toNumber(pitch, key, tonic, refOctave) {
    const L = letterIndex(pitch.step);
    const tL = letterIndex(tonic.step);
    const degree = ((L - tL) % 7 + 7) % 7 + 1;
    const accidental = (pitch.alter || 0) - keyAlter(pitch.step, clampFifths(key.fifths));
    const noteDia = pitch.octave * 7 + L;
    const refDia = refOctave * 7 + tL;
    const octave = Math.floor((noteDia - refDia) / 7);
    return { degree, accidental, octave };
  }

  /** Pilih oktaf acuan yang meminimalkan jumlah titik oktaf untuk satu baris. */
  function bestRefOctave(pitches, tonic) {
    if (!pitches.length) return 4;
    const tL = letterIndex(tonic.step);
    let best = 4, bestCost = Infinity;
    for (let ref = 0; ref <= 8; ref++) {
      let cost = 0;
      for (const p of pitches) {
        const o = Math.floor((p.octave * 7 + letterIndex(p.step) - (ref * 7 + tL)) / 7);
        cost += Math.abs(o) * 10 + (o < 0 ? 1 : 0); // sedikit lebih suka titik atas daripada bawah
      }
      if (cost < bestCost || (cost === bestCost && Math.abs(ref - 4) < Math.abs(best - 4))) { bestCost = cost; best = ref; }
    }
    return best;
  }

  /* ---------- Ritme ---------- */
  const TYPE_UNDERLINES = { 'whole': 0, 'half': 0, 'quarter': 0, 'eighth': 1, '16th': 2, '32nd': 3, '64th': 4, '128th': 5 };

  function log2Frac(c) { // c = 1/2^k -> k
    let k = 0, x = c;
    while (x.lt(ONE)) { x = x.mul(2); k++; if (k > 10) break; }
    return k;
  }

  /**
   * Memecah sebuah durasi (mulai `start`, panjang `dur`, dalam ketukan) menjadi
   * potongan yang bisa ditulis dalam not angka:
   *  - potongan 1 ketukan penuh bila sejajar ketukan
   *  - di dalam ketukan: potongan 1/2^k terbesar yang sejajar posisinya
   * Hasil: [{ start, dur, underlines }]
   */
  function chunkDuration(start, dur) {
    const out = [];
    let p = Frac.of(start), rem = Frac.of(dur);
    let guard = 0;
    while (rem.gt(ZERO) && guard++ < 512) {
      let c;
      if (p.isInt() && rem.gte(ONE)) {
        c = ONE;
      } else {
        const nextBeat = new Frac(p.floor() + 1);
        const space = rem.lt(nextBeat.sub(p)) ? rem : nextBeat.sub(p);
        c = null;
        for (let k = 1; k <= 7; k++) {
          const cand = new Frac(1, 1 << k);
          if (cand.lte(space) && p.isMultipleOf(cand)) { c = cand; break; }
        }
        if (!c) c = space; // posisi di luar kisi biner (mis. setelah triol) -> tulis apa adanya
      }
      const isPow2 = c.n === 1 && (c.d & (c.d - 1)) === 0;
      out.push({ start: p, dur: c, underlines: c.gte(ONE) ? 0 : (isPow2 ? log2Frac(c) : 1) });
      p = p.add(c); rem = rem.sub(c);
    }
    return out;
  }

  root.NotasiTheory = {
    Frac, ZERO, ONE, LETTERS, LETTER_PC, TYPE_UNDERLINES,
    keyAlter, doTonic, keyTonicName, toNumber, bestRefOctave, chunkDuration,
    pitchName, accSymbol, midiOf, pcOf, letterIndex, clampFifths
  };
})(typeof window !== 'undefined' ? window : globalThis);
