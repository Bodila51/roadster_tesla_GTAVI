import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  ShaderMaterial,
  SpotLight,
  Sprite,
  SpriteMaterial,
} from "three";

const beamMaterial = new ShaderMaterial({
  transparent: !0,
  depthWrite: !1,
  blending: AdditiveBlending,
  side: DoubleSide,
  fog: !1,
  uniforms: {
    uColor: {
      value: new Color(12576511),
    },
    uTime: {
      value: 0,
    },
    uStrength: {
      value: 0.035,
    },
  },
  vertexShader: `
    varying float vT; varying vec3 vN; varying vec3 vView; varying vec3 vW;
    void main(){
      vT = uv.y; // 1 at source, 0 at far end
      vec4 w = modelMatrix * vec4(position,1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      vView = normalize(cameraPosition - w.xyz);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform vec3 uColor; uniform float uTime; uniform float uStrength;
    varying float vT; varying vec3 vN; varying vec3 vView; varying vec3 vW;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
    float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
    void main(){
      float rim = pow(abs(dot(normalize(vN), vView)), 1.6);
      float fall = pow(vT, 1.8);
      float dust = 0.65 + 0.7 * n3(vW*0.12 + vec3(0.0, -uTime*0.4, uTime*0.2));
      float a = rim * fall * dust * uStrength;
      gl_FragColor = vec4(uColor * a, 1.0);
    }`,
});
let le = null;
function glowTexture() {
  if (le) return le;
  const a = document.createElement("canvas");
  a.width = a.height = 128;
  const e = a.getContext("2d"),
    s = e.createRadialGradient(64, 64, 0, 64, 64, 64);
  return (
    s.addColorStop(0, "rgba(255,255,255,0.9)"),
    s.addColorStop(0.12, "rgba(255,255,255,0.45)"),
    s.addColorStop(0.35, "rgba(255,255,255,0.08)"),
    s.addColorStop(1, "rgba(255,255,255,0)"),
    (e.fillStyle = s),
    e.fillRect(0, 0, 128, 128),
    (le = new CanvasTexture(a)),
    (le.colorSpace = SRGBColorSpace),
    le
  );
}
function buildFloodlight(a, e, s) {
  const t = new Group(),
    i = new MeshStandardMaterial({
      color: 5593439,
      metalness: 0.8,
      roughness: 0.45,
    }),
    o = 22,
    n = new Mesh(new CylinderGeometry(0.22, 0.4, o, 10), i);
  n.position.set(a.x, o / 2, a.z), (n.castShadow = !0), t.add(n);
  const c = new Group();
  c.position.set(a.x, o + 0.8, a.z);
  const r = new Mesh(new BoxGeometry(3.6, 2.4, 0.3), i);
  c.add(r);
  const l = new MeshStandardMaterial({
    color: 16777215,
    emissive: 15267071,
    emissiveIntensity: 6,
  });
  for (let y = 0; y < 4; y++)
    for (let b = 0; b < 3; b++) {
      const L = new Mesh(new CircleGeometry(0.32, 20), l);
      L.position.set(-1.35 + y * 0.9, -0.8 + b * 0.8, 0.16), c.add(L);
    }
  c.lookAt(e), t.add(c);
  const d = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: new Color(1.6, 1.8, 2),
      transparent: !0,
      blending: AdditiveBlending,
      depthWrite: !1,
    }),
  );
  d.scale.set(9, 9, 1), d.position.copy(c.position), t.add(d);
  const f = new SpotLight(14676223, 9e3, 220, 0.42, 0.55, 2);
  f.position.copy(c.position),
    f.target.position.copy(e),
    s &&
      ((f.castShadow = !0),
      f.shadow.mapSize.set(1024, 1024),
      (f.shadow.bias = -3e-4),
      (f.shadow.camera.near = 2),
      (f.shadow.camera.far = 220)),
    t.add(f),
    t.add(f.target);
  const p = Math.min(110, c.position.distanceTo(e) * 1.3),
    w = new CylinderGeometry(0.9, Math.tan(0.42) * p, p, 40, 1, !0);
  w.translate(0, -p / 2, 0), w.rotateX(-Math.PI / 2);
  const S = new Mesh(w, beamMaterial);
  return (
    S.position.copy(c.position),
    S.lookAt(e),
    t.add(S),
    {
      group: t,
      spot: f,
      beam: S,
    }
  );
}

export { beamMaterial, buildFloodlight };
