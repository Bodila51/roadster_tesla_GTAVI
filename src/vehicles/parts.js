import {
  Box3,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
} from "three";
import { PI, Vec3 } from "../util/math.js";
import { Xs } from "./loft.js";
import { vehicleMaterials } from "./materials.js";
import { monotoneSpline } from "./spline.js";

function We(a, e, s, t, i, o) {
  const n = new Shape();
  n.moveTo(-t, o),
    n.lineTo(-t, s),
    n.absarc(0, s, t, PI, 0, !0),
    n.lineTo(t, o),
    n.lineTo(-t, o);
  const c = new ShapeGeometry(n, 24).rotateY(-PI / 2);
  for (const r of [-1, 1]) {
    const l = new Mesh(c, vehicleMaterials().well);
    l.position.set(r * i, 0, e), a.add(l);
  }
}
function Ii(a, e, s, t) {
  const i = new Shape(s.map(([n, c]) => new Vector2(n, c))),
    o = new ShapeGeometry(i).rotateY(-PI / 2);
  for (const n of [-1, 1]) {
    const c = new Mesh(o, vehicleMaterials().well);
    c.position.set(n * t, 0, e), a.add(c);
  }
}
function Te(a, e) {
  (a.name = e),
    a.traverse((i) => {
      i.isMesh && i.castShadow === void 0 && (i.castShadow = !0);
    }),
    a.updateMatrixWorld(!0);
  const t = new Box3().setFromObject(a).getSize(new Vec3());
  return {
    group: a,
    size: {
      w: +t.x.toFixed(3),
      h: +t.y.toFixed(3),
      l: +t.z.toFixed(3),
    },
  };
}
let te = null;
function $s(a, e, s, t, i, o = 0.2) {
  const n = vehicleMaterials();
  if (!te) {
    const d = new SphereGeometry(1, 28, 14, 0, PI, 0, PI),
      f = d.attributes.position;
    for (let y = 0; y < f.count; y++) {
      const b = f.getX(y),
        L = f.getY(y);
      f.setY(y, L * (1 - 0.18 * Math.max(0, b))),
        f.setZ(y, f.getZ(y) * (1 - 0.25 * Math.max(0, b) * Math.max(0, b)));
    }
    d.computeVertexNormals();
    const p = new CircleGeometry(0.9, 28).rotateY(PI).translate(0, 0, -0.004),
      w = new CircleGeometry(1, 28).rotateY(PI).translate(0, 0, -0.001),
      S = new CylinderGeometry(0.5, 1, 1, 10).rotateZ(PI / 2);
    te = {
      shell: d,
      glass: p,
      back: w,
      stalk: S,
    };
  }
  const c = o / 2,
    r = 0.058,
    l = 0.07;
  for (const d of [-1, 1]) {
    const f = new Group(),
      p = new Mesh(te.shell, e);
    p.scale.set(c, r, l), (p.castShadow = !0);
    const w = new Mesh(te.glass, n.glass);
    w.scale.set(c, r, 1);
    const S = new Mesh(te.back, n.trim);
    S.scale.set(c, r, 1);
    const y = new Mesh(te.stalk, n.trim);
    y.scale.set(0.09, 0.022, 0.05),
      y.position.set(-c - 0.03, -0.022, 0.012),
      f.add(p, S, w, y),
      f.position.set(d * (s + c), t, i),
      (f.rotation.y = d > 0 ? -0.12 : PI + 0.12),
      d < 0 && (f.scale.z = -1),
      a.add(f);
  }
}
function ws(a, e, s) {
  const t = vehicleMaterials(),
    i = [e, t.glass, t.under, t.trim];
  return Xs(a, i, (n, c) =>
    c === "bottom" ? 2 : c === "green" && n > s[0] && n < s[1] ? 1 : 0,
  );
}
function Ne(a) {
  const e = {
    ...a,
  };
  for (const s of [
    "yb",
    "ys",
    "yBelt",
    "yt",
    "wl",
    "wg",
    "wgf",
    "sh",
    "wr",
    "ng",
  ])
    a[s] !== void 0 && (e[s] = monotoneSpline(a[s]));
  return e;
}

export { $s, Ii, Ne, Te, We, ws };
