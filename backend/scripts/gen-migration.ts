import JustScale, { createConfig, createSecretProvider } from '@justscale/core';
import {
  PostgresFeature,
  PostgresLockFeature,
  PostgresMigrationFeature,
  PostgresMigrationConfig,
  PostgresMigrationDevConfig,
  PostgresSecrets,
  PgMigrationGeneratorService,
  getRegisteredPgModels,
} from '@justscale/postgres';
import { PostgresMigrationDevFeature } from '@justscale/postgres/dev';

// Side-effect: registers PgP2000Message in the model registry.
import '../src/infra/message.pg.js';

const connectionString =
  process.env.DATABASE_URL ?? `postgres://postgres:dev@localhost:${process.env.PGPORT ?? 5433}/p2000`;

const Config = createConfig({
  provides: [PostgresMigrationConfig, PostgresMigrationDevConfig],
  factory: () => ({
    [PostgresMigrationConfig.key]: { table: '_migrations' },
    [PostgresMigrationDevConfig.key]: { directory: './migrations' },
  }),
});

const Secrets = createSecretProvider({
  provides: [PostgresSecrets],
  factory: () => ({ [PostgresSecrets.key]: { connectionString } }),
});

const built = JustScale()
  .add(Secrets)
  .add(Config)
  .add(PostgresFeature)
  .add(PostgresLockFeature)
  .add(PostgresMigrationFeature)
  .add(PostgresMigrationDevFeature)
  .build();

const app = built.compile();
await app.ready;

const generator = await app.container.resolve(PgMigrationGeneratorService);
const models = getRegisteredPgModels().filter((m: any) => m.table === 'p2000_messages');
// eslint-disable-next-line no-console
console.log('registered models:', models.map((m: any) => m.table));

const result = await generator.createDiff('./migrations', [...models], {
  name: 'create_p2000_messages',
});
// eslint-disable-next-line no-console
console.log('hasChanges:', result.hasChanges, 'file:', (result as any).filepath);
for (const c of result.changes) {
  // eslint-disable-next-line no-console
  console.log('  change:', c.type, c.table, c.column ?? '');
}
process.exit(0);
