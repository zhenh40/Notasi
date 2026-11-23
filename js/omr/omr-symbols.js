/* ==========================================================================
   NOTASI OMR — omr-symbols.js
   Pengenalan simbol pada gambar yang garis paranadanya sudah dihapus:
   kepala not (penuh/kosong/bulat), tangkai, balok & bendera, titik, garis birama,
   tanda diam, kres/mol/pugar, kunci G/F/C, tanda sukat, tali (tie).
   Cetakan simbol diambil dari 4 font SMuFL (NotasiGlyphs) dan digambar ulang
   sesuai ukuran paranada pada foto.
   ========================================================================== */
(function (root) {
  'use strict';
  const IM = root.NotasiOMRImage;
  const FONTS = ['Bravura', 'Leipzig', 'Leland', 'Gootville', 'Petaluma'];

  /* ---------------- cetakan simbol ---------------- */
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  const maskCache = new Map();
  function glyphMask(font, name, I, mul) {
    const key = font + '|' + name + '|' + I.toFixed(2) + '|' + mul;
    if (maskCache.has(key)) return maskCache.get(key);
    const fd = root.NotasiGlyphs && root.NotasiGlyphs[font];
    const g = fd && fd.g[name];
    if (!g) { maskCache.set(key, null); return null; }
    const s = I * 4 / fd.upm * mul;
    const [bx, by, bw, bh] = g.b;
    const pad = 2;
    const W = Math.max(1, Math.ceil(bw * s) + 2 * pad), H = Math.max(1, Math.ceil(bh * s) + 2 * pad);
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    x.setTransform(s, 0, 0, -s, pad - bx * s, pad + (by + bh) * s);
    x.fill(new Path2D(g.d));
    const d = x.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    const pts = [];
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      if (d[(yy * W + xx) * 4 + 3] >= 128) {
        m[yy * W + xx] = 1; pts.push(xx, yy);
        if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
      }
    }
    // rongga dalam: piksel bukan-tinta yang tidak terjangkau dari tepi mask
    const outside = new Uint8Array(W * H);
    const stack = [];
    for (let xx = 0; xx < W; xx++) { stack.push(xx, 0, xx, H - 1); }
    for (let yy = 0; yy < H; yy++) { stack.push(0, yy, W - 1, yy); }
    while (stack.length) {
      const yy = stack.pop(), xx = stack.pop();
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = yy * W + xx;
      if (outside[q] || m[q]) continue;
      outside[q] = 1;
      stack.push(xx + 1, yy, xx - 1, yy, xx, yy + 1, xx, yy - 1);
    }
    const inner = [];
    for (let q = 0; q < W * H; q++) if (!m[q] && !outside[q]) inner.push(q % W, (q / W) | 0);
    const t = {
      inner: new Int16Array(inner), innerArea: inner.length / 2,
      font, name, mul, w: W, h: H, m, pts: new Int16Array(pts), area: pts.length / 2,
      ox: pad - bx * s, oy: pad + (by + bh) * s,           // titik asal glyph (posisi nada) di dalam mask
      bx0: x0, by0: y0, bx1: x1, by1: y1,                    // kotak tinta di dalam mask
      cw: x1 - x0 + 1, ch: y1 - y0 + 1
    };
    maskCache.set(key, t);
    return t;
  }
  function templates(names, I, muls) {
    const out = [];
    for (const n of names) for (const f of FONTS) for (const mul of muls) { const t = glyphMask(f, n, I, mul); if (t && t.area) out.push(t); }
    return out;
  }

  /* ---------------- konteks ---------------- */
  function buildContext(prep, an) {
    const { w, h, bin, I, lt } = prep;
    const img = an.nostaff;
    const ctx = {
      w, h, I, lt, bin, img, staves: an.staves, systems: an.systems, ledgers: an.ledgers,
      S: IM.integral(img, w, h), SB: IM.integral(bin, w, h)
    };
    ctx.T = {
      black: templates(['noteheadBlack'], I, [0.92, 1, 1.08]),
      half: templates(['noteheadHalf'], I, [0.92, 1, 1.08]),
      whole: templates(['noteheadWhole'], I, [0.92, 1, 1.08])
    };
    ctx.staffIndex = new Map(an.staves.map((s, i) => [s, i]));
    ctx.sysOf = new Map();
    an.systems.forEach((sys, k) => sys.forEach((s, j) => ctx.sysOf.set(an.staves.indexOf(s), { sys: k, pos: j, n: sys.length })));
    return ctx;
  }

  const clampBox = (ctx, x0, y0, x1, y1) => [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(ctx.w, Math.ceil(x1)), Math.min(ctx.h, Math.ceil(y1))];
  function frac(ctx, S, x0, y0, x1, y1) {
    const [a, b, c, d] = clampBox(ctx, x0, y0, x1, y1);
    if (c <= a || d <= b) return 0;
    return IM.boxSum(S, ctx.w, a, b, c, d) / ((c - a) * (d - b));
  }

  function hasLedger(ctx, y, x) {
    return ctx.ledgers.some(l => Math.abs(l.y - y) <= 0.3 * ctx.I && x >= l.x0 - 0.45 * ctx.I && x <= l.x1 + 0.45 * ctx.I);
  }
  /** Paranada untuk titik (x,y): pilih yang membutuhkan garis bantu paling sedikit (didukung garis bantu terdeteksi). */
  function staffFor(ctx, x, y) {
    let best = null;
    ctx.staves.forEach((st, si) => {
      if (x < st.x0 - ctx.I || x > st.x1 + ctx.I) return;
      const p = st.pAt(y, x);
      if (p < -13 || p > 21) return;
      const out = p < 0 ? -p : (p > 8 ? p - 8 : 0);
      // dukungan garis bantu
      let need = 0, have = 0;
      const pr = Math.round(p);
      if (pr <= -2 || pr >= 10) {
        const list = [];
        if (pr <= -2) for (let q = -2; q >= pr; q -= 2) list.push(q);
        else for (let q = 10; q <= pr; q += 2) list.push(q);
        need = list.length;
        for (const q of list) if (hasLedger(ctx, st.yAt(q, x), x)) have++;
      }
      const cost = out + (need - have) * 3;
      if (!best || cost < best.cost) best = { st, si, p, cost };
    });
    return best;
  }

  /* ---------------- pencocokan cetakan ---------------- */
  function recallAt(ctx, t, left, top, src) {
    const { w, h } = ctx;
    const img = src || ctx.img;
    if (left < 0 || top < 0 || left + t.w > w || top + t.h > h) {
      let hit = 0;
      for (let k = 0; k < t.pts.length; k += 2) {
        const xx = left + t.pts[k], yy = top + t.pts[k + 1];
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && img[yy * w + xx]) hit++;
      }
      return hit / t.area;
    }
    let hit = 0;
    const base = top * w + left;
    for (let k = 0; k < t.pts.length; k += 2) hit += img[base + t.pts[k + 1] * w + t.pts[k]];
    return hit / t.area;
  }

  /** Cocokkan cetakan kepala not di sekitar (cx, cy): kembalikan penempatan terbaik. */
  function innerWhite(ctx, t, left, top) {
    if (!t.innerArea) return 1;
    const { w, h, img } = ctx;
    let white = 0, n = 0;
    for (let k = 0; k < t.inner.length; k += 2) {
      const xx = left + t.inner[k], yy = top + t.inner[k + 1];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      n++; if (!img[yy * w + xx]) white++;
    }
    return n ? white / n : 0;
  }
  function matchHead(ctx, list, cx, cy, rx, ry, src) {
    let best = null;
    // tahap 1: satu cetakan, geser kasar
    const t0 = list[Math.floor(list.length / 2)] || list[0];
    let bdx = 0, bdy = 0, bs = -1;
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      const left = Math.round(cx + dx - (t0.bx0 + t0.cw / 2)), top = Math.round(cy + dy - t0.oy);
      const r = recallAt(ctx, t0, left, top, src);
      if (r > bs) { bs = r; bdx = dx; bdy = dy; }
    }
    // tahap 2: semua cetakan di sekitar posisi terbaik
    for (const t of list) {
      for (let dy = bdy - 1; dy <= bdy + 1; dy++) for (let dx = bdx - 1; dx <= bdx + 1; dx++) {
        const left = Math.round(cx + dx - (t.bx0 + t.cw / 2)), top = Math.round(cy + dy - t.oy);
        let r = recallAt(ctx, t, left, top, src);
        if (t.innerArea) { const iw = innerWhite(ctx, t, left, top); r = r * 0.7 + iw * 0.3; if (iw < 0.65) r -= 0.3; }
        if (!best || r > best.r) best = { r, t, left, top };
      }
    }
    return best;
  }

  /* ---------------- kepala not penuh ---------------- */
  function detectBlackHeads(ctx) {
    const { w, h, I, img } = ctx;
    const D = IM.edt(img, w, h);
    ctx.D = D;
    const thr2 = Math.pow(0.30 * I, 2);
    const peaks = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, v = D[i];
        if (v < thr2) continue;
        if (v < D[i - 1] || v < D[i + 1] || v < D[i - w] || v < D[i + w] || v < D[i - w - 1] || v < D[i - w + 1] || v < D[i + w - 1] || v < D[i + w + 1]) continue;
        peaks.push({ x, y, r: Math.sqrt(v) });
      }
    }
    peaks.sort((a, b) => b.r - a.r);
    const kept = [];
    const R2 = Math.pow(0.42 * I, 2);
    for (const p of peaks) {
      if (kept.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < R2)) continue;
      kept.push(p);
    }
    const heads = [];
    const dbg = ctx.debug ? (x, y, why, extra) => ctx.debug.push({ x, y, why, extra }) : () => {};
    for (const pk of kept) {
      const loc = staffFor(ctx, pk.x, pk.y);
      if (!loc) { dbg(pk.x, pk.y, 'noStaff'); continue; }
      if (pk.x < ctx.headerEnd[loc.si]) { dbg(pk.x, pk.y, 'header'); continue; } // area klef/tanda kunci/sukat
      const pos = Math.round(loc.p);
      if (Math.abs(loc.p - pos) > 0.55) { dbg(pk.x, pk.y, 'offGrid', loc.p); continue; }
      const cy = loc.st.yAt(pos, pk.x);
      const m = matchHead(ctx, ctx.T.black, pk.x, cy, 3, 2);
      if (!m || m.r < 0.80) { dbg(pk.x, pk.y, 'template', m && m.r); continue; }
      const hx0 = m.left + m.t.bx0, hx1 = m.left + m.t.bx1;
      const hy = m.top + m.t.oy;
      // balok: tinta berlanjut lurus (dengan kemiringan yang sama) di KIRI dan KANAN kepala
      {
        const inkAt = (x, y) => { const xx = Math.round(x), yy = Math.round(y); if (xx < 0 || yy < 1 || xx >= w || yy >= h - 1) return 0; const q = yy * w + xx; return img[q] || img[q - w] || img[q + w] ? 1 : 0; };
        let beamy = false;
        for (let sl = -0.6; sl <= 0.6001 && !beamy; sl += 0.1) {
          let l = 0, r = 0, n = 0;
          for (let d = 0.15 * I; d <= 0.95 * I; d += 0.1 * I) {
            n++;
            l += inkAt(hx0 - d, hy - sl * (d + (hx1 - hx0) / 2));
            r += inkAt(hx1 + d, hy + sl * (d + (hx1 - hx0) / 2));
          }
          if (l >= 0.85 * n && r >= 0.85 * n) beamy = true;
        }
        // satu sisi saja tetapi berupa pita tebal & panjang (balok yang berakhir di tangkai)
        if (!beamy) {
          const vrun = (x, y) => {
            const xx = Math.round(x), yy = Math.round(y);
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) return 0;
            let a = -1;
            for (const d of [0, -1, 1, -2, 2]) { const q = yy + d; if (q >= 0 && q < h && img[q * w + xx]) { a = q; break; } }
            if (a < 0) return 0;
            let t = a, b = a;
            while (t > 0 && img[(t - 1) * w + xx]) t--;
            while (b < h - 1 && img[(b + 1) * w + xx]) b++;
            return b - t + 1;
          };
          for (let sl = -0.6; sl <= 0.6001 && !beamy; sl += 0.1) {
            for (const side of [-1, 1]) {
              let ok = 0, n = 0;
              for (let d = 0.15 * I; d <= 1.45 * I; d += 0.1 * I) {
                n++;
                const x = side < 0 ? hx0 - d : hx1 + d;
                const t = vrun(x, hy + side * sl * (d + (hx1 - hx0) / 2));
                if (t >= 0.28 * I && t <= 0.95 * I) ok++;
              }
              if (ok >= 0.9 * n) { beamy = true; break; }
            }
          }
        }
        if (beamy) { dbg(pk.x, pk.y, 'beamlike'); continue; }
      }
      heads.push({ kind: 'black', x: (hx0 + hx1) / 2, y: hy, x0: hx0, x1: hx1, p: pos, si: loc.si, score: m.r, t: m.t, left: m.left, top: m.top });
    }
    return dedupe(ctx, heads);
  }

  function dedupe(ctx, heads) {
    heads.sort((a, b) => b.score - a.score);
    const out = [];
    for (const hd of heads) {
      if (out.some(o => o.si === hd.si && Math.abs(o.p - hd.p) <= 0 && Math.abs(o.x - hd.x) < 0.6 * ctx.I)) continue;
      // kepala bertumpuk hampir di tempat yang sama (selisih 1 posisi & x sama) -> ambil skor tertinggi
      if (out.some(o => o.si === hd.si && Math.abs(o.p - hd.p) === 1 && Math.abs(o.x - hd.x) < 0.25 * ctx.I && o.score >= hd.score)) continue;
      out.push(hd);
    }
    return out;
  }

  /* ---------------- kepala not kosong (1/2 dan 1) ---------------- */
  function holeCandidates(ctx, src) {
    const { w, h, I } = ctx;
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < inv.length; i++) inv[i] = src[i] ? 0 : 1;
    const { comps } = IM.label(inv, w, h, true);
    const out = [];
    for (let i = 1; i < comps.length; i++) {
      const c = comps[i];
      if (c.x0 <= 0 || c.y0 <= 0 || c.x1 >= w - 1 || c.y1 >= h - 1) continue;
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (c.area < 0.02 * I * I || c.area > 0.7 * I * I || bw > 1.05 * I || bh > 0.8 * I || bw < 0.1 * I || bh < 0.08 * I) continue;
      out.push({ cx: (c.x0 + c.x1) / 2, cy: (c.y0 + c.y1) / 2, y0: c.y0, y1: c.y1 });
    }
    return out;
  }
  function detectHollowHeads(ctx, stems) {
    const { I } = ctx;
    stems = stems || [];
    const cands = holeCandidates(ctx, ctx.img).concat(holeCandidates(ctx, ctx.bin));
    const heads = [];
    const tried = new Set();
    for (const c of cands) {
      const loc = staffFor(ctx, c.cx, c.cy);
      if (!loc || c.cx < ctx.headerEnd[loc.si]) continue;
      // posisi kandidat: tengah lubang, atau garis yang menyentuh tepi lubang (kepala di atas garis terbelah dua)
      const ps = new Set([Math.round(loc.p)]);
      const pTop = loc.st.pAt(c.y0 - 1, c.cx), pBot = loc.st.pAt(c.y1 + 1, c.cx);
      if (Math.abs(pTop - Math.round(pTop)) < 0.3 && Math.round(pTop) % 2 === 0) ps.add(Math.round(pTop));
      if (Math.abs(pBot - Math.round(pBot)) < 0.3 && Math.round(pBot) % 2 === 0) ps.add(Math.round(pBot));
      for (const pos of ps) {
        if (Math.abs(loc.p - pos) > 1.2) continue;
        const key = loc.si + '|' + pos + '|' + Math.round(c.cx / 6);
        if (tried.has(key)) continue;
        tried.add(key);
        const cy = loc.st.yAt(pos, c.cx);
        const mh = matchHead(ctx, ctx.T.half, c.cx, cy, 3, 2, ctx.bin);
        const mw = matchHead(ctx, ctx.T.whole, c.cx, cy, 3, 2, ctx.bin);
        const best = (!mw || (mh && mh.r >= mw.r)) ? { m: mh, kind: 'half' } : { m: mw, kind: 'whole' };
        if (!best.m || best.m.r < 0.74) continue;
        const m = best.m;
        // sisi kiri & kanan cincin tidak boleh sama-sama garis tegak panjang (tangkai/garis birama)
        const hx0 = m.left + m.t.bx0, hx1 = m.left + m.t.bx1, hy = m.top + m.t.oy;
        const vlen = (x) => {
          let best = 0;
          for (let xx = Math.round(x) - 1; xx <= Math.round(x) + 1; xx++) {
            if (xx < 0 || xx >= ctx.w) continue;
            let a = Math.round(hy), b = a;
            while (a > 0 && ctx.img[(a - 1) * ctx.w + xx]) a--;
            while (b < ctx.h - 1 && ctx.img[(b + 1) * ctx.w + xx]) b++;
            if (ctx.img[Math.round(hy) * ctx.w + xx]) best = Math.max(best, b - a + 1);
          }
          return best;
        };
        if (vlen(hx0 + 1) > 1.7 * I && vlen(hx1 - 1) > 1.7 * I) continue;
        // bukan lengkung bendera / ruang yang dilintasi tangkai not lain
        if (stems.some(st => st.si === loc.si && st.x > hx0 - 0.3 * I && st.x < hx1 + 0.3 * I && Math.min(st.ya, st.yb) < hy + 0.3 * I && Math.max(st.ya, st.yb) > hy - 0.3 * I)) continue;
        heads.push({ kind: best.kind, x: m.left + m.t.bx0 + m.t.cw / 2, y: m.top + m.t.oy, x0: m.left + m.t.bx0, x1: m.left + m.t.bx1, p: pos, si: loc.si, score: m.r, t: m.t, left: m.left, top: m.top, alt: { half: mh && mh.r, whole: mw && mw.r } });
      }
    }
    return dedupe(ctx, heads);
  }

  /** Not di luar paranada (2 garis bantu atau lebih jauh) harus ditopang garis bantu terdeteksi. */
  function ledgerOK(ctx, hd) {
    if (hd.p > -2 && hd.p < 10) return true;
    const st = ctx.staves[hd.si];
    const list = [];
    if (hd.p <= -2) for (let q = -2; q >= hd.p; q -= 2) list.push(q);
    else for (let q = 10; q <= hd.p; q += 2) list.push(q);
    let have = 0;
    for (const q of list) if (hasLedger(ctx, st.yAt(q, hd.x), hd.x)) have++;
    return have >= Math.max(1, list.length - (list.length >= 3 ? 1 : 0));
  }

  /* ---------------- tangkai ---------------- */
  function runFrom(ctx, x, y, dir, maxLen) {
    const { w, h, img } = ctx;
    if (x < 0 || x >= w) return 0;
    let yy = Math.round(y), gap = 0, last = yy, n = 0;
    while (yy >= 0 && yy < h && n < maxLen) {
      if (img[yy * w + x]) { last = yy; gap = 0; }
      else { gap++; if (gap > 1) break; }
      yy += dir; n++;
    }
    return last;
  }
  function hWidth(ctx, x, y) {
    const { w, img } = ctx;
    const yy = Math.round(y);
    if (!img[yy * w + x]) return 99;
    let a = x, b = x;
    while (a > 0 && img[yy * w + a - 1]) a--;
    while (b < w - 1 && img[yy * w + b + 1]) b++;
    return b - a + 1;
  }
  /**
   * Cari tangkai di tepi kepala: ukur run tegak penuh (atas & bawah) melewati kepala.
   * Mengembalikan kolom tangkai dan rentang [ya, yb]; arah ditentukan nanti dari letak semua kepalanya.
   */
  function findStem(ctx, hd) {
    const { I } = ctx;
    const sides = hd.kind === 'half' ? ['R', 'L'] : ['R', 'L'];
    let best = null;
    for (const side of sides) {
      const xc = side === 'R' ? hd.x1 : hd.x0;
      const xa = Math.round(xc - (side === 'R' ? 0.34 : 0.26) * I), xb = Math.round(xc + (side === 'R' ? 0.26 : 0.34) * I);
      for (let x = xa; x <= xb; x++) {
        const up = runFrom(ctx, x, hd.y, -1, Math.round(10 * I));
        const dn = runFrom(ctx, x, hd.y, 1, Math.round(10 * I));
        const freeUp = hd.y - up, freeDn = dn - hd.y;
        const len = Math.max(freeUp, freeDn);
        if (len < 1.3 * I) continue;
        // ketipisan pada bagian bebas terpanjang, dekat kepala (ujung bisa tertutup balok)
        const dir = freeUp >= freeDn ? -1 : 1;
        let thin = 0, total = 0;
        for (let d = 0.6 * I; d < len; d += 0.25 * I) { total++; if (hWidth(ctx, x, hd.y + dir * d) <= Math.max(3, 0.32 * I)) thin++; }
        if (thin < 2 || thin < 0.35 * total) continue;
        // not setengah: tangkai lazim saja (kanan-atas / kiri-bawah)
        if (hd.kind === 'half' && ((side === 'R' && dir > 0 && freeUp < 1.5 * I) || (side === 'L' && dir < 0 && freeDn < 1.5 * I))) continue;
        const pref = (side === 'R' && dir < 0) || (side === 'L' && dir > 0) ? 0.1 : 0;
        const sc = (freeUp + freeDn) / I + pref;
        if (!best || sc > best.sc) best = { sc, x, ya: up, yb: dn, side };
      }
    }
    return best;
  }

  /* ---------------- balok & bendera ---------------- */
  function colRuns(ctx, x, ya, yb) {
    const { w, h, img } = ctx;
    if (x < 0 || x >= w) return [];
    const lo = Math.max(0, Math.min(ya, yb)), hi = Math.min(h - 1, Math.max(ya, yb));
    const runs = [];
    let y = lo;
    while (y <= hi) {
      while (y <= hi && !img[y * w + x]) y++;
      if (y > hi) break;
      const a = y;
      while (y <= hi && img[y * w + x]) y++;
      runs.push([a, y - 1]);
    }
    return runs;
  }
  function beamInfo(ctx, stem) {
    const { I } = ctx;
    const up = stem.dir === 'up';
    const tip = stem.yTip;
    // jangkauan: dari ujung tangkai ke arah kepala, berhenti sebelum kepala
    const near = stem.yNear !== undefined ? stem.yNear : stem.yHead;
    const limit = up ? Math.min(tip + 2.9 * I, near - 0.62 * I) : Math.max(tip - 2.9 * I, near + 0.62 * I);
    const side = (sgn) => {
      let best = { n: 0, runs: [] };
      for (const off of [0.25, 0.38]) {
        const x = Math.round(stem.x + sgn * off * I);
        const ya = up ? tip - 0.35 * I : tip + 0.35 * I;
        let runs = colRuns(ctx, x, Math.round(ya), Math.round(limit));
        runs = runs.filter(r => { const L = r[1] - r[0] + 1; return L >= 0.22 * I && L <= 3.3 * I; });
        // run pertama harus dekat ujung tangkai
        if (runs.length) {
          const firstEdge = up ? runs[0][0] : runs[runs.length - 1][1];
          if (Math.abs(firstEdge - tip) > 0.9 * I) runs = [];
        }
        // balok yang menyatu (gambar buram): hitung dari ketebalan pita
        const bt = ctx.beamT || 0.5 * I, gap = Math.max(2, 0.6 * bt);
        let n = 0;
        for (const r of runs) { const L = r[1] - r[0] + 1; n += Math.max(1, Math.round((L + gap) / (bt + gap))); }
        if (n > best.n) best = { n, runs, x };
      }
      return best;
    };
    const L = side(-1), R = side(1);
    let n = Math.max(L.n, R.n), kind = 'none';
    if (L.n > 0) kind = 'beam';
    else if (R.n > 0) {
      // sejauh apa run pertama di kanan berlanjut mendatar?
      const r0 = up ? R.runs[0] : R.runs[R.runs.length - 1];
      let y = (r0[0] + r0[1]) / 2, x = R.x, len = 0;
      const step = 2;
      while (len < 3 * I) {
        let found = null;
        for (let d = 0; d <= Math.ceil(0.3 * I); d++) {
          for (const s of [1, -1]) {
            const yy = Math.round(y + s * d), xx = x + step;
            if (yy >= 0 && yy < ctx.h && xx < ctx.w && ctx.img[yy * ctx.w + xx]) { found = yy; break; }
          }
          if (found !== null) break;
        }
        if (found === null) break;
        y = found; x += step; len += step;
      }
      kind = (x - stem.x) >= 1.55 * I ? 'beam' : 'flag';
    }
    return { n: Math.min(4, n), kind, left: L.n, right: R.n };
  }

  /* ---------------- garis birama ---------------- */
  function detectBarlines(ctx, stems) {
    const { I, bin, w, h } = ctx;
    const bars = [];
    ctx.systems.forEach((sys, k) => {
      const perStaff = sys.map(st => {
        const cols = [];
        for (let x = Math.round(st.x0 + 0.6 * I); x <= st.x1; x++) {
          const y0 = Math.round(st.top(x)), y1 = Math.round(st.bottom(x));
          let c = 0;
          for (let y = y0; y <= y1; y++) c += bin[y * w + x];
          cols.push(c >= 0.95 * (y1 - y0 + 1) ? 1 : 0);
        }
        const groups = [];
        let a = -1;
        for (let i = 0; i <= cols.length; i++) {
          if (i < cols.length && cols[i]) { if (a < 0) a = i; }
          else if (a >= 0) { groups.push([a + Math.round(st.x0 + 0.6 * I), i - 1 + Math.round(st.x0 + 0.6 * I)]); a = -1; }
        }
        const si = ctx.staves.indexOf(st);
        return groups.filter(([g0, g1]) => {
          const gw = g1 - g0 + 1;
          if (gw > 0.75 * I) return false;
          const xm = (g0 + g1) / 2;
          // bukan tangkai not
          if (stems.some(s => s.si === si && Math.abs(s.x - xm) <= 2 + gw / 2)) return false;
          // lebar seragam di sebagian besar baris (angka sukat/huruf tidak); lengkung tie boleh melintas
          let thin = 0, n = 0;
          const yA = Math.round(st.top(xm)), yB = Math.round(st.bottom(xm));
          for (let yy = yA + 2; yy <= yB - 2; yy++) {
            const pp = st.pAt(yy, xm);
            if (Math.abs(pp - 2 * Math.round(pp / 2)) < 0.25) continue; // baris garis paranada
            n++;
            let a = g0, b = g1;
            while (a > 0 && bin[yy * w + a - 1]) a--;
            while (b < w - 1 && bin[yy * w + b + 1]) b++;
            if (b - a + 1 <= gw + Math.max(2, 0.2 * I)) thin++;
          }
          return n > 0 && thin >= 0.6 * n;
        }).map(([g0, g1]) => ({ x0: g0, x1: g1, x: (g0 + g1) / 2 }));
      });
      // garis birama harus muncul di semua paranada sistem (atau menyambung di celah)
      const base = perStaff[0] || [];
      for (const b of base) {
        let ok = true;
        for (let j = 1; j < perStaff.length; j++) if (!perStaff[j].some(o => Math.abs(o.x - b.x) < 0.6 * I)) { ok = false; break; }
        if (!ok && sys.length > 1) {
          // periksa sambungan tinta di celah antar paranada
          const A = sys[0], B = sys[1];
          const xs = Math.round(b.x);
          const y0 = Math.round(A.bottom(xs)), y1 = Math.round(B.top(xs));
          let c = 0; for (let y = y0; y <= y1; y++) c += bin[y * w + xs] | bin[y * w + xs - 1] | bin[y * w + xs + 1];
          ok = c >= 0.9 * (y1 - y0 + 1) && perStaff.slice(1).every(ps => ps.some(o => Math.abs(o.x - b.x) < 1.2 * I) || true);
        }
        if (ok) bars.push({ sys: k, x: b.x, x0: b.x0, x1: b.x1, w: b.x1 - b.x0 + 1 });
      }
    });
    // gabungkan garis ganda / akhir
    bars.sort((a, b) => a.sys - b.sys || a.x - b.x);
    const merged = [];
    for (const b of bars) {
      const last = merged[merged.length - 1];
      if (last && last.sys === b.sys && b.x0 - last.x1 < 1.1 * ctx.I) { last.x1 = b.x1; last.x = (last.x0 + last.x1) / 2; last.double = true; last.w = Math.max(last.w, b.w); }
      else merged.push(Object.assign({}, b));
    }
    return merged;
  }

  /* ---------------- komponen sisa: klasifikasi ---------------- */
  function componentMask(lab, w, c) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    const m = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) m[y * bw + x] = lab[(c.y0 + y) * w + c.x0 + x] === c.id ? 1 : 0;
    return { m, bw, bh };
  }
  function diceBest(cm, t) {
    // selaraskan pusat kotak tinta, geser ±2
    let best = 0, bdx = 0, bdy = 0;
    const cxo = (cm.bw - 1) / 2 - (t.bx0 + (t.cw - 1) / 2);
    const cyo = (cm.bh - 1) / 2 - (t.by0 + (t.ch - 1) / 2);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const ox = Math.round(cxo + dx), oy = Math.round(cyo + dy);
      let hit = 0;
      for (let k = 0; k < t.pts.length; k += 2) {
        const xx = t.pts[k] + ox, yy = t.pts[k + 1] + oy;
        if (xx >= 0 && yy >= 0 && xx < cm.bw && yy < cm.bh && cm.m[yy * cm.bw + xx]) hit++;
      }
      const d = 2 * hit / (t.area + cm.area);
      if (d > best) { best = d; bdx = ox; bdy = oy; }
    }
    return { d: best, ox: bdx, oy: bdy };
  }

  const CLASSES = {
    accidentalSharp: 'acc', accidentalFlat: 'acc', accidentalNatural: 'acc', accidentalDoubleSharp: 'acc', accidentalDoubleFlat: 'acc',
    restQuarter: 'rest', rest8th: 'rest', rest16th: 'rest', rest32nd: 'rest',
    gClef: 'clef', fClef: 'clef', cClef: 'clef',
    timeSig0: 'digit', timeSig1: 'digit', timeSig2: 'digit', timeSig3: 'digit', timeSig4: 'digit', timeSig5: 'digit',
    timeSig6: 'digit', timeSig7: 'digit', timeSig8: 'digit', timeSig9: 'digit', timeSigCommon: 'digit', timeSigCutCommon: 'digit',
    tuplet3: 'tuplet'
  };

  function classify(ctx, heads, stems) {
    const { w, h, I, img } = ctx;
    // tandai piksel yang sudah dipakai kepala not & tangkai
    const claimed = new Uint8Array(w * h);
    for (const hd of heads) {
      const t = hd.t;
      for (let k = 0; k < t.pts.length; k += 2) {
        const xx = hd.left + t.pts[k], yy = hd.top + t.pts[k + 1];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = xx + dx, Y = yy + dy;
          if (X >= 0 && Y >= 0 && X < w && Y < h) claimed[Y * w + X] = 1;
        }
      }
      // klaim seluruh kotak kepala (+2 px) agar tidak ada sisa pinggiran
      for (let y = Math.round(hd.y - 0.62 * I); y <= hd.y + 0.62 * I; y++) for (let x = Math.round(hd.x0 - 2); x <= hd.x1 + 2; x++) if (x >= 0 && y >= 0 && x < w && y < h) claimed[y * w + x] = 1;
    }
    for (const s of stems) {
      const ya = Math.min(s.yTip, s.yHead), yb = Math.max(s.yTip, s.yHead);
      for (let y = Math.round(ya); y <= yb; y++) for (let dx = -2; dx <= 2; dx++) {
        const X = Math.round(s.x) + dx;
        if (X >= 0 && X < w && y >= 0 && y < h && img[y * w + X]) {
          // hanya bagian tipis (jangan hapus balok yang menempel)
          if (hWidth(ctx, X, y) <= Math.max(4, 0.35 * I)) claimed[y * w + X] = 1;
        }
      }
    }
    const resid = new Uint8Array(w * h);
    for (let i = 0; i < resid.length; i++) resid[i] = img[i] && !claimed[i] ? 1 : 0;
    const { lab, comps } = IM.label(resid, w, h);
    ctx.resid = resid;
    const allT = templates(Object.keys(CLASSES), I, [0.85, 1, 1.15]);
    const smallT = templates(['gClef', 'fClef', 'cClef'], I, [0.65, 0.75]);
    const digitT = templates(['timeSig0', 'timeSig1', 'timeSig2', 'timeSig3', 'timeSig4', 'timeSig5', 'timeSig6', 'timeSig7', 'timeSig8', 'timeSig9'], I, [0.9, 1, 1.1]);
    const symbols = [];
    for (let i = 1; i < comps.length; i++) {
      const c = comps[i];
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (c.area < 4) continue;
      const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      const loc = staffFor(ctx, cx, cy);
      if (!loc) continue;
      const sym = { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, x: cx, y: cy, si: loc.si, area: c.area, bw, bh };
      if (c.x1 <= ctx.headerEnd[loc.si] + 0.2 * I) { symbols.push(Object.assign(sym, { type: 'header' })); continue; }
      // titik
      if (bw <= 0.7 * I && bh <= 0.7 * I && bw >= 0.16 * I && bh >= 0.16 * I && c.area >= 0.5 * bw * bh && Math.max(bw, bh) <= 1.9 * Math.min(bw, bh)) {
        symbols.push(Object.assign(sym, { type: 'dot' }));
        continue;
      }
      // blok diam 1 / 1/2
      const touches = (() => {
        for (let y = c.y0; y <= c.y1; y++) for (const x of [c.x0 - 1, c.x0 - 2, c.x1 + 1, c.x1 + 2]) if (x >= 0 && x < w && img[y * w + x] && lab[y * w + x] !== c.id) return true;
        return false;
      })();
      const nearStem = stems.some(s => s.si === loc.si && s.x >= c.x0 - 0.35 * I && s.x <= c.x1 + 0.35 * I && Math.min(s.ya, s.yb) <= c.y1 + 0.6 * I && Math.max(s.ya, s.yb) >= c.y0 - 0.6 * I);
      if (!touches && !nearStem && loc.p > -1.5 && loc.p < 9.5 && bw >= 0.75 * I && bw <= 1.8 * I && bh >= 0.28 * I && bh <= 0.8 * I && c.area >= 0.72 * bw * bh) {
        const st = loc.st;
        const pTop = st.pAt(c.y0, cx), pBot = st.pAt(c.y1 + 1, cx);
        const eTop = Math.abs(pTop - 2 * Math.round(pTop / 2)), eBot = Math.abs(pBot - 2 * Math.round(pBot / 2));
        symbols.push(Object.assign(sym, { type: 'rest', name: eTop <= eBot ? 'restWhole' : 'restHalf', score: 0.9 }));
        continue;
      }
      // garis lengkung tipis: tie / slur
      let maxD = 0;
      if (bw >= 1.0 * I && bh <= 2.5 * I) {
        for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) { const q = y * w + x; if (lab[q] === c.id && ctx.D[q] > maxD) maxD = ctx.D[q]; }
        if (Math.sqrt(maxD) <= 0.17 * I + 0.5 && c.area <= 0.35 * I * bw) {
          // ujung kiri & kanan
          let ly = 0, ln = 0, ry = 0, rn = 0;
          for (let y = c.y0; y <= c.y1; y++) {
            for (let x = c.x0; x <= c.x0 + 2; x++) if (lab[y * w + x] === c.id) { ly += y; ln++; }
            for (let x = c.x1 - 2; x <= c.x1; x++) if (lab[y * w + x] === c.id) { ry += y; rn++; }
          }
          symbols.push(Object.assign(sym, { type: 'arc', ly: ln ? ly / ln : cy, ry: rn ? ry / rn : cy }));
          continue;
        }
      }
      if (bh < 0.5 * I || bw < 0.25 * I || bh > 9 * I || bw > 4 * I) { symbols.push(Object.assign(sym, { type: 'other' })); continue; }
      // tanda sukat bertumpuk (mis. 3 di atas 4) yang menyatu: pecah di garis tengah
      if (bh >= 3.3 * I && bh <= 4.8 * I && bw >= 0.7 * I && bw <= 3.6 * I) {
        const st = loc.st;
        const yMid = Math.round(st.yAt(4, cx));
        const parts = (yMid > c.y0 + 0.8 * I && yMid < c.y1 - 0.8 * I) ? [[c.y0, yMid - 1], [yMid + 1, c.y1]] : [];
        const got = [];
        for (const [ya, yb] of parts) {
          const sub = { id: c.id, x0: c.x0, x1: c.x1, y0: ya, y1: yb };
          const cm = componentMask(lab, w, sub);
          let area = 0; for (let q = 0; q < cm.m.length; q++) area += cm.m[q];
          if (area < 10) continue;
          cm.area = area;
          let best = null;
          for (const t of digitT) {
            if (t.ch > 1.45 * (yb - ya + 1) + 3 || t.ch < 0.6 * (yb - ya + 1) - 3) continue;
            const r = diceBest(cm, t);
            if (!best || r.d > best.d) best = Object.assign(r, { t });
          }
          if (best && best.d >= 0.55) got.push({ x0: c.x0, x1: c.x1, y0: ya, y1: yb, x: cx, y: (ya + yb) / 2, si: loc.si, type: 'digit', name: best.t.name, score: best.d, pp: st.pAt((ya + yb) / 2, cx) });
        }
        if (got.length === 2) { got.forEach(g => symbols.push(g)); continue; }
      }
      // pencocokan cetakan
      const cm = Object.assign(componentMask(lab, w, c), { area: c.area });
      let best = null, second = 0;
      const pool = allT.concat(bh < 4.2 * I ? smallT : []);
      for (const t of pool) {
        if (t.cw > 1.45 * bw + 3 || t.cw < 0.65 * bw - 3 || t.ch > 1.45 * bh + 3 || t.ch < 0.65 * bh - 3) continue;
        const r = diceBest(cm, t);
        if (!best || r.d > best.d) { if (best && best.t.name !== t.name) second = Math.max(second, best.d); best = Object.assign(r, { t }); }
        else if (t.name !== best.t.name) second = Math.max(second, r.d);
      }
      // ambang per kelas: kunci di tengah lagu & dobel kres/mol lebih ketat (sering tertukar dengan serpihan)
      let okClass = best && best.d >= 0.55;
      if (best && /Clef$/.test(best.t.name)) {
        const pOrig = loc.st.pAt(c.y0 + best.oy + best.t.oy, cx);
        const want = best.t.name === 'gClef' ? [6] : best.t.name === 'fClef' ? [2] : [4, 2];
        okClass = best.d >= 0.66 && want.some(q => Math.abs(pOrig - q) <= 0.7);
      }
      if (best && /Double/.test(best.t.name)) okClass = best.d >= 0.74;
      if (okClass) {
        const t = best.t;
        // posisi nada dari titik asal glyph
        const oyImg = c.y0 + best.oy + t.oy;
        const oxImg = c.x0 + best.ox + t.ox;
        symbols.push(Object.assign(sym, { type: CLASSES[t.name], name: t.name, score: best.d, margin: best.d - second, py: oyImg, px: oxImg, pp: loc.st.pAt(oyImg, cx), small: t.mul < 0.8 }));
      } else symbols.push(Object.assign(sym, { type: 'other', score: best ? best.d : 0, guess: best ? best.t.name : null }));
    }
    return symbols;
  }

  /* ---------------- bagian awal paranada: klef, tanda kunci, sukat ---------------- */
  function bestTemplate(cm, list, bw, bh) {
    let best = null;
    for (const t of list) {
      if (t.cw > 1.45 * bw + 3 || t.cw < 0.65 * bw - 3 || t.ch > 1.45 * bh + 3 || t.ch < 0.65 * bh - 3) continue;
      const r = diceBest(cm, t);
      if (!best || r.d > best.d) best = Object.assign(r, { t });
    }
    return best;
  }
  function detectHeaders(ctx) {
    const { w, h, I, img } = ctx;
    const { lab, comps } = IM.label(img, w, h);
    ctx.fullLab = lab; ctx.fullComps = comps;
    const clefT = templates(['gClef', 'fClef', 'cClef'], I, [0.9, 1, 1.1]);
    const accT = templates(['accidentalSharp', 'accidentalFlat', 'accidentalNatural'], I, [0.9, 1, 1.1]);
    const digT = templates(['timeSig0', 'timeSig1', 'timeSig2', 'timeSig3', 'timeSig4', 'timeSig5', 'timeSig6', 'timeSig7', 'timeSig8', 'timeSig9', 'timeSigCommon', 'timeSigCutCommon'], I, [0.9, 1, 1.1]);
    const headers = ctx.staves.map((st, si) => {
      const cand = [];
      for (let i = 1; i < comps.length; i++) {
        const c = comps[i];
        if (c.x0 < st.x0 - 0.6 * I || c.x0 > st.x0 + 20 * I) continue;
        const cy = (c.y0 + c.y1) / 2, cx = (c.x0 + c.x1) / 2;
        const p = st.pAt(cy, cx);
        if (p < -6 || p > 14) continue;
        if (c.y1 - c.y0 + 1 > 9 * I) continue; // kurung kurawal / garis sistem
        cand.push(c);
      }
      cand.sort((a, b) => a.x0 - b.x0);
      const hd = { clef: null, accs: [], digits: [], end: st.x0 + 1.2 * I };
      let stage = 0; // 0 klef, 1 tanda kunci, 2 sukat
      for (const c of cand) {
        const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
        const cx = (c.x0 + c.x1) / 2;
        if (c.x1 < st.x0 + 0.4 * I) continue;
        // titik kecil (mis. titik kunci F) dilewati
        if (bw <= 0.6 * I && bh <= 0.6 * I) { if (stage <= 1 && hd.clef) continue; else if (!hd.clef) continue; else break; }
        // garis tegak tipis setinggi paranada di awal = garis sistem
        if (bw <= 0.4 * I && bh >= 3.5 * I && !hd.clef) continue;
        const cm = Object.assign(componentMask(lab, w, c), { area: c.area });
        if (stage === 0) {
          const b = bestTemplate(cm, clefT, bw, bh);
          if (b && b.d >= 0.5) {
            const oy = c.y0 + b.oy + b.t.oy;
            hd.clef = { name: b.t.name, line: 2 * Math.round(st.pAt(oy, cx) / 2), x0: c.x0, x1: c.x1, score: b.d };
            hd.end = c.x1; stage = 1; continue;
          }
          if (c.x0 > st.x0 + 4 * I) stage = 1; else continue;
        }
        if (stage === 1) {
          const b = bestTemplate(cm, accT, bw, bh);
          if (b && b.d >= 0.55 && c.x0 - hd.end < 2.2 * I) {
            const oy = c.y0 + b.oy + b.t.oy;
            hd.accs.push({ name: b.t.name, p: st.pAt(oy, cx), x0: c.x0, x1: c.x1, score: b.d });
            hd.end = c.x1; continue;
          }
          stage = 2;
        }
        if (stage === 2) {
          if (c.x0 - hd.end > 3 * I) break;
          let got = [];
          if (bh >= 3.3 * I && bh <= 4.8 * I) {
            const yMid = Math.round(st.yAt(4, cx));
            if (yMid > c.y0 + 0.8 * I && yMid < c.y1 - 0.8 * I) {
              for (const [ya, yb] of [[c.y0, yMid - 1], [yMid + 1, c.y1]]) {
                const sub = componentMask(lab, w, { id: c.id, x0: c.x0, x1: c.x1, y0: ya, y1: yb });
                let area = 0; for (let q = 0; q < sub.m.length; q++) area += sub.m[q];
                sub.area = area;
                const b = bestTemplate(sub, digT, bw, yb - ya + 1);
                if (b && b.d >= 0.55) got.push({ name: b.t.name, p: st.pAt((ya + yb) / 2, cx), x0: c.x0, x1: c.x1, score: b.d });
              }
              if (got.length !== 2) got = [];
            }
          }
          if (!got.length) {
            const b = bestTemplate(cm, digT, bw, bh);
            const pc = st.pAt((c.y0 + c.y1) / 2, cx);
            const isCommon = b && (b.t.name === 'timeSigCommon' || b.t.name === 'timeSigCutCommon');
            const posOK = isCommon ? (pc > 2.8 && pc < 5.2) : ((pc > 0.8 && pc < 3.2) || (pc > 4.8 && pc < 7.2));
            // angka sukat selalu berpasangan atas-bawah pada x yang sama
            const paired = isCommon || cand.some(o => o !== c && Math.abs((o.x0 + o.x1) / 2 - cx) < 0.7 * I && Math.abs(st.pAt((o.y0 + o.y1) / 2, cx) - pc) > 3);
            if (b && b.d >= 0.55 && bh >= 1.2 * I && posOK && paired) got.push({ name: b.t.name, p: pc, x0: c.x0, x1: c.x1, score: b.d });
          }
          if (!got.length) break;
          got.forEach(g => hd.digits.push(g));
          hd.end = c.x1;
        }
      }
      hd.end = Math.max(hd.end, st.x0 + 1.5 * I) + 0.3 * I;
      return hd;
    });
    return headers;
  }

  /* ---------------- utama ---------------- */
  function recognizeSymbols(ctx, log) {
    const headers = detectHeaders(ctx);
    ctx.headers = headers;
    ctx.headerEnd = headers.map(hd => hd.end);
    const stems = [];
    const attach = (hd) => {
      if (hd.kind === 'whole') { hd.stem = null; return; }
      const s = findStem(ctx, hd);
      if (!s) { hd.stem = null; return; }
      let found = stems.find(o => o.si === hd.si && Math.abs(o.x - s.x) <= 2 &&
        Math.min(o.ya, o.yb) <= s.yb + 0.3 * ctx.I && Math.max(o.ya, o.yb) >= s.ya - 0.3 * ctx.I);
      if (!found) {
        found = { si: hd.si, x: s.x, heads: [], ya: s.ya, yb: s.yb };
        stems.push(found);
      }
      found.heads.push(hd);
      found.ya = Math.min(found.ya, s.ya); found.yb = Math.max(found.yb, s.yb);
      hd.stem = found;
    };
    // tahap 1: kepala penuh + tangkainya
    const black = detectBlackHeads(ctx);
    black.forEach(attach);
    // tahap 2: kepala kosong (tolak yang dilintasi tangkai kepala penuh)
    const hollow = detectHollowHeads(ctx, stems.slice());
    // kepala kosong yang menimpa kepala penuh: pilih skor tertinggi
    let heads = dedupe(ctx, black.concat(hollow));
    hollow.filter(h => heads.includes(h)).forEach(attach);
    for (const s of stems) s.heads = s.heads.filter(h => heads.includes(h));
    for (let i = stems.length - 1; i >= 0; i--) if (!stems[i].heads.length) stems.splice(i, 1);
    // kepala palsu di ujung tangkai (gumpalan balok): kepala terpencil di ujung yang punya balok menyambung
    const beamEvidence = (x, yEnd, inward) => {
      let best = 0;
      for (const off of [-1.6, -1.3, 1.3, 1.6]) {
        const xx = Math.round(x + off * ctx.I);
        if (xx < 0 || xx >= ctx.w) continue;
        const runs = colRuns(ctx, xx, Math.round(yEnd - inward * 0.4 * ctx.I), Math.round(yEnd + inward * 1.6 * ctx.I))
          .filter(r => { const L = r[1] - r[0] + 1; return L >= 0.22 * ctx.I && L <= 1.0 * ctx.I; });
        best = Math.max(best, runs.length);
      }
      return best;
    };
    const dropTipHeads = () => {
      for (const s of stems) {
        if (s.heads.length < 2) continue;
        const hs = s.heads.slice().sort((a, b) => a.y - b.y);
        const top = hs[0], bot = hs[hs.length - 1];
        // kedua ujung tangkai sama-sama berkepala -> salah satunya gumpalan balok di ujung
        const bothEnds = (top.y - s.ya) < 0.9 * ctx.I && (s.yb - bot.y) < 0.9 * ctx.I;
        if (!bothEnds) continue;
        const topIso = (hs[1].y - top.y) >= 1.9 * ctx.I;
        const botIso = (bot.y - hs[hs.length - 2].y) >= 1.9 * ctx.I;
        if (!topIso && !botIso) continue;
        const evTop = topIso ? beamEvidence(s.x, s.ya, 1) : 0, evBot = botIso ? beamEvidence(s.x, s.yb, -1) : 0;
        let drop = null;
        if (topIso && evTop > 0 && (!botIso || evTop >= evBot)) drop = top;
        else if (botIso && evBot > 0) drop = bot;
        if (drop) {
          s.heads = s.heads.filter(q => q !== drop);
          drop.stem = null; drop.dropped = true;
          if (ctx.debug) ctx.debug.push({ x: drop.x, y: drop.y, why: 'tipHead' });
        }
      }
    };
    dropTipHeads();
    // kepala terdekat ke ujung tangkai yang menyatu tanpa celah dengan balok di ujung = gumpalan balok
    const dropBeamBlobHeads = () => {
      for (const s of stems) {
        if (s.heads.length < 2) continue;
        const hs = s.heads.slice().sort((a, b) => a.y - b.y);
        const freeUp = hs[0].y - s.ya, freeDn = s.yb - hs[hs.length - 1].y;
        const up = freeUp >= freeDn;
        const tip = up ? s.ya : s.yb;
        const near = up ? hs[0] : hs[hs.length - 1];
        const second = up ? hs[1] : hs[hs.length - 2];
        if (Math.abs(near.y - second.y) < 1.4 * ctx.I) continue; // akor rapat: biarkan
        const side = near.x >= s.x ? 1 : -1;
        const xx = Math.round(s.x + side * 0.3 * ctx.I);
        if (xx < 0 || xx >= ctx.w) continue;
        let ink = 0, n = 0;
        const y0 = Math.round(Math.min(tip, near.y)), y1 = Math.round(Math.max(tip, near.y));
        if (y1 - y0 < 2) continue;
        for (let y = y0; y <= y1; y++) { n++; ink += ctx.img[y * ctx.w + xx]; }
        if (ink >= 0.9 * n && beamEvidence(s.x, tip, up ? 1 : -1) > 0) {
          s.heads = s.heads.filter(q => q !== near);
          near.stem = null; near.dropped = true;
          if (ctx.debug) ctx.debug.push({ x: near.x, y: near.y, why: 'beamBlob' });
        }
      }
    };
    dropBeamBlobHeads();
    heads = heads.filter(hd => !hd.dropped);
    const finalizeStems = () => {
      for (const s of stems) {
        const top = Math.min(...s.heads.map(q => q.y)), bot = Math.max(...s.heads.map(q => q.y));
        const freeUp = top - s.ya, freeDn = s.yb - bot;
        s.dir = freeUp >= freeDn ? 'up' : 'down';
        s.yTip = s.dir === 'up' ? s.ya : s.yb;
        s.yHead = s.dir === 'up' ? bot : top;
        s.yNear = s.dir === 'up' ? top : bot;   // kepala terdekat ke ujung tangkai
        s.free = Math.max(freeUp, freeDn);
      }
      // tangkai yang bagian bebasnya terlalu pendek: bukan tangkai sungguhan
      for (let i = stems.length - 1; i >= 0; i--) {
        const span = Math.abs(stems[i].yb - stems[i].ya);
        if (stems[i].free < 1.0 * ctx.I && (stems[i].heads.length < 2 || span < 2.5 * ctx.I)) { stems[i].heads.forEach(hd => { hd.stem = null; if (ctx.debug) ctx.debug.push({ x: hd.x, y: hd.y, why: 'shortStem', extra: stems[i].free }); }); stems.splice(i, 1); }
      }
    };
    finalizeStems();
    // kepala penuh / setengah tanpa tangkai = kemungkinan salah deteksi; not jauh di luar paranada butuh garis bantu
    if (ctx.debug) heads.forEach(hd => { if (!(hd.kind === 'whole' || hd.stem)) ctx.debug.push({ x: hd.x, y: hd.y, why: 'noStem' }); else if (!ledgerOK(ctx, hd)) ctx.debug.push({ x: hd.x, y: hd.y, why: 'ledger', extra: hd.p }); });
    heads = heads.filter(hd => (hd.kind === 'whole' || hd.stem) && ledgerOK(ctx, hd));
    heads.forEach(hd => { if (hd.stem && !hd.stem.heads.includes(hd)) hd.stem = null; });
    for (const s of stems) s.heads = s.heads.filter(hd => heads.includes(hd));
    for (let i = stems.length - 1; i >= 0; i--) if (!stems[i].heads.length) stems.splice(i, 1);
    finalizeStems();
    heads = heads.filter(hd => hd.kind === 'whole' || hd.stem);
    // tebal satu balok pada halaman ini: median run tipis di dekat ujung tangkai
    {
      const ts = [];
      for (const s of stems) {
        for (const sgn of [-1, 1]) {
          const x = Math.round(s.x + sgn * 0.3 * ctx.I);
          const up = s.dir === 'up';
          const runs = colRuns(ctx, x, Math.round(up ? s.yTip - 0.3 * ctx.I : s.yTip + 0.3 * ctx.I), Math.round(up ? s.yTip + 1.2 * ctx.I : s.yTip - 1.2 * ctx.I));
          for (const r of runs) { const L = r[1] - r[0] + 1; if (L >= 0.3 * ctx.I && L <= 0.75 * ctx.I) ts.push(L); }
        }
      }
      ts.sort((a, b) => a - b);
      ctx.beamT = ts.length >= 5 ? ts[Math.floor(ts.length / 2)] : 0.5 * ctx.I;
    }
    for (const s of stems) s.beam = beamInfo(ctx, s);
    const bars = detectBarlines(ctx, stems);
    const symbols = classify(ctx, heads, stems);
    log && log(`${heads.length} kepala not, ${stems.length} tangkai, ${bars.length} garis birama, ${symbols.filter(s => s.type !== 'other').length} simbol lain`);
    return { heads, stems, bars, symbols, headers };
  }

  root.NotasiOMRSymbols = { buildContext, recognizeSymbols, glyphMask, templates, staffFor };
})(typeof self !== 'undefined' ? self : globalThis);
