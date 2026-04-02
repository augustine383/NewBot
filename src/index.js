require('dotenv').config();
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

// ── Detect Render environment ─────────────────────────────────────────
const IS_RENDER = !!process.env.RENDER;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

// Ensure folders exist
[config.session.folder, './logs'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!config.db.url) {
  logger.error('❌ DATABASE_URL is not set!');
  logger.error('   Add it in Render → Your Service → Environment Variables');
  process.exit(1);
}

// ── Global state ──────────────────────────────────────────────────────
let currentQR     = null;
let botConnected  = false;
let botClient     = null;

// ── Minimal health-check HTTP server ─────────────────────────────────
// Render requires a web server to confirm deployment is live.
// This runs on PORT env var (set by Render automatically).
const PORT = process.env.PORT || config.admin.port || 3001;

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connected: botConnected }));
    return;
  }

  // QR code page — visit this URL in browser after deploy to scan QR
  if (req.url === '/qr') {
    if (!currentQR) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;padding:40px">
        <h2>${botConnected ? '✅ Bot Connected!' : '⏳ Waiting for QR code...'}</h2>
        <p>${botConnected ? 'WhatsApp is linked and the bot is running.' : 'Refresh in a few seconds...'}</p>
        <script>if(!${botConnected}) setTimeout(()=>location.reload(), 3000);</script>
      </body></html>`);
      return;
    }
    // Show QR as scannable image in browser
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>📱 Scan this QR code with WhatsApp</h2>
      <p>WhatsApp → Settings → Linked Devices → Link a Device</p>
      <img src="${currentQR}" style="max-width:300px;border:1px solid #ccc;padding:10px;border-radius:8px"/>
      <p><small>Page auto-refreshes every 5 seconds</small></p>
      <script>setTimeout(()=>location.reload(), 5000);</script>
    </body></html>`);
    return;
  }

  // Root — redirect to QR
  res.writeHead(302, { Location: '/qr' });
  res.end();
});

healthServer.listen(PORT, () => {
  logger.info(`🌐 Health server running on port ${PORT}`);
  logger.info(`   → Visit /qr to scan the WhatsApp QR code`);
});

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  logger.info('🔌 Connecting to Neon PostgreSQL...');
  await db.initDB();

  logger.info(`🚀 Starting ${config.business.name} WhatsApp Bot...`);
  if (IS_RENDER) {
    logger.info(`🖥  Running on Render — Chrome path: ${CHROME_PATH}`);
  }

  // Venom-Bot options — tuned for server/cloud environments
  const venomOptions = {
    folderNameToken: config.session.folder,
    headless: true,
    logQR: false,            // We handle QR ourselves via /qr endpoint
    autoClose: 0,            // Never auto-close on server
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
      '--metrics-recording-only',
      '--mute-audio',
      '--safebrowsing-disable-auto-update',
    ],
    // Use system Chromium on Render, default elsewhere
    ...(IS_RENDER && {
      executablePath: CHROME_PATH,
    }),
  };

  const client = await venom.create(
    config.session.name,
    (base64Qr) => {
      currentQR = base64Qr;
      botConnected = false;
      const qrUrl = IS_RENDER
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/qr`
        : `http://localhost:${PORT}/qr`;
      logger.info(`📱 QR ready! Open this URL to scan: ${qrUrl}`);
    },
    (statusSession) => {
      logger.info('Session status: ' + statusSession);
      if (['isLogged', 'qrReadSuccess', 'chatsAvailable'].includes(statusSession)) {
        botConnected = true;
        currentQR = null;
        logger.info('✅ WhatsApp connected!');
      }
      if (['notLogged', 'browserClose', 'qrReadFail'].includes(statusSession)) {
        botConnected = false;
      }
    },
    venomOptions
  );

  botClient = client;

  // Wire message handler
  client.onMessage((msg) => handleMessage(client, msg));

  // ── Cron jobs ──────────────────────────────────────────────────────

  cron.schedule('0 * * * *', async () => {
    if (!botConnected) return;
    logger.info('⏰ Running drip campaign check...');
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

  // ── Admin dashboard (separate Express server) ──────────────────────
  startAdminServer(client);

  const externalUrl = IS_RENDER
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : `http://localhost:${PORT}`;

  logger.info(`
  ╔══════════════════════════════════════════════╗
  ║   WhatsApp Bot is running! 🎉                 ║
  ║                                              ║
  ║   QR Scan → ${externalUrl}/qr
  ║   Health  → ${externalUrl}/health
  ║   Admin   → ${externalUrl.replace(PORT, config.admin.port)}
  ║   DB      → Neon PostgreSQL ☁️                ║
  ╚══════════════════════════════════════════════╝
  `);
}

main().catch((err) => {
  logger.error('❌ Fatal startup error: ' + err.message);
  logger.error(err.stack);
  // Don't exit immediately — let health server stay up so Render doesn't loop-restart
  setTimeout(() => process.exit(1), 5000);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  if (botClient) botClient.close();
  healthServer.close();
  process.exit(0);
});
