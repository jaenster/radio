//! P2000 receiver-agent (NAS side).
//!
//! Supervises the proven `rtl_fm | multimon-ng -a FLEX_NEXT` pipeline, parses each
//! FLEX line into the wire JSON envelope (see WIRE.md / flex.zig), and — in this
//! build — writes the JSON to stdout. The WebSocket transport + disk journal are
//! layered on next.
//!
//! Process/IO plumbing goes through libc (`popen`, `write`, `nanosleep`,
//! `clock_gettime`) rather than std.Io: a stable C ABI is version-proof against
//! Zig std churn, and the eventual `wss` client links C (libcurl) anyway.

const std = @import("std");
const flex = @import("flex.zig");

const c = @cImport({
    @cInclude("stdio.h");
    @cInclude("stdlib.h");
    @cInclude("string.h");
    @cInclude("time.h");
    @cInclude("unistd.h");
});

/// Optional append-only logfile (P2000_LOG). Each emitted JSON line is also
/// written here, so the NAS keeps a durable capture independent of the WS.
var logf: ?*c.FILE = null;

const Config = struct {
    freq: [*:0]const u8,
    gain: [*:0]const u8,
    ppm: [*:0]const u8,

    fn fromEnv() Config {
        return .{
            .freq = envOr("P2000_FREQ", "169.65M"),
            .gain = envOr("P2000_GAIN", "42"),
            .ppm = envOr("P2000_PPM", "0"),
        };
    }

    fn envOr(name: [*:0]const u8, default: [*:0]const u8) [*:0]const u8 {
        const v = c.getenv(name);
        if (v == null) return default;
        return @ptrCast(v);
    }
};

fn writeAllFd(fd: c_int, bytes: []const u8) void {
    var off: usize = 0;
    while (off < bytes.len) {
        const n = c.write(fd, bytes.ptr + off, bytes.len - off);
        if (n <= 0) return;
        off += @intCast(n);
    }
}

fn log(comptime fmt: []const u8, args: anytype) void {
    var buf: [512]u8 = undefined;
    const s = std.fmt.bufPrint(&buf, fmt, args) catch return;
    writeAllFd(2, s);
}

// libc `struct timespec`. Declared here rather than via @cImport because
// translate-c renders it as an *opaque* type on musl (Alpine), which can't be
// stack-allocated. Layout matches time_t/long on 64-bit (Synology amd64/arm64).
const timespec = extern struct { tv_sec: isize = 0, tv_nsec: isize = 0 };

/// Unix epoch milliseconds via CLOCK_REALTIME.
fn nowMs() i64 {
    var ts: timespec = .{};
    _ = c.clock_gettime(c.CLOCK_REALTIME, @ptrCast(&ts));
    return @as(i64, ts.tv_sec) * 1000 + @divTrunc(@as(i64, ts.tv_nsec), 1_000_000);
}

fn sleepMs(ms: u64) void {
    var ts: timespec = .{
        .tv_sec = @intCast(ms / 1000),
        .tv_nsec = @intCast((ms % 1000) * 1_000_000),
    };
    _ = c.nanosleep(@ptrCast(&ts), null);
}

/// Best-effort: free the dongle from a previous rtl_fm before we claim it.
/// If we actually killed one, wait for the USB device to be released (avoids
/// `usb_claim_interface error -3` on the next tune).
fn freeDongle() void {
    const r = c.system("pkill -f rtl_fm >/dev/null 2>&1");
    if (r == 0) sleepMs(1000);
}

/// Run the pipeline once: popen it, stream + parse + emit until it exits.
/// Returns how long (ms) it ran, for backoff decisions.
fn runPipelineOnce(cmd: [*:0]const u8) i64 {
    const f = c.popen(cmd, "r");
    if (f == null) {
        log("agent: popen failed\n", .{});
        return 0;
    }
    const t0 = nowMs();

    var linebuf: [4096]u8 = undefined;
    var jsonbuf: [8192]u8 = undefined;
    while (c.fgets(&linebuf, linebuf.len, f) != null) {
        const raw_len = c.strlen(&linebuf);
        var line: []const u8 = linebuf[0..raw_len];
        while (line.len > 0 and (line[line.len - 1] == '\n' or line[line.len - 1] == '\r')) {
            line = line[0 .. line.len - 1];
        }
        const msg = flex.parse(line) orelse continue;
        const json = flex.toJson(msg, nowMs(), &jsonbuf) orelse {
            log("agent: message too large to serialize, dropped\n", .{});
            continue;
        };
        writeAllFd(1, json);
        writeAllFd(1, "\n");
        if (logf) |lf| {
            _ = c.fwrite(json.ptr, 1, json.len, lf);
            _ = c.fputc('\n', lf);
            _ = c.fflush(lf);
        }
    }
    _ = c.pclose(f);
    return nowMs() - t0;
}

pub fn main() void {
    const cfg = Config.fromEnv();

    var cmdbuf: [512]u8 = undefined;
    // P2000_CMD overrides the pipeline verbatim (testing: point it at `cat file`).
    // Otherwise build the rtl_fm|multimon pipeline; rtl_fm stderr stays visible
    // (tuning info + device errors), multimon status is dropped.
    const cmd = blk: {
        if (c.getenv("P2000_CMD")) |override| {
            break :blk std.mem.span(@as([*:0]const u8, @ptrCast(override)));
        }
        break :blk std.fmt.bufPrintZ(
            &cmdbuf,
            "rtl_fm -f {s} -M fm -s 22050 -g {s} -p {s} - | multimon-ng -a FLEX_NEXT -t raw - 2>/dev/null",
            .{ std.mem.span(cfg.freq), std.mem.span(cfg.gain), std.mem.span(cfg.ppm) },
        ) catch {
            log("agent: config too long\n", .{});
            return;
        };
    };

    if (c.getenv("P2000_LOG")) |path| {
        logf = c.fopen(@ptrCast(path), "a");
        if (logf == null) log("agent: warning: cannot open P2000_LOG for append\n", .{});
    }

    log("agent: P2000 @ {s} gain={s} ppm={s}\n", .{ std.mem.span(cfg.freq), std.mem.span(cfg.gain), std.mem.span(cfg.ppm) });

    // Supervise: restart the pipeline forever, with capped backoff.
    var backoff_ms: u64 = 500;
    while (true) {
        freeDongle();
        const ran_ms = runPipelineOnce(cmd.ptr);
        if (ran_ms > 10_000) backoff_ms = 500 else backoff_ms = @min(backoff_ms * 2, 30_000);
        log("agent: pipeline exited after {d}ms, restarting in {d}ms\n", .{ ran_ms, backoff_ms });
        sleepMs(backoff_ms);
    }
}
