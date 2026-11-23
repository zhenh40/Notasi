/* ==========================================================================
   NOTASI OMR — omr.js  (orkestrasi)
   Foto/scan partitur piano -> JSON transkripsi (format yang sama dengan
   NotasiVision.buildPianoXML) -> MusicXML -> not angka.
   Berjalan sepenuhnya di browser, tanpa server dan tanpa layanan AI luar.
   ========================================================================== */
(function (root) {
  'use strict';
  const IM = root.NotasiOMRImage, ST = root.NotasiOMRStaff;
  const TARGET_I = 20; // interline baku (piksel) setelah normalisasi skala

  /**
   * Siapkan gambar: abu-abu -> biner -> normalisasi skala -> luruskan -> biner akhir.
   * @returns {gray, bin, w, h, I, lt, angle, scale}
   */
  function prepare(gray, w, h, log) {
    // batasi ukuran kerja awal
    let scale = 1;
    const maxSide = 4200;
    if (Math.max(w, h) > maxSide) {
      const f = maxSide / Math.max(w, h);
      const nw = Math.round(w * f), nh = Math.round(h * f);
      gray = IM.resize(gray, w, h, nw, nh); w = nw; h = nh; scale *= f;
    }
    let bin = IM.binarize(gray, w, h, Math.max(31, Math.round(Math.min(w, h) / 25)));
    let st = IM.runStats(bin, w, h);
    log && log(`interline awal ${st.interline.toFixed(1)} px, garis ${st.lineThick}px`);
    if (st.interline < 5) throw new Error('Tidak menemukan garis paranada (gambar terlalu kecil atau bukan partitur).');
    const f = TARGET_I / st.interline;
    if (Math.abs(f - 1) > 0.04) {
      const nw = Math.round(w * f), nh = Math.round(h * f);
      if (nw * nh > 22e6) throw new Error('Gambar terlalu besar untuk diproses.');
      gray = IM.resize(gray, w, h, nw, nh); w = nw; h = nh; scale *= f;
    }
    bin = IM.binarize(gray, w, h, Math.round(4.5 * TARGET_I));
    const angle = IM.estimateSkew(bin, w, h, 5);
    if (Math.abs(angle) > 0.0007) {
      gray = IM.rotate(gray, w, h, angle);
      bin = IM.binarize(gray, w, h, Math.round(4.5 * TARGET_I));
    }
    bin = cleanBorder(bin, w, h, TARGET_I);
    st = IM.runStats(bin, w, h);
    log && log(`dinormalisasi: interline ${st.interline.toFixed(1)} px, miring ${(angle * 180 / Math.PI).toFixed(2)}°`);
    return { gray, bin, w, h, I: st.interline, lt: Math.max(1, st.lineThick), angle, scale };
  }

  /** Buang noda di tepi foto (meja, bayangan, tepi kertas) agar tidak dikira simbol. */
  function cleanBorder(bin, w, h, I) {
    const { lab, comps } = IM.label(bin, w, h);
    const kill = new Uint8Array(comps.length);
    const mx = Math.max(4, Math.round(0.012 * w)), my = Math.max(4, Math.round(0.012 * h));
    for (let i = 1; i < comps.length; i++) {
      const c = comps[i];
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      const touches = c.x0 <= 1 || c.y0 <= 1 || c.x1 >= w - 2 || c.y1 >= h - 2;
      if (touches && (bw < 0.3 * w || bh < 3 * I)) kill[i] = 1;
      else if (c.x1 < mx || c.x0 > w - mx || c.y1 < my || c.y0 > h - my) kill[i] = 1;
    }
    const out = new Uint8Array(bin);
    for (let i = 0; i < out.length; i++) if (out[i] && kill[lab[i]]) out[i] = 0;
    return out;
  }

  function analyzeStaves(prep, log) {
    const { bin, w, h, I, lt } = prep;
    const staves = ST.findStaves(bin, w, h, I, lt);
    if (!staves.length) throw new Error('Tidak ada paranada yang terdeteksi pada gambar ini.');
    const systems = ST.groupSystems(staves, bin, w, h);
    const { img, ledgers } = ST.removeLines(bin, w, h, staves, lt);
    log && log(`${staves.length} paranada, ${systems.length} sistem`);
    return { staves, systems, nostaff: img, ledgers };
  }

  /** Satu halaman gambar (abu-abu) -> {data, warnings} */
  function recognizePage(gray, w, h, log) {
    const prep = prepare(gray, w, h, log);
    const an = analyzeStaves(prep, log);
    const ctx = root.NotasiOMRSymbols.buildContext(prep, an);
    const rec = root.NotasiOMRSymbols.recognizeSymbols(ctx, log);
    const asm = root.NotasiOMRAssemble.assemble(ctx, rec);
    return { data: asm.data, warnings: asm.warnings, debug: { prep, an, ctx, rec, header: asm.header, measures: asm.debugMeasures } };
  }

  /** Gabungkan beberapa halaman berurutan menjadi satu transkripsi. */
  function mergePages(pages) {
    if (!pages.length) throw new Error('Tidak ada halaman.');
    const base = pages[0].data;
    const data = { title: base.title, fifths: base.fifths, mode: base.mode, beats: base.beats, beatType: base.beatType, tempo: base.tempo, measures: [] };
    const warnings = [];
    let curF = base.fifths, curB = base.beats, curT = base.beatType;
    pages.forEach((pg, i) => {
      pg.warnings.forEach(wn => warnings.push((pages.length > 1 ? `Hal. ${i + 1}: ` : '') + wn));
      pg.data.measures.forEach((m, k) => {
        const mm = Object.assign({}, m);
        if (k === 0 && i > 0) {
          if (pg.data.fifths !== curF) { mm.fifths = pg.data.fifths; curF = pg.data.fifths; }
          if (pg.data.beats !== curB || pg.data.beatType !== curT) { mm.beats = pg.data.beats; mm.beatType = pg.data.beatType; curB = pg.data.beats; curT = pg.data.beatType; }
        }
        data.measures.push(mm);
      });
    });
    return { data, warnings };
  }

  root.NotasiOMR = { prepare, analyzeStaves, recognizePage, mergePages, TARGET_I };
})(typeof self !== 'undefined' ? self : globalThis);
