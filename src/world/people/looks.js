// Random outfits and bodies. Colours are sRGB hex; the shader linearises them.
const SKIN = [0xf3d6bf, 0xeac0a0, 0xdfab86, 0xcf9670, 0xbd7f58, 0xa36844, 0x87532f, 0x6a3f24, 0x4e2e1b];
const HAIR = [0x16110d, 0x2a1d14, 0x3d281a, 0x5b3b23, 0x7d5636, 0xb08a58, 0xd2b47a, 0x8e3b1d, 0x9c9894, 0xe4dccb];
const TOPS = [0xf4f3ee, 0xf4f3ee, 0x1c1c20, 0x22314f, 0x3f5f8c, 0x8fbbe2, 0xc8382f, 0xf27c5c, 0xf2c744, 0x8fd4b5, 0x6b7044,
  0xc9b48a, 0x8d9094, 0xf2a6bd, 0xea8a3c, 0x2a8a8a, 0x6c4f9c, 0x3b7d4a, 0xe8e0cf];
const BOTTOMS = [0x2f4a72, 0x2f4a72, 0x24334f, 0x1f1f23, 0xb9a47c, 0x6d7075, 0xe9e6de, 0x5d6241, 0x3a3e45, 0x8a6a4a];
const SHORTS = [0x2f4a72, 0xb9a47c, 0x22314f, 0x6d7075, 0xe9e6de, 0x5d6241, 0x3d6f99, 0x1f1f23];
const SWIM = [0xd8302e, 0x1f5fae, 0x0f8f8a, 0xf2c13a, 0x1b1b1f, 0xf06a8c, 0xff8a3d, 0x7a3f9e, 0x2fb37a, 0xf4f3ee];
const SHOES = [0xf2f1ec, 0xf2f1ec, 0x1d1d1f, 0x5b3e2b, 0x8a8a8c, 0xc8382f, 0x2f5fa8, 0xd9c7a5];
const CAPS = [0x22314f, 0xc8382f, 0xf2f1ec, 0x1d1d1f, 0xcdb88e, 0x2f6f4a, 0xea8a3c];
const STRAW = [0xd9c38f, 0xe5d3a6, 0xf2efe6, 0xc9a96e];

const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

// seeded random, so the town looks the same every visit
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const packShape = (fem, kid, girth) =>
  Math.round(fem * 255) + Math.round(kid * 255) * 256 + Math.round(((Math.max(-0.5, Math.min(1, girth)) + 0.5) / 1.5) * 255) * 65536;

// style: "town" | "beach" | "fan" | "promenade"; who: "m" | "f" | "k" | undefined (random)
function makeLook(r, style = "town", who) {
  const kid = who ? who === "k" : r() < (style === "beach" || style === "promenade" ? 0.17 : 0.1);
  const fem = who === "f" || (who !== "m" && r() < 0.5);
  const kidW = kid ? 0.55 + r() * 0.45 : 0;
  const femW = fem ? 0.88 + r() * 0.12 : r() * 0.1;
  const girth = kid ? (r() - 0.5) * 0.5 : -0.35 + r() * r() * 1.3;
  const scale = kid ? 0.88 + r() * 0.2 : 0.94 + r() * 0.12;
  const skin = pick(r, SKIN);
  let hairC = pick(r, HAIR);
  if (!kid && r() < 0.12) hairC = 0x9c9894;
  let top = 2, bottom = 3, skirt = 0, bare = 0, hair = 0, head = 0, phone = 0, shades = 0, bikini = 0;
  let topC = pick(r, TOPS), botC = pick(r, BOTTOMS), shoe = pick(r, SHOES), hatC = pick(r, CAPS);
  const swim = style === "beach" && r() < 0.8;
  if (swim) {
    bare = 1;
    if (fem) {
      const one = r() < 0.35;
      top = one ? 1 : 0;
      bikini = one ? 0 : 1;
      bottom = 0;
      topC = botC = pick(r, SWIM);
    } else {
      top = r() < 0.15 ? 1 : 0;
      bottom = r() < 0.6 ? 1 : 2;
      botC = pick(r, SWIM);
      topC = pick(r, TOPS);
    }
    shades = r() < 0.4 ? 1 : 0;
    if (r() < 0.3) {
      head = fem ? 2 : 1;
      hatC = head === 2 ? pick(r, STRAW) : pick(r, CAPS);
    }
  } else {
    const warm = style !== "fan" || r() < 0.7;
    top = r() < 0.12 ? 3 : fem && r() < 0.2 ? 1 : 2;
    if (warm && r() < (style === "promenade" ? 0.55 : 0.4)) {
      bottom = r() < 0.6 ? 1 : 2;
      botC = pick(r, SHORTS);
    } else bottom = 3;
    if (fem && !kid && r() < 0.22) {
      skirt = 1;
      bottom = 1;
      botC = pick(r, r() < 0.5 ? SWIM : TOPS);
    }
    const capP = style === "fan" ? 0.4 : 0.18;
    const hr = r();
    if (hr < capP) head = 1;
    else if (hr < capP + (style === "promenade" ? 0.08 : 0.03)) {
      head = 2;
      hatC = pick(r, STRAW);
    } else if (hr < capP + 0.05 && style === "town") head = 3;
    shades = r() < (style === "promenade" ? 0.35 : 0.2) ? 1 : 0;
    if (style === "promenade" && r() < 0.15) bare = 0;
  }
  if (fem) {
    const h = r();
    hair = h < 0.55 ? 1 : h < 0.8 ? 3 : 0;
  } else hair = r() < (kid ? 0.04 : 0.1) ? 2 : r() < 0.05 ? 1 : 0;
  const phoneP = { town: 0.28, fan: 0.5, promenade: 0.25, beach: 0.08 }[style] ?? 0.2;
  phone = !kid || r() < 0.3 ? (r() < phoneP ? 1 : 0) : 0;
  const flags = top | (bottom << 2) | (skirt << 4) | (bare << 5) | (hair << 6) | (head << 8) | (phone << 10) | (shades << 11) | (bikini << 12);
  return {
    col: [topC, botC, skin, hairC],
    hat: hatC,
    shoe,
    flags,
    shape: packShape(femW, kidW, girth),
    scale,
    phone: !!phone,
    kid,
    fem,
  };
}

export { makeLook, rng };
