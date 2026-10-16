import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  Vector2,
} from "three";
import { PI } from "../util/math.js";
import { Ht, Se, U, _s, et, nt } from "./decals.js";
import { Xs } from "./loft.js";
import { vehicleMaterials } from "./materials.js";
import { Ne, Te, We } from "./parts.js";
import { Mt } from "./wheels.js";

function buildSemi() {
  const a = vehicleMaterials(),
    e = {
      R: 0.52,
      W: 0.3,
      rimR: 0.286,
      style: "truck",
      seg: 36,
    },
    s = 2.35,
    t = 0.6,
    i = Ne({
      zF: 3.35,
      zR: -0.15,
      rF: 0.42,
      pF: 2.3,
      rR: 0.16,
      pR: 3,
      rc: 0.07,
      kUp: 0,
      kDn: 0,
      arches: [
        {
          z: s,
          R: t,
          y: e.R,
        },
      ],
      yt: [
        [3.35, 1.3],
        [3.34, 1.45],
        [3.31, 1.58],
        [3.25, 1.7],
        [3.15, 1.86],
        [2.95, 2.15],
        [2.75, 2.45],
        [2.55, 2.72],
        [2.4, 2.9],
        [2.2, 3.13],
        [1.95, 3.4],
        [1.6, 3.7],
        [1.2, 3.92],
        [0.8, 4.04],
        [0.4, 4.09],
        [-0.15, 4.1],
      ],
      yBelt: [
        [3.35, 1.3],
        [3.3, 1.45],
        [3.2, 1.55],
        [3, 1.6],
        [-0.15, 1.6],
      ],
      ys: 1,
      yb: [
        [3.35, 0.4],
        [3, 0.4],
        [2, 0.45],
        [-0.15, 0.45],
      ],
      wl: [
        [3.35, 1.2],
        [2.9, 1.24],
        [-0.15, 1.25],
      ],
      wg: 1.25,
      sh: 0.004,
      wr: [
        [3.35, 0.98],
        [2.5, 1.04],
        [1.5, 1.1],
        [-0.15, 1.12],
      ],
      ng: [
        [3.35, 3.6],
        [2.6, 4.2],
        [1.5, 5],
        [-0.15, 5],
      ],
    }),
    o = new Group(),
    n = [a.white, a.glass, a.under, a.trim],
    c = Xs(i, n, (h, u) => (u === "bottom" ? 2 : 0), 0.05);
  o.add(c);
  const r = Se(c);
  o.add(
    nt(
      r.front,
      [
        [-1.13, 1.74],
        [1.13, 1.74],
        [1.02, 2.86],
        [-1.02, 2.86],
      ],
      [0.12, 0.12, 0.2, 0.2],
      U,
      a.glass,
      {
        offset: 0.005,
        ds: 0.04,
        seg: 8,
      },
    ),
  );
  for (const h of [r.right, r.left]) {
    o.add(
      nt(
        h,
        [
          [2.8, 1.98],
          [1.55, 1.98],
          [1.55, 2.98],
          [2.18, 2.98],
        ],
        0.1,
        Ht,
        a.glass,
        {
          offset: 0.005,
          ds: 0.04,
          seg: 6,
        },
      ),
    );
    for (const u of [
      [
        [1.74, 0.5],
        [1.74, 1.96],
      ],
      [
        [0.95, 0.5],
        [0.95, 3.05],
      ],
      [
        [1.5, 3.05],
        [0.95, 3.05],
      ],
    ])
      o.add(
        et(h, Ht(u), 0.006, a.seam, {
          offset: 0.002,
          ds: 0.02,
        }),
      );
  }
  const l = [];
  for (let h = 0; h <= 30; h++) {
    const u = -1.04 + (2.08 * h) / 30;
    l.push([u, 1.18 + 0.05 * Math.pow(Math.abs(u) / 1.04, 4)]);
  }
  o.add(
    et(r.front, U(l), 0.075, a.trim, {
      offset: 0.004,
      ds: 0.015,
    }),
  ),
    o.add(
      et(r.front, U(l), 0.026, a.lightW, {
        offset: 0.0075,
        wall: 0.003,
        ds: 0.015,
      }),
    ),
    o.add(
      nt(
        r.front,
        [
          [-1.13, 0.44],
          [1.13, 0.44],
          [1.14, 0.84],
          [-1.14, 0.84],
        ],
        0.08,
        U,
        a.plastic,
        {
          ds: 0.04,
        },
      ),
    );
  for (const h of [-0.6, -0.3, 0, 0.3, 0.6])
    o.add(
      nt(
        r.front,
        [
          [h - 0.04, 2.95],
          [h + 0.04, 2.95],
          [h + 0.04, 2.985],
          [h - 0.04, 2.985],
        ],
        0.015,
        U,
        a.lightA,
        {
          offset: 0.008,
        },
      ),
    );
  for (const h of [-1, 1]) {
    const u = new Mesh(new BoxGeometry(0.22, 0.05, 0.06), a.plastic);
    u.position.set(h * 1.27, 2.02, 2.72), o.add(u);
    const T = new Mesh(new CapsuleGeometry(0.06, 0.26, 4, 12), a.plastic);
    T.position.set(h * 1.36, 2.05, 2.74), (T.castShadow = !0), o.add(T);
  }
  const d = new Shape(
      _s(
        [
          [-0.15, 0.45],
          [-0.92, 0.45],
          [-0.92, 1.3],
          [-0.15, 1.3],
        ],
        [0, 0.14, 0.14, 0],
        6,
      ).map(([h, u]) => new Vector2(h, u)),
    ),
    f = new ExtrudeGeometry(d, {
      depth: 0.05,
      bevelEnabled: !0,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
    }).rotateY(-PI / 2);
  for (const h of [-1, 1]) {
    const u = new Mesh(f, a.white);
    u.position.set(h > 0 ? 1.245 : -1.195, 0, 0),
      (u.castShadow = u.receiveShadow = !0),
      o.add(u);
  }
  const p = (h, u, T, z, g, D, P) => {
    const k = new Mesh(new BoxGeometry(h, u, T), P);
    return (
      k.position.set(z, g, D),
      (k.castShadow = k.receiveShadow = !0),
      o.add(k),
      k
    );
  };
  p(2.3, 0.75, 0.78, 0, 0.84, -0.54, a.under);
  for (const h of [-1, 1]) p(0.1, 0.28, 3.55, h * 0.47, 0.95, -1.55, a.frame);
  for (const h of [-0.9, -2.1, -3.25]) p(0.85, 0.16, 0.12, 0, 0.93, h, a.frame);
  const w = [];
  for (let h = 0; h <= 40; h++) {
    const u = 0.32 + ((2 * PI - 0.64) * h) / 40;
    w.push(new Vector2(0.46 * Math.sin(u), 0.46 * Math.cos(u)));
  }
  w.push(
    new Vector2(-0.06, 0.18),
    new Vector2(0, 0.05),
    new Vector2(0.06, 0.18),
  );
  const S = new ExtrudeGeometry(new Shape(w), {
      depth: 0.06,
      bevelEnabled: !0,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
    }).rotateX(-PI / 2),
    y = new Mesh(S, a.frame);
  y.position.set(0, 1.17, -2.1),
    (y.castShadow = y.receiveShadow = !0),
    o.add(y);
  for (const h of [-1, 1]) p(0.12, 0.12, 0.7, h * 0.47, 1.13, -2.1, a.frame);
  for (const h of [-1.45, -2.75]) {
    const u = new Mesh(
      new CylinderGeometry(0.09, 0.09, 1.9, 20).rotateZ(PI / 2),
      a.frame,
    );
    u.position.set(0, e.R, h),
      o.add(u),
      p(0.55, 0.36, 0.42, 0, e.R + 0.04, h, a.frame);
    for (const T of [-1, 1])
      Mt(o, e, a.rimPolished, T * 1.13, h, T < 0),
        Mt(
          o,
          {
            ...e,
            style: "plain",
            seg: 32,
          },
          a.rimPolished,
          T * 0.815,
          h,
          T > 0,
        );
  }
  const b = [],
    L = [];
  for (let h = 0; h <= 16; h++) {
    const u = h / 16,
      T = (u * PI) / 2;
    b.push([-0.86 - 0.16 * Math.sin(T), 0.8 + 0.33 * (1 - Math.cos(T))]);
  }
  b.push([-3.18, 1.13]);
  for (let h = 0; h <= 12; h++) {
    const u = ((h / 12) * PI) / 2;
    b.push([-3.18 - 0.14 * Math.sin(u), 1.13 - 0.33 * (1 - Math.cos(u))]);
  }
  for (let h = b.length - 1; h >= 0; h--)
    L.push([b[h][0] + (h < 17 ? 0.025 : -0.025) * 0, b[h][1] - 0.028]);
  const m = new Shape(b.concat(L).map(([h, u]) => new Vector2(h, u))),
    v = new ExtrudeGeometry(m, {
      depth: 0.66,
      bevelEnabled: !1,
      curveSegments: 4,
    }).rotateY(-PI / 2);
  for (const h of [-1, 1]) {
    const u = new Mesh(v, a.plastic);
    u.position.set(h > 0 ? 1.3 : -0.64, 0, 0),
      (u.castShadow = !0),
      o.add(u),
      p(0.6, 0.62, 0.015, h * 0.98, 0.52, -3.33, a.plastic);
  }
  p(1.95, 0.12, 0.08, 0, 0.93, -3.3, a.frame);
  for (const h of [-1, 1])
    p(0.26, 0.09, 0.03, h * 0.62, 0.93, -3.35, a.lightR),
      p(0.08, 0.09, 0.03, h * 0.4, 0.93, -3.35, a.lightW2);
  const x = 1.25 - e.W / 2 - 0.03;
  return (
    Mt(o, e, a.rimPolished, x, s),
    Mt(o, e, a.rimPolished, -x, s, !0),
    We(o, s, e.R, t - 0.005, x - e.W / 2 - 0.04, 0.42),
    Te(o, "semi")
  );
}

export { buildSemi };
