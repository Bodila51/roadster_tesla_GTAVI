import { Mesh, MeshStandardMaterial, TorusGeometry, Vector3 } from "three";
import { ComboUi } from "../ui/combo-ui.js";
import { storageGet, storageSet } from "../util/storage.js";
import { GRADE_MULT, landingGrade } from "./landing.js";
import { MISSIONS, MPS_TO_MPH } from "./missions.js";

// Flyover checks (lineup, Semi) only count below this height above the tallest roof
// of the row, so a hop just over the Semi counts and a flight far above it does not.
const FLY_CEILING = 5;
// Combos: every element (trick, air time, wall ride, flyover, ring, pipe air, loop,
// drift, ...) joins one combo whose multiplier grows by COMBO_STEP per element, up
// to COMBO_MAX. The combo stays alive in the air, on a ramp or wall, while drifting
// and for COMBO_GRACE s on the ground, then it banks (points x multiplier). A crash
// burns everything not banked yet. Points scored during a jump join the combo only
// when the jump lands, scaled by the landing grade (landing.js).
const COMBO_GRACE = 1.5,
  COMBO_STEP = 0.5,
  COMBO_MAX = 8;
// Game events for other modules: window CustomEvents with the payload in
// e.detail, sent synchronously from inside update() in the frame they happen.
//   rd:land    {grade, airTime, points, tricks, big, pos}  a jump ended on its wheels
//   rd:crash   {pos}                                      a jump or ride ended in a crash
//   rd:combo   {count, mult, points, state}               state grow | bank | burn
//   rd:mission {id, name}                                  a mission completed
const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));
const xyz = (v) => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) });

class GameState {
  constructor({ hud: e, audio: s, scene: t, lineup: i, ramp: o, bullseye: n }) {
    (this.bullseye = n),
      (this.hud = e),
      (this.audio = s),
      (this.lineup = i),
      (this.pipeH = 9.1),
      (this.ramp = o),
      (this.score = 0),
      (this.best = +(storageGet("rdstr.best") || 0)),
      (this.done = new Set(JSON.parse(storageGet("rdstr.done") || "[]"))),
      (this.ringsGot = new Set(JSON.parse(storageGet("rdstr.rings") || "[]"))),
      (this.pending = 0),
      (this.mult = 1),
      (this.tricks = []),
      (this.combo = null),
      (this.jump = null),
      (this.launchT = null),
      (this.drift = 0),
      (this.driftScore = 0),
      (this.slowmo = {
        t: 0,
        scale: 1,
      }),
      (this.autoSlowmo = !0),
      (this.flyCeil =
        Math.max(
          ...i.boxes.filter((h) => h.name !== "platform").map((h) => h.max.y),
        ) + FLY_CEILING),
      (this.rings = this.buildRings(t)),
      this.resetCombo(),
      this.hud.renderMissions(MISSIONS, this.done),
      this.hud.setScore(this.score, this.best),
      (this.comboUi = new ComboUi(this, COMBO_GRACE));
  }
  buildRings(e) {
    const s = [
        [30, 14, -30, 0.3],
        [70, 22, -90, 1],
        [10, 30, -200, 1.6],
        [-70, 20, -180, 2.4],
        [-120, 12, -90, 3],
        [-90, 26, 40, 3.8],
        [0, 38, 70, 4.7],
        [80, 16, 60, 5.6],
      ],
      t = new MeshStandardMaterial({
        color: 4120,
        emissive: 5953791,
        emissiveIntensity: 1.8,
        roughness: 0.3,
      }),
      i = new MeshStandardMaterial({
        color: 328965,
        emissive: 3211162,
        emissiveIntensity: 0.45,
        roughness: 0.3,
        transparent: !0,
        opacity: 0.35,
      }),
      o = new TorusGeometry(5.5, 0.22, 12, 72);
    return s.map(([c, r, l, d], f) => {
      const p = new Mesh(o, this.ringsGot.has(f) ? i : t);
      p.position.set(c, r, l), (p.rotation.y = d), e.add(p);
      const w = new Vector3(0, 0, 1).applyEuler(p.rotation);
      return {
        m: p,
        i: f,
        normal: w,
        center: p.position.clone(),
        r: 5.5,
        matGot: i,
        lastSide: null,
      };
    });
  }
  complete(e) {
    var t;
    if (this.done.has(e)) return;
    this.done.add(e), storageSet("rdstr.done", JSON.stringify([...this.done]));
    const s = MISSIONS.find((i) => i.id === e);
    this.hud.renderMissions(MISSIONS, this.done),
      emit("rd:mission", { id: e, name: s.name }),
      this.hud.toast("MISSION COMPLETE", s.name, !0),
      (t = this.audio) == null || t.event("missionComplete"),
      this.addScore(2500),
      this.done.size === MISSIONS.length &&
        setTimeout(
          () => this.hud.toast("ALL MISSIONS", "You are a Roadster pilot.", !0),
          2500,
        );
  }
  // Adds points straight to the score (missions, banked combos).
  addScore(e) {
    (this.score += e),
      this.score > this.best &&
        ((this.best = this.score), storageSet("rdstr.best", String(this.best))),
      this.hud.setScore(this.score, this.best);
  }
  resetCombo() {
    (this.combo = { count: 0, base: 0, jump: 0, names: [], grace: 0, last: "" }),
      (this.pending = 0),
      (this.mult = 1),
      (this.tricks = []);
  }
  get comboPoints() {
    const c = this.combo;
    return Math.round((c.base + c.jump) * this.mult);
  }
  // One combo element. During a jump the points wait for the landing grade.
  callTrick(e, s) {
    var t;
    const c = this.combo;
    this.jump ? ((c.jump += s), c.names.push(e)) : (c.base += s),
      c.count++,
      (c.last = e),
      (c.grace = COMBO_GRACE),
      this.tricks.push(e),
      (this.pending = c.base + c.jump),
      (this.mult = Math.min(COMBO_MAX, 1 + (c.count - 1) * COMBO_STEP)),
      this.hud.trick(e, s, this.mult),
      (t = this.audio) == null || t.event("trick", Math.min(5, c.count)),
      emit("rd:combo", {
        count: c.count,
        mult: this.mult,
        points: this.comboPoints,
        state: "grow",
      });
  }
  // Ends a jump: its points join the combo, scaled by the landing grade (no grade:
  // a short hop, points join as they are). Returns the points that joined.
  settleJump(grade) {
    const c = this.combo,
      pts = grade ? Math.round(c.jump * GRADE_MULT[grade]) : c.jump;
    return (
      (c.base += pts),
      (c.jump = 0),
      (c.names = []),
      (this.pending = c.base),
      c.count && (c.grace = COMBO_GRACE),
      pts
    );
  }
  bank() {
    const c = this.combo;
    if (!c.count) return;
    const s = this.comboPoints,
      n = c.count,
      m = this.mult;
    s > 0 &&
      (this.addScore(s), this.hud.banked(s, n > 1 ? `${n} TRICK COMBO` : c.last)),
      this.resetCombo(),
      emit("rd:combo", { count: n, mult: m, points: s, state: "bank" });
  }
  lose() {
    const c = this.combo;
    if (!c.count) return this.resetCombo();
    const s = this.comboPoints,
      n = c.count,
      m = this.mult;
    this.hud.lost(),
      this.resetCombo(),
      emit("rd:combo", { count: n, mult: m, points: s, state: "burn" });
  }
  requestSlowmo(e = 0.9, s = 0.33) {
    this.autoSlowmo &&
      (this.slowmo.cool > 0 ||
        ((this.slowmo.t = e),
        (this.slowmo.scale = s),
        (this.slowmo.cool = 3.5)));
  }
  get timeScale() {
    return this.slowmo.t > 0 ? this.slowmo.scale : 1;
  }
  update(e, s, t, i, o) {
    var r, l, d, f, p, w, S, y, b, L, m, v, x;
    (this.slowmo.t = Math.max(0, (this.slowmo.t || 0) - e)),
      (this.slowmo.cool = Math.max(0, (this.slowmo.cool || 0) - e));
    const n = t.speed,
      c = n * MPS_TO_MPH;
    for (const h of t.events)
      switch (h.type) {
        case "launch":
          (r = this.audio) == null || r.event("launchPop"), o.shake(0.25);
          break;
        case "airborne":
          this.jump = {
            over: new Set(),
            semiRoll: !1,
            startRoll: 0,
            maxAlt: 0,
            rolls: 0,
            fromRamp: t.fromRamp,
            lineupDir: 0,
          };
          break;
        case "rampEnter":
          h.surface === "wall" && o.startRampCut(),
            h.surface === "loop" && o.startSideCut(t.R, 12, 26, 8),
            (this.wallCalled = !1);
          break;
        case "rampExit":
          (this.jump = {
            over: new Set(),
            semiRoll: !1,
            maxAlt: 0,
            fromRamp: !0,
            inverted: h.inverted && h.surface === "wall",
            surface: h.surface,
            pipeAir: 0,
          }),
            h.inverted &&
              h.surface === "wall" &&
              (this.callTrick("INVERTED EXIT", 600),
              this.requestSlowmo(1.1, 0.3)),
            h.surface === "halfpipe" && this.callTrick("VERT AIR", 300),
            h.surface === "massdriver" &&
              (this.callTrick("MASS DRIVER LAUNCH", 1e3),
              this.requestSlowmo(1.2, 0.35),
              this.hud.toast(
                "AIM FOR THE BEAM",
                "Lift to stretch · thrust to push · land in the gold ring",
                !0,
              ));
          break;
        case "rampDone":
          h.surface === "loop" && o.endCut(0.8),
            h.surface === "loop" &&
              t.rampMaxTheta > Math.PI * 2 - 0.6 &&
              (this.callTrick("LOOP THE LOOP", 1500), this.complete("loop"));
          break;
        case "rampFall":
          (this.jump = {
            over: new Set(),
            fromRamp: !0,
          }),
            o.endCut(1.6);
          break;
        case "trick": {
          const u = h.count;
          let T, z;
          if (h.axis === "roll")
            (T =
              u === 1
                ? "KICKFLIP"
                : u === 2
                  ? "DOUBLE KICKFLIP"
                  : `${u}× KICKFLIP`),
              (z = 800 * u);
          else if (h.axis === "pitch") {
            const g = h.sign > 0;
            (T = (u > 1 ? `${u}× ` : "") + (g ? "FRONTFLIP" : "BACKFLIP")),
              (z = 700 * u);
          } else (T = `${360 * u}`), (z = 400 * u);
          this.callTrick(T, z),
            this.jump && (this.jump.tricks = (this.jump.tricks || 0) + 1),
            h.axis === "roll" &&
              this.jump &&
              (this.jump.rolls = Math.max(this.jump.rolls || 0, u)),
            h.axis === "roll" &&
              this.jump &&
              (this.overSemiNow || this.jump.rollOverSemi) &&
              (this.jump.semiRoll = !0);
          break;
        }
        case "land": {
          if (h.airTime < 0.35 && !((l = this.jump) != null && l.fromRamp)) {
            this.settleJump(null), (this.jump = null);
            break;
          }
          const T = h.impact > 12,
            grade = landingGrade(h.tilt, h.impact);
          if (
            ((d = this.audio) == null ||
              d.event(T ? "hardLand" : "land", Math.min(1, h.impact / 14)),
            o.shake(Math.min(0.9, h.impact * 0.05)),
            h.airTime > 0.8 &&
              this.callTrick(
                `AIR ${h.airTime.toFixed(1)}s`,
                Math.round(h.airTime * 150),
              ),
            h.airTime >= 6 && this.complete("hang"),
            (f = this.jump) != null &&
              f.fromRamp &&
              this.jump.inverted &&
              h.surface !== "wall" &&
              h.surface !== "halfpipe" &&
              grade !== "sloppy" &&
              (this.callTrick("THE REVEAL", 2e3), this.complete("reveal")),
            ((p = this.jump) == null ? void 0 : p.surface) === "massdriver" &&
              this.bullseye)
          ) {
            const z = this.bullseye.score(t.pos);
            z.pts > 0
              ? (this.callTrick(`${z.label} · ${z.d.toFixed(1)} m`, z.pts),
                z.label === "BULLSEYE" && this.complete("bullseye"))
              : this.hud.toast(
                  "MISSED THE TARGET",
                  `${Math.round(z.d)} m off. Try lift and thrust`,
                  !1,
                );
          }
          ((w = this.jump) == null ? void 0 : w.surface) === "halfpipe" &&
            this.jump.pipeAir >= 5 &&
            (this.callTrick(
              `PIPE AIR ${this.jump.pipeAir.toFixed(1)} m`,
              Math.round(this.jump.pipeAir * 120),
            ),
            h.surface === "halfpipe" && this.complete("pipe")),
            this.jump && this.jump.rolls >= 2 && this.complete("double"),
            this.jump &&
              (this.jump.over.size >= 5
                ? (this.callTrick("LINEUP CLEARED", 1500),
                  this.complete("lineup"))
                : this.jump.over.size > 0 &&
                  this.callTrick(
                    this.jump.over.size > 1
                      ? `FLYOVER ×${this.jump.over.size}`
                      : "FLYOVER",
                    250 * this.jump.over.size,
                  )),
            (S = this.jump) != null && S.semiRoll && this.complete("semiflip"),
            h.surface === "semi" &&
              (this.callTrick("ROOFTOP", 1200), this.complete("roof"));
          const J = this.jump,
            names = this.combo.names.slice(),
            raw = this.combo.jump,
            pts = this.settleJump(grade);
          grade === "perfect" &&
            raw > 0 &&
            ((d = this.audio) == null || d.event("trick", 5)),
            emit("rd:land", {
              grade,
              airTime: +h.airTime.toFixed(2),
              points: pts,
              tricks: names,
              big:
                h.airTime >= 2.5 ||
                ((J && J.tricks) || 0) >= 2 ||
                !!(J && J.over && J.over.size),
              pos: xyz(t.pos),
            }),
            (this.jump = null),
            o.endCut(0.9);
          break;
        }
        case "crash":
          (y = this.audio) == null ||
            y.event("crash", Math.min(1, (h.impact || 8) / 14)),
            o.shake(1),
            this.lose(),
            emit("rd:crash", { pos: xyz(t.pos) }),
            this.hud.flash("CRASH", "RCS recovery…"),
            (this.jump = null),
            o.endCut(1.4);
          break;
        case "scrape":
          (b = this.audio) == null || b.event("scrape");
          break;
        case "collide":
          h.speed > 3 &&
            ((L = this.audio) == null ||
              L.event(
                h.speed > 10 ? "crash" : "scrape",
                Math.min(1, h.speed / 16),
              ),
            o.shake(Math.min(0.6, h.speed * 0.04)));
          break;
        case "recover":
          (m = this.audio) == null || m.event("launchPop", 0.5);
          break;
      }
    if (
      (t.mode === "ramp" &&
        t.R.name === "wall" &&
        t.rampMaxTheta > Math.PI / 2 + 0.05 &&
        !this.wallCalled &&
        ((this.wallCalled = !0),
        this.callTrick("WALL RIDE", 500),
        this.complete("wall")),
      t.mode === "air" &&
        ((v = this.jump) == null ? void 0 : v.surface) === "halfpipe" &&
        (this.jump.pipeAir = Math.max(
          this.jump.pipeAir || 0,
          t.pos.y - this.pipeH,
        )),
      (this.overSemiNow = !1),
      t.mode === "air" && this.jump)
    )
      for (const h of this.lineup.boxes)
        h.name !== "platform" &&
          t.pos.x > h.min.x - 0.3 &&
          t.pos.x < h.max.x + 0.3 &&
          t.pos.z > h.min.z - 0.5 &&
          t.pos.z < h.max.z + 0.5 &&
          (t.pos.y >= this.flyCeil &&
            !this.jump.tooHigh &&
            ((this.jump.tooHigh = !0),
            this.hud.toast("TOO HIGH", "Fly within 5 m of the roofs", !1)),
          !0) &&
          t.pos.y > h.max.y - 0.2 &&
          t.pos.y < this.flyCeil &&
          (this.jump.over.has(h.name) ||
            (this.jump.over.add(h.name),
            this.jump.over.size === 1 &&
              (o.startLineupCut(this.lineup.center, Math.sign(t.vel.x) || 1),
              this.requestSlowmo(1.4, 0.38))),
          h.name === "semi" &&
            ((this.overSemiNow = !0),
            Math.abs(t.angVel.z) > 3 && (this.jump.rollOverSemi = !0)));
    if (t.mode === "ground") {
      const h = (i.throttle > 0.5 || i.boost) && !(i.brake > 0.5);
      if (
        ((this.prevSpeed ?? 0) < 0.3 &&
          h &&
          this.launchT === null &&
          (this.launchT = 0),
        this.launchT !== null)
      )
        if (!h || t.mode !== "ground") this.launchT = null;
        else if (((this.launchT += s), c >= 60)) {
          const u = this.launchT;
          this.hud.toast("0–60 MPH", `${u.toFixed(2)} s`, u < 1),
            u < 1 && this.complete("launch"),
            (this.launchT = null);
        } else this.launchT > 5 && (this.launchT = null);
    } else this.launchT = null;
    n < 0.3 && i.throttle < 0.5 && !i.boost && (this.launchT = null),
      (this.prevSpeed = n),
      c >= 230 && this.complete("vmax"),
      t.mode === "ground" && t.slip > 3.2 && n > 6
        ? ((this.drift += s),
          (this.driftScore += s * n * 6),
          this.hud.drift(this.drift, Math.round(this.driftScore)),
          this.drift >= 4 && this.complete("smoke"))
        : this.drift > 0 &&
          (this.drift > 1.2 &&
            this.callTrick("DRIFT", Math.round(this.driftScore)),
          (this.drift = 0),
          (this.driftScore = 0),
          this.hud.drift(0, 0));
    for (const h of this.rings) {
      const u = Math.sign(
        new Vector3().subVectors(t.pos, h.center).dot(h.normal),
      );
      h.lastSide !== null &&
        u !== h.lastSide &&
        t.pos.distanceTo(h.center) < h.r + 0.5 &&
        (this.ringsGot.has(h.i)
          ? this.jump &&
            !(this.jump.rings || (this.jump.rings = new Set())).has(h.i) &&
            (this.jump.rings.add(h.i), this.callTrick("RING", 250))
          : (this.jump &&
              (this.jump.rings || (this.jump.rings = new Set())).add(h.i),
            this.ringsGot.add(h.i),
          storageSet("rdstr.rings", JSON.stringify([...this.ringsGot])),
          (h.m.material = h.matGot),
          (x = this.audio) == null || x.event("ring"),
          this.callTrick(`RING ${this.ringsGot.size}/8`, 500),
          this.ringsGot.size >= 8 && this.complete("rings"))),
        (h.lastSide = u),
        (h.m.rotation.z += e * 0.4);
    }
    this.updateCombo(e, t, n);
    this.hud.telemetry({
      mph: c,
      gas: t.gas / 100,
      mode: t.mode,
      boost: t.thrust.boost > 0,
      lift: t.thrust.lift > 0,
      alt: t.mode === "air" ? t.pos.y : 0,
      air: t.mode === "air" ? t.airTime : 0,
      pending: this.pending,
      mult: this.mult,
      launchT: this.launchT,
    }),
      this.comboUi.frame();
  }
  // The combo lives while the car is in the air, on a ramp or wall, or drifting;
  // on the ground it banks once COMBO_GRACE s pass without a new element.
  updateCombo(e, t, n) {
    const c = this.combo;
    if (!c.count || t.mode === "crashed") return;
    t.mode === "air" ||
    t.mode === "ramp" ||
    (t.mode === "ground" && t.slip > 3.2 && n > 6)
      ? (c.grace = COMBO_GRACE)
      : (c.grace -= e) <= 0 && this.bank();
  }
  // Test harness hook: drop any combo in progress.
  resetForTest() {
    this.resetCombo(), (this.jump = null);
  }
  resetProgress() {
    this.done.clear(),
      this.ringsGot.clear(),
      storageSet("rdstr.done", "[]"),
      storageSet("rdstr.rings", "[]");
    for (const e of this.rings)
      e.m.material = (this.rings[0].m.material === e.matGot, e.m.material);
    this.hud.renderMissions(MISSIONS, this.done), location.reload();
  }
}

export { GameState };
