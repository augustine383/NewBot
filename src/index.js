require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set in .env file');
  process.exit(1);
}

const venom  = require('venom-bot');
const cron   = require('node-cron');
const fs     = require('fs');
const http   = require('http');
const path   = require('path');

const config = require('../config/config');
const logger = require('./services/logger');
const db     = require('./db/database');
const { handleMessage }     = require('./bot/handlers/messageHandler');
const { sendBroadcast }     = require('./services/broadcastService');
const { runDrip }           = require('./services/dripService');
const { followUpAbandoned } = require('./bot/flows/leadFlow');
const { startAdminServer }  = require('./admin/server');

const IS_RENDER   = !!process.env.RENDER;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const PORT        = parseInt(process.env.PORT) || 10000;

// ── Wipe Chrome profile + venom tokens — fresh start every run ────────
// This is the key fix: Chrome caches WhatsApp session and skips QR.
// We force a clean Chrome profile so QR always appears.
const CHROME_DATA_DIR = path.resolve('./tokens/chrome-profile');
const VENOM_TOKEN_DIR = path.resolve('./tokens');

function wipeSession() {
  try {
    if (fs.existsSync(CHROME_DATA_DIR)) {
      fs.rmSync(CHROME_DATA_DIR, { recursive: true, force: true });
    }
    // Also wipe venom's own session files
    const sessionFile = path.join(VENOM_TOKEN_DIR, 'newbot-session.data.json');
    if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
  } catch (e) { /* ignore */ }
}

['./tokens', './tokens/chrome-profile', './logs'].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── State ─────────────────────────────────────────────────────────────
let QR_DATA   = null;
let CONNECTED = false;
let STATUS    = 'Starting...';

// ── HTTP server (never dies) ──────────────────────────────────────────
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, connected: CONNECTED }));
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

  if (CONNECTED) {
    return res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:60px;text-align:center;background:#f0fdf4">
      <h1 style="color:#16a34a;font-size:48px">✅</h1>
      <h2 style="color:#16a34a">Bot is Connected & Running!</h2>
      <p>WhatsApp is linked. The bot is live.</p>
      <script>setTimeout(()=>location.reload(),10000)</script>
    </body></html>`);
  }

  if (QR_DATA) {
    return res.end(`<!DOCTYPE html><html><head>
      <title>Scan QR Code</title>
      <script>setTimeout(()=>location.reload(),20000)</script>
      <style>
        body{font-family:sans-serif;padding:40px;text-align:center;background:#f8fafc}
        .box{background:#fff;border-radius:16px;padding:32px;max-width:380px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.1)}
        img{width:260px;height:260px;border:4px solid #25d366;border-radius:12px;margin:20px 0}
        .steps{background:#f0fdf4;border-radius:8px;padding:16px;text-align:left;font-size:14px;line-height:1.8}
        .badge{background:#25d366;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px}
      </style>
    </head><body>
      <div class="box">
        <span class="badge">SCAN NOW</span>
        <h2 style="margin:16px 0 4px">📱 Link WhatsApp</h2>
        <img src="${QR_DATA}" alt="QR Code"/>
        <div class="steps">
          <strong>How to scan:</strong><br>
          1. Open WhatsApp on your phone<br>
          2. Tap the 3 dots ⋮ (top right)<br>
          3. Tap <strong>Linked Devices</strong><br>
          4. Tap <strong>Link a Device</strong><br>
          5. Point camera at QR code above
        </div>
        <p style="color:#94a3b8;font-size:12px;margin-top:16px">QR refreshes automatically every 20s</p>
      </div>
    </body></html>`);
  }

  res.end(`<!DOCTYPE html><html><head>
    <script>setTimeout(()=>location.reload(),4000)</script>
    <style>body{font-family:sans-serif;padding:60px;text-align:center}</style>
  </head><body>
    <h2>⏳ ${STATUS}</h2>
    <p style="color:#64748b">Auto-refreshes every 4 seconds</p>
  </body></html>`);

}).listen(PORT, '0.0.0.0', () => {
  logger.info(`🌐 Browser page: http://localhost:${PORT}`);
});

// ── Bot start with auto-retry ─────────────────────────────────────────
async function startBot(attempt) {
  STATUS    = attempt > 1 ? `Restarting... (attempt ${attempt})` : 'Loading WhatsApp...';
  QR_DATA   = null;
  CONNECTED = false;

  // Wipe stale Chrome + venom session so QR always appears
  wipeSession();

  try {
    logger.info('🔌 Connecting to Neon...');
    await db.initDB();
    logger.info('✅ Database ready');
    logger.info('🚀 Starting WhatsApp...');

    const client = await venom.create(
      process.env.SESSION_NAME || 'cyber-tech-bot',
      (qr) => {
        QR_DATA   = qr;
        CONNECTED = false;
        STATUS    = 'QR ready!';
        logger.info(`📱 QR CODE READY → open http://localhost:${PORT} now!`);
      },
      (status) => {
        logger.info('Status: ' + status);
        STATUS = status;
        if (['isLogged','qrReadSuccess','chatsAvailable'].includes(status)) {
          CONNECTED = true;
          QR_DATA   = null;
          STATUS    = 'Connected!';
          logger.info('✅ WhatsApp connected!');
        }
        if (['notLogged','browserClose','qrReadFail','desconnectedMobile'].includes(status)) {
          CONNECTED = false;
          STATUS    = 'Disconnected — restarting...';
        }
      },
      {
        folderNameToken: './tokens',
        headless:        'new',
        logQR:           true,
        autoClose:       0,
        forceLogin:      true,
        disableWelcome:  true,
        updatesLog:      false,
        browserArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--hide-scrollbars',
          '--mute-audio',
          // ← THE KEY FIX: isolated Chrome profile = no cached WhatsApp session

        ],
        // Only use system Chrome on Render/Docker — let venom find its own on Windows
        ...(IS_RENDER ? { executablePath: CHROME_PATH } : {}),
      }
    );

    client.onMessage(msg => handleMessage(client, msg));
    startAdminServer(client);

    cron.schedule('0 * * * *',    async () => { if (CONNECTED) await runDrip(client); });
    cron.schedule('*/30 * * * *', async () => { if (CONNECTED) await followUpAbandoned(client); });
    cron.schedule('*/5 * * * *',  async () => {
      if (!CONNECTED) return;
      const p = await db.getPendingScheduledBroadcasts();
      for (const bc of p) await sendBroadcast(client, bc.message, bc.title, bc.id);
    });
    cron.schedule('0 0 * * *', () => db.cleanOldRateLimits());

    logger.info('🎉 Bot fully running!');

  } catch (err) {
    const msg = err?.message || String(err);
    logger.error(`Bot error: ${msg}`);
    const wait = Math.min(attempt * 15000, 60000);
    logger.info(`🔄 Restarting in ${wait/1000}s...`);
    STATUS    = `Error — restarting in ${wait/1000}s`;
    QR_DATA   = null;
    CONNECTED = false;
    setTimeout(() => startBot(attempt + 1), wait);
  }
}

startBot(1);

process.on('SIGTERM', () => process.exit(0));
process.on('unhandledRejection', e => logger.error('Unhandled: ' + e));
