import {
  Color,
  DataTexture,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
} from "three";
import {
  fxLightFragment,
  fxLightVertex,
  fxSunDir,
  fxUniforms,
  registerFxMaterial,
  updateFxLighting,
} from "./fx-light.js";

// Soft, sun-lit particles for daylight: thruster vapor, lift-off/landing dust, tyre smoke.
// One instanced draw call, pooled typed arrays, a hard cap, back-to-front bucket sort.

const COARSE = typeof matchMedia == "function" && matchMedia("(pointer: coarse)").matches;
const FX_QUALITY = COARSE ? 0.7 : 1; // emission scale for phones (fewer, slightly bigger puffs)
const DEFAULT_MAX = COARSE ? 900 : 1400;

// Per-kind defaults: albedo, forward scatter, wrap (softness of the terminator), alpha gain.
const KINDS = {
  smoke: { color: new Color(0.8, 0.8, 0.81), scatter: 0.5, wrap: 0.4, gain: 1 },
  vapor: { color: new Color(0.9, 0.92, 0.95), scatter: 1, wrap: 0.45, gain: 1 },
  dust: { color: new Color(0.5, 0.46, 0.4), scatter: 0.25, wrap: 0.3, gain: 1 },
  tyre: { color: new Color(0.74, 0.74, 0.75), scatter: 0.5, wrap: 0.4, gain: 1.5 },
};

// --- procedural puff atlas: 2x2 cells of soft billow clusters ------------------------------
// RG = normal, B = thickness, A = opacity
function makePuffAtlas() {
  const S = 128,
    W = S * 2,
    data = new Uint8Array(W * W * 4);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const hash = (x, y) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const vnoise = (x, y) => {
    const i = Math.floor(x),
      j = Math.floor(y),
      fx = x - i,
      fy = y - j,
      u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy),
      a = hash(i, j),
      b = hash(i + 1, j),
      c = hash(i, j + 1),
      d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => {
    let s = 0,
      a = 0.5;
    for (let o = 0; o < 4; o++) (s += a * vnoise(x, y)), (x *= 2.03), (y *= 2.03), (a *= 0.5);
    return s / 0.9375;
  };
  const H = new Float32Array(S * S),
    E = new Float32Array(S * S);
  for (let cell = 0; cell < 4; cell++) {
    // billows: a big central one and a ring of smaller ones (x, y, radius)
    const lobes = [[0, 0, 0.56]];
    const nb = 5 + cell;
    for (let b = 0; b < nb; b++) {
      const ang = ((b + rnd() * 0.7) / nb) * Math.PI * 2,
        r = 0.24 + rnd() * 0.14,
        dist = 0.86 - r - rnd() * 0.14;
      lobes.push([Math.cos(ang) * dist, Math.sin(ang) * dist, r]);
    }
    let hmax = 0;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = ((x + 0.5) / S) * 2 - 1,
          v = ((y + 0.5) / S) * 2 - 1;
        // smooth max of sphere caps (soft creases between billows)
        let s = 0;
        for (const [bx, by, r] of lobes) {
          const d2 = (u - bx) * (u - bx) + (v - by) * (v - by),
            h = Math.sqrt(Math.max(0, r * r - d2));
          s += Math.pow(h, 5);
        }
        let h = Math.pow(s, 1 / 5);
        // fine detail on the surface
        h += 0.025 * (fbm(u * 5 + cell * 7.3, v * 5 + cell * 3.1) - 0.5) * Math.min(1, h * 6);
        H[y * S + x] = Math.max(0, h);
        E[y * S + x] = fbm(u * 3.3 + cell * 5.7, v * 3.3 - cell * 2.9);
        hmax = Math.max(hmax, h);
      }
    const ox = (cell & 1) * S,
      oy = (cell >> 1) * S;
    const at = (xx, yy) => H[Math.min(S - 1, Math.max(0, yy)) * S + Math.min(S - 1, Math.max(0, xx))] / hmax;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const h = at(x, y),
          gx = (at(x + 3, y) - at(x - 3, y)) * (S / 12),
          gy = (at(x, y + 3) - at(x, y - 3)) * (S / 12);
        let nx = -gx * 0.45,
          ny = -gy * 0.45;
        const l = Math.hypot(nx, ny, 1);
        (nx /= l), (ny /= l);
        // soft, noisy rim: opacity ramps up over the outer part of the billows
        const e = E[y * S + x],
          t = Math.min(1, Math.max(0, (h + 0.4 * (e - 0.5)) / 0.6)),
          a = t * t * (3 - 2 * t);
        const u = ((x + 0.5) / S) * 2 - 1,
          v = ((y + 0.5) / S) * 2 - 1,
          rr = Math.sqrt(u * u + v * v),
          win = 1 - Math.min(1, Math.max(0, (rr - 0.84) / 0.14));
        const k = ((oy + y) * W + ox + x) * 4;
        data[k] = Math.round((nx * 0.5 + 0.5) * 255);
        data[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[k + 2] = Math.round(Math.min(1, h) * 255);
        data[k + 3] = Math.round(a * win * 255);
      }
  }
  const t = new DataTexture(data, W, W, RGBAFormat);
  return (
    (t.minFilter = LinearMipmapLinearFilter),
    (t.magFilter = LinearFilter),
    (t.generateMipmaps = !0),
    (t.needsUpdate = !0),
    t
  );
}

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${fxLightVertex}
attribute vec4 iPos;  // xyz, ground height
attribute vec4 iVel;  // world velocity, stretch (seconds of motion)
attribute vec4 iData; // size, alpha, rotation + 8 * atlas cell, vertical scale
attribute vec4 iCol;  // albedo, sun visibility
attribute vec4 iExt;  // forward scatter, wrap, ground fade height, sky visibility
uniform vec2 uNearFade;
varying vec4 vQT; varying vec4 vBasis; varying vec4 vCol; varying vec4 vMisc;
varying vec3 vViewPos; varying vec4 vCellAo;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  vec3 vv = mat3(modelViewMatrix) * iVel.xyz;
  float sp = length(vv.xy);
  vec2 ax = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
  vec2 ay = vec2(-ax.y, ax.x);
  float hs = 0.5 * iData.x;
  float st = min(sp * iVel.w, 3.0 * hs);
  vec2 q = position.xy * 2.0;
  vec2 off = ax * (q.x * (hs + 0.5 * st)) + ay * (q.y * hs);
  off.y *= iData.w; // ground-hugging puffs are flatter than they are wide
  mv.xy += off;
  float above = iPos.y + (vec4(off, 0.0, 0.0) * viewMatrix).y - iPos.w;
  float cell = floor(iData.z / 8.0), rot = iData.z - cell * 8.0;
  float c = cos(rot), s = sin(rot);
  vQT = vec4(q, q.x * c - q.y * s, q.x * s + q.y * c);
  vBasis = vec4(ax, c, s);
  vCellAo = vec4(vec2(mod(cell, 2.0), floor(cell * 0.5)) * 0.5, iExt.w, iData.w);
  vMisc = vec4(iData.y * smoothstep(uNearFade.x, uNearFade.y, -mv.z), iExt.x, iExt.y, above / max(0.05, iExt.z));
  vCol = iCol;
  vViewPos = mv.xyz;
  fxLightVertex();
  vec4 mvPosition = mv;
  gl_Position = projectionMatrix * mv;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${fxLightFragment}
uniform sampler2D uTex;
varying vec4 vQT; varying vec4 vBasis; varying vec4 vCol; varying vec4 vMisc;
varying vec3 vViewPos; varying vec4 vCellAo;
vec2 toView(vec2 v) { return vBasis.xy * v.x + vec2(-vBasis.y, vBasis.x) * v.y; }
void main() {
  vec2 t = vQT.zw;
  if (dot(t, t) > 1.0) discard;
  vec4 tx = texture2D(uTex, vCellAo.xy + (t * 0.47 + 0.5) * 0.5);
  float a = tx.a * vMisc.x * smoothstep(0.0, 1.0, vMisc.w);
  if (a < 0.004) discard;
  // billow normal from the atlas (texture space -> billboard -> view)
  vec2 tn = tx.rg * 2.0 - 1.0;
  vec2 na = toView(vec2(tn.x * vBasis.z + tn.y * vBasis.w, tn.y * vBasis.z - tn.x * vBasis.w));
  // puff-scale rounding: the billboard as the front of an ellipsoid (flat puffs have flat tops)
  vec2 ps = toView(vQT.xy) * 0.85;
  vec3 ns = normalize(vec3(ps.x, ps.y / max(0.3, vCellAo.w), sqrt(max(0.0, 1.0 - dot(ps, ps)))));
  vec3 n = normalize(vec3(ns.xy + na, ns.z * sqrt(max(0.0, 1.0 - dot(na, na)))));
  vec3 L = fxShade(n, vCol.a, vMisc.z, vCellAo.z);
  L += uSunCol * (RECIPROCAL_PI * fxPhase(vViewPos, 0.6) * vMisc.y * (1.0 - tx.b) * vCol.a);
  gl_FragColor = vec4(vCol.rgb * L, a);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let sharedTex = null;
const STRIDE = 20;
const _m = new Matrix4(),
  _s = new Vector3();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

class SmokeSystem {
  constructor(e, t = DEFAULT_MAX) {
    const max = (this.max = t);
    this.n = 0;
    const F = Float32Array;
    // simulation state (structure of arrays)
    const names = "px py pz vx vy vz age life size grow growT grow2 growT2 gt alpha fadeIn rot spin drag rise gy ox oz cr cg cb scat wrap stretch flat vis ao";
    this._arrs = [];
    for (const k of names.split(" ")) this._arrs.push((this[k] = new F(max)));
    this._arrs.push((this.flags = new Uint8Array(max)), (this.cell = new Uint8Array(max)));
    // sort scratch
    (this.depth = new F(max)), (this.order = new Uint32Array(max)), (this.bucket = new Uint16Array(max));
    this.counts = new Uint32Array(257);
    // instance buffer
    this.inst = new F(max * STRIDE);
    const plane = new PlaneGeometry(1, 1),
      s = new InstancedBufferGeometry();
    (s.index = plane.index),
      (s.attributes.position = plane.attributes.position),
      (s.attributes.uv = plane.attributes.uv);
    const ib = (this.ib = new InstancedInterleavedBuffer(this.inst, STRIDE, 1).setUsage(DynamicDrawUsage));
    ["iPos", "iVel", "iData", "iCol", "iExt"].forEach((name, k) =>
      s.setAttribute(name, new InterleavedBufferAttribute(ib, 4, k * 4)),
    );
    s.instanceCount = 0;
    sharedTex || (sharedTex = makePuffAtlas());
    this.mat = registerFxMaterial(
      new ShaderMaterial({
        transparent: !0,
        depthWrite: !1,
        fog: !0,
        uniforms: {
          ...UniformsUtils.clone(UniformsLib.fog),
          ...fxUniforms,
          uTex: { value: sharedTex },
          uNearFade: { value: new Vector2(1, 4.5) },
        },
        vertexShader,
        fragmentShader,
      }),
    );
    this.mesh = new Mesh(s, this.mat);
    (this.mesh.frustumCulled = !1), (this.mesh.renderOrder = 5);
    this.mesh.onBeforeRender = (r, sc, cam) => {
      (this.cam = cam), updateFxLighting(r, sc);
    };
    e.add(this.mesh);
    this.geo = s;
    // boxes that shade particles from the sun and sky (the car body):
    // {matrixWorld, cy, hx, hz, k} in that object's local space, box mid-plane at y = cy
    this.occluders = [];
  }
  get count() {
    return this.n;
  }
  // Spawn one particle. Original options: pos, vel, size, grow, life, alpha, color, drag, rise.
  // New optional ones: kind ('smoke'|'vapor'|'dust'|'tyre'); growT (growth slows with this time
  // constant); ground (surface height); flat (vertical scale, 1 = round); spread + origin (on
  // hitting the ground, vertical speed turns into outward speed from origin, the puff flattens
  // and switches to growHit/growHitT); stretch (seconds of velocity streak); fadeIn.
  spawn(e) {
    let i = this.n;
    if (i >= this.max) {
      // full: recycle the most faded of a few random picks
      let best = -1;
      for (let k = 0; k < 6; k++) {
        const j = (Math.random() * this.max) | 0,
          f = this.age[j] / this.life[j];
        f > best && ((best = f), (i = j));
      }
    } else this.n++;
    const kind = KINDS[e.kind] || KINDS.smoke,
      col = e.color || kind.color,
      v = e.vel,
      tint = 0.94 + Math.random() * 0.1,
      o = e.origin || e.pos;
    (this.px[i] = e.pos.x), (this.py[i] = e.pos.y), (this.pz[i] = e.pos.z);
    (this.vx[i] = v ? v.x : 0), (this.vy[i] = v ? v.y : 0), (this.vz[i] = v ? v.z : 0);
    (this.age[i] = 0), (this.gt[i] = 0), (this.life[i] = e.life ?? 3), (this.size[i] = e.size ?? 1);
    (this.grow[i] = e.grow ?? 2), (this.growT[i] = e.growT ?? 0);
    (this.grow2[i] = e.growHit ?? -1), (this.growT2[i] = e.growHitT ?? 0);
    (this.alpha[i] = (e.alpha ?? 0.35) * kind.gain), (this.fadeIn[i] = e.fadeIn ?? 0.12);
    (this.rot[i] = Math.random() * Math.PI * 2), (this.spin[i] = (Math.random() - 0.5) * (e.spin ?? 0.6));
    (this.drag[i] = e.drag ?? 1.2), (this.rise[i] = e.rise ?? 0.6), (this.gy[i] = e.ground ?? 0);
    (this.ox[i] = o.x), (this.oz[i] = o.z), (this.flags[i] = e.spread ? 1 : 0);
    (this.cr[i] = col.r * tint), (this.cg[i] = col.g * tint), (this.cb[i] = col.b * tint);
    (this.scat[i] = kind.scatter), (this.wrap[i] = kind.wrap), (this.stretch[i] = e.stretch ?? 0);
    (this.flat[i] = e.flat ?? 1), (this.cell[i] = (Math.random() * 4) | 0), (this.vis[i] = 1), (this.ao[i] = 1);
    return i;
  }
  _kill(i) {
    const j = --this.n;
    if (i !== j) for (const a of this._arrs) a[i] = a[j];
  }
  // dt in seconds. The second argument (old night-time light probe) is no longer needed.
  update(e) {
    const dt = Math.max(0, Math.min(0.1, e || 0));
    const { px, py, pz, vx, vy, vz, age, life, size, flat, flags } = this;
    for (let i = 0; i < this.n; ) {
      if ((age[i] += dt) >= life[i]) {
        this._kill(i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      (vx[i] *= k), (vy[i] *= k), (vz[i] *= k), (vy[i] += this.rise[i] * dt);
      (px[i] += vx[i] * dt), (py[i] += vy[i] * dt), (pz[i] += vz[i] * dt);
      const gt = (this.gt[i] += dt);
      size[i] +=
        this.growT[i] > 0
          ? this.grow[i] * Math.exp(-gt / this.growT[i]) * dt
          : this.grow[i] * dt * (1 - (age[i] / life[i]) * 0.6);
      this.rot[i] += this.spin[i] * dt;
      flags[i] & 2 && (flat[i] += (0.55 - flat[i]) * Math.min(1, dt * 5));
      const minY = this.gy[i] + size[i] * flat[i] * 0.28;
      if (py[i] < minY) {
        if (flags[i] & 1 && vy[i] < 0) {
          // hit the ground: vertical speed turns into outward spread (the vapor ring)
          let dx = px[i] - this.ox[i],
            dz = pz[i] - this.oz[i],
            d = Math.hypot(dx, dz);
          d < 1e-3 && ((dx = Math.random() - 0.5), (dz = Math.random() - 0.5), (d = Math.hypot(dx, dz)));
          const sp = -vy[i] * 0.7;
          (vx[i] += (dx / d) * sp), (vz[i] += (dz / d) * sp), (vy[i] = sp * 0.05);
          if (!(flags[i] & 2)) {
            // the wall jet loses speed quickly as it mixes with the air around it
            (flags[i] |= 2), (this.drag[i] *= 1.4);
            this.grow2[i] >= 0 && ((this.grow[i] = this.grow2[i]), (this.growT[i] = this.growT2[i]), (this.gt[i] = 0));
          }
        } else vy[i] < 0 && (vy[i] *= -0.15);
        py[i] = minY;
      }
      i++;
    }
    this._shade();
    this._write();
  }
  // Light blocked per particle: puffs low in a cloud get less sun, and occluder boxes (the car)
  // block the sun along the sun ray and the sky above whatever is underneath them.
  _shade() {
    const n = this.n,
      vis = this.vis,
      ao = this.ao;
    for (let i = 0; i < n; i++) (vis[i] = 0.65 + 0.35 * clamp01((this.py[i] - this.gy[i]) / 1.2)), (ao[i] = 1);
    for (const oc of this.occluders) {
      _m.copy(oc.matrixWorld).invert();
      _s.copy(fxSunDir).transformDirection(_m);
      const e = _m.elements,
        sunOk = _s.y > 0.05;
      for (let i = 0; i < n; i++) {
        const x = this.px[i],
          y = this.py[i],
          z = this.pz[i];
        const lx = e[0] * x + e[4] * y + e[8] * z + e[12],
          ly = e[1] * x + e[5] * y + e[9] * z + e[13],
          lz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const r = 0.35 * this.size[i] + 0.1;
        if (ly < oc.cy) {
          const under = clamp01(0.5 - (Math.abs(lx) - oc.hx) / r) * clamp01(0.5 - (Math.abs(lz) - oc.hz) / r);
          ao[i] *= 1 - 0.5 * under * clamp01(1 - (oc.cy - ly) / 3);
        }
        if (!sunOk) continue;
        const t = (oc.cy - ly) / _s.y;
        if (t < 0) continue;
        const hx = Math.abs(lx + _s.x * t) - oc.hx,
          hz = Math.abs(lz + _s.z * t) - oc.hz;
        vis[i] *= 1 - oc.k * clamp01(0.5 - hx / r) * clamp01(0.5 - hz / r);
      }
    }
  }
  _write() {
    const n = this.n,
      out = this.inst,
      order = this.order;
    const cam = this.cam;
    if (cam && n > 1) {
      // back-to-front counting sort on 256 depth buckets
      cam.updateMatrixWorld();
      const m = cam.matrixWorld.elements,
        fx = -m[8],
        fy = -m[9],
        fz = -m[10],
        cx = m[12],
        cy = m[13],
        cz = m[14];
      let lo = 1e9,
        hi = -1e9;
      for (let i = 0; i < n; i++) {
        const d = (this.px[i] - cx) * fx + (this.py[i] - cy) * fy + (this.pz[i] - cz) * fz;
        (this.depth[i] = d), d < lo && (lo = d), d > hi && (hi = d);
      }
      const counts = this.counts.fill(0),
        sc = 255 / Math.max(1e-3, hi - lo);
      for (let i = 0; i < n; i++) {
        const b = (255 - (this.depth[i] - lo) * sc) | 0;
        (this.bucket[i] = b), counts[b + 1]++;
      }
      for (let b = 1; b < 257; b++) counts[b] += counts[b - 1];
      for (let i = 0; i < n; i++) order[counts[this.bucket[i]]++] = i;
    } else for (let i = 0; i < n; i++) order[i] = i;
    const TAU = Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const i = order[k],
        o = k * STRIDE,
        f = this.age[i] / this.life[i],
        a = this.alpha[i] * Math.min(1, this.age[i] / Math.max(1e-3, this.fadeIn[i])) * Math.pow(1 - f, 1.4),
        r = this.rot[i] - Math.floor(this.rot[i] / TAU) * TAU;
      (out[o] = this.px[i]), (out[o + 1] = this.py[i]), (out[o + 2] = this.pz[i]), (out[o + 3] = this.gy[i]);
      (out[o + 4] = this.vx[i]), (out[o + 5] = this.vy[i]), (out[o + 6] = this.vz[i]), (out[o + 7] = this.stretch[i]);
      (out[o + 8] = this.size[i]), (out[o + 9] = a), (out[o + 10] = r + 8 * this.cell[i]), (out[o + 11] = this.flat[i]);
      (out[o + 12] = this.cr[i]), (out[o + 13] = this.cg[i]), (out[o + 14] = this.cb[i]), (out[o + 15] = this.vis[i]);
      (out[o + 16] = this.scat[i]), (out[o + 17] = this.wrap[i]);
      (out[o + 18] = Math.max(0.1, this.size[i] * this.flat[i] * 0.08)), (out[o + 19] = this.ao[i]);
    }
    this.geo.instanceCount = n;
    if (n) this.ib.clearUpdateRanges(), this.ib.addUpdateRange(0, n * STRIDE), (this.ib.needsUpdate = !0);
  }
}

export { SmokeSystem, FX_QUALITY };
