import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  TorusGeometry,
  Vector3,
} from "three";
import { loftBody } from "./loft.js";
import { createCarMaterials } from "./materials.js";
import {
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
} from "./profile.js";
import { buildWheel } from "./wheels.js";

function buildRoadster(n = createCarMaterials()) {
  const e = new Group();
  e.name = "Roadster";
  const t = new Group();
  e.add(t);
  const i = makeSections(),
    s = {
      paint: 0,
      trim: 1,
      glass: 2,
      liner: 3,
      gloss: 4,
      side: 5,
    },
    r = (j) => jl(j, xt.yb(j)) > xt.yb(j) + 0.01,
    a = (j) => j > ar.zRear && j < ar.zFront,
    c = loftBody(
      i,
      (j, ie) =>
        j <= 2
          ? s.liner
          : j === 3
            ? r(ie)
              ? s.paint
              : s.trim
            : j === 4
              ? ie < CAR_DIMS.rearAxle - dr
                ? s.trim
                : r(ie) || ie > 2
                  ? s.paint
                  : s.trim
              : j === 5 || j === 6
                ? s.paint
                : j === 7
                  ? ie > -1 && ie < 1.2
                    ? s.side
                    : s.paint
                  : j === 8
                    ? a(ie)
                      ? s.gloss
                      : s.paint
                    : a(ie)
                      ? ie > ar.zFront - 0.06 || ie < ar.zRear + 0.06
                        ? s.gloss
                        : s.glass
                      : s.paint,
      6,
    ),
    l = new Mesh(c, [n.paint, n.trim, n.glass, n.liner, n.gloss, n.sideGlass]);
  t.add(l);
  const u = i[i.length - 1],
    h = jc(u),
    p = {
      x: u.pts[7].x - 0.05,
      y: u.pts[7].y + 0.01,
    },
    d = {
      x: 0.46,
      y: xt.yb(Yt),
    },
    g = -(p.y - d.y),
    v = p.x - d.x,
    m = -(g * p.x + v * p.y),
    f = Bi(h, g, v, m),
    y = Bi(f, -g, v, m);
  t.add(ds(y, Yt, 1, n.gloss)),
    t.add(ds(Bi(h, -g, -v, -m), Yt, 1, n.paint)),
    t.add(ds(Bi(h, g, -v, -m), Yt, 1, n.paint));
  {
    const j = [];
    for (let k = 7; k <= 12; k++) j.push(u.pts[k]);
    const ie = [];
    for (let k = j.length - 1; k >= 1; k--)
      ie.push(new Vector3(j[k].x, j[k].y - 0.018, Yt + 0.006));
    for (let k = 0; k < j.length; k++)
      ie.push(
        new Vector3(
          -j[j.length - 1 - k].x,
          j[j.length - 1 - k].y - 0.018,
          Yt + 0.006,
        ),
      );
    ie.filter((k, se) => se === 0 || k.distanceTo(ie[se - 1]) > 1e-4);
    const N = [];
    for (let k = 7; k <= 12; k++)
      N.push(new Vector3(-u.pts[k].x, u.pts[k].y - 0.018, Yt + 0.006));
    for (let k = 11; k >= 7; k--)
      N.push(new Vector3(u.pts[k].x, u.pts[k].y - 0.018, Yt + 0.006));
    (N[0].x += 0.02), (N[N.length - 1].x -= 0.02), t.add(Ni(N, 0.012, n.head));
  }
  const M = new Mesh(
    new BoxGeometry(xt.wSill(Yt) * 2 + 0.14, 0.03, 0.14),
    n.gloss,
  );
  M.position.set(0, xt.yb(Yt) - 0.01, Yt - 0.02), t.add(M);
  const x = new Mesh(new BoxGeometry(0.5, 0.05, 0.01), n.liner);
  x.position.set(0, 0.36, Yt + 0.003), t.add(x);
  for (const j of [-1, 1]) {
    const ie = kn(i, 2.19),
      N = kn(i, 1.93),
      k = ie.pts[7],
      se = ie.pts[10],
      te = N.pts[7],
      Me = new Vector3(j * k.x, k.y + 0.004, ie.z),
      Ce = new Vector3(
        j * Ht(k.x, se.x, 0.62),
        Ht(k.y, se.y, 0.62) + 0.004,
        ie.z,
      ),
      Te = new Vector3(j * te.x, te.y + 0.004, N.z),
      Ye = new BufferGeometry().setFromPoints([Me, Ce, Te]);
    Ye.computeVertexNormals(),
      t.add(new Mesh(Ye, n.lamp)),
      t.add(Ni([Me, Ce, Te], 0.004, n.chrome, !0));
  }
  {
    const j = (N) => kn(i, N).pts[12].y + 0.002,
      ie = (N) => kn(i, N).pts[10].x;
    for (const N of [1.58])
      t.add(
        Ni(
          [
            new Vector3(-ie(N), j(N) - 0.004, N),
            new Vector3(0, j(N), N),
            new Vector3(ie(N), j(N) - 0.004, N),
          ],
          0.0035,
          n.seam,
        ),
      );
    for (const N of [-1, 1]) {
      const k = [];
      for (let se = 2.17; se >= 1.27; se -= 0.06) {
        const te = kn(i, se);
        k.push(
          new Vector3(N * (te.pts[10].x + 0.004), te.pts[10].y + 0.002, te.z),
        );
      }
      t.add(Ni(k, 0.003, n.seam));
    }
    for (const N of [0.82, -0.42]) {
      const k = kn(i, N);
      for (const se of [-1, 1]) {
        const te = [];
        for (let Me = 4; Me <= 7; Me++) {
          const Ce = k.pts[Me];
          te.push(new Vector3(se * (Ce.x + 0.004), Ce.y, k.z));
        }
        t.add(Ni(te, 0.003, n.seam));
      }
    }
    for (const N of [-1, 1]) {
      const k = kn(i, 0.86),
        se = k.pts[7],
        te = k.pts[6],
        Me = new Mesh(new BoxGeometry(0.012, 0.022, 0.08), n.amber);
      Me.position.set(
        N * (Ht(se.x, te.x, 0.25) + 0.006),
        Ht(se.y, te.y, 0.25),
        k.z + 0.04,
      ),
        t.add(Me);
      const Ce = new Mesh(new BoxGeometry(0.008, 0.06, 0.012), n.chrome);
      Ce.position.set(
        N * (Ht(se.x, te.x, 0.25) + 0.006),
        Ht(se.y, te.y, 0.25) - 0.01,
        k.z + 0.085,
      ),
        (Ce.rotation.x = 0.5),
        t.add(Ce);
    }
  }
  const I = new Mesh(new PlaneGeometry(1.08, 3.4), n.under);
  (I.rotation.x = Math.PI / 2), I.position.set(0, 0.148, -0.05), t.add(I);
  const C = i[0],
    R = jc(C),
    P = 0.6;
  t.add(ds(Bi(R, 0, 1, -P), Bt, -1, n.paint)),
    t.add(ds(Bi(R, 0, -1, P), Bt, -1, n.trim));
  {
    const j = [];
    for (let ie = 7; ie <= 12; ie++)
      j.push(new Vector3(-C.pts[ie].x, C.pts[ie].y - 0.03, Bt - 0.006));
    for (let ie = 11; ie >= 7; ie--)
      j.push(new Vector3(C.pts[ie].x, C.pts[ie].y - 0.03, Bt - 0.006));
    (j[0].x += 0.03), (j[j.length - 1].x -= 0.03);
    var E = Ni(j, 0.011, n.tail);
    t.add(E);
  }
  const _ = new Mesh(new BoxGeometry(1.3, 0.008, 0.01), n.tailDim);
  _.position.set(0, C.pts[12].y - 0.07, Bt - 0.006), t.add(_);
  for (let j = -3; j <= 3; j++) {
    const ie = new Mesh(new BoxGeometry(0.012, 0.13, 0.26), n.gloss);
    ie.position.set(j * 0.24, xt.yb(Bt) + 0.05, Bt + 0.12), t.add(ie);
  }
  const D = new Mesh(new BoxGeometry(1.7, 0.035, 0.08), n.gloss);
  D.position.set(0, P - 0.02, Bt - 0.03), t.add(D);
  const G = new Mesh(new BoxGeometry(0.36, 0.17, 0.012), [
    n.paint,
    n.paint,
    n.paint,
    n.paint,
    n.paint,
    n.plate,
  ]);
  G.position.set(0, 0.69, Bt - 0.012), t.add(G);
  const O = new CylinderGeometry(0.06, 0.068, 0.1, 40, 1, !0),
    H = [],
    Q = [],
    z = (j, ie, N) => {
      const k = new Mesh(O, n.liner);
      k.scale.set(N / 0.06, 1, N / 0.06),
        (k.rotation.x = Math.PI / 2),
        k.position.set(j, ie, Bt - 0.03),
        t.add(k);
      const se = new Mesh(
        new TorusGeometry(N + 0.004, 0.0075 * (N / 0.06), 10, 40),
        n.nozzle,
      );
      se.position.set(j, ie, Bt - 0.08), t.add(se);
      const te = new Mesh(new CircleGeometry(N * 0.92, 24), n.nozzleGlow);
      return (
        (te.rotation.y = Math.PI),
        te.position.set(j, ie, Bt + 0),
        t.add(te),
        Q.push(te),
        new Vector3(j, ie, Bt - 0.09)
      );
    };
  for (const j of [-0.6, -0.22, 0.22, 0.6]) H.push(z(j, 0.44, 0.062));
  for (const j of [-0.41, 0.41]) z(j, 0.44, 0.03);
  for (const j of [-1, 1]) {
    const ie = new Mesh(new BoxGeometry(0.04, 0.04, 0.02), n.tailDim);
    ie.position.set(j * 0.8, 0.5, Bt - 0.02), t.add(ie);
  }
  const Z = new Group();
  {
    const ie = kn(i, -1.98).pts[12].y,
      N = new Shape();
    N.moveTo(-0.1, 0),
      N.lineTo(0.06, 0),
      N.lineTo(0.02, 0.27),
      N.lineTo(-0.2, 0.31),
      N.lineTo(-0.2, 0.27),
      N.lineTo(-0.06, 0.24),
      N.closePath();
    const k = new ExtrudeGeometry(N, {
      depth: 0.012,
      bevelEnabled: !0,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 1,
    });
    k.rotateY(Math.PI / 2);
    for (const Ce of [-1, 1]) {
      const Te = new Mesh(k, n.gloss);
      Te.position.set(Ce * 0.78 - 0.009, 0, 0), Z.add(Te);
    }
    const se = new Shape();
    se.moveTo(0.1, 0),
      se.quadraticCurveTo(-0.05, 0.045, -0.24, 0.03),
      se.lineTo(-0.24, 0.012),
      se.quadraticCurveTo(-0.05, 0.02, 0.1, 0);
    const te = new ExtrudeGeometry(se, {
      depth: 1.6,
      bevelEnabled: !1,
    });
    te.rotateY(Math.PI / 2), te.translate(-0.8, 0, 0);
    const Me = new Mesh(te, n.gloss);
    Me.position.set(0, 0.275, 0), Z.add(Me);
    for (const Ce of [-1, 1]) {
      const Te = new Shape();
      Te.moveTo(0.06, -0.3),
        Te.lineTo(0.12, -0.3),
        Te.quadraticCurveTo(0.1, 0.2, -0.02, 0.33),
        Te.lineTo(-0.1, 0.33),
        Te.quadraticCurveTo(0.03, 0.18, 0.06, -0.3);
      const Ye = new ExtrudeGeometry(Te, {
        depth: 0.022,
        bevelEnabled: !1,
      });
      Ye.rotateY(Math.PI / 2);
      const $ = new Mesh(Ye, n.gloss);
      $.position.set(Ce * 0.42 - 0.011, 0, 0), Z.add($);
    }
    Z.position.set(0, ie - 0.34, -1.98),
      (Z.userData = {
        stowY: ie - 0.34,
        upY: ie - 0.04,
      });
  }
  t.add(Z);
  const X = new MeshStandardMaterial({
    color: 14210770,
    roughness: 0.6,
  });
  for (const j of [-1, 1]) {
    const ie = new Mesh(new BoxGeometry(0.48, 0.62, 0.14), X);
    ie.position.set(j * 0.37, 0.6, -0.6), (ie.rotation.x = -0.38), t.add(ie);
  }
  const oe = new Mesh(new TorusGeometry(0.15, 0.022, 8, 24, Math.PI), n.trim);
  oe.position.set(-0.37, 0.68, 0.3),
    oe.rotation.set(0.5, 0, Math.PI),
    t.add(oe),
    t.traverse((j) => {
      j.isMesh && ((j.castShadow = !0), (j.receiveShadow = !0));
    });
  const ue = [];
  for (const [j, ie] of [
    [CAR_DIMS.frontAxle, !0],
    [CAR_DIMS.rearAxle, !1],
  ])
    for (const N of [-1, 1]) {
      const k = new Group();
      k.position.set(N * CAR_DIMS.track, CAR_DIMS.wheelRadius, j);
      const se = buildWheel(n, N);
      k.add(se),
        e.add(k),
        ue.push({
          pivot: k,
          spin: se,
          front: ie,
          side: N,
          baseY: CAR_DIMS.wheelRadius,
        });
    }
  const xe = {
    lift: [
      {
        p: new Vector3(0.6, 0.18, 1.6),
        d: new Vector3(0, -1, 0),
      },
      {
        p: new Vector3(-0.6, 0.18, 1.6),
        d: new Vector3(0, -1, 0),
      },
      {
        p: new Vector3(0.6, 0.18, -1.62),
        d: new Vector3(0, -1, 0),
      },
      {
        p: new Vector3(-0.6, 0.18, -1.62),
        d: new Vector3(0, -1, 0),
      },
    ],
    rear: H.map((j) => ({
      p: j,
      d: new Vector3(0, 0, -1),
    })),
    side: [
      {
        p: new Vector3(1, 0.62, 0),
        d: new Vector3(1, 0, 0),
      },
      {
        p: new Vector3(-1, 0.62, 0),
        d: new Vector3(-1, 0, 0),
      },
    ],
    top: [
      {
        p: new Vector3(0.55, 0.95, 1.1),
        d: new Vector3(0, 1, 0),
      },
      {
        p: new Vector3(-0.55, 0.95, 1.1),
        d: new Vector3(0, 1, 0),
      },
      {
        p: new Vector3(0.55, 0.95, -1.3),
        d: new Vector3(0, 1, 0),
      },
      {
        p: new Vector3(-0.55, 0.95, -1.3),
        d: new Vector3(0, 1, 0),
      },
    ],
  };
  return {
    root: e,
    body: t,
    wheels: ue,
    thrusters: xe,
    mats: n,
    wing: Z,
    nozzleGlows: Q,
    parts: {
      tailBar: E,
      brakeBar: _,
    },
  };
}

export { buildRoadster };
