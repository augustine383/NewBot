const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');

// GET /api/analytics
router.get('/', async (req, res) => {
  try {
    res.json(await db.getAnalyticsSummary());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/users
router.get('/users', async (req, res) => {
  try {
    const users = await db.rawQuery(
      `SELECT phone, name, joined_at, last_seen, is_subscribed, is_blocked
       FROM users ORDER BY joined_at DESC LIMIT 100`
    );
    res.json({ users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/messages
router.get('/messages', async (req, res) => {
  try {
    const messages = await db.rawQuery(
      `SELECT * FROM conversations ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/daily
router.get('/daily', async (req, res) => {
  try {
    const daily = await db.rawQuery(`
      SELECT DATE(created_at) as date,
             COUNT(*) as total,
             SUM(CASE WHEN direction='inbound'  THEN 1 ELSE 0 END) as inbound,
             SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) as outbound
      FROM conversations
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    res.json({ daily });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
