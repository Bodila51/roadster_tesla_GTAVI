import {
  Color,
  DoubleSide,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  OrthographicCamera,
  RGBADepthPacking,
  Scene,
  ShaderChunk,
  Vector3,
  WebGLRenderTarget,
} from "three";

// Far sun shadows for the town, the same scheme as world/static-shadow.js (which covers the
// playground only): the town is drawn once from the sun into a depth texture at start-up, and
// every town material uses it wherever the live shadow box around the car does not reach.
const cityShadow = {
  uCShadow: { value: null },
  uCMatrix: { value: new Matrix4() },
  uCTexel: { value: 1 / 2048 },
  uCOn: { value: 0 },
};

const CS_VERT_DECL = /* glsl */ `
varying vec3 vCWP;
varying vec3 vCWN;`;
const CS_VERT = /* glsl */ `
{
  vec4 cwp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cwp = instanceMatrix * cwp;
  #endif
  vCWP = ( modelMatrix * cwp ).xyz;
  vCWN = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );
}`;
const CS_FRAG_DECL = /* glsl */ `
varying vec3 vCWP;
varying vec3 vCWN;
uniform sampler2D uCShadow;
uniform mat4 uCMatrix;
uniform float uCTexel;
uniform float uCOn;`;
const CS_FRAG_FN = /* glsl */ `
float cTap( vec2 uv, float z ) { return step( z, unpackRGBAToDepth( texture2D( uCShadow, uv ) ) ); }
float cityStaticSun( vec3 wp ) {
  if ( uCOn < 0.5 ) return 1.0;
  vec3 p = ( uCMatrix * vec4( wp, 1.0 ) ).xyz;
  if ( p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 ) return 1.0;
  float z = p.z - 0.0005;
  vec2 g = p.xy / uCTexel - 0.5;
  vec2 f = fract( g );
  vec2 b = ( floor( g ) + 0.5 ) * uCTexel;
  float a0 = cTap( b, z ), a1 = cTap( b + vec2( uCTexel, 0.0 ), z );
  float a2 = cTap( b + vec2( 0.0, uCTexel ), z ), a3 = cTap( b + vec2( uCTexel ), z );
  return mix( mix( a0, a1, f.x ), mix( a2, a3, f.x ), f.y );
}`;
const CS_LIGHTS =
  /* glsl */ `
float cStaticSun = 1.0;
{
  float cover = 0.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    vec3 dsc = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
    vec2 e2 = min( dsc.xy, 1.0 - dsc.xy );
    cover = smoothstep( 0.0, 0.1, min( e2.x, e2.y ) );
  #endif
  if ( cover < 1.0 ) cStaticSun = mix( cityStaticSun( vCWP + vCWN * 0.3 ), 1.0, cover );
}
` +
  ShaderChunk.lights_fragment_begin.replace(
    "getDirectionalLightInfo( directionalLight, directLight );",
    "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cStaticSun;",
  );

// shared patch: world position/normal varyings + the static town shadow on the sun
function patchShadow(s, vertDecl = "", vertBody = "", fragDecl = "") {
  Object.assign(s.uniforms, cityShadow);
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\n" + CS_VERT_DECL + vertDecl)
    .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n" + CS_VERT + vertBody);
  s.fragmentShader = s.fragmentShader
    .replace("#include <common>", "#include <common>\n" + CS_FRAG_DECL + fragDecl)
    .replace("#include <packing>", "#include <packing>\n" + CS_FRAG_FN)
    .replace("#include <lights_fragment_begin>", CS_LIGHTS);
}

const HASH = /* glsl */ `float cHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }`;

// walls, roofs, shopfronts, curtain walls, signs and billboards: one texture array, per-vertex
// layer, UV and wall tint. Glass (texture alpha 0) stays untinted, glossy and a little metallic.
function facadeMaterial(tex) {
  const m = new MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 1 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uFacade = { value: tex };
    patchShadow(
      s,
      "\nattribute vec3 aF;\nattribute vec3 aTint;\nvarying vec3 vF;\nvarying vec3 vTint;",
      "\nvF = aF; vTint = aTint;",
      "\nuniform highp sampler2DArray uFacade;\nvarying vec3 vF;\nvarying vec3 vTint;\n" + HASH,
    );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        vec4 fT = texture( uFacade, vF );
        float fGlass = 1.0 - fT.a;
        float fH = cHash( floor( vF.xy ) + vF.z * 3.7 + vTint.rg * 11.0 );
        vec3 fCol = fT.rgb * mix( vTint, vec3( 1.0 ), fGlass );
        fCol *= mix( 1.0, 0.6 + 0.85 * fH, fGlass );
        // a little grime and bounce darkening near the ground
        fCol *= mix( 0.78, 1.0, smoothstep( 0.0, 2.8, vCWP.y ) );
        diffuseColor.rgb *= fCol;`,
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix( roughness, 0.06, fGlass );")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = mix( metalness, 0.62, fGlass );");
  };
  m.customProgramCacheKey = () => "city-facade";
  return m;
}

// roads, sidewalks, curbs, lots, plazas, promenade: world-space UVs into the ground array
function groundMaterial(tex) {
  const m = new MeshStandardMaterial({
    roughness: 0.93,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uGround = { value: tex };
    patchShadow(
      s,
      "\nattribute vec3 aF;\nvarying vec3 vF;",
      "\nvF = aF;",
      "\nuniform highp sampler2DArray uGround;\nvarying vec3 vF;",
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      /* glsl */ `
      vec3 gT = texture( uGround, vF ).rgb;
      float gM = texture( uGround, vec3( vF.xy * 0.131 + 0.37, vF.z ) ).g;
      float gM2 = texture( uGround, vec3( vF.yx * 0.047 + 0.11, vF.z ) ).r;
      gT *= mix( 0.86, 1.1, gM ) * mix( 0.9, 1.08, gM2 );
      diffuseColor.rgb *= gT;`,
    );
  };
  m.customProgramCacheKey = () => "city-ground";
  return m;
}

// paint: lane lines, crosswalks, stall lines, helipad
function paintMaterial() {
  const m = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
  });
  m.onBeforeCompile = (s) => patchShadow(s);
  m.customProgramCacheKey = () => "city-paint";
  return m;
}

// solid props: poles, signals, palm trunks, tree crowns, benches, pumps, railings, rooftop units.
// Per vertex: colour and aPM = (roughness, metalness, signal code). Signal codes 1..3 are the
// red/amber/green lenses of the north-south heads, 4..6 of the east-west heads; uSig picks the
// lit lens of each group.
const propUniforms = { uSig: { value: [2, 0] } };
function propsMaterial() {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uSig = propUniforms.uSig;
    patchShadow(s, "\nattribute vec3 aPM;\nvarying vec3 vPM;", "\nvPM = aPM;", "\nvarying vec3 vPM;\nuniform vec2 uSig;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vPM.x;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vPM.y;")
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
        if ( vPM.z > 0.5 ) {
          float grp = vPM.z > 3.5 ? 1.0 : 0.0;
          float lens = floor( vPM.z - 0.5 ) - grp * 3.0;
          float lit = grp < 0.5 ? uSig.x : uSig.y;
          float on = abs( lens - lit ) < 0.5 ? 1.0 : 0.0;
          vec3 lc = lens < 0.5 ? vec3( 1.0, 0.06, 0.03 ) : lens < 1.5 ? vec3( 1.0, 0.5, 0.02 ) : vec3( 0.08, 1.0, 0.4 );
          diffuseColor.rgb = lc * 0.06;
          totalEmissiveRadiance += lc * on * 5.0;
        }`,
      );
  };
  m.customProgramCacheKey = () => "city-props";
  return m;
}

function frondMaterial(tex) {
  return new MeshStandardMaterial({
    map: tex,
    alphaTest: 0.45,
    side: DoubleSide,
    roughness: 0.78,
    metalness: 0,
  });
}

// Bake the town from the sun once. Renders only the given group (fronds and other tagged parts
// skipped) into an RGBA-packed depth map over the town footprint.
function bakeCityShadow(renderer, group, sunDir, size, foot) {
  const { x0, x1, z0, z1, top } = foot,
    dir = sunDir.clone().normalize(),
    centre = new Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2),
    cam = new OrthographicCamera(-1, 1, 1, -1, 1, 3000);
  cam.position.copy(centre).addScaledVector(dir, 1200);
  cam.up.set(0, 1, 0);
  cam.lookAt(centre);
  cam.updateMatrixWorld(true);
  const v = new Vector3(),
    lo = new Vector3(Infinity, Infinity, Infinity),
    hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, top]) v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse), lo.min(v), hi.max(v);
  cam.left = lo.x - 2;
  cam.right = hi.x + 2;
  cam.bottom = lo.y - 2;
  cam.top = hi.y + 2;
  cam.near = Math.max(1, -hi.z - 20);
  cam.far = -lo.z + 20;
  cam.updateProjectionMatrix();
  const rt = new WebGLRenderTarget(size, size, { minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false }),
    depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide }),
    tmp = new Scene(),
    parent = group.parent,
    hidden = [];
  group.traverse((o) => o.userData.noStaticShadow && o.visible && (hidden.push(o), (o.visible = false)));
  tmp.overrideMaterial = depth;
  tmp.add(group);
  tmp.updateMatrixWorld(true);
  const prevRT = renderer.getRenderTarget(),
    prevClear = renderer.getClearColor(new Color()),
    prevAlpha = renderer.getClearAlpha(),
    auto = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear(true, true, false);
  renderer.render(tmp, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.autoUpdate = auto;
  parent && parent.add(group);
  for (const o of hidden) o.visible = true;
  depth.dispose();
  cityShadow.uCMatrix.value
    .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    .multiply(cam.projectionMatrix)
    .multiply(cam.matrixWorldInverse);
  cityShadow.uCShadow.value = rt.texture;
  cityShadow.uCTexel.value = 1 / size;
  cityShadow.uCOn.value = 1;
  return rt;
}

export { bakeCityShadow, cityShadow, facadeMaterial, frondMaterial, groundMaterial, paintMaterial, propUniforms, propsMaterial };
