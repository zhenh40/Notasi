/* ==========================================================================
   NOTASI OMR — omr-image.js
   Pengolahan gambar dasar: abu-abu, ubah ukuran, putar, binerisasi Sauvola,
   estimasi kemiringan, statistik garis, pelabelan komponen, transformasi jarak.
   Semua berjalan di browser (juga di Web Worker), tanpa layanan luar.
   Konvensi: gambar biner Uint8Array, 1 = tinta (hitam), 0 = kertas.
   ========================================================================== */
(function (root) {
  'use strict';

  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const a = rgba[j + 3] / 255;
      // piksel transparan dianggap putih
      const v = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
      g[i] = Math.round(v * a + 255 * (1 - a));
    }
    return g;
  }

  /** Ubah ukuran: rata-rata area saat mengecil, bilinear saat membesar. */
  function resize(src, w, h, nw, nh) {
    const out = new Uint8Array(nw * nh);
    const sx = w / nw, sy = h / nh;
    if (sx >= 1 && sy >= 1) {
      // rata-rata kotak
      for (let y = 0; y < nh; y++) {
        const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
        for (let x = 0; x < nw; x++) {
          const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
          let s = 0, n = 0;
          for (let yy = y0; yy < y1 && yy < h; yy++) {
            const r = yy * w;
            for (let xx = x0; xx < x1 && xx < w; xx++) { s += src[r + xx]; n++; }
          }
          out[y * nw + x] = n ? Math.round(s / n) : 255;
        }
      }
      return out;
    }
    for (let y = 0; y < nh; y++) {
      const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < nw; x++) {
        const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
        const a = src[y0 * w + x0] * (1 - tx) + src[y0 * w + x1] * tx;
        const b = src[y1 * w + x0] * (1 - tx) + src[y1 * w + x1] * tx;
        out[y * nw + x] = Math.round(a * (1 - ty) + b * ty);
      }
    }
    return out;
  }

  /** Putar gambar abu-abu sebesar angle (radian, positif = searah jarum jam di layar). */
  function rotate(src, w, h, angle) {
    const out = new Uint8Array(w * h);
    const c = Math.cos(angle), s = Math.sin(angle);
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        // pemetaan balik
        const fx = c * dx + s * dy + cx, fy = -s * dx + c * dy + cy;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) { out[y * w + x] = 255; continue; }
        const tx = fx - x0, ty = fy - y0;
        const i = y0 * w + x0;
        const a = src[i] * (1 - tx) + src[i + 1] * tx;
        const b = src[i + w] * (1 - tx) + src[i + w + 1] * tx;
        out[y * w + x] = Math.round(a * (1 - ty) + b * ty);
      }
    }
    return out;
  }

  function boxFilter(a, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let s = 0; const row = y * w;
      for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / (2 * r + 1);
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  /**
   * Binerisasi Sauvola. Statistik lokal dihitung pada resolusi 1/4 lalu diinterpolasi,
   * sehingga cepat untuk gambar besar dan tahan terhadap cahaya foto yang tidak rata.
   */
  function binarize(gray, w, h, win, k) {
    k = k ?? 0.2;
    const f = 4, sw = Math.ceil(w / f), sh = Math.ceil(h / f);
    const m = new Float32Array(sw * sh), q = new Float32Array(sw * sh);
    for (let by = 0; by < sh; by++) {
      for (let bx = 0; bx < sw; bx++) {
        let s = 0, s2 = 0, n = 0;
        for (let y = by * f; y < Math.min(h, by * f + f); y++) {
          const row = y * w;
          for (let x = bx * f; x < Math.min(w, bx * f + f); x++) { const v = gray[row + x]; s += v; s2 += v * v; n++; }
        }
        m[by * sw + bx] = s / n; q[by * sw + bx] = s2 / n;
      }
    }
    const r = Math.max(2, Math.round(win / (2 * f)));
    const mm = boxFilter(m, sw, sh, r), qq = boxFilter(q, sw, sh, r);
    const T = new Float32Array(sw * sh);
    let gmean = 0;
    for (let i = 0; i < T.length; i++) gmean += mm[i];
    gmean /= T.length;
    for (let i = 0; i < T.length; i++) {
      const sd = Math.sqrt(Math.max(0, qq[i] - mm[i] * mm[i]));
      T[i] = mm[i] * (1 + k * (sd / 128 - 1));
    }
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / f - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / f - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const t = (T[y0 * sw + x0] * (1 - tx) + T[y0 * sw + x1] * tx) * (1 - ty) + (T[y1 * sw + x0] * (1 - tx) + T[y1 * sw + x1] * tx) * ty;
        out[y * w + x] = gray[y * w + x] < t ? 1 : 0;
      }
    }
    return out;
  }

  /** Statistik run vertikal: ketebalan garis paranada & jarak antargaris (interline). */
  function runStats(bin, w, h) {
    const black = new Float64Array(256), pair = new Float64Array(512), white = new Float64Array(256);
    for (let x = 1; x < w; x += 2) {
      let y = 0;
      while (y < h) {
        while (y < h && !bin[y * w + x]) y++;
        const b0 = y;
        while (y < h && bin[y * w + x]) y++;
        const bl = y - b0;
        if (!bl) break;
        const w0 = y;
        while (y < h && !bin[y * w + x]) y++;
        const wl = y - w0;
        if (y >= h) break;
        if (bl < 256) black[bl]++;
        if (wl < 256) white[wl]++;
        if (bl + wl < 512 && bl < 12) pair[bl + wl]++;
      }
    }
    let lt = 1; for (let i = 1; i < 40; i++) if (black[i] > black[lt]) lt = i;
    let il = 4; for (let i = 4; i < 300; i++) if (pair[i] > pair[il]) il = i;
    // haluskan: rata-rata berbobot di sekitar puncak
    let s = 0, n = 0;
    for (let i = Math.max(1, il - 2); i <= il + 2; i++) { s += pair[i] * i; n += pair[i]; }
    return { lineThick: lt, interline: n ? s / n : il, confidence: pair[il] };
  }

  /** Sudut kemiringan dominan (radian) dari garis paranada: maksimalkan ketajaman proyeksi horizontal. */
  function estimateSkew(bin, w, h, maxDeg) {
    maxDeg = maxDeg ?? 4;
    const xs = [], ys = [];
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x += 3) if (bin[row + x]) { xs.push(x - w / 2); ys.push(y); }
    }
    const n = xs.length;
    const hist = new Float64Array(h * 2 + 10);
    const score = (a) => {
      hist.fill(0);
      const t = Math.tan(a);
      for (let i = 0; i < n; i++) {
        const yy = Math.round(ys[i] + xs[i] * t) + 5;
        if (yy >= 0 && yy < hist.length) hist[yy]++;
      }
      let s = 0; for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
      return s;
    };
    let best = 0, bestS = -1;
    const step1 = 0.2 * Math.PI / 180;
    for (let a = -maxDeg * Math.PI / 180; a <= maxDeg * Math.PI / 180 + 1e-9; a += step1) {
      const s = score(a); if (s > bestS) { bestS = s; best = a; }
    }
    const step2 = 0.02 * Math.PI / 180;
    let best2 = best;
    for (let a = best - step1; a <= best + step1 + 1e-9; a += step2) {
      const s = score(a); if (s > bestS) { bestS = s; best2 = a; }
    }
    return best2;
  }

  /** Label komponen terhubung (8-tetangga). */
  function label(img, w, h, conn4) {
    const lab = new Int32Array(w * h);
    let parent = new Int32Array(1024), next = 1;
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!img[i]) continue;
        let l = 0;
        const W = x > 0 ? lab[i - 1] : 0;
        const NW = x > 0 && y > 0 ? lab[i - w - 1] : 0;
        const N = y > 0 ? lab[i - w] : 0;
        const NE = x < w - 1 && y > 0 ? lab[i - w + 1] : 0;
        if (conn4) { for (const c of [W, N]) if (c) { if (!l) l = c; else if (c !== l) union(l, c); } }
        else for (const c of [W, NW, N, NE]) if (c) { if (!l) l = c; else if (c !== l) union(l, c); }
        if (!l) {
          if (next >= parent.length) { const p2 = new Int32Array(parent.length * 2); p2.set(parent); parent = p2; }
          parent[next] = next; l = next++;
        }
        lab[i] = l;
      }
    }
    const remap = new Int32Array(next);
    const comps = [null];
    for (let l = 1; l < next; l++) {
      const r = find(l);
      if (!remap[r]) { remap[r] = comps.length; comps.push({ id: comps.length, x0: 1e9, y0: 1e9, x1: -1, y1: -1, area: 0 }); }
      remap[l] = remap[r];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!lab[i]) continue;
        const id = remap[lab[i]];
        lab[i] = id;
        const c = comps[id];
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
        if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        c.area++;
      }
    }
    return { lab, comps };
  }

  /** Transformasi jarak Euclid kuadrat (Felzenszwalb): jarak tiap piksel tinta ke kertas terdekat. */
  function edt(img, w, h) {
    const INF = 1e20;
    const D = new Float32Array(w * h);
    for (let i = 0; i < D.length; i++) D[i] = img[i] ? INF : 0;
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const pass = (len) => {
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    };
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = D[y * w + x];
      pass(h);
      for (let y = 0; y < h; y++) D[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) f[x] = D[row + x];
      pass(w);
      for (let x = 0; x < w; x++) D[row + x] = d[x];
    }
    return D;
  }

  /** Integral image (jumlah tinta) untuk hitung kotak O(1). */
  function integral(img, w, h) {
    const W = w + 1;
    const S = new Int32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let rs = 0;
      for (let x = 0; x < w; x++) { rs += img[y * w + x]; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + rs; }
    }
    return S;
  }
  function boxSum(S, w, x0, y0, x1, y1) { // inklusif x0..x1-1, y0..y1-1, sudah dijepit oleh pemanggil
    const W = w + 1;
    return S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0];
  }

  root.NotasiOMRImage = { toGray, resize, rotate, binarize, runStats, estimateSkew, label, edt, integral, boxSum };
})(typeof self !== 'undefined' ? self : globalThis);
