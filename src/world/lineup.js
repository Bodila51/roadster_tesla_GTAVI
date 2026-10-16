import { Box3, BoxGeometry, Group, Mesh } from "three";
import { Vec3 } from "../util/math.js";
import { buildCybercab } from "../vehicles/cybercab.js";
import { buildCybertruck } from "../vehicles/cybertruck.js";
import { vehicleMaterials } from "../vehicles/materials.js";
import { buildModelY } from "../vehicles/model-y.js";
import { buildModel3 } from "../vehicles/model3.js";
import { buildSemi } from "../vehicles/semi.js";

function buildLineup() {
  const a = vehicleMaterials(),
    e = new Group();
  e.name = "lineup";
  const s = 0.12,
    t = 0.9,
    i = [
      ["model3", buildModel3()],
      ["modelY", buildModelY()],
      ["semi", buildSemi()],
      ["cybertruck", buildCybertruck()],
      ["cybercab", buildCybercab()],
    ],
    o = i.map(([, L]) => new Box3().setFromObject(L.group)),
    n = new Array(i.length);
  n[2] = -(o[2].min.x + o[2].max.x) / 2;
  for (let L = 3; L < i.length; L++)
    n[L] = n[L - 1] + o[L - 1].max.x + t - o[L].min.x;
  for (let L = 1; L >= 0; L--)
    n[L] = n[L + 1] + o[L + 1].min.x - t - o[L].max.x;
  const c = 3.35;
  i.forEach(([L, m], v) => {
    m.group.position.set(n[v], s, c - o[v].max.z), e.add(m.group);
  }),
    e.updateMatrixWorld(!0);
  const r = i.map(([L, m]) => {
      const v = new Box3().setFromObject(m.group);
      return {
        min: v.min.clone(),
        max: v.max.clone(),
        name: L,
      };
    }),
    l = Math.min(...r.map((L) => L.min.x)) - 0.7,
    d = Math.max(...r.map((L) => L.max.x)) + 0.7,
    f = Math.min(...r.map((L) => L.min.z)) - 0.45,
    p = Math.max(...r.map((L) => L.max.z)) + 0.45,
    w = d - l,
    S = p - f,
    y = new Mesh(new BoxGeometry(w, s, S), a.platform);
  y.position.set((l + d) / 2, s / 2, (f + p) / 2),
    (y.receiveShadow = !0),
    (y.castShadow = !0),
    (y.name = "platform"),
    e.add(y);
  const b = new BoxGeometry(w - 0.04, 0.022, 0.012);
  for (const L of [p + 0.004, f - 0.004]) {
    const m = new Mesh(b, a.led);
    m.position.set((l + d) / 2, s - 0.03, L), (m.name = "led"), e.add(m);
  }
  return (
    r.push({
      min: new Vec3(l, 0, f),
      max: new Vec3(d, s, p),
      name: "platform",
    }),
    {
      group: e,
      boxes: r,
    }
  );
}

export { buildLineup };
