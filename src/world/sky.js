import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  Vector4,
} from "three";
import { seededRandom, tileFbm } from "./concrete-texture.js";

// Time of day: the game runs in a clear Texas afternoon; ?tod=golden switches to a low
// sunset sun for the promo (the AI intro is shot at golden hour and cuts into the lineup).
const TOD = (() => {
  try {
    return new URLSearchParams(location.search).get("tod") === "golden" ? "golden" : "day";
  } catch (a) {
    return "day";
  }
})();

// One place for the sun and the sky colours so the sky dome, the reflection probe
// (env-map.js), the sun light, the fog and the post chain all agree.
// Colours are linear working-space values (they go through ACES later).
const PRESETS = {
  day: {
    // direction towards the sun: behind-left of the spawn view (front-lights the ramp face and
    // the noses of the lineup), about 38 degrees up
    sunDir: new Vector3(-0.45, 0.62, 0.64).normalize(),
    sunColor: new Color(1.0, 0.91, 0.8),
    sunIntensity: 3.3,
    zenith: new Color(0.03, 0.11, 0.5),
    horizon: new Color(0.22, 0.38, 0.74),
    haze: new Color(0.39, 0.51, 0.73),
    // far ground seen through the haze (bottom half of the reflection probe)
    ground: new Color(0.15, 0.142, 0.13),
    fogDensity: 0.0009,
    // sunset glow along the horizon on the sun side (none by day)
    glow: new Color(0, 0, 0),
    // Mie halo weights (wide, medium, tight) and the sun disc (inner, outer cos, strength, rim)
    mie: new Vector3(0.05, 0.22, 0.9),
    disc: [0.99986, 0.99993, 40, 2],
    cloudShade: new Color(0.5, 0.56, 0.68),
    cloudLit: 1.05,
    cloudCover: [0.6, 0.76],
    hemiSky: new Color(0.84, 0.9, 1.0),
    hemiGround: new Color(0.78, 0.7, 0.6),
    hemiIntensity: 0.42,
    envIntensity: 1,
    exposure: 0.9,
    bloom: { threshold: 1.3, smoothing: 0.3, intensity: 0.5 },
    // sun light placement for the live shadow box (distance along the sun ray, camera far)
    shadowDist: 200,
    shadowFar: 420,
    floodlights: !1,
    glints: !1,
  },
  golden: {
    // about 7 degrees up in the north-west: seen from the lineup TV camera (south of the row)
    // the row is lit from the left side and from behind (rim light), long shadows run towards
    // the camera
    sunDir: new Vector3(-0.638, 0.122, -0.76).normalize(),
    sunColor: new Color(1.0, 0.55, 0.25),
    sunIntensity: 9,
    zenith: new Color(0.07, 0.08, 0.13),
    horizon: new Color(0.24, 0.18, 0.19),
    haze: new Color(0.36, 0.24, 0.16),
    ground: new Color(0.06, 0.045, 0.035),
    fogDensity: 0.0012,
    glow: new Color(0.7, 0.32, 0.09),
    mie: new Vector3(0.1, 0.3, 1.6),
    disc: [0.99975, 0.99987, 60, 4],
    cloudShade: new Color(0.14, 0.11, 0.13),
    cloudLit: 0.7,
    cloudCover: [0.58, 0.74],
    hemiSky: new Color(0.7, 0.62, 0.66),
    hemiGround: new Color(0.6, 0.44, 0.32),
    hemiIntensity: 0.2,
    envIntensity: 1,
    exposure: 1.0,
    bloom: { threshold: 1.3, smoothing: 0.3, intensity: 0.6 },
    shadowDist: 500,
    shadowFar: 1100,
    floodlights: !0,
    glints: !0,
  },
};
const DAY = PRESETS[TOD];

// GLSL: radiance of the clear sky towards direction d (y up). Rayleigh-like gradient,
// darkest 90 degrees from the sun, a Mie halo around the sun and a thin haze band at the horizon.
const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform vec3 uMie;
uniform vec3 uCloudShade;
uniform vec3 uCloudK;
uniform sampler2D uClouds;
// a few fair-weather cumulus on a plane high above, fading into the haze towards the horizon
vec4 dayClouds(vec3 d, float cp){
  if (d.y < 0.012) return vec4(0.0);
  vec2 uv = d.xz / (d.y + 0.07) * 0.085 + vec2(0.31, 0.17);
  float n = texture2D(uClouds, uv).r * 0.68 + texture2D(uClouds, uv * 2.9 + 0.43).r * 0.32;
  float cov = smoothstep(uCloudK.y, uCloudK.z, n) * smoothstep(0.012, 0.09, d.y);
  float thick = smoothstep(0.62, 0.92, n);
  vec2 hz = normalize(d.xz + 1e-5), hs = normalize(uSunDir.xz + 1e-5);
  float side = 0.5 + 0.5 * dot(hz, hs);
  vec3 col = mix(uSunColor * uCloudK.x, uCloudShade, thick * 0.55) * (0.78 + 0.3 * side);
  col += uSunColor * pow(cp, 10.0) * (1.0 - thick) * 1.4;
  return vec4(col, cov * 0.92);
}
vec3 daySky(vec3 d){
  float y = d.y;
  float up = clamp(y, 0.0, 1.0);
  float c = dot(d, uSunDir);
  float cp = max(c, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));
  col *= 0.86 + 0.22 * c * c;
  col += uSunColor * (uMie.x * cp * cp * cp + uMie.y * pow(cp, 24.0) + uMie.z * pow(cp, 400.0));
  vec4 cl = dayClouds(d, cp);
  col = mix(col, cl.rgb, cl.a);
  float band = exp(-up * 10.0);
  col = mix(col, uHaze * (1.0 + 0.12 * cp * cp), band * 0.7);
  // sunset: warm glow along the horizon on the sun's side, over the haze and the clouds
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0);
  col += uGlow * (az * az * az) * exp(-up * 6.0) * (1.0 - 0.4 * cl.a);
  if (y < 0.0) col = mix(uHaze, uGround, smoothstep(0.0, -0.12, y));
  return col;
}`;

// tileable cumulus noise, made once
let Ce = null;
function cloudTexture() {
  if (Ce) return Ce;
  const a = 256,
    e = tileFbm(a, 4, seededRandom(91), 5),
    s = document.createElement("canvas");
  s.width = s.height = a;
  const t = s.getContext("2d"),
    i = t.createImageData(a, a);
  for (let o = 0; o < a * a; o++)
    (i.data[o * 4] = i.data[o * 4 + 1] = i.data[o * 4 + 2] = e[o] * 255),
      (i.data[o * 4 + 3] = 255);
  t.putImageData(i, 0, 0);
  const o = new CanvasTexture(s);
  return (o.wrapS = o.wrapT = RepeatWrapping), (Ce = o);
}
function skyUniforms() {
  return {
    uClouds: { value: cloudTexture() },
    uSunDir: { value: DAY.sunDir.clone() },
    uSunColor: { value: DAY.sunColor.clone() },
    uZenith: { value: DAY.zenith.clone() },
    uHorizon: { value: DAY.horizon.clone() },
    uHaze: { value: DAY.haze.clone() },
    uGround: { value: DAY.ground.clone() },
    uGlow: { value: DAY.glow.clone() },
    uMie: { value: DAY.mie.clone() },
    uCloudShade: { value: DAY.cloudShade.clone() },
    uCloudK: { value: new Vector3(DAY.cloudLit, DAY.cloudCover[0], DAY.cloudCover[1]) },
  };
}

function buildSky() {
  const a = new SphereGeometry(3e3, 48, 24),
    e = new ShaderMaterial({
      side: BackSide,
      depthWrite: !1,
      fog: !1,
      uniforms: { ...skyUniforms(), uDisc: { value: new Vector4(...DAY.disc) } },
      vertexShader:
        "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
      varying vec3 vDir;
      uniform vec4 uDisc;
      ${SKY_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = daySky(d);
        // sun disc with a soft rim, bright enough to bloom
        float c = dot(d, uSunDir);
        col += uSunColor * (uDisc.z * smoothstep(uDisc.x, uDisc.y, c) + uDisc.w * pow(max(c, 0.0), 3000.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    }),
    s = new Mesh(a, e);
  return (s.renderOrder = -10), (s.frustumCulled = !1), s;
}

// Distant tree line on the horizon (Central Texas: live oak and mesquite), a thin hazy
// silhouette ring 1.9 km out that travels with the player, matching the one in the probe.
// The sea starts about here (south of the runway and the town); no trees stand beyond it.
const COAST_Z = 710;
const TREE_R = 1900;

function buildTreeLine() {
  const a = TREE_R,
    e = 900,
    s = [],
    t = [];
  let i = 1;
  const o = () => ((i = (i * 16807) % 2147483647), i / 2147483647);
  let n = 0;
  for (let c = 0; c <= e; c++) {
    const r = (c / e) * Math.PI * 2,
      l = Math.cos(r) * a,
      d = Math.sin(r) * a;
    // clumps of trees with gaps for fields, plus a little per-tree jitter
    n = n * 0.55 + o() * 0.45;
    const f =
      c === e
        ? s[4]
        : Math.max(
            1.5,
            Math.max(0, Math.sin(r * 7 + 1.3) * 0.5 + Math.sin(r * 23 + 0.4) * 0.35 + 0.35) *
              (14 + 10 * n) +
              (o() < 0.3 ? 3 * o() : 0),
          );
    s.push(l, -6, d, l, f, d);
  }
  for (let c = 0; c < e; c++) {
    const r = c * 2;
    t.push(r, r + 1, r + 2, r + 1, r + 3, r + 2);
  }
  const c = new BufferGeometry();
  c.setAttribute("position", new Float32BufferAttribute(s, 3)), c.setIndex(t);
  const m = new MeshBasicMaterial({
      color: new Color(0.035, 0.045, 0.028).lerp(DAY.haze, 0.6),
      fog: !1,
      side: DoubleSide,
    }),
    // the ring follows the player; drop the trees whose direction crosses the coast line
    // before the ring radius, so the southern horizon is open sea
    u = { value: (COAST_Z - 30) / TREE_R };
  m.onBeforeCompile = (h) => {
    (h.uniforms.uCoastDz = u),
      (h.vertexShader = h.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uCoastDz;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
  float sea = smoothstep(uCoastDz - 0.06, uCoastDz + 0.02, normalize(position.xz).y);
  transformed.y = mix(transformed.y, -6.0, sea);`,
        ));
  };
  const r = new Mesh(c, m);
  // call with the ring centre (the player) every frame
  r.userData.setCenter = (x) => {
    u.value = (COAST_Z - x.z) / TREE_R;
  };
  return (r.renderOrder = -9), r;
}

export { COAST_Z, DAY, PRESETS, SKY_GLSL, TOD, buildSky, buildTreeLine, skyUniforms };
