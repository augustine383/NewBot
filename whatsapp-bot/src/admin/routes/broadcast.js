const express = require('express');
const router = express.Router();
const db = require('../../db/database');

let botClient = null;
const setBotClient = (client) => { botClient = client; };

// GET /api/broadcasts
router.get('/', async (req, res) => {
  try {
    res.json({ broadcasts: await db.getBroadcasts() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/broadcasts
router.post('/', async (req, res) => {
  try {
    const { title, message, sendNow, scheduledAt } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const broadcast = await db.createBroadcast(title || 'Manual Broadcast', message, scheduledAt || null);
    const broadcastId = broadcast.id;

    if (sendNow && botClient) {
      const { sendBroadcast } = require('../../services/broadcastService');
      res.json({ success: true, broadcastId, status: 'sending' });
      sendBroadcast(botClient, message, title, broadcastId).catch(console.error);
    } else {
      res.json({ success: true, broadcastId, status: scheduledAt ? 'scheduled' : 'draft' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.setBotClient = setBotClient;
