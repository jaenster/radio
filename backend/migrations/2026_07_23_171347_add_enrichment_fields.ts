import { defineMigration } from '@justscale/postgres'

export default defineMigration({
  name: '2026_07_23_171347_add_enrichment_fields',
  async up({ db }) {
    await db.raw(`ALTER TABLE p2000_messages ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE`)
    await db.raw(`ALTER TABLE p2000_messages ADD COLUMN municipality VARCHAR(160)`)
    await db.raw(`ALTER TABLE p2000_messages ADD COLUMN province VARCHAR(80)`)
    await db.raw(`ALTER TABLE p2000_messages ADD COLUMN region VARCHAR(80)`)
    await db.raw(`ALTER TABLE p2000_messages ADD COLUMN postcode VARCHAR(8)`)
  },

  async down({ db }) {
    await db.raw(`ALTER TABLE p2000_messages DROP COLUMN postcode`)
    await db.raw(`ALTER TABLE p2000_messages DROP COLUMN region`)
    await db.raw(`ALTER TABLE p2000_messages DROP COLUMN province`)
    await db.raw(`ALTER TABLE p2000_messages DROP COLUMN municipality`)
    await db.raw(`ALTER TABLE p2000_messages DROP COLUMN is_test`)
  },
})
