import '@justscale/postgres/virtual/migrations';
import '@justscale/sse';

import JustScale, {
  bindRepository,
  createConfig,
  createSecretProvider,
} from '@justscale/core';
import { HttpConfig } from '@justscale/http';
import { ModelRepository } from '@justscale/core/models';
import {
  PostgresFeature,
  PostgresChannelFeature,
  PostgresLockFeature,
  PostgresMigrationFeature,
  PostgresMigrationConfig,
  PostgresSecrets,
} from '@justscale/postgres';

import { P2000Message } from './domains/message.model.js';
import { P2000Repository } from './infra/message.pg.js';
import { MessageService } from './domains/message.service.js';
import { IngestController } from './controllers/ingest.controller.js';
import { ApiController } from './controllers/api.controller.js';

const connectionString =
  process.env.DATABASE_URL ?? `postgres://postgres:dev@localhost:${process.env.PGPORT ?? 5433}/p2000`;

const Config = createConfig({
  provides: [HttpConfig, PostgresMigrationConfig],
  factory: () => ({
    [HttpConfig.key]: { port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' },
    [PostgresMigrationConfig.key]: { table: '_migrations' },
  }),
});

const Secrets = createSecretProvider({
  provides: [PostgresSecrets],
  factory: () => ({ [PostgresSecrets.key]: { connectionString } }),
});

export const app = JustScale()
  .add(Secrets)
  .add(Config)
  .add(PostgresFeature)
  .add(PostgresChannelFeature) // provides AbstractChannelBackend (PG LISTEN/NOTIFY) for model-change channels
  .add(PostgresLockFeature)
  .add(PostgresMigrationFeature)
  .add(bindRepository(ModelRepository.of(P2000Message), P2000Repository))
  .add(MessageService)
  .add(IngestController)
  .add(ApiController)
  .build();
