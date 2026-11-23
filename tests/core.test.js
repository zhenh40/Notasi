// Jalankan: node tests/core.test.js  (memakai Chromium Playwright untuk DOMParser)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  for (const f of ['theory', 'musicxml', 'harmony', 'convert', 'demo']) await page.addScriptTag({ path: path.join(__dirname, '..', 'js', f + '.js') });
  const res = await page.evaluate(() => {
    const score = NotasiMusicXML.parse(NotasiDemo.xml());
    const r = NotasiConvert.convert(score, { minorMode: 'la' });
    const fmt = (t) => {
      if (t.kind === 'rest') return '0' + '_'.repeat(t.underlines);
      if (t.kind === 'hold') return '.' + '_'.repeat(t.underlines);
      return t.numbers.map(n => (n.accidental > 0 ? '#' : n.accidental < 0 ? 'b' : '') + n.degree + (n.octave > 0 ? "'".repeat(n.octave) : n.octave < 0 ? ','.repeat(-n.octave) : '')).join('+') + '_'.repeat(t.underlines) + (t.tuplet ? '(3)' : '');
    };
    return {
      header: [r.keyLabel, 'do=' + r.doLabel, r.harmonySource, r.lines.map(l => l.label + ' ref' + l.refOctave).join(' / ')],
      measures: r.measures.map(m => ({
        chords: m.chords.map(c => c.symbol + '[' + c.roman + '@' + c.pos + ']').join(' '),
        lines: r.lines.map(l => (m.cells[l.key] || []).map(b => b.map(fmt).join(' ')).join(' | '))
      }))
    };
  });
  console.log(res.header.join('  ·  '));
  res.measures.forEach((m, i) => { console.log(`m${i + 1}  ${m.chords}`); m.lines.forEach(l => console.log('     ' + l)); });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
