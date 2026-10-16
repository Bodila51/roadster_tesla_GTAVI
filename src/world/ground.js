import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { seededRandom } from "./concrete-texture.js";

function buildGround() {
  const e = (r, l) => {
      const d = document.createElement("canvas");
      (d.width = d.height = 512), r(d.getContext("2d"));
      const f = new CanvasTexture(d);
      return (
        (f.wrapS = f.wrapT = RepeatWrapping),
        f.repeat.set(600, 600),
        (f.anisotropy = 16),
        l && (f.colorSpace = SRGBColorSpace),
        f
      );
    },
    s = seededRandom(42),
    t = e((r) => {
      (r.fillStyle = "#2b2c2e"), r.fillRect(0, 0, 512, 512);
      for (let l = 0; l < 6e4; l++) {
        const d = (25 + s() * 50) | 0;
        r.fillStyle = `rgba(${d},${d},${d + 2},${0.35 + s() * 0.5})`;
        const f = s() < 0.92 ? 1 : 2;
        r.fillRect(s() * 512, s() * 512, f, f);
      }
      for (let l = 0; l < 400; l++) {
        const d = (70 + s() * 50) | 0;
        (r.fillStyle = `rgba(${d},${d},${d},0.5)`),
          r.fillRect(s() * 512, s() * 512, 2, 2);
      }
    }, !0),
    i = e((r) => {
      (r.fillStyle = "#c8c8c8"), r.fillRect(0, 0, 512, 512);
      for (let l = 0; l < 3e4; l++) {
        const d = (150 + s() * 105) | 0;
        (r.fillStyle = `rgba(${d},${d},${d},0.5)`),
          r.fillRect(s() * 512, s() * 512, 2, 2);
      }
    }, !1),
    o = e((r) => {
      (r.fillStyle = "#808080"), r.fillRect(0, 0, 512, 512);
      for (let l = 0; l < 4e4; l++) {
        const d = (s() * 255) | 0;
        (r.fillStyle = `rgba(${d},${d},${d},0.35)`),
          r.fillRect(
            s() * 512,
            s() * 512,
            1 + ((s() * 2) | 0),
            1 + ((s() * 2) | 0),
          );
      }
    }, !1),
    n = new MeshStandardMaterial({
      map: t,
      roughnessMap: i,
      bumpMap: o,
      bumpScale: 0.3,
      roughness: 1,
      metalness: 0,
      color: 12105912,
      envMapIntensity: 0.55,
    });
  n.onBeforeCompile = (r) => {
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
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
        float macro = fbm(vWPos.xz * 0.018);
        float slab = step(0.985, fract(vWPos.x/12.0)) + step(0.985, fract(vWPos.z/12.0));
        diffuseColor.rgb *= mix(0.78, 1.18, macro);
        diffuseColor.rgb *= 1.0 - 0.35*clamp(slab,0.0,1.0);`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
        float wet = smoothstep(0.52, 0.66, fbm(vWPos.xz * 0.035 + 7.3));
        roughnessFactor = mix(roughnessFactor, 0.24, wet * 0.8);`,
        ));
  };
  const c = new Mesh(new PlaneGeometry(5e3, 5e3), n);
  return (c.rotation.x = -Math.PI / 2), (c.receiveShadow = !0), c;
}

export { buildGround };
