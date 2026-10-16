import { Box3, CircleGeometry, Color, Group, Mesh, Raycaster, Vector3 } from "three";
import { createCarMaterials } from "./materials.js";
import { CAR_DIMS } from "./profile.js";

// The GLB car: loads a glTF model and adapts it to the object buildRoadster()
// has always returned (root, body, wheels, thrusters, mats, wing, nozzleGlows,
// parts), so the rest of the game does not know which car it got.
//
// What the file must contain (glTF 2.0 binary, metres):
//  - +Y up, +Z front, +X the car's left, origin on the ground.
//  - Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR: one node per wheel (children are
//    fine: tyre, rim, brake rotor) with its origin at the wheel centre. The
//    game spins them about X and steers the front pair about Y. A wheel may sit
//    in a Steer_XX node: the Steer node's other children (calipers) and any
//    *Caliper* child of the wheel steer and ride the suspension but do not spin.
//    Wheels of another radius than the game's 0.325 m get wheels[i].spinFactor
//    so they roll at true speed.
//  - Jet_Lift_* and Jet_Rear_* empties at the jet exits (any number). Lift jets
//    blow down, rear jets blow back (-Z). Optional Jet_Side_* (outwards) and
//    Jet_Top_* (up); without them they are placed on the body surface.
//  - Materials, matched by name (Blender ".001" suffixes are fine):
//    brake light "Light_Red" / "Rear red light ribbon" -> mats.tailDim (a clone
//    of the file's, dim 1.2 / bright 9 when braking); headlights "Light_Cyan" /
//    "Front white LEDs" -> mats.head; "Nozzle_Metal" / "Sand metallic calipers
//    and nozzle lips" -> mats.nozzle; also paint, glass, tyre and rim keys.
//    Everything else keeps the file's own materials. Glass using transmission
//    becomes cheap see-through glass (no extra render pass on phones).
//    Glow discs (mats.nozzleGlow, lit on boost) go into the rear jets unless
//    Light_Cyan parts already sit there.
//  - The model has its own fixed wing, so car.wing is an empty group.
//  - Meshopt compression, quantization and WebP textures load. Draco and KTX2
//    do not (the game then keeps the procedural car).
// Small export slips (car facing -Z, centimetres, origin off the ground,
// wheel origins off-centre) are corrected with a console warning.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const nodeName = (o) => norm(o.userData.name || o.name);
const WHEEL_RE = /^wheel(front|f|rear|back|r|b)(left|l|right|r)/;
const JET_RE = /^jet(lift|rear|side|top)/;
const MATERIAL_KEYS = [
  [/^(paintwhite|silverbody)/, "paint"],
  [/^trimdark/, "trim"],
  [/^(glassbronze|clearautomotiveglazing)/, "glass"],
  [/^(lightcyan|frontwhiteleds)/, "head"],
  [/^(lightred|rearredlightribbon)/, "tailDim"],
  [/^(tire|tyre)/, "tire"],
  [/^(rimblack|polishedblackwheel)/, "rimDark"],
  [/^(nozzlemetal|sandmetalliccalipersandnozzlelips)/, "nozzle"],
];
function materialKey(m) {
  const n = norm(m && m.name);
  for (const [re, key] of MATERIAL_KEYS) if (re.test(n)) return key;
  return null;
}
// Lights the game drives through mats.*.emissiveIntensity; a file light with
// no emissive colour gets this one.
const LIGHT_COLOR = { head: 0xeaf2ff, tailDim: 0xff1a1a };

const v3 = (x, y, z) => new Vector3(x, y, z);
// Where the procedural car has its jets; used for any kind the file lacks.
const DEFAULT_JETS = {
  lift: [v3(0.6, 0.18, 1.6), v3(-0.6, 0.18, 1.6), v3(0.6, 0.18, -1.62), v3(-0.6, 0.18, -1.62)],
  rear: [v3(-0.6, 0.44, -2.29), v3(-0.22, 0.44, -2.29), v3(0.22, 0.44, -2.29), v3(0.6, 0.44, -2.29)],
};
const JET_DIR = {
  lift: () => v3(0, -1, 0),
  rear: () => v3(0, 0, -1),
  side: (p) => v3(p.x < 0 ? -1 : 1, 0, 0),
  top: () => v3(0, 1, 0),
};

// Glass: transmission costs a second render of the scene every frame, so it
// becomes plain transparency with no diffuse colour (just a hint of tint),
// growing opaque - and so reflective - towards grazing angles like real glass.
function glassFresnel(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    "diffuseColor.a = mix(diffuseColor.a, 1.0, pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0));\n#include <opaque_fragment>",
  );
}
function cheapen(m) {
  if (m.transmission > 0) {
    m.color.multiplyScalar(0.12);
    m.opacity = Math.min(m.opacity, 1 - 0.8 * m.transmission);
    m.transmission = 0;
    m.transparent = true;
    m.depthWrite = false;
    m.onBeforeCompile = glassFresnel;
  }
  return m;
}

// Finds the named parts, fixes the model's placement and measures what the
// car builder needs. Runs once per load; buildGltfRoadster() clones the result.
function prepareModel(scene) {
  const warnings = [];
  const model = new Group();
  model.name = "RoadsterModel";
  model.add(scene);

  const wheelNodes = {};
  const jetNodes = { lift: [], rear: [], side: [], top: [] };
  (function walk(o, claimed) {
    const name = nodeName(o);
    let m;
    if (!claimed && (m = WHEEL_RE.exec(name))) {
      const key = (m[1][0] === "f" ? "F" : "R") + (m[2][0] === "l" ? "L" : "R");
      if (!wheelNodes[key]) (wheelNodes[key] = o), (o.userData.carRole = "wheel" + key), (claimed = true);
    } else if ((m = JET_RE.exec(name))) jetNodes[m[1]].push(o);
    for (const c of o.children) walk(c, claimed);
  })(scene, !1);
  const missing = ["FL", "FR", "RL", "RR"].filter((k) => !wheelNodes[k]);
  if (missing.length) throw new Error(`no wheel node for ${missing.map((k) => "Wheel_" + k).join(", ")}`);

  const box = new Box3();
  const centres = () => {
    model.updateMatrixWorld(!0);
    const c = {};
    for (const k in wheelNodes) {
      const p = wheelNodes[k].getWorldPosition(new Vector3());
      box.setFromObject(wheelNodes[k]);
      c[k] = !box.isEmpty() && box.getCenter(new Vector3()).distanceTo(p) > 0.05 ? box.getCenter(new Vector3()) : p;
    }
    return c;
  };
  let c = centres();
  const off = Object.keys(wheelNodes).filter((k) => !c[k].equals(wheelNodes[k].getWorldPosition(new Vector3())));
  if (off.length) warnings.push(`wheel origin not at the wheel centre for ${off.join(", ")}; spinning about the geometry centre`);

  // Facing: the front wheels must be ahead (+Z) of the rear ones.
  const fwd = c.FL.clone().add(c.FR).sub(c.RL).sub(c.RR);
  const yaw = Math.atan2(fwd.x, fwd.z);
  if (Math.abs(yaw) > 0.1) {
    model.rotation.y = -Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    warnings.push(`model faced ${Math.round((yaw * 180) / Math.PI)} deg off +Z; turned it`);
    c = centres();
  }
  // Size: wheelbase against the game's 2.84 m (catches centimetre exports).
  const wheelbase = (c.FL.z + c.FR.z - c.RL.z - c.RR.z) / 2;
  if (!(wheelbase > 1e-3)) throw new Error("wheel nodes are not laid out front and rear");
  const ratio = wheelbase / (CAR_DIMS.frontAxle - CAR_DIMS.rearAxle);
  if (!(ratio > 0.5 && ratio < 2)) {
    model.scale.setScalar(1 / ratio);
    warnings.push(`wheelbase was ${wheelbase.toFixed(3)} units; scaled the model by ${(1 / ratio).toPrecision(3)}`);
    c = centres();
  }
  // Ground: tyre bottoms on y = 0, axles where the game expects them.
  let ground = Infinity;
  for (const k in wheelNodes) ground = Math.min(ground, box.setFromObject(wheelNodes[k]).min.y);
  const shift = new Vector3(
    -(c.FL.x + c.FR.x + c.RL.x + c.RR.x) / 4,
    -ground,
    (CAR_DIMS.frontAxle + CAR_DIMS.rearAxle) / 2 - (c.FL.z + c.FR.z + c.RL.z + c.RR.z) / 4,
  );
  for (const a of ["x", "y", "z"]) if (Math.abs(shift[a]) < (a === "y" ? 0.05 : 0.1)) shift[a] = 0;
  if (shift.lengthSq() > 0) {
    model.position.add(shift);
    warnings.push(`moved the model by (${shift.toArray().map((x) => x.toFixed(2))}) to put the wheels on the ground at the axles`);
    c = centres();
  }
  // Rolling radius per wheel (centre height above its lowest point).
  const spinFactor = {};
  for (const k in wheelNodes) {
    const r = Math.min(0.6, Math.max(0.2, c[k].y - box.setFromObject(wheelNodes[k], !0).min.y));
    spinFactor[k] = Math.abs(r - CAR_DIMS.wheelRadius) < 0.005 ? 1 : CAR_DIMS.wheelRadius / r;
  }

  // Body surface probes (wheels excluded).
  const skip = new Set();
  for (const o of Object.values(wheelNodes)) o.traverse((x) => skip.add(x));
  const solids = [];
  model.traverse((o) => o.isMesh && !skip.has(o) && solids.push(o));
  const ray = new Raycaster();
  const probe = (origin, dir) => {
    ray.set(origin, dir);
    const hit = ray.intersectObjects(solids, !1)[0];
    return hit ? hit.point : null;
  };
  const surfaceY = (x, z, def) => probe(v3(x, 20, z), v3(0, -1, 0))?.y ?? def;
  const surfaceX = (s, y, z, def) => probe(v3(s * 20, y, z), v3(-s, 0, 0))?.x ?? def;

  const jets = {};
  for (const kind in jetNodes) {
    const nodes = jetNodes[kind].sort((a, b) => (nodeName(a) < nodeName(b) ? -1 : 1));
    jets[kind] = nodes.map((o) => o.getWorldPosition(new Vector3()));
  }
  for (const kind of ["lift", "rear"])
    if (!jets[kind].length) {
      jets[kind] = DEFAULT_JETS[kind].map((p) => p.clone());
      warnings.push(`no Jet_${kind[0].toUpperCase() + kind.slice(1)}_* empties; using the procedural car's positions`);
    }
  if (!jets.side.length) jets.side = [1, -1].map((s) => v3(surfaceX(s, 0.62, 0, s * 0.98) + s * 0.02, 0.62, 0));
  if (!jets.top.length)
    jets.top = [
      [0.55, 1.1],
      [-0.55, 1.1],
      [0.55, -1.3],
      [-0.55, -1.3],
    ].map(([x, z]) => v3(x, surfaceY(x, z, 0.93) + 0.02, z));

  // Nozzle glow size: inner lip radius of the nozzle-material parts at each rear jet.
  const nozzles = solids.filter((m) => materialKey(m.material) === "nozzle");
  const v = new Vector3();
  const nozzleR = jets.rear.map((p) => {
    let r = Infinity;
    for (const m of nozzles) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(p);
        const rad = Math.hypot(v.x, v.y);
        if (v.z > -0.03 && v.z < 0.06 && rad > 0.012 && rad < 0.2) r = Math.min(r, rad);
      }
    }
    return r < Infinity ? Math.min(0.15, Math.max(0.025, r * 0.92)) : 0.06;
  });
  // Light_Cyan parts right at a rear jet are nozzle glows, not headlights.
  let glowParts = 0;
  for (const m of solids)
    if (materialKey(m.material) === "head" && /^lightcyan/.test(norm(m.material.name))) {
      box.setFromObject(m);
      if (box.max.z < -1.5 && jets.rear.some((p) => box.distanceToPoint(p) < 0.15)) (m.userData.carGlow = !0), glowParts++;
    }

  let triangles = 0;
  model.traverse((o) => {
    const g = o.isMesh && o.geometry;
    if (g) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { model, centres: c, spinFactor, jets, nozzleR, glowParts, triangles: Math.round(triangles), warnings };
}

async function loadGltfRoadster(url) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  return prepareModel(gltf.scene || gltf.scenes[0]);
}

// One car from a prepared model. Materials passed in (like the procedural
// builder takes) replace the file's by key; by default the file's own
// materials are used (cloned per car) and exposed under the same mats keys.
function buildGltfRoadster(prepared, mats) {
  const custom = mats != null;
  const n = custom ? mats : createCarMaterials();
  const e = new Group();
  e.name = "Roadster";
  const t = new Group();
  e.add(t);
  const model = prepared.model.clone(!0);
  t.add(model);

  const own = new Map();
  const glows = [];
  const tails = [];
  const roles = {};
  model.traverse((o) => {
    if (o.userData.carRole) roles[o.userData.carRole] = o;
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = !0;
    const src = o.material,
      key = materialKey(src);
    let m;
    if (key === "head" && o.userData.carGlow) (m = n.nozzleGlow), glows.push(o);
    else if (custom && key && n[key]) m = n[key];
    else if (!(m = own.get(src))) {
      own.set(src, (m = cheapen(src.clone())));
      if (key in LIGHT_COLOR && m.emissive && m.emissive.getHex() === 0) m.emissive = new Color(LIGHT_COLOR[key]);
      if (key && !custom) n[key] = m;
    }
    if (key === "tailDim") tails.push(o);
    o.material = m;
  });

  // Wheels: pivot (steer, suspension) > spin (roll) > the file's wheel node.
  // Order and fields match the procedural car: front pair first, -X side first.
  e.updateMatrixWorld(!0);
  const wheels = ["FL", "FR", "RL", "RR"]
    .map((k) => ({ k, c: prepared.centres[k], front: k[0] === "F" }))
    .sort((a, b) => b.front - a.front || a.c.x - b.c.x)
    .map(({ k, c, front }) => {
      const pivot = new Group(),
        spin = new Group(),
        node = roles["wheel" + k],
        steer = node.parent && /^steer/.test(nodeName(node.parent)) ? node.parent : null;
      (pivot.name = "WheelPivot_" + k), (spin.name = "WheelSpin_" + k);
      pivot.position.copy(c), pivot.add(spin), e.add(pivot);
      spin.attach(node);
      const fixed = steer ? steer.children.slice() : [];
      (function find(o) {
        for (const x of o.children) /caliper/.test(nodeName(x)) ? fixed.push(x) : find(x);
      })(node);
      for (const x of fixed) pivot.attach(x);
      return { pivot, spin, front, side: c.x < 0 ? -1 : 1, baseY: c.y, spinFactor: prepared.spinFactor[k] };
    });

  const thrusters = {};
  for (const kind in prepared.jets) thrusters[kind] = prepared.jets[kind].map((p) => ({ p: p.clone(), d: JET_DIR[kind](p) }));
  if (!glows.length)
    thrusters.rear.forEach(({ p, d }, i) => {
      const g = new Mesh(new CircleGeometry(prepared.nozzleR[i], 24), n.nozzleGlow);
      g.name = "NozzleGlow";
      g.position.copy(p).addScaledVector(d, -0.015);
      g.quaternion.setFromUnitVectors(v3(0, 0, 1), d);
      t.add(g), glows.push(g);
    });

  // The model carries its own fixed wing: the game's deployable wing is an
  // empty group that never shows.
  const wing = new Group();
  wing.name = "Wing";
  wing.userData = { stowY: 0, upY: 0 };
  t.add(wing);

  return {
    root: e,
    body: t,
    wheels,
    thrusters,
    mats: n,
    wing,
    nozzleGlows: glows,
    parts: { tailBar: tails[0] || null, brakeBar: tails[0] || null },
  };
}

export { buildGltfRoadster, loadGltfRoadster };
