import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  SphereGeometry,
} from "three";
import { tpl, tplMerge } from "./geo.js";

// Prop templates for the town, built once from three.js primitives with a colour and
// (roughness, metalness, signal) per vertex. Templates are stamped into one merged mesh per chunk.
const M = new Matrix4();
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
  M.makeRotationFromEuler(new Euler(rx, ry, rz));
  M.setPosition(x, y, z);
  return g.applyMatrix4(M);
};
const box = (w, h, d, x, y, z, col, r = 0.6, m = 0.1, sig = 0) => tpl(at(new BoxGeometry(w, h, d), x, y, z), col, r, m, sig);
const cyl = (r0, r1, h, x, y, z, col, seg = 8, r = 0.5, m = 0.4, rx = 0, rz = 0) =>
  tpl(at(new CylinderGeometry(r0, r1, h, seg, 1, false), x, y, z, rx, 0, rz), col, r, m);

const POLE = [0.2, 0.22, 0.23],
  DARK = [0.08, 0.085, 0.09],
  SIGY = [0.78, 0.6, 0.08];

// street light: 8 m pole, arm towards +z, lamp head at the end
function streetLight(double = false) {
  const parts = [cyl(0.07, 0.12, 8, 0, 4, 0, POLE, 8), cyl(0.18, 0.2, 0.5, 0, 0.25, 0, POLE, 8)];
  for (const s of double ? [1, -1] : [1]) {
    parts.push(box(0.08, 0.08, 2.2, 0, 7.85, s * 1.1, POLE, 0.5, 0.5));
    parts.push(box(0.34, 0.16, 0.7, 0, 7.8, s * 2.2, POLE, 0.4, 0.5));
    parts.push(box(0.26, 0.03, 0.56, 0, 7.71, s * 2.2, [1, 0.97, 0.88], 0.2, 0));
  }
  return tplMerge(parts);
}

// traffic signal: pole, mast arm along +x, heads facing -z; lenses carry signal codes 1..3
function signalPole(arm) {
  const parts = [cyl(0.12, 0.17, 7, 0, 3.5, 0, DARK, 8, 0.5, 0.5), box(arm, 0.14, 0.12, arm / 2, 6.7, 0, DARK, 0.5, 0.5)];
  for (const f of [0.45, 0.92]) {
    const x = arm * f;
    parts.push(box(0.36, 1.05, 0.28, x, 6.05, 0, SIGY, 0.5, 0.2));
    parts.push(box(0.62, 1.32, 0.03, x, 6.05, 0.16, DARK, 0.7, 0));
    [1, 2, 3].forEach((sig, k) => {
      parts.push(box(0.22, 0.22, 0.05, x, 6.38 - k * 0.33, -0.155, DARK, 0.3, 0, sig));
      parts.push(box(0.3, 0.04, 0.16, x, 6.52 - k * 0.33, -0.2, SIGY, 0.5, 0.2));
    });
  }
  // pedestrian push-button box and a street name blade
  parts.push(box(0.12, 0.18, 0.1, 0, 1.1, -0.15, SIGY, 0.5, 0.2));
  parts.push(box(1.6, 0.28, 0.03, 0.9, 5.4, 0, [0.05, 0.36, 0.2], 0.5, 0.1));
  return tplMerge(parts);
}

// palm trunk: tapered, ringed, gently bent towards +x; returns { geo, top: [x, y, z] }
function palmTrunk(h) {
  const seg = 7,
    rad = 6,
    pos = [],
    nor = [],
    col = [],
    pm = [],
    idx = [];
  const bend = (t) => 0.06 * h * t * t;
  for (let j = 0; j <= seg; j++) {
    const t = j / seg,
      y = t * h,
      r = 0.24 - 0.09 * t,
      band = j % 2 ? 0.86 : 1;
    for (let i = 0; i <= rad; i++) {
      const a = (i / rad) * Math.PI * 2,
        cx = Math.cos(a),
        sz = Math.sin(a);
      pos.push(bend(t) + cx * r, y, sz * r);
      nor.push(cx, 0, sz);
      col.push(0.46 * band, 0.39 * band, 0.31 * band);
      pm.push(0.9, 0, 0);
    }
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < rad; i++) {
      const a = j * (rad + 1) + i,
        b = a + rad + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute("aPM", new BufferAttribute(new Float32Array(pm), 3));
  g.setIndex(idx);
  // crown base: a dark knob of old frond stubs
  const knob = tpl(at(new SphereGeometry(0.42, 6, 4), bend(1), h - 0.1, 0), [0.32, 0.3, 0.18], 0.9, 0);
  return { geo: tplMerge([g, knob]), top: [bend(1), h, 0] };
}

// palm crown: 11 drooping fronds as bent strips with the frond texture (uv), normals up-ish
function palmCrown() {
  const pos = [],
    nor = [],
    uv = [],
    idx = [],
    n = 11,
    segs = 4;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + (f % 2) * 0.2,
      ca = Math.cos(a),
      sa = Math.sin(a),
      len = 3.6 + (f % 3) * 0.5,
      lift = f % 3 === 0 ? 0.55 : 0.25,
      w = 0.75;
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs,
        d = t * len,
        y = lift * t * 2.2 - 1.7 * t * t * t - 0.15 * t;
      for (const side of [-1, 1]) {
        const px = ca * d - sa * side * w * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t + 0.15))),
          pz = sa * d + ca * side * w * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t + 0.15)));
        pos.push(px, y + side * 0.06, pz);
        nor.push(ca * 0.3, 0.95, sa * 0.3);
        uv.push(t, side < 0 ? 0 : 1);
      }
    }
    for (let s = 0; s < segs; s++) {
      const a0 = base + s * 2;
      idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// shade tree (live oak): short trunk and a few lumpy crowns
function shadeTree(seed) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts = [cyl(0.18, 0.3, 3.2, 0, 1.6, 0, [0.33, 0.27, 0.2], 6, 0.9, 0)];
  for (let k = 0; k < 4; k++) {
    const g = new IcosahedronGeometry(1.6 + r() * 0.9, 1),
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 0.85 + 0.3 * Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3 + k) * Math.cos(p.getZ(i) * 2.7);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    const a = (k / 4) * Math.PI * 2 + r(),
      d = k === 0 ? 0 : 1.4;
    const gr = 0.2 + r() * 0.08;
    parts.push(tpl(at(g, Math.cos(a) * d, 4.2 + r() * 1.2 + (k === 0 ? 0.6 : 0), Math.sin(a) * d), [gr * 0.75, gr * 1.35, gr * 0.45], 0.85, 0));
  }
  return tplMerge(parts);
}

function bench() {
  const W = [0.55, 0.38, 0.24],
    parts = [box(1.8, 0.06, 0.45, 0, 0.46, 0, W, 0.8, 0), box(1.8, 0.4, 0.05, 0, 0.75, 0.22, W, 0.8, 0)];
  for (const x of [-0.75, 0.75]) parts.push(box(0.06, 0.46, 0.5, x, 0.23, 0.05, DARK, 0.5, 0.5));
  return tplMerge(parts);
}

function acUnit() {
  return tplMerge([box(2.2, 1.1, 1.6, 0, 0.55, 0, [0.72, 0.73, 0.72], 0.5, 0.3), cyl(0.5, 0.5, 0.06, 0.4, 1.12, 0, [0.25, 0.26, 0.27], 10)]);
}

function gasPump() {
  return tplMerge([
    box(1.0, 0.18, 4.8, 0, 0.09, 0, [0.75, 0.74, 0.7], 0.8, 0),
    box(0.7, 1.8, 0.5, 0, 1.05, -1.2, [0.93, 0.93, 0.92], 0.4, 0.1),
    box(0.72, 0.3, 0.52, 0, 1.75, -1.2, [0.8, 0.12, 0.1], 0.4, 0.1),
    box(0.7, 1.8, 0.5, 0, 1.05, 1.2, [0.93, 0.93, 0.92], 0.4, 0.1),
    box(0.72, 0.3, 0.52, 0, 1.75, 1.2, [0.8, 0.12, 0.1], 0.4, 0.1),
    box(0.4, 0.3, 0.52, 0, 1.3, -1.2, [0.1, 0.12, 0.14], 0.2, 0),
    box(0.4, 0.3, 0.52, 0, 1.3, 1.2, [0.1, 0.12, 0.14], 0.2, 0),
  ]);
}

function antenna(h) {
  return tplMerge([cyl(0.08, 0.2, h, 0, h / 2, 0, [0.6, 0.6, 0.62], 6), box(0.3, 0.3, 0.3, 0, h, 0, [0.9, 0.1, 0.1], 0.4, 0)]);
}

// billboard structure without the ad faces: pole(s), catwalk, frame, grey back; board 12 x 6 m
// centred on x, bottom at y = pole, facing +z
function billboardFrame(pole, roof) {
  const G = [0.45, 0.46, 0.47],
    parts = [];
  if (roof) for (const x of [-4.5, 4.5]) parts.push(box(0.25, pole, 0.25, x, pole / 2, -0.3, G, 0.6, 0.5));
  else parts.push(cyl(0.38, 0.45, pole, 0, pole / 2, -0.4, G, 10, 0.6, 0.5));
  parts.push(box(12.4, 6.4, 0.3, 0, pole + 3, -0.2, [0.55, 0.56, 0.57], 0.7, 0.3));
  parts.push(box(12.6, 0.1, 1.0, 0, pole - 0.15, 0.3, G, 0.6, 0.5));
  return tplMerge(parts);
}

function fountain() {
  return tplMerge([
    cyl(5, 5.2, 0.7, 0, 0.35, 0, [0.82, 0.78, 0.7], 24, 0.8, 0),
    cyl(4.6, 4.6, 0.06, 0, 0.62, 0, [0.16, 0.42, 0.5], 24, 0.08, 0.3),
    cyl(0.5, 0.7, 2.2, 0, 1.1, 0, [0.82, 0.78, 0.7], 10, 0.8, 0),
    cyl(1.6, 1.4, 0.3, 0, 2.2, 0, [0.82, 0.78, 0.7], 16, 0.8, 0),
    cyl(0.25, 0.4, 1.2, 0, 2.9, 0, [0.85, 0.92, 0.95], 8, 0.1, 0.2),
  ]);
}

function railing(len) {
  const parts = [box(len, 0.06, 0.06, 0, 1.0, 0, [0.9, 0.9, 0.88], 0.4, 0.5), box(len, 0.05, 0.05, 0, 0.55, 0, [0.9, 0.9, 0.88], 0.4, 0.5)];
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 2) parts.push(box(0.06, 1.0, 0.06, x, 0.5, 0, [0.9, 0.9, 0.88], 0.4, 0.5));
  return tplMerge(parts);
}

export { acUnit, antenna, bench, billboardFrame, box, cyl, fountain, gasPump, palmCrown, palmTrunk, railing, shadeTree, signalPole, streetLight };
