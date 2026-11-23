/* ==========================================================================
   NOTASI — main.js
   Interaksi situs (cursor, menu, smooth scroll, animasi) + logika ruang kerja.
   ========================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = typeof window.gsap !== 'undefined';
  if (!hasGsap) document.documentElement.classList.add('no-gsap');

  /* ======================= CURSOR ======================= */
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  if (fine) {
    document.body.classList.add('has-cursor');
    const cur = $('.cursor'), dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
    const pos = { x: mouse.x, y: mouse.y };
    addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px) translate(-50%,-50%)`; }, { passive: true });
    addEventListener('mousedown', () => cur.classList.add('is-down'));
    addEventListener('mouseup', () => cur.classList.remove('is-down'));
    document.addEventListener('mouseleave', () => cur.classList.add('is-hidden'));
    document.addEventListener('mouseenter', () => cur.classList.remove('is-hidden'));
    (function loop() {
      pos.x += (mouse.x - pos.x) * 0.18; pos.y += (mouse.y - pos.y) * 0.18;
      ring.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-cursor], a, button');
      if (t) { cur.classList.add('is-link'); label.textContent = t.dataset.cursor || ''; }
    });
    document.addEventListener('mouseout', e => {
      const t = e.target.closest('[data-cursor], a, button');
      if (t && !t.contains(e.relatedTarget)) { cur.classList.remove('is-link'); label.textContent = ''; }
    });
  }

  /* ======================= SMOOTH SCROLL ======================= */
  let lenis = null;
  if (!reduce && typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    if (hasGsap && window.ScrollTrigger) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })();
    }
  }
  function scrollToEl(target) {
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { offset: -20, duration: 1.4 });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id === '#top' ? document.body : $(id);
    if (!target) return;
    e.preventDefault();
    closeMenu();
    setTimeout(() => scrollToEl(target), document.body.classList.contains('menu-open') ? 0 : 0);
  });

  /* ======================= MENU ======================= */
  const toggle = $('#menuToggle'), menu = $('#menu');
  function openMenu() { document.body.classList.add('menu-open'); toggle.setAttribute('aria-expanded', 'true'); menu.setAttribute('aria-hidden', 'false'); $('.nav__toggle-txt').textContent = 'Tutup'; if (lenis) lenis.stop(); }
  function closeMenu() { document.body.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-hidden', 'true'); $('.nav__toggle-txt').textContent = 'Menu'; if (lenis) lenis.start(); }
  toggle.addEventListener('click', () => document.body.classList.contains('menu-open') ? closeMenu() : openMenu());
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  /* Hover reveal: gambar mengikuti kursor */
  function hoverReveal(listSel, figSel, imgSel) {
    const fig = $(figSel), img = $(imgSel);
    if (!fig || !fine) return;
    const p = { x: 0, y: 0 };
    let active = false;
    $$(listSel).forEach(a => {
      a.addEventListener('mouseenter', () => { if (img.getAttribute('src') !== a.dataset.img) img.src = a.dataset.img; fig.classList.add('is-on'); active = true; });
      a.addEventListener('mouseleave', () => { fig.classList.remove('is-on'); active = false; });
    });
    (function loop() {
      p.x += (mouse.x + 140 - p.x) * 0.12; p.y += (mouse.y - p.y) * 0.12;
      if (active || fig.classList.contains('is-on')) fig.style.left = p.x + 'px', fig.style.top = p.y + 'px';
      requestAnimationFrame(loop);
    })();
  }
  hoverReveal('.menu__list a', '.menu__reveal', '[data-reveal-img]');
  hoverReveal('.scan__list a', '.scan__reveal', '[data-scan-img]');

  /* Fallback gambar: bila Unsplash gagal dimuat, bingkai tetap hitam elegan */
  $$('img').forEach(img => {
    const broken = () => img.classList.add('is-broken');
    img.addEventListener('error', broken);
    img.addEventListener('load', () => img.classList.remove('is-broken'));
    if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) broken();
  });

  /* ======================= ANIMASI GSAP ======================= */
  function splitChars(node) {
    const text = node.textContent; node.textContent = '';
    for (const ch of text) { const s = document.createElement('span'); s.className = 'char'; s.textContent = ch; node.append(s); }
    return $$('.char', node);
  }

  if (hasGsap && !reduce) {
    gsap.registerPlugin(ScrollTrigger);
    // Hero intro
    const notC = splitChars($('.hero__w--not'));
    const balC = splitChars($('.hero__w--balok'));
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.from(notC, { yPercent: 110, rotate: 6, duration: 1.4, stagger: 0.06 })
      .from(balC, { yPercent: -120, duration: 1.4, stagger: 0.05 }, 0.15)
      .from('.hero__frame img', { clipPath: 'inset(100% 0 0 0)', scale: 1.2, duration: 1.6 }, 0.2)
      .from('.hero__w--angka', { xPercent: -12, opacity: 0, duration: 1.4 }, 0.6)
      .from('.hero__lede, .hero__cta, .hero__frame figcaption, .hero__side', { y: 30, opacity: 0, duration: 1.1, stagger: 0.08 }, 0.8)
      .from('.hero__staff > i', { scaleX: 0, transformOrigin: 'left', duration: 1.6, stagger: 0.07, ease: 'expo.inOut' }, 0)
      .from('.hn', { scale: 0, opacity: 0, duration: .8, stagger: 0.09, ease: 'back.out(2)' }, 0.9);

    // Scroll: not balok berubah jadi angka
    gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } })
      .to('.hn', { scale: 0, opacity: 0, rotate: 90, stagger: 0.05 }, 0)
      .to('.hero__digits span', { opacity: 1, y: 0, stagger: 0.05 }, 0.05)
      .to('.hero__frame img', { yPercent: 14, scale: 1.08 }, 0)
      .to('.hero__w--not', { xPercent: -8 }, 0)
      .to('.hero__w--balok', { xPercent: 6 }, 0);

    // Reveal asimetris: ganjil dari kiri, genap dari kanan
    $$('[data-reveal]').forEach((n, i) => {
      gsap.from(n, { y: 70, x: i % 2 ? 40 : -40, opacity: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: n, start: 'top 88%' } });
    });

    // Angka raksasa "02" melayang
    gsap.to('.work__num', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: '.work', start: 'top bottom', end: 'bottom top', scrub: true } });

    // Proses: horizontal scroll yang di-pin
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px)', () => {
      const track = $('.proc__track');
      const dist = () => track.scrollWidth - innerWidth;
      gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: '.proc', pin: '.proc__pin', start: 'top top', end: () => '+=' + dist(), scrub: 0.8, invalidateOnRefresh: true }
      });
      gsap.to('.step__n', { rotate: -8, ease: 'none', scrollTrigger: { trigger: '.proc', start: 'top top', end: () => '+=' + dist(), scrub: true } });
    });

    // Footer giant
    gsap.from('.foot__giant', { xPercent: 30, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  }

  /* ======================= RUANG KERJA ======================= */
  const work = $('#ruang-kerja');
  const drop = $('#drop'), fileInput = $('#file'), notice = $('#notice');
  const out = $('#out'), controls = $('#controls'), sheetHost = $('#sheet');
  const state = { review: false, checked: new Set(), score: null, result: null, tokenIndex: [], fs: innerWidth < 600 ? 15 : innerWidth < 1100 ? 19 : 22, opts: { minorMode: 'la', harmonyMode: 'auto' }, chordDisplay: 'all', tempo: 90 };

  function showNotice(html, isError) {
    notice.hidden = false; notice.innerHTML = html;
    notice.classList.toggle('is-error', !!isError);
  }
  function hideNotice() { notice.hidden = true; }

  /* ---------- OMR: gambar JPG/PNG -> MusicXML lewat server Audiveris ---------- */
  const OMR_URL = (window.NOTASI_OMR_URL || 'api/omr').replace(/\/$/, '');
  let omrAvailable = null;
  async function checkOmr() {
    try {
      const r = await fetch(OMR_URL + '/status', { cache: 'no-store' });
      const j = await r.json();
      omrAvailable = !!j.available;
    } catch (e) { omrAvailable = false; }
    document.documentElement.classList.toggle('omr-on', omrAvailable);
    return omrAvailable;
  }
  checkOmr();

  const isImg = f => /^image\/(png|jpeg)$/.test(f.type) || /\.(png|jpe?g)$/i.test(f.name);
  let visionAbort = null;

  /** Gambar JPG/PNG -> not angka. Jalur 1: server Audiveris. Jalur 2: Claude membaca gambar (di halaman artifact). */
  async function handleImages(files) {
    files = files.filter(isImg);
    if (!files.length) return;
    if (omrAvailable === null) await checkOmr();
    const urls = files.map(f => URL.createObjectURL(f));
    const fail = (err) => {
      console.error(err);
      urls.forEach(u => URL.revokeObjectURL(u));
      showNotice('<b>Gambar tidak berhasil dibaca.</b> ' + escapeHtml(err.message || err) + '<br>Tips: foto tegak lurus, terang merata, tidak miring/terlipat, resolusi tinggi (setara scan 300 dpi).', true);
    };

    if (omrAvailable) {
      if (files.length > 1) showNotice('<b>Server Audiveris membaca satu gambar per kali</b> — halaman pertama yang diproses.');
      showNotice(`<b>Audiveris sedang membaca partitur…</b> <span class="omr-spin"></span> biasanya 20–90 detik per halaman. Setelah selesai, layar periksa terbuka di samping gambar aslinya.`);
      try {
        const r = await fetch(OMR_URL, { method: 'POST', headers: { 'Content-Type': files[0].type || 'application/octet-stream', 'X-Filename': encodeURIComponent(files[0].name) }, body: files[0] });
        if (!r.ok) {
          let msg = 'Server mengembalikan ' + r.status;
          try { const j = await r.json(); msg = j.error || msg; } catch (e) { /* bukan JSON */ }
          throw new Error(msg);
        }
        const text = await NotasiMusicXML.readFile(new File([await r.arrayBuffer()], 'omr.mxl'));
        load(text, { images: urls.slice(0, 1), fromImage: true });
      } catch (err) { fail(err); }
      return;
    }

    if (await NotasiVision.available()) {
      if (visionAbort) visionAbort.abort();
      visionAbort = new AbortController();
      const t0 = Date.now();
      const msg = (n) => showNotice(`<b>Claude sedang membaca ${files.length > 1 ? files.length + ' halaman' : 'partitur'} dari gambar…</b> <span class="omr-spin"></span> ${n ? `${n} birama tersalin` : 'menganalisis gambar'} · ${Math.round((Date.now() - t0) / 1000)} dtk<br><span class="mono">bisa 1–3 menit · setelahnya layar periksa terbuka di samping gambar</span> <button type="button" class="inlineLink" id="visionCancel">batalkan</button>`);
      let last = 0; msg(0);
      const timer = setInterval(() => msg(last), 1000);
      document.addEventListener('click', function c(e) { if (e.target.id === 'visionCancel') { visionAbort.abort(); document.removeEventListener('click', c); } });
      try {
        const { xml, problems } = await NotasiVision.readImages(files, n => { last = n; }, visionAbort.signal);
        clearInterval(timer);
        load(xml, { images: urls, fromImage: true });
        if (problems.length) showNotice('<b>Beberapa simbol tidak terbaca dan dilewati:</b><br>' + problems.slice(0, 6).map(escapeHtml).join('<br>') + (problems.length > 6 ? `<br>…dan ${problems.length - 6} lagi` : '') + '<br>Periksa birama tersebut di mode periksa.', true);
      } catch (err) {
        clearInterval(timer);
        if (err && (err.name === 'AbortError' || err.code === 'aborted')) { showNotice('Pembacaan dibatalkan.'); return; }
        if (err && err.code === 'not_granted') { showNotice('<b>Izin membaca gambar belum diberikan.</b> Unggah lagi lalu pilih izinkan pada dialog yang muncul.', true); return; }
        if (err && err.code === 'rate_limited') { showNotice('<b>Batas pemakaian sementara tercapai.</b> Tunggu sebentar lalu coba lagi.', true); return; }
        fail(err);
      }
      return;
    }

    urls.forEach(u => URL.revokeObjectURL(u));
    showNotice(`<b>Pembaca gambar tidak tersedia di sini.</b> Buka NOTASI lewat link artifact Claude (gambar dibaca oleh Claude), atau jalankan versi Docker dengan Audiveris (<span class="mono">docker run -p 8000:8000 notasi</span>). Berkas MusicXML tetap bisa langsung dipakai.`, true);
  }

  async function handleFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
      showNotice('<b>PDF belum didukung langsung.</b> Simpan/screenshot tiap halaman sebagai JPG atau PNG, lalu unggah gambarnya.', true);
      return;
    }
    if (isImg(file)) { handleImages([file]); return; }
    if (/^image\//.test(file.type)) { showNotice('<b>Format gambar ini belum didukung.</b> Gunakan JPG atau PNG.', true); return; }
    try {
      const text = await NotasiMusicXML.readFile(file);
      load(text);
    } catch (err) {
      console.error(err);
      showNotice('<b>Gagal membaca berkas.</b> ' + escapeHtml(err.message), true);
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

  function load(xmlText, extra = {}) {
    NotasiPlayer.stop();
    NotasiEditor.reset();
    state.checked = new Set();
    setReviewImage(extra.images || null);
    try {
      state.score = NotasiMusicXML.parse(xmlText);
    } catch (err) {
      showNotice('<b>Berkas tidak bisa diproses.</b> ' + escapeHtml(err.message), true);
      return;
    }
    hideNotice();
    setReview(!!extra.fromImage);
    state.tempo = Math.round(state.score.tempo);
    $('#tempo').value = state.tempo; $('#tempoOut').textContent = state.tempo;
    work.classList.add('has-output');
    out.hidden = false; controls.hidden = false;
    refresh();
    if (hasGsap && !reduce) {
      gsap.from(out, { y: 80, opacity: 0, duration: 1.2, ease: 'expo.out' });
      gsap.from($$('.m', out).slice(0, 24), { y: 24, opacity: 0, duration: .8, stagger: .025, ease: 'expo.out', delay: .2 });
      gsap.from($$('.ctrl > *'), { x: -30, opacity: 0, duration: .9, stagger: .05, ease: 'expo.out' });
      if (window.ScrollTrigger) setTimeout(() => ScrollTrigger.refresh(), 60);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (lenis) { lenis.resize(); lenis.scrollTo(out, { offset: -120, duration: 1.4 }); }
      else out.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    }));
  }

  function refresh() {
    if (!state.score) return;
    NotasiPlayer.stop();
    const res = NotasiConvert.convert(state.score, state.opts);
    state.result = res;
    out.style.setProperty('--fs', state.fs + 'px');
    $('#outTitle').textContent = res.title;
    $('#outComposer').textContent = res.composer || '';
    const t = res.time;
    $('#outMeta').innerHTML =
      `<dt>do =</dt><dd class="big">${escapeHtml(res.doLabel)}</dd>` +
      `<dt>tangga nada</dt><dd>${escapeHtml(res.keyLabel)}</dd>` +
      `<dt>birama</dt><dd>${t.beats}/${t.beatType}</dd>` +
      `<dt>tempo</dt><dd>♩ = ${Math.round(res.tempo)}</dd>`;
    $('#navTicker').textContent = `do = ${res.doLabel} · ${t.beats}/${t.beatType} · ♩ = ${Math.round(res.tempo)}`;

    const src = res.harmonySource === 'score' ? '<li class="src">harmoni: tertulis di partitur</li>'
      : res.harmonySource === 'analysis' ? '<li class="src src--analysis">harmoni: hasil analisis nada — periksa</li>' : '';
    const lines = res.lines.map((l, i) => `<li data-k="${String.fromCharCode(65 + i)}">${escapeHtml(l.label)} · 1 = ${escapeHtml(l.doLabel + l.refOctave)}</li>`).join('');
    $('#outLegend').innerHTML = src + lines + (res.lines.length > 1 ? '<li data-k="↕">baris berurutan A, B… di tiap birama</li>' : '');

    const r = NotasiRender.render(sheetHost, res, { chordDisplay: state.chordDisplay, checked: state.checked });
    state.tokenIndex = r.tokenIndex;
    updateProgress();
    const nNotes = r.tokenIndex.filter(x => x.t.kind === 'note').length;
    $('#outFoot').textContent = `${res.measures.length} birama · ${nNotes} not/akor dikonversi · titik di atas/bawah angka = oktaf · garis bawah = ½ / ¼ ketukan · “.” = tahan · garis miring “/” menembus angka = dinaikkan, “\\” = diturunkan · arahkan kursor ke angka untuk melihat nada aslinya.`;
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  // Drag & drop
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  const handleList = list => { const fs = Array.from(list || []); if (!fs.length) return; if (fs.every(isImg) && fs.length > 1) handleImages(fs); else handleFile(fs[0]); };
  drop.addEventListener('drop', e => { e.stopPropagation(); handleList(e.dataTransfer.files); });
  // seluruh halaman menerima drop
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); handleList(e.dataTransfer.files); });
  fileInput.addEventListener('change', () => handleList(fileInput.files));
  $('#demoBtn').addEventListener('click', () => load(NotasiDemo.xml()));

  // Kontrol
  $$('input[name=minor]').forEach(i => i.addEventListener('change', () => { state.opts.minorMode = i.value; refresh(); }));
  $$('input[name=harm]').forEach(i => i.addEventListener('change', () => { state.opts.harmonyMode = i.value; refresh(); }));
  $$('input[name=chord]').forEach(i => i.addEventListener('change', () => { state.chordDisplay = i.value; refresh(); }));
  $$('[data-size]').forEach(b => b.addEventListener('click', () => { state.fs = Math.max(14, Math.min(40, state.fs + Number(b.dataset.size) * 3)); refresh(); }));
  $('#tempo').addEventListener('input', e => { state.tempo = Number(e.target.value); $('#tempoOut').textContent = state.tempo; });
  const playBtn = $('#playBtn');
  playBtn.addEventListener('click', () => {
    if (NotasiPlayer.isPlaying()) { NotasiPlayer.stop(); return; }
    playBtn.classList.add('is-playing'); $('.ctrl__play-txt', playBtn).textContent = 'Hentikan';
    NotasiPlayer.play(state.tokenIndex, state.tempo, () => { playBtn.classList.remove('is-playing'); $('.ctrl__play-txt', playBtn).textContent = 'Dengarkan hasil'; });
  });
  $('#printBtn').addEventListener('click', () => window.print());
  $('#resetBtn').addEventListener('click', () => {
    NotasiPlayer.stop();
    NotasiEditor.reset(); setReview(false); setReviewImage(null);
    state.score = null; out.hidden = true; controls.hidden = true; work.classList.remove('has-output'); fileInput.value = '';
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });

  /* ======================= MODE PERIKSA ======================= */
  const reviewFig = $('#reviewFig'), reviewBtn = $('#reviewBtn');
  let reviewUrls = [];
  function setReviewImage(urls) {
    reviewUrls.forEach(u => URL.revokeObjectURL(u));
    reviewUrls = urls || [];
    const box = $('.review__scroll', reviewFig);
    box.innerHTML = '';
    reviewUrls.forEach((u, i) => { const im = document.createElement('img'); im.src = u; im.alt = 'Halaman ' + (i + 1) + ' partitur yang diunggah'; box.append(im); });
    reviewFig.hidden = !reviewUrls.length;
  }
  function setReview(on) {
    state.review = on;
    work.classList.toggle('is-review', on);
    reviewBtn.setAttribute('aria-pressed', String(on));
    $('.ctrl__review-txt', reviewBtn).textContent = on ? 'Mode periksa: aktif' : 'Mode periksa & koreksi';
    if (window.ScrollTrigger) setTimeout(() => ScrollTrigger.refresh(), 50);
  }
  reviewBtn.addEventListener('click', () => setReview(!state.review));
  let zoom = 100;
  $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    zoom = Math.max(60, Math.min(400, zoom + Number(b.dataset.zoom) * 25));
    $$('.review__scroll img').forEach(im => { im.style.width = zoom + '%'; });
  }));

  function updateProgress() {
    const res = state.result; if (!res) return;
    const n = res.measures.length, c = state.checked.size;
    const warn = res.measures.filter(m => m.rhythmWarn && m.rhythmWarn.length).length;
    $('#reviewProg').innerHTML = `<b>${c}/${n}</b> birama dicek${warn ? ` · <span class="warn">${warn} birama ketukannya tidak pas</span>` : ''}${c === n && !warn ? ' · <span class="done">semua birama sudah dicek ✓</span>' : ''}`;
    $('#undoBtn').disabled = !NotasiEditor.canUndo();
  }

  sheetHost.addEventListener('click', e => {
    const no = e.target.closest('.m-no');
    if (no) {
      const mi = Number(no.dataset.mi);
      if (state.checked.has(mi)) state.checked.delete(mi); else state.checked.add(mi);
      no.closest('.m').classList.toggle('m--ok', state.checked.has(mi));
      updateProgress();
      return;
    }
    const tk = e.target.closest('.tk');
    if (!tk) return;
    const hit = state.tokenIndex.find(x => x.node === tk);
    if (!hit) return;
    NotasiEditor.open(hit.t, tk, {
      score: state.score,
      onChange: (desc, t) => {
        // birama yang dikoreksi otomatis dianggap belum dicek ulang
        if (t) state.checked.delete(t.mIndex);
        const keepY = scrollY;
        refresh();
        if (lenis) lenis.scrollTo(keepY, { immediate: true }); else scrollTo(0, keepY);
        NotasiEditor.reopen(state.tokenIndex, t);
        updateProgress();
      }
    });
  });
  $('#undoBtn').addEventListener('click', () => { NotasiEditor.undo({ score: state.score, onChange: () => { refresh(); updateProgress(); } }); });
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && state.score && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); $('#undoBtn').click();
    }
  });

  // Ekspor MusicXML hasil koreksi tidak tersedia; yang disimpan adalah lembar not angka (cetak/PDF).

  // Buka demo otomatis lewat ?demo
  if (/[?&]demo\b/.test(location.search)) load(NotasiDemo.xml());
})();
