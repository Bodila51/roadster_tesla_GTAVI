import { BoxGeometry, Group, Mesh } from "three";
import { lerp } from "../util/math.js";
import { Ht, Se, U, et, nt } from "./decals.js";
import { Ks } from "./loft.js";
import { vehicleMaterials } from "./materials.js";
import { Ii, Te } from "./parts.js";
import { Mt } from "./wheels.js";

function buildCybertruck() {
  const a = vehicleMaterials(),
    e = {
      R: 0.445,
      W: 0.29,
      rimR: 0.254,
      style: "aero",
      n: 6,
    },
    s = 2.86,
    t = -2.85,
    i = 1.9,
    o = -1.91,
    n = 0.44,
    c = (g) =>
      g >= 0.15
        ? lerp(1, 1.8, (s - g) / (s - 0.15))
        : lerp(1.8, 1.27, (0.15 - g) / (0.15 - t)),
    r = (g) =>
      g >= 1.2
        ? lerp(0.99, 1.25, (s - g) / (s - 1.2))
        : g >= 0
          ? lerp(1.25, 1.31, (1.2 - g) / 1.2)
          : lerp(1.31, 1.255, -g / -t),
    l = (g) =>
      g >= 0.15
        ? lerp(0.8, 0.6, (s - g) / (s - 0.15))
        : lerp(0.6, 0.74, (0.15 - g) / (0.15 - t)),
    d = (g, D) => {
      const P = Math.abs(g - D);
      return P >= 0.62 - 1e-6
        ? -1
        : P <= 0.2
          ? 0.99
          : P <= 0.45
            ? lerp(0.99, 0.9, (P - 0.2) / 0.25)
            : lerp(0.9, n, (P - 0.45) / 0.17);
    },
    f = (g) => {
      let D = n;
      return (
        g > 2.4 && (D = lerp(n, 0.5, (g - 2.4) / (2.76 - 2.4))),
        g < -2.4 && (D = lerp(n, 0.56, (-2.4 - g) / 0.45)),
        Math.max(D, d(g, i), d(g, o))
      );
    },
    p = (g) => {
      const D = f(g),
        P = r(g),
        k = c(g),
        R = l(g);
      return [
        [0, D],
        [0.86, D],
        [1.015, D + 0.1],
        [0.995, P],
        [R, k],
        [0, k],
      ];
    },
    w = [
      -2.53, -2.36, -2.11, -1.71, -1.46, -1.29, -1.05, -0.95, 0, 0.15, 1.2,
      1.28, 1.45, 1.7, 2.1, 2.35, 2.52, 2.76,
    ],
    S = [],
    y = p(t);
  S.push(y.map(([, g]) => [0, g, t])), S.push(y.map(([g, D]) => [g, D, t]));
  for (const g of w) S.push(p(g).map(([D, P]) => [D, P, g]));
  S.push(
    [
      [0, 1],
      [0.84, 1],
      [0.95, 1],
      [0.95, 1],
      [0.8, 1],
      [0, 1],
    ].map(([g, D]) => [g, D, s]),
  );
  const b = S.map((g) => g[0][2]),
    L = new Set(S.map((g, D) => D)),
    m = [a.steel, a.glass, a.under, a.plastic, a.tonneau],
    v = Ks(S, {
      sBreaks: L,
      cBreaks: new Set([1, 2, 3, 4]),
      nMat: m.length,
      matOf: (g, D) => {
        const P = (b[g] + b[g + 1]) / 2;
        return g === S.length - 2 || g === 0
          ? 0
          : D === 0
            ? 2
            : D === 1
              ? 3
              : D === 2
                ? 0
                : D === 3
                  ? P > -0.97 && P < 1.2
                    ? 1
                    : 0
                  : P > -0.97 && P < 1.2
                    ? 1
                    : P < -1.05
                      ? 4
                      : 0;
      },
    }),
    x = new Mesh(v, m);
  (x.castShadow = x.receiveShadow = !0), (x.name = "body");
  const h = new Group();
  h.add(x);
  const u = Se(x);
  h.add(
    et(
      u.front,
      U([
        [-0.94, 0.968],
        [0.94, 0.968],
      ]),
      0.03,
      a.trim,
      {
        offset: 0.003,
      },
    ),
  ),
    h.add(
      et(
        u.front,
        U([
          [-0.93, 0.968],
          [0.93, 0.968],
        ]),
        0.012,
        a.lightW,
        {
          offset: 0.006,
          wall: 0.002,
        },
      ),
    ),
    h.add(
      nt(
        u.front,
        [
          [-0.96, 0.51],
          [0.96, 0.51],
          [0.96, 0.64],
          [-0.96, 0.64],
        ],
        0.03,
        U,
        a.plastic,
        {},
      ),
    ),
    h.add(
      et(
        u.rear,
        U([
          [-0.985, 1.215],
          [0.985, 1.215],
        ]),
        0.04,
        a.lens,
        {
          offset: 0.003,
        },
      ),
    ),
    h.add(
      et(
        u.rear,
        U([
          [-0.975, 1.215],
          [0.975, 1.215],
        ]),
        0.016,
        a.lightR,
        {
          offset: 0.006,
          wall: 0.002,
        },
      ),
    ),
    h.add(
      nt(
        u.rear,
        [
          [-0.98, 0.57],
          [0.98, 0.57],
          [0.98, 0.7],
          [-0.98, 0.7],
        ],
        0.03,
        U,
        a.plastic,
        {},
      ),
    );
  for (const g of [u.right, u.left]) {
    for (const D of [i, o]) {
      const P = [
        [D + 0.67, 0.47],
        [D + 0.495, 0.945],
        [D + 0.215, 1.04],
        [D - 0.215, 1.04],
        [D - 0.495, 0.945],
        [D - 0.67, 0.47],
      ];
      h.add(
        et(g, Ht(P), 0.085, a.plastic, {
          offset: 0.004,
          wall: 0.012,
          ds: 0.012,
        }),
      );
    }
    for (const D of [
      [
        [1.2, 0.56],
        [1.2, 1.24],
      ],
      [
        [0.02, 0.55],
        [0.02, 1.3],
      ],
      [
        [-1.05, 0.55],
        [-1.05, 1.29],
      ],
    ])
      h.add(
        et(g, Ht(D), 0.004, a.seam, {
          offset: 0.002,
        }),
      );
  }
  const T = new BoxGeometry(0.16, 0.08, 0.13);
  for (const g of [-1, 1]) {
    const D = new Mesh(T, a.plastic);
    D.position.set(g * 1.07, 1.29, 1.12),
      (D.rotation.z = -g * 0.25),
      (D.castShadow = !0),
      h.add(D);
  }
  const z = 1 - e.W / 2 - 0;
  for (const g of [i, o])
    Mt(h, e, a.rimAero, z, g),
      Mt(h, e, a.rimAero, -z, g, !0),
      Ii(
        h,
        g,
        [
          [-0.6, 0.3],
          [-0.44, 0.88],
          [-0.2, 0.975],
          [0.2, 0.975],
          [0.44, 0.88],
          [0.6, 0.3],
        ],
        z - e.W / 2 - 0.03,
      );
  return Te(h, "cybertruck");
}

export { buildCybertruck };
