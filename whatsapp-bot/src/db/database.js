const { Pool } = require('pg');
const config = require('../../config/config');
const logger = require('../services/logger');

// ── Connection Pool ────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: config.db.url,
  ssl: { rejectUnauthorized: false },  // Required for Neon
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected DB pool error: ' + err.message);
});

// Convenience wrapper: pool.query()
const query = (text, params) => pool.query(text, params);

logger.info('✅ Neon PostgreSQL pool initialised');

// ── Helper Functions ────────────────────────────────────────────────────

async function upsertUser({ phone }) {
  await query(
    `INSERT INTO users (phone) VALUES ($1)
     ON CONFLICT (phone) DO UPDATE SET last_seen = NOW()`,
    [phone]
  );
}

async function getUser(phone) {
  const { rows } = await query(`SELECT * FROM users WHERE phone = $1`, [phone]);
  return rows[0] || null;
}

async function updateUser(phone, fields) {
  const keys = Object.keys(fields);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  values.push(phone);
  await query(`UPDATE users SET ${setClause} WHERE phone = $${values.length}`, values);
}

async function getSession(phone) {
  const { rows } = await query(`SELECT * FROM sessions WHERE phone = $1`, [phone]);
  return rows[0] || null;
}

async function setSession(phone, state, step, data = {}) {
  await query(
    `INSERT INTO sessions (phone, state, step, data, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (phone) DO UPDATE SET
       state = $2, step = $3, data = $4, updated_at = NOW()`,
    [phone, state, step, JSON.stringify(data)]
  );
}

async function clearSession(phone) {
  await query(`DELETE FROM sessions WHERE phone = $1`, [phone]);
}

async function saveLead(lead) {
  const { rows } = await query(
    `INSERT INTO leads (user_id, phone, name, service, budget, timeline, extra_info)
     VALUES (
       (SELECT id FROM users WHERE phone = $1),
       $1, $2, $3, $4, $5, $6
     ) RETURNING id`,
    [lead.phone, lead.name, lead.service, lead.budget, lead.timeline, lead.extraInfo || '']
  );
  return rows[0];
}

async function logMessage(phone, direction, message, status = 'sent') {
  await query(
    `INSERT INTO conversations (phone, direction, message, status) VALUES ($1, $2, $3, $4)`,
    [phone, direction, message, status]
  );
}

async function getAllSubscribers() {
  const { rows } = await query(
    `SELECT phone, name FROM users WHERE is_subscribed = TRUE AND is_blocked = FALSE`
  );
  return rows;
}

async function checkRateLimit(phone) {
  const bucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const { rows } = await query(
    `SELECT count FROM rate_limits WHERE phone = $1 AND hour_bucket = $2`,
    [phone, bucket]
  );
  const count = rows[0] ? rows[0].count : 0;
  if (count >= config.rateLimit.perHour) return false;
  await query(
    `INSERT INTO rate_limits (phone, hour_bucket, count) VALUES ($1, $2, 1)
     ON CONFLICT (phone, hour_bucket) DO UPDATE SET count = rate_limits.count + 1`,
    [phone, bucket]
  );
  return true;
}

async function logAnalytics(event, phone, meta = {}) {
  await query(
    `INSERT INTO analytics (event, phone, meta) VALUES ($1, $2, $3)`,
    [event, phone, JSON.stringify(meta)]
  );
}

async function getLeads(limit = 50) {
  const { rows } = await query(
    `SELECT l.*, u.last_seen FROM leads l
     LEFT JOIN users u ON u.phone = l.phone
     ORDER BY l.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getAnalyticsSummary() {
  const [u, l, nl, mi, mo, bc, rl] = await Promise.all([
    query(`SELECT COUNT(*) AS c FROM users`),
    query(`SELECT COUNT(*) AS c FROM leads`),
    query(`SELECT COUNT(*) AS c FROM leads WHERE status = 'new'`),
    query(`SELECT COUNT(*) AS c FROM conversations WHERE direction = 'inbound'`),
    query(`SELECT COUNT(*) AS c FROM conversations WHERE direction = 'outbound'`),
    query(`SELECT COUNT(*) AS c FROM broadcasts WHERE status = 'sent'`),
    query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 5`),
  ]);
  return {
    totalUsers:  parseInt(u.rows[0].c),
    totalLeads:  parseInt(l.rows[0].c),
    newLeads:    parseInt(nl.rows[0].c),
    msgIn:       parseInt(mi.rows[0].c),
    msgOut:      parseInt(mo.rows[0].c),
    broadcasts:  parseInt(bc.rows[0].c),
    recentLeads: rl.rows,
  };
}

async function getDripMessages() {
  const { rows } = await query(
    `SELECT dm.*, ds.name AS sequence_name
     FROM drip_messages dm
     JOIN drip_sequences ds ON ds.id = dm.sequence_id
     WHERE ds.is_active = TRUE
     ORDER BY dm.day_offset`
  );
  return rows;
}

async function getUsersForDrip(hoursOffset) {
  const { rows } = await query(
    `SELECT id, phone, name FROM users
     WHERE is_subscribed = TRUE AND is_blocked = FALSE
       AND ROUND(EXTRACT(EPOCH FROM (NOW() - joined_at)) / 3600) = $1`,
    [hoursOffset]
  );
  return rows;
}

async function hasDripBeenSent(userId, dripMsgId) {
  const { rows } = await query(
    `SELECT id FROM drip_log WHERE user_id = $1 AND drip_msg_id = $2`,
    [userId, dripMsgId]
  );
  return rows[0] || null;
}

async function logDripSent(userId, dripMsgId) {
  await query(
    `INSERT INTO drip_log (user_id, drip_msg_id) VALUES ($1, $2)`,
    [userId, dripMsgId]
  );
}

async function getBroadcasts() {
  const { rows } = await query(
    `SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 30`
  );
  return rows;
}

async function createBroadcast(title, message, scheduledAt = null) {
  const { rows } = await query(
    `INSERT INTO broadcasts (title, message, scheduled_at, status)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [title, message, scheduledAt, scheduledAt ? 'scheduled' : 'draft']
  );
  return rows[0];
}

async function updateBroadcastStats(id, delivered, failed, status) {
  await query(
    `UPDATE broadcasts SET delivered = $1, failed = $2, status = $3, sent_at = NOW() WHERE id = $4`,
    [delivered, failed, status, id]
  );
}

async function updateLeadStatus(id, status) {
  await query(
    `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, id]
  );
}

async function blockUser(phone, blocked) {
  await query(`UPDATE users SET is_blocked = $1 WHERE phone = $2`, [blocked, phone]);
}

async function getPendingBroadcasts() {
  const { rows } = await query(
    `SELECT * FROM broadcasts WHERE status = 'scheduled' AND scheduled_at <= NOW()`
  );
  return rows;
}

async function getAbandonedSessions() {
  const { rows } = await query(
    `SELECT phone, step FROM sessions
     WHERE state = 'lead_flow' AND updated_at < NOW() - INTERVAL '30 minutes'`
  );
  return rows;
}

async function touchSession(phone) {
  await query(
    `UPDATE sessions SET updated_at = NOW() WHERE phone = $1`,
    [phone]
  );
}

async function cleanOldRateLimits() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const bucket = yesterday.toISOString().slice(0, 13);
  await query(`DELETE FROM rate_limits WHERE hour_bucket < $1`, [bucket]);
}

module.exports = {
  pool, query,
  upsertUser, getUser, updateUser,
  getSession, setSession, clearSession,
  saveLead, logMessage,
  getAllSubscribers,
  checkRateLimit, logAnalytics,
  getLeads, getAnalyticsSummary,
  getDripMessages, getUsersForDrip, hasDripBeenSent, logDripSent,
  getBroadcasts, createBroadcast, updateBroadcastStats,
  updateLeadStatus, blockUser,
  getPendingBroadcasts, getAbandonedSessions, touchSession,
  cleanOldRateLimits,
};
