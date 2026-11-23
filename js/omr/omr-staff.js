/* ==========================================================================
   NOTASI OMR — omr-staff.js
   Deteksi paranada (5 garis), pelacakan garis lokal (tahan lengkung ringan),
   pengelompokan sistem (grand staff piano), deteksi & penghapusan garis
   paranada dan garis bantu.
   Posisi nada p: 0 = garis teratas, 1 = spasi di bawahnya, ..., 8 = garis terbawah;
   negatif = di atas paranada, > 8 = di bawah paranada (satuan setengah spasi).
   ========================================================================== */
(function (root) {
  'use strict';

  function makeStaff(ys, x0, x1, segW) {
    // ys: lines[k][seg] = y pada pusat segmen seg; segmen pertama dimulai di x0
    const nSeg = ys[0].length;
    const segX0 = x0;
    const st = { x0, x1, segW, ys, lines: 5 };
    st.lineY = (k, x) => {
      const t = (x - segX0) / segW - 0.5;
      const i = Math.max(0, Math.min(nSeg - 1, Math.floor(t)));
      const j = Math.min(nSeg - 1, i + 1);
      const f = Math.max(0, Math.min(1, t - i));
      return ys[k][i] * (1 - f) + ys[k][j] * f;
    };
    st.yAt = (p, x) => {
      const y0 = st.lineY(0, x), y4 = st.lineY(4, x);
      return y0 + p * (y4 - y0) / 8;
    };
    st.pAt = (y, x) => {
      const y0 = st.lineY(0, x), y4 = st.lineY(4, x);
      return (y - y0) * 8 / (y4 - y0);
    };
    st.top = (x) => st.lineY(0, x);
    st.bottom = (x) => st.lineY(4, x);
    let s = 0; for (let i = 0; i < nSeg; i++) s += (ys[4][i] - ys[0][i]) / 4;
    st.I = s / nSeg;
    st.yMid = (ys[0].reduce((a, b) => a + b, 0) + ys[4].reduce((a, b) => a + b, 0)) / (2 * nSeg);
    return st;
  }

  /**
   * Cari paranada pada gambar biner (sudah diluruskan).
   * I = interline perkiraan, lt = tebal garis.
   */
  function findStaves(bin, w, h, I, lt, dbg) {
    const minRun = Math.max(8, Math.round(2 * I));
    const prof = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let x = 0, total = 0;
      while (x < w) {
        while (x < w && !bin[row + x]) x++;
        const a = x;
        while (x < w && bin[row + x]) x++;
        if (x - a >= minRun) total += x - a;
      }
      prof[y] = total;
    }
    let maxP = 0; for (let y = 0; y < h; y++) if (prof[y] > maxP) maxP = prof[y];
    // ambang rendah: sistem terakhir bisa pendek; teks/balok jarang punya run panjang ≥ 2 interline sebanyak ini
    const thr = Math.max(5 * I, 0.06 * w);
    // kandidat garis: baris berturutan di atas ambang
    // kandidat garis = puncak lokal profil (tahan terhadap balok/akor yang menempel pada garis)
    const cands = [];
    const rad = Math.max(2, lt + 1);
    for (let y = 1; y < h - 1; y++) {
      const v = prof[y];
      if (v < thr) continue;
      let isMax = true;
      for (let d = -rad; d <= rad && isMax; d++) {
        if (!d || y + d < 0 || y + d >= h) continue;
        if (prof[y + d] > v || (prof[y + d] === v && d < 0)) isMax = false;
      }
      if (!isMax) continue;
      let s = 0, sw = 0;
      for (let d = -lt; d <= lt; d++) { const q = y + d; if (q >= 0 && q < h && prof[q] >= 0.5 * v) { s += prof[q] * q; sw += prof[q]; } }
      cands.push({ y: s / sw, len: v, used: false });
    }
    if (dbg) { dbg.cands = cands.map(c => [Math.round(c.y), Math.round(c.len)]); dbg.thr = thr; }
    // susun lima garis berjarak ~I: kumpulkan semua kelompok sah, pilih yang terkuat dulu
    const groups = [];
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length && cands[j].y - cands[i].y < 1.6 * I; j++) {
        const d = cands[j].y - cands[i].y;
        if (d < 0.6 * I) continue;
        const pick = [i, j];
        let ok = true;
        for (let k = 2; k < 5; k++) {
          const target = cands[i].y + k * d;
          let bj = -1, bd = 1e9;
          for (let m = j + 1; m < cands.length && cands[m].y < target + 0.35 * d; m++) {
            const dd = Math.abs(cands[m].y - target);
            if (dd < bd || (dd < bd + 1 && cands[m].len > cands[bj].len)) { bd = dd; bj = m; }
          }
          if (bj < 0 || bd > Math.max(2, 0.22 * d)) { ok = false; break; }
          pick.push(bj);
        }
        if (!ok) continue;
        const lens = pick.map(q => cands[q].len);
        const mn = Math.min(...lens), mxl = Math.max(...lens);
        if (mn < 0.3 * mxl) continue;
        const ys = pick.map(q => cands[q].y);
        const dd = (ys[4] - ys[0]) / 4;
        let err = 0;
        for (let k = 0; k < 5; k++) err += Math.abs(ys[k] - (ys[0] + k * dd));
        groups.push({ pick, ys, score: mn * (1 - Math.min(0.9, err / (2 * dd))) });
      }
    }
    groups.sort((a, b) => b.score - a.score);
    const staves = [];
    for (const g of groups) {
      if (g.pick.some(q => cands[q].used)) continue;
      // jangan tumpang tindih dengan paranada yang sudah diterima
      if (staves.some(ys => g.ys[0] < ys[4] + 0.5 * I && g.ys[4] > ys[0] - 0.5 * I)) continue;
      g.pick.forEach(q => { cands[q].used = true; });
      staves.push(g.ys);
    }
    // batas horizontal & pelacakan lokal tiap paranada (dari bagian terkuat ke dua arah)
    const out = [];
    for (const ys of staves) {
      const Is = (ys[4] - ys[0]) / 4;
      const band = Math.max(1, Math.round(lt * 0.6 + 0.5));
      const segW = Math.max(6, Math.round(1.5 * Is));
      const nAll = Math.ceil(w / segW);
      const inkNear = (x, yc) => {
        const yy = Math.round(yc);
        for (let d = -band; d <= band; d++) { const q = yy + d; if (q >= 0 && q < h && bin[q * w + x]) return 1; }
        return 0;
      };
      const coverage = (sIdx, yArr) => {
        const xa = sIdx * segW, xb = Math.min(w - 1, xa + segW - 1);
        let c = 0, n = 0;
        for (let x = xa; x <= xb; x++) { let k5 = 0; for (let k = 0; k < 5; k++) k5 += inkNear(x, yArr[k]); c += k5 >= 3 ? 1 : 0; n++; }
        return c / n;
      };
      const rowInk = (yy, xa, xb) => { if (yy < 0 || yy >= h) return 0; let c = 0; const row = yy * w; for (let x = xa; x <= xb; x++) c += bin[row + x]; return c; };
      const refine = (sIdx, guess) => {
        const xa = sIdx * segW, xb = Math.min(w - 1, xa + segW - 1);
        // geser kelima garis bersama (tahan tarikan balok), lalu setel halus ±1 per garis
        const r = Math.max(2, Math.round(0.15 * Is));
        let bestD = 0, bestS = -1;
        for (let d = -r; d <= r; d++) {
          let sc = 0;
          for (let k = 0; k < 5; k++) { const yy = Math.round(guess[k] + d); sc += rowInk(yy, xa, xb) + 0.5 * (rowInk(yy - 1, xa, xb) + rowInk(yy + 1, xa, xb)); }
          sc -= Math.abs(d) * 0.5;
          if (sc > bestS) { bestS = sc; bestD = d; }
        }
        const res = [];
        for (let k = 0; k < 5; k++) {
          const g = Math.round(guess[k] + bestD);
          let by = g, bc = -1;
          for (const d of [0, -1, 1]) { const c = rowInk(g + d, xa, xb) - (d ? 0.5 : 0); if (c > bc) { bc = c; by = g + d; } }
          let sw = 0, swy = 0;
          for (let d = -band; d <= band; d++) { const c = rowInk(by + d, xa, xb); sw += c; swy += c * (by + d); }
          res.push(sw > 0 ? swy / sw : by);
        }
        for (let k = 1; k < 5; k++) { const d = res[k] - res[k - 1]; if (d < 0.8 * Is || d > 1.2 * Is) res[k] = res[k - 1] + Is; }
        return res;
      };
      // benih: segmen dengan cakupan tertinggi memakai posisi global
      let seed = -1, seedC = 0;
      for (let sIdx = 0; sIdx < nAll; sIdx++) { const c = coverage(sIdx, ys); if (c > seedC) { seedC = c; seed = sIdx; } }
      if (seed < 0 || seedC < 0.6) continue;
      const segY = new Map();
      segY.set(seed, refine(seed, ys));
      let last = seed, first = seed;
      for (const dir of [1, -1]) {
        let prev = segY.get(seed), miss = 0, sIdx = seed + dir;
        while (sIdx >= 0 && sIdx < nAll) {
          const yArr = refine(sIdx, prev);
          const c = coverage(sIdx, yArr);
          // foto: garis bisa putus-putus -> toleransi beberapa segmen lemah, berhenti bila benar-benar habis
          if (c < 0.4) {
            miss++;
            const nothing = c < 0.12;
            if ((nothing && miss >= 2) || miss >= 6) break;
            segY.set(sIdx, yArr); prev = yArr;
          } else {
            miss = 0; segY.set(sIdx, yArr); prev = yArr;
            if (dir > 0) last = sIdx; else first = sIdx;
          }
          sIdx += dir;
        }
      }
      // isi segmen yang terlewat (miss tunggal) dengan interpolasi
      const nSeg = last - first + 1;
      const lines = [0, 1, 2, 3, 4].map(() => new Float64Array(nSeg));
      for (let i = 0; i < nSeg; i++) {
        let arr = segY.get(first + i);
        if (!arr) {
          const a = segY.get(first + i - 1) || segY.get(first + i + 1);
          arr = a;
        }
        for (let k = 0; k < 5; k++) lines[k][i] = arr[k];
      }
      // batas tepat per kolom
      const tmp = makeStaff(lines, first * segW, (last + 1) * segW - 1, segW);
      let x0 = first * segW, x1 = Math.min(w - 1, (last + 1) * segW - 1);
      const colOK = (x) => { let c = 0; for (let k = 0; k < 5; k++) c += inkNear(x, tmp.lineY(k, x)); return c >= 3; };
      while (x0 < x1 && !colOK(x0)) x0++;
      for (let x = x0 - 1, g = 0; x >= 0 && g < 3; x--) { if (colOK(x)) { x0 = x; g = 0; } else g++; }
      while (x1 > x0 && !colOK(x1)) x1--;
      for (let x = x1 + 1, g = 0; x < w && g < 3; x++) { if (colOK(x)) { x1 = x; g = 0; } else g++; }
      if (x1 - x0 < 8 * Is) continue;
      const stf = makeStaff(lines, first * segW, (last + 1) * segW - 1, segW);
      stf.x0 = x0; stf.x1 = x1;
      out.push(stf);
    }
    out.sort((a, b) => a.yMid - b.yMid);
    return out;
  }

  /** Kelompokkan paranada menjadi sistem (grand staff) berdasarkan garis birama/kurung kurawal yang menyambung. */
  function groupSystems(staves, bin, w, h) {
    const n = staves.length;
    const conn = new Array(Math.max(0, n - 1)).fill(false);
    for (let i = 0; i < n - 1; i++) {
      const A = staves[i], B = staves[i + 1];
      const I = (A.I + B.I) / 2;
      if (B.yMid - A.yMid > 22 * I) continue;
      const xa = Math.max(0, Math.min(A.x0, B.x0) - Math.round(4 * I));
      const xb = Math.min(w - 1, Math.max(A.x0, B.x0) + Math.round(2 * I));
      let found = false;
      for (let x = xa; x <= xb && !found; x++) {
        const y0 = Math.round(A.bottom(x)), y1 = Math.round(B.top(x));
        let ink = 0;
        for (let y = y0; y <= y1; y++) {
          let any = 0;
          for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && bin[y * w + xx]) { any = 1; break; } }
          ink += any;
        }
        if (ink >= 0.92 * (y1 - y0 + 1)) {
          // tolak garis yang memanjang jauh melewati kedua paranada (tepi foto, bayangan, dll.)
          let up = y0; while (up > 0 && (bin[(up - 1) * w + x] || (x > 0 && bin[(up - 1) * w + x - 1]) || (x < w - 1 && bin[(up - 1) * w + x + 1]))) up--;
          let dn = y1; while (dn < h - 1 && (bin[(dn + 1) * w + x] || (x > 0 && bin[(dn + 1) * w + x - 1]) || (x < w - 1 && bin[(dn + 1) * w + x + 1]))) dn++;
          if (up >= A.top(x) - 3 * I && dn <= B.bottom(x) + 3 * I && x > 2 && x < w - 3) found = true;
        }
      }
      conn[i] = found;
    }
    const systems = [];
    let cur = [staves[0]];
    for (let i = 1; i < n; i++) {
      if (conn[i - 1]) cur.push(staves[i]);
      else { systems.push(cur); cur = [staves[i]]; }
    }
    if (n) systems.push(cur);
    // tanpa sambungan sama sekali: anggap piano, pasangkan berurutan
    if (n > 1 && conn.every(c => !c)) {
      const paired = [];
      for (let i = 0; i < n; i += 2) paired.push(staves.slice(i, i + 2));
      return paired;
    }
    return systems;
  }

  /**
   * Hapus garis paranada & garis bantu dari salinan gambar.
   * Piksel garis dihapus hanya bila tebal vertikalnya ≈ tebal garis (tidak memotong simbol).
   * Mengembalikan {img, ledgers:[{staff, p, x0, x1}]}
   */
  function removeLines(bin, w, h, staves, lt) {
    const img = new Uint8Array(bin);
    const maxRun = lt + 2;
    const eraseAt = (x, yc) => {
      // cari piksel tinta terdekat di sekitar yc
      let y = -1;
      for (let d = 0; d <= Math.max(2, lt); d++) {
        if (yc + d < h && img[(yc + d) * w + x]) { y = yc + d; break; }
        if (yc - d >= 0 && img[(yc - d) * w + x]) { y = yc - d; break; }
      }
      if (y < 0) return false;
      let a = y, b = y;
      while (a > 0 && img[(a - 1) * w + x]) a--;
      while (b < h - 1 && img[(b + 1) * w + x]) b++;
      if (b - a + 1 <= maxRun) {
        // jangan putus sambungan: bila kolom tetangga punya goresan menempel tepat di atas/bawah garis, biarkan
        for (const dx of [-1, 1]) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const up = a > 0 && bin[(a - 1) * w + xx], dn = b < h - 1 && bin[(b + 1) * w + xx];
          if (up || dn) {
            // tetangga yang juga hanya garis tipis tidak dihitung
            let ta = a - 1, tb = b + 1;
            while (ta > 0 && bin[(ta - 1) * w + xx]) ta--;
            while (tb < h - 1 && bin[(tb + 1) * w + xx]) tb++;
            if (tb - ta + 1 > maxRun + 1) return false;
          }
        }
        for (let q = a; q <= b; q++) img[q * w + x] = 0;
        return true;
      }
      return false;
    };
    const ledgers = [];
    staves.forEach((st, si) => {
      const I = st.I;
      const xa = Math.max(0, Math.round(st.x0 - I)), xb = Math.min(w - 1, Math.round(st.x1 + I));
      for (let k = 0; k < 5; k++) {
        for (let x = xa; x <= xb; x++) eraseAt(x, Math.round(st.lineY(k, x)));
      }
      // garis bantu: segmen horizontal tipis di posisi genap di luar paranada
      for (const p of [-2, -4, -6, -8, -10, -12, 10, 12, 14, 16, 18, 20]) {
        let x = xa;
        while (x <= xb) {
          const yc = Math.round(st.yAt(p, x));
          if (yc < 1 || yc >= h - 1) { x++; continue; }
          // tinta di sekitar yc?
          let hit = -1;
          for (let d = -1; d <= 1; d++) if (img[(yc + d) * w + x]) { hit = yc + d; break; }
          if (hit < 0) { x++; continue; }
          // ikuti segmen horizontal pada baris hit (toleransi 1 piksel naik/turun)
          let x2 = x, yy = hit;
          while (x2 + 1 <= xb) {
            let nxt = -1;
            for (const d of [0, -1, 1]) { const q = yy + d; if (q >= 0 && q < h && img[q * w + x2 + 1]) { nxt = q; break; } }
            if (nxt < 0) break;
            yy = nxt; x2++;
          }
          const len = x2 - x + 1;
          if (len >= 1.1 * I && len <= 6 * I) {
            // segmen ini garis bantu bila sebagian besar kolomnya tipis
            let thin = 0;
            for (let q = x; q <= x2; q++) {
              const yq = Math.round(st.yAt(p, q));
              let a = -1;
              for (let d = -1; d <= 1; d++) if (img[(yq + d) * w + q]) { a = yq + d; break; }
              if (a < 0) continue;
              let t = a, b = a;
              while (t > 0 && img[(t - 1) * w + q]) t--;
              while (b < h - 1 && img[(b + 1) * w + q]) b++;
              if (b - t + 1 <= maxRun) thin++;
            }
            if (thin >= 0.2 * len) {
              ledgers.push({ staff: si, p, x0: x, x1: x2, y: st.yAt(p, (x + x2) / 2) });
              for (let q = x; q <= x2; q++) eraseAt(q, Math.round(st.yAt(p, q)));
            }
          }
          x = x2 + 1;
        }
      }
    });
    return { img, ledgers };
  }

  root.NotasiOMRStaff = { findStaves, groupSystems, removeLines, makeStaff };
})(typeof self !== 'undefined' ? self : globalThis);
