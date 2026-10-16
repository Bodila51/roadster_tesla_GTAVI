import { BufferAttribute, BufferGeometry, Matrix3, Vector3 } from "three";

// Growable indexed geometry with position, normal and any number of extra float attributes.
class Geo {
  constructor(attrs) {
    this.attrs = attrs; // { name: itemSize }
    this.p = [];
    this.n = [];
    this.a = {};
    for (const k in attrs) this.a[k] = [];
    this.i = [];
    this.vc = 0;
  }
  vert(x, y, z, nx, ny, nz, vals) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    for (const k in this.attrs) {
      const v = vals[k],
        arr = this.a[k];
      for (let j = 0; j < this.attrs[k]; j++) arr.push(v[j]);
    }
    return this.vc++;
  }
  tri(a, b, c) {
    this.i.push(a, b, c);
  }
  quadIdx(a, b, c, d) {
    this.i.push(a, b, c, a, c, d);
  }
  get triangles() {
    return this.i.length / 3;
  }
  build() {
    if (!this.vc) return null;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.n), 3));
    for (const k in this.attrs) g.setAttribute(k, new BufferAttribute(new Float32Array(this.a[k]), this.attrs[k]));
    g.setIndex(this.vc > 65535 ? new BufferAttribute(new Uint32Array(this.i), 1) : new BufferAttribute(new Uint16Array(this.i), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---- facade geometry (attributes aF = u, v, layer and aTint) ----
const WHITE = [1, 1, 1];
// vertical wall quad from (ax, az) to (bx, bz) seen from outside (b is to the right), y0..y1
function wall(g, ax, az, bx, bz, y0, y1, layer, u0, u1, v0, v1, tint = WHITE) {
  const dx = bx - ax,
    dz = bz - az,
    len = Math.hypot(dx, dz) || 1,
    nx = -dz / len,
    nz = dx / len;
  const a = g.vert(ax, y0, az, nx, 0, nz, { aF: [u0, v0, layer], aTint: tint }),
    b = g.vert(bx, y0, bz, nx, 0, nz, { aF: [u1, v0, layer], aTint: tint }),
    c = g.vert(bx, y1, bz, nx, 0, nz, { aF: [u1, v1, layer], aTint: tint }),
    d = g.vert(ax, y1, az, nx, 0, nz, { aF: [u0, v1, layer], aTint: tint });
  g.quadIdx(a, b, c, d);
}
// horizontal quad facing up (or down), UVs from world x/z divided by tile (or explicit)
function flat(g, x0, z0, x1, z1, y, layer, tile, tint = WHITE, down = false, uv = null) {
  const U = (x) => x / tile,
    V = (z) => -z / tile;
  const ny = down ? -1 : 1;
  const q = [
    [x0, z0],
    [x0, z1],
    [x1, z1],
    [x1, z0],
  ];
  const ids = q.map(([x, z], k) =>
    g.vert(x, y, z, 0, ny, 0, {
      aF: uv ? [uv[k][0], uv[k][1], layer] : [U(x), V(z), layer],
      aTint: tint,
    }),
  );
  down ? g.quadIdx(ids[0], ids[3], ids[2], ids[1]) : g.quadIdx(ids[0], ids[1], ids[2], ids[3]);
}
// closed box with one layer on the sides (tiled by module size) and one on top
function fbox(g, x0, x1, y0, y1, z0, z1, side, top, mw = 4, mh = 4, tint = WHITE, bottom = false) {
  const h = (y1 - y0) / mh,
    lx = (x1 - x0) / mw,
    lz = (z1 - z0) / mw;
  wall(g, x0, z1, x1, z1, y0, y1, side, 0, lx, 0, h, tint);
  wall(g, x1, z0, x0, z0, y0, y1, side, 0, lx, 0, h, tint);
  wall(g, x1, z1, x1, z0, y0, y1, side, 0, lz, 0, h, tint);
  wall(g, x0, z0, x0, z1, y0, y1, side, 0, lz, 0, h, tint);
  if (top != null) flat(g, x0, z0, x1, z1, y1, top, mw, tint);
  if (bottom) flat(g, x0, z0, x1, z1, y0, side, mw, tint, true);
}

// ---- prop templates (attributes color and aPM) ----
// Take any three.js geometry, give it a flat colour and material params, keep it as a template.
function tpl(geo, color, rough = 0.6, metal = 0.1, sig = 0) {
  const g = geo.index ? geo : geo.toNonIndexed();
  const n = g.attributes.position.count,
    col = new Float32Array(n * 3),
    pm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(color, i * 3), pm.set([rough, metal, sig], i * 3);
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setAttribute("aPM", new BufferAttribute(pm, 3));
  g.deleteAttribute("uv");
  return g;
}
// merge templates into one template (already transformed)
function tplMerge(list) {
  const out = new Geo({ color: 3, aPM: 3 });
  for (const t of list) stamp(out, t, null);
  return out.build();
}
const _v = new Vector3(),
  _n = new Vector3(),
  _m3 = new Matrix3();
// append a template into a props Geo with a Matrix4 (null = identity)
function stamp(g, t, m, tint = null) {
  const P = t.attributes.position,
    N = t.attributes.normal,
    C = t.attributes.color,
    M = t.attributes.aPM,
    base = g.vc;
  if (m) _m3.getNormalMatrix(m);
  for (let i = 0; i < P.count; i++) {
    _v.fromBufferAttribute(P, i);
    _n.fromBufferAttribute(N, i);
    if (m) _v.applyMatrix4(m), _n.applyMatrix3(_m3).normalize();
    g.p.push(_v.x, _v.y, _v.z);
    g.n.push(_n.x, _n.y, _n.z);
    const c = g.a.color;
    tint ? c.push(C.getX(i) * tint[0], C.getY(i) * tint[1], C.getZ(i) * tint[2]) : c.push(C.getX(i), C.getY(i), C.getZ(i));
    g.a.aPM.push(M.getX(i), M.getY(i), M.getZ(i));
    g.vc++;
  }
  if (t.index) {
    const I = t.index.array;
    for (let i = 0; i < I.length; i++) g.i.push(base + I[i]);
  } else for (let i = 0; i < P.count; i++) g.i.push(base + i);
}

export { Geo, WHITE, fbox, flat, stamp, tpl, tplMerge, wall };
