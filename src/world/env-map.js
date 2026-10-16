import {
  BackSide,
  Color,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from "three";

function buildEnvMap(a) {
  const e = new Scene(),
    s = new SphereGeometry(50, 32, 16),
    t = new ShaderMaterial({
      side: BackSide,
      vertexShader:
        "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
      fragmentShader: `varying vec3 vD; void main(){ float h=vD.y;
      vec3 c = mix(vec3(0.015,0.014,0.013), vec3(0.03,0.04,0.06), smoothstep(-0.2,0.05,h));
      c = mix(c, vec3(0.008,0.012,0.025), smoothstep(0.05,0.8,h));
      gl_FragColor = vec4(c,1.0);} `,
    });
  e.add(new Mesh(s, t));
  const i = new MeshBasicMaterial({
      color: new Color(6, 6.5, 7),
    }),
    o = new MeshBasicMaterial({
      color: new Color(2.5, 3, 3.6),
    }),
    n = new MeshBasicMaterial({
      color: new Color(4, 0.15, 0.2),
    });
  for (let d = 0; d < 7; d++) {
    const f = (d / 7) * Math.PI * 2 + 0.3,
      p = new Mesh(new PlaneGeometry(4, 2.4), i);
    p.position.set(Math.cos(f) * 40, 14 + (d % 3) * 3, Math.sin(f) * 40),
      p.lookAt(0, 0, 0),
      e.add(p);
  }
  const c = new Mesh(new PlaneGeometry(60, 3), o);
  c.position.set(0, 40, 0), (c.rotation.x = Math.PI / 2), e.add(c);
  for (const d of [-12, 12]) {
    const f = new Mesh(new PlaneGeometry(90, 0.6), n);
    f.position.set(0, -1.2, d), (f.rotation.x = -Math.PI / 2), e.add(f);
  }
  const r = new PMREMGenerator(a),
    l = r.fromScene(e, 0.02);
  return r.dispose(), l.texture;
}

export { buildEnvMap };
