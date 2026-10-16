import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  Vector4,
} from "three";
import {
  fxLightFragment,
  fxLightVertex,
  fxSunDir,
  fxUniforms,
  registerFxMaterial,
  updateFxLighting,
} from "./fx-light.js";
import { FX_QUALITY, SmokeSystem } from "./smoke.js";

// Cold-gas thrusters in daylight: a tight white jet core at every nozzle (one merged mesh,
// one draw call) and condensation vapor that billows out of it, slows, sinks a little and
// fades; lift jets near the ground hit the concrete and spread in a ring, kicking up dust.
// Vapor puffs go into the shared SmokeSystem (pass it as the 2nd constructor argument);
// without one (car viewer) the plumes create their own in the car's scene.

const MAXN = 16;
const JET = {
  // core: len (m, longest; lift jets stop at the ground), r0 exit radius (unless the thruster
  // gives r or radius), ang = widening per metre. puffs: rate (/s), where along the core they
  // start (from), speed, growth in the free jet and after hitting the ground, life, alpha...
  lift: { len: 2.6, r0: 0.075, ang: 0.17, rate: 30, from: 0.3, sp: [10, 15], grow: 1.2, growHit: 2.4, life: [1.5, 2.3], alpha: 0.6, drag: 2.6, rise: -0.25 },
  rear: { len: 1.6, r0: 0.07, ang: 0.15, rate: 28, from: 0.55, sp: [12, 17], grow: 1.6, growHit: 2.4, life: [1.2, 1.9], alpha: 0.55, drag: 2.3, rise: 0.05 },
  side: { len: 0.55, r0: 0.04, ang: 0.15, rate: 18, from: 0.6, sp: [6, 9], grow: 1.4, growHit: 1.6, life: [0.8, 1.2], alpha: 0.4, drag: 3, rise: 0.05 },
  top: { len: 0.5, r0: 0.04, ang: 0.15, rate: 14, from: 0.6, sp: [5, 8], grow: 1.2, growHit: 1.4, life: [0.7, 1.1], alpha: 0.36, drag: 3, rise: 0.1 },
};

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${fxLightVertex}
attribute vec3 aNoz; attribute vec3 aDir; attribute vec3 aRad; attribute vec4 aCone; // along, angle, r0, nozzle
uniform vec4 uN[${MAXN}]; // level, length, end radius, sun visibility
uniform float uAo[${MAXN}]; // sky visibility (the lift jets sit under the car)
varying vec4 vJ; varying vec3 vNrm; varying vec3 vViewPos; varying vec2 vLenAo;
void main() {
  int ni = int(aCone.w + 0.5);
  vec4 N = uN[ni];
  float a = aCone.x;
  float rad = mix(aCone.z, N.z, pow(a, 0.85));
  vec4 mv = modelViewMatrix * vec4(aNoz + aDir * (a * N.y) + aRad * rad, 1.0);
  vNrm = normalize(normalMatrix * aRad);
  vViewPos = mv.xyz;
  vJ = vec4(a, aCone.y, N.x, N.w);
  vLenAo = vec2(N.y, uAo[ni]);
  fxLightVertex();
  vec4 mvPosition = mv;
  gl_Position = projectionMatrix * mv;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${fxLightFragment}
uniform float uTime;
varying vec4 vJ; varying vec3 vNrm; varying vec3 vViewPos; varying vec2 vLenAo;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pnoise(vec2 p, float per) { // value noise, periodic around the jet
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(h21(vec2(x0, i.y)), h21(vec2(x1, i.y)), f.x),
             mix(h21(vec2(x0, i.y + 1.0)), h21(vec2(x1, i.y + 1.0)), f.x), f.y);
}
void main() {
  float a = vJ.x, lv = vJ.z;
  if (lv < 0.01) discard;
  vec3 n = normalize(vNrm) * (gl_FrontFacing ? 1.0 : -1.0);
  float facing = abs(dot(n, normalize(vViewPos))); // ~ chord through the jet at this pixel
  float flow = a * vLenAo.x * 1.6 - uTime * 6.5;
  float turb = 0.6 * pnoise(vec2(vJ.y * 10.0, flow * 1.6), 10.0) + 0.4 * pnoise(vec2(vJ.y * 20.0 + 5.0, flow * 3.6), 20.0);
  float streak = pnoise(vec2(vJ.y * 28.0, a * 3.0 - uTime * 2.5), 28.0);
  // dense right at the nozzle, thinner as the jet widens, mixed away at the end
  float dens = smoothstep(0.0, 0.025, a) * mix(1.0, 0.3, smoothstep(0.0, 0.7, a)) * (1.0 - smoothstep(0.72, 1.0, a));
  float breakup = mix(1.0, smoothstep(0.15, 0.9, turb), smoothstep(0.08, 0.8, a) * 0.9);
  float tau = 2.4 * dens * facing * breakup * (0.8 + 0.4 * streak) * (0.55 + 0.45 * lv);
  float glint = step(0.97, h21(floor(vec2(vJ.y * 40.0, flow * 10.0)))) * (1.0 - smoothstep(0.0, 0.5, a)) * facing;
  float alpha = max(1.0 - exp(-tau), glint * 0.6 * lv);
  if (alpha < 0.004) discard;
  vec3 L = fxShade(n, vJ.w, 0.6, vLenAo.y) + uSunCol * (RECIPROCAL_PI * fxPhase(vViewPos, 0.55) * 0.8 * vJ.w);
  vec3 col = mix(vec3(0.8, 0.9, 1.0), vec3(0.9, 0.92, 0.95), smoothstep(0.0, 0.6, a)) * L;
  // the cold, dense core near the nozzle reads brighter than the vapor around it: a cool white
  // that follows the scene brightness (no glow at night, never above the bloom threshold)
  float lum = dot(uSunCol * RECIPROCAL_PI + vAmbUp, vec3(0.3, 0.59, 0.11));
  vec3 coreCol = vec3(0.86, 0.93, 1.0) * min(1.0, 0.2 + 0.8 * lum);
  float hot = facing * facing * (1.0 - smoothstep(0.0, 0.5, a)) * (0.4 + 0.6 * lv);
  col = mix(col, max(col, coreCol), hot) + glint * coreCol * 0.3;
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const R = (a, b) => a + Math.random() * (b - a),
  RR = (r) => r[0] + Math.random() * (r[1] - r[0]),
  sstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  },
  clamp01 = (x) => Math.min(1, Math.max(0, x));
const _p = new Vector3(),
  _v = new Vector3(),
  _w = new Vector3(),
  _i = new Vector3(),
  _sl = new Vector3(),
  _inv = new Matrix4();

// sun visibility of a body-space point, against the body box B (r = softness in metres)
function boxVis(B, lx, ly, lz, sl, r) {
  if (sl.y < 0.05) return 1;
  const t = (B.cy - ly) / sl.y;
  if (t < 0) return 1;
  const hx = Math.abs(lx + sl.x * t) - B.hx,
    hz = Math.abs(lz + sl.z * t) - B.hz;
  return 1 - B.k * clamp01(0.5 - hx / r) * clamp01(0.5 - hz / r);
}

// the car body as a sun and sky blocker, measured from its meshes (body space)
function bodyBox(body) {
  const box = new Box3(),
    tmp = new Box3(),
    inv = new Matrix4(),
    m = new Matrix4();
  body.updateWorldMatrix(!0, !0);
  inv.copy(body.matrixWorld).invert();
  body.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    o.geometry.boundingBox || o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    box.union(tmp);
  });
  const ok = !box.isEmpty() && box.max.x - box.min.x > 1 && box.max.z - box.min.z > 2;
  return ok
    ? { cy: (box.min.y + box.max.y) / 2, hx: (box.max.x - box.min.x) * 0.47, hz: (box.max.z - box.min.z) * 0.47, k: 0.72 }
    : { cy: 0.55, hx: 0.95, hz: 2.2, k: 0.72 };
}

// exit radius of a jet: the thruster's own value, else the glow disc the car put in that nozzle
// (the GLB car sizes them to each nozzle's inner lip), else the default for its kind
function exitRadius(car, t, kind) {
  const own = t.r ?? t.radius;
  if (own > 0) return own;
  for (const g of car.nozzleGlows || []) {
    const r = g && g.geometry && g.geometry.parameters && g.geometry.parameters.radius;
    if (r > 0 && g.position.distanceTo(t.p) < 0.08) return r;
  }
  return JET[kind].r0;
}

class ThrusterPlumes {
  constructor(e, smoke) {
    (this.car = e), (this.items = []), (this.smoke = smoke || null), (this.ownSmoke = !1);
    for (const kind of ["lift", "rear", "side", "top"])
      for (const t of (e.thrusters && e.thrusters[kind]) || [])
        this.items.length < MAXN &&
          this.items.push({
            t, kind, idx: this.items.length, level: 0, len: JET[kind].len,
            r0: exitRadius(e, t, kind), r1: 0.3,
            P: new Vector3(), D: new Vector3(), prev: new Vector3(), vel: new Vector3(),
            has: !1, acc: Math.random(), accRing: Math.random(), accDust: Math.random(),
          });
    // merged cone geometry: body-space nozzle origin/axis/radial per vertex, shaped in the shader
    const RAD = 12,
      SEG = 8,
      nv = this.items.length * (SEG + 1) * (RAD + 1);
    const noz = new Float32Array(nv * 3),
      dir = new Float32Array(nv * 3),
      rad = new Float32Array(nv * 3),
      cone = new Float32Array(nv * 4),
      idx = [];
    let v = 0;
    for (const it of this.items) {
      const d = it.t.d.clone().normalize(),
        up = Math.abs(d.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0),
        b1 = new Vector3().crossVectors(d, up).normalize(),
        b2 = new Vector3().crossVectors(d, b1).normalize(),
        base = v;
      for (let j = 0; j <= SEG; j++)
        for (let k = 0; k <= RAD; k++, v++) {
          const ang = (k / RAD) * Math.PI * 2;
          _w.copy(b1).multiplyScalar(Math.cos(ang)).addScaledVector(b2, Math.sin(ang));
          it.t.p.toArray(noz, v * 3), d.toArray(dir, v * 3), _w.toArray(rad, v * 3);
          cone.set([Math.pow(j / SEG, 1.35), k / RAD, it.r0, it.idx], v * 4);
        }
      for (let j = 0; j < SEG; j++)
        for (let k = 0; k < RAD; k++) {
          const a = base + j * (RAD + 1) + k,
            b = a + RAD + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(noz, 3)),
      g.setAttribute("aNoz", new BufferAttribute(noz, 3)),
      g.setAttribute("aDir", new BufferAttribute(dir, 3)),
      g.setAttribute("aRad", new BufferAttribute(rad, 3)),
      g.setAttribute("aCone", new BufferAttribute(cone, 4)),
      g.setIndex(idx);
    this.uN = Array.from({ length: MAXN }, () => new Vector4());
    this.uAo = new Float32Array(MAXN).fill(1);
    this.mat = registerFxMaterial(
      new ShaderMaterial({
        transparent: !0,
        depthWrite: !1,
        side: DoubleSide,
        fog: !0,
        uniforms: {
          ...UniformsUtils.clone(UniformsLib.fog),
          ...fxUniforms,
          uN: { value: this.uN },
          uAo: { value: this.uAo },
          uTime: { value: 0 },
        },
        vertexShader,
        fragmentShader,
      }),
    );
    this.mesh = new Mesh(g, this.mat);
    (this.mesh.frustumCulled = !1), (this.mesh.renderOrder = 6), (this.mesh.visible = !1);
    this.mesh.onBeforeRender = (r, sc) => updateFxLighting(r, sc);
    this.box = bodyBox(e.body);
    e.body.add(this.mesh);
    this.occ = { matrixWorld: e.body.matrixWorld, ...this.box };
    this.smoke && this.smoke.occluders.push(this.occ);
    this.prevLift = 0;
  }
  // levels: {lift, rear, side, top} in 0..1, optional ground (height of the surface below the car)
  update(e, t, i) {
    const dt = Math.max(0, Math.min(0.1, e || 0)),
      L = i || {},
      ground = L.ground ?? 0;
    this.mat.uniforms.uTime.value = t;
    if (!this.smoke && this.car.root.parent) {
      this.smoke = new SmokeSystem(this.car.root.parent, 700);
      this.smoke.occluders.push(this.occ);
      this.ownSmoke = !0;
    }
    const body = this.car.body;
    body.updateWorldMatrix(!0, !1);
    const mw = body.matrixWorld;
    _sl.copy(fxSunDir).transformDirection(_inv.copy(mw).invert());
    let any = !1;
    const liftNow = Math.max(0, Math.min(1, L.lift || 0)),
      burst = liftNow > 0.3 && this.prevLift < 0.05;
    this.prevLift = liftNow;
    for (const it of this.items) {
      const J = JET[it.kind],
        target = Math.max(0, Math.min(1, L[it.kind] || 0));
      it.level += (target - it.level) * Math.min(1, dt * (target > it.level ? 25 : 8));
      it.level < 0.003 && (it.level = 0);
      it.P.copy(it.t.p).applyMatrix4(mw), it.D.copy(it.t.d).transformDirection(mw);
      if (it.has && dt > 0) {
        _v.subVectors(it.P, it.prev).divideScalar(dt);
        _v.lengthSq() < 22500 ? it.vel.lerp(_v, 0.5) : it.vel.set(0, 0, 0);
      }
      it.prev.copy(it.P), (it.has = !0);
      const h = it.P.y - ground;
      let len = J.len * (0.6 + 0.4 * it.level);
      it.D.y < -0.2 && (len = Math.min(len, Math.max(0.04, (h - 0.02) / -it.D.y)));
      it.len = len;
      it.r1 = it.r0 + len * J.ang * (0.8 + 0.2 * it.level);
      const tp = it.t.p,
        td = it.t.d,
        B = this.box,
        mx = tp.x + td.x * len * 0.5,
        my = tp.y + td.y * len * 0.5,
        mz = tp.z + td.z * len * 0.5,
        vis = boxVis(B, mx, my, mz, _sl, 0.25),
        under = my < B.cy ? clamp01(0.5 - (Math.abs(mx) - B.hx) / 0.4) * clamp01(0.5 - (Math.abs(mz) - B.hz) / 0.4) : 0;
      this.uN[it.idx].set(it.level, len, it.r1, vis);
      this.uAo[it.idx] = 1 - 0.45 * under;
      if (it.level > 0 && this.smoke) (any = !0), this._emit(it, J, dt, ground, h, burst);
    }
    this.mesh.visible = any;
    this.ownSmoke && this.smoke.update(dt);
  }
  _emit(it, J, dt, ground, h, burst) {
    const S = this.smoke,
      lv = it.level,
      q = FX_QUALITY,
      sq = 1 / Math.sqrt(q);
    // where the jet axis meets the ground (centre of the vapor ring)
    const down = it.D.y < -0.3;
    down ? _i.copy(it.P).addScaledVector(it.D, Math.max(0, h) / -it.D.y) : _i.copy(it.P);
    _i.y = ground;
    // 1) condensation puffs out of the jet core (side/top only when really firing, not trim)
    const k = it.kind === "side" || it.kind === "top" ? clamp01((lv - 0.3) / 0.7) : lv;
    it.acc += J.rate * q * k * dt;
    for (; it.acc >= 1; it.acc--) {
      // start inside the core, as wide as the core is there
      const f = R(J.from, 1),
        r = it.r0 + (it.r1 - it.r0) * Math.pow(f, 0.85);
      _p.copy(it.P).addScaledVector(it.D, it.len * f);
      _p.y = Math.max(_p.y, ground + 0.08);
      _w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      _w.addScaledVector(it.D, -_w.dot(it.D)).normalize();
      _p.addScaledVector(_w, r * R(0, 0.5));
      _v.copy(it.D).multiplyScalar(RR(J.sp) * (0.6 + 0.4 * lv)).add(it.vel).addScaledVector(_w, R(0, 1.5));
      S.spawn({
        kind: "vapor", pos: _p, vel: _v, size: 2.2 * r * R(0.9, 1.25) * sq, grow: J.grow, growT: 0.6,
        growHit: J.growHit, growHitT: 0.9, life: RR(J.life), alpha: J.alpha, drag: J.drag, rise: J.rise,
        ground, spread: !0, origin: _i, stretch: 0.05, fadeIn: 0.04,
      });
    }
    if (it.kind !== "lift" || !down) return;
    // 2) vapor hitting the concrete and rolling outwards in a ring
    const prox = 1 - sstep(0.6, 8, h);
    it.accRing += 16 * q * lv * prox * dt + (burst ? 5 : 0);
    for (; it.accRing >= 1; it.accRing--) {
      const ang = Math.random() * Math.PI * 2,
        c = Math.cos(ang),
        s = Math.sin(ang),
        rr = R(0.15, 0.6);
      _p.set(_i.x + c * rr, ground + R(0.15, 0.35), _i.z + s * rr);
      _v.set(c, 0, s).multiplyScalar(R(2.5, 6) * (0.55 + 0.45 * prox) * (burst ? 1.5 : 1)).addScaledVector(it.vel, 0.35);
      _v.y = R(0.2, 0.7);
      S.spawn({
        kind: "vapor", pos: _p, vel: _v, size: R(0.6, 0.9) * sq, grow: 2.4, growT: 0.9, flat: 0.55,
        life: R(1.6, 2.6), alpha: 0.55 * (0.4 + 0.6 * prox), drag: 2.2, rise: 0.06, ground, stretch: 0.04,
      });
    }
    // 3) dust blown off the concrete when the jets are close to it
    const dprox = 1 - sstep(0.3, 3.2, h);
    it.accDust += 9 * q * lv * dprox * dt + (burst && h < 1.5 ? 6 : 0);
    for (; it.accDust >= 1; it.accDust--) {
      const ang = Math.random() * Math.PI * 2,
        c = Math.cos(ang),
        s = Math.sin(ang),
        rr = R(0.3, 1);
      _p.set(_i.x + c * rr, ground + 0.12, _i.z + s * rr);
      _v.set(c, 0, s).multiplyScalar(R(7, 13)).addScaledVector(it.vel, 0.3);
      _v.y = R(0.3, 1.1);
      S.spawn({
        kind: "dust", pos: _p, vel: _v, size: R(0.5, 0.8) * sq, grow: 3.2, growT: 0.6, flat: 0.6,
        life: R(1.1, 1.9), alpha: 0.3, drag: 2.4, rise: -0.25, ground, stretch: 0.04,
      });
    }
  }
}

export { ThrusterPlumes };
