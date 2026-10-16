import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { makeNeonSign } from "./helpers.js";

class BullseyeTarget {
  constructor(e) {
    (this.center = e.clone()),
      (this.group = new Group()),
      (this.rings = [
        {
          r: 6,
          pts: 5e3,
          label: "BULLSEYE",
          color: new Color(3.2, 2.2, 0.6),
        },
        {
          r: 14,
          pts: 2e3,
          label: "INNER RING",
          color: new Color(0.5, 2, 3.2),
        },
        {
          r: 26,
          pts: 800,
          label: "OUTER RING",
          color: new Color(2.6, 0.25, 0.35),
        },
      ]);
    const s = this.group;
    // painted target rings on the asphalt (daylight), still pulsing gently
    for (const r of this.rings) {
      const p = r.color.clone().multiplyScalar(0.8 / Math.max(r.color.r, r.color.g, r.color.b)),
        l = new Mesh(
          new RingGeometry(r.r - 0.45, r.r, 128),
          new MeshStandardMaterial({
            color: p,
            emissive: p,
            emissiveIntensity: 0.25,
            roughness: 0.65,
            transparent: !0,
            depthWrite: !1,
            polygonOffset: !0,
            polygonOffsetFactor: -6,
          }),
        );
      (l.rotation.x = -Math.PI / 2),
        l.position.copy(e).setY(0.04),
        s.add(l),
        (r.mesh = l);
    }
    const t = new Mesh(
      new CircleGeometry(6, 64),
      new MeshStandardMaterial({
        color: new Color(0.8, 0.52, 0.1),
        roughness: 0.7,
        transparent: !0,
        opacity: 0.32,
        depthWrite: !1,
        polygonOffset: !0,
        polygonOffsetFactor: -5,
      }),
    );
    (t.rotation.x = -Math.PI / 2), t.position.copy(e).setY(0.03), s.add(t);
    const i = new CylinderGeometry(1.2, 2.4, 160, 24, 1, !0);
    i.translate(0, 80, 0);
    // marker column: an orange smoke-flare style column that reads against a bright sky
    const o = new ShaderMaterial({
      transparent: !0,
      depthWrite: !1,
      side: DoubleSide,
      uniforms: {
        uTime: {
          value: 0,
        },
      },
      vertexShader:
        "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }",
      fragmentShader:
        "uniform float uTime; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(normalize(vN), vV)), 2.0); float a = rim * (1.0 - vY) * (0.55 + 0.45*sin(uTime*2.0 - vY*20.0)); gl_FragColor = vec4(vec3(1.0,0.5,0.14), clamp(a*0.55, 0.0, 1.0)); }",
    });
    this.beamMat = o;
    const n = new Mesh(i, o);
    n.position.copy(e).setY(0), s.add(n);
    const c = makeNeonSign("BULLSEYE", "#ffc04a");
    c.position.copy(e).add(new Vector3(0, 9, -30)), s.add(c);
  }
  score(e) {
    const s = Math.hypot(e.x - this.center.x, e.z - this.center.z);
    for (const t of this.rings)
      if (s <= t.r)
        return {
          ...t,
          d: s,
        };
    return {
      label: "MISSED",
      pts: 0,
      d: s,
    };
  }
  update(e) {
    (this.beamMat.uniforms.uTime.value = e),
      this.rings.forEach((s, t) => {
        s.mesh.material.opacity = 0.75 + 0.25 * Math.sin(e * 2.2 + t);
      });
  }
}

export { BullseyeTarget };
