// Camera rigs for cinematic shots. Each rig turns (shot time, car state) into a camera.
//
// Conventions: metres and degrees. Offsets relative to the car use [left, up, forward] in the car's travel
// frame (forward = smoothed horizontal travel direction, left = the car's left). Any number or vector
// parameter can be keyframed: [[t, value], [t, value, "ease"]] with t in shot seconds.
// Common to every rig: lens (mm, full-frame equivalent across the diagonal) or fov (vertical degrees) or hfov,
// roll (Dutch angle, degrees), shake {amp: degrees, freq: Hz, pos: metres}.
// follow / lookFollow are smoothing times in seconds. The smoothing does not trail a fast car (it tracks
// position + velocity x time), so offsets hold at any speed; lag: true gives the plain trailing follow.
import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import { EASE, param } from "./timeline.js";

const DEG = Math.PI / 180;
const Y = new Vector3(0, 1, 0);
const v3 = (a) => new Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);

function lensToFov(mm, aspect) {
  const h = 43.267 / Math.sqrt(1 + aspect * aspect); // frame height of a 35mm-diagonal frame at this aspect
  return (2 * Math.atan(h / (2 * mm))) / DEG;
}
function hfovToFov(h, aspect) {
  return (2 * Math.atan(Math.tan((h * DEG) / 2) / aspect)) / DEG;
}
const _m = new Matrix4();
function lookQuat(pos, target, up) {
  const dir = new Vector3().subVectors(target, pos);
  if (dir.lengthSq() < 1e-10) dir.set(0, 0, -1);
  let u = up;
  if (Math.abs(dir.clone().normalize().dot(u)) > 0.999) u = new Vector3(0, 0, -1);
  _m.lookAt(pos, target, u);
  return new Quaternion().setFromRotationMatrix(_m);
}
// smooth deterministic noise in [-1, 1]
function noise(x, s) {
  return (Math.sin(x + s) + 0.6 * Math.sin(2.37 * x + 1.7 * s) + 0.35 * Math.sin(5.13 * x + 2.3 * s)) / 1.95;
}
const leftOf = (f) => new Vector3().crossVectors(Y, f).normalize();
const posFollower = (eng, spec, tau) => eng.follower(spec.lag ? "pos" : "lead", tau);
const flat = (v, fallback) => {
  const o = new Vector3(v.x, 0, v.z);
  return o.lengthSq() > 1e-6 ? o.normalize() : fallback ? fallback.clone() : new Vector3(0, 0, -1);
};

// ---------------------------------------------------------------- rigs
// Each factory: (spec, engine) -> { lens, eval(ctx) -> { pos, look, up } }
// ctx: { t, car:{pos,vel,quat,fwd,up,left,speed,mode}, follow(f) -> Vector3, body: Object3D, gameCam }
const RIGS = {
  // Low tracking vehicle: follows beside / ahead of / behind the car at bumper height.
  track(spec, eng) {
    const offset = param(spec.offset, [4.5, 0.45, 1.5]);
    const look = param(spec.look, [0, 0.55, 0]);
    const frame = spec.frame || "travel"; // travel | heading | world
    const ground = spec.ground !== false; // camera height is above the ground, not above the car
    const fp = posFollower(eng, spec, spec.follow === undefined ? 0.12 : spec.follow);
    const fd = eng.follower("dir", spec.turn === undefined ? 0.35 : spec.turn);
    const fl = spec.lookFollow ? posFollower(eng, spec, spec.lookFollow) : null;
    return {
      lens: 28,
      eval(c) {
        const o = offset(c.t);
        const a = look(c.t);
        const anchor = c.follow(fp);
        let pos;
        let f;
        if (frame === "world") {
          f = new Vector3(0, 0, 1);
          pos = anchor.clone().add(v3(o));
          if (ground) pos.y = o[1];
        } else {
          f = frame === "heading" ? flat(c.car.fwd) : c.follow(fd);
          const l = leftOf(f);
          pos = anchor.clone().addScaledVector(l, o[0]).addScaledVector(f, o[2]);
          pos.y = ground ? o[1] : anchor.y + o[1];
        }
        pos.y = Math.max(0.12, pos.y);
        const base = fl ? c.follow(fl) : c.car.pos.clone();
        const l = leftOf(f);
        const target = base.addScaledVector(l, a[0]).addScaledVector(Y, a[1]).addScaledVector(f, a[2]);
        return { pos, look: target, up: Y };
      },
    };
  },

  // Orbit around the car (or a fixed point). With speed 0 in the time curve this is the freeze-frame orbit.
  orbit(spec, eng) {
    const angle = param(spec.angle, 90); // 0 = in front, 90 = the car's left, 180 = behind
    const radius = param(spec.radius, 7);
    const height = param(spec.height, 1.2);
    const offset = param(spec.offset, [0, 0.5, 0]);
    const lookOffset = param(spec.lookOffset, [0, 0, 0]);
    const relative = spec.relative || "travel"; // travel | heading | world
    const fixed = Array.isArray(spec.center) ? v3(spec.center) : null;
    const fc = spec.follow ? posFollower(eng, spec, spec.follow) : null;
    const fd = eng.follower("dir", spec.turn === undefined ? 0.5 : spec.turn);
    return {
      lens: 35,
      eval(c) {
        const center = (fixed ? fixed.clone() : fc ? c.follow(fc) : c.car.pos.clone()).add(v3(offset(c.t)));
        const f = relative === "world" ? new Vector3(0, 0, 1) : relative === "heading" ? flat(c.car.fwd) : c.follow(fd);
        const l = leftOf(f);
        const a = angle(c.t) * DEG;
        const pos = center
          .clone()
          .addScaledVector(f, Math.cos(a) * radius(c.t))
          .addScaledVector(l, Math.sin(a) * radius(c.t))
          .addScaledVector(Y, height(c.t));
        return { pos, look: center.clone().add(v3(lookOffset(c.t))), up: Y };
      },
    };
  },

  // Camera on a fixed (or keyframed) point, panning to follow the car. frame: metres of world kept in the
  // frame height at the car's distance, which turns it into an auto-zooming telephoto.
  fixed(spec, eng) {
    const pos = param(spec.pos, [30, 1.6, -60], "spline");
    const lookSpec = spec.look === undefined ? "car" : spec.look;
    const look = lookSpec === "car" ? null : param(lookSpec, [0, 0, 0], "spline");
    const lookOffset = param(spec.lookOffset, [0, 0.6, 0]);
    const fl = lookSpec === "car" && spec.lookFollow ? posFollower(eng, spec, spec.lookFollow) : null;
    const frame = spec.frame === undefined ? null : param(spec.frame);
    let locked = null;
    return {
      lens: spec.frame === undefined ? 50 : undefined,
      eval(c) {
        const p = v3(pos(c.t));
        let target;
        if (look) target = v3(look(c.t));
        else {
          target = (fl ? c.follow(fl) : c.car.pos.clone()).add(v3(lookOffset(c.t)));
          if (spec.lock) target = locked || (locked = target.clone());
        }
        const out = { pos: p, look: target, up: Y };
        if (frame) out.fov = (2 * Math.atan(frame(c.t) / 2 / Math.max(0.5, p.distanceTo(target)))) / DEG;
        return out;
      },
    };
  },

  // Drone: "top" looks straight down; "follow" flies behind and above with heavy smoothing.
  drone(spec, eng) {
    const mode = spec.mode || "follow";
    const height = param(spec.height, mode === "top" ? 28 : 11);
    const distance = param(spec.distance, 16);
    const angle = param(spec.angle, mode === "top" ? 0 : 180);
    const lookOffset = param(spec.lookOffset, [0, 0.5, 0]);
    const fp = posFollower(eng, spec, spec.follow === undefined ? 0.6 : spec.follow);
    const fd = eng.follower("dir", spec.turn === undefined ? 1.2 : spec.turn);
    return {
      lens: mode === "top" ? 28 : 24,
      eval(c) {
        const anchor = c.follow(fp);
        const f0 = spec.north ? new Vector3(0, 0, -1) : c.follow(fd);
        const a = angle(c.t) * DEG;
        const f = f0.clone().applyAxisAngle(Y, a);
        if (mode === "top") {
          const pos = anchor.clone().addScaledVector(Y, height(c.t));
          return { pos, look: anchor.clone(), up: f };
        }
        const pos = anchor
          .clone()
          .addScaledVector(f0, Math.cos(a) * distance(c.t))
          .addScaledVector(leftOf(f0), Math.sin(a) * distance(c.t))
          .addScaledVector(Y, height(c.t));
        return { pos, look: c.car.pos.clone().add(v3(lookOffset(c.t))), up: Y };
      },
    };
  },

  // FPV drone chasing close behind, banking into turns.
  fpv(spec, eng) {
    const distance = param(spec.distance, 3.4);
    const height = param(spec.height, 1.15);
    const lead = param(spec.lead, 7);
    const bank = spec.bank === undefined ? 0.35 : +spec.bank; // seconds: roll = bank * yaw rate
    const fp = posFollower(eng, spec, spec.follow === undefined ? 0.08 : spec.follow);
    const fd = eng.follower("dir", spec.turn === undefined ? 0.2 : spec.turn);
    return {
      lens: 16,
      eval(c) {
        const anchor = c.follow(fp);
        const f = c.follow(fd);
        const dv = fd.vel;
        const yawRate = f.z * dv.x - f.x * dv.z; // rad/s
        const roll = MathUtils.clamp(-yawRate * bank, -0.6, 0.6) / DEG;
        const pos = anchor.clone().addScaledVector(f, -distance(c.t)).addScaledVector(Y, height(c.t));
        pos.y = Math.max(0.3, pos.y);
        const look = c.car.pos.clone().addScaledVector(f, lead(c.t)).addScaledVector(Y, 0.4);
        return { pos, look, up: Y, roll };
      },
    };
  },

  // Camera bolted to the car body. offset/look are car-local [left, up, forward]. level: keep the horizon flat.
  mount(spec) {
    const offset = param(spec.offset, [0, 0.45, 2.35]);
    const look = param(spec.look, [0, 0.55, 14]);
    return {
      lens: 18,
      eval(c) {
        const body = c.body;
        const pos = body.localToWorld(v3(offset(c.t)));
        const target = body.localToWorld(v3(look(c.t)));
        const up = spec.level ? Y : c.car.up.clone();
        return { pos, look: target, up };
      },
    };
  },

  // Crane: a camera on an arm around a base point, rising (or falling) while it looks at the car.
  crane(spec, eng) {
    const base = param(spec.base, [20, 0, -60], "spline");
    const height = param(spec.height, [[0, 0.6], [3, 14]]);
    const reach = param(spec.reach, 0);
    const swing = param(spec.swing, 0);
    const lookOffset = param(spec.lookOffset, [0, 0.6, 0]);
    const lookSpec = spec.look === undefined ? "car" : spec.look;
    const look = lookSpec === "car" ? null : param(lookSpec, [0, 0, 0], "spline");
    const fl = !look && spec.lookFollow ? posFollower(eng, spec, spec.lookFollow) : null;
    return {
      lens: 28,
      eval(c) {
        const b = v3(base(c.t));
        const a = swing(c.t) * DEG;
        const pos = b.add(new Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(reach(c.t)));
        pos.y = b.y + height(c.t);
        const target = look ? v3(look(c.t)) : (fl ? c.follow(fl) : c.car.pos.clone()).add(v3(lookOffset(c.t)));
        return { pos, look: target, up: Y };
      },
    };
  },

  // Keyframed path (Catmull-Rom through the pos keys by default) looking at the car or at keyframed points.
  path(spec, eng) {
    return RIGS.fixed({ ...spec, pos: spec.pos || [[0, [10, 2, -40]], [3, [0, 2, -60]]] }, eng);
  },

  // Whatever the game's own camera director shows (chase, broadcast, drone or bumper).
  game(spec, eng) {
    if (spec.mode && eng.rd.rig) eng.rd.rig.mode = spec.mode;
    return {
      lens: undefined,
      eval(c) {
        const g = c.gameCam;
        return { pos: g.pos.clone(), quat: g.quat.clone(), fov: g.fov };
      },
    };
  },
};
RIGS.telephoto = (spec, eng) => RIGS.fixed({ frame: 9, lookFollow: 0.12, ...spec }, eng);
RIGS.static = (spec, eng) => RIGS.fixed({ lock: spec.look === undefined, ...spec }, eng);
RIGS.bumper = (spec, eng) => RIGS.mount({ offset: [0, 0.45, 2.35], look: [0, 0.55, 14], ...spec }, eng);

// ---------------------------------------------------------------- camera = rig + lens + roll + shake
function makeCamera(spec, eng) {
  const name = spec.rig || "track";
  const factory = RIGS[name];
  if (!factory) throw new Error(`unknown rig "${name}" (use ${Object.keys(RIGS).join(", ")})`);
  const rig = factory(spec, eng);
  const lens = spec.lens !== undefined ? param(spec.lens) : null;
  const fov = spec.fov !== undefined ? param(spec.fov) : null;
  const hfov = spec.hfov !== undefined ? param(spec.hfov) : null;
  const roll = param(spec.roll, 0);
  const shake = spec.shake ? { amp: 0.15, freq: 1.1, pos: 0, seed: 1, ...spec.shake } : null;
  const shakeAmp = shake ? param(shake.amp) : null;
  return {
    name,
    at: +spec.at || 0,
    blend: +spec.blend || 0,
    blendEase: spec.blendEase || "inOut",
    eval(c) {
      const r = rig.eval(c);
      let f;
      if (fov) f = fov(c.t);
      else if (hfov) f = hfovToFov(hfov(c.t), c.aspect);
      else if (lens) f = lensToFov(lens(c.t), c.aspect);
      else if (r.fov !== undefined) f = r.fov;
      else f = lensToFov(rig.lens || 35, c.aspect);
      const pos = r.pos.clone();
      let quat = r.quat ? r.quat.clone() : lookQuat(pos, r.look, r.up || Y);
      const rollDeg = (r.roll || 0) + roll(c.t);
      if (shake) {
        const w = c.t * shake.freq * Math.PI * 2;
        const amp = shakeAmp(c.t);
        const yaw = amp * noise(w, shake.seed * 3.1) * DEG;
        const pitch = amp * noise(w * 0.93, shake.seed * 7.7 + 2) * DEG;
        quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
        quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch));
        if (shake.pos) pos.add(new Vector3(noise(w * 0.71, 11), noise(w * 0.83, 13), noise(w * 0.77, 17)).multiplyScalar(shake.pos));
      }
      if (rollDeg) quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rollDeg * DEG));
      return { pos, quat, fov: MathUtils.clamp(f, 0.5, 150), look: r.look || null };
    },
  };
}

// A list of cameras over the shot: each starts at its `at` (shot seconds); `blend` seconds cross-moves from
// the previous one (position, orientation and lens) instead of cutting.
function makeCameraTrack(list, eng) {
  const cams = (Array.isArray(list) ? list : [list]).map((s) => makeCamera(s, eng)).sort((a, b) => a.at - b.at);
  return {
    cams,
    eval(c) {
      let i = 0;
      while (i + 1 < cams.length && c.t >= cams[i + 1].at) i++;
      const cur = cams[i].eval(c);
      const cam = cams[i];
      if (i > 0 && cam.blend > 0 && c.t < cam.at + cam.blend) {
        const prev = cams[i - 1].eval(c);
        const e = EASE[cam.blendEase] || EASE.inOut;
        const w = e(Math.min(1, Math.max(0, (c.t - cam.at) / cam.blend)));
        cur.pos.lerpVectors(prev.pos, cur.pos, w);
        cur.quat = prev.quat.clone().slerp(cur.quat, w);
        cur.fov = prev.fov + (cur.fov - prev.fov) * w;
      }
      cur.rig = cam.name;
      return cur;
    },
  };
}

export { RIGS, lensToFov, makeCamera, makeCameraTrack };
