/* ==========================================================================
   NOTASI — player.js
   Memutar hasil konversi dengan Web Audio agar pengguna bisa memverifikasi
   dengan telinga; token yang sedang berbunyi diberi sorotan.
   ========================================================================== */
(function (root) {
  'use strict';
  let ctx = null, master = null, raf = 0, startedAt = 0, playing = false, onEndCb = null, sources = [];

  function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function voice(midi, t0, dur, gain) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.value = freq(midi); o2.frequency.value = freq(midi) * 2;
    f.type = 'lowpass'; f.frequency.value = 2400 + (midi - 60) * 30;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(master);
    const end = t0 + Math.max(0.08, dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(gain * 0.45, t0 + Math.min(0.35, dur * 0.6));
    g.gain.setValueAtTime(gain * 0.45, Math.max(t0 + 0.02, end - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
    o1.start(t0); o2.start(t0); o1.stop(end + 0.15); o2.stop(end + 0.15);
    sources.push(o1, o2);
  }

  /**
   * @param {Array} tokenIndex hasil render: [{t, node, line}]
   * @param {number} bpm tempo dalam ketukan 1/4 per menit
   */
  function play(tokenIndex, bpm, onEnd) {
    stop();
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
    const spq = 60 / bpm;
    const lead = 0.15;
    const t0 = ctx.currentTime + lead;
    // urutkan per baris untuk menyambung ikatan
    const byLine = {};
    tokenIndex.forEach(x => { (byLine[x.line] = byLine[x.line] || []).push(x); });
    let endQ = 0;
    for (const li in byLine) {
      const arr = byLine[li].slice().sort((a, b) => a.t.abs.cmp(b.t.abs));
      arr.forEach((x, i) => {
        const t = x.t;
        if (t.kind !== 'note') return;
        let durQ = t.soundDur.num();
        if (t.tieStart) {
          for (let j = i + 1; j < arr.length; j++) {
            const n = arr[j].t;
            if (n.kind === 'hold' && n.tieCont) { durQ += n.soundDur.num(); if (!n.tieStart) break; }
            else if (n.kind === 'hold') continue;
            else break;
          }
        }
        const start = t0 + t.abs.num() * spq;
        const g = Number(li) === 0 ? 0.5 : 0.28;
        t.numbers.forEach(n => voice(n.midi, start, durQ * spq * 0.97, g / Math.sqrt(t.numbers.length)));
        endQ = Math.max(endQ, t.abs.num() + durQ);
      });
    }
    const sorted = tokenIndex.slice().sort((a, b) => a.t.abs.cmp(b.t.abs));
    playing = true; startedAt = t0; onEndCb = onEnd;
    let lit = [];
    const tick = () => {
      if (!playing) return;
      const q = (ctx.currentTime - startedAt) / spq;
      lit.forEach(n => n.classList.remove('is-on'));
      lit = [];
      for (const x of sorted) {
        const a = x.t.abs.num();
        if (a > q) break;
        if (q < a + x.t.dur.num()) { x.node.classList.add('is-on'); lit.push(x.node); }
      }
      if (q > endQ + 0.3) { lit.forEach(n => n.classList.remove('is-on')); stop(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function stop(natural) {
    cancelAnimationFrame(raf);
    sources.forEach(s => { try { s.stop(); } catch (e) { /* sudah berhenti */ } });
    sources = [];
    if (master) { try { master.disconnect(); } catch (e) { /* */ } master = null; }
    document.querySelectorAll('.tk.is-on').forEach(n => n.classList.remove('is-on'));
    const was = playing; playing = false;
    if (was && onEndCb) { const cb = onEndCb; onEndCb = null; cb(natural); }
  }

  root.NotasiPlayer = { play, stop, isPlaying: () => playing };
})(typeof window !== 'undefined' ? window : globalThis);
