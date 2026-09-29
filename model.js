/* AoIP Bandwidth Planner — bandwidth model and network routing (pure functions, no DOM).
   © 2026 Graziano Melzi · OnAir Garage — MIT License

   Two calculation models:
   - "aes67": RTP streams as defined by AES67. Exact: payload = channels x samples x bytes,
     plus RTP 12 + UDP 8 + IPv4 20 bytes, plus Ethernet framing. Max RTP payload 1440 bytes.
   - "dante": Dante's own protocol is proprietary, so this is an ESTIMATE scaled from the figures
     Audinate publishes (about 6 Mbps per unicast flow of up to 4 channels, about 1.5 Mbps per
     multicast channel, both at 48 kHz / 24 bit). See README for sources.
   Sources and validation: README.md ("Formulas and sources", "Validation and references"). */
(function (root) {
  "use strict";

  // ---- constants -----------------------------------------------------------
  var AES67 = { MAX_PAYLOAD: 1440, RTP: 12, UDP: 8, IPV4: 20 };
  var ETH = { HEADER: 14, FCS: 4, PREAMBLE_SFD: 8, IFG: 12, VLAN: 4 };
  // AES67 samples per packet. At 44.1 kHz the counts equal those at 48 kHz (AES67 table),
  // so the real packet time at 44.1 kHz is slightly longer than nominal.
  var PACKET_TIMES = [
    { id: "125", nominalUs: 125, samples: { 44100: 6, 48000: 6, 96000: 12 } },
    { id: "250", nominalUs: 250, samples: { 44100: 12, 48000: 12, 96000: 24 } },
    { id: "333", nominalUs: 333.33, samples: { 44100: 16, 48000: 16, 96000: 32 } },
    { id: "1000", nominalUs: 1000, samples: { 44100: 48, 48000: 48, 96000: 96 } },
    { id: "4000", nominalUs: 4000, samples: { 44100: 192, 48000: 192, 96000: 384 } }
  ];
  var DANTE = {
    UNICAST_FLOW_MBPS: 6,      // "about 6 Mbps per typical unicast audio flow" (4 ch, 16 samples/ch, 48 kHz, 24 bit)
    UNICAST_FLOW_CHANNELS: 4,
    MULTICAST_CH_MBPS: 1.5,    // "about 1.5 Mbps per channel" for multicast flows
    REF_RATE: 48000,
    TYPICAL_SAMPLES: 16
  };
  var LINK_SPEEDS = [100, 1000, 10000];   // Mbps, nominal line rate

  // ---- AES67 -----------------------------------------------------------------
  function samplesPerPacket(fs, ptimeId, customSamples) {
    if (ptimeId === "custom") return Math.max(1, Math.round(customSamples || 1));
    for (var i = 0; i < PACKET_TIMES.length; i++) {
      if (PACKET_TIMES[i].id === ptimeId) return PACKET_TIMES[i].samples[fs] || 0;
    }
    return 0;
  }

  // Bytes added to every RTP payload: RTP + UDP + IPv4, plus Ethernet framing.
  // wire=true counts preamble + SFD + inter-frame gap (the real load on the link).
  function overheadBytes(opts) {
    var eth = ETH.HEADER + ETH.FCS + (opts.vlan ? ETH.VLAN : 0) + (opts.wire ? ETH.PREAMBLE_SFD + ETH.IFG : 0);
    return AES67.RTP + AES67.UDP + AES67.IPV4 + eth;
  }

  function maxChannelsPerStream(bytes, samples) {
    return Math.floor(AES67.MAX_PAYLOAD / (samples * bytes));
  }

  // One RTP stream carrying `ch` channels.
  function aes67Stream(ch, fs, bytes, samples, opts) {
    var payload = ch * samples * bytes;
    var packet = payload + overheadBytes(opts);
    var pps = fs / samples;
    return {
      channels: ch, payload: payload, packet: packet, pps: pps,
      packetTimeUs: (samples / fs) * 1e6,
      mbps: packet * 8 * pps / 1e6,
      audioMbps: payload * 8 * pps / 1e6
    };
  }

  // A flow of `cfg.ch` channels split into streams of at most `cfg.cps` channels
  // (and never more than the 1440-byte payload limit allows).
  function aes67Flow(cfg, opts) {
    var bytes = cfg.bits / 8, samples = samplesPerPacket(cfg.fs, cfg.ptime, cfg.samples);
    var out = { model: "aes67", valid: true, streams: [], samplesPerPacket: samples, warnings: [] };
    if (!samples || !(cfg.ch >= 1)) { out.valid = false; return out; }
    var maxCh = maxChannelsPerStream(bytes, samples);
    if (maxCh < 1) {
      out.valid = false;
      out.warnings.push("payloadTooLarge");
      return out;
    }
    var cps = Math.max(1, Math.min(cfg.cps || 8, maxCh));
    if (cfg.cps && cfg.cps > maxCh) out.warnings.push("cpsLimited");
    out.maxChannels = maxCh; out.channelsPerStream = cps;
    var left = cfg.ch;
    while (left > 0) {
      var n = Math.min(cps, left);
      out.streams.push(aes67Stream(n, cfg.fs, bytes, samples, opts));
      left -= n;
    }
    out.mbps = out.streams.reduce(function (s, x) { return s + x.mbps; }, 0);
    out.pps = out.streams.reduce(function (s, x) { return s + x.pps; }, 0);
    out.audioMbps = out.streams.reduce(function (s, x) { return s + x.audioMbps; }, 0);
    if (cfg.ch > 8 && cps > 8) out.warnings.push("moreThan8");
    return out;
  }

  // ---- Dante (estimate) -------------------------------------------------------
  // Unicast: one flow carries up to 4 channels and always costs a full flow, even for 1 channel.
  // Multicast: cost grows with the channel count. Both scale linearly with the sample rate.
  function danteFlow(cfg) {
    var scale = cfg.fs / DANTE.REF_RATE, out = { model: "dante", valid: true, estimate: true, warnings: [] };
    if (!(cfg.ch >= 1)) { out.valid = false; return out; }
    if (cfg.cast === "multicast") {
      out.flows = 1;
      out.mbps = cfg.ch * DANTE.MULTICAST_CH_MBPS * scale;
      out.pps = null;
    } else {
      out.flows = Math.ceil(cfg.ch / DANTE.UNICAST_FLOW_CHANNELS);
      out.mbps = out.flows * DANTE.UNICAST_FLOW_MBPS * scale;
      out.pps = out.flows * cfg.fs / DANTE.TYPICAL_SAMPLES;    // typical 16 samples per channel per packet
    }
    if (cfg.fs !== 48000) out.warnings.push("danteRateScaled");
    return out;
  }

  // Bandwidth of one flow toward ONE receiver (unicast) or of the single multicast flow.
  function flowBandwidth(cfg, opts) {
    return cfg.mode === "dante" ? danteFlow(cfg) : aes67Flow(cfg, opts);
  }

  // ---- topology ---------------------------------------------------------------
  function buildGraph(nodes, links) {
    var adj = {};
    nodes.forEach(function (n) { adj[n.id] = []; });
    links.forEach(function (l) {
      if (adj[l.a] && adj[l.b] && l.a !== l.b) {
        adj[l.a].push({ link: l.id, to: l.b });
        adj[l.b].push({ link: l.id, to: l.a });
      }
    });
    return adj;
  }

  // Breadth-first search from src; parent[node] = { link, from }.
  function bfsTree(adj, src) {
    var parent = {}, seen = {}, queue = [src];
    seen[src] = true;
    while (queue.length) {
      var cur = queue.shift();
      (adj[cur] || []).forEach(function (e) {
        if (!seen[e.to]) { seen[e.to] = true; parent[e.to] = { link: e.link, from: cur }; queue.push(e.to); }
      });
    }
    return { parent: parent, seen: seen };
  }

  // Hops from src to dst as [{ link, from, to }], or null when unreachable.
  function pathFrom(tree, src, dst) {
    if (src === dst) return [];
    if (!tree.seen[dst]) return null;
    var hops = [], cur = dst;
    while (cur !== src) {
      var p = tree.parent[cur];
      hops.unshift({ link: p.link, from: p.from, to: cur });
      cur = p.from;
    }
    return hops;
  }

  function componentCount(nodes, adj) {
    var seen = {}, count = 0;
    nodes.forEach(function (n) {
      if (seen[n.id]) return;
      count++;
      var stack = [n.id]; seen[n.id] = true;
      while (stack.length) {
        var c = stack.pop();
        (adj[c] || []).forEach(function (e) { if (!seen[e.to]) { seen[e.to] = true; stack.push(e.to); } });
      }
    });
    return count;
  }

  // ---- load computation ---------------------------------------------------------
  /* computeLoads(plan) -> {
       links: { linkId: { capacity, ab: dir, ba: dir } }   dir = { mbps, pps, pct, state, items: [...] }
       flows: [ { id, calc, receivers: [{ node, hops|null }], ... } ]
       summary: { worstPct, worstLink, warn, over, loops, unreachable } } */
  function computeLoads(plan) {
    var s = plan.settings, opts = { vlan: !!s.vlan, wire: s.wire !== false };
    var nodeById = {}, linkById = {};
    plan.nodes.forEach(function (n) { nodeById[n.id] = n; });
    plan.links.forEach(function (l) { linkById[l.id] = l; });
    var adj = buildGraph(plan.nodes, plan.links);

    var res = { links: {}, flows: [], summary: { worstPct: 0, worstLink: null, warn: 0, over: 0, loops: false, unreachable: 0 } };
    plan.links.forEach(function (l) {
      res.links[l.id] = { capacity: l.speed, ab: dirInit(), ba: dirInit() };
    });
    function dirInit() { return { mbps: 0, pps: 0, pct: 0, state: "ok", items: [] }; }
    res.summary.loops = plan.links.length > plan.nodes.length - componentCount(plan.nodes, adj);

    function add(hop, flow, mbps, pps, streams) {
      var l = linkById[hop.link], d = res.links[hop.link][hop.from === l.a ? "ab" : "ba"];
      d.mbps += mbps; d.pps += pps || 0;
      var item = null;
      for (var i = 0; i < d.items.length; i++) if (d.items[i].flow === flow.id) item = d.items[i];
      if (!item) { item = { flow: flow.id, mbps: 0, pps: 0, streams: 0 }; d.items.push(item); }
      item.mbps += mbps; item.pps += pps || 0; item.streams += streams || 0;
    }

    plan.flows.forEach(function (f) {
      var copies = Math.max(1, Math.round(f.copies || 1));
      var calc = flowBandwidth(f, opts);
      var entry = { id: f.id, calc: calc, receivers: [], copies: copies, unreachable: 0 };
      res.flows.push(entry);
      var src = nodeById[f.src];
      if (!calc.valid || !src) return;
      var tree = bfsTree(adj, f.src);
      var dests = (f.dests || []).filter(function (d) { return nodeById[d] && d !== f.src; });
      var streams = calc.streams ? calc.streams.length : (calc.flows || 1);
      var perPps = calc.pps || 0;

      if (f.cast === "multicast") {
        var used = {};
        if (s.snooping) {
          dests.forEach(function (d) {
            var hops = pathFrom(tree, f.src, d);
            entry.receivers.push({ node: d, hops: hops });
            if (!hops) { entry.unreachable++; return; }
            hops.forEach(function (h) { used[h.link + ">" + h.from] = h; });
          });
        } else {
          // no IGMP snooping: the flow is flooded to every link reachable from the source
          Object.keys(tree.parent).forEach(function (n) {
            var p = tree.parent[n]; used[p.link + ">" + p.from] = { link: p.link, from: p.from, to: n };
          });
          dests.forEach(function (d) { entry.receivers.push({ node: d, hops: pathFrom(tree, f.src, d) }); });
          entry.unreachable = entry.receivers.filter(function (r) { return !r.hops; }).length;
        }
        Object.keys(used).forEach(function (k) { add(used[k], f, calc.mbps * copies, perPps * copies, streams * copies); });
      } else {
        dests.forEach(function (d) {
          var hops = pathFrom(tree, f.src, d);
          entry.receivers.push({ node: d, hops: hops });
          if (!hops) { entry.unreachable++; return; }
          hops.forEach(function (h) { add(h, f, calc.mbps * copies, perPps * copies, streams * copies); });
        });
      }
      res.summary.unreachable += entry.unreachable;
    });

    plan.links.forEach(function (l) {
      ["ab", "ba"].forEach(function (k) {
        var d = res.links[l.id][k];
        d.pct = d.mbps / l.speed * 100;
        d.state = d.pct > 100 ? "over" : (d.pct > s.threshold ? "warn" : "ok");
        if (d.state === "over") res.summary.over++; else if (d.state === "warn") res.summary.warn++;
        if (d.pct > res.summary.worstPct) { res.summary.worstPct = d.pct; res.summary.worstLink = l.id; }
      });
    });
    return res;
  }

  var api = {
    AES67: AES67, ETH: ETH, PACKET_TIMES: PACKET_TIMES, DANTE: DANTE, LINK_SPEEDS: LINK_SPEEDS,
    samplesPerPacket: samplesPerPacket, overheadBytes: overheadBytes, maxChannelsPerStream: maxChannelsPerStream,
    aes67Stream: aes67Stream, aes67Flow: aes67Flow, danteFlow: danteFlow, flowBandwidth: flowBandwidth,
    buildGraph: buildGraph, bfsTree: bfsTree, pathFrom: pathFrom, computeLoads: computeLoads
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AoipModel = api;
})(typeof self !== "undefined" ? self : this);
