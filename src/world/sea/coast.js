// The coast in one place: the beach and seabed profile, the swell, the pier footprint. Shared by the
// sand mesh, the water shader (COAST_GLSL mirrors seabedY and swell), the car physics hook and the
// props. Town-side values come from the city layout. Plain data plus helpers, no three.js, so the
// people/minimap code and node tools can import it too.
import { CITY } from "../city/layout.js";

const plaza = CITY.plazas.find((p) => p.id === "pier-plaza");
const ocean = CITY.xStreets.find((s) => s.name === "Ocean Dr");

const COAST = {
  waterY: CITY.waterLevel, // still water level
  shoreZ: CITY.shoreZ, // waterline
  sandZ: CITY.beach.z0, // sea edge of the promenade paving, the sand starts here
  sandY: CITY.beach.yTop,
  groundEndZ: CITY.beach.z0 - 1, // the ground plane (ground.js) stops under the paving edge
  waterStartZ: CITY.beach.z0 + 20, // the water mesh starts under the dry sand
  promenadeZ: CITY.promenade.line[0][1],
  roadZ: ocean ? ocean.z : CITY.promenade.z0 - 7, // Ocean Dr centre line
  roadHalf: CITY.street.carriage / 2,
  townX0: CITY.bounds.x0,
  townX1: CITY.bounds.x1,
};

// Seabed beyond the waterline: [z, y] knots, piecewise linear. Two sandbars (Galveston has a few)
// give the turquoise bands and the lines of breakers. Up to the waterline the beach is the straight
// slope of the city layout (sand start at y 0 down to the water).
const BED = [
  [0, 0],
  [12, -0.34],
  [26, -0.72],
  [36, -0.42],
  [48, -1.02],
  [68, -1.72],
  [86, -1.32],
  [105, -2.2],
  [170, -3.4],
  [350, -5.9],
  [850, -11.4],
  [5300, -13.4],
].map(([dz, dy]) => [COAST.shoreZ + dz, COAST.waterY + dy]);

// the bars meander along the shore (not at the waterline, which stays put)
const bend = (x) => 6 * Math.sin(0.0047 * x + 0.5) + 3 * Math.sin(0.013 * x + 2.0);

// height of the sand / seabed at (x, z), for z past the start of the sand
function seabedY(x, z) {
  const { sandZ, sandY, shoreZ, waterY } = COAST;
  if (z <= shoreZ) return sandY + ((waterY - sandY) * (z - sandZ)) / (shoreZ - sandZ);
  z -= Math.min(1, (z - shoreZ) / 20) * bend(x);
  for (let i = 1; i < BED.length; i++)
    if (z < BED[i][0])
      return BED[i - 1][1] + ((BED[i][1] - BED[i - 1][1]) * (z - BED[i - 1][0])) / (BED[i][0] - BED[i - 1][0]);
  return BED[BED.length - 1][1];
}

// Three swell trains rolling in towards the beach (-z):
// direction x, direction z, wavenumber (rad/m), amplitude (m), angular speed (rad/s), phase
const SWELL = [
  [0.12, -0.993, 0.165, 0.1, 1.27, 0.0],
  [-0.3, -0.954, 0.273, 0.06, 1.64, 1.3],
  [0.45, -0.893, 0.483, 0.03, 2.17, 4.1],
];
// swell height and slope at (x, z); fades out over the shallows like the shader does
function swellAt(x, z, t, out = { h: 0, sx: 0, sz: 0 }) {
  out.h = out.sx = out.sz = 0;
  for (const [dx, dz, k, a, w, ph] of SWELL) {
    const th = k * (dx * x + dz * z) - w * t + ph,
      c = Math.cos(th);
    (out.h += a * Math.sin(th)), (out.sx += a * k * c * dx), (out.sz += a * k * c * dz);
  }
  const d = COAST.waterY - seabedY(x, z),
    f = Math.min(1, Math.max(0, (d - 0.4) / 2.1));
  (out.h *= f), (out.sx *= f), (out.sz *= f);
  return out;
}

// The pier: from the sea edge of the pier plaza straight out to a T-head. The deck ramps up from the
// plaza paving to deckY, the first stretch is a solid embankment, then it stands on pilings.
const PIER = {
  x: CITY.pierAnchor.x,
  z0: plaza ? plaza.z1 : COAST.sandZ,
  y0: CITY.curb,
  deckY: 2.2,
  half: 6, // half width of the walkway
  width: 12,
  z1: 880, // the walkway ends, the T-head starts
  head: { x0: -30, x1: 30, z0: 880, z1: 950 }, // x relative to PIER.x
};
PIER.rampZ = PIER.z0 + 40; // the deck reaches deckY here
PIER.solidZ = PIER.z0 + 30; // end of the embankment; past it a car fits under the deck

// height of the pier deck at (x, z), or null off the pier
function deckHeight(x, z) {
  const dx = x - PIER.x,
    h = PIER.head;
  const on = (Math.abs(dx) <= PIER.half && z >= PIER.z0 && z <= PIER.z1) || (dx >= h.x0 && dx <= h.x1 && z >= h.z0 && z <= h.z1);
  if (!on) return null;
  return z >= PIER.rampZ ? PIER.deckY : PIER.y0 + ((PIER.deckY - PIER.y0) * (z - PIER.z0)) / (PIER.rampZ - PIER.z0);
}

const f = (v) => (+v).toFixed(5);
const COAST_GLSL = /* glsl */ `
#define WATER_Y ${f(COAST.waterY)}
#define SHORE_Z ${f(COAST.shoreZ)}
#define SAND_Z ${f(COAST.sandZ)}
#define SAND_Y ${f(COAST.sandY)}
const float BED_Z[${BED.length}] = float[${BED.length}](${BED.map((b) => f(b[0])).join(", ")});
const float BED_Y[${BED.length}] = float[${BED.length}](${BED.map((b) => f(b[1])).join(", ")});
float seabedY(vec2 p){
  float z = p.y;
  if (z <= SHORE_Z) return SAND_Y + (WATER_Y - SAND_Y) * (z - SAND_Z) / (SHORE_Z - SAND_Z);
  z -= min(1.0, (z - SHORE_Z) / 20.0) * (6.0 * sin(0.0047 * p.x + 0.5) + 3.0 * sin(0.013 * p.x + 2.0));
  for (int i = 1; i < ${BED.length}; i++)
    if (z < BED_Z[i]) return mix(BED_Y[i - 1], BED_Y[i], (z - BED_Z[i - 1]) / (BED_Z[i] - BED_Z[i - 1]));
  return BED_Y[${BED.length - 1}];
}
// swell: height in z, slope (dh/dx, dh/dz) in xy, before the shallows fade
vec3 swell(vec2 p, float t){
  vec3 r = vec3(0.0);
  float th;
${SWELL.map(
  ([dx, dz, k, a, w, ph]) =>
    `  th = ${f(k)} * (${f(dx)} * p.x + ${f(dz)} * p.y) - ${f(w)} * t + ${f(ph)};\n  r += vec3(${f(a * k * dx)} * cos(th), ${f(a * k * dz)} * cos(th), ${f(a)} * sin(th));`,
).join("\n")}
  return r;
}
// slow run-up and backwash along the beach
float swash(float x, float t){
  return 0.035 * sin(0.55 * t + 0.019 * x) + 0.02 * sin(0.93 * t - 0.043 * x + 1.7) + 0.012 * sin(1.7 * t + 0.11 * x + 0.4);
}
// water surface: height offset in z, slope in xy; camera-distance fade for the vertex swell
vec3 waterSurface(vec2 p, float t, float camDist){
  float depth = WATER_Y - seabedY(p);
  float fade = clamp((depth - 0.4) / 2.1, 0.0, 1.0) * (1.0 - smoothstep(90.0, 280.0, camDist));
  vec3 s = swell(p, t) * fade;
  s.z += swash(p.x, t) * (1.0 - smoothstep(0.6, 2.2, depth));
  return s;
}
`;

export { BED, COAST, COAST_GLSL, PIER, SWELL, deckHeight, seabedY, swellAt };
