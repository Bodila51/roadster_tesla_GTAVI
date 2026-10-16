import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

function makePuffTexture() {
  const e = document.createElement("canvas");
  e.width = e.height = 128;
  const t = e.getContext("2d"),
    i = t.createImageData(128, 128),
    s = (o, c) => {
      const l = Math.sin(o * 127.1 + c * 311.7) * 43758.5453;
      return l - Math.floor(l);
    },
    r = (o, c) => {
      const l = Math.floor(o),
        u = Math.floor(c),
        h = o - l,
        p = c - u,
        d = h * h * (3 - 2 * h),
        g = p * p * (3 - 2 * p),
        v = s(l, u),
        m = s(l + 1, u),
        f = s(l, u + 1),
        y = s(l + 1, u + 1);
      return v + (m - v) * d + (f - v) * g + (v - m - f + y) * d * g;
    };
  for (let o = 0; o < 128; o++)
    for (let c = 0; c < 128; c++) {
      const l = c / 128 - 0.5,
        u = o / 128 - 0.5,
        h = Math.sqrt(l * l + u * u) * 2;
      let p = 0,
        d = 0.5,
        g = 4;
      for (let f = 0; f < 5; f++)
        (p += d * r((c / 128) * g + 10, (o / 128) * g + 3)),
          (g *= 2),
          (d *= 0.5);
      const v = Math.max(0, 1 - h) ** 1.5 * (0.45 + p * 0.9),
        m = (o * 128 + c) * 4;
      (i.data[m] = i.data[m + 1] = i.data[m + 2] = 255),
        (i.data[m + 3] = Math.min(255, v * 255));
    }
  return t.putImageData(i, 0, 0), new CanvasTexture(e);
}
class SmokeSystem {
  constructor(e, t = 2600) {
    this.max = t;
    const i = new PlaneGeometry(1, 1),
      s = new InstancedBufferGeometry();
    (s.index = i.index),
      (s.attributes.position = i.attributes.position),
      (s.attributes.uv = i.attributes.uv),
      (this.aPos = new Float32Array(t * 3)),
      (this.aData = new Float32Array(t * 4)),
      (this.aCol = new Float32Array(t * 3)),
      s.setAttribute(
        "iPos",
        new InstancedBufferAttribute(this.aPos, 3).setUsage(DynamicDrawUsage),
      ),
      s.setAttribute(
        "iData",
        new InstancedBufferAttribute(this.aData, 4).setUsage(DynamicDrawUsage),
      ),
      s.setAttribute(
        "iCol",
        new InstancedBufferAttribute(this.aCol, 3).setUsage(DynamicDrawUsage),
      ),
      (s.instanceCount = 0),
      (this.mat = new ShaderMaterial({
        transparent: !0,
        depthWrite: !1,
        uniforms: {
          uTex: {
            value: makePuffTexture(),
          },
          fogColor: {
            value: new Color(461584),
          },
          fogDensity: {
            value: 0.0028,
          },
        },
        vertexShader: `
        attribute vec3 iPos; attribute vec4 iData; attribute vec3 iCol;
        varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vFog;
        uniform float fogDensity;
        void main(){
          vUv = uv; vA = iData.y; vCol = iCol;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iData.z), s = sin(iData.z);
          vec2 p = vec2(position.x*c - position.y*s, position.x*s + position.y*c) * iData.x;
          mv.xy += p;
          float d = -mv.z;
          vFog = 1.0 - exp(-fogDensity*fogDensity*d*d);
          gl_Position = projectionMatrix * mv;
        }`,
        fragmentShader: `
        uniform sampler2D uTex; uniform vec3 fogColor;
        varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vFog;
        void main(){
          vec4 t = texture2D(uTex, vUv);
          float a = t.a * vA;
          if (a < 0.003) discard;
          vec3 col = mix(vCol, fogColor, vFog);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
      })),
      (this.mesh = new Mesh(s, this.mat)),
      (this.mesh.frustumCulled = !1),
      (this.mesh.renderOrder = 5),
      e.add(this.mesh),
      (this.p = []),
      (this.geo = s);
  }
  spawn(e) {
    this.p.length >= this.max && this.p.shift(),
      this.p.push({
        pos: e.pos.clone(),
        vel: (e.vel || new Vector3()).clone(),
        size: e.size ?? 1,
        grow: e.grow ?? 2,
        life: e.life ?? 3,
        age: 0,
        alpha: e.alpha ?? 0.35,
        color: e.color || new Color(0.75, 0.78, 0.82),
        drag: e.drag ?? 1.2,
        rise: e.rise ?? 0.6,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.6,
      });
  }
  update(e, t) {
    const i = this.p;
    let s = 0;
    for (let a = 0; a < i.length; a++) {
      const o = i[a];
      (o.age += e),
        !(o.age >= o.life) &&
          (o.vel.multiplyScalar(Math.exp(-o.drag * e)),
          (o.vel.y += o.rise * e),
          o.pos.addScaledVector(o.vel, e),
          o.pos.y < 0.2 &&
            ((o.pos.y = 0.2), (o.vel.y = Math.abs(o.vel.y) * 0.2)),
          (o.size += o.grow * e * (1 - (o.age / o.life) * 0.6)),
          (o.rot += o.spin * e),
          (i[s++] = o));
    }
    i.length = s;
    const r = Math.min(s, this.max);
    for (let a = 0; a < r; a++) {
      const o = i[a],
        c = o.age / o.life,
        l = Math.min(1, o.age / 0.12),
        u = o.alpha * l * (1 - c) * (1 - c);
      (this.aPos[a * 3] = o.pos.x),
        (this.aPos[a * 3 + 1] = o.pos.y),
        (this.aPos[a * 3 + 2] = o.pos.z),
        (this.aData[a * 4] = o.size),
        (this.aData[a * 4 + 1] = u),
        (this.aData[a * 4 + 2] = o.rot);
      const h = t ? t(o.pos) : 1;
      (this.aCol[a * 3] = o.color.r * h),
        (this.aCol[a * 3 + 1] = o.color.g * h),
        (this.aCol[a * 3 + 2] = o.color.b * h);
    }
    (this.geo.instanceCount = r),
      (this.geo.attributes.iPos.needsUpdate = !0),
      (this.geo.attributes.iData.needsUpdate = !0),
      (this.geo.attributes.iCol.needsUpdate = !0);
  }
}

export { SmokeSystem };
