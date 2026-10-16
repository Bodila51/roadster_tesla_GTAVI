import { Vec3, clamp } from "../util/math.js";

class SurfaceProjector {
  constructor(e, s, t = new Vec3(0, 1, 0)) {
    const i = s.clone().normalize(),
      o = t.clone().addScaledVector(i, -t.dot(i)).normalize(),
      n = new Vec3().crossVectors(i, o);
    (this.d = i), (this.U = n), (this.V = o);
    const c = e.attributes.position.array,
      r = e.index.array;
    (this.pos = c), (this.nrm = e.attributes.normal.array), (this.idx = r);
    const l = c.length / 3,
      d = new Float32Array(l),
      f = new Float32Array(l);
    let p = 1e9,
      w = -1e9,
      S = 1e9,
      y = -1e9;
    for (let v = 0; v < l; v++) {
      const x = c[3 * v],
        h = c[3 * v + 1],
        u = c[3 * v + 2];
      (d[v] = x * n.x + h * n.y + u * n.z),
        (f[v] = x * o.x + h * o.y + u * o.z),
        (p = Math.min(p, d[v])),
        (w = Math.max(w, d[v])),
        (S = Math.min(S, f[v])),
        (y = Math.max(y, f[v]));
    }
    const b = 128;
    (this.G = b),
      (this.umin = p),
      (this.vmin = S),
      (this.du = (w - p) / b + 1e-9),
      (this.dv = (y - S) / b + 1e-9);
    const L = Array.from(
        {
          length: b * b,
        },
        () => [],
      ),
      m = r.length / 3;
    for (let v = 0; v < m; v++) {
      const x = r[3 * v],
        h = r[3 * v + 1],
        u = r[3 * v + 2],
        T = clamp(
          Math.floor((Math.min(d[x], d[h], d[u]) - p) / this.du),
          0,
          b - 1,
        ),
        z = clamp(
          Math.floor((Math.max(d[x], d[h], d[u]) - p) / this.du),
          0,
          b - 1,
        ),
        g = clamp(
          Math.floor((Math.min(f[x], f[h], f[u]) - S) / this.dv),
          0,
          b - 1,
        ),
        D = clamp(
          Math.floor((Math.max(f[x], f[h], f[u]) - S) / this.dv),
          0,
          b - 1,
        );
      for (let P = g; P <= D; P++)
        for (let k = T; k <= z; k++) L[P * b + k].push(v);
    }
    this.cells = L;
  }
  uv(e) {
    return [e.dot(this.U), e.dot(this.V)];
  }
  fromUV(e, s) {
    return new Vec3().addScaledVector(this.U, e).addScaledVector(this.V, s);
  }
  cast(e) {
    const s = e.dot(this.U),
      t = e.dot(this.V),
      i = Math.floor((s - this.umin) / this.du),
      o = Math.floor((t - this.vmin) / this.dv);
    if (i < 0 || o < 0 || i >= this.G || o >= this.G) return null;
    const { U: n, V: c, d: r, pos: l, idx: d, nrm: f } = this,
      p = n.x * s + c.x * t - r.x * 100,
      w = n.y * s + c.y * t - r.y * 100,
      S = n.z * s + c.z * t - r.z * 100,
      y = r.x,
      b = r.y,
      L = r.z;
    let m = 1 / 0,
      v = -1,
      x = 0,
      h = 0;
    for (const k of this.cells[o * this.G + i]) {
      const R = d[3 * k] * 3,
        A = d[3 * k + 1] * 3,
        C = d[3 * k + 2] * 3,
        B = l[A] - l[R],
        N = l[A + 1] - l[R + 1],
        q = l[A + 2] - l[R + 2],
        V = l[C] - l[R],
        O = l[C + 1] - l[R + 1],
        W = l[C + 2] - l[R + 2],
        at = b * W - L * O,
        $ = L * V - y * W,
        Q = y * O - b * V,
        K = B * at + N * $ + q * Q;
      if (Math.abs(K) < 1e-14) continue;
      const Pt = 1 / K,
        Wt = p - l[R],
        Ye = w - l[R + 1],
        Ge = S - l[R + 2],
        Le = (Wt * at + Ye * $ + Ge * Q) * Pt;
      if (Le < -1e-6 || Le > 1 + 1e-6) continue;
      const Ss = Ye * q - Ge * N,
        Ts = Ge * B - Wt * q,
        Ds = Wt * N - Ye * B,
        Qe = (y * Ss + b * Ts + L * Ds) * Pt;
      if (Qe < -1e-6 || Le + Qe > 1 + 1e-6) continue;
      const Ze = (V * Ss + O * Ts + W * Ds) * Pt;
      Ze > 0 && Ze < m && ((m = Ze), (v = k), (x = Le), (h = Qe));
    }
    if (v < 0) return null;
    const u = new Vec3(p + y * m, w + b * m, S + L * m),
      T = d[3 * v] * 3,
      z = d[3 * v + 1] * 3,
      g = d[3 * v + 2] * 3,
      D = 1 - x - h,
      P = new Vec3(
        f[T] * D + f[z] * x + f[g] * h,
        f[T + 1] * D + f[z + 1] * x + f[g + 1] * h,
        f[T + 2] * D + f[z + 2] * x + f[g + 2] * h,
      ).normalize();
    return (
      P.dot(r) > 0 && P.negate(),
      {
        p: u,
        n: P,
      }
    );
  }
}

export { SurfaceProjector };
