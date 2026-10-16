// Capture engine: runs the unmodified game loop one fixed tick at a time on the virtual clock.
//
// - The game's own rendering is switched off during ticks; the director renders explicitly.
// - Input comes from a take (recorded or scripted): synthetic key events, a virtual gamepad and teleports,
//   applied before the tick they belong to. Same take + same build => the same simulation, whatever
//   the output frame rate, motion-blur samples or speed ramps (those only decide when to look).
// - Between two ticks the car hierarchy and the camera targets are interpolated, so slow motion is smooth.
import { Quaternion, Vector3 } from "three";
import { anchorHit, param, parseAnchor } from "./timeline.js";

const DEG = Math.PI / 180;
const TELEPORT_JUMP = 4; // metres per tick; more than this is a teleport and is never interpolated
const PAD_Q = 1024; // gamepad values are quantised so a recorded take replays bit for bit

function smoothDamp(cur, target, vel, smoothTime, dt) {
  if (!(smoothTime > 0)) {
    cur.copy(target);
    vel.set(0, 0, 0);
    return;
  }
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const c of ["x", "y", "z"]) {
    const change = cur[c] - target[c];
    const temp = (vel[c] + omega * change) * dt;
    vel[c] = (vel[c] - omega * temp) * k;
    cur[c] = target[c] + (change + temp) * k;
  }
}

class Follower {
  // kind: "pos" (car position, trailing it by about speed x tau), "lead" (car position without that trailing
  // lag: it tracks position + velocity x tau, so only changes of speed and direction are smoothed),
  // "dir" (horizontal travel direction), "vel" (velocity)
  constructor(kind, tau) {
    this.kind = kind;
    this.tau = tau;
    this.val = new Vector3();
    this.prev = new Vector3();
    this.vel = new Vector3();
  }
  snap(target) {
    this.val.copy(target);
    this.prev.copy(target);
    this.vel.set(0, 0, 0);
  }
  update(target, dt) {
    this.prev.copy(this.val);
    smoothDamp(this.val, target, this.vel, this.tau, dt);
  }
  at(alpha, out = new Vector3()) {
    out.lerpVectors(this.prev, this.val, alpha);
    if (this.kind === "dir") {
      out.y = 0;
      if (out.lengthSq() < 1e-8) out.copy(this.val);
      out.normalize();
    }
    return out;
  }
}

class CarSample {
  constructor() {
    this.pos = new Vector3();
    this.vel = new Vector3();
    this.quat = new Quaternion();
    this.mode = "ground";
  }
  read(p) {
    this.pos.copy(p.pos);
    this.vel.copy(p.vel);
    this.quat.copy(p.quat);
    this.mode = p.mode;
    return this;
  }
  copy(o) {
    this.pos.copy(o.pos);
    this.vel.copy(o.vel);
    this.quat.copy(o.quat);
    this.mode = o.mode;
    return this;
  }
}

// ---------------------------------------------------------------- takes (input tracks)
// Recorded: { format:"roadster-take/1", simHz, seed, start, length, keys:[[tick,code,1|0]], pads:[[tick,axes,buttons]],
//             actions:[[tick,"tp",name]], check:[[tick,x,y,z]] }
// Scripted: { start, input:[[t,"KeyW+ShiftLeft"], [t,""], [t,"tp:lineup"]], pad:{steer:keys, throttle:keys, ...} }
//           input times are take seconds; each entry holds exactly those keys from t on.
const PAD_FIELDS = ["steer", "throttle", "brake", "pitch", "lift", "boost", "drift", "yawL"];

function normalizeTake(take) {
  const t = take || {};
  const hz = +t.simHz || 1200;
  const out = {
    hz,
    seed: t.seed == null ? 12345 : +t.seed,
    start: t.start === undefined ? null : t.start,
    autoSlowmo: !!t.autoSlowmo,
    length: Number.isFinite(+t.length) && +t.length > 0 ? +t.length : Infinity,
    ops: new Map(),
    padSamples: null,
    padCurves: null,
    check: new Map(),
    warnings: [],
  };
  const add = (tick, op) => {
    tick = Math.max(0, Math.round(tick));
    if (!out.ops.has(tick)) out.ops.set(tick, []);
    out.ops.get(tick).push(op);
  };
  const okKey = (code) => {
    if (code === "Escape") {
      out.warnings.push("Escape (pause) in a take is ignored");
      return false;
    }
    return true;
  };
  // down: 1 = pressed, 2 = arrived as an auto-repeat (the game treats those differently), 0 = released
  for (const [tick, code, down] of t.keys || [])
    if (okKey(code)) add(tick, code === "*" ? { type: "release" } : { type: "key", code, down: !!down, repeat: down === 2 });
  for (const [tick, kind, arg] of t.actions || []) if (kind === "tp") add(tick, { type: "tp", arg });
  if (Array.isArray(t.pads) && t.pads.length) out.padSamples = t.pads.map(([tick, axes, buttons]) => [Math.round(tick), axes, buttons]).sort((a, b) => a[0] - b[0]);
  for (const [tick, x, y, z] of t.check || []) out.check.set(Math.round(tick), [x, y, z]);
  if (Array.isArray(t.input)) {
    let held = new Set();
    for (const entry of t.input) {
      const [sec, what] = entry;
      const tick = Math.round(+sec * hz);
      const s = String(what || "");
      if (s.startsWith("tp:")) {
        add(tick, { type: "tp", arg: s.slice(3) });
        continue;
      }
      const next = new Set(s.split("+").map((k) => k.trim()).filter(Boolean).filter(okKey));
      for (const k of held) if (!next.has(k)) add(tick, { type: "key", code: k, down: false });
      for (const k of next) if (!held.has(k)) add(tick, { type: "key", code: k, down: true });
      held = next;
    }
  }
  if (t.pad && typeof t.pad === "object") {
    out.padCurves = {};
    for (const [k, v] of Object.entries(t.pad)) {
      if (!PAD_FIELDS.includes(k)) out.warnings.push(`unknown pad field "${k}" (use ${PAD_FIELDS.join(", ")})`);
      else out.padCurves[k] = param(v, 0, "linear");
    }
  }
  if (Number.isFinite(out.length)) add(out.length, { type: "release" });
  return out;
}

function makePad() {
  return {
    id: "capture-virtual-pad",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
}

// ---------------------------------------------------------------- engine
class Engine {
  constructor(env, rd, { mode = "render" } = {}) {
    this.env = env;
    this.rd = rd;
    this.mode = mode;
    this.hz = 1200;
    this.tick = 0;
    this.t0 = 0;
    this.take = null;
    this.gateOpen = false;
    this.synthetic = 0;
    this.held = new Set();
    this.followers = new Map();
    this.carPrev = new CarSample();
    this.carCur = new CarSample();
    this.nodes = [];
    this.prevBuf = new Float64Array(0);
    this.liveBuf = new Float64Array(0);
    this.prevCount = 0;
    this.interpActive = false;
    this.events = [];
    this.keepEvents = false;
    this.drift = 0;
    this.checked = 0;
    this.onStep = null;
    this.onRealKey = null; // record mode hook
    this.renderRng = env.makeRng(777);
    this.audioRng = env.makeRng(4242);
    this._dir = new Vector3(0, 0, -1);
    this._lead = new Vector3();
    this.gameCam = { pos: new Vector3(), quat: new Quaternion(), fov: 60 };
    this._wrapRenders();
    this._isolateAudio();
    this._keys();
    this._pads();
  }

  // ---- rendering is the director's job; the loop's own render calls do nothing
  _wrapRenders() {
    const rd = this.rd;
    const gate = (obj, name) => {
      if (!obj || typeof obj[name] !== "function") return null;
      const fn = obj[name];
      obj[name] = (...a) => (this.gateOpen ? fn.apply(obj, a) : undefined);
      return fn;
    };
    this._composerRender = gate(rd.composer, "render");
    this._rendererRender = gate(rd.renderer, "render");
  }
  // draw a helper scene directly (the accumulator's quads), bypassing the gate
  rawRender(scene, camera) {
    const r = this.rd.renderer;
    return (this._rendererRender || r.render).call(r, scene, camera);
  }
  renderView(dt) {
    const rd = this.rd;
    this.gateOpen = true;
    try {
      this.env.isolate(this.renderRng, () => {
        if (this._composerRender) rd.composer.render(dt);
        else rd.renderer.render(rd.scene, rd.camera);
      });
    } finally {
      this.gateOpen = false;
    }
  }

  // audio may draw random numbers; give it its own stream so it can never change a take
  _isolateAudio() {
    const a = this.rd.audio;
    if (!a) return;
    const seen = new Set();
    for (let p = a; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const k of Object.getOwnPropertyNames(p)) {
        if (k === "constructor" || seen.has(k)) continue;
        seen.add(k);
        const d = Object.getOwnPropertyDescriptor(p, k);
        if (!d || typeof d.value !== "function") continue;
        const fn = d.value;
        const env = this.env;
        const rng = this.audioRng;
        a[k] = function (...args) {
          return env.isolate(rng, fn, this, args);
        };
      }
    }
  }

  // ---- keyboard: real keys are blocked (except in record mode); takes dispatch synthetic events
  _keys() {
    // onRealKey(e) returns true to let a real key event reach the game (record mode)
    const onKey = (e) => {
      if (this.synthetic) return;
      if (this.onRealKey && this.onRealKey(e)) return;
      e.stopImmediatePropagation();
    };
    addEventListener("keydown", onKey, true);
    addEventListener("keyup", onKey, true);
    // the game clears its key set on blur; mirror that so a recording sees it too
    addEventListener("blur", () => {
      if (this.onBlur) this.onBlur();
    }, true);
  }
  key(code, down, repeat = false) {
    if (down) this.held.add(code);
    else this.held.delete(code);
    this.synthetic++;
    try {
      dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, repeat: !!(down && repeat), bubbles: true, cancelable: true }));
    } finally {
      this.synthetic--;
    }
  }
  releaseAll() {
    for (const k of [...this.held]) this.key(k, false);
  }

  // ---- gamepad: a virtual pad driven by the take; real pads only reach the game in record mode
  _pads() {
    const nav = navigator;
    this.realGetGamepads = nav.getGamepads ? nav.getGamepads.bind(nav) : () => [];
    this.pad = makePad();
    this.padActive = false;
    nav.getGamepads = () => {
      if (this.mode === "record" && this.recordPads) return this._liveQuantisedPad();
      return this.padActive ? [this.pad] : [];
    };
  }
  _liveQuantisedPad() {
    const real = [...this.realGetGamepads()].find((g) => g && g.connected);
    if (!real) return [];
    const q = (v) => Math.round((+v || 0) * PAD_Q) / PAD_Q;
    const axes = [0, 1, 2, 3].map((i) => q(real.axes[i]));
    const buttons = Array.from({ length: 17 }, (_, i) => q(real.buttons[i] ? real.buttons[i].value : 0));
    this._setPad(axes, buttons);
    if (this.onPadSample) this.onPadSample(axes, buttons);
    return [this.pad];
  }
  _setPad(axes, buttons) {
    const p = this.pad;
    for (let i = 0; i < 4; i++) p.axes[i] = +axes[i] || 0;
    for (let i = 0; i < 17; i++) {
      const v = +buttons[i] || 0;
      p.buttons[i].value = v;
      p.buttons[i].pressed = v > 0.5;
      p.buttons[i].touched = v > 0;
    }
  }
  _padFromCurves(t) {
    const c = this.take.padCurves;
    const v = (k) => (c[k] ? +c[k](t) || 0 : 0);
    const axes = [-v("steer"), v("pitch"), 0, 0];
    const b = new Array(17).fill(0);
    b[7] = v("throttle");
    b[6] = v("brake");
    b[0] = v("lift");
    b[5] = v("boost");
    b[1] = v("drift");
    b[4] = v("yawL");
    this._setPad(axes, b);
  }

  // ---- followers: critically damped trackers of the car, stepped every tick in game time
  follower(kind, tau) {
    const key = kind + ":" + (+tau || 0);
    if (!this.followers.has(key)) {
      const f = new Follower(kind, +tau || 0);
      f.snap(this._target(f));
      this.followers.set(key, f);
    }
    return this.followers.get(key);
  }
  _travelDir() {
    // horizontal travel direction: velocity when moving, the nose when slow; held when both point up/down
    const p = this.rd.phys;
    const f = p.fwd;
    const vx = p.vel.x;
    const vz = p.vel.z;
    const s = Math.hypot(vx, vz);
    const w = Math.min(1, Math.max(0, (s - 0.5) / 2.5));
    const nx = s > 1e-6 ? vx / s : 0;
    const nz = s > 1e-6 ? vz / s : 0;
    const dx = f.x * (1 - w) + nx * w;
    const dz = f.z * (1 - w) + nz * w;
    const l = Math.hypot(dx, dz);
    if (l > 0.25) this._dir.set(dx / l, 0, dz / l);
    return this._dir;
  }
  _target(f) {
    const p = this.rd.phys;
    if (f.kind === "pos") return p.pos;
    if (f.kind === "lead") return this._lead.copy(p.vel).multiplyScalar(f.tau).add(p.pos);
    if (f.kind === "vel") return p.vel;
    return this._travelDir();
  }

  // ---- take lifecycle
  begin(take) {
    const rd = this.rd;
    const env = this.env;
    this.take = normalizeTake(take);
    this.hz = this.take.hz;
    env.seed(this.take.seed);
    env.armTimers();
    if (this.mode !== "record" && rd.audio) rd.audio.init = () => {};
    if (rd.game) rd.game.autoSlowmo = this.take.autoSlowmo;
    this.padActive = !!(this.take.padSamples || this.take.padCurves);
    this.padIdx = 0;
    rd.startGame();
    this.applyStart(this.take.start);
    this._lastMode = rd.phys.mode;
    this._lastCut = rd.rig ? rd.rig.cut || null : null;
    this.tick = 0;
    this.t0 = env.now;
    this._afterMove();
    return this.take;
  }
  applyStart(start) {
    const rd = this.rd;
    if (start === null || start === undefined) return;
    const s = typeof start === "string" ? { tp: start } : start;
    if (s.tp) rd.teleport(s.tp);
    if (s.pos) {
      const yaw = (s.yaw === undefined ? 180 : +s.yaw) * DEG;
      const pos = new Vector3(+s.pos[0] || 0, +s.pos[1] || 0, +s.pos[2] || 0);
      rd.phys.reset(pos, yaw);
      const r = rd.rig;
      if (r && r.pos && r.behind) {
        r.cut = null;
        r.pos.copy(pos).add(new Vector3(-Math.sin(yaw) * 8, 3, -Math.cos(yaw) * 8));
        r.behind.set(Math.sin(yaw), 0, Math.cos(yaw));
      }
    }
    const speed = s.mph !== undefined ? +s.mph / 2.236936 : +s.speed || 0;
    if (speed) {
      const p = rd.phys;
      const dir = Number.isFinite(p.yaw) ? new Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)) : p.fwd;
      p.vel.copy(dir).multiplyScalar(speed);
    }
  }
  // the car's scene object, the hierarchy that gets interpolated (tolerant of a rebuilt car module)
  get carRoot() {
    const c = this.rd.car;
    return (c && (c.root || c.group || (c.isObject3D ? c : null))) || null;
  }
  _afterMove() {
    // after a teleport: followers and interpolation restart from the new pose
    const rd = this.rd;
    if (this.carRoot) this.carRoot.updateMatrixWorld(true);
    for (const f of this.followers.values()) f.snap(this._target(f));
    this.carCur.read(rd.phys);
    this.carPrev.copy(this.carCur);
    this.prevCount = 0;
  }

  _applyOps(tick) {
    const take = this.take;
    if (!take) return;
    const ops = take.ops.get(tick);
    if (ops)
      for (const op of ops) {
        if (op.type === "key") {
          if (op.down !== this.held.has(op.code)) this.key(op.code, op.down, op.repeat);
        } else if (op.type === "release") this.releaseAll();
        else if (op.type === "tp") {
          if (typeof op.arg === "string") this.rd.teleport(op.arg);
          else this.applyStart(op.arg);
        }
      }
    if (take.padSamples) {
      const s = take.padSamples;
      let changed = false;
      while (this.padIdx < s.length && s[this.padIdx][0] <= tick) {
        this.padIdx++;
        changed = true;
      }
      if (changed) {
        const [, axes, buttons] = s[this.padIdx - 1];
        this._setPad(axes, buttons);
      }
    } else if (take.padCurves) this._padFromCurves(tick / this.hz);
  }

  // one fixed tick of the game loop (no rendering)
  step() {
    const rd = this.rd;
    const env = this.env;
    const dt = 1 / this.hz;
    this._snapshot();
    this._applyOps(this.tick);
    if (this.beforeTick) this.beforeTick(this.tick);
    this.carPrev.copy(this.carCur);
    env.setNow(this.t0 + ((this.tick + 1) * 1000) / this.hz);
    env.fireTimers();
    this.gateOpen = false;
    env.frame();
    this.tick++;
    if (this.carRoot) this.carRoot.updateMatrixWorld(true);
    const gc = this.gameCam;
    gc.pos.copy(rd.camera.position);
    gc.quat.copy(rd.camera.quaternion);
    gc.fov = rd.camera.fov;
    const p = rd.phys;
    const jumped = p.pos.distanceTo(this.carPrev.pos) > TELEPORT_JUMP;
    this.carCur.read(p);
    for (const f of this.followers.values()) {
      if (jumped) f.snap(this._target(f));
      else f.update(this._target(f), dt);
    }
    if (jumped) this.prevCount = 0;
    const cut = rd.rig ? rd.rig.cut || null : null;
    if (this.keepEvents) {
      const t = +(this.tick / this.hz).toFixed(4);
      if (p.events && p.events.length) for (const e of p.events) this.events.push({ t, ...e });
      if (p.mode !== this._lastMode) this.events.push({ t, type: "mode", value: p.mode });
      if (cut && cut !== this._lastCut) this.events.push({ t, type: "cut", value: String(cut.kind || "cut") });
    }
    this._lastMode = p.mode;
    this._lastCut = cut;
    if (this.take && this.take.check.size) {
      const c = this.take.check.get(this.tick);
      if (c) {
        this.drift = Math.max(this.drift, Math.hypot(p.pos.x - c[0], p.pos.y - c[1], p.pos.z - c[2]));
        this.checked++;
      }
    }
    if (this.onStep) this.onStep(this.tick);
  }

  get time() {
    return this.tick / this.hz;
  }

  // Run a take from its start until an in-point anchor (timeline.js parseAnchor) and return its game time.
  // The page has then simulated past that moment: render the shot after a reload, with "in" set to the result.
  findAnchor(take, anchor, until = 120) {
    const a = parseAnchor(anchor);
    if (!a) return { error: `${JSON.stringify(anchor)} is not an anchor` };
    this.keepEvents = true;
    this.begin(take || {});
    const end = Math.ceil(until * this.hz);
    let seen = 0;
    while (this.tick < end) {
      const from = this.events.length;
      this.step();
      for (let i = from; i < this.events.length; i++) {
        const e = this.events[i];
        if (anchorHit(a, e) && ++seen === a.n) {
          const at = this.time;
          return { label: a.label, type: e.type, at, in: Math.max(0, at + a.offset), tick: this.tick };
        }
      }
    }
    return { error: `in-point ${a.label}: ${seen ? `only ${seen} found` : "not found"} in the first ${until} s of the take` };
  }

  // Advance the simulation so game time g lies in the last tick interval.
  // Returns alpha: the render state is lerp(previous tick, current tick, alpha).
  advanceTo(g) {
    const x = Math.max(0, g) * this.hz;
    const K = Math.max(0, Math.ceil(x - 1e-6));
    while (this.tick < K) this.step();
    if (this.tick === 0 || this.prevCount === 0) return 1;
    return Math.min(1, Math.max(0, x - (this.tick - 1)));
  }

  // ---- car hierarchy snapshot (taken before every tick) and interpolation
  _snapshot() {
    const nodes = this.nodes;
    let n = 0;
    const root = this.carRoot;
    if (root)
      root.traverse((o) => {
        nodes[n++] = o;
      });
    nodes.length = n;
    if (this.prevBuf.length < n * 10) {
      this.prevBuf = new Float64Array(n * 12);
      this.liveBuf = new Float64Array(n * 12);
    }
    const b = this.prevBuf;
    for (let i = 0; i < n; i++) {
      const o = nodes[i];
      const j = i * 10;
      b[j] = o.position.x;
      b[j + 1] = o.position.y;
      b[j + 2] = o.position.z;
      b[j + 3] = o.quaternion.x;
      b[j + 4] = o.quaternion.y;
      b[j + 5] = o.quaternion.z;
      b[j + 6] = o.quaternion.w;
      b[j + 7] = o.scale.x;
      b[j + 8] = o.scale.y;
      b[j + 9] = o.scale.z;
    }
    this.prevCount = n;
  }
  applyInterp(alpha) {
    this.interpActive = false;
    const n = this.prevCount;
    if (!(alpha < 1) || !n) return;
    const nodes = this.nodes;
    const a = this.prevBuf;
    const live = this.liveBuf;
    const q0 = new Quaternion();
    const q1 = new Quaternion();
    for (let i = 0; i < n; i++) {
      const o = nodes[i];
      const j = i * 10;
      live[j] = o.position.x;
      live[j + 1] = o.position.y;
      live[j + 2] = o.position.z;
      live[j + 3] = o.quaternion.x;
      live[j + 4] = o.quaternion.y;
      live[j + 5] = o.quaternion.z;
      live[j + 6] = o.quaternion.w;
      live[j + 7] = o.scale.x;
      live[j + 8] = o.scale.y;
      live[j + 9] = o.scale.z;
      o.position.set(a[j] + (live[j] - a[j]) * alpha, a[j + 1] + (live[j + 1] - a[j + 1]) * alpha, a[j + 2] + (live[j + 2] - a[j + 2]) * alpha);
      q0.set(a[j + 3], a[j + 4], a[j + 5], a[j + 6]);
      q1.set(live[j + 3], live[j + 4], live[j + 5], live[j + 6]);
      o.quaternion.slerpQuaternions(q0, q1, alpha);
      o.scale.set(a[j + 7] + (live[j + 7] - a[j + 7]) * alpha, a[j + 8] + (live[j + 8] - a[j + 8]) * alpha, a[j + 9] + (live[j + 9] - a[j + 9]) * alpha);
    }
    this.interpActive = true;
    this.carRoot.updateMatrixWorld(true);
  }
  restoreInterp() {
    if (!this.interpActive) return;
    const nodes = this.nodes;
    const live = this.liveBuf;
    for (let i = 0; i < this.prevCount; i++) {
      const o = nodes[i];
      const j = i * 10;
      o.position.set(live[j], live[j + 1], live[j + 2]);
      o.quaternion.set(live[j + 3], live[j + 4], live[j + 5], live[j + 6]);
      o.scale.set(live[j + 7], live[j + 8], live[j + 9]);
    }
    this.interpActive = false;
    if (this.carRoot) this.carRoot.updateMatrixWorld(true);
  }

  // the car as the camera should see it at the current interpolation point
  carAt(alpha) {
    const a = this.carPrev;
    const b = this.carCur;
    const pos = new Vector3().lerpVectors(a.pos, b.pos, alpha);
    const vel = new Vector3().lerpVectors(a.vel, b.vel, alpha);
    const quat = new Quaternion().slerpQuaternions(a.quat, b.quat, alpha);
    const fwd = new Vector3(0, 0, 1).applyQuaternion(quat);
    const up = new Vector3(0, 1, 0).applyQuaternion(quat);
    const left = new Vector3(1, 0, 0).applyQuaternion(quat);
    return { pos, vel, quat, fwd, up, left, speed: vel.length(), mode: b.mode };
  }
}

export { DEG, Engine, Follower, PAD_FIELDS, PAD_Q, normalizeTake, smoothDamp };
