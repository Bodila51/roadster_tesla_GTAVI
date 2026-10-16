import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, ShaderChunk } from "three";
import { COAST, PIER, seabedY } from "./coast.js";

// The beach: one strip of sand along the whole 12 km coast, from under the promenade edge down the
// straight slope of the city layout into the water and over the sandbars to ~6 m deep. The shader
// darkens and glosses the wet sand, tints what lies under water (red goes first), draws drifting
// caustics there and the pier deck's shadow on the far side of the live shadow box. One draw call.
function buildBeach({ sand, waves, sky, time }) {
  const xs = [];
  for (let x = -720; x <= 720; x += 6) xs.push(x);
  for (let x = 720, s = 6; x < 6000; ) (s *= 1.2), (x = Math.min(6000, x + s)), xs.push(x), xs.unshift(-x);
  const S = COAST.shoreZ,
    zs = [COAST.sandZ - 3, COAST.sandZ, S, ...[6, 12, 19, 26, 31, 36, 42, 48, 58, 68, 77, 86, 95, 105, 130, 170, 250, 350].map((d) => S + d)],
    nx = xs.length,
    pos = [],
    uv = [],
    idx = [];
  for (const z of zs) for (const x of xs) pos.push(x, seabedY(x, z), z), uv.push(x / 6, z / 6);
  for (let i = 0; i < zs.length - 1; i++)
    for (let j = 0; j < nx - 1; j++) {
      const a = i * nx + j;
      idx.push(a, a + nx + 1, a + 1, a, a + nx, a + nx + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3)),
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2)),
    g.setIndex(idx),
    g.computeVertexNormals();
  const mat = new MeshStandardMaterial({ map: sand.map, bumpMap: sand.bump, bumpScale: 0.6, roughness: 0.95, metalness: 0 }),
    H = PIER.head;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTime: time,
      uWaves: { value: waves },
      uSunDir: sky.uSunDir,
      uSunColor: sky.uSunColor,
      uDeckA: { value: [PIER.x - PIER.half, PIER.solidZ, PIER.x + PIER.half, PIER.z1] },
      uDeckB: { value: [PIER.x + H.x0, H.z0, PIER.x + H.x1, H.z1] },
      uDeckY: { value: PIER.deckY - 0.3 },
    });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSandW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvSandW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vSandW;
uniform float uTime;
uniform sampler2D uWaves;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec4 uDeckA;
uniform vec4 uDeckB;
uniform float uDeckY;
#define WATER_Y ${COAST.waterY.toFixed(4)}
float sRect(vec2 p, vec4 r, float s){
  vec2 a = smoothstep(r.xy - s, r.xy + s, p) * (1.0 - smoothstep(r.zw - s, r.zw + s, p));
  return a.x * a.y;
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
float sUnder = WATER_Y - vSandW.y;
float sWet = smoothstep(-0.16, -0.02, sUnder);
float sUw = max(sUnder, 0.0);
float sMac = sin(vSandW.x * 0.071 + sin(vSandW.z * 0.13)) * sin(vSandW.z * 0.093 + 1.7 + sin(vSandW.x * 0.05));
diffuseColor.rgb *= (0.95 + 0.05 * sMac) * mix(1.0, 0.6, sWet) * exp(-vec3(0.62, 0.13, 0.09) * sUw);
vec2 sPd = vSandW.xz + uSunDir.xz / uSunDir.y * (uDeckY - vSandW.y);
float sLit = 1.0 - 0.92 * max(sRect(sPd, uDeckA, 0.4), sRect(sPd, uDeckB, 0.4));`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = sUnder > 0.0 ? 1.0 : mix(roughnessFactor, 0.33, sWet);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  vec2 cp = vSandW.xz;
  float c1 = texture2D(uWaves, cp * 0.21 + uTime * vec2(0.031, -0.022)).a;
  float c2 = texture2D(uWaves, vec2(0.8 * cp.x - 0.6 * cp.y, 0.6 * cp.x + 0.8 * cp.y) * 0.27 + uTime * vec2(-0.027, -0.035)).a;
  totalEmissiveRadiance += diffuseColor.rgb * uSunColor * pow(min(c1, c2), 2.5) * 2.0 * smoothstep(0.02, 0.25, sUw) * exp(-sUw * 0.5) * sLit;
}`,
      )
      .replace(
        "#include <lights_fragment_begin>",
        ShaderChunk.lights_fragment_begin.replace(
          "getDirectionalLightInfo( directionalLight, directLight );",
          "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= sLit;",
        ),
      );
  };
  const m = new Mesh(g, mat);
  (m.receiveShadow = !0), (m.name = "beach");
  return m;
}

export { buildBeach };
