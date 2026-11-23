#!/usr/bin/env python3
"""
NOTASI — server kecil (hanya pustaka standar Python).

  GET  /                 -> berkas situs (index.html, css, js, vendor)
  GET  /api/omr/status   -> {"available": true/false, "engine": "..."}
  POST /api/omr          -> badan permintaan = gambar JPG/PNG
                            balasan = MusicXML terkompres (.mxl) hasil Audiveris

Audiveris dicari lewat variabel lingkungan AUDIVERIS (default: "audiveris" di PATH).

Untuk menguji tampilan tanpa Audiveris: NOTASI_OMR_MOCK=/path/ke/berkas.mxl
(server mengembalikan berkas itu untuk setiap gambar — hanya untuk pengujian).

Jalankan:  python3 server/omr_server.py --port 8000
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIVERIS = os.environ.get('AUDIVERIS', 'audiveris')
MOCK = os.environ.get('NOTASI_OMR_MOCK')
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT = int(os.environ.get('NOTASI_OMR_TIMEOUT', '300'))
# Audiveris memakai banyak memori; batasi satu pekerjaan sekaligus
JOB_LOCK = threading.Semaphore(int(os.environ.get('NOTASI_OMR_JOBS', '1')))


def engine_path():
    if os.path.isabs(AUDIVERIS):
        return AUDIVERIS if os.access(AUDIVERIS, os.X_OK) else None
    return shutil.which(AUDIVERIS)


def sniff_ext(data: bytes):
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return '.png'
    if data[:3] == b'\xff\xd8\xff':
        return '.jpg'
    return None


def run_audiveris(image_path: str, out_dir: str):
    exe = engine_path()
    cmd = [exe, '-batch', '-export', '-output', out_dir, '--', image_path]
    env = dict(os.environ)
    env.setdefault('JAVA_OPTS', '-Djava.awt.headless=true -Xmx2g')
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          timeout=TIMEOUT, env=env, cwd=out_dir)
    log = proc.stdout.decode('utf-8', 'replace')
    found = sorted(glob.glob(os.path.join(out_dir, '**', '*.mxl'), recursive=True) +
                   glob.glob(os.path.join(out_dir, '**', '*.musicxml'), recursive=True) +
                   [p for p in glob.glob(os.path.join(out_dir, '**', '*.xml'), recursive=True)
                    if 'META-INF' not in p])
    return found, log


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/omr/status':
            exe = engine_path()
            return self._json(200, {'available': bool(exe or MOCK),
                                    'engine': 'mock' if MOCK and not exe else ('audiveris' if exe else None)})
        # jangan sajikan folder pengujian / server
        if self.path.startswith(('/server', '/tests', '/.')):
            return self._json(404, {'error': 'not found'})
        return super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/api/omr':
            return self._json(404, {'error': 'not found'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BYTES:
            return self._json(413, {'error': 'Ukuran gambar harus di antara 1 byte dan 25 MB.'})
        data = self.rfile.read(length)
        ext = sniff_ext(data)
        if not ext:
            return self._json(415, {'error': 'Hanya JPG atau PNG yang diterima.'})

        if MOCK and not engine_path():
            with open(MOCK, 'rb') as f:
                out = f.read()
            return self._send_mxl(out)

        if not engine_path():
            return self._json(503, {'error': 'Audiveris tidak ditemukan di server (atur variabel AUDIVERIS).'})

        with JOB_LOCK, tempfile.TemporaryDirectory(prefix='notasi-omr-') as tmp:
            img = os.path.join(tmp, 'partitur' + ext)
            with open(img, 'wb') as f:
                f.write(data)
            out_dir = os.path.join(tmp, 'out')
            os.makedirs(out_dir)
            try:
                found, log = run_audiveris(img, out_dir)
            except subprocess.TimeoutExpired:
                return self._json(504, {'error': f'Pembacaan melebihi {TIMEOUT} detik. Coba gambar yang lebih kecil/jelas.'})
            if not found:
                tail = '\n'.join(log.strip().splitlines()[-8:])
                return self._json(422, {'error': 'Audiveris tidak menemukan partitur yang bisa dibaca pada gambar ini. '
                                                 'Pastikan foto tegak, terang, dan resolusinya tinggi.', 'log': tail})
            with open(found[0], 'rb') as f:
                return self._send_mxl(f.read())

    def _send_mxl(self, out: bytes):
        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.recordare.musicxml')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--port', type=int, default=8000)
    a = ap.parse_args()
    exe = engine_path()
    print(f'NOTASI di http://{a.host}:{a.port}  ·  OMR: {exe or ("MOCK " + MOCK if MOCK else "tidak aktif")}')
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
