const db = require('../db/database');
const { sendSingle } = require('./broadcastService');
const logger = require('./logger');

/**
 * Run due drip messages. Called every hour via cron.
 */
async function runDrip(client) {
  const messages = await db.getDripMessages();
  logger.info(`⏱  Drip check: ${messages.length} messages configured`);

  for (const msg of messages) {
    const users = await db.getUsersForDrip(msg.day_offset);
    for (const user of users) {
      if (await db.hasDripBeenSent(user.id, msg.id)) continue;
      const text = msg.message.replace('{name}', user.name || 'there');
      const ok = await sendSingle(client, user.phone, text);
      if (ok) {
        await db.logDripSent(user.id, msg.id);
        logger.info(`💧 Drip sent to ${user.phone} (offset: ${msg.day_offset}h)`);
      }
    }
  }
}

module.exports = { runDrip };
