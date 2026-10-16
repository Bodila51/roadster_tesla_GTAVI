import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import { buildStruts, footprintToBox, makeNeonSign } from "./helpers.js";
import { ProfileRamp } from "./ramp.js";

const Gs = (32 * Math.PI) / 180,
  ns = 30,
  rs = 4,
  hi = 46,
  fi = rs + ns * Gs + hi;
function di(a) {
  return a < rs ? 0 : a < rs + ns * Gs ? 1 / ns : 0;
}
class MassDriver extends ProfileRamp {
  constructor({ position: e, heading: s, width: t = 6.2 }) {
    super({
      position: e,
      heading: s,
      width: t,
      name: "massdriver",
      kappa: di,
      length: fi,
      entry: "lip",
      startEnd: "ground",
      endEnd: "launch",
      sideSolid: !1,
      build: !1,
    }),
      (this.railAccel = 42),
      (this.railTop = 80),
      (this.colliders = []),
      (this.coils = []),
      this.build();
  }
  build() {
    const e = this.group,
      s = 160,
      t = 6,
      i = [],
      o = [],
      n = [],
      c = new Vector3(),
      r = new Vector3();
    for (let m = 0; m <= s; m++) {
      const v = (m / s) * this.L;
      this.normal(v, r);
      for (let x = 0; x <= t; x++)
        this.point(v, -this.half + (x / t) * this.width, c),
          i.push(c.x, c.y, c.z),
          o.push(r.x, r.y, r.z);
    }
    const l = t + 1;
    for (let m = 0; m < s; m++)
      for (let v = 0; v < t; v++) {
        const x = m * l + v,
          h = x + 1,
          u = x + l,
          T = u + 1;
        n.push(x, h, u, h, T, u);
      }
    const d = new BufferGeometry();
    d.setAttribute("position", new Float32BufferAttribute(i, 3)),
      d.setAttribute("normal", new Float32BufferAttribute(o, 3)),
      d.setIndex(n);
    const f = new MeshPhysicalMaterial({
        color: 1777187,
        metalness: 0.85,
        roughness: 0.3,
        clearcoat: 0.5,
      }),
      p = new Mesh(d, f);
    (p.receiveShadow = !0),
      (p.castShadow = !0),
      e.add(p),
      (this.chaseMat = new ShaderMaterial({
        uniforms: {
          uTime: {
            value: 0,
          },
          uCharge: {
            value: 0,
          },
        },
        vertexShader:
          "varying float vS; attribute float aS; void main(){ vS = aS; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
        fragmentShader: `uniform float uTime; uniform float uCharge; varying float vS;
        void main(){ float speed = mix(8.0, 60.0, uCharge);
          float w = fract(vS*0.12 - uTime*speed*0.12);
          float pulse = smoothstep(0.75, 1.0, w);
          vec3 base = vec3(0.1, 0.55, 1.0);
          vec3 col = base * (0.6 + 5.5*pulse*(0.4+uCharge));
          gl_FragColor = vec4(col, 1.0); }`,
      }));
    for (const m of [-1, 1]) {
      const v = [],
        x = [],
        h = [];
      for (let z = 0; z <= s; z++) {
        const g = (z / s) * this.L;
        this.normal(g, r);
        const D = this.point(g, m * (this.half - 0.1)).addScaledVector(r, 0.03),
          P = this.point(g, m * (this.half - 0.32)).addScaledVector(r, 0.03);
        v.push(D.x, D.y, D.z, P.x, P.y, P.z), x.push(g, g);
      }
      for (let z = 0; z < s; z++) {
        const g = z * 2;
        h.push(g, g + 1, g + 2, g + 1, g + 3, g + 2);
      }
      const u = new BufferGeometry();
      u.setAttribute("position", new Float32BufferAttribute(v, 3)),
        u.setAttribute("aS", new Float32BufferAttribute(x, 1)),
        u.setIndex(h);
      const T = new Mesh(u, this.chaseMat);
      (T.material.side = DoubleSide), e.add(T);
    }
    const w = new TorusGeometry(4.6, 0.28, 12, 64),
      S = new MeshStandardMaterial({
        color: 9344412,
        metalness: 0.9,
        roughness: 0.35,
      }),
      y = [];
    for (let m = 8; m < this.L - 2; m += 5.2) {
      const v = new MeshStandardMaterial({
          color: 4120,
          emissive: 4180223,
          emissiveIntensity: 1.2,
          metalness: 0.6,
          roughness: 0.3,
        }),
        x = new Mesh(w, v),
        h = this.point(m, 0).addScaledVector(this.normal(m), 1.2);
      x.position.copy(h),
        x.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), this.tangent(m)),
        e.add(x),
        this.coils.push({
          mesh: x,
          s: m,
        });
      const u = this.point(m, 0).addScaledVector(this.normal(m), -0.4);
      if (u.y > 0.6) {
        for (const T of [-1, 1]) {
          const z = this.point(m, T * (this.half - 0.6)).addScaledVector(
            this.normal(m),
            -0.4,
          );
          y.push([z, z.clone().setY(0), 0.18]);
        }
        y.push([
          this.point(m, -this.half + 0.6)
            .addScaledVector(this.normal(m), -0.4)
            .setY(Math.max(0.5, u.y * 0.5)),
          this.point(m, this.half - 0.6)
            .addScaledVector(this.normal(m), -0.4)
            .setY(Math.max(0.5, u.y * 0.5)),
          0.08,
        ]);
      }
    }
    buildStruts(e, y, S);
    for (let m = 20; m < this.L; m += 8) {
      const v = this.point(m, 0);
      this.colliders.push(
        footprintToBox(
          v.clone().setY(0),
          this.f,
          this.r,
          8.5,
          this.width + 0.6,
          Math.max(1, v.y - 0.2),
        ),
      );
    }
    const b = makeNeonSign("MASS DRIVER", "#3fc8ff");
    b.position.copy(this.point(2, 0)).setY(6.8),
      b.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(this.r, new Vector3(0, 1, 0), this.f),
      ),
      b.rotateY(Math.PI),
      e.add(b);
    for (const m of [-1, 1]) {
      const v = new Mesh(new BoxGeometry(0.4, 6.5, 0.4), S);
      v.position.copy(this.point(2, m * (this.half + 1.2))).setY(3.25),
        e.add(v),
        this.colliders.push(
          footprintToBox(
            v.position.clone().setY(0),
            this.f,
            this.r,
            0.6,
            0.6,
            6.5,
          ),
        );
    }
    const L = new Mesh(new BoxGeometry(this.width + 3, 0.5, 0.5), S);
    L.position.copy(this.point(2, 0)).setY(6.5),
      L.quaternion.copy(b.quaternion),
      e.add(L);
  }
  update(e, s, t) {
    const i = t != null;
    (this.charge = MathUtils.lerp(
      this.charge || 0,
      i ? 1 : 0,
      Math.min(1, e * (i ? 6 : 1.5)),
    )),
      (this.chaseMat.uniforms.uTime.value = s),
      (this.chaseMat.uniforms.uCharge.value = this.charge);
    for (const o of this.coils) {
      const n = i ? Math.exp(-Math.abs(o.s - t) * 0.25) : 0,
        c = 0.45 + 0.3 * Math.sin(s * 3 - o.s * 0.3);
      o.mesh.material.emissiveIntensity = c + n * 14;
    }
  }
}

export { MassDriver };
