const fs = require('fs');

// Fix broadcastService - wrap logMessage in try/catch so a DB error never blocks sending
const broadcast = `const db = require('../db/database');
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
`;

// Fix messageHandler - wrap entire handler + upsert user BEFORE any DB reads
const handler = `const db = require('../../db/database');
const logger = require('../../services/logger');
const { sendSingle } = require('../../services/broadcastService');
const { startLeadFlow, continueLeadFlow } = require('../flows/leadFlow');
const { handleKeyword } = require('./keywordHandler');
const { handleAdminCommand } = require('./adminHandler');
const aiService = require('../../services/aiService');

async function handleMessage(client, message) {
  if (message.isGroupMsg || message.type === 'status' || !message.body) return;

  const phone = message.from;
  const text = message.body.trim();
  logger.info('Processing message from ' + phone + ': ' + text);

  try {
    // ALWAYS upsert user first before any other DB operation
    await db.upsertUser({ phone });
  } catch(e) {
    logger.error('upsertUser failed: ' + e.message);
  }

  try {
    await db.logMessage(phone, 'inbound', text);
  } catch(e) {
    logger.warn('Could not log inbound: ' + e.message);
  }

  try {
    await db.logAnalytics('message_in', phone, { text: text.slice(0, 100) });
  } catch(e) {}

  try {
    const allowed = await db.checkRateLimit(phone);
    if (!allowed) {
      await sendSingle(client, phone, 'You are sending messages too fast. Please wait a moment.');
      return;
    }
  } catch(e) {
    logger.warn('Rate limit check failed, allowing: ' + e.message);
  }

  try {
    if (await handleAdminCommand(client, message)) return;
  } catch(e) {
    logger.error('Admin command error: ' + e.message);
  }

  try {
    const user = await db.getUser(phone);
    if (user && user.is_blocked) return;
  } catch(e) {}

  try {
    const session = await db.getSession(phone);

    if (session && session.state === 'lead_flow') {
      await continueLeadFlow(client, phone, text);
      return;
    }

    if (session && session.state === 'ai_mode') {
      const reply = await aiService.getAIReply(text);
      await sendSingle(client, phone, reply);
      return;
    }
  } catch(e) {
    logger.error('Session handling error: ' + e.message);
  }

  const lower = text.toLowerCase().trim();

  try {
    if (['hi','hello','hey','menu','start','help','0'].includes(lower)) {
      await startLeadFlow(client, phone);
      return;
    }

    if (await handleKeyword(client, phone, text)) return;

    if (lower === 'ai' || lower === 'ask ai') {
      if (aiService.isEnabled()) {
        await db.setSession(phone, 'ai_mode', 'active', {});
        await sendSingle(client, phone, 'AI Mode Activated! Ask me anything. Type *menu* to go back.');
      } else {
        await sendSingle(client, phone, 'AI is not enabled. Reply *menu* for quick options.');
      }
      return;
    }

    if (['stop','unsubscribe','optout'].includes(lower)) {
      await db.updateUser(phone, { is_subscribed: false });
      await sendSingle(client, phone, 'You have been unsubscribed. Type *start* anytime to re-subscribe.');
      return;
    }

    if (['subscribe','optin'].includes(lower)) {
      await db.updateUser(phone, { is_subscribed: true });
      await sendSingle(client, phone, 'You are subscribed! Reply *menu* to get started.');
      return;
    }

    await sendSingle(client, phone,
      'Hmm, I did not quite get that.\n\nTry:\n- *menu* - Main menu\n- *price* - Pricing\n- *services* - What we offer\n- *ai* - Ask AI'
    );

  } catch(e) {
    logger.error('Message routing error for ' + phone + ': ' + e.message);
    try {
      await sendSingle(client, phone, 'Sorry, something went wrong. Please try again or type *menu*.');
    } catch(e2) {}
  }
}

module.exports = { handleMessage };
`;

fs.writeFileSync('src/services/broadcastService.js', broadcast);
console.log('Fixed: broadcastService.js');

fs.writeFileSync('src/bot/handlers/messageHandler.js', handler);
console.log('Fixed: messageHandler.js');

console.log('Done! Run: npm run dev');