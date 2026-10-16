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
  Sprite,
  SpriteMaterial,
} from "three";
import { mergeGeometries } from "../util/math.js";
import { DAY } from "./sky.js";

// Kept for the per-frame uniform update in main.js; daytime builds no beams.
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
let Ve = null;
function towerMaterials() {
  return (
    Ve ||
    (Ve = {
      // galvanised steel pole and housing
      steel: new MeshStandardMaterial({
        color: 10265266,
        metalness: 0.85,
        roughness: 0.5,
      }),
      housing: new MeshStandardMaterial({
        color: 3292727,
        metalness: 0.6,
        roughness: 0.55,
      }),
      // by day the lamps are off: clear glass over a reflector, it just catches the sky;
      // at golden hour (?tod=golden) they are switched on
      lens: DAY.floodlights
        ? new MeshStandardMaterial({
            color: 16777215,
            emissive: new Color(1, 0.93, 0.82),
            emissiveIntensity: 7,
            roughness: 0.3,
          })
        : new MeshStandardMaterial({
            color: 14082794,
            metalness: 0.9,
            roughness: 0.18,
          }),
      glow: DAY.floodlights
        ? new SpriteMaterial({
            map: glowTexture(),
            color: new Color(1.3, 1.18, 1.0),
            transparent: !0,
            blending: AdditiveBlending,
            depthWrite: !1,
            fog: !1,
          })
        : null,
    })
  );
}
// the twelve lamp faces of one head merged into a single draw call
let Le = null;
function lampFaces() {
  if (Le) return Le;
  const a = [];
  for (let y = 0; y < 4; y++)
    for (let b = 0; b < 3; b++)
      a.push(
        new CircleGeometry(0.32, 20).translate(
          -1.35 + y * 0.9,
          -0.8 + b * 0.8,
          0.16,
        ),
      );
  return (Le = mergeGeometries(a));
}
// Stadium light tower: pole, frame and twelve lamp faces; lamps off by day, on at golden hour.
// Same footprint as the night version (the pole collider is added by environment.js). No
// SpotLight or beam.
function buildFloodlight(a, e) {
  const t = new Group(),
    i = towerMaterials(),
    o = 22,
    n = new Mesh(new CylinderGeometry(0.22, 0.4, o, 10), i.steel);
  n.position.set(a.x, o / 2, a.z), (n.castShadow = !0), t.add(n);
  const c = new Group();
  c.position.set(a.x, o + 0.8, a.z);
  const r = new Mesh(new BoxGeometry(3.6, 2.4, 0.3), i.housing);
  (r.castShadow = !0), c.add(r);
  c.add(new Mesh(lampFaces(), i.lens));
  if (i.glow) {
    // lit head: a soft halo around the lamp bank, a little in front of it
    const g = new Sprite(i.glow);
    g.scale.set(7, 7, 1), g.position.set(0, 0, 0.6), c.add(g);
  }
  return (
    c.lookAt(e),
    t.add(c),
    {
      group: t,
      spot: null,
      beam: null,
    }
  );
}

export { beamMaterial, buildFloodlight, glowTexture };
