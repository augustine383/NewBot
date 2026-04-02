// ── Load .env FIRST before anything else ─────────────────────────────
require('dotenv').config();

// ── Validate required env vars immediately after dotenv ───────────────
const REQUIRED = {
  DATABASE_URL: process.env.DATABASE_URL,
};

const missing = Object.entries(REQUIRED)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error('\n❌ Missing required environment variables:');
  missing.forEach(k => console.error(`   → ${k} is not set`));
  console.error('\nFor local dev: create a .env file in the project root.');
  console.error('For Render: set it in Dashboard → NewBot → Environment.\n');
  process.exit(1);
}

// ── Now safe to load everything else ─────────────────────────────────
const venom  = require('venom-bot');
const cron   = require('node-cron');
const fs     = require('fs');
const http   = require('http');

const config  = require('../config/config');
const logger  = require('./services/logger');
const db      = require('./db/database');
const { handleMessage }     = require('./bot/handlers/messageHandler');
const { sendBroadcast }     = require('./services/broadcastService');
const { runDrip }           = require('./services/dripService');
const { followUpAbandoned } = require('./bot/flows/leadFlow');
const { startAdminServer }  = require('./admin/server');

// ── Environment detection ─────────────────────────────────────────────
const IS_RENDER   = !!process.env.RENDER;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const PORT        = parseInt(process.env.PORT) || 10000;

// ── Ensure runtime folders exist ─────────────────────────────────────
[config.session.folder, './logs'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Global bot state ──────────────────────────────────────────────────
let currentQR    = null;
let botConnected = false;
let botClient    = null;

// ── Health + QR HTTP server ───────────────────────────────────────────
// Render requires something listening on PORT to confirm deploy is live
const healthServer = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      connected: botConnected,
      timestamp: new Date().toISOString(),
    }));
  }

  if (url === '/qr') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (botConnected) {
      return res.end(`<!DOCTYPE html><html><head><title>Bot Status</title>
        <meta http-equiv="refresh" content="10">
        <style>body{font-family:sans-serif;padding:40px;text-align:center}</style>
      </head><body>
        <h2>✅ WhatsApp Bot Connected!</h2>
        <p>The bot is running and ready to receive messages.</p>
        <p style="color:#888;font-size:13px">Auto-refreshes every 10s</p>
      </body></html>`);
    }
    if (!currentQR) {
      return res.end(`<!DOCTYPE html><html><head><title>Bot QR</title>
        <meta http-equiv="refresh" content="3">
        <style>body{font-family:sans-serif;padding:40px;text-align:center}</style>
      </head><body>
        <h2>⏳ Starting up...</h2>
        <p>WhatsApp QR code is loading. This page will refresh automatically.</p>
        <p style="color:#888;font-size:13px">If this takes more than 2 minutes, check the Render logs.</p>
      </body></html>`);
    }
    return res.end(`<!DOCTYPE html><html><head><title>Scan QR</title>
      <meta http-equiv="refresh" content="5">
      <style>body{font-family:sans-serif;padding:40px;text-align:center}
        img{border:2px solid #25d366;border-radius:12px;padding:12px;max-width:280px}</style>
    </head><body>
      <h2>📱 Scan with WhatsApp</h2>
      <p>WhatsApp → ⋮ Menu → Linked Devices → Link a Device</p>
      <img src="${currentQR}" alt="QR Code"/>
      <p style="color:#888;font-size:13px">Page auto-refreshes every 5 seconds</p>
    </body></html>`);
  }

  // All other routes → redirect to /qr
  res.writeHead(302, { Location: '/qr' });
  res.end();
});

healthServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`🌐 Server listening on port ${PORT}`);
  if (IS_RENDER) {
    logger.info(`   QR page → https://${process.env.RENDER_EXTERNAL_HOSTNAME}/qr`);
  } else {
    logger.info(`   QR page → http://localhost:${PORT}/qr`);
  }
});

// ── Main bot startup ──────────────────────────────────────────────────
async function main() {
  logger.info('🔌 Connecting to Neon PostgreSQL...');
  await db.initDB();
  logger.info('✅ Database ready');

  logger.info(`🚀 Starting ${config.business.name} WhatsApp Bot...`);

  const venomOptions = {
    folderNameToken: config.session.folder,
    headless: true,
    logQR: false,
    autoClose: 0,
    disableWelcome: true,
    updatesLog: false,
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--safebrowsing-disable-auto-update',
    ],
    // Use system Chromium when running in Docker / Render
    ...(IS_RENDER || process.env.PUPPETEER_EXECUTABLE_PATH ? {
      executablePath: CHROME_PATH,
    } : {}),
  };

  const client = await venom.create(
    config.session.name,
    // QR callback
    (base64Qr) => {
      currentQR    = base64Qr;
      botConnected = false;
      const qrUrl  = IS_RENDER
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/qr`
        : `http://localhost:${PORT}/qr`;
      logger.info(`📱 QR ready → open in browser to scan: ${qrUrl}`);
    },
    // Status callback
    (statusSession) => {
      logger.info(`Session: ${statusSession}`);
      if (['isLogged', 'qrReadSuccess', 'chatsAvailable'].includes(statusSession)) {
        botConnected = true;
        currentQR    = null;
        logger.info('✅ WhatsApp connected and ready!');
      }
      if (['notLogged', 'browserClose', 'qrReadFail'].includes(statusSession)) {
        botConnected = false;
      }
    },
    venomOptions
  );

  botClient = client;

  // ── Message routing ───────────────────────────────────────────────
  client.onMessage((msg) => handleMessage(client, msg));

  // ── Cron jobs ─────────────────────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    if (!botConnected) return;
    logger.info('⏰ Running drip campaigns...');
    await runDrip(client);
  });

  cron.schedule('*/30 * * * *', async () => {
    if (!botConnected) return;
    await followUpAbandoned(client);
  });

  cron.schedule('*/5 * * * *', async () => {
    if (!botConnected) return;
    const pending = await db.getPendingScheduledBroadcasts();
    for (const bc of pending) {
      await sendBroadcast(client, bc.message, bc.title, bc.id);
    }
  });

  cron.schedule('0 0 * * *', async () => {
    await db.cleanOldRateLimits();
    logger.info('🧹 Cleaned rate limit records');
  });

  // ── Admin dashboard ───────────────────────────────────────────────
  startAdminServer(client);

  logger.info(`
  ╔══════════════════════════════════════════════╗
  ║        WhatsApp Bot is running! 🎉            ║
  ╠══════════════════════════════════════════════╣
  ║  QR / Status → /qr                           ║
  ║  Health      → /health                       ║
  ║  DB          → Neon PostgreSQL ☁️             ║
  ║  AI          → Grok (xAI)                    ║
  ╚══════════════════════════════════════════════╝
  `);
}

main().catch((err) => {
  logger.error('❌ Fatal error: ' + err.message);
  logger.error(err.stack);
  // Keep health server alive briefly so Render can read the logs
  setTimeout(() => process.exit(1), 8000);
});

// ── Graceful shutdown ─────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  if (botClient) await botClient.close().catch(() => {});
  healthServer.close();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection: ' + reason);
});
