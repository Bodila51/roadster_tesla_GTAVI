import { COAST } from "./sea/coast.js";
import {
  CanvasTexture,
  ShaderChunk,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { seededRandom, tileFbm } from "./concrete-texture.js";
import { WORLD } from "./layout.js";
import { DAY } from "./sky.js";
import { STATIC_SHADOW_GLSL, staticShadow } from "./static-shadow.js";

// Golden hour (?tod=golden): a few aggregate faces per 4 cm cell are near-mirrors that catch
// the low sun and sparkle along its path. Runs after the light loop, where directLight still
// holds the (shadowed) sun; fades out once a pixel covers more than a cell, so it can't alias.
const GLINTS_GLSL = /* glsl */ `
  {
    vec2 gp = vWPos.xz * 25.0;
    vec2 gc = floor( gp );
    vec2 gr = vec2( gHash( gc + 17.3 ), gHash( gc + 41.9 ) ) * 2.0 - 1.0;
    vec3 gn = normalize( mat3( viewMatrix ) * normalize( vec3( gr.x * 0.25, 1.0, gr.y * 0.25 ) ) );
    vec3 gH = normalize( directLight.direction + geometryViewDir );
    float gs = pow( max( dot( gn, gH ), 0.0 ), 600.0 ) * step( 0.8, gHash( gc ) );
    gs *= clamp( 2.5 - length( fwidth( gp ) ), 0.0, 1.0 );
    reflectedLight.directSpecular += directLight.color * gs * 3.0;
  }`;

// Sun-bleached asphalt of a big test-site apron. One 4.5 m detail tile (aggregate, binder,
// pits) sampled twice at unrelated scales so it never visibly repeats, plus a tileable macro
// noise for patches, dust and old repairs, and a ring of rubber from donuts at the donut pad.
const TILE = 4.5;

function canvasTex(a, e, s) {
  const t = document.createElement("canvas");
  (t.width = t.height = a), e(t.getContext("2d"), t);
  const i = new CanvasTexture(t);
  return (
    (i.wrapS = i.wrapT = RepeatWrapping),
    (i.anisotropy = 16),
    s && (i.colorSpace = SRGBColorSpace),
    i
  );
}
function buildGround() {
  const e = seededRandom(42),
    // albedo: grey binder with light and dark aggregate, a few tar spots
    t = canvasTex(
      512,
      (r) => {
        (r.fillStyle = "#62615e"), r.fillRect(0, 0, 512, 512);
        for (let l = 0; l < 160; l++) {
          const d = e() * 512,
            f = e() * 512,
            p = 8 + e() * 40,
            w = r.createRadialGradient(d, f, 0, d, f, p),
            S = e() < 0.5;
          w.addColorStop(0, S ? "rgba(70,69,66,0.10)" : "rgba(150,148,142,0.08)"),
            w.addColorStop(1, "rgba(0,0,0,0)"),
            (r.fillStyle = w),
            r.fillRect(d - p, f - p, p * 2, p * 2);
        }
        for (let l = 0; l < 7e4; l++) {
          const d = e(),
            f = d < 0.6 ? (102 + e() * 42) | 0 : (58 + e() * 22) | 0,
            p = d < 0.6 && e() < 0.3 ? 2 : 1;
          (r.fillStyle = `rgba(${f + 3},${f + 1},${f - 3},${0.25 + e() * 0.45})`),
            r.fillRect(e() * 512, e() * 512, p, p);
        }
        for (let l = 0; l < 26; l++) {
          (r.fillStyle = `rgba(28,28,30,${0.25 + e() * 0.35})`), r.beginPath();
          const d = e() * 512,
            f = e() * 512;
          r.ellipse(d, f, 1 + e() * 3, 1 + e() * 2.5, e() * 3, 0, Math.PI * 2),
            r.fill();
        }
      },
      !0,
    ),
    // packed data: R = height (bump), G = roughness
    i = canvasTex(512, (r) => {
      (r.fillStyle = "rgb(110,228,0)"), r.fillRect(0, 0, 512, 512);
      const l = seededRandom(43);
      for (let d = 0; d < 46e3; d++) {
        const f = l(),
          p = f < 0.6 ? (150 + l() * 105) | 0 : (l() * 70) | 0,
          w = f < 0.6 ? (190 + l() * 30) | 0 : 240;
        (r.fillStyle = `rgba(${p},${w},0,${0.5 + l() * 0.5})`),
          r.fillRect(l() * 512, l() * 512, f < 0.6 ? 2 : 1, f < 0.6 ? 2 : 1);
      }
    }),
    // macro: R = large patches, G = dust, B = medium breakup
    o = canvasTex(256, (r) => {
      const l = seededRandom(44),
        d = tileFbm(256, 4, l, 5),
        f = tileFbm(256, 3, l, 4),
        p = tileFbm(256, 8, l, 4),
        w = r.createImageData(256, 256);
      for (let S = 0; S < 256 * 256; S++)
        (w.data[S * 4] = d[S] * 255),
          (w.data[S * 4 + 1] = f[S] * 255),
          (w.data[S * 4 + 2] = p[S] * 255),
          (w.data[S * 4 + 3] = 255);
      r.putImageData(w, 0, 0);
    }),
    n = new MeshStandardMaterial({
      map: t,
      roughnessMap: i,
      bumpMap: i,
      bumpScale: 0.3,
      roughness: 1,
      metalness: 0,
      color: 16777215,
    });
  DAY.wet && (n.defines = { GROUND_WET: DAY.wet.toFixed(2) });
  (n.userData.macro = o),
    (n.onBeforeCompile = (r) => {
      Object.assign(r.uniforms, staticShadow),
      (r.uniforms.uMacro = { value: o }),
        (r.uniforms.uDonut = {
          value: WORLD.donut.clone(),
        }),
        (r.vertexShader = r.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vWPos;`,
          )
          .replace(
            "#include <worldpos_vertex>",
            `#include <worldpos_vertex>
vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;`,
          )),
        (r.fragmentShader = r.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uMacro;
        uniform vec3 uDonut;
        float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float gMacro; vec3 gMac; float gCrack = 0.0; float gWet = 0.0;
        // one family of sealed cracks: meandering lines roughly along x, about every
        // 'sp' metres, broken into segments; filtered so they fade instead of aliasing
        float gCrackLines( vec2 p, float sp, float seed ) {
          float row = floor( p.y / sp + 0.5 );
          float h = gHash( vec2( row, seed ) );
          float c = ( row + ( gHash( vec2( row, seed + 2.3 ) ) - 0.5 ) * 0.5 ) * sp
            + 0.9 * sin( p.x * 0.067 + h * 31.0 ) + 0.32 * sin( p.x * 0.23 + h * 17.0 ) + 0.09 * sin( p.x * 0.91 + h * 5.0 );
          float d = abs( p.y - c );
          float fw = fwidth( p.y ) * 1.2 + 1e-4;
          float w = 0.03 + 0.016 * sin( p.x * 0.5 + h * 9.0 );
          float lw = max( w, fw );
          float line = ( w / lw ) * ( 1.0 - smoothstep( lw * 0.5, lw * 0.5 + fw, d ) );
          float seg = smoothstep( 0.35, 0.55, 0.5 + 0.5 * sin( p.x * 0.043 + h * 13.0 ) * cos( p.x * 0.017 + h * 3.0 ) );
          return line * seg * step( 0.25, h );
        }`,
          )
          .replace(
            "#include <map_fragment>",
            `#ifdef USE_MAP
          vec4 t1 = texture2D( map, vMapUv );
          vec4 t2 = texture2D( map, mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.381 + vec2(0.37, 0.71) );
          diffuseColor *= mix( t1, t2, 0.45 );
        #endif
        vec2 wp = vWPos.xz;
        gMac = texture2D( uMacro, wp * (1.0 / 230.0) ).rgb;
        vec3 mac2 = texture2D( uMacro, wp * (1.0 / 53.0) + 0.37 ).rgb;
        gMacro = gMac.r * 0.6 + mac2.b * 0.4;
        diffuseColor.rgb *= mix( 0.8, 1.16, gMacro );
        // dusty, sun-bleached areas
        float dust = smoothstep( 0.5, 0.85, gMac.g * 0.7 + mac2.r * 0.3 );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.16, 1.08, 0.94 ) + vec3( 0.012, 0.01, 0.006 ), dust );
        // old sealed repairs: a few straight-edged darker patches
        {
          vec2 cell = floor( wp / 31.0 );
          float hs = gHash( cell );
          if ( hs > 0.86 ) {
            vec2 f = fract( wp / 31.0 );
            vec2 a = vec2( 0.12 + 0.3 * gHash( cell + 3.1 ), 0.1 + 0.35 * gHash( cell + 7.7 ) );
            vec2 b = a + vec2( 0.25 + 0.3 * gHash( cell + 1.3 ), 0.2 + 0.3 * gHash( cell + 5.9 ) );
            vec2 aa = fwidth( f ) * 1.5;
            vec2 r = smoothstep( a - aa, a + aa, f ) * ( 1.0 - smoothstep( b - aa, b + aa, f ) );
            diffuseColor.rgb *= 1.0 - 0.13 * r.x * r.y;
          }
        }
        // tar-sealed cracks across and along the apron, fading out with distance
        {
          float fade = 1.0 - smoothstep( 60.0, 140.0, length( vViewPosition ) );
          gCrack = max( gCrackLines( wp, 9.5, 1.7 ), gCrackLines( vec2( wp.y, wp.x + 11.5 ), 23.0, 8.9 ) ) * fade;
          diffuseColor.rgb *= 1.0 - 0.55 * gCrack;
        }
        // rubber from donuts around the donut pad
        {
          vec2 dp = wp - uDonut.xz;
          float rr = length( dp );
          if ( rr < 32.0 ) {
            float ang = atan( dp.y, dp.x );
            float m = 0.0;
            for ( int k = 0; k < 7; k++ ) {
              float fk = float( k );
              float rad = 11.0 + 2.1 * fk + 1.2 * sin( ang * ( 1.0 + mod( fk, 3.0 ) ) + fk * 1.7 );
              float w = 0.22 + 0.06 * sin( ang * 9.0 + fk );
              float band = ( 1.0 - smoothstep( w * 0.5, w, abs( rr - rad ) ) ) + ( 1.0 - smoothstep( w * 0.5, w, abs( rr - rad - 1.6 ) ) );
              float seg = smoothstep( 0.15, 0.45, sin( ang * ( 1.0 + fk * 0.5 ) + fk * 2.3 ) * 0.5 + 0.5 );
              m = max( m, band * seg * ( 0.45 + 0.4 * gHash( vec2( fk, 2.0 ) ) ) );
            }
            m *= 0.7 + 0.3 * mac2.g;
            diffuseColor.rgb *= 1.0 - 0.6 * m;
          }
        }
        #ifdef GROUND_WET
        // promo sunset (?tod=sunset): a hosed-down apron, darker where the water stands
        gWet = GROUND_WET * smoothstep( 0.45, 0.65, gMac.r * 0.5 + mac2.g * 0.5 );
        diffuseColor.rgb *= 1.0 - 0.5 * gWet;
        #endif`,
          )
          .replace("#include <packing>", "#include <packing>\n" + STATIC_SHADOW_GLSL)
          .replace(
            "#include <lights_fragment_begin>",
            `float gStaticSun = 1.0;
        {
          float cover = 0.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            vec3 dsc = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
            vec2 e2 = min( dsc.xy, 1.0 - dsc.xy );
            cover = smoothstep( 0.0, 0.1, min( e2.x, e2.y ) );
          #endif
          if ( cover < 1.0 ) gStaticSun = mix( staticSunShadow( vWPos ), 1.0, cover );
        }
        ` +
              ShaderChunk.lights_fragment_begin.replace(
                "getDirectionalLightInfo( directionalLight, directLight );",
                "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= gStaticSun;",
              ),
          )
          .replace(
            "#include <lights_fragment_end>",
            "#include <lights_fragment_end>\n" + (DAY.glints ? GLINTS_GLSL : ""),
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
        roughnessFactor = clamp( roughnessFactor * mix( 1.04, 0.9, gMacro ), 0.55, 1.0 );
        roughnessFactor = mix( roughnessFactor, 0.4, gCrack );
        #ifdef GROUND_WET
        roughnessFactor = mix( roughnessFactor, 0.18, gWet );
        #endif`,
          ));
    });
  const c = new PlaneGeometry(12e3, 12e3),
    r = c.attributes.position,
    l = [];
  // the land stops at the beach; the sand and the sea take over (sea/coast.js)
  for (let d = 0; d < r.count; d++) r.getY(d) < 0 && r.setY(d, -COAST.groundEndZ);
  for (let d = 0; d < r.count; d++) l.push(r.getX(d) / TILE, r.getY(d) / TILE);
  c.setAttribute("uv", new Float32BufferAttribute(l, 2));
  const d = new Mesh(c, n);
  return (
    (d.rotation.x = -Math.PI / 2),
    (d.receiveShadow = !0),
    (d.userData.noStaticShadow = !0),
    d
  );
}

export { buildGround };
