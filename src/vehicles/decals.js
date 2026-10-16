import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
} from "three";
import { Vec3, clamp, lerp, mergeGeometries } from "../util/math.js";
import { SurfaceProjector } from "./projector.js";

function Pi(a, e, s) {
  const t = a,
    i = [];
  for (let o = 0; o < t.length - 1; o++) {
    const n = t[o],
      c = t[o + 1],
      r = n.distanceTo(c),
      l = Math.max(1, Math.ceil(r / e));
    for (let d = 0; d < l; d++) i.push(n.clone().lerp(c, d / l));
  }
  return i.push(t[t.length - 1].clone()), i;
}
function Js(a, e, s) {
  let t = 0;
  const i = new Vec3(),
    o = new Vec3(),
    n = new Vec3();
  for (let l = 0; l < e.length; l += 3) {
    i.fromArray(a, e[l] * 3),
      o.fromArray(a, e[l + 1] * 3),
      n.fromArray(a, e[l + 2] * 3);
    const d = o.sub(i).cross(n.sub(i));
    t += d.dot(s[e[l]]);
  }
  if (t < 0)
    for (let l = 0; l < e.length; l += 3) {
      const d = e[l + 1];
      (e[l + 1] = e[l + 2]), (e[l + 2] = d);
    }
  const c = new BufferGeometry();
  c.setAttribute("position", new Float32BufferAttribute(a, 3));
  const r = new Float32Array((a.length / 3) * 2);
  return (
    c.setAttribute("uv", new BufferAttribute(r, 2)),
    c.setIndex(e),
    c.computeVertexNormals(),
    c
  );
}
function nt(
  a,
  e,
  s,
  t,
  i,
  { offset: o = 0.004, ds: n = 0.025, seg: c = 6 } = {},
) {
  const r = _s(e, s, c),
    l = c + 1,
    d = c >> 1,
    f = [0, 1, 2, 3].map((V) => V * l + d),
    p = (V) => {
      const O = [],
        W = f[V],
        at = f[(V + 1) % 4] + (V === 3 ? r.length : 0);
      for (let $ = W; $ <= at; $++) O.push(r[$ % r.length]);
      return O;
    },
    w = (V, O) => {
      const W = [0];
      for (let K = 1; K < V.length; K++)
        W.push(
          W[K - 1] + Math.hypot(V[K][0] - V[K - 1][0], V[K][1] - V[K - 1][1]),
        );
      const at = W[W.length - 1] || 1,
        $ = [];
      let Q = 0;
      for (let K = 0; K <= O; K++) {
        const Pt = (at * K) / O;
        for (; Q < V.length - 2 && W[Q + 1] < Pt; ) Q++;
        const Wt = clamp((Pt - W[Q]) / (W[Q + 1] - W[Q] || 1), 0, 1);
        $.push([
          lerp(V[Q][0], V[Q + 1][0], Wt),
          lerp(V[Q][1], V[Q + 1][1], Wt),
        ]);
      }
      return $;
    },
    S = (V) => {
      let O = 0;
      for (let W = 1; W < V.length; W++)
        O += Math.hypot(V[W][0] - V[W - 1][0], V[W][1] - V[W - 1][1]);
      return O;
    },
    y = p(0),
    b = p(1),
    L = p(2),
    m = p(3),
    v = clamp(Math.ceil(Math.max(S(y), S(L)) / n), 2, 90),
    x = clamp(Math.ceil(Math.max(S(b), S(m)) / n), 2, 60),
    h = w(y, v),
    u = w(L, v).reverse(),
    T = w(b, x),
    z = w(m, x).reverse(),
    g = h[0],
    D = h[v],
    P = u[0],
    k = u[v],
    R = [],
    A = [],
    C = [];
  for (let V = 0; V <= x; V++) {
    const O = V / x;
    for (let W = 0; W <= v; W++) {
      const at = W / v,
        $ = [0, 1].map(
          (K) =>
            (1 - O) * h[W][K] +
            O * u[W][K] +
            (1 - at) * z[V][K] +
            at * T[V][K] -
            ((1 - at) * (1 - O) * g[K] +
              at * (1 - O) * D[K] +
              (1 - at) * O * P[K] +
              at * O * k[K]),
        ),
        Q = a.cast(t([$])[0]);
      Q
        ? (R.push(Q.p.x + Q.n.x * o, Q.p.y + Q.n.y * o, Q.p.z + Q.n.z * o),
          A.push(Q.n),
          C.push(!0))
        : (R.push(0, 0, 0), A.push(new Vec3()), C.push(!1));
    }
  }
  const B = [],
    N = v + 1;
  for (let V = 0; V < x; V++)
    for (let O = 0; O < v; O++) {
      const W = V * N + O,
        at = W + 1,
        $ = W + N + 1,
        Q = W + N;
      C[W] && C[at] && C[$] && B.push(W, at, $),
        C[W] && C[$] && C[Q] && B.push(W, $, Q);
    }
  const q = new Mesh(Js(R, B, A), i);
  return (q.receiveShadow = !0), q;
}
function et(a, e, s, t, { offset: i = 0.005, ds: o = 0.01, wall: n = 0 } = {}) {
  const c = Pi(e, o),
    r = c.length,
    l = [],
    d = [],
    f = [],
    p = [],
    w = [];
  for (let m = 0; m < r; m++) {
    const [v, x] = a.uv(c[m]),
      [h, u] = a.uv(c[Math.max(0, m - 1)]),
      [T, z] = a.uv(c[Math.min(r - 1, m + 1)]);
    let g = T - h,
      D = z - u;
    const P = Math.hypot(g, D) || 1;
    (g /= P), (D /= P);
    const k = -D,
      R = g;
    for (const A of [-1, 1]) {
      const C = a.cast(a.fromUV(v + (k * A * s) / 2, x + (R * A * s) / 2));
      C
        ? (p.push(l.length / 3),
          l.push(
            C.p.x + C.n.x * (i + n),
            C.p.y + C.n.y * (i + n),
            C.p.z + C.n.z * (i + n),
          ),
          d.push(C.n),
          f.push(!0),
          n > 0 && w.push(C))
        : (p.push(l.length / 3),
          l.push(0, 0, 0),
          d.push(new Vec3()),
          f.push(!1),
          n > 0 && w.push(null));
    }
  }
  const S = [],
    y = (m, v, x) => {
      f[m] && f[v] && f[x] && S.push(m, v, x);
    };
  for (let m = 0; m < r - 1; m++) {
    const v = 2 * m,
      x = 2 * m + 1,
      h = 2 * m + 3,
      u = 2 * m + 2;
    y(v, x, h), y(v, h, u);
  }
  let b = Js(l, S, d);
  if (n > 0) {
    const m = [],
      v = [],
      x = [];
    for (const T of [0, 1]) {
      const z = m.length / 3;
      for (let g = 0; g < r; g++) {
        const D = w[2 * g + T],
          P = 2 * g + T;
        if (!D) {
          m.push(0, 0, 0, 0, 0, 0), x.push(new Vec3(), new Vec3());
          continue;
        }
        m.push(l[P * 3], l[P * 3 + 1], l[P * 3 + 2]),
          m.push(
            D.p.x + D.n.x * 8e-4,
            D.p.y + D.n.y * 8e-4,
            D.p.z + D.n.z * 8e-4,
          ),
          x.push(D.n, D.n);
      }
      for (let g = 0; g < r - 1; g++) {
        if (!w[2 * g + T] || !w[2 * g + 2 + T]) continue;
        const D = z + 2 * g,
          P = D + 1,
          k = D + 3,
          R = D + 2;
        T === 0 ? v.push(D, P, k, D, k, R) : v.push(D, k, P, D, R, k);
      }
    }
    const h = new BufferGeometry();
    h.setAttribute("position", new Float32BufferAttribute(m, 3)),
      h.setAttribute(
        "uv",
        new BufferAttribute(new Float32Array((m.length / 3) * 2), 2),
      ),
      h.setIndex(v),
      h.computeVertexNormals();
    const u = mergeGeometries([b, h]);
    b.dispose(), h.dispose(), (b = u);
  }
  const L = new Mesh(b, t);
  return (L.receiveShadow = !0), L;
}
function _s(a, e, s = 6) {
  const t = [],
    i = a.length;
  for (let o = 0; o < i; o++) {
    const n = a[o],
      c = a[(o - 1 + i) % i],
      r = a[(o + 1) % i],
      l = Array.isArray(e) ? e[o] : e,
      d = c[0] - n[0],
      f = c[1] - n[1],
      p = r[0] - n[0],
      w = r[1] - n[1],
      S = Math.hypot(d, f),
      y = Math.hypot(p, w),
      b = Math.min(l, S * 0.48, y * 0.48);
    if (b <= 1e-5) {
      t.push([n[0], n[1]]);
      continue;
    }
    const L = [n[0] + (d / S) * b, n[1] + (f / S) * b],
      m = [n[0] + (p / y) * b, n[1] + (w / y) * b];
    for (let v = 0; v <= s; v++) {
      const x = v / s,
        h = 1 - x;
      t.push([
        h * h * L[0] + 2 * h * x * n[0] + x * x * m[0],
        h * h * L[1] + 2 * h * x * n[1] + x * x * m[1],
      ]);
    }
  }
  return t;
}
const U = (a) => a.map(([e, s]) => new Vec3(e, s, 0)),
  Ht = (a) => a.map(([e, s]) => new Vec3(0, s, e)),
  Ve = (a) => a.map(([e, s]) => [-e, s]).reverse();
function Se(a) {
  const e = a.geometry;
  return {
    front: new SurfaceProjector(e, new Vec3(0, 0, -1)),
    rear: new SurfaceProjector(e, new Vec3(0, 0, 1)),
    right: new SurfaceProjector(e, new Vec3(-1, 0, 0)),
    left: new SurfaceProjector(e, new Vec3(1, 0, 0)),
    top: new SurfaceProjector(e, new Vec3(0, -1, 0), new Vec3(0, 0, 1)),
  };
}

export { Ht, Se, U, Ve, _s, et, nt };
