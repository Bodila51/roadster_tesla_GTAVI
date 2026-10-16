import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { makeConcreteTextures } from "./concrete-texture.js";

class ProfileRamp {
  constructor({
    position: e = new Vector3(0, 0, -150),
    heading: s = new Vector3(0, 0, -1),
    width: t = 7.2,
    name: i = "wall",
    kappa: o = ProfileRamp.kappa,
    length: n = 35.2,
    theta0: c = 0,
    entry: r = "lip",
    startEnd: l = "ground",
    build: d = !0,
    shift: f = null,
    endEnd: p = "launch",
    sideSolid: w = !0,
  } = {}) {
    (this.name = i),
      (this.origin = e.clone()),
      (this.f = s.clone().normalize()),
      (this.up = new Vector3(0, 1, 0)),
      (this.r = new Vector3().crossVectors(this.f, this.up).normalize()),
      (this.width = t),
      (this.half = t / 2),
      (this.kappaFn = o),
      (this.L = n),
      (this.theta0 = c),
      (this.entry = r),
      (this.startEnd = l),
      (this.endEnd = p),
      (this.shiftFn = f),
      (this.sideSolid = w),
      this._buildProfile(),
      (this.group = new Group()),
      d && (this._buildMesh(), this._buildTruss(), this._buildDressing());
  }
  static kappa(e) {
    const s = [
      [0, 2.5, 0, 0],
      [2.5, 9, 0, 0.11764705882352941],
      [9, 15.5, 0.11764705882352941, 0.11764705882352941],
      [15.5, 19.5, 0.11764705882352941, 0.012],
      [19.5, 27.5, 0.012, 0.012],
      [27.5, 31, 0.012, 0.2173913043478261],
      [31, 35.2, 0.2173913043478261, 0.2173913043478261],
    ];
    for (const [t, i, o, n] of s)
      if (e >= t && e <= i) return o + (n - o) * ((e - t) / (i - t));
    return 1 / 4.6;
  }
  _buildProfile() {
    const s = Math.round(this.L / 0.05) + 1;
    (this.ds = 0.05),
      (this.S = new Float32Array(s)),
      (this.F = new Float32Array(s)),
      (this.Y = new Float32Array(s)),
      (this.TH = new Float32Array(s)),
      (this.KA = new Float32Array(s));
    let t = 0,
      i = 0,
      o = this.theta0;
    for (let l = 0; l < s; l++) {
      const d = l * 0.05,
        f = this.kappaFn(d);
      (this.S[l] = d),
        (this.F[l] = t),
        (this.Y[l] = i),
        (this.TH[l] = o),
        (this.KA[l] = f);
      const p = o + f * 0.05 * 0.5;
      (t += Math.cos(p) * 0.05), (i += Math.sin(p) * 0.05), (o += f * 0.05);
    }
    (this.n = s), (this.height = this.Y[s - 1]);
    let n = -1 / 0,
      c = 1 / 0,
      r = -1 / 0;
    for (let l = 0; l < s; l++)
      (n = Math.max(n, this.F[l])),
        (c = Math.min(c, this.Y[l])),
        (r = Math.max(r, this.Y[l]));
    (this.fMax = n), (this.topY = r), (this.minY = c);
  }
  sample(e) {
    const s = Math.min(Math.max(e, 0), this.L) / this.ds,
      t = Math.min(this.n - 2, Math.floor(s)),
      i = s - t;
    return {
      f: this.F[t] + (this.F[t + 1] - this.F[t]) * i,
      y: this.Y[t] + (this.Y[t + 1] - this.Y[t]) * i,
      th: this.TH[t] + (this.TH[t + 1] - this.TH[t]) * i,
      k: this.KA[t] + (this.KA[t + 1] - this.KA[t]) * i,
    };
  }
  shiftAt(e) {
    return this.shiftFn ? this.shiftFn(Math.min(Math.max(e, 0), this.L)) : 0;
  }
  point(e, s, t = new Vector3()) {
    const i = this.sample(e);
    return t
      .copy(this.origin)
      .addScaledVector(this.f, i.f)
      .addScaledVector(this.up, i.y)
      .addScaledVector(this.r, s + this.shiftAt(e));
  }
  tangent(e, s = new Vector3()) {
    const t = this.sample(e).th;
    return s
      .copy(this.f)
      .multiplyScalar(Math.cos(t))
      .addScaledVector(this.up, Math.sin(t));
  }
  normal(e, s = new Vector3()) {
    const t = this.sample(e).th;
    return s
      .copy(this.f)
      .multiplyScalar(-Math.sin(t))
      .addScaledVector(this.up, Math.cos(t));
  }
  project(e) {
    const s = new Vector3().subVectors(e, this.origin),
      t = s.dot(this.f),
      i = s.y,
      o = s.dot(this.r),
      n = (b) => {
        if (!this.shiftFn) return 0;
        const L = Math.abs(o - this.shiftFn(this.S[b])) - this.half;
        return L > 0 ? L * L : 0;
      };
    let c = 0,
      r = 1 / 0;
    for (let b = 0; b < this.n; b += 4) {
      const L = t - this.F[b],
        m = i - this.Y[b],
        v = L * L + m * m + n(b);
      v < r && ((r = v), (c = b));
    }
    const l = Math.max(0, c - 4),
      d = Math.min(this.n - 1, c + 4);
    for (let b = l; b <= d; b++) {
      const L = t - this.F[b],
        m = i - this.Y[b],
        v = L * L + m * m + n(b);
      v < r && ((r = v), (c = b));
    }
    const f = this.TH[c],
      p = -Math.sin(f),
      w = Math.cos(f),
      S = (t - this.F[c]) * p + (i - this.Y[c]) * w,
      y = o - (this.shiftFn ? this.shiftFn(this.S[c]) : 0);
    return {
      s: this.S[c],
      u: y,
      d: S,
      fl: t,
      yl: i,
    };
  }
  _buildMesh() {
    const e = Math.round(this.L / 0.2),
      s = 12,
      t = 0.55,
      i = [],
      o = [],
      n = [],
      c = [],
      r = new Vector3(),
      l = new Vector3();
    for (let h = 0; h <= e; h++) {
      const u = (h / e) * this.L;
      this.normal(u, l);
      for (let T = 0; T <= s; T++) {
        const z = -this.half + (T / s) * this.width;
        this.point(u, z, r),
          i.push(r.x, r.y, r.z),
          o.push(l.x, l.y, l.z),
          n.push(T / s, u / this.L);
      }
    }
    const d = s + 1;
    for (let h = 0; h < e; h++)
      for (let u = 0; u < s; u++) {
        const T = h * d + u,
          z = T + 1,
          g = T + d,
          D = g + 1;
        c.push(T, z, g, z, D, g);
      }
    const f = new BufferGeometry();
    f.setAttribute("position", new Float32BufferAttribute(i, 3)),
      f.setAttribute("normal", new Float32BufferAttribute(o, 3)),
      f.setAttribute("uv", new Float32BufferAttribute(n, 2)),
      f.setIndex(c),
      f.computeBoundingSphere();
    const p = makeConcreteTextures(this.L, this.width),
      w = new MeshStandardMaterial({
        map: p.map,
        roughnessMap: p.rough,
        bumpMap: p.bump,
        bumpScale: 1.2,
        roughness: 1,
        metalness: 0,
        color: 13619147,
        side: DoubleSide,
      }),
      S = new Mesh(f, w);
    (S.receiveShadow = !0), (S.castShadow = !0), this.group.add(S);
    const y = [],
      b = [];
    for (let h = 0; h <= e; h++) {
      const u = (h / e) * this.L;
      this.normal(u, l);
      for (const T of [-this.half, this.half])
        this.point(u, T, r),
          y.push(r.x - l.x * t, r.y - l.y * t, r.z - l.z * t);
    }
    for (let h = 0; h < e; h++) {
      const u = h * 2,
        T = u + 1,
        z = u + 2,
        g = u + 3;
      b.push(u, T, z, T, g, z);
    }
    const L = new BufferGeometry();
    L.setAttribute("position", new Float32BufferAttribute(y, 3)),
      L.setIndex(b),
      L.computeVertexNormals();
    const m = new MeshStandardMaterial({
        color: 3882304,
        roughness: 0.8,
        metalness: 0.4,
        side: DoubleSide,
      }),
      v = new Mesh(L, m);
    (v.castShadow = !0), this.group.add(v);
    for (const h of [-this.half, this.half]) {
      const u = [],
        T = [];
      for (let D = 0; D <= e; D++) {
        const P = (D / e) * this.L;
        this.normal(P, l),
          this.point(P, h, r),
          u.push(r.x, r.y, r.z, r.x - l.x * t, r.y - l.y * t, r.z - l.z * t);
      }
      for (let D = 0; D < e; D++) {
        const P = D * 2;
        T.push(P, P + 1, P + 2, P + 1, P + 3, P + 2);
      }
      const z = new BufferGeometry();
      z.setAttribute("position", new Float32BufferAttribute(u, 3)),
        z.setIndex(T),
        z.computeVertexNormals();
      const g = new Mesh(
        z,
        new MeshStandardMaterial({
          color: 10132118,
          roughness: 0.9,
          side: DoubleSide,
        }),
      );
      (g.castShadow = !0), this.group.add(g);
    }
    const x = new MeshStandardMaterial({
      color: 2228224,
      emissive: 16716840,
      emissiveIntensity: 6,
      roughness: 0.4,
    });
    this.ledMat = x;
    for (const h of [-1, 1]) {
      const u = [];
      for (let D = 0; D <= 140; D++) {
        const P = (D / 140) * this.L;
        this.normal(P, l),
          this.point(P, h * (this.half - 0.07), r).addScaledVector(l, 0.03),
          u.push(r.clone());
      }
      const T = new CatmullRomCurve3(u),
        z = new Mesh(new TubeGeometry(T, 280, 0.035, 6), x);
      this.group.add(z);
      const g = u.map((D, P) => {
        const k = (P / 140) * this.L;
        return (
          this.normal(k, l),
          this.point(k, h * (this.half + 0.02), new Vector3()).addScaledVector(
            l,
            0.05,
          )
        );
      });
      this.group.add(
        new Mesh(
          new TubeGeometry(new CatmullRomCurve3(g), 280, 0.05, 6),
          new MeshStandardMaterial({
            color: 2763566,
            metalness: 0.8,
            roughness: 0.35,
          }),
        ),
      );
    }
  }
  _buildTruss() {
    const e = new MeshStandardMaterial({
        color: 9146261,
        metalness: 0.9,
        roughness: 0.35,
      }),
      s = [],
      t = (x, h, u = 0.06) => s.push([x.clone(), h.clone(), u]),
      i = 3.2,
      o = this.half + 0.6,
      n = this.fMax + 0.4,
      c = n + i,
      r = this.topY + 1.2,
      l = (x, h, u) =>
        this.origin
          .clone()
          .addScaledVector(this.f, x)
          .addScaledVector(this.up, h)
          .addScaledVector(this.r, u),
      d = Math.ceil(r / 1.6);
    for (const x of [-o, o])
      for (const h of [n, c]) t(l(h, 0, x), l(h, r, x), 0.09);
    for (let x = 0; x <= d; x++) {
      const h = Math.min(r, x * 1.6);
      if (
        (t(l(n, h, -o), l(n, h, o)),
        t(l(c, h, -o), l(c, h, o)),
        t(l(n, h, -o), l(c, h, -o)),
        t(l(n, h, o), l(c, h, o)),
        x < d)
      ) {
        const u = Math.min(r, (x + 1) * 1.6);
        t(l(n, h, -o), l(n, u, o), 0.04),
          t(l(c, h, o), l(c, u, -o), 0.04),
          t(l(n, h, -o), l(c, u, -o), 0.04),
          t(l(n, h, o), l(c, u, o), 0.04);
      }
    }
    const p = this.sample(this.L).f - 1.5;
    for (const x of [-o, o])
      t(l(n, r, x), l(p, r, x), 0.08), t(l(n, r - 1.4, x), l(p, r, x), 0.05);
    t(l(p, r, -o), l(p, r, o), 0.08);
    for (let x = 6; x < this.L; x += 2.4) {
      const h = this.sample(x);
      if (!(h.f < 3))
        for (const u of [-this.half + 0.4, this.half - 0.4]) {
          const T = this.normal(x),
            z = this.point(x, u).addScaledVector(T, -0.55),
            g = l(n, Math.min(r, Math.max(0.2, h.y)), u);
          z.distanceTo(g) > 0.4 && t(z, g, 0.05);
        }
    }
    const w = new CylinderGeometry(1, 1, 1, 8, 1, !1),
      S = new InstancedMesh(w, e, s.length),
      y = new Matrix4(),
      b = new Quaternion(),
      L = new Vector3(),
      m = new Vector3(0, 1, 0);
    s.forEach(([x, h, u], T) => {
      const z = new Vector3().subVectors(h, x),
        g = z.length();
      b.setFromUnitVectors(m, z.normalize()),
        L.set(u, g, u),
        y.compose(new Vector3().addVectors(x, h).multiplyScalar(0.5), b, L),
        S.setMatrixAt(T, y);
    }),
      (S.castShadow = !0),
      (S.receiveShadow = !0),
      this.group.add(S),
      (this.towerBox = {
        min: l(n - 0.3, 0, -o - 0.2).min(l(c + 0.3, r, o + 0.2)),
        max: l(n - 0.3, 0, -o - 0.2).max(l(c + 0.3, r, o + 0.2)),
        name: "tower",
      });
    const v = new Mesh(
      new SphereGeometry(0.18, 12, 8),
      new MeshStandardMaterial({
        color: 3145728,
        emissive: 16719904,
        emissiveIntensity: 8,
      }),
    );
    v.position.copy(l((n + c) / 2, r + 0.3, 0)),
      (this.beacon = v),
      this.group.add(v);
  }
  _buildDressing() {
    const e = new Mesh(
      new BoxGeometry(this.width + 3, 0.04, 6),
      new MeshStandardMaterial({
        color: 9276552,
        roughness: 0.95,
      }),
    );
    e.position.copy(this.origin).addScaledVector(this.f, -3),
      (e.position.y = 0.02),
      e.lookAt(e.position.clone().add(this.f)),
      (e.receiveShadow = !0),
      this.group.add(e),
      (this.wallLights = []);
    for (const s of [-this.half - 1.2, this.half + 1.2]) {
      const t = new Mesh(
        new BoxGeometry(0.5, 0.35, 0.5),
        new MeshStandardMaterial({
          color: 1381914,
          roughness: 0.5,
          metalness: 0.6,
        }),
      );
      t.position
        .copy(this.origin)
        .addScaledVector(this.f, 1.5)
        .addScaledVector(this.r, s),
        (t.position.y = 0.18),
        this.group.add(t);
      const i = new Mesh(
        new CircleGeometry(0.16, 16),
        new MeshStandardMaterial({
          color: 16777215,
          emissive: 12574975,
          emissiveIntensity: 6,
        }),
      );
      i.position.copy(t.position),
        (i.position.y += 0.18),
        (i.rotation.x = -Math.PI / 2),
        this.group.add(i),
        this.wallLights.push(t.position.clone());
    }
  }
}

export { ProfileRamp };
