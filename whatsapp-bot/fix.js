const fs = require('fs');

// Fix 1: server.js - move health check before catch-all
const server = `const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("../../config/config");
const logger = require("../services/logger");
const leadsRouter = require("./routes/leads");
const broadcastRouter = require("./routes/broadcast");
const analyticsRouter = require("./routes/analytics");
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", (req, res, next) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Basic ")) return res.status(401).json({ error: "Unauthorized" });
  const [user, pass] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  if (user !== config.admin.username || pass !== config.admin.password) return res.status(401).json({ error: "Invalid credentials" });
  next();
});
app.use("/api/leads", leadsRouter);
app.use("/api/broadcast", broadcastRouter);
app.use("/api/analytics", analyticsRouter);
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use(express.static(path.join(__dirname, "../../public/admin")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../../public/admin/index.html")));
function startAdminServer(botClient) {
  require("./routes/broadcast").setBotClient(botClient);
  app.listen(config.admin.port, () => {
    logger.info("Admin dashboard running at http://localhost:" + config.admin.port);
  });
}
module.exports = { startAdminServer };`;

// Fix 2: index.js - add delay before onMessage + debug logging
const index = `require('dotenv').config();
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
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Users\\\\' + (process.env.USERNAME||'User') + '\\\\AppData\\\\Local\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
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
});`;

fs.writeFileSync('src/admin/server.js', server);
console.log('Fixed: src/admin/server.js');

fs.writeFileSync('src/index.js', index);
console.log('Fixed: src/index.js');

console.log('All done! Run: npm run dev');