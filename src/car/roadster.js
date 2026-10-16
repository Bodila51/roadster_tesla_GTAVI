import { buildGltfRoadster, loadGltfRoadster } from "./gltf-roadster.js";
import { buildProceduralRoadster } from "./procedural.js";

// The car: the GLB model at public/models/roadster.glb when there is one,
// otherwise (missing, broken, too slow) the procedural car. Both return the
// same object, so callers do:
//   await loadRoadster();       // once, before building
//   const car = buildRoadster(); // car.source is "gltf" or "procedural"
//
// Vite lists the file here only when it exists at build time, so a build
// without it never requests it (no 404 in the console). After adding the file,
// rebuild. URL overrides: ?car=procedural forces the old car, ?car=glb tries
// models/roadster.glb even if the build did not see it.
const BUILT = Object.values(
  import.meta.glob("/public/models/roadster.glb", { query: "?url", import: "default", eager: true }),
)[0];
const PUBLIC_URL = "models/roadster.glb";
const TIMEOUT_MS = 15e3;

const status = { source: "procedural", url: null, reason: "loadRoadster() not called" };
let prepared = null;
let pending = null;

function carParam() {
  try {
    return new URLSearchParams(location.search).get("car");
  } catch {
    return null;
  }
}

// Loads the GLB once. Never rejects; resolves to the status object
// { source, url, reason, triangles?, warnings? }.
function loadRoadster(url) {
  if (pending) return pending;
  const param = carParam();
  url = url || (param === "glb" ? PUBLIC_URL : BUILT && (import.meta.env.DEV ? PUBLIC_URL : BUILT));
  if (param === "procedural" || !url) {
    status.reason = param === "procedural" ? "?car=procedural" : "no public/models/roadster.glb in this build";
    return (pending = Promise.resolve(status));
  }
  status.url = url;
  let timer;
  const timeout = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`timed out after ${TIMEOUT_MS / 1e3} s`)), TIMEOUT_MS);
  });
  pending = Promise.race([loadGltfRoadster(url), timeout]).then(
    (p) => {
      clearTimeout(timer);
      prepared = p;
      Object.assign(status, { source: "gltf", reason: "loaded", triangles: p.triangles, warnings: p.warnings });
      for (const w of p.warnings) console.warn(`[car] ${url}: ${w}`);
      return status;
    },
    (err) => {
      clearTimeout(timer);
      status.reason = String((err && err.message) || err);
      console.warn(`[car] ${url} not used (${status.reason}); using the procedural car`);
      return status;
    },
  );
  return pending;
}

// Same signature and result as always: buildRoadster(mats?) -> { root, body,
// wheels, thrusters, mats, wing, nozzleGlows, parts, source }.
function buildRoadster(mats) {
  if (prepared)
    try {
      return Object.assign(buildGltfRoadster(prepared, mats), { source: "gltf" });
    } catch (err) {
      prepared = null;
      Object.assign(status, { source: "procedural", reason: `build failed: ${(err && err.message) || err}` });
      console.warn(`[car] GLB car could not be built (${status.reason}); using the procedural car`);
    }
  return Object.assign(buildProceduralRoadster(mats), { source: "procedural" });
}

export { buildRoadster, loadRoadster, status as roadsterStatus };
