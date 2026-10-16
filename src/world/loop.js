import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  FrontSide,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import {
  buildStruts,
  footprintToBox,
  makeNeonSign,
  makeStripeTexture,
} from "./helpers.js";
import { ProfileRamp } from "./ramp.js";

const ri = (a) => a * a * (3 - 2 * a),
  Ct = 9.5,
  Dt = 6,
  we = 4,
  Ys = 10,
  Ce = 2 * Math.PI - Dt / Ct,
  Ps = we + Dt + Ct * Ce + Dt + Ys;
function li(a) {
  const e = we,
    s = e + Dt,
    t = s + Ct * Ce,
    i = t + Dt;
  return a < e
    ? 0
    : a < s
      ? (a - e) / Dt / Ct
      : a < t
        ? 1 / Ct
        : a < i
          ? (1 - (a - t) / Dt) / Ct
          : 0;
}
class Loop extends ProfileRamp {
  constructor({ position: e, heading: s, width: t = 6.4 }) {
    const i = t + 1.6,
      o = we + Dt * 0.5,
      n = Ps - Ys - Dt * 0.5;
    super({
      position: e,
      heading: s,
      width: t,
      name: "loop",
      kappa: li,
      length: Ps,
      theta0: 0,
      entry: "lip",
      startEnd: "ground",
      endEnd: "ground",
      sideSolid: !1,
      build: !1,
      shift: (c) => i * ri(Math.min(1, Math.max(0, (c - o) / (n - o)))),
    }),
      (this.shiftTotal = i),
      (this.colliders = []),
      this.build();
  }
  build() {
    const e = this.group,
      s = 360,
      t = 8,
      i = [],
      o = [],
      n = [],
      c = [],
      r = new Vector3(),
      l = new Vector3();
    for (let k = 0; k <= s; k++) {
      const R = (k / s) * this.L;
      this.normal(R, l);
      for (let A = 0; A <= t; A++) {
        const C = -this.half + (A / t) * this.width;
        this.point(R, C, r),
          i.push(r.x, r.y, r.z),
          o.push(l.x, l.y, l.z),
          c.push(A / t, R / 6);
      }
    }
    const d = t + 1;
    for (let k = 0; k < s; k++)
      for (let R = 0; R < t; R++) {
        const A = k * d + R,
          C = A + 1,
          B = A + d,
          N = B + 1;
        n.push(A, C, B, C, N, B);
      }
    const f = new BufferGeometry();
    f.setAttribute("position", new Float32BufferAttribute(i, 3)),
      f.setAttribute("normal", new Float32BufferAttribute(o, 3)),
      f.setAttribute("uv", new Float32BufferAttribute(c, 2)),
      f.setIndex(n);
    const p = new Mesh(
      f,
      new MeshPhysicalMaterial({
        map: makeStripeTexture(),
        color: 15132385,
        roughness: 0.45,
        metalness: 0,
        clearcoat: 0.5,
        clearcoatRoughness: 0.25,
        side: FrontSide,
      }),
    );
    (p.receiveShadow = !0), (p.castShadow = !0), e.add(p);
    const w = [],
      S = [],
      y = [],
      b = [];
    for (let k = 0; k <= s; k++) {
      const R = (k / s) * this.L;
      this.normal(R, l);
      for (const A of [-this.half, this.half]) {
        this.point(R, A, r);
        const C = r.clone().addScaledVector(l, -0.45);
        w.push(C.x, C.y, C.z),
          (A < 0 ? y : b).push(r.x, r.y, r.z, C.x, C.y, C.z);
      }
    }
    for (let k = 0; k < s; k++) {
      const R = k * 2;
      S.push(R, R + 2, R + 1, R + 1, R + 2, R + 3);
    }
    const L = new BufferGeometry();
    L.setAttribute("position", new Float32BufferAttribute(w, 3)),
      L.setIndex(S),
      L.computeVertexNormals();
    const m = new MeshStandardMaterial({
      color: 8423572,
      roughness: 0.5,
      metalness: 0.4,
      side: DoubleSide,
    });
    e.add(new Mesh(L, m));
    for (const k of [y, b]) {
      const R = new BufferGeometry();
      R.setAttribute("position", new Float32BufferAttribute(k, 3));
      const A = [];
      for (let C = 0; C < s; C++) {
        const B = C * 2;
        A.push(B, B + 1, B + 2, B + 1, B + 3, B + 2);
      }
      R.setIndex(A), R.computeVertexNormals(), e.add(new Mesh(R, m));
    }
    const v = new MeshStandardMaterial({
      color: 2228224,
      emissive: 16717872,
      emissiveIntensity: 3,
    });
    for (const k of [-1, 1]) {
      const R = [];
      for (let A = 0; A <= 240; A++) {
        const C = (A / 240) * this.L;
        this.normal(C, l),
          R.push(
            this.point(C, k * (this.half - 0.06)).addScaledVector(l, 0.04),
          );
      }
      e.add(
        new Mesh(new TubeGeometry(new CatmullRomCurve3(R), 480, 0.04, 6), v),
      );
    }
    const x = we + Dt + Ct * Ce * 0.5,
      h = this.point(x, 0),
      u = this.normal(x),
      T = h.clone().addScaledVector(u, Ct),
      z = new MeshStandardMaterial({
        color: 10922928,
        metalness: 0.8,
        roughness: 0.45,
      }),
      g = [];
    for (const k of [-1, 1]) {
      const R = T.clone().addScaledVector(
          this.r,
          k * (this.half + this.shiftTotal / 2 + 2.2),
        ),
        A = new Mesh(new CylinderGeometry(0.9, 0.9, 0.8, 24), z);
      A.position.copy(R),
        A.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), this.r),
        e.add(A);
      const C = new Mesh(
        new TorusGeometry(0.95, 0.12, 8, 32),
        new MeshStandardMaterial({
          color: 2228224,
          emissive: 16717872,
          emissiveIntensity: 3,
        }),
      );
      C.position.copy(R).addScaledVector(this.r, k * 0.42),
        C.quaternion
          .copy(A.quaternion)
          .multiply(
            new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)),
          ),
        e.add(C);
      for (let B = 0; B < 16; B++) {
        const N = we + Dt + (B / 16) * Ct * Ce,
          q = this.point(N, k * this.half).addScaledVector(
            this.normal(N),
            -0.45,
          );
        q.y < 0.5 || g.push([R.clone(), q, 0.07]);
      }
      for (const B of [-7, 7]) {
        const N = R.clone()
          .addScaledVector(this.f, B)
          .addScaledVector(this.r, k * 3);
        (N.y = 0), g.push([R.clone(), N, 0.22]);
      }
      this.colliders.push(
        footprintToBox(R.clone().setY(0), this.f, this.r, 15, 2, R.y + 1),
      );
    }
    buildStruts(e, g, z);
    const D = new Mesh(new BoxGeometry(this.width + 3, 0.5, 0.5), z);
    D.position.copy(this.point(1.5, 0)).setY(6.5),
      D.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(this.r, new Vector3(0, 1, 0), this.f),
      ),
      e.add(D);
    for (const k of [-1, 1]) {
      const R = new Mesh(new BoxGeometry(0.4, 6.5, 0.4), z);
      R.position.copy(this.point(1.5, k * (this.half + 1.3))).setY(3.25),
        e.add(R),
        this.colliders.push(
          footprintToBox(
            R.position.clone().setY(0),
            this.f,
            this.r,
            0.6,
            0.6,
            6.5,
          ),
        );
    }
    const P = makeNeonSign("LOOP", "#ff2a3c");
    P.position.copy(D.position).setY(7.6),
      P.quaternion.copy(D.quaternion),
      P.rotateY(Math.PI),
      e.add(P);
  }
}

export { Loop };
