const db = require('../db/database');
const logger = require('./logger');

async function sendBroadcast(client, message, title = 'Manual Broadcast', broadcastId = null) {
  const subscribers = await db.getAllSubscribers();
  logger.info(`📢 Broadcast "${title}" → ${subscribers.length} subscribers`);

  let delivered = 0, failed = 0;

  for (const user of subscribers) {
    try {
      const to = user.phone.includes('@') ? user.phone : user.phone + '@c.us';
      await client.sendText(to, message);
      await db.logMessage(user.phone, 'outbound', message, 'sent');
      await db.logAnalytics('broadcast_sent', user.phone, { broadcastId, title });
      delivered++;
      await sleep(1100); // throttle: 1 msg/sec
    } catch (err) {
      logger.error(`Broadcast failed for ${user.phone}: ${err.message}`);
      await db.logMessage(user.phone, 'outbound', message, 'failed');
      failed++;
    }
  }

  if (broadcastId) {
    await db.updateBroadcastStats(broadcastId, delivered, failed, 'sent');
  }

  logger.info(`✅ Broadcast done. Delivered: ${delivered}, Failed: ${failed}`);
  return { delivered, failed, total: subscribers.length };
}

async function sendSingle(client, phone, message, retries = 2) {
  const to = phone.includes('@') ? phone : phone + '@c.us';
  for (let i = 0; i <= retries; i++) {
    try {
      await client.sendText(to, message);
      await db.logMessage(phone, 'outbound', message, 'sent');
      return true;
    } catch (err) {
      if (i === retries) {
        logger.error(`Failed to send to ${phone} after ${retries + 1} attempts: ${err.message}`);
        await db.logMessage(phone, 'outbound', message, 'failed');
        return false;
      }
      await sleep(2000);
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { sendBroadcast, sendSingle, sleep };
