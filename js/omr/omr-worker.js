/* ==========================================================================
   NOTASI OMR — omr-worker.js
   Menjalankan pembaca partitur di thread terpisah agar halaman tetap responsif.
   Pesan masuk : { id, images: [ArrayBuffer...] }
   Pesan keluar: { id, type: 'progress'|'done'|'error', ... }
   ========================================================================== */
/* global importScripts, NotasiOMR, NotasiOMRImage */
importScripts('glyphs.js', 'omr-image.js', 'omr-staff.js', 'omr-symbols.js', 'omr-assemble.js', 'omr.js');

self.onmessage = async (e) => {
  const { id, images } = e.data;
  const post = (m) => self.postMessage(Object.assign({ id }, m));
  try {
    const pages = [];
    for (let i = 0; i < images.length; i++) {
      post({ type: 'progress', page: i + 1, pages: images.length, step: 'Membuka gambar' });
      const bmp = await createImageBitmap(new Blob([images[i]]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height);
      const gray = NotasiOMRImage.toGray(d.data, bmp.width, bmp.height);
      if (bmp.close) bmp.close();
      const res = NotasiOMR.recognizePage(gray, d.width, d.height, (msg) => post({ type: 'progress', page: i + 1, pages: images.length, step: msg }));
      pages.push({ data: res.data, warnings: res.warnings });
    }
    const merged = NotasiOMR.mergePages(pages);
    post({ type: 'done', data: merged.data, warnings: merged.warnings });
  } catch (err) {
    post({ type: 'error', message: String((err && err.message) || err) });
  }
};
