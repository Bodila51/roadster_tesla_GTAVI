import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from "three";

class Sparks {
  constructor(e, t = 400) {
    (this.max = t),
      (this.pos = new Float32Array(t * 2 * 3)),
      (this.col = new Float32Array(t * 2 * 3));
    const i = new BufferGeometry();
    i.setAttribute(
      "position",
      new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage),
    ),
      i.setAttribute(
        "color",
        new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage),
      ),
      (this.lines = new LineSegments(
        i,
        new LineBasicMaterial({
          vertexColors: !0,
          transparent: !0,
          blending: AdditiveBlending,
          depthWrite: !1,
        }),
      )),
      (this.lines.frustumCulled = !1),
      e.add(this.lines),
      (this.p = []);
  }
  burst(e, t, i = 40, s = 12) {
    for (let r = 0; r < i; r++) {
      const a = new Vector3(
        Math.random() - 0.5,
        Math.random() * 0.8 + 0.2,
        Math.random() - 0.5,
      )
        .normalize()
        .multiplyScalar(s * (0.3 + Math.random()));
      t && a.addScaledVector(t, s * 0.4),
        this.p.length > this.max && this.p.shift(),
        this.p.push({
          pos: e.clone(),
          vel: a,
          life: 0.4 + Math.random() * 0.6,
          age: 0,
        });
    }
  }
  update(e) {
    let t = 0;
    for (const i of this.p)
      (i.age += e),
        !(i.age > i.life) &&
          ((i.vel.y -= 9.81 * e),
          i.pos.addScaledVector(i.vel, e),
          i.pos.y < 0.02 &&
            ((i.pos.y = 0.02),
            (i.vel.y *= -0.4),
            (i.vel.x *= 0.7),
            (i.vel.z *= 0.7)),
          (this.p[t++] = i));
    this.p.length = t;
    for (let i = 0; i < this.max; i++) {
      const s = this.p[i],
        r = i * 6;
      if (!s) {
        this.pos.fill(0, r, r + 6), this.col.fill(0, r, r + 6);
        continue;
      }
      const a = 1 - s.age / s.life;
      (this.pos[r] = s.pos.x),
        (this.pos[r + 1] = s.pos.y),
        (this.pos[r + 2] = s.pos.z),
        (this.pos[r + 3] = s.pos.x - s.vel.x * 0.03),
        (this.pos[r + 4] = s.pos.y - s.vel.y * 0.03),
        (this.pos[r + 5] = s.pos.z - s.vel.z * 0.03);
      const o = [3 * a, 1.6 * a * a, 0.5 * a * a * a];
      this.col.set(o, r),
        this.col.set(
          o.map((c) => c * 0.3),
          r + 3,
        );
    }
    (this.lines.geometry.attributes.position.needsUpdate = !0),
      (this.lines.geometry.attributes.color.needsUpdate = !0);
  }
}

export { Sparks };
