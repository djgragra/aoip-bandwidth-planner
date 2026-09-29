/* AoIP Bandwidth Planner — SVG network diagram (nodes, links, segmented bandwidth bars).
   © 2026 Graziano Melzi · OnAir Garage — MIT License

   All colours come from CSS classes (no inline styles, strict CSP). */
(function (root) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var NODE_W = 132, NODE_H = 52, VB_W = 1000, MIN_H = 320;
  var BAR_W = 9, BAR_OFFSET = 9;

  function el(name, attrs, parent, cls) {
    var e = document.createElementNS(NS, name);
    if (cls) e.setAttribute("class", cls);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function num(n) { return Math.round(n * 100) / 100; }
  function speedLabel(m) { return m >= 1000 ? (m / 1000) + "G" : m + "M"; }
  function short(name) { return name.length > 17 ? name.slice(0, 16) + "…" : name; }

  // point where the ray from a node centre along the unit vector (dx, dy) leaves the node rectangle
  function boundary(cx, cy, dx, dy) {
    var tx = dx ? (NODE_W / 2) / Math.abs(dx) : Infinity, ty = dy ? (NODE_H / 2) / Math.abs(dy) : Infinity;
    var t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  var h = null;          // handlers, set by init()
  var drag = null;

  function svgPoint(svg, e) {
    var pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* init(svg, handlers): handlers = { onSelectLink(id), onNodeMove(id, x, y), onNodeMoveEnd(), bounds() } */
  function init(svg, handlers) {
    h = handlers;
    svg.addEventListener("pointerdown", function (e) {
      var g = e.target.closest ? e.target.closest(".node") : null;
      if (!g || e.button > 0) return;
      var p = svgPoint(svg, e), id = g.getAttribute("data-node");
      var x = Number(g.getAttribute("data-x")), y = Number(g.getAttribute("data-y"));
      drag = { id: id, dx: x - p.x, dy: y - p.y, moved: false };
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released pointer */ }
      e.preventDefault();
    });
    svg.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = svgPoint(svg, e), b = h.bounds();
      drag.moved = true;
      h.onNodeMove(drag.id, Math.min(VB_W - NODE_W / 2, Math.max(NODE_W / 2, p.x + drag.dx)), Math.min(b.h - NODE_H / 2, Math.max(NODE_H / 2, p.y + drag.dy)));
    });
    function end() {
      if (!drag) return;
      var moved = drag.moved; drag = null;
      if (moved) h.onNodeMoveEnd();
    }
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("keydown", function (e) {
      var g = e.target.closest ? e.target.closest(".node") : null;
      if (!g) return;
      var step = e.shiftKey ? 40 : 10, dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step; else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step; else if (e.key === "ArrowDown") dy = step; else return;
      e.preventDefault();
      var b = h.bounds(), id = g.getAttribute("data-node");
      h.onNodeMove(id, Math.min(VB_W - NODE_W / 2, Math.max(NODE_W / 2, Number(g.getAttribute("data-x")) + dx)),
                       Math.min(b.h - NODE_H / 2, Math.max(NODE_H / 2, Number(g.getAttribute("data-y")) + dy)));
      h.onNodeMoveEnd();
      var again = svg.querySelector('.node[data-node="' + id + '"]');
      if (again && again.focus) again.focus();
    });
  }

  function heightFor(plan) {
    var maxY = 0;
    plan.nodes.forEach(function (n) { if (n.y > maxY) maxY = n.y; });
    return Math.max(MIN_H, Math.round(maxY + NODE_H / 2 + 60));
  }

  /* render(svg, plan, loads, opts)
       opts = { selected, typeLabel(type), netLetter(net), linkTitle(link, abPct, baPct), fmtPct(pct), flowColor(flowId) } */
  function render(svg, plan, loads, opts) {
    var H = heightFor(plan);
    svg.setAttribute("viewBox", "0 0 " + VB_W + " " + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var byId = {};
    plan.nodes.forEach(function (n) { byId[n.id] = n; });
    var gLinks = el("g", {}, svg, "links"), gNodes = el("g", {}, svg, "nodes");
    var thr = plan.settings.threshold / 100;
    var hasSecondary = plan.links.some(function (l) { return l.net === "secondary"; });
    // links between the same two nodes (one per network) are drawn side by side
    var groups = {};
    plan.links.forEach(function (l) { var k = [l.a, l.b].sort().join("|"); (groups[k] = groups[k] || []).push(l.id); });

    plan.links.forEach(function (l) {
      var a = byId[l.a], b = byId[l.b], ld = loads.links[l.id];
      if (!a || !b || !ld) return;
      var vx = b.x - a.x, vy = b.y - a.y, len = Math.sqrt(vx * vx + vy * vy) || 1, dx = vx / len, dy = vy / len;
      var s = boundary(a.x, a.y, dx, dy), e = boundary(b.x, b.y, -dx, -dy);
      var p1 = { x: s.x + dx * 6, y: s.y + dy * 6 }, p2 = { x: e.x - dx * 6, y: e.y - dy * 6 };
      var L = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      var nx = -dy, ny = dx;
      var grp = groups[[l.a, l.b].sort().join("|")], shift = (grp.indexOf(l.id) - (grp.length - 1) / 2) * 50;
      p1.x += nx * shift; p1.y += ny * shift; p2.x += nx * shift; p2.y += ny * shift;
      var net = l.net === "secondary" ? "secondary" : "primary";
      var g = el("g", { "data-link": l.id }, gLinks, "link link--" + net + (opts.selected === l.id ? " is-selected" : ""));
      var title = opts.linkTitle(l, ld.ab.pct, ld.ba.pct);
      if (L < 24) {   // nodes almost touching: draw a plain line
        el("line", { x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y) }, g, "wire");
      } else {
        el("line", { x1: num(p1.x), y1: num(p1.y), x2: num(p2.x), y2: num(p2.y) }, g, "halo");
        el("line", { x1: num(p1.x), y1: num(p1.y), x2: num(p2.x), y2: num(p2.y) }, g, "wire");

        [["ab", 1, p1, p2], ["ba", -1, p2, p1]].forEach(function (spec) {
          var d = ld[spec[0]], side = spec[1], from = spec[2], to = spec[3];
          var ox = nx * BAR_OFFSET * side, oy = ny * BAR_OFFSET * side;
          var fx = from.x + ox, fy = from.y + oy, tx = to.x + ox, ty = to.y + oy;
          el("line", { x1: num(fx), y1: num(fy), x2: num(tx), y2: num(ty), "stroke-width": BAR_W }, g, "bar-bg is-" + d.state);
          var used = 0, total = Math.min(1, d.mbps / l.speed);
          d.items.forEach(function (it) {
            if (used >= 1) return;
            var frac = Math.min(1 - used, it.mbps / l.speed);
            if (frac <= 0) return;
            var f0 = (used), f1 = used + frac;
            el("line", {
              x1: num(fx + (tx - fx) * f0), y1: num(fy + (ty - fy) * f0),
              x2: num(fx + (tx - fx) * f1), y2: num(fy + (ty - fy) * f1), "stroke-width": BAR_W
            }, g, "seg f" + (opts.flowColor(it.flow)));
            used = f1;
          });
          var kx = fx + (tx - fx) * thr, ky = fy + (ty - fy) * thr;
          el("line", { x1: num(kx - nx * 8 * side), y1: num(ky - ny * 8 * side), x2: num(kx + nx * 8 * side), y2: num(ky + ny * 8 * side) }, g, "tick");
          // arrowhead at the receiving end
          var ux = (tx - fx) / (L || 1), uy = (ty - fy) / (L || 1);
          var ax = tx + ux * 7, ay = ty + uy * 7;
          el("polygon", {
            points: num(ax) + "," + num(ay) + " " + num(tx - uy * 5) + "," + num(ty + ux * 5) + " " + num(tx + uy * 5) + "," + num(ty - ux * 5)
          }, g, "arrow");
          if (L > 90) {
            var mx = (fx + tx) / 2 + nx * 15 * side, my = (fy + ty) / 2 + ny * 15 * side;
            var t = el("text", { x: num(mx), y: num(my + 4), "text-anchor": "middle" }, g, "pct is-" + d.state);
            t.textContent = opts.fmtPct(d.pct);
          }
        });
        if (L > 60) {
          var m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          var sp = el("text", { x: num(m.x), y: num(m.y + 4), "text-anchor": "middle" }, g, "speed");
          sp.textContent = speedLabel(l.speed) + (hasSecondary ? " " + opts.netLetter(net) : "");
        }
      }
      var hit = el("line", { x1: num(p1.x), y1: num(p1.y), x2: num(p2.x), y2: num(p2.y), tabindex: 0, role: "button", "aria-label": title }, g, "hit");
      el("title", {}, hit).textContent = title;
      hit.addEventListener("click", function () { h.onSelectLink(l.id); });
      hit.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); h.onSelectLink(l.id); } });
    });

    plan.nodes.forEach(function (n) {
      var g = el("g", { "data-node": n.id, "data-x": n.x, "data-y": n.y, transform: "translate(" + num(n.x) + " " + num(n.y) + ")", tabindex: 0, role: "img", "aria-label": n.name + ", " + opts.typeLabel(n.type) }, gNodes, "node node--" + n.type);
      el("rect", { x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 6 }, g, "node__box");
      var name = el("text", { x: 0, y: -2, "text-anchor": "middle" }, g, "node__name");
      name.textContent = short(n.name);
      var type = el("text", { x: 0, y: 16, "text-anchor": "middle" }, g, "node__type");
      type.textContent = opts.typeLabel(n.type).toUpperCase();
      el("title", {}, g).textContent = n.name;
      if (n.type === "switch") {
        for (var i = 0; i < 4; i++) el("rect", { x: -NODE_W / 2 + 10 + i * 9, y: -NODE_H / 2 + 7, width: 6, height: 6, rx: 1 }, g, "node__port");
      } else {
        el("circle", { cx: -NODE_W / 2 + 13, cy: -NODE_H / 2 + 10, r: 3.5 }, g, "node__led");
      }
    });
    return H;
  }

  var api = { init: init, render: render, heightFor: heightFor, NODE_W: NODE_W, NODE_H: NODE_H, VB_W: VB_W };
  root.AoipDiagram = api;
})(typeof self !== "undefined" ? self : this);
