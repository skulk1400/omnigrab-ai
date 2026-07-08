# ============================================================
# OmniGrab AI - Docker Deployment Image
# Compatible with Render / Railway / Fly.io / any Docker host
# Includes: Node 20, ffmpeg, yt-dlp, Chromium (for Puppeteer)
# ============================================================
FROM node:20-bookworm-slim

# Tell Puppeteer to skip downloading Chromium (we'll use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install system dependencies: Chromium + ffmpeg + Python3 (yt-dlp) + ca-certs
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        chromium-sandbox \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgcc-s1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libstdc++6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        wget \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip (clean, always up-to-date, lands in /usr/local/bin/yt-dlp)
RUN pip3 install --break-system-packages --no-cache-dir -U yt-dlp

WORKDIR /app

# Install Node deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy app source
COPY . .

# Make sure local yt-dlp binary (if any) is executable
RUN chmod +x /app/yt-dlp 2>/dev/null || true

# Render / Railway inject PORT env var automatically
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]
