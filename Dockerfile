FROM node:20-bookworm-slim

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV YTDLP_SKIP_DOWNLOAD=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium ffmpeg python3 python3-pip python-is-python3 ca-certificates wget \
        libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 \
        libgbm1 libglib2.0-0 libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 \
        libxkbcommon0 libxrandr2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir -U yt-dlp

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]