// Uji deteksi paranada & visualisasi. node staff_debug.js IMG_URL OUT_PNG
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://127.0.0.1:8790/home/user/notasi/tests/omr/harness.html');
  const r = await p.evaluate(async (url) => {
    const logs = [];
    const t0 = performance.now();
    const { gray, w, h } = await loadGray(url);
    const prep = NotasiOMR.prepare(gray, w, h, m => logs.push(m));
    const t1 = performance.now();
    const an = NotasiOMR.analyzeStaves(prep, m => logs.push(m));
    const t2 = performance.now();
    prep.debugImg = an.nostaff;
    const png = await debugPNG(prep, g => {
      an.staves.forEach((st, si) => {
        g.strokeStyle = 'rgba(255,0,0,0.8)'; g.lineWidth = 1;
        for (let k = 0; k < 5; k++) { g.beginPath(); for (let x = st.x0; x <= st.x1; x += 10) { const y = st.lineY(k, x); x === st.x0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
        g.fillStyle = 'blue'; g.font = '20px sans-serif'; g.fillText('S' + si, st.x0 - 40, st.yMid);
      });
      an.systems.forEach((sys, i) => { const a = sys[0], z = sys[sys.length - 1]; g.strokeStyle = 'green'; g.lineWidth = 3; g.strokeRect(a.x0 - 8, a.top(a.x0) - 10, 4, z.bottom(z.x0) - a.top(a.x0) + 20); });
      g.fillStyle = 'rgba(255,140,0,0.7)';
      an.ledgers.forEach(l => { const st = an.staves[l.staff]; g.fillRect(l.x0, st.yAt(l.p, l.x0) - 2, l.x1 - l.x0, 4); });
    });
    return { logs, png, ms: [Math.round(t1 - t0), Math.round(t2 - t1)], n: an.staves.length, sys: an.systems.map(s => s.length), I: an.staves.map(s => s.I.toFixed(1)), w: prep.w, h: prep.h };
  }, url);
  fs.writeFileSync(out, Buffer.from(r.png, 'base64'));
  delete r.png;
  console.log(JSON.stringify(r));
  await b.close();
})();
