import type { P2000Message } from './domains/message.model.js';

/** Shape the frontend + SSE consume (see public/index.html). */
export interface WireOut {
  id: string;
  ts_ms: number;
  received_at: string;
  capcodes: string[];
  body: string;
  raw: string;
  discipline: string;
  priority: { raw: string | null; scheme: string | null; level: number | null };
  city: string | null;
  geo: { lat: number; lon: number } | null;
}

export function serialize(m: P2000Message): WireOut {
  const received = (m as any).receivedAt;
  return {
    id: m.mid,
    ts_ms: m.tsMs,
    received_at: received instanceof Date ? received.toISOString() : String(received),
    capcodes: m.capcodes,
    body: m.body,
    raw: m.raw,
    discipline: m.discipline,
    priority: {
      raw: m.priorityRaw ?? null,
      scheme: m.priorityScheme ?? null,
      level: m.priorityLevel ?? null,
    },
    city: m.city ?? null,
    geo: m.lat != null && m.lon != null ? { lat: m.lat, lon: m.lon } : null,
  };
}
