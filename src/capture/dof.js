// Depth of field as one extra effect pass in the game's own pmndrs composer.
// A single-pass gather blur on the composer's depth texture (N8AO already makes the composer keep one).
// Each tap is weighted by its own circle of confusion, so a sharp car does not bleed into a soft background.
// The tap pattern turns every sub-frame, so accumulated frames get smoother bokeh.
// Written here instead of pmndrs DepthOfFieldEffect so the extra code stays in the lazy capture chunk.
import { Effect, EffectAttribute, EffectPass } from "postprocessing";
import { Uniform } from "three";

const FS = /* glsl */ `
uniform float focus;   // metres
uniform float range;   // metres around focus that stay sharp
uniform float bokeh;   // blur radius in pixels (at 1080 px frame height) for things at infinity
uniform float spin;
const int TAPS = 28;
float cocPx(float z) {
  float s = resolution.y / 1080.0;
  return min(28.0 * s, bokeh * s * max(0.0, abs(z - focus) - range) / max(z, 0.05));
}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float z = -getViewZ(depth);
  float c0 = cocPx(z);
  if (c0 < 0.5) { outputColor = inputColor; return; }
  vec3 acc = inputColor.rgb;
  float wsum = 1.0;
  for (int i = 1; i <= TAPS; i++) {
    float fi = float(i);
    float r = sqrt(fi / float(TAPS)) * c0;
    float a = fi * 2.39996323 + spin;
    vec2 tuv = uv + vec2(cos(a), sin(a)) * r * texelSize;
    float tz = -getViewZ(readDepth(tuv));
    float w = clamp(cocPx(tz) - r + 1.0, 0.0, 1.0);
    acc += texture2D(inputBuffer, tuv).rgb * w;
    wsum += w;
  }
  outputColor = vec4(acc / wsum, inputColor.a);
}`;

class CaptureDofEffect extends Effect {
  constructor() {
    super("CaptureDofEffect", FS, {
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ["focus", new Uniform(10)],
        ["range", new Uniform(2)],
        ["bokeh", new Uniform(6)],
        ["spin", new Uniform(0)],
      ]),
    });
  }
}

function addDepthOfField(rd) {
  const comp = rd.composer;
  if (!comp || !Array.isArray(comp.passes) || typeof comp.addPass !== "function") {
    console.warn("[capture] depth of field needs the pmndrs EffectComposer; skipped");
    return null;
  }
  const effect = new CaptureDofEffect();
  const pass = new EffectPass(rd.camera, effect);
  // before the final screen pass, at an even number of swaps (see the header)
  const passes = comp.passes;
  const swapsBefore = (i) => passes.slice(0, i).filter((p) => p.enabled && p.needsSwap).length;
  let idx = Math.max(1, passes.length - 1);
  while (idx > 1 && swapsBefore(idx) % 2 === 1) idx--;
  comp.addPass(pass, idx);
  const u = effect.uniforms;
  return {
    pass,
    effect,
    set(focus, range, bokeh, spin = 0) {
      u.get("focus").value = Math.max(0.1, focus);
      u.get("range").value = Math.max(0, range);
      u.get("bokeh").value = Math.max(0, bokeh);
      u.get("spin").value = spin;
    },
  };
}

export { addDepthOfField };
