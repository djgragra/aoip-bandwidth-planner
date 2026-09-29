"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../model.js");

const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: got ${a}, expected ${b} ±${tol}`);
const WIRE = { vlan: false, wire: true };

test("AES67 max channels per stream reproduces the published table (RAVENNA / AES67, Table 2)", () => {
  const rows = [
    ["L24 48k 125us", 3, 6, 80], ["L16 48k 250us", 2, 12, 60], ["L24 48k 250us", 3, 12, 40],
    ["L24 48k 333us", 3, 16, 30], ["L24 96k 250us", 3, 24, 20], ["L24 48k 1ms", 3, 48, 10], ["L24 48k 4ms", 3, 192, 2]
  ];
  for (const [name, bytes, samples, expected] of rows) assert.equal(M.maxChannelsPerStream(bytes, samples), expected, name);
});

test("AES67 samples per packet follow the packet-time table (44.1 kHz uses the 48 kHz counts)", () => {
  assert.equal(M.samplesPerPacket(48000, "1000"), 48);
  assert.equal(M.samplesPerPacket(44100, "1000"), 48);
  assert.equal(M.samplesPerPacket(96000, "1000"), 96);
  assert.equal(M.samplesPerPacket(48000, "125"), 6);
  assert.equal(M.samplesPerPacket(96000, "333"), 32);
  assert.equal(M.samplesPerPacket(48000, "4000"), 192);
  assert.equal(M.samplesPerPacket(48000, "custom", 24), 24);
});

test("overhead: RTP 12 + UDP 8 + IPv4 20 + Ethernet (header 14, FCS 4, preamble/SFD 8, IFG 12)", () => {
  assert.equal(M.overheadBytes({ vlan: false, wire: true }), 78);
  assert.equal(M.overheadBytes({ vlan: false, wire: false }), 58);
  assert.equal(M.overheadBytes({ vlan: true, wire: true }), 82);
});

test("worked example: 8 ch, 48 kHz, L24, 1 ms = 1152 B payload, 1230 B on the wire, 9.84 Mbps", () => {
  const s = M.aes67Stream(8, 48000, 3, 48, WIRE);
  assert.equal(s.payload, 1152); assert.equal(s.packet, 1230); assert.equal(s.pps, 1000);
  near(s.mbps, 9.84, 1e-9, "mbps"); near(s.audioMbps, 9.216, 1e-9, "audio");
  near(M.aes67Stream(8, 48000, 3, 48, { vlan: false, wire: false }).mbps, 9.68, 1e-9, "frame only");
});

test("44.1 kHz: same samples per packet, so the packet rate is 918.75 pps", () => {
  const f = M.aes67Flow({ ch: 2, fs: 44100, bits: 16, ptime: "1000", cps: 8 }, WIRE);
  near(f.streams[0].pps, 918.75, 1e-9, "pps");
});

test("channels are split into streams of at most cps channels", () => {
  const f = M.aes67Flow({ ch: 20, fs: 48000, bits: 24, ptime: "1000", cps: 8 }, WIRE);
  assert.deepEqual(f.streams.map((s) => s.channels), [8, 8, 4]);
  const one = M.aes67Flow({ ch: 2, fs: 48000, bits: 24, ptime: "1000", cps: 8 }, WIRE);
  assert.equal(one.streams.length, 1);
});

test("channels per stream is capped by the 1440-byte payload limit", () => {
  const f = M.aes67Flow({ ch: 8, fs: 48000, bits: 24, ptime: "4000", cps: 8 }, WIRE);
  assert.equal(f.channelsPerStream, 2);
  assert.deepEqual(f.streams.map((s) => s.channels), [2, 2, 2, 2]);
  assert.ok(f.warnings.includes("cpsLimited"));
  const big = M.aes67Flow({ ch: 1, fs: 96000, bits: 24, ptime: "custom", samples: 1000, cps: 1 }, WIRE);
  assert.equal(big.valid, false);
});

test("short packet times cost more overhead than long ones", () => {
  const mbps = (ptime, cps = 8) => M.aes67Flow({ ch: 8, fs: 48000, bits: 24, ptime, cps }, WIRE).mbps;
  near(mbps("125"), 14.208, 1e-9, "125 us");     // 6 samples: payload 144 B, 222 B on the wire, 8000 pps
  near(mbps("1000"), 9.84, 1e-9, "1 ms");
  assert.ok(mbps("125") > mbps("250") && mbps("250") > mbps("333") && mbps("333") > mbps("1000"));
});

test("Dante estimate: Audinate's figures (6 Mbps per 4-channel unicast flow, 1.5 Mbps per multicast channel)", () => {
  const u = (ch, fs = 48000) => M.danteFlow({ ch, fs, cast: "unicast" }).mbps;
  assert.equal(u(4), 6); assert.equal(u(1), 6); assert.equal(u(5), 12);
  assert.equal(u(64), 96);                       // Audinate: 64 channels ~ 100 Mbps
  assert.equal(M.danteFlow({ ch: 8, fs: 48000, cast: "multicast" }).mbps, 12);
  assert.equal(u(4, 96000), 12);
  near(u(4, 44100), 6 * 44100 / 48000, 1e-9, "44.1");
});

test("Dante estimate stays within 3 % of the Glensound measurements (Brooklyn, 48/96 kHz)", () => {
  const measured = { 48000: { 8: 47, 16: 94, 32: 189 }, 96000: { 8: 94, 16: 189, 32: 379 } };
  for (const fs of [48000, 96000]) for (const flows of [8, 16, 32]) {
    const est = M.danteFlow({ ch: flows * 4, fs, cast: "unicast" }).mbps;
    assert.ok(Math.abs(est - measured[fs][flows]) / measured[fs][flows] < 0.03, `${fs} ${flows} flows: ${est}`);
  }
});

// ---- topology ----
function plan(extra) {
  const base = {
    settings: { threshold: 70, vlan: false, wire: true, snooping: true },
    nodes: [
      { id: "A", name: "A", type: "device" }, { id: "S1", name: "S1", type: "switch" },
      { id: "S2", name: "S2", type: "switch" }, { id: "B", name: "B", type: "device" }, { id: "C", name: "C", type: "device" }
    ],
    links: [
      { id: "l1", a: "A", b: "S1", speed: 1000 }, { id: "l2", a: "S1", b: "S2", speed: 100 },
      { id: "l3", a: "S2", b: "B", speed: 1000 }, { id: "l4", a: "S2", b: "C", speed: 1000 }
    ],
    flows: []
  };
  return Object.assign(base, extra || {});
}
const dante = (o) => Object.assign({ id: "f1", mode: "dante", src: "A", cast: "unicast", dests: ["B"], ch: 8, fs: 48000, bits: 24, ptime: "1000", cps: 8, copies: 1 }, o);

test("unicast load follows the path in the right direction only", () => {
  const r = M.computeLoads(plan({ flows: [dante()] }));
  assert.equal(r.links.l1.ab.mbps, 12); assert.equal(r.links.l1.ba.mbps, 0);
  assert.equal(r.links.l2.ab.mbps, 12); assert.equal(r.links.l3.ab.mbps, 12);
  assert.equal(r.links.l4.ab.mbps, 0);
});

test("unicast to several receivers duplicates the flow on shared links", () => {
  const r = M.computeLoads(plan({ flows: [dante({ dests: ["B", "C"] })] }));
  assert.equal(r.links.l2.ab.mbps, 24);
  assert.equal(r.links.l3.ab.mbps, 12); assert.equal(r.links.l4.ab.mbps, 12);
});

test("multicast is carried once per link; snooping off floods every reachable link", () => {
  const f = dante({ cast: "multicast", dests: ["B"] });
  const on = M.computeLoads(plan({ flows: [f] }));
  assert.equal(on.links.l2.ab.mbps, 12); assert.equal(on.links.l4.ab.mbps, 0);
  const off = M.computeLoads(plan({ flows: [f], settings: { threshold: 70, vlan: false, wire: true, snooping: false } }));
  assert.equal(off.links.l4.ab.mbps, 12);      // flooded to C as well
  assert.equal(off.links.l1.ba.mbps, 0);
});

test("copies multiply the flow", () => {
  const r = M.computeLoads(plan({ flows: [dante({ copies: 3 })] }));
  assert.equal(r.links.l1.ab.mbps, 36);
});

test("threshold states: ok / warn above threshold / over capacity", () => {
  // link l2 is 100 Mbps and every copy of the flow adds 12 Mbps
  const st = (n) => M.computeLoads(plan({ flows: [dante({ copies: n })] })).links.l2.ab.state;
  assert.equal(st(1), "ok");
  assert.equal(st(5), "ok");      // 60 %
  assert.equal(st(6), "warn");    // 72 % > 70 %
  assert.equal(st(8), "warn");    // 96 %
  assert.equal(st(9), "over");    // 108 %
  const s = M.computeLoads(plan({ flows: [dante({ copies: 9 })] })).summary;
  assert.equal(s.worstLink, "l2"); assert.ok(s.over >= 1);
});

test("unreachable receivers are reported; loops are detected", () => {
  const p = plan({ flows: [dante({ dests: ["B"] })] });
  p.links = p.links.filter((l) => l.id !== "l2");
  const r = M.computeLoads(p);
  assert.equal(r.summary.unreachable, 1);
  const loop = plan();
  loop.links.push({ id: "l5", a: "S1", b: "S2", speed: 1000 });
  assert.equal(M.computeLoads(loop).summary.loops, true);
  assert.equal(M.computeLoads(plan()).summary.loops, false);
});

test("AES67 flow through the planner: 8 ch 1 ms multicast adds 9.84 Mbps on the path", () => {
  const f = { id: "f2", mode: "aes67", src: "A", cast: "multicast", dests: ["B"], ch: 8, fs: 48000, bits: 24, ptime: "1000", cps: 8, copies: 1 };
  const r = M.computeLoads(plan({ flows: [f] }));
  near(r.links.l1.ab.mbps, 9.84, 1e-9, "l1"); near(r.links.l2.ab.pct, 9.84, 1e-9, "pct on 100M");
});

// ---- Dante redundancy (Dante Controller User Guide: two separate networks, same audio on both, same link speed) ----
function redundantPlan(flowOverrides, mutate) {
  const p = {
    settings: { threshold: 70, vlan: false, wire: true, snooping: true },
    nodes: [
      { id: "S1", name: "P switch", type: "switch" }, { id: "S2", name: "S switch", type: "switch" },
      { id: "A", name: "A", type: "device" }, { id: "B", name: "B", type: "device" }
    ],
    links: [
      { id: "p1", a: "A", b: "S1", speed: 1000, net: "primary" }, { id: "p2", a: "B", b: "S1", speed: 1000, net: "primary" },
      { id: "s1", a: "A", b: "S2", speed: 1000, net: "secondary" }, { id: "s2", a: "B", b: "S2", speed: 1000, net: "secondary" }
    ],
    flows: [Object.assign({ id: "f1", mode: "dante", src: "A", cast: "unicast", dests: ["B"], ch: 8, fs: 48000, bits: 24, ptime: "1000", cps: 8, copies: 1, redundant: true }, flowOverrides || {})]
  };
  if (mutate) mutate(p);
  return p;
}

test("a redundant Dante flow is counted once on each network", () => {
  const r = M.computeLoads(redundantPlan());
  for (const id of ["p1", "p2", "s1", "s2"]) assert.equal(r.links[id][id.endsWith("1") ? "ab" : "ba"].mbps, 12, id);
  assert.equal(r.links.s1.ba.mbps, 0);
});

test("without the redundant option only the primary network carries the flow", () => {
  const r = M.computeLoads(redundantPlan({ redundant: false }));
  assert.equal(r.links.p1.ab.mbps, 12); assert.equal(r.links.s1.ab.mbps, 0); assert.equal(r.links.s2.ba.mbps, 0);
});

test("AES67 flows are never duplicated on the secondary network", () => {
  const r = M.computeLoads(redundantPlan({ mode: "aes67", redundant: true }));
  assert.ok(r.links.p1.ab.mbps > 0); assert.equal(r.links.s1.ab.mbps, 0);
});

test("the two networks are routed separately: no path on the secondary network is reported", () => {
  const r = M.computeLoads(redundantPlan({}, (p) => { p.links = p.links.filter((l) => l.id !== "s2"); }));
  assert.equal(r.summary.unreachable, 1);
  assert.equal(r.flows[0].receivers.filter((x) => x.net === "secondary" && !x.hops).length, 1);
  assert.equal(r.flows[0].receivers.filter((x) => x.net === "primary" && x.hops).length, 1);
});

test("a switch that has both a primary and a secondary link is reported as shared between the networks", () => {
  const p = redundantPlan({}, (pl) => { pl.links.push({ id: "x", a: "S1", b: "S2", speed: 1000, net: "primary" }); });
  const r = M.computeLoads(p);
  assert.deepEqual(r.summary.sharedSwitches, ["S2"]);   // S2 carries the secondary links and now also a primary one
});

test("redundancy rules: same link speed on both interfaces, and no switch shared by the two networks", () => {
  assert.deepEqual(M.computeLoads(redundantPlan()).summary.speedMismatch, []);
  assert.deepEqual(M.computeLoads(redundantPlan()).summary.sharedSwitches, []);
  const mismatch = M.computeLoads(redundantPlan({}, (p) => { p.links.find((l) => l.id === "s1").speed = 100; }));
  assert.deepEqual(mismatch.summary.speedMismatch, ["A"]);
  const plain = M.computeLoads(redundantPlan({ redundant: false }, (p) => { p.links.find((l) => l.id === "s1").speed = 100; }));
  assert.deepEqual(plain.summary.speedMismatch, []);                // only checked for devices used by redundant flows
});

test("loops are detected per network", () => {
  const p = redundantPlan({}, (pl) => { pl.links.push({ id: "s3", a: "A", b: "B", speed: 1000, net: "secondary" }); });
  assert.equal(M.computeLoads(p).summary.loops, true);
  assert.equal(M.computeLoads(redundantPlan()).summary.loops, false);
});
