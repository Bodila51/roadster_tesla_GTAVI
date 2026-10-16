import { Color, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from "three";
import { COAST, PIER, deckHeight } from "./coast.js";
import { Kit, T, lin } from "./kit.js";
import { REGION, atlasUV } from "./textures.js";

// The pier (Galveston feel): a plank deck on an embankment, then on pilings, out to a T-head with a
// small Ferris wheel, food stalls with made-up names, an arcade and a sign arch at the plaza. One
// static mesh (atlas + vertex colours), instanced pilings and gondolas, the rotating wheel.
const UV = {
  white: atlasUV(REGION.white),
  window: atlasUV(REGION.window),
  wood: atlasUV(REGION.wood),
  planks: atlasUV(REGION.planks, 1),
  sign: (i) => atlasUV(REGION.sign(i), 3),
  stripe: (i) => atlasUV(REGION.stripe(i), 3),
};
const W = [1, 1, 1];
const C = {
  paint: lin(0xf3f0e8),
  fascia: lin(0xe6dfcf),
  skirt: lin(0xd3c7aa),
  beam: lin(0x9a8268),
  pile: lin(0x8f7a64),
  iron: lin(0x2f4a40),
  glass: lin(0xfff1c8),
  red: lin(0xd8402b),
  grey: lin(0x9aa0a6),
};
const V = (x, y, z) => new Vector3(x, y, z);
const ZA = V(0, 0, 1);

// world AABB of a local footprint (x0..x1, z0..z1) under matrix m
function aabb(m, x0, x1, z0, z1, y0, y1, name) {
  const ps = [V(x0, 0, z0), V(x1, 0, z0), V(x0, 0, z1), V(x1, 0, z1)].map((p) => p.applyMatrix4(m));
  return {
    min: V(Math.min(...ps.map((p) => p.x)), y0, Math.min(...ps.map((p) => p.z))),
    max: V(Math.max(...ps.map((p) => p.x)), y1, Math.max(...ps.map((p) => p.z))),
    name,
  };
}

function buildPier(mat) {
  const k = new Kit(),
    P = PIER,
    X = P.x,
    D = P.deckY,
    H = P.head,
    cols = [],
    dh = (z) => deckHeight(X, Math.min(Math.max(z, P.z0), P.z1)),
    col = (x0, y0, z0, x1, y1, z1, name = "pier") =>
      cols.push({ min: V(Math.min(x0, x1), y0, Math.min(z0, z1)), max: V(Math.max(x0, x1), y1, Math.max(z0, z1)), name }),
    box = (sx, sy, sz, x, y, z, c, uv = UV.white, ry = 0, faces = null) => k.box(sx, sy, sz, T(x, y, z, ry), uv, c, 0, faces);

  // deck planks: 12 x 4 m tiles, boards across the pier
  const tile = (x0, x1, z0, z1, y0, y1) => {
    const u = UV.planks,
      fu = (x1 - x0) / 12,
      fv = (z1 - z0) / 4;
    k.quad(V(X + x0, y1, z1), V(X + x1, y1, z1), V(X + x1, y0, z0), V(X + x0, y0, z0), [u[0], u[1], u[0] + (u[2] - u[0]) * fu, u[1] + (u[3] - u[1]) * fv], W);
  };
  for (let z = P.z0; z < P.z1 - 1e-3; z += 4) {
    const z1 = Math.min(P.z1, z + 4);
    tile(-P.half, P.half, z, z1, dh(z), dh(z1));
  }
  for (let x = H.x0; x < H.x1 - 1e-3; x += 12)
    for (let z = H.z0; z < H.z1 - 1e-3; z += 4) tile(x, Math.min(H.x1, x + 12), z, Math.min(H.z1, z + 4), D, D);

  // slabs under the planks (their painted edges show), the embankment walls, the substructure
  const ang = Math.atan2(D - P.y0, P.rampZ - P.z0),
    len = Math.hypot(D - P.y0, P.rampZ - P.z0);
  k.box(2 * P.half, 0.44, len, T(X, (P.y0 + D) / 2 - 0.23, (P.z0 + P.rampZ) / 2, 0, -ang), UV.white, C.fascia, 0, { py: !1 });
  box(2 * P.half, 0.44, P.z1 - P.rampZ, X, D - 0.23, (P.rampZ + P.z1) / 2, C.fascia, UV.white, 0, { py: !1 });
  box(H.x1 - H.x0, 0.44, H.z1 - H.z0, X + (H.x0 + H.x1) / 2, D - 0.23, (H.z0 + H.z1) / 2, C.fascia, UV.white, 0, { py: !1 });
  for (const s of [-1, 1])
    for (let z = P.z0; z < P.solidZ - 1e-3; z += 10) {
      const z1 = Math.min(P.solidZ, z + 10),
        x = X + s * (P.half - 0.04),
        a = V(x, -1.4, z),
        b = V(x, -1.4, z1),
        c = V(x, dh(z1) - 0.44, z1),
        d = V(x, dh(z) - 0.44, z);
      s > 0 ? k.quad(b, a, d, c, UV.white, C.skirt) : k.quad(a, b, c, d, UV.white, C.skirt);
    }
  {
    const sz = P.solidZ,
      top = dh(sz) - 0.44;
    k.quad(V(X - P.half, -1.4, sz), V(X + P.half, -1.4, sz), V(X + P.half, top, sz), V(X - P.half, top, sz), UV.white, C.skirt);
    col(X - P.half, -1.5, sz - 0.4, X + P.half, top, sz);
  }
  const piles = [];
  let n = 0;
  for (let z = P.solidZ + 4; z < P.z1 - 2; z += 8, n++) {
    piles.push([X - 5.4, z], [X + 5.4, z]);
    box(2 * P.half + 0.4, 0.36, 0.42, X, D - 0.62, z, C.beam, UV.wood);
    const s = n % 2 ? 1 : -1;
    k.beam(V(X - 5.4 * s, -0.25, z), V(X + 5.4 * s, D - 0.8, z), 0.16, 0.22, UV.wood, C.beam);
  }
  for (const sx of [-3.6, 0, 3.6]) box(0.3, 0.3, P.z1 - P.solidZ, X + sx, D - 0.6, (P.solidZ + P.z1) / 2, C.beam, UV.wood);
  for (let z = H.z0 + 4; z < H.z1; z += 8) {
    for (let x = H.x0 + 3; x < H.x1; x += 9) piles.push([X + x, z]);
    box(H.x1 - H.x0 + 0.4, 0.36, 0.42, X + (H.x0 + H.x1) / 2, D - 0.62, z, C.beam, UV.wood);
  }
  for (const [x, z] of piles) z < COAST.shoreZ + 14 && col(x - 0.35, -3, z - 0.35, x + 0.35, D - 0.5, z + 0.35);

  // railings (white), with colliders; the car fits under the deck past the embankment
  const post = (x, z, y) => box(0.12, 1.05, 0.12, x, y + 0.525, z, C.paint),
    rail = (a, b) => k.beam(a, b, 0.09, 0.07, UV.white, C.paint);
  for (const s of [-1, 1]) {
    const x = X + s * (P.half - 0.08),
      zz = [P.z0 + 0.4];
    for (let z = P.z0 + 0.4; z <= P.z1 + 1e-3; z += 2.5) post(x, z, dh(z));
    for (let z = P.z0 + 4.4; z < P.rampZ; z += 4) zz.push(z);
    zz.push(P.rampZ, (P.rampZ + P.z1) / 2, P.z1);
    for (let i = 0; i < zz.length - 1; i++)
      for (const h of [1.0, 0.52]) rail(V(x, dh(zz[i]) + h, zz[i]), V(x, dh(zz[i + 1]) + h, zz[i + 1]));
    col(x - 0.25, -1.5, P.z0, x + 0.25, D + 1.1, P.solidZ);
    col(x - 0.25, dh(P.solidZ), P.solidZ, x + 0.25, D + 1.1, P.z1);
  }
  const hx0 = X + H.x0 + 0.08,
    hx1 = X + H.x1 - 0.08,
    hz0 = H.z0 + 0.08,
    hz1 = H.z1 - 0.08,
    run = (ax, az, bx, bz) => {
      const m = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.5));
      for (let i = 0; i <= m; i++) post(ax + ((bx - ax) * i) / m, az + ((bz - az) * i) / m, D);
      for (const h of [1.0, 0.52]) rail(V(ax, D + h, az), V(bx, D + h, bz));
      col(Math.min(ax, bx) - 0.25, D, Math.min(az, bz) - 0.25, Math.max(ax, bx) + 0.25, D + 1.1, Math.max(az, bz) + 0.25);
    };
  run(hx0, hz0, X - P.half, hz0), run(X + P.half, hz0, hx1, hz0), run(hx1, hz0, hx1, hz1), run(hx1, hz1, hx0, hz1), run(hx0, hz1, hx0, hz0);

  // lamps
  const lamp = (x, z, y) => {
    box(0.34, 0.3, 0.34, x, y + 0.15, z, C.iron);
    k.cyl(0.075, 0.06, 3.7, 6, T(x, y + 0.3, z), UV.white, C.iron, 0, !1);
    box(0.36, 0.5, 0.36, x, y + 4.25, z, C.glass);
    k.cyl(0.3, 0.02, 0.3, 4, T(x, y + 4.5, z, Math.PI / 4), UV.white, C.iron);
  };
  for (const s of [-1, 1]) for (let z = P.z0 + 14; z < P.z1; z += 24) lamp(X + s * (P.half - 0.08), z, dh(z));
  for (const [x, z] of [[hx0, hz0], [hx1, hz0], [hx0, hz1], [hx1, hz1], [X, hz1]]) lamp(x, z, D);

  // the sign arch at the plaza
  {
    const az = P.z0 + 1.2;
    for (const s of [-1, 1]) box(0.55, 7.8, 0.55, X + s * 6.7, 3.3, az, C.paint), col(X + s * 6.7 - 0.4, -1, az - 0.4, X + s * 6.7 + 0.4, 7.2, az + 0.4);
    box(14, 0.4, 0.34, X, 6.95, az, C.paint);
    box(9, 2.2, 0.3, X, 5.65, az, C.paint, UV.white, 0, { pz: UV.sign(6), nz: UV.sign(6) });
  }

  // food stalls: front faces local +z
  const stall = (x, z, ry, sign, stripe, c) => {
    const y = deckHeight(x, z) ?? D,
      M = T(x, y, z, ry),
      L = (lx, ly, lz, rx = 0) => M.clone().multiply(T(lx, ly, lz, 0, rx)),
      Q = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(M);
    k.box(3.6, 2.6, 2.6, L(0, 1.3, 0), UV.white, c);
    k.quad(Q(-1.45, 1.05, 1.31), Q(1.45, 1.05, 1.31), Q(1.45, 2.15, 1.31), Q(-1.45, 2.15, 1.31), UV.window, W);
    k.box(3.4, 0.08, 0.5, L(0, 1.02, 1.52), UV.white, C.paint);
    k.box(3.9, 0.06, 1.3, L(0, 2.3, 1.85, 0.42), UV.stripe(stripe), W);
    k.box(3.9, 0.16, 2.9, L(0, 2.68, 0), UV.white, C.paint);
    for (const sx of [-1.4, 1.4]) k.box(0.08, 0.5, 0.08, L(sx, 2.95, 1.1), UV.white, C.iron);
    k.box(3.3, 0.82, 0.1, L(0, 3.5, 1.1), UV.white, C.paint, 0, { pz: UV.sign(sign), nz: UV.sign(sign) });
    cols.push(aabb(M, -1.95, 1.95, -1.35, 1.6, y, y + 3.2, "stall"));
  };
  stall(X - 3.9, 742, Math.PI / 2, 0, 0, lin(0x9fd8e0));
  stall(X + 3.9, 790, -Math.PI / 2, 1, 1, lin(0xf7c6d4));
  stall(X - 3.9, 838, Math.PI / 2, 2, 3, lin(0xfff0b3));
  stall(X - 24, H.z0 + 1.6, 0, 4, 2, lin(0xffd9a8));
  stall(X - 24, H.z1 - 1.6, Math.PI, 3, 1, lin(0xc9e7c0));

  // the arcade on the west half of the T-head
  {
    const ax = X - 18,
      az = 925,
      y = D;
    box(14, 5, 9, ax, y + 2.5, az, lin(0x63c2bd));
    box(14.5, 0.35, 9.5, ax, y + 5.15, az, C.paint);
    box(7, 1.75, 0.2, ax, y + 4.1, az - 4.6, C.paint, UV.white, 0, { nz: UV.sign(5), pz: UV.sign(5) });
    for (const dx of [-4.2, 0, 4.2])
      k.quad(V(ax + dx + 1, y, az - 4.51), V(ax + dx - 1, y, az - 4.51), V(ax + dx - 1, y + 2.6, az - 4.51), V(ax + dx + 1, y + 2.6, az - 4.51), UV.window, W);
    col(ax - 7.2, y, az - 4.7, ax + 7.2, y + 5.3, az + 4.7, "arcade");
  }

  // Ferris wheel: static A-frames on a platform, the wheel turns, gondolas hang level
  const WX = X + 15,
    WZ = 918,
    WY = D + 14,
    R = 11,
    NS = 18;
  box(15, 0.3, 7.6, WX, D + 0.15, WZ, lin(0xc23b2c));
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) k.beam(V(WX + sx * 6.2, D + 0.3, WZ + sz * 2.9), V(WX, WY, WZ + sz * 1.75), 0.38, 0.38, UV.white, C.paint);
    k.beam(V(WX - 3.0, D + 7.3, WZ + sz * 2.33), V(WX + 3.0, D + 7.3, WZ + sz * 2.33), 0.2, 0.2, UV.white, C.paint);
  }
  k.beam(V(WX, WY, WZ - 2.0), V(WX, WY, WZ + 2.0), 0.4, 0.4, UV.white, C.grey);
  col(WX - 7.6, D, WZ - 3.9, WX + 7.6, D + 6, WZ + 3.9, "wheel");

  const mesh = new Mesh(k.build(), mat);
  (mesh.castShadow = mesh.receiveShadow = !0), (mesh.name = "pier");

  const pm = new InstancedMesh(new Kit().cyl(0.3, 0.3, 1, 10, new Matrix4(), UV.wood, C.pile, 0, !1).build(), mat, piles.length),
    mm = new Matrix4();
  piles.forEach(([x, z], i) => pm.setMatrixAt(i, mm.makeScale(1, D - 0.44 + 9, 1).setPosition(x, -9, z)));
  pm.castShadow = pm.receiveShadow = !0;

  const kw = new Kit(),
    ring = (r, z, nn, w, c) => {
      for (let i = 0; i < nn; i++) {
        const a0 = (i / nn) * 6.2832,
          a1 = ((i + 1) / nn) * 6.2832;
        kw.beam(V(r * Math.cos(a0), r * Math.sin(a0), z), V(r * Math.cos(a1), r * Math.sin(a1), z), w, w, UV.white, c, 0, ZA);
      }
    };
  for (const z of [-1.2, 1.2]) {
    ring(R, z, 40, 0.26, C.paint), ring(R - 1.0, z, 40, 0.12, C.red), ring(5, z, 24, 0.14, C.red);
    for (let i = 0; i < NS; i++) {
      const a = (i / NS) * 6.2832;
      kw.beam(V(0.6 * Math.cos(a), 0.6 * Math.sin(a), z), V(R * Math.cos(a), R * Math.sin(a), z), 0.09, 0.09, UV.white, C.paint, 0, ZA);
    }
  }
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * 6.2832;
    kw.beam(V(R * Math.cos(a), R * Math.sin(a), -1.3), V(R * Math.cos(a), R * Math.sin(a), 1.3), 0.14, 0.14, UV.white, C.grey);
  }
  kw.cyl(0.8, 0.8, 2.8, 10, T(0, 0, -1.4, 0, Math.PI / 2), UV.white, C.grey);
  const wheel = new Mesh(kw.build(), mat);
  wheel.position.set(WX, WY, WZ), (wheel.castShadow = !0);

  const kg = new Kit();
  kg.box(0.08, 0.7, 0.08, T(0, -0.35, 0), UV.white, C.grey);
  kg.box(1.7, 0.12, 1.6, T(0, -0.72, 0), UV.white, W, 1);
  kg.box(1.42, 0.62, 1.32, T(0, -1.1, 0), UV.window, W);
  kg.box(1.5, 0.62, 1.4, T(0, -1.72, 0), UV.white, W, 1);
  const gond = new InstancedMesh(kg.build(), mat, NS),
    GC = [0xe2453a, 0xf5c242, 0x2fb3a5, 0x3a7fd5, 0xf28bb3, 0xf38b3c].map((h) => new Color(h));
  for (let i = 0; i < NS; i++) gond.setColorAt(i, GC[i % GC.length]);
  (gond.castShadow = !0), (gond.frustumCulled = !1);

  const group = new Group(),
    q = new Quaternion(),
    one = V(1, 1, 1),
    pp = V(0, 0, 0);
  group.add(mesh, pm, wheel, gond);
  function update(t) {
    const a = t * 0.07;
    wheel.rotation.z = a;
    for (let i = 0; i < NS; i++) {
      const th = a + (i / NS) * 6.2832;
      q.setFromAxisAngle(ZA, Math.sin(t * 0.9 + i * 1.7) * 0.035);
      gond.setMatrixAt(i, mm.compose(pp.set(WX + R * Math.cos(th), WY + R * Math.sin(th), WZ), q, one));
    }
    gond.instanceMatrix.needsUpdate = !0;
  }
  update(0);
  return { group, colliders: cols, update };
}

export { buildPier };
