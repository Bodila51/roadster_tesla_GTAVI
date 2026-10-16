import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  TorusGeometry,
  Vector2,
} from "three";
import { CAR_DIMS } from "./profile.js";

function buildWheel(n, e) {
  const t = CAR_DIMS.wheelRadius,
    i = 0.31,
    s = 0.272,
    r = new Group(),
    a = [],
    o = i / 2;
  a.push(new Vector2(s - 0.005, -o + 0.02)),
    a.push(new Vector2(s + 0.02, -o)),
    a.push(new Vector2(t - 0.05, -o - 0.004));
  for (let z = 0; z <= 8; z++) {
    const Z = -Math.PI / 2 + (z / 8) * (Math.PI / 2);
    a.push(
      new Vector2(
        t - 0.035 + Math.cos(Z) * 0.035,
        -o + 0.035 + Math.sin(Z) * 0.035,
      ),
    );
  }
  for (let z = 0; z <= 8; z++) {
    const Z = (z / 8) * (Math.PI / 2);
    a.push(
      new Vector2(
        t - 0.035 + Math.cos(Z) * 0.035,
        o - 0.035 + Math.sin(Z) * 0.035,
      ),
    );
  }
  a.push(new Vector2(t - 0.05, o + 0.004)),
    a.push(new Vector2(s + 0.02, o)),
    a.push(new Vector2(s - 0.005, o - 0.02));
  const c = new LatheGeometry(a, 64);
  c.rotateZ(Math.PI / 2);
  const l = new Mesh(c, n.tire);
  r.add(l);
  const u = e,
    h = new Mesh(
      new CylinderGeometry(s - 0.004, s - 0.004, i - 0.03, 48, 1, !0),
      n.liner,
    );
  (h.rotation.z = Math.PI / 2), (h.material = n.liner), r.add(h);
  const p = new Mesh(new CircleGeometry(s - 0.01, 64), n.rimInsert);
  (p.rotation.y = u > 0 ? Math.PI / 2 : -Math.PI / 2),
    (p.position.x = u * (o - 0.07)),
    r.add(p);
  const d = new Mesh(new TorusGeometry(s - 0.004, 0.012, 10, 72), n.rimDark);
  (d.rotation.y = Math.PI / 2), (d.position.x = u * (o - 0.02)), r.add(d);
  const g = 0.06,
    v = s - 0.006,
    m = new Shape(),
    f = 0.032,
    y = 0.062;
  m.moveTo(g, -f),
    m.lineTo(v, -y),
    m.lineTo(v, y),
    m.lineTo(g, f),
    m.closePath();
  const M = new Path(),
    x = g + 0.03,
    I = v - 0.022,
    C = f - 0.014,
    R = y - 0.016;
  M.moveTo(x, -C),
    M.lineTo(x, C),
    M.lineTo(I, R),
    M.lineTo(I, -R),
    M.closePath(),
    m.holes.push(M);
  const P = new ExtrudeGeometry(m, {
      depth: 0.03,
      bevelEnabled: !0,
      bevelThickness: 0.006,
      bevelSize: 0.004,
      bevelSegments: 2,
      curveSegments: 2,
    }),
    E = new Shape();
  E.moveTo(x, -C),
    E.lineTo(I, -R),
    E.lineTo(I, R),
    E.lineTo(x, C),
    E.closePath();
  const _ = new ExtrudeGeometry(E, {
      depth: 0.012,
      bevelEnabled: !1,
    }),
    D = new BoxGeometry(I - x - 0.03, 0.012, 0.03),
    G = new Group();
  for (let z = 0; z < 6; z++) {
    const Z = new Group();
    Z.rotation.z = (z / 6) * Math.PI * 2;
    const X = new Mesh(P, n.rimSilver);
    Z.add(X);
    const oe = new Mesh(_, n.rimDark);
    (oe.position.z = 0.004), Z.add(oe);
    const ue = new Mesh(D, n.gold);
    ue.position.set((x + I) / 2, 0, 0.02), Z.add(ue), G.add(Z);
  }
  const O = new Mesh(new CylinderGeometry(0.068, 0.072, 0.045, 32), n.rimDark);
  (O.rotation.x = Math.PI / 2), (O.position.z = 0.025), G.add(O);
  const H = new Mesh(new TorusGeometry(0.06, 0.004, 6, 32), n.rimSilver);
  (H.position.z = 0.048),
    G.add(H),
    (G.rotation.y = u > 0 ? Math.PI / 2 : -Math.PI / 2),
    (G.position.x = u * (o - 0.055)),
    r.add(G);
  const Q = new Mesh(
    new CylinderGeometry(0.2, 0.2, 0.03, 40),
    new MeshStandardMaterial({
      color: 5593180,
      metalness: 1,
      roughness: 0.4,
    }),
  );
  return (
    (Q.rotation.z = Math.PI / 2),
    (Q.position.x = u * -0.02),
    r.add(Q),
    r.traverse((z) => {
      z.isMesh && ((z.castShadow = !0), (z.receiveShadow = !0));
    }),
    r
  );
}

export { buildWheel };
