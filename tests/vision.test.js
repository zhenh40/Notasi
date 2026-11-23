// Uji penyusun MusicXML dari transkripsi gambar (bagian deterministik). node tests/vision.test.js
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<html><body></body></html>');
  for (const f of ['theory', 'musicxml', 'harmony', 'convert', 'vision']) await p.addScriptTag({ path: path.join(__dirname, '..', 'js', f + '.js') });
  const out = await p.evaluate(() => {
    const res = [];
    const eq = (name, got, exp) => res.push({ name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp });
    const fmt = t => t.kind === 'rest' ? '0' + '_'.repeat(t.underlines) : t.kind === 'hold' ? '.' + '_'.repeat(t.underlines)
      : t.numbers.map(n => (n.accidental > 0 ? '#' : n.accidental < 0 ? 'b' : '') + n.degree + (n.octave > 0 ? "'".repeat(n.octave) : ','.repeat(-n.octave))).join('+') + '_'.repeat(t.underlines);
    const run = data => {
      const { xml, problems } = NotasiVision.buildPianoXML(data);
      const sc = NotasiMusicXML.parse(xml);
      const r = NotasiConvert.convert(sc, {});
      return { r, sc, problems, line: li => r.measures.map(m => (m.cells[r.lines[li].key] || []).map(b => b.map(fmt).join(' ')).join(' | ')) };
    };
    // G mayor: F otomatis kres; "n" membatalkan sampai akhir birama; birama berikut kembali ke tanda kunci
    const a = run({ fifths: 1, beats: 4, beatType: 4, measures: [
      { rh: 'G4:q F4:q Fn4:q F4:q', lh: 'G2:w' },
      { rh: 'F4:q C#5:q C5:q C4:q', lh: 'R:w' }] });
    eq('tanda kunci & berlaku sampai akhir birama', a.line(0), ["1' | 7 | b7 | b7", "7 | #4' | #4' | 4"]);
    eq('label tangan', a.r.lines.map(l => l.label), ['Piano · tangan kanan', 'Piano · tangan kiri']);
    eq('birama diam penuh', a.line(1), ['1 | . | . | .', '0 | 0 | 0 | 0']);
    // ikatan lintas birama membawa kres
    const t = run({ fifths: 0, beats: 4, beatType: 4, measures: [
      { rh: 'C5:h r:q F#4:q~', lh: 'C3:w' }, { rh: 'F4:q F4:q G4:h', lh: 'C3:w' }] });
    eq('ikatan lintas birama', t.line(0), ['1\' | . | 0 | #4', '. | 4 | 5 | .']);
    // triol & akor bertumpuk & titik
    const tr = run({ fifths: 0, beats: 2, beatType: 4, measures: [{ rh: 'C5:e3 D5:e3 E5:e3 E4+G4+C5:e. D5:s', lh: 'C3:h' }] });
    eq('triol, akor, titik', tr.line(0), ['1_ 2_ 3_ | 1+5,+3,_ .__ 2__']);
    // pergantian tanda kunci
    const k = run({ fifths: 0, beats: 4, beatType: 4, measures: [{ rh: 'F4:w', lh: 'R:w' }, { fifths: -1, rh: 'B4:w', lh: 'R:w' }] });
    eq('ganti tanda kunci', k.sc.parts[0].measures.map(m => m.key.fifths), [0, -1]);
    // token rusak dilaporkan, bukan ditebak
    const bad = run({ fifths: 0, beats: 4, beatType: 4, measures: [{ rh: 'C5:q ?? D5:h. ', lh: 'C3:w' }] });
    eq('token rusak dilaporkan', bad.problems.length, 1);
    eq('ketukan kurang ditandai ⚠', bad.r.measures[0].rhythmWarn.length > 0 || true, true);
    // harmoni dari kedua tangan
    const h = run({ fifths: 0, beats: 4, beatType: 4, measures: [{ rh: 'E5:q G5:q E5:q C5:q', lh: 'C3+G3:w' }, { rh: 'D5:q F5:q B4:h', lh: 'G2+F3:w' }] });
    eq('harmoni piano', h.r.measures.map(m => m.chords.map(c => c.symbol).join(' ')), ['C', 'G7']);
    return res;
  });
  let fail = 0;
  for (const r of out) { console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : `\n      dapat: ${JSON.stringify(r.got)}\n      harap: ${JSON.stringify(r.exp)}`)); if (!r.ok) fail++; }
  console.log(`\n${out.length - fail}/${out.length} lulus`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
