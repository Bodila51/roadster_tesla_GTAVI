import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from "three";
import { COAST, COAST_GLSL } from "./coast.js";

const r = Math.random,
  _p = new Vector3(),
  _v = new Vector3(),
  _o = new Vector3(),
  WY = COAST.waterY;

// Water spray through the shared smoke system (lit, depth sorted, one draw call): the big splash,
// the skim trail, wheel spray when wading, and the boil while the car goes under.
class Spray {
  constructor(smoke) {
    (this.smoke = smoke), (this.a = 0), (this.b = 0), (this.c = 0);
  }
  emit(o) {
    this.smoke && this.smoke.spawn(o);
  }
  splash(P, V, k) {
    _o.set(P.x, WY, P.z);
    for (let i = 0; i < 60 * k; i++) {
      const a = r() * 6.2832, s = r(), ca = Math.cos(a), sa = Math.sin(a);
      this.emit({ pos: _p.set(P.x + ca * s * 1.8, WY + 0.3, P.z + sa * s * 1.8), vel: _v.set(V.x * 0.18 + ca * (1 + 3 * s), 5 + r() * 9 * k, V.z * 0.18 + sa * (1 + 3 * s)),
        kind: "vapor", size: 0.9 + r() * 1.3, grow: 3.5, life: 2.2 + r() * 1.4, alpha: 0.34, drag: 1.0, rise: -6.5, ground: WY, spread: !0, origin: _o });
    }
    for (let i = 0; i < 50 * k; i++) {
      const a = r() * 6.2832, sp = 5 + r() * 6;
      this.emit({ pos: _p.set(P.x + Math.cos(a), WY + 0.2, P.z + Math.sin(a)), vel: _v.set(Math.cos(a) * sp + V.x * 0.2, 3 + r() * 6 * k, Math.sin(a) * sp + V.z * 0.2),
        kind: "vapor", size: 0.28 + r() * 0.25, grow: 0.6, life: 1.1 + r() * 0.6, alpha: 0.5, drag: 0.35, rise: -9.8, ground: WY, stretch: 0.06 });
    }
    for (let i = 0; i < 18 * k; i++) {
      const a = r() * 6.2832, sp = 4 + r() * 4;
      this.emit({ pos: _p.set(P.x + Math.cos(a) * 1.5, WY + 0.25, P.z + Math.sin(a) * 1.5), vel: _v.set(Math.cos(a) * sp, 0.3, Math.sin(a) * sp),
        kind: "vapor", size: 1.6, grow: 4, life: 2.8, alpha: 0.2, drag: 1.5, rise: 0.25, ground: WY });
    }
  }
  skim(P, V, k, dt) {
    for (this.a += dt * 80 * k; this.a >= 1; this.a--) {
      const big = r() < 0.3;
      this.emit({ pos: _p.set(P.x - V.x * 0.03 + (r() - 0.5) * 1.8, WY + 0.12, P.z - V.z * 0.03 + (r() - 0.5) * 1.8),
        vel: _v.set(V.x * 0.42 + (r() - 0.5) * 4, (big ? 1.2 : 2.5) + r() * 4 * k, V.z * 0.42 + (r() - 0.5) * 4),
        kind: "vapor", size: big ? 1.3 + r() : 0.45 + r() * 0.5, grow: big ? 3.2 : 1.8, life: big ? 2.2 : 0.9 + r() * 0.6,
        alpha: (big ? 0.16 : 0.34) * (0.4 + 0.6 * k), drag: big ? 1.8 : 1.1, rise: big ? 0.15 : -6, ground: WY, stretch: big ? 0 : 0.035 });
    }
  }
  wade(P, V, fwd, left, k, dt) {
    for (this.b += dt * 45 * k; this.b >= 1; this.b--) {
      const s = r() < 0.5 ? -1 : 1, f = r() < 0.5 ? 1.35 : -1.35, o = 1.5 + 2 * r();
      this.emit({ pos: _p.set(P.x + fwd.x * f + left.x * s * 0.95, WY + 0.1, P.z + fwd.z * f + left.z * s * 0.95),
        vel: _v.set(V.x * 0.35 + left.x * s * o, 1.5 + 3 * r() * k, V.z * 0.35 + left.z * s * o),
        kind: "vapor", size: 0.45 + r() * 0.3, grow: 1.8, life: 0.9, alpha: 0.32 * k, drag: 1.2, rise: -6, ground: WY, stretch: 0.03 });
    }
  }
  boil(P, dt) {
    for (this.c += dt * 22; this.c >= 1; this.c--) {
      const a = r() * 6.2832, s = r() * 2.2;
      this.emit({ pos: _p.set(P.x + Math.cos(a) * s, WY + 0.15, P.z + Math.sin(a) * s), vel: _v.set(0, 0.6 + r(), 0),
        kind: "vapor", size: 0.8, grow: 1.5, life: 1.4, alpha: 0.16, drag: 1.5, rise: 0.2, ground: WY });
    }
  }
}

// Foam wake on the water behind a skimming car: a ribbon of the last 128 trail points that rides
// the swell, spreads and fades over 5 s. One draw call.
const WAKE_VERT = /* glsl */ `
attribute float aSide;
attribute vec2 aPerp;
attribute vec4 aInfo;
uniform float uTime;
varying float vA;
varying float vX;
varying vec2 vXZ;
varying float vFogDepth;
${COAST_GLSL}
void main(){
  float age = uTime - aInfo.x;
  vec3 w = position + vec3(aPerp.x, 0.0, aPerp.y) * aSide * aInfo.z * (1.0 + age * 0.8);
  w.y = WATER_Y + waterSurface(w.xz, uTime, distance(w.xz, cameraPosition.xz)).z + 0.04;
  vA = aInfo.y * clamp(1.0 - age / 5.0, 0.0, 1.0);
  vX = aSide;
  vXZ = w.xz;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const WAKE_FRAG = /* glsl */ `
uniform sampler2D uWaves;
uniform vec3 uFoam;
#ifdef USE_FOG
uniform vec3 fogColor;
uniform float fogDensity;
uniform float fogNear;
uniform float fogFar;
#endif
varying float vA;
varying float vX;
varying vec2 vXZ;
varying float vFogDepth;
void main(){
  float lace = texture2D(uWaves, vXZ * 0.11).a * 0.6 + texture2D(uWaves, vXZ * 0.37).a * 0.4;
  float e = 1.0 - abs(vX);
  float a = vA * smoothstep(0.0, 0.6, e) * smoothstep(0.2, 0.65, lace + e * 0.35);
  vec3 c = uFoam;
#ifdef USE_FOG
  #ifdef FOG_EXP2
  c = mix(c, fogColor, 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth));
  #else
  c = mix(c, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
  #endif
#endif
  gl_FragColor = vec4(c * a, a);
}`;

class Wake {
  constructor(waves, time, foam, K = 128) {
    (this.K = K), (this.n = 0), (this.on = !1), (this.last = new Vector3());
    (this.pos = new Float32Array(K * 6)), (this.perp = new Float32Array(K * 4)), (this.info = new Float32Array(K * 8)), (this.link = new Uint8Array(K));
    const side = new Float32Array(K * 2),
      g = new BufferGeometry();
    for (let i = 0; i < K; i++) (side[i * 2] = -1), (side[i * 2 + 1] = 1);
    g.setAttribute("position", new BufferAttribute(this.pos, 3)),
      g.setAttribute("aSide", new BufferAttribute(side, 1)),
      g.setAttribute("aPerp", new BufferAttribute(this.perp, 2)),
      g.setAttribute("aInfo", new BufferAttribute(this.info, 4));
    (this.index = new BufferAttribute(new Uint16Array(K * 6), 1)), g.setIndex(this.index), g.setDrawRange(0, 0);
    this.geo = g;
    const u = UniformsUtils.merge([UniformsLib.fog]);
    Object.assign(u, { uTime: time, uWaves: { value: waves }, uFoam: foam });
    this.mesh = new Mesh(
      g,
      new ShaderMaterial({ uniforms: u, vertexShader: WAKE_VERT, fragmentShader: WAKE_FRAG, transparent: !0, premultipliedAlpha: !0, depthWrite: !1, fog: !0, side: DoubleSide, polygonOffset: !0, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
    );
    (this.mesh.frustumCulled = !1), (this.mesh.renderOrder = 1), (this.mesh.name = "wake");
  }
  stop() {
    this.on = !1;
  }
  // drop a trail point under the car, about every metre while skimming
  add(x, z, dx, dz, width, k, t) {
    if (this.on && Math.hypot(x - this.last.x, z - this.last.z) < 1.1) return;
    const K = this.K,
      j = this.n % K,
      l = Math.hypot(dx, dz) || 1;
    this.pos.set([x, 0, z, x, 0, z], j * 6);
    this.perp.set([-dz / l, dx / l, -dz / l, dx / l], j * 4);
    this.info.set([t, k, width, 0, t, k, width, 0], j * 8);
    (this.link[j] = this.on ? 1 : 0), (this.link[(j + 1) % K] = 0);
    (this.on = !0), this.last.set(x, 0, z), this.n++;
    const idx = this.index.array;
    let m = 0;
    for (let i = 0; i < K; i++)
      if (this.link[i]) {
        const a = ((i + K - 1) % K) * 2,
          b = i * 2;
        idx.set([a, a + 1, b + 1, a, b + 1, b], m), (m += 6);
      }
    (this.index.needsUpdate = !0), this.geo.setDrawRange(0, m);
    for (const n of ["position", "aPerp", "aInfo"]) this.geo.attributes[n].needsUpdate = !0;
  }
}

export { Spray, Wake };
