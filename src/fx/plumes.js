import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector3,
} from "three";

const plumeMaterial = new ShaderMaterial({
  transparent: !0,
  depthWrite: !1,
  blending: AdditiveBlending,
  side: DoubleSide,
  uniforms: {
    uTime: {
      value: 0,
    },
  },
  vertexShader: `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0);
      vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz);
      gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
    void main(){
      float along = 1.0 - vUv.y; // 0 at nozzle → 1 at tip
      float rim = pow(abs(dot(normalize(vN), vV)), 1.2);
      float turb = n(vec2(vUv.x*8.0, along*6.0 - uTime*14.0)) * 0.6 + n(vec2(vUv.x*19.0, along*13.0 - uTime*23.0))*0.4;
      float core = smoothstep(1.0, 0.0, along);
      float a = rim * core * (0.45 + turb*0.9) * smoothstep(0.0, 0.06, along);
      vec3 col = mix(vec3(1.0,1.0,1.0), vec3(0.55,0.75,1.0), along);
      gl_FragColor = vec4(col * a * 1.4, 1.0);
    }`,
});
class ThrusterPlumes {
  constructor(e) {
    (this.car = e), (this.items = []);
    const t = new CylinderGeometry(0.05, 0.42, 1, 18, 1, !0);
    t.translate(0, -0.5, 0);
    const i = (s, r) => {
      const a = new Mesh(t, plumeMaterial);
      a.position.copy(s.p),
        a.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), s.d),
        (a.visible = !1),
        (a.frustumCulled = !1),
        (a.renderOrder = 6),
        e.body.add(a),
        this.items.push({
          m: a,
          t: s,
          kind: r,
          level: 0,
        });
    };
    e.thrusters.lift.forEach((s) => i(s, "lift")),
      e.thrusters.rear.forEach((s) => i(s, "rear")),
      e.thrusters.side.forEach((s) => i(s, "side")),
      e.thrusters.top.forEach((s) => i(s, "top"));
  }
  update(e, t, i) {
    plumeMaterial.uniforms.uTime.value = t;
    for (const s of this.items) {
      const r = i[s.kind] || 0;
      s.level += (r - s.level) * Math.min(1, e * (r > s.level ? 30 : 10));
      const a = s.level;
      s.m.visible = a > 0.02;
      const o = s.kind === "lift" ? 2.6 : s.kind === "rear" ? 2 : 1.3,
        c = 0.9 + Math.random() * 0.2;
      s.m.scale.set(0.6 + a * 0.6, o * a * c, 0.6 + a * 0.6);
    }
  }
}

export { ThrusterPlumes };
