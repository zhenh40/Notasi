# NOTASI — Not Balok → Not Angka + Harmoni

Website statis (HTML + CSS + JavaScript murni, GSAP + ScrollTrigger + Lenis disertakan di `vendor/`).
Partitur **MusicXML** (`.musicxml`, `.xml`, `.mxl`) diterjemahkan menjadi **not angka** lengkap dengan
harmoni (simbol akor + angka romawi / angka akor). Semua proses berjalan di browser; berkas tidak diunggah ke mana pun.

## Deploy ke website sendiri (foto JPG/PNG jalan di mana saja)

Website ini butuh **server kecil** (bukan hosting statis saja), karena foto dibaca oleh Claude lewat API key
milikmu yang disimpan di server — key tidak pernah sampai ke browser pengunjung.

1. Buat API key di <https://platform.claude.com> (berbayar per pemakaian; satu halaman partitur kira-kira beberapa sen
   sampai belasan sen dolar, tergantung kepadatan partitur).
2. Unggah folder ini ke repo GitHub.
3. **Render** (paling mudah): New + → Blueprint → pilih repo → isi `ANTHROPIC_API_KEY` → Deploy (`render.yaml` sudah ada).
   **Railway / Fly.io / VPS**: deploy `Dockerfile`, set variabel `ANTHROPIC_API_KEY`. Tanpa Docker:
   ```bash
   pip install -r requirements.txt
   ANTHROPIC_API_KEY=... python3 server/omr_server.py --port 8000
   ```

Pengaman agar kredit API tidak dihabiskan orang lain:

| Variabel | Fungsi |
|---|---|
| `NOTASI_ACCESS_CODE` | bila diisi, pengunjung harus memasukkan kode ini sebelum membaca foto |
| `NOTASI_RATE_LIMIT` | maksimal baca foto per alamat IP per jam (default 20) |
| `NOTASI_MAX_IMAGES` | maksimal halaman sekali baca (default 8) |
| `NOTASI_MODEL` | model Claude (default `claude-opus-5-5`) |

Urutan pembaca foto yang dipakai otomatis: server Claude API (`/api/vision`) → Audiveris (`Dockerfile.audiveris`)
→ Claude di dalam artifact claude.ai.


Ada dua mesin pembaca gambar; NOTASI memakai yang tersedia:

1. **Claude (penglihatan)** — otomatis aktif saat NOTASI dibuka sebagai artifact di claude.ai (izin “sample” dengan gambar).
   Claude hanya menyalin yang tercetak (huruf, oktaf, tanda yang tertulis, durasi); tanda kunci, tanda kromatis yang
   berlaku sampai akhir birama, dan ikatan lintas birama dihitung oleh `js/vision.js` secara pasti. Bisa beberapa halaman sekaligus.
2. **Audiveris** — di server sendiri lewat Docker (di bawah).


Gambar dibaca oleh **Audiveris 5.4.1** (OMR open source) yang berjalan di server kecil `server/omr_server.py`.
Alternatif gratis tanpa API key: Docker dengan Audiveris (membangun dari sumbernya, ±10 menit sekali saja).

```bash
docker build -f Dockerfile.audiveris -t notasi-audiveris .
docker run -p 8000:8000 notasi-audiveris
```

Buka <http://localhost:8000>, unggah foto/scan partitur piano. Hasilnya terbuka di **mode periksa**:

* gambar asli di kiri (bisa diperbesar), not angka + harmoni di kanan;
* birama yang jumlah ketukannya tidak pas ditandai **⚠ ketukan** (tanda khas salah baca OMR);
* klik angka mana pun → ubah nada, ♭/♮/♯, oktaf, durasi, titik, tambah/hapus nada akor, jadikan diam/not; **Ctrl+Z** untuk urungkan;
* klik nomor birama untuk mencentang *sudah dicek*; penghitung menunjukkan `n/N birama dicek`.

**Soal 100%:** tidak ada mesin OMR yang bisa menjamin 100% benar dari foto. Konversi MusicXML → not angka di NOTASI
tepat 1:1 (lihat pengujian), jadi hasil akhir 100% benar setelah semua birama dicek dan dikoreksi di mode periksa.

Tanpa Docker: pasang Audiveris sendiri, lalu `AUDIVERIS=/path/ke/Audiveris python3 server/omr_server.py --port 8000`.
Untuk mencoba tampilan tanpa Audiveris: `NOTASI_OMR_MOCK=/path/contoh.mxl python3 server/omr_server.py` (server
mengembalikan berkas contoh itu untuk setiap gambar — hanya untuk pengujian).

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
js/vision.js        foto → transkripsi Claude → MusicXML piano
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
