/* ==========================================================================
   NOTASI — editor.js
   Koreksi manual hasil pembacaan gambar (OMR): klik angka -> ubah nada,
   kres/mol, oktaf, durasi; jadikan diam / jadikan not; urungkan.
   Perubahan ditulis langsung ke model skor, lalu konversi diulang.
   ========================================================================== */
(function (root) {
  'use strict';
  const T = root.NotasiTheory;
  const X = root.NotasiMusicXML;
  const { Frac } = T;

  const DURS = [
    { type: 'whole', q: new Frac(4), label: '4' },
    { type: 'half', q: new Frac(2), label: '2' },
    { type: 'quarter', q: new Frac(1), label: '1' },
    { type: 'eighth', q: new Frac(1, 2), label: '½' },
    { type: '16th', q: new Frac(1, 4), label: '¼' }
  ];

  let pop = null, undoStack = [], ctx = null;

  function snapshot(measure) {
    return {
      measure, length: measure.length,
      evs: measure.events.map(ev => ({ ev, start: ev.start, dur: ev.dur, type: ev.type, dots: ev.dots, rest: ev.rest, pitches: ev.pitches.map(p => Object.assign({}, p)) }))
    };
  }
  function restore(s) {
    s.measure.length = s.length;
    s.measure.events = s.evs.map(x => Object.assign(x.ev, { start: x.start, dur: x.dur, type: x.type, dots: x.dots, rest: x.rest, pitches: x.pitches }));
  }

  function close() { if (pop) { pop.remove(); pop = null; } document.querySelectorAll('.tk.is-edit').forEach(n => n.classList.remove('is-edit')); }

  function evDurIndex(ev) {
    const base = ev.dots ? ev.dur.div(new Frac(3, 2)) : ev.dur;
    return DURS.findIndex(d => d.q.eq(base));
  }

  /**
   * @param t      token hasil konversi (punya ev, pi, mIndex)
   * @param node   elemen token
   * @param o      { score, onChange(desc) }
   */
  function open(t, node, o) {
    close();
    if (!t.ev) return;
    ctx = { t, node, o, sel: 0 };
    node.classList.add('is-edit');
    pop = document.createElement('div');
    pop.className = 'ed';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Koreksi not');
    document.body.append(pop);
    draw();
    place();
  }

  function place() {
    if (!pop || !ctx) return;
    const r = ctx.node.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 12;
    if (y + h > innerHeight - 10) y = r.top - h - 12;
    x = Math.max(10, Math.min(innerWidth - w - 10, x));
    y = Math.max(10, y);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }

  function draw() {
    const { t } = ctx;
    const ev = t.ev;
    const measure = ctx.o.score.parts[t.pi].measures[t.mIndex];
    const pitches = ev.pitches.slice().sort((a, b) => T.midiOf(b) - T.midiOf(a));
    if (ctx.sel >= pitches.length) ctx.sel = 0;
    const pt = pitches[ctx.sel];
    const di = evDurIndex(ev);
    const btn = (label, act, on, title) => `<button type="button" data-act="${act}" class="${on ? 'on' : ''}"${title ? ` title="${title}"` : ''}>${label}</button>`;
    let html = `<header><b>Birama ${measure.number}</b><span>${ev.rest ? 'diam' : pitches.map((p, i) => `<button type="button" data-sel="${i}" class="nm ${i === ctx.sel ? 'on' : ''}">${T.pitchName(p.step, p.alter)}${p.octave}</button>`).join('')}</span><button type="button" class="x" data-act="close" aria-label="Tutup">×</button></header>`;
    if (!ev.rest && pt) {
      html += `<div class="row"><small>Nada</small>${T.LETTERS.map(L => btn(L, 'step:' + L, pt.step === L)).join('')}</div>`;
      html += `<div class="row"><small>Tanda</small>${btn('♭', 'alter:-1', pt.alter === -1)}${btn('♮', 'alter:0', !pt.alter)}${btn('♯', 'alter:1', pt.alter === 1)}</div>`;
      html += `<div class="row"><small>Oktaf</small>${btn('−', 'oct:-1')}<em>${pt.octave}</em>${btn('+', 'oct:1')}</div>`;
    }
    html += `<div class="row"><small>Ketukan</small>${DURS.map((d, i) => btn(d.label, 'dur:' + i, i === di)).join('')}${btn('titik', 'dot', !!ev.dots, 'not bertitik (×1½)')}</div>`;
    html += `<div class="row row--end">`;
    if (ev.rest) html += btn('jadikan not', 'tonote');
    else {
      html += btn('+ nada akor', 'addpitch', false, 'tambah nada di atas (terts)');
      html += btn(pitches.length > 1 ? 'hapus nada ini' : 'jadikan diam', 'delpitch');
    }
    html += btn('↶ urungkan', 'undo', false) + '</div>';
    pop.innerHTML = html;
    pop.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => { ctx.sel = Number(b.dataset.sel); draw(); }));
    pop.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act, pitches[ctx.sel], measure)));
  }

  function act(a, pt, measure) {
    const { t, o } = ctx;
    const ev = t.ev;
    if (a === 'close') { close(); return; }
    if (a === 'undo') { undo(o); return; }
    undoStack.push(snapshot(measure));
    if (undoStack.length > 200) undoStack.shift();
    const key = measure.key || { fifths: 0, mode: 'major' };
    const [k, v] = a.split(':');
    let desc = '';
    if (k === 'step' && pt) { pt.step = v; pt.alter = T.keyAlter(v, T.clampFifths(key.fifths)); desc = 'nada'; }
    else if (k === 'alter' && pt) { pt.alter = Number(v); desc = 'tanda'; }
    else if (k === 'oct' && pt) { pt.octave = Math.max(0, Math.min(9, pt.octave + Number(v))); desc = 'oktaf'; }
    else if (k === 'dur' || k === 'dot') {
      const idx = k === 'dur' ? Number(v) : Math.max(0, evDurIndex(ev));
      const dots = k === 'dot' ? (ev.dots ? 0 : 1) : ev.dots;
      let nd = DURS[idx].q; if (dots) nd = nd.mul(new Frac(3, 2));
      if (ev.tuplet) nd = nd.mul(new Frac(ev.tuplet.normal, ev.tuplet.actual));
      const delta = nd.sub(ev.dur);
      ev.dur = nd; ev.type = DURS[idx].type; ev.dots = dots;
      X.relayoutMeasure(measure, ev.staff + '|' + ev.voice, ev, delta);
      desc = 'durasi';
    } else if (a === 'tonote') {
      const tonic = T.doTonic(key, 'la');
      ev.rest = false; ev.measureRest = false;
      ev.pitches = [{ step: tonic.step, alter: tonic.alter, octave: ev.staff === 2 ? 3 : 4, tieStart: false, tieStop: false }];
      desc = 'not baru';
    } else if (a === 'addpitch' && pt) {
      const L = T.LETTERS[(T.letterIndex(pt.step) + 2) % 7];
      const oc = T.letterIndex(pt.step) + 2 > 6 ? pt.octave + 1 : pt.octave;
      ev.pitches.push({ step: L, alter: T.keyAlter(L, T.clampFifths(key.fifths)), octave: oc, tieStart: false, tieStop: false });
      ctx.sel = 0;
      desc = 'nada akor';
    } else if (a === 'delpitch' && pt) {
      ev.pitches = ev.pitches.filter(p => p !== pt);
      if (!ev.pitches.length) { ev.rest = true; ev.lyrics = []; }
      ctx.sel = 0;
      desc = 'hapus';
    }
    X.finalize(o.score);
    o.onChange(desc, t);
  }

  function undo(o) {
    const s = undoStack.pop();
    if (!s) return false;
    restore(s);
    X.finalize(o.score);
    close();
    o.onChange('urungkan');
    return true;
  }

  /** dipanggil setelah render ulang: buka lagi editor pada token yang sama (posisi & event sama) */
  function reopen(tokenIndex, prevT) {
    if (!pop || !ctx || !prevT) return;
    const hit = tokenIndex.find(x => x.t.ev === prevT.ev && x.t.kind !== 'hold' && x.t.mIndex === prevT.mIndex);
    if (!hit) { close(); return; }
    const sel = ctx.sel;
    const o = ctx.o;
    open(hit.t, hit.node, o);
    ctx.sel = sel; draw(); place();
  }

  function reset() { undoStack = []; close(); }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('mousedown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.tk')) close(); });
  addEventListener('scroll', () => place(), { passive: true });
  addEventListener('resize', () => place());

  root.NotasiEditor = { open, close, undo, reopen, reset, canUndo: () => undoStack.length > 0, isOpen: () => !!pop };
})(typeof window !== 'undefined' ? window : globalThis);
