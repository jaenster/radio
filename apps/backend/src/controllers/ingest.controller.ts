import { createController } from '@justscale/core';
import { Post } from '@justscale/http';
import { z } from 'zod';
import { MessageService } from '../domains/message.service.js';

// Wire envelope produced by the Zig receiver-agent (see packages/wire/WIRE.md).
const WireSchema = z.object({
  v: z.literal(1),
  src: z.string(),
  ts_ms: z.number(),
  baud: z.number(),
  level: z.number(),
  frame: z.string(),
  cycle: z.number(),
  flag: z.string(),
  msgtype: z.string(),
  fragver: z.string(),
  capcodes: z.array(z.string()).min(1),
  body: z.string(),
  raw: z.string(),
  seq: z.number().optional(),
});

// If INGEST_SECRET is set, require `Authorization: Bearer <secret>`. Unset ⇒ open (local dev).
function authorized(headers: Record<string, string>): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return true;
  return headers['authorization'] === `Bearer ${secret}`;
}

export const IngestController = createController('/', {
  inject: { messages: MessageService },
  routes: ({ messages }) => ({
    ingest: Post('/ingest')
      .body(WireSchema)
      .handle(async ({ body, headers, res }) => {
        if (!authorized(headers)) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        const saved = await messages.ingest(body);
        res.json({ ok: true, id: saved.mid });
      }),
  }),
});
