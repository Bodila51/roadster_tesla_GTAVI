import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

const Vec3 = Vector3,
  PI = Math.PI,
  clamp = (a, e, s) => Math.max(e, Math.min(s, a)),
  lerp = (a, e, s) => a + (e - a) * s;
function mergeGeometries(a) {
  const e = [],
    s = [],
    t = [],
    i = [];
  let o = 0;
  for (const c of a) {
    const r = c.index
      ? c
      : c.clone().setIndex([...Array(c.attributes.position.count).keys()]);
    r.attributes.normal || r.computeVertexNormals();
    const l = r.attributes.position,
      d = r.attributes.normal,
      f = r.attributes.uv;
    for (let w = 0; w < l.count; w++)
      e.push(l.getX(w), l.getY(w), l.getZ(w)),
        s.push(d.getX(w), d.getY(w), d.getZ(w)),
        t.push(f ? f.getX(w) : 0, f ? f.getY(w) : 0);
    const p = r.index.array;
    for (let w = 0; w < p.length; w++) i.push(p[w] + o);
    o += l.count;
  }
  const n = new BufferGeometry();
  return (
    n.setAttribute("position", new Float32BufferAttribute(e, 3)),
    n.setAttribute("normal", new Float32BufferAttribute(s, 3)),
    n.setAttribute("uv", new Float32BufferAttribute(t, 2)),
    n.setIndex(i),
    n
  );
}

export { PI, Vec3, clamp, lerp, mergeGeometries };
