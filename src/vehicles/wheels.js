import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { PI, mergeGeometries } from "../util/math.js";
import { vehicleMaterials } from "./materials.js";

const je = new Map();
function Fi(a) {
  const e = JSON.stringify(a);
  if (je.has(e)) return je.get(e);
  const { R: s, W: t, rimR: i, style: o, n = 5, sw: c = 0.04, seg: r = 56 } = a,
    l = {},
    d = [],
    f = i + 0.42 * (s - i);
  d.push(new Vector2(i + 0.004, -t * 0.4)),
    d.push(new Vector2(i + 0.018, -t * 0.455));
  const p = 16,
    w = 3.4;
  for (let u = 0; u <= p; u++) {
    const T = PI * (1 - u / p),
      z = Math.cos(T),
      g = Math.sin(T);
    let D = (t / 2) * Math.sign(z) * Math.pow(Math.abs(z), 2 / w),
      P = f + (s - f) * Math.pow(Math.abs(g), 2 / w);
    d.push(new Vector2(P, D));
  }
  d.push(new Vector2(i + 0.018, t * 0.455)),
    d.push(new Vector2(i + 0.004, t * 0.4)),
    (l.tire = new LatheGeometry(d, r).rotateZ(-PI / 2));
  const S = [
    new Vector2(i * 0.9, -t * 0.38),
    new Vector2(i * 0.97, -t * 0.4),
    new Vector2(i * 0.965, t * 0.3),
    new Vector2(i + 0.006, t * 0.36),
    new Vector2(i + 0.014, t * 0.4),
    new Vector2(i + 0.006, t * 0.43),
    new Vector2(i * 0.95, t * 0.425),
  ];
  l.barrel = new LatheGeometry(S, Math.round(r * 0.75)).rotateZ(-PI / 2);
  const y = new Shape(),
    b = i * 0.965;
  y.absarc(0, 0, b, 0, PI * 2, !1);
  const L = (u, T, z, g, D) => {
    const P = new Path(),
      k = Math.max(0.01, T - D / (2 * g)),
      R = Math.max(0.01, T - D / (2 * z)),
      A = [],
      C = 7,
      B = 4;
    for (let N = 0; N <= C; N++) {
      const q = u + k - (2 * k * N) / C;
      A.push(new Vector2(g * Math.cos(q), g * Math.sin(q)));
    }
    for (let N = 0; N <= B; N++) {
      const q = u - R + (2 * R * N) / B;
      A.push(new Vector2(z * Math.cos(q), z * Math.sin(q)));
    }
    return P.setFromPoints(A), P;
  };
  if (o === "spokes")
    for (let u = 0; u < n; u++)
      y.holes.push(L(((u + 0.5) * 2 * PI) / n, PI / n, i * 0.34, i * 0.86, c));
  else if (o === "cover")
    for (let u = 0; u < n; u++)
      y.holes.push(L(((u + 0.5) * 2 * PI) / n, 0.07, i * 0.8, i * 0.9, 0));
  else if (o === "aero")
    for (let u = 0; u < n; u++)
      y.holes.push(L(((u + 0.5) * 2 * PI) / n, 0.16, i * 0.62, i * 0.86, 0));
  else if (o === "truck")
    for (let u = 0; u < 10; u++) {
      const T = ((u + 0.5) * 2 * PI) / 10,
        z = i * 0.6,
        g = i * 0.1,
        D = [];
      for (let P = 0; P < 14; P++) {
        const k = (-P * 2 * PI) / 14;
        D.push(
          new Vector2(
            z * Math.cos(T) + g * Math.cos(k),
            z * Math.sin(T) + g * Math.sin(k),
          ),
        );
      }
      y.holes.push(new Path(D));
    }
  const m = o === "truck" ? 0.03 : 0.022,
    v = new ExtrudeGeometry(y, {
      depth: m,
      bevelEnabled: !0,
      bevelThickness: 0.009,
      bevelSize: 0.007,
      bevelSegments: 1,
      curveSegments: 22,
    });
  v.rotateY(PI / 2);
  const x = t * 0.5 - 0.055 - m;
  v.translate(x, 0, 0), (l.face = v), (l.faceFront = x + m + 0.009);
  const h = [];
  if (o === "truck") {
    const u = new SphereGeometry(i * 0.26, 16, 5, 0, PI * 2, 0, PI / 2)
      .rotateZ(-PI / 2)
      .scale(0.6, 1, 1);
    u.translate(l.faceFront, 0, 0), h.push(u);
    for (let T = 0; T < 10; T++) {
      const z = (T * 2 * PI) / 10,
        g = i * 0.37,
        D = new CylinderGeometry(0.012, 0.012, 0.03, 6).rotateZ(PI / 2);
      D.translate(l.faceFront + 0.012, g * Math.sin(z), g * Math.cos(z)),
        h.push(D);
    }
  } else if (o === "cover") {
    const u = new TorusGeometry(i * 0.72, 0.004, 6, 64).rotateY(PI / 2);
    u.translate(l.faceFront, 0, 0), h.push(u);
    const T = new TorusGeometry(i * 0.3, 0.004, 6, 48).rotateY(PI / 2);
    T.translate(l.faceFront, 0, 0), h.push(T);
  } else if (o === "plain")
    h.push(
      new CylinderGeometry(i * 0.2, i * 0.2, 0.02, 12)
        .rotateZ(PI / 2)
        .translate(l.faceFront, 0, 0),
    );
  else {
    const u = new CylinderGeometry(i * 0.17, i * 0.19, 0.02, 32).rotateZ(
      PI / 2,
    );
    u.translate(l.faceFront, 0, 0), h.push(u);
  }
  return (
    (l.hub = mergeGeometries(h)),
    (l.disc = new CylinderGeometry(i * 0.8, i * 0.8, 0.026, 40)
      .rotateZ(PI / 2)
      .translate(-t * 0.05, 0, 0)),
    (l.caliper = new BoxGeometry(0.07, i * 0.42, i * 0.6).translate(
      -t * 0.02,
      i * 0.6,
      -i * 0.18,
    )),
    je.set(e, l),
    l
  );
}
function Ai(a, e) {
  const s = vehicleMaterials(),
    t = Fi(a),
    i = new Group(),
    o = (n, c, r = !0) => {
      const l = new Mesh(n, c);
      return (l.castShadow = r), (l.receiveShadow = !0), i.add(l), l;
    };
  return (
    o(t.tire, s.tire),
    o(t.barrel, s.rimInner, !1),
    o(t.face, e),
    o(t.hub, a.style === "cover" ? s.rimAero : e, !1),
    o(t.disc, s.brake, !1),
    o(t.caliper, s.caliper, !1),
    (i.name = "wheel"),
    i
  );
}
function Mt(a, e, s, t, i, o = !1) {
  const n = Ai(e, s);
  return n.position.set(t, e.R, i), o && (n.rotation.y = PI), a.add(n), n;
}

export { Mt };
