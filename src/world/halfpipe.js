import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import { makeConcreteTextures, makeWallTexture } from "./concrete-texture.js";
import { ProfileRamp } from "./ramp.js";

const It = 7.5,
  Qt = 1.6,
  ge = 12;
function ai(a) {
  return a < Qt
    ? 0
    : a < Qt + (It * Math.PI) / 2
      ? 1 / It
      : a < Qt + (It * Math.PI) / 2 + ge
        ? 0
        : a < Qt + It * Math.PI + ge
          ? 1 / It
          : 0;
}
// box UVs in metres per face (px, nx, py, ny, pz, nz) so a wall texture keeps its scale
function boxUvMeters(a, e, s, t) {
  const i = a.attributes.uv,
    o = [
      [t, s],
      [t, s],
      [e, t],
      [e, t],
      [e, s],
      [e, s],
    ];
  for (let n = 0; n < i.count; n++) {
    const c = o[Math.floor(n / 4)];
    i.setXY(n, i.getX(n) * c[0], i.getY(n) * c[1]);
  }
  return a;
}
class Halfpipe extends ProfileRamp {
  constructor({ center: e, along: s = new Vector3(1, 0, 0), length: t = 64 }) {
    const i = Qt + It,
      o = new Vector3().crossVectors(new Vector3(0, 1, 0), s).normalize(),
      n = ge + 2 * It,
      c = e
        .clone()
        .addScaledVector(o, -n / 2)
        .setY(i + 0.02);
    super({
      position: c,
      heading: o,
      width: t,
      name: "halfpipe",
      kappa: ai,
      length: Qt * 2 + It * Math.PI + ge,
      theta0: -Math.PI / 2,
      entry: "flat",
      startEnd: "launch",
      build: !1,
    }),
      (this.H = i),
      (this.pipeWidth = n),
      (this.center = e.clone()),
      (this.along = s.clone().normalize()),
      (this.flatS0 = Qt + (It * Math.PI) / 2),
      (this.flatS1 = this.flatS0 + ge),
      this.buildPipe();
  }
  buildPipe() {
    const e = this.group,
      s = makeConcreteTextures(this.L, this.width, 0.35),
      t = new MeshStandardMaterial({
        map: s.map,
        roughnessMap: s.rough,
        bumpMap: s.bump,
        bumpScale: 0.8,
        color: 15263459,
        roughness: 1,
        side: DoubleSide,
      });
    for (const v of [s.map, s.rough, s.bump])
      (v.wrapS = v.wrapT = RepeatWrapping), v.repeat.set(5, 1);
    const i = 120,
      o = 24,
      n = [],
      c = [],
      r = [],
      l = [],
      d = new Vector3(),
      f = new Vector3();
    for (let v = 0; v <= i; v++) {
      const x = (v / i) * this.L;
      this.normal(x, f);
      for (let h = 0; h <= o; h++) {
        const u = -this.half + (h / o) * this.width;
        this.point(x, u, d),
          n.push(d.x, d.y, d.z),
          c.push(f.x, f.y, f.z),
          r.push(h / o, x / this.L);
      }
    }
    const p = o + 1;
    for (let v = 0; v < i; v++)
      for (let x = 0; x < o; x++) {
        const h = v * p + x,
          u = h + 1,
          T = h + p,
          z = T + 1;
        l.push(h, u, T, u, z, T);
      }
    const w = new BufferGeometry();
    w.setAttribute("position", new Float32BufferAttribute(n, 3)),
      w.setAttribute("normal", new Float32BufferAttribute(c, 3)),
      w.setAttribute("uv", new Float32BufferAttribute(r, 2)),
      w.setIndex(l);
    const S = new Mesh(w, t);
    (S.receiveShadow = !0), (S.castShadow = !0), e.add(S);
    {
      const v = [],
        x = [],
        h = new Vector3(),
        u = new Vector3();
      for (let g = 0; g <= i; g++) {
        const D = (g / i) * this.L;
        this.normal(D, h);
        for (const P of [-this.half, this.half])
          this.point(D, P, u).addScaledVector(h, -0.6), v.push(u.x, u.y, u.z);
      }
      for (let g = 0; g < i; g++) {
        const D = g * 2;
        x.push(D, D + 2, D + 1, D + 1, D + 2, D + 3);
      }
      const T = new BufferGeometry();
      T.setAttribute("position", new Float32BufferAttribute(v, 3)),
        T.setIndex(x),
        T.computeVertexNormals();
      const z = new Mesh(
        T,
        new MeshStandardMaterial({
          color: 9079947,
          roughness: 0.95,
          side: DoubleSide,
        }),
      );
      e.add(z);
    }
    const wt = makeWallTexture().clone();
    wt.repeat.set(1 / 4.8, 1 / 4.8);
    const y = new MeshStandardMaterial({
        map: wt,
        color: 15790320,
        roughness: 0.9,
      }),
      b = 3.5;
    for (const v of [-1, 1]) {
      const x = new Shape();
      x.moveTo(-b, 0), x.lineTo(-b, this.H);
      for (let T = 0; T < this.n; T += 6)
        x.lineTo(this.F[T], this.Y[T] + this.origin.y);
      x.lineTo(this.F[this.n - 1], this.Y[this.n - 1] + this.origin.y),
        x.lineTo(this.pipeWidth + b, this.H),
        x.lineTo(this.pipeWidth + b, 0),
        x.closePath();
      const h = new Mesh(new ShapeGeometry(x, 1), y),
        u = new Matrix4().makeBasis(this.f, new Vector3(0, 1, 0), this.r);
      h.applyMatrix4(u),
        h.position
          .copy(this.origin)
          .setY(0)
          .addScaledVector(this.r, v * this.half),
        (h.material = y.clone()),
        (h.material.side = DoubleSide),
        (h.castShadow = !0),
        (h.receiveShadow = !0),
        e.add(h);
    }
    this.deckBoxes = [];
    const bw = makeWallTexture().clone();
    bw.repeat.set(1 / 4.8, 1 / 4.8);
    const L = new MeshStandardMaterial({
      map: bw,
      color: 14737632,
      roughness: 0.9,
      metalness: 0,
    });
    for (const v of [!1, !0]) {
      const x = v ? this.pipeWidth + b / 2 : -b / 2,
        h = this.origin.clone().setY(0).addScaledVector(this.f, x),
        u = new Mesh(boxUvMeters(new BoxGeometry(b, this.H, this.width), b, this.H, this.width), L);
      u.position.copy(h).setY(this.H / 2),
        u.quaternion.setFromRotationMatrix(
          new Matrix4().makeBasis(this.f, new Vector3(0, 1, 0), this.r),
        ),
        (u.castShadow = !0),
        (u.receiveShadow = !0),
        e.add(u);
      const T = new Box3().setFromObject(u);
      this.deckBoxes.push({
        min: T.min.clone(),
        max: T.max.clone(),
        name: "deck",
        drivable: !0,
      });
      const z = v ? this.L : 0,
        g = this.point(z, -this.half),
        D = this.point(z, this.half),
        P = new Mesh(
          new CylinderGeometry(0.09, 0.09, this.width, 12),
          new MeshStandardMaterial({
            color: 13094098,
            metalness: 1,
            roughness: 0.25,
          }),
        );
      P.position.addVectors(g, D).multiplyScalar(0.5),
        P.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), this.r),
        e.add(P);
      const k = new Mesh(
          new BoxGeometry(0.06, 0.06, this.width),
          new MeshStandardMaterial({
            color: 2228224,
            emissive: 16717872,
            emissiveIntensity: 3,
          }),
        ),
        R = this.point(v ? this.L - 0.25 : 0.25, 0).addScaledVector(
          this.normal(v ? this.L - 0.25 : 0.25),
          0.04,
        );
      k.position.copy(R),
        k.quaternion.setFromRotationMatrix(
          new Matrix4().makeBasis(this.f, new Vector3(0, 1, 0), this.r),
        ),
        e.add(k);
    }
    const m = new Mesh(
      new BoxGeometry(0.2, 0.02, this.width),
      new MeshStandardMaterial({
        color: 6176,
        emissive: 5953791,
        emissiveIntensity: 2,
      }),
    );
    m.position.copy(this.point((this.flatS0 + this.flatS1) / 2, 0)).setY(0.04),
      m.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(this.f, new Vector3(0, 1, 0), this.r),
      ),
      e.add(m),
      (this.colliders = this.deckBoxes);
  }
}

export { Halfpipe };
