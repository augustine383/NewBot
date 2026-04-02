const express = require('express');
const router = express.Router();
const db = require('../../db/database');

// GET /api/analytics
router.get('/', async (req, res) => {
  try {
    res.json(await db.getAnalyticsSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/users
router.get('/users', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT phone, name, joined_at, last_seen, is_subscribed, is_blocked
       FROM users ORDER BY joined_at DESC LIMIT 100`
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/messages
router.get('/messages', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM conversations ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ messages: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/daily
router.get('/daily', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT DATE(created_at) AS date,
             COUNT(*) AS total,
             SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) AS inbound,
             SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) AS outbound
      FROM conversations
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    res.json({ daily: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
