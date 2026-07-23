import { z } from "zod";

/** Wire protocol version emitted by the receiver-agent (see WIRE.md). */
export const P2000_WIRE_VERSION = 1;

/** A P2000/FLEX capcode: exactly 10 decimal digits. */
export const CapcodeSchema = z.string().regex(/^\d{10}$/);

/**
 * One FLEX message as produced by the Zig receiver-agent. The agent does no
 * enrichment — discipline / priority / location are derived server-side.
 */
export const P2000MessageSchema = z.object({
  v: z.literal(P2000_WIRE_VERSION),
  src: z.literal("p2000"),
  /** Agent receive time, Unix epoch milliseconds. */
  ts_ms: z.number().int().nonnegative(),
  baud: z.number().int(),
  level: z.number().int(),
  frame: z.string(),
  cycle: z.number().int(),
  flag: z.string(),
  msgtype: z.string(),
  fragver: z.string(),
  /** Primary capcode first, then any group members. */
  capcodes: z.array(CapcodeSchema).min(1),
  body: z.string(),
  /** Full original multimon line, for audit / re-parse. */
  raw: z.string(),
  /** Per-connection monotonic sequence, attached by the transport layer. */
  seq: z.number().int().nonnegative().optional(),
});

export type P2000Message = z.infer<typeof P2000MessageSchema>;

/** Server ack sent back over the WS so the client can advance its journal. */
export const AckSchema = z.object({ ack: z.number().int().nonnegative() });
export type Ack = z.infer<typeof AckSchema>;
