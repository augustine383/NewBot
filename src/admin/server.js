const express = require('express');
const cors    = require('cors');
const path    = require('path');
const config  = require('../../config/config');
const logger  = require('../services/logger');

const leadsRouter     = require('./routes/leads');
const broadcastRouter = require('./routes/broadcast');
const analyticsRouter = require('./routes/analytics');

const app = express();

app.use(cors());
app.use(express.json());

// ── Health endpoint (also on admin server) ────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Basic Auth ────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  if (user !== config.admin.username || pass !== config.admin.password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  next();
});

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/leads',     leadsRouter);
app.use('/api/broadcast', broadcastRouter);
app.use('/api/analytics', analyticsRouter);

// ── Admin Dashboard SPA ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../../public/admin')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin/index.html'));
});

function startAdminServer(botClient) {
  require('./routes/broadcast').setBotClient(botClient);

  // On Render, the main PORT is taken by the health server.
  // Admin runs on ADMIN_PORT (set in env or default 3001).
  // Locally, you can hit both.
  const adminPort = process.env.ADMIN_PORT || config.admin.port || 3001;

  // Avoid port conflict if main health server uses same port
  const mainPort = process.env.PORT;
  if (mainPort && String(mainPort) === String(adminPort)) {
    // On Render free tier: serve admin on same Express app via the health server
    // by attaching routes there — but simplest is to just use a different port
    logger.warn(`⚠️  ADMIN_PORT (${adminPort}) conflicts with PORT (${mainPort}). Admin dashboard may not be accessible separately on Render free tier.`);
    logger.info(`   Tip: On Render, set ADMIN_PORT to something other than PORT`);
    return;
  }

  app.listen(adminPort, () => {
    logger.info(`🖥  Admin dashboard → http://localhost:${adminPort}`);
    logger.info(`   Login: ${config.admin.username} / ${config.admin.password}`);
  });
}

module.exports = { startAdminServer, app };
