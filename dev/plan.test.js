"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../plan.js");
const M = require("../model.js");

test("examples are valid plans that survive a JSON round trip", () => {
  for (const id of P.EXAMPLE_IDS) {
    const p = P.example(id);
    const again = P.normalizePlan(JSON.parse(JSON.stringify(p)));
    assert.ok(again, id);
    assert.equal(again.nodes.length, p.nodes.length); assert.equal(again.links.length, p.links.length); assert.equal(again.flows.length, p.flows.length);
  }
});

test("radio example: the 100 Mbps codec link is above the 70 % threshold, nothing is over capacity", () => {
  const r = M.computeLoads(P.example("radio"));
  assert.equal(r.summary.worstLink, "l6");
  assert.ok(r.summary.worstPct > 70 && r.summary.worstPct < 71);
  assert.equal(r.summary.warn, 1); assert.equal(r.summary.over, 0); assert.equal(r.summary.unreachable, 0);
});

test("studio example stays well below the threshold", () => {
  const r = M.computeLoads(P.example("studio"));
  assert.ok(r.summary.worstPct < 20); assert.equal(r.summary.warn + r.summary.over, 0);
});

test("normalizePlan rejects things that are not plans", () => {
  for (const bad of [null, 5, "x", {}, { nodes: [], links: [] }, { nodes: 1, links: [], flows: [] }]) assert.equal(P.normalizePlan(bad), null);
});

test("normalizePlan repairs bad references, duplicates and out-of-range values", () => {
  const p = P.normalizePlan({
    settings: { threshold: 500, wire: false, vlan: 1, snooping: false },
    nodes: [{ id: "a", name: "  A  ", type: "device" }, { id: "a", name: "dup" }, { id: "b", name: "B", type: "switch" }, { id: "bad id!", name: "x" }, { id: "c", name: "C", type: "weird" }],
    links: [{ id: "l1", a: "a", b: "b", speed: 1000 }, { id: "l2", a: "b", b: "a", speed: 100 }, { id: "l3", a: "a", b: "zzz", speed: 1000 }, { id: "l4", a: "a", b: "a", speed: 1000 }, { id: "l5", a: "b", b: "c", speed: 42 }],
    flows: [
      { id: "f1", mode: "dante", src: "a", cast: "unicast", dests: ["c", "a", "b", "nope", "c"], ch: 99999, fs: 12345, bits: 16, ptime: "zz", cps: 0, copies: -3 },
      { id: "f1", mode: "aes67" }, { id: "f2", mode: "aes67", src: "b", bits: 16, fs: 96000, ptime: "custom", samples: 5000 }
    ]
  });
  assert.equal(p.settings.threshold, 100); assert.equal(p.settings.wire, false); assert.equal(p.settings.vlan, true); assert.equal(p.settings.snooping, false);
  assert.deepEqual(p.nodes.map((n) => n.id), ["a", "b", "c"]);
  assert.equal(p.nodes[0].name, "A"); assert.equal(p.nodes[2].type, "device");
  assert.deepEqual(p.links.map((l) => [l.id, l.speed]), [["l1", 1000], ["l5", 1000]]);       // reverse duplicate, dangling, self link dropped; bad speed -> 1 G
  assert.equal(p.flows.length, 2);
  const f1 = p.flows[0];
  assert.equal(f1.bits, 24);                                   // Dante is always 24 bit
  assert.deepEqual(f1.dests, ["c"]);                           // only valid devices, no source, no switches, no duplicates
  assert.equal(f1.ch, P.LIMITS.channels); assert.equal(f1.fs, 48000); assert.equal(f1.ptime, "1000"); assert.equal(f1.cps, 1); assert.equal(f1.copies, 1);
  assert.equal(p.flows[1].src, "");                            // a switch cannot be a source
  assert.equal(p.flows[1].samples, P.LIMITS.samples);
});

test("nextId continues after the highest existing number", () => {
  assert.equal(P.nextId("n", [{ id: "n1" }, { id: "n7" }, { id: "x3" }]), "n8");
  assert.equal(P.nextId("f", []), "f1");
});

test("autoLayout places every node inside the drawing area and keeps manual positions", () => {
  const p = P.example("radio");
  p.nodes[3].manual = true; p.nodes[3].x = 77; p.nodes[3].y = 55;
  const h = P.autoLayout(p);
  assert.ok(h >= 140);
  for (const n of p.nodes) assert.ok(n.x >= 0 && n.x <= 1000 && n.y >= 0, n.name);
  assert.equal(p.nodes[3].x, 77); assert.equal(p.nodes[3].y, 55);
  const disconnected = P.emptyPlan();
  disconnected.nodes = [{ id: "a", name: "A", type: "device", x: 0, y: 0 }, { id: "b", name: "B", type: "device", x: 0, y: 0 }];
  P.autoLayout(disconnected);
  assert.notDeepEqual([disconnected.nodes[0].x, disconnected.nodes[0].y], [disconnected.nodes[1].x, disconnected.nodes[1].y]);
});

test("links carry a network (primary by default) and the redundant flag only applies to Dante", () => {
  const p = P.normalizePlan({
    nodes: [{ id: "a", name: "A", type: "device" }, { id: "b", name: "B", type: "switch" }],
    links: [{ id: "l1", a: "a", b: "b", speed: 1000 }, { id: "l2", a: "a", b: "b", speed: 1000, net: "secondary" }, { id: "l3", a: "b", b: "a", speed: 100, net: "secondary" }, { id: "l4", a: "a", b: "b", net: "weird" }],
    flows: [{ id: "f1", mode: "dante", src: "a", redundant: true }, { id: "f2", mode: "aes67", src: "a", redundant: true }]
  });
  assert.deepEqual(p.links.map((l) => [l.id, l.net]), [["l1", "primary"], ["l2", "secondary"]]);   // l3 duplicates l2, l4 duplicates l1
  assert.equal(p.flows[0].redundant, true); assert.equal(p.flows[1].redundant, false);
});

test("redundant example: two separate networks, redundant Dante flows, no rule violations", () => {
  const p = P.example("redundant");
  const r = M.computeLoads(P.normalizePlan(JSON.parse(JSON.stringify(p))));
  assert.equal(r.summary.unreachable, 0); assert.equal(r.summary.speedMismatch.length, 0); assert.equal(r.summary.sharedSwitches.length, 0);
  const secondary = p.links.filter((l) => l.net === "secondary");
  assert.equal(secondary.length, 3);
  assert.ok(secondary.some((l) => (r.links[l.id].ab.mbps + r.links[l.id].ba.mbps) > 0));
});
