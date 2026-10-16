import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";

function createCarMaterials() {
  return {
    paint: new MeshPhysicalMaterial({
      color: 14605528,
      metalness: 0.08,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      sheen: 0.35,
      sheenColor: new Color(16777215),
      sheenRoughness: 0.5,
      envMapIntensity: 1.1,
    }),
    trim: new MeshPhysicalMaterial({
      color: 723982,
      metalness: 0.2,
      roughness: 0.5,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
    }),
    gloss: new MeshPhysicalMaterial({
      color: 263173,
      metalness: 0.3,
      roughness: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    }),
    liner: new MeshStandardMaterial({
      color: 460553,
      roughness: 0.92,
      metalness: 0,
    }),
    glass: new MeshPhysicalMaterial({
      color: 8016948,
      metalness: 0.92,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0,
      envMapIntensity: 1.5,
      iridescence: 0.12,
      iridescenceIOR: 1.5,
    }),
    sideGlass: new MeshPhysicalMaterial({
      color: 6965808,
      metalness: 0.9,
      roughness: 0.05,
      clearcoat: 1,
      envMapIntensity: 1.5,
    }),
    chrome: new MeshPhysicalMaterial({
      color: 14211288,
      metalness: 1,
      roughness: 0.12,
    }),
    tail: new MeshStandardMaterial({
      color: 3145728,
      emissive: 16715808,
      emissiveIntensity: 7,
      roughness: 0.3,
    }),
    tailDim: new MeshStandardMaterial({
      color: 2097152,
      emissive: 16714260,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    }),
    head: new MeshStandardMaterial({
      color: 16777215,
      emissive: 15397631,
      emissiveIntensity: 9,
      roughness: 0.2,
    }),
    lamp: new MeshStandardMaterial({
      color: 16777215,
      emissive: 14674431,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      side: DoubleSide,
    }),
    amber: new MeshStandardMaterial({
      color: 4202496,
      emissive: 16747034,
      emissiveIntensity: 4,
      roughness: 0.3,
    }),
    nozzle: new MeshStandardMaterial({
      color: 13813428,
      metalness: 1,
      roughness: 0.18,
    }),
    nozzleGlow: new MeshStandardMaterial({
      color: 788486,
      emissive: 16742954,
      emissiveIntensity: 0,
      roughness: 0.6,
    }),
    tire: new MeshStandardMaterial({
      color: 1118483,
      roughness: 0.85,
      metalness: 0,
    }),
    rimDark: new MeshPhysicalMaterial({
      color: 1842464,
      metalness: 0.8,
      roughness: 0.32,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
    rimInsert: new MeshPhysicalMaterial({
      color: 15132388,
      metalness: 0.1,
      roughness: 0.45,
      clearcoat: 0.6,
    }),
    rimSilver: new MeshPhysicalMaterial({
      color: 12172480,
      metalness: 1,
      roughness: 0.22,
    }),
    gold: new MeshPhysicalMaterial({
      color: 13145434,
      metalness: 1,
      roughness: 0.3,
    }),
    plate: makePlateTexture(),
    under: new MeshStandardMaterial({
      map: makeUnderbodyTexture(),
      roughness: 0.75,
      metalness: 0.3,
      color: 10133672,
    }),
    seam: new MeshStandardMaterial({
      color: 1710620,
      roughness: 0.8,
    }),
  };
}
function makePlateTexture() {
  const n = document.createElement("canvas");
  (n.width = 512), (n.height = 256);
  const e = n.getContext("2d");
  (e.fillStyle = "#808080"),
    e.fillRect(0, 0, 512, 256),
    (e.strokeStyle = "#a0a0a0"),
    (e.lineWidth = 10),
    e.strokeRect(10, 10, 492, 236),
    (e.fillStyle = "#ffffff"),
    (e.font = '600 150px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'),
    (e.textAlign = "center"),
    (e.textBaseline = "middle"),
    (e.filter = "blur(2px)"),
    e.fillText("RDSTR", 256, 136);
  const t = new CanvasTexture(n);
  return new MeshPhysicalMaterial({
    color: 14473942,
    roughness: 0.45,
    clearcoat: 0.4,
    bumpMap: t,
    bumpScale: 2.5,
  });
}
function makeUnderbodyTexture() {
  const n = document.createElement("canvas");
  (n.width = 512), (n.height = 1024);
  const e = n.getContext("2d");
  (e.fillStyle = "#3a3d42"),
    e.fillRect(0, 0, 512, 1024),
    (e.strokeStyle = "#15171a"),
    (e.lineWidth = 10);
  for (let i = 0; i <= 512; i += 128)
    e.beginPath(), e.moveTo(i, 0), e.lineTo(i, 1024), e.stroke();
  for (let i = 0; i <= 1024; i += 146)
    e.beginPath(), e.moveTo(0, i), e.lineTo(512, i), e.stroke();
  e.fillStyle = "#5a5e64";
  for (let i = 64; i < 512; i += 128)
    for (let s = 73; s < 1024; s += 146)
      e.beginPath(), e.arc(i, s, 7, 0, Math.PI * 2), e.fill();
  const t = new CanvasTexture(n);
  return (t.colorSpace = SRGBColorSpace), t;
}

export { createCarMaterials };
