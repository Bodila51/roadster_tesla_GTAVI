// Director: turns a shot file into frames.
// For output frame i it renders N sub-frames (motion blur across the shutter, jittered for anti-aliasing),
// each at its own shot time: shot time -> game time (speed ramps) -> simulation, interpolated car,
// camera rig -> render. The sub-frames are averaged and the frame is read back as a PNG.
//
// Shot file (shots/*.json). Times are shot seconds unless marked game seconds.
//   name       output name (default: the file name)
//   size       [1920, 1080] or "1080x1920"          fps  30          duration  3
//   blur       motion blur: 8 or { samples: 8, shutter: 0.5 }  (shutter = fraction of a frame; 0.5 is 180 degrees)
//   aa         jittered sub-frames per frame when blur is off (anti-aliasing); jitter: false turns jitter off
//   shadows    "subframe" (default) or "frame": draw shadow maps once per output frame, on its first sub-frame.
//              About a third faster per extra sub-frame in software WebGL; a fast car's shadow then does not smear.
//   take       the input: an object, or a path to a take JSON (recorded with ?capture=record)
//   in         game second the shot starts at, or an anchor: "launch", "launch-0.1", "land#2", "cut:lineup" (timeline.js)
//   time       playback speed: 1, or keys [[t, speed, ease], ...]; 0.25 is quarter-speed, 0 freezes the game
//              while the cameras keep moving (orbit freeze-frame); game time = in + integral of speed
//   camera     one camera, or cameras: [{ ..., at: 0 }, { ..., at: 1.2, blend: 0.4 }] (cut, or blend seconds)
//              { rig, lens (mm) | fov | hfov, roll, shake: { amp, freq, pos }, ...rig params } (rigs.js)
//   dof        { focus: "car" | metres | keys, range: metres kept sharp around focus, bokeh: px at 1080p }
//   hide       ["rings", "name:<object name>"]
//   query      extra game URL parameters for tools/capture.mjs, e.g. "tod=golden" or { "tod": "golden" }
// Take: { start: "lineup" | { pos: [x, y, z], yaw: degrees, speed: m/s | mph }, seed, simHz (1200),
//         autoSlowmo: true keeps the game's own slow motion (inverted exit, lineup flyover; off by default),
//         input: [[sec, "KeyW+ShiftLeft"], [sec, ""], [sec, "tp:ramp"]]   keys held from sec on (KeyboardEvent.code)
//         pad: { steer|throttle|brake|pitch|lift|boost|drift|yawL: value or keys }   analog virtual gamepad
//         recorded takes carry keys: [[tick, code, 1|0]], pads: [[tick, axes, buttons]], check: [[tick, x, y, z]] }
// Any number or vector can be keyframed: [[t, value], [t, value, "ease"]] (linear, in, out, inOut, sine, smooth,
// expo, hold, spline); { keys, ease } sets a default ease. Camera keys use shot time, not time since "at".
import { Vector3 } from "three";
import { Accumulator } from "./accum.js";
import { addDepthOfField } from "./dof.js";
import { makeCameraTrack } from "./rigs.js";
import { TimeCurve, param, parseAnchor } from "./timeline.js";

const DEFAULTS = {
  name: "shot",
  fps: 30,
  duration: 3,
  size: [1920, 1080],
  in: 0,
  time: 1,
  blur: { samples: 0, shutter: 0.5 },
  aa: 1,
};

function halton(i, b) {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}

function normalizeShot(s) {
  const shot = { ...DEFAULTS, ...s };
  if (typeof shot.size === "string") shot.size = shot.size.split("x").map(Number);
  const b = shot.blur;
  shot.blur = typeof b === "number" ? { samples: b, shutter: 0.5 } : { samples: 0, shutter: 0.5, ...(b || {}) };
  shot.frames = Math.max(1, Math.round(shot.duration * shot.fps));
  if (!shot.camera && !shot.cameras) shot.camera = { rig: "track" };
  return shot;
}

class Director {
  constructor(engine, shotSpec) {
    this.engine = engine;
    this.rd = engine.rd;
    this.shot = normalizeShot(shotSpec);
    this.warnings = [];
  }

  load() {
    const shot = this.shot;
    const eng = this.engine;
    const rd = this.rd;
    const a = parseAnchor(shot.in);
    if (a) throw new Error(`in-point ${a.label} must be resolved to game seconds first (__cap.resolve; tools/capture.mjs and preview do it)`);
    const take = eng.begin(shot.take || {});
    this.warnings.push(...take.warnings);
    this.curve = new TimeCurve(shot.time, shot.in, shot.duration);
    this.track = makeCameraTrack(shot.cameras || shot.camera, eng);
    this.setSize(shot.size[0], shot.size[1]);
    if (shot.dof) {
      this.dof = addDepthOfField(rd);
      this.dofFocus = shot.dof.focus === undefined || shot.dof.focus === "car" ? null : param(shot.dof.focus);
      this.dofRange = param(shot.dof.range, 4);
      this.dofBokeh = param(shot.dof.bokeh, 2);
      if (!this.dof) this.warnings.push("depth of field unavailable with this post stack");
    }
    const samples = Math.max(1, Math.round(shot.blur.samples > 1 ? shot.blur.samples : shot.aa || 1));
    this.samples = samples;
    this.accum = samples > 1 ? new Accumulator(rd.renderer, (s, c) => eng.rawRender(s, c)) : null;
    return this.info();
  }

  info() {
    const s = this.shot;
    return {
      name: s.name,
      fps: s.fps,
      frames: s.frames,
      duration: s.duration,
      size: s.size,
      samples: this.samples,
      blur: s.blur.samples > 1 ? s.blur : null,
      simHz: this.engine.hz,
      gameIn: this.curve.game(0),
      gameOut: this.curve.game(s.duration),
      rigs: this.track.cams.map((c) => `${c.name}@${c.at}`),
      warnings: this.warnings,
    };
  }

  setSize(w, h) {
    const rd = this.rd;
    this.w = w;
    this.h = h;
    rd.renderer.setPixelRatio(1);
    if (rd.composer && rd.composer.setSize) rd.composer.setSize(w, h);
    else rd.renderer.setSize(w, h);
    rd.camera.aspect = w / h;
    rd.camera.updateProjectionMatrix();
  }

  subTimes(i) {
    return this.subTimesAt(i / this.shot.fps);
  }
  // shot times of the sub-frames of an output frame centred on shot time T
  subTimesAt(T) {
    const s = this.shot;
    const n = this.samples;
    if (s.blur.samples > 1) {
      const span = Math.max(0, Math.min(1, s.blur.shutter)) / s.fps;
      return Array.from({ length: n }, (_, k) => T + span * ((k + 0.5) / n - 0.5));
    }
    return new Array(n).fill(T);
  }

  // advance to frame i without rendering (partial renders, stills). The cameras are still evaluated at every
  // skipped frame, so a rig that keeps state (a static camera locking its aim at the cut) matches a full render.
  skipTo(i) {
    const end = Math.min(i, this.shot.frames);
    for (let j = this.next || 0; j < end; j++)
      for (const t of this.subTimes(j)) {
        const alpha = this.engine.advanceTo(this.curve.game(t));
        this.engine.applyInterp(alpha);
        this.track.eval(this._ctx(t, alpha));
        this.engine.restoreInterp();
      }
    this.next = Math.max(this.next || 0, end);
  }
  _ctx(t, alpha) {
    const eng = this.engine;
    const rd = this.rd;
    return {
      t: Math.max(0, t),
      car: eng.carAt(alpha),
      follow: (f) => f.at(alpha),
      body: (rd.car && rd.car.body) || eng.carRoot,
      gameCam: eng.gameCam,
      aspect: this.w / this.h,
    };
  }

  hide() {
    const rd = this.rd;
    const list = this.shot.hide || [];
    for (const h of list) {
      if (h === "rings" && rd.game && Array.isArray(rd.game.rings))
        for (const r of rd.game.rings) if (r && r.m) r.m.visible = false;
      if (typeof h === "string" && h.startsWith("name:")) {
        const o = rd.scene.getObjectByName(h.slice(5));
        if (o) o.visible = false;
      }
      // overhead wires and their 13 m poles (environment.js), which cut across wide promo frames
      if (h === "wires")
        rd.scene.traverse((o) => {
          const p = o.geometry && o.geometry.parameters;
          if (o.isLine || (o.isMesh && p && (p.height === 13 || (p.depth === 3.2 && p.width === 0.15)))) o.visible = false;
        });
    }
  }

  // render output frame i onto the canvas; returns telemetry
  renderFrame(i) {
    this.skipTo(i);
    // the post stack's clock (film grain) reads (i + 1) / fps at frame i, however the render started
    const clock = (i + 1) / this.shot.fps;
    const r = this.renderAt(this.subTimes(i), Math.max(0, clock - (this.clock || 0)));
    this.clock = Math.max(this.clock || 0, clock);
    this.next = Math.max(this.next || 0, i + 1);
    r.i = i;
    return r;
  }
  // render the given sub-frame shot times, averaged into one image on the canvas.
  // delta: seconds the composer's clock advances on the first sub-frame (the rest add nothing)
  renderAt(times, delta = 1 / this.shot.fps) {
    const eng = this.engine;
    const rd = this.rd;
    const cam = rd.camera;
    const { w, h } = this;
    const n = times.length;
    const jitter = n > 1 && this.shot.jitter !== false;
    const sm = rd.renderer.shadowMap;
    const shadowAuto = sm.autoUpdate;
    const shadowOnce = n > 1 && this.shot.shadows === "frame";
    if (this.accum) this.accum.begin();
    let last = null;
    for (let k = 0; k < n; k++) {
      const t = times[k];
      const g = this.curve.game(t);
      const alpha = eng.advanceTo(g);
      eng.applyInterp(alpha);
      const ctx = this._ctx(t, alpha);
      const car = ctx.car;
      const c = this.track.eval(ctx);
      cam.position.copy(c.pos);
      cam.quaternion.copy(c.quat);
      cam.fov = c.fov;
      cam.aspect = w / h;
      if (jitter) cam.setViewOffset(w, h, halton(k + 1, 2) - 0.5, halton(k + 1, 3) - 0.5, w, h);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      if (this.dof) {
        const fwd = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const focus = this.dofFocus ? this.dofFocus(ctx.t) : Math.max(0.5, car.pos.clone().sub(cam.position).dot(fwd));
        this.dof.set(focus, this.dofRange(ctx.t), this.dofBokeh(ctx.t), k * 1.7);
      }
      this.hide();
      if (shadowOnce) sm.autoUpdate = k === 0 ? shadowAuto : false;
      eng.renderView(k === 0 ? delta : 0);
      if (this.accum) this.accum.add(1 / n);
      if (jitter) cam.clearViewOffset();
      eng.restoreInterp();
      last = { t, g, car, rig: c.rig, fov: c.fov, pos: c.pos };
    }
    sm.autoUpdate = shadowAuto;
    if (this.accum) this.accum.resolve();
    const r = (v) => +v.toFixed(3);
    return {
      t: r(last.t),
      game: r(last.g),
      tick: eng.tick,
      rig: last.rig,
      fov: r(last.fov),
      cam: last.pos.toArray().map(r),
      car: last.car.pos.toArray().map(r),
      mode: last.car.mode,
      mph: r(last.car.speed * 2.236936),
    };
  }
}

export { Director, halton, normalizeShot };
