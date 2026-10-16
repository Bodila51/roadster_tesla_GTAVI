import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";

function buildStruts(a, e, s) {
  if (!e.length) return;
  const t = new CylinderGeometry(1, 1, 1, 8),
    i = new InstancedMesh(t, s, e.length),
    o = new Matrix4(),
    n = new Quaternion(),
    c = new Vector3(0, 1, 0);
  e.forEach(([r, l, d], f) => {
    const p = new Vector3().subVectors(l, r),
      w = p.length();
    n.setFromUnitVectors(c, p.normalize()),
      o.compose(
        new Vector3().addVectors(r, l).multiplyScalar(0.5),
        n,
        new Vector3(d, w, d),
      ),
      i.setMatrixAt(f, o);
  }),
    (i.castShadow = !0),
    (i.receiveShadow = !0),
    a.add(i);
}
function footprintToBox(a, e, s, t, i, o) {
  const n = [];
  for (const l of [-0.5, 0.5])
    for (const d of [-0.5, 0.5])
      n.push(
        a
          .clone()
          .addScaledVector(e, l * t)
          .addScaledVector(s, d * i),
      );
  const c = new Vector3(1 / 0, 0, 1 / 0),
    r = new Vector3(-1 / 0, o, -1 / 0);
  for (const l of n)
    (c.x = Math.min(c.x, l.x)),
      (c.z = Math.min(c.z, l.z)),
      (r.x = Math.max(r.x, l.x)),
      (r.z = Math.max(r.z, l.z));
  return {
    min: c,
    max: r,
    name: "structure",
  };
}
// Gantry sign for daylight: a dark LED panel with bright lettering (reads in sun, no neon halo)
function makeNeonSign(a, e) {
  const s = document.createElement("canvas");
  (s.width = 1024), (s.height = 160);
  const t = s.getContext("2d");
  (t.fillStyle = "#16181b"),
    t.beginPath(),
    t.roundRect ? t.roundRect(4, 6, 1016, 148, 14) : t.rect(4, 6, 1016, 148),
    t.fill(),
    (t.strokeStyle = "#3a3d42"),
    (t.lineWidth = 5),
    t.stroke(),
    (t.font = 'italic 400 96px Michroma, "Arial Black", sans-serif'),
    (t.textAlign = "center"),
    (t.textBaseline = "middle"),
    (t.shadowColor = e),
    (t.shadowBlur = 10),
    (t.fillStyle = e),
    t.fillText(a, 512, 84),
    (t.shadowBlur = 0),
    (t.globalAlpha = 0.35),
    (t.fillStyle = "#ffffff"),
    t.fillText(a, 512, 84);
  const i = new CanvasTexture(s);
  return (
    (i.colorSpace = SRGBColorSpace),
    (i.anisotropy = 4),
    new Mesh(
      new PlaneGeometry(9, 1.4),
      new MeshBasicMaterial({
        map: i,
        alphaTest: 0.5,
        color: new Color(1.35, 1.35, 1.35),
        side: DoubleSide,
      }),
    )
  );
}
function makeStripeTexture() {
  const a = document.createElement("canvas");
  (a.width = 256), (a.height = 256);
  const e = a.getContext("2d");
  (e.fillStyle = "#ffffff"),
    e.fillRect(0, 0, 256, 256),
    (e.fillStyle = "#d9d7d2");
  for (let t = 0; t < 256; t += 64) e.fillRect(0, t, 256, 3);
  (e.fillStyle = "#ff2a3c"), e.fillRect(124, 0, 8, 128);
  const s = new CanvasTexture(a);
  return (
    (s.wrapS = s.wrapT = RepeatWrapping), (s.colorSpace = SRGBColorSpace), s
  );
}

export { buildStruts, footprintToBox, makeNeonSign, makeStripeTexture };
