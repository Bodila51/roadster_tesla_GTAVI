import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { xi } from "./barriers.js";
import { buildEnvMap } from "./env-map.js";
import { buildFloodlight } from "./floodlights.js";
import { buildGround } from "./ground.js";
import { WORLD } from "./layout.js";
import { buildSky } from "./sky.js";

function buildEnvironment(a, e) {
  const s = {
      colliders: [],
      surfaces: [],
      updaters: [],
      spots: [],
    },
    t = new Group();
  a.add(t), (a.fog = new FogExp2(461584, 0.0028));
  const i = buildSky();
  a.add(i), (s.sky = i);
  const o = buildGround();
  t.add(o), (s.ground = o);
  const n = new MeshStandardMaterial({
      color: 14605522,
      roughness: 0.65,
      polygonOffset: !0,
      polygonOffsetFactor: -4,
    }),
    c = (m, v, x, h, u = 0) => {
      const T = new Mesh(new PlaneGeometry(m, v), n);
      (T.rotation.x = -Math.PI / 2),
        (T.rotation.z = u),
        T.position.set(x, 0.006, h),
        (T.receiveShadow = !0),
        t.add(T);
    };
  c(0.18, 160, 0, -70), c(220, 0.18, 80, WORLD.lineup.z + 12, 0);
  for (let m = -1200; m < 1200; m += 30) c(14, 0.4, m, WORLD.runwayZ);
  c(2400, 0.35, 0, WORLD.runwayZ - 28), c(2400, 0.35, 0, WORLD.runwayZ + 28);
  for (const m of [-1160, 1160])
    for (let v = -10; v <= 10; v++) c(30, 1.6, m, WORLD.runwayZ + v * 2.5);
  {
    const m = new Mesh(new RingGeometry(23.6, 24, 128), n);
    (m.rotation.x = -Math.PI / 2),
      m.position.copy(WORLD.donut).setY(0.007),
      t.add(m);
    const v = new Mesh(new RingGeometry(9.8, 10.1, 96), n);
    (v.rotation.x = -Math.PI / 2),
      v.position.copy(WORLD.donut).setY(0.007),
      t.add(v);
  }
  const r = new MeshStandardMaterial({
    color: 2097152,
    emissive: 16717872,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  });
  s.ledMat = r;
  const l = (() => {
      const m = document.createElement("canvas");
      (m.width = 64), (m.height = 4);
      const v = m.getContext("2d"),
        x = v.createLinearGradient(0, 0, 64, 0);
      x.addColorStop(0, "rgba(255,255,255,0)"),
        x.addColorStop(0.38, "rgba(255,255,255,0.18)"),
        x.addColorStop(0.47, "rgba(255,255,255,0.75)"),
        x.addColorStop(0.5, "rgba(255,255,255,1)"),
        x.addColorStop(0.53, "rgba(255,255,255,0.75)"),
        x.addColorStop(0.62, "rgba(255,255,255,0.18)"),
        x.addColorStop(1, "rgba(255,255,255,0)"),
        (v.fillStyle = x),
        v.fillRect(0, 0, 64, 4);
      const h = new CanvasTexture(m);
      return (h.colorSpace = SRGBColorSpace), (h.anisotropy = 8), h;
    })(),
    d = new MeshBasicMaterial({
      map: l,
      color: new Color(2.6, 0.18, 0.28),
      transparent: !0,
      blending: AdditiveBlending,
      depthWrite: !1,
      polygonOffset: !0,
      polygonOffsetFactor: -8,
    });
  s.glowMat = d;
  const f = (m, v, x, h = !0) => {
    const u = new Mesh(new BoxGeometry(h ? m : 0.1, 0.04, h ? 0.1 : m), r);
    u.position.set(v, 0.02, x), t.add(u);
    const T = new Mesh(new PlaneGeometry(0.9, m), d);
    (T.rotation.x = -Math.PI / 2),
      h && (T.rotation.z = Math.PI / 2),
      T.position.set(v, 0.045, x),
      (T.renderOrder = 2),
      t.add(T);
  };
  for (const m of [-1, 1]) f(120, m * 7.5, -85, !1);
  for (const m of [-1, 1]) f(75, 57, WORLD.lineup.z + m * 7, !0);
  for (const m of [-1, 1]) f(2400, 0, WORLD.runwayZ + m * 30, !0);
  {
    const m = new Mesh(new TorusGeometry(25, 0.07, 6, 160), r);
    (m.rotation.x = Math.PI / 2),
      m.position.copy(WORLD.donut).setY(0.05),
      t.add(m);
  }
  {
    const m = xi(),
      v = new MeshStandardMaterial({
        color: 10133670,
        metalness: 0.85,
        roughness: 0.4,
      }),
      x = [];
    for (let g = -20; g > -140; g -= 2.6)
      (g < -48 || g > -32) &&
        (x.push([-14, g, Math.PI / 2]), x.push([14, g, Math.PI / 2]));
    for (let g = 10; g < 200; g += 2.6)
      (g < 85 || g > 135) && x.push([g, WORLD.lineup.z + 26, 0]);
    const h = new InstancedMesh(m, v, x.length),
      u = new Matrix4();
    x.forEach(([g, D, P], k) => {
      u.makeRotationY(P), u.setPosition(g, 0, D), h.setMatrixAt(k, u);
    }),
      (h.castShadow = !0),
      (h.receiveShadow = !0),
      t.add(h);
    const T = (g, D, P, k) =>
      s.colliders.push({
        min: new Vector3(Math.min(g, P) - 0.3, 0, Math.min(D, k) - 0.3),
        max: new Vector3(Math.max(g, P) + 0.3, 1.15, Math.max(D, k) + 0.3),
        name: "barrier",
      });
    for (const g of [-14, 14]) T(g, -141.5, g, -48.6), T(g, -31.4, g, -18.7);
    const z = WORLD.lineup.z + 26;
    T(8.8, z, 85.2, z), T(134.8, z, 201, z);
  }
  [
    {
      p: [-34, -120],
      t: [0, 8, -150],
    },
    {
      p: [36, -112],
      t: [0, 14, -158],
    },
    {
      p: [-30, -40],
      t: [0, 0, -100],
    },
    {
      p: [70, -10],
      t: [110, 2, -40],
    },
    {
      p: [150, -12],
      t: [110, 4, -40],
    },
    {
      p: [-80, -10],
      t: [-110, 0, -40],
    },
    {
      p: [40, 60],
      t: [0, 0, 20],
    },
    {
      p: [-300, 100],
      t: [-300, 0, 140],
    },
    {
      p: [300, 100],
      t: [300, 0, 140],
    },
    {
      p: [-250, -205],
      t: [-250, 3, -170],
    },
    {
      p: [-190, -135],
      t: [-210, 3, -170],
    },
    {
      p: [-250, -20],
      t: [-272, 8, -40],
    },
    {
      p: [255, -330],
      t: [262, 12, -300],
    },
    {
      p: [690, -340],
      t: [700, 0, -300],
    },
  ].forEach((m, v) => {
    const x = buildFloodlight(
      new Vector3(m.p[0], 0, m.p[1]),
      new Vector3(...m.t),
      v < 5 || v === 9,
    );
    t.add(x.group),
      s.spots.push(x.spot),
      s.colliders.push({
        min: new Vector3(m.p[0] - 0.7, 0, m.p[1] - 0.7),
        max: new Vector3(m.p[0] + 0.7, 30, m.p[1] + 0.7),
        name: "pole",
      });
  });
  {
    const m = new MeshStandardMaterial({
        color: 2760728,
        roughness: 0.9,
      }),
      v = [];
    for (let h = 20; h <= 220; h += 50) {
      const u = WORLD.lineup.z - 18,
        T = new Mesh(new CylinderGeometry(0.16, 0.22, 13, 10), m);
      T.position.set(h, 6.5, u), (T.castShadow = !0), t.add(T);
      const z = new Mesh(new BoxGeometry(0.15, 0.15, 3.2), m);
      z.position.set(h, 12.2, u),
        t.add(z),
        v.push(new Vector3(h, 12.3, u)),
        s.colliders.push({
          min: new Vector3(h - 0.3, 0, u - 0.3),
          max: new Vector3(h + 0.3, 13, u + 0.3),
          name: "pole",
        });
    }
    const x = new LineBasicMaterial({
      color: 657930,
    });
    for (const h of [-1.4, 0, 1.4]) {
      const u = [];
      for (let T = 0; T < v.length - 1; T++) {
        const z = v[T],
          g = v[T + 1];
        for (let D = 0; D <= 20; D++) {
          const P = D / 20;
          u.push(
            new Vector3(
              z.x + (g.x - z.x) * P,
              z.y - Math.sin(P * Math.PI) * 1.2,
              z.z + h,
            ),
          );
        }
      }
      t.add(new Line(new BufferGeometry().setFromPoints(u), x));
    }
  }
  s.blinkers = [];
  const w = new MeshStandardMaterial({
      color: 790291,
      roughness: 0.9,
      metalness: 0.2,
    }),
    S = (m, v, x) => {
      const h = new Mesh(
        new SphereGeometry(1.4, 10, 8),
        new MeshBasicMaterial({
          color: 16722474,
          fog: !1,
        }),
      );
      h.position.set(m, v, x), t.add(h), s.blinkers.push(h);
    };
  {
    const m = new Group(),
      v = new Mesh(new BoxGeometry(14, 145, 14), w);
    (v.position.y = 72.5), m.add(v);
    for (const g of [-1, 1]) {
      const D = new Mesh(new BoxGeometry(3, 3, 34), w);
      D.position.set(g * 9, 110, 16), (D.rotation.y = g * 0.25), m.add(D);
    }
    const x = new Mesh(
      new CylinderGeometry(4.5, 4.5, 70, 24),
      new MeshStandardMaterial({
        color: 4212304,
        metalness: 0.9,
        roughness: 0.35,
      }),
    );
    x.position.set(-22, 55, 0), m.add(x);
    const h = new Mesh(new BoxGeometry(20, 20, 20), w);
    h.position.set(-22, 10, 0),
      m.add(h),
      m.position.set(-520, 0, -1100),
      t.add(m),
      s.colliders.push({
        min: new Vector3(-527, 0, -1107),
        max: new Vector3(-513, 145, -1093),
        name: "tower",
      }),
      s.colliders.push({
        min: new Vector3(-552, 0, -1110),
        max: new Vector3(-532, 90, -1090),
        name: "tower",
      }),
      s.colliders.push({
        min: new Vector3(-512, 105, -1104),
        max: new Vector3(-480, 113, -1074),
        name: "tower",
      }),
      S(-520, 147, -1100),
      S(-542, 92, -1100);
    for (let g = 0; g < 6; g++) {
      const D = new Mesh(new CylinderGeometry(5, 5, 26 + (g % 3) * 8, 20), w);
      D.position.set(-380 + g * 13, 13 + (g % 3) * 4, -980), t.add(D);
      const P = 26 + (g % 3) * 8;
      s.colliders.push({
        min: new Vector3(-385 + g * 13, 0, -985),
        max: new Vector3(-375 + g * 13, P, -975),
        name: "tank",
      });
    }
    for (let g = 0; g < 4; g++) {
      const D = new Mesh(new BoxGeometry(60, 22, 40), w);
      D.position.set(380 + g * 75, 11, -640 - g * 20),
        t.add(D),
        s.colliders.push({
          min: new Vector3(350 + g * 75, 0, -660 - g * 20),
          max: new Vector3(410 + g * 75, 22, -620 - g * 20),
          name: "hangar",
        }),
        s.surfaces.push({
          min: new Vector3(350 + g * 75, 0, -660 - g * 20),
          max: new Vector3(410 + g * 75, 22, -620 - g * 20),
          name: "hangar",
        });
      const P = new Mesh(
        new PlaneGeometry(48, 2.4),
        new MeshBasicMaterial({
          color: 16767392,
          fog: !1,
          transparent: !0,
          opacity: 0.55,
        }),
      );
      P.position.set(380 + g * 75, 15, -640 - g * 20 + 20.1),
        t.add(P),
        S(380 + g * 75, 23, -640 - g * 20);
    }
    const u = new Group(),
      T = new Mesh(new CylinderGeometry(1.2, 2.2, 30, 8), w);
    (T.position.y = 15), u.add(T);
    const z = new Mesh(new SphereGeometry(8, 16, 12), w);
    (z.position.y = 34),
      u.add(z),
      u.position.set(700, 0, 300),
      t.add(u),
      s.colliders.push({
        min: new Vector3(697.5, 0, 297.5),
        max: new Vector3(702.5, 26, 302.5),
        name: "tower",
      }),
      s.colliders.push({
        min: new Vector3(692, 26, 292),
        max: new Vector3(708, 42, 308),
        name: "tower",
      }),
      S(700, 43, 300);
  }
  const y = new DirectionalLight(10467583, 0.55);
  y.position.set(-60, 120, 40),
    (y.castShadow = !0),
    y.shadow.mapSize.set(2048, 2048);
  const b = y.shadow.camera;
  (b.left = -40),
    (b.right = 40),
    (b.top = 40),
    (b.bottom = -40),
    (b.near = 1),
    (b.far = 400),
    (y.shadow.bias = -4e-4),
    (y.shadow.normalBias = 0.03),
    a.add(y),
    a.add(y.target),
    (s.moon = y);
  const L = new HemisphereLight(2306634, 657414, 0.18);
  return (
    a.add(L),
    (s.envMap = buildEnvMap(e)),
    (a.environment = s.envMap),
    (a.environmentIntensity = 0.9),
    (s.update = (m, v, x) => {
      if (x) {
        const u = new Vector3(-60, 120, 40),
          T = u.clone().normalize(),
          z = new Vector3().crossVectors(new Vector3(0, 1, 0), T).normalize(),
          g = new Vector3().crossVectors(T, z),
          D = (b.right - b.left) / y.shadow.mapSize.x,
          P = x.dot(z),
          k = x.dot(g),
          R = x
            .clone()
            .addScaledVector(z, Math.round(P / D) * D - P)
            .addScaledVector(g, Math.round(k / D) * D - k);
        y.target.position.copy(R), y.position.copy(R).add(u);
      }
      const h = Math.pow(Math.max(0, Math.sin(v * 2.4)), 3);
      for (const u of s.blinkers)
        u.material.color.setRGB(0.15 + 2.4 * h, 0.02 + 0.3 * h, 0.02 + 0.3 * h);
      i.position.copy(x || i.position).setY(0);
    }),
    s
  );
}

export { buildEnvironment };
