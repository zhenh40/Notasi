# NOTASI untuk deploy ke web (pembaca foto lewat Claude API)
# docker build -t notasi .
# docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... notasi
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY index.html ./
COPY css ./css
COPY js ./js
COPY vendor ./vendor
COPY server ./server
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
# PORT diisi otomatis oleh Render/Railway/Fly; default 8000
CMD ["python3", "server/omr_server.py"]
