# ── Base ──────────────────────────────────────────────────────────
FROM node:20-slim

# ── Chromium + all Venom-Bot/Puppeteer dependencies ───────────────
# node:20-slim uses Debian bookworm — libasound2 → libasound2t64
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    ca-certificates \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ── Puppeteer — use system Chromium, skip bundled download ────────
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV RENDER=true

# ── Working directory ─────────────────────────────────────────────
WORKDIR /app

# ── Install dependencies first (layer cache) ─────────────────────
COPY package*.json ./
RUN npm install --omit=dev

# ── Copy source ───────────────────────────────────────────────────
COPY . .

# ── Runtime folders ───────────────────────────────────────────────
RUN mkdir -p tokens logs

# ── Port (Render injects PORT automatically) ──────────────────────
EXPOSE 10000

# ── Healthcheck so Render knows the container is alive ────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-10000}/health || exit 1

# ── Start ─────────────────────────────────────────────────────────
CMD ["node", "src/index.js"]
