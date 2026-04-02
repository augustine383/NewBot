const config = require('../../../config/config');
const db = require('../../db/database');
const { sendSingle } = require('../../services/broadcastService');
const logger = require('../../services/logger');

const STEPS = {
  SELECT_SERVICE: 'select_service',
  ASK_NAME:       'ask_name',
  ASK_BUDGET:     'ask_budget',
  ASK_TIMELINE:   'ask_timeline',
  ASK_EXTRA:      'ask_extra',
  CONFIRM:        'confirm',
};

function buildMenu() {
  const svcList = config.services.map(s => s.label).join('\n');
  return `Hi 👋! Welcome to *${config.business.name}*.\n\nHow can we help you today?\n\n${svcList}\n\nReply with a number to get started!`;
}

async function startLeadFlow(client, phone) {
  await db.setSession(phone, 'lead_flow', STEPS.SELECT_SERVICE, {});
  await sendSingle(client, phone, buildMenu());
}

async function continueLeadFlow(client, phone, input) {
  const sessionRow = await db.getSession(phone);
  if (!sessionRow || sessionRow.state !== 'lead_flow') return false;

  let step = sessionRow.step;
  let data = {};
  try { data = JSON.parse(sessionRow.data); } catch {}

  if (['cancel', 'stop', 'exit', 'menu'].includes(input.toLowerCase())) {
    await db.clearSession(phone);
    await sendSingle(client, phone, `No problem! Just type *menu* whenever you're ready. 😊`);
    return true;
  }

  switch (step) {

    case STEPS.SELECT_SERVICE: {
      const svc = config.services.find(s => s.id === input.trim());
      if (!svc) {
        await sendSingle(client, phone, `Please reply with a number:\n\n${config.services.map(s => s.label).join('\n')}`);
        return true;
      }
      data.service = svc.key;
      data.serviceLabel = svc.label;
      await db.setSession(phone, 'lead_flow', STEPS.ASK_NAME, data);
      await sendSingle(client, phone, `Great choice! 🎉\n\nWhat's your *full name*?`);
      return true;
    }

    case STEPS.ASK_NAME: {
      if (input.trim().length < 2) {
        await sendSingle(client, phone, `Please enter a valid name.`);
        return true;
      }
      data.name = input.trim();
      await db.updateUser(phone, { name: data.name });
      await db.setSession(phone, 'lead_flow', STEPS.ASK_BUDGET, data);
      await sendSingle(client, phone,
        `Nice to meet you, *${data.name}*! 😊\n\nWhat's your approximate *budget* (in GHS)?\n_(Reply 0 or "skip" if unsure)_`
      );
      return true;
    }

    case STEPS.ASK_BUDGET: {
      const raw = input.trim().toLowerCase();
      data.budget = (raw === 'skip' || raw === '0') ? 'Not specified' : input.trim();
      await db.setSession(phone, 'lead_flow', STEPS.ASK_TIMELINE, data);
      await sendSingle(client, phone,
        `Got it! 📅\n\nWhat's your *timeline or deadline*?\n_(e.g. "2 weeks", "end of month", "ASAP")_`
      );
      return true;
    }

    case STEPS.ASK_TIMELINE: {
      data.timeline = input.trim();
      await db.setSession(phone, 'lead_flow', STEPS.ASK_EXTRA, data);
      await sendSingle(client, phone,
        `Almost done! 📝\n\nAny *additional details* about your project?\n_(Or reply "skip" to finish)_`
      );
      return true;
    }

    case STEPS.ASK_EXTRA: {
      data.extraInfo = input.toLowerCase() === 'skip' ? '' : input.trim();
      await db.setSession(phone, 'lead_flow', STEPS.CONFIRM, data);
      const summary = buildLeadSummary(phone, data);
      await sendSingle(client, phone,
        `✅ *Confirm your details:*\n\n${summary}\n\nReply *yes* to submit or *edit* to start over.`
      );
      return true;
    }

    case STEPS.CONFIRM: {
      if (['yes', 'y'].includes(input.toLowerCase())) {
        await db.saveLead({
          phone,
          name: data.name,
          service: data.serviceLabel,
          budget: data.budget,
          timeline: data.timeline,
          extraInfo: data.extraInfo,
        });
        await db.logAnalytics('lead_captured', phone, { service: data.service });
        await db.clearSession(phone);
        await sendSingle(client, phone,
          `🎉 *Thank you, ${data.name}!*\n\nYour request has been received. We'll contact you within *24 hours*.\n\nHave a great day! 😊`
        );
        await notifyAdmin(client, phone, data);
      } else {
        await db.setSession(phone, 'lead_flow', STEPS.SELECT_SERVICE, {});
        await sendSingle(client, phone, buildMenu());
      }
      return true;
    }
  }

  return false;
}

function buildLeadSummary(phone, data) {
  return [
    `👤 *Name:* ${data.name}`,
    `📱 *Phone:* ${phone.replace('@c.us', '')}`,
    `🛠  *Service:* ${data.serviceLabel}`,
    `💰 *Budget:* ${data.budget}`,
    `📅 *Timeline:* ${data.timeline}`,
    data.extraInfo ? `📝 *Details:* ${data.extraInfo}` : null,
  ].filter(Boolean).join('\n');
}

async function notifyAdmin(client, phone, data) {
  if (!config.business.adminPhone) return;
  const adminPhone = config.business.adminPhone + '@c.us';
  const msg = `🔔 *New Lead!*\n\n` + buildLeadSummary(phone, data) + `\n\n📌 Source: WhatsApp Bot`;
  try {
    await sendSingle(client, adminPhone, msg);
    logger.info(`Admin notified of new lead from ${phone}`);
  } catch (e) {
    logger.error('Failed to notify admin: ' + e.message);
  }
}

async function followUpAbandoned(client) {
  const stale = await db.getAbandonedSessions();
  for (const row of stale) {
    await sendSingle(client, row.phone,
      `👋 Still there? You were partway through booking with us!\n\nReply *menu* to continue or *stop* to cancel.`
    );
    await db.touchSession(row.phone);
    logger.info(`Follow-up sent to abandoned lead: ${row.phone}`);
  }
}

module.exports = { startLeadFlow, continueLeadFlow, followUpAbandoned, buildMenu };
