import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import { CAR_DIMS } from "../car/profile.js";

const GRAVITY = 9.81,
  UP = new Vector3(0, 1, 0),
  WHEELBASE = CAR_DIMS.frontAxle - CAR_DIMS.rearAxle,
  TUNING = {
    motorPower: 340,
    motorMax: 17,
    drag: 9e-4,
    roll: 0.25,
    brake: 16,
    boostBase: 6.5,
    boostLaunch: 19.5,
    liftAccel: 17,
    launchPop: 8.2,
    airBoost: 9,
    gasMax: 100,
    gasLift: 26,
    gasBoost: 15,
    gasRcs: 3,
    gasRegen: 32,
    rollRate: 7.6,
    pitchRate: 5.4,
    yawRate: 4.4,
  };
class CarPhysics {
  constructor({ ramp: e, ramps: s, colliders: t = [], surfaces: i = [] }) {
    (this.ramps = s || [e]),
      (this.ramp = this.ramps[0]),
      (this.R = this.ramp),
      (this.colliders = t),
      (this.surfaces = i),
      (this.pos = new Vector3()),
      (this.vel = new Vector3()),
      (this.quat = new Quaternion()),
      (this.angVel = new Vector3()),
      (this.events = []),
      this.reset(new Vector3(0, 0, 30), Math.PI);
  }
  reset(e, s = Math.PI) {
    (this.mode = "ground"),
      this.pos.copy(e),
      this.vel.set(0, 0, 0),
      (this.yaw = s),
      (this.yawRate = 0),
      (this.steer = 0),
      (this.h = this.surfaceAt(e.x, e.z, e.y + 0.5).h),
      (this.pos.y = this.h),
      this.quat.setFromAxisAngle(UP, s),
      this.angVel.set(0, 0, 0),
      (this.gas = TUNING.gasMax),
      (this.airTime = 0),
      (this.rot = {
        roll: 0,
        pitch: 0,
        yaw: 0,
      }),
      (this.tricksCalled = {
        roll: 0,
        pitch: 0,
        yaw: 0,
      }),
      (this.crashT = 0),
      (this.recoverT = 0),
      (this.susp = 0),
      (this.suspV = 0),
      (this.bodyRoll = 0),
      (this.bodyPitch = 0),
      (this.slip = 0),
      (this.burnout = 0),
      (this.thrust = {
        lift: 0,
        boost: 0,
        rcs: 0,
        side: 0,
      }),
      (this.wheelSpin = 0),
      (this.fromRamp = !1),
      (this.rampMaxTheta = 0),
      (this.lastInputT = 0),
      (this.onSurface = "ground");
  }
  get fwd() {
    return new Vector3(0, 0, 1).applyQuaternion(this.quat);
  }
  get up() {
    return new Vector3(0, 1, 0).applyQuaternion(this.quat);
  }
  get left() {
    return new Vector3(1, 0, 0).applyQuaternion(this.quat);
  }
  get speed() {
    return this.vel.length();
  }
  surfaceAt(e, s, t) {
    let i = 0,
      o = "ground";
    for (const n of this.surfaces)
      e >= n.min.x &&
        e <= n.max.x &&
        s >= n.min.z &&
        s <= n.max.z &&
        n.max.y <= t &&
        n.max.y > i &&
        ((i = n.max.y), (o = n.name));
    return {
      h: i,
      name: o,
    };
  }
  motorAccel(e) {
    const s = Math.max(0.5, Math.abs(e));
    return Math.min(TUNING.motorMax, TUNING.motorPower / s);
  }
  boostAccel(e) {
    return (
      TUNING.boostBase + TUNING.boostLaunch * Math.max(0, 1 - Math.abs(e) / 40)
    );
  }
  emit(e, s = {}) {
    this.events.push({
      type: e,
      ...s,
    });
  }
  update(e, s) {
    if (!(e > 0)) return;
    const t = Math.max(1, Math.ceil(e / (1 / 240))),
      i = e / t;
    for (let n = 0; n < t; n++) this.step(i, s);
    const o = 16;
    (this.suspV += (-180 * this.susp - o * this.suspV) * e),
      (this.susp += this.suspV * e);
  }
  step(e, s) {
    (this.thrust.lift = 0),
      (this.thrust.boost = 0),
      (this.thrust.rcs = 0),
      (this.thrust.side = 0),
      this.mode === "ground"
        ? this.stepGround(e, s)
        : this.mode === "ramp"
          ? this.stepRamp(e, s)
          : this.mode === "air"
            ? this.stepAir(e, s)
            : this.mode === "crashed" && this.stepCrashed(e, s),
      (this.gas = Math.min(TUNING.gasMax, Math.max(0, this.gas)));
  }
  steerUpdate(e, s, t) {
    this.steer += (s.steer - this.steer) * Math.min(1, e * 7);
    const i = 0.62 / (1 + Math.abs(t) / 15),
      o = this.steer * i;
    let n = (t * Math.tan(o)) / WHEELBASE;
    return (
      s.drift &&
        Math.abs(t) > 4 &&
        (n = n * 1.75 + this.steer * 0.6 * Math.sign(t)),
      (this.yawRate += (n - this.yawRate) * Math.min(1, e * (s.drift ? 4 : 9))),
      this.yawRate
    );
  }
  longAccel(e, s, t, i = !0) {
    let o = 0;
    const n = s.throttle,
      c = s.brake;
    return (
      n > 0 && (o += t < -0.5 ? TUNING.brake * n : n * this.motorAccel(t)),
      c > 0 && (o += t > 0.5 ? -16 * c : t > -14 ? -6 * c : 0),
      i &&
        s.boost &&
        this.gas > 0.5 &&
        ((o += this.boostAccel(t)),
        (this.gas -= TUNING.gasBoost * e),
        (this.thrust.boost = 1)),
      (o -= Math.sign(t) * (TUNING.roll + TUNING.drag * t * t)),
      o
    );
  }
  stepGround(e, s) {
    const t = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)),
      i = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let o = this.vel.dot(t),
      n = this.vel.dot(i);
    const c = s.throttle > 0.5 && s.brake > 0.5 && Math.abs(o) < 4;
    (this.burnout = c
      ? Math.min(1, this.burnout + e * 3)
      : Math.max(0, this.burnout - e * 3)),
      (this.yaw += this.steerUpdate(e, s, o) * e),
      c
        ? ((this.yaw += this.steer * 2.2 * e), (o *= Math.exp(-6 * e)))
        : (o += this.longAccel(e, s, o) * e),
      s.drift && (o -= Math.sign(o) * 1.2 * e),
      (o = Math.max(-14, o));
    const r = s.drift ? 1.5 : Math.max(5, 12 - Math.abs(o) / 14);
    (n *= Math.exp(-r * e)),
      (this.slip = Math.abs(n)),
      this.vel.copy(t).multiplyScalar(o).addScaledVector(i, n);
    const l = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)),
      d = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    (this.vel.y = 0),
      this.pos.addScaledVector(this.vel, e),
      s.boost || (this.gas += TUNING.gasRegen * e);
    let f = {
      h: -1,
      name: "ground",
    };
    for (const [w, S] of [
      [CAR_DIMS.track, CAR_DIMS.frontAxle],
      [-0.84, CAR_DIMS.frontAxle],
      [CAR_DIMS.track, CAR_DIMS.rearAxle],
      [-0.84, CAR_DIMS.rearAxle],
    ]) {
      const y = this.pos.x + l.x * S + d.x * w,
        b = this.pos.z + l.z * S + d.z * w,
        L = this.surfaceAt(y, b, this.h + 0.35);
      L.h > f.h && (f = L);
    }
    if (f.h < this.h - 0.25) {
      this.toAir();
      return;
    }
    f.h > this.h + 0.01 && (this.susp -= (f.h - this.h) * 0.6),
      (this.h = f.h),
      (this.pos.y = this.h),
      (this.onSurface = f.name);
    const p = (o - (this._lastVF ?? o)) / e;
    (this._lastVF = o),
      Number.isFinite(p) &&
        (this.bodyPitch +=
          (-MathUtils.clamp(p, -40, 40) * 0.0022 - this.bodyPitch) *
          Math.min(1, e * 6)),
      (this.bodyRoll +=
        (this.yawRate * o * 0.0016 - this.bodyRoll) * Math.min(1, e * 6)),
      this.quat.setFromAxisAngle(UP, this.yaw),
      (this.wheelSpin += (o * e) / CAR_DIMS.wheelRadius),
      this.collide(e),
      this.checkRampEntry(),
      s.liftPressed &&
        this.gas > 8 &&
        ((this.vel.y = TUNING.launchPop),
        (this.gas -= 6),
        this.emit("launch"),
        this.toAir());
  }
  toAir() {
    (this.mode = "air"),
      (this.airTime = 0),
      (this.rot = {
        roll: 0,
        pitch: 0,
        yaw: 0,
      }),
      (this.tricksCalled = {
        roll: 0,
        pitch: 0,
        yaw: 0,
      }),
      this.angVel.set(0, this.yawRate * 0.8, 0),
      this.emit("airborne");
  }
  enterSurface(e, s, t) {
    (this.mode = "ramp"), (this.R = e), (this.rs = s), (this.ru = t);
    const i = e.tangent(s),
      o = this.fwd;
    (this.rpsi = Math.atan2(o.dot(e.r), o.dot(i))),
      (this.rv = this.vel.length() * Math.sign(this.vel.dot(o) || 1)),
      (this.rampMaxTheta = 0),
      this.emit("rampEnter", {
        surface: e.name,
      });
  }
  checkRampEntry() {
    for (const e of this.ramps) {
      const s = new Vector3().subVectors(this.pos, e.origin),
        t = s.dot(e.f),
        i = s.dot(e.r);
      if (e.entry === "lip") {
        if (
          t >= -0.2 &&
          t < 2.4 &&
          Math.abs(i) < e.half - 0.4 &&
          this.vel.dot(e.f) > 1
        )
          return this.enterSurface(e, Math.max(0, t), i), !0;
        if (
          e.sideSolid &&
          t > 2.4 &&
          t < e.fMax + 0.2 &&
          Math.abs(i) < e.half + 1
        ) {
          const o = e.sample(Math.min(e.L, t));
          if (this.pos.y < o.y + 0.2 || t > 6) {
            const n = Math.sign(i) || 1,
              c = e.half + 1 - Math.abs(i);
            this.pos.addScaledVector(e.r, n * c);
            const r = this.vel.dot(e.r) * n;
            r < 0 && this.vel.addScaledVector(e.r, -1.3 * r * n),
              this.emit("collide", {
                speed: -r,
              });
          }
        }
      } else if (
        e.entry === "flat" &&
        t > 0 &&
        t < e.pipeWidth &&
        Math.abs(i) < e.half + 1
      ) {
        const o = e.sample(e.flatS0).f,
          n = e.sample(e.flatS1).f;
        if (t > o + 0.3 && t < n - 0.3) {
          if (Math.abs(i) < e.half && this.pos.y < 0.6)
            return this.enterSurface(e, e.flatS0 + (t - o), i), !0;
          continue;
        }
        if (this.pos.y > e.H - 0.5) continue;
        const r = Math.sign(i) || 1,
          l = e.half + 1 - Math.abs(i);
        this.pos.addScaledVector(e.r, r * l);
        const d = this.vel.dot(e.r) * r;
        d < 0 && this.vel.addScaledVector(e.r, -1.3 * d * r),
          this.emit("collide", {
            speed: -d,
          });
      }
    }
    return !1;
  }
  stepRamp(e, s) {
    const t = this.R,
      i = t.sample(this.rs),
      o = t.tangent(this.rs),
      n = t.normal(this.rs);
    this.steer += (s.steer - this.steer) * Math.min(1, e * 7);
    const c = 0.62 / (1 + Math.abs(this.rv) / 15),
      r =
        ((this.rv * Math.tan(this.steer * c)) / WHEELBASE) *
        (t.entry === "flat" ? 1 : 0.55);
    (this.rpsi -= r * e),
      t.entry !== "flat" && (this.rpsi *= Math.exp(-0.4 * e));
    let l = this.longAccel(e, s, this.rv);
    t.entry === "flat" && l > 0 && (l *= Math.max(0.3, Math.cos(i.th))),
      t.railAccel &&
        this.rv > 0 &&
        this.rv < t.railTop &&
        ((l += t.railAccel), (this.thrust.boost = 1)),
      (l -= GRAVITY * Math.sin(i.th) * Math.cos(this.rpsi)),
      (this.rv += l * e),
      (this.rs += this.rv * Math.cos(this.rpsi) * e),
      (this.ru += this.rv * Math.sin(this.rpsi) * e),
      (this.rampMaxTheta = Math.max(this.rampMaxTheta, i.th)),
      (this.slip = 0),
      (this.gas += TUNING.gasRegen * 0.4 * e);
    const d = o
      .clone()
      .multiplyScalar(Math.cos(this.rpsi))
      .addScaledVector(t.r, Math.sin(this.rpsi))
      .normalize();
    this.vel.copy(d).multiplyScalar(this.rv);
    const f = new Vector3().crossVectors(n, d).normalize(),
      p = new Matrix4().makeBasis(f, n, d);
    this.quat.setFromRotationMatrix(p),
      t.point(this.rs, this.ru, this.pos),
      (this.wheelSpin += (this.rv * e) / CAR_DIMS.wheelRadius),
      (this.bodyPitch *= 0.9),
      (this.bodyRoll *= 0.9);
    const w =
        this.rv * this.rv * i.k * Math.cos(this.rpsi) ** 2 +
        GRAVITY * Math.cos(i.th),
      S = s.throttle > 0.05 || Math.abs(this.rv) > 4 ? 15 : 2.5;
    this.thrust.suction = 1;
    const y = (L) => {
      if (t.railTop && this.rv > 0) {
        const m = Math.max(this.rv, t.railTop - 2);
        this.vel.multiplyScalar(m / this.rv), (this.rv = m);
      }
      if (t.entry === "flat" && Math.abs(this.rv) > 16) {
        const m = Math.sign(this.rv) * (16 + (Math.abs(this.rv) - 16) * 0.3);
        this.vel.multiplyScalar(m / this.rv), (this.rv = m);
      }
      (this.mode = "air"),
        (this.airTime = 0),
        (this.rot = {
          roll: 0,
          pitch: 0,
          yaw: 0,
        }),
        (this.tricksCalled = {
          roll: 0,
          pitch: 0,
          yaw: 0,
        }),
        this.angVel.set(
          -Math.sign(this.rv) * Math.min(3.2, Math.abs(this.rv) * L * 0.4),
          0,
          0,
        ),
        (this.fromRamp = !0),
        (this.rampCooldown = t.entry === "flat" ? 0.3 : 0.8),
        this.emit("rampExit", {
          inverted: this.up.y < 0,
          theta: this.rampMaxTheta,
          surface: t.name,
        });
    };
    if (this.rs >= t.L - 0.02) {
      if (t.endEnd === "ground") {
        (this.mode = "ground"),
          (this.yaw = Math.atan2(d.x, d.z)),
          (this.h = 0),
          (this.pos.y = 0),
          (this.vel.y = 0),
          this.emit("rampDone", {
            surface: t.name,
          });
        return;
      }
      y(i.k);
      return;
    }
    if (this.rs <= 0) {
      if (t.startEnd === "launch") {
        y(i.k);
        return;
      }
      (this.mode = "ground"),
        (this.yaw = Math.atan2(d.x, d.z)),
        (this.h = 0),
        (this.pos.y = 0),
        (this.vel.y = 0);
      return;
    }
    const b =
      t.entry === "flat" &&
      this.rs > t.flatS0 - 0.05 &&
      this.rs < t.flatS1 + 0.05;
    if (Math.abs(this.ru) > t.half && b) {
      (this.mode = "ground"),
        (this.yaw = Math.atan2(d.x, d.z)),
        (this.h = 0),
        (this.pos.y = 0),
        (this.vel.y = 0);
      return;
    }
    (Math.abs(this.ru) > t.half || w < -S) &&
      ((this.mode = "air"),
      (this.airTime = 0),
      (this.rot = {
        roll: 0,
        pitch: 0,
        yaw: 0,
      }),
      (this.tricksCalled = {
        roll: 0,
        pitch: 0,
        yaw: 0,
      }),
      this.angVel.set(-Math.min(2.5, this.rv * i.k * 0.4), 0, 0),
      (this.fromRamp = !0),
      (this.rampCooldown = 0.5),
      this.pos.addScaledVector(n, 0.05),
      this.emit("rampFall", {
        surface: t.name,
      }));
  }
  stepAir(e, s) {
    (this.airTime += e),
      (this.rampCooldown = Math.max(0, (this.rampCooldown || 0) - e));
    const t = this.quat,
      i = this.up,
      o = this.fwd,
      n = new Vector3(
        (s.throttle - s.brake) * TUNING.pitchRate,
        (s.yawL - s.yawR) * TUNING.yawRate,
        -s.steer * TUNING.rollRate,
      ),
      c = Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z) > 0.01;
    c ? (this.lastInputT = 0) : (this.lastInputT += e);
    for (const S of ["x", "y", "z"]) {
      const b = Math.abs(n[S]) > 0.01 ? 7.5 : 2.2;
      this.angVel[S] += (n[S] - this.angVel[S]) * Math.min(1, e * b);
    }
    c &&
      this.gas > 0 &&
      ((this.gas -= TUNING.gasRcs * e), (this.thrust.rcs = 1));
    const r = this.surfaceAt(this.pos.x, this.pos.z, this.pos.y + 0.5).h,
      l = this.pos.y - r;
    if (!c && this.lastInputT > 0.25 && this.vel.y < 1 && l < 7 && i.y > -0.1) {
      const S = o.clone();
      S.y = 0;
      let y =
        S.lengthSq() > 0.01
          ? Math.atan2(S.x, S.z)
          : Math.atan2(this.vel.x, this.vel.z);
      i.y < 0;
      const b = new Quaternion().setFromAxisAngle(UP, y),
        L = 1 - Math.exp(-e * (i.y > 0.2 ? 2.4 : 1.4));
      t.slerp(b, L),
        this.angVel.multiplyScalar(Math.exp(-e * 2)),
        (this.thrust.rcs = Math.max(this.thrust.rcs, 0.5));
    }
    const d = this.angVel,
      f = d.length() * e;
    if (f > 1e-6) {
      const S = new Quaternion().setFromAxisAngle(d.clone().normalize(), f);
      t.multiply(S).normalize();
    }
    (this.rot.roll += d.z * e),
      (this.rot.pitch += d.x * e),
      (this.rot.yaw += d.y * e),
      this.trickCallouts();
    const p = new Vector3(0, -GRAVITY, 0);
    s.lift &&
      this.gas > 0 &&
      (p.addScaledVector(this.up, TUNING.liftAccel),
      (this.gas -= TUNING.gasLift * e),
      (this.thrust.lift = 1)),
      s.boost &&
        this.gas > 0 &&
        (p.addScaledVector(this.fwd, TUNING.airBoost),
        (this.gas -= TUNING.gasBoost * e),
        (this.thrust.boost = 1));
    const w = this.vel.length();
    p.addScaledVector(this.vel, -0.0012 * w),
      this.vel.addScaledVector(p, e),
      this.pos.addScaledVector(this.vel, e),
      (this.wheelSpin *= Math.exp(-0.5 * e)),
      (this.bodyPitch *= 0.95),
      (this.bodyRoll *= 0.95),
      this.collide(e),
      this.mode === "air" &&
        (this.checkRampContact() || this.checkGroundContact());
  }
  trickCallouts() {
    const e = Math.PI * 2,
      s = 0.55;
    for (const t of ["roll", "pitch", "yaw"]) {
      const i = Math.floor((Math.abs(this.rot[t]) + s) / e);
      i > this.tricksCalled[t] &&
        ((this.tricksCalled[t] = i),
        this.emit("trick", {
          axis: t,
          count: i,
          sign: Math.sign(this.rot[t]),
        }));
    }
  }
  contactPoints() {
    const e = [],
      s = CAR_DIMS.frontAxle,
      t = CAR_DIMS.rearAxle,
      i = CAR_DIMS.track;
    for (const o of [s, t])
      for (const n of [-i, i]) e.push(new Vector3(n, 0, o));
    for (const o of [2.15, -2.15])
      for (const n of [-0.92, 0.92])
        for (const c of [0.25, 1.05]) e.push(new Vector3(n, c, o));
    return (
      e.push(new Vector3(0, 1.15, -0.2)),
      e.map((o) => o.applyQuaternion(this.quat).add(this.pos))
    );
  }
  checkGroundContact() {
    const e = this.contactPoints();
    let s = 0,
      t = 0,
      i = "ground",
      o = !1;
    for (const r of e) {
      const l = this.surfaceAt(r.x, r.z, r.y + 1.2),
        d = l.h - r.y;
      d > s && ((s = d), (t = l.h), (i = l.name), (o = !0));
    }
    if (!o) return;
    const n = this.up,
      c = -this.vel.y;
    if (n.y > 0.5) {
      const r = this.fwd;
      (r.y = 0),
        (this.yaw =
          r.lengthSq() > 0.01
            ? Math.atan2(r.x, r.z)
            : Math.atan2(this.vel.x, this.vel.z)),
        (this.mode = "ground"),
        (this.h = t),
        (this.pos.y = t),
        (this.onSurface = i),
        (this.vel.y = 0),
        (this.yawRate = this.angVel.y * 0.5),
        this.angVel.set(0, 0, 0),
        (this.susp = -Math.min(0.12, c * 0.008)),
        (this.suspV = -c * 0.15),
        this.quat.setFromAxisAngle(UP, this.yaw),
        this.emit("land", {
          impact: c,
          airTime: this.airTime,
          rot: {
            ...this.rot,
          },
          fromRamp: this.fromRamp,
          surface: i,
          tilt: n.y,
        }),
        (this.fromRamp = !1);
    } else (this.pos.y += s), this.crash(c);
  }
  checkRampContact() {
    if (this.rampCooldown > 0) return !1;
    for (const e of this.ramps) if (this.contactSurface(e)) return !0;
    return !1;
  }
  contactSurface(e) {
    const s = this.pos.clone().addScaledVector(this.up, 0.5),
      t = e.project(s);
    if (
      Math.abs(t.u) > e.half + 0.3 ||
      t.d > 0.75 ||
      t.d < -1.5 ||
      (e.entry === "lip" && t.s < 2.4) ||
      t.s <= 0.02 ||
      t.s >= e.L - 0.02
    )
      return !1;
    const i = e.normal(t.s),
      o = e.tangent(t.s),
      n = this.vel.dot(i);
    if (n > 2) return !1;
    const c = this.up;
    if (c.dot(i) > 0.55 && Math.abs(t.u) < e.half) {
      (this.mode = "ramp"), (this.R = e), (this.rs = t.s), (this.ru = t.u);
      const r = this.fwd;
      return (
        (this.rpsi = Math.atan2(r.dot(e.r), r.dot(o))),
        (this.rv = this.vel.dot(
          o
            .clone()
            .multiplyScalar(Math.cos(this.rpsi))
            .addScaledVector(e.r, Math.sin(this.rpsi)),
        )),
        this.angVel.set(0, 0, 0),
        (this.susp = -0.08),
        this.emit("land", {
          impact: -n,
          airTime: this.airTime,
          rot: {
            ...this.rot,
          },
          fromRamp: this.fromRamp,
          surface: e.name,
          tilt: c.dot(i),
        }),
        (this.fromRamp = !1),
        !0
      );
    }
    return (
      this.pos.addScaledVector(i, 0.75 - t.d),
      n < 0 && this.vel.addScaledVector(i, -1.4 * n),
      this.crash(-n),
      !0
    );
  }
  crash(e) {
    (this.mode = "crashed"),
      (this.crashT = 1.35),
      (this.recoverT = 0),
      (this.vel.y = Math.abs(this.vel.y) * 0.3),
      (this.vel.x *= 0.55),
      (this.vel.z *= 0.55),
      this.angVel.multiplyScalar(0.4),
      (this.angVel.x += (Math.random() - 0.5) * 3),
      (this.angVel.z += (Math.random() - 0.5) * 3),
      this.emit("crash", {
        impact: e,
      });
  }
  stepCrashed(e) {
    if (((this.crashT -= e), this.crashT > 0)) {
      (this.vel.y -= GRAVITY * e), this.pos.addScaledVector(this.vel, e);
      const n = this.angVel.length() * e;
      n > 1e-6 &&
        this.quat
          .multiply(
            new Quaternion().setFromAxisAngle(
              this.angVel.clone().normalize(),
              n,
            ),
          )
          .normalize(),
        this.angVel.multiplyScalar(Math.exp(-1.8 * e));
      const c = this.contactPoints();
      let r = 0;
      for (const l of c) {
        const d = this.surfaceAt(l.x, l.z, l.y + 1.2),
          f = d.h - l.y;
        f > r && ((r = f), d.h);
      }
      r > 0 &&
        ((this.pos.y += r),
        this.vel.y < 0 &&
          (this.vel.y < -3 &&
            this.emit("scrape", {
              speed: -this.vel.y,
            }),
          (this.vel.y *= -0.25)),
        (this.vel.x *= Math.exp(-3 * e)),
        (this.vel.z *= Math.exp(-3 * e))),
        this.collide(e);
      return;
    }
    if (this.recoverT === 0) {
      const n = this.fwd;
      (n.y = 0),
        (this._recYaw = n.lengthSq() > 0.01 ? Math.atan2(n.x, n.z) : this.yaw),
        (this._recFrom = this.quat.clone()),
        (this._recPos = this.pos.clone()),
        this.emit("recover");
    }
    this.recoverT += e;
    const s = Math.min(1, this.recoverT / 0.8),
      t = s * s * (3 - 2 * s),
      i = new Quaternion().setFromAxisAngle(UP, this._recYaw);
    this.quat.slerpQuaternions(this._recFrom, i, t);
    const o = this.surfaceAt(this.pos.x, this.pos.z, this._recPos.y + 1).h;
    (this.pos.y =
      o +
      Math.sin(t * Math.PI) * 1.2 +
      (1 - t) * Math.max(0, this._recPos.y - o)),
      this.vel.multiplyScalar(Math.exp(-4 * e)),
      (this.thrust.lift = 0.6),
      (this.thrust.rcs = 1),
      s >= 1 &&
        ((this.mode = "ground"),
        (this.yaw = this._recYaw),
        (this.h = o),
        (this.pos.y = o),
        this.vel.set(0, 0, 0),
        (this.yawRate = 0),
        this.angVel.set(0, 0, 0));
  }
  collide(e) {
    const s = [-1.45, 0, 1.45].map((o) =>
        new Vector3(0, 0.55, o).applyQuaternion(this.quat).add(this.pos),
      ),
      t = 0.82,
      i = this.colliders;
    for (const o of s)
      for (const n of i) {
        const c = Math.max(n.min.x, Math.min(o.x, n.max.x)),
          r = Math.max(n.min.y, Math.min(o.y, n.max.y)),
          l = Math.max(n.min.z, Math.min(o.z, n.max.z)),
          d = o.x - c,
          f = o.y - r,
          p = o.z - l,
          w = d * d + f * f + p * p;
        if (w >= t * t) continue;
        let S = Math.sqrt(w),
          y;
        if (S < 1e-4) {
          const m = (n.min.x + n.max.x) / 2,
            v = (n.min.z + n.max.z) / 2,
            x = (n.max.x - n.min.x) / 2 - Math.abs(o.x - m),
            h = (n.max.z - n.min.z) / 2 - Math.abs(o.z - v);
          (y =
            x < h
              ? new Vector3(Math.sign(o.x - m), 0, 0)
              : new Vector3(0, 0, Math.sign(o.z - v))),
            (S = 0);
        } else y = new Vector3(d / S, f / S, p / S);
        if (y.y > 0.65 && n.drivable) continue;
        const b = t - S;
        if (y.y > 0.65) {
          (this.pos.y += b), this.vel.y < 0 && (this.vel.y = 0);
          continue;
        }
        (y.y = 0), y.normalize(), this.pos.addScaledVector(y, b);
        const L = this.vel.dot(y);
        if (L < 0) {
          this.vel.addScaledVector(y, -1.3 * L);
          const m = this.vel.clone().addScaledVector(y, -this.vel.dot(y));
          if ((this.vel.addScaledVector(m, -0.25), this.mode === "ground")) {
            const v = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
            v.dot(y) < -0.5 && (this._lastVF = this.vel.dot(v));
          }
          this.emit("collide", {
            speed: -L,
            name: n.name,
          }),
            -L > 16 &&
              this.mode !== "crashed" &&
              (this.angVel.set(
                0,
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 3,
              ),
              this.crash(-L));
        }
      }
  }
}

export { CarPhysics };
