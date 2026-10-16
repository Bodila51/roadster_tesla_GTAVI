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
import { DAY, buildSky, buildTreeLine } from "./sky.js";
import { bakeStaticShadow } from "./static-shadow.js";

function buildEnvironment(a, e) {
  const s = {
      colliders: [],
      surfaces: [],
      updaters: [],
      spots: [],
    },
    t = new Group();
  (t.userData.staticShadow = !0),
    a.add(t), (a.fog = new FogExp2(16777215, DAY.fogDensity)), a.fog.color.copy(DAY.haze);
  const i = buildSky();
  const tl = buildTreeLine();
  a.add(i), (s.sky = i), i.add(tl);
  const o = buildGround();
  t.add(o), (s.ground = o);
  const n = new MeshStandardMaterial({
      color: 14540247,
      roughness: 0.72,
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
    emissiveIntensity: 3,
    roughness: 0.4,
    transparent: !0,
  });
  // In-ground strips are 10 cm wide: past ~50 m they turn into a dotted line,
  // and in sunlight they would not read from that far anyway, so fade them out.
  r.onBeforeCompile = (m) => {
    m.fragmentShader = m.fragmentShader.replace(
      "#include <dithering_fragment>",
      "#include <dithering_fragment>\n  gl_FragColor.a *= 1.0 - smoothstep(45.0, 110.0, length(vViewPosition));",
    );
  };
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
        color: 11316658,
        metalness: 0.8,
        roughness: 0.48,
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
    );
    t.add(x.group),
      s.colliders.push({
        min: new Vector3(m.p[0] - 0.7, 0, m.p[1] - 0.7),
        max: new Vector3(m.p[0] + 0.7, 30, m.p[1] + 0.7),
        name: "pole",
      });
  });
  {
    const m = new MeshStandardMaterial({
        color: 6050373,
        roughness: 0.92,
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
      color: 2368548,
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
      color: 7239547,
      roughness: 0.8,
      metalness: 0.2,
    }),
    S = (m, v, x) => {
      const h = new Mesh(
        new SphereGeometry(1.4, 10, 8),
        new MeshBasicMaterial({
          color: 16722474,
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
        color: 13421514,
        metalness: 0.9,
        roughness: 0.3,
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
    const tk = new MeshStandardMaterial({
      color: 12105911,
      roughness: 0.6,
      metalness: 0.1,
    });
    for (let g = 0; g < 6; g++) {
      const D = new Mesh(new CylinderGeometry(5, 5, 26 + (g % 3) * 8, 20), tk);
      D.position.set(-380 + g * 13, 13 + (g % 3) * 4, -980), t.add(D);
      const P = 26 + (g % 3) * 8;
      s.colliders.push({
        min: new Vector3(-385 + g * 13, 0, -985),
        max: new Vector3(-375 + g * 13, P, -975),
        name: "tank",
      });
    }
    const hg = new MeshStandardMaterial({
        color: 9409425,
        roughness: 0.7,
        metalness: 0.25,
      }),
      dr = new MeshStandardMaterial({
        color: 1250326,
        roughness: 0.9,
      });
    for (let g = 0; g < 4; g++) {
      const D = new Mesh(new BoxGeometry(60, 22, 40), hg);
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
      const P = new Mesh(new PlaneGeometry(48, 2.4), dr);
      P.position.set(380 + g * 75, 15, -640 - g * 20 + 20.1),
        t.add(P),
        S(380 + g * 75, 23, -640 - g * 20);
    }
    const u = new Group(),
      T = new Mesh(new CylinderGeometry(1.2, 2.2, 30, 8), w);
    (T.position.y = 15), u.add(T);
    const z = new Mesh(new SphereGeometry(8, 16, 12), tk);
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
  // the sun: one shadow-casting DirectionalLight whose tight shadow box follows the player and
  // leans towards where the camera looks
  const y = new DirectionalLight(16777215, DAY.sunIntensity);
  y.color.copy(DAY.sunColor),
    (y.castShadow = !0),
    y.shadow.mapSize.set(2048, 2048);
  const b = y.shadow.camera,
    sh = 38;
  (b.left = -sh),
    (b.right = sh),
    (b.top = sh),
    (b.bottom = -sh),
    (b.near = 1),
    (b.far = DAY.shadowFar),
    (y.shadow.bias = -2e-4),
    (y.shadow.normalBias = 0.035),
    a.add(y),
    a.add(y.target),
    (s.sun = y),
    (s.moon = y);
  // sky fill on top of the image based light from the sky probe
  const L = new HemisphereLight(16777215, 16777215, DAY.hemiIntensity);
  L.color.copy(DAY.hemiSky),
    L.groundColor.copy(DAY.hemiGround),
    a.add(L),
    (s.hemi = L);
  // remember the camera the scene is drawn with, so the shadow box can lean ahead of it
  const C = a.onBeforeRender;
  a.onBeforeRender = function (m, v, x, h) {
    x && x.isPerspectiveCamera && (s.camera = x), C.call(this, m, v, x, h);
  };
  const sd = DAY.sunDir.clone().multiplyScalar(DAY.shadowDist),
    sz = sd.clone().normalize(),
    sx = new Vector3().crossVectors(new Vector3(0, 1, 0), sz).normalize(),
    sy = new Vector3().crossVectors(sz, sx),
    fw = new Vector3(),
    ce = new Vector3();
  return (
    (s.envMap = buildEnvMap(e)),
    (a.environment = s.envMap),
    (a.environmentIntensity = DAY.envIntensity),
    (s.update = (m, v, x) => {
      // first frame: everything is in the scene now, bake the far ground shadows once
      s.baked ||
        ((s.baked = !0),
        bakeStaticShadow(e, a, DAY.sunDir, y.shadow.mapSize.x > 1024 ? 2048 : 1024));
      if (x) {
        ce.copy(x);
        const u = s.camera;
        u &&
          (u.getWorldDirection(fw),
          (fw.y = 0),
          fw.lengthSq() > 1e-4 &&
            ce.addScaledVector(fw.normalize(), sh * 0.45));
        const D = (b.right - b.left) / y.shadow.mapSize.x,
          P = ce.dot(sx),
          k = ce.dot(sy);
        ce.addScaledVector(sx, Math.round(P / D) * D - P).addScaledVector(
          sy,
          Math.round(k / D) * D - k,
        ),
          y.target.position.copy(ce),
          y.position.copy(ce).add(sd);
      }
      const h = Math.pow(Math.max(0, Math.sin(v * 2.4)), 3);
      for (const u of s.blinkers)
        u.material.color.setRGB(0.15 + 3 * h, 0.02 + 0.3 * h, 0.02 + 0.3 * h);
      i.position.copy(x || i.position).setY(0), tl.userData.setCenter(i.position);
    }),
    s
  );
}

export { buildEnvironment };
