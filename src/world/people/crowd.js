// The crowd: one InstancedMesh for every person (plus its shadow pass), soft contact shadows, and
// the behaviour that drives them. People within ACTIVE_R of the camera walk, idle and react;
// beyond that they freeze in place, and beyond DRAW_R (or outside the view) they are not drawn.
// Reactions stay friendly: people dive or run out of the way of a fast car, cheer and film when it
// flies over, and anyone the car still overlaps is shoved clear and stumbles. Each new wave of
// reactions fires window event "rd:crowd" {type: "dodge" | "cheer", x, z, count}.
import {
  CanvasTexture,
  DynamicDrawUsage,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Sphere,
  Vector3,
} from "three";
import { buildBodyGeometry } from "./body.js";
import { createPeopleMaterials } from "./shader.js";
import { groundAt } from "./places.js";

const TAU = Math.PI * 2;
const ACTIVE_R = 150, DRAW_R = 330, SHADOW_R = 65;
const CAR = { halfL: 2.35, halfW: 1.08, h: 1.35 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, rate, dt) => (v < t ? Math.min(t, v + rate * dt) : Math.max(t, v - rate * dt));
const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const turn = (a, target, rate, dt) => a + clamp(angDiff(a, target), -rate * dt, rate * dt);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function prepPath(p) {
  if (p.cum) return p;
  const n = p.pts.length, segs = p.closed ? n : n - 1;
  p.cum = [0];
  for (let i = 0; i < segs; i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % n];
    p.cum.push(p.cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  p.len = p.cum[segs];
  return p;
}

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.45, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

class Crowd {
  constructor(scene, places, { seed = 1 } = {}) {
    let s = seed;
    this.rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const body = buildBodyGeometry();
    const n = places.people.length;
    const geo = body.geometry;
    this.attr = {};
    for (const name of ["iCol", "iLook", "iAnim", "iPose"]) {
      const at = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
      at.setUsage(DynamicDrawUsage);
      geo.setAttribute(name, at);
      this.attr[name] = at;
    }
    const { material, depth } = createPeopleMaterials(body);
    const mesh = new InstancedMesh(geo, material, n);
    mesh.name = "people";
    mesh.customDepthMaterial = depth;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    // only people near the car (inside the live sun-shadow box) go into the shadow pass
    this.nShadow = this.nDraw = 0;
    mesh.onBeforeShadow = () => (mesh.count = this.nShadow);
    mesh.onAfterShadow = () => (mesh.count = this.nDraw);
    scene.add(mesh);
    this.mesh = mesh;
    const blobs = new InstancedMesh(
      new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      n,
    );
    blobs.name = "people-blobs";
    blobs.frustumCulled = false;
    blobs.instanceMatrix.setUsage(DynamicDrawUsage);
    blobs.count = 0;
    blobs.renderOrder = 1;
    scene.add(blobs);
    this.blobs = blobs;
    this.tmp = { x: 0, z: 0, yaw: 0 };
    this.agents = places.people.map((p, i) => this.makeAgent(p, i));
    this.volley = this.makeVolley(places.props);
    this.frustum = new Frustum();
    this.m4 = new Matrix4();
    this.sphere = new Sphere(new Vector3(), 2);
    this.fwd = new Vector3();
    this.car = { x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, fx: 0, fz: 1, mode: "ground", above: 0 };
    this.ev = { dodge: { n: 0, x: 0, z: 0, cool: 0 }, cheer: { n: 0, x: 0, z: 0, cool: 0 } };
    this.stats = { dodge: 0, dive: 0, run: 0, step: 0, cheer: 0, pushes: 0, events: { dodge: 0, cheer: 0 }, minGap: Infinity, active: 0, drawn: 0 };
  }

  makeAgent(p, i) {
    const a = {
      i, kind: p.kind, look: p.look, scale: p.look.scale, seed: this.rand(),
      x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0, yaw: p.yaw ?? 0, pitch: 0, lift: 0,
      phase: this.rand() * TAU, gait: 0, cheer: 0, poseId: 0, poseW: 0, aux: p.aux ?? 0,
      phone: p.look.phone ? p.phoneUse ?? 0 : 0, t: this.rand() * 100, fan: !!p.fan,
      react: null, cheerT: 0, cheerDelay: 0, turnCool: 0, go: 1, active: false, team: p.team ?? 0,
    };
    a.base = { lie: [2, 1], sit: [3, 1], volley: [4, 1], wade: [7, 1] }[p.kind] || [0, 0];
    [a.poseId, a.poseW] = a.base;
    if (p.kind === "walk") {
      a.path = prepPath(p.path);
      a.s = p.s * a.path.len;
      a.dir = p.dir;
      a.lane = p.lane;
      a.speed = p.speed;
      a.jog = !!p.jog;
      if (p.look.phone && !a.jog && this.rand() < 0.5) a.phone = 1;
      this.pathPoint(a);
      a.x = this.tmp.x;
      a.z = this.tmp.z;
      a.yaw = this.tmp.yaw;
      a.y = groundAt(a.x, a.z);
      a.gait = a.jog ? 1.75 : 1;
    }
    a.hx = a.x;
    a.hz = a.z;
    a.hyaw = a.yaw;
    a.hy = a.y;
    return a;
  }

  pathPoint(a) {
    const p = a.path, n = p.pts.length;
    let i = 0;
    while (i < p.cum.length - 2 && a.s > p.cum[i + 1]) i++;
    const A = p.pts[i], B = p.pts[(i + 1) % n], L = p.cum[i + 1] - p.cum[i] || 1;
    const u = (a.s - p.cum[i]) / L, tx = ((B[0] - A[0]) / L) * a.dir, tz = ((B[1] - A[1]) / L) * a.dir;
    // keep to the right of the walking direction
    this.tmp.x = A[0] + (B[0] - A[0]) * u - tz * a.lane;
    this.tmp.z = A[1] + (B[1] - A[1]) * u + tx * a.lane;
    this.tmp.yaw = Math.atan2(tx, tz);
    return this.tmp;
  }

  // blend to another pose through zero weight, so ids never snap
  setPose(a, id, w, rate, dt) {
    if (a.poseId !== id) {
      a.poseW = approach(a.poseW, 0, rate, dt);
      if (a.poseW <= 0.02) a.poseId = id;
    } else a.poseW = approach(a.poseW, w, rate, dt);
  }

  readCar(F) {
    const c = this.car;
    c.x = F.pos.x;
    c.y = F.pos.y;
    c.z = F.pos.z;
    c.vx = F.vel.x;
    c.vz = F.vel.z;
    c.speed = Math.hypot(c.vx, c.vz);
    c.mode = F.mode;
    this.fwd.set(0, 0, 1).applyQuaternion(F.quat);
    const l = Math.hypot(this.fwd.x, this.fwd.z);
    if (l > 0.2) {
      c.fx = this.fwd.x / l;
      c.fz = this.fwd.z / l;
    } else if (c.speed > 1) {
      c.fx = c.vx / c.speed;
      c.fz = c.vz / c.speed;
    }
    c.above = c.y - groundAt(c.x, c.z);
    return c;
  }

  event(type, a) {
    const e = this.ev[type];
    e.n++;
    e.x += a.x;
    e.z += a.z;
  }

  flushEvents(dt) {
    for (const type of ["dodge", "cheer"]) {
      const e = this.ev[type];
      e.cool -= dt;
      if (e.n && e.cool <= 0) {
        const detail = { type, x: e.x / e.n, z: e.z / e.n, count: e.n };
        this.stats.events[type]++;
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("rd:crowd", { detail }));
        e.n = e.x = e.z = 0;
        e.cool = 0.35;
      }
    }
  }

  // car heading for this agent on a collision course?
  threat(a, c) {
    if (c.speed < 1.5 || c.mode === "crashed") return false;
    const dx = a.x - c.x, dz = a.z - c.z, d = Math.hypot(dx, dz);
    const reach = Math.min(38, Math.max(10, c.speed * 1.1));
    if (d > reach || c.y - a.y > 1.5) return false;
    const v2 = c.speed * c.speed, tc = (dx * c.vx + dz * c.vz) / v2;
    if (tc < -0.15 || tc > 1.7) return false;
    const cx = dx - c.vx * tc, cz = dz - c.vz * tc;
    const miss = Math.hypot(cx, cz);
    if (c.speed < 6) return miss < 2.4 && d < 6 ? { tc, calm: true } : false;
    return miss < 3.1 ? { tc, calm: false } : false;
  }

  startDodge(a, c, th) {
    // run or dive square to the car's path, away from it
    const vx = c.vx / c.speed, vz = c.vz / c.speed, px = -vz, pz = vx;
    const lat = (a.x - c.x) * px + (a.z - c.z) * pz;
    const sg = Math.abs(lat) < 0.3 ? (this.rand() < 0.5 ? 1 : -1) : Math.sign(lat);
    const ex = px * sg, ez = pz * sg;
    const need = Math.max(0, CAR.halfW + 1.4 - Math.abs(lat));
    const lying = a.poseId === 2 || a.poseId === 3;
    this.stats.dodge++;
    if (th.calm) {
      this.stats.step++;
      a.react = { type: "run", t: 0, ex, ez, v: 0, speed: 1.7, dur: (need + 1) / 1.7, calm: true };
      return;
    }
    this.event("dodge", a);
    if (!lying && a.kind !== "wade" && (th.tc < 0.85 || this.rand() < 0.45)) {
      this.stats.dive++;
      a.react = { type: "dive", t: 0, ex, ez, yaw: Math.atan2(ex, ez), x0: a.x, z0: a.z, dist: clamp(need + 1, 2, 3.6) };
    } else {
      this.stats.run++;
      a.react = { type: "run", t: 0, ex, ez, v: lying ? 0 : 2, speed: 4.4 + this.rand() * 0.8, dur: (need + 2.5) / 4.6 + 0.35, calm: false };
    }
    a.cheerT = 0;
  }

  startStumble(a, ex, ez) {
    this.stats.pushes++;
    if (a.react && (a.react.type === "dive" || a.react.type === "stumble")) return;
    a.react = { type: "stumble", t: 0, ex, ez, v0: 3.2 };
    a.cheerT = 0;
    this.event("dodge", a);
  }

  endReaction(a) {
    a.react = { type: "return", t: 0 };
  }

  step(a, dt, c) {
    a.t = (a.t + dt) % 628.3185;
    if (a.turnCool > 0) a.turnCool -= dt;
    const r = a.react;
    if (!r || r.type === "return") {
      const th = this.threat(a, c);
      if (th) this.startDodge(a, c, th);
    }
    // cheer when the car flies over (the stage crowd sees the whole show)
    if (c.mode === "air" && c.above > 2 && a.kind !== "lie" && (!a.react || a.react.type === "return") && a.cheerT <= 0) {
      const d = Math.hypot(a.x - c.x, a.z - c.z);
      if (d < (a.fan ? 95 : 32)) {
        a.cheerT = 2.4 + this.rand() * 1.8;
        a.cheerDelay = this.rand() * 0.35;
        this.stats.cheer++;
        this.event("cheer", a);
      }
    }
    if (a.cheerDelay > 0) a.cheerDelay -= dt;
    else if (a.cheerT > 0) a.cheerT -= dt;
    const watching = a.cheerT > 0 && a.cheerDelay <= 0;
    const yawCar = Math.atan2(c.x - a.x, c.z - a.z);
    if (a.react) this.react(a, dt, c, yawCar);
    else this.normal(a, dt, c, watching, yawCar);
    if (!a.react || a.react.type === "return") a.cheer = approach(a.cheer, watching ? 1 : 0, 4, dt);
    if (!a.react || a.react.type !== "dive") {
      a.pitch = a.poseId === 2 ? -Math.PI / 2 * a.poseW : 0;
      a.lift = 0;
    }
    a.y = groundAt(a.x, a.z);
  }

  normal(a, dt, c, watching, yawCar) {
    if (a.kind === "walk") {
      a.go = approach(a.go, watching ? 0 : 1, 2, dt);
      // turn back from a car parked across the sidewalk
      const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
      if (d < 4.5 && c.speed < 2.5 && a.turnCool <= 0 && (dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw)) / d > 0.5) {
        a.dir = -a.dir;
        a.turnCool = 6;
      }
      const p = a.path;
      a.s += a.dir * a.speed * a.go * dt;
      if (p.closed) a.s = ((a.s % p.len) + p.len) % p.len;
      else if (a.s < 0) (a.s = -a.s), (a.dir = 1);
      else if (a.s > p.len) (a.s = 2 * p.len - a.s), (a.dir = -1);
      const q = this.pathPoint(a), k = 1 - Math.exp(-dt * 6);
      a.x += (q.x - a.x) * k;
      a.z += (q.z - a.z) * k;
      a.yaw = turn(a.yaw, watching ? yawCar : q.yaw, watching ? 3 : 5, dt);
      a.gait = approach(a.gait, a.go * (a.jog ? 1.75 : 1), 3, dt);
      a.phase += (dt * TAU * a.speed * a.go) / ((a.jog ? 2.3 : 1.45) * a.scale);
      this.setPose(a, 0, 0, 3, dt);
    } else {
      a.gait = approach(a.gait, 0, 3, dt);
      if (a.kind === "stand") a.yaw = turn(a.yaw, watching ? yawCar : a.hyaw, 2.5, dt);
      if (a.kind === "wade") a.yaw = turn(a.yaw, a.hyaw + 0.4 * Math.sin(a.t * 0.1 + a.seed * 9), 1, dt);
      if (a.kind !== "volley") this.setPose(a, a.base[0], a.base[1], 3, dt);
    }
  }

  react(a, dt, c, yawCar) {
    const r = a.react;
    r.t += dt;
    if (r.type === "dive") {
      const T1 = 0.5, T2 = 0.72, T3 = 1.9, T4 = 2.7;
      const t = r.t;
      a.yaw = turn(a.yaw, r.yaw, 18, dt);
      a.gait = approach(a.gait, 0, 6, dt);
      let travel = r.dist + 0.35, h = 0;
      if (t < T1) {
        const u = t / T1;
        travel = r.dist * (1 - (1 - u) * (1 - u));
        h = 0.45 * Math.sin(Math.PI * u);
        a.pitch = (Math.PI / 2) * smooth(u * 1.3);
        a.poseId = 1;
        a.poseW = approach(a.poseW, 1, 9, dt);
        a.cheer = approach(a.cheer, 0, 8, dt);
      } else if (t < T2) {
        const u = (t - T1) / (T2 - T1);
        travel = r.dist + 0.35 * (1 - (1 - u) * (1 - u));
        a.pitch = Math.PI / 2;
        a.poseW = 1;
      } else if (t < T3) a.pitch = Math.PI / 2;
      else if (t < T4) {
        const g = smooth((t - T3) / (T4 - T3));
        a.pitch = (Math.PI / 2) * (1 - g);
        a.poseW = 1 - g;
      } else {
        // back on their feet, laughing it off
        a.pitch = 0;
        a.poseW = 0;
        a.cheer = approach(a.cheer, 1, 4, dt);
        a.yaw = turn(a.yaw, yawCar, 4, dt);
        if (t > T4 + 1.3) this.endReaction(a);
      }
      a.x = r.x0 + r.ex * travel;
      a.z = r.z0 + r.ez * travel;
      a.lift = h + 0.13 * a.scale * Math.sin(a.pitch);
      return;
    }
    if (r.type === "run") {
      const up = a.poseId !== 2 && a.poseId !== 3;
      if (r.t < r.dur) {
        this.setPose(a, r.calm ? 0 : 6, r.calm ? 0 : 1, 7, dt);
        if (up || a.poseW < 0.3) r.v = approach(r.v, r.speed, 14, dt);
        a.yaw = turn(a.yaw, Math.atan2(r.ex, r.ez), 14, dt);
        a.gait = approach(a.gait, r.calm ? 1 : 2, 8, dt);
        a.cheer = approach(a.cheer, 0, 8, dt);
      } else {
        r.v = approach(r.v, 0, 8, dt);
        a.gait = approach(a.gait, 0, 4, dt);
        this.setPose(a, 0, 0, 4, dt);
        a.yaw = turn(a.yaw, yawCar, 4, dt);
        if (!r.calm && r.t > r.dur + 0.5 && !r.cheered) {
          r.cheered = true;
          if (this.rand() < 0.6) (a.cheerT = 1.5), (a.cheerDelay = 0);
        }
        if (r.cheered) a.cheer = approach(a.cheer, a.cheerT > 0 ? 1 : 0, 4, dt);
        if (r.t > r.dur + (r.calm ? 0.6 : 2.2)) this.endReaction(a);
      }
      a.x += r.ex * r.v * dt;
      a.z += r.ez * r.v * dt;
      a.phase += (dt * TAU * r.v) / ((r.calm ? 1.45 : 2.3) * a.scale);
      return;
    }
    if (r.type === "stumble") {
      const D = 1.5;
      if (r.t < D) {
        const k = 1 - r.t / D, v = r.v0 * k * k;
        a.x += r.ex * v * dt;
        a.z += r.ez * v * dt;
        this.setPose(a, 5, 1, 12, dt);
        a.gait = approach(a.gait, 1.2, 8, dt);
        a.phase += dt * 13;
        a.yaw = turn(a.yaw, Math.atan2(-r.ex, -r.ez), 8, dt);
      } else {
        this.setPose(a, 5, 0, 3, dt);
        a.gait = approach(a.gait, 0, 4, dt);
        if (r.t > D + 0.6) this.endReaction(a);
      }
      a.cheer = approach(a.cheer, 0, 8, dt);
      return;
    }
    // return: walk back to the path or the spot, then pick up where they left off
    let tx = a.hx, tz = a.hz;
    if (a.kind === "walk") {
      const q = this.pathPoint(a);
      tx = q.x;
      tz = q.z;
    }
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d > 0.3) {
      const v = Math.min(1.35, d * 2);
      a.x += (dx / d) * v * dt;
      a.z += (dz / d) * v * dt;
      a.yaw = turn(a.yaw, Math.atan2(dx, dz), 6, dt);
      a.gait = approach(a.gait, Math.min(1, v), 4, dt);
      a.phase += (dt * TAU * v) / (1.45 * a.scale);
      this.setPose(a, 0, 0, 4, dt);
    } else if (a.kind === "walk") a.react = null;
    else {
      a.gait = approach(a.gait, 0, 4, dt);
      a.yaw = turn(a.yaw, a.hyaw, 4, dt);
      this.setPose(a, a.base[0], a.base[1], 1.5, dt);
      if (Math.abs(angDiff(a.yaw, a.hyaw)) < 0.05 && a.poseId === a.base[0] && Math.abs(a.poseW - a.base[1]) < 0.01) a.react = null;
    }
  }

  makeVolley(props) {
    const players = this.agents.filter((a) => a.kind === "volley");
    if (!players.length || !props.ball) return null;
    return { players, from: players[0], to: players[3 % players.length], t: 0, dur: 1.6, apex: 4, touches: 0, x: props.ball.x, y: 2, z: props.ball.z, mesh: null };
  }

  updateVolley(dt) {
    const v = this.volley;
    if (!v || !v.players.some((p) => p.active)) return;
    v.t += dt;
    const A = v.from, B = v.to, u = Math.min(1, v.t / v.dur);
    const y0 = A.y + 0.95 * A.scale, y1 = B.y + 0.95 * B.scale;
    v.x = A.x + (B.x - A.x) * u;
    v.z = A.z + (B.z - A.z) * u;
    v.y = y0 + (y1 - y0) * u + v.apex * 4 * u * (1 - u);
    for (const p of v.players) {
      if (p.react) continue;
      const left = p === B ? v.dur - v.t : 9;
      p.aux = left < 0.3 ? approach(p.aux, 1, 5, dt) : approach(p.aux, 0, 2.5, dt);
      p.yaw = turn(p.yaw, Math.atan2(v.x - p.x, v.z - p.z), 3, dt);
      this.setPose(p, 4, 1, 3, dt);
    }
    if (v.t >= v.dur) {
      const team = B.team, mates = v.players.filter((p) => p.team === team && p !== B), foes = v.players.filter((p) => p.team !== team);
      v.touches++;
      const pass = v.touches < 3 && mates.length && this.rand() < 0.55;
      v.from = B;
      v.to = pass ? mates[Math.floor(this.rand() * mates.length)] : foes[Math.floor(this.rand() * foes.length)];
      if (!pass) v.touches = 0;
      v.t = 0;
      v.dur = pass ? 1.0 + this.rand() * 0.3 : 1.5 + this.rand() * 0.4;
      v.apex = pass ? 2.2 + this.rand() * 0.6 : 3.6 + this.rand() * 1.4;
    }
  }

  // last resort: nobody may stay inside the car; shove them clear to the side and let them stumble
  resolve(c) {
    const fx = c.fx, fz = c.fz, rx = -fz, rz = fx;
    let minGap = Infinity;
    for (const a of this.agents) {
      const dx0 = a.x - c.x, dz0 = a.z - c.z;
      if (dx0 * dx0 + dz0 * dz0 > 49) continue;
      const top = a.y + a.lift + 1.85 * a.scale * Math.cos(a.pitch) + 0.3, bottom = a.y + a.lift - 0.2;
      if (c.y > top || c.y + CAR.h < bottom) continue;
      const rad = 0.3 * a.scale, hw = CAR.halfW + rad, hl = CAR.halfL + rad;
      // sample the body: feet, and when lying or diving, the middle and the head too
      const len = 1.7 * a.scale * Math.sin(a.pitch), bx = Math.sin(a.yaw), bz = Math.cos(a.yaw);
      let needPos = 0, needNeg = 0, hit = false;
      const pts = Math.abs(len) > 0.2 ? [0, 0.5, 1] : [0];
      for (const f of pts) {
        const px = dx0 + bx * len * f, pz = dz0 + bz * len * f;
        const lx = px * rx + pz * rz, lz = px * fx + pz * fz;
        if (Math.abs(lz) >= hl) continue;
        needPos = Math.max(needPos, hw - lx);
        needNeg = Math.max(needNeg, hw + lx);
        if (Math.abs(lx) < hw) hit = true;
      }
      if (hit) {
        const lx0 = dx0 * rx + dz0 * rz;
        const sg = needPos < needNeg || (needPos === needNeg && lx0 >= 0) ? 1 : -1;
        const push = (sg > 0 ? needPos : needNeg) + 0.05;
        a.x += rx * sg * push;
        a.z += rz * sg * push;
        if (a.react && a.react.type === "dive") (a.react.x0 += rx * sg * push), (a.react.z0 += rz * sg * push);
        this.startStumble(a, rx * sg, rz * sg);
      }
      // signed clearance of every sampled point after the shove
      for (const f of pts) {
        const px = a.x - c.x + bx * len * f, pz = a.z - c.z + bz * len * f;
        const lx = px * rx + pz * rz, lz = px * fx + pz * fz;
        minGap = Math.min(minGap, Math.max(Math.abs(lx) - hw, Math.abs(lz) - hl));
      }
    }
    if (minGap < this.stats.minGap) this.stats.minGap = minGap;
  }

  put(a, k) {
    const s = a.scale, cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), cp = Math.cos(a.pitch), sp = Math.sin(a.pitch);
    const m = this.mesh.instanceMatrix.array, o = k * 16;
    m[o] = cy * s; m[o + 1] = 0; m[o + 2] = -sy * s; m[o + 3] = 0;
    m[o + 4] = sy * sp * s; m[o + 5] = cp * s; m[o + 6] = cy * sp * s; m[o + 7] = 0;
    m[o + 8] = sy * cp * s; m[o + 9] = -sp * s; m[o + 10] = cy * cp * s; m[o + 11] = 0;
    m[o + 12] = a.x; m[o + 13] = a.y + a.lift; m[o + 14] = a.z; m[o + 15] = 1;
    const L = a.look, q = k * 4;
    const C = this.attr.iCol.array, K = this.attr.iLook.array, N = this.attr.iAnim.array, P = this.attr.iPose.array;
    C[q] = L.col[0]; C[q + 1] = L.col[1]; C[q + 2] = L.col[2]; C[q + 3] = L.col[3];
    K[q] = L.hat; K[q + 1] = L.shoe; K[q + 2] = L.flags; K[q + 3] = L.shape;
    N[q] = a.phase % TAU; N[q + 1] = a.gait; N[q + 2] = a.cheer; N[q + 3] = a.seed;
    P[q] = a.poseId * 1024 + Math.round(clamp(a.phone * (1 - a.cheer), 0, 1) * 1000); P[q + 1] = a.poseW; P[q + 2] = a.aux; P[q + 3] = a.t;
    // contact shadow, stretched along the body when lying down
    const ls = Math.abs(sp), bl = 1.7 * s * ls, b = this.blobs.instanceMatrix.array;
    const w = 0.5 * s, d = 0.5 * s + bl * 0.75, off = (a.pitch > 0 ? 1 : -1) * bl * 0.5;
    const bx = a.x + sy * off, bz = a.z + cy * off;
    b[o] = cy * w; b[o + 1] = 0; b[o + 2] = -sy * w; b[o + 3] = 0;
    b[o + 4] = 0; b[o + 5] = 1; b[o + 6] = 0; b[o + 7] = 0;
    b[o + 8] = sy * d; b[o + 9] = 0; b[o + 10] = cy * d; b[o + 11] = 0;
    b[o + 12] = bx; b[o + 13] = a.y + 0.02; b[o + 14] = bz; b[o + 15] = 1;
  }

  update(dt, time, F, camera) {
    dt = Math.min(dt, 0.05);
    const c = this.readCar(F), cam = camera.position;
    let active = 0;
    for (const a of this.agents) {
      const dx = a.x - cam.x, dz = a.z - cam.z;
      a.camD2 = dx * dx + dz * dz;
      a.active = a.camD2 < ACTIVE_R * ACTIVE_R;
      if (a.active) {
        active++;
        this.step(a, dt, c);
      }
    }
    this.updateVolley(dt);
    this.resolve(c);
    this.flushEvents(dt);
    // draw: shadow casters near the car first, then the rest that are in view
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let k = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const a of this.agents) {
        if (pass === 0) {
          a.drawn = false;
          if (a.camD2 > DRAW_R * DRAW_R) continue;
          this.sphere.center.set(a.x, a.y + 0.9, a.z);
          a.drawn = a.camD2 < 625 || this.frustum.intersectsSphere(this.sphere);
          a.near = (a.x - c.x) ** 2 + (a.z - c.z) ** 2 < SHADOW_R * SHADOW_R;
          if (a.drawn && a.near) this.put(a, k++);
        } else if (a.drawn && !a.near) this.put(a, k++);
      }
      if (pass === 0) this.nShadow = k;
    }
    this.nDraw = this.mesh.count = this.blobs.count = k;
    this.mesh.instanceMatrix.needsUpdate = this.blobs.instanceMatrix.needsUpdate = true;
    for (const at of Object.values(this.attr)) at.needsUpdate = true;
    if (this.volley && this.volley.mesh) this.volley.mesh.position.set(this.volley.x, this.volley.y, this.volley.z);
    this.stats.active = active;
    this.stats.drawn = k;
  }
}

export { Crowd };
