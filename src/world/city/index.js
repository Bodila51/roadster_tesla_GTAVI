import { Color, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { DAY } from "../sky.js";
import { Geo, fbox, flat, stamp, wall } from "./geo.js";
import { CITY, CURB } from "./layout.js";
import { bakeCityShadow, facadeMaterial, frondMaterial, groundMaterial, paintMaterial, propUniforms, propsMaterial } from "./materials.js";
import { PLAN } from "./plan.js";
import * as P from "./props.js";
import { PAINT_DY, PAINT_WHITE, PAINT_YELLOW, buildStreets, paintRect } from "./streets.js";
import { MODULES, makeFacadeArray, makeFrondTexture, makeGroundArray, signUV } from "./textures.js";

// Port Sabal: builds the town from layout.js + plan.js. Draw calls: one ground mesh, one paint
// mesh, and per chunk (6 x 2 chunks of 160 m) one facade mesh, one props mesh and one palm-crown
// InstancedMesh; props and crowns of chunks further than DETAIL metres from the camera are hidden.
const CH_X0 = -480,
  CH_W = 160,
  CH_Z = 430,
  DETAIL = 330;
const chunkOf = (x, z) => (z < CH_Z ? 0 : 6) + Math.max(0, Math.min(5, Math.floor((x - CH_X0) / CH_W)));
const V = (x, y, z) => new Vector3(x, y, z);

// arbitrary facade quad (corners counter-clockwise seen from the front)
function quad4(g, pts, uvs, layer, tint) {
  const [a, b, c] = pts,
    n = new Vector3()
      .subVectors(new Vector3(...b), new Vector3(...a))
      .cross(new Vector3().subVectors(new Vector3(...c), new Vector3(...a)))
      .normalize();
  const ids = pts.map((p, k) => g.vert(p[0], p[1], p[2], n.x, n.y, n.z, { aF: [uvs[k][0], uvs[k][1], layer], aTint: tint }));
  g.quadIdx(...ids);
}

function buildCity(scene, renderer, opts = {}) {
  const fa = makeFacadeArray(),
    ga = makeGroundArray(),
    L = fa.L,
    GL = ga.L,
    mats = {
      facade: facadeMaterial(fa.texture),
      ground: groundMaterial(ga.texture),
      paint: paintMaterial(),
      props: propsMaterial(),
      frond: frondMaterial(makeFrondTexture()),
    };
  const chunks = Array.from({ length: 12 }, (_, i) => ({
    facade: new Geo({ aF: 3, aTint: 3 }),
    props: new Geo({ color: 3, aPM: 3 }),
    crowns: [],
    detail: [],
    x0: CH_X0 + (i % 6) * CH_W - 40,
    x1: CH_X0 + ((i % 6) + 1) * CH_W + 40,
    z0: i < 6 ? 160 : CH_Z - 40,
    z1: i < 6 ? CH_Z + 40 : 700,
  }));
  const groundG = new Geo({ aF: 3 }),
    paintG = new Geo({ color: 3 }),
    colliders = [],
    surfaces = [];
  const C = (x, z) => chunks[chunkOf(x, z)];
  const box = (x0, y0, z0, x1, y1, z1, name, drivable = false) => colliders.push({ min: V(x0, y0, z0), max: V(x1, y1, z1), name, drivable });
  const roofSurf = (x0, z0, x1, z1, h, name = "roof") => surfaces.push({ min: V(x0, h - 1, z0), max: V(x1, h, z1), name });
  const M = new Matrix4(),
    R = new Matrix4(),
    Sm = new Matrix4();
  const place = (x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx) => M.makeTranslation(x, y, z).multiply(R.makeRotationY(yaw)).multiply(Sm.makeScale(sx, sy, sz));
  const put = (t, x, y, z, yaw = 0, s = 1) => stamp(C(x, z).props, t, place(x, y, z, yaw, s));

  buildStreets(groundG, paintG, GL, surfaces, Vector3);

  // ---------------- buildings ----------------
  const TPL = { ac: P.acUnit(), light: P.streetLight(), dlight: P.streetLight(true), bench: P.bench(), pump: P.gasPump(), rail: P.railing(10), fountain: P.fountain(), antenna: P.antenna(10) };
  let bi = 0;
  const hash = (k) => {
    const s = Math.sin(k * 127.1 + bi * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (const b of PLAN.buildings) {
    bi++;
    const g = C((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2).facade,
      { x0, x1, z0, z1, y0, gh, fh, floors, tint } = b,
      top = y0 + gh + (floors - 1) * fh,
      tower = b.kind === "tower",
      gar = b.kind === "garage",
      wallTint = tower ? [1, 1, 1] : tint;
    const back = { n: "s", s: "n", e: "w", w: "e" }[b.front];
    const upW = b.up === "door" ? "win4" : b.up;
    for (const [f, ax, az, bx, bz] of [
      ["s", x0, z1, x1, z1],
      ["n", x1, z0, x0, z0],
      ["e", x1, z1, x1, z0],
      ["w", x0, z0, x0, z1],
    ]) {
      const len = Math.hypot(bx - ax, bz - az);
      let type = tower || gar || f === b.front ? "front" : b.sides[f] || (b.kind === "shop" && f !== back ? "blank" : "win");
      if (b.kind === "clock") type = "win";
      const bays = (layer) => Math.max(1, Math.round(len / MODULES[layer][0]));
      if (type === "blank") wall(g, ax, az, bx, bz, y0, top, L.blank, 0, len / 4, 0, (top - y0) / 4, wallTint);
      else {
        // ground floor band
        if (type === "front" && b.ground) wall(g, ax, az, bx, bz, y0, y0 + gh, L[b.ground], 0, bays(b.ground), 0, 1, wallTint);
        else if (type === "front") {
          const n = bays("door"),
            door = b.kind === "apt" ? Math.floor(n / 2) : Math.min(1, n - 1);
          for (let k = 0; k < n; k++) {
            const t0 = k / n,
              t1 = (k + 1) / n;
            wall(g, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, y0, y0 + gh, L[k === door ? "door" : upW], 0, 1, 0, 1, wallTint);
          }
        } else wall(g, ax, az, bx, bz, y0, y0 + gh, L[upW], 0, bays(upW), 0, 1, wallTint);
        if (floors > 1) {
          const lay = type === "front" ? b.up : upW;
          wall(g, ax, az, bx, bz, y0 + gh, top, L[lay], 0, bays(lay), 0, floors - 1, wallTint);
        }
      }
      // crown / attic band up to the roof
      if (b.h > top + 0.01) wall(g, ax, az, bx, bz, top, b.h, tower ? L.conc : L.blank, 0, len / 4, 0, (b.h - top) / 4, wallTint);
      // parapet (outer + inner face), with a gap where the garage ramp arrives
      const ph = tower ? 0.7 : gar ? 1.0 : 0.5,
        pl = tower || gar ? L.conc : L.blank,
        nx = -(bz - az) / len,
        nz = (bx - ax) / len,
        segsP = gar && f === "w" ? [[0, (CITY.garage.ramp.z0 - z0) / len], [(CITY.garage.ramp.z1 - z0) / len, 1]] : [[0, 1]];
      for (const [t0, t1] of segsP) {
        const pax = ax + (bx - ax) * t0,
          paz = az + (bz - az) * t0,
          pbx = ax + (bx - ax) * t1,
          pbz = az + (bz - az) * t1,
          l2 = len * (t1 - t0);
        wall(g, pax, paz, pbx, pbz, b.h, b.h + ph, pl, 0, l2 / 4, 0, ph / 4, wallTint);
        wall(g, pbx - nx * 0.3, pbz - nz * 0.3, pax - nx * 0.3, paz - nz * 0.3, b.h, b.h + ph, pl, 0, l2 / 4, 0, ph / 4, wallTint);
      }
      // shop sign over the shopfront, awning below it
      if (type === "front" && f === (gar ? "n" : b.front) && b.sign != null && !tower) {
        const sw = Math.min(len - 1.5, gar ? 8 : 9),
          t0 = 0.5 - sw / len / 2,
          t1 = 0.5 + sw / len / 2,
          o = 0.12,
          sy0 = gar ? y0 + 4.2 : y0 + gh - 0.9,
          sy1 = gar ? y0 + 5.6 : y0 + gh - 0.15,
          s = signUV(fa, b.sign);
        wall(g, ax + (bx - ax) * t0 + nx * o, az + (bz - az) * t0 + nz * o, ax + (bx - ax) * t1 + nx * o, az + (bz - az) * t1 + nz * o, sy0, sy1, s.layer, 0, 1, s.v0, s.v1);
      }
      if (type === "front" && f === b.front && b.awning) {
        const w0 = 0.5 / len,
          w1 = 1 - w0,
          A = (t, out, y) => [ax + (bx - ax) * t + nx * out, y, az + (bz - az) * t + nz * out],
          ya = y0 + gh - 1.0,
          yb = ya - 0.6,
          U = (len - 1) / 2,
          lay = L[b.awning];
        quad4(g, [A(w0, 1.8, yb), A(w1, 1.8, yb), A(w1, 0, ya), A(w0, 0, ya)], [[0, 0], [U, 0], [U, 1], [0, 1]], lay, [1, 1, 1]);
        quad4(g, [A(w1, 1.8, yb), A(w0, 1.8, yb), A(w0, 0, ya), A(w1, 0, ya)], [[U, 0], [0, 0], [0, 1], [U, 1]], lay, [0.8, 0.8, 0.8]);
        quad4(g, [A(w0, 1.8, yb - 0.35), A(w1, 1.8, yb - 0.35), A(w1, 1.8, yb), A(w0, 1.8, yb)], [[0, 0], [U, 0], [U, 0.35], [0, 0.35]], lay, [1, 1, 1]);
        quad4(g, [A(w1, 1.8, yb - 0.35), A(w0, 1.8, yb - 0.35), A(w0, 1.8, yb), A(w1, 1.8, yb)], [[U, 0], [0, 0], [0, 0.35], [U, 0.35]], lay, [0.75, 0.75, 0.75]);
      }
    }
    // roof and parapet cap
    flat(g, x0, z0, x1, z1, b.h, gar ? L.conc : L.roof, 5);
    // colliders: walls (drivable from above) and the roof
    // the garage edge where the ramp arrives sits lower, so the car never meets its corner from below
    if (gar) box(x0, 0, z0, x0 + 1.5, b.h - 0.8, z1, "building", true), box(x0 + 1.5, 0, z0, x1, b.h, z1, "building", true);
    else box(x0, 0, z0, x1, b.h, z1, "building", true);
    roofSurf(x0, z0, x1, z1, b.h, gar ? "garage" : "roof");
    const w = x1 - x0,
      d = z1 - z0,
      pc = C((x0 + x1) / 2, (z0 + z1) / 2).props;
    for (let k = 0; k < (b.roof.ac || 0) && w > 7 && d > 7; k++)
      stamp(pc, TPL.ac, place(x0 + 2.5 + hash(k) * (w - 5), b.h, z0 + 2.5 + hash(k + 7) * (d - 5), Math.round(hash(k + 3) * 2) * (Math.PI / 2)));
    if (b.roof.penthouse) {
      const px0 = x0 + w * 0.32,
        px1 = x1 - w * 0.32,
        pz0 = z0 + d * 0.3,
        pz1 = z1 - d * 0.3;
      fbox(g, px0, px1, b.h, b.h + 4, pz0, pz1, L.conc, L.roof, 4, 4);
      box(px0, b.h - 0.5, pz0, px1, b.h + 4, pz1, "building", true);
      roofSurf(px0, pz0, px1, pz1, b.h + 4);
      if (b.roof.antenna) stamp(pc, TPL.antenna, place((px0 + px1) / 2, b.h + 4, (pz0 + pz1) / 2));
    }
    if (b.roof.helipad) {
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2,
        y = b.h + PAINT_DY;
      for (let k = 0; k < 40; k++) {
        const a0 = (k / 40) * Math.PI * 2,
          a1 = ((k + 1) / 40) * Math.PI * 2,
          ids = [
            [7, a0],
            [7.5, a0],
            [7.5, a1],
            [7, a1],
          ].map(([r, a]) => paintG.vert(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, 1, 0, { color: PAINT_YELLOW }));
        paintG.quadIdx(ids[0], ids[3], ids[2], ids[1]);
      }
      paintRect(paintG, cx - 2.2, cz - 3, cx - 1.4, cz + 3, y, PAINT_WHITE);
      paintRect(paintG, cx + 1.4, cz - 3, cx + 2.2, cz + 3, y, PAINT_WHITE);
      paintRect(paintG, cx - 1.4, cz - 0.4, cx + 1.4, cz + 0.4, y, PAINT_WHITE);
    }
    if (b.roof.signBoard != null) {
      const s = signUV(fa, b.roof.signBoard),
        sw = Math.min(16, w - 4),
        zf = b.front === "s" ? z1 - 1.2 : z0 + 1.2,
        cx = (x0 + x1) / 2;
      b.front === "s"
        ? wall(g, cx - sw / 2, zf, cx + sw / 2, zf, b.h + 0.8, b.h + 3.8, s.layer, 0, 1, s.v0, s.v1)
        : wall(g, cx + sw / 2, zf, cx - sw / 2, zf, b.h + 0.8, b.h + 3.8, s.layer, 0, 1, s.v0, s.v1);
      stamp(pc, P.box(sw + 0.4, 3.4, 0.2, 0, 0, 0, [0.5, 0.5, 0.52]), place(cx, b.h + 2.3, zf + (b.front === "s" ? -0.15 : 0.15)));
      for (const sx of [-0.35, 0.35]) stamp(pc, P.box(0.2, 0.8, 0.2, 0, 0, 0, [0.4, 0.4, 0.42]), place(cx + sx * sw, b.h + 0.4, zf));
    }
    if (b.kind === "clock") {
      for (const [f, yaw] of [
        [[0, 1], 0],
        [[0, -1], Math.PI],
        [[1, 0], Math.PI / 2],
        [[-1, 0], -Math.PI / 2],
      ]) {
        const cx = (x0 + x1) / 2 + f[0] * (w / 2 + 0.05),
          cz = (z0 + z1) / 2 + f[1] * (d / 2 + 0.05);
        stamp(pc, P.cyl(1.6, 1.6, 0.1, 0, 0, 0, [0.95, 0.93, 0.86], 20, 0.5, 0, Math.PI / 2), place(cx, b.h - 3, cz, yaw));
        stamp(pc, P.box(0.12, 1.2, 0.16, 0, 0.5, 0.1, [0.1, 0.1, 0.1]), place(cx, b.h - 3, cz, yaw));
        stamp(pc, P.box(0.9, 0.12, 0.16, 0.4, 0, 0.1, [0.1, 0.1, 0.1]), place(cx, b.h - 3, cz, yaw));
      }
    }
  }

  // ---------------- one-offs ----------------
  for (const s of PLAN.special) {
    if (s.type === "gas") {
      const c = s.canopy,
        g = C(42, 260).facade,
        pc = C(42, 260).props,
        sg = signUV(fa, 18);
      fbox(g, c.x0, c.x1, c.y0, c.y1, c.z0, c.z1, L.blank, L.roof, 4, 4, [1, 1, 1], true);
      const cx = (c.x0 + c.x1) / 2,
        cz = (c.z0 + c.z1) / 2;
      for (const [ax, az, bx, bz] of [
        [cx - 3.2, c.z1 + 0.03, cx + 3.2, c.z1 + 0.03],
        [cx + 3.2, c.z0 - 0.03, cx - 3.2, c.z0 - 0.03],
        [c.x1 + 0.03, cz + 3.2, c.x1 + 0.03, cz - 3.2],
        [c.x0 - 0.03, cz - 3.2, c.x0 - 0.03, cz + 3.2],
      ])
        wall(g, ax, az, bx, bz, c.y0 + 0.02, c.y1 - 0.02, sg.layer, 0, 1, sg.v0, sg.v1);
      for (const x of [30, 54])
        for (const z of [257, 265]) stamp(pc, P.box(0.5, c.y0 - CURB, 0.5, 0, (c.y0 - CURB) / 2, 0, [0.92, 0.92, 0.9], 0.4, 0.1), place(x, CURB, z)), box(x - 0.3, 0, z - 0.3, x + 0.3, c.y0, z + 0.3, "pillar");
      for (const p of s.pumps) stamp(pc, TPL.pump, place(p.x, CURB, (p.z0 + p.z1) / 2)), box(p.x - 0.55, 0, p.z0 + 2.6, p.x + 0.55, 2.0, p.z1 - 2.6, "pump");
      box(c.x0, c.y0, c.z0, c.x1, c.y1, c.z1, "canopy", true);
      roofSurf(c.x0, c.z0, c.x1, c.z1, c.y1, "canopy");
      // price pylon
      const py = s.pylon;
      stamp(pc, P.box(0.35, 7, 0.35, 0, 3.5, 0, [0.85, 0.85, 0.83]), place(py.x, CURB, py.z));
      stamp(pc, P.box(4.3, 1.3, 0.3, 0, 0, 0, [0.85, 0.12, 0.1]), place(py.x, CURB + 6.4, py.z));
      wall(g, py.x - 2, py.z + 0.17, py.x + 2, py.z + 0.17, CURB + 5.9, CURB + 6.9, sg.layer, 0, 1, sg.v0, sg.v1);
      wall(g, py.x + 2, py.z - 0.17, py.x - 2, py.z - 0.17, CURB + 5.9, CURB + 6.9, sg.layer, 0, 1, sg.v0, sg.v1);
      box(py.x - 0.4, 0, py.z - 0.4, py.x + 0.4, 7.2, py.z + 0.4, "pole");
    } else if (s.type === "garage") {
      const r = s.g.ramp,
        g = C(-220, 376).facade,
        pc = C(-220, 376).props,
        run = r.x1 - r.x0,
        rise = r.y1 - r.y0,
        U = run / 4,
        Vv = (r.z1 - r.z0) / 4;
      quad4(g, [[r.x0, r.y0, r.z0], [r.x0, r.y0, r.z1], [r.x1, r.y1, r.z1], [r.x1, r.y1, r.z0]], [[0, 0], [0, Vv], [U, Vv], [U, 0]], L.conc, [0.92, 0.92, 0.92]);
      quad4(g, [[r.x0, 0, r.z1], [r.x1, 0, r.z1], [r.x1, r.y1, r.z1], [r.x0, r.y0, r.z1]], [[0, 0], [U, 0], [U, r.y1 / 4], [0, r.y0 / 4]], L.conc, [1, 1, 1]);
      quad4(g, [[r.x1, 0, r.z0], [r.x0, 0, r.z0], [r.x0, r.y0, r.z0], [r.x1, r.y1, r.z0]], [[0, 0], [U, 0], [U, r.y0 / 4], [0, r.y1 / 4]], L.conc, [1, 1, 1]);
      const ang = Math.atan2(rise, run);
      for (let k = 0; k < Math.round(run / 10); k++) {
        const t = (k + 0.5) / Math.round(run / 10),
          x = r.x0 + run * t,
          y = r.y0 + rise * t;
        for (const z of [r.z0 + 0.15, r.z1 - 0.15]) stamp(pc, TPL.rail, M.makeTranslation(x, y, z).multiply(R.makeRotationZ(ang)).multiply(Sm.makeScale(run / Math.round(run / 10) / 10 / Math.cos(ang), 1, 1)));
      }
      // drivable ramp: fine steps as surfaces, a few stepped boxes as its body
      const N = 120;
      for (let i = 0; i < N; i++) surfaces.push({ min: V(r.x0 + (run * i) / N, 0, r.z0), max: V(r.x0 + (run * (i + 1)) / N, r.y0 + (rise * (i + 0.5)) / N, r.z1), name: "garage" });
      for (let k = 1; k < 8; k++) box(r.x0 + (run * k) / 8, 0, r.z0, r.x0 + (run * (k + 1)) / 8, r.y0 + (rise * k) / 8 - 0.8, r.z1, "ramp", true);
      for (const [x, z] of [
        [s.g.x0 + 6, s.g.z0 + 6],
        [s.g.x1 - 6, s.g.z0 + 6],
        [s.g.x0 + 6, s.g.z1 - 6],
        [s.g.x1 - 6, s.g.z1 - 6],
      ])
        stamp(pc, TPL.light, place(x, s.g.roof, z, x < (s.g.x0 + s.g.x1) / 2 ? Math.PI / 2 : -Math.PI / 2));
    } else if (s.type === "fountain") {
      put(TPL.fountain, s.x, CURB, s.z);
      box(s.x - 5, 0, s.z - 5, s.x + 5, 0.85, s.z + 5, "fountain");
    } else if (s.type === "motelSign") {
      const g = C(s.x, s.z).facade,
        sg = signUV(fa, 22);
      put(P.cyl(0.22, 0.28, 9, 0, 4.5, 0, [0.85, 0.85, 0.83], 8), s.x, CURB, s.z);
      put(P.box(6.4, 1.8, 0.3, 0, 0, 0, [0.95, 0.75, 0.2]), s.x, CURB + 7.6, s.z);
      wall(g, s.x - 3, s.z + 0.17, s.x + 3, s.z + 0.17, CURB + 6.9, CURB + 8.3, sg.layer, 0, 1, sg.v0, sg.v1);
      wall(g, s.x + 3, s.z - 0.17, s.x - 3, s.z - 0.17, CURB + 6.9, CURB + 8.3, sg.layer, 0, 1, sg.v0, sg.v1);
      box(s.x - 0.4, 0, s.z - 0.4, s.x + 0.4, 9, s.z + 0.4, "pole");
    }
  }

  // ---------------- billboards ----------------
  for (const bb of PLAN.billboards) {
    const c = Math.cos(bb.yaw),
      sn = Math.sin(bb.yaw),
      W2 = (lx, lz) => [bb.x + lx * c + lz * sn, bb.z - lx * sn + lz * c],
      g = C(bb.x, bb.z).facade,
      y0 = bb.y + bb.pole;
    stamp(C(bb.x, bb.z).props, P.billboardFrame(bb.pole, bb.roof), place(bb.x, bb.y, bb.z, bb.yaw));
    const [ax, az] = W2(-6, 0.02),
      [mx, mz] = W2(0, 0.02),
      [bx, bz] = W2(6, 0.02);
    wall(g, ax, az, mx, mz, y0, y0 + 6, fa.bbBase + bb.design * 2, 0, 1, 0, 1);
    wall(g, mx, mz, bx, bz, y0, y0 + 6, fa.bbBase + bb.design * 2 + 1, 0, 1, 0, 1);
    const pts = [W2(-6.2, -0.5), W2(6.2, -0.5), W2(-6.2, 0.1), W2(6.2, 0.1)];
    box(Math.min(...pts.map((p) => p[0])), y0, Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), y0 + 6.4, Math.max(...pts.map((p) => p[1])), "billboard");
    if (!bb.roof) {
      const [px, pz] = W2(0, -0.4);
      box(px - 0.5, 0, pz - 0.5, px + 0.5, y0, pz + 0.5, "pole");
    }
  }

  // ---------------- street furniture, palms, trees ----------------
  const sigT = {};
  const signalTpl = (arm, group) => {
    const k = arm + "/" + group;
    if (!sigT[k]) {
      const t = P.signalPole(arm).clone();
      if (group) {
        const a = t.attributes.aPM;
        for (let i = 0; i < a.count; i++) a.getZ(i) > 0.5 && a.setZ(i, a.getZ(i) + 3);
      }
      sigT[k] = t;
    }
    return sigT[k];
  };
  for (const l of PLAN.lights) put(l.double ? TPL.dlight : TPL.light, l.x, l.y, l.z, l.yaw);
  for (const s of PLAN.signals) put(signalTpl(s.arm, s.group), s.x, s.y, s.z, s.yaw);
  for (const b of PLAN.benches) put(TPL.bench, b.x, b.y, b.z, b.yaw);
  const trunks = [7, 9, 11].map((h) => P.palmTrunk(h)),
    trees = [1, 2, 3, 4].map((k) => P.shadeTree(k * 7919));
  let pi = 0;
  for (const p of PLAN.palms) {
    const k = p.h < 8 ? 0 : p.h < 10 ? 1 : 2,
      t = trunks[k],
      th = [7, 9, 11][k],
      yaw = ((pi++ * 2.39996) % (Math.PI * 2)) - Math.PI,
      sy = p.h / th;
    stamp(C(p.x, p.z).props, t.geo, place(p.x, p.y, p.z, yaw, 1, sy, 1));
    const tx = p.x + t.top[0] * Math.cos(yaw),
      tz = p.z - t.top[0] * Math.sin(yaw);
    C(p.x, p.z).crowns.push(new Matrix4().makeTranslation(tx, p.y + p.h, tz).multiply(new Matrix4().makeRotationY(yaw * 3.1)).multiply(new Matrix4().makeScale(0.9 + p.h * 0.03, 0.9 + p.h * 0.03, 0.9 + p.h * 0.03)));
  }
  PLAN.trees.forEach((t, i) => put(trees[i % 4], t.x, t.y, t.z, i * 1.7, t.s));
  // promenade railing on the sand side, with gaps for beach access and the pier plaza
  const PR = CITY.promenade;
  for (let x = PR.x0 + 5, k = 0; x < PR.x1; x += 10, k++) if (Math.abs(x) > 40 && k % 8 !== 3) put(TPL.rail, x, CURB, PR.z1 - 0.3);

  // ---------------- meshes ----------------
  const group = new Group();
  group.name = "city";
  const crownGeo = P.palmCrown(),
    col = new Color(),
    stats = { meshes: 0, triangles: 0 };
  const add = (m, cast = true) => {
    m.castShadow = cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    stats.meshes++;
    stats.triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1);
    return m;
  };
  const gm = add(new Mesh(groundG.build(), mats.ground), false),
    pm = add(new Mesh(paintG.build(), mats.paint), false);
  gm.userData.noStaticShadow = pm.userData.noStaticShadow = true;
  for (const c of chunks) {
    const fg = c.facade.build(),
      pg = c.props.build();
    if (fg) add(new Mesh(fg, mats.facade));
    if (pg) c.detail.push(add(new Mesh(pg, mats.props), true));
    if (c.crowns.length) {
      const im = new InstancedMesh(crownGeo, mats.frond, c.crowns.length);
      c.crowns.forEach((m, i) => (im.setMatrixAt(i, m), im.setColorAt(i, col.setRGB(0.85 + 0.3 * ((i * 0.37) % 1), 0.95 + 0.1 * ((i * 0.61) % 1), 0.8 + 0.2 * ((i * 0.73) % 1)))));
      im.computeBoundingSphere();
      im.userData.noStaticShadow = true;
      c.detail.push(add(im, !opts.mobile));
    }
  }
  scene.add(group);
  group.updateMatrixWorld(true);
  bakeCityShadow(renderer, group, DAY.sunDir, opts.mobile ? 1024 : 2048, { x0: -490, x1: 490, z0: 160, z1: 680, top: 72 });

  const update = (camera, t = 0) => {
    const cx = camera.position.x,
      cz = camera.position.z;
    for (const c of chunks) {
      const dx = Math.max(c.x0 - cx, 0, cx - c.x1),
        dz = Math.max(c.z0 - cz, 0, cz - c.z1),
        vis = dx * dx + dz * dz < DETAIL * DETAIL;
      for (const m of c.detail) m.visible = vis;
    }
    const ph = t % 26,
      u = propUniforms.uSig.value;
    u[0] = ph < 10 ? 2 : ph < 13 ? 1 : 0;
    u[1] = ph < 13 ? 0 : ph < 23 ? 2 : 1;
  };
  stats.colliders = colliders.length;
  stats.surfaces = surfaces.length;
  stats.buildings = PLAN.buildings.length;
  return { group, colliders, surfaces, update, stats };
}

export { buildCity };
