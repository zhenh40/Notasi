// Visualisasi pengenalan simbol. node sym_debug.js IMG_URL OUT_PNG [cropFrac]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto('http://127.0.0.1:8790/home/user/notasi/tests/omr/harness.html');
  const r = await p.evaluate(async (url) => {
    const logs = [];
    const t0 = performance.now();
    const { gray, w, h } = await loadGray(url);
    const prep = NotasiOMR.prepare(gray, w, h, m => logs.push(m));
    const an = NotasiOMR.analyzeStaves(prep, m => logs.push(m));
    const t1 = performance.now();
    const ctx = NotasiOMRSymbols.buildContext(prep, an);
    const res = NotasiOMRSymbols.recognizeSymbols(ctx, m => logs.push(m));
    const t2 = performance.now();
    prep.debugImg = an.nostaff;
    const png = await debugPNG(prep, g => {
      g.lineWidth = 2;
      for (const hd of res.heads) {
        g.strokeStyle = hd.kind === 'black' ? 'red' : (hd.kind === 'half' ? 'blue' : 'purple');
        g.strokeRect(hd.x0, hd.y - 0.5 * ctx.I, hd.x1 - hd.x0, ctx.I);
      }
      for (const s of res.stems) {
        g.strokeStyle = 'lime'; g.beginPath(); g.moveTo(s.x, s.yHead); g.lineTo(s.x, s.yTip); g.stroke();
        g.fillStyle = s.beam.kind === 'beam' ? 'magenta' : 'darkorange'; g.font = 'bold 14px sans-serif';
        if (s.beam.n) g.fillText((s.beam.kind === 'beam' ? 'b' : 'f') + s.beam.n, s.x + 3, s.yTip + (s.dir === 'up' ? -4 : 14));
      }
      for (const b of res.bars) {
        const sys = an.systems[b.sys];
        g.fillStyle = 'rgba(0,160,255,0.5)'; g.fillRect(b.x0 - 2, sys[0].top(b.x) - 10, b.x1 - b.x0 + 4, sys[sys.length - 1].bottom(b.x) - sys[0].top(b.x) + 20);
      }
      g.font = 'bold 13px sans-serif';
      for (const s of res.symbols) {
        if (s.type === 'other') continue;
        const col = { dot: 'red', rest: 'green', acc: 'blue', clef: 'brown', digit: 'teal', arc: 'orange', tuplet: 'pink' }[s.type] || 'black';
        g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(s.x0 - 1, s.y0 - 1, s.x1 - s.x0 + 2, s.y1 - s.y0 + 2);
        g.fillStyle = col;
        const lbl = s.type === 'dot' ? '' : (s.name || s.type).replace('accidental', '').replace('timeSig', 'T').replace('rest', 'r');
        g.fillText(lbl, s.x0, s.y1 + 13);
      }
    });
    const cnt = {};
    res.symbols.forEach(s => { const k = s.type === 'other' ? 'other' : (s.name || s.type); cnt[k] = (cnt[k] || 0) + 1; });
    return { logs, png, ms: [Math.round(t1 - t0), Math.round(t2 - t1)], cnt, heads: { black: res.heads.filter(h => h.kind === 'black').length, half: res.heads.filter(h => h.kind === 'half').length, whole: res.heads.filter(h => h.kind === 'whole').length } };
  }, url);
  fs.writeFileSync(out, Buffer.from(r.png, 'base64'));
  delete r.png;
  console.log(JSON.stringify(r));
  await b.close();
})();
