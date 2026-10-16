// What the radar draws under the blips, in world metres (x, z): roads, blocks,
// beach, sea, structures and the playground features. This is the one place
// that knows the map. The town (streets, blocks, promenade, beach, shoreline)
// comes from the city layout data.
import { Vector3 } from "three";
import { CITY } from "../world/city/layout.js";
import { WORLD } from "../world/layout.js";

const EDGE = 1800; // past the 1600 m world boundary
const box = (r) => rect(r.x0, r.z0, r.x1, r.z1);

const rect = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

// Playground features drawn as icons: where each one is looked for, and how
// close a mission has to be to count as "at" the feature.
const FEATURES = [
  { kind: "wall", at: WORLD.ramp, r: 40 },
  { kind: "lineup", at: WORLD.lineup, r: 48 },
  { kind: "loop", at: WORLD.loop, r: 30 },
  { kind: "halfpipe", at: WORLD.halfpipe, r: 40 },
  { kind: "massdriver", at: WORLD.massdriver, r: 45 },
  { kind: "bullseye", at: WORLD.bullseye, r: 45 },
];

const tmp = new Vector3();

/** Build the radar layers once (static world). */
export function buildRadarMap({ phys, game }) {
  const m = {
    sea: [], // polygons [[x, z], ...]
    beach: [],
    green: [], // verges, parks
    blocks: [], // town blocks
    paved: [], // promenade, plazas, parking
    asphalt: [], // town streets
    roads: [], // {pts: [[x, z], ...], w, kind}
    rings: [], // {x, z, r, w} ring-shaped pads (donut)
    ribbons: [], // ramps: {pts, w}
    structures: [], // {x0, z0, x1, z1, k}
    features: [], // {kind, x, z (icon), ax, az (layout spot), r (mission catch radius)}
  };

  // the town, the beach and the sea
  const C = CITY || {};
  const shore = Number.isFinite(C.shoreZ) ? C.shoreZ : 710;
  m.sea.push(rect(-EDGE, shore, EDGE, EDGE));
  if (C.beach) m.beach.push(box(C.beach));
  for (const b of C.blocks || []) (b.zone === "verge" || b.zone === "park" ? m.green : m.blocks).push(box(b));
  if (C.promenade) m.paved.push(box(C.promenade));
  for (const p of [...(C.plazas || []), ...(C.parking || [])]) m.paved.push(box(p));
  for (const a of C.asphalt || []) m.asphalt.push(box(a));

  // airfield: runway, the lane to the reveal wall, the lineup lane, the donut pad
  m.roads.push({ pts: [[-1200, WORLD.runwayZ], [1200, WORLD.runwayZ]], w: 56, kind: "runway" });
  m.roads.push({ pts: [[0, 10], [0, WORLD.ramp.z + 4]], w: 15, kind: "lane" });
  m.roads.push({ pts: [[19, WORLD.lineup.z], [95, WORLD.lineup.z]], w: 14, kind: "lane" });
  m.rings.push({ x: WORLD.donut.x, z: WORLD.donut.z, r: 24, w: 4 });

  // ramps (wall, halfpipe, loop, mass driver) as their footprint ribbons
  const centers = [];
  for (const r of phys.ramps || []) {
    if (!r || typeof r.point !== "function" || !(r.L > 0)) continue;
    const pts = [];
    const n = Math.max(8, Math.ceil(r.L / 1.5));
    let cx = 0,
      cz = 0;
    for (let i = 0; i <= n; i++) {
      r.point((r.L * i) / n, 0, tmp);
      pts.push([tmp.x, tmp.z]);
      cx += tmp.x;
      cz += tmp.z;
    }
    m.ribbons.push({ pts, w: r.width || (r.half ? r.half * 2 : 6) });
    centers.push({ x: cx / (n + 1), z: cz / (n + 1) });
  }
  for (const c of phys.colliders || []) {
    if (!c || !c.min || !c.max) continue;
    const k = c.name || "";
    if (k === "pole") continue;
    m.structures.push({ x0: c.min.x, z0: c.min.z, x1: c.max.x, z1: c.max.z, k });
  }
  for (const b of (game && game.lineup && game.lineup.boxes) || [])
    if (b && b.min && b.name !== "platform")
      m.structures.push({ x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z, k: "vehicle" });

  // feature icons: a ramp's own centre when one is near the layout spot
  for (const f of FEATURES) {
    let x = f.at.x,
      z = f.at.z;
    let best = 80;
    for (const c of centers) {
      const d = Math.hypot(c.x - f.at.x, c.z - f.at.z);
      if (d < best) (best = d), (x = c.x), (z = c.z);
    }
    if (f.kind === "bullseye" && game && game.bullseye && game.bullseye.center)
      (x = game.bullseye.center.x), (z = game.bullseye.center.z);
    m.features.push({ kind: f.kind, x, z, ax: f.at.x, az: f.at.z, r: f.r });
  }
  return m;
}
