import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector4,
} from "three";
import { COAST, COAST_GLSL, PIER } from "./coast.js";
import { SKY_GLSL } from "../sky.js";

// The sea: one draw call. A polar grid (dense near the camera, 5.8 km out to the horizon) that
// follows the camera; vertices on land are clamped under the sand. Shading: wave normals from a
// tileable slope texture (three drifting octaves) plus the vertex swell, Fresnel reflection of the
// analytic day sky (the same daySky() as the dome), sun glints, turquoise shallows over the sand
// (premultiplied alpha, the sand shader tints what lies under the water), deep blue offshore, foam
// at the swash line and on breakers over the sandbars, a splash ring, and blob shadows of the car
// and the pier deck. No reflection pass.
function polarGrid(NA = 96, NR = 72, rMax = 5800, a = 0.09) {
  const pos = [0, 0, 0],
    idx = [],
    den = Math.exp(a * NR) - 1;
  for (let i = 1; i <= NR; i++) {
    const r = (rMax * (Math.exp(a * i) - 1)) / den;
    for (let j = 0; j < NA; j++) {
      const t = (j / NA) * Math.PI * 2;
      pos.push(r * Math.cos(t), 0, r * Math.sin(t));
    }
  }
  for (let j = 0; j < NA; j++) idx.push(0, 1 + ((j + 1) % NA), 1 + j);
  for (let i = 0; i < NR - 1; i++)
    for (let j = 0; j < NA; j++) {
      const a0 = 1 + i * NA + j,
        a1 = 1 + i * NA + ((j + 1) % NA);
      idx.push(a0, a1, a1 + NA, a0, a1 + NA, a0 + NA);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3)), g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec2 vSlope;
varying float vFogDepth;
${COAST_GLSL}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.z = max(w.z, ${COAST.waterStartZ.toFixed(2)});
  vec3 s = waterSurface(w.xz, uTime, distance(w.xz, cameraPosition.xz));
  w.y = WATER_Y + s.z;
  vWorld = w.xyz;
  vSlope = s.xy;
  vec4 mv = viewMatrix * w;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uWaves;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec4 uSplash;
uniform vec4 uShadow;
uniform vec4 uShadowAxes;
uniform vec4 uDeckA;
uniform vec4 uDeckB;
uniform float uDeckY;
#ifdef USE_FOG
uniform vec3 fogColor;
uniform float fogDensity;
uniform float fogNear;
uniform float fogFar;
#endif
varying vec3 vWorld;
varying vec2 vSlope;
varying float vFogDepth;
${SKY_GLSL}
${COAST_GLSL}
float inRect(vec2 p, vec4 r, float s){
  vec2 a = smoothstep(r.xy - s, r.xy + s, p) * (1.0 - smoothstep(r.zw - s, r.zw + s, p));
  return a.x * a.y;
}
vec2 rot(vec2 v, vec2 cs){ return vec2(cs.x * v.x - cs.y * v.y, cs.y * v.x + cs.x * v.y); }
void main(){
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vWorld.xz;
  float t = uTime;

  // wave normals: three drifting octaves, rotated against each other so the tiling hides, and a
  // very large one that only modulates the roughness (gusty patches)
  const vec2 R2 = vec2(0.8, 0.6);
  const vec2 R3 = vec2(0.6, -0.8);
  vec4 w1 = texture2D(uWaves, p * 0.0323 + t * vec2(0.0021, -0.0097));
  vec4 w2 = texture2D(uWaves, rot(p, R2) * 0.0885 + t * vec2(-0.011, -0.019));
  vec4 w3 = texture2D(uWaves, rot(p, R3) * 0.244 + t * vec2(0.024, -0.035));
  vec4 wb = texture2D(uWaves, p * 0.0019 + t * vec2(0.0004, 0.0002));
  float gust = 0.55 + 0.9 * wb.b;
  vec2 g = (w1.rg - 0.5) * 0.62
    + rot(w2.rg - 0.5, vec2(R2.x, -R2.y)) * 0.42
    + rot(w3.rg - 0.5, vec2(R3.x, -R3.y)) * 0.3;
  g *= gust / (1.0 + dist * 0.0022);

  // depth below this pixel of water (swell and swash included)
  float dl = vWorld.y - seabedY(p);
  float d = max(dl, 0.0);
  // the surf zone: breakers rolling in over the bars and onto the beach
  float zone = smoothstep(1.25, 0.45, d) * smoothstep(0.02, 0.14, d);
  float ph = p.y * 0.078 + t * 0.155 + 0.6 * sin(p.x * 0.0091) + 0.3 * sin(p.x * 0.031 + 1.3) + (w1.b - 0.5) * 0.3;
  float wf = fract(ph);
  g *= 1.0 - 0.35 * zone;
  g.y += zone * 0.14 * sin(6.2832 * ph);
  g += vSlope;

  // splash ring and ripples
  float sFoam = 0.0;
  if (uSplash.w > 0.0) {
    vec2 sd = p - uSplash.xy;
    float r = length(sd) + 1e-3, a = uSplash.z;
    float R0 = 1.2 + a * 5.5;
    float ring = exp(-pow((r - R0) / (0.6 + a * 0.5), 2.0));
    float k = uSplash.w * exp(-a * 0.75);
    g += sd / r * sin((r - R0) * 2.4) * 0.3 * ring * k;
    sFoam = k * (ring * 0.9 + (1.0 - smoothstep(0.0, R0, r)) * 0.8 * exp(-a * 1.3));
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  // shadows: the car (a soft ellipse projected along the sun) and the pier deck
  vec2 q = p - uShadow.xy;
  vec2 qa = vec2(dot(q, uShadowAxes.xy), dot(q, vec2(-uShadowAxes.y, uShadowAxes.x))) / uShadowAxes.zw;
  float sh = uShadow.z * (1.0 - smoothstep(0.45, 1.0, length(qa)));
  vec2 pd = p + uSunDir.xz / uSunDir.y * (uDeckY - vWorld.y);
  sh = max(sh, 0.9 * max(inRect(pd, uDeckA, 0.45), inRect(pd, uDeckB, 0.45)));

  // reflection: Fresnel on the analytic sky, sun glints that soften with distance
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.015;
  vec3 sky = daySky(normalize(R));
  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  float sharp = mix(2600.0, 180.0, smoothstep(10.0, 600.0, dist));
  vec3 spec = uSunColor * (pow(nh, sharp) * sharp * 0.032 + pow(nh, 70.0) * 0.22) * (1.0 - sh);

  // the water body: light that comes back out of the water, and what shows through (premultiplied)
  float cosT = sqrt(1.0 - (1.0 - V.y * V.y) / 1.77);
  float T = exp(-0.8 * d / max(cosT, 0.2)) * (1.0 - smoothstep(4.0, 6.0, d));
  vec3 body = mix(uShallow, uMid, smoothstep(0.7, 5.0, d));
  body = mix(body, uDeep, smoothstep(5.0, 13.0, d)) * (1.0 - 0.5 * sh);

  // foam: lace at the swash line, breakers, the splash
  float lace = w1.a * 0.5 + w2.a * 0.5;
  float edge = 1.0 - smoothstep(0.0, 0.07, dl);
  float foam = edge * smoothstep(0.35, 0.75, lace + edge * 0.45);
  float crest = exp(-wf * 9.0) + 0.3 * exp(-wf * 2.5) + 0.7 * smoothstep(0.965, 1.0, wf);
  foam = max(foam, zone * crest * smoothstep(0.3, 0.7, lace + 0.2));
  foam = clamp(max(foam, sFoam * smoothstep(0.2, 0.6, lace + 0.35)), 0.0, 1.0);

  vec3 col = sky * F + spec + body * (1.0 - T) * (1.0 - F);
  float alpha = 1.0 - (1.0 - F) * T;
  col = mix(col, uFoam * (1.0 - 0.45 * sh), foam);
  alpha = mix(alpha, 1.0, foam);
#ifdef USE_FOG
  #ifdef FOG_EXP2
  float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  col = mix(col, fogColor * alpha, fogF);
#endif
  gl_FragColor = vec4(col, alpha);
}`;

function buildWater({ waves, sky, time }) {
  const u = UniformsUtils.merge([UniformsLib.fog]);
  Object.assign(u, sky, {
    uTime: time,
    uWaves: { value: waves },
    uDeep: { value: new Color(0.006, 0.03, 0.07) },
    uMid: { value: new Color(0.012, 0.085, 0.13) },
    uShallow: { value: new Color(0.03, 0.26, 0.25) },
    uFoam: { value: new Color(0.85, 0.88, 0.9) },
    uSplash: { value: new Vector4(0, 0, 0, 0) },
    uShadow: { value: new Vector4(0, 0, 0, 0) },
    uShadowAxes: { value: new Vector4(1, 0, 2.6, 1.3) },
    uDeckA: { value: new Vector4(PIER.x - PIER.half, PIER.solidZ, PIER.x + PIER.half, PIER.z1) },
    uDeckB: { value: new Vector4(PIER.x + PIER.head.x0, PIER.head.z0, PIER.x + PIER.head.x1, PIER.head.z1) },
    uDeckY: { value: PIER.deckY - 0.3 },
  });
  const mat = new ShaderMaterial({
      uniforms: u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: !0,
      premultipliedAlpha: !0,
      depthWrite: !0,
      fog: !0,
    }),
    mesh = new Mesh(polarGrid(), mat);
  (mesh.frustumCulled = !1), (mesh.renderOrder = -1), (mesh.name = "sea");
  mesh.userData.noStaticShadow = !0;
  return {
    mesh,
    uniforms: u,
    update(camera) {
      mesh.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
    },
  };
}

export { buildWater };
