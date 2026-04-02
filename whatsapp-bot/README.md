# 💬 WhatsApp Business Bot

A fully automated WhatsApp bot built with **Venom-Bot** and **Node.js** for lead capture, drip campaigns, broadcasts, and AI-powered interactions.

---

## 🗂 Project Structure

```
whatsapp-bot/
├── config/
│   └── config.js              # Central config (reads from .env)
├── src/
│   ├── index.js               # 🚀 Main entry point
│   ├── bot/
│   │   ├── flows/
│   │   │   └── leadFlow.js    # Multi-step lead capture conversation
│   │   └── handlers/
│   │       ├── messageHandler.js  # Routes all incoming messages
│   │       ├── keywordHandler.js  # Auto-replies to keywords
│   │       └── adminHandler.js    # WhatsApp admin commands
│   ├── db/
│   │   └── database.js        # SQLite setup + all DB helpers
│   ├── services/
│   │   ├── aiService.js       # OpenAI integration
│   │   ├── broadcastService.js# Broadcast + single send
│   │   ├── dripService.js     # Drip campaign runner
│   │   └── logger.js          # Winston logger
│   └── admin/
│       ├── server.js          # Express admin API server
│       └── routes/
│           ├── leads.js       # Lead management API
│           ├── broadcast.js   # Broadcast API
│           └── analytics.js   # Analytics & users API
├── public/
│   └── admin/
│       └── index.html         # 🖥  Admin dashboard (SPA)
├── data/                      # SQLite database (auto-created)
├── tokens/                    # WhatsApp session (auto-created)
├── logs/                      # Log files (auto-created)
├── .env.example               # Environment variable template
└── package.json
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** v18+ — https://nodejs.org
- **Google Chrome** or Chromium (Venom-Bot uses it headlessly)
- A WhatsApp account (personal or business) to link

### 2. Install
```bash
git clone <your-repo-url> whatsapp-bot
cd whatsapp-bot
npm install
```

### 3. Configure
```bash
cp .env.example .env
nano .env   # or open with any editor
```

Key settings to change:
| Variable | Description |
|---|---|
| `BUSINESS_NAME` | Your company name |
| `ADMIN_PHONE` | Your WhatsApp number (digits only, e.g. `233241234567`) |
| `ADMIN_PASSWORD` | Dashboard login password |
| `OPENAI_API_KEY` | Optional — for AI replies |

### 4. Run
```bash
npm start
```

A **QR code** will appear in your terminal. Scan it with WhatsApp on your phone:
> WhatsApp → Settings → Linked Devices → Link a Device

Once connected, you'll see:
```
✅ WhatsApp connected!
🖥  Admin dashboard running at http://localhost:3001
```

---

## 🖥 Admin Dashboard

Open `http://localhost:3001` in your browser.

| Page | Features |
|---|---|
| **Dashboard** | Stats overview, daily chart, recent leads |
| **Leads** | Filter/update lead status, export CSV |
| **Broadcast** | Send to all subscribers, view history |
| **Users** | All registered users, subscription status |
| **Messages** | Full inbound/outbound log |

---

## 🤖 Bot Features

### Lead Capture Flow
When a user sends `hi`, `hello`, or `menu`, the bot starts the flow:
1. Shows service menu (Web Dev / Graphic Design / Event / Other)
2. Collects: Name → Budget → Timeline → Extra Info
3. Confirms with user
4. Saves to database + **notifies admin via WhatsApp**

### Keyword Auto-Replies
| User types | Bot responds with |
|---|---|
| `price` | Pricing information |
| `services` | Services list |
| `hours` | Business hours |

> Customize keywords in `config/config.js` → `keywords` object.

### Drip Campaigns
Automatically sends 3 messages after a user signs up:
- **Hour 0:** Welcome message
- **Hour 24:** Value content
- **Hour 48:** Special offer

> Edit messages in the database or update the seed data in `database.js`.

### AI Mode
Users type `ai` to enter AI mode — then ask anything. Responses come from OpenAI GPT.

### Admin Commands (via WhatsApp)
From your admin phone number:
| Command | Action |
|---|---|
| `!broadcast Hello everyone!` | Send to all subscribers |
| `!leads` | Show last 5 leads |
| `!stats` | Bot statistics |
| `!block 233XXXXXX` | Block a user |
| `!unblock 233XXXXXX` | Unblock a user |
| `!help` | Command list |

---

## 🔧 Customization

### Add a new keyword
In `config/config.js`:
```js
keywords: {
  // Add your keyword + reply:
  location: `📍 We're based in Accra, Ghana!\nAccra Mall, 2nd Floor.`,
}
```

### Add a new service
```js
services: [
  { id: '5', label: '5️⃣ Photography', key: 'photography' },
]
```

### Edit drip messages
In the database (or update the seed in `database.js`):
```sql
UPDATE drip_messages SET message = 'Your new message' WHERE id = 2;
```

---

## 🚀 Deploying to a VPS

### Ubuntu/Debian VPS
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Chrome for Venom-Bot
sudo apt install -y chromium-browser

# Clone and install your bot
git clone <repo> ~/whatsapp-bot && cd ~/whatsapp-bot
npm install

# Set up as a systemd service (runs on boot)
sudo nano /etc/systemd/system/wabot.service
```

Paste this into the service file:
```ini
[Unit]
Description=WhatsApp Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/whatsapp-bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable wabot
sudo systemctl start wabot
sudo systemctl status wabot
```

### View logs
```bash
# Live logs
sudo journalctl -u wabot -f

# Log file
tail -f ~/whatsapp-bot/logs/bot.log
```

---

## ⚠️ Important Notes

1. **WhatsApp ToS** — This bot uses an unofficial API. Use it for legitimate business communication only.
2. **Rate limiting** is built-in (10 messages/user/hour) to avoid triggering spam detection.
3. **Session persistence** — Your WhatsApp session is saved in `./tokens/`. Back it up.
4. **Don't spam** — Always give users an easy way to unsubscribe (type `stop`).

---

## 📄 License

MIT — Free to use and modify.
