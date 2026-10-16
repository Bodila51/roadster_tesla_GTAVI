import {
  CanvasTexture,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
} from "three";

let ke = null;
function brushedTexture() {
  if (typeof document > "u") return null;
  const a = document.createElement("canvas");
  (a.width = 512), (a.height = 512);
  const e = a.getContext("2d");
  (e.fillStyle = "rgb(214,214,214)"), e.fillRect(0, 0, 512, 512);
  for (let t = 0; t < 3200; t++) {
    const i = Math.random() * 512,
      o = 175 + Math.random() * 80;
    (e.strokeStyle = `rgba(${o},${o},${o},${0.12 + Math.random() * 0.25})`),
      (e.lineWidth = 0.4 + Math.random() * 0.9),
      e.beginPath(),
      e.moveTo(0, i),
      e.lineTo(512, i),
      e.stroke();
  }
  const s = new CanvasTexture(a);
  return (
    (s.wrapS = s.wrapT = RepeatWrapping),
    s.repeat.set(1, 2.5),
    (s.anisotropy = 8),
    s
  );
}
function vehicleMaterials() {
  if (ke) return ke;
  const a = brushedTexture(),
    e = (t, i = {}) =>
      new MeshPhysicalMaterial({
        color: t,
        metalness: 0.5,
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        ...i,
      }),
    s = (t, i) =>
      new MeshStandardMaterial({
        color: 1118481,
        emissive: t,
        emissiveIntensity: i,
        roughness: 0.25,
        metalness: 0,
      });
  return (
    (ke = {
      blue: e(731758, {
        metalness: 0.6,
        roughness: 0.32,
      }),
      black: e(328966, {
        metalness: 0.15,
        roughness: 0.3,
        clearcoatRoughness: 0.02,
      }),
      white: e(15856110, {
        metalness: 0,
        roughness: 0.32,
        clearcoatRoughness: 0.04,
      }),
      gold: e(13214826, {
        metalness: 0.95,
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
      }),
      steel: new MeshPhysicalMaterial({
        color: 13225168,
        metalness: 1,
        roughness: 0.35,
        roughnessMap: a,
        envMapIntensity: 1.1,
      }),
      tonneau: new MeshPhysicalMaterial({
        color: 2303015,
        metalness: 0.5,
        roughness: 0.45,
        clearcoat: 0.3,
      }),
      glass: new MeshPhysicalMaterial({
        color: 65795,
        metalness: 0.6,
        roughness: 0.05,
        envMapIntensity: 0.75,
      }),
      trim: new MeshPhysicalMaterial({
        color: 657931,
        metalness: 0.3,
        roughness: 0.22,
        clearcoat: 0.7,
      }),
      plastic: new MeshStandardMaterial({
        color: 1250069,
        metalness: 0,
        roughness: 0.78,
      }),
      under: new MeshStandardMaterial({
        color: 723724,
        metalness: 0,
        roughness: 0.92,
      }),
      well: new MeshStandardMaterial({
        color: 263172,
        metalness: 0,
        roughness: 1,
        side: DoubleSide,
      }),
      seam: new MeshStandardMaterial({
        color: 197379,
        metalness: 0,
        roughness: 0.7,
      }),
      frame: new MeshStandardMaterial({
        color: 1842464,
        metalness: 0.55,
        roughness: 0.5,
      }),
      tire: new MeshPhysicalMaterial({
        color: 1710620,
        metalness: 0,
        roughness: 0.82,
        sheen: 0.3,
        sheenRoughness: 0.8,
        sheenColor: 3355443,
      }),
      rimDark: new MeshPhysicalMaterial({
        color: 3882563,
        metalness: 0.9,
        roughness: 0.32,
        clearcoat: 0.6,
      }),
      rimGrey: new MeshPhysicalMaterial({
        color: 8225159,
        metalness: 1,
        roughness: 0.28,
        clearcoat: 0.5,
      }),
      rimPolished: new MeshPhysicalMaterial({
        color: 14211804,
        metalness: 1,
        roughness: 0.12,
      }),
      rimCover: new MeshPhysicalMaterial({
        color: 12564909,
        metalness: 0.9,
        roughness: 0.25,
        clearcoat: 0.6,
      }),
      rimAero: new MeshPhysicalMaterial({
        color: 2763824,
        metalness: 0.4,
        roughness: 0.45,
        clearcoat: 0.4,
      }),
      rimInner: new MeshStandardMaterial({
        color: 2763566,
        metalness: 0.8,
        roughness: 0.45,
        side: DoubleSide,
      }),
      brake: new MeshStandardMaterial({
        color: 5921888,
        metalness: 0.9,
        roughness: 0.45,
      }),
      caliper: new MeshStandardMaterial({
        color: 1710620,
        metalness: 0.4,
        roughness: 0.5,
      }),
      lens: new MeshPhysicalMaterial({
        color: 1704452,
        metalness: 0.2,
        roughness: 0.08,
        clearcoat: 1,
      }),
      lightW: s(16777215, 6),
      lightW2: s(14674175, 3),
      lightR: s(16716294, 5.5),
      lightA: s(16747024, 6),
      platform: new MeshPhysicalMaterial({
        color: 657932,
        metalness: 0.25,
        roughness: 0.45,
        clearcoat: 0.4,
      }),
      led: s(16718346, 6),
    }),
    ke
  );
}

export { vehicleMaterials };
