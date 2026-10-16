// Port Sabal building and prop plan: pure data, deterministic (seeded), built from layout.js.
// Every building is an axis-aligned box on its block (y0 = CURB) up to its roof top h, so its
// walls are one collider and its roof one drivable surface. Minimap code can import this too.
import { CITY, CURB } from "./layout.js";

function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const R = rng(20260);
const pick = (a) => a[Math.floor(R() * a.length) % a.length];
const rr = (a, b) => a + (b - a) * R();

// pastel stucco tints (multiplied over a light stucco texture)
const PASTEL = [
  [1.0, 0.8, 0.72],
  [0.8, 0.94, 0.86],
  [1.0, 0.91, 0.68],
  [0.78, 0.87, 0.98],
  [0.98, 0.78, 0.86],
  [0.88, 0.83, 0.98],
  [1.0, 0.96, 0.88],
  [0.74, 0.92, 0.93],
  [1.0, 0.84, 0.6],
  [0.9, 0.94, 0.78],
];
const GLASSY = [
  [1, 1, 1],
  [0.95, 0.97, 1],
  [1, 0.97, 0.92],
];
const SHOP_SIGNS = 18; // first 18 signs are shop names

const buildings = [],
  grounds = [], // flatwork on block lots: { x0, x1, z0, z1, y, layer } (non-overlapping per block)
  stalls = [], // parking stall rows: { x0, x1, z, depth (+/-), y }
  palms = [], // { x, z, y, h }
  trees = [], // { x, z, y, s }
  benches = [], // { x, z, y, yaw }
  billboards = [], // { x, z, y, yaw, pole, design, roof }
  special = []; // one-offs: gas station, garage, fountain, motel signs, clock tower
let signCursor = 0;

function addB(o) {
  const b = Object.assign(
    { y0: CURB, gh: 3.4, fh: 3.2, floors: 2, up: "win1", front: "s", sides: {}, tint: [1, 1, 1], sign: null, awning: null, roof: { ac: 1 }, kind: "house" },
    o,
  );
  b.h = b.h ?? b.y0 + b.gh + (b.floors - 1) * b.fh;
  buildings.push(b);
  return b;
}
const ground = (x0, x1, z0, z1, layer, y = CURB) => grounds.push({ x0, x1, z0, z1, y, layer });

// split a lot rect into cells not covered by any hole, then add the holes with their layers
function cover(lot, base, holes) {
  const xs = [...new Set([lot.x0, lot.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= lot.x0 && x <= lot.x1).sort((a, b) => a - b),
    zs = [...new Set([lot.z0, lot.z1, ...holes.flatMap((h) => [h.z0, h.z1])])].filter((z) => z >= lot.z0 && z <= lot.z1).sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2,
        cz = (zs[j] + zs[j + 1]) / 2;
      if (!holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) ground(xs[i], xs[i + 1], zs[j], zs[j + 1], base);
    }
  for (const h of holes) ground(h.x0, h.x1, h.z0, h.z1, h.layer);
}

function nextSign() {
  return signCursor++ % SHOP_SIGNS;
}

// ---- zones ----
function houses(b) {
  const L = b.lot,
    holes = [];
  for (const side of ["n", "s"]) {
    let x = L.x0 + rr(2, 5);
    while (x < L.x1 - 10) {
      const w = Math.min(rr(11, 15), L.x1 - 3 - x);
      if (w < 9) break;
      const d = rr(10, 12),
        set = rr(5, 7),
        z0 = side === "n" ? L.z0 + set : L.z1 - set - d,
        floors = R() < 0.6 ? 2 : 1;
      addB({ kind: "house", x0: x, x1: x + w, z0, z1: z0 + d, floors, gh: 3.4, fh: 3.1, up: pick(["win1", "win2", "arch", "win4"]), front: side, tint: pick(PASTEL), roof: { ac: R() < 0.7 ? 1 : 0 } });
      // driveway from the street to the side of the house
      const dx = R() < 0.5 ? x - 3.4 : x + w + 0.4;
      if (dx > L.x0 + 0.5 && dx + 3 < L.x1 - 0.5) holes.push(side === "n" ? { x0: dx, x1: dx + 3, z0: L.z0, z1: z0 + d, layer: "conc" } : { x0: dx, x1: dx + 3, z0: L.z1 - set - d, z1: L.z1, layer: "conc" });
      if (R() < 0.55) palms.push({ x: x + w * rr(0.2, 0.8), z: side === "n" ? L.z0 + set * 0.45 : L.z1 - set * 0.45, y: CURB, h: rr(6, 9) });
      if (R() < 0.5) trees.push({ x: x + w * rr(0.2, 0.8), z: side === "n" ? z0 + d + rr(4, 8) : z0 - rr(4, 8), y: CURB, s: rr(0.8, 1.2) });
      x += w + rr(5, 9);
    }
  }
  // remove driveway overlaps (keep the first)
  const keep = [];
  for (const h of holes) if (!keep.some((k) => h.x0 < k.x1 && h.x1 > k.x0 && h.z0 < k.z1 && h.z1 > k.z0)) keep.push(h);
  cover(L, "grass", keep);
}

function apartments(b) {
  const L = b.lot,
    holes = [{ x0: L.x0 + 8, x1: L.x1 - 8, z0: L.z0 + 26, z1: L.z1 - 26, layer: "lot" }];
  for (const side of ["n", "s"]) {
    let x = L.x0 + rr(3, 6);
    while (x < L.x1 - 20) {
      const w = Math.min(rr(26, 34), L.x1 - 3 - x);
      if (w < 18) break;
      const d = rr(14, 16),
        z0 = side === "n" ? L.z0 + 3 : L.z1 - 3 - d;
      addB({ kind: "apt", x0: x, x1: x + w, z0, z1: z0 + d, floors: R() < 0.5 ? 3 : 4, gh: 3.4, fh: 3.2, up: pick(["balc", "win1", "ribbon", "win2"]), front: side, tint: pick(PASTEL), roof: { ac: 2 } });
      x += w + rr(6, 10);
    }
  }
  const h = holes[0];
  stalls.push({ x0: h.x0 + 2, x1: h.x1 - 2, z: h.z0, depth: 5, y: CURB }, { x0: h.x0 + 2, x1: h.x1 - 2, z: h.z1, depth: -5, y: CURB });
  for (let x = h.x0 + 6; x < h.x1 - 4; x += 14) trees.push({ x, z: L.z0 + 22, y: CURB, s: rr(0.8, 1.1) }, { x: x + 7, z: L.z1 - 22, y: CURB, s: rr(0.8, 1.1) });
  cover(L, "grass", holes);
}

// a contiguous row of shops along one lot edge; dir = front side
function shopRow(x0, x1, z0, z1, front, opt = {}) {
  const alongX = front === "n" || front === "s",
    a0 = alongX ? x0 : z0,
    a1 = alongX ? x1 : z1;
  let a = a0;
  const list = [];
  while (a < a1 - 1) {
    let w = rr(14, 24);
    if (a1 - (a + w) < 10) w = a1 - a;
    const floors = opt.floors ?? (R() < 0.55 ? 2 : 3),
      o = alongX ? { x0: a, x1: a + w, z0, z1 } : { x0, x1, z0: a, z1: a + w };
    list.push(
      addB({
        kind: "shop",
        ...o,
        floors,
        gh: 4.2,
        fh: 3.4,
        up: pick(["win1", "win2", "arch", "ribbon", "win4"]),
        ground: pick(["shop1", "shop2", "shop3"]),
        front,
        tint: pick(PASTEL),
        sign: opt.sign ?? nextSign(),
        awning: R() < 0.6 ? pick(["awnR", "awnG", "awnB"]) : null,
        roof: { ac: 1 + Math.floor(R() * 3) },
      }),
    );
    a += w;
  }
  // the end buildings show windows on their open sides
  if (list.length) {
    const s0 = alongX ? "w" : "n",
      s1 = alongX ? "e" : "s";
    list[0].sides[s0] = "win";
    list[list.length - 1].sides[s1] = "win";
  }
  return list;
}

function shops(b, opt = {}) {
  const L = b.lot,
    D = 18;
  shopRow(L.x0, L.x1, L.z0, L.z0 + D, "n");
  shopRow(L.x0, L.x1, L.z1 - D, L.z1, "s");
  // shops facing the boulevard on its side of the block
  let hx0 = L.x0,
    hx1 = L.x1;
  if (b.x1 === -12) shopRow(L.x1 - D, L.x1, L.z0 + D, L.z1 - D, "e"), (hx1 = L.x1 - D);
  if (b.x0 === 12) shopRow(L.x0, L.x0 + D, L.z0 + D, L.z1 - D, "w"), (hx0 = L.x0 + D);
  const lot = { x0: hx0, x1: hx1, z0: L.z0 + D, z1: L.z1 - D, layer: "lot" };
  stalls.push({ x0: lot.x0 + 3, x1: lot.x1 - 3, z: lot.z0, depth: 5, y: CURB }, { x0: lot.x0 + 3, x1: lot.x1 - 3, z: lot.z1, depth: -5, y: CURB });
  cover(L, "lot", []);
  if (opt.billboard != null) {
    const s = buildings[buildings.length - 1];
    billboards.push({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, y: s.h, yaw: opt.billboard.yaw, pole: 3.5, design: opt.billboard.design, roof: true });
  }
}

// downtown towers (hand-placed footprints relative to the lot)
let towerCount = 0;
const TOWER_H = [56, 42, 60, 34, 48, 38, 52, 45, 31, 40];
function towers(b, spots) {
  const L = b.lot;
  for (const [fx0, fz0, w, d] of spots) {
    const x0 = fx0 >= 0 ? L.x0 + fx0 : L.x1 + fx0 - w,
      z0 = fz0 >= 0 ? L.z0 + fz0 : L.z1 + fz0 - d,
      H = TOWER_H[towerCount % TOWER_H.length],
      i = towerCount++;
    const up = ["cw1", "cw4", "cw2", "cw3"][i % 4];
    addB({
      kind: "tower",
      x0,
      x1: x0 + w,
      z0,
      z1: z0 + d,
      gh: 5,
      fh: 3.6,
      floors: 1 + Math.round((H - 5 - 1.2) / 3.6),
      up,
      ground: "lobby",
      tint: up === "cw2" || up === "cw3" ? pick(GLASSY) : [1, 1, 1],
      roof: { penthouse: H !== 60, helipad: H === 60, antenna: H === 56 || H === 52 },
      front: "s",
    });
    const t = buildings[buildings.length - 1];
    t.h = t.y0 + t.gh + (t.floors - 1) * t.fh + 1.2; // + crown
    trees.push({ x: x0 - 3, z: z0 - 3, y: CURB, s: 0.9 }, { x: x0 + w + 3, z: z0 + d + 3, y: CURB, s: 0.9 });
  }
  cover(L, "plaza", []);
}

function gas(b) {
  const L = b.lot;
  // apron, canopy, pumps, store and price sign (built as one-offs)
  special.push({ type: "gas", canopy: { x0: 24, x1: 60, z0: 251, z1: 271, y0: 5.0, y1: 5.8 }, pumps: [30, 42, 54].map((x) => ({ x, z0: 256, z1: 266 })), pylon: { x: 20, z: 246 } });
  addB({ kind: "shop", x0: 38, x1: 78, z0: 280, z1: 293, floors: 1, gh: 4.6, up: "blank", ground: "shop2", front: "n", tint: [1, 0.97, 0.94], sign: 19, awning: null, roof: { ac: 2 } });
  shopRow(L.x0, L.x1, 301, L.z1, "s");
  shopRow(111, L.x1, L.z0, 299, "e", { floors: 2 });
  cover(L, "lot", [{ x0: 16, x1: 82, z0: 241, z1: 297, layer: "conc" }]);
  stalls.push({ x0: 84, x1: 109, z: 297, depth: -5, y: CURB });
}

function garage(b) {
  const G = CITY.garage,
    L = b.lot;
  special.push({ type: "garage", g: G });
  addB({ kind: "garage", x0: G.x0, x1: G.x1, z0: G.z0, z1: G.z1, gh: 3.6, fh: 3.6, floors: 2, h: G.roof, up: "deck", ground: "deck", front: "w", tint: [1, 1, 1], roof: { garage: true }, sign: 20 });
  cover(L, "lot", []);
  stalls.push({ x0: L.x0 + 4, x1: G.ramp.x1 - 2, z: L.z0, depth: 5, y: CURB }, { x0: L.x0 + 4, x1: G.ramp.x1 - 2, z: L.z1, depth: -5, y: CURB });
  stalls.push({ x0: G.x0 + 2, x1: G.x1 - 2, z: G.z0 + 2, depth: 5, y: G.roof }, { x0: G.x0 + 2, x1: G.x1 - 2, z: G.z1 - 2, depth: -5, y: G.roof });
  stalls.push({ x0: G.x0 + 8, x1: G.x1 - 2, z: G.z0 + 33, depth: -5, y: G.roof }, { x0: G.x0 + 8, x1: G.x1 - 2, z: G.z1 - 33, depth: 5, y: G.roof });
}

function civic(b) {
  const L = b.lot;
  addB({ kind: "civic", x0: L.x0 + 4, x1: L.x0 + 44, z0: 452, z1: 508, floors: 3, gh: 4.2, fh: 3.6, up: "arch", ground: "shop3", front: "e", tint: [1, 0.94, 0.82], sign: 23, roof: { ac: 2 } });
  addB({ kind: "clock", x0: L.x0 + 18, x1: L.x0 + 26, z0: 476, z1: 484, floors: 6, gh: 4, fh: 3.6, h: 24, up: "arch", front: "e", tint: [1, 0.94, 0.82], roof: { ac: 0 } });
  const p = CITY.plazas[1];
  special.push({ type: "fountain", x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 });
  for (let k = 0; k < 6; k++) {
    trees.push({ x: p.x0 + 5 + k * 10, z: p.z0 + 5, y: CURB, s: 1 }, { x: p.x0 + 5 + k * 10, z: p.z1 - 5, y: CURB, s: 1 });
    benches.push({ x: p.x0 + 10 + k * 10, z: p.z0 + 9, y: CURB, yaw: 0 }, { x: p.x0 + 10 + k * 10, z: p.z1 - 9, y: CURB, yaw: Math.PI });
  }
  cover(L, "plaza", [{ x0: L.x0, x1: L.x0 + 48, z0: L.z0, z1: 448, layer: "grass" }, { x0: L.x0, x1: L.x0 + 48, z0: 512, z1: L.z1, layer: "grass" }]);
}

function hotel(b) {
  const L = b.lot,
    west = b.x0 < 0;
  if (west) {
    addB({ kind: "hotel", x0: L.x0 + 7, x1: L.x0 + 73, z0: L.z1 - 28, z1: L.z1 - 4, floors: 6, gh: 4.2, fh: 3.2, up: "balc", ground: "shop2", front: "s", tint: [1, 0.98, 0.94], sign: 21, roof: { ac: 3, signBoard: 21 } });
    addB({ kind: "hotel", x0: L.x1 - 30, x1: L.x1 - 4, z0: L.z0 + 6, z1: L.z1 - 4, floors: 4, gh: 4.2, fh: 3.2, up: "balc", ground: "shop1", front: "w", tint: pick(PASTEL), roof: { ac: 2 } });
    cover(L, "grass", [
      { x0: L.x0 + 14, x1: L.x0 + 40, z0: L.z0 + 14, z1: L.z0 + 30, layer: "pool" },
      { x0: L.x0 + 10, x1: L.x0 + 14, z0: L.z0 + 10, z1: L.z0 + 34, layer: "conc" },
      { x0: L.x0 + 40, x1: L.x0 + 44, z0: L.z0 + 10, z1: L.z0 + 34, layer: "conc" },
      { x0: L.x0 + 14, x1: L.x0 + 40, z0: L.z0 + 10, z1: L.z0 + 14, layer: "conc" },
      { x0: L.x0 + 14, x1: L.x0 + 40, z0: L.z0 + 30, z1: L.z0 + 34, layer: "conc" },
    ]);
    for (let k = 0; k < 5; k++) palms.push({ x: L.x0 + 12 + k * 8, z: L.z0 + 38, y: CURB, h: rr(7, 10) });
  } else {
    addB({ kind: "hotel", x0: L.x0 + 66, x1: L.x1 - 4, z0: L.z0 + 8, z1: L.z1 - 4, floors: 8, gh: 4.2, fh: 3.2, up: "balc", ground: "shop2", front: "s", tint: [0.86, 0.95, 0.97], sign: 21, roof: { ac: 3, signBoard: 21 } });
    shopRow(L.x0, L.x0 + 60, L.z0, L.z0 + 18, "n", { floors: 2 });
    const P = CITY.parking.find((p) => p.id === "beach-lot");
    cover(L, "grass", [{ x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z1, layer: "lot" }]);
    stalls.push({ x0: P.x0 + 2, x1: P.x1 - 2, z: P.z0 + 1, depth: 5, y: CURB }, { x0: P.x0 + 2, x1: P.x1 - 2, z: P.z1 - 1, depth: -5, y: CURB });
    for (let k = 0; k < 4; k++) palms.push({ x: L.x0 + 64, z: L.z0 + 26 + k * 13, y: CURB, h: rr(7, 10) });
  }
}

function motel(b) {
  const L = b.lot,
    west = b.x0 < 0,
    sx = west ? 1 : -1,
    ax = west ? L.x0 + 6 : L.x1 - 6;
  const wingA = { x0: Math.min(ax, ax + sx * 70), x1: Math.max(ax, ax + sx * 70), z0: L.z0 + 4, z1: L.z0 + 16 },
    wingB = { x0: Math.min(ax, ax + sx * 12), x1: Math.max(ax, ax + sx * 12), z0: L.z0 + 16, z1: L.z1 - 18 };
  addB({ kind: "motel", ...wingA, floors: 2, gh: 3.2, fh: 3.0, up: "door", ground: "door", front: "s", tint: pick(PASTEL), roof: { ac: 3 }, sides: { n: "win" } });
  addB({ kind: "motel", ...wingB, floors: 2, gh: 3.2, fh: 3.0, up: "door", ground: "door", front: west ? "e" : "w", tint: buildings[buildings.length - 1].tint, roof: { ac: 2 } });
  const court = { x0: west ? wingB.x1 + 2 : L.x0 + 2, x1: west ? L.x1 - 2 : wingB.x0 - 2, z0: wingA.z1 + 2, z1: L.z1 - 2 };
  special.push({ type: "motelSign", x: west ? L.x1 - 6 : L.x0 + 6, z: L.z1 - 4 });
  cover(L, "lot", [
    { x0: west ? L.x1 - 34 : L.x0 + 10, x1: west ? L.x1 - 10 : L.x0 + 34, z0: L.z1 - 28, z1: L.z1 - 14, layer: "pool" },
    { x0: west ? L.x1 - 38 : L.x0 + 6, x1: west ? L.x1 - 6 : L.x0 + 38, z0: L.z1 - 32, z1: L.z1 - 28, layer: "conc" },
  ]);
  stalls.push({ x0: court.x0 + 2, x1: court.x1 - 40, z: court.z0, depth: 5, y: CURB });
  palms.push({ x: west ? L.x1 - 40 : L.x0 + 40, z: L.z1 - 10, y: CURB, h: 9 }, { x: west ? L.x1 - 4 : L.x0 + 4, z: L.z1 - 30, y: CURB, h: 8 });
}

function verge(b) {
  const L = b.lot;
  cover(L, "grass", []);
  const east = b.x0 > 0;
  for (let x = L.x0 + 10; x < L.x1 - 6; x += 22) palms.push({ x, z: (L.z0 + L.z1) / 2 + rr(-3, 3), y: CURB, h: rr(7, 11) });
  for (const [x, design] of east ? [[60, 5], [210, 1], [360, 3]] : [[-70, 0], [-220, 2], [-370, 4]])
    billboards.push({ x, z: 207, y: CURB, yaw: Math.PI, pole: 7, design });
}

const ZONE_FN = {
  house: houses,
  apartments,
  shops: (b) => shops(b),
  downtown: (b) =>
    towers(
      b,
      b.id === "r2c4"
        ? [
            [3, 3, 30, 32],
            [-3, 3, 28, 30],
            [3, -3, 28, 30],
            [-3, -3, 32, 32],
          ]
        : [
            [3, 3, 32, 34],
            [-3, 3, 30, 30],
            [40, -3, 34, 32],
          ],
    ),
  civic,
  gas,
  garage,
  hotel,
  motel,
  verge,
};
for (const b of CITY.blocks) (ZONE_FN[b.zone] || houses)(b);

// rooftop billboards on two shops facing the boulevard
for (const [x, z, yaw, design] of [
  [-24, 300, Math.PI, 0],
  [24, 580, Math.PI, 4],
]) {
  const s = buildings.find((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  if (s) billboards.push({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, y: s.h, yaw, pole: 3, design, roof: true });
}

// ---- street furniture along the streets ----
const lights = [], // { x, z, y, yaw (arm direction), double }
  signals = []; // { x, z, y, yaw, arm, group }
const X = CITY.xStreets.map((s) => s.z),
  Zs = CITY.zStreets;
const nearX = (x) => Zs.some((s) => Math.abs(x - s.x) < (s.boulevard ? 12 : 7) + 8);
const nearZ = (z) => X.some((zc) => Math.abs(z - zc) < 7 + 8);
// X streets: lights on both sides, staggered, arm towards the road
X.forEach((zc, i) => {
  for (let x = -470; x <= 470; x += 40) {
    if (!nearX(x)) lights.push({ x, z: zc - 7 - 0.7, y: CURB, yaw: 0 });
    if (!nearX(x + 20) && i < X.length - 1) lights.push({ x: x + 20, z: zc + 7 + 0.7, y: CURB, yaw: Math.PI });
  }
});
// Z streets (not the boulevard)
for (const s of Zs) {
  if (s.boulevard) continue;
  for (let z = X[0] + 25; z < X[X.length - 1] - 10; z += 40) {
    if (!nearZ(z)) lights.push({ x: s.x - 7 - 0.7, z, y: CURB, yaw: Math.PI / 2 });
    if (!nearZ(z + 20)) lights.push({ x: s.x + 7 + 0.7, z: z + 20, y: CURB, yaw: -Math.PI / 2 });
  }
}
// boulevard: median double lights and palms, palms along both sidewalks
for (const m of CITY.medians) {
  for (let z = m.z0 + 4; z <= m.z1 - 3; z += 12) {
    const k = Math.round((z - m.z0) / 12);
    if (k % 3 === 1) lights.push({ x: 0, z, y: CURB, yaw: Math.PI / 2, double: true });
    else palms.push({ x: 0, z, y: CURB, h: rr(8, 11) });
  }
}
for (let z = 245; z < 620; z += 18) if (!nearZ(z)) for (const sx of [-1, 1]) palms.push({ x: sx * 13.2, z, y: CURB, h: rr(8, 11.5) });
// north verge entrance palms along the boulevard
for (let z = 176; z < 222; z += 12) for (const sx of [-1, 1]) palms.push({ x: sx * 13.2, z: Math.min(z, 220), y: z > 200 ? CURB : 0, h: rr(9, 11) });
// promenade: palms near the road, lamps near the sand, benches facing the sea, railing gaps
const PR = CITY.promenade;
for (let x = PR.x0 + 8; x < PR.x1 - 4; x += 14) palms.push({ x, z: PR.z0 + 3, y: CURB, h: rr(8, 12) });
for (let x = PR.x0 + 15; x < PR.x1 - 4; x += 28) {
  lights.push({ x, z: PR.z1 - 2, y: CURB, yaw: Math.PI });
  benches.push({ x: x + 7, z: PR.z1 - 4, y: CURB, yaw: 0 }, { x: x - 7, z: PR.z1 - 4, y: CURB, yaw: 0 });
}
// Ocean Dr north sidewalk palms
for (let x = -468; x < 470; x += 24) if (!nearX(x)) palms.push({ x, z: 630 - 7 - 1.2, y: CURB, h: rr(7, 10) });

// traffic signals: 4 far-side poles at the boulevard crossings and the inner 4-way crossings
for (const zc of X)
  for (const s of Zs) {
    const inner = zc !== X[0] && zc !== X[X.length - 1];
    if (!s.boulevard && !inner) continue;
    const hw = s.boulevard ? 12 : 7,
      xc = s.x,
      armZ = s.boulevard ? 9 : 5.5,
      armX = 5.5;
    // group 0 = north-south traffic, 1 = east-west
    signals.push({ x: xc - hw - 0.8, z: zc + 7 + 0.8, y: CURB, yaw: 0, arm: armZ, group: 0 }); // southbound, SW corner
    signals.push({ x: xc + hw + 0.8, z: zc - 7 - 0.8, y: CURB, yaw: Math.PI, arm: armZ, group: 0 }); // northbound, NE corner
    signals.push({ x: xc - hw - 0.8, z: zc - 7 - 0.8, y: CURB, yaw: -Math.PI / 2, arm: armX, group: 1 }); // westbound, NW corner
    signals.push({ x: xc + hw + 0.8, z: zc + 7 + 0.8, y: CURB, yaw: Math.PI / 2, arm: armX, group: 1 }); // eastbound, SE corner
  }

// keep palms out of billboard faces
for (let i = palms.length - 1; i >= 0; i--) if (billboards.some((b) => !b.roof && Math.hypot(palms[i].x - b.x, palms[i].z - b.z) < 11)) palms.splice(i, 1);

const PLAN = { buildings, grounds, stalls, palms, trees, benches, billboards, special, lights, signals };
export { PASTEL, PLAN };
