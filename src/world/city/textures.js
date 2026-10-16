import {
  CanvasTexture,
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

// Procedural canvas art for the town, packed into two texture arrays (one material each):
// the facade array (walls, shopfronts, curtain walls, roofs, awnings, signs, billboards) and the
// ground array (asphalt, sidewalk, grass, lots, plazas, promenade, sand, pool). Every layer is
// 256 x 256 and drawn on a 2D canvas; layer v = 0 is the bottom of the drawing.
// Facade alpha is "not glass": 0 = window glass (glossy, untinted), 1 = wall (tinted per building).
const S = 256;

function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

class ArrayBuilder {
  constructor() {
    this.layers = [];
    this.index = {};
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = c.height = S;
      return c.getContext("2d", { willReadFrequently: true });
    };
    this.ctx = mk();
    this.mask = mk();
  }
  add(name, draw) {
    const c = this.ctx,
      m = this.mask;
    c.setTransform(1, 0, 0, 1, 0, 0);
    m.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = m.globalAlpha = 1;
    m.fillStyle = "#000";
    m.fillRect(0, 0, S, S);
    c.fillStyle = "#888";
    c.fillRect(0, 0, S, S);
    draw(c, m);
    const col = c.getImageData(0, 0, S, S).data,
      msk = m.getImageData(0, 0, S, S).data,
      out = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) {
      const src = y * S * 4,
        dst = (S - 1 - y) * S * 4;
      for (let x = 0; x < S * 4; x += 4) {
        out[dst + x] = col[src + x];
        out[dst + x + 1] = col[src + x + 1];
        out[dst + x + 2] = col[src + x + 2];
        out[dst + x + 3] = 255 - msk[src + x];
      }
    }
    this.index[name] = this.layers.length;
    this.layers.push(out);
    return this.index[name];
  }
  build() {
    const n = this.layers.length,
      data = new Uint8Array(S * S * 4 * n);
    this.layers.forEach((l, i) => data.set(l, i * S * S * 4));
    const t = new DataArrayTexture(data, S, S, n);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = 4;
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
}

// ---------- drawing helpers ----------
function speckle(c, r, n, a, light = 255, dark = 0, sz = 2) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? light : dark;
    c.fillStyle = `rgba(${v},${v},${v},${a * r()})`;
    c.fillRect(r() * S, r() * S, 1 + r() * sz, 1 + r() * sz);
  }
}
function stucco(c, r, base = "#ece7de") {
  c.fillStyle = base;
  c.fillRect(0, 0, S, S);
  speckle(c, r, 1800, 0.07, 255, 60);
  // faint vertical weathering
  for (let i = 0; i < 10; i++) {
    const x = r() * S,
      g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "rgba(90,80,70,0)");
    g.addColorStop(1, `rgba(90,80,70,${0.05 * r()})`);
    c.fillStyle = g;
    c.fillRect(x, 0, 6 + r() * 20, S);
  }
}
function glass(c, m, x, y, w, h, tone = [58, 78, 98], reflect = 0.35) {
  const g = c.createLinearGradient(x, y, x + w * 0.3, y + h);
  g.addColorStop(0, `rgb(${tone[0] + 70 * reflect},${tone[1] + 80 * reflect},${tone[2] + 90 * reflect})`);
  g.addColorStop(0.55, `rgb(${tone[0]},${tone[1]},${tone[2]})`);
  g.addColorStop(1, `rgb(${tone[0] * 0.7},${tone[1] * 0.72},${tone[2] * 0.75})`);
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  m.fillStyle = "#fff";
  m.fillRect(x, y, w, h);
}
function frameRect(c, x, y, w, h, t, col = "#f7f4ee") {
  c.fillStyle = col;
  c.fillRect(x - t, y - t, w + 2 * t, t);
  c.fillRect(x - t, y + h, w + 2 * t, t);
  c.fillRect(x - t, y, t, h);
  c.fillRect(x + w, y, t, h);
}
function mullions(c, m, x, y, w, h, nx, ny, t = 3, col = "#e8e6e0") {
  c.fillStyle = col;
  m.fillStyle = "#000";
  for (let i = 1; i < nx; i++) {
    const xx = x + (w * i) / nx - t / 2;
    c.fillRect(xx, y, t, h);
    m.fillRect(xx, y, t, h);
  }
  for (let j = 1; j < ny; j++) {
    const yy = y + (h * j) / ny - t / 2;
    c.fillRect(x, yy, w, t);
    m.fillRect(x, yy, w, t);
  }
}
// floor line at the bottom of an upper-floor module
function floorBand(c, col = "rgba(0,0,0,0.10)") {
  c.fillStyle = col;
  c.fillRect(0, S - 7, S, 7);
  c.fillStyle = "rgba(255,255,255,0.25)";
  c.fillRect(0, S - 9, S, 2);
}
function text(c, str, x, y, w, h, font, col, align = "center") {
  c.save();
  c.fillStyle = col;
  c.textAlign = align;
  c.textBaseline = "middle";
  let size = h;
  c.font = font.replace("#", size);
  while (c.measureText(str).width > w && size > 6) c.font = font.replace("#", --size);
  c.fillText(str, x, y);
  c.restore();
}

// ---------- facade array ----------
// module sizes in metres (width, height) used by the building generator for UV repeats
const MODULES = {
  win1: [4, 3.4],
  win2: [4, 3.4],
  balc: [4, 3.4],
  arch: [4, 3.4],
  ribbon: [4, 3.4],
  win4: [4, 3.4],
  shop1: [6, 4.2],
  shop2: [6, 4.2],
  shop3: [6, 4.2],
  door: [4, 3.4],
  gdoor: [6, 4.2],
  blank: [4, 4],
  cw1: [3, 3.6],
  cw2: [3, 3.6],
  cw3: [3, 3.6],
  cw4: [3, 3.6],
  lobby: [6, 5],
  roof: [5, 5],
  conc: [4, 4],
  deck: [6, 3.6],
  awnR: [2, 1],
  awnG: [2, 1],
  awnB: [2, 1],
};

const SIGNS = [
  ["TACO LOCO", "#d8452b", "#fff4d6"],
  ["SEA BREEZE CAFE", "#2a8c8c", "#ffffff"],
  ["SURF SHACK", "#f2b134", "#1d3557"],
  ["BAIT & TACKLE", "#1d4e89", "#ffd166"],
  ["DONUT DUNES", "#f49ac2", "#5b2333"],
  ["COAST PHARMACY", "#ffffff", "#c1121f"],
  ["PIZZA PELICAN", "#2d6a4f", "#ffffff"],
  ["SALT & SAND", "#f1e3c8", "#33415c"],
  ["SUDS LAUNDRY", "#4cc9f0", "#ffffff"],
  ["SMOKY'S BBQ", "#3d2b1f", "#ff9f1c"],
  ["ICE HOUSE", "#e9f5f9", "#0077b6"],
  ["GATOR GULP", "#55a630", "#ffffff"],
  ["CRABBY JOE'S", "#e63946", "#ffffff"],
  ["BOOTS & BITS", "#8d5524", "#ffe8c2"],
  ["SUNNY DINER", "#ffd60a", "#c1121f"],
  ["PAWN & GOLD", "#14213d", "#fca311"],
  ["HOT WINGS", "#ff5400", "#ffffff"],
  ["BEACH SUPPLY", "#00b4d8", "#ffffff"],
  ["PELICAN FUEL", "#ffffff", "#d62828"],
  ["PELICAN MART", "#d62828", "#ffffff"],
  ["PARK", "#1d4e89", "#ffffff"],
  ["HOTEL SABAL", "#ffffff", "#0b6e79"],
  ["SEASIDE MOTEL", "#ff6b6b", "#ffffff"],
  ["CITY HALL", "#f3ead7", "#5c4033"],
];
const SIGN_ID = Object.fromEntries(SIGNS.map((s, i) => [s[0], i]));

const BILLBOARDS = [
  { a: "HURRICANE COLA", b: "Feel the storm.", bg: ["#3a0ca3", "#4361ee"], fg: "#ffffff", ac: "#f72585", art: "swirl" },
  { a: "LONE GULL LAGER", b: "Coldest on the coast", bg: ["#f48c06", "#ffba08"], fg: "#370617", ac: "#ffffff", art: "gull" },
  { a: "COASTLINE REALTY", b: "Your home by the sea  555-0142", bg: ["#ff7b54", "#ffb26b"], fg: "#2b2d42", ac: "#2b2d42", art: "house" },
  { a: "RATTLER ENERGY", b: "Bite back.", bg: ["#111111", "#1b4332"], fg: "#80ed99", ac: "#80ed99", art: "zig" },
  { a: "BIG CATCH SEAFOOD", b: "Ocean Dr  next right", bg: ["#00838f", "#4dd0e1"], fg: "#ffffff", ac: "#ffd166", art: "fish" },
  { a: "WELCOME TO PORT SABAL", b: "Gulf Coast, Texas", bg: ["#0096c7", "#90e0ef"], fg: "#ffffff", ac: "#ffd166", art: "sun" },
];

function drawBillboard(c, bb, half) {
  // the board is 512 x 256 split over two layers; draw the whole board shifted by half
  c.save();
  c.translate(-half * S, 0);
  const g = c.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, bb.bg[0]);
  g.addColorStop(1, bb.bg[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 256);
  c.fillStyle = bb.ac;
  c.strokeStyle = bb.ac;
  c.lineWidth = 10;
  if (bb.art === "swirl") {
    for (let i = 0; i < 5; i++) {
      c.globalAlpha = 0.35;
      c.beginPath();
      c.arc(430, 128, 30 + i * 22, i, i + 4);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.fillStyle = "#e63946";
    c.fillRect(400, 60, 60, 140);
    c.fillStyle = "#fff";
    c.fillRect(400, 110, 60, 12);
  } else if (bb.art === "gull") {
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(370, 120);
    c.quadraticCurveTo(410, 70, 440, 125);
    c.quadraticCurveTo(470, 70, 505, 115);
    c.stroke();
    c.fillStyle = "#6a040f";
    c.fillRect(30, 200, 452, 8);
  } else if (bb.art === "house") {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(380, 150);
    c.lineTo(440, 95);
    c.lineTo(500, 150);
    c.fill();
    c.fillRect(392, 150, 96, 70);
    c.fillStyle = "#2b2d42";
    c.fillRect(430, 180, 22, 40);
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.beginPath();
    c.arc(90, 230, 120, Math.PI, 0);
    c.fill();
  } else if (bb.art === "zig") {
    c.lineWidth = 14;
    c.beginPath();
    for (let i = 0; i <= 8; i++) c.lineTo(20 + i * 60, i % 2 ? 210 : 240);
    c.stroke();
  } else if (bb.art === "fish") {
    c.beginPath();
    c.ellipse(430, 128, 60, 34, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(370, 128);
    c.lineTo(340, 95);
    c.lineTo(340, 161);
    c.fill();
    c.fillStyle = "#003049";
    c.beginPath();
    c.arc(462, 118, 7, 0, 7);
    c.fill();
  } else if (bb.art === "sun") {
    c.fillStyle = "#ffd166";
    c.beginPath();
    c.arc(450, 150, 56, 0, 7);
    c.fill();
    c.fillStyle = "#0077b6";
    c.fillRect(0, 196, 512, 60);
    c.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 6; i++) c.fillRect(330 + i * 30, 210 + (i % 2) * 14, 22, 4);
    // palm
    c.fillStyle = "#1b4332";
    c.fillRect(330, 90, 8, 110);
    for (let i = 0; i < 6; i++) {
      c.save();
      c.translate(334, 92);
      c.rotate(-2.6 + i * 0.95);
      c.fillRect(0, -4, 55, 8);
      c.restore();
    }
  }
  const tw = bb.art === "sun" ? 300 : 340;
  text(c, bb.a, 24, 92, tw, 64, "900 #px Arial, Helvetica, sans-serif", bb.fg, "left");
  text(c, bb.b, 26, 158, tw, 34, "700 #px Arial, Helvetica, sans-serif", bb.fg, "left");
  // frame edge
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 8;
  c.strokeRect(4, 4, 504, 248);
  c.restore();
}

function makeFacadeArray() {
  const A = new ArrayBuilder(),
    r = rng(7);
  const px = (m, mod) => (m / mod) * S; // metres to pixels
  // upper-floor stucco modules (4 x 3.4 m)
  const W = (m) => px(m, 4),
    H = (m) => px(m, 3.4);
  A.add("win1", (c, m) => {
    stucco(c, r);
    floorBand(c);
    const x = W(1.3),
      y = H(0.75),
      w = W(1.4),
      h = H(1.65);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(x - 6, y - 6, w + 12, h + 16);
    glass(c, m, x, y, w, h);
    mullions(c, m, x, y, w, h, 2, 2, 4);
    frameRect(c, x, y, w, h, 5);
    c.fillStyle = "#faf8f2";
    c.fillRect(x - 12, y + h + 4, w + 24, 9);
  });
  A.add("win2", (c, m) => {
    stucco(c, r);
    floorBand(c);
    for (const cx of [1.0, 3.0]) {
      const w = W(0.95),
        h = H(1.55),
        x = W(cx) - w / 2,
        y = H(0.8);
      glass(c, m, x, y, w, h, [52, 70, 88]);
      mullions(c, m, x, y, w, h, 1, 3, 3);
      frameRect(c, x, y, w, h, 4);
      // shutters: a darker shade of the wall colour after tinting
      c.fillStyle = "#9a958c";
      for (const sx of [x - 4 - w * 0.45, x + w + 4]) {
        c.fillRect(sx, y - 2, w * 0.45, h + 4);
        c.fillStyle = "#8a857c";
        for (let k = 0; k < 9; k++) c.fillRect(sx + 2, y + 4 + (k * h) / 9, w * 0.45 - 4, 3);
        c.fillStyle = "#9a958c";
      }
      c.fillStyle = "#faf8f2";
      c.fillRect(x - 6, y + h + 3, w + 12, 7);
    }
  });
  A.add("balc", (c, m) => {
    stucco(c, r);
    floorBand(c);
    const w = W(1.5),
      h = H(2.3),
      x = W(2) - w / 2,
      y = H(0.45);
    glass(c, m, x, y, w, h, [60, 80, 96], 0.45);
    mullions(c, m, x, y, w, h, 2, 1, 4);
    frameRect(c, x, y, w, h, 5);
    // balcony slab and railing
    const by = H(2.15);
    c.fillStyle = "#f4f1ea";
    c.fillRect(W(0.4), by + H(0.55), W(3.2), 10);
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(W(0.4), by + H(0.55) + 10, W(3.2), 6);
    c.fillStyle = "#3a3d40";
    m.fillStyle = "#000";
    c.fillRect(W(0.4), by - 4, W(3.2), 5);
    m.fillRect(W(0.4), by - 4, W(3.2), 5);
    for (let k = 0; k <= 16; k++) {
      c.fillRect(W(0.4) + (k * W(3.2)) / 16 - 1, by, 3, H(0.55));
      m.fillRect(W(0.4) + (k * W(3.2)) / 16 - 1, by, 3, H(0.55));
    }
  });
  A.add("arch", (c, m) => {
    stucco(c, r, "#efe6d6");
    floorBand(c);
    const w = W(1.3),
      x = W(2) - w / 2,
      y = H(0.85),
      h = H(1.75);
    const path = (cc) => {
      cc.beginPath();
      cc.moveTo(x, y + h);
      cc.lineTo(x, y + w / 2);
      cc.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
      cc.lineTo(x + w, y + h);
      cc.closePath();
    };
    c.save();
    c.lineWidth = 12;
    c.strokeStyle = "#f9f5ec";
    path(c);
    c.stroke();
    path(c);
    c.clip();
    glass(c, m, x, y, w, h, [50, 66, 84]);
    c.restore();
    m.save();
    path(m);
    m.fillStyle = "#fff";
    m.fill();
    m.restore();
    mullions(c, m, x, y + w / 2, w, h - w / 2, 2, 2, 3);
    c.fillStyle = "#c46a3c"; // terracotta sill
    c.fillRect(x - 10, y + h, w + 20, 10);
  });
  A.add("ribbon", (c, m) => {
    stucco(c, r, "#f1efea");
    floorBand(c);
    const x = W(0.3),
      y = H(0.95),
      w = W(3.4),
      h = H(1.25);
    glass(c, m, x, y, w, h, [48, 66, 84], 0.5);
    mullions(c, m, x, y, w, h, 3, 1, 4, "#d9dcdf");
    c.fillStyle = "rgba(0,0,0,0.15)";
    c.fillRect(x, y + h, w, 5);
  });
  A.add("win4", (c, m) => {
    stucco(c, r);
    floorBand(c);
    for (const cx of [1.1, 2.9]) {
      const w = W(0.95),
        h = H(1.0),
        x = W(cx) - w / 2,
        y = H(1.0);
      glass(c, m, x, y, w, h);
      mullions(c, m, x, y, w, h, 2, 1, 3);
      frameRect(c, x, y, w, h, 5, "#faf7f0");
    }
  });
  // ground-floor modules (6 x 4.2 m); top 0.9 m is the sign band
  const GW = (mm) => px(mm, 6),
    GH = (mm) => px(mm, 4.2);
  const shopBase = (c) => {
    stucco(c, r, "#e7e2d8");
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, GH(3.25), S, 4);
    c.fillStyle = "#cfc9be"; // base course
    c.fillRect(0, GH(3.9), S, GH(0.3));
  };
  A.add("shop1", (c, m) => {
    shopBase(c);
    const x = GW(0.4),
      y = GH(0.45),
      w = GW(3.8),
      h = GH(2.6);
    glass(c, m, x, y, w, h, [40, 52, 62], 0.55);
    mullions(c, m, x, y, w, h, 3, 1, 5, "#2f3337");
    c.fillStyle = "#2f3337";
    c.fillRect(x, y + h - 10, w, 10);
    // door
    const dx = GW(4.6),
      dw = GW(1.1),
      dy = GH(0.75);
    glass(c, m, dx, dy, dw, GH(3.9) - dy, [36, 46, 56], 0.4);
    frameRect(c, dx, dy, dw, GH(3.9) - dy, 5, "#2f3337");
    c.fillStyle = "#c9c4b8";
    c.fillRect(dx + dw * 0.75, dy + GH(1.6), 5, GH(0.5));
  });
  A.add("shop2", (c, m) => {
    shopBase(c);
    const x = GW(0.25),
      y = GH(0.4),
      w = GW(5.5),
      h = GH(3.45);
    glass(c, m, x, y, w, h, [44, 58, 70], 0.5);
    mullions(c, m, x, y, w, h, 4, 1, 6, "#e6e6e6");
    c.fillStyle = "#e6e6e6";
    m.fillStyle = "#000";
    c.fillRect(x, y + GH(0.9), w, 5);
    m.fillRect(x, y + GH(0.9), w, 5);
    // a few goods on display
    for (let i = 0; i < 7; i++) {
      c.fillStyle = `hsl(${r() * 360},50%,${40 + r() * 30}%)`;
      c.fillRect(x + 10 + r() * (w - 40), y + h - 30 - r() * 30, 14 + r() * 20, 24);
    }
  });
  A.add("shop3", (c, m) => {
    shopBase(c);
    for (const cx of [1.2, 4.8]) {
      const w = GW(1.9),
        x = GW(cx) - w / 2,
        y = GH(0.7),
        h = GH(2.2);
      glass(c, m, x, y, w, h, [46, 58, 68], 0.45);
      mullions(c, m, x, y, w, h, 2, 2, 4, "#5a3b28");
      frameRect(c, x, y, w, h, 6, "#5a3b28");
    }
    const dx = GW(2.45),
      dw = GW(1.1);
    c.fillStyle = "#6b4630";
    c.fillRect(dx, GH(1.2), dw, GH(2.7));
    c.fillStyle = "#4b3020";
    c.fillRect(dx + 6, GH(1.2) + 8, dw - 12, GH(2.7) - 16);
    glass(c, m, dx, GH(0.75), dw, GH(0.4), [50, 62, 74]);
  });
  A.add("door", (c, m) => {
    stucco(c, r);
    floorBand(c);
    const dx = W(0.6),
      dw = W(1.0),
      dy = H(0.95);
    c.fillStyle = "#7a5134";
    c.fillRect(dx, dy, dw, S - 9 - dy);
    c.fillStyle = "#6a4329";
    c.fillRect(dx + 8, dy + 10, dw - 16, H(0.9));
    c.fillRect(dx + 8, dy + H(1.15), dw - 16, H(0.9));
    frameRect(c, dx, dy, dw, S - 9 - dy, 6);
    c.fillStyle = "#d9c7a0";
    c.fillRect(dx + dw - 14, dy + H(1.1), 6, 6);
    const x = W(2.1),
      y = H(0.85),
      w = W(1.4),
      h = H(1.5);
    glass(c, m, x, y, w, h);
    mullions(c, m, x, y, w, h, 2, 2, 4);
    frameRect(c, x, y, w, h, 5);
    // porch light
    c.fillStyle = "#fff3c4";
    c.fillRect(dx + dw + 8, dy + 4, 8, 12);
  });
  A.add("gdoor", (c, m) => {
    shopBase(c);
    const x = GW(0.5),
      y = GH(0.6),
      w = GW(5),
      h = GH(3.6) - GH(0.3);
    c.fillStyle = "#d9dadc";
    c.fillRect(x, y, w, h);
    c.fillStyle = "#b9bbbe";
    for (let k = 0; k < 18; k++) c.fillRect(x, y + (k * h) / 18, w, 3);
    frameRect(c, x, y, w, h, 6, "#8c8f93");
  });
  A.add("blank", (c) => {
    stucco(c, r);
    c.fillStyle = "rgba(0,0,0,0.06)";
    c.fillRect(0, 0, 2, S);
    c.fillRect(0, S / 2, S, 2);
  });
  // tower modules (3 x 3.6 m)
  const TW = (mm) => px(mm, 3),
    TH = (mm) => px(mm, 3.6);
  A.add("cw1", (c, m) => {
    c.fillStyle = "#d8dde2";
    c.fillRect(0, 0, S, S);
    glass(c, m, 0, 0, S, TH(2.7), [40, 74, 112], 0.6);
    c.fillStyle = "#2c4058";
    c.fillRect(0, TH(2.7), S, TH(0.9));
    m.fillStyle = "#bbb"; // spandrel: still glassy
    m.fillRect(0, TH(2.7), S, TH(0.9));
    mullions(c, m, 0, 0, S, S, 2, 1, 5, "#c6ccd3");
    c.fillStyle = "#c6ccd3";
    m.fillStyle = "#000";
    c.fillRect(0, 0, 5, S);
    m.fillRect(0, 0, 5, S);
    c.fillRect(0, TH(2.7) - 3, S, 6);
    m.fillRect(0, TH(2.7) - 3, S, 6);
  });
  A.add("cw2", (c, m) => {
    c.fillStyle = "#e6e1d6";
    c.fillRect(0, 0, S, S);
    speckle(c, r, 600, 0.06, 255, 80);
    glass(c, m, 0, TH(0.6), S, TH(2.1), [92, 82, 60], 0.45);
    mullions(c, m, 0, TH(0.6), S, TH(2.1), 3, 1, 4, "#4a4436");
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.fillRect(0, TH(2.7), S, 5);
  });
  A.add("cw3", (c, m) => {
    c.fillStyle = "#efeeea";
    c.fillRect(0, 0, S, S);
    speckle(c, r, 900, 0.08, 255, 90);
    const x = TW(0.55),
      y = TH(0.6),
      w = TW(1.9),
      h = TH(2.3);
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(x - 4, y - 4, w + 8, h + 10);
    glass(c, m, x, y, w, h, [44, 62, 82], 0.5);
    mullions(c, m, x, y, w, h, 2, 1, 4, "#b8bcc0");
  });
  A.add("cw4", (c, m) => {
    c.fillStyle = "#f4f4f2";
    c.fillRect(0, 0, S, S);
    glass(c, m, 0, 0, S, S, [52, 86, 104], 0.55);
    c.fillStyle = "#f4f4f2";
    m.fillStyle = "#000";
    for (const fx of [0, S / 2]) {
      c.fillRect(fx, 0, 22, S);
      m.fillRect(fx, 0, 22, S);
      c.fillStyle = "rgba(0,0,0,0.2)";
      c.fillRect(fx + 22, 0, 6, S);
      c.fillStyle = "#f4f4f2";
    }
    c.fillRect(0, TH(3.3), S, TH(0.3));
    m.fillRect(0, TH(3.3), S, TH(0.3));
  });
  A.add("lobby", (c, m) => {
    c.fillStyle = "#d5d3cd";
    c.fillRect(0, 0, S, S);
    const y = px(0.5, 5);
    glass(c, m, 0, y, S, S - y, [38, 50, 60], 0.6);
    mullions(c, m, 0, y, S, S - y, 3, 2, 6, "#3b4045");
    c.fillStyle = "#3b4045";
    c.fillRect(0, y - 6, S, 8);
  });
  A.add("roof", (c) => {
    c.fillStyle = "#b9b6ae";
    c.fillRect(0, 0, S, S);
    speckle(c, r, 4000, 0.14, 240, 60, 2);
    c.fillStyle = "rgba(0,0,0,0.08)";
    for (let k = 0; k < 4; k++) c.fillRect(0, (k * S) / 4, S, 2);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = `rgba(60,55,50,${0.05 + r() * 0.06})`;
      c.beginPath();
      c.ellipse(r() * S, r() * S, 10 + r() * 30, 8 + r() * 20, r() * 3, 0, 7);
      c.fill();
    }
  });
  A.add("conc", (c) => {
    c.fillStyle = "#c8c5bf";
    c.fillRect(0, 0, S, S);
    speckle(c, r, 3000, 0.08, 255, 70, 2);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, 0, S, 2);
    c.fillRect(0, 0, 2, S);
    for (const [x, y] of [
      [64, 64],
      [192, 64],
      [64, 192],
      [192, 192],
    ]) {
      c.beginPath();
      c.arc(x, y, 3, 0, 7);
      c.fill();
    }
  });
  A.add("deck", (c) => {
    const DH = (mm) => px(mm, 3.6);
    c.fillStyle = "#24272a"; // opening (dark interior)
    c.fillRect(0, 0, S, S);
    c.fillStyle = "#3a3e42";
    c.fillRect(0, 0, S, DH(0.35));
    c.fillStyle = "#fff8d8"; // ceiling lights
    for (let i = 0; i < 3; i++) c.fillRect(30 + i * 85, DH(0.36), 26, 4);
    c.fillStyle = "#cfccc5"; // spandrel and slab edge
    c.fillRect(0, DH(2.5), S, DH(1.1));
    speckle(c, r, 800, 0.1, 255, 80);
    c.fillStyle = "#bdb9b1";
    c.fillRect(0, 0, S, DH(0.3));
    c.fillRect(0, 0, 18, S);
    c.fillStyle = "rgba(0,0,0,0.15)";
    c.fillRect(0, DH(2.5), S, 4);
  });
  const awn = (col) => (c) => {
    c.fillStyle = "#f7f4ec";
    c.fillRect(0, 0, S, S);
    c.fillStyle = col;
    c.fillRect(0, 0, S / 2, S);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, S - 8, S, 8);
  };
  A.add("awnR", awn("#c8323c"));
  A.add("awnG", awn("#2a7d5a"));
  A.add("awnB", awn("#2b5c9e"));
  // signs: 4 strips per layer (top strip = sign 4k)
  const signBase = A.layers.length;
  for (let k = 0; k < SIGNS.length; k += 4)
    A.add("sign" + k / 4, (c) => {
      for (let j = 0; j < 4; j++) {
        const s = SIGNS[k + j];
        if (!s) continue;
        const y = j * 64;
        c.fillStyle = s[1];
        c.fillRect(0, y, S, 64);
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.fillRect(0, y + 58, S, 6);
        c.strokeStyle = s[2];
        c.lineWidth = 3;
        c.strokeRect(5, y + 5, S - 10, 50);
        text(c, s[0], S / 2, y + 30, S - 26, 40, "900 #px Arial, Helvetica, sans-serif", s[2]);
      }
    });
  const bbBase = A.layers.length;
  BILLBOARDS.forEach((bb, i) => {
    A.add("bb" + i + "L", (c) => drawBillboard(c, bb, 0));
    A.add("bb" + i + "R", (c) => drawBillboard(c, bb, 1));
  });
  return { texture: A.build(), L: A.index, signBase, bbBase };
}

// sign k -> layer and v range (strip j of 4, from the top of the drawing)
function signUV(fa, k) {
  const layer = fa.signBase + Math.floor(k / 4),
    j = k % 4;
  return { layer, v0: 1 - (j + 1) / 4 + 0.006, v1: 1 - j / 4 - 0.006 };
}

// ---------- ground array (tile sizes in metres) ----------
const GROUND_TILE = { asphalt: 7, walk: 3, grass: 6, lot: 7, plaza: 4, conc: 4, prom: 3, sand: 6, pool: 3, curb: 2 };

function makeGroundArray() {
  const A = new ArrayBuilder(),
    r = rng(11);
  const noiseFill = (c, base, n, a, sz = 2) => {
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    speckle(c, r, n, a, 255, 0, sz);
  };
  A.add("asphalt", (c) => {
    noiseFill(c, "#46484b", 9000, 0.16, 2);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = `rgba(30,30,32,${0.08 + r() * 0.08})`;
      c.beginPath();
      c.ellipse(r() * S, r() * S, 20 + r() * 40, 10 + r() * 30, r() * 3, 0, 7);
      c.fill();
    }
    c.strokeStyle = "rgba(20,20,22,0.45)";
    c.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      let x = r() * S,
        y = r() * S;
      c.moveTo(x, y);
      for (let k = 0; k < 8; k++) c.lineTo((x += (r() - 0.5) * 30), (y += (r() - 0.5) * 30));
      c.stroke();
    }
  });
  A.add("walk", (c) => {
    noiseFill(c, "#cbc6bc", 5000, 0.08);
    c.fillStyle = "rgba(70,65,58,0.35)";
    for (let k = 0; k <= 2; k++) {
      c.fillRect((k * S) / 2 - 1, 0, 2, S);
      c.fillRect(0, (k * S) / 2 - 1, S, 2);
    }
    for (let i = 0; i < 4; i++) {
      c.fillStyle = `rgba(80,70,60,${0.04 + r() * 0.05})`;
      c.fillRect(Math.floor(r() * 2) * 128, Math.floor(r() * 2) * 128, 128, 128);
    }
  });
  A.add("grass", (c) => {
    noiseFill(c, "#5f7f35", 0, 0);
    for (let i = 0; i < 9000; i++) {
      const g = 90 + r() * 70;
      c.fillStyle = `rgba(${g * 0.55},${g},${g * 0.3},0.5)`;
      c.fillRect(r() * S, r() * S, 1, 2 + r() * 3);
    }
    for (let i = 0; i < 8; i++) {
      c.fillStyle = `rgba(150,140,70,${0.08 + r() * 0.08})`;
      c.beginPath();
      c.ellipse(r() * S, r() * S, 15 + r() * 30, 10 + r() * 20, r() * 3, 0, 7);
      c.fill();
    }
  });
  A.add("lot", (c) => {
    noiseFill(c, "#5a5b5c", 8000, 0.14);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = `rgba(25,25,25,${0.1 + r() * 0.15})`;
      c.beginPath();
      c.ellipse(r() * S, r() * S, 5 + r() * 12, 4 + r() * 9, r() * 3, 0, 7);
      c.fill();
    }
  });
  A.add("plaza", (c) => {
    noiseFill(c, "#d8c7a8", 3000, 0.08);
    c.fillStyle = "rgba(120,95,70,0.35)";
    for (let k = 0; k <= 8; k++) {
      c.fillRect((k * S) / 8 - 1, 0, 2, S);
      c.fillRect(0, (k * S) / 8 - 1, S, 2);
    }
    c.fillStyle = "rgba(170,110,80,0.25)";
    for (let k = 0; k < 8; k++) for (let j = 0; j < 8; j++) if ((k + j) % 4 === 0) c.fillRect(k * 32 + 1, j * 32 + 1, 30, 30);
  });
  A.add("conc", (c) => {
    noiseFill(c, "#c3c0b9", 6000, 0.09);
    c.fillStyle = "rgba(60,60,60,0.3)";
    c.fillRect(0, 0, S, 2);
    c.fillRect(0, 0, 2, S);
  });
  A.add("prom", (c) => {
    noiseFill(c, "#d9b48f", 2500, 0.08);
    c.fillStyle = "rgba(110,70,45,0.35)";
    // herringbone-ish brick pattern
    for (let y = 0; y < S; y += 16)
      for (let x = (y / 16) % 2 ? -16 : 0; x < S; x += 32) {
        c.fillRect(x, y, 32, 1.5);
        c.fillRect(x, y, 1.5, 16);
      }
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(190,120,80,${0.15 * r()})`;
      c.fillRect(Math.floor(r() * 8) * 32, Math.floor(r() * 16) * 16, 32, 16);
    }
  });
  A.add("sand", (c) => {
    noiseFill(c, "#e3cfa4", 9000, 0.12, 1.5);
  });
  A.add("pool", (c) => {
    c.fillStyle = "#3fb8d6";
    c.fillRect(0, 0, S, S);
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      c.ellipse(r() * S, r() * S, 10 + r() * 24, 6 + r() * 14, r() * 3, 0, 4 + r() * 2);
      c.stroke();
    }
    c.fillStyle = "rgba(20,90,140,0.25)";
    c.fillRect(0, 0, S, 3);
  });
  A.add("curb", (c) => {
    noiseFill(c, "#d4d1ca", 3000, 0.1);
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(0, 0, 2, S);
  });
  return { texture: A.build(), L: A.index };
}

// palm frond: midrib along u, leaflets fanning out, alpha-tested
function makeFrondTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const x = c.getContext("2d"),
    r = rng(3);
  x.clearRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) {
    const t = i / 70,
      u = 6 + t * 244,
      len = (1 - Math.pow(Math.abs(t - 0.35) / 0.65, 2)) * 28 + 4,
      g = 70 + r() * 50;
    x.strokeStyle = `rgb(${g * 0.55 + t * 40},${g + 30},${g * 0.35})`;
    x.lineWidth = 2.2;
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(u, 32);
      x.quadraticCurveTo(u + 6, 32 + s * len * 0.5, u + 12, 32 + s * len);
      x.stroke();
    }
  }
  x.strokeStyle = "#5d6b2f";
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(0, 32);
  x.lineTo(256, 32);
  x.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export { BILLBOARDS, GROUND_TILE, MODULES, SIGNS, SIGN_ID, makeFacadeArray, makeFrondTexture, makeGroundArray, rng, signUV };
