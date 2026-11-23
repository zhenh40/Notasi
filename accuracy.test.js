// Uji ketepatan konversi. Jalankan: node tests/accuracy.test.js
const { chromium } = require('playwright');
const path = require('path');
const zlib = require('zlib');

// --- zip kecil (deflate) untuk menguji .mxl tanpa dependensi ---
function crc32(buf) { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function zip(files) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, str] of Object.entries(files)) {
    const data = Buffer.from(str); const comp = zlib.deflateRawSync(data); const nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, comp); centrals.push(ch, nb); off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(centrals); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  for (const f of ['theory', 'musicxml', 'harmony', 'convert', 'demo']) await page.addScriptTag({ path: path.join(__dirname, '..', 'js', f + '.js') });

  const demoXml = await page.evaluate(() => NotasiDemo.xml());
  const mxl = zip({ 'META-INF/container.xml': '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>', 'score.xml': demoXml }).toString('base64');

  const results = await page.evaluate(async (mxlB64) => {
    const out = [];
    const eq = (name, got, exp) => out.push({ name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp });
    const fmt = (t) => t.kind === 'rest' ? '0' + '_'.repeat(t.underlines) : t.kind === 'hold' ? '.' + '_'.repeat(t.underlines)
      : t.numbers.map(n => (n.accidental > 0 ? '#'.repeat(n.accidental) : 'b'.repeat(-n.accidental)) + n.degree + (n.octave > 0 ? "'".repeat(n.octave) : ','.repeat(-n.octave))).join('+') + '_'.repeat(t.underlines);
    const run = (spec, opts) => {
      const xml = NotasiDemo.buildXML(Object.assign({ title: 't', composer: 'c', tempo: 90 }, spec));
      const r = NotasiConvert.convert(NotasiMusicXML.parse(xml), opts || {});
      return { r, line: (li = 0) => r.measures.map(m => (m.cells[r.lines[li].key] || []).map(b => b.map(fmt).join(' ')).join(' | ')) };
    };
    const one = (fifths, mode, measures, opts) => run({ fifths, mode, beats: 4, beatType: 4, parts: [{ name: 'A', clef: ['G', 2], measures }] }, opts);

    // 1. Tangga C mayor
    eq('C mayor naik', one(0, 'major', ['C4:q D4:q E4:q F4:q', 'G4:q A4:q B4:q C5:q']).line(), ['1 | 2 | 3 | 4', '5 | 6 | 7 | 1\'']);
    // 2. Bb mayor: Eb = 4, E natural = #4, Bb3 = 1 (oktaf acuan dipilih otomatis)
    eq('Bb mayor kres/mol', one(-2, 'major', ['Bb4:q Eb5:q E5:q F5:q']).line(), ['1 | 4 | #4 | 5']);
    // 3. Enharmonik tidak tertukar: E mayor, D# = 7, Eb = b1
    eq('Enharmonik', one(4, 'major', ['E4:q D#4:q Eb4:q E4:q']).line(), ["1 | 7, | b1 | 1"]);
    // 4. A minor, la-based (do = C): A = 6, G# = #5
    eq('A minor la-based', one(0, 'minor', ['A4:q B4:q C5:q G#4:q']).line(), ['6 | 7 | 1\' | #5']);
    // 5. A minor, do-based (do = A): A = 1, C = 3, G# = #7
    eq('A minor do-based', one(0, 'minor', ['A4:q B4:q C5:q G#4:q'], { minorMode: 'do' }).line(), ['1 | 2 | 3 | #7,']);
    // 6. Ritme: titik, seperenambelas, diam, ikat dalam birama
    eq('Ritme', one(0, 'major', ['C4:q. D4:e E4:e. F4:s r:q', 'G4:h~ G4:q r:e A4:s B4:s']).line(),
      ['1 | ._ 2_ | 3_ .__ 4__ | 0', '5 | . | . | 0_ 6__ 7__']);
    // 7. Not panjang lintas ketukan & sinkop
    eq('Sinkop', one(0, 'major', ['C4:e D4:q E4:q F4:q G4:e']).line(), ['1_ 2_ | ._ 3_ | ._ 4_ | ._ 5_']);
    // 8. Not penuh & 1/2 bertitik
    eq('Not penuh', one(0, 'major', ['C4:w', 'E4:h. r:q']).line(), ['1 | . | . | .', '3 | . | . | 0']);
    // 9. Birama 6/8 : 1/4 bertitik = 1 ketukan + 1/8
    const six = run({ fifths: 0, mode: 'major', beats: 6, beatType: 8, parts: [{ name: 'A', clef: ['G', 2], measures: ['C4:q. D4:e E4:e F4:e'] }] });
    eq('6/8', six.line(), ['1 | ._ 2_ | 3_ 4_']);
    // 10. Akor bertumpuk: urut nada tertinggi di atas
    eq('Akor bertumpuk', one(0, 'major', ['C4+E4+G4:h C5+G4:h']).line(), ['5+3+1 | . | 1\'+5 | .']);

    // 11. Harmoni dari tag <harmony> dibaca persis
    const hx = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <harmony><root><root-step>F</root-step></root><kind>major</kind></harmony><note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
      <harmony><root><root-step>B</root-step><root-alter>-1</root-alter></root><kind>major-seventh</kind><bass><bass-step>D</bass-step></bass></harmony><note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><type>half</type></note></measure>
      <measure number="2"><harmony><root><root-step>G</root-step></root><kind>minor-seventh</kind></harmony><harmony><offset>2</offset><root><root-step>C</root-step></root><kind>dominant</kind><degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree></harmony><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;
    const hr = NotasiConvert.convert(NotasiMusicXML.parse(hx), {});
    eq('Sumber harmoni', hr.harmonySource, 'score');
    eq('Simbol akor partitur', hr.measures.map(m => m.chords.map(c => c.symbol + '@' + c.pos)), [['F@0', 'B♭maj7/D@2'], ['Gm7@0', 'C7(add♭9)@2']]);
    eq('Romawi akor partitur', hr.measures.map(m => m.chords.map(c => c.roman)), [['I', 'IVmaj7/6'], ['ii7', 'V7']]);

    // 12. Birama pickup 3/4: ketukan rata kanan
    const pk = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1"><measure number="0" implicit="yes"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note></measure><measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch><duration>6</duration><type>half</type><dot/></note></measure></part></score-partwise>`;
    const pr = NotasiConvert.convert(NotasiMusicXML.parse(pk), {});
    eq('Pickup', pr.measures.map(m => (m.cells[pr.lines[0].key]).map(b => b.map(fmt).join(' ')).join(' | ')), [' |  | 5', "1' | . | ."]);

    // 13. .mxl terkompresi
    const bytes = Uint8Array.from(atob(mxlB64), c => c.charCodeAt(0));
    const text = await NotasiMusicXML.readFile(new File([bytes], 'demo.mxl'));
    const mr = NotasiConvert.convert(NotasiMusicXML.parse(text), {});
    eq('.mxl dibaca', [mr.title, mr.measures.length], ['Senja di Pelabuhan', 8]);
    // 14. Analisis harmoni demo
    eq('Analisis demo', mr.measures.map(m => m.chords.map(c => c.symbol).join(' ')), ['G', 'Em', 'C', 'D7', 'A7', 'D', 'F D7', 'G']);
    return out;
  }, mxl);

  let fail = 0;
  for (const r of results) {
    console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : `\n      dapat: ${JSON.stringify(r.got)}\n      harap: ${JSON.stringify(r.exp)}`));
    if (!r.ok) fail++;
  }
  console.log(`\n${results.length - fail}/${results.length} lulus`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
