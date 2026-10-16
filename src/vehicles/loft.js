import { BufferGeometry, Float32BufferAttribute, Mesh } from "three";
import { PI, Vec3, clamp, lerp } from "../util/math.js";

function Ks(a, { sBreaks: e = null, cBreaks: s = null, matOf: t, nMat: i }) {
  const o = a.length,
    n = a[0].length,
    c = new Int32Array(o - 1),
    r = new Int32Array(n - 1);
  for (let R = 1, A = 0; R < o - 1; R++) e && e.has(R) && A++, (c[R] = A);
  for (let R = 1, A = 0; R < n - 1; R++) s && s.has(R) && A++, (r[R] = A);
  const l = a.map((R) => {
      const A = [0];
      for (let C = 1; C < n; C++)
        A.push(
          A[C - 1] + Math.hypot(R[C][0] - R[C - 1][0], R[C][1] - R[C - 1][1]),
        );
      return A;
    }),
    d = [],
    f = [],
    p = new Map(),
    w = (R, A, C) => {
      const B = (R * n + A) * 1e5 + C;
      let N = p.get(B);
      if (N === void 0) {
        N = d.length / 3;
        const q = a[R][A];
        d.push(q[0], q[1], q[2]), f.push(q[2], l[R][A]), p.set(B, N);
      }
      return N;
    },
    S = Array.from(
      {
        length: i,
      },
      () => [],
    ),
    y = new Vec3(),
    b = new Vec3(),
    L = new Vec3(),
    m = new Vec3(),
    v = new Vec3(),
    x = (R, A, C, B) => {
      y.fromArray(d, A * 3),
        b.fromArray(d, C * 3),
        L.fromArray(d, B * 3),
        m.subVectors(b, y),
        v.subVectors(L, y),
        !(m.cross(v).lengthSq() < 1e-14) && R.push(A, C, B);
    };
  for (let R = 0; R < o - 1; R++)
    for (let A = 0; A < n - 1; A++) {
      const C = t(R, A);
      if (C < 0) continue;
      const B = c[R] * 100 + r[A],
        N = w(R, A, B),
        q = w(R + 1, A, B),
        V = w(R + 1, A + 1, B),
        O = w(R, A + 1, B);
      x(S[C], N, V, q), x(S[C], N, O, V);
    }
  const h = new BufferGeometry();
  h.setAttribute("position", new Float32BufferAttribute(d, 3)),
    h.setIndex(S.flat()),
    h.computeVertexNormals();
  const u = Array.from(h.attributes.normal.array),
    T = d.length / 3;
  for (let R = 0; R < T; R++)
    if (Math.abs(d[R * 3]) < 1e-5) {
      u[R * 3] = 0;
      const A = Math.hypot(u[R * 3 + 1], u[R * 3 + 2]) || 1;
      (u[R * 3 + 1] /= A), (u[R * 3 + 2] /= A);
    }
  h.dispose();
  const z = d.slice(),
    g = u.slice(),
    D = f.slice();
  for (let R = 0; R < T; R++)
    z.push(-d[R * 3], d[R * 3 + 1], d[R * 3 + 2]),
      g.push(-u[R * 3], u[R * 3 + 1], u[R * 3 + 2]),
      D.push(f[R * 2], f[R * 2 + 1]);
  const P = new BufferGeometry();
  P.setAttribute("position", new Float32BufferAttribute(z, 3)),
    P.setAttribute("normal", new Float32BufferAttribute(g, 3)),
    P.setAttribute("uv", new Float32BufferAttribute(D, 2));
  const k = [];
  for (let R = 0; R < i; R++) {
    const A = k.length,
      C = S[R];
    for (let B = 0; B < C.length; B++) k.push(C[B]);
    for (let B = 0; B < C.length; B += 3)
      k.push(C[B] + T, C[B + 2] + T, C[B + 1] + T);
    k.length > A && P.addGroup(A, k.length - A, R);
  }
  return P.setIndex(k), P.computeBoundingBox(), P.computeBoundingSphere(), P;
}
const ls = 3,
  cs = 5,
  hs = 11,
  fs = 4,
  Fe = 15,
  re = [];
for (let a = 0; a < ls; a++) re.push("bottom");
for (let a = 0; a < cs; a++) re.push("corner");
for (let a = 0; a < hs; a++) re.push("side");
for (let a = 0; a < fs; a++) re.push("shoulder");
for (let a = 0; a < Fe; a++) re.push("green");
function Ri(a, e) {
  let s = 1;
  const t = a.zF - a.rF;
  e > t &&
    (s *= Math.pow(
      Math.max(0, 1 - Math.pow(Math.min(1, (e - t) / a.rF), a.pF)),
      1 / a.pF,
    ));
  const i = a.zR + a.rR;
  return (
    e < i &&
      (s *= Math.pow(
        Math.max(0, 1 - Math.pow(Math.min(1, (i - e) / a.rR), a.pR)),
        1 / a.pR,
      )),
    s
  );
}
function Li(a, e) {
  return e >= a.zF - 1e-9 || e <= a.zR + 1e-9
    ? Fs(a, e >= a.zF - 1e-9 ? a.zF - 2e-4 : a.zR + 2e-4).map(([, t]) => [0, t])
    : Fs(a, e);
}
function Fs(a, e) {
  const s = Ri(a, e);
  let t = a.yb(e);
  for (const k of a.arches) {
    const R = Math.abs(e - k.z);
    R < k.R - 1e-7 && (t = Math.max(t, k.y + Math.sqrt(k.R * k.R - R * R)));
  }
  const i = a.ys(e),
    o = Math.max(a.yBelt(e), t + 0.03),
    n = a.wl(e) * s,
    c = a.kUp,
    r = a.kDn,
    l = (k) =>
      k >= i
        ? n *
          (1 - c * Math.pow(clamp((k - i) / Math.max(0.001, o - i), 0, 1), 1.8))
        : n * (1 - r * Math.pow((i - k) / i, 2)),
    d = l(o),
    f = a.wgf ? d * a.wgf(e) : Math.min(a.wg(e) * s, d * 0.995),
    p = a.sh(e),
    w = o + p,
    S = Math.max(a.yt(e), w + 0.004),
    y = Math.min(a.wr(e) * s, f),
    b = a.ng(e),
    L = Math.max(0, Math.min(a.rc, 0.45 * (o - t), 0.45 * l(t + a.rc))),
    m = [],
    v = t + L,
    x = l(v);
  for (let k = 0; k < ls; k++) m.push([((x - L) * k) / ls, t]);
  for (let k = 0; k < cs; k++) {
    const R = -PI / 2 + ((PI / 2) * k) / cs;
    m.push([x - L + L * Math.cos(R), v + L * Math.sin(R)]);
  }
  for (let k = 0; k < hs; k++) {
    const R = v + ((o - v) * k) / hs;
    m.push([l(R), R]);
  }
  for (let k = 0; k < fs; k++) {
    const R = k / fs;
    m.push([d + (f - d) * R * R * (3 - 2 * R), o + p * R]);
  }
  const h = 2 / b;
  for (let k = 0; k <= Fe; k++) {
    const R = ((PI / 2) * k) / Fe,
      A = Math.cos(R),
      C = Math.sin(R),
      B = w + (S - w) * Math.pow(C, h),
      N = lerp(f, y, (B - w) / (S - w));
    m.push([k === Fe ? 0 : N * Math.pow(Math.max(A, 0), h), B]);
  }
  const u = a.soften || {
    f: 0.5,
    r: 0.35,
    n: 3.4,
  };
  let T = 0;
  e > a.zF - u.f && (T = Math.pow((e - (a.zF - u.f)) / u.f, 1.6)),
    e < a.zR + u.r && (T = Math.pow((a.zR + u.r - e) / u.r, 1.6));
  let z = 0,
    g = 1 / 0,
    D = -1 / 0;
  for (const k of m)
    (z = Math.max(z, k[0])), (g = Math.min(g, k[1])), (D = Math.max(D, k[1]));
  if (T > 0 && z > 1e-5) {
    const k = [0];
    for (let q = 1; q < m.length; q++)
      k.push(
        k[q - 1] + Math.hypot(m[q][0] - m[q - 1][0], m[q][1] - m[q - 1][1]),
      );
    const R = k[k.length - 1] || 1,
      A = (g + D) / 2,
      C = Math.max(1e-5, (D - g) / 2),
      B = z,
      N = 2 / u.n;
    for (let q = 0; q < m.length; q++) {
      const V = -PI / 2 + PI * (k[q] / R),
        O = Math.cos(V),
        W = Math.sin(V),
        at = B * Math.pow(Math.max(0, O), N),
        $ = A + C * Math.sign(W) * Math.pow(Math.abs(W), N);
      (m[q][0] = lerp(m[q][0], at, T)), (m[q][1] = lerp(m[q][1], $, T));
    }
  }
  const P = ki(a, e);
  if (P.t < 1) {
    const k = (R) => {
      let A = clamp((R - (P.y - 0.16)) / 0.32, 0, 1);
      return (A = A * A * (3 - 2 * A)), lerp(P.kb, P.kt, A);
    };
    for (const R of m) {
      const A = k(R[1]);
      R[1] = P.y + (R[1] - P.y) * (A + (1 - A) * P.t);
    }
  }
  return m;
}
function ki(a, e) {
  const s = a.nose,
    t = a.tail,
    i = (o, n) => ({
      y: o.y,
      kt: o.k,
      kb: o.kb ?? 0.85,
      t: Math.pow(Math.max(0, 1 - Math.pow(n, o.q)), 1 / o.q),
    });
  return s && e > a.zF - s.a
    ? i(s, Math.min(1, (e - (a.zF - s.a)) / s.a))
    : t && e < a.zR + t.a
      ? i(t, Math.min(1, (a.zR + t.a - e) / t.a))
      : {
          y: 0,
          kt: 1,
          kb: 1,
          t: 1,
        };
}
function zi(a, e, s = []) {
  let t = [];
  const i = Math.ceil((a.zF - a.zR) / e);
  for (let f = 0; f <= i; f++) t.push(a.zR + ((a.zF - a.zR) * f) / i);
  const o = (f, p, w, S, y) => {
    for (let b = 1; b < y; b++) {
      const L = ((b / y) * PI) / 2;
      t.push(S - w * f * (1 - Math.pow(Math.cos(L), 2 / p)));
    }
  };
  o(a.rF, a.pF, 1, a.zF, 18),
    o(a.rR, a.pR, -1, a.zR, 16),
    a.nose && o(a.nose.a, a.nose.q, 1, a.zF, 14),
    a.tail && o(a.tail.a, a.tail.q, -1, a.zR, 12);
  const n = [];
  for (const f of a.arches) {
    for (let w = 1; w < 28; w++)
      t.push(f.z + f.R * Math.sin(-PI / 2 + (PI * w) / 28));
    n.push(f.z - f.R, f.z - f.R + 0.0015, f.z + f.R - 0.0015, f.z + f.R);
  }
  const c = s.slice();
  (t = t.filter(
    (f) =>
      n.every((p) => Math.abs(f - p) > 0.01) &&
      c.every((p) => Math.abs(f - p) > 0.006),
  )),
    (t = t
      .concat(c)
      .filter((f) => f > a.zR + 1e-4 && f < a.zF - 1e-4)
      .concat([a.zR, a.zF])),
    t.sort((f, p) => f - p);
  const r = [],
    l = (f) => (Math.min(a.zF - f, f - a.zR) < 0.06 ? 0.004 : 0.016);
  for (const f of t)
    !r.length || f - r[r.length - 1] > l(f)
      ? r.push(f)
      : f === a.zF && (r[r.length - 1] = f);
  for (const f of n) r.push(f);
  r.sort((f, p) => f - p);
  const d = new Set();
  return (
    r.forEach((f, p) => {
      n.some((w) => Math.abs(w - f) < 1e-9) && d.add(p);
    }),
    {
      zs: r,
      sBreaks: d,
    }
  );
}
function Xs(a, e, s, t = 0.04) {
  const { zs: i, sBreaks: o } = zi(a, t, a.extraStations || []),
    n = i.map((l) => Li(a, l).map(([d, f]) => [d, f, l])),
    c = Ks(n, {
      sBreaks: o,
      nMat: e.length,
      matOf: (l, d) => s((i[l] + i[l + 1]) / 2, re[d], d),
    }),
    r = new Mesh(c, e);
  return (r.castShadow = !0), (r.receiveShadow = !0), (r.name = "body"), r;
}

export { Ks, Xs };
