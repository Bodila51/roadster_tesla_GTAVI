// Where the missions and the 2-minute-run letters are, for the minimap, the
// target arrow and the tutorial. This is the one place to swap the source.
//
// Preferred source: the rules module's `game.targets()`, which returns
//   { missions: [{ id, name, done, pos: {x,y,z} | null }],
//     letters:  [{ letter, index, got, pos: {x,y,z} }] }   (letters: [] outside a run)
// Until that exists, positions are derived from src/world/layout.js, the ring
// course and the lineup boxes that the game state already holds.
import { MISSIONS } from "../game/missions.js";
import { WORLD } from "../world/layout.js";

const v = (x, y, z) => ({ x, y, z });

// Fallback spots. null = can be done anywhere (not drawn, never the arrow target).
const SPOTS = {
  launch: null,
  wall: () => v(WORLD.ramp.x, 0, WORLD.ramp.z),
  reveal: () => v(WORLD.ramp.x, 0, WORLD.ramp.z),
  lineup: () => v(WORLD.lineup.x, 0, WORLD.lineup.z),
  semiflip: (g) => semi(g),
  double: null,
  hang: () => v(WORLD.massdriver.x, 0, WORLD.massdriver.z),
  vmax: (g, car) =>
    v(Math.max(-1100, Math.min(1100, car ? car.x : 0)), 0, WORLD.runwayZ),
  rings: (g, car) => nearestRing(g, car),
  smoke: () => v(WORLD.donut.x, 0, WORLD.donut.z),
  roof: (g) => semi(g),
  pipe: () => v(WORLD.halfpipe.x, 0, WORLD.halfpipe.z),
  loop: () => v(WORLD.loop.x, 0, WORLD.loop.z - 2),
  bullseye: () => v(WORLD.massdriver.x, 0, WORLD.massdriver.z),
};

// The Semi's roof (lineup box "semi"), or the lineup centre.
function semi(g) {
  const b = g && g.lineup && g.lineup.boxes && g.lineup.boxes.find((x) => x.name === "semi");
  if (b) return v((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
  return v(WORLD.lineup.x, 4.2, WORLD.lineup.z);
}

function nearestRing(g, car) {
  const rings = (g && g.rings) || [];
  const got = (g && g.ringsGot) || new Set();
  let best = null,
    bd = Infinity;
  for (const r of rings) {
    if (got.has(r.i)) continue;
    const d = car ? Math.hypot(r.center.x - car.x, r.center.z - car.z) : 0;
    if (d < bd) (bd = d), (best = r.center);
  }
  return best ? v(best.x, best.y, best.z) : null;
}

function plain(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z)
    ? v(+p.x, Number.isFinite(p.y) ? +p.y : 0, +p.z)
    : null;
}

/** World positions of missions and letters. `car` is the car position ({x,z}). */
export function getTargets(game, car) {
  if (game && typeof game.targets === "function") {
    try {
      const t = game.targets();
      if (t && Array.isArray(t.missions))
        return {
          source: "rules",
          missions: t.missions.map((m) => ({
            id: String(m.id),
            name: String(m.name || m.id).toUpperCase(),
            done: !!m.done,
            pos: plain(m.pos),
          })),
          letters: (Array.isArray(t.letters) ? t.letters : []).map((l, i) => ({
            letter: String(l.letter || "?").slice(0, 2),
            index: Number.isFinite(l.index) ? l.index : i,
            got: !!l.got,
            pos: plain(l.pos),
          })),
        };
    } catch {
      /* fall through to the layout fallback */
    }
  }
  const done = (game && game.done) || new Set();
  return {
    source: "layout",
    missions: MISSIONS.map((m) => {
      const f = SPOTS[m.id];
      return { id: m.id, name: m.name, done: done.has(m.id), pos: f ? f(game, car) : null };
    }),
    letters: [],
  };
}

/** Is the 2-minute run active? (rules module: game.mode === "run") */
export function runActive(game) {
  return !!game && game.mode === "run";
}

/** Fixed spot of the Semi roof, used by the tutorial. */
export function semiSpot(game) {
  return semi(game);
}
