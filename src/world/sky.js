import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from "three";

function buildSky() {
  const a = new SphereGeometry(3e3, 48, 24),
    e = new ShaderMaterial({
      side: BackSide,
      depthWrite: !1,
      fog: !1,
      uniforms: {
        uTime: {
          value: 0,
        },
      },
      vertexShader:
        "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        float h = vDir.y;
        vec3 top = vec3(0.006,0.010,0.022);
        vec3 mid = vec3(0.020,0.032,0.050);
        vec3 hor = vec3(0.060,0.070,0.085);
        vec3 col = mix(hor, mid, smoothstep(-0.02, 0.12, h));
        col = mix(col, top, smoothstep(0.12, 0.7, h));
        // warm city glow on one side of the horizon
        float glow = exp(-abs(h)*14.0) * (0.5 + 0.5*max(0.0, dot(normalize(vDir.xz), normalize(vec2(0.6,-0.8)))));
        col += vec3(0.10,0.055,0.03) * glow;
        // stars
        vec3 d = normalize(vDir);
        vec3 q = d * 520.0;
        vec3 cell = floor(q);
        float s = hash(cell);
        vec3 lp = fract(q) - 0.5 - (vec3(hash(cell+1.7), hash(cell+3.1), hash(cell+5.3)) - 0.5) * 0.5;
        float star = step(0.9965, s) * smoothstep(0.22, 0.0, length(lp)) * smoothstep(0.04, 0.3, h);
        float tw = 0.55 + 0.45*sin(s*900.0);
        col += vec3(0.9,0.95,1.0) * star * tw * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    }),
    s = new Mesh(a, e);
  return (s.renderOrder = -10), s;
}

export { buildSky };
