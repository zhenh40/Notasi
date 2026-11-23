/* ==========================================================================
   NOTASI OMR — omr-assemble.js
   Simbol yang dikenali -> birama, suara, durasi, nada -> JSON transkripsi
   (format token yang sama dengan NotasiVision.buildPianoXML).
   Durasi dihitung dalam satuan 1/24 ketukan (bilangan bulat, tanpa pembulatan).
   ========================================================================== */
(function (root) {
  'use strict';
  const LET = 'CDEFGAB';
  const BASE = { w: 96, h: 48, q: 24, e: 12, s: 6, t: 3 };
  const NAME2DUR = { restWhole: 'w', restHalf: 'h', restQuarter: 'q', rest8th: 'e', rest16th: 's', rest32nd: 't' };
  const ACCSIGN = { accidentalSharp: '#', accidentalFlat: 'b', accidentalNatural: 'n', accidentalDoubleSharp: 'x', accidentalDoubleFlat: 'bb' };
  const CLEFDIA = { gClef: 4 * 7 + 4, fClef: 3 * 7 + 3, cClef: 4 * 7 + 0 }; // G4, F3, C4

  function durOf(ev) {
    let d = BASE[ev.base];
    if (ev.dots === 1) d = d * 3 / 2; else if (ev.dots >= 2) d = d * 7 / 4;
    if (ev.triplet) d = d * 2 / 3;
    return d;
  }

  function topDiaOf(clef) {
    // diatonik pada p = 0 (garis teratas) = diatonik nada kunci + posisi garis kunci
    return CLEFDIA[clef.name] + clef.line;
  }

  function assemble(ctx, rec, opts) {
    const { I } = ctx;
    const { heads, stems, bars, symbols } = rec;
    const warnings = [];
    const used = new Set();

    /* ---------- header tiap paranada: klef, tanda kunci, sukat ---------- */
    const header = ctx.staves.map((st, si) => {
      const hp = (rec.headers && rec.headers[si]) || { clef: null, accs: [], digits: [], end: st.x0 + 2 * I };
      const sys = ctx.sysOf.get(si);
      const lower = sys && sys.pos === sys.n - 1 && sys.n > 1;
      let clef = hp.clef ? { name: hp.clef.name, line: hp.clef.line, guessed: false } : { name: lower ? 'fClef' : 'gClef', line: lower ? 2 : 6, guessed: true };
      // posisi garis kunci yang wajar
      if (clef.name === 'gClef' && clef.line !== 6) clef.line = 6;
      if (clef.name === 'fClef' && clef.line !== 2) clef.line = 2;
      const sharps = hp.accs.filter(a => a.name === 'accidentalSharp').length, flats = hp.accs.filter(a => a.name === 'accidentalFlat').length;
      const fifths = sharps >= flats ? Math.min(7, sharps) : -Math.min(7, flats);
      let time = null;
      const ds = hp.digits;
      if (ds.find(d => d.name === 'timeSigCommon')) time = { beats: 4, beatType: 4 };
      else if (ds.find(d => d.name === 'timeSigCutCommon')) time = { beats: 2, beatType: 2 };
      else {
        const top = ds.filter(d => d.p < 4 && /\d$/.test(d.name)).sort((a, b) => a.x0 - b.x0);
        const bot = ds.filter(d => d.p >= 4 && /\d$/.test(d.name)).sort((a, b) => a.x0 - b.x0);
        const num = (arr) => arr.length ? Number(arr.map(d => d.name.slice(-1)).join('')) : 0;
        const bts = num(top), bt = num(bot);
        if (bts > 0 && bts <= 16 && [1, 2, 4, 8, 16].includes(bt)) time = { beats: bts, beatType: bt };
      }
      return { clef, fifths, nKey: hp.accs.length, time, startX: hp.end };
    });

    /* ---------- kunci & sukat global ---------- */
    const votes = {};
    header.forEach(hd => { votes[hd.fifths] = (votes[hd.fifths] || 0) + 1; });
    const fifths = Number(Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]);
    const timeVotes = {};
    header.forEach(hd => { if (hd.time) { const k = hd.time.beats + '/' + hd.time.beatType; timeVotes[k] = (timeVotes[k] || 0) + 1; } });
    let time = null;
    const tv = Object.entries(timeVotes).sort((a, b) => b[1] - a[1])[0];
    if (tv) { const [b, t] = tv[0].split('/').map(Number); time = { beats: b, beatType: t }; }

    /* ---------- klef di tengah paranada ---------- */
    const clefChanges = symbols.filter(s => s.type === 'clef' && s.x0 > header[s.si].startX).map(s => ({ si: s.si, x: s.x0, clef: { name: s.name, line: 2 * Math.round(s.pp / 2) } }));
    const clefAt = (si, x) => {
      let c = header[si].clef;
      for (const ch of clefChanges) if (ch.si === si && ch.x < x && ch.x > header[si].startX) c = ch.clef;
      return c;
    };

    /* ---------- kres/mol pada not ---------- */
    const accs = symbols.filter(s => s.type === 'acc' && !used.has(s));
    for (const a of accs) {
      const pa = Math.round(a.pp);
      let best = null;
      for (const hd of heads) {
        if (hd.si !== a.si) continue;
        const dx = hd.x0 - a.x1;
        if (dx < -0.35 * I || dx > 3.2 * I) continue;
        const dp = Math.abs(hd.p - pa);
        if (dp > 1) continue;
        const cost = dp * 10 + dx / I;
        if (!best || cost < best.cost) best = { hd, cost };
      }
      if (best && (!best.hd.acc || best.cost < best.hd.accCost)) { best.hd.acc = ACCSIGN[a.name]; best.hd.accCost = best.cost; }
    }

    /* ---------- tali (tie) ---------- */
    for (const arc of symbols.filter(s => s.type === 'arc')) {
      const st = ctx.staves[arc.si];
      let A = null, B = null;
      for (const hd of heads) {
        if (Math.abs(hd.si - arc.si) > 1) continue;
        if (hd.x1 >= arc.x0 - 1.3 * I && hd.x1 <= arc.x0 + 0.7 * I && Math.abs(hd.y - arc.ly) <= 1.2 * I) {
          if (!A || Math.abs(hd.y - arc.ly) < Math.abs(A.y - arc.ly)) A = hd;
        }
        if (hd.x0 >= arc.x1 - 0.7 * I && hd.x0 <= arc.x1 + 1.3 * I && Math.abs(hd.y - arc.ry) <= 1.2 * I) {
          if (!B || Math.abs(hd.y - arc.ry) < Math.abs(B.y - arc.ry)) B = hd;
        }
      }
      if (A && B && A.si === B.si && A.p === B.p && A !== B) A.tieStart = true;
      else if (A && !B && arc.x1 >= st.x1 - 2.2 * I && arc.bw <= 4 * I) A.tieStart = true;
    }

    /* ---------- peristiwa (not/akor/diam) per paranada ---------- */
    const events = [];
    for (const s of stems) {
      const hs = s.heads;
      const black = hs.filter(h => h.kind === 'black').length, half = hs.filter(h => h.kind === 'half').length;
      let base;
      if (half > black) base = 'h';
      else base = ['q', 'e', 's', 't', 't'][s.beam.n] || 'q';
      events.push({ si: s.si, kind: 'note', heads: hs, x: hs.reduce((a, h) => a + h.x, 0) / hs.length, x1: Math.max(...hs.map(h => h.x1)), base, dots: 0, stem: s, dir: s.dir });
    }
    // not penuh (bulat) tanpa tangkai: kelompokkan per x
    const wholes = heads.filter(h => h.kind === 'whole').sort((a, b) => a.x - b.x);
    for (const hd of wholes) {
      const ev = events.find(e => e.kind === 'note' && e.base === 'w' && e.si === hd.si && Math.abs(e.x - hd.x) < 0.6 * I);
      if (ev) { ev.heads.push(hd); ev.x1 = Math.max(ev.x1, hd.x1); }
      else events.push({ si: hd.si, kind: 'note', heads: [hd], x: hd.x, x1: hd.x1, base: 'w', dots: 0, stem: null, dir: null });
    }
    for (const r of symbols.filter(s => s.type === 'rest')) {
      events.push({ si: r.si, kind: 'rest', heads: [], x: r.x, x1: r.x1, base: NAME2DUR[r.name], dots: 0, rest: r, y: r.y });
    }
    // titik augmentasi
    const dots = symbols.filter(s => s.type === 'dot').sort((a, b) => a.x0 - b.x0);
    const dotUsed = new Set();
    for (const ev of events.sort((a, b) => a.x - b.x)) {
      const st = ctx.staves[ev.si];
      const ys = ev.kind === 'note' ? ev.heads.map(h => h.y) : [ev.y];
      let lastX = ev.x1, n = 0;
      for (let k = 0; k < 2; k++) {
        const d = dots.find(dd => !dotUsed.has(dd) && dd.si === ev.si && dd.x0 > lastX + 0.05 * I && dd.x0 < lastX + (k ? 0.9 : 1.45) * I &&
          ys.some(y => Math.abs(dd.y - y) <= (ev.kind === 'rest' ? 1.4 : 0.85) * I) &&
          (ev.kind === 'rest' || Math.abs(st.pAt(dd.y, dd.x) - (2 * Math.floor(st.pAt(dd.y, dd.x) / 2) + 1)) <= 0.5));
        if (!d) break;
        dotUsed.add(d); n++; lastX = d.x1;
      }
      ev.dots = n;
    }
    // triol dari angka 3: pilih kelompok 3 not berurutan pada paranada yang paling dekat secara vertikal
    for (const t of symbols.filter(s => s.type === 'tuplet')) {
      const near = events.filter(e => e.kind === 'note' && Math.abs(e.x - t.x) < 3 * I && !e.triplet);
      if (!near.length) continue;
      const vdist = (e) => {
        const ys = e.heads.map(h => h.y).concat(e.stem ? [e.stem.yTip] : []);
        return Math.min(...ys.map(y => Math.abs(y - t.y)));
      };
      near.sort((a, b) => vdist(a) - vdist(b));
      const si = near[0].si;
      const row = events.filter(e => e.kind === 'note' && e.si === si && !e.triplet).sort((a, b) => a.x - b.x);
      let best = null;
      for (let i = 0; i + 2 < row.length; i++) {
        const g = row.slice(i, i + 3);
        if (!g.every(e => e.base === g[0].base && !e.dots)) continue;
        if (g[2].x - g[0].x > 6 * I) continue;
        const cx = (g[0].x + g[2].x) / 2;
        const d = Math.abs(cx - t.x);
        if (d < 2.2 * I && (!best || d < best.d)) best = { d, g };
      }
      if (best) best.g.forEach(e => { e.triplet = true; });
    }

    /* ---------- birama per sistem ---------- */
    const measures = [];
    const measLenOf = () => time ? time.beats * 96 / time.beatType : null;
    ctx.systems.forEach((sys, k) => {
      const sis = sys.map(st => ctx.staves.indexOf(st));
      const bx = bars.filter(b => b.sys === k).map(b => b.x).sort((a, b) => a - b);
      const startX = Math.min(...sis.map(si => header[si].startX));
      const endX = Math.max(...sys.map(st => st.x1));
      const cuts = bx.filter(x => x > startX + 0.8 * I);
      const bounds = [startX].concat(cuts);
      if (endX - bounds[bounds.length - 1] > 3 * I) bounds.push(endX + 1);
      for (let m = 0; m + 1 < bounds.length; m++) {
        const xa = bounds[m], xb = bounds[m + 1];
        const meas = { sys: k, staves: {} };
        sis.forEach((si, j) => {
          const evs = events.filter(e => e.si === si && e.x > xa && e.x < xb).sort((a, b) => a.x - b.x);
          meas.staves[j] = evs;
        });
        meas.xa = xa; meas.xb = xb; meas.sis = sis;
        measures.push(meas);
      }
    });

    /* ---------- sukat bila tidak terbaca: modus jumlah durasi ---------- */
    const singleTotal = (evs) => {
      // gabungkan peristiwa pada x yang sama (akor di dua tangkai) -> ambil durasi terpendek
      let t = 0, lastX = -1e9, lastD = 0;
      for (const e of evs) {
        const d = e.kind === 'rest' && e.base === 'w' ? 0 : durOf(e);
        if (Math.abs(e.x - lastX) < 0.4 * I) { if (d && d < lastD) { t -= lastD - d; lastD = d; } continue; }
        t += d; lastX = e.x; lastD = d;
      }
      return t;
    };
    if (!time) {
      const cnt = {};
      measures.forEach((m, i) => { if (i === 0 || i === measures.length - 1) return; const t = singleTotal(m.staves[0] || []); if (t) cnt[t] = (cnt[t] || 0) + 1; });
      const mode = Number((Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [96])[0]);
      const table = { 96: [4, 4], 72: [3, 4], 48: [2, 4], 144: [6, 4], 120: [5, 4], 36: [3, 8] };
      let bt = table[mode] || [Math.max(1, Math.round(mode / 24)), 4];
      if (mode === 72) {
        // 6/8 bila balok berkelompok tiga 1/8
        const groups3 = events.filter(e => e.kind === 'note' && e.base === 'e').length;
        if (groups3 > events.length * 0.5) bt = [6, 8];
      }
      time = { beats: bt[0], beatType: bt[1] };
      warnings.push(`Tanda sukat tidak terbaca jelas; diperkirakan ${time.beats}/${time.beatType} dari isi birama.`);
    }
    const ML = time.beats * 96 / time.beatType;

    /* ---------- suara & token ---------- */
    const pitchTok = (hd, si, x) => {
      const clef = clefAt(si, x);
      const dia = topDiaOf(clef) - hd.p;
      const step = LET[((dia % 7) + 7) % 7], oct = Math.floor(dia / 7);
      return step + (hd.acc || '') + oct;
    };
    const durTok = (ev) => ':' + ev.base + (ev.dots ? '.' : '') + (ev.tie ? '~' : '') + (ev.triplet ? '3' : '');
    const voiceTotal = (evs) => evs.reduce((a, e) => a + (e.kind === 'rest' && e.full ? ML : durOf(e)), 0);

    const inferTriplets = (evs, target) => {
      let total = voiceTotal(evs);
      if (total <= target) return;
      for (let i = 0; i + 2 < evs.length && total > target; i++) {
        const g = evs.slice(i, i + 3);
        if (g.some(e => e.kind !== 'note' || e.triplet || e.dots) || !g.every(e => e.base === g[0].base) || !['e', 's', 'q'].includes(g[0].base)) continue;
        const d = BASE[g[0].base];
        if (total - d < target) continue;
        g.forEach(e => { e.triplet = true; });
        total -= d; i += 2;
      }
    };

    const out = [];
    measures.forEach((meas, mi) => {
      const rec = {};
      [0, 1].forEach((j) => {
        const evs = (meas.staves[j] || []).slice();
        // diam penuh
        evs.forEach(e => { if (e.kind === 'rest' && e.base === 'w' && evs.filter(o => o.kind === 'note').length === 0) e.full = true; });
        // tie per peristiwa
        evs.forEach(e => { e.tie = e.kind === 'note' && e.heads.some(h => h.tieStart); });
        // gabungkan akor dari dua tangkai pada x sama & arah sama
        let voices = [evs];
        const overlapping = evs.some((a, i) => evs.some((b, k) => k > i && Math.abs(a.x - b.x) < 0.5 * I && a.kind === 'note' && b.kind === 'note' && a.dir && b.dir && a.dir !== b.dir));
        if (overlapping) {
          const st = ctx.staves[meas.sis[j]];
          const v1 = evs.filter(e => e.kind === 'note' ? e.dir !== 'down' : st.pAt(e.y, e.x) < 4);
          const v2 = evs.filter(e => !v1.includes(e));
          if (Math.abs(voiceTotal(v1) - ML) <= Math.abs(singleTotal(evs) - ML) || Math.abs(voiceTotal(v2) - ML) < Math.abs(singleTotal(evs) - ML)) voices = [v1, v2];
        }
        // not ganda pada x sama dalam satu suara: gabungkan jadi akor
        voices = voices.map(v => {
          const merged = [];
          for (const e of v) {
            const last = merged[merged.length - 1];
            if (last && last.kind === 'note' && e.kind === 'note' && Math.abs(last.x - e.x) < 0.45 * I && durOf(last) === durOf(e)) { last.heads = last.heads.concat(e.heads); last.tie = last.tie || e.tie; continue; }
            if (last && last.kind === 'rest' && e.kind === 'rest' && Math.abs(last.x - e.x) < 0.45 * I) continue;
            merged.push(Object.assign({}, e));
          }
          return merged;
        });
        // triol hanya bila angka 3 terbaca (penebakan buta lebih sering salah)
        const toks = voices.map(v => v.map(e => {
          if (e.kind === 'rest') return e.full ? 'R:w' : 'r' + durTok(e);
          const ps = e.heads.slice().sort((a, b) => b.p - a.p).map(h => pitchTok(h, meas.sis[j], e.x));
          const uniq = [...new Set(ps)];
          return uniq.join('+') + durTok(e);
        }).join(' '));
        const key = j === 0 ? 'rh' : 'lh';
        rec[key] = toks[0] || '';
        if (toks[1]) rec[key + '2'] = toks[1];
        const tots = voices.map(voiceTotal);
        if (tots.some(t => t && t !== ML) && !(mi === 0 && tots.every(t => t <= ML))) rec.warn = (rec.warn || []).concat([`${key}: ${tots.map(t => t / 24).join('+')} ketukan`]);
      });
      // paranada tunggal: tangan kiri kosong
      if (meas.sis.length < 2) delete rec.lh;
      out.push(rec);
    });

    if (header.some(hd => hd.clef.guessed)) warnings.push('Sebagian kunci (G/F) tidak terbaca; diasumsikan G di atas, F di bawah.');
    const debugMeasures = measures.map(m => ({ xa: m.xa, xb: m.xb, sys: m.sys, staves: Object.fromEntries(Object.entries(m.staves).map(([j, evs]) => [j, evs.map(e => ({ x: e.x, kind: e.kind, base: e.base, dots: e.dots, triplet: !!e.triplet, stem: e.stem ? { x: e.stem.x, dir: e.stem.dir, tip: e.stem.yTip, beam: e.stem.beam } : null, ps: e.heads.map(h => h.p) }))])) }));
    return { data: { title: '', fifths, mode: 'major', beats: time.beats, beatType: time.beatType, tempo: 0, measures: out }, warnings, header, debugMeasures };
  }

  root.NotasiOMRAssemble = { assemble, durOf };
})(typeof self !== 'undefined' ? self : globalThis);
