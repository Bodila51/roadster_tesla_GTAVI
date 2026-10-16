import "./capture/boot.js"; // capture mode hook: inert unless the URL has ?capture
import "./style.css";
import { N8AOPostPass } from "n8ao";
import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import {
  Clock,
  Color,
  HalfFloatType,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  SRGBColorSpace,
  Scene,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { AudioEngine } from "./audio/audio.js";
import { CameraDirector, fitFov } from "./camera/camera-director.js";
import { buildRoadster, loadRoadster } from "./car/roadster.js";
import { ThrusterPlumes } from "./fx/plumes.js";
import { SkidMarks } from "./fx/skids.js";
import { SmokeSystem } from "./fx/smoke.js";
import { Sparks } from "./fx/sparks.js";
import { GameState } from "./game/game-state.js";
import { RunMode } from "./game/run-mode.js";
import { TouchControls, ji } from "./input/touch-controls.js";
import { CarPhysics } from "./physics/car-physics.js";
import { Hud } from "./ui/hud.js";
import { Minimap } from "./ui/minimap.js";
import { Tutorial } from "./ui/tutorial.js";
import { BullseyeTarget } from "./world/bullseye.js";
import { buildCity } from "./world/city/index.js";
import { CITY } from "./world/city/layout.js";
import { buildEnvironment } from "./world/environment.js";
import { beamMaterial } from "./world/floodlights.js";
import { Halfpipe } from "./world/halfpipe.js";
import { WORLD } from "./world/layout.js";
import { buildSea } from "./world/sea/sea.js";
import { buildLineup } from "./world/lineup.js";
import { Loop } from "./world/loop.js";
import { MassDriver } from "./world/mass-driver.js";
import { ProfileRamp } from "./world/ramp.js";
import { buildPeople } from "./world/people/index.js";
import { DAY } from "./world/sky.js";

const ft = new URLSearchParams(location.search),
  De = ji();
De && document.body.classList.add("touch");
const Xi = document.getElementById("gl"),
  Lt = new WebGLRenderer({
    canvas: Xi,
    powerPreference: "high-performance",
    antialias: !1,
    stencil: !1,
    depth: !1,
  });
Lt.setPixelRatio(
  Math.min(devicePixelRatio, ft.get("pr") ? +ft.get("pr") : De ? 1.25 : 1.5),
);
Lt.setSize(innerWidth, innerHeight);
Lt.shadowMap.enabled = !0;
Lt.shadowMap.type = PCFSoftShadowMap;
Lt.toneMapping = NoToneMapping;
Lt.toneMappingExposure = ft.get("exp") ? +ft.get("exp") : DAY.exposure;
Lt.outputColorSpace = SRGBColorSpace;
const ct = new Scene(),
  wt = new PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6e3);
wt.position.set(8, 3, 40);
const Et = new EffectComposer(Lt, {
  frameBufferType: HalfFloatType,
});
let Tt = null;
try {
  (Tt = new N8AOPostPass(ct, wt, innerWidth, innerHeight)),
    (Tt.configuration.aoRadius = 1.4),
    (Tt.configuration.distanceFalloff = 1),
    (Tt.configuration.intensity = 1.6),
    (Tt.configuration.halfRes = !0),
    De && (Tt.enabled = !1),
    (Tt.configuration.gammaCorrection = !1),
    Et.addPass(new RenderPass(ct, wt)),
    Et.addPass(Tt);
} catch (a) {
  console.warn("AO disabled", a), Et.addPass(new RenderPass(ct, wt));
}
const to = new BloomEffect({
    mipmapBlur: !0,
    luminanceThreshold: DAY.bloom.threshold,
    luminanceSmoothing: DAY.bloom.smoothing,
    intensity: DAY.bloom.intensity,
    radius: 0.7,
  }),
  Ji = new ChromaticAberrationEffect({
    offset: new Vector2(3e-4, 3e-4),
    radialModulation: !0,
    modulationOffset: 0.45,
  }),
  _i = new VignetteEffect({
    darkness: 0.36,
    offset: 0.34,
  }),
  eo = new NoiseEffect({
    blendFunction: BlendFunction.OVERLAY,
    premultiply: !1,
  });
eo.blendMode.opacity.value = 0.025;
const $i = new ToneMappingEffect({
    mode:
      ft.get("tm") === "agx"
        ? ToneMappingMode.AGX
        : ToneMappingMode.ACES_FILMIC,
  }),
  ta = new SMAAEffect({
    preset: SMAAPreset.HIGH,
  });
Et.addPass(new EffectPass(wt, to, Ji));
Et.addPass(new EffectPass(wt, $i, _i, eo, ta));
const Kt = buildEnvironment(ct, Lt),
  zt = new ProfileRamp({
    position: WORLD.ramp.clone().setY(0.04),
    heading: new Vector3(0, 0, -1),
  });
ct.add(zt.group);
// city: Port Sabal south of the runway (?nocity skips it)
const Ct = ft.get("nocity") ? null : buildCity(ct, Lt, { mobile: De });
// daylight: no wall uplights (night only)
const so = [];
const Re = new Halfpipe({
  center: WORLD.halfpipe.clone(),
  along: new Vector3(1, 0, 0),
  length: 64,
});
ct.add(Re.group);
const Oe = new Loop({
  position: WORLD.loop.clone().setY(0.04),
  heading: new Vector3(0, 0, 1),
});
ct.add(Oe.group);
const ae = new MassDriver({
  position: WORLD.massdriver.clone().setY(0.04),
  heading: new Vector3(1, 0, 0),
});
ct.add(ae.group);
const vs = new BullseyeTarget(WORLD.bullseye);
ct.add(vs.group);
const xs = buildLineup();
xs.group.position.copy(WORLD.lineup);
ct.add(xs.group);
await loadRoadster(); // GLB car if public/models/roadster.glb exists
const ys = xs.boxes.map((a) => ({
    min: a.min.clone().add(WORLD.lineup),
    max: a.max.clone().add(WORLD.lineup),
    name: a.name,
    drivable: !0,
  })),
  ea = WORLD.lineup.clone(),
  Z = buildRoadster();
ct.add(Z.root);
const ppl = buildPeople(ct); // people: crowds, walkers, beach life
// daylight: no headlight beams, tail glow or lift glow lights; bs and Ee stay detached so the
// per-frame intensity updates below still work
const bs = new PointLight(16718378, 1.5, 5, 2);
bs.position.set(0, 0.5, -3.2);
const Ee = new PointLight(12574975, 0, 18, 2);
Ee.position.set(0, -0.4, 0);
const sa = [
    ...Kt.colliders,
    zt.towerBox,
    ...Re.colliders,
    ...Oe.colliders,
    ...ae.colliders,
    ...ys.filter((a) => a.name !== "platform"),
    ...(Ct ? Ct.colliders : []),
  ],
  oa = [...ys, ...Re.deckBoxes, ...Kt.surfaces, ...(Ct ? Ct.surfaces : [])],
  F = new CarPhysics({
    ramps: [zt, Re, Oe, ae],
    colliders: sa,
    surfaces: oa,
  });
F.reset(WORLD.spawn.clone(), Math.PI);
const Ft = new SmokeSystem(ct),
  ia = new ThrusterPlumes(Z, Ft),
  ve = new SkidMarks(ct),
  oo = new Sparks(ct),
  bt = new CameraDirector(wt, zt, [zt, Re, Oe, ae]),
  Xt = new Hud(),
  qt = new AudioEngine();
let xt = null;
if (De) {
  (xt = new TouchControls(document.body)),
    (xt.onAction = (a) => {
      if (a === "cam") {
        const e = bt.cycle();
        Xt.toast("CAMERA", e.toUpperCase());
      }
      a === "reset" && no(),
        a === "pause" && He(),
        a === "missions" &&
          document.getElementById("missions").classList.toggle("collapsed");
    });
  for (const a of Kt.spots) a.castShadow = !1;
  Kt.moon.shadow.mapSize.set(1024, 1024),
    document.getElementById("missions").classList.add("collapsed");
}
const ye = new GameState({
    hud: Xt,
    audio: qt,
    scene: ct,
    lineup: {
      boxes: ys,
      center: ea,
    },
    ramp: zt,
    bullseye: vs,
  }),
  be = new Set();
const Gm = new Minimap({ phys: F, game: ye, camera: wt });
const Gu = new Tutorial({ phys: F, game: ye, minimap: Gm, dock: Gm.dock });
// 2-MIN RUN (src/game/run-mode.js): letters, timer strip, results
const Rn = new RunMode({
  scene: ct,
  phys: F,
  game: ye,
  hud: Xt,
  audio: qt,
  sparks: oo,
  camera: wt,
  world: { wall: zt, loop: Oe, halfpipe: Re, massdriver: ae, lineup: ys, bullseye: vs },
  place: Rs,
  onResults: () => {
    (mt = "results"), (Rn.openedAt = performance.now()), xt == null || xt.show(!1);
  },
  onAgain: () => startRun(),
  onRoam: () => startFreeRoam(),
});
let Is = !1;
const ee = {
  w: !1,
  s: !1,
};
let Cs = !1;
addEventListener("keydown", (a) => {
  if (a.repeat) {
    be.add(a.code);
    return;
  }
  if ((be.add(a.code), mt === "results")) {
    if (performance.now() - Rn.openedAt < 800) return;
    a.code === "Enter" || a.code === "Space"
      ? (a.preventDefault(), startRun())
      : a.code === "Escape" && startFreeRoam();
    return;
  }
  if (mt !== "play" && mt !== "pause") {
    (a.code === "Enter" || a.code === "Space") && Ue();
    return;
  }
  if ((a.code === "Escape" && He(), mt === "play")) {
    if (a.code === "KeyC") {
      const e = bt.cycle();
      Xt.toast("CAMERA", e.toUpperCase());
    }
    a.code === "KeyR" && no(),
      a.code === "KeyT" && la(),
      a.code === "KeyM" &&
        ((me = !me), qt.setMuted(me), Xt.toast("SOUND", me ? "OFF" : "ON")),
      a.code === "Tab" &&
        (a.preventDefault(),
        document.getElementById("missions").classList.toggle("collapsed")),
      [
        "Space",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
      ].includes(a.code) && a.preventDefault();
  }
});
addEventListener("keyup", (a) => be.delete(a.code));
addEventListener("blur", () => be.clear());
let me = !1,
  Je = !1;
function aa() {
  const a = (i) => be.has(i),
    e = {
      throttle: a("KeyW") || a("ArrowUp") ? 1 : 0,
      brake: a("KeyS") || a("ArrowDown") ? 1 : 0,
      steer:
        (a("KeyA") || a("ArrowLeft") ? 1 : 0) -
        (a("KeyD") || a("ArrowRight") ? 1 : 0),
      lift: a("Space"),
      boost: a("ShiftLeft") || a("ShiftRight"),
      drift: a("KeyQ") || a("KeyE"),
      yawL: a("KeyQ") ? 1 : 0,
      yawR: a("KeyE") ? 1 : 0,
    },
    s = navigator.getGamepads
      ? [...navigator.getGamepads()].find((i) => i && i.connected)
      : null;
  if (s) {
    const i = (c) => (Math.abs(s.axes[c] || 0) > 0.12 ? s.axes[c] : 0),
      o = (c) => {
        var r;
        return (r = s.buttons[c]) == null ? void 0 : r.pressed;
      },
      n = (c) => {
        var r;
        return ((r = s.buttons[c]) == null ? void 0 : r.value) || 0;
      };
    if (
      ((e.throttle = Math.max(e.throttle, n(7))),
      (e.brake = Math.max(e.brake, n(6))),
      i(0) && (e.steer = -i(0)),
      F.mode === "air" && i(1))
    ) {
      const c = i(1);
      c < 0
        ? (e.throttle = Math.max(e.throttle, -c))
        : (e.brake = Math.max(e.brake, c));
    }
    (e.lift = e.lift || o(0)),
      (e.boost = e.boost || o(5) || o(2)),
      (e.drift = e.drift || o(1) || o(4)),
      o(4) && (e.yawL = 1),
      o(1) && F.mode === "air" && (e.yawR = 1),
      o(3) && !s._y ? ((s._y = !0), bt.cycle()) : o(3) || (s._y = !1);
  }
  if (xt) {
    const i = xt.state;
    i.x && (e.steer = -i.x),
      i.y < 0 && (e.throttle = Math.max(e.throttle, Math.min(1, -i.y * 1.25))),
      i.y > 0 && (e.brake = Math.max(e.brake, Math.min(1, i.y * 1.25))),
      (e.lift = e.lift || i.lift),
      (e.boost = e.boost || i.boost),
      (e.drift = e.drift || i.drift),
      i.drift && F.mode === "air" && (e.yawL = 1);
  }
  (e.liftPressed = e.lift && !Is), (Is = e.lift);
  const t = F.mode === "air";
  return (
    t && !Cs && ((ee.w = e.throttle > 0), (ee.s = e.brake > 0)),
    (Cs = t),
    t &&
      (e.throttle || (ee.w = !1),
      e.brake || (ee.s = !1),
      ee.w && (e.throttle = 0),
      ee.s && (e.brake = 0)),
    e
  );
}
let mt = "title";
const io = document.getElementById("title"),
  na = document.getElementById("hud"),
  ds = document.getElementById("menu");
document.getElementById("start").addEventListener("click", () => startFreeRoam());
const Sr = document.getElementById("start-run");
(Sr.hidden = !1), Sr.addEventListener("click", () => startRun());
for (const a of ["menu-run", "menu-roam"]) document.getElementById(a).hidden = !1;
// 2-MIN RUN entry points: title #start-run / #start, pause menu run / roam
function startRun() {
  mt === "title"
    ? Ue(!0)
    : mt === "pause"
      ? He()
      : mt === "results" && ((mt = "play"), xt == null || xt.show(!0));
  Rn.start();
}
function startFreeRoam() {
  Rn.stop(), Rn.hideResults();
  mt === "title"
    ? Ue()
    : mt === "pause"
      ? He()
      : mt === "results" && ((mt = "play"), xt == null || xt.show(!0));
}
function Ue(quiet) {
  var a, e;
  if (mt !== "play") {
    if (
      (qt.init(),
      qt.event("uiConfirm"),
      (mt = "play"),
      document.body.classList.add("playing"),
      bt.behind.copy(F.fwd).setY(0).normalize(),
      bt.pos.copy(F.pos).addScaledVector(bt.behind, -9).setY(3.2),
      io.classList.add("out"),
      na.classList.remove("hidden"),
      xt)
    ) {
      xt.show(!0);
      try {
        (e = (a = document.documentElement).requestFullscreen) == null ||
          e
            .call(a, {
              navigationUI: "hide",
            })
            .catch(() => {});
      } catch {}
    }
    ft.get("cine") ||
      quiet ||
      Xt.toast(
        "THE REVEAL WALL IS STRAIGHT AHEAD",
        De
          ? "Push the stick up: the suction keeps you on it"
          : "Hold W: the suction keeps you on it",
        !0,
      );
  }
}
function He() {
  mt === "play"
    ? ((mt = "pause"),
      ds.classList.remove("hidden"),
      qt.setMuted(!0),
      xt == null || xt.show(!1))
    : mt === "pause" &&
      ((mt = "play"),
      ds.classList.add("hidden"),
      qt.setMuted(me),
      xt == null || xt.show(!0));
}
ds.addEventListener("click", (a) => {
  const e = a.target.dataset.act,
    s = a.target.dataset.tp;
  e === "resume" && He(),
    e === "reset-progress" && ye.resetProgress(),
    e === "run" && startRun(),
    e === "roam" && startFreeRoam(),
    s && (Ms(s), He());
});
document.getElementById("opt-slowmo").addEventListener("change", (a) => {
  ye.autoSlowmo = a.target.checked;
});
document.getElementById("opt-cuts").addEventListener("change", (a) => {
  bt.autoCuts = a.target.checked;
});
document
  .getElementById("opt-vol")
  .addEventListener("input", (a) => qt.setMasterVolume(+a.target.value));
document
  .getElementById("opt-quality")
  .addEventListener("change", (a) => ra(a.target.value));
function ra(a) {
  const e =
    a === "ultra"
      ? Math.min(devicePixelRatio, 2)
      : a === "medium"
        ? 1
        : Math.min(devicePixelRatio, 1.5);
  Lt.setPixelRatio(e), ro(), Tt && (Tt.enabled = a !== "medium");
}
const ao = {
    spawn: [WORLD.spawn, Math.PI],
    ramp: [new Vector3(0, 0, -40), Math.PI],
    lineup: [new Vector3(WORLD.lineup.x - 110, 0, WORLD.lineup.z), Math.PI / 2],
    runway: [new Vector3(-1100, 0, WORLD.runwayZ), Math.PI / 2],
    donut: [WORLD.donut.clone().add(new Vector3(0, 0, 18)), Math.PI / 2],
    halfpipe: [WORLD.halfpipe.clone().add(new Vector3(60, 0, 0)), -Math.PI / 2],
    loop: [WORLD.loop.clone().add(new Vector3(0, 0, -70)), 0],
    city: [new Vector3(CITY.tp.pos[0], CITY.tp.pos[1], CITY.tp.pos[2]), CITY.tp.heading],
    massdriver: [
      WORLD.massdriver.clone().add(new Vector3(-90, 0, 0)),
      Math.PI / 2,
    ],
    // the seafront promenade, facing the sea and the pier
    beach: [new Vector3(-45, 0, 646), 0],
  },
  Bs = Object.keys(ao);
let _e = 0;
// puts the car at a start, the chase camera behind it (teleports, run start)
function Rs(e, s) {
  F.reset(e.clone(), s),
    (bt.cut = null),
    bt.pos.copy(e).add(new Vector3(-Math.sin(s) * 8, 3, -Math.cos(s) * 8)),
    bt.behind.set(Math.sin(s), 0, Math.cos(s));
  for (let t = 0; t < 4; t++) ve.break(t);
}
function Ms(a) {
  const [e, s] = ao[a];
  Rs(e, s), ft.get("cine") || Xt.toast("TELEPORT", a.toUpperCase());
}
function place(e, s) {
  return Rs(e, s);
}
// the sea, the beach and the pier (src/world/sea): splash and respawn when the car ends up in the water
let Sea = { update() {}, holding: !1 };
try {
  Sea = buildSea(ct, {
    renderer: Lt,
    env: Kt,
    phys: F,
    smoke: Ft,
    audio: qt,
    rig: bt,
    game: ye,
    place,
    toast: (a, b) => ft.get("cine") || Xt.toast(a, b),
  });
} catch (a) {
  console.error("sea disabled", a);
}
function la() {
  (_e = (_e + 1) % Bs.length), Ms(Bs[_e]);
}
function no() {
  const a = F.pos.clone();
  a.y = 0;
  const e = F.fwd,
    s = Math.atan2(e.x, e.z);
  F.reset(a, s);
  for (let t = 0; t < 4; t++) ve.break(t);
}
const ca = [...Kt.spots, ...so].map((a) => ({
    p: a.position.clone(),
    d: a.target.position.clone().sub(a.position).normalize(),
    cos: Math.cos(a.angle),
    k: a.intensity / 9e3,
  })),
  $e = new Vector3();
function ha(a) {
  let e = 0.16;
  for (const s of ca) {
    $e.subVectors(a, s.p);
    const t = $e.length(),
      i = $e.dot(s.d) / t;
    i > s.cos &&
      (e +=
        s.k *
        2.6 *
        Math.min(1, (i - s.cos) / 0.08) *
        (1 / (1 + (t * t) / 4e3)));
  }
  return Math.min(1.6, e);
}
const ts = new Vector3(),
  fa = [2, 3];
let es = "ground";
function da(a, e, s) {
  Z.root.position.copy(F.pos), Z.root.quaternion.copy(F.quat);
  const t = F.mode === "air" || F.mode === "crashed";
  (Z.body.position.y = F.susp * 0.9),
    Z.body.rotation.set(F.bodyPitch, 0, F.bodyRoll);
  for (const l of Z.wheels) {
    (l.spin.rotation.x = F.wheelSpin * (l.spinFactor ?? 1)), // GLB wheels: game radius / model radius
      l.front && (l.pivot.rotation.y = F.steer * 0.45);
    const d = t ? -0.06 : F.susp * 0.4;
    l.pivot.position.y = l.baseY + d;
  }
  const i = e.brake > 0 && F.mode === "ground" && F.vel.dot(F.fwd) > 1;
  (Z.mats.tailDim.emissiveIntensity = i ? 9 : 1.2),
    (bs.intensity = i ? 5 : 1.5);
  const o = F.speed > 30 || t || F.mode === "ramp" || e.boost,
    n = Z.wing.userData;
  (Z.wing.position.y +=
    ((o ? n.upY : n.stowY) - Z.wing.position.y) * Math.min(1, a * 5)),
    (Z.wing.visible = Z.wing.position.y > n.stowY + 0.02);
  const c = F.thrust,
    r = F.mode === "air" ? Math.abs(e.steer) * F.rcsAuthority : 0;
  ia.update(a, s, {
    lift: c.lift,
    rear: c.boost,
    side:
      Math.max(r, c.rcs * 0.4) *
      (F.mode === "air" || F.mode === "crashed" ? 1 : 0),
    top:
      (F.mode === "air"
        ? Math.abs(e.throttle - e.brake) * 0.8 * F.rcsAuthority
        : 0) +
      (F.mode === "crashed" ? c.rcs : 0),
    ground: F.surfaceAt(F.pos.x, F.pos.z, F.pos.y + 0.5).h,
  });
  for (const l of Z.nozzleGlows) l.material.emissiveIntensity = c.boost ? 6 : 0;
  if (
    ((Ee.intensity +=
      ((c.lift ? 260 : 0) - Ee.intensity) * Math.min(1, a * 12)),
    F.speed,
    F.mode === "ground")
  ) {
    const l = F.slip > 3 || F.burnout > 0.2,
      d = F.burnout > 0.2 ? 1 : Math.min(1, (F.slip - 3) / 6);
    for (const f of fa) {
      Z.wheels[f].spin.getWorldPosition(ts);
      const w = F.left;
      l
        ? (Math.random() < a * 60 * d &&
            Ft.spawn({
              pos: ts.clone().setY(0.35),
              vel: F.vel
                .clone()
                .multiplyScalar(0.25)
                .add(
                  new Vector3(
                    (Math.random() - 0.5) * 2,
                    1.2,
                    (Math.random() - 0.5) * 2,
                  ),
                ),
              kind: "tyre",
              size: 1.2,
              grow: 3,
              life: 4,
              alpha: 0.18 * d + 0.05,
              rise: 0.35,
              drag: 0.9,
            }),
          ve.mark(f, ts.clone().setY(F.pos.y + 0.012), w, Math.min(1, d + 0.3)))
        : ve.break(f);
    }
  } else for (let l = 0; l < 4; l++) ve.break(l);
  if (es === "air" && F.mode === "ground") {
    const l = Math.min(40, 10 + Math.abs(F.suspV) * 6);
    for (let d = 0; d < l; d++) {
      const f = Math.random() * Math.PI * 2;
      Ft.spawn({
        pos: F.pos
          .clone()
          .add(new Vector3(Math.cos(f) * 1.5, 0.3, Math.sin(f) * 2)),
        vel: new Vector3(Math.cos(f) * 7, 0.8, Math.sin(f) * 7).add(
          F.vel.clone().multiplyScalar(0.3),
        ),
        kind: "dust",
        size: 1,
        grow: 3,
        life: 3,
        alpha: 0.22,
        drag: 1.8,
        rise: 0.4,
      });
    }
  }
  F.mode === "crashed" &&
    es !== "crashed" &&
    oo.burst(
      F.pos.clone().setY(F.pos.y + 0.3),
      F.vel.clone().normalize(),
      70,
      10,
    ),
    (es = F.mode);
}
F.reset(new Vector3(0, 0, -112), Math.PI);
let ss = 0;
function ua(a) {
  ss += a;
  const e = ft.get("ta")
      ? +ft.get("ta")
      : ss * (ft.get("tspeed") ? +ft.get("tspeed") : 0.07) + 0.6,
    s = ft.get("td") ? +ft.get("td") : 8.6,
    t = F.pos.clone().add(new Vector3(0, 0.7, 0));
  wt.position.set(
    t.x + Math.cos(e) * s,
    (ft.get("th") ? +ft.get("th") : 1.5) + Math.sin(ss * 0.2) * 0.3,
    t.z + Math.sin(e) * s,
  ),
    (wt.fov = fitFov(30, wt.aspect, 0.75)),
    wt.updateProjectionMatrix(),
    wt.lookAt(t.x, t.y + 0.55, t.z),
    Math.random() < a * 6 &&
      Ft.spawn({
        pos: t
          .clone()
          .add(
            new Vector3(
              (Math.random() - 0.5) * 30,
              0.2,
              (Math.random() - 0.5) * 30 - 10,
            ),
          ),
        vel: new Vector3(Math.random() - 0.5, 0.2, Math.random() - 0.5),
        size: 4,
        grow: 1.5,
        life: 9,
        alpha: 0.03,
        drag: 0.3,
        rise: 0.05,
      });
}
function ro() {
  const a = innerWidth,
    e = innerHeight;
  Lt.setSize(a, e),
    Et.setSize(a, e),
    (wt.aspect = a / e),
    wt.updateProjectionMatrix();
}
addEventListener("resize", ro);
const pa = new Clock();
let Gt = 0;
const ma = {
  throttle: 0,
  brake: 0,
  steer: 0,
  lift: !1,
  liftPressed: !1,
  boost: !1,
  drift: !1,
  yawL: 0,
  yawR: 0,
};
function lo() {
  requestAnimationFrame(lo);
  const a = Math.min(0.05, pa.getDelta());
  if (mt === "pause") {
    Et.render(a);
    return;
  }
  const e = mt === "play" ? ye.timeScale : 1,
    s = a * e;
  Gt += s;
  const t = mt === "play" ? aa() : ma;
  (F.events.length = 0), Sea.holding || F.update(s, t);
  {
    const i = Math.hypot(F.pos.x, F.pos.z);
    if (i > 1600) {
      const o = F.pos.x / i,
        n = F.pos.z / i;
      (F.pos.x = o * 1600), (F.pos.z = n * 1600);
      const c = F.vel.x * o + F.vel.z * n;
      c > 0 && ((F.vel.x -= o * c * 1.5), (F.vel.z -= n * c * 1.5)),
        mt === "play" &&
          !Je &&
          (Xt.toast("EDGE OF THE TEST SITE", "Turn around"),
          (Je = !0),
          setTimeout(() => (Je = !1), 4e3));
    }
  }
  Sea.update(s, Gt, wt);
  mt === "play" && ye.update(a, s, F, t, bt),
    mt === "play" && Rn.update(a),
    da(s, t, Gt),
    Ft.update(s, ha),
    oo.update(s),
    Kt.update(s, Gt, F.pos),
    Ct && Ct.update(wt, Gt),
    (beamMaterial.uniforms.uTime.value = Gt),
    ae.update(s, Gt, F.mode === "ramp" && F.R === ae ? F.rs : null),
    vs.update(Gt),
    (zt.beacon.material.emissiveIntensity =
      0.5 + 9 * Math.pow(Math.max(0, Math.sin(Gt * 2.4 + 1)), 3)),
    mt === "play"
      ? bt.update(a, F, {
          boost: t.boost && F.thrust.boost > 0,
        })
      : ua(a),
    ppl.update(s, Gt, F, wt),
    qt.update(a, {
      speed: F.speed,
      throttle: t.throttle - t.brake * 0.5,
      boost: F.thrust.boost,
      lift: F.thrust.lift,
      rcs: F.thrust.rcs,
      suction: F.mode === "ramp" ? 1 : 0,
      drifting:
        F.mode === "ground"
          ? Math.min(1, Math.max(F.slip - 3, F.burnout * 6) / 6)
          : 0,
      onGround: F.mode === "ground" || F.mode === "ramp",
      timeScale: e,
    }),
    Gu.update(a, t, mt === "play"),
    Gm.update(a, mt === "play"),
    Et.render(a);
}
document.getElementById("fade").classList.add("off");
ft.get("notitle") && (io.style.display = "none");
ft.get("og") && document.body.classList.add("og");
ft.get("cine") && document.body.classList.add("cine");
lo();
window.__rd = {
  audio: qt,
  touch: xt,
  phys: F,
  game: ye,
  rig: bt,
  car: Z,
  ramp: zt,
  scene: ct,
  camera: wt,
  startGame: Ue,
  startRun,
  startFreeRoam,
  run: Rn,
  teleport: Ms,
  renderer: Lt,
  composer: Et,
  aoPass: Tt,
  smoke: Ft,
  world: Kt,
  city: Ct,
  bloom: to,
  guide: { minimap: Gm, tutorial: Gu },
  people: ppl,
  sea: Sea,
};
ft.get("autostart") && setTimeout(Ue, 300);
ft.get("run") && setTimeout(startRun, 300);
