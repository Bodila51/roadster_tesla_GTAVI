import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Quaternion,
  Vector3,
} from "three";

function xi() {
  const a = [],
    e = (s, t, i, o, n = 0.025) => {
      const c = new Vector3(s, t, 0),
        r = new Vector3(i, o, 0),
        l = new CylinderGeometry(n, n, c.distanceTo(r), 6),
        d = r.clone().sub(c).normalize();
      l.applyQuaternion(
        new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d),
      ),
        l.translate((s + i) / 2, (t + o) / 2, 0),
        a.push(l);
    };
  e(-1.2, 0.15, -1.2, 1.1),
    e(1.2, 0.15, 1.2, 1.1),
    e(-1.2, 1.1, 1.2, 1.1),
    e(-1.2, 0.2, 1.2, 0.2);
  for (let s = -1; s <= 1.01; s += 0.2) e(s, 0.2, s, 1.1, 0.01);
  return e(-1.2, 0.15, -1.45, 0, 0.02), e(1.2, 0.15, 1.45, 0, 0.02), yi(a);
}
function yi(a) {
  let e = 0;
  for (const o of a) e += o.index ? o.index.count : o.attributes.position.count;
  const s = [],
    t = [];
  for (const o of a) {
    const n = o.index ? o.toNonIndexed() : o;
    s.push(...n.attributes.position.array),
      t.push(...n.attributes.normal.array);
  }
  const i = new BufferGeometry();
  return (
    i.setAttribute("position", new Float32BufferAttribute(s, 3)),
    i.setAttribute("normal", new Float32BufferAttribute(t, 3)),
    i
  );
}

export { xi };
