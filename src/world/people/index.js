// People: buildPeople(scene) adds the crowd and the beach props; call update(dt, time, phys, camera)
// once per frame. Draw calls: people (+ its shadow pass), contact shadows, beach props (+ shadow),
// the volleyball.
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Crowd } from "./crowd.js";
import { buildPlaces, groundAt } from "./places.js";

const TOWEL = [0xe8473c, 0x2f7fd0, 0xf2c13a, 0x1aa39a, 0xf07ba0, 0x7a52b3, 0xff8a3d, 0x3fae5a];
const SHADE = [0xd8302e, 0x1f6fc0, 0xf2b53a, 0x14968f, 0xee6f93, 0xf4f3ee];

// static beach props in one vertex-coloured mesh: towels, umbrellas, the volleyball net
function buildProps(props) {
  const parts = [], m = new Matrix4(), c = new Color();
  const put = (g, color, mat, alt) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute("uv");
    g.applyMatrix4(mat);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c.set(alt && Math.floor(i / 3) % 2 ? alt : color).convertSRGBToLinear();
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    parts.push(g);
  };
  const place = (x, y, z, yaw = 0) => new Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  for (const t of props.towels) {
    const base = place(t.x, t.y, t.z, t.yaw);
    put(new BoxGeometry(0.85, 0.02, 1.85), TOWEL[Math.floor(t.color * TOWEL.length)], m.copy(base).multiply(new Matrix4().makeTranslation(0, 0.01, 0)));
    for (const dz of [-0.55, 0.55]) put(new BoxGeometry(0.86, 0.022, 0.12), 0xf4f3ee, m.copy(base).multiply(new Matrix4().makeTranslation(0, 0.012, dz)));
  }
  for (const u of props.umbrellas) {
    const tilt = new Matrix4().makeRotationZ(0.12).premultiply(place(u.x, u.y, u.z, u.color * 6));
    put(new CylinderGeometry(0.022, 0.022, 2.35, 6), 0xd9d9d6, m.copy(tilt).multiply(new Matrix4().makeTranslation(0, 1.17, 0)));
    put(new ConeGeometry(1.3, 0.42, 10, 1, true), SHADE[Math.floor(u.color * SHADE.length)], m.copy(tilt).multiply(new Matrix4().makeTranslation(0, 2.2, 0)), 0xf4f3ee);
  }
  for (const n of props.nets) {
    for (const s of [-1, 1]) put(new CylinderGeometry(0.045, 0.045, 2.55, 6), 0xe6e6e2, place(n.x, n.y + 1.27, n.z + s * n.half));
    put(new BoxGeometry(0.02, 0.07, n.half * 2), 0xf4f3ee, place(n.x, n.y + 2.4, n.z));
    put(new BoxGeometry(0.012, 0.85, n.half * 2 - 0.1), 0x2a2a2c, place(n.x, n.y + 1.95, n.z));
    for (const s of [-1, 1]) put(new BoxGeometry(8, 0.012, 0.05), 0x2f6fd0, place(n.x, n.y + 0.01, n.z + s * n.half));
  }
  if (!parts.length) return null;
  const mesh = new Mesh(mergeGeometries(parts), new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: 2 }));
  mesh.name = "beach-props";
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function buildPeople(scene, { seed = 7 } = {}) {
  const places = buildPlaces(seed);
  const crowd = new Crowd(scene, places, { seed: seed * 7919 });
  const props = buildProps(places.props);
  if (props) scene.add(props);
  if (crowd.volley) {
    const ball = new Mesh(new SphereGeometry(0.11, 12, 8), new MeshStandardMaterial({ color: 0xf4e04d, roughness: 0.5 }));
    ball.name = "volleyball";
    scene.add(ball);
    crowd.volley.mesh = ball;
  }
  return {
    crowd,
    stats: crowd.stats,
    update: (dt, time, phys, camera) => crowd.update(dt, time, phys, camera),
    // test helper: bring n walkers onto one sidewalk (x = 14, z 250..320: block r1c4, west side)
    gather(x = 14, z = 285, n = 16) {
      const path = { pts: [[x, z - 35], [x, z + 35]], closed: false };
      prep(path);
      crowd.agents.filter((a) => a.kind === "walk").slice(0, n).forEach((a, i) => {
        if (i % 2) {
          a.kind = "stand";
          a.x = a.hx = x + ((i % 4) - 1.5) * 0.9;
          a.z = a.hz = z + (i - n / 2) * 1.6;
          a.yaw = a.hyaw = i * 1.7;
          a.base = [0, 0];
        } else {
          a.path = path;
          a.s = (i / n) * 70;
          a.lane = 0.3 + (i % 3) * 0.5;
          const q = crowd.pathPoint(a);
          a.x = q.x;
          a.z = q.z;
          a.yaw = q.yaw;
        }
        a.y = a.hy = groundAt(a.x, a.z);
        a.react = null;
      });
      return crowd.agents.filter((a) => Math.hypot(a.x - x, a.z - z) < 40).length;
    },
  };
}

function prep(p) {
  const n = p.pts.length;
  p.cum = [0];
  for (let i = 0; i < n - 1; i++) p.cum.push(p.cum[i] + Math.hypot(p.pts[i + 1][0] - p.pts[i][0], p.pts[i + 1][1] - p.pts[i][1]));
  p.len = p.cum[n - 1];
}

export { buildPeople };
