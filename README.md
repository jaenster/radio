# radio

An always-on RTL-SDR receiving station that decodes Dutch **P2000** (the emergency-services
pager network, 169.65 MHz, FLEX) and serves it as a live map + feed at **p2000.typeguru.nl**.

## Architecture

```
[NAS / Synology]  RTL-SDR dongle → rtl_fm | multimon-ng (FLEX)
      → receiver-agent (Zig): parse → JSON → HTTPS POST
      ─────────────────────────────────────────────▶
[Hetzner k8s]  justscale backend: /ingest → enrich (priority, discipline,
      PDOK geocode) → Postgres → SSE live feed + REST → premium map SPA
```

- **`services/receiver-agent`** — a tiny static (musl) **Zig** binary that supervises the
  `rtl_fm | multimon-ng` pipeline, parses FLEX messages, and posts them to the backend. Ships
  as an ~9 MB Docker image; runs on the NAS with USB passthrough. Env: `P2000_FREQ`,
  `P2000_GAIN`, `P2000_PPM`, `P2000_LOG` (append JSON to a file), `P2000_CMD` (test override).
- **`apps/backend`** — the [justscale](https://github.com/justscale/justscale) app
  (Node 24 + Postgres): ingest, server-side enrichment, SSE live feed, and the map/feed SPA.
- **`packages/wire`** — the shared wire contract (`WIRE.md` + types) between agent and backend.
- **`packages/enrich`** — priority/discipline parsing + PDOK geocoding (also lives in the app).
- **`deploy/`** / GitOps — Kubernetes manifests (ArgoCD, ingress, CloudNativePG).

## Enrichment

Each message is parsed server-side: priority (`A1/A2/B1/B2` ambulance scheme, `P 1/2`
brandweer/politie), discipline (ambulance / brandweer / politie / knrm), and geocoded via the
official **PDOK Locatieserver** to drop a pin on the map.

## Privacy (AVG / GDPR)

P2000 is unencrypted and legal to receive, but message bodies can contain personal/medical
data. This project keeps things operational/aggregate; do not build permanent
person-linkable histories. Raw captures are **not** committed (see `.gitignore`).

## Develop

```
pnpm install
# receiver-agent (Zig) — needs zig 0.16:
pnpm --filter @radio/receiver-agent test
# backend — needs a local Postgres (docker run … postgres:16):
pnpm --filter @radio/backend dev
```

## License

MIT — see [LICENSE](./LICENSE).
