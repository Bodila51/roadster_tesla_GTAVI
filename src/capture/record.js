// Real-time modes in a normal browser (npm run dev, then open the URL).
//
// Record:  /?capture=record[&start=lineup | &pos=x,y,z&yaw=deg][&hz=1200]
//   Practise freely. Enter starts a take: the page reloads, the car goes to the start point and every key
//   (and gamepad) change is recorded per simulation tick. Enter again stops: the take is downloaded as JSON
//   and kept in this browser. P replays the last take to check it. Backspace discards a running take.
//   The game runs on the same fixed ticks as the renderer, so the take replays bit for bit.
// Preview: /?capture=preview&shot=shots/launch-low.json[&blur=4][&in=2.2]
//   Plays a shot file in real time (cameras, speed ramps) without motion blur. Space pauses, Enter restarts.
//   An anchored in-point ("launch") is found first, then the page reloads with &in=<game seconds>.
import { Director } from "./director.js";
import { cleanView } from "./index.js";
import { PAD_Q } from "./engine.js";
import { parseAnchor } from "./timeline.js";

const TAKE_KEY = "rdcap.take";
const CHECK_EVERY = 0.25; // seconds between recorded position checks

function panel() {
  const el = document.createElement("div");
  el.id = "capture-panel";
  el.style.cssText =
    "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;padding:7px 14px;border-radius:8px;" +
    "background:rgba(8,10,14,.78);color:#e8edf2;font:500 13px/1.45 ui-monospace,Menlo,Consolas,monospace;" +
    "pointer-events:none;white-space:pre;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.35)";
  document.body.appendChild(el);
  return (html) => {
    el.innerHTML = html;
  };
}

// real time on fixed ticks: as many ticks as wall-clock time allows (a slow machine plays in slow motion)
function runRealtime(engine, each) {
  const env = engine.env;
  let last = env.real.now();
  let acc = 0;
  let paused = false;
  const loop = () => {
    env.real.raf(loop);
    const now = env.real.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt * engine.hz;
      let n = Math.floor(acc);
      acc -= n;
      n = Math.min(n, Math.ceil(engine.hz / 15));
      for (let i = 0; i < n; i++) engine.step();
    }
    if (each) each(dt);
    else engine.renderView(dt);
  };
  env.real.raf(loop);
  return { pause: (p) => (paused = p), get paused() {
    return paused;
  } };
}

function startFromUrl(q) {
  if (q.get("pos")) {
    const p = q.get("pos").split(",").map(Number);
    return { pos: [p[0] || 0, p.length > 2 ? p[1] : 0, p.length > 2 ? p[2] : p[1] || 0], yaw: q.has("yaw") ? +q.get("yaw") : 180 };
  }
  return q.get("start") || null;
}

function reloadWith(set, del = []) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(set)) u.searchParams.set(k, v);
  for (const k of del) u.searchParams.delete(k);
  location.replace(u.toString());
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function startRecorder(engine, q) {
  const env = engine.env;
  const show = panel();
  const hz = +q.get("hz") || 1200;
  const start = startFromUrl(q);
  const seed = 12345;
  const state = q.get("rec") ? "rec" : q.get("play") ? "replay" : "practice";
  const take = { format: "roadster-take/1", simHz: hz, seed, start, autoSlowmo: false, keys: [], pads: [], check: [] };
  let saved = null;
  let playTake = null;

  if (state === "replay") {
    try {
      playTake = JSON.parse(localStorage.getItem(TAKE_KEY) || "null");
    } catch {
      playTake = null;
    }
    if (!playTake) {
      show("No take saved in this browser yet. Enter: record one");
      return;
    }
  }

  // keyboard: control keys are ours; game keys pass (and are recorded) except while replaying
  const held = new Set();
  engine.onRealKey = (e) => {
    const down = e.type === "keydown";
    if (e.code === "Escape") return false; // pausing would desync a take
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (down && !e.repeat) onEnter();
      return false;
    }
    if (e.code === "Backspace") {
      if (down && state === "rec") reloadWith({}, ["rec", "play"]);
      return false;
    }
    if (e.code === "KeyP" && state !== "rec") {
      if (down && !e.repeat) reloadWith({ play: "1" }, ["rec"]);
      return false;
    }
    if (state === "replay") return false;
    if (state === "rec" && !saved) {
      if (down && !held.has(e.code)) {
        held.add(e.code);
        take.keys.push([engine.tick, e.code, e.repeat ? 2 : 1]);
      } else if (!down && held.has(e.code)) {
        held.delete(e.code);
        take.keys.push([engine.tick, e.code, 0]);
      }
    }
    return true;
  };
  engine.onBlur = () => {
    if (state === "rec" && !saved && held.size) {
      take.keys.push([engine.tick, "*", 0]);
      held.clear();
    }
  };
  // gamepads: the game sees quantised values, recorded whenever they change
  engine.recordPads = state !== "replay";
  let lastPad = "";
  engine.onPadSample = (axes, buttons) => {
    if (state !== "rec" || saved) return;
    const key = axes.join(",") + "|" + buttons.join(",");
    if (key === lastPad) return;
    lastPad = key;
    take.pads.push([engine.tick, axes, buttons]);
  };
  const checkTicks = Math.round(CHECK_EVERY * hz);
  engine.onStep = (tick) => {
    if (state === "rec" && !saved && tick % checkTicks === 0) {
      const p = engine.rd.phys.pos;
      take.check.push([tick, p.x, p.y, p.z]);
    }
  };

  function stopAndSave() {
    take.length = engine.tick;
    if (!take.pads.length) delete take.pads;
    take.recorded = new env.real.Date().toISOString();
    take.padQuant = PAD_Q;
    const text = JSON.stringify(take);
    try {
      localStorage.setItem(TAKE_KEY, text);
    } catch (e) {
      console.warn("[capture] take too large for localStorage", e);
    }
    const stamp = take.recorded.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const where = typeof start === "string" ? start : start ? "custom" : "start";
    saved = { name: `take-${where}-${stamp}.json`, seconds: take.length / hz };
    download(saved.name, text);
    console.log("[capture] take saved", saved.name, take);
  }
  function onEnter() {
    if (state === "rec" && !saved) stopAndSave();
    else reloadWith({ rec: "1" }, ["play"]);
  }

  engine.begin(state === "replay" ? playTake : { start, simHz: hz, seed });
  const total = playTake && playTake.length ? playTake.length / playTake.simHz : 0;
  runRealtime(engine, (dt) => {
    const t = engine.time.toFixed(1);
    if (state === "practice") show("PRACTICE · <b>Enter</b> record a take from the start point · <b>P</b> replay the last take");
    else if (state === "rec" && !saved) show(`<span style="color:#ff4d4d">●</span> REC ${t} s · <b>Enter</b> stop and save · <b>Backspace</b> discard`);
    else if (state === "rec") show(`Saved ${saved.name} (${saved.seconds.toFixed(1)} s) · <b>P</b> replay it · <b>Enter</b> new take`);
    else {
      const done = engine.time >= total;
      const drift = engine.checked ? ` · drift ${engine.drift.toFixed(3)} m over ${engine.checked} checks` : "";
      show(`${done ? "Replay done" : "▶ REPLAY " + t + " / " + total.toFixed(1) + " s"}${drift} · <b>Enter</b> record a new take`);
    }
    engine.renderView(dt);
  });
}

async function startPreview(engine, q) {
  const show = panel();
  const url = q.get("shot");
  if (!url) {
    show("Add &shot=shots/name.json to the URL");
    return;
  }
  const shot = await (await fetch(url)).json();
  if (typeof shot.take === "string") shot.take = await (await fetch(new URL(shot.take, new URL(url, location.href)))).json();
  shot.name = shot.name || url.split("/").pop().replace(/\.json$/, "");
  if (q.has("in")) shot.in = +q.get("in");
  else if (parseAnchor(shot.in)) {
    const r = engine.findAnchor(shot.take || {}, shot.in);
    if (r.error) return show(r.error);
    reloadWith({ in: r.in.toFixed(6) });
    return;
  }
  const size = shot.size || [1920, 1080];
  const fit = Math.min(innerWidth / size[0], innerHeight / size[1], 1);
  shot.size = [Math.round(size[0] * fit), Math.round(size[1] * fit)];
  const blur = +q.get("blur") || 0;
  shot.blur = { ...(typeof shot.blur === "object" ? shot.blur : {}), samples: blur };
  shot.aa = 1;
  const canvas = engine.rd.renderer.domElement;
  cleanView(canvas, [document.getElementById("capture-panel")]);
  const st = document.createElement("style");
  st.textContent = ".cap-center { position: fixed !important; left: 50% !important; top: 50% !important; transform: translate(-50%, -50%) !important; }";
  document.head.appendChild(st);
  canvas.classList.add("cap-center");
  const director = new Director(engine, shot);
  const info = director.load();
  let t = 0;
  let paused = false;
  let showPanel = true;
  engine.onRealKey = (e) => {
    if (e.type !== "keydown" || e.repeat) return false;
    if (e.code === "Space") paused = !paused;
    if (e.code === "Enter") location.reload();
    if (e.code === "KeyH") showPanel = !showPanel;
    return false;
  };
  const env = engine.env;
  let last = env.real.now();
  const loop = () => {
    env.real.raf(loop);
    const now = env.real.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) t = Math.min(info.duration, t + dt);
    const r = director.renderAt(director.subTimesAt(t));
    show(
      showPanel
        ? `PREVIEW ${info.name} · ${t.toFixed(2)} / ${info.duration} s · game ${r.game.toFixed(2)} s · ${r.rig} · ${r.mph.toFixed(0)} mph` +
            `${paused ? " · paused" : ""}\n<b>Space</b> pause · <b>Enter</b> restart · <b>H</b> hide`
        : "",
    );
  };
  env.real.raf(loop);
}

export { runRealtime, startPreview, startRecorder };
