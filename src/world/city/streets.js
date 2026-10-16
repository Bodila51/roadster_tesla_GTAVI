import { CITY, CURB } from "./layout.js";
import { PLAN } from "./plan.js";
import { GROUND_TILE } from "./textures.js";
import { flat, wall } from "./geo.js";

// Flatwork (one ground-array mesh: roads, curbs, sidewalks, lots, medians, promenade) and paint
// (one vertex-coloured mesh: lane lines, stop lines, crosswalks, parking stalls).
const ROAD_Y = 0.02,
  PAINT_DY = 0.015;
const WHITE = [0.86, 0.86, 0.84],
  YELLOW = [0.93, 0.7, 0.12];

function paintRect(g, x0, z0, x1, z1, y, col) {
  const a = g.vert(x0, y, z0, 0, 1, 0, { color: col }),
    b = g.vert(x0, y, z1, 0, 1, 0, { color: col }),
    c = g.vert(x1, y, z1, 0, 1, 0, { color: col }),
    d = g.vert(x1, y, z0, 0, 1, 0, { color: col });
  g.quadIdx(a, b, c, d);
}

function raised(gg, GL, r, top, surfaces, name, edgeLayer = "curb") {
  const T = (l) => GROUND_TILE[l] || 4;
  // curb faces
  wall(gg, r.x0, r.z1, r.x1, r.z1, 0, CURB, GL.curb, 0, (r.x1 - r.x0) / 2, 0, CURB / 2);
  wall(gg, r.x1, r.z0, r.x0, r.z0, 0, CURB, GL.curb, 0, (r.x1 - r.x0) / 2, 0, CURB / 2);
  wall(gg, r.x1, r.z1, r.x1, r.z0, 0, CURB, GL.curb, 0, (r.z1 - r.z0) / 2, 0, CURB / 2);
  wall(gg, r.x0, r.z0, r.x0, r.z1, 0, CURB, GL.curb, 0, (r.z1 - r.z0) / 2, 0, CURB / 2);
  // top: rings of bands [width, layer] from the edge inwards, then the inside
  let x0 = r.x0,
    x1 = r.x1,
    z0 = r.z0,
    z1 = r.z1;
  for (const [w, layer] of top.bands) {
    const L = GL[layer],
      t = T(layer);
    flat(gg, x0, z0, x1, z0 + w, CURB, L, t);
    flat(gg, x0, z1 - w, x1, z1, CURB, L, t);
    flat(gg, x0, z0 + w, x0 + w, z1 - w, CURB, L, t);
    flat(gg, x1 - w, z0 + w, x1, z1 - w, CURB, L, t);
    (x0 += w), (x1 -= w), (z0 += w), (z1 -= w);
  }
  if (top.inner) flat(gg, x0, z0, x1, z1, CURB, GL[top.inner], T(top.inner));
  surfaces.push({ min: { x: r.x0, y: 0, z: r.z0 }, max: { x: r.x1, y: CURB, z: r.z1 }, name });
}

function buildStreets(gg, pg, GL, surfaces, V3) {
  const S = (o) => ({ min: new V3(o.min.x, o.min.y, o.min.z), max: new V3(o.max.x, o.max.y, o.max.z), name: o.name });
  const surf = [];
  const X = CITY.xStreets.map((s) => s.z),
    Zs = CITY.zStreets,
    hw = (s) => (s.boulevard ? CITY.boulevard.carriage / 2 : 7);
  // asphalt
  for (const zc of X) flat(gg, CITY.bounds.x0, zc - 7, CITY.bounds.x1, zc + 7, ROAD_Y, GL.asphalt, GROUND_TILE.asphalt);
  for (const s of Zs) {
    const h = hw(s);
    if (s.boulevard) flat(gg, -h, CITY.boulevard.z0, h, X[0] - 7, ROAD_Y, GL.asphalt, GROUND_TILE.asphalt);
    for (let i = 0; i < X.length - 1; i++) flat(gg, s.x - h, X[i] + 7, s.x + h, X[i + 1] - 7, ROAD_Y, GL.asphalt, GROUND_TILE.asphalt);
  }
  // blocks: curb strip + sidewalk ring, lots from the plan
  for (const b of CITY.blocks) raised(gg, GL, b, { bands: [[0.3, "curb"], [3.7, "walk"]] }, surf, "sidewalk");
  for (const r of PLAN.grounds) flat(gg, r.x0, r.z0, r.x1, r.z1, r.y, GL[r.layer], GROUND_TILE[r.layer] || 4);
  for (const m of CITY.medians) raised(gg, GL, m, { bands: [[0.3, "curb"]], inner: "grass" }, surf, "median");
  const P = CITY.promenade;
  raised(gg, GL, P, { bands: [[0.3, "curb"]], inner: "prom" }, surf, "promenade");
  const pp = CITY.plazas[0];
  raised(gg, GL, { x0: pp.x0, x1: pp.x1, z0: P.z1, z1: pp.z1 }, { bands: [], inner: "prom" }, surf, "promenade");
  for (const o of surf) surfaces.push(S(o));

  // ---- paint ----
  const yR = ROAD_Y + PAINT_DY;
  // gaps along a street around the crossing streets (intersection + crosswalk + 1 m)
  const segs = (a0, a1, cuts) => {
    const out = [];
    let a = a0;
    for (const [c0, c1] of cuts.sort((p, q) => p[0] - q[0])) {
      if (c0 > a) out.push([a, c0]);
      a = Math.max(a, c1);
    }
    if (a < a1) out.push([a, a1]);
    return out;
  };
  for (let i = 0; i < X.length; i++) {
    const zc = X[i];
    for (const [a, b] of segs(CITY.bounds.x0, CITY.bounds.x1, Zs.map((s) => [s.x - hw(s) - 5, s.x + hw(s) + 5])))
      for (const o of [-0.2, 0.2]) paintRect(pg, a, zc + o - 0.06, b, zc + o + 0.06, yR, YELLOW);
  }
  for (const s of Zs) {
    const zsegs = [];
    if (s.boulevard) zsegs.push([CITY.boulevard.z0 + 2, X[0] - 12]);
    for (let i = 0; i < X.length - 1; i++) zsegs.push([X[i] + 12, X[i + 1] - 12]);
    for (const [a, b] of zsegs) {
      if (!s.boulevard) {
        for (const o of [-0.2, 0.2]) paintRect(pg, s.x + o - 0.06, a, s.x + o + 0.06, b, yR, YELLOW);
        continue;
      }
      for (const sx of [-1, 1]) {
        paintRect(pg, sx * 9.2 - 0.07, a, sx * 9.2 + 0.07, b, yR, WHITE);
        for (let z = a; z < b - 3; z += 9) paintRect(pg, sx * 5.6 - 0.07, z, sx * 5.6 + 0.07, z + 3, yR, WHITE);
      }
    }
  }
  // stop lines and crosswalks
  for (let i = 0; i < X.length; i++) {
    const zc = X[i];
    for (const s of Zs) {
      const h = hw(s),
        inner = s.boulevard ? CITY.boulevard.median / 2 : 0;
      if (s.boulevard || i > 0) paintRect(pg, s.x - h, zc - 12.1, s.x - inner, zc - 11.6, yR, WHITE);
      if (i < X.length - 1) paintRect(pg, s.x + inner, zc + 11.6, s.x + h, zc + 12.1, yR, WHITE);
      paintRect(pg, s.x + h + 4.6, zc - 7, s.x + h + 5.1, zc, yR, WHITE);
      paintRect(pg, s.x - h - 5.1, zc, s.x - h - 4.6, zc + 7, yR, WHITE);
    }
  }
  for (const c of CITY.crosswalks) {
    const n = Math.floor(c.length / 1.2);
    for (let k = 0; k < n; k++) {
      const a = -c.length / 2 + 0.3 + k * 1.2;
      if (c.along === "x") paintRect(pg, c.x + a, c.z - 1.6, c.x + a + 0.6, c.z + 1.6, yR, WHITE);
      else paintRect(pg, c.x - 1.6, c.z + a, c.x + 1.6, c.z + a + 0.6, yR, WHITE);
    }
  }
  for (const r of PLAN.stalls) {
    const y = r.y + PAINT_DY,
      z0 = Math.min(r.z, r.z + r.depth),
      z1 = Math.max(r.z, r.z + r.depth);
    for (let x = r.x0; x <= r.x1; x += 2.8) paintRect(pg, x - 0.06, z0, x + 0.06, z1, y, WHITE);
  }
}

export { buildStreets, paintRect, PAINT_DY, WHITE as PAINT_WHITE, YELLOW as PAINT_YELLOW };
