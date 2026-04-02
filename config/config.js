// config.js — pure config export, NO dotenv here, NO process.exit
// All env loading and validation happens in src/index.js ONLY

module.exports = {
  business: {
    name:        process.env.BUSINESS_NAME  || 'My Business',
    adminPhone:  process.env.ADMIN_PHONE    || '',
    adminSecret: process.env.ADMIN_SECRET   || 'changeme123',
  },

  // ── Neon PostgreSQL ────────────────────────────────────────────────
  db: {
    url: process.env.DATABASE_URL || '',
  },

  // ── Grok / xAI ────────────────────────────────────────────────────
  grok: {
    apiKey:  process.env.GROK_API_KEY || '',
    model:   process.env.GROK_MODEL   || 'grok-3',
    enabled: !!process.env.GROK_API_KEY,
  },

  admin: {
    port:     parseInt(process.env.ADMIN_PORT) || 3001,
    username: process.env.ADMIN_USERNAME       || 'admin',
    password: process.env.ADMIN_PASSWORD       || 'admin123',
  },

  session: {
    name:   process.env.SESSION_NAME   || 'whatsapp-bot',
    folder: process.env.SESSION_FOLDER || './tokens',
  },

  drip: {
    day1Hours: parseInt(process.env.DRIP_DAY1_HOURS) || 24,
    day2Hours: parseInt(process.env.DRIP_DAY2_HOURS) || 48,
    day3Hours: parseInt(process.env.DRIP_DAY3_HOURS) || 72,
  },

  rateLimit: {
    perHour: parseInt(process.env.RATE_LIMIT_PER_HOUR) || 10,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
    file:  process.env.LOG_FILE  || './logs/bot.log',
  },

  // ── Services Menu ──────────────────────────────────────────────────
  services: [
    { id: '1', label: '1️⃣ Web Development', key: 'web_development' },
    { id: '2', label: '2️⃣ Graphic Design',  key: 'graphic_design'  },
    { id: '3', label: '3️⃣ Event Booking',   key: 'event_booking'   },
    { id: '4', label: '4️⃣ Other',           key: 'other'           },
  ],

  // ── Keyword Auto-Replies ───────────────────────────────────────────
  keywords: {
    price:    `💰 *Our Pricing*\n\nWeb Development: from GHS 2,000\nGraphic Design: from GHS 500\nEvent Booking: from GHS 800\n\nReply with your service interest for a custom quote! 😊`,
    services: `🛠️ *Our Services*\n\n1️⃣ Web Development\n2️⃣ Graphic Design\n3️⃣ Event Booking\n\nType *menu* to get started.`,
    hours:    `🕐 *Business Hours*\n\nMon–Fri: 8am – 6pm\nSat: 9am – 3pm\nSun: Closed\n\nWe reply within 1 hour! 😊`,
    hello:    null,
    hi:       null,
    menu:     null,
  },
};
