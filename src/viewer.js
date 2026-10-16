import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import {
  BackSide,
  CircleGeometry,
  Clock,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  RectAreaLight,
  Scene,
  SphereGeometry,
  SpotLight,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { buildRoadster, loadRoadster } from "./car/roadster.js";
import { ThrusterPlumes } from "./fx/plumes.js";

RectAreaLightUniformsLib.init();
const s9 = document.getElementById("c"),
  y = new WebGLRenderer({
    canvas: s9,
    antialias: !1,
    powerPreference: "high-performance",
    stencil: !1,
    depth: !1,
  });
y.setPixelRatio(Math.min(devicePixelRatio, 2));
y.setSize(innerWidth, innerHeight);
y.shadowMap.enabled = !0;
y.shadowMap.type = PCFSoftShadowMap;
y.toneMapping = NoToneMapping;
const d = new Scene(),
  w = new PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
w.position.set(5.2, 1.5, 6);
function h0(s) {
  const e = new Scene();
  e.add(
    new Mesh(
      new SphereGeometry(40, 32, 16),
      new MeshBasicMaterial({
        color: s ? 329224 : 2763824,
        side: BackSide,
      }),
    ),
  );
  const t = (l, p, g, T, x) => {
      const E = new Mesh(
        new PlaneGeometry(l, p),
        new MeshBasicMaterial({
          color: x,
          side: DoubleSide,
        }),
      );
      E.position.set(...g), E.lookAt(...T), e.add(E);
    },
    i = s ? 0.6 : 1;
  t(30, 6, [0, 18, 0], [0, 0, 0], new Color(5 * i, 5 * i, 5.2 * i)),
    t(14, 8, [16, 6, 8], [0, 1, 0], new Color(3 * i, 3 * i, 3.2 * i)),
    t(14, 8, [-16, 6, -6], [0, 1, 0], new Color(2.2 * i, 2.2 * i, 2.4 * i)),
    t(
      30,
      1.2,
      [0, 1.5, -18],
      [0, 1, 0],
      s ? new Color(4, 0.2, 0.3) : new Color(1.6, 1.6, 1.6),
    );
  const o = new PMREMGenerator(y),
    a = o.fromScene(e, 0.03).texture;
  return o.dispose(), a;
}
const r0 = h0(!1),
  i9 = h0(!0);
d.environment = r0;
const l0 = new MeshStandardMaterial({
  color: 1711136,
  roughness: 0.42,
  metalness: 0,
});
l0.onBeforeCompile = (s) => {
  s.fragmentShader = s.fragmentShader.replace(
    "#include <dithering_fragment>",
    `#include <dithering_fragment>
    float r = length(vViewPosition.xz) ;`,
  );
};
const V = new Mesh(new CircleGeometry(30, 96), l0);
V.rotation.x = -Math.PI / 2;
V.receiveShadow = !0;
d.add(V);
const c0 = new Color(1382171),
  o9 = new Color(329224);
d.background = c0;
d.fog = new Fog(1382171, 14, 34);
const Y = new RectAreaLight(16777215, 6, 8, 2.5);
Y.position.set(0, 6, 0);
Y.lookAt(0, 0, 0);
d.add(Y);
const v = new RectAreaLight(14674175, 4, 6, 1.5);
v.position.set(-6, 2.5, -5);
v.lookAt(0, 0.6, 0);
d.add(v);
const z = new RectAreaLight(16774376, 3, 5, 2);
z.position.set(6, 2, 5);
z.lookAt(0, 0.6, 0);
d.add(z);
const S = new DirectionalLight(16777215, 1.2);
S.position.set(3, 10, 4);
S.castShadow = !0;
S.shadow.mapSize.set(2048, 2048);
Object.assign(S.shadow.camera, {
  left: -4,
  right: 4,
  top: 4,
  bottom: -4,
  near: 1,
  far: 30,
});
S.shadow.radius = 6;
d.add(S);
d.add(new HemisphereLight(8425632, 1052688, 0.25));
await loadRoadster(); // GLB car if public/models/roadster.glb exists
const c = buildRoadster();
d.add(c.root);
c.wing.visible = !1;
const n9 = new ThrusterPlumes(c),
  O = new SpotLight(15397631, 60, 30, 0.5, 0.6, 2);
O.position.set(0, 0.6, 2.2);
O.target.position.set(0, 0, 10);
c.body.add(O);
c.body.add(O.target);
const u = new OrbitControls(w, y.domElement);
u.target.set(0, 0.55, 0);
u.enableDamping = !0;
u.dampingFactor = 0.06;
u.minDistance = 3.2;
u.maxDistance = 18;
u.maxPolarAngle = Math.PI * 0.495;
u.autoRotate = !0;
u.autoRotateSpeed = 0.6;
u.addEventListener("start", () => {
  document.getElementById("hint").style.opacity = 0;
});
const C = new EffectComposer(y, {
  frameBufferType: HalfFloatType,
});
C.addPass(new RenderPass(d, w));
const a9 = new BloomEffect({
  mipmapBlur: !0,
  luminanceThreshold: 0.95,
  intensity: 1,
  radius: 0.7,
});
C.addPass(new EffectPass(w, a9));
C.addPass(
  new EffectPass(
    w,
    new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
    }),
    new VignetteEffect({
      darkness: 0.5,
      offset: 0.3,
    }),
    new SMAAEffect(),
  ),
);
const h = {
    lights: !0,
    wing: !1,
    night: !1,
    thrust: !1,
  },
  R = (s, e) =>
    document.getElementById(s).addEventListener("click", (t) => {
      const i = e();
      t.currentTarget.classList.toggle("on", i);
    });
R("b-rot", () => (u.autoRotate = !u.autoRotate));
R("b-lights", () => (h.lights = !h.lights));
R("b-wing", () => (h.wing = !h.wing));
R("b-env", () => (h.night = !h.night));
R("b-thrust", () => (h.thrust = !h.thrust));
const h9 = new Clock();
let X = 0;
function d0() {
  requestAnimationFrame(d0);
  const s = Math.min(0.05, h9.getDelta());
  (X += s), u.update();
  const e = h.lights ? 1 : 0;
  (c.mats.head.emissiveIntensity = 9 * e),
    (c.mats.lamp.emissiveIntensity = 2.2 * e),
    (c.mats.tail.emissiveIntensity = 7 * e),
    (c.mats.tailDim.emissiveIntensity = 1.2 * e),
    (O.intensity = 60 * e);
  const t = c.wing.userData;
  (c.wing.position.y +=
    ((h.wing ? t.upY : t.stowY) - c.wing.position.y) * Math.min(1, s * 4)),
    (c.wing.visible = c.wing.position.y > t.stowY + 0.02),
    (d.environment = h.night ? i9 : r0),
    (d.background = h.night ? o9 : c0),
    d.fog.color.copy(d.background),
    (Y.intensity = h.night ? 1.5 : 6),
    (z.intensity = h.night ? 0.6 : 3),
    (v.intensity = h.night ? 3 : 4);
  const i = h.thrust ? 0.7 + 0.3 * Math.sin(X * 3) : 0;
  n9.update(s, X, {
    lift: i,
    rear: i,
    side: 0,
    top: 0,
  });
  for (const o of c.nozzleGlows)
    o.material.emissiveIntensity = h.thrust ? 6 : 0;
  for (const o of c.wheels) o.spin.rotation.x = 0;
  C.render(s);
}
addEventListener("resize", () => {
  y.setSize(innerWidth, innerHeight),
    C.setSize(innerWidth, innerHeight),
    (w.aspect = innerWidth / innerHeight),
    w.updateProjectionMatrix();
});
d0();
window.__v = {
  car: c,
  scene: d,
  camera: w,
  controls: u,
  state: h,
};
const A = new URLSearchParams(location.search);
if (A.get("cine")) {
  (document.querySelector(".bar").style.display = "none"),
    (document.querySelector(".hint").style.display = "none"),
    (document.querySelector(".top").style.display = "none");
  for (const s of document.querySelectorAll('a[href*="x.com"]'))
    s.style.display = "none";
}
A.get("spin") && (u.autoRotateSpeed = +A.get("spin"));
A.get("night") && (h.night = !0);
A.get("wing") && (h.wing = !0);
