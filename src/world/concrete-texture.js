import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// Riding surface of the ramps: broom-finished concrete, 3.2 m joints, rubber laid down in the
// two wheel tracks (heaviest at the bottom where cars hit it), a painted centre line.
// The canvas runs along the ramp (y = length a in metres) and across it (x = width e).
function makeConcreteTextures(a, e, k = 1) {
  const i = document.createElement("canvas");
  (i.width = 512), (i.height = 2048);
  const o = i.getContext("2d"),
    n = document.createElement("canvas");
  (n.width = 512), (n.height = 2048);
  const c = n.getContext("2d"),
    r = document.createElement("canvas");
  (r.width = 512), (r.height = 2048);
  const l = r.getContext("2d");
  (o.fillStyle = "#b3b0a8"),
    o.fillRect(0, 0, 512, 2048),
    (c.fillStyle = "#d2d2d2"),
    c.fillRect(0, 0, 512, 2048),
    (l.fillStyle = "#808080"),
    l.fillRect(0, 0, 512, 2048);
  const d = seededRandom(7);
  // large soft mottling (curing, patching)
  for (let w = 0; w < 140; w++) {
    const S = d() * 512,
      y = d() * 2048,
      b = 30 + d() * 120,
      L = o.createRadialGradient(S, y, 0, S, y, b),
      m = d() < 0.55;
    L.addColorStop(0, m ? "rgba(120,117,110,0.13)" : "rgba(214,211,203,0.12)"),
      L.addColorStop(1, "rgba(0,0,0,0)"),
      (o.fillStyle = L),
      o.fillRect(S - b, y - b, b * 2, b * 2);
  }
  // broom finish: fine streaks across the ramp
  for (let w = 0; w < 2600; w++) {
    const S = d() * 2048,
      y = (d() - 0.5) * 3,
      b = (150 + d() * 60) | 0;
    (o.strokeStyle = `rgba(${b},${b - 2},${b - 6},${0.05 + d() * 0.07})`),
      (o.lineWidth = 0.6 + d()),
      o.beginPath(),
      o.moveTo(0, S),
      o.lineTo(512, S + y),
      o.stroke(),
      (l.strokeStyle = `rgba(${d() < 0.5 ? 160 : 100},128,128,0.12)`),
      l.beginPath(),
      l.moveTo(0, S),
      l.lineTo(512, S + y),
      l.stroke();
  }
  // sand and pores
  for (let w = 0; w < 6e4; w++) {
    const S = d() * 512,
      y = d() * 2048,
      b = d() < 0.8 ? 1 : 2,
      L = d() < 0.7 ? (150 + d() * 60) | 0 : (95 + d() * 30) | 0;
    (o.fillStyle = `rgba(${L},${L - 1},${L - 5},${0.12 + d() * 0.2})`),
      o.fillRect(S, y, b, b),
      (l.fillStyle = L > 140 ? "rgba(170,170,170,0.25)" : "rgba(60,60,60,0.35)"),
      l.fillRect(S, y, b, b);
  }
  // control joints every 3.2 m (dark sealant line, a groove in the bump map)
  const f = 2048 / a;
  for (let w = 3; w < a; w += 3.2) {
    const S = w * f;
    (o.strokeStyle = "rgba(70,68,64,0.6)"),
      (o.lineWidth = 2.5),
      o.beginPath(),
      o.moveTo(0, S),
      o.lineTo(512, S),
      o.stroke(),
      (o.strokeStyle = "rgba(225,222,214,0.35)"),
      (o.lineWidth = 1),
      o.beginPath(),
      o.moveTo(0, S + 2.5),
      o.lineTo(512, S + 2.5),
      o.stroke(),
      (l.strokeStyle = "rgba(20,20,20,0.9)"),
      (l.lineWidth = 4),
      l.beginPath(),
      l.moveTo(0, S),
      l.lineTo(512, S),
      l.stroke();
  }
  // rubber in the two wheel tracks: dense at the entry, thinning out higher up
  for (const w of [0.33, 0.67])
    for (let S = 0; S < 2048; S += 8) {
      const y = S / 2048,
        b = k * (0.55 * Math.pow(1 - y, 1.6) + 0.12),
        L = 18 + 10 * Math.sin(S * 0.013 + w * 9),
        m = o.createLinearGradient(w * 512 - L, 0, w * 512 + L, 0);
      m.addColorStop(0, "rgba(28,27,26,0)"),
        m.addColorStop(0.5, `rgba(28,27,26,${b * (0.75 + 0.25 * d())})`),
        m.addColorStop(1, "rgba(28,27,26,0)"),
        (o.fillStyle = m),
        o.fillRect(w * 512 - L, S, L * 2, 9),
        (c.fillStyle = `rgba(130,130,130,${b * 0.8})`),
        c.fillRect(w * 512 - L * 0.6, S, L * 1.2, 9);
    }
  // painted centre line, worn where the tyres cross it
  (o.fillStyle = "rgba(236,234,226,0.92)"),
    o.fillRect(512 * 0.47, 0, 7, 2048),
    (c.fillStyle = "#a0a0a0"),
    c.fillRect(512 * 0.47, 0, 7, 2048);
  for (let w = 0; w < 400; w++)
    (o.fillStyle = `rgba(160,157,150,${0.3 + d() * 0.5})`),
      o.fillRect(512 * 0.47 + d() * 7, d() * 2048, 1 + d() * 3, 1 + d() * 4);
  const p = (w, S) => {
    const y = new CanvasTexture(w);
    return S && (y.colorSpace = SRGBColorSpace), (y.anisotropy = 8), y;
  };
  return {
    map: p(i, !0),
    rough: p(n, !1),
    bump: p(r, !1),
  };
}
// Cast-in-place concrete for big vertical faces: 2.4 x 1.2 m form panels, tie holes, soft
// stains running down from the top. One tile = 4.8 x 4.8 m, wraps.
let We = null;
function makeWallTexture() {
  if (We) return We;
  const a = document.createElement("canvas");
  (a.width = a.height = 512);
  const e = a.getContext("2d"),
    s = seededRandom(11);
  (e.fillStyle = "#a9a6a0"), e.fillRect(0, 0, 512, 512);
  for (let t = 0; t < 2; t++)
    for (let i = 0; i < 4; i++) {
      const o = (175 + s() * 30) | 0;
      (e.fillStyle = `rgba(${o},${o - 2},${o - 7},0.22)`),
        e.fillRect(t * 256, i * 128, 256, 128);
    }
  for (let t = 0; t < 3e4; t++) {
    const i = (120 + s() * 80) | 0;
    (e.fillStyle = `rgba(${i},${i - 1},${i - 5},${0.08 + s() * 0.15})`),
      e.fillRect(s() * 512, s() * 512, 1 + (s() < 0.2), 1 + (s() < 0.2));
  }
  for (let t = 0; t < 26; t++) {
    const i = s() * 512,
      o = 40 + s() * 200,
      n = e.createLinearGradient(0, 0, 0, o);
    n.addColorStop(0, "rgba(96,92,86,0.16)"),
      n.addColorStop(1, "rgba(96,92,86,0)"),
      (e.fillStyle = n),
      e.fillRect(i, 0, 3 + s() * 14, o);
  }
  (e.strokeStyle = "rgba(85,83,78,0.55)"), (e.lineWidth = 1.5);
  for (let t = 0; t <= 512; t += 128)
    e.beginPath(), e.moveTo(0, t), e.lineTo(512, t), e.stroke();
  for (let t = 0; t <= 512; t += 256)
    e.beginPath(), e.moveTo(t, 0), e.lineTo(t, 512), e.stroke();
  e.fillStyle = "rgba(60,58,55,0.7)";
  for (let t = 0; t < 2; t++)
    for (let i = 0; i < 4; i++)
      for (const o of [0.25, 0.75])
        for (const n of [0.3, 0.7])
          e.beginPath(),
            e.arc(t * 256 + o * 256, i * 128 + n * 128, 2.2, 0, Math.PI * 2),
            e.fill();
  const t = new CanvasTexture(a);
  return (
    (t.wrapS = t.wrapT = RepeatWrapping),
    (t.colorSpace = SRGBColorSpace),
    (t.anisotropy = 8),
    (We = t)
  );
}
function seededRandom(a) {
  return function () {
    (a |= 0), (a = (a + 1831565813) | 0);
    let e = Math.imul(a ^ (a >>> 15), 1 | a);
    return (
      (e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e),
      ((e ^ (e >>> 14)) >>> 0) / 4294967296
    );
  };
}

// periodic value-noise fbm in [0,1], size x size, tiles seamlessly
function tileFbm(a, e, s, t = 4) {
  const i = new Float32Array(a * a);
  let o = 0.5,
    n = e,
    c = 0;
  for (let r = 0; r < t; r++, n *= 2, o *= 0.5) {
    const l = new Float32Array(n * n);
    for (let d = 0; d < l.length; d++) l[d] = s();
    for (let d = 0; d < a; d++) {
      const f = (d / a) * n,
        p = Math.floor(f);
      let w = f - p;
      w = w * w * (3 - 2 * w);
      const S = (p % n) * n,
        y = ((p + 1) % n) * n;
      for (let b = 0; b < a; b++) {
        const L = (b / a) * n,
          m = Math.floor(L);
        let v = L - m;
        v = v * v * (3 - 2 * v);
        const x = m % n,
          h = (m + 1) % n,
          u = l[S + x],
          T = l[S + h],
          z = l[y + x],
          g = l[y + h];
        i[d * a + b] += o * (u + (T - u) * v + (z - u) * w + (u - T - z + g) * v * w);
      }
    }
    c += o;
  }
  for (let r = 0; r < i.length; r++)
    i[r] = Math.min(1, Math.max(0, (i[r] / c - 0.5) * 2.2 + 0.5));
  return i;
}

export { makeConcreteTextures, makeWallTexture, seededRandom, tileFbm };
