import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
} from "three";

class SkidMarks {
  constructor(e, t = 1600) {
    (this.max = t),
      (this.pos = new Float32Array(t * 4 * 3)),
      (this.alpha = new Float32Array(t * 4));
    const i = [];
    for (let a = 0; a < t; a++) {
      const o = a * 4;
      i.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
    }
    const s = new BufferGeometry();
    s.setAttribute(
      "position",
      new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage),
    ),
      s.setAttribute(
        "alpha",
        new BufferAttribute(this.alpha, 1).setUsage(DynamicDrawUsage),
      ),
      s.setIndex(i);
    const r = new ShaderMaterial({
      transparent: !0,
      depthWrite: !1,
      polygonOffset: !0,
      polygonOffsetFactor: -6,
      vertexShader:
        "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
      fragmentShader:
        "varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.02, vA*0.55); }",
    });
    (this.mesh = new Mesh(s, r)),
      (this.mesh.frustumCulled = !1),
      e.add(this.mesh),
      (this.head = 0),
      (this.last = new Map());
  }
  mark(e, t, i, s, r = 0.012) {
    const a = this.last.get(e);
    if (
      (this.last.set(e, {
        p: t.clone(),
        side: i.clone(),
      }),
      !a || a.p.distanceTo(t) > 3)
    )
      return;
    if (a.p.distanceTo(t) < 0.15) {
      this.last.set(e, a);
      return;
    }
    const o = this.head;
    this.head = (this.head + 1) % this.max;
    const c = 0.14,
      l = this.pos,
      u = o * 12,
      h = a.p.clone().addScaledVector(a.side, c),
      p = a.p.clone().addScaledVector(a.side, -c),
      d = t.clone().addScaledVector(i, c),
      g = t.clone().addScaledVector(i, -c);
    [h, p, d, g].forEach((v, m) => {
      (l[u + m * 3] = v.x),
        (l[u + m * 3 + 1] = r + a.p.y * 0 + (t.y > 0.05 ? t.y : 0)),
        (l[u + m * 3 + 2] = v.z);
    });
    for (let v = 0; v < 4; v++) this.alpha[o * 4 + v] = s;
    (this.mesh.geometry.attributes.position.needsUpdate = !0),
      (this.mesh.geometry.attributes.alpha.needsUpdate = !0);
  }
  break(e) {
    this.last.delete(e);
  }
}

export { SkidMarks };
