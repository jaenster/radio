//! Parse `multimon-ng -a FLEX_NEXT` output lines and serialize to the wire JSON
//! envelope documented in WIRE.md. No enrichment happens here — the agent only
//! structures the raw line; the server derives discipline / priority / location.

const std = @import("std");

pub const max_capcodes = 16;

pub const Message = struct {
    baud: u32,
    level: u8,
    frame: []const u8,
    flag: []const u8,
    cycle: u32,
    msgtype: []const u8,
    fragver: []const u8,
    caps: [max_capcodes][]const u8,
    caps_n: usize,
    body: []const u8,
    raw: []const u8,
};

fn isCapcode(s: []const u8) bool {
    if (s.len != 10) return false;
    for (s) |c| {
        if (c < '0' or c > '9') return false;
    }
    return true;
}

/// Return the remainder of `l` after the n-th '|' (1-indexed). Empty if fewer.
fn afterNthPipe(l: []const u8, n: usize) []const u8 {
    var count: usize = 0;
    var i: usize = 0;
    while (i < l.len) : (i += 1) {
        if (l[i] == '|') {
            count += 1;
            if (count == n) return l[i + 1 ..];
        }
    }
    return l[l.len..];
}

/// Parse one multimon FLEX_NEXT line. Returns null for non-FLEX or malformed
/// lines. All slices borrow from `line`, so keep `line` alive while using the
/// result (parse → serialize within the same loop iteration).
pub fn parse(line: []const u8) ?Message {
    // Strip trailing CR/LF.
    var l = line;
    while (l.len > 0 and (l[l.len - 1] == '\n' or l[l.len - 1] == '\r')) l.len -= 1;

    if (!std.mem.startsWith(u8, l, "FLEX_NEXT|")) return null;

    var fields: [64][]const u8 = undefined;
    var n: usize = 0;
    var it = std.mem.splitScalar(u8, l, '|');
    while (it.next()) |f| {
        if (n >= fields.len) break;
        fields[n] = f;
        n += 1;
    }
    // Need the 8 header fields + at least a body field (which may be empty).
    if (n < 9) return null;

    // field[1] = "baud/level"
    var baud: u32 = 0;
    var level: u8 = 0;
    if (std.mem.indexOfScalar(u8, fields[1], '/')) |slash| {
        baud = std.fmt.parseInt(u32, fields[1][0..slash], 10) catch 0;
        level = std.fmt.parseInt(u8, fields[1][slash + 1 ..], 10) catch 0;
    }

    var msg = Message{
        .baud = baud,
        .level = level,
        .frame = fields[2],
        .flag = fields[4],
        .cycle = std.fmt.parseInt(u32, fields[5], 10) catch 0,
        .msgtype = fields[6],
        .fragver = fields[7],
        .caps = undefined,
        .caps_n = 0,
        .body = "",
        .raw = l,
    };

    // Primary capcode, then any leading 10-digit fields (group members).
    msg.caps[0] = fields[3];
    msg.caps_n = 1;
    var bi: usize = 8;
    while (bi < n and isCapcode(fields[bi]) and msg.caps_n < max_capcodes) : (bi += 1) {
        msg.caps[msg.caps_n] = fields[bi];
        msg.caps_n += 1;
    }

    // Body = rest of the original line after `bi` pipes (preserves any '|' in body).
    msg.body = afterNthPipe(l, bi);
    return msg;
}

// ---- JSON serialization (fixed-buffer, no allocator / IO dependency) --------

const Buf = struct {
    data: []u8,
    len: usize = 0,
    overflow: bool = false,

    fn raw(self: *Buf, s: []const u8) void {
        if (self.len + s.len > self.data.len) {
            self.overflow = true;
            return;
        }
        @memcpy(self.data[self.len..][0..s.len], s);
        self.len += s.len;
    }

    fn byte(self: *Buf, b: u8) void {
        if (self.len + 1 > self.data.len) {
            self.overflow = true;
            return;
        }
        self.data[self.len] = b;
        self.len += 1;
    }

    fn int(self: *Buf, v: i64) void {
        var tmp: [24]u8 = undefined;
        const s = std.fmt.bufPrint(&tmp, "{d}", .{v}) catch return;
        self.raw(s);
    }

    /// Write a JSON string literal (with quotes), escaping per RFC 8259.
    fn jstr(self: *Buf, s: []const u8) void {
        self.byte('"');
        for (s) |c| {
            switch (c) {
                '"' => self.raw("\\\""),
                '\\' => self.raw("\\\\"),
                '\n' => self.raw("\\n"),
                '\r' => self.raw("\\r"),
                '\t' => self.raw("\\t"),
                else => {
                    if (c < 0x20) {
                        var tmp: [6]u8 = undefined;
                        const s2 = std.fmt.bufPrint(&tmp, "\\u{x:0>4}", .{c}) catch continue;
                        self.raw(s2);
                    } else {
                        self.byte(c);
                    }
                },
            }
        }
        self.byte('"');
    }
};

/// Serialize `msg` into `out` as the wire JSON envelope. `ts_ms` is the agent's
/// receive time (Unix epoch ms). Returns the written slice, or null on overflow.
pub fn toJson(msg: Message, ts_ms: i64, out: []u8) ?[]const u8 {
    var b = Buf{ .data = out };
    b.raw("{\"v\":1,\"src\":\"p2000\",\"ts_ms\":");
    b.int(ts_ms);
    b.raw(",\"baud\":");
    b.int(msg.baud);
    b.raw(",\"level\":");
    b.int(msg.level);
    b.raw(",\"frame\":");
    b.jstr(msg.frame);
    b.raw(",\"cycle\":");
    b.int(msg.cycle);
    b.raw(",\"flag\":");
    b.jstr(msg.flag);
    b.raw(",\"msgtype\":");
    b.jstr(msg.msgtype);
    b.raw(",\"fragver\":");
    b.jstr(msg.fragver);
    b.raw(",\"capcodes\":[");
    var i: usize = 0;
    while (i < msg.caps_n) : (i += 1) {
        if (i != 0) b.byte(',');
        b.jstr(msg.caps[i]);
    }
    b.raw("],\"body\":");
    b.jstr(msg.body);
    b.raw(",\"raw\":");
    b.jstr(msg.raw);
    b.byte('}');
    if (b.overflow) return null;
    return b.data[0..b.len];
}

// ---- tests ------------------------------------------------------------------

const testing = std.testing;

test "parse SS single-capcode message" {
    const line = "FLEX_NEXT|1600/2|12.074.A|0000920201|SS|5|ALN|3.0.K|B2 Ambu 07201 - Arnhem Rit 227496";
    const m = parse(line).?;
    try testing.expectEqual(@as(u32, 1600), m.baud);
    try testing.expectEqual(@as(u8, 2), m.level);
    try testing.expectEqualStrings("12.074.A", m.frame);
    try testing.expectEqualStrings("SS", m.flag);
    try testing.expectEqual(@as(u32, 5), m.cycle);
    try testing.expectEqualStrings("ALN", m.msgtype);
    try testing.expectEqualStrings("3.0.K", m.fragver);
    try testing.expectEqual(@as(usize, 1), m.caps_n);
    try testing.expectEqualStrings("0000920201", m.caps[0]);
    try testing.expectEqualStrings("B2 Ambu 07201 - Arnhem Rit 227496", m.body);
}

test "parse SG group message with extra capcodes" {
    const line = "FLEX_NEXT|1600/2|12.023.A|0002029582|SG|5|ALN|3.0.K|0001523001|0001523171|A1 Meerstraat HILLGM : 16171";
    const m = parse(line).?;
    try testing.expectEqual(@as(usize, 3), m.caps_n);
    try testing.expectEqualStrings("0002029582", m.caps[0]);
    try testing.expectEqualStrings("0001523001", m.caps[1]);
    try testing.expectEqualStrings("0001523171", m.caps[2]);
    try testing.expectEqualStrings("A1 Meerstraat HILLGM : 16171", m.body);
}

test "parse empty-body control frame" {
    const line = "FLEX_NEXT|1600/2|14.110.A|0002029569|SG|5|ALN|3.1.F|";
    const m = parse(line).?;
    try testing.expectEqual(@as(usize, 1), m.caps_n);
    try testing.expectEqualStrings("", m.body);
}

test "body containing a colon and digits is not eaten as capcode" {
    const line = "FLEX_NEXT|1600/2|13.042.A|0001530875|SS|5|ALN|3.0.K|Prio 1 Escamplaan Platinaweg SGRAVH Ongeval wegvervoer letsel";
    const m = parse(line).?;
    try testing.expectEqual(@as(usize, 1), m.caps_n);
    try testing.expectEqualStrings("Prio 1 Escamplaan Platinaweg SGRAVH Ongeval wegvervoer letsel", m.body);
}

test "reject non-FLEX line" {
    try testing.expect(parse("Enabled demodulators: FLEX_NEXT") == null);
    try testing.expect(parse("") == null);
    try testing.expect(parse("POCSAG1200: Address: 1234") == null);
}

test "toJson emits valid envelope with escaping" {
    const line = "FLEX_NEXT|1600/2|14.080.A|0002029583|SG|5|ALN|3.0.K|0001420185|0001420999|B2 AMBU 1729*!Kleiweg 3045PM Rotterdam ROTTDM bon 114439";
    const m = parse(line).?;
    var buf: [2048]u8 = undefined;
    const json = toJson(m, 1690120105000, &buf).?;
    // Spot-check key fragments.
    try testing.expect(std.mem.indexOf(u8, json, "\"ts_ms\":1690120105000") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\"baud\":1600") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\"capcodes\":[\"0002029583\",\"0001420185\",\"0001420999\"]") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\"flag\":\"SG\"") != null);
    // Body copied verbatim (the * and ! are legal JSON string content).
    try testing.expect(std.mem.indexOf(u8, json, "B2 AMBU 1729*!Kleiweg 3045PM Rotterdam ROTTDM bon 114439") != null);
}

test "toJson escapes quotes and backslashes" {
    // Synthesize a message whose body has characters needing escapes.
    var m = parse("FLEX_NEXT|1600/2|00.001.A|0000000001|SS|5|ALN|3.0.K|x").?;
    m.body = "he said \"hi\"\\done\n";
    var buf: [512]u8 = undefined;
    const json = toJson(m, 0, &buf).?;
    try testing.expect(std.mem.indexOf(u8, json, "\\\"hi\\\"") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\\\\done") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\\n") != null);
}

test "toJson overflow returns null" {
    const m = parse("FLEX_NEXT|1600/2|00.001.A|0000000001|SS|5|ALN|3.0.K|hello world").?;
    var tiny: [8]u8 = undefined;
    try testing.expect(toJson(m, 0, &tiny) == null);
}
