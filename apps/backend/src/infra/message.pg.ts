import { createPgModel, createPgRepository } from '@justscale/postgres';
import { P2000Message } from '../domains/message.model.js';

export const PgP2000Message = createPgModel(P2000Message, {
  table: 'p2000_messages',
  overrides: {
    mid: { index: true },
    receivedAt: { index: true },
  },
});

export const P2000Repository = createPgRepository(PgP2000Message);
