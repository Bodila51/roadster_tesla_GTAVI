// People material: MeshStandardMaterial plus a vertex-shader rig. Per instance:
//   iCol  = packed sRGB colours (top, bottom, skin, hair)
//   iLook = (hat colour, shoe colour, outfit flags, packed shape: woman | kid << 8 | girth << 16)
//   iAnim = (walk phase, gait 0 stand .. 1 walk .. 2 run, cheer 0..1, seed 0..1)
//   iPose = (pose id * 1024 + phone use * 1000, pose weight, pose aux, animation time)
// Poses: 1 dive, 2 lie on the back, 3 sit (aux 0..1 knees, 2 = on an edge), 4 volleyball
// (aux = bump), 5 stumble, 6 panic arms, 7 wade. The walk cycle, idle sway, cheering and every
// pose are evaluated here; the CPU only advances phase and time and blends weights.
// Outfit flags: bits 0-1 top (0 none, 1 tank, 2 tee, 3 long sleeves), 2-3 bottom (0 swim,
// 1 shorts, 2 knee length, 3 long), 4 skirt, 5 barefoot, 6-7 hair (0 short, 1 long, 2 none,
// 3 bun), 8-9 headwear (0 none, 1 cap, 2 sun hat, 3 beanie), 10 phone, 11 sunglasses, 12 bikini top.
import { MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking } from "three";

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(", ")})`;

function skinGLSL(body) {
  const arr = (J) => `vec3[11](${J.map(v3).join(", ")})`;
  const t = (k) => v3([body.legs.m[k], body.legs.f[k], body.legs.k[k]]);
  return /* glsl */ `
#define PPL_PI 3.14159265
attribute vec3 aFem;
attribute vec3 aKid;
attribute vec4 aInfo;
attribute vec4 iCol;
attribute vec4 iLook;
attribute vec4 iAnim;
attribute vec4 iPose;
const vec3 PJM[11] = ${arr(body.joints.m)};
const vec3 PJF[11] = ${arr(body.joints.f)};
const vec3 PJK[11] = ${arr(body.joints.k)};
const int PPAR[11] = int[11](-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9);
const vec3 PTHIGH = ${t(0)};
const vec3 PSHIN = ${t(1)};
const vec3 PHIP = ${v3([body.hip.m, body.hip.f, body.hip.k])};
float pFem, pKid, pGirth, pPhase, pGait, pCheer, pSeed, pId, pW, pAux, pT, pPhone;
int pFlags;

float pplMix3(vec3 v) { return v.x + pFem * (v.y - v.x) + pKid * (v.z - v.x); }
vec3 pplPivot(int b) { return PJM[b] + pFem * (PJF[b] - PJM[b]) + pKid * (PJK[b] - PJM[b]); }
// a = (about x, about z, about y), applied x first
mat3 pplRot(vec3 a) {
  float cx = cos(a.x), sx = sin(a.x), cz = cos(a.y), sz = sin(a.y), cy = cos(a.z), sy = sin(a.z);
  return mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0) * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
}

vec3 pplSpecial(int j, float side, vec3 base, int id) {
  float t = pT, sd = pSeed * 6.2831853;
  if (id == 1) { // dive
    if (j == 1) return vec3(-0.15, 0.0, 0.0);
    if (j == 2) return vec3(-0.75, 0.0, 0.0);
    if (j == 3 || j == 5) return vec3(-2.85, side * 0.22, 0.0);
    if (j == 4 || j == 6) return vec3(-0.15, 0.0, 0.0);
    if (j == 7 || j == 9) return vec3(0.14, side * 0.12, 0.0);
    return vec3(0.35, 0.0, 0.0);
  }
  if (id == 2) { // lying on the back
    float behind = step(0.5, pAux);
    float kneeUp = step(0.5, fract(pAux * 7.31)) * step(0.0, side);
    if (j == 1) return vec3(0.0);
    if (j == 2) return vec3(-0.12, 0.0, 0.35 * sin(sd));
    if (j == 3 || j == 5) return mix(vec3(0.04, side * 0.2, 0.0), vec3(-2.5, side * 0.75, 0.0), behind);
    if (j == 4 || j == 6) return mix(vec3(-0.12, 0.0, 0.0), vec3(-2.1, 0.0, 0.0), behind);
    if (j == 7 || j == 9) return vec3(-0.75 * kneeUp, side * 0.06, 0.0);
    return vec3(0.05 + 1.35 * kneeUp, 0.0, 0.0);
  }
  if (id == 3) { // sitting on the ground, or on an edge with the legs hanging (aux 2)
    float edge = step(1.5, pAux);
    float kf = mix(mix(0.3, 1.5, clamp(pAux, 0.0, 1.0)), 1.45, edge);
    if (j == 1) return vec3(mix(-0.22, 0.06, edge), 0.0, 0.0);
    if (j == 2) return vec3(0.1, 0.0, 0.45 * sin(t * 0.19 + sd));
    if (j == 3 || j == 5) return mix(vec3(0.62, side * 0.3, 0.0), vec3(-0.35, side * 0.1, 0.0), edge);
    if (j == 4 || j == 6) return mix(vec3(-0.05, 0.0, 0.0), vec3(-0.75, 0.0, 0.0), edge);
    if (j == 7 || j == 9) return vec3(-1.48, side * 0.13, 0.0);
    return vec3(kf, 0.0, 0.0);
  }
  if (id == 4) { // volleyball ready stance; aux = bump
    float b = clamp(pAux, 0.0, 1.0);
    if (j == 1) return vec3(mix(0.42, 0.12, b), 0.0, 0.0);
    if (j == 2) return vec3(mix(-0.35, -0.55, b), 0.0, 0.0);
    if (j == 3 || j == 5) return vec3(mix(-0.6, -1.4, b), -side * 0.18, 0.0);
    if (j == 4 || j == 6) return vec3(mix(-0.4, -0.02, b), 0.0, 0.0);
    if (j == 7 || j == 9) return vec3(mix(-0.62, -0.22, b), side * 0.1, 0.0);
    return vec3(mix(1.05, 0.32, b), 0.0, 0.0);
  }
  if (id == 5) { // stumble: windmill arms, wobbly torso, legs keep stepping
    if (j == 1) return vec3(-0.3 + 0.18 * sin(t * 11.0), 0.22 * sin(t * 6.3 + sd), 0.0);
    if (j == 2) return vec3(-0.3 + 0.2 * sin(t * 13.0), 0.0, 0.35 * sin(t * 9.0));
    if (j == 3 || j == 5) return vec3(-(t * 13.0 + (side > 0.0 ? 0.0 : PPL_PI)), side * 0.55, 0.0);
    if (j == 4 || j == 6) return vec3(-0.25, 0.0, 0.0);
    return base;
  }
  if (id == 6) { // panic: arms up and flailing while running
    if (j == 2) return vec3(-0.15, 0.0, 0.7 * sin(t * 1.9 + sd));
    if (j == 3 || j == 5) return vec3(-0.5 + 0.6 * sin(t * 12.0 + side), side * (2.25 + 0.35 * sin(t * 14.0 + sd + side * 2.0)), 0.0);
    if (j == 4 || j == 6) return vec3(-0.55 - 0.35 * sin(t * 12.0 + side), 0.0, 0.0);
    return base;
  }
  if (id == 7) { // wading: arms held out over the water
    if (j == 3 || j == 5) return vec3(-0.2, side * (0.45 + 0.06 * sin(t * 1.1 + sd + side)), 0.0);
    if (j == 4 || j == 6) return vec3(-0.6, 0.0, 0.0);
    return base;
  }
  return base;
}

vec3 pplJoint(int j) {
  float side = (j == 3 || j == 4 || j == 7 || j == 8) ? 1.0 : -1.0;
  float wI = 1.0 - clamp(pGait, 0.0, 1.0), wR = clamp(pGait - 1.0, 0.0, 1.0), wW = 1.0 - wI - wR;
  float t = pT, sd = pSeed * 6.2831853;
  float legPh = pPhase + (side > 0.0 ? 0.0 : PPL_PI);
  float armPh = legPh + PPL_PI;
  vec3 a;
  if (j == 1) {
    a = vec3(0.025 + 0.012 * sin(t * 1.6 + sd), 0.02 * sin(t * 0.37 + sd), 0.0) * wI
      + vec3(0.06, 0.0, 0.09 * sin(pPhase)) * wW + vec3(0.3, 0.0, 0.14 * sin(pPhase)) * wR;
  } else if (j == 2) {
    a = vec3(0.04 + 0.04 * sin(t * 0.5 + sd * 2.0), 0.0, 0.6 * sin(t * 0.21 + sd * 3.0) * sin(t * 0.13 + sd)) * wI
      + vec3(0.0, 0.0, 0.25 * sin(t * 0.27 + sd)) * wW + vec3(-0.2, 0.0, 0.0) * wR;
  } else if (j == 3 || j == 5) {
    float sw = sin(armPh);
    a = vec3(-0.04, side * 0.07, 0.0) * wI + vec3(-0.34 * sw - 0.04, side * 0.09, 0.0) * wW + vec3(-0.85 * sw - 0.2, side * 0.2, 0.0) * wR;
  } else if (j == 4 || j == 6) {
    float sw = sin(armPh);
    a = vec3(-(0.14 * wI + (0.28 + 0.22 * max(0.0, sw)) * wW + 1.5 * wR), 0.0, 0.0);
  } else if (j == 7 || j == 9) {
    float sw = sin(legPh);
    a = vec3(-0.42 * sw * wW - (0.78 * sw + 0.15) * wR, side * (0.035 * wI + 0.02 * (wW + wR)), 0.0);
  } else {
    float c = max(0.0, cos(legPh));
    a = vec3(0.05 * wI + (0.08 + 0.85 * c * c) * wW + (0.35 + 1.5 * pow(c, 1.5)) * wR, 0.0, 0.0);
  }
  if (pPhone > 0.0) { // phone in the right hand, eyes on the screen
    if (j == 5) a = mix(a, vec3(-0.45, -0.04, 0.5), pPhone);
    else if (j == 6) a = mix(a, vec3(-1.45, 0.0, 0.0), pPhone);
    else if (j == 2) a = mix(a, vec3(0.4, 0.0, 0.0), pPhone);
  }
  if (pW > 0.001) a = mix(a, pplSpecial(j, side, a, int(pId + 0.5)), pW);
  if (pCheer > 0.001 && j <= 6) {
    float wave = sin(t * 9.0 + sd + side * 1.3);
    bool phone = (pFlags & 1024) != 0;
    vec3 c;
    if (j == 1) c = vec3(-0.08, 0.0, 0.0);
    else if (j == 2) c = vec3(-0.35, 0.0, 0.0);
    else if (j == 5 && phone) c = vec3(-2.05, -0.12, 0.3);
    else if (j == 6 && phone) c = vec3(-0.4, 0.0, 0.0);
    else if (j == 3 || j == 5) c = vec3(-0.25, side * (2.5 + 0.22 * wave), 0.0);
    else c = vec3(-0.3 - 0.35 * (0.5 + 0.5 * wave), 0.0, 0.0);
    a = mix(a, c, pCheer);
  }
  return a;
}

// keeps the lower foot on the ground; sitting rests the pelvis on the ground
float pplRootY() {
  float Lt = pplMix3(PTHIGH), Ls = pplMix3(PSHIN);
  float aL = pplJoint(7).x, kL = pplJoint(8).x, aR = pplJoint(9).x, kR = pplJoint(10).x;
  float y = max(Lt * cos(aL) + Ls * cos(aL + kL), Lt * cos(aR) + Ls * cos(aR + kR)) - (Lt + Ls);
  int id = int(pId + 0.5);
  if (pW > 0.001) {
    if (id == 3) y = mix(y, 0.1 - pplMix3(PHIP), pW);
    else if (id == 1 || id == 2) y = mix(y, 0.0, pW);
  }
  return y + pCheer * 0.07 * max(0.0, sin(pT * 7.5 + pSeed * 6.2831853)) * (1.0 - pW);
}

void pplSkin(in vec3 pos0, in vec3 nrm0, out vec3 P, out vec3 N) {
  pPhase = iAnim.x; pGait = iAnim.y; pCheer = iAnim.z; pSeed = iAnim.w;
  float idf = floor(iPose.x / 1024.0);
  pId = idf; pPhone = (iPose.x - idf * 1024.0) / 1000.0;
  pW = iPose.y; pAux = iPose.z; pT = iPose.w;
  float sh = iLook.w;
  float gz = floor(sh / 65536.0); sh -= gz * 65536.0;
  float kz = floor(sh / 256.0);
  pFem = (sh - kz * 256.0) / 255.0; pKid = kz / 255.0; pGirth = gz / 255.0 * 1.5 - 0.5;
  pFlags = int(iLook.z + 0.5);
  int bone = int(aInfo.x + 0.5), part = int(aInfo.z + 0.5);
  int hair = (pFlags >> 6) & 3, hw = (pFlags >> 8) & 3;
  bool vis = true;
  if (part == 1) vis = hair != 2;
  else if (part == 2) vis = hair == 1;
  else if (part == 3) vis = hair == 3;
  else if (part == 4) vis = hw != 0;
  else if (part == 5) vis = hw == 1;
  else if (part == 6) vis = hw == 2;
  else if (part == 7) vis = (pFlags & 1024) != 0;
  else if (part == 8) vis = (pFlags & 2048) != 0;
  else if (part == 9) vis = (pFlags & 16) != 0;
  if (!vis) { P = vec3(0.0); N = vec3(0.0, 1.0, 0.0); return; }
  vec3 p = pos0 + pFem * aFem + pKid * aKid;
  float gw = aInfo.w * pGirth;
  p.x *= 1.0 + 0.16 * gw; p.z *= 1.0 + 0.28 * gw;
  vec3 shift = vec3(0.0);
  if (bone >= 3 && bone <= 6) { shift.x = (bone <= 4 ? 1.0 : -1.0) * 0.024 * pGirth; p += shift; }
  vec3 n = nrm0;
  int b = bone;
  for (int k = 0; k < 3; k++) {
    if (b <= 0) break;
    vec3 J = pplPivot(b) + ((b >= 3 && b <= 6) ? shift : vec3(0.0));
    mat3 R = pplRot(pplJoint(b));
    p = R * (p - J) + J;
    n = R * n;
    b = PPAR[b];
  }
  p.y += pplRootY();
  P = p; N = n;
}
`;
}

const COLOR_GLSL = /* glsl */ `
varying vec3 vPCol;
varying float vPEmit;
varying float vPRough;
vec3 pplUnpack(float f) {
  float r = floor(f / 65536.0), g = floor((f - r * 65536.0) / 256.0), b = f - r * 65536.0 - g * 256.0;
  return pow(vec3(r, g, b) / 255.0, vec3(2.2));
}
void pplColor() {
  int reg = int(aInfo.y + 0.5);
  int top = pFlags & 3, bot = (pFlags >> 2) & 3;
  bool skirt = (pFlags & 16) != 0, bare = (pFlags & 32) != 0, bikini = (pFlags & 4096) != 0;
  vec3 c = pplUnpack(iCol.z), topC = pplUnpack(iCol.x), botC = pplUnpack(iCol.y);
  float r = 0.6, e = 0.0;
  if (reg == 1) { if (top > 0 || bikini) { c = topC; r = 0.85; } }
  else if (reg == 17 || reg == 2) { if (top > 0) { c = topC; r = 0.85; } }
  else if (reg == 3) { if (top >= 2) { c = topC; r = 0.85; } }
  else if (reg == 4) { if (top == 3) { c = topC; r = 0.85; } }
  else if (reg == 5 || reg == 15) { c = botC; r = 0.8; }
  else if (reg == 6) { if (bot >= 1 && !skirt) { c = botC; r = 0.8; } }
  else if (reg == 7) { if (bot >= 2 && !skirt) { c = botC; r = 0.8; } }
  else if (reg == 8) { if (bot == 3 && !skirt) { c = botC; r = 0.8; } }
  else if (reg == 9) { if (!bare) { c = pplUnpack(iLook.y); r = 0.7; } }
  else if (reg == 10) { c = pplUnpack(iCol.w); r = 0.55; }
  else if (reg == 11) { c = pplUnpack(iLook.x); r = 0.8; }
  else if (reg == 12) { c = vec3(0.012); r = 0.35; }
  else if (reg == 13) { c = vec3(0.02, 0.03, 0.05); r = 0.2; e = 1.0; }
  else if (reg == 14) { c = vec3(0.02, 0.016, 0.012); r = 0.3; }
  else if (reg == 16) { c = vec3(0.01); r = 0.15; }
  vPCol = c; vPRough = r; vPEmit = e;
}
`;

function createPeopleMaterials(body) {
  const skin = skinGLSL(body);
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + skin + COLOR_GLSL)
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal; vec3 pplP; pplSkin(position, normal, pplP, objectNormal); pplColor();")
      .replace("#include <begin_vertex>", "vec3 transformed = pplP;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPCol;\nvarying float vPEmit;\nvarying float vPRough;")
      .replace("#include <color_fragment>", "diffuseColor.rgb *= vPCol;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vPRough;")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance += vPEmit * vec3(0.45, 0.65, 1.0) * 1.6;");
  };
  material.customProgramCacheKey = () => "people-v1";
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + skin)
      .replace("#include <begin_vertex>", "vec3 pplN; vec3 transformed; pplSkin(position, vec3(0.0, 1.0, 0.0), transformed, pplN);");
  };
  depth.customProgramCacheKey = () => "people-depth-v1";
  return { material, depth };
}

export { createPeopleMaterials };
