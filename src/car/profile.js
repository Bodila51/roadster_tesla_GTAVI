import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Mesh,
  ShapeUtils,
  TubeGeometry,
  Vector2,
} from "three";
import { profileSpline } from "./loft.js";

const CAR_DIMS = {
    wheelRadius: 0.325,
    frontAxle: 1.36,
    rearAxle: -1.48,
    track: 0.84,
  },
  Bt = -2.2,
  Yt = 2.2,
  xt = {
    yb: profileSpline([
      [-2.2, 0.3],
      [-1.95, 0.17],
      [-1.6, 0.12],
      [1.7, 0.12],
      [2, 0.14],
      [2.2, 0.16],
    ]),
    wSill: profileSpline([
      [-2.2, 0.86],
      [-1.85, 0.92],
      [-0.6, 0.8],
      [0.7, 0.8],
      [1.8, 0.84],
      [2.2, 0.6],
    ]),
    wSh: profileSpline([
      [-2.2, 0.97],
      [-2, 1.01],
      [-1.55, 1.045],
      [-1, 1],
      [-0.4, 0.96],
      [0.5, 0.95],
      [1.36, 0.975],
      [1.75, 0.92],
      [2, 0.83],
      [2.2, 0.72],
    ]),
    ySh: profileSpline([
      [-2.2, 0.86],
      [-1.6, 0.915],
      [-1.08, 0.925],
      [-0.39, 0.79],
      [0.4, 0.73],
      [0.9, 0.725],
      [1.36, 0.735],
      [1.65, 0.69],
      [1.95, 0.585],
      [2.2, 0.46],
    ]),
    wSide: profileSpline([
      [-2.2, 0.93],
      [-1.5, 1],
      [-0.6, 0.9],
      [0.6, 0.89],
      [1.36, 0.95],
      [1.9, 0.85],
      [2.2, 0.69],
    ]),
    ySide: profileSpline([
      [-2.2, 0.62],
      [-1.48, 0.6],
      [-0.6, 0.48],
      [0.6, 0.4],
      [1.36, 0.4],
      [2.2, 0.33],
    ]),
    wLow: profileSpline([
      [-2.2, 0.9],
      [-1.5, 0.96],
      [-0.6, 0.84],
      [0.6, 0.83],
      [1.36, 0.91],
      [1.9, 0.81],
      [2.2, 0.64],
    ]),
    yLow: profileSpline([
      [-2.2, 0.56],
      [-1.85, 0.5],
      [-1.13, 0.36],
      [0.79, 0.216],
      [2.2, 0.22],
    ]),
    wDeck: profileSpline([
      [-2.2, 0.6],
      [-1.68, 0.62],
      [-1, 0.72],
      [-0.1, 0.76],
      [0.7, 0.75],
      [1.22, 0.72],
      [2.2, 0.72],
    ]),
    yDeck: profileSpline([
      [-2.2, 0.88],
      [-1.6, 0.93],
      [-1.08, 0.96],
      [-0.5, 1.03],
      [0.2, 1],
      [0.7, 0.9],
      [1.22, 0.7],
      [2.2, 0.6],
    ]),
    yRoof: profileSpline([
      [-2.2, 0.864],
      [-1.62, 0.94],
      [-1.1, 1.02],
      [-0.54, 1.117],
      [-0.23, 1.127],
      [0.23, 1.11],
      [0.694, 0.99],
      [1, 0.9],
      [1.22, 0.8],
      [1.45, 0.765],
      [1.75, 0.69],
      [2, 0.59],
      [2.2, 0.475],
    ]),
    wRS: profileSpline([
      [-2.2, 0.5],
      [-1.68, 0.46],
      [-1.1, 0.58],
      [-0.3, 0.645],
      [0.5, 0.63],
      [1, 0.6],
      [1.3, 0.58],
      [1.7, 0.51],
      [2.2, 0.43],
    ]),
  },
  Zc = (n, e, t) => {
    const i = Math.min(1, Math.max(0, (t - n) / (e - n)));
    return i * i * (3 - 2 * i);
  },
  Ht = (n, e, t) => n + (e - n) * t,
  ar = {
    zFront: 1.22,
    zRear: -1.68,
  },
  I0 = 0.325,
  dr = 0.355;
function jl(n, e) {
  let t = e;
  for (const i of [CAR_DIMS.frontAxle, CAR_DIMS.rearAxle]) {
    const s = n - i;
    Math.abs(s) < dr && (t = Math.max(t, I0 + Math.sqrt(dr * dr - s * s)));
  }
  return t;
}
function makeSections() {
  const n = [],
    e = [];
  for (let t = Bt; t <= Yt + 1e-6; t += 0.02) e.push(+t.toFixed(4));
  for (const t of e) {
    const i = xt.yb(t),
      s = jl(t, i),
      r = s > i + 0.01,
      a = xt.wSill(t),
      o = Math.min(0.55, a - 0.05),
      c = Math.max(xt.ySh(t), s + 0.035),
      l = {
        y: i + 0.04,
        x: a + 0.03,
      },
      u = {
        y: Math.min(xt.yLow(t), c - 0.12),
        x: xt.wLow(t),
      },
      h = {
        y: Math.min(Math.max(xt.ySide(t), u.y + 0.04), c - 0.06),
        x: xt.wSide(t),
      },
      p = {
        y: c,
        x: xt.wSh(t),
      },
      d = [l, u, h, p],
      g = (ie) => {
        if (ie <= d[0].y) return d[0].x;
        for (let N = 0; N < d.length - 1; N++) {
          const k = d[N],
            se = d[N + 1];
          if (ie <= se.y)
            return Ht(k.x, se.x, (ie - k.y) / Math.max(1e-4, se.y - k.y));
        }
        return d[d.length - 1].x;
      },
      v = r ? s + 0.02 : l.y,
      m = c - 0.012,
      f = (ie, N) => Math.min(Math.max(ie, v + 0.006 * N), m - 0.004 * (3 - N)),
      y = Math.min(v, m - 0.012),
      M = f(u.y, 1),
      x = f(h.y, 2),
      I = r ? g(s) - 0.01 : a,
      R = {
        x: xt.wSh(t),
        y: c,
      },
      P = Math.max(xt.yRoof(t), c + 0.03),
      E = Zc(1.3, 1.16, t) * Zc(-1.9, -1.64, t),
      D = {
        x: xt.wRS(t),
        y: P - 0.008,
      },
      G = {
        x: Ht(D.x, R.x, 0.34),
        y: Ht(D.y, R.y, 0.34),
      },
      O = {
        x: Ht(D.x, R.x, 0.67),
        y: Ht(D.y, R.y, 0.67),
      },
      H = {
        x: xt.wDeck(t),
        y: Math.max(xt.yDeck(t), c + 0.03),
      },
      Q = {
        x: H.x - 0.035,
        y: H.y + 0.03,
      },
      z = {
        x: Math.min(xt.wRS(t), Q.x - 0.03),
        y: Math.max(Q.y + 0.02, P - 0.075),
      },
      Z = (ie, N) => ({
        x: Ht(ie.x, N.x, E),
        y: Ht(ie.y, N.y, E),
      }),
      X = Z(O, H),
      oe = Z(G, Q),
      ue = Z(D, z),
      xe = {
        x: ue.x * 0.55,
        y: Ht(P, ue.y, 0.3 * E + 0),
      },
      j = [
        {
          x: 0,
          y: i,
        },
        {
          x: o,
          y: i,
          crease: !0,
        },
        {
          x: o,
          y: s,
          crease: !0,
        },
        {
          x: I,
          y: s,
          crease: !0,
        },
        {
          x: g(y),
          y,
          crease: !0,
        },
        {
          x: g(M),
          y: M,
          crease: !0,
        },
        {
          x: g(x),
          y: x,
        },
        {
          x: R.x,
          y: R.y,
          crease: !0,
        },
        {
          x: X.x,
          y: X.y,
          crease: !0,
        },
        {
          x: oe.x,
          y: oe.y,
          crease: !0,
        },
        {
          x: ue.x,
          y: ue.y,
          crease: E < 0.5,
        },
        {
          x: xe.x,
          y: xe.y,
        },
        {
          x: 0,
          y: P,
        },
      ];
    n.push({
      z: t,
      pts: j,
      inArch: r,
    });
  }
  return n;
}
function kn(n, e) {
  let t = n[0];
  for (const i of n) Math.abs(i.z - e) < Math.abs(t.z - e) && (t = i);
  return t;
}
function Bi(n, e, t, i) {
  const s = [];
  for (let r = 0; r < n.length; r++) {
    const a = n[r],
      o = n[(r + 1) % n.length],
      c = e * a[0] + t * a[1] + i,
      l = e * o[0] + t * o[1] + i;
    if ((c >= 0 && s.push(a), c >= 0 != l >= 0)) {
      const u = c / (c - l);
      s.push([a[0] + (o[0] - a[0]) * u, a[1] + (o[1] - a[1]) * u]);
    }
  }
  return s;
}
function ds(n, e, t, i) {
  if (n.length < 3) return null;
  const s = n.map((l) => new Vector2(l[0], l[1]));
  ShapeUtils.isClockWise(s) && s.reverse();
  const r = ShapeUtils.triangulateShape(s, []),
    a = [],
    o = [];
  for (const l of r) {
    const u = t > 0 ? [l[0], l[1], l[2]] : [l[0], l[2], l[1]];
    for (const h of u) a.push(s[h].x, s[h].y, e), o.push(0, 0, t);
  }
  const c = new BufferGeometry();
  return (
    c.setAttribute("position", new Float32BufferAttribute(a, 3)),
    c.setAttribute("normal", new Float32BufferAttribute(o, 3)),
    new Mesh(c, i)
  );
}
function jc(n) {
  const e = n.pts,
    t = e.map((i) => [i.x, i.y]);
  for (let i = e.length - 2; i > 0; i--) t.push([-e[i].x, e[i].y]);
  return t;
}
function Ni(n, e, t, i = !1) {
  const s = new CatmullRomCurve3(n, i, "catmullrom", 0.1);
  return new Mesh(new TubeGeometry(s, Math.max(8, n.length * 6), e, 6, i), t);
}

export {
  Bi,
  Bt,
  CAR_DIMS,
  Ht,
  Ni,
  Yt,
  ar,
  dr,
  ds,
  jc,
  jl,
  kn,
  makeSections,
  xt,
};
