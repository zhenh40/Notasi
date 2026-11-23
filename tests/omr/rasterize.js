// SVG (Verovio) -> PNG lewat Chromium. node rasterize.js jobs.json
// jobs.json: [{svg, png, scale}]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch();
  const ctxs = {};
  for (const j of jobs) {
    const svg = fs.readFileSync(j.svg, 'utf8');
    const m = svg.match(/<svg[^>]*width="(\d+)px"[^>]*height="(\d+)px"/);
    const w = Number(m[1]), h = Number(m[2]);
    const key = w + 'x' + h + '@' + j.scale;
    if (!ctxs[key]) ctxs[key] = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: j.scale });
    const p = await ctxs[key].newPage();
    await p.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
    await p.screenshot({ path: j.png, clip: { x: 0, y: 0, width: w, height: h } });
    await p.close();
  }
  await b.close();
  console.log('rasterized', jobs.length);
})().catch(e => { console.error(e); process.exit(1); });
