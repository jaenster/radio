import '@justscale/http';
import { MigrationRunnerService } from '@justscale/postgres';
import { app } from './app.js';

async function main() {
  const compiled = app.compile();
  await compiled.ready;

  // Apply pending migrations (registered via `@justscale/postgres/virtual/migrations`
  // from ./migrations) before serving so the schema is present on boot.
  const runner = await compiled.container.resolve(MigrationRunnerService);
  const applied = await runner.migrate();
  if (applied.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`applied ${applied.length} migration(s): ${applied.join(', ')}`);
  }

  await app.serve();
  // eslint-disable-next-line no-console
  console.log(`p2000 backend listening on :${process.env.PORT ?? 3000}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
