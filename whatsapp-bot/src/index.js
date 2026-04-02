require('dotenv').config();
const venom = require('venom-bot');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('./services/logger');
const { handleMessage } = require('./bot/handlers/messageHandler');
const { sendBroadcast } = require('./services/broadcastService');
const { runDrip } = require('./services/dripService');
const { followUpAbandoned } = require('./bot/flows/leadFlow');
const { startAdminServer } = require('./admin/server');
const db = require('./db/database');

[config.session.folder, path.dirname(config.log.file)].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!config.db.url) { logger.error('DATABASE_URL not set!'); process.exit(1); }

logger.info('Starting ' + config.business.name + ' WhatsApp Bot...');

function getChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\' + (process.env.USERNAME||'User') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidates) { if (fs.existsSync(p)) { logger.info('Using browser: ' + p); return p; } }
  return null;
}

const chromePath = getChromePath();
const venomOptions = {
  folderNameToken: config.session.folder,
  headless: true,
  logQR: true,
  autoClose: 0,
  disableWelcome: true,
  browserArgs: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run'],
};
if (chromePath) venomOptions.executablePath = chromePath;

venom.create(config.session.name,
  (base64Qr, asciiQR) => { logger.info('Scan QR code:'); console.log(asciiQR); },
  (statusSession) => { logger.info('Session status: ' + statusSession); },
  venomOptions
).then((client) => {
  logger.info('WhatsApp connected!');

  setTimeout(() => {
    client.onMessage((message) => {
      if (message.isGroupMsg || !message.body) return;
      logger.info('MSG IN: ' + message.from + ' >> ' + message.body);
      handleMessage(client, message).catch(e => logger.error('handleMessage error: ' + e.message));
    });
    logger.info('Message listener ACTIVE - bot ready!');
  }, 4000);

  cron.schedule('0 * * * *', () => runDrip(client));
  cron.schedule('*/30 * * * *', () => followUpAbandoned(client));
  cron.schedule('*/5 * * * *', async () => {
    const pending = await db.getPendingBroadcasts();
    for (const bc of pending) await sendBroadcast(client, bc.message, bc.title, bc.id);
  });
  cron.schedule('0 0 * * *', () => db.cleanOldRateLimits());

  startAdminServer(client);
  logger.info('Bot is LIVE! Admin: http://localhost:' + config.admin.port);

}).catch((err) => {
  logger.error('Failed to start: ' + err.message);
  process.exit(1);
});