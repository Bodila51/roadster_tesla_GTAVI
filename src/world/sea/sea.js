import { Group, Vector3 } from "three";
import { skyUniforms } from "../sky.js";
import { buildBeach } from "./beach.js";
import { COAST, deckHeight, seabedY } from "./coast.js";
import { propMaterial } from "./kit.js";
import { buildPier } from "./pier.js";
import { buildProps } from "./props.js";
import { Spray, Wake } from "./spray.js";
import { makeAtlas, makeSandTextures, makeWaveTexture } from "./textures.js";
import { buildWater } from "./water.js";

const HOLD = 1.5; // seconds under water before the car is put back on the seafront road

// The sea, the beach and the pier. Called once from main.js; update() runs every frame after the
// physics step. Also: the car physics floor follows the sand and the seabed past the promenade (the
// pier deck is drivable), the props get colliders, and the horizon tree line stops at the coast.
function buildSea(scene, { renderer, env, phys, smoke, audio, rig, game, place, toast }) {
  const time = { value: 0 },
    su = (env && env.sky && env.sky.material && env.sky.material.uniforms) || skyUniforms(),
    sky = { uSunDir: su.uSunDir, uSunColor: su.uSunColor, uZenith: su.uZenith, uHorizon: su.uHorizon, uHaze: su.uHaze, uGround: su.uGround },
    waves = makeWaveTexture(renderer),
    water = buildWater({ waves, sky, time }),
    beach = buildBeach({ sand: makeSandTextures(renderer), waves, sky, time }),
    mat = propMaterial(makeAtlas(renderer)),
    pier = buildPier(mat),
    props = buildProps(mat),
    wake = new Wake(waves, time, water.uniforms.uFoam),
    spray = new Spray(smoke),
    group = new Group();
  (group.name = "sea"), group.add(water.mesh, beach, pier.group, props.group, wake.mesh), scene.add(group);
  hookPhysics(phys);
  phys.colliders.push(...pier.colliders, ...props.colliders);
  cutTreeLine(env);
  const U = water.uniforms,
    L = su.uSunDir.value,
    st = { hold: 0, v: new Vector3(), p: new Vector3(), dir: 1, splashT: -1, splashes: 0, respawns: 0 };

  function splash(t) {
    const P = phys.pos,
      V = phys.vel,
      sp = V.length(),
      k = Math.min(1.4, 0.5 + sp / 40);
    (st.hold = HOLD), st.v.copy(V), st.p.copy(P), (st.dir = V.x < -0.5 ? -1 : 1), st.splashes++;
    spray.splash(P, V, k);
    U.uSplash.value.set(P.x, P.z, 0, Math.min(1, 0.45 + sp / 50)), (st.splashT = t);
    audio && (audio.event("hardLand", 1), audio.event("whoosh", 1.3));
    rig && rig.shake && rig.shake(Math.min(0.6, 0.2 + sp / 120));
    game && (game.jump = null);
    wake.stop();
  }
  function respawn() {
    (st.hold = 0), st.respawns++;
    const x = Math.min(COAST.townX1 - 40, Math.max(COAST.townX0 + 40, st.p.x)),
      z = COAST.roadZ + st.dir * COAST.roadHalf * 0.4;
    place(new Vector3(x, 0, z), st.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    toast && toast("SPLASH!", "Back on Ocean Drive");
  }
  function update(dt, t, camera) {
    (time.value = t), water.update(camera), pier.update(t), props.update(t);
    if (st.splashT >= 0) {
      const a = t - st.splashT;
      a > 6 ? ((U.uSplash.value.w = 0), (st.splashT = -1)) : (U.uSplash.value.z = a);
    }
    const P = phys.pos,
      V = phys.vel;
    if (st.hold > 0) {
      // under water: the car stops fast and sinks, the physics step is paused (holding)
      (st.hold -= dt), st.v.multiplyScalar(Math.exp(-dt * 5)), P.addScaledVector(st.v, dt);
      (P.y += (COAST.waterY - 2.4 - P.y) * Math.min(1, dt * 1.8)), V.copy(st.v);
      spray.boil(st.p, dt), (U.uShadow.value.z = 0);
      st.hold <= 0 && respawn();
      return;
    }
    const deck = deckHeight(P.x, P.z),
      over = P.z > COAST.shoreZ && !(deck !== null && P.y > deck - 1.2),
      h = P.y - COAST.waterY,
      sp = Math.hypot(V.x, V.z);
    // the car's shadow on the water, cast along the sun
    if (over && h < 30) {
      const up = h + 0.6,
        f = phys.fwd,
        fl = Math.hypot(f.x, f.z) || 1;
      U.uShadow.value.set(P.x - (L.x / L.y) * up, P.z - (L.z / L.y) * up, 0.6 * (1 - Math.min(1, Math.max(0, (h - 2) / 26))), 0);
      U.uShadowAxes.value.set(f.x / fl, f.z / fl, 2.5, 1.2);
    } else U.uShadow.value.z = 0;
    if (!over) return wake.stop();
    if (COAST.waterY - P.y > (phys.mode === "ground" ? 0.36 : 0.1)) return splash(t); // the ground step bottoms out at y -1
    phys.mode === "ground" && h < 0.08 && sp > 3 && spray.wade(P, V, phys.fwd, phys.left, Math.min(1, sp / 20), dt);
    if (phys.mode !== "ground" && h < 4 && sp > 20) {
      const k = (1 - h / 4) * Math.min(1, (sp - 20) / 25);
      spray.skim(P, V, k, dt), wake.add(P.x, P.z, V.x, V.z, 1.0 + 1.4 * k, 0.4 + 0.6 * k, t);
    } else wake.stop();
  }
  return {
    group,
    update,
    state: st,
    get holding() {
      return st.hold > 0;
    },
  };
}

// The physics floor is y = 0 everywhere; past the promenade it follows the sand down into the sea
// (so the car can drive into the water) and the pier deck is a drivable surface. car-physics.js is
// untouched: only this instance's surfaceAt is wrapped.
function hookPhysics(phys) {
  const base = phys.surfaceAt;
  phys.surfaceAt = function (x, z, y) {
    const r = base.call(this, x, z, y);
    if (z < COAST.groundEndZ) return r;
    const d = deckHeight(x, z);
    if (d !== null && d <= y + 1e-3 && d >= r.h) return { h: d, name: "pier" };
    if (r.h > 0 || r.name !== "ground") return r;
    const s = seabedY(x, z);
    return s < 0 ? { h: s, name: s < COAST.waterY ? "seabed" : "sand" } : r;
  };
}

// the horizon tree line (sky.js) would stand on the sea: cut it at the coast
function cutTreeLine(env) {
  const sky = env && env.sky;
  sky &&
    sky.traverse((o) => {
      if (o === sky || !o.isMesh || !o.material || !o.material.isMeshBasicMaterial) return;
      (o.material.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float vSeaZ;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvSeaZ = (modelMatrix * vec4(transformed, 1.0)).z;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vSeaZ;")
          .replace("void main() {", `void main() {\n  if (vSeaZ > ${(COAST.shoreZ - 25).toFixed(1)}) discard;`);
      }),
        (o.material.needsUpdate = !0);
    });
}

export { buildSea };
