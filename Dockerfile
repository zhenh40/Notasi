# NOTASI + Audiveris (pembaca partitur dari gambar)
# docker build -t notasi .
# docker run -p 8000:8000 notasi      lalu buka http://localhost:8000

# ---- tahap 1: build Audiveris 5.4.1 dari sumbernya ----
FROM eclipse-temurin:21-jdk AS audiveris
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 5.4.1 https://github.com/Audiveris/audiveris.git /src
WORKDIR /src
RUN ./gradlew --no-daemon :app:installDist

# ---- tahap 2: runtime ----
FROM eclipse-temurin:21-jre
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 fontconfig fonts-dejavu-core tesseract-ocr tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*
COPY --from=audiveris /src/app/build/install/Audiveris /opt/audiveris
COPY index.html /app/index.html
COPY css /app/css
COPY js /app/js
COPY vendor /app/vendor
COPY server /app/server
ENV AUDIVERIS=/opt/audiveris/bin/Audiveris \
    JAVA_OPTS="-Djava.awt.headless=true -Xmx2g" \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
EXPOSE 8000
CMD ["python3", "/app/server/omr_server.py", "--port", "8000"]
