// Debug kandidat kepala kosong. node hollow_debug.js IMG_URL OUT_PNG x0 y0 x1 y1 (koordinat ternormalisasi, opsional)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out, ...crop] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://127.0.0.1:8790/home/user/notasi/tests/omr/harness.html');
  const r = await p.evaluate(async ({ url, crop }) => {
    const { gray, w, h } = await loadGray(url);
    const prep = NotasiOMR.prepare(gray, w, h);
    const an = NotasiOMR.analyzeStaves(prep);
    const ctx = NotasiOMRSymbols.buildContext(prep, an);
    const I = ctx.I;
    // ulangi langkah deteksi kepala kosong dengan log
    const inv = new Uint8Array(ctx.w * ctx.h); for (let i = 0; i < inv.length; i++) inv[i] = ctx.img[i] ? 0 : 1;
    const { comps } = NotasiOMRImage.label(inv, ctx.w, ctx.h, true);
    const log = [];
    for (let i = 1; i < comps.length; i++) {
      const c = comps[i];
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (c.x0 <= 0 || c.y0 <= 0 || c.x1 >= ctx.w - 1 || c.y1 >= ctx.h - 1) continue;
      if (c.area > 2 * I * I || c.area < 0.02 * I * I) continue;
      const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      if (crop.length && (cx < crop[0] * ctx.w || cx > crop[2] * ctx.w || cy < crop[1] * ctx.h || cy > crop[3] * ctx.h)) continue;
      const loc = NotasiOMRSymbols.staffFor(ctx, cx, cy);
      log.push({ x: Math.round(cx), y: Math.round(cy), bw, bh, area: c.area, p: loc ? +loc.p.toFixed(2) : null, si: loc ? loc.si : null });
    }
    return { log, I, w: ctx.w, h: ctx.h };
  }, { url, crop: crop.map(Number) });
  console.log('I', r.I.toFixed(1));
  r.log.forEach(l => console.log(JSON.stringify(l)));
  await b.close();
})();
