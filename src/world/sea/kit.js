import {
  BufferGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";

// Small geometry builder for the props: quads, boxes, cylinders and rings with an atlas uv rect,
// a vertex colour and a tint mask (1 = takes the per-instance colour), merged into one geometry.
const _a = new Vector3(),
  _b = new Vector3();

class Kit {
  constructor() {
    (this.pos = []), (this.nor = []), (this.uv = []), (this.col = []), (this.tint = []), (this.idx = []);
  }
  // planar quad, corners counter-clockwise seen from the front; uv = [u0, v0, u1, v1]
  quad(a, b, c, d, uv, col, tint = 0) {
    const i = this.pos.length / 3,
      n = _a.subVectors(b, a).cross(_b.subVectors(d, a)).normalize();
    for (const [p, u, v] of [
      [a, uv[0], uv[1]],
      [b, uv[2], uv[1]],
      [c, uv[2], uv[3]],
      [d, uv[0], uv[3]],
    ])
      this.pos.push(p.x, p.y, p.z), this.nor.push(n.x, n.y, n.z), this.uv.push(u, v), this.col.push(col[0], col[1], col[2]), this.tint.push(tint);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }
  tri(a, b, c, uv, col, tint = 0) {
    const i = this.pos.length / 3,
      n = _a.subVectors(b, a).cross(_b.subVectors(c, a)).normalize();
    for (const [p, u, v] of [
      [a, uv[0], uv[1]],
      [b, uv[2], uv[1]],
      [c, (uv[0] + uv[2]) / 2, uv[3]],
    ])
      this.pos.push(p.x, p.y, p.z), this.nor.push(n.x, n.y, n.z), this.uv.push(u, v), this.col.push(col[0], col[1], col[2]), this.tint.push(tint);
    this.idx.push(i, i + 1, i + 2);
    return this;
  }
  // box of size sx, sy, sz centred on the origin of matrix m; faces: optional per-face uv
  // overrides { px, nx, py, ny, pz, nz }, or false to drop a face
  box(sx, sy, sz, m, uv, col, tint = 0, faces = null) {
    const x = sx / 2,
      y = sy / 2,
      z = sz / 2,
      P = (px, py, pz) => new Vector3(px, py, pz).applyMatrix4(m),
      c = [P(-x, -y, -z), P(x, -y, -z), P(x, y, -z), P(-x, y, -z), P(-x, -y, z), P(x, -y, z), P(x, y, z), P(-x, y, z)],
      F = (k) => (faces && k in faces ? faces[k] : uv);
    const q = (k, a, b, cc, d) => {
      const u = F(k);
      u && this.quad(c[a], c[b], c[cc], c[d], u, col, tint);
    };
    q("pz", 4, 5, 6, 7), q("nz", 1, 0, 3, 2), q("px", 5, 1, 2, 6), q("nx", 0, 4, 7, 3), q("py", 7, 6, 2, 3), q("ny", 0, 1, 5, 4);
    return this;
  }
  // cylinder along local +y from 0 to h (radius r0 at the bottom, r1 at the top), faceted
  cyl(r0, r1, h, seg, m, uv, col, tint = 0, caps = !0, phase = 0) {
    const P = (r, a, y) => new Vector3(r * Math.sin(a), y, r * Math.cos(a)).applyMatrix4(m),
      top = new Vector3(0, h, 0).applyMatrix4(m);
    for (let i = 0; i < seg; i++) {
      const a0 = phase + (i / seg) * Math.PI * 2,
        a1 = phase + ((i + 1) / seg) * Math.PI * 2;
      this.quad(P(r0, a0, 0), P(r0, a1, 0), P(r1, a1, h), P(r1, a0, h), uv, col, tint);
      caps && r1 > 0 && this.tri(P(r1, a0, h), P(r1, a1, h), top, uv, col, tint);
    }
    return this;
  }
  // box from point a to point b (a beam), cross-section w x d; up hints the cross-section orientation
  beam(a, b, w, d, uv, col, tint = 0, up = Y) {
    const dir = new Vector3().subVectors(b, a),
      len = dir.length();
    dir.divideScalar(len);
    const side = new Vector3().crossVectors(Math.abs(dir.dot(up)) > 0.99 ? X : up, dir).normalize(),
      u = new Vector3().crossVectors(dir, side),
      m = new Matrix4().makeBasis(side, u, dir).setPosition(new Vector3().addVectors(a, b).multiplyScalar(0.5));
    return this.box(w, d, len, m, uv, col, tint);
  }
  get count() {
    return this.pos.length / 3;
  }
  build() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3)),
      g.setAttribute("normal", new Float32BufferAttribute(this.nor, 3)),
      g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2)),
      g.setAttribute("color", new Float32BufferAttribute(this.col, 3)),
      g.setAttribute("tint", new Float32BufferAttribute(this.tint, 1)),
      g.setIndex(this.idx),
      g.computeBoundingSphere();
    return g;
  }
}
const X = new Vector3(1, 0, 0),
  Y = new Vector3(0, 1, 0);

// matrix helpers: T(x, y, z, rotY = 0, rotX = 0, rotZ = 0)
const _q = new Quaternion(),
  _e = new Euler(),
  _s = new Vector3(1, 1, 1);
function T(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new Matrix4().compose(new Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz));
}

// sRGB hex -> linear [r, g, b] for vertex colours
function lin(hex) {
  const c = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

// One lit material for every prop: atlas map times vertex colour; with instancing, the instance
// colour only tints the parts whose tint attribute is 1 (walls, hulls, cabins).
function propMaterial(map, roughness = 0.72) {
  const m = new MeshStandardMaterial({ map, vertexColors: !0, roughness, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float tint;").replace(
      "#include <color_vertex>",
      `#include <color_vertex>
#if defined( USE_INSTANCING_COLOR ) && defined( USE_COLOR )
  vColor.rgb = color.rgb * mix( vec3( 1.0 ), instanceColor.rgb, tint );
#endif`,
    );
  };
  return m;
}

export { Kit, T, X, Y, lin, propMaterial };
