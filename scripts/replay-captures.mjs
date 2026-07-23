#!/usr/bin/env node
// Replay captured P2000 wire lines into a running backend's /ingest endpoint.
// Each line in the capture file is already the exact wire envelope.
//
//   node scripts/replay-captures.mjs [file]
//   INGEST_URL=http://localhost:3999/ingest INGEST_SECRET=... node scripts/replay-captures.mjs captures/p2000-mac.jsonl
import { readFileSync } from 'node:fs';

const url = process.env.INGEST_URL ?? 'http://localhost:3999/ingest';
const file = process.argv[2] ?? 'captures/p2000-mac.jsonl';
const secret = process.env.INGEST_SECRET;

const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
let ok = 0;
let fail = 0;

for (const line of lines) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: line,
    });
    if (r.ok) {
      ok++;
    } else {
      fail++;
      console.error('fail', r.status, (await r.text()).slice(0, 200));
    }
  } catch (e) {
    fail++;
    console.error('err', e.message);
  }
  await new Promise((r) => setTimeout(r, 150)); // gentle on PDOK geocoder
}

console.log(`replayed ${ok} ok, ${fail} fail (of ${lines.length})`);
