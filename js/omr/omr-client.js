/* ==========================================================================
   NOTASI OMR — omr-client.js
   Antarmuka halaman untuk mesin pembaca partitur bawaan (tanpa server/AI luar).
   Memakai Web Worker bila bisa; jika tidak (mis. dibuka dari file:// atau
   browser lama), berjalan di thread utama.
   ========================================================================== */
(function (root) {
  'use strict';
  const BASE = (() => {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^/]*$/, '') : 'js/omr/';
  })();
  const FILES = ['glyphs.js', 'omr-image.js', 'omr-staff.js', 'omr-symbols.js', 'omr-assemble.js', 'omr.js'];
  let worker = null, workerBroken = false, seq = 0;
  const pending = new Map();

  function getWorker() {
    if (worker || workerBroken) return worker;
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('no worker');
      worker = new Worker(BASE + 'omr-worker.js');
      worker.onmessage = (e) => {
        const job = pending.get(e.data.id);
        if (!job) return;
        if (e.data.type === 'progress') job.onProgress && job.onProgress(e.data);
        else { pending.delete(e.data.id); e.data.type === 'done' ? job.resolve(e.data) : job.reject(new Error(e.data.message)); }
      };
      worker.onerror = (ev) => {
        // gagal memuat worker -> pakai thread utama untuk semua tugas yang tertunda
        workerBroken = true; worker = null;
        ev.preventDefault && ev.preventDefault();
        for (const [id, job] of pending) { pending.delete(id); runMain(job.files, job.onProgress).then(job.resolve, job.reject); }
      };
    } catch (e) { workerBroken = true; worker = null; }
    return worker;
  }

  let mainLoaded = null;
  function loadMain() {
    if (root.NotasiOMR && root.NotasiOMRSymbols && root.NotasiGlyphs) return Promise.resolve();
    if (mainLoaded) return mainLoaded;
    mainLoaded = FILES.reduce((p, f) => p.then(() => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = BASE + f; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + f));
      document.head.appendChild(s);
    })), Promise.resolve());
    return mainLoaded;
  }

  async function grayOf(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Gambar tidak bisa dibuka.')); im.src = url; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      return { gray: root.NotasiOMRImage.toGray(d.data, c.width, c.height), w: c.width, h: c.height };
    } finally { URL.revokeObjectURL(url); }
  }

  async function runMain(files, onProgress) {
    await loadMain();
    const pages = [];
    for (let i = 0; i < files.length; i++) {
      onProgress && onProgress({ page: i + 1, pages: files.length, step: 'Membuka gambar' });
      await new Promise(r => setTimeout(r, 30)); // beri kesempatan UI menggambar
      const { gray, w, h } = await grayOf(files[i]);
      const res = root.NotasiOMR.recognizePage(gray, w, h, (msg) => onProgress && onProgress({ page: i + 1, pages: files.length, step: msg }));
      pages.push({ data: res.data, warnings: res.warnings });
    }
    return root.NotasiOMR.mergePages(pages);
  }

  /**
   * @param {File[]} files  gambar JPG/PNG berurutan (halaman)
   * @param {(p:{page,pages,step})=>void} onProgress
   * @returns {Promise<{data, warnings}>}
   */
  async function recognize(files, onProgress) {
    const w = getWorker();
    if (!w) return runMain(files, onProgress);
    const buffers = await Promise.all(files.map(f => f.arrayBuffer()));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: (d) => resolve({ data: d.data, warnings: d.warnings }), reject, onProgress, files });
      w.postMessage({ id, images: buffers }, buffers);
    });
  }

  root.NotasiOMRClient = { recognize };
})(typeof window !== 'undefined' ? window : globalThis);
