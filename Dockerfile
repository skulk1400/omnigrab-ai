FROM node:20-bookworm-slim

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install everything: Chromium + ffmpeg + python (with python command via python-is-python3) + all Chromium libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg python3 python-is-python3 python3-pip ca-certificates wget \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 \
    libcups2 libdbus-1-3 libdrm2 libexpat1 libfontconfig1 libgbm1 libgcc-s1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 libxss1 libxtst6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/healthz || exit 1

# Update yt-dlp on boot (YouTube changes constantly!), then start
CMD ["sh", "-c", "node -e \"const{execSync}=require('child_process');try{const p=require('path').join(__dirname,'node_modules','yt-dlp-exec','bin','yt-dlp');console.log('[boot] Updating yt-dlp...');execSync(p+' -U',{stdio:'inherit'})}catch(e){console.log('[boot] yt-dlp update skipped')}\" && node server.js"]