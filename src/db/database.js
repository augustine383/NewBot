const { Pool } = require('pg');
const config = require('../../config/config');
const logger = require('../services/logger');

// ── Neon PostgreSQL Connection Pool ────────────────────────────────────
const pool = new Pool({
  connectionString: config.db.url,
  ssl: { rejectUnauthorized: false },  // required for Neon
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => logger.error('DB pool error: ' + err.message));

const query = (text, params) => pool.query(text, params);

// ── Schema Init ────────────────────────────────────────────────────────
async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      phone        TEXT UNIQUE NOT NULL,
      name         TEXT,
      joined_at    TIMESTAMPTZ DEFAULT NOW(),
      last_seen    TIMESTAMPTZ DEFAULT NOW(),
      is_subscribed INTEGER DEFAULT 1,
      is_blocked   INTEGER DEFAULT 0,
      language     TEXT DEFAULT 'en',
      meta         TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS leads (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id),
      phone        TEXT NOT NULL,
      name         TEXT,
      service      TEXT,
      budget       TEXT,
      timeline     TEXT,
      extra_info   TEXT,
      status       TEXT DEFAULT 'new',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id           SERIAL PRIMARY KEY,
      phone        TEXT NOT NULL,
      direction    TEXT NOT NULL,
      message      TEXT,
      message_type TEXT DEFAULT 'text',
      status       TEXT DEFAULT 'sent',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id           SERIAL PRIMARY KEY,
      title        TEXT,
      message      TEXT NOT NULL,
      media_url    TEXT,
      recipients   INTEGER DEFAULT 0,
      delivered    INTEGER DEFAULT 0,
      failed       INTEGER DEFAULT 0,
      scheduled_at TIMESTAMPTZ,
      sent_at      TIMESTAMPTZ,
      status       TEXT DEFAULT 'draft',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS drip_sequences (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      is_active    INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS drip_messages (
      id           SERIAL PRIMARY KEY,
      sequence_id  INTEGER REFERENCES drip_sequences(id),
      day_offset   INTEGER NOT NULL,
      message      TEXT NOT NULL,
      media_url    TEXT
    );

    CREATE TABLE IF NOT EXISTS drip_log (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id),
      drip_msg_id  INTEGER REFERENCES drip_messages(id),
      sent_at      TIMESTAMPTZ DEFAULT NOW(),
      status       TEXT DEFAULT 'sent'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      phone        TEXT PRIMARY KEY,
      state        TEXT DEFAULT 'idle',
      step         TEXT,
      data         TEXT DEFAULT '{}',
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      phone        TEXT NOT NULL,
      hour_bucket  TEXT NOT NULL,
      count        INTEGER DEFAULT 0,
      PRIMARY KEY (phone, hour_bucket)
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id           SERIAL PRIMARY KEY,
      event        TEXT NOT NULL,
      phone        TEXT,
      meta         TEXT DEFAULT '{}',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default drip sequence if not exists
  const existing = await query(`SELECT id FROM drip_sequences WHERE id = 1`);
  if (!existing.rows.length) {
    const seq = await query(
      `INSERT INTO drip_sequences (name, is_active) VALUES ($1, 1) RETURNING id`,
      ['Welcome Series']
    );
    const sid = seq.rows[0].id;
    const msgs = [
      [sid, 0,  `👋 Welcome to *${config.business.name}*!\n\nWe're thrilled to have you. Reply *menu* anytime to get started!`],
      [sid, 24, `💡 *Did you know?*\n\nWe've helped dozens of businesses grow online. Reply *services* to explore!`],
      [sid, 48, `🎁 *Special Offer!*\n\nMention *FIRSTORDER* when booking for 10% off your first project! Reply *menu* to book. 🚀`],
    ];
    for (const [s, d, m] of msgs) {
      await query(
        `INSERT INTO drip_messages (sequence_id, day_offset, message) VALUES ($1, $2, $3)`,
        [s, d, m]
      );
    }
    logger.info('✅ Default drip sequence seeded');
  }

  logger.info('✅ Neon PostgreSQL database ready');
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function upsertUser({ phone }) {
  await query(`
    INSERT INTO users (phone) VALUES ($1)
    ON CONFLICT (phone) DO UPDATE SET last_seen = NOW()
  `, [phone]);
}

async function getUser(phone) {
  const r = await query(`SELECT * FROM users WHERE phone = $1`, [phone]);
  return r.rows[0] || null;
}

async function updateUser(phone, fields) {
  const keys = Object.keys(fields);
  const vals = Object.values(fields);
  const set  = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await query(`UPDATE users SET ${set} WHERE phone = $${keys.length + 1}`, [...vals, phone]);
}

async function getSession(phone) {
  const r = await query(`SELECT * FROM sessions WHERE phone = $1`, [phone]);
  return r.rows[0] || null;
}

async function setSession(phone, state, step, data = {}) {
  await query(`
    INSERT INTO sessions (phone, state, step, data, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (phone) DO UPDATE SET
      state = $2, step = $3, data = $4, updated_at = NOW()
  `, [phone, state, step, JSON.stringify(data)]);
}

async function clearSession(phone) {
  await query(`DELETE FROM sessions WHERE phone = $1`, [phone]);
}

async function saveLead({ phone, name, service, budget, timeline, extraInfo }) {
  return query(`
    INSERT INTO leads (user_id, phone, name, service, budget, timeline, extra_info)
    VALUES ((SELECT id FROM users WHERE phone = $1), $1, $2, $3, $4, $5, $6)
  `, [phone, name, service, budget, timeline, extraInfo]);
}

async function logMessage(phone, direction, message, status = 'sent') {
  await query(
    `INSERT INTO conversations (phone, direction, message, status) VALUES ($1, $2, $3, $4)`,
    [phone, direction, message, status]
  );
}

async function getAllSubscribers() {
  const r = await query(
    `SELECT phone, name FROM users WHERE is_subscribed = 1 AND is_blocked = 0`
  );
  return r.rows;
}

async function checkRateLimit(phone) {
  const bucket = new Date().toISOString().slice(0, 13);
  const r = await query(
    `SELECT count FROM rate_limits WHERE phone = $1 AND hour_bucket = $2`,
    [phone, bucket]
  );
  const count = parseInt(r.rows[0]?.count || 0);
  if (count >= config.rateLimit.perHour) return false;
  await query(`
    INSERT INTO rate_limits (phone, hour_bucket, count) VALUES ($1, $2, 1)
    ON CONFLICT (phone, hour_bucket) DO UPDATE SET count = rate_limits.count + 1
  `, [phone, bucket]);
  return true;
}

async function logAnalytics(event, phone, meta = {}) {
  await query(
    `INSERT INTO analytics (event, phone, meta) VALUES ($1, $2, $3)`,
    [event, phone, JSON.stringify(meta)]
  );
}

async function getLeads(limit = 50) {
  const r = await query(`
    SELECT l.*, u.last_seen FROM leads l
    LEFT JOIN users u ON u.phone = l.phone
    ORDER BY l.created_at DESC LIMIT $1
  `, [limit]);
  return r.rows;
}

async function getAnalyticsSummary() {
  const [users, leads, newLeads, msgIn, msgOut, bcast, recentLeads] = await Promise.all([
    query(`SELECT COUNT(*) as c FROM users`),
    query(`SELECT COUNT(*) as c FROM leads`),
    query(`SELECT COUNT(*) as c FROM leads WHERE status = 'new'`),
    query(`SELECT COUNT(*) as c FROM conversations WHERE direction = 'inbound'`),
    query(`SELECT COUNT(*) as c FROM conversations WHERE direction = 'outbound'`),
    query(`SELECT COUNT(*) as c FROM broadcasts WHERE status = 'sent'`),
    query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 5`),
  ]);
  return {
    totalUsers:  parseInt(users.rows[0].c),
    totalLeads:  parseInt(leads.rows[0].c),
    newLeads:    parseInt(newLeads.rows[0].c),
    msgIn:       parseInt(msgIn.rows[0].c),
    msgOut:      parseInt(msgOut.rows[0].c),
    broadcasts:  parseInt(bcast.rows[0].c),
    recentLeads: recentLeads.rows,
  };
}

async function getDripMessages() {
  const r = await query(`
    SELECT dm.*, ds.name as sequence_name
    FROM drip_messages dm JOIN drip_sequences ds ON ds.id = dm.sequence_id
    WHERE ds.is_active = 1 ORDER BY dm.day_offset
  `);
  return r.rows;
}

async function getUsersForDrip(hoursOffset) {
  const r = await query(`
    SELECT id, phone, name FROM users
    WHERE is_subscribed = 1 AND is_blocked = 0
      AND ROUND(EXTRACT(EPOCH FROM (NOW() - joined_at)) / 3600) = $1
  `, [hoursOffset]);
  return r.rows;
}

async function hasDripBeenSent(userId, dripMsgId) {
  const r = await query(
    `SELECT id FROM drip_log WHERE user_id = $1 AND drip_msg_id = $2`,
    [userId, dripMsgId]
  );
  return r.rows[0] || null;
}

async function logDripSent(userId, dripMsgId) {
  await query(
    `INSERT INTO drip_log (user_id, drip_msg_id) VALUES ($1, $2)`,
    [userId, dripMsgId]
  );
}

async function getBroadcasts() {
  const r = await query(
    `SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 30`
  );
  return r.rows;
}

async function createBroadcast(title, message, scheduledAt = null) {
  const r = await query(`
    INSERT INTO broadcasts (title, message, scheduled_at, status)
    VALUES ($1, $2, $3, $4) RETURNING id
  `, [title, message, scheduledAt, scheduledAt ? 'scheduled' : 'draft']);
  return r.rows[0];
}

async function updateBroadcastStats(id, delivered, failed, status) {
  await query(
    `UPDATE broadcasts SET delivered=$1, failed=$2, status=$3, sent_at=NOW() WHERE id=$4`,
    [delivered, failed, status, id]
  );
}

async function updateLeadStatus(id, status) {
  await query(
    `UPDATE leads SET status=$1, updated_at=NOW() WHERE id=$2`,
    [status, id]
  );
}

async function getPendingScheduledBroadcasts() {
  const r = await query(`
    SELECT * FROM broadcasts
    WHERE status = 'scheduled' AND scheduled_at <= NOW()
  `);
  return r.rows;
}

async function getAbandonedSessions() {
  const r = await query(`
    SELECT phone, step FROM sessions
    WHERE state = 'lead_flow'
      AND updated_at < NOW() - INTERVAL '30 minutes'
  `);
  return r.rows;
}

async function touchSession(phone) {
  await query(`UPDATE sessions SET updated_at = NOW() WHERE phone = $1`, [phone]);
}

async function cleanOldRateLimits() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const bucket = yesterday.toISOString().slice(0, 13);
  await query(`DELETE FROM rate_limits WHERE hour_bucket < $1`, [bucket]);
}

async function rawQuery(text, params = []) {
  const r = await query(text, params);
  return r.rows;
}

module.exports = {
  pool, query, initDB,
  upsertUser, getUser, updateUser,
  getSession, setSession, clearSession,
  saveLead, logMessage,
  getAllSubscribers,
  checkRateLimit, logAnalytics,
  getLeads, getAnalyticsSummary,
  getDripMessages, getUsersForDrip, hasDripBeenSent, logDripSent,
  getBroadcasts, createBroadcast, updateBroadcastStats,
  updateLeadStatus,
  getPendingScheduledBroadcasts,
  getAbandonedSessions, touchSession,
  cleanOldRateLimits, rawQuery,
};
