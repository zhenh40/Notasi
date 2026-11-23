/* ==========================================================================
   NOTASI — render.js
   Model hasil konversi -> DOM not angka.
   Konvensi:
     angka 1–7  = do re mi fa sol la si, 0 = diam
     titik atas/bawah angka = oktaf naik/turun
     garis bawah = 1/8 (satu garis), 1/16 (dua garis), ... digabung per ketukan
     "."        = tahan satu potongan ketukan (sesuai garis bawahnya)
     garis miring "/" menembus angka = dinaikkan (kres), "\" = diturunkan (mol)
   ========================================================================== */
(function (root) {
  'use strict';

  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };

  function digit(n, isLowest) {
    const d = el('span', 'dg');
    if (n.accidental) d.dataset.acc = String(n.accidental);
    d.title = n.name + (n.accidental > 0 ? ' · dinaikkan' : n.accidental < 0 ? ' · diturunkan' : '');
    const up = el('span', 'dots dots--up', n.octave > 0 ? '•'.repeat(n.octave) : '');
    const glyph = el('span', 'dg-n', String(n.degree));
    d.append(up, glyph);
    if (!isLowest) d.append(el('span', 'dots dots--dn', n.octave < 0 ? '•'.repeat(-n.octave) : ''));
    return d;
  }

  function token(t) {
    const k = el('span', 'tk tk--' + t.kind);
    k.dataset.abs = t.abs.num();
    k.dataset.dur = t.dur.num();
    const stack = el('span', 'tk-stack');
    let lowest = null;
    if (t.kind === 'note') {
      t.numbers.forEach((n, i) => stack.append(digit(n, i === t.numbers.length - 1)));
      lowest = t.numbers[t.numbers.length - 1];
    } else if (t.kind === 'rest') {
      const d = Object.assign(el('span', 'dg'), { title: 'diam' });
      d.append(el('span', 'dots dots--up'), el('span', 'dg-n', '0'));
      stack.append(d);
    } else {
      const d = Object.assign(el('span', 'dg dg--hold'), { title: 'tahan' });
      d.append(el('span', 'dots dots--up'), el('span', 'dg-n', '.'));
      stack.append(d);
    }
    k.append(stack);
    const ul = el('span', 'tk-ul');
    ul.style.setProperty('--n', t.underlines);
    for (let i = 0; i < t.underlines; i++) ul.append(el('i'));
    k.append(ul);
    k.append(el('span', 'tk-lo', lowest && lowest.octave < 0 ? '•'.repeat(-lowest.octave) : ''));
    if (t.tuplet) k.append(el('span', 'tk-tup', t.tuplet));
    if (t.fermata) k.append(el('span', 'tk-ferm', '𝄐'));
    return k;
  }

  function lyricText(ly) { return ly.text + (ly.syllabic === 'begin' || ly.syllabic === 'middle' ? ' –' : ''); }

  /**
   * @param {HTMLElement} host
   * @param {object} res   hasil NotasiConvert.convert
   * @param {object} opts  { chordDisplay: 'symbol'|'roman'|'number'|'all' }
   */
  function render(host, res, opts = {}) {
    const chordDisplay = opts.chordDisplay || 'all';
    host.innerHTML = '';
    const showChords = res.harmonySource !== 'off' && res.measures.some(m => m.chords.length);

    // ukuran baris (em) per garis musik
    const lineRows = res.lines.map(l => {
      let maxUl = 0;
      res.measures.forEach(m => (m.cells[l.key] || []).forEach(b => b.forEach(t => { if (t.underlines > maxUl) maxUl = t.underlines; })));
      const verses = l.verses.length;
      return { numbers: (0.55 + l.maxStack * 1.18 + maxUl * 0.2 + 0.55).toFixed(2) + 'em', verses };
    });
    const rowsTpl = [];
    if (showChords) rowsTpl.push(chordDisplay === 'all' ? '2.5em' : '1.7em');
    lineRows.forEach(r => { rowsTpl.push(r.numbers); for (let v = 0; v < r.verses; v++) rowsTpl.push('1.35em'); });
    rowsTpl.push('0.6em');

    const sheet = el('div', 'sheet');
    const tokenIndex = [];
    const pairs = [];

    res.measures.forEach((m, mi) => {
      const M = el('div', 'm');
      if (m.repeatStart) M.classList.add('m--rep-start');
      if (m.repeatEnd) M.classList.add('m--rep-end');
      if (mi === res.measures.length - 1 || m.barRight === 'light-heavy') M.classList.add('m--final');
      else if (m.barRight === 'light-light') M.classList.add('m--double');
      M.style.gridTemplateColumns = `repeat(${m.nBeats}, auto)`;
      M.style.gridTemplateRows = rowsTpl.join(' ');
      M.dataset.measure = m.number;

      const no = el('button', 'm-no', m.pickup ? '·' : m.number);
      no.type = 'button';
      no.dataset.mi = mi;
      no.title = 'Tandai birama ini sudah dicek';
      M.append(no);
      if (opts.checked && opts.checked.has(mi)) M.classList.add('m--ok');
      if (m.rhythmWarn && m.rhythmWarn.length) {
        M.classList.add('m--warn');
        const w = el('span', 'm-warn', '⚠ ketukan');
        w.title = m.rhythmWarn.map(x => `jumlah ketukan suara ${x.voice.replace('|', '/')} = ${x.end.num()} dari ${x.full.num()}`).join('\n') + '\nKemungkinan salah baca durasi atau not hilang — periksa birama ini.';
        M.append(w);
      }
      if (m.keyChange) M.append(el('span', 'm-key', 'do = ' + root.NotasiTheory.pitchName(m.tonic.step, m.tonic.alter)));
      if (m.timeChange) M.append(el('span', 'm-key m-key--time', m.time.beats + '/' + m.time.beatType));

      let row = 1;
      if (showChords) {
        const byBeat = {};
        m.chords.forEach(c => { (byBeat[c.beat] = byBeat[c.beat] || []).push(c); });
        for (const b in byBeat) {
          const cell = el('div', 'ch-cell');
          cell.style.gridRow = String(row); cell.style.gridColumn = String(Number(b) + 1);
          byBeat[b].forEach(c => {
            const ch = el('span', 'ch ch--' + c.source);
            ch.title = (c.source === 'score' ? 'Dari partitur' : 'Hasil analisis') + ' · ' + c.symbol + ' · ' + c.roman;
            if (chordDisplay === 'symbol' || chordDisplay === 'all') ch.append(el('b', 'ch-sym', c.symbol));
            if (chordDisplay === 'roman' || chordDisplay === 'all') ch.append(el('small', 'ch-rom', c.roman));
            if (chordDisplay === 'number') ch.append(el('b', 'ch-sym', c.number));
            cell.append(ch);
          });
          M.append(cell);
        }
        row++;
      }

      res.lines.forEach((l, li) => {
        const beats = m.cells[l.key];
        const verses = l.verses;
        for (let b = 0; b < m.nBeats; b++) {
          const cell = el('div', 'bt');
          cell.style.gridRow = String(row); cell.style.gridColumn = String(b + 1);
          if (li === 0) cell.classList.add('bt--lead');
          const lyCells = verses.map((v, vi) => { const c = el('div', 'ly'); c.style.gridRow = String(row + 1 + vi); c.style.gridColumn = String(b + 1); return c; });
          if (beats) {
            beats[b].forEach(t => {
              const tk = token(t);
              cell.append(tk);
              tokenIndex.push({ t, node: tk, line: li });
              const spans = verses.map((v, vi) => {
                const ly = t.lyrics.find(x => x.number === v);
                const s = el('span', 'ly-s', ly ? lyricText(ly) : '');
                lyCells[vi].append(s);
                return s;
              });
              if (spans.length) pairs.push({ tk, spans });
            });
          }
          M.append(cell, ...lyCells);
        }
        row += 1 + verses.length;
      });
      sheet.append(M);
    });

    host.append(sheet);
    // samakan lebar suku kata dengan token di atasnya
    const align = () => alignLyrics(pairs);
    requestAnimationFrame(align);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
    return { tokenIndex, sheet };
  }

  function alignLyrics(pairs) {
    pairs.forEach(p => { p.tk.style.minWidth = ''; p.spans.forEach(s => { s.style.minWidth = ''; }); });
    const widths = pairs.map(p => Math.max(p.tk.offsetWidth, ...p.spans.map(s => s.offsetWidth)));
    pairs.forEach((p, i) => { p.tk.style.minWidth = widths[i] + 'px'; p.spans.forEach(s => { s.style.minWidth = widths[i] + 'px'; }); });
  }

  root.NotasiRender = { render, alignLyrics };
})(typeof window !== 'undefined' ? window : globalThis);
