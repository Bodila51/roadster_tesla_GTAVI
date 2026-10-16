import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  SRGBColorSpace,
  Shape,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { CarPhysics } from "../physics/car-physics.js";
import { storageGet, storageSet } from "../util/storage.js";
import { WORLD } from "../world/layout.js";
import { MISSIONS } from "./missions.js";

// 2-MIN RUN: a Tony Hawk-style timed run. The letters R-O-A-D-S-T-E-R float at eight
// landmarks; drive or fly within PICK_RADIUS of one to collect it. The clock stops at
// 0 s or when the word is complete; a jump still in the air may then land (so its
// combo banks) before the results open.
//
// Every spot is derived from the world objects main.js builds (ramp profiles, lineup
// boxes, the ring course, the bullseye) and, for the Mass Driver, from a flight of the
// real car physics, so the letters follow the world if it changes.
// tools/run-reach.mjs drives to each letter from the nearest teleport in the sim.
//
// Window events (CustomEvent, payload in e.detail), next to the rules module's rd:*:
//   rd:letter {letter, index, t}                     t = run seconds elapsed
//   rd:run    {phase: "start" | "end", score, letters, time, ...}
//             time = run seconds elapsed (0 at start). "end" adds reason
//             ("time" | "word" | "abort"), timeLeft, best {score, letters, time}, newBest.
// It also gives the game object mode ("free" | "run") and targets() (minimap contract:
// {missions: [{id, name, done, pos}], letters: [{letter, index, got, pos}]}).
const RUN_SECONDS = 120,
  WORD = "ROADSTER",
  PICK_RADIUS = 3, // m, from the car's centre to the letter's centre
  CAR_CENTRE = 0.6, // m: phys.pos sits at wheel level, the body centre this far up
  LETTER_PTS = 1000,
  WORD_PTS = 5000,
  SECOND_PTS = 100, // per whole second left when the word is complete
  SETTLE_MAX = 6, // s a jump in progress may take to land once the clock stops
  BEST_KEY = "rdstr.runBest",
  ACCENT = 0xff5a1f, // --accent
  GLYPH_H = 2.6, // m, cap height in the world
  BEAM_H = 70, // m, faint light column over each letter, seen from afar
  POP = 0.4; // s, pickup pop

// ── Spots ──────────────────────────────────────────────────────────────────
const v3 = (x, y, z) => new Vector3(x, y, z);
const xyz = (v) => ({
  x: +v.x.toFixed(2),
  y: +v.y.toFixed(2),
  z: +v.z.toFixed(2),
});
// Arc length of the highest point of a ramp profile.
function topS(ramp) {
  let best = 0,
    y = -1 / 0;
  for (let s = 0; s <= ramp.L; s += 0.05) {
    const h = ramp.sample(s).y;
    h > y && ((y = h), (best = s));
  }
  return best;
}
// `off` m off the deck along its normal: on the car's path while it rides there.
const offDeck = (ramp, s, off) =>
  ramp.point(s, 0).addScaledVector(ramp.normal(s), off);
const boxTop = (b, up) =>
  v3((b.min.x + b.max.x) / 2, b.max.y + up, (b.min.z + b.max.z) / 2);

// The Mass Driver's default shot, flown by the real car physics: from the Mass Driver
// teleport (90 m before the rail) on full throttle until airborne, then no input.
// Returns the car centre where the descent passes `alt` m, or null.
function mdDescent(phys, md, alt) {
  try {
    const p = new CarPhysics({
      ramps: phys.ramps,
      colliders: phys.colliders,
      surfaces: phys.surfaces,
    });
    p.reset(
      md.origin.clone().addScaledVector(md.f, -90).setY(0),
      Math.atan2(md.f.x, md.f.z),
    );
    const go = {
        throttle: 1,
        brake: 0,
        steer: 0,
        lift: !1,
        liftPressed: !1,
        boost: !1,
        drift: !1,
        yawL: 0,
        yawR: 0,
      },
      coast = { ...go, throttle: 0 },
      prev = p.pos.clone();
    let rode = !1,
      flew = !1;
    for (let i = 0; i < 60 * 30; i++) {
      (p.events.length = 0), p.update(1 / 60, flew ? coast : go);
      if (p.mode === "air") flew = !0;
      if (p.mode !== "ground") rode = !0;
      else if (rode) break;
      if (p.mode === "air" && p.vel.y < 0 && p.pos.y <= alt) {
        const k = (prev.y - alt) / Math.max(1e-6, prev.y - p.pos.y);
        return prev.lerp(p.pos, k).addScaledVector(p.up, CAR_CENTRE);
      }
      prev.copy(p.pos);
    }
  } catch (err) {
    console.warn("[run] mass driver flight", err);
  }
  return null;
}

function letterSpots(w, phys) {
  const box = (n) => w.lineup.find((b) => b.name === n),
    md = w.massdriver,
    spots = [
      // R: the top edge of the reveal wall, just before the lip the car leaves inverted
      ["Reveal wall, top edge", offDeck(w.wall, Math.min(topS(w.wall), w.wall.L - 0.6), 1.6)],
      // O: inside the loop, under its highest point (the car passes upside down)
      ["Loop, near the top", offDeck(w.loop, topS(w.loop), 1.6)],
      // A: over the Semi's roof, where a hop across the lineup passes
      ["Lineup, above the Semi", boxTop(box("semi"), 2.4)],
      // D: on the default Mass Driver flight, 12 m up on its final descent
      [
        "Mass Driver landing zone",
        mdDescent(phys, md, 12) ||
          w.bullseye.center.clone().addScaledVector(md.f, -5).setY(12.6),
      ],
      // S: 4.5 m over the far coping, in the column a vertical air rises in
      ["Halfpipe, above the lip", offDeck(w.halfpipe, w.halfpipe.L, 0.6).add(v3(0, 4.5, 0))],
      // T: the centre of the lowest ring of the ring course (ring 5)
      [
        "Lowest ring",
        w.rings.reduce((a, b) => (b.center.y < a.center.y ? b : a)).center.clone(),
      ],
      // E: over the bullseye's gold centre
      ["Bullseye centre", w.bullseye.center.clone().setY(1.6)],
      // R: sitting on the Cybertruck's roof
      ["Lineup, Cybertruck roof", boxTop(box("cybertruck"), 1.35)],
    ];
  return spots.map(([where, pos], i) => ({ letter: WORD[i], index: i, where, pos }));
}

// ── Glyphs ─────────────────────────────────────────────────────────────────
// Self-made squared bold capitals, cap height 1: an outline plus counters (holes),
// each a polygon of [x, y, corner radius].
const A_IN = (y) => 0.22 + 0.2 * y; // inner edge of the A's left leg
const GLYPHS = {
  R: [
    [[0, 0, 0.01], [0.23, 0, 0.01], [0.23, 0.4, 0], [0.27, 0.4, 0], [0.39, 0, 0.01], [0.64, 0, 0.01], [0.52, 0.4, 0], [0.64, 0.4, 0.12], [0.64, 1, 0.22], [0, 1, 0.02]],
    [[0.23, 0.6, 0], [0.41, 0.6, 0.05], [0.41, 0.77, 0.05], [0.23, 0.77, 0]],
  ],
  O: [
    [[0, 0, 0.28], [0.64, 0, 0.28], [0.64, 1, 0.28], [0, 1, 0.28]],
    [[0.23, 0.23, 0.07], [0.41, 0.23, 0.07], [0.41, 0.77, 0.07], [0.23, 0.77, 0.07]],
  ],
  A: [
    [[0, 0, 0.01], [0.22, 0, 0], [A_IN(0.16), 0.16, 0], [0.72 - A_IN(0.16), 0.16, 0], [0.5, 0, 0], [0.72, 0, 0.01], [0.45, 1, 0.04], [0.27, 1, 0.04]],
    [[A_IN(0.34), 0.34, 0], [0.72 - A_IN(0.34), 0.34, 0], [0.36, 0.7, 0]],
  ],
  D: [
    [[0, 0, 0.02], [0.64, 0, 0.3], [0.64, 1, 0.3], [0, 1, 0.02]],
    [[0.23, 0.23, 0], [0.41, 0.23, 0.08], [0.41, 0.77, 0.08], [0.23, 0.77, 0]],
  ],
  S: [
    [[0, 0, 0], [0.62, 0, 0.27], [0.62, 0.615, 0.27], [0.23, 0.615, 0.04], [0.23, 0.77, 0.04], [0.62, 0.77, 0], [0.62, 1, 0], [0, 1, 0.27], [0, 0.385, 0.27], [0.39, 0.385, 0.04], [0.39, 0.23, 0.04], [0, 0.23, 0]],
  ],
  T: [
    [[0, 1, 0.02], [0.62, 1, 0.02], [0.62, 0.77, 0], [0.425, 0.77, 0], [0.425, 0, 0.02], [0.195, 0, 0.02], [0.195, 0.77, 0], [0, 0.77, 0]],
  ],
  E: [
    [[0, 0, 0.12], [0.56, 0, 0], [0.56, 0.23, 0], [0.23, 0.23, 0.02], [0.23, 0.385, 0], [0.5, 0.385, 0], [0.5, 0.615, 0], [0.23, 0.615, 0], [0.23, 0.77, 0.02], [0.56, 0.77, 0], [0.56, 1, 0], [0, 1, 0.12]],
  ],
};
// Polygon with rounded corners (quadratic corners, cut length capped by the edges).
function roundPath(path, pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r] = pts[i],
      [px, py, pr] = pts[(i + n - 1) % n],
      [nx, ny, nr] = pts[(i + 1) % n],
      lp = Math.hypot(px - x, py - y),
      ln = Math.hypot(nx - x, ny - y),
      d = r > 0 ? 0.98 * Math.min(r, (lp * r) / (r + pr), (ln * r) / (r + nr)) : 0,
      ax = x + ((px - x) / lp) * d,
      ay = y + ((py - y) / lp) * d;
    i ? path.lineTo(ax, ay) : path.moveTo(ax, ay);
    d > 1e-4 &&
      path.quadraticCurveTo(x, y, x + ((nx - x) / ln) * d, y + ((ny - y) / ln) * d);
  }
  return path;
}
function glyphGeometry(ch) {
  const [outer, ...holes] = GLYPHS[ch],
    shape = roundPath(new Shape(), outer);
  for (const h of holes) shape.holes.push(roundPath(new Path(), h));
  const g = new ExtrudeGeometry(shape, {
    depth: 0.22,
    curveSegments: 5,
    bevelEnabled: !0,
    bevelThickness: 0.05,
    bevelSize: 0.03,
    bevelOffset: -0.03,
    bevelSegments: 2,
  });
  g.computeBoundingBox();
  const b = g.boundingBox;
  return g.translate(
    -(b.min.x + b.max.x) / 2,
    -(b.min.y + b.max.y) / 2,
    -(b.min.z + b.max.z) / 2,
  );
}
function gradientTexture(radial) {
  const c = document.createElement("canvas");
  (c.width = radial ? 64 : 4), (c.height = 64);
  const g = c.getContext("2d"),
    f = radial
      ? g.createRadialGradient(32, 32, 0, 32, 32, 32)
      : g.createLinearGradient(0, 64, 0, 0);
  f.addColorStop(0, "rgba(255,255,255,1)"),
    f.addColorStop(radial ? 0.3 : 0.15, "rgba(255,255,255,0.5)"),
    f.addColorStop(1, "rgba(255,255,255,0)"),
    (g.fillStyle = f),
    g.fillRect(0, 0, c.width, 64);
  const t = new CanvasTexture(c);
  return (t.colorSpace = SRGBColorSpace), t;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const clock = (s, tenths) => {
  const c = Math.max(0, tenths ? Math.round(s * 10) / 10 : Math.ceil(s)),
    m = Math.floor(c / 60),
    r = c - m * 60;
  return `${m}:${(tenths ? r.toFixed(1) : String(r)).padStart(tenths ? 4 : 2, "0")}`;
};
const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));
function readBest() {
  try {
    const b = JSON.parse(storageGet(BEST_KEY) || "null");
    return b && Number.isFinite(b.score) ? b : null;
  } catch {
    return null;
  }
}
// Closest distance from point c to segment a-b.
const segDist = (a, b, c, tmp) => {
  const ab = tmp.subVectors(b, a),
    l2 = ab.lengthSq(),
    k = l2 > 1e-9 ? Math.max(0, Math.min(1, (c.clone().sub(a).dot(ab)) / l2)) : 0;
  return a.clone().addScaledVector(ab, k).distanceTo(c);
};

class RunMode {
  // world: {wall, loop, halfpipe, massdriver, lineup (world boxes), bullseye};
  // place(pos, heading) puts the car and the chase camera at a start;
  // onResults / onAgain / onRoam are main.js's state switches.
  constructor({ scene, phys, game, hud, audio, sparks, camera, world, place, onResults, onAgain, onRoam }) {
    Object.assign(this, { scene, phys, game, hud, audio, sparks, camera, world, place });
    (this.onResults = onResults || (() => {})),
      (this.onAgain = onAgain || (() => {})),
      (this.onRoam = onRoam || (() => {})),
      (this.state = "idle"), // idle | run | settle | done
      (this.left = RUN_SECONDS),
      (this.elapsed = 0),
      (this.t = 0),
      (this.log = []),
      (this.best = readBest()),
      (this.spots = letterSpots({ ...world, rings: game.rings }, phys)),
      (this.start0 = {
        pos: world.wall.origin.clone().addScaledVector(world.wall.f, -38).setY(0),
        heading: Math.atan2(world.wall.f.x, world.wall.f.z),
      }),
      (this.prevC = new Vector3()),
      (this.curC = new Vector3()),
      (this.tmp = new Vector3()),
      this.buildLetters(),
      this.buildHud(),
      this.buildResults(),
      // contract for other modules (guide's minimap): mode and targets()
      (game.mode = "free"),
      (game.targets = () => this.targets());
  }
  get active() {
    return this.state === "run" || this.state === "settle";
  }
  get got() {
    return this.items.filter((it) => it.got).map((it) => it.index);
  }

  // ── 3D letters ──
  buildLetters() {
    const face = new MeshStandardMaterial({
        color: ACCENT,
        emissive: ACCENT,
        emissiveIntensity: 0.55,
        roughness: 0.35,
        metalness: 0.05,
      }),
      side = new MeshStandardMaterial({
        color: 0xc8400f,
        emissive: ACCENT,
        emissiveIntensity: 0.22,
        roughness: 0.5,
        metalness: 0.05,
      }),
      haloMap = gradientTexture(!0),
      beamMap = gradientTexture(!1),
      beamGeo = new CylinderGeometry(1, 1, 1, 8, 1, !0).translate(0, 0.5, 0),
      geos = {};
    (this.group = new Group()), (this.group.visible = !1), (this.group.name = "run-letters");
    this.items = this.spots.map((sp, i) => {
      const root = new Group(),
        spin = new Group(),
        glyph = new Mesh(geos[sp.letter] || (geos[sp.letter] = glyphGeometry(sp.letter)), [face, side]),
        halo = new Sprite(
          new SpriteMaterial({
            map: haloMap,
            color: ACCENT,
            blending: AdditiveBlending,
            transparent: !0,
            depthWrite: !1,
            opacity: 0.5,
          }),
        ),
        beam = new Mesh(
          beamGeo,
          new MeshBasicMaterial({
            map: beamMap,
            color: ACCENT,
            blending: AdditiveBlending,
            transparent: !0,
            depthWrite: !1,
            opacity: 0,
          }),
        );
      glyph.scale.setScalar(GLYPH_H), spin.add(glyph), (spin.rotation.y = i * 0.8);
      halo.scale.setScalar(GLYPH_H * 2.4), (halo.renderOrder = 2);
      (beam.position.y = GLYPH_H * 0.6), (beam.renderOrder = 2);
      root.position.copy(sp.pos), root.add(spin, halo, beam), this.group.add(root);
      return { ...sp, root, spin, halo, beam, got: !1, pop: 0 };
    });
    this.scene.add(this.group);
  }
  animate(dt) {
    this.t += dt;
    const cam = this.camera && this.camera.position;
    for (const it of this.items) {
      if (!it.root.visible) continue;
      if (it.got) {
        it.pop = Math.max(0, it.pop - dt);
        const k = 1 - it.pop / POP,
          s = k < 0.35 ? 1 + 1.6 * k : Math.max(0, 1.56 * (1 - (k - 0.35) / 0.65));
        it.spin.scale.setScalar(s),
          (it.spin.rotation.y += dt * 14),
          (it.halo.material.opacity = 0.9 * (1 - k)),
          it.halo.scale.setScalar(GLYPH_H * (2.4 + 2.5 * k)),
          (it.beam.visible = !1),
          it.pop <= 0 && (it.root.visible = !1);
        continue;
      }
      (it.spin.rotation.y += dt * 1.25),
        (it.spin.position.y = Math.sin(this.t * 2 + it.index) * 0.14);
      // the column shows from afar, fades out up close, and stays a few px wide
      const d = cam ? cam.distanceTo(it.pos) : 100;
      (it.beam.material.opacity = 0.32 * Math.min(1, Math.max(0, (d - 30) / 90))),
        it.beam.scale.set(Math.max(0.15, d * 0.0022), BEAM_H, Math.max(0.15, d * 0.0022));
    }
  }

  // ── HUD strip ──
  buildHud() {
    const el = document.createElement("div");
    (el.id = "run"),
      (el.className = "ui-plate"),
      (el.hidden = !0),
      el.setAttribute("aria-live", "polite"),
      (el.innerHTML =
        '<div class="run-head"><span class="run-lbl">2-MIN RUN</span><span class="run-time">2:00</span></div>' +
        `<div class="run-word">${[...WORD].map((c) => `<b>${c}</b>`).join("")}</div>`),
      (document.getElementById("hud") || document.body).append(el);
    (this.el = {
      run: el,
      time: el.querySelector(".run-time"),
      cells: [...el.querySelectorAll(".run-word b")],
    }),
      (this.shownTime = "");
    // the plate sits beside or under the score plate (and right of the touch
    // buttons), so it follows their measured sizes
    const sb = document.getElementById("scorebox"),
      tt = document.querySelector("#touch .t-top"),
      b = document.body.style;
    if (sb && typeof ResizeObserver == "function") {
      const ro = new ResizeObserver(() => {
        sb.offsetWidth &&
          (b.setProperty("--score-w", `${sb.offsetWidth}px`),
          b.setProperty("--score-h", `${sb.offsetHeight}px`));
        el.offsetHeight &&
          (b.setProperty("--run-h", `${el.offsetHeight}px`),
          b.setProperty("--run-w", `${el.offsetWidth}px`));
        tt &&
          tt.offsetWidth &&
          b.setProperty("--touch-r", `${Math.ceil(tt.getBoundingClientRect().right)}px`);
      });
      ro.observe(sb), ro.observe(el), tt && ro.observe(tt);
    }
  }
  showTime() {
    const s = this.state === "run" ? clock(this.left) : clock(this.state === "settle" && this.reason === "word" ? this.left : 0);
    s !== this.shownTime && ((this.shownTime = s), (this.el.time.textContent = s));
    this.el.run.classList.toggle("low", this.state === "run" && this.left <= 10);
  }

  // ── Results ──
  buildResults() {
    const el = document.createElement("div");
    (el.id = "results"),
      (el.hidden = !0),
      el.setAttribute("role", "dialog"),
      el.setAttribute("aria-label", "Run results"),
      (el.innerHTML = `<div class="r-box ui-plate hi">
  <div class="r-head"><span class="r-kick">2-MIN RUN</span><span class="r-title">TIME UP</span></div>
  <div class="r-word">${[...WORD].map((c) => `<b>${c}</b>`).join("")}</div>
  <div class="r-stats">
    <div class="r-stat r-main"><span class="r-l">SCORE</span><b class="r-score">0</b></div>
    <div class="r-stat"><span class="r-l">LETTERS</span><b class="r-letters">0/8</b></div>
    <div class="r-stat"><span class="r-l">TIME</span><b class="r-time">2:00.0</b></div>
    <div class="r-stat"><span class="r-l">BEST RUN</span><b class="r-best">–</b><span class="r-new ui-chip good" hidden>NEW BEST</span></div>
  </div>
  <div class="r-acts"><button type="button" class="ui-btn secondary" data-run="roam">Free roam</button><button type="button" class="ui-btn primary" data-run="again">Play again</button></div>
</div>`),
      document.body.append(el),
      el.addEventListener("click", (e) => {
        const b = e.target.closest && e.target.closest("[data-run]"),
          a = b && b.dataset.run;
        a === "again" ? this.onAgain() : a === "roam" && this.onRoam();
      });
    const q = (s) => el.querySelector(s);
    this.res = {
      el,
      title: q(".r-title"),
      cells: [...el.querySelectorAll(".r-word b")],
      score: q(".r-score"),
      letters: q(".r-letters"),
      time: q(".r-time"),
      best: q(".r-best"),
      isNew: q(".r-new"),
    };
  }
  get resultsOpen() {
    return !this.res.el.hidden;
  }
  hideResults() {
    this.res.el.hidden = !0;
  }

  // ── Run flow ──
  start() {
    this.state !== "idle" && this.state !== "done" && this.stop(!0);
    this.hideResults();
    const g = this.game;
    (this.state = "run"),
      (this.left = RUN_SECONDS),
      (this.elapsed = 0),
      (this.reason = ""),
      (this.settleT = 0),
      (this.log = []),
      (this.jumped = !0);
    for (const it of this.items)
      (it.got = !1),
        (it.near = 1 / 0), // closest approach this run (tests)
        (it.pop = 0),
        (it.root.visible = !0),
        (it.beam.visible = !0),
        it.spin.scale.setScalar(1),
        it.halo.scale.setScalar(GLYPH_H * 2.4),
        (it.halo.material.opacity = 0.5);
    for (const c of this.el.cells) c.classList.remove("on", "pop");
    // a fresh run: score and combo from zero, car at the start facing the wall
    (g.score = 0),
      g.resetCombo ? g.resetCombo() : ((g.pending = 0), (g.mult = 1), (g.tricks = [])),
      (g.jump = null),
      (g.drift = 0),
      (g.driftScore = 0),
      (g.launchT = null),
      g.slowmo && (g.slowmo.t = 0),
      this.hud.setScore(0, g.best),
      this.hud.drift && this.hud.drift(0, 0),
      this.place(this.start0.pos, this.start0.heading),
      (g.mode = "run"),
      (this.group.visible = !0),
      (this.el.run.hidden = !1),
      document.body.classList.add("running"),
      this.showTime(),
      this.hud.toast("2-MIN RUN", "Collect R·O·A·D·S·T·E·R before the clock runs out", !0),
      this.audio && this.audio.event("whoosh"),
      emit("rd:run", { phase: "start", score: 0, letters: 0, time: 0 });
  }
  // Leaves the run without results (free roam from the menu, or a restart).
  stop(restart) {
    if (!this.active) return;
    const n = this.got.length;
    this.state = "idle";
    this.leave();
    emit("rd:run", {
      phase: "end",
      score: this.game.score,
      letters: n,
      time: +this.elapsed.toFixed(2),
      timeLeft: +this.left.toFixed(2),
      reason: "abort",
      restart: !!restart,
    });
  }
  leave() {
    (this.game.mode = "free"),
      (this.group.visible = !1),
      (this.el.run.hidden = !0),
      document.body.classList.remove("running");
  }
  carCentre(out) {
    return out.copy(this.phys.up).multiplyScalar(CAR_CENTRE).add(this.phys.pos);
  }
  // Real (unscaled) frame time, called while playing.
  update(dt) {
    if (!this.active) return;
    this.animate(dt);
    if (this.state === "run") {
      (this.left = Math.max(0, this.left - dt)), (this.elapsed += dt);
      const a = this.prevC.copy(this.curC),
        b = this.carCentre(this.curC),
        // a jump of more than 12 m in one frame is a teleport or reset, not a path
        jump = this.jumped || a.distanceTo(b) > 12;
      this.jumped = !1;
      for (const it of this.items) {
        if (it.got) continue;
        const d = jump ? b.distanceTo(it.pos) : segDist(a, b, it.pos, this.tmp);
        (it.near = Math.min(it.near, d)), d <= PICK_RADIUS && this.collect(it);
      }
      this.got.length === WORD.length
        ? this.finish("word")
        : this.left <= 0 && this.finish("time");
    } else {
      this.settleT += dt;
      const p = this.phys.mode,
        g = this.game,
        landed = (p === "ground" || p === "crashed") && !(g.combo && g.combo.count);
      (landed || this.settleT >= SETTLE_MAX) && this.end();
    }
    this.showTime();
  }
  collect(it) {
    (it.got = !0), (it.pop = POP);
    const n = this.got.length,
      t = +this.elapsed.toFixed(2),
      cell = this.el.cells[it.index];
    cell.classList.remove("pop"),
      cell.offsetWidth,
      cell.classList.add("on", "pop"),
      this.sparks && this.sparks.burst(it.pos.clone(), v3(0, 1, 0), 36, 7),
      this.audio && this.audio.event("ring"),
      this.game.addScore(LETTER_PTS),
      this.log.push({ letter: it.letter, index: it.index, t }),
      emit("rd:letter", { letter: it.letter, index: it.index, t, count: n });
  }
  // The clock stops; a jump in progress may still land.
  finish(reason) {
    (this.state = "settle"), (this.reason = reason), (this.settleT = 0);
    if (reason === "word") {
      const bonus = WORD_PTS + SECOND_PTS * Math.floor(this.left);
      this.game.addScore(bonus),
        this.hud.toast("ROADSTER!", `All 8 letters with ${clock(this.left)} left · +${fmt(bonus)}`, !0),
        this.audio && this.audio.event("missionComplete");
    } else
      this.hud.flash("TIME", `${this.got.length} of 8 letters`),
        this.audio && this.audio.event("uiConfirm");
  }
  end() {
    const g = this.game;
    g.combo && g.combo.count && g.bank && g.bank();
    const n = this.got.length,
      score = g.score,
      time = this.reason === "word" ? this.elapsed : RUN_SECONDS,
      run = { score, letters: n, time: +time.toFixed(2) },
      b = this.best,
      newBest =
        !b ||
        score > b.score ||
        (score === b.score && (n > b.letters || (n === b.letters && time < b.time)));
    newBest && ((this.best = run), storageSet(BEST_KEY, JSON.stringify(run)));
    (this.state = "done"), this.leave();
    // results
    const r = this.res;
    (r.title.textContent = n === WORD.length ? "ROADSTER!" : "TIME UP"),
      r.cells.forEach((c, i) => c.classList.toggle("on", this.items[i].got)),
      (r.score.textContent = fmt(score)),
      (r.letters.textContent = `${n}/8`),
      (r.time.textContent = clock(time, !0)),
      (r.best.textContent = fmt(this.best.score)),
      (r.isNew.hidden = !newBest || !score),
      (r.el.hidden = !1),
      this.onResults();
    emit("rd:run", {
      phase: "end",
      score,
      letters: n,
      time: run.time,
      timeLeft: +this.left.toFixed(2),
      reason: this.reason,
      best: { ...this.best },
      newBest,
    });
  }

  // ── Minimap contract (guide): game.targets() ──
  targets() {
    const g = this.game,
      w = this.world,
      car = this.phys.pos,
      semi = w.lineup.find((b) => b.name === "semi"),
      ring = () => {
        let best = null,
          bd = 1 / 0;
        for (const r of g.rings || [])
          if (!(g.ringsGot && g.ringsGot.has(r.i))) {
            const d = Math.hypot(r.center.x - car.x, r.center.z - car.z);
            d < bd && ((bd = d), (best = r.center));
          }
        return best;
      },
      roof = semi ? boxTop(semi, 0) : WORLD.lineup,
      spot = {
        wall: w.wall.origin,
        reveal: w.wall.origin,
        lineup: WORLD.lineup,
        semiflip: roof,
        roof,
        hang: w.massdriver.origin,
        bullseye: w.massdriver.origin,
        vmax: v3(Math.max(-1100, Math.min(1100, car.x)), 0, WORLD.runwayZ),
        smoke: WORLD.donut,
        pipe: w.halfpipe.center,
        loop: w.loop.origin,
      };
    return {
      missions: MISSIONS.map((m) => {
        const p = m.id === "rings" ? ring() : spot[m.id];
        return { id: m.id, name: m.name, done: !!(g.done && g.done.has(m.id)), pos: p ? xyz(p) : null };
      }),
      letters: this.active
        ? this.items.map((it) => ({ letter: it.letter, index: it.index, got: it.got, pos: xyz(it.pos) }))
        : [],
    };
  }
}

export { PICK_RADIUS, RUN_SECONDS, RunMode, WORD, letterSpots };
