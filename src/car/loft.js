import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

function loftBody(n, e, t) {
  const i = n.length,
    s = n[0].pts.length,
    r = (m, f) => n[m].pts[f],
    a = [],
    o = [],
    c = [],
    l = Array.from(
      {
        length: t,
      },
      () => [],
    ),
    u = new Vector3(),
    h = new Vector3(),
    p = new Vector3();
  function d(m, f, y) {
    const M = Math.max(0, m - 1),
      x = Math.min(i - 1, m + 1),
      I = r(M, f),
      C = r(x, f);
    h.set(C.x - I.x, C.y - I.y, n[x].z - n[M].z);
    let R, P;
    r(m, f).crease
      ? y === "next"
        ? ((R = f), (P = Math.min(s - 1, f + 1)))
        : ((R = Math.max(0, f - 1)), (P = f))
      : ((R = Math.max(0, f - 1)), (P = Math.min(s - 1, f + 1)));
    let _ = r(m, R),
      D = r(m, P);
    return (
      u.set(D.x - _.x, D.y - _.y, 0),
      u.lengthSq() < 1e-10 &&
        ((_ = r(m, Math.max(0, f - 1))),
        (D = r(m, Math.min(s - 1, f + 1))),
        u.set(D.x - _.x, D.y - _.y, 0),
        u.lengthSq() < 1e-10 && u.set(0, 1, 0)),
      h.lengthSq() < 1e-10 && h.set(0, 0, 1),
      p.crossVectors(u, h).normalize(),
      p.clone()
    );
  }
  for (let m = 0; m < 2; m++) {
    const f = m ? -1 : 1;
    for (let y = 0; y < s - 1; y++) {
      const M = a.length / 3;
      for (let x = 0; x < i; x++)
        for (let I = 0; I < 2; I++) {
          const C = y + I,
            R = r(x, C);
          a.push(f * R.x, R.y, n[x].z);
          const P = d(x, C, I === 0 ? "next" : "prev");
          o.push(f * P.x, P.y, P.z), c.push(C / (s - 1), (n[x].z + 3) / 6);
        }
      for (let x = 0; x < i - 1; x++) {
        const I = (n[x].z + n[x + 1].z) * 0.5,
          C = e(y, I, n[x]);
        if (C < 0) continue;
        const R = M + x * 2,
          P = R + 1,
          E = M + (x + 1) * 2,
          _ = E + 1,
          D = r(x, y),
          G = r(x, y + 1),
          O = r(x + 1, y),
          H = r(x + 1, y + 1);
        (Math.hypot(D.x - G.x, D.y - G.y) < 1e-5 &&
          Math.hypot(O.x - H.x, O.y - H.y) < 1e-5) ||
          (m ? l[C].push(R, E, P, P, E, _) : l[C].push(R, P, E, P, _, E));
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(a, 3)),
    g.setAttribute("normal", new Float32BufferAttribute(o, 3)),
    g.setAttribute("uv", new Float32BufferAttribute(c, 2));
  const v = [];
  for (let m = 0; m < t; m++) {
    const f = v.length;
    v.push(...l[m]), l[m].length && g.addGroup(f, l[m].length, m);
  }
  return g.setIndex(v), g;
}
function profileSpline(n) {
  return (e) => {
    if (e <= n[0][0]) return n[0][1];
    const t = n.length;
    if (e >= n[t - 1][0]) return n[t - 1][1];
    let i = 0;
    for (; i < t - 2 && e > n[i + 1][0]; ) i++;
    const [s, r] = n[i],
      [a, o] = n[i + 1],
      c = i > 0 ? n[i - 1][1] : r - (o - r),
      l = i + 2 < t ? n[i + 2][1] : o + (o - r),
      u = (e - s) / (a - s),
      h = (o - c) * 0.5 * 0.85,
      p = (l - r) * 0.5 * 0.85,
      d = u * u,
      g = d * u;
    return (
      (2 * g - 3 * d + 1) * r +
      (g - 2 * d + u) * h +
      (-2 * g + 3 * d) * o +
      (g - d) * p
    );
  };
}

export { loftBody, profileSpline };
