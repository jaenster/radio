import { createController } from '@justscale/core';
import { Get } from '@justscale/http';
import { SSE } from '@justscale/sse';
import { readFileSync } from 'node:fs';
import { MessageService } from '../domains/message.service.js';
import { serialize } from '../serialize.js';

// The SPA (../../../frontend/index.html) is a single self-contained file; read
// once at boot and serve at '/'. FRONTEND_HTML overrides the path in prod.
const INDEX_HTML = readFileSync(
  process.env.FRONTEND_HTML ?? new URL('../../../frontend/index.html', import.meta.url),
  'utf8',
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const ApiController = createController('/', {
  inject: { messages: MessageService },
  routes: ({ messages }) => ({
    home: Get('/').handle(async ({ res }) => {
      res.html(INDEX_HTML);
    }),

    health: Get('/health').handle(async ({ res }) => {
      res.json({ ok: true, service: 'p2000' });
    }),

    history: Get('/api/messages').handle(async ({ res }) => {
      const rows = await messages.recent(200);
      res.json(rows.map(serialize));
    }),

    // Live feed: poll for rows newer than the connection cursor and push them.
    // P2000 is low-rate, so a short poll is imperceptible and needs no broker.
    events: SSE('/events').handle(async function* () {
      let cursor = new Date();
      yield { event: 'ready', data: { ok: true } };
      while (true) {
        const rows = await messages.since(cursor);
        for (const m of rows) {
          const at = (m as any).receivedAt;
          if (at instanceof Date && at > cursor) cursor = at;
          yield { event: 'message', data: serialize(m) };
        }
        await sleep(1500);
      }
    }),
  }),
});
