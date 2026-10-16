import {
  Color,
  DoubleSide,
  Matrix4,
  MeshDepthMaterial,
  NearestFilter,
  OrthographicCamera,
  RGBADepthPacking,
  Vector3,
  WebGLRenderTarget,
} from "three";

// Far shadows for the ground. The live sun shadow map is a tight box around the player car, so
// the ramp, the lineup, the halfpipe and the light towers would stand on unshadowed asphalt
// whenever the car is more than ~50 m away. This bakes the static set (groups tagged
// userData.staticShadow) once, seen from the sun, and the ground shader uses it outside the
// live shadow box. One render at start-up; no per-frame cost besides 4 texture taps on the ground.
const staticShadow = {
  uSShadow: { value: null },
  uSMatrix: { value: new Matrix4() },
  uSTexel: { value: 1 / 2048 },
  uSOn: { value: 0 },
};

// GLSL for the ground material (needs <packing>, which every lit material includes)
const STATIC_SHADOW_GLSL = /* glsl */ `
uniform sampler2D uSShadow;
uniform mat4 uSMatrix;
uniform float uSTexel;
uniform float uSOn;
float sShadowTap(vec2 uv, float z){ return step(z, unpackRGBAToDepth(texture2D(uSShadow, uv))); }
float staticSunShadow(vec3 wp){
  if (uSOn < 0.5) return 1.0;
  vec3 p = (uSMatrix * vec4(wp, 1.0)).xyz;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0) return 1.0;
  float z = p.z - 0.0004;
  vec2 g = p.xy / uSTexel - 0.5;
  vec2 f = fract(g);
  vec2 b = (floor(g) + 0.5) * uSTexel;
  float a0 = sShadowTap(b, z), a1 = sShadowTap(b + vec2(uSTexel, 0.0), z);
  float a2 = sShadowTap(b + vec2(0.0, uSTexel), z), a3 = sShadowTap(b + vec2(uSTexel), z);
  return mix(mix(a0, a1, f.x), mix(a2, a3, f.x), f.y);
}`;

// Area the bake covers: x and z extents and the tallest structure in it. A world module that
// adds static structures elsewhere (the town) grows it before the first frame is drawn.
const staticShadowArea = { x: [-330, 345], z: [-345, 170], h: 48 };
function extendStaticShadowArea(minX, minZ, maxX, maxZ, maxH = 0) {
  const A = staticShadowArea;
  (A.x[0] = Math.min(A.x[0], minX)), (A.x[1] = Math.max(A.x[1], maxX));
  (A.z[0] = Math.min(A.z[0], minZ)), (A.z[1] = Math.max(A.z[1], maxZ));
  A.h = Math.max(A.h, maxH);
}

function bakeStaticShadow(a, e, s, t = 2048) {
  // site footprint (x, z) that holds every static structure near the play area
  const i = staticShadowArea.x,
    o = staticShadowArea.z,
    n = staticShadowArea.h,
    c = s.clone().normalize(),
    r = new Vector3((i[0] + i[1]) / 2, 0, (o[0] + o[1]) / 2),
    l = new OrthographicCamera(-1, 1, 1, -1, 1, 2e3);
  l.position.copy(r).addScaledVector(c, 900),
    l.up.set(0, 1, 0),
    l.lookAt(r),
    l.updateMatrixWorld(!0);
  const d = new Vector3(),
    f = new Vector3(1 / 0, 1 / 0, 1 / 0),
    p = new Vector3(-1 / 0, -1 / 0, -1 / 0);
  for (const h of i)
    for (const u of o)
      for (const T of [0, n])
        d.set(h, T, u).applyMatrix4(l.matrixWorldInverse), f.min(d), p.max(d);
  (l.left = f.x - 2),
    (l.right = p.x + 2),
    (l.bottom = f.y - 2),
    (l.top = p.y + 2),
    (l.near = Math.max(1, -p.z - 60)),
    (l.far = -f.z + 60),
    l.updateProjectionMatrix();
  const w = new WebGLRenderTarget(t, t, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: !1,
    }),
    S = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      side: DoubleSide,
    }),
    y = [];
  // only static, tagged groups; inside them skip anything flagged (the ground itself)
  for (const h of e.children)
    h.isLight || h.userData.staticShadow || (y.push([h, h.visible]), (h.visible = !1));
  e.traverse((h) => {
    (h.userData.noStaticShadow || h.isLine || h.isSprite || h.isPoints) &&
      (y.push([h, h.visible]), (h.visible = !1));
  });
  const b = a.getRenderTarget(),
    L = a.getClearColor(new Color()),
    m = a.getClearAlpha(),
    v = e.overrideMaterial,
    x = e.background,
    g = a.shadowMap.autoUpdate;
  (e.overrideMaterial = S),
    (e.background = null),
    (a.shadowMap.autoUpdate = !1),
    a.setRenderTarget(w),
    a.setClearColor(16777215, 1),
    a.clear(!0, !0, !1),
    a.render(e, l),
    a.setRenderTarget(b),
    a.setClearColor(L, m),
    (e.overrideMaterial = v),
    (e.background = x),
    (a.shadowMap.autoUpdate = g);
  for (let h = y.length - 1; h >= 0; h--) y[h][0].visible = y[h][1];
  S.dispose();
  return (
    staticShadow.uSMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(l.projectionMatrix)
      .multiply(l.matrixWorldInverse),
    (staticShadow.uSShadow.value = w.texture),
    (staticShadow.uSTexel.value = 1 / t),
    (staticShadow.uSOn.value = 1),
    w
  );
}

export { STATIC_SHADOW_GLSL, bakeStaticShadow, extendStaticShadowArea, staticShadow, staticShadowArea };
