const db = require('../db/database');
const logger = require('./logger');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendBroadcast(client, message, title, broadcastId) {
  const subscribers = await db.getAllSubscribers();
  logger.info('Broadcasting to ' + subscribers.length + ' subscribers');
  let delivered = 0, failed = 0;
  for (const user of subscribers) {
    try {
      const to = user.phone.includes('@') ? user.phone : user.phone + '@c.us';
      await client.sendText(to, message);
      try { await db.logMessage(user.phone, 'outbound', message, 'sent'); } catch(e) {}
      delivered++;
      await sleep(1100);
    } catch (err) {
      logger.error('Broadcast failed for ' + user.phone + ': ' + err.message);
      failed++;
    }
  }
  if (broadcastId) {
    try { await db.updateBroadcastStats(broadcastId, delivered, failed, 'sent'); } catch(e) {}
  }
  logger.info('Broadcast done. Delivered: ' + delivered + ', Failed: ' + failed);
  return { delivered, failed, total: subscribers.length };
}

async function sendSingle(client, phone, message, retries) {
  if (retries === undefined) retries = 2;
  const to = phone.includes('@') ? phone : phone + '@c.us';
  logger.info('Sending to ' + to + ': ' + message.slice(0, 50));
  for (let i = 0; i <= retries; i++) {
    try {
      await client.sendText(to, message);
      logger.info('Sent OK to ' + to);
      try { await db.logMessage(phone, 'outbound', message, 'sent'); } catch(e) {
        logger.warn('Could not log outbound message: ' + e.message);
      }
      return true;
    } catch (err) {
      logger.error('Send attempt ' + (i+1) + ' failed to ' + to + ': ' + err.message);
      if (i === retries) return false;
      await sleep(2000);
    }
  }
  return false;
}

module.exports = { sendBroadcast, sendSingle, sleep };
