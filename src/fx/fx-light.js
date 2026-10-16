import { Color, CubeUVReflectionMapping, Vector3 } from "three";

// Shared daylight lighting for the effect shaders (vapor, dust, tyre smoke, jet cores).
// The values are read from the scene the effects render in: the strongest DirectionalLight is
// the sun, Hemisphere and Ambient lights add sky/ground fill, and scene.environment (a PMREM)
// is sampled for image-based fill, so particles are lit like the car paint and the concrete.
// Conventions match three's Lambert terms: radiance = albedo * (sun * cos / PI + ambient).

const fxUniforms = {
  uSunDir: { value: new Vector3(0.55, 0.62, 0.56).normalize() }, // world space, towards the sun
  uSunCol: { value: new Color(3, 2.85, 2.7) }, // light colour * intensity
  uSkyAmb: { value: new Color(0.3, 0.33, 0.4) }, // hemisphere sky + ambient, already / PI
  uGndAmb: { value: new Color(0.2, 0.19, 0.17) }, // hemisphere ground + ambient, already / PI
  envMap: { value: null },
  envMapIntensity: { value: 1 },
};

// Vertex part: view-space sun and up vectors and the ambient radiance for up/down normals.
const fxLightVertex = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSkyAmb; uniform vec3 uGndAmb;
#ifdef FX_ENV
  uniform sampler2D envMap; uniform float envMapIntensity;
  #include <cube_uv_reflection_fragment>
#endif
varying vec3 vSunV; varying vec3 vUpV; varying vec3 vAmbUp; varying vec3 vAmbDn;
void fxLightVertex() {
  vSunV = normalize(mat3(viewMatrix) * uSunDir);
  vUpV = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
  vAmbUp = uSkyAmb; vAmbDn = uGndAmb;
  #ifdef FX_ENV
    vAmbUp += textureCubeUV(envMap, vec3(0.0, 1.0, 0.0), 1.0).rgb * envMapIntensity;
    vAmbDn += textureCubeUV(envMap, vec3(0.0, -1.0, 0.0), 1.0).rgb * envMapIntensity;
  #endif
}`;

// Fragment part: soft (wrapped) sun term for a puff normal, sky/ground fill, sun visibility.
const fxLightFragment = /* glsl */ `
uniform vec3 uSunCol;
varying vec3 vSunV; varying vec3 vUpV; varying vec3 vAmbUp; varying vec3 vAmbDn;
vec3 fxShade(vec3 n, float sunVis, float wrap, float skyVis) {
  // wrapped diffuse plus a floor for light scattered through the volume
  float d = 0.14 + 0.86 * max(0.0, (dot(n, vSunV) + wrap) / (1.0 + wrap));
  return mix(vAmbDn, vAmbUp, dot(n, vUpV) * 0.5 + 0.5) * skyVis + uSunCol * (RECIPROCAL_PI * d * sunVis);
}
// Henyey-Greenstein forward scattering towards the sun (silver lining on thin vapor).
float fxPhase(vec3 viewDirToFrag, float g) {
  float mu = dot(normalize(viewDirToFrag), vSunV);
  float g2 = g * g;
  return 0.25 * (1.0 - g2) / pow(max(1e-3, 1.0 + g2 - 2.0 * g * mu), 1.5);
}`;

const materials = new Set();
const state = { frame: -1, scan: 0, suns: [], hemis: [], ambs: [], env: undefined, envH: 0 };
const _a = new Vector3(),
  _b = new Vector3(),
  _c = new Color();

function registerFxMaterial(m) {
  materials.add(m);
  applyEnvDefines(m);
  return m;
}

function applyEnvDefines(m) {
  const d = m.defines || (m.defines = {});
  const had = "FX_ENV" in d;
  delete d.FX_ENV, delete d.ENVMAP_TYPE_CUBE_UV;
  delete d.CUBEUV_TEXEL_WIDTH, delete d.CUBEUV_TEXEL_HEIGHT, delete d.CUBEUV_MAX_MIP;
  if (state.envH > 0) {
    // same sizes three computes for its own materials (WebGLProgram generateCubeUVSize)
    const maxMip = Math.log2(state.envH) - 2;
    d.FX_ENV = "";
    d.ENVMAP_TYPE_CUBE_UV = "";
    d.CUBEUV_TEXEL_WIDTH = 1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16));
    d.CUBEUV_TEXEL_HEIGHT = 1 / state.envH;
    d.CUBEUV_MAX_MIP = maxMip.toFixed(1);
  }
  if (had !== "FX_ENV" in d || state.envH > 0) m.needsUpdate = !0;
}

// Called from the effects' onBeforeRender; does its work once per rendered frame.
function updateFxLighting(renderer, scene) {
  const f = renderer.info.render.frame;
  if (f === state.frame || !scene || !scene.isScene) return;
  state.frame = f;
  if (state.scan-- <= 0) {
    // re-scan the light list now and then (lights are added/removed rarely)
    state.scan = 90;
    state.suns.length = state.hemis.length = state.ambs.length = 0;
    scene.traverseVisible((o) => {
      o.isDirectionalLight
        ? state.suns.push(o)
        : o.isHemisphereLight
          ? state.hemis.push(o)
          : o.isAmbientLight && state.ambs.push(o);
    });
  }
  let sun = null,
    best = 0;
  for (const l of state.suns) {
    const k = l.intensity * (l.color.r + l.color.g + l.color.b);
    l.visible && k > best && ((best = k), (sun = l));
  }
  const U = fxUniforms;
  if (sun) {
    _a.setFromMatrixPosition(sun.matrixWorld);
    _b.setFromMatrixPosition(sun.target.matrixWorld);
    _a.sub(_b);
    _a.lengthSq() > 1e-8 && U.uSunDir.value.copy(_a.normalize());
    U.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
  } else U.uSunCol.value.setRGB(0, 0, 0);
  U.uSkyAmb.value.setRGB(0, 0, 0);
  U.uGndAmb.value.setRGB(0, 0, 0);
  for (const h of state.hemis)
    h.visible &&
      (U.uSkyAmb.value.add(_c.copy(h.color).multiplyScalar(h.intensity)),
      U.uGndAmb.value.add(_c.copy(h.groundColor).multiplyScalar(h.intensity)));
  for (const a of state.ambs)
    a.visible &&
      (_c.copy(a.color).multiplyScalar(a.intensity),
      U.uSkyAmb.value.add(_c),
      U.uGndAmb.value.add(_c));
  U.uSkyAmb.value.multiplyScalar(1 / Math.PI);
  U.uGndAmb.value.multiplyScalar(1 / Math.PI);
  const env = scene.environment;
  const ok = env && env.mapping === CubeUVReflectionMapping && env.image && env.image.height;
  U.envMap.value = ok ? env : null;
  U.envMapIntensity.value = scene.environmentIntensity ?? 1;
  const h = ok ? env.image.height : 0;
  if (h !== state.envH) {
    state.envH = h;
    for (const m of materials) applyEnvDefines(m);
  }
}

// Sun direction (world) for CPU-side tests such as the car shadow on the vapor.
const fxSunDir = fxUniforms.uSunDir.value;

export { fxUniforms, fxLightVertex, fxLightFragment, registerFxMaterial, updateFxLighting, fxSunDir };
