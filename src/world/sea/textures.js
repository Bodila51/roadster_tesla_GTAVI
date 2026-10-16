import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Tileable wave texture, built once from sums of periodic sine waves (integer wave numbers on the
// tile, so it wraps). rg: surface slope (scaled, 0.5 = flat), b: height, a: ridged noise for foam
// lace and caustics. Linear data, mipmapped (the far sea averages to a calm mirror).
function makeWaveTexture(renderer, N = 256) {
  const rnd = rng(90210),
    n2 = N * N,
    SX = new Float32Array(n2),
    SY = new Float32Array(n2),
    H = new Float32Array(n2),
    Q = new Float32Array(n2),
    cu = new Float32Array(N),
    su = new Float32Array(N),
    cv = new Float32Array(N),
    sv = new Float32Array(N);
  const add = (count, kMin, kMax, spread, slopes) => {
    for (let n = 0; n < count; n++) {
      const m = kMin + Math.pow(rnd(), 1.5) * (kMax - kMin),
        a0 = (rnd() - 0.5) * spread,
        kx = Math.round(m * Math.sin(a0)),
        ky = Math.round(m * Math.cos(a0)) * (rnd() < 0.5 ? -1 : 1);
      if (!kx && !ky) continue;
      const amp = Math.pow(Math.hypot(kx, ky), -1.55) * (0.5 + rnd()),
        ph = rnd() * 6.2832;
      for (let i = 0; i < N; i++) {
        const a = (6.2832 * kx * i) / N + ph,
          b = (6.2832 * ky * i) / N;
        (cu[i] = Math.cos(a)), (su[i] = Math.sin(a)), (cv[i] = Math.cos(b)), (sv[i] = Math.sin(b));
      }
      const gx = amp * 6.2832 * kx,
        gy = amp * 6.2832 * ky;
      for (let y = 0; y < N; y++) {
        const c = cv[y],
          s = sv[y],
          o = y * N;
        for (let x = 0; x < N; x++) {
          const sn = su[x] * c + cu[x] * s;
          if (slopes) {
            const cs = cu[x] * c - su[x] * s;
            (H[o + x] += amp * sn), (SX[o + x] += gx * cs), (SY[o + x] += gy * cs);
          } else Q[o + x] += amp * sn;
        }
      }
    }
  };
  // crests mostly parallel to the beach (wave vectors along v = world z), plus some cross chop
  add(30, 2, 30, 2.2, !0);
  add(10, 4, 34, 6.2832, !0);
  add(22, 3, 18, 6.2832, !1);
  let rms = 0,
    hMin = 1e9,
    hMax = -1e9,
    qMax = 0;
  for (let i = 0; i < n2; i++)
    (rms += SX[i] * SX[i] + SY[i] * SY[i]),
      (hMin = Math.min(hMin, H[i])),
      (hMax = Math.max(hMax, H[i])),
      (qMax = Math.max(qMax, Math.abs(Q[i])));
  const k = 0.33 / Math.sqrt(rms / n2 / 2),
    data = new Uint8Array(n2 * 4),
    b = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < n2; i++)
    (data[i * 4] = b(0.5 + 0.5 * SX[i] * k)),
      (data[i * 4 + 1] = b(0.5 + 0.5 * SY[i] * k)),
      (data[i * 4 + 2] = b((H[i] - hMin) / (hMax - hMin))),
      (data[i * 4 + 3] = b(Math.pow(1 - Math.abs(Q[i]) / qMax, 2.2)));
  const t = new DataTexture(data, N, N, RGBAFormat);
  (t.wrapS = t.wrapT = RepeatWrapping),
    (t.magFilter = LinearFilter),
    (t.minFilter = LinearMipmapLinearFilter),
    (t.generateMipmaps = !0),
    (t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())),
    (t.needsUpdate = !0);
  return t;
}

// periodic value noise on an N x N tile with `cells` lattice cells per side
function tileNoise(N, cells, rnd) {
  const g = Float32Array.from({ length: cells * cells }, rnd),
    out = new Float32Array(N * N),
    sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * cells,
      y0 = Math.floor(fy),
      sy = sm(fy - y0),
      r0 = (y0 % cells) * cells,
      r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells,
        x0 = Math.floor(fx),
        sx = sm(fx - x0),
        c0 = x0 % cells,
        c1 = (x0 + 1) % cells,
        a = g[r0 + c0],
        b = g[r0 + c1],
        c = g[r1 + c0],
        d = g[r1 + c1];
      out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

function canvas(N, M = N) {
  const c = document.createElement("canvas");
  (c.width = N), (c.height = M);
  return c;
}

// Sand: warm pale Gulf-coast sand with grain, blotches and shell specks (colour), wind ripples
// (bump). Tiles every 6 m.
function makeSandTextures(renderer) {
  const N = 512,
    rnd = rng(4242),
    n4 = tileNoise(N, 4, rnd),
    n16 = tileNoise(N, 16, rnd),
    n64 = tileNoise(N, 64, rnd),
    n8 = tileNoise(N, 8, rnd),
    cc = canvas(N),
    bc = canvas(N),
    cx = cc.getContext("2d"),
    bx = bc.getContext("2d"),
    ci = cx.createImageData(N, N),
    bi = bx.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x,
        g = rnd(),
        tone = 0.9 + 0.12 * n4[i] + 0.07 * n16[i] + 0.05 * n64[i] + 0.07 * (g - 0.5);
      let r = 224 * tone,
        gg = 207 * tone,
        bb = 172 * tone;
      const sp = rnd();
      sp < 0.004
        ? ((r *= 0.55), (gg *= 0.52), (bb *= 0.5))
        : sp < 0.007 && ((r = 246), (gg = 240), (bb = 228));
      (ci.data[i * 4] = r), (ci.data[i * 4 + 1] = gg), (ci.data[i * 4 + 2] = bb), (ci.data[i * 4 + 3] = 255);
      const ph = (x / N) * 15 + 2.6 * n8[i] + 0.8 * n4[i],
        rip = Math.pow(0.5 + 0.5 * Math.sin(ph * 6.2832), 1.6) * (0.35 + 0.65 * n4[i]),
        h = 0.5 + 0.32 * (rip - 0.4) + 0.18 * (g - 0.5) + 0.12 * (n64[i] - 0.5);
      (bi.data[i * 4] = bi.data[i * 4 + 1] = bi.data[i * 4 + 2] = Math.max(0, Math.min(255, h * 255))),
        (bi.data[i * 4 + 3] = 255);
    }
  cx.putImageData(ci, 0, 0), bx.putImageData(bi, 0, 0);
  const an = Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    t = (c, srgb) => {
      const x = new CanvasTexture(c);
      (x.wrapS = x.wrapT = RepeatWrapping), (x.anisotropy = an), srgb && (x.colorSpace = SRGBColorSpace);
      return x;
    };
  return { map: t(cc, !0), bump: t(bc, !1) };
}

// Atlas for the pier, stalls and props: deck planks, sign boards with the stall names, awning
// stripes, a painted-white patch (flat colours come from vertex colours times this), window glass
// and dark wood. All names are made up.
const SIGNS = [
  { lines: ["SALTY PETE'S", "SHRIMP SHACK"], bg: "#0f5f73", fg: "#fff6dc", edge: "#f2b632" },
  { lines: ["TAFFY TOWN"], bg: "#f4a6c0", fg: "#7a1840", edge: "#ffffff" },
  { lines: ["SNO-CONE", "SHACK"], bg: "#2c8fd6", fg: "#ffffff", edge: "#ffe36e" },
  { lines: ["BAIT &", "TACKLE"], bg: "#2f4a2a", fg: "#f5e9c8", edge: "#c9a255" },
  { lines: ["FUNNEL CAKES"], bg: "#ffd34d", fg: "#b2361c", edge: "#b2361c" },
  { lines: ["SEAGULL", "ARCADE"], bg: "#3b1f6e", fg: "#ffe14a", edge: "#ff5fa2" },
  { lines: ["PELICAN PIER"], bg: "#f7f1e1", fg: "#0d4f7c", edge: "#d8402b" },
  { lines: ["LIFEGUARD"], bg: "#d8402b", fg: "#ffffff", edge: "#ffffff" },
];
const STRIPES = [
  ["#d8402b", "#fbf6ea"],
  ["#1d8a8a", "#fbf6ea"],
  ["#f2b632", "#fbf6ea"],
  ["#2c6fb5", "#fbf6ea"],
];
const AT = 1024;
// regions in canvas pixels: x, y, w, h
const REGION = {
  planks: [0, 0, 1024, 256],
  stripe: (i) => [i * 256, 768, 256, 128],
  sign: (i) => [(i % 2) * 512, 256 + Math.floor(i / 2) * 128, 512, 128],
  white: [8, 904, 496, 112],
  window: [520, 904, 240, 112],
  wood: [776, 904, 240, 112],
};
// uv rect [u0, v0, u1, v1] of a region (canvas textures are flipped: canvas top is v = 1)
function atlasUV(r, inset = 0) {
  const [x, y, w, h] = r;
  return [(x + inset) / AT, 1 - (y + h - inset) / AT, (x + w - inset) / AT, 1 - (y + inset) / AT];
}

function makeAtlas(renderer) {
  const c = canvas(AT),
    g = c.getContext("2d"),
    rnd = rng(777);
  // planks: boards 16 px (0.25 m) wide running across the deck, weathered grey-brown
  for (let row = 0; row < 16; row++) {
    const y = row * 16,
      v = (rnd() - 0.5) * 26,
      base = [146 + v, 128 + v * 0.9, 104 + v * 0.75];
    g.fillStyle = `rgb(${base.map((q) => q | 0).join(",")})`;
    g.fillRect(0, y, 1024, 16);
    for (let k = 0; k < 40; k++) {
      const gy = y + 2 + rnd() * 13,
        a = 0.06 + rnd() * 0.1;
      (g.fillStyle = rnd() < 0.5 ? `rgba(60,48,36,${a})` : `rgba(235,225,205,${a})`), g.fillRect(rnd() * 1024, gy, 60 + rnd() * 400, 1);
    }
    (g.fillStyle = "rgba(38,30,24,0.85)"), g.fillRect(0, y, 1024, 2);
    let jx = rnd() * 200;
    while (jx < 1024) {
      (g.fillStyle = "rgba(38,30,24,0.8)"), g.fillRect(jx, y, 2, 16);
      (g.fillStyle = "rgba(30,30,30,0.6)"), g.fillRect(jx - 5, y + 4, 2, 2), g.fillRect(jx - 5, y + 11, 2, 2);
      g.fillRect(jx + 5, y + 4, 2, 2), g.fillRect(jx + 5, y + 11, 2, 2);
      jx += 150 + rnd() * 260;
    }
  }
  // signs
  SIGNS.forEach((s, i) => {
    const [x, y, w, h] = REGION.sign(i);
    (g.fillStyle = s.edge), g.fillRect(x, y, w, h);
    (g.fillStyle = s.bg), g.fillRect(x + 7, y + 7, w - 14, h - 14);
    (g.strokeStyle = s.edge), (g.lineWidth = 3), g.strokeRect(x + 14, y + 14, w - 28, h - 28);
    const n = s.lines.length,
      fs = n > 1 ? 40 : 60;
    (g.textAlign = "center"), (g.textBaseline = "middle"), (g.fillStyle = s.fg);
    s.lines.forEach((t, j) => {
      let size = fs;
      g.font = `bold ${size}px 'Trebuchet MS', 'DejaVu Sans', Arial, sans-serif`;
      while (g.measureText(t).width > w - 60 && size > 16) (size -= 2), (g.font = `bold ${size}px 'Trebuchet MS', 'DejaVu Sans', Arial, sans-serif`);
      const ty = y + h / 2 + (j - (n - 1) / 2) * (fs + 6);
      (g.fillStyle = "rgba(0,0,0,0.28)"), g.fillText(t, x + w / 2 + 3, ty + 3);
      (g.fillStyle = s.fg), g.fillText(t, x + w / 2, ty);
    });
  });
  // awning stripes, 32 px wide
  STRIPES.forEach((p, i) => {
    const [x, y, w, h] = REGION.stripe(i);
    for (let k = 0; k < w / 32; k++) (g.fillStyle = p[k % 2]), g.fillRect(x + k * 32, y, 32, h);
    (g.fillStyle = "rgba(0,0,0,0.12)"), g.fillRect(x, y + h - 10, w, 10);
  });
  // painted white with a little brush noise
  {
    const [x, y, w, h] = [0, 896, 512, 128];
    (g.fillStyle = "#f4f2ee"), g.fillRect(x, y, w, h);
    for (let k = 0; k < 900; k++) (g.fillStyle = `rgba(120,110,100,${0.02 + rnd() * 0.04})`), g.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 30, 1);
  }
  // window glass: dark blue-grey with a soft sky reflection
  {
    const [x, y, w, h] = [512, 896, 256, 128],
      gr = g.createLinearGradient(x, y, x + w * 0.4, y + h);
    gr.addColorStop(0, "#5d7790"), gr.addColorStop(0.45, "#22303d"), gr.addColorStop(1, "#141b22");
    (g.fillStyle = gr), g.fillRect(x, y, w, h);
  }
  // dark wet wood / creosote (pilings, ramps)
  {
    const [x, y, w, h] = [768, 896, 256, 128];
    (g.fillStyle = "#6f5a45"), g.fillRect(x, y, w, h);
    for (let k = 0; k < 300; k++) (g.fillStyle = `rgba(30,22,16,${0.08 + rnd() * 0.12})`), g.fillRect(x + rnd() * w, y, 1 + rnd() * 2, h);
  }
  const t = new CanvasTexture(c);
  (t.colorSpace = SRGBColorSpace), (t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  return t;
}

export { REGION, SIGNS, atlasUV, makeAtlas, makeSandTextures, makeWaveTexture };
