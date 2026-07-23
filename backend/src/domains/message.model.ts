import { defineModel, field } from '@justscale/core/models';

// One received P2000/FLEX message, raw fields + server-derived enrichment.
// Priority and geo are flattened to columns (simple queries + serialization);
// capcodes stay JSON.
export class P2000Message extends defineModel({
  name: 'P2000Message',
  fields: {
    mid: field.string().max(40).unique(), // our stable public id (uuid)
    tsMs: field.double(), // agent receive time (epoch ms)
    receivedAt: field.createdAt(), // server insert time — ordering + SSE poll cursor
    capcodes: field.json<string[]>(),
    body: field.text(),
    raw: field.text(),
    flag: field.string().max(8),
    frame: field.string().max(16),
    discipline: field.enum('Discipline', ['ambulance', 'brandweer', 'politie', 'knrm', 'other']),
    priorityRaw: field.string().max(8).optional(),
    priorityScheme: field.string().max(4).optional(),
    priorityLevel: field.smallint().optional(),
    isTest: field.boolean().default(false),
    city: field.string().max(160).optional(),
    municipality: field.string().max(160).optional(),
    province: field.string().max(80).optional(),
    region: field.string().max(80).optional(), // veiligheidsregio
    postcode: field.string().max(8).optional(),
    lat: field.double().optional(),
    lon: field.double().optional(),
  },
}) {}
