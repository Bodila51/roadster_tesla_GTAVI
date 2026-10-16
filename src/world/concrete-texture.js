import { CanvasTexture, SRGBColorSpace } from "three";

function makeConcreteTextures(a, e) {
  const i = document.createElement("canvas");
  (i.width = 512), (i.height = 2048);
  const o = i.getContext("2d"),
    n = document.createElement("canvas");
  (n.width = 512), (n.height = 2048);
  const c = n.getContext("2d"),
    r = document.createElement("canvas");
  (r.width = 512), (r.height = 2048);
  const l = r.getContext("2d");
  (o.fillStyle = "#a9a8a3"),
    o.fillRect(0, 0, 512, 2048),
    (c.fillStyle = "#d8d8d8"),
    c.fillRect(0, 0, 512, 2048),
    (l.fillStyle = "#808080"),
    l.fillRect(0, 0, 512, 2048);
  const d = seededRandom(7);
  for (let w = 0; w < 26e3; w++) {
    const S = d() * 512,
      y = d() * 2048,
      b = d() * 6 + 1,
      L = (140 + d() * 50) | 0;
    (o.fillStyle = `rgba(${L},${L},${L - 4},${0.08 + d() * 0.12})`),
      o.fillRect(S, y, b, b),
      (l.fillStyle = `rgba(${L},${L},${L},0.25)`),
      l.fillRect(S, y, b * 0.6, b * 0.6);
  }
  for (let w = 0; w < 180; w++) {
    const S = d() * 512,
      y = d() * 2048,
      b = 20 + d() * 90,
      L = o.createRadialGradient(S, y, 0, S, y, b),
      m = d() < 0.5;
    L.addColorStop(0, m ? "rgba(90,90,88,0.18)" : "rgba(200,200,196,0.14)"),
      L.addColorStop(1, "rgba(0,0,0,0)"),
      (o.fillStyle = L),
      o.fillRect(S - b, y - b, b * 2, b * 2);
  }
  const f = 2048 / a;
  (o.strokeStyle = "rgba(60,60,58,0.55)"),
    (o.lineWidth = 3),
    (l.strokeStyle = "rgba(20,20,20,0.9)"),
    (l.lineWidth = 4);
  for (let w = 3; w < a; w += 3.2) {
    const S = w * f;
    o.beginPath(),
      o.moveTo(0, S),
      o.lineTo(512, S),
      o.stroke(),
      l.beginPath(),
      l.moveTo(0, S),
      l.lineTo(512, S),
      l.stroke();
  }
  for (const w of [0.33, 0.67]) {
    const S = o.createLinearGradient(w * 512 - 28, 0, w * 512 + 28, 0);
    S.addColorStop(0, "rgba(30,30,30,0)"),
      S.addColorStop(0.5, "rgba(30,30,30,0.35)"),
      S.addColorStop(1, "rgba(30,30,30,0)"),
      (o.fillStyle = S),
      o.fillRect(w * 512 - 28, 0, 56, 2048),
      (c.fillStyle = "rgba(120,120,120,0.5)"),
      c.fillRect(w * 512 - 20, 0, 40, 2048);
  }
  (o.fillStyle = "#efefe9"),
    o.fillRect(512 * 0.47, 0, 7, 2048),
    (c.fillStyle = "#909090"),
    c.fillRect(512 * 0.47, 0, 7, 2048);
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

export { makeConcreteTextures, seededRandom };
