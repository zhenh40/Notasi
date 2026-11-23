// Jalankan pipeline NOTASI (di Chromium) atas daftar berkas, simpan nada hasil konversi.
// node notasi_actual.js <daftar-berkas.txt> <keluaran.json>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const files = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  for (const f of ['theory', 'musicxml', 'harmony', 'convert']) await page.addScriptTag({ path: path.join(__dirname, '..', '..', 'js', f + '.js') });
  const res = {};
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64');
    res[f] = await page.evaluate(async ({ b64, name }) => {
      try {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const text = await NotasiMusicXML.readFile(new File([bytes], name));
        const r = NotasiConvert.convert(NotasiMusicXML.parse(text), { minorMode: 'la' });
        const out = [];
        r.measures.forEach((m, mi) => {
          for (const k in m.cells) {
            const cells = m.cells[k]; if (!cells) continue;
            cells.forEach(arr => arr.forEach(t => {
              if (!(t.kind === 'note' || (t.kind === 'hold' && t.tieCont))) return;
              const local = t.start.sub(m.shift);
              t.numbers.forEach(n => out.push([mi, local.toString(), t.soundDur.toString(), n.midi, n.degree, n.accidental]));
            }));
          }
        });
        return { notes: out, harmonySource: r.harmonySource, chords: r.measures.reduce((a, m) => a + m.chords.length, 0) };
      } catch (e) { return { error: String(e.message || e).slice(0, 200) }; }
    }, { b64, name: path.basename(f) });
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(res));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
