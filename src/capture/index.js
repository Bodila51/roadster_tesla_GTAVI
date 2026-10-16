// Capture mode entry (lazy chunk, loaded by boot.js when the URL has ?capture).
//   ?capture            render mode, driven by tools/capture.mjs through window.__cap
//   ?capture=record     play normally and record takes (input tracks) to JSON
//   ?capture=preview&shot=shots/x.json   play a shot file in real time in the browser
import { Director } from "./director.js";
import { Engine } from "./engine.js";
import { anchorHit, parseAnchor } from "./timeline.js";

const DEG = Math.PI / 180;

// Hide every page element except the game canvas, whatever the HUD's markup: the canvas and its ancestors are
// marked, and everything else beside that chain (including elements added later, like toasts) is hidden.
function cleanView(canvas, keep = []) {
  const st = document.createElement("style");
  st.textContent = ".cap-keep > :not(.cap-keep) { display: none !important; } body.cap-keep { cursor: none; background: #000; }";
  document.head.appendChild(st);
  for (const el of [canvas, ...keep])
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) e.classList.add("cap-keep");
}

function compactEvent(e) {
  const o = {};
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === "number") o[k] = +v.toFixed(3);
    else if (typeof v === "string" || typeof v === "boolean") o[k] = v;
    else if (v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "number"))
      o[k] = Object.fromEntries(Object.entries(v).map(([a, b]) => [a, +b.toFixed(2)]));
  }
  return o;
}

function carRow(engine) {
  const p = engine.rd.phys;
  const r = (v, d = 2) => +(+v).toFixed(d);
  const surf = p.surfaceAt ? p.surfaceAt(p.pos.x, p.pos.z, p.pos.y + 0.5) : { h: 0 };
  return {
    t: r(engine.time, 3),
    mode: p.mode,
    pos: [p.pos.x, p.pos.y, p.pos.z].map((v) => r(v)),
    mph: r(p.vel.length() * 2.236936, 1),
    alt: r(p.pos.y - (surf ? surf.h : 0)),
    yaw: r(Math.atan2(p.fwd.x, p.fwd.z) / DEG, 1),
    upY: r(p.up.y),
    gas: r(p.gas, 1),
  };
}

async function start(env, q) {
  const rd = await env.rdReady;
  const mode = (q.get("capture") || "render").toLowerCase();
  const engine = new Engine(env, rd, { mode: mode === "record" ? "record" : mode === "preview" ? "preview" : "render" });
  window.__capEngine = engine;
  if (mode === "record" || mode === "preview") {
    const m = await import("./record.js");
    return mode === "record" ? m.startRecorder(engine, q) : m.startPreview(engine, q);
  }
  cleanView(rd.renderer.domElement);
  let director = null;
  let started = false;
  const once = () => {
    if (started) throw new Error("a page renders one take; reload for the next");
    started = true;
  };
  window.__cap = {
    ready: true,
    version: 1,
    load(shot) {
      once();
      director = new Director(engine, shot);
      return director.load();
    },
    // render frame i (frames must come in increasing order) and return it as a PNG data URL
    frame(i, opts = {}) {
      const info = director.renderFrame(i);
      if (opts.png !== false) info.png = rd.renderer.domElement.toDataURL("image/png");
      return info;
    },
    skipTo(i) {
      director.skipTo(i);
      return engine.tick;
    },
    // game time of an in-point anchor ("launch", "land#2-0.1", ...) in a take; reload before rendering
    resolve(take, anchor, until = 120) {
      once();
      return engine.findAnchor(take, anchor, until);
    },
    // simulate a take without rendering and report the car every `step` game seconds
    probe(take, step = 0.1, until = 10, anchor = null) {
      once();
      engine.keepEvents = true;
      const t = engine.begin(take || {});
      const rows = [carRow(engine)];
      let next = step;
      while (engine.time < until - 1e-9) {
        engine.step();
        if (engine.time >= next - 1e-9) {
          rows.push(carRow(engine));
          next += step;
        }
      }
      const a = parseAnchor(anchor);
      let hit = null;
      if (a) {
        const e = engine.events.filter((x) => anchorHit(a, x))[a.n - 1];
        hit = e ? { label: a.label, at: e.t, in: Math.max(0, e.t + a.offset) } : { label: a.label, error: "not found" };
      }
      return {
        hz: engine.hz,
        anchor: hit,
        rows,
        events: engine.events.map(compactEvent),
        drift: engine.drift,
        checked: engine.checked,
        warnings: t.warnings,
      };
    },
    state() {
      return { tick: engine.tick, time: engine.time, car: carRow(engine), drift: engine.drift, checked: engine.checked };
    },
  };
}

export { carRow, cleanView, compactEvent, start };
