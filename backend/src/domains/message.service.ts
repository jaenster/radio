import { defineService } from '@justscale/core';
import { ModelRepository } from '@justscale/core/models';
import { randomUUID } from 'node:crypto';
import { P2000Message } from './message.model.js';
import { enrich } from '../enrich.js';

export interface WireIn {
  ts_ms: number;
  capcodes: string[];
  body: string;
  raw: string;
  flag: string;
  frame: string;
}

export class MessageService extends defineService({
  inject: { repo: ModelRepository.of(P2000Message) },
  factory: ({ repo }) => ({
    async ingest(wire: WireIn) {
      const e = await enrich(wire);
      return repo.insert({
        mid: randomUUID(),
        tsMs: wire.ts_ms,
        capcodes: wire.capcodes,
        body: wire.body,
        raw: wire.raw,
        flag: wire.flag,
        frame: wire.frame,
        discipline: e.discipline,
        priorityRaw: e.priority.raw ?? undefined,
        priorityScheme: e.priority.scheme ?? undefined,
        priorityLevel: e.priority.level ?? undefined,
        isTest: e.isTest,
        city: e.city ?? undefined,
        municipality: e.municipality ?? undefined,
        province: e.province ?? undefined,
        region: e.region ?? undefined,
        postcode: e.postcode ?? undefined,
        lat: e.geo?.lat,
        lon: e.geo?.lon,
      });
    },

    async recent(limit = 200) {
      return repo.find({ orderBy: [P2000Message.fields.receivedAt.desc()], limit });
    },

    async since(cursor: Date, limit = 200) {
      return repo.find({
        where: P2000Message.fields.receivedAt.gt(cursor),
        orderBy: [P2000Message.fields.receivedAt.asc()],
        limit,
      });
    },
  }),
}) {}
