import { defineMigration } from '@justscale/postgres'

export default defineMigration({
  name: '2026_07_23_153539_create_p2000_messages',
  async up({ db }) {
    await db.raw(`CREATE TYPE Discipline AS ENUM ('ambulance', 'brandweer', 'politie', 'knrm', 'other')`)
    await db.raw(`CREATE TABLE IF NOT EXISTS p2000_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  mid VARCHAR(40) NOT NULL UNIQUE,
  ts_ms DOUBLE PRECISION NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  capcodes JSON NOT NULL,
  body TEXT NOT NULL,
  raw TEXT NOT NULL,
  flag VARCHAR(8) NOT NULL,
  frame VARCHAR(16) NOT NULL,
  discipline Discipline NOT NULL,
  priority_raw VARCHAR(8),
  priority_scheme VARCHAR(4),
  priority_level SMALLINT,
  city VARCHAR(160),
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION
)`)
    await db.raw(`CREATE INDEX IF NOT EXISTS idx_p2000_messages_created_at ON p2000_messages(created_at)`)
    await db.raw(`CREATE INDEX IF NOT EXISTS idx_p2000_messages_updated_at ON p2000_messages(updated_at)`)
    await db.raw(`CREATE INDEX IF NOT EXISTS idx_p2000_messages_mid ON p2000_messages(mid)`)
    await db.raw(`CREATE INDEX IF NOT EXISTS idx_p2000_messages_received_at ON p2000_messages(received_at)`)
  },

  async down({ db }) {
    await db.dropIndex('idx_p2000_messages_received_at')
    await db.dropIndex('idx_p2000_messages_mid')
    await db.dropIndex('idx_p2000_messages_updated_at')
    await db.dropIndex('idx_p2000_messages_created_at')
    await db.dropTable('p2000_messages')
    await db.dropType('Discipline')
  },
})
