/**
 * migrate.js — Run once to create all tables in Neon PostgreSQL
 * Usage: node src/db/migrate.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  console.log('✅ Connected to Neon PostgreSQL');

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        phone         TEXT UNIQUE NOT NULL,
        name          TEXT,
        joined_at     TIMESTAMPTZ DEFAULT NOW(),
        last_seen     TIMESTAMPTZ DEFAULT NOW(),
        is_subscribed BOOLEAN DEFAULT TRUE,
        is_blocked    BOOLEAN DEFAULT FALSE,
        language      TEXT DEFAULT 'en',
        meta          JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS leads (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id),
        phone       TEXT NOT NULL,
        name        TEXT,
        service     TEXT,
        budget      TEXT,
        timeline    TEXT,
        extra_info  TEXT,
        status      TEXT DEFAULT 'new',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id           SERIAL PRIMARY KEY,
        phone        TEXT NOT NULL,
        direction    TEXT NOT NULL,
        message      TEXT,
        message_type TEXT DEFAULT 'text',
        status       TEXT DEFAULT 'sent',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS broadcasts (
        id           SERIAL PRIMARY KEY,
        title        TEXT,
        message      TEXT NOT NULL,
        media_url    TEXT,
        recipients   INTEGER DEFAULT 0,
        delivered    INTEGER DEFAULT 0,
        failed       INTEGER DEFAULT 0,
        scheduled_at TIMESTAMPTZ,
        sent_at      TIMESTAMPTZ,
        status       TEXT DEFAULT 'draft',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS drip_sequences (
        id        SERIAL PRIMARY KEY,
        name      TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS drip_messages (
        id          SERIAL PRIMARY KEY,
        sequence_id INTEGER REFERENCES drip_sequences(id),
        day_offset  INTEGER NOT NULL,
        message     TEXT NOT NULL,
        media_url   TEXT
      );

      CREATE TABLE IF NOT EXISTS drip_log (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id),
        drip_msg_id INTEGER REFERENCES drip_messages(id),
        sent_at     TIMESTAMPTZ DEFAULT NOW(),
        status      TEXT DEFAULT 'sent'
      );

      CREATE TABLE IF NOT EXISTS sessions (
        phone      TEXT PRIMARY KEY,
        state      TEXT DEFAULT 'idle',
        step       TEXT,
        data       JSONB DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rate_limits (
        phone       TEXT NOT NULL,
        hour_bucket TEXT NOT NULL,
        count       INTEGER DEFAULT 0,
        PRIMARY KEY (phone, hour_bucket)
      );

      CREATE TABLE IF NOT EXISTS analytics (
        id         SERIAL PRIMARY KEY,
        event      TEXT NOT NULL,
        phone      TEXT,
        meta       JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS logs (
        id         SERIAL PRIMARY KEY,
        event      TEXT NOT NULL,
        user_id    INTEGER REFERENCES users(id),
        details    JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ All tables created');

    // Seed Cyber Technologies Ghana drip sequence
    const existing = await client.query(`SELECT id FROM drip_sequences LIMIT 1`);
    if (!existing.rows.length) {
      const seqRes = await client.query(
        `INSERT INTO drip_sequences (name, is_active) VALUES ('Cyber Tech Onboarding', TRUE) RETURNING id`
      );
      const seqId = seqRes.rows[0].id;

      await client.query(
        `INSERT INTO drip_messages (sequence_id, day_offset, message) VALUES
          ($1, 0,  $2),
          ($1, 24, $3),
          ($1, 48, $4)`,
        [
          seqId,
          `👋 Welcome to *Cyber Technologies Ghana!*\n\nWe build complete digital systems — automation, websites, apps, and more.\n\nReply *menu* anytime to explore our services or *ai* to chat with our AI assistant! 🤖`,
          `💡 *Did you know?*\n\nBusinesses that automate their customer communication respond *5x faster* and convert more leads.\n\nWe can set up a WhatsApp bot, email sequences, and lead funnels for your business.\n\nReply *automation* to learn more or *menu* to get started! 🚀`,
          `🎁 *Special Offer for New Clients!*\n\nMention *CYBER10* when you book and get *10% off* your first project with us!\n\n⏰ Offer valid for 48 hours.\n\nReply *menu* to book now or *services* to see what we offer. 🔥`,
        ]
      );
      console.log('✅ Cyber Tech drip sequence seeded (3 messages)');
    }

    await client.query('COMMIT');
    console.log('\n🎉 Migration complete! Your Neon database is ready.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
