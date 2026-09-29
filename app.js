/* AoIP Bandwidth Planner — UI.
   © 2026 Graziano Melzi · OnAir Garage — MIT License */
(function () {
  "use strict";

  var VERSION = "2026.9.2";
  var STORE = "com.onairgarage.aoipplanner.";
  var Model = window.AoipModel, Plan = window.AoipPlan, I18n = window.AoipI18n, Diagram = window.AoipDiagram;

  function $(id) { return document.getElementById(id); }
  function load(key, fallback) { try { var v = localStorage.getItem(STORE + key); return v === null ? fallback : v; } catch (e) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(STORE + key, value); } catch (e) { /* storage unavailable */ } }

  var state = { lang: load("lang", "en"), theme: load("theme", "auto"), plan: null, loads: null, selected: null };
  if (I18n.langs.indexOf(state.lang) === -1) state.lang = "en";          // always opens in English; a manual choice is remembered
  if (["auto", "light", "dark"].indexOf(state.theme) === -1) state.theme = "auto";

  function t() { return I18n.t.apply(null, [state.lang].concat([].slice.call(arguments))); }

  // ---------- small DOM helpers ----------
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v === null || v === undefined) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = !!v;
      else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function option(value, label, selected) { return h("option", { value: value, selected: selected ? true : false, text: label }); }

  // ---------- number formatting ----------
  function dec(s) { return state.lang === "en" ? s : s.replace(".", ","); }
  function fmtMbps(x) { return dec(x >= 100 ? x.toFixed(0) : (x >= 10 ? x.toFixed(1) : x.toFixed(2))); }
  function fmtPct(p) { return dec(p >= 10 ? p.toFixed(0) : p.toFixed(1)) + " %"; }
  function fmtInt(x) { return String(Math.round(x)); }
  function speedName(m) { return m >= 1000 ? (m / 1000) + " Gbps" : m + " Mbps"; }
  function kHz(fs) { return dec(String(fs / 1000)) + " kHz"; }

  // ---------- language & theme ----------
  function applyLang() {
    document.documentElement.lang = state.lang;
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
    $("langSel").setAttribute("aria-label", t("ctl.language"));
    $("diagram").setAttribute("aria-label", t("dia.label"));
    renderAll();
  }
  function applyTheme() {
    var root = document.documentElement;
    if (state.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", state.theme);
    var dark = state.theme === "dark" || (state.theme === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0b0d17" : "#eef0f8");
  }

  // ---------- plan persistence ----------
  var saveTimer = null;
  function savePlan() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { save("plan", JSON.stringify(state.plan)); }, 250);
  }
  function loadPlan() {
    var raw = load("plan", null), p = null;
    if (raw) { try { p = Plan.normalizePlan(JSON.parse(raw)); } catch (e) { p = null; } }
    return p || Plan.example("studio");
  }

  // ---------- helpers on the plan ----------
  function nodeById(id) { for (var i = 0; i < state.plan.nodes.length; i++) if (state.plan.nodes[i].id === id) return state.plan.nodes[i]; return null; }
  function nodeName(id) { var n = nodeById(id); return n ? n.name : "?"; }
  function linkById(id) { for (var i = 0; i < state.plan.links.length; i++) if (state.plan.links[i].id === id) return state.plan.links[i]; return null; }
  function devices() { return state.plan.nodes.filter(function (n) { return n.type === "device"; }); }
  function flowName(f) { return f.name || t("flw.defaultName", state.plan.flows.indexOf(f) + 1); }
  function flowById(id) { for (var i = 0; i < state.plan.flows.length; i++) if (state.plan.flows[i].id === id) return state.plan.flows[i]; return null; }
  function hasSecondary() { return state.plan.links.some(function (l) { return l.net === "secondary"; }); }
  function netName(net) { return t(net === "secondary" ? "net.secondary" : "net.primary"); }
  function netLetter(net) { return t(net === "secondary" ? "net.letterS" : "net.letterP"); }
  function linkName(l) { return nodeName(l.a) + " ↔ " + nodeName(l.b) + (hasSecondary() ? " (" + netLetter(l.net) + ")" : ""); }
  function typeLabel(type) { return t(type === "switch" ? "type.switch" : "type.device"); }
  function linkBetween(a, b, net, ignoreId) {
    return state.plan.links.some(function (l) {
      return l.id !== ignoreId && (l.net === "secondary" ? "secondary" : "primary") === net && ((l.a === a && l.b === b) || (l.a === b && l.b === a));
    });
  }

  function relayout() { Plan.autoLayout(state.plan); }

  function addNode(name, type, connectTo, speed, net) {
    var p = state.plan;
    if (p.nodes.length >= Plan.LIMITS.nodes) return false;
    var id = Plan.nextId("n", p.nodes);
    var count = p.nodes.filter(function (n) { return n.type === type; }).length + 1;
    var n = { id: id, name: (name || "").trim().slice(0, Plan.LIMITS.nameLen) || t(type === "switch" ? "dev.defaultSwitch" : "dev.defaultDevice", count), type: type, x: 500, y: 100, manual: false };
    p.nodes.push(n);
    if (connectTo && nodeById(connectTo) && p.links.length < Plan.LIMITS.links) {
      p.links.push({ id: Plan.nextId("l", p.links), a: connectTo, b: id, net: net === "secondary" ? "secondary" : "primary", speed: speed });
    }
    relayout();
    return true;
  }

  function removeNode(id) {
    var p = state.plan;
    p.nodes = p.nodes.filter(function (n) { return n.id !== id; });
    p.links = p.links.filter(function (l) { return l.a !== id && l.b !== id; });
    p.flows.forEach(function (f) {
      if (f.src === id) f.src = "";
      f.dests = f.dests.filter(function (d) { return d !== id; });
    });
    if (state.selected && !linkById(state.selected)) state.selected = null;
    relayout();
  }

  function addFlow() {
    var p = state.plan;
    if (p.flows.length >= Plan.LIMITS.flows) return;
    var used = {};
    p.flows.forEach(function (f) { used[f.color] = true; });
    var color = 0;
    while (used[color] && color < Plan.FLOW_COLORS - 1) color++;
    var dev = devices(), f = Plan.newFlow(Plan.nextId("f", p.flows), dev.length ? dev[0].id : "", color);
    if (dev.length > 1) f.dests = [dev[1].id];
    p.flows.push(f);
  }

  function cleanFlow(f) {
    if (f.mode === "dante") f.bits = 24; else f.redundant = false;
    f.dests = f.dests.filter(function (d) { return d !== f.src; });
  }

  // ---------- renderers: static selects ----------
  function fillSpeedSelect(sel, value) {
    clear(sel);
    Model.LINK_SPEEDS.forEach(function (s) { sel.appendChild(option(String(s), speedName(s), s === value)); });
  }
  function renderAddForms() {
    var keepTo = $("newNodeTo").value, keepA = $("newLinkA").value, keepB = $("newLinkB").value;
    var to = $("newNodeTo"); clear(to);
    to.appendChild(option("", t("dev.none"), true));
    state.plan.nodes.forEach(function (n) { to.appendChild(option(n.id, n.name)); });
    if (keepTo && nodeById(keepTo)) to.value = keepTo;
    else { var sw = state.plan.nodes.filter(function (n) { return n.type === "switch"; })[0]; if (sw) to.value = sw.id; }
    fillSpeedSelect($("newNodeSpeed"), Number($("newNodeSpeed").value) || 1000);
    [["newLinkA", keepA], ["newLinkB", keepB]].forEach(function (pair, i) {
      var sel = $(pair[0]); clear(sel);
      state.plan.nodes.forEach(function (n) { sel.appendChild(option(n.id, n.name)); });
      if (pair[1] && nodeById(pair[1])) sel.value = pair[1];
      else if (state.plan.nodes[i]) sel.value = state.plan.nodes[i].id;
    });
    fillSpeedSelect($("newLinkSpeed"), Number($("newLinkSpeed").value) || 1000);
    ["newNodeNet", "newLinkNet"].forEach(function (id) {
      var sel = $(id), keep = sel.value || "primary"; clear(sel);
      sel.appendChild(option("primary", netName("primary"), keep === "primary")); sel.appendChild(option("secondary", netName("secondary"), keep === "secondary"));
    });
  }

  // ---------- renderers: node and link editors ----------
  function renderNodeList() {
    var box = $("nodeList"); clear(box);
    state.plan.nodes.forEach(function (n) {
      var name = h("input", { type: "text", value: n.name, maxlength: Plan.LIMITS.nameLen, "aria-label": t("dev.name"), "data-k": "node-name", "data-id": n.id });
      name.addEventListener("input", function () { n.name = name.value.slice(0, Plan.LIMITS.nameLen) || n.name; onPlanValueChange(true); });
      var type = h("select", { "aria-label": t("dev.type"), "data-k": "node-type", "data-id": n.id }, [
        option("device", t("type.device"), n.type === "device"), option("switch", t("type.switch"), n.type === "switch")]);
      type.addEventListener("change", function () {
        n.type = type.value;
        if (n.type === "switch") state.plan.flows.forEach(function (f) { if (f.src === n.id) f.src = ""; f.dests = f.dests.filter(function (d) { return d !== n.id; }); });
        relayout(); renderAll();
      });
      var del = h("button", { type: "button", class: "btn btn--icon", "aria-label": t("dev.remove") + ": " + n.name, title: t("dev.remove"), text: "×" });
      del.addEventListener("click", function () { removeNode(n.id); renderAll(); });
      box.appendChild(h("div", { class: "row" }, [name, type, del]));
    });
  }

  function renderLinkEdit() {
    var box = $("linkEdit"); clear(box);
    if (!state.plan.links.length) box.appendChild(h("p", { class: "hint", text: t("lnk.empty") }));
    state.plan.links.forEach(function (l) {
      var netSel = h("select", { "aria-label": t("lnk.network") + ": " + linkName(l), "data-k": "link-net", "data-id": l.id }, [
        option("primary", netName("primary"), l.net !== "secondary"), option("secondary", netName("secondary"), l.net === "secondary")]);
      netSel.addEventListener("change", function () {
        if (linkBetween(l.a, l.b, netSel.value, l.id)) { netSel.value = l.net === "secondary" ? "secondary" : "primary"; $("linkHint").textContent = t("lnk.exists"); return; }
        l.net = netSel.value; $("linkHint").textContent = ""; renderAll();
      });
      var sp = h("select", { "aria-label": t("lnk.speed") + ": " + linkName(l), "data-k": "link-speed", "data-id": l.id });
      Model.LINK_SPEEDS.forEach(function (s) { sp.appendChild(option(String(s), speedName(s), s === l.speed)); });
      sp.addEventListener("change", function () { l.speed = Number(sp.value); onPlanValueChange(false); });
      var del = h("button", { type: "button", class: "btn btn--icon", "aria-label": t("lnk.remove") + ": " + linkName(l), title: t("lnk.remove"), text: "×" });
      del.addEventListener("click", function () {
        state.plan.links = state.plan.links.filter(function (x) { return x.id !== l.id; });
        if (state.selected === l.id) state.selected = null;
        relayout(); renderAll();
      });
      box.appendChild(h("div", { class: "row row--link" }, [h("span", { class: "row__name", text: nodeName(l.a) + " \u2194 " + nodeName(l.b) }), netSel, sp, del]));
    });
  }

  // ---------- renderers: flow editor ----------
  function field(label, control, hint) {
    return h("label", { class: "f" }, [h("span", { text: label }), control, hint ? h("small", { class: "f__hint", text: hint }) : null]);
  }
  function numInput(f, key, min, max, extra) {
    var inp = h("input", { type: "number", min: min, max: max, step: 1, inputmode: "numeric", value: String(f[key]), "data-k": "f-" + key, "data-fid": f.id });
    inp.addEventListener("input", function () {
      var n = Math.round(Number(inp.value));
      if (!isFinite(n)) return;
      f[key] = Math.min(max, Math.max(min, n));
      onPlanValueChange(false);
    });
    inp.addEventListener("change", function () { inp.value = String(f[key]); });
    return inp;
  }
  function selectInput(f, key, opts, structural) {
    var sel = h("select", { "data-k": "f-" + key, "data-fid": f.id });
    opts.forEach(function (o) { sel.appendChild(option(String(o[0]), o[1], String(f[key]) === String(o[0]))); });
    sel.addEventListener("change", function () {
      var v = sel.value;
      f[key] = (key === "fs" || key === "bits") ? Number(v) : v;
      cleanFlow(f);
      if (structural) { renderFlows(); }
      onPlanValueChange(false);
    });
    return sel;
  }

  function renderFlows() {
    var box = $("flowList"), focus = document.activeElement, fk = focus && focus.getAttribute ? [focus.getAttribute("data-k"), focus.getAttribute("data-fid")] : null;
    clear(box);
    var devs = devices();
    $("addFlowBtn").disabled = !devs.length;
    $("flowHint").textContent = !devs.length ? t("flw.needDevices") : (!state.plan.flows.length ? t("flw.empty") : "");
    state.plan.flows.forEach(function (f, idx) {
      var card = h("div", { class: "flow", "data-fid": f.id });
      var chip = h("span", { class: "chip f" + f.color, "aria-hidden": "true" });
      var name = h("input", { type: "text", value: f.name, placeholder: t("flw.defaultName", idx + 1), maxlength: Plan.LIMITS.nameLen, "aria-label": t("flw.name"), "data-k": "f-name", "data-fid": f.id });
      name.addEventListener("input", function () { f.name = name.value.slice(0, Plan.LIMITS.nameLen); onPlanValueChange(false); });
      var dup = h("button", { type: "button", class: "btn btn--small btn--ghost", text: t("flw.duplicate") });
      dup.addEventListener("click", function () {
        if (state.plan.flows.length >= Plan.LIMITS.flows) return;
        var copy = JSON.parse(JSON.stringify(f));
        copy.id = Plan.nextId("f", state.plan.flows);
        copy.color = (f.color + 1) % Plan.FLOW_COLORS;
        if (copy.name) copy.name = (copy.name + " 2").slice(0, Plan.LIMITS.nameLen);
        state.plan.flows.splice(idx + 1, 0, copy);
        renderAll();
      });
      var del = h("button", { type: "button", class: "btn btn--icon", "aria-label": t("flw.remove") + ": " + flowName(f), title: t("flw.remove"), text: "×" });
      del.addEventListener("click", function () { state.plan.flows = state.plan.flows.filter(function (x) { return x.id !== f.id; }); renderAll(); });
      card.appendChild(h("div", { class: "flow__head" }, [chip, name, dup, del]));

      var grid = h("div", { class: "grid2" });
      grid.appendChild(field(t("flw.model"), selectInput(f, "mode", [["aes67", t("model.aes67")], ["dante", t("model.dante")]], true)));
      grid.appendChild(field(t("flw.cast"), selectInput(f, "cast", [["unicast", t("cast.unicast")], ["multicast", t("cast.multicast")]], true), f.mode === "aes67" && f.cast === "unicast" ? t("flw.aes67UnicastHint") : null));
      var srcSel = h("select", { "data-k": "f-src", "data-fid": f.id }, [option("", t("flw.pick"), !f.src)].concat(devs.map(function (d) { return option(d.id, d.name, d.id === f.src); })));
      srcSel.addEventListener("change", function () { f.src = srcSel.value; cleanFlow(f); renderFlows(); onPlanValueChange(false); });
      grid.appendChild(field(t("flw.src"), srcSel));
      grid.appendChild(field(t("flw.ch"), numInput(f, "ch", 1, Plan.LIMITS.channels)));
      grid.appendChild(field(t("flw.fs"), selectInput(f, "fs", Plan.RATES.map(function (r) { return [r, kHz(r)]; }), false)));
      var bitsSel = selectInput(f, "bits", [[16, "16 bit"], [24, "24 bit"]], false);
      if (f.mode === "dante") { bitsSel.value = "24"; bitsSel.disabled = true; }
      grid.appendChild(field(t("flw.bits"), bitsSel, f.mode === "dante" ? t("flw.danteBits") : null));
      if (f.mode === "aes67") {
        grid.appendChild(field(t("flw.ptime"), selectInput(f, "ptime", Plan.PTIMES.map(function (p) { return [p, t("ptime." + p)]; }), true)));
        if (f.ptime === "custom") grid.appendChild(field(t("flw.samples"), numInput(f, "samples", 1, Plan.LIMITS.samples)));
        var bytes = f.bits / 8, sp = Model.samplesPerPacket(f.fs, f.ptime, f.samples);
        var maxCh = sp ? Model.maxChannelsPerStream(bytes, sp) : 0;
        grid.appendChild(field(t("flw.cps"), numInput(f, "cps", 1, Plan.LIMITS.cps), maxCh ? t("flw.cpsHint", maxCh) : null));
      }
      grid.appendChild(field(t("flw.copies"), numInput(f, "copies", 1, Plan.LIMITS.copies), t("flw.copiesHint")));
      card.appendChild(grid);

      var fs = h("fieldset", { class: "rx" }, [h("legend", { text: t("flw.dests") })]);
      var others = devs.filter(function (d) { return d.id !== f.src; });
      if (!others.length) fs.appendChild(h("p", { class: "hint", text: t("flw.needDevices") }));
      others.forEach(function (d) {
        var cb = h("input", { type: "checkbox", checked: f.dests.indexOf(d.id) >= 0, "data-k": "f-dest-" + d.id, "data-fid": f.id });
        cb.addEventListener("change", function () {
          f.dests = f.dests.filter(function (x) { return x !== d.id; });
          if (cb.checked) f.dests.push(d.id);
          onPlanValueChange(false);
        });
        fs.appendChild(h("label", { class: "check check--tight" }, [cb, h("span", { text: d.name })]));
      });
      card.appendChild(fs);
      if (f.mode === "dante") {
        var red = h("input", { type: "checkbox", checked: !!f.redundant, "data-k": "f-redundant", "data-fid": f.id });
        red.addEventListener("change", function () { f.redundant = red.checked; onPlanValueChange(false); });
        card.appendChild(h("label", { class: "check check--flow" }, [red, h("span", {}, [t("flw.redundant"), h("small", { class: "f__hint", text: " " + t("flw.redundantHint") })])]));
      }

      card.appendChild(h("div", { class: "flow__sum", "data-sum": f.id }));
      card.appendChild(h("div", { class: "flow__warn", "data-warn": f.id }));
      card.appendChild(h("details", { class: "flow__details", "data-details": f.id }, [h("summary", { text: t("flw.details") }), h("dl", { class: "calc" })]));
      box.appendChild(card);
    });
    if (fk && fk[0]) {
      var again = box.querySelector('[data-k="' + fk[0] + '"][data-fid="' + fk[1] + '"]');
      if (again && again.focus) again.focus();
    }
  }

  // ---------- per-flow summaries ----------
  function streamText(calc) {
    var chs = calc.streams.map(function (s) { return s.channels; });
    var uniform = chs.every(function (c) { return c === chs[0]; });
    return uniform ? chs[0] + " ch" : chs.join("+") + " ch";
  }

  function detailsFor(f, calc, opts) {
    var rows = [];
    function row(k, v) { rows.push([k, v]); }
    if (calc.model === "aes67" && calc.valid) {
      var big = calc.streams.reduce(function (a, s) { return s.channels > a.channels ? s : a; }, calc.streams[0]);
      var eth = Model.ETH.HEADER + Model.ETH.FCS + (opts.vlan ? Model.ETH.VLAN : 0) + (opts.wire ? Model.ETH.PREAMBLE_SFD + Model.ETH.IFG : 0);
      var ov = Model.overheadBytes(opts);
      row(t("cd.samples"), String(calc.samplesPerPacket) + " · " + dec((big.packetTimeUs).toFixed(0)) + " µs");
      row(t("cd.payload"), big.channels + " × " + calc.samplesPerPacket + " × " + (f.bits / 8) + " = " + big.payload + " " + t("cd.unitBytes"));
      row(t("cd.headers"), "12 + 8 + 20 + " + eth + " = " + ov + " " + t("cd.unitBytes"));
      row(t("cd.packet"), big.packet + " " + t("cd.unitBytes"));
      row(t("cd.pps"), dec(big.pps.toFixed(2)) + " " + t("unit.pps"));
      row(t("cd.rate"), fmtMbps(big.mbps) + " " + t("unit.mbps") + " (" + t("cd.audio") + ": " + fmtMbps(big.audioMbps) + " " + t("unit.mbps") + ", " + t("cd.overhead") + " " + dec(((big.mbps / big.audioMbps - 1) * 100).toFixed(1)) + " %)");
      if (calc.streams.length > 1) calc.streams.forEach(function (s, i) { row(t("cd.streamsN", i + 1, s.channels), fmtMbps(s.mbps) + " " + t("unit.mbps")); });
    } else if (calc.model === "dante" && calc.valid) {
      var factor = dec((f.fs / 48000).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
      row(t("flw.model"), f.cast === "multicast" ? t("cd.rule.multi", f.ch, factor) : t("cd.rule.uni", calc.flows, factor));
      row(t("unit.mbps"), "≈ " + fmtMbps(calc.mbps));
      row("ℹ", t("cd.danteNote"));
    }
    return rows;
  }

  function updateFlowSummaries() {
    var plan = state.plan, opts = { vlan: !!plan.settings.vlan, wire: plan.settings.wire !== false };
    state.loads.flows.forEach(function (entry) {
      var f = flowById(entry.id); if (!f) return;
      var sum = document.querySelector('[data-sum="' + f.id + '"]'), warn = document.querySelector('[data-warn="' + f.id + '"]'), det = document.querySelector('[data-details="' + f.id + '"] dl');
      if (!sum) return;
      var calc = entry.calc, who = f.cast === "unicast" ? t("flow.perRx") : t("flow.sentOnce");
      var line = "", warns = [];
      if (!calc.valid) { warns.push(t("w." + (calc.warnings[0] || "payloadTooLarge"))); }
      else if (calc.model === "aes67") {
        line = t("flow.aes67", calc.streams.length, streamText(calc), fmtMbps(calc.mbps * entry.copies), fmtInt(calc.pps * entry.copies)) + " · " + who;
      } else {
        line = (f.cast === "multicast" ? t("flow.dante.multi", fmtMbps(calc.mbps * entry.copies)) : t("flow.dante.uni", fmtMbps(calc.mbps * entry.copies), calc.flows * entry.copies)) + " · " + who;
        if (entry.nets.length > 1) line += " · " + t("flow.onBoth");
      }
      calc.warnings.forEach(function (w) {
        if (w === "cpsLimited") warns.push(t("w.cpsLimited", calc.channelsPerStream));
        else if (w === "moreThan8") warns.push(t("w.moreThan8"));
        else if (w === "danteRateScaled") warns.push(t("w.danteRateScaled"));
      });
      if (!f.src) warns.push(t("flw.noSrc"));
      else if (!f.dests.length) warns.push(t("flw.noRx"));
      entry.receivers.forEach(function (r) {
        if (r.hops) return;
        warns.push(entry.nets.length > 1 || hasSecondary() ? t("w.unreachNet", nodeName(r.node), netName(r.net)) : t("w.unreach", nodeName(r.node)));
      });
      sum.textContent = line;
      clear(warn);
      warns.forEach(function (w) { warn.appendChild(h("p", { text: w })); });
      clear(det);
      if (calc.valid) detailsFor(f, calc, opts).forEach(function (r) { det.appendChild(h("dt", { text: r[0] })); det.appendChild(h("dd", { text: r[1] })); });
    });
  }

  // ---------- diagram, summary, legend, inspector, link list ----------
  function flowColorOf(flowId) { var f = flowById(flowId); return f ? f.color : 0; }

  function renderDiagram() {
    var plan = state.plan;
    $("diagramEmpty").hidden = plan.nodes.length > 0;
    Diagram.render($("diagram"), plan, state.loads, {
      selected: state.selected, typeLabel: typeLabel, fmtPct: fmtPct, flowColor: flowColorOf, netLetter: netLetter,
      linkTitle: function (l, ab, ba) {
        return t("dia.linkTitle", nodeName(l.a), nodeName(l.b), fmtPct(ab).replace(" %", ""), fmtPct(ba).replace(" %", "")) + " (" + speedName(l.speed) + (hasSecondary() ? ", " + netName(l.net) : "") + ")";
      }
    });
  }

  function stateText(s) { return t("state." + s); }

  function renderSummary() {
    var box = $("summary"), sm = state.loads.summary, plan = state.plan;
    clear(box);
    if (!plan.links.length || !plan.flows.length) box.appendChild(h("p", { class: "summary__msg", text: t("sum.nolinks") }));
    if (plan.links.length && plan.flows.length) {
      var worst = sm.worstLink ? linkById(sm.worstLink) : null;
      var st = sm.worstPct > 100 ? "over" : (sm.worstPct > plan.settings.threshold ? "warn" : "ok");
      box.appendChild(h("div", { class: "kpi is-" + st }, [
        h("span", { class: "kpi__label", text: t("sum.busiest") }),
        h("span", { class: "kpi__value", text: fmtPct(sm.worstPct) }),
        h("span", { class: "kpi__sub", text: worst ? linkName(worst) : "" })]));
      box.appendChild(h("div", { class: "kpi" + (sm.warn ? " is-warn" : "") }, [
        h("span", { class: "kpi__label", text: t("sum.above", plan.settings.threshold) }),
        h("span", { class: "kpi__value", text: String(sm.warn) })]));
      box.appendChild(h("div", { class: "kpi" + (sm.over ? " is-over" : "") }, [
        h("span", { class: "kpi__label", text: t("sum.over") }),
        h("span", { class: "kpi__value", text: String(sm.over) })]));
      if (!sm.warn && !sm.over) box.appendChild(h("p", { class: "summary__msg is-ok", text: t("sum.ok") }));
    }
    var notes = h("ul", { class: "summary__notes" });
    if (sm.unreachable) notes.appendChild(h("li", { class: "is-warn", text: t("sum.unreachable", sm.unreachable) }));
    if (sm.loops) notes.appendChild(h("li", { class: "is-warn", text: t("sum.loops") }));
    sm.speedMismatch.forEach(function (id) { notes.appendChild(h("li", { class: "is-warn", text: t("sum.speedMismatch", nodeName(id)) })); });
    sm.sharedSwitches.forEach(function (id) { notes.appendChild(h("li", { class: "is-warn", text: t("sum.sharedSwitch", nodeName(id)) })); });
    if (plan.flows.some(function (f) { return f.mode === "dante"; })) notes.appendChild(h("li", { text: t("sum.dante") }));
    if (notes.children.length) box.appendChild(notes);
  }

  function renderLegend() {
    var ul = $("legend"); clear(ul);
    if (hasSecondary()) {
      ul.appendChild(h("li", {}, [h("span", { class: "netchip netchip--primary", "aria-hidden": "true" }), h("span", { text: t("dia.netP") })]));
      ul.appendChild(h("li", {}, [h("span", { class: "netchip netchip--secondary", "aria-hidden": "true" }), h("span", { text: t("dia.netS") })]));
    }
    state.plan.flows.forEach(function (f) {
      ul.appendChild(h("li", {}, [h("span", { class: "chip f" + f.color, "aria-hidden": "true" }), h("span", { text: flowName(f) }),
        h("small", { text: f.mode === "dante" ? "Dante ≈" : "AES67" })]));
    });
  }

  function segBar(dir, capacity) {
    var bar = h("div", { class: "segbar is-" + dir.state }), used = 0;
    dir.items.forEach(function (it) {
      var frac = Math.min(1 - used, it.mbps / capacity);
      if (frac <= 0) return;
      var seg = h("span", { class: "segbar__seg f" + flowColorOf(it.flow) });
      seg.style.width = (frac * 100) + "%";
      bar.appendChild(seg); used += frac;
    });
    var tick = h("i", { class: "segbar__tick" });
    tick.style.left = state.plan.settings.threshold + "%";
    bar.appendChild(tick);
    return bar;
  }

  function renderLinkList() {
    var ul = $("linkList"); clear(ul);
    if (!state.plan.links.length) { ul.appendChild(h("li", { class: "hint", text: t("ll.empty") })); return; }
    state.plan.links.forEach(function (l) {
      var ld = state.loads.links[l.id];
      var btn = h("button", { type: "button", class: "linkrow" + (state.selected === l.id ? " is-selected" : ""), "aria-pressed": state.selected === l.id ? "true" : "false" }, [
        h("span", { class: "linkrow__name", text: linkName(l) }), h("span", { class: "linkrow__cap", text: speedName(l.speed) }),
        h("span", { class: "linkrow__dir" }, [h("span", { class: "dirlabel", text: nodeName(l.a) + " →" }), segBar(ld.ab, l.speed), h("span", { class: "pctlabel is-" + ld.ab.state, text: fmtPct(ld.ab.pct) })]),
        h("span", { class: "linkrow__dir" }, [h("span", { class: "dirlabel", text: nodeName(l.b) + " →" }), segBar(ld.ba, l.speed), h("span", { class: "pctlabel is-" + ld.ba.state, text: fmtPct(ld.ba.pct) })])]);
      btn.addEventListener("click", function () { selectLink(l.id); });
      ul.appendChild(h("li", {}, [btn]));
    });
  }

  function renderInspector() {
    var box = $("inspector"); clear(box);
    var l = state.selected ? linkById(state.selected) : null;
    if (!l) { box.appendChild(h("p", { class: "hint", text: t("ins.none") })); return; }
    var ld = state.loads.links[l.id];
    box.appendChild(h("p", { class: "insp__head" }, [h("strong", { text: nodeName(l.a) + " ↔ " + nodeName(l.b) }), " · " + t("ins.capacity") + " " + speedName(l.speed) + (hasSecondary() ? " · " + t("ins.network") + ": " + netName(l.net) : "")]));
    [["ab", l.a, l.b], ["ba", l.b, l.a]].forEach(function (d) {
      var dir = ld[d[0]];
      var sec = h("section", { class: "insp__dir" }, [
        h("h3", { text: t("ins.dir", nodeName(d[1]), nodeName(d[2])) }),
        h("p", { class: "insp__load is-" + dir.state }, [h("span", { text: fmtMbps(dir.mbps) + " " + t("unit.mbps") + " · " + fmtPct(dir.pct) }), h("span", { class: "badge is-" + dir.state, text: stateText(dir.state) })]),
        segBar(dir, l.speed)]);
      if (!dir.items.length) sec.appendChild(h("p", { class: "hint", text: t("ins.noFlows") }));
      else {
        var ul = h("ul", { class: "insp__flows" });
        dir.items.forEach(function (it) {
          var f = flowById(it.flow);
          ul.appendChild(h("li", {}, [h("span", { class: "chip f" + flowColorOf(it.flow), "aria-hidden": "true" }), h("span", { class: "insp__fname", text: f ? flowName(f) : "?" }),
            h("span", { class: "insp__fval", text: fmtMbps(it.mbps) + " " + t("unit.mbps") + (it.pps ? " · " + fmtInt(it.pps) + " " + t("ins.pps") : "") })]));
        });
        sec.appendChild(ul);
      }
      box.appendChild(sec);
    });
  }

  function selectLink(id) {
    state.selected = state.selected === id ? null : id;
    renderDiagram(); renderLinkList(); renderInspector();
  }

  // ---------- update pipelines ----------
  function recompute() {
    state.loads = Model.computeLoads(state.plan);
    renderDiagram(); renderSummary(); renderLegend(); renderLinkList(); renderInspector(); updateFlowSummaries();
    savePlan();
  }
  // value changed in a form control (no structural change): keep the inputs, refresh the results
  function onPlanValueChange(namesChanged) {
    if (namesChanged) { renderAddForms(); renderLinkEdit(); renderFlowsIfNames(); }
    recompute();
  }
  function renderFlowsIfNames() {
    // node names appear in the source select and the receiver list of every flow
    var fk = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute("data-k") : null;
    if (fk === "node-name") { var keep = document.activeElement, pos = keep.selectionStart; renderFlows(); keep.focus(); try { keep.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ } }
    else renderFlows();
  }
  function renderAll() {
    var active = document.activeElement, k = active && active.getAttribute ? [active.getAttribute("data-k"), active.getAttribute("data-id")] : null;
    renderAddForms(); renderNodeList(); renderLinkEdit(); renderFlows();
    syncSettings();
    recompute();
    if (k && k[0] && k[1]) { var again = document.querySelector('[data-k="' + k[0] + '"][data-id="' + k[1] + '"]'); if (again && again.focus) again.focus(); }
  }

  function syncSettings() {
    var s = state.plan.settings;
    $("setThreshold").value = String(s.threshold);
    $("setWire").checked = s.wire !== false; $("setVlan").checked = !!s.vlan; $("setSnooping").checked = s.snooping !== false;
  }

  // ---------- plan import / export / examples ----------
  function confirmReplace() {
    return new Promise(function (resolve) {
      var dlg = $("confirmDlg");
      $("confirmText").textContent = t("plan.confirm");
      function done(v) { $("confirmYes").removeEventListener("click", yes); $("confirmNo").removeEventListener("click", no); dlg.close(); resolve(v); }
      function yes() { done(true); } function no() { done(false); }
      $("confirmYes").addEventListener("click", yes); $("confirmNo").addEventListener("click", no);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    });
  }
  function setPlanMsg(msg, isError) { var el = $("planMsg"); el.textContent = msg; el.classList.toggle("is-error", !!isError); }
  function replacePlan(p) {
    state.plan = p; state.selected = null;
    Plan.autoLayout(p);
    renderAll();
  }
  function withConfirm(fn) {
    if (!state.plan.nodes.length && !state.plan.flows.length) { fn(); return Promise.resolve(); }
    return confirmReplace().then(function (ok) { if (ok) fn(); });
  }

  function exportPlan() {
    var blob = new Blob([JSON.stringify(state.plan, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "aoip-plan.json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var p = null;
      try { p = Plan.normalizePlan(JSON.parse(String(r.result))); } catch (e) { p = null; }
      if (!p) { setPlanMsg(t("plan.importError"), true); return; }
      withConfirm(function () { replacePlan(p); setPlanMsg(t("plan.imported"), false); });
    };
    r.onerror = function () { setPlanMsg(t("plan.importError"), true); };
    r.readAsText(file);
  }

  // ---------- install as an app ----------
  var deferredInstall = null;
  function isInstalled() {
    if (navigator.standalone === true) return true;
    if (!window.matchMedia) return false;
    return ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"].some(function (m) { return window.matchMedia("(display-mode: " + m + ")").matches; });
  }
  function updateInstallButton() { $("installBtn").hidden = isInstalled(); }
  function openHelp(anchor) {
    var dlg = $("helpDlg");
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
    var target = anchor ? $(anchor) : null;
    if (target && target.scrollIntoView) target.scrollIntoView();
  }
  function onInstallClick() {
    if (deferredInstall) {
      var ev = deferredInstall; deferredInstall = null; ev.prompt();
      if (ev.userChoice && ev.userChoice.then) ev.userChoice.then(updateInstallButton, updateInstallButton);
    } else openHelp("helpInstall");
  }

  // ---------- wiring ----------
  function init() {
    $("ver").textContent = "v" + VERSION;
    var ls = $("langSel");
    I18n.langs.forEach(function (c) { ls.appendChild(option(c, I18n.names[c], c === state.lang)); });
    $("themeSel").value = state.theme;
    state.plan = loadPlan();
    applyTheme();

    Diagram.init($("diagram"), {
      onSelectLink: selectLink,
      onNodeMove: function (id, x, y) { var n = nodeById(id); if (!n) return; n.x = x; n.y = y; n.manual = true; renderDiagram(); },
      onNodeMoveEnd: function () { savePlan(); },
      bounds: function () { return { h: Diagram.heightFor(state.plan) }; }
    });

    $("addNodeForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var hint = $("nodeHint"); hint.textContent = "";
      if (!addNode($("newNodeName").value, $("newNodeType").value, $("newNodeTo").value, Number($("newNodeSpeed").value), $("newNodeNet").value)) { hint.textContent = t("dev.limit"); return; }
      $("newNodeName").value = "";
      renderAll();
    });
    $("addLinkForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var a = $("newLinkA").value, b = $("newLinkB").value, hint = $("linkHint");
      hint.textContent = "";
      if (state.plan.nodes.length < 2) { hint.textContent = t("lnk.needNodes"); return; }
      if (!a || !b || a === b) { hint.textContent = t("lnk.same"); return; }
      var net = $("newLinkNet").value === "secondary" ? "secondary" : "primary";
      if (linkBetween(a, b, net)) { hint.textContent = t("lnk.exists"); return; }
      if (state.plan.links.length >= Plan.LIMITS.links) { hint.textContent = t("dev.limit"); return; }
      state.plan.links.push({ id: Plan.nextId("l", state.plan.links), a: a, b: b, net: net, speed: Number($("newLinkSpeed").value) });
      relayout(); renderAll();
    });
    $("addFlowBtn").addEventListener("click", function () { addFlow(); renderAll(); });
    $("layoutBtn").addEventListener("click", function () { state.plan.nodes.forEach(function (n) { n.manual = false; }); relayout(); renderDiagram(); savePlan(); });

    $("setThreshold").addEventListener("input", function () {
      var v = Math.round(Number($("setThreshold").value));
      if (!isFinite(v)) return;
      state.plan.settings.threshold = Math.min(100, Math.max(1, v)); recompute();
    });
    $("setThreshold").addEventListener("change", function () { $("setThreshold").value = String(state.plan.settings.threshold); });
    $("setWire").addEventListener("change", function () { state.plan.settings.wire = $("setWire").checked; recompute(); });
    $("setVlan").addEventListener("change", function () { state.plan.settings.vlan = $("setVlan").checked; recompute(); });
    $("setSnooping").addEventListener("change", function () { state.plan.settings.snooping = $("setSnooping").checked; recompute(); });

    $("exampleSel").addEventListener("change", function () {
      var id = $("exampleSel").value; $("exampleSel").value = "";
      if (id) withConfirm(function () { replacePlan(Plan.example(id)); setPlanMsg("", false); });
    });
    $("exportBtn").addEventListener("click", exportPlan);
    $("importBtn").addEventListener("click", function () { $("importIn").click(); });
    $("importIn").addEventListener("change", function () { var f = $("importIn").files && $("importIn").files[0]; $("importIn").value = ""; if (f) importFile(f); });

    ls.addEventListener("change", function () { state.lang = ls.value; save("lang", state.lang); applyLang(); });
    $("themeSel").addEventListener("change", function () { state.theme = $("themeSel").value; save("theme", state.theme); applyTheme(); });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", function () { if (state.theme === "auto") applyTheme(); });
    }
    var dlg = $("helpDlg");
    $("helpBtn").addEventListener("click", function () { openHelp(null); });
    $("helpClose").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; updateInstallButton(); });
    window.addEventListener("appinstalled", function () { deferredInstall = null; updateInstallButton(); });
    $("installBtn").addEventListener("click", onInstallClick);
    updateInstallButton();

    applyLang();

    if ("serviceWorker" in navigator) {
      var banner = $("updateBanner"), reloaded = false;
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").then(function (reg) {
          reg.addEventListener("updatefound", function () {
            var installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", function () {
              if (installing.state === "installed" && navigator.serviceWorker.controller) banner.classList.remove("hidden");
            });
          });
          $("updateReload").addEventListener("click", function () { if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" }); });
          $("updateDismiss").addEventListener("click", function () { banner.classList.add("hidden"); });
        }).catch(function () { /* offline support unavailable */ });
        navigator.serviceWorker.addEventListener("controllerchange", function () {
          if (reloaded) return; reloaded = true; location.reload();
        });
      });
    }
  }

  init();
})();
