const db = require('../../db/database');
const logger = require('../../services/logger');
const { sendSingle } = require('../../services/broadcastService');
const { startLeadFlow, continueLeadFlow } = require('../flows/leadFlow');
const { handleKeyword } = require('./keywordHandler');
const { handleAdminCommand } = require('./adminHandler');
const aiService = require('../../services/aiService');

async function handleMessage(client, message) {
  if (message.isGroupMsg || message.type === 'status' || !message.body) return;

  const phone = message.from;
  const text  = message.body.trim();

  // 1. Upsert user & log
  await db.upsertUser({ phone });
  await db.logMessage(phone, 'inbound', text);
  await db.logAnalytics('message_in', phone, { text: text.slice(0, 100) });

  // 2. Rate limit
  if (!(await db.checkRateLimit(phone))) {
    logger.warn(`Rate limit hit: ${phone}`);
    await sendSingle(client, phone, `⚠️ You're sending messages too fast. Please wait a moment.`);
    return;
  }

  // 3. Admin commands
  if (await handleAdminCommand(client, message)) return;

  // 4. Blocked user
  const user = await db.getUser(phone);
  if (user && user.is_blocked) return;

  // 5. Active lead flow
  const session = await db.getSession(phone);
  if (session && session.state === 'lead_flow') {
    await continueLeadFlow(client, phone, text);
    return;
  }

  // 6. AI mode
  if (session && session.state === 'ai_mode') {
    const reply = await aiService.getAIReply(text);
    await sendSingle(client, phone, reply);
    return;
  }

  const lower = text.toLowerCase();

  // 7. Menu triggers
  if (['hi', 'hello', 'hey', 'menu', 'start', 'help', '0'].includes(lower)) {
    await startLeadFlow(client, phone);
    return;
  }

  // 8. Keyword auto-replies
  if (await handleKeyword(client, phone, text)) return;

  // 9. AI toggle
  if (lower === 'ai' || lower === 'ask ai') {
    if (aiService.isEnabled()) {
      await db.setSession(phone, 'ai_mode', 'active', {});
      await sendSingle(client, phone,
        `🤖 *AI Mode Activated!*\n\nAsk me anything! Type *menu* to go back.`
      );
    } else {
      await sendSingle(client, phone,
        `🤖 AI is not enabled yet. Contact us directly!\n\nReply *menu* for quick options.`
      );
    }
    return;
  }

  // 10. Unsubscribe
  if (['stop', 'unsubscribe', 'optout'].includes(lower)) {
    await db.updateUser(phone, { is_subscribed: 0 });
    await sendSingle(client, phone,
      `You've been unsubscribed. Type *start* anytime to re-subscribe.`
    );
    return;
  }

  // 11. Re-subscribe
  if (['subscribe', 'optin'].includes(lower)) {
    await db.updateUser(phone, { is_subscribed: 1 });
    await sendSingle(client, phone, `✅ You're subscribed! Reply *menu* to get started.`);
    return;
  }

  // 12. Fallback
  await sendSingle(client, phone,
    `Hmm, I didn't quite get that 🤔\n\nTry:\n• *menu* — Main menu\n• *price* — Pricing\n• *services* — What we offer\n• *hours* — Business hours\n• *ai* — Ask AI`
  );
}

module.exports = { handleMessage };
