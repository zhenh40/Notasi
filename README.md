# NOTASI — Not Balok → Not Angka + Harmoni

Website statis (HTML + CSS + JavaScript murni, GSAP + ScrollTrigger + Lenis disertakan di `vendor/`).
Partitur **MusicXML** (`.musicxml`, `.xml`, `.mxl`) diterjemahkan menjadi **not angka** lengkap dengan
harmoni (simbol akor + angka romawi / angka akor). Semua proses berjalan di browser; berkas tidak diunggah ke mana pun.

## Foto/scan JPG/PNG → not angka (mesin bawaan, tanpa server & tanpa AI luar)

NOTASI punya **mesin pembaca partitur (OMR) sendiri** yang berjalan sepenuhnya di browser pengunjung
(`js/omr/`, di Web Worker). Tidak butuh server, API key, Claude, atau internet setelah halaman terbuka —
cukup unggah folder ini ke hosting statis mana pun (GitHub Pages, Netlify, Vercel, hosting biasa) atau buka
`index.html` langsung. Gambar tidak diunggah ke mana pun.

Tahapannya: binerisasi adaptif → luruskan kemiringan → normalisasi ukuran → deteksi & penghapusan garis paranada
(dilacak per segmen, tahan garis putus-putus pada foto) → grand staff piano → kunci G/F, tanda kunci, sukat →
kepala not penuh/kosong/bulat (transformasi jarak + cetakan dari 5 font SMuFL) → tangkai, balok/bendera (dihitung
dari ketebalan pita), titik, garis birama, tanda diam, kres/mol/pugar, tali (tie), triol → birama & suara → MusicXML.
Aturan musik yang pasti (tanda kunci, kres/mol berlaku sampai akhir birama, tie lintas birama) dihitung, bukan ditebak.

### Akurasi terukur (72 gambar uji, 24 lagu piano acak, 4–5 font, kunci jawaban diketahui)

| Kondisi gambar | Not tepat (nada + ketukan + durasi) | Nada saja | Birama sempurna | Tanda kunci | Sukat |
|---|---|---|---|---|---|
| Partitur cetak bersih | **96%** | 98% | 82% | 23/24 | 24/24 |
| Hasil scan (miring ±1°, noise, JPEG) | **92%** | 98% | 73% | 24/24 | 24/24 |
| Foto ponsel (miring ±2°, buram, cahaya tidak rata, resolusi rendah) | **80%** | 95% | 49% | 24/24 | 24/24 |
| Font bergaya tulisan tangan (Petaluma) | 86% | 96% | 58% | 5/6 | 6/6 |

**Jujur soal 100%:** tidak ada mesin pembaca foto partitur (termasuk aplikasi komersial) yang menjamin 100%.
Karena itu hasil gambar selalu dibuka di **mode periksa** — gambar asli di samping hasil, birama yang jumlah
ketukannya janggal ditandai ⚠, setiap angka bisa diklik untuk dikoreksi (nada, ♭/♮/♯, oktaf, durasi, titik,
akor), Ctrl+Z, dan tiap birama dicentang setelah dicek. Setelah semua birama dicek, hasilnya 100% sesuai partitur.

Tips hasil terbaik: partitur cetak (bukan tulisan tangan), foto tegak lurus dari atas, terang merata tanpa
bayangan, fokus tajam, satu halaman per gambar, setara scan 300 dpi.

### Mesin cadangan opsional (tidak diperlukan)

Bila dideploy dengan server (`server/omr_server.py`) dan diisi `ANTHROPIC_API_KEY` atau dipasang Audiveris
(`Dockerfile.audiveris`), server itu hanya dipakai bila mesin bawaan gagal membaca gambar. Tanpa itu pun
semua fitur berjalan. Detail: bagian *Deploy dengan server* di bawah.

## Deploy dengan server (opsional)
## Menjalankan (tanpa pembaca gambar)

Cukup buka `index.html`, atau jalankan server lokal agar semua fitur browser aktif:

```bash
cd notasi && python3 -m http.server 8000
```

Lalu buka <http://localhost:8000> (tambahkan `?demo` untuk langsung memuat partitur demo).

## Yang dikonversi (1:1 dengan berkas)

| Not balok | Not angka |
|---|---|
| nada (huruf + kres/mol) | angka 1–7 relatif terhadap *do* dari tanda kunci; ejaan dipertahankan (F♯ ≠ G♭) |
| kres/mol di luar tanda kunci | garis miring `/` menembus angka (naik), `\` (turun) |
| oktaf | titik di atas/bawah angka; oktaf acuan ditulis eksplisit per baris (mis. `1 = G4`) |
| durasi | pecahan rasional eksak; dipecah di batas ketukan, garis bawah digabung per ketukan, `.` = tahan, `0` = diam |
| ikatan (tie), triol, birama pickup, 6/8, pergantian tangga nada/birama | didukung |
| akor bertumpuk, banyak part/paranada/suara | tiap suara jadi baris sendiri, ketukan sejajar antarbaris |
| lirik (banyak bait) | di bawah angka |
| `<harmony>` (simbol akor tertulis) | dibaca apa adanya → simbol, romawi, angka akor |

Lagu minor: pilih **la-based** (standar Indonesia, do = mayor relatif) atau **do-based**.

## Harmoni

* **Dari partitur** – bila berkas memuat simbol akor, itu yang dipakai (ditandai stabilo hijau).
* **Analisis** – bila tidak ada, harmoni dianalisis dari semua suara: templat akor (triad, 7, maj7, m7, m7♭5, dim7, sus, 6),
  bobot ketukan, nada lewat, nada bas (inversi), akor diatonik, dan dominan sekunder (V7/V), dengan pemrograman dinamis
  untuk menentukan titik ganti akor. Ditandai garis putus-putus: ini **tafsiran musikal**, mohon diperiksa.

## Tentang “scan” & akurasi 100%

Konversi dari MusicXML bersifat deterministik dan diuji (lihat di bawah). Pembacaan **gambar/PDF** (OMR) oleh aplikasi
mana pun tidak bisa dijamin 100%, jadi NOTASI tidak menebak isi gambar. Alurnya: scan dengan Audiveris (gratis),
MuseScore, PlayScore 2 atau SmartScore → periksa sekilas → ekspor MusicXML → lempar ke NOTASI.

## Pengujian

Memerlukan Node + Playwright (Chromium).

```bash
node tests/accuracy.test.js     # 16 kasus: tangga nada, enharmonik, minor la/do, ritme, sinkop, 6/8, pickup, akor, <harmony>, .mxl
node tests/core.test.js         # cetak hasil demo per birama
node tests/vision.test.js       # 9 kasus: tanda kunci, kres/mol per birama, ikatan lintas birama, triol, birama diam, harmoni piano
```

Uji mesin OMR (butuh Python + Verovio + Pillow, dan server statis yang melayani `/`):

```bash
pip install verovio pillow numpy
python3 tests/omr/gen_corpus.py corpus/xml 24 7                 # lagu piano acak + kunci jawaban
python3 tests/omr/render_corpus.py render corpus/xml corpus/img 11
node tests/omr/rasterize.js corpus/img/jobs.json
python3 tests/omr/render_corpus.py degrade corpus/img 13        # varian scan & foto
python3 -m http.server 8790 --bind 127.0.0.1 --directory / &
node tests/omr/run_eval.js corpus/img/manifest.json all 24 hasil.json
```

Uji silang terhadap korpus music21 (654 partitur MusicXML asli: Bach, Beethoven, Mozart, Haydn, Schumann, Joplin, lead sheet, dll.)
dengan music21 sebagai acuan independen:

```bash
python3 -m venv venv && ./venv/bin/pip install music21
find venv/lib/python3*/site-packages/music21/corpus -type f \( -name "*.mxl" -o -name "*.musicxml" -o -name "*.xml" \) > files.txt
./venv/bin/python tests/crosscheck/m21_expected.py files.txt expected.json
node tests/crosscheck/notasi_actual.js files.txt actual.json
./venv/bin/python tests/crosscheck/compare.py expected.json actual.json
```

Hasil terakhir: **651 dari 653 berkas cocok 100%** (≈447.500 nada: posisi, durasi, tinggi nada, angka, kres/mol).
Dua sisanya adalah lagu yang sama (Schumann, *Dichterliebe* no. 2, dua salinan): 4 not bertanda `<cue/>`
(not isyarat kecil) sengaja tidak ditampilkan NOTASI, sementara music21 menghitungnya sebagai not biasa.

## Struktur

```
index.html          halaman
css/style.css       desain (Obsidian #0B0B0B · Sand #E5E1D8 · Neon #00FF66)
js/theory.js        pecahan eksak, kunci, nada → angka, pemecahan ritme
js/musicxml.js      pembaca .musicxml/.mxl (unzip bawaan browser) → model skor
js/harmony.js       simbol akor, romawi, analisis harmoni
js/convert.js       model skor → model not angka
js/render.js        model not angka → DOM
js/player.js        pemutar Web Audio + sorotan not
js/editor.js        koreksi not (mode periksa)
js/vision.js        penyusun MusicXML piano dari transkripsi (dipakai mesin OMR)
js/omr/             mesin pembaca partitur bawaan (gambar, paranada, simbol, penyusun, worker)
server/omr_server.py  server statis + /api/omr (Audiveris) + /api/vision
server/vision_api.py  pembaca foto via Claude API (kode akses, batas pemakaian)
Dockerfile          image ringan untuk deploy web (Claude API)
Dockerfile.audiveris  image dengan Audiveris (tanpa API key)
render.yaml         deploy sekali klik di Render
js/demo.js          partitur demo orisinal “Senja di Pelabuhan”
js/main.js          interaksi situs + ruang kerja
vendor/             gsap, ScrollTrigger, lenis
tests/              uji ketepatan & uji silang
```

Foto: Unsplash (dimuat langsung dari images.unsplash.com; bila gagal dimuat, tampil latar tipografis).

Bentuk simbol musik di `js/omr/glyphs.js` diambil dari font SMuFL Bravura, Leland, Petaluma (© Steinberg/
MuseScore, SIL Open Font License 1.1), Leipzig dan Gootville (SIL OFL 1.1), lewat paket Verovio.
