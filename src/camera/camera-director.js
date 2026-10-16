import { MathUtils, Vector3 } from "three";

const CAMERA_MODES = ["chase", "broadcast", "drone", "bumper"],
  // TV director (broadcast mode): choose the trackside camera nearest to where the
  // car will be BC_LEAD s from now, hold every shot at least BC_MIN_SHOT s and only
  // cut when the new camera is clearly closer (BC_HYST and BC_HYST_M), so it never
  // flips back and forth between two cameras. A shot may end after BC_URGENT_SHOT s
  // when the best camera is less than half as far (BC_URGENT), or at once when the
  // car is more than BC_FAR m away.
  BC_LEAD = 1,
  BC_MIN_SHOT = 2.5,
  BC_HYST = 0.8,
  BC_HYST_M = 4,
  BC_URGENT_SHOT = 1,
  BC_URGENT = 0.5,
  BC_FAR = 250,
  // Phones: every FOV below is tuned for a 16:9 screen (REF_ASPECT). A narrower
  // screen gets a wider vertical FOV (fitFov) so a portrait phone still sees the
  // road and the car does not fill the width, and the chase camera pulls back a
  // little (CHASE_PULLBACK at full portrait, NARROW_ASPECT = 390x844). Fixed
  // cameras (cuts, TV, drone) cannot pull back, so they widen more (FIT_FIXED).
  // Screens as wide as 16:9 or wider keep the original vertical FOV.
  REF_ASPECT = 16 / 9,
  NARROW_ASPECT = 390 / 844,
  FIT_CHASE = 0.35,
  FIT_FIXED = 0.6,
  FOV_MAX = 100,
  CHASE_PULLBACK = 0.28;
// How portrait the screen is: 0 at 16:9 or wider, 1 at a 390x844 phone.
function narrowness(aspect) {
  return MathUtils.clamp(
    (REF_ASPECT - aspect) / (REF_ASPECT - NARROW_ASPECT),
    0,
    1,
  );
}
// Vertical FOV (degrees) for this aspect from one tuned for 16:9: on narrower
// screens tan(fov/2) grows with (REF_ASPECT / aspect) ^ pow (pow 1 keeps the
// 16:9 horizontal FOV, pow 0 keeps the vertical one), capped at FOV_MAX.
function fitFov(fov, aspect, pow = FIT_CHASE) {
  if (!(aspect > 0) || aspect >= REF_ASPECT) return fov;
  const t =
    Math.tan((fov * Math.PI) / 360) * Math.pow(REF_ASPECT / aspect, pow);
  return Math.min(FOV_MAX, (Math.atan(t) * 360) / Math.PI);
}
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
      (this.autoCuts = !0),
      (this.bcIdx = -1),
      (this.bcAge = 0);
  }
  cycle() {
    const e = CAMERA_MODES.indexOf(this.mode);
    return (
      (this.mode = CAMERA_MODES[(e + 1) % CAMERA_MODES.length]),
      (this.cut = null),
      (this.bcIdx = -1),
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
      r = i.clone().addScaledVector(o, 0.6),
      asp = this.cam.aspect || REF_ASPECT;
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
      (f = fitFov(
        MathUtils.clamp((2 * Math.atan(9 / y) * 180) / Math.PI, 14, 60),
        asp,
        FIT_FIXED,
      )),
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
      const pb = 1 + CHASE_PULLBACK * narrowness(asp),
        L =
          (6.6 + Math.min(4, c * 0.035) + (s.mode === "air" ? 2.5 : 0)) * pb,
        m = (2 + (s.mode === "air" ? 1.6 : 0) + Math.min(1.2, c * 0.008)) * pb,
        v = s.mode === "ramp" ? o : new Vector3(0, 1, 0);
      (l = r.clone().addScaledVector(this.behind, -L).addScaledVector(v, m)),
        l.y < 0.6 && (l.y = 0.6),
        (d = r
          .clone()
          .addScaledVector(this.behind, 2.5 + c * 0.02)
          .addScaledVector(v, 0.4)),
        (f = fitFov(60 + Math.min(20, c * 0.2) + (t.boost ? 6 : 0), asp));
      const x = s.mode === "ramp" ? 7 : 9;
      this.pos.lerp(l, 1 - Math.exp(-e * x)),
        this.look.lerp(d, 1 - Math.exp(-e * 14));
    } else if (this.mode === "broadcast") {
      const ahead = r.clone().addScaledVector(s.vel, BC_LEAD),
        cams = this.broadcastCams;
      let best = 0,
        bestD = 1 / 0;
      for (let k = 0; k < cams.length; k++) {
        const m = cams[k].distanceTo(ahead);
        m < bestD && ((bestD = m), (best = k));
      }
      this.bcAge += e;
      const cur = this.bcIdx,
        curD = cur >= 0 ? cams[cur].distanceTo(ahead) : 1 / 0,
        better = best !== cur && bestD < curD * BC_HYST - BC_HYST_M,
        cutNow =
          cur < 0 ||
          (better &&
            (this.bcAge >= BC_MIN_SHOT ||
              curD > BC_FAR ||
              (this.bcAge >= BC_URGENT_SHOT && bestD < curD * BC_URGENT)));
      cutNow && ((this.bcIdx = best), (this.bcAge = 0));
      const y = cams[this.bcIdx],
        b = y.distanceTo(r);
      (l = y),
        (d = r),
        (f = fitFov(
          MathUtils.clamp((2 * Math.atan(7 / b) * 180) / Math.PI, 8, 55),
          asp,
          FIT_FIXED,
        )),
        this.pos.copy(y),
        cutNow
          ? (this.look.copy(d), (this.fov = f))
          : this.look.lerp(d, 1 - Math.exp(-e * 9));
    } else if (this.mode === "drone") {
      const y = this.t * 0.18;
      (l = r.clone().add(new Vector3(Math.cos(y) * 22, 14, Math.sin(y) * 22))),
        (d = r),
        (f = fitFov(45, asp, FIT_FIXED)),
        this.pos.lerp(l, 1 - Math.exp(-e * 3)),
        this.look.lerp(d, 1 - Math.exp(-e * 8));
    } else
      (l = i.clone().addScaledVector(n, 2.35).addScaledVector(o, 0.45)),
        (d = l.clone().addScaledVector(n, 10).addScaledVector(o, 0.2)),
        (f = fitFov(72 + Math.min(16, c * 0.15), asp)),
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

export { CameraDirector, fitFov };
