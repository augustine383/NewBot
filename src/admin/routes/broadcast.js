const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');

let botClient = null;
const setBotClient = (c) => { botClient = c; };

// GET /api/broadcasts
router.get('/', async (req, res) => {
  try {
    res.json({ broadcasts: await db.getBroadcasts() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/broadcasts
router.post('/', async (req, res) => {
  try {
    const { title, message, sendNow, scheduledAt } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const bc = await db.createBroadcast(title || 'Manual Broadcast', message, scheduledAt || null);

    if (sendNow && botClient) {
      const { sendBroadcast } = require('../../services/broadcastService');
      res.json({ success: true, broadcastId: bc.id, status: 'sending' });
      sendBroadcast(botClient, message, title, bc.id).catch(console.error);
    } else {
      res.json({ success: true, broadcastId: bc.id, status: scheduledAt ? 'scheduled' : 'draft' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.setBotClient = setBotClient;
