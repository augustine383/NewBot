const config = require('../../../config/config');
const { sendSingle } = require('../../services/broadcastService');

/**
 * Check if a message matches a keyword and send auto-reply.
 * @returns {boolean} true if a keyword was matched
 */
async function handleKeyword(client, phone, text) {
  const lower = text.toLowerCase().trim();

  for (const [keyword, reply] of Object.entries(config.keywords)) {
    if (reply === null) continue; // null = handled elsewhere
    if (lower.includes(keyword)) {
      await sendSingle(client, phone, reply);
      return true;
    }
  }

  return false;
}

module.exports = { handleKeyword };
