import { MathUtils, Vector3 } from "three";

const CAMERA_MODES = ["chase", "broadcast", "drone", "bumper"];
class CameraDirector {
  constructor(e, s, t = [s]) {
    (this.cam = e),
      (this.ramp = s),
      (this.surfaces = t),
      (this.mode = "chase"),
      (this.pos = new Vector3(0, 4, 40)),
      (this.look = new Vector3()),
      (this.behind = new Vector3(0, 0, 1)),
      (this.shakeAmp = 0),
      (this.fov = 62),
      (this.cut = null),
      (this.cutHold = 0),
      (this.t = 0),
      (this.broadcastCams = [
        new Vector3(-30, 3, -120),
        new Vector3(30, 9, -95),
        new Vector3(110, 2.5, -8),
        new Vector3(60, 1.6, -60),
        new Vector3(-60, 6, 10),
        new Vector3(-120, 3, 0),
        new Vector3(0, 2, 90),
        new Vector3(200, 4, 115),
        new Vector3(-200, 4, 165),
        new Vector3(500, 3, 110),
        new Vector3(-500, 3, 170),
        new Vector3(160, 14, -70),
      ]),
      (this.autoCuts = !0);
  }
  cycle() {
    const e = CAMERA_MODES.indexOf(this.mode);
    return (
      (this.mode = CAMERA_MODES[(e + 1) % CAMERA_MODES.length]),
      (this.cut = null),
      this.mode
    );
  }
  shake(e) {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + e);
  }
  startRampCut() {
    if (!this.autoCuts || this.mode !== "chase") return;
    const e = this.ramp,
      s = e.r.clone().multiplyScalar(34),
      t = e.origin.clone().addScaledVector(e.f, 2).add(s).setY(7);
    (this.cut = {
      kind: "ramp",
      pos: t,
      fovBase: 34,
    }),
      (this.cutHold = 0);
  }
  startSideCut(e, s, t, i) {
    if (!this.autoCuts || this.mode !== "chase") return;
    const o = e.half + (e.shiftTotal || 0) / 2 + t,
      n = e.origin
        .clone()
        .addScaledVector(e.f, s)
        .addScaledVector(e.r, -o + (e.shiftTotal || 0) / 2)
        .setY(i);
    (this.cut = {
      kind: "side",
      pos: n,
      fovBase: 40,
    }),
      (this.cutHold = 0);
  }
  startLineupCut(e, s) {
    !this.autoCuts ||
      this.mode !== "chase" ||
      ((this.cut = {
        kind: "lineup",
        pos: e.clone().add(new Vector3(-s * 6, 1.4, 34)),
        fovBase: 40,
      }),
      (this.cutHold = 0));
  }
  endCut(e = 0.6) {
    this.cut && (this.cut.endIn = e);
  }
  update(e, s, t = {}) {
    this.t += e;
    const i = s.pos,
      o = s.up,
      n = s.fwd,
      c = s.speed,
      r = i.clone().addScaledVector(o, 0.6);
    let l, d, f;
    if (
      (this.cut &&
        ((this.cutHold += e),
        this.cut.endIn !== void 0 &&
          ((this.cut.endIn -= e), this.cut.endIn <= 0 && (this.cut = null))),
      this.cut)
    ) {
      (l = this.cut.pos), (d = r);
      const y = this.cut.pos.distanceTo(r);
      (f = MathUtils.clamp((2 * Math.atan(9 / y) * 180) / Math.PI, 14, 60)),
        this.pos.lerp(l, 1 - Math.exp(-e * 6)),
        this.look.lerp(d, 1 - Math.exp(-e * 10));
    } else if (this.mode === "chase") {
      let y;
      s.mode === "ground"
        ? ((y = n.clone()), (y.y = 0), s.vel.dot(y) < -2 && y.negate().negate())
        : s.mode === "ramp"
          ? (y = n.clone())
          : ((y = s.vel.clone()),
            (y.y = 0),
            y.lengthSq() < 4 && y.copy(this.behind)),
        y.normalize(),
        this.behind.dot(y) < -0.3 && this.behind.copy(y);
      const b = s.mode === "air" || s.mode === "crashed" ? 2.2 : 5.5;
      this.behind.lerp(y, 1 - Math.exp(-e * b)).normalize();
      const L = 6.6 + Math.min(4, c * 0.035) + (s.mode === "air" ? 2.5 : 0),
        m = 2 + (s.mode === "air" ? 1.6 : 0) + Math.min(1.2, c * 0.008),
        v = s.mode === "ramp" ? o : new Vector3(0, 1, 0);
      (l = r.clone().addScaledVector(this.behind, -L).addScaledVector(v, m)),
        l.y < 0.6 && (l.y = 0.6),
        (d = r
          .clone()
          .addScaledVector(this.behind, 2.5 + c * 0.02)
          .addScaledVector(v, 0.4)),
        (f = 60 + Math.min(20, c * 0.2) + (t.boost ? 6 : 0));
      const x = s.mode === "ramp" ? 7 : 9;
      this.pos.lerp(l, 1 - Math.exp(-e * x)),
        this.look.lerp(d, 1 - Math.exp(-e * 14));
    } else if (this.mode === "broadcast") {
      let y = this.broadcastCams[0],
        b = 1 / 0;
      for (const L of this.broadcastCams) {
        const m = L.distanceTo(r);
        m < b && ((b = m), (y = L));
      }
      (l = y),
        (d = r),
        (f = MathUtils.clamp((2 * Math.atan(7 / b) * 180) / Math.PI, 8, 55)),
        this.pos.lerp(
          l,
          b > 0 && this.pos.distanceTo(y) > 30 ? 1 : 1 - Math.exp(-e * 8),
        ),
        this.look.lerp(d, 1 - Math.exp(-e * 9));
    } else if (this.mode === "drone") {
      const y = this.t * 0.18;
      (l = r.clone().add(new Vector3(Math.cos(y) * 22, 14, Math.sin(y) * 22))),
        (d = r),
        (f = 45),
        this.pos.lerp(l, 1 - Math.exp(-e * 3)),
        this.look.lerp(d, 1 - Math.exp(-e * 8));
    } else
      (l = i.clone().addScaledVector(n, 2.35).addScaledVector(o, 0.45)),
        (d = l.clone().addScaledVector(n, 10).addScaledVector(o, 0.2)),
        (f = 72 + Math.min(16, c * 0.15)),
        this.pos.copy(l),
        this.look.copy(d),
        this.cam.up.copy(o);
    if (
      (this.mode !== "bumper" && this.cam.up.set(0, 1, 0),
      this.mode !== "bumper")
    )
      for (const y of this.surfaces) {
        const b = y.project(r);
        if (Math.abs(b.u) > y.half + 2.5 || b.d < -0.5 || b.d > 30) continue;
        const L = y.project(this.pos);
        Math.abs(L.u) > y.half + 1.5 ||
          L.s <= 0.05 ||
          L.s >= y.L - 0.05 ||
          (L.d < 0.9 &&
            L.d > -10 &&
            this.pos.addScaledVector(y.normal(L.s), 0.9 - L.d));
      }
    (this.fov += (f - this.fov) * (1 - Math.exp(-e * 4))),
      (this.cam.fov = this.fov),
      this.cam.updateProjectionMatrix(),
      (this.shakeAmp *= Math.exp(-e * 4.5));
    const p = this.shakeAmp + (t.rumble || 0),
      w = (Math.sin(this.t * 47.3) + Math.sin(this.t * 31.1)) * 0.5 * p * 0.18,
      S = (Math.sin(this.t * 53.7) + Math.sin(this.t * 23.9)) * 0.5 * p * 0.18;
    this.cam.position.copy(this.pos).add(new Vector3(w, S, 0)),
      this.cam.lookAt(this.look);
  }
}

export { CameraDirector };
