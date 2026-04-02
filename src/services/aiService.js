const axios = require('axios');
const config = require('../../config/config');
const logger = require('./logger');

// ── Grok (xAI) is the ONLY LLM — no fallback, no alternatives ─────────
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

if (!config.grok.apiKey) {
  logger.warn('⚠️  GROK_API_KEY not set. AI replies will return an error message.');
}

const SYSTEM_PROMPT = `You are a helpful WhatsApp business assistant for ${config.business.name}, based in Ghana.
Keep responses short, friendly, and formatted for WhatsApp (use *bold* with asterisks, emojis sparingly).
Max 150 words per reply. Stay focused on business assistance.`;

/**
 * Get a Grok-powered reply. Uses xAI API exclusively.
 * Throws clearly if API key is missing — no silent fallback.
 */
async function getAIReply(userMessage, history = []) {
  if (!config.grok.apiKey) {
    return `🤖 AI is not configured. Please set GROK_API_KEY.\n\nReply *menu* to see our services.`;
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-6),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await axios.post(
      GROK_API_URL,
      {
        model: config.grok.model,
        messages,
        max_tokens: 200,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.grok.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response from Grok API');

    logger.info(`🤖 Grok replied (${reply.length} chars)`);
    return reply;

  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    logger.error(`Grok API error [${status || 'network'}]: ${detail}`);

    if (status === 401) return `🔑 Grok API key is invalid. Please check GROK_API_KEY.`;
    if (status === 429) return `⏳ AI is busy right now. Please try again in a moment!`;
    return `😔 AI is temporarily unavailable. Reply *menu* for quick options.`;
  }
}

const isEnabled = () => !!config.grok.apiKey;

module.exports = { getAIReply, isEnabled };
