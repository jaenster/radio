// Server-side P2000 enrichment: derive discipline, priority, test-flag, and
// location (city / gemeente / province / veiligheidsregio) via PDOK geocoding.
// Plain functions, no framework coupling, so it stays unit-testable.

import { regionForGemeente } from './data/veiligheidsregio.js';

export type Discipline = 'ambulance' | 'brandweer' | 'politie' | 'knrm' | 'other';

export interface Priority {
  raw: string | null;
  scheme: 'AB' | 'P' | null;
  level: number | null;
}

export interface Enriched {
  discipline: Discipline;
  priority: Priority;
  urgent: boolean;
  isTest: boolean;
  city: string | null;
  municipality: string | null;
  province: string | null;
  region: string | null;
  postcode: string | null;
  geo: { lat: number; lon: number } | null;
}

/** A1/A2/B1/B2 = ambulance scheme; "P 1"/"PRIO 2" = brandweer/politie scheme. */
export function parsePriority(body: string): Priority {
  const ab = /^\s*([AB])\s?([123])\b/.exec(body);
  if (ab) return { raw: `${ab[1]}${ab[2]}`, scheme: 'AB', level: Number(ab[2]) };
  const p = /\bP\s?(?:RIO)?\.?\s?([123])\b/i.exec(body);
  if (p) return { raw: `P${p[1]}`, scheme: 'P', level: Number(p[1]) };
  return { raw: null, scheme: null, level: null };
}

/** Best-effort discipline from body keywords. Order matters (BR before ambu). */
export function guessDiscipline(body: string): Discipline {
  if (/\bBR[- ]|brandweer|BON-\d+\s*BR|tankautospuit|blusvoert|\bTS\d/i.test(body)) return 'brandweer';
  if (/\bpolitie\b/i.test(body)) return 'politie';
  if (/\bKNRM\b|reddingsbrigade|kustwacht/i.test(body)) return 'knrm';
  if (/\bambu\w*|\bMKA\b|\brit\b|rit:|ambulance/i.test(body) || /^\s*[AB][123]\b/.test(body)) return 'ambulance';
  if (/^\s*P\s?[123]\b/.test(body)) return 'brandweer';
  return 'other';
}

/** Test/exercise pages that shouldn't clutter the operational feed. */
export function isTestMessage(body: string): boolean {
  return (
    /(^|\W)(test\w*|testoproep|proefalarm|controlemelding|oefen\w*)(\W|$)/i.test(body) ||
    /fijne dienst/i.test(body)
  );
}

/** Dutch postcode like "3045PM" / "3045 PM" -> "3045 PM". */
export function parsePostcode(body: string): string | null {
  const m = /\b(\d{4})\s?([A-Za-z]{2})\b/.exec(body);
  return m ? `${m[1]} ${m[2]!.toUpperCase()}` : null;
}

/** Strip prefixes / rit numbers / noise so PDOK free-text search matches the address. */
export function cleanForGeocode(body: string): string {
  let s = body;
  s = s.replace(/^\s*([AB][123]|P\s?(?:RIO)?\.?\s?[123])\b/i, ' ');
  s = s.replace(/\b(directe inzet|dia:?\s*ja|prio\s?\d|medium care|spoed\w*)\b/gi, ' ');
  s = s.replace(/\bambu\w*\b/gi, ' ');
  s = s.replace(/\b(rit|bon|ritnummer|rit nr)\s*:?\s*\d+\w*/gi, ' ');
  s = s.replace(/\b\d{4,}\w*\b/g, ' '); // rit/id/bon numbers
  s = s.replace(/[*!}{|#:()\-]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

interface PdokHit {
  lat: number;
  lon: number;
  city: string | null;
  gemeente: string | null;
  province: string | null;
}

/** Geocode via PDOK Locatieserver free-text search. Returns null on miss/error. */
export async function geocodePdok(q: string): Promise<PdokHit | null> {
  const url =
    'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free' +
    '?rows=1&fl=centroide_ll,woonplaatsnaam,gemeentenaam,provincienaam' +
    '&fq=type:(adres OR weg OR woonplaats)&q=' +
    encodeURIComponent(q);
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const j: any = await r.json();
  const doc = j?.response?.docs?.[0];
  const ll: string | undefined = doc?.centroide_ll;
  if (!ll) return null;
  const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(ll);
  if (!m) return null;
  return {
    lon: parseFloat(m[1]!),
    lat: parseFloat(m[2]!),
    city: doc.woonplaatsnaam ?? null,
    gemeente: doc.gemeentenaam ?? null,
    province: doc.provincienaam ?? null,
  };
}

export async function enrich(wire: { body: string; capcodes: string[] }): Promise<Enriched> {
  const priority = parsePriority(wire.body);
  const discipline = guessDiscipline(wire.body);
  const isTest = isTestMessage(wire.body);
  const postcode = parsePostcode(wire.body);

  let city: string | null = null;
  let municipality: string | null = null;
  let province: string | null = null;
  let region: string | null = null;
  let geo: { lat: number; lon: number } | null = null;

  // Don't spend geocoder calls on test pages (they're filtered out anyway).
  if (!isTest) {
    const q = cleanForGeocode(wire.body);
    if (q.length >= 3) {
      try {
        const g = await geocodePdok(q);
        if (g) {
          geo = { lat: g.lat, lon: g.lon };
          city = g.city;
          municipality = g.gemeente;
          province = g.province;
          region = regionForGemeente(g.gemeente);
        }
      } catch {
        /* geocode is best-effort; the message still shows in the feed */
      }
    }
  }

  return {
    discipline,
    priority,
    urgent: priority.level === 1,
    isTest,
    city,
    municipality,
    province,
    region,
    postcode,
    geo,
  };
}
