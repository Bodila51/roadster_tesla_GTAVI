import { Color, Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { COAST, PIER, seabedY, swellAt } from "./coast.js";
import { Kit, T, lin } from "./kit.js";
import { REGION, atlasUV } from "./textures.js";

// Beach and sea props, each one instanced draw call: lifeguard towers on stilts (pastel walls),
// anchored fishing boats and buoys that ride the swell.
const UV = { white: atlasUV(REGION.white), window: atlasUV(REGION.window), wood: atlasUV(REGION.wood), sign: (i) => atlasUV(REGION.sign(i), 3) };
const W = [1, 1, 1];
const V = (x, y, z) => new Vector3(x, y, z);

function towerGeo() {
  const k = new Kit(),
    white = lin(0xf5f3ee),
    wood = lin(0xb59b7c),
    roof = lin(0xd9d9d9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.16, 2.7, 0.16, T(sx * 1.05, 1.05, sz - 0.2), UV.white, white);
  k.box(3.0, 0.14, 3.5, T(0, 2.37, 0.3), UV.wood, wood);
  k.box(2.3, 1.9, 2.1, T(0, 3.39, -0.3), UV.white, W, 1);
  k.quad(V(-0.95, 2.95, 0.76), V(0.95, 2.95, 0.76), V(0.95, 3.85, 0.76), V(-0.95, 3.85, 0.76), UV.window, W);
  k.quad(V(1.16, 3.0, 0.45), V(1.16, 3.0, -1.05), V(1.16, 3.8, -1.05), V(1.16, 3.8, 0.45), UV.window, W);
  k.quad(V(-1.16, 3.0, -1.05), V(-1.16, 3.0, 0.45), V(-1.16, 3.8, 0.45), V(-1.16, 3.8, -1.05), UV.window, W);
  k.box(2.9, 0.14, 2.8, T(0, 4.41, -0.25), UV.white, roof, 1);
  k.box(1.9, 0.42, 0.06, T(0, 4.7, 1.05), UV.white, white, 0, { pz: UV.sign(7), nz: UV.sign(7) });
  for (const sx of [-1.45, 1.45]) k.box(0.08, 0.95, 0.08, T(sx, 2.9, 2.0), UV.white, white), k.beam(V(sx, 3.35, 2.0), V(sx, 3.35, 0.75), 0.07, 0.07, UV.white, white);
  k.beam(V(-1.45, 3.35, 2.0), V(1.45, 3.35, 2.0), 0.07, 0.07, UV.white, white);
  k.beam(V(0.75, 2.38, -1.35), V(0.75, -0.05, -4.8), 0.9, 0.08, UV.wood, wood);
  k.cyl(0.03, 0.03, 2.0, 4, T(1.25, 4.48, -1.4), UV.white, white);
  k.box(0.02, 0.42, 0.62, T(1.25, 6.2, -1.1), UV.white, lin(0xd8402b));
  return k.build();
}

function boatGeo() {
  const k = new Kit(),
    bottom = lin(0x8c2f22),
    white = lin(0xf6f5f0),
    deck = lin(0xcdbb9a),
    // stations: z, half beam at the sheer, sheer height above the waterline
    st = [
      [-4.0, 1.2, 0.72],
      [-2.5, 1.36, 0.74],
      [0, 1.42, 0.8],
      [2.2, 1.18, 0.95],
      [3.4, 0.64, 1.1],
      [4.05, 0.06, 1.22],
    ],
    sh = (i, s) => V(s * st[i][1], st[i][2], st[i][0]),
    ch = (i, s) => V(s * st[i][1] * 0.8, -0.18, st[i][0]),
    kl = (i) => V(0, -0.55, st[i][0]),
    dk = (i, s) => V(s * st[i][1] * 0.97, st[i][2] - 0.06, st[i][0]);
  for (let i = 0; i < st.length - 1; i++) {
    for (const s of [-1, 1]) {
      const q = (a, b, c, d, uv, c0, t) => (s < 0 ? k.quad(a, b, c, d, uv, c0, t) : k.quad(b, a, d, c, uv, c0, t));
      q(ch(i, s), ch(i + 1, s), sh(i + 1, s), sh(i, s), UV.white, W, 1);
      q(kl(i), kl(i + 1), ch(i + 1, s), ch(i, s), UV.white, bottom, 0);
    }
    k.quad(dk(i, 1), dk(i, -1), dk(i + 1, -1), dk(i + 1, 1), UV.wood, deck);
  }
  k.quad(ch(0, 1), ch(0, -1), sh(0, -1), sh(0, 1), UV.white, W, 1);
  k.tri(ch(0, 1), kl(0), ch(0, -1), UV.white, bottom);
  k.box(1.9, 1.1, 2.3, T(0, 1.35, -0.6), UV.white, white);
  k.quad(V(-0.8, 1.45, 0.56), V(0.8, 1.45, 0.56), V(0.8, 1.8, 0.56), V(-0.8, 1.8, 0.56), UV.window, W);
  k.quad(V(0.96, 1.45, 0.3), V(0.96, 1.45, -1.5), V(0.96, 1.8, -1.5), V(0.96, 1.8, 0.3), UV.window, W);
  k.quad(V(-0.96, 1.45, -1.5), V(-0.96, 1.45, 0.3), V(-0.96, 1.8, 0.3), V(-0.96, 1.8, -1.5), UV.window, W);
  k.box(2.1, 0.08, 2.6, T(0, 1.94, -0.6), UV.white, W, 1);
  k.cyl(0.05, 0.04, 3.2, 5, T(0, 1.98, -0.9), UV.white, white);
  k.box(1.2, 0.05, 0.05, T(0, 4.2, -0.9), UV.white, white);
  return k.build();
}

function buoyGeo() {
  const k = new Kit();
  k.cyl(0.36, 0.3, 0.5, 8, T(0, -0.25, 0), UV.white, W, 1, !1);
  k.cyl(0.3, 0.04, 0.36, 8, T(0, 0.25, 0), UV.white, W, 1);
  k.cyl(0.03, 0.03, 0.4, 4, T(0, 0.55, 0), UV.white, lin(0xf2f2f2));
  return k.build();
}

function buildProps(mat) {
  const group = new Group(),
    cols = [],
    m = new Matrix4(),
    q = new Quaternion(),
    e = new Euler(),
    p = new Vector3(),
    s = new Vector3(1, 1, 1);
  const TW = [-400, -255, -118, 128, 262, 404],
    TC = [0xf6c6d0, 0xbfe3d0, 0xffe08a, 0xbcd7f2, 0xf7c59f, 0xd9c8f0],
    towers = new InstancedMesh(towerGeo(), mat, TW.length);
  TW.forEach((x, i) => {
    const z = COAST.shoreZ - 18 + (i % 2) * 3,
      y = seabedY(x, z);
    towers.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromEuler(e.set(0, ((i % 3) - 1) * 0.12, 0)), s));
    towers.setColorAt(i, new Color(TC[i]));
    cols.push({ min: V(x - 1.4, y - 1, z - 1.4), max: V(x + 1.4, y + 4.6, z + 1.6), name: "tower" });
  });
  towers.castShadow = towers.receiveShadow = !0;
  const BT = [
      [-265, 935, 0.3, 1.0, 0xffffff],
      [-120, 1160, -0.2, 1.25, 0xd8402b],
      [118, 1085, 0.15, 0.9, 0x1f3f73],
      [258, 880, -0.35, 1.1, 0x1d8a8a],
      [430, 1020, 0.1, 1.3, 0xffffff],
      [62, 1015, 0.5, 0.85, 0xf2b632],
    ],
    boats = new InstancedMesh(boatGeo(), mat, BT.length);
  BT.forEach((b, i) => boats.setColorAt(i, new Color(b[4])));
  const BU = [];
  for (let x = -450; x <= 450; x += 30) Math.abs(x - PIER.x) > 40 && BU.push([x, COAST.shoreZ + 58, 1, (x / 30) % 2 ? 0xff7a1a : 0xf4f4f4]);
  BU.push([PIER.x - 80, 1260, 2.8, 0xc8281e], [PIER.x + 80, 1260, 2.8, 0x1e8c3a]);
  const buoys = new InstancedMesh(buoyGeo(), mat, BU.length);
  BU.forEach((b, i) => buoys.setColorAt(i, new Color(b[3])));
  boats.frustumCulled = buoys.frustumCulled = !1;
  group.add(towers, boats, buoys);
  const sw = { h: 0, sx: 0, sz: 0 };
  function update(t) {
    BT.forEach(([x, z, yaw, sc], i) => {
      swellAt(x, z, t, sw);
      const along = sw.sx * Math.sin(yaw) + sw.sz * Math.cos(yaw),
        across = sw.sx * Math.cos(yaw) - sw.sz * Math.sin(yaw);
      e.set(-along * 1.1 + 0.015 * Math.sin(t * 0.8 + i), yaw + 0.04 * Math.sin(t * 0.13 + i * 2), across * 1.1 + 0.03 * Math.sin(t * 1.1 + i * 1.3), "YXZ");
      boats.setMatrixAt(i, m.compose(p.set(x, COAST.waterY + sw.h, z), q.setFromEuler(e), s.set(sc, sc, sc)));
    });
    BU.forEach(([x, z, sc], i) => {
      swellAt(x, z, t, sw);
      e.set(-sw.sz * 2 + 0.06 * Math.sin(t * 1.7 + i), 0, sw.sx * 2 + 0.06 * Math.sin(t * 1.3 + i * 0.7), "YXZ");
      buoys.setMatrixAt(i, m.compose(p.set(x, COAST.waterY + sw.h - 0.05 * sc, z), q.setFromEuler(e), s.set(sc, sc, sc)));
    });
    s.set(1, 1, 1);
    boats.instanceMatrix.needsUpdate = buoys.instanceMatrix.needsUpdate = !0;
  }
  update(0);
  return { group, colliders: cols, update };
}

export { buildProps };
