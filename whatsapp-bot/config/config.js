require('dotenv').config();

module.exports = {
  business: {
    name: process.env.BUSINESS_NAME || 'Cyber Technologies Ghana',
    adminPhone: process.env.ADMIN_PHONE || '',
    adminSecret: process.env.ADMIN_SECRET || 'changeme123',
  },
  db: {
    url: process.env.DATABASE_URL || '',
  },
  grok: {
    apiKey: process.env.GROK_API_KEY || '',
    model:  process.env.GROK_MODEL  || 'grok-3',
    enabled: !!process.env.GROK_API_KEY,
  },
  admin: {
    port:     parseInt(process.env.ADMIN_PORT) || 3001,
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
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

  // ── Services Menu (Lead Flow) ──────────────────────────────────────
  services: [
    { id: '1', label: '🤖 Digital Automation',        key: 'automation'       },
    { id: '2', label: '💻 Website / App / Software',  key: 'web_dev'          },
    { id: '3', label: '🎨 Graphic Design',            key: 'graphic_design'   },
    { id: '4', label: '🏢 IT Infrastructure',         key: 'it_infrastructure'},
    { id: '5', label: '🔗 Blockchain / Advanced',     key: 'blockchain'       },
    { id: '6', label: '❓ Other / Not Sure',          key: 'other'            },
  ],

  // ── Keyword Auto-Replies ───────────────────────────────────────────
  keywords: {

    price: `💰 *Our Pricing*\n\nPricing depends on project scope, but here's a guide:\n\n🤖 WhatsApp Bot Setup: from GHS 1,500\n💻 Business Website: from GHS 2,000\n📱 Mobile App: from GHS 5,000\n🎨 Graphic Design: from GHS 150/design\n🏢 IT Infrastructure: custom quote\n\nReply *menu* or type your need for a custom quote! 😊`,

    services: `🛠️ *Our Services*\n\n🤖 Digital Automation\n💻 Web, App & Software Dev\n🎨 Graphic Design\n🏢 IT Infrastructure\n🔗 Blockchain Solutions\n📈 Brand & Content Optimization\n\nWe build complete digital systems for businesses.\n\nType *menu* to get started or *ai* to ask our AI assistant!`,

    automation: `🤖 *Digital Automation*\n\nWe automate your business operations:\n• WhatsApp bots & broadcasts\n• Email campaigns & sequences\n• AI chatbots\n• Lead generation funnels\n• Sales & workflow automation\n\n*Save time, respond faster, increase sales.*\n\nReply *menu* to get a quote! 🚀`,

    website: `💻 *Web Development*\n\nWe build:\n• Business websites & landing pages\n• Mobile apps (Android/iOS)\n• ERP, POS, HR & Payroll systems\n• Hospital, Hotel, School systems\n• Enterprise web applications\n\nReply *menu* to tell us what you need! 🔥`,

    design: `🎨 *Graphic Design*\n\nWe create:\n• Social media graphics\n• Flyers, posters & banners\n• Funeral posters (premium)\n• Business cards & brand identity\n• Event graphics & brochures\n\n*Look professional and attract customers.*\n\nReply *menu* to place an order! 😊`,

    funeral: `🙏 *Funeral Poster Design*\n\nWe design premium, respectful funeral posters.\n\nPlease share:\n• 📷 Clear photo of the deceased\n• 📝 Full name\n• 📅 Birth & passing dates\n• 📌 Any other details\n\nWe'll handle the design with care and professionalism. 🕊️`,

    hours: `🕐 *Business Hours*\n\nMon – Fri: 8:00am – 6:00pm\nSaturday: 9:00am – 3:00pm\nSunday: Closed\n\nWe typically reply within 1 hour during business hours.\n\nType *menu* to get started! 😊`,

    about: `🏢 *About Cyber Technologies Ghana*\n\nWe build *complete digital systems* for businesses — from automation to full software platforms.\n\nWe help:\n✅ Startups\n✅ Growing businesses\n✅ Enterprises\n\n*Turning business problems into working digital solutions.*\n\nType *services* to see what we offer or *menu* to get started!`,

    contact: `📞 *Contact Us*\n\nWhatsApp: This chat! 😊\nAdmin: Available Mon–Sat\n\nOr type *menu* to start a project request right now.`,

    hello: null,
    hi:    null,
    hey:   null,
    menu:  null,
  },
};
