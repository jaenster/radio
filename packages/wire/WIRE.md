# Wire format — receiver-agent → justscale backend

One JSON object per FLEX message, sent as one WebSocket text frame. The client (Zig, on the
NAS) does **no enrichment** — it only structures the raw multimon output and forwards it.
All parsing of discipline / priority / location happens server-side.

## multimon-ng source line

`multimon-ng -a FLEX_NEXT` emits pipe-delimited lines. Fixed 8-field header, then zero or
more extra 10-digit capcodes (group pages), then the free-text body:

```
FLEX_NEXT|1600/2|12.023.A|0002029582|SG|5|ALN|3.0.K|0001523001|0001523171|A1 Meerstraat HILLGM : 16171
   0         1       2         3       4  5   6    7      8          9       10 (body)
```

| idx | meaning | example |
|-|-|-|
| 0 | protocol (must be `FLEX_NEXT`) | `FLEX_NEXT` |
| 1 | `baud/level` | `1600/2` |
| 2 | frame `cycle.frame.phase` | `12.023.A` |
| 3 | primary capcode (10 digits) | `0002029582` |
| 4 | flag (`SS` single / `SG` group) | `SG` |
| 5 | cycle number | `5` |
| 6 | message type (`ALN`/`NUM`/`TON`) | `ALN` |
| 7 | fragment/version | `3.0.K` |
| 8.. | extra capcodes while field is exactly 10 digits | `0001523001` |
| n | body (rest of line; may be empty) | `A1 Meerstraat …` |

## JSON envelope

```json
{
  "v": 1,
  "src": "p2000",
  "ts_ms": 1690120105000,
  "baud": 1600,
  "level": 2,
  "frame": "12.023.A",
  "cycle": 5,
  "flag": "SG",
  "msgtype": "ALN",
  "fragver": "3.0.K",
  "capcodes": ["0002029582", "0001523001", "0001523171"],
  "body": "A1 Meerstraat HILLGM : 16171",
  "raw": "FLEX_NEXT|1600/2|12.023.A|0002029582|SG|5|ALN|3.0.K|0001523001|0001523171|A1 Meerstraat HILLGM : 16171"
}
```

- `ts_ms` — receive time (agent wall clock), Unix epoch **milliseconds**. multimon carries no
  timestamp; the agent stamps arrival. Avoids date formatting on the Zig side; server converts.
- `capcodes` — primary (idx 3) first, then any group members (idx 8+). Server maps each to a unit.
- `body` — verbatim, may be empty (e.g. control frames). Everything after the version field.
- `raw` — full original line, kept for audit / server-side re-parse if the format shifts.

## Framing / transport

- Each message = one WS **text** frame containing one JSON object (not newline-batched).
- Server replies with an ack (`{"ack": <seq>}`) so the client can advance its journal offset;
  see the agent's disk-journal / replay logic. `seq` is a per-connection monotonic counter the
  client attaches as `"seq"` on send (added by the transport layer, not the parser).
