// Recall/presisi deteksi kepala not vs posisi SVG. node head_recall.js HEADS_JSON IMG_DIR [names...]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [headsPath, imgDir, ...names] = process.argv.slice(2);
  const GT = JSON.parse(fs.readFileSync(headsPath, 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:8790/home/user/notasi/tests/omr/harness.html');
  const list = names.length ? names : Object.keys(GT);
  let tot = { gt: 0, hit: 0, det: 0, fp: 0, kinds: {} };
  for (const n of list) {
    const r = await p.evaluate(async ({ url, gt }) => {
      const { gray, w, h } = await loadGray(url);
      const prep = NotasiOMR.prepare(gray, w, h);
      const an = NotasiOMR.analyzeStaves(prep);
      const ctx = NotasiOMRSymbols.buildContext(prep, an);
      ctx.debug = [];
      const rec = NotasiOMRSymbols.recognizeSymbols(ctx);
      const I = ctx.I;
      const G = gt.map(q => ({ x: q.x * prep.scale, y: q.y * prep.scale, kind: q.kind }));
      const used = new Set();
      const miss = [];
      let hit = 0; const kinds = {};
      for (const g of G) {
        kinds[g.kind] = kinds[g.kind] || { n: 0, hit: 0, wrongKind: 0 };
        kinds[g.kind].n++;
        const d = rec.heads.find(hd => !used.has(hd) && Math.abs(hd.x - g.x) < 0.8 * I && Math.abs(hd.y - g.y) < 0.4 * I);
        if (d) { used.add(d); hit++; kinds[g.kind].hit++; if (d.kind !== g.kind) kinds[g.kind].wrongKind++; }
        else {
          const why = ctx.debug.filter(q => Math.abs(q.x - g.x) < 0.8 * I && Math.abs(q.y - g.y) < 0.6 * I).map(q => q.why + (q.extra !== undefined && q.extra !== null ? '(' + (+q.extra).toFixed(2) + ')' : ''));
          miss.push({ x: Math.round(g.x), y: Math.round(g.y), kind: g.kind, why: why.length ? why.join('/') : 'noPeak' });
        }
      }
      const fp = rec.heads.filter(hd => !used.has(hd)).map(hd => ({ x: Math.round(hd.x), y: Math.round(hd.y), kind: hd.kind, p: hd.p }));
      return { n: G.length, hit, det: rec.heads.length, fp, miss, kinds };
    }, { url: 'http://127.0.0.1:8790' + imgDir + '/' + n, gt: GT[n] });
    tot.gt += r.n; tot.hit += r.hit; tot.det += r.det; tot.fp += r.fp.length;
    for (const [k, v] of Object.entries(r.kinds)) { const t = tot.kinds[k] = tot.kinds[k] || { n: 0, hit: 0, wrongKind: 0 }; t.n += v.n; t.hit += v.hit; t.wrongKind += v.wrongKind; }
    r.miss.forEach(m => { tot.why = tot.why || {}; const k = m.why.split('(')[0].split('/')[0]; tot.why[k] = (tot.why[k] || 0) + 1; });
    console.log(`${n}: recall ${(r.hit / r.n * 100).toFixed(1)}% (${r.hit}/${r.n})  salah-deteksi ${r.fp.length}  miss: ${r.miss.slice(0, 8).map(m => `${m.kind}@${m.x},${m.y}:${m.why}`).join(' ')}  fp: ${r.fp.slice(0, 12).map(m => `${m.kind}@${m.x},${m.y}`).join(' ')}`);
  }
  console.log(`\nTOTAL recall kepala ${(tot.hit / tot.gt * 100).toFixed(2)}%  salah-deteksi ${tot.fp} dari ${tot.det}`);
  console.log('  alasan terlewat:', JSON.stringify(tot.why));
  for (const [k, v] of Object.entries(tot.kinds)) console.log(`  ${k}: ${v.hit}/${v.n} (${(v.hit / v.n * 100).toFixed(1)}%), jenis tertukar ${v.wrongKind}`);
  await b.close();
})();
