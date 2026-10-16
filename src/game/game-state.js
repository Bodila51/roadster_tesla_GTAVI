import { Mesh, MeshStandardMaterial, TorusGeometry, Vector3 } from "three";
import { storageGet, storageSet } from "../util/storage.js";
import { MISSIONS, MPS_TO_MPH } from "./missions.js";

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
      (this.jump = null),
      (this.launchT = null),
      (this.drift = 0),
      (this.driftScore = 0),
      (this.slowmo = {
        t: 0,
        scale: 1,
      }),
      (this.autoSlowmo = !0),
      (this.rings = this.buildRings(t)),
      this.hud.renderMissions(MISSIONS, this.done),
      this.hud.setScore(this.score, this.best);
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
        emissiveIntensity: 5,
        roughness: 0.3,
      }),
      i = new MeshStandardMaterial({
        color: 328965,
        emissive: 3211162,
        emissiveIntensity: 1.2,
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
      this.hud.toast("MISSION COMPLETE", s.name, !0),
      (t = this.audio) == null || t.event("missionComplete"),
      this.addScore(2500, !1),
      this.done.size === MISSIONS.length &&
        setTimeout(
          () => this.hud.toast("ALL MISSIONS", "You are a Roadster pilot.", !0),
          2500,
        );
  }
  addScore(e, s = !0) {
    if (s) {
      this.pending += e;
      return;
    }
    (this.score += e),
      this.score > this.best &&
        ((this.best = this.score), storageSet("rdstr.best", String(this.best))),
      this.hud.setScore(this.score, this.best);
  }
  callTrick(e, s) {
    var t;
    this.tricks.push(e),
      (this.pending += s),
      (this.mult = Math.min(8, 1 + (this.tricks.length - 1) * 0.5)),
      this.hud.trick(e, s, this.mult),
      (t = this.audio) == null ||
        t.event("trick", Math.min(5, this.tricks.length));
  }
  bank(e) {
    if (this.pending > 0) {
      const s = Math.round(this.pending * this.mult);
      this.addScore(s, !1), this.hud.banked(s, e);
    }
    (this.pending = 0), (this.mult = 1), (this.tricks = []);
  }
  lose() {
    this.pending > 0 && this.hud.lost(),
      (this.pending = 0),
      (this.mult = 1),
      (this.tricks = []);
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
              (this.callTrick("LOOP THE LOOP", 1500),
              this.complete("loop"),
              this.bank("LOOP"));
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
            h.axis === "roll" && u >= 2 && this.complete("double"),
            h.axis === "roll" &&
              this.jump &&
              (this.overSemiNow || this.jump.rollOverSemi) &&
              (this.jump.semiRoll = !0);
          break;
        }
        case "land": {
          if (h.airTime < 0.35 && !((l = this.jump) != null && l.fromRamp)) {
            this.jump = null;
            break;
          }
          const u = h.tilt > 0.82,
            T = h.impact > 12;
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
                  `${Math.round(z.d)} m off — try lift and thrust`,
                  !1,
                );
          }
          ((w = this.jump) == null ? void 0 : w.surface) === "halfpipe" &&
            this.jump.pipeAir >= 5 &&
            (this.callTrick(
              `PIPE AIR ${this.jump.pipeAir.toFixed(1)} m`,
              Math.round(this.jump.pipeAir * 120),
            ),
            this.complete("pipe")),
            this.jump &&
              this.jump.over.size >= 5 &&
              (this.callTrick("LINEUP CLEARED", 1500), this.complete("lineup")),
            (S = this.jump) != null && S.semiRoll && this.complete("semiflip"),
            h.surface === "semi" &&
              (this.callTrick("ROOFTOP", 1200), this.complete("roof")),
            u &&
              h.airTime > 1 &&
              this.callTrick(
                T ? "HEAVY LANDING" : "CLEAN LANDING",
                T ? 100 : 300,
              ),
            this.bank(u ? "LANDED" : "SKETCHY"),
            (this.jump = null),
            o.endCut(0.9);
          break;
        }
        case "crash":
          (y = this.audio) == null ||
            y.event("crash", Math.min(1, (h.impact || 8) / 14)),
            o.shake(1),
            this.lose(),
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
          t.pos.y > h.max.y - 0.2 &&
          (this.jump.over.has(h.name) ||
            (this.jump.over.add(h.name),
            this.jump.over.size === 1 &&
              (o.startLineupCut(this.lineup.center, Math.sign(t.vel.x) || 1),
              this.requestSlowmo(1.4, 0.38))),
          h.name === "semi" &&
            ((this.overSemiNow = !0),
            Math.abs(t.angVel.z) > 3 && (this.jump.rollOverSemi = !0)));
    if (t.mode === "ground") {
      const h = i.throttle > 0.5 || i.boost;
      if (
        ((this.prevSpeed ?? 0) < 0.3 &&
          h &&
          this.launchT === null &&
          (this.launchT = s),
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
            (this.addScore(Math.round(this.driftScore), !1),
            this.hud.banked(Math.round(this.driftScore), "DRIFT")),
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
        (this.ringsGot.has(h.i) ||
          (this.ringsGot.add(h.i),
          storageSet("rdstr.rings", JSON.stringify([...this.ringsGot])),
          (h.m.material = h.matGot),
          (x = this.audio) == null || x.event("ring"),
          this.callTrick(`RING ${this.ringsGot.size}/8`, 500),
          this.ringsGot.size >= 8 && this.complete("rings"))),
        (h.lastSide = u),
        (h.m.rotation.z += e * 0.4);
    }
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
    });
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
