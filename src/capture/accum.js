// Sub-frame accumulation: motion blur and anti-aliasing by averaging N renders of one output frame.
// Each sub-frame is whatever the game's full post stack put on the canvas; it is copied, decoded to linear
// light, summed in a float buffer, and the average is encoded back onto the canvas. Works with any post stack.
import {
  AddEquation,
  Color,
  CustomBlending,
  FloatType,
  FramebufferTexture,
  HalfFloatType,
  Mesh,
  NearestFilter,
  NoBlending,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RGBFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from "three";

const VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ADD_FS = /* glsl */ `
uniform sampler2D src;
uniform float weight;
varying vec2 vUv;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
void main() { gl_FragColor = vec4(toLinear(texture2D(src, vUv).rgb) * weight, weight); }`;

const OUT_FS = /* glsl */ `
uniform sampler2D src;
varying vec2 vUv;
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main() { vec4 a = texture2D(src, vUv); gl_FragColor = vec4(toSRGB(a.rgb / max(a.a, 1e-6)), 1.0); }`;

class Accumulator {
  // render(scene, camera) must be a renderer.render that is not gated off by the engine
  constructor(renderer, render) {
    this.r = renderer;
    this.render = render;
    this.w = 0;
    this.h = 0;
    this._size = new Vector2();
    this._cc = new Color();
    this.scene = new Scene();
    this.cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const common = { vertexShader: VS, depthTest: false, depthWrite: false };
    this.addMat = new ShaderMaterial({
      ...common,
      fragmentShader: ADD_FS,
      uniforms: { src: { value: null }, weight: { value: 1 } },
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendEquationAlpha: AddEquation,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneFactor,
    });
    this.outMat = new ShaderMaterial({ ...common, fragmentShader: OUT_FS, uniforms: { src: { value: null } }, blending: NoBlending });
    const gl = renderer.getContext();
    const ext = (n) => renderer.extensions.has(n);
    this.floatType = ext("EXT_color_buffer_float") && ext("EXT_float_blend") ? FloatType : HalfFloatType;
    const attrs = gl.getContextAttributes ? gl.getContextAttributes() : { alpha: true };
    // an alpha-less drawing buffer can only be copied into an RGB texture
    this.copyFormat = attrs && attrs.alpha === false ? RGBFormat : RGBAFormat;
  }
  ensure(w, h) {
    if (w === this.w && h === this.h) return;
    if (this.fb) this.fb.dispose();
    if (this.rt) this.rt.dispose();
    this.w = w;
    this.h = h;
    this.fb = new FramebufferTexture(w, h);
    this.fb.format = this.copyFormat;
    this.rt = new WebGLRenderTarget(w, h, {
      type: this.floatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
    });
  }
  _draw(mat, target) {
    const r = this.r;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    this.quad.material = mat;
    r.setRenderTarget(target);
    this.render(this.scene, this.cam);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
  }
  begin() {
    const r = this.r;
    const s = r.getDrawingBufferSize(this._size);
    this.ensure(Math.round(s.x), Math.round(s.y));
    const prevTarget = r.getRenderTarget();
    const cc = r.getClearColor(this._cc);
    const ca = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setClearColor(cc, ca);
    r.setRenderTarget(prevTarget);
    this.total = 0;
  }
  // add what is on the canvas right now (call straight after the frame was rendered to the screen)
  add(weight) {
    const r = this.r;
    r.setRenderTarget(null);
    r.copyFramebufferToTexture(this.fb);
    this.addMat.uniforms.src.value = this.fb;
    this.addMat.uniforms.weight.value = weight;
    this._draw(this.addMat, this.rt);
    this.total += weight;
  }
  // put the average on the canvas
  resolve() {
    this.outMat.uniforms.src.value = this.rt.texture;
    this._draw(this.outMat, null);
  }
}

export { Accumulator };
