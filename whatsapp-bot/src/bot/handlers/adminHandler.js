const config = require('../../../config/config');
const db = require('../../db/database');
const { sendBroadcast, sendSingle } = require('../../services/broadcastService');
const logger = require('../../services/logger');

const ADMIN_COMMANDS = `
*🔐 Admin Commands*

*!broadcast [message]* — Send to all subscribers
*!leads* — Show last 5 leads
*!stats* — Show bot statistics
*!block [phone]* — Block a user
*!unblock [phone]* — Unblock a user
*!help* — Show this menu
`.trim();

async function handleAdminCommand(client, message) {
  const phone = message.from;
  const text = message.body.trim();

  const adminId = config.business.adminPhone + '@c.us';
  if (phone !== adminId) return false;
  if (!text.startsWith('!')) return false;

  const [cmd, ...args] = text.slice(1).split(' ');
  const arg = args.join(' ');
  logger.info(`Admin command: ${cmd} from ${phone}`);

  switch (cmd.toLowerCase()) {

    case 'broadcast': {
      if (!arg) { await sendSingle(client, phone, `Usage: !broadcast Your message here`); return true; }
      await sendSingle(client, phone, `📢 Sending broadcast...`);
      const result = await sendBroadcast(client, arg, 'Admin Broadcast');
      await sendSingle(client, phone,
        `✅ Broadcast done!\nDelivered: ${result.delivered}\nFailed: ${result.failed}`
      );
      return true;
    }

    case 'leads': {
      const leads = await db.getLeads(5);
      if (!leads.length) { await sendSingle(client, phone, `No leads yet.`); return true; }
      const msg = leads.map((l, i) =>
        `*${i + 1}. ${l.name || 'Unknown'}*\n` +
        `   📱 ${l.phone}\n` +
        `   🛠  ${l.service || 'N/A'}\n` +
        `   💰 ${l.budget || 'N/A'}\n` +
        `   📅 ${l.timeline || 'N/A'}\n` +
        `   🏷  ${l.status}`
      ).join('\n\n');
      await sendSingle(client, phone, `🔔 *Last 5 Leads*\n\n${msg}`);
      return true;
    }

    case 'stats': {
      const s = await db.getAnalyticsSummary();
      await sendSingle(client, phone,
        `📊 *Bot Statistics*\n\n` +
        `👥 Total Users: ${s.totalUsers}\n` +
        `🎯 Total Leads: ${s.totalLeads}\n` +
        `🆕 New Leads: ${s.newLeads}\n` +
        `📥 Messages In: ${s.msgIn}\n` +
        `📤 Messages Out: ${s.msgOut}\n` +
        `📢 Broadcasts Sent: ${s.broadcasts}`
      );
      return true;
    }

    case 'block': {
      if (!arg) { await sendSingle(client, phone, `Usage: !block 233XXXXXXXXX`); return true; }
      await db.blockUser(arg, true);
      await sendSingle(client, phone, `🚫 ${arg} blocked.`);
      return true;
    }

    case 'unblock': {
      if (!arg) { await sendSingle(client, phone, `Usage: !unblock 233XXXXXXXXX`); return true; }
      await db.blockUser(arg, false);
      await sendSingle(client, phone, `✅ ${arg} unblocked.`);
      return true;
    }

    case 'help':
      await sendSingle(client, phone, ADMIN_COMMANDS);
      return true;

    default:
      await sendSingle(client, phone, `Unknown command. Type *!help* for the list.`);
      return true;
  }
}

module.exports = { handleAdminCommand };
