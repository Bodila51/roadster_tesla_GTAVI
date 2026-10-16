// Port Sabal, TX: the seaside town south of the runway. Pure data plus helpers, no three.js, so
// the city, sea, people and minimap code (and node tools) can all import it.
//
// Axes: x runs west (-) to east (+), z grows from the runway (z 140) towards the sea, y is up.
// Roads are at y = 0 (the physics ground). Blocks, sidewalks, the boulevard median and the
// promenade are raised by CURB. A car facing +z (heading 0) has -x on its right, so traffic
// heading to the sea uses the x < 0 side of a street.
//
// Every street has a centre line, a carriageway width and a sidewalk width. Blocks are given by
// their curb lines (outer edge of the sidewalk); `lot` is the part inside the sidewalk ring, where
// buildings stand. `walk` is a closed loop (first point not repeated) along the middle of the
// sidewalk ring, for pedestrians. Crosswalks continue those loops across the streets.

const CURB = 0.15;
const LANE = 3.6;
const STREET = { carriage: 14, sidewalk: 4 };
// boulevard: 24 m carriageway with a raised 4 m palm median, 2 lanes and a parking lane per side
const BLVD = { x: 0, carriage: 24, median: 4, sidewalk: 4, z0: 168, z1: 637 };
const BOUNDS = { x0: -480, x1: 480, z0: 200, z1: 640 };

// streets along X (constant z) and along Z (constant x)
const X_STREETS = [
  { z: 230, name: "Palmetto St" },
  { z: 330, name: "Mesquite St" },
  { z: 430, name: "Magnolia St" },
  { z: 530, name: "Bayou St" },
  { z: 630, name: "Ocean Dr" },
];
const Z_STREETS = [
  { x: -420, name: "Laguna St" },
  { x: -280, name: "Pelican St" },
  { x: -140, name: "Heron St" },
  { x: 0, name: "Sabal Blvd", boulevard: true },
  { x: 140, name: "Dune St" },
  { x: 280, name: "Coral St" },
  { x: 420, name: "Shell St" },
];

const halfW = (s) => (s.boulevard ? BLVD.carriage : STREET.carriage) / 2;

// centre lines with widths; a: start point, b: end point (x, z)
const streets = [
  ...X_STREETS.map((s, i) => ({
    id: "x" + i,
    name: s.name,
    axis: "x",
    z: s.z,
    a: [BOUNDS.x0, s.z],
    b: [BOUNDS.x1, s.z],
    carriage: STREET.carriage,
    sidewalk: STREET.sidewalk,
    lanes: 2,
  })),
  ...Z_STREETS.map((s, i) => ({
    id: "z" + i,
    name: s.name,
    axis: "z",
    x: s.x,
    a: [s.x, s.boulevard ? BLVD.z0 : X_STREETS[0].z],
    b: [s.x, X_STREETS[X_STREETS.length - 1].z],
    carriage: s.boulevard ? BLVD.carriage : STREET.carriage,
    sidewalk: STREET.sidewalk,
    lanes: s.boulevard ? 4 : 2,
    median: s.boulevard ? BLVD.median : 0,
    boulevard: !!s.boulevard,
  })),
];

// asphalt: union of these rectangles (x0, x1, z0, z1)
const asphalt = [
  ...X_STREETS.map((s) => ({ x0: BOUNDS.x0, x1: BOUNDS.x1, z0: s.z - 7, z1: s.z + 7 })),
  ...Z_STREETS.map((s) => {
    const h = halfW(s);
    return { x0: s.x - h, x1: s.x + h, z0: s.boulevard ? BLVD.z0 : X_STREETS[0].z - 7, z1: X_STREETS[X_STREETS.length - 1].z + 7 };
  }),
];
// the raised palm median of the boulevard (stops short of each intersection)
const medians = [];
for (let i = -1; i < X_STREETS.length - 1; i++) {
  const z0 = i < 0 ? BLVD.z0 + 6 : X_STREETS[i].z + 7 + 4,
    z1 = X_STREETS[i + 1].z - 7 - 4;
  medians.push({ x0: -BLVD.median / 2, x1: BLVD.median / 2, z0, z1 });
}

// block grid, by curb lines
const ROWS = [
  [237, 323],
  [337, 423],
  [437, 523],
  [537, 623],
];
const COLS = [
  [-480, -427],
  [-413, -287],
  [-273, -147],
  [-133, -12],
  [12, 133],
  [147, 273],
  [287, 413],
  [427, 480],
];
// what each block is for: rows (towards the sea) x columns (west to east)
const ZONES = [
  ["house", "house", "shops", "shops", "gas", "shops", "house", "house"],
  ["house", "apartments", "garage", "downtown", "downtown", "apartments", "house", "house"],
  ["house", "apartments", "shops", "civic", "downtown", "shops", "apartments", "house"],
  ["house", "motel", "hotel", "shops", "shops", "hotel", "motel", "house"],
];

function rectLoop(x0, x1, z0, z1, inset) {
  return [
    [x0 + inset, z0 + inset],
    [x1 - inset, z0 + inset],
    [x1 - inset, z1 - inset],
    [x0 + inset, z1 - inset],
  ];
}

function makeBlock(id, x0, x1, z0, z1, zone) {
  const sw = STREET.sidewalk;
  return {
    id,
    zone,
    x0,
    x1,
    z0,
    z1,
    y: CURB,
    lot: { x0: x0 + sw, x1: x1 - sw, z0: z0 + sw, z1: z1 - sw },
    walk: rectLoop(x0, x1, z0, z1, sw / 2),
  };
}

const blocks = [];
ROWS.forEach(([z0, z1], r) =>
  COLS.forEach(([x0, x1], c) => blocks.push(makeBlock(`r${r + 1}c${c}`, x0, x1, z0, z1, ZONES[r][c]))),
);
// landscaped strip between the airfield and Palmetto St, split by the boulevard
blocks.push(makeBlock("verge-w", BOUNDS.x0, -BLVD.carriage / 2, BOUNDS.z0, 223, "verge"));
blocks.push(makeBlock("verge-e", BLVD.carriage / 2, BOUNDS.x1, BOUNDS.z0, 223, "verge"));

// promenade: wide paved walk on the sea side of Ocean Dr, then the beach and the sea
const PROMENADE = {
  x0: BOUNDS.x0,
  x1: BOUNDS.x1,
  z0: 637, // south curb of Ocean Dr
  z1: 656, // sea edge of the paving, the sand starts here
  y: CURB,
  line: [
    [BOUNDS.x0, 646],
    [BOUNDS.x1, 646],
  ], // centre of the walk
};
const SHORE_Z = 710; // waterline
const WATER_LEVEL = -0.6;
const BEACH = { x0: BOUNDS.x0, x1: BOUNDS.x1, z0: PROMENADE.z1, z1: SHORE_Z, yTop: 0, yWater: WATER_LEVEL };
// suggested pier root: the end of the boulevard (the sea agent owns the pier)
const PIER_ANCHOR = { x: 0, z: PROMENADE.z1, dir: [0, 1] };

// crosswalks: 4 m wide bands continuing the sidewalk loops across a street.
// along: the direction people walk ("x" or "z"); length: kerb to kerb.
const crosswalks = [];
for (let i = 0; i < X_STREETS.length; i++) {
  const zc = X_STREETS[i].z;
  for (const s of Z_STREETS) {
    const h = halfW(s),
      north = s.boulevard || i > 0,
      south = i < X_STREETS.length - 1;
    // across the Z street, on the X street's sidewalk bands
    if (north) crosswalks.push({ x: s.x, z: zc - 9, along: "x", length: 2 * h, width: 4 });
    if (south) crosswalks.push({ x: s.x, z: zc + 9, along: "x", length: 2 * h, width: 4 });
    // across the X street, on the Z street's sidewalk bands
    for (const sg of [-1, 1]) crosswalks.push({ x: s.x + sg * (h + 2), z: zc, along: "z", length: 14, width: 4 });
  }
}

const plazas = [
  { id: "pier-plaza", name: "Pier Plaza", x0: -32, x1: 32, z0: PROMENADE.z0, z1: 664 },
  { id: "civic-plaza", name: "Founders Plaza", x0: -76, x1: -16, z0: 441, z1: 519 },
];

// parking: a = flat lots, garage = the multi-storey with its ramp to the roof (block r2c2)
const GARAGE = {
  x0: -187,
  x1: -151,
  z0: 341,
  z1: 419,
  roof: 7.35, // drivable roof top
  levels: [CURB, 3.75, 7.35],
  // straight ramp from the lot up to the roof, entering it heading +x
  ramp: { x0: -263, x1: -187, z0: 371, z1: 381, y0: CURB, y1: 7.35 },
};
const parking = [
  { id: "garage", name: "Sabal Park Garage", x0: GARAGE.x0, x1: GARAGE.x1, z0: GARAGE.z0, z1: GARAGE.z1, y: GARAGE.roof, multiStorey: true },
  { id: "garage-lot", name: "Garage lot", x0: -269, x1: -187, z0: 341, z1: 419, y: CURB },
  { id: "gas", name: "Pelican Fuel", x0: 16, x1: 80, z0: 241, z1: 293, y: CURB },
  { id: "beach-lot", name: "Beach lot", x0: 151, x1: 211, z0: 581, z1: 619, y: CURB },
];

// teleport: north end of the boulevard, inner southbound lane, facing the sea
const TP = { pos: [-4, 0, 186], heading: 0 };

const CITY = {
  name: "Port Sabal",
  bounds: BOUNDS,
  curb: CURB,
  lane: LANE,
  street: STREET,
  boulevard: BLVD,
  xStreets: X_STREETS,
  zStreets: Z_STREETS,
  streets,
  asphalt,
  medians,
  rows: ROWS,
  cols: COLS,
  blocks,
  crosswalks,
  promenade: PROMENADE,
  shoreZ: SHORE_Z,
  waterLevel: WATER_LEVEL,
  beach: BEACH,
  pierAnchor: PIER_ANCHOR,
  plazas,
  parking,
  garage: GARAGE,
  tp: TP,
};

const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

// helpers
function inTown(x, z, margin = 0) {
  return inRect(BOUNDS, x, z, margin) || inRect(PROMENADE, x, z, margin);
}
function blockAt(x, z) {
  for (const b of blocks) if (inRect(b, x, z)) return b;
  return null;
}
function onRoad(x, z) {
  for (const r of asphalt) if (inRect(r, x, z)) return !medians.some((m) => inRect(m, x, z));
  return false;
}
// street whose carriageway contains (x, z), or null
function streetAt(x, z) {
  for (const s of streets) {
    const h = s.carriage / 2;
    if (s.axis === "x" ? Math.abs(z - s.z) <= h && x >= s.a[0] && x <= s.b[0] : Math.abs(x - s.x) <= h && z >= s.a[1] - 7 && z <= s.b[1] + 7)
      return s;
  }
  return null;
}
// height of the town's flatwork at (x, z): CURB on blocks, medians and the promenade, else 0
function groundHeight(x, z) {
  return blockAt(x, z) || inRect(PROMENADE, x, z) || medians.some((m) => inRect(m, x, z)) ? CURB : 0;
}

export { CITY, CURB, blockAt, groundHeight, inRect, inTown, onRoad, streetAt };
