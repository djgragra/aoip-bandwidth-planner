/* AoIP Bandwidth Planner — plan data: defaults, validation (import), examples, layout.
   © 2026 Graziano Melzi · OnAir Garage — MIT License */
(function (root) {
  "use strict";

  var M = typeof require !== "undefined" && typeof module !== "undefined" ? require("./model.js") : root.AoipModel;
  var RATES = [44100, 48000, 96000];
  var PTIMES = ["125", "250", "333", "1000", "4000", "custom"];
  var LIMITS = { nameLen: 24, nodes: 60, links: 120, flows: 80, channels: 512, copies: 999, cps: 64, samples: 1440 };
  var FLOW_COLORS = 10;

  function defaultSettings() { return { threshold: 70, wire: true, vlan: false, snooping: true }; }
  function emptyPlan() { return { v: 1, settings: defaultSettings(), nodes: [], links: [], flows: [] }; }

  function clampInt(v, lo, hi, dflt) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  }
  function str(v, dflt) {
    var s = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
    return (s || dflt).slice(0, LIMITS.nameLen);
  }

  function newFlow(id, src, colorIdx) {
    return { id: id, name: "", mode: "aes67", src: src || "", cast: "multicast", dests: [], ch: 8, fs: 48000, bits: 24,
             ptime: "1000", samples: 48, cps: 8, copies: 1, color: colorIdx || 0 };
  }

  // Validates and repairs an arbitrary object (imported JSON or stored plan). Returns a new plan or null.
  function normalizePlan(input) {
    if (!input || typeof input !== "object" || !Array.isArray(input.nodes) || !Array.isArray(input.links) || !Array.isArray(input.flows)) return null;
    var p = emptyPlan(), s = input.settings || {};
    p.settings = {
      threshold: clampInt(s.threshold, 1, 100, 70),
      wire: s.wire !== false, vlan: !!s.vlan, snooping: s.snooping !== false
    };
    var ids = {};
    input.nodes.slice(0, LIMITS.nodes).forEach(function (n, i) {
      if (!n || typeof n.id !== "string" || ids[n.id] || !/^[A-Za-z0-9_-]{1,16}$/.test(n.id)) return;
      ids[n.id] = true;
      p.nodes.push({
        id: n.id, name: str(n.name, "Node " + (i + 1)), type: n.type === "switch" ? "switch" : "device",
        x: isFinite(n.x) ? Number(n.x) : 0, y: isFinite(n.y) ? Number(n.y) : 0, manual: !!n.manual
      });
    });
    var lids = {}, pairs = {};
    input.links.slice(0, LIMITS.links).forEach(function (l) {
      if (!l || typeof l.id !== "string" || lids[l.id] || !/^[A-Za-z0-9_-]{1,16}$/.test(l.id)) return;
      if (!ids[l.a] || !ids[l.b] || l.a === l.b) return;
      var key = [l.a, l.b].sort().join("|");
      if (pairs[key]) return;                                   // one link per pair of nodes
      lids[l.id] = true; pairs[key] = true;
      p.links.push({ id: l.id, a: l.a, b: l.b, speed: M.LINK_SPEEDS.indexOf(Number(l.speed)) >= 0 ? Number(l.speed) : 1000 });
    });
    var fids = {}, isDev = {};
    p.nodes.forEach(function (n) { isDev[n.id] = n.type === "device"; });
    input.flows.slice(0, LIMITS.flows).forEach(function (f, i) {
      if (!f || typeof f.id !== "string" || fids[f.id] || !/^[A-Za-z0-9_-]{1,16}$/.test(f.id)) return;
      fids[f.id] = true;
      var mode = f.mode === "dante" ? "dante" : "aes67";
      var flow = {
        id: f.id, name: str(f.name, ""), mode: mode, src: isDev[f.src] ? f.src : "",
        cast: f.cast === "unicast" ? "unicast" : "multicast",
        dests: (Array.isArray(f.dests) ? f.dests : []).filter(function (d, k, a) { return isDev[d] && d !== f.src && a.indexOf(d) === k; }),
        ch: clampInt(f.ch, 1, LIMITS.channels, 8),
        fs: RATES.indexOf(Number(f.fs)) >= 0 ? Number(f.fs) : 48000,
        bits: mode === "dante" ? 24 : (Number(f.bits) === 16 ? 16 : 24),
        ptime: PTIMES.indexOf(f.ptime) >= 0 ? f.ptime : "1000",
        samples: clampInt(f.samples, 1, LIMITS.samples, 48),
        cps: clampInt(f.cps, 1, LIMITS.cps, 8),
        copies: clampInt(f.copies, 1, LIMITS.copies, 1),
        color: clampInt(f.color, 0, FLOW_COLORS - 1, i % FLOW_COLORS)
      };
      p.flows.push(flow);
    });
    return p;
  }

  function nextId(prefix, list) {
    var max = 0;
    list.forEach(function (x) {
      var m = new RegExp("^" + prefix + "(\\d+)$").exec(x.id);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return prefix + (max + 1);
  }

  // ---- automatic layout (layered, breadth-first from the best-connected switch) -------------
  var W = 1000, ROW = 170, TOP = 70;
  function autoLayout(plan) {
    var adj = M.buildGraph(plan.nodes, plan.links), deg = {};
    plan.nodes.forEach(function (n) { deg[n.id] = adj[n.id].length; });
    var order = plan.nodes.slice().sort(function (a, b) {
      var sa = a.type === "switch" ? 1 : 0, sb = b.type === "switch" ? 1 : 0;
      return sb - sa || deg[b.id] - deg[a.id];
    });
    var layer = {}, layers = [], placed = 0;
    order.forEach(function (root) {
      if (layer[root.id] !== undefined) return;
      var offset = layers.length ? layers.length : 0;      // each connected component starts below the previous one
      var queue = [root.id]; layer[root.id] = offset;
      while (queue.length) {
        var c = queue.shift();
        (layers[layer[c]] = layers[layer[c]] || []).push(c);
        adj[c].forEach(function (e) { if (layer[e.to] === undefined) { layer[e.to] = layer[c] + 1; queue.push(e.to); } });
      }
    });
    var byId = {}, pos = {};
    plan.nodes.forEach(function (n) { byId[n.id] = n; });
    layers.forEach(function (ids, li) {
      ids.sort(function (a, b) {
        var pa = 0, pb = 0;
        [[a, "a"], [b, "b"]].forEach(function (t) {
          var xs = adj[t[0]].filter(function (e) { return layer[e.to] === li - 1 && pos[e.to]; }).map(function (e) { return pos[e.to].x; });
          var avg = xs.length ? xs.reduce(function (s, x) { return s + x; }, 0) / xs.length : W / 2;
          if (t[1] === "a") pa = avg; else pb = avg;
        });
        return pa - pb || (byId[a].name < byId[b].name ? -1 : 1);
      });
      ids.forEach(function (id, i) { pos[id] = { x: Math.round((i + 1) / (ids.length + 1) * W), y: TOP + li * ROW }; });
    });
    plan.nodes.forEach(function (n) {
      if (!n.manual && pos[n.id]) { n.x = pos[n.id].x; n.y = pos[n.id].y; }
    });
    return TOP * 2 + Math.max(0, layers.length - 1) * ROW;   // suggested viewBox height
  }

  // ---- examples ------------------------------------------------------------------
  function F(id, name, mode, src, cast, dests, ch, fs, bits, ptime, color, extra) {
    var f = newFlow(id, src, color); f.name = name; f.mode = mode; f.cast = cast; f.dests = dests; f.ch = ch; f.fs = fs; f.bits = bits; f.ptime = ptime;
    Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; });
    return f;
  }
  function N(id, name, type) { return { id: id, name: name, type: type, x: 0, y: 0, manual: false }; }
  function L(id, a, b, speed) { return { id: id, a: a, b: b, speed: speed }; }

  var EXAMPLES = {
    studio: function () {
      var p = emptyPlan();
      p.nodes = [N("n1", "Switch", "switch"), N("n2", "Console", "device"), N("n3", "Stage box", "device"), N("n4", "Recorder", "device"), N("n5", "Laptop", "device")];
      p.links = [L("l1", "n1", "n2", 1000), L("l2", "n1", "n3", 1000), L("l3", "n1", "n4", 1000), L("l4", "n1", "n5", 100)];
      p.flows = [
        F("f1", "Stage box to console", "dante", "n3", "unicast", ["n2"], 32, 48000, 24, "1000", 0),
        F("f2", "Console to recorder", "dante", "n2", "unicast", ["n4"], 32, 48000, 24, "1000", 1),
        F("f3", "Monitor mix", "aes67", "n2", "multicast", ["n5"], 2, 48000, 24, "1000", 2)
      ];
      return p;
    },
    radio: function () {
      var p = emptyPlan();
      p.nodes = [N("n1", "Core switch", "switch"), N("n2", "Studio switch", "switch"), N("n3", "Playout", "device"), N("n4", "Studio 1 console", "device"),
                 N("n5", "Studio 2 console", "device"), N("n6", "Encoder", "device"), N("n7", "Codec", "device")];
      p.links = [L("l1", "n1", "n3", 1000), L("l2", "n1", "n6", 1000), L("l3", "n1", "n2", 1000), L("l4", "n2", "n4", 1000), L("l5", "n2", "n5", 1000), L("l6", "n1", "n7", 100)];
      p.flows = [
        F("f1", "Playout to consoles", "aes67", "n3", "multicast", ["n4", "n5"], 16, 48000, 24, "1000", 0),
        F("f2", "Console 1 mix-minus", "aes67", "n4", "multicast", ["n7"], 8, 48000, 24, "1000", 1),
        F("f3", "Console 2 mix-minus", "aes67", "n5", "multicast", ["n7"], 8, 48000, 24, "1000", 2),
        F("f4", "On-air feed", "dante", "n4", "unicast", ["n6"], 2, 48000, 24, "1000", 3),
        F("f5", "Backup feed", "dante", "n5", "unicast", ["n6"], 2, 48000, 24, "1000", 4),
        F("f6", "Codec returns (6 feeds)", "aes67", "n7", "multicast", ["n4", "n5"], 8, 48000, 24, "250", 5, { copies: 6 })
      ];
      return p;
    },
    empty: function () { return emptyPlan(); }
  };
  function example(id) {
    var p = (EXAMPLES[id] || EXAMPLES.empty)();
    autoLayout(p);
    return p;
  }

  var api = {
    LIMITS: LIMITS, RATES: RATES, PTIMES: PTIMES, FLOW_COLORS: FLOW_COLORS, EXAMPLE_IDS: Object.keys(EXAMPLES),
    emptyPlan: emptyPlan, defaultSettings: defaultSettings, newFlow: newFlow, normalizePlan: normalizePlan,
    nextId: nextId, autoLayout: autoLayout, example: example, LAYOUT_W: W
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AoipPlan = api;
})(typeof self !== "undefined" ? self : this);
