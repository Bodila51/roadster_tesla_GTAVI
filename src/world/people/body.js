// One low-poly person, built in code (no downloads). The same builder runs for a man, a woman and
// a kid with identical topology, so the woman and kid shapes are stored as per-vertex deltas
// (aFem, aKid) that the vertex shader blends per instance. Every vertex is bound to one bone
// (aInfo.x), tagged with a colour region (aInfo.y), an accessory part that instances switch on or
// off (aInfo.z) and a girth weight (aInfo.w).
//
// Rest pose: facing +z, +x is the person's left, y up, feet on y = 0.
// Bones (each turns about its own joint): 0 pelvis (root), 1 torso (waist), 2 head (neck),
// 3/4 left upper arm/forearm, 5/6 right upper arm/forearm, 7/8 left thigh/shin, 9/10 right.
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from "three";

const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];
// colour regions (the shader maps them to the instance's outfit)
const REG = {
  skin: 0, bust: 1, belly: 2, sleeve: 3, forearm: 4, hips: 5, thigh: 6, knee: 7, shin: 8,
  shoe: 9, hair: 10, hat: 11, phone: 12, screen: 13, eye: 14, skirt: 15, shades: 16, chest: 17,
};
// accessory parts (0 = always shown)
const PART = { body: 0, hair: 1, longHair: 2, bun: 3, dome: 4, capBrim: 5, hatBrim: 6, phone: 7, shades: 8, skirt: 9 };

// body shapes: joints and cross-sections in metres
const SHAPES = {
  m: {
    ankle: 0.085, knee: 0.5, hipX: 0.092, hip: 0.93, waist: 1.06, shX: 0.185, sh: 1.455, elbow: 1.17, wrist: 0.905, neck: 1.5,
    head: [0, 1.645, 0.012], headR: [0.079, 0.114, 0.097],
    // y, half width, half depth, z offset
    torso: [[0.86, 0.12, 0.095, -0.005], [0.93, 0.163, 0.11, -0.01], [1.0, 0.158, 0.105, -0.004], [1.06, 0.15, 0.1, 0.002],
      [1.17, 0.158, 0.108, 0.006], [1.3, 0.176, 0.12, 0.012], [1.4, 0.182, 0.106, 0.004], [1.465, 0.15, 0.085, 0], [1.512, 0.066, 0.06, 0]],
    arm: [0.05, 0.046, 0.041, 0.039, 0.038, 0.027], leg: [0.09, 0.084, 0.064, 0.053, 0.05, 0.056, 0.034],
    ball: 0.056, neckR: 0.052, hand: [0.022, 0.066, 0.043], foot: [0.1, 0.08, 0.265], skirt: [0.165, 0.18, 0.21, 0.17],
  },
  f: {
    ankle: 0.08, knee: 0.47, hipX: 0.088, hip: 0.865, waist: 0.985, shX: 0.163, sh: 1.355, elbow: 1.09, wrist: 0.84, neck: 1.4,
    head: [0, 1.536, 0.01], headR: [0.075, 0.108, 0.093],
    torso: [[0.8, 0.12, 0.095, -0.01], [0.87, 0.176, 0.12, -0.016], [0.93, 0.152, 0.106, -0.01], [0.985, 0.122, 0.09, 0],
      [1.09, 0.132, 0.095, 0.005], [1.2, 0.147, 0.127, 0.024], [1.29, 0.151, 0.1, 0.01], [1.367, 0.13, 0.08, 0], [1.408, 0.057, 0.053, 0]],
    arm: [0.043, 0.04, 0.035, 0.033, 0.032, 0.023], leg: [0.09, 0.085, 0.062, 0.049, 0.046, 0.05, 0.031],
    ball: 0.048, neckR: 0.045, hand: [0.019, 0.06, 0.038], foot: [0.088, 0.075, 0.235], skirt: [0.14, 0.19, 0.215, 0.175],
  },
  k: {
    ankle: 0.06, knee: 0.34, hipX: 0.068, hip: 0.625, waist: 0.71, shX: 0.128, sh: 0.99, elbow: 0.81, wrist: 0.63, neck: 1.03,
    head: [0, 1.132, 0.01], headR: [0.073, 0.099, 0.089],
    torso: [[0.575, 0.094, 0.074, -0.005], [0.63, 0.12, 0.087, -0.008], [0.67, 0.117, 0.085, -0.004], [0.71, 0.112, 0.083, 0],
      [0.8, 0.117, 0.088, 0.004], [0.88, 0.124, 0.09, 0.006], [0.945, 0.127, 0.084, 0.003], [0.995, 0.108, 0.068, 0], [1.035, 0.048, 0.046, 0]],
    arm: [0.036, 0.033, 0.029, 0.028, 0.027, 0.02], leg: [0.068, 0.064, 0.05, 0.041, 0.039, 0.042, 0.026],
    ball: 0.04, neckR: 0.038, hand: [0.016, 0.05, 0.032], foot: [0.075, 0.065, 0.19], skirt: [0.115, 0.135, 0.16, 0.13],
  },
};

function joints(S) {
  const J = [
    [0, S.hip, 0], [0, S.waist, 0], [0, S.neck - 0.01, -0.005],
    [S.shX, S.sh, 0], [S.shX + 0.012, S.elbow, -0.012], [-S.shX, S.sh, 0], [-S.shX - 0.012, S.elbow, -0.012],
    [S.hipX, S.hip, 0], [S.hipX + 0.004, S.knee, 0.008], [-S.hipX, S.hip, 0], [-S.hipX - 0.004, S.knee, 0.008],
  ];
  return J;
}

class Mesher {
  constructor() {
    this.p = [];
    this.n = [];
    this.info = [];
    this.ix = [];
  }
  vert(p, n, bone, reg, part, g) {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0] / l, n[1] / l, n[2] / l);
    this.info.push(bone, reg, part, g);
    return this.p.length / 3 - 1;
  }
  // triangles face the way their vertex normals point
  tri(a, b, c) {
    const P = this.p, N = this.n;
    const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const s = fx * (N[3 * a] + N[3 * b] + N[3 * c]) + fy * (N[3 * a + 1] + N[3 * b + 1] + N[3 * c + 1]) + fz * (N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2]);
    if (s < 0) this.ix.push(a, c, b);
    else this.ix.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// rings: {c, rx, rz, bone, g}; regs: one region per band; caps: [bottomRegion|null, topRegion|null]
function tube(M, rings, regs, segs, part, caps = [null, null]) {
  const n = rings.length;
  const frames = rings.map((r, i) => {
    const a = nrm(sub(rings[Math.min(n - 1, i + 1)].c, rings[Math.max(0, i - 1)].c));
    let u = [1 - a[0] * a[0], -a[0] * a[1], -a[0] * a[2]];
    u = nrm(u);
    const w = cross(u, a);
    const r0 = rings[Math.max(0, i - 1)], r1 = rings[Math.min(n - 1, i + 1)];
    const ds = Math.hypot(...sub(r1.c, r0.c)) || 1;
    const slope = ((r1.rx + r1.rz) - (r0.rx + r0.rz)) / 2 / ds;
    return { a, u, w, slope };
  });
  const ring = (i, reg) => {
    const r = rings[i], f = frames[i], out = [];
    for (let s = 0; s < segs; s++) {
      const t = (s / segs) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      const p = [0, 1, 2].map((k) => r.c[k] + f.u[k] * r.rx * c + f.w[k] * r.rz * sn);
      const nr = nrm([0, 1, 2].map((k) => (f.u[k] * c) / r.rx + (f.w[k] * sn) / r.rz));
      const nn = [0, 1, 2].map((k) => nr[k] - f.a[k] * f.slope);
      out.push(M.vert(p, nn, r.bone, reg, part, r.g || 0));
    }
    return out;
  };
  let prev = null, prevReg = -1, first = null;
  for (let b = 0; b < n - 1; b++) {
    const reg = regs[b];
    const lo = prev && prevReg === reg ? prev : ring(b, reg);
    const hi = ring(b + 1, reg);
    if (!first) first = lo;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      M.quad(lo[s], lo[s1], hi[s1], hi[s]);
    }
    prev = hi;
    prevReg = reg;
  }
  const cap = (i, reg, sign) => {
    const r = rings[i], f = frames[i];
    const ids = ring(i, reg);
    const c = M.vert(r.c, f.a.map((v) => v * sign), r.bone, reg, part, r.g || 0);
    for (let s = 0; s < segs; s++) M.tri(c, ids[s], ids[(s + 1) % segs]);
  };
  if (caps[0] !== null) cap(0, caps[0], -1);
  if (caps[1] !== null) cap(n - 1, caps[1], 1);
}

// ellipsoid (or a cap of one): polar angle from the top, azimuth 0 = front (+z), pi/2 = left (+x)
function ellipsoid(M, c, r, segU, segV, bone, reg, part, opt = {}) {
  const tmax = opt.thetaMax || (() => Math.PI);
  const full = !opt.thetaMax;
  const rot = opt.pitch || 0, cr = Math.cos(rot), sr = Math.sin(rot);
  const put = (d) => {
    // d: unit direction; point and normal, optionally pitched about x
    let p = [d[0] * r[0], d[1] * r[1], d[2] * r[2]];
    let n = [d[0] / r[0], d[1] / r[1], d[2] / r[2]];
    if (opt.shape) [p, n] = opt.shape(p, n, d);
    if (rot) {
      p = [p[0], p[1] * cr - p[2] * sr, p[1] * sr + p[2] * cr];
      n = [n[0], n[1] * cr - n[2] * sr, n[1] * sr + n[2] * cr];
    }
    return M.vert([c[0] + p[0], c[1] + p[1], c[2] + p[2]], n, bone, reg, part, opt.g || 0);
  };
  const top = put([0, 1, 0]);
  const rows = [];
  const nRows = full ? segV - 1 : segV;
  for (let v = 1; v <= nRows; v++) {
    const row = [];
    for (let u = 0; u < segU; u++) {
      const ph = (u / segU) * Math.PI * 2;
      const th = (v / segV) * tmax(ph);
      row.push(put([Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)]));
    }
    rows.push(row);
  }
  for (let u = 0; u < segU; u++) M.tri(top, rows[0][u], rows[0][(u + 1) % segU]);
  for (let v = 0; v < rows.length - 1; v++)
    for (let u = 0; u < segU; u++) {
      const u1 = (u + 1) % segU;
      M.quad(rows[v][u], rows[v][u1], rows[v + 1][u1], rows[v + 1][u]);
    }
  if (full) {
    const bot = put([0, -1, 0]);
    const last = rows[rows.length - 1];
    for (let u = 0; u < segU; u++) M.tri(bot, last[u], last[(u + 1) % segU]);
  }
}

// box with flat faces; faceReg(i) for faces +x,-x,+y,-y,+z,-z; shape(p) may move corners
function box(M, c, s, bone, faceReg, part, shape) {
  const h = [s[0] / 2, s[1] / 2, s[2] / 2];
  const faces = [
    [0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1],
  ];
  faces.forEach(([ax, sg], fi) => {
    const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, ids = [];
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0];
      p[ax] = sg * h[ax];
      p[a1] = u * h[a1];
      p[a2] = v * h[a2];
      const q = shape ? shape(p) : p;
      const n = [0, 0, 0];
      n[ax] = sg;
      ids.push(M.vert([c[0] + q[0], c[1] + q[1], c[2] + q[2]], n, bone, faceReg(fi), part, 0));
    }
    M.quad(ids[0], ids[1], ids[2], ids[3]);
  });
}

function buildShape(S) {
  const M = new Mesher();
  const J = joints(S);
  const R = REG, P = PART;
  // torso + pelvis: one loft; rings below the waist ride the pelvis
  const gT = [0.7, 0.8, 0.9, 1, 1, 0.7, 0.45, 0.2, 0];
  const torso = S.torso.map(([y, rx, rz, zo], i) => ({ c: [0, y, zo], rx, rz, bone: y < S.waist - 1e-4 ? 0 : 1, g: gT[i] }));
  tube(M, torso, [R.hips, R.hips, R.hips, R.belly, R.bust, R.chest, R.chest, R.chest], 12, P.body, [R.hips, R.chest]);
  // neck and head
  const H = S.head, HR = S.headR;
  tube(M, [
    { c: [0, S.neck - 0.05, -0.006], rx: S.neckR, rz: S.neckR * 0.95, bone: 2 },
    { c: [0, H[1] - 0.05, -0.01], rx: S.neckR * 0.9, rz: S.neckR * 0.88, bone: 2 },
  ], [R.skin], 8, P.body);
  ellipsoid(M, H, HR, 10, 8, 2, R.skin, P.body, {
    // narrower jaw and chin, flatter back of the head
    shape: (p, n, d) => {
      const k = d[1] < 0 ? 1 - 0.2 * -d[1] : 1;
      return [[p[0] * k, p[1], p[2] * (d[2] < 0 ? 0.96 : 1) * (d[1] < -0.3 ? 0.97 : 1)], n];
    },
  });
  ellipsoid(M, [0, H[1] - 0.014, H[2] + HR[2] * 0.93], [0.012, 0.024, 0.02], 5, 3, 2, R.skin, P.body);
  for (const sx of [1, -1]) ellipsoid(M, [sx * HR[0] * 0.4, H[1] + 0.014, H[2] + HR[2] * 0.86], [0.012, 0.009, 0.006], 5, 3, 2, R.eye, P.body);
  // hair: a cap with a low back and a high front hairline; long hair and bun are extra parts
  ellipsoid(M, [H[0], H[1] + 0.012, H[2] - 0.008], [HR[0] + 0.012, HR[1] + 0.01, HR[2] + 0.012], 10, 5, 2, R.hair, P.hair, {
    thetaMax: (ph) => 1.62 - 0.46 * Math.cos(ph),
  });
  ellipsoid(M, [0, H[1] - 0.08, H[2] - 0.055], [HR[0] * 1.1, 0.15, 0.068], 8, 6, 2, R.hair, P.longHair);
  ellipsoid(M, [0, H[1] + 0.055, H[2] - HR[2] - 0.004], [0.042, 0.04, 0.042], 6, 4, 2, R.hair, P.bun);
  // headwear: one dome (cap, sun hat, beanie) plus a cap brim or a hat brim
  ellipsoid(M, [H[0], H[1] + 0.02, H[2] - 0.004], [HR[0] + 0.02, HR[1] + 0.006, HR[2] + 0.02], 10, 4, 2, R.hat, P.dome, {
    thetaMax: (ph) => 1.48 - 0.16 * Math.cos(ph),
  });
  ellipsoid(M, [0, H[1] + 0.03, H[2] + HR[2] + 0.03], [0.072, 0.009, 0.072], 8, 3, 2, R.hat, P.capBrim, { pitch: 0.18 });
  ellipsoid(M, [0, H[1] + 0.045, H[2]], [0.21, 0.011, 0.21], 12, 3, 2, R.hat, P.hatBrim);
  box(M, [0, H[1] + 0.014, H[2] + HR[2] * 0.93], [HR[0] * 1.72, 0.032, 0.012], 2, () => R.shades, P.shades);
  // arms
  for (const sd of [1, -1]) {
    const up = sd > 0 ? 3 : 5, lo = up + 1;
    const sx = sd * S.shX, ex = sd * (S.shX + 0.012), wx = sd * (S.shX + 0.02);
    const a = S.arm;
    ellipsoid(M, [sx, S.sh - 0.008, 0], [S.ball, S.ball * 1.05, S.ball * 0.95], 7, 5, up, R.sleeve, P.body);
    const y1 = S.sh - (S.sh - S.elbow) * 0.45;
    tube(M, [
      { c: [sx, S.sh, 0], rx: a[0], rz: a[0], bone: up },
      { c: [sx + (ex - sx) * 0.45, y1, -0.005], rx: a[1], rz: a[1] * 0.95, bone: up },
      { c: [ex, S.elbow + 0.025, -0.011], rx: a[2], rz: a[2], bone: up },
      { c: [ex, S.elbow - 0.025, -0.01], rx: a[3], rz: a[3], bone: lo },
      { c: [ex + (wx - ex) * 0.5, S.elbow - (S.elbow - S.wrist) * 0.45, 0], rx: a[4], rz: a[4] * 1.08, bone: lo },
      { c: [wx, S.wrist, 0.012], rx: a[5], rz: a[5] * 1.2, bone: lo },
    ], [R.sleeve, R.forearm, R.forearm, R.forearm, R.forearm], 7, P.body);
    const hc = [wx, S.wrist - S.hand[1] * 0.95, 0.014];
    ellipsoid(M, hc, S.hand, 6, 4, lo, R.skin, P.body);
    if (sd < 0) box(M, [hc[0], hc[1] - 0.004, hc[2] + S.hand[2] * 0.8], [0.07, 0.148, 0.01], lo, (f) => (f === 4 ? R.screen : R.phone), P.phone);
  }
  // legs
  for (const sd of [1, -1]) {
    const up = sd > 0 ? 7 : 9, lo = up + 1;
    const hx = sd * S.hipX, kx = sd * (S.hipX + 0.004), ax = sd * (S.hipX + 0.008);
    const l = S.leg;
    tube(M, [
      { c: [hx * 0.95, S.hip + 0.05, 0], rx: l[0], rz: l[0], bone: up },
      { c: [hx, S.hip - 0.1, 0.004], rx: l[1], rz: l[1], bone: up },
      { c: [kx, S.knee + 0.12, 0.01], rx: l[2], rz: l[2], bone: up },
      { c: [kx, S.knee + 0.03, 0.01], rx: l[3], rz: l[3], bone: up },
      { c: [kx, S.knee - 0.03, 0.006], rx: l[4], rz: l[4], bone: lo },
      { c: [kx, S.knee - (S.knee - S.ankle) * 0.32, -0.006], rx: l[5], rz: l[5], bone: lo },
      { c: [ax, S.ankle + 0.02, -0.004], rx: l[6], rz: l[6], bone: lo },
    ], [R.hips, R.thigh, R.knee, R.knee, R.knee, R.shin], 8, P.body, [null, R.shin]);
    const f = S.foot;
    box(M, [ax, f[1] / 2, f[2] / 2 - 0.07], f, lo, () => R.shoe, P.body, (p) => {
      const q = [...p];
      if (q[2] > 0 && q[1] > 0) q[1] -= f[1] * 0.45; // sloped toe
      if (q[2] > 0) q[0] *= 0.85;
      return q;
    });
  }
  // skirt: a flared cone on the pelvis
  const k = S.skirt;
  tube(M, [
    { c: [0, S.waist - 0.01, 0.004], rx: k[0], rz: k[0] * 0.75, bone: 0, g: 0.9 },
    { c: [0, S.hip - 0.03, -0.01], rx: k[1], rz: k[1] * 0.72, bone: 0, g: 0.8 },
    { c: [0, S.knee + 0.11, -0.01], rx: k[2], rz: k[3], bone: 0, g: 0.6 },
  ], [R.skirt, R.skirt], 12, P.skirt);
  return { M, J };
}

// geometry with base (man) positions, woman/kid deltas and the joint tables for the shader
function buildBodyGeometry() {
  const m = buildShape(SHAPES.m), f = buildShape(SHAPES.f), k = buildShape(SHAPES.k);
  const n = m.M.p.length;
  const dF = new Float32Array(n), dK = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    dF[i] = f.M.p[i] - m.M.p[i];
    dK[i] = k.M.p[i] - m.M.p[i];
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(m.M.p, 3));
  g.setAttribute("normal", new Float32BufferAttribute(m.M.n, 3));
  g.setAttribute("aFem", new Float32BufferAttribute(dF, 3));
  g.setAttribute("aKid", new Float32BufferAttribute(dK, 3));
  g.setAttribute("aInfo", new Float32BufferAttribute(m.M.info, 4));
  g.setIndex(new Uint16BufferAttribute(m.M.ix, 1));
  g.computeBoundingSphere();
  const legs = (S) => [S.hip - S.knee, S.knee - S.ankle];
  return {
    geometry: g,
    joints: { m: m.J, f: f.J, k: k.J },
    legs: { m: legs(SHAPES.m), f: legs(SHAPES.f), k: legs(SHAPES.k) },
    hip: { m: SHAPES.m.hip, f: SHAPES.f.hip, k: SHAPES.k.hip },
    height: { m: 1.78, f: 1.66, k: 1.25 },
  };
}

export { buildBodyGeometry, PARENT, PART, REG };
