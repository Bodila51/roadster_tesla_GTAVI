// Where the people are: town sidewalks and plazas (city layout), the promenade, the beach, the pier
// and the spectators behind the barriers at the lineup stage. Pure data; crowd.js brings it to life.
import { CITY, groundHeight, inTown } from "../city/layout.js";
import { WORLD } from "../layout.js";
import { makeLook, rng } from "./looks.js";

// sand, seabed and pier deck come from the sea agent's data
import { PIER, deckY, sandY } from "../sea/layout.js";
const B = CITY.beach;
function groundAt(x, z) {
  const d = deckY(x, z);
  if (d !== null) return d;
  if (z > B.z0 && x >= B.x0 - 40 && x <= B.x1 + 40) return sandY(x, z);
  if (inTown(x, z, 2)) return groundHeight(x, z);
  return 0;
}

const ZONE_W = { downtown: 6, civic: 5, shops: 4, hotel: 4, apartments: 3, motel: 2, gas: 1, garage: 1, house: 1, verge: 0 };

function buildPlaces(seed = 7) {
  const r = rng(seed);
  const people = [];
  const props = { towels: [], umbrellas: [], nets: [], ball: null };
  const add = (p) => (people.push(p), p);
  const look = (style, who) => makeLook(r, style, who);
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;

  // sidewalks: walkers loop around their block, keeping to the right; some walk in pairs
  for (const b of CITY.blocks) {
    const w = ZONE_W[b.zone] || 0;
    const cx = (b.x0 + b.x1) / 2;
    const n = Math.round(w * (Math.abs(cx) < 200 ? 0.55 : 0.3) * (0.7 + r() * 0.6));
    const path = { pts: b.walk, closed: true };
    for (let i = 0; i < n; i++) {
      const s = r(), dir = r() < 0.5 ? 1 : -1, speed = 1.15 + r() * 0.45, lane = 0.35 + r() * 0.9;
      const p = add({ kind: "walk", path, s, dir, speed, lane, look: look("town") });
      if (r() < 0.2) add({ kind: "walk", path, s, dir, speed, lane: lane + 0.6, look: look("town"), friend: p });
    }
  }
  // plazas: chatting groups
  const group = (cx, cz, n, style, y0) => {
    const a0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.4, rad = 0.65 + n * 0.12;
      const x = cx + Math.sin(a) * rad, z = cz + Math.cos(a) * rad;
      add({ kind: "stand", x, z, yaw: yawTo(x, z, cx, cz) + (r() - 0.5) * 0.4, look: look(style), y: y0 });
    }
  };
  const civic = CITY.plazas.find((p) => p.id === "civic-plaza");
  if (civic) {
    for (let i = 0; i < 3; i++) group(civic.x0 + 12 + r() * 36, civic.z0 + 12 + r() * 54, 2 + Math.floor(r() * 3), "town");
    const path = { pts: [[civic.x0 + 6, civic.z0 + 6], [civic.x1 - 6, civic.z0 + 6], [civic.x1 - 6, civic.z1 - 6], [civic.x0 + 6, civic.z1 - 6]], closed: true };
    for (let i = 0; i < 4; i++) add({ kind: "walk", path, s: r(), dir: r() < 0.5 ? 1 : -1, speed: 1.1 + r() * 0.3, lane: 0.3 + r() * 2, look: look("town") });
  }
  // promenade: several lanes, busiest around the pier plaza, plus joggers and people at the sea rail
  const P = CITY.promenade;
  const lanes = [P.z0 + 3.5, P.z0 + 7.5, P.z0 + 11.5, P.z0 + 15.5];
  for (let i = 0; i < 34; i++) {
    const z = lanes[i % lanes.length];
    const x = Math.max(P.x0 + 5, Math.min(P.x1 - 5, gauss() * 190));
    const path = { pts: [[P.x0 + 4, z], [P.x1 - 4, z]], closed: false };
    const jog = r() < 0.1;
    const p = add({ kind: "walk", path, s: (x - P.x0 - 4) / (P.x1 - P.x0 - 8), dir: r() < 0.5 ? 1 : -1, speed: jog ? 2.9 + r() * 0.6 : 1.05 + r() * 0.4, lane: (r() - 0.5) * 1.6, look: look("promenade"), jog });
    if (!jog && r() < 0.3) add({ kind: "walk", path, s: p.s, dir: p.dir, speed: p.speed, lane: p.lane + 0.6, look: look("promenade"), friend: p });
  }
  for (let i = 0; i < 12; i++) {
    const x = gauss() * 150, z = P.z1 - 0.7;
    if (Math.abs(x - PIER.x) < PIER.width) continue;
    add({ kind: "stand", x, z, yaw: (r() - 0.5) * 0.8, look: look("promenade"), phoneUse: r() < 0.3 ? 1 : 0 });
  }
  // pier plaza: groups near the pier root
  const pp = CITY.plazas.find((p) => p.id === "pier-plaza");
  if (pp) for (let i = 0; i < 4; i++) group(pp.x0 + 6 + r() * (pp.x1 - pp.x0 - 12), pp.z0 + 4 + r() * 10, 2 + Math.floor(r() * 2), "promenade");
  // pier: strollers in the middle of the walkway, people browsing the stalls along its edges,
  // and people looking out to sea from the west half of the T-head (the Ferris wheel is east)
  {
    const path = { pts: [[PIER.x, PIER.z0 + 1], [PIER.x, PIER.z1 - 2]], closed: false };
    for (let i = 0; i < 10; i++) add({ kind: "walk", path, s: r(), dir: r() < 0.5 ? 1 : -1, speed: 1.0 + r() * 0.35, lane: 0.4 + r() * 1.2, look: look("promenade") });
    for (let i = 0; i < 8; i++) {
      const sd = r() < 0.5 ? 1 : -1, z = PIER.z0 + 45 + r() * (PIER.z1 - PIER.z0 - 50);
      add({ kind: "stand", x: PIER.x + sd * (2.3 + r() * 0.5), z, yaw: (sd * Math.PI) / 2 + (r() - 0.5) * 0.8, look: look("promenade"), phoneUse: r() < 0.3 ? 1 : 0 });
    }
    const h = PIER.head;
    for (let i = 0; i < 6; i++)
      add({ kind: "stand", x: PIER.x + h.x0 + 3 + r() * 22, z: h.z1 - 0.8 - r() * 1.5, yaw: (r() - 0.5) * 0.6, look: look("promenade"), phoneUse: r() < 0.3 ? 1 : 0 });
  }
  // beach: towels under umbrellas, people lying or sitting on them
  const spots = [];
  for (let i = 0; i < 12; i++) {
    let x, z, ok, tries = 0;
    do {
      x = gauss() * 170;
      z = 668 + r() * 30;
      ok = Math.abs(x - PIER.x) > PIER.half + 7 && Math.abs(x - 120) > 14 && spots.every((s) => Math.hypot(s[0] - x, s[1] - z) > 9);
    } while (!ok && ++tries < 30);
    if (!ok) continue;
    spots.push([x, z]);
    const yaw = (r() - 0.5) * 0.5 + (r() < 0.5 ? 0 : Math.PI);
    props.umbrellas.push({ x, z, y: sandY(x, z), color: r() });
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const ox = (k - (n - 1) / 2) * 1.25 + (r() - 0.5) * 0.2, oz = (r() - 0.5) * 0.6;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const tx = x + ox * c + oz * s, tz = z - ox * s + oz * c, ty = yaw + (r() - 0.5) * 0.15;
      props.towels.push({ x: tx, z: tz, y: sandY(tx, tz), yaw: ty, color: r() });
      const lie = r() < 0.6;
      const lk = look("beach", r() < 0.12 ? "k" : undefined);
      // lying people put their feet at the towel's foot end; sitters sit near the middle
      const fx = tx + Math.sin(ty) * 0.9, fz = tz + Math.cos(ty) * 0.9;
      if (lie) add({ kind: "lie", x: fx, z: fz, yaw: ty, look: lk, aux: r() });
      else add({ kind: "sit", x: tx - Math.sin(ty) * 0.2, z: tz - Math.cos(ty) * 0.2, yaw: ty, look: lk, aux: r() });
    }
  }
  // beach volleyball, the net parallel to the shore line
  {
    const cx = 120, cz = 683;
    props.nets.push({ x: cx, z: cz, y: sandY(cx, cz), half: 4.5 });
    props.ball = { x: cx, z: cz };
    const pos = [[-3, -2], [-5.5, 1.8], [-2.5, 2.4], [3, 2], [5.5, -1.8], [2.6, -2.3]];
    pos.forEach(([dx, dz], i) => {
      const x = cx + dx, z = cz + dz;
      add({ kind: "volley", x, z, yaw: dx < 0 ? Math.PI / 2 : -Math.PI / 2, look: look("beach"), team: dx < 0 ? 0 : 1, slot: i });
    });
  }
  // the shallows, and a few people strolling on the wet sand
  for (let i = 0; i < 7; i++) {
    const x = gauss() * 110, z = CITY.shoreZ + 3 + r() * 9;
    if (Math.abs(x - PIER.x) < PIER.width) continue;
    add({ kind: "wade", x, z, yaw: Math.PI + (r() - 0.5) * 2.4, look: look("beach") });
  }
  {
    const path = { pts: [[-300, CITY.shoreZ - 4], [300, CITY.shoreZ - 4]], closed: false };
    for (let i = 0; i < 6; i++) add({ kind: "walk", path, s: 0.5 + gauss() * 0.3, dir: r() < 0.5 ? 1 : -1, speed: 0.9 + r() * 0.35, lane: (r() - 0.5) * 2, look: look("beach") });
  }
  // the stage crowd behind the barriers in front of the lineup
  {
    const zb = WORLD.lineup.z + 26, sx = WORLD.lineup.x, sz = WORLD.lineup.z;
    const poles = [[70, -10], [150, -12]];
    for (const [xa, xb] of [[50, 84], [136, 170]]) {
      for (let row = 0; row < 3; row++) {
        let x = xa + r() * 0.8;
        while (x < xb) {
          const z = zb + 1.05 + row * 0.95 + (r() - 0.5) * 0.3;
          const gap = row === 0 ? 0.62 : 0.85;
          if (poles.every(([px, pz]) => Math.hypot(px - x, pz - z) > 1.6) && (row < 2 || r() < 0.6)) {
            const near = 1 - Math.min(1, Math.abs(x - sx) / 60);
            if (r() < 0.55 + near * 0.4)
              add({ kind: "stand", x, z, yaw: yawTo(x, z, sx, sz) + (r() - 0.5) * 0.35, look: look("fan"), fan: true, phoneUse: r() < 0.25 ? 1 : 0 });
          }
          x += gap + r() * 0.5;
        }
      }
    }
  }
  for (const p of people) {
    if (p.y === undefined && p.x !== undefined) p.y = groundAt(p.x, p.z);
  }
  return { people, props };
}

export { buildPlaces, groundAt, PIER, sandY };
