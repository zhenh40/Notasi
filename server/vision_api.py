"""
NOTASI — pembaca foto partitur lewat Claude API (untuk website yang kamu deploy sendiri).

Server memanggil Claude dengan API key milikmu (variabel ANTHROPIC_API_KEY), jadi key
tidak pernah sampai ke browser pengunjung. Instruksi pembacaan (PROMPT) diambil dari
js/vision.js agar versi artifact dan versi server selalu sama.

Pengaman pemakaian (agar kredit API tidak dihabiskan orang lain):
  NOTASI_ACCESS_CODE   bila diisi, pengunjung harus memasukkan kode ini dulu
  NOTASI_RATE_LIMIT    jumlah baca gambar per IP per jam (default 20)
  NOTASI_MAX_IMAGES    jumlah halaman per sekali baca (default 8)

Untuk menguji tanpa memanggil API: NOTASI_VISION_MOCK=/path/jawaban.json
"""
import base64
import hmac
import json
import os
import re
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.environ.get('NOTASI_MODEL', 'claude-opus-5-5')
ACCESS_CODE = os.environ.get('NOTASI_ACCESS_CODE', '')
RATE_LIMIT = int(os.environ.get('NOTASI_RATE_LIMIT', '20'))
MAX_IMAGES = int(os.environ.get('NOTASI_MAX_IMAGES', '8'))
MOCK = os.environ.get('NOTASI_VISION_MOCK')
ALLOWED_TYPES = {'image/jpeg', 'image/png'}

_hits = {}
_hits_lock = threading.Lock()
_client = None


def load_prompt():
    with open(os.path.join(ROOT, 'js', 'vision.js'), encoding='utf-8') as f:
        src = f.read()
    m = re.search(r'const PROMPT = `(.*?)`;', src, re.S)
    if not m:
        raise RuntimeError('PROMPT tidak ditemukan di js/vision.js')
    return m.group(1)


PROMPT = load_prompt()


def available():
    return bool(MOCK) or bool(os.environ.get('ANTHROPIC_API_KEY') or os.environ.get('ANTHROPIC_AUTH_TOKEN'))


def status():
    return {'vision': available(), 'needsCode': bool(ACCESS_CODE), 'model': 'mock' if MOCK else MODEL}


def check_code(code):
    if not ACCESS_CODE:
        return True
    return hmac.compare_digest(str(code or ''), ACCESS_CODE)


def allow(ip):
    """Batas sederhana: RATE_LIMIT permintaan per IP per jam."""
    now = time.time()
    with _hits_lock:
        recent = [t for t in _hits.get(ip, []) if now - t < 3600]
        if len(recent) >= RATE_LIMIT:
            _hits[ip] = recent
            return False
        recent.append(now)
        _hits[ip] = recent
        return True


def _sniff(raw):
    if raw[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if raw[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    return None


def validate_images(images):
    """images = [{media_type, data(base64)}] -> daftar blok gambar untuk API, atau pesan galat."""
    if not isinstance(images, list) or not images:
        return None, 'Tidak ada gambar.'
    if len(images) > MAX_IMAGES:
        return None, f'Maksimal {MAX_IMAGES} halaman sekali baca.'
    blocks = []
    for im in images:
        try:
            raw = base64.b64decode(im.get('data', ''), validate=True)
        except Exception:
            return None, 'Data gambar rusak.'
        kind = _sniff(raw)
        if kind not in ALLOWED_TYPES:
            return None, 'Hanya JPG atau PNG yang diterima.'
        if len(raw) > 5 * 1024 * 1024:
            return None, 'Satu gambar maksimal 5 MB (perkecil dulu).'
        blocks.append({'type': 'image', 'source': {'type': 'base64', 'media_type': kind, 'data': im['data']}})
    return blocks, None


def read_score(blocks):
    """Kirim gambar ke Claude, kembalikan (teks_json, terpotong?)."""
    if MOCK:
        with open(MOCK, encoding='utf-8') as f:
            return f.read(), False

    import anthropic  # dimuat saat dibutuhkan; server tetap jalan tanpa paket ini

    global _client
    if _client is None:
        _client = anthropic.Anthropic()

    content = blocks + [{'type': 'text', 'text': PROMPT}]
    try:
        # Streaming: jawaban partitur panjang tidak terkena batas waktu HTTP.
        # fallbacks="default": bila model menolak (kategori keamanan), server Anthropic
        # menjalankan ulang permintaan yang sama di model cadangan.
        with _client.beta.messages.stream(
            model=MODEL,
            max_tokens=64000,
            output_config={'effort': 'high'},
            betas=['server-side-fallback-2026-07-01'],
            fallbacks='default',
            messages=[{'role': 'user', 'content': content}],
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError:
        raise RuntimeError('API key Anthropic tidak valid (periksa ANTHROPIC_API_KEY di server).')
    except anthropic.PermissionDeniedError:
        raise RuntimeError('API key tidak punya izin untuk model ini.')
    except anthropic.RateLimitError:
        raise RuntimeError('Batas pemakaian Claude API tercapai. Coba lagi sebentar lagi.')
    except anthropic.BadRequestError as e:
        raise RuntimeError('Permintaan ditolak API: ' + str(e.message)[:200])
    except anthropic.APIStatusError as e:
        raise RuntimeError(f'Claude API galat {e.status_code}. Coba lagi.')
    except anthropic.APIConnectionError:
        raise RuntimeError('Server tidak bisa terhubung ke Claude API.')

    if msg.stop_reason == 'refusal':
        raise RuntimeError('Gambar ini tidak bisa diproses.')
    text = ''.join(b.text for b in msg.content if b.type == 'text')
    return text, msg.stop_reason == 'max_tokens'


def handle(body: bytes, ip: str, code: str):
    """Dipanggil oleh server HTTP. Mengembalikan (status_http, objek_json)."""
    if not available():
        return 503, {'error': 'Pembaca foto belum diaktifkan di server (ANTHROPIC_API_KEY belum diisi).'}
    if not check_code(code):
        return 401, {'error': 'Kode akses salah.', 'needsCode': True}
    if not allow(ip):
        return 429, {'error': 'Terlalu banyak permintaan dari alamat ini. Coba lagi dalam satu jam.'}
    try:
        payload = json.loads(body.decode('utf-8'))
    except Exception:
        return 400, {'error': 'Format permintaan salah.'}
    blocks, err = validate_images(payload.get('images'))
    if err:
        return 400, {'error': err}
    try:
        text, truncated = read_score(blocks)
    except RuntimeError as e:
        return 502, {'error': str(e)}
    return 200, {'text': text, 'truncated': truncated}
