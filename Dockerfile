FROM node:20-bookworm-slim

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV YTDLP_SKIP_DOWNLOAD=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg python3 python-is-python3 python3-pip ca-certificates wget \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 \
    libcups2 libdbus-1-3 libdrm2 libexpat1 libfontconfig1 libgbm1 libgcc-s1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 libxss1 libxtst6 \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages --no-cache-dir -U yt-dlp

WORKDIR /app

# Install node deps with legacy-peer-deps for max compat
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps || npm install --omit=dev --no-audit --no-fund

COPY . .

# Make sure yt-dlp-exec binary exists and is executable
RUN chmod +x /usr/local/bin/yt-dlp 2>/dev/null; \
    YT_BIN=$(node -e "console.log(require.resolve('yt-dlp-exec/package.json'))" 2>/dev/null || echo ""); \
    if [ -n "$YT_BIN" ]; then \
        BIN_DIR=$(dirname "$YT_BIN")/bin; \
        mkdir -p "$BIN_DIR"; \
        cp -f /usr/local/bin/yt-dlp "$BIN_DIR/yt-dlp"; \
        chmod +x "$BIN_DIR/yt-dlp"; \
        echo "yt-dlp placed at $BIN_DIR/yt-dlp"; \
        ls -la "$BIN_DIR/"; \
    fi

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/healthz || exit 1

# Update yt-dlp on boot, then start server
CMD ["sh", "-c", "pip3 install --break-system-packages -U yt-dlp >/tmp/ytupdate.log 2>&1; YT_BIN=$(node -e \"try{console.log(require('path').dirname(require.resolve('yt-dlp-exec/package.json'))+'/bin/yt-dlp')}catch(e){}\"); if [ -n \"$YT_BIN\" ] && [ -f /usr/local/bin/yt-dlp ]; then cp -f /usr/local/bin/yt-dlp \"$YT_BIN\"; chmod +x \"$YT_BIN\"; echo \"Updated yt-dlp in node_modules: $($YT_BIN --version)\"; fi; node server.js"]