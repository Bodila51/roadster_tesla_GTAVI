import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import { COAST_Z, DAY, SKY_GLSL, skyUniforms } from "./sky.js";

// Reflection/IBL probe: the day sky (no sun disc, the DirectionalLight draws the sharp sun
// highlight), a sunlit ground below the horizon and a few hazy silhouettes of the site's far
// buildings so paint and glass get a believable horizon line to reflect.
function buildEnvMap(a) {
  const e = new Scene(),
    s = new ShaderMaterial({
      side: BackSide,
      depthWrite: !1,
      uniforms: skyUniforms(),
      vertexShader:
        "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
      fragmentShader: `varying vec3 vD;
      ${SKY_GLSL}
      void main(){
        vec3 d = normalize(vD);
        vec3 c = daySky(d);
        // the visible sky is graded deep blue; as a light source it is much less saturated
        c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), 0.5);
        gl_FragColor = vec4(c, 1.0);
      }`,
    });
  e.add(new Mesh(new SphereGeometry(60, 64, 32), s));
  // far structures, already mixed with the haze they sit in (placed in the same directions as
  // the real ones, scaled to the probe radius)
  const t = (c, k) =>
      new MeshBasicMaterial({
        color: new Color().copy(c).lerp(DAY.haze, k),
      }),
    i = t(new Color(0.42, 0.43, 0.44), 0.5),
    o = t(new Color(0.06, 0.07, 0.05), 0.55),
    n = (c, r, l, d, f, p = 0, w = i) => {
      const S = new Mesh(new BoxGeometry(l, d, f), w),
        y = Math.hypot(c, r),
        b = 45 / y;
      S.scale.setScalar(b),
        S.position.set(c * b, (d / 2) * b - 0.05, r * b),
        (S.rotation.y = p),
        e.add(S);
    };
  for (let c = 0; c < 4; c++) n(380 + c * 75, -640 - c * 20, 60, 22, 40);
  n(-520, -1100, 14, 145, 14), n(-542, -1100, 20, 20, 20);
  for (let c = 0; c < 6; c++) n(-380 + c * 13, -980, 10, 26 + (c % 3) * 8, 10);
  n(700, 300, 4, 30, 4), n(700, 300, 16, 12, 16);
  // low tree line around the horizon, open to the sea in the south
  for (let c = 0; c < 72; c++) {
    const r = (c / 72) * Math.PI * 2;
    if (Math.sin(r) > (COAST_Z - 30) / 1900) continue;
    const
      l = 0.35 + 0.5 * ((Math.sin(c * 12.9898) * 43758.5453) % 1 + 1) % 1,
      d = new Mesh(new BoxGeometry(4.6, l, 1), o);
    d.position.set(Math.cos(r) * 54, l / 2 - 0.25, Math.sin(r) * 54),
      (d.rotation.y = -r + Math.PI / 2),
      e.add(d);
  }
  const c = new PMREMGenerator(a),
    r = c.fromScene(e, 0, 0.1, 200);
  c.dispose();
  return r.texture;
}

export { buildEnvMap };
