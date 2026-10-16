const tt = (a, e, s) => (a < e ? e : a > s ? s : a),
  St = (a, e = 0) => (typeof a == "number" && isFinite(a) ? a : e),
  J = (a = 0, e = 1) => a + Math.random() * (e - a),
  ue = (a) => Math.pow(2, a / 12),
  Gi = {
    land: 0.08,
    hardLand: 0.12,
    crash: 0.15,
    trick: 0.06,
    ui: 0.025,
    uiConfirm: 0.05,
    ring: 0.03,
    missionComplete: 0.6,
    launchPop: 0.1,
    scrape: 0.05,
    whoosh: 0.12,
  },
  Qi = 48;
class AudioEngine {
  constructor() {
    (this.ctx = null),
      (this.ready = !1),
      (this._muted = !1),
      (this._volume = 0.7),
      (this._hidden = !1),
      (this._voices = new Set()),
      (this._lastEvent = Object.create(null)),
      (this._warned = Object.create(null)),
      (this._loopSrcs = []),
      (this._pitch = 1),
      (this._appliedRate = 1),
      (this._spool = 0),
      (this._thr = {
        lift: 0,
        boost: 0,
        rcs: 0,
      }),
      (this._rcsNext = 0),
      (this._wob = 0),
      (this._rough = 0),
      (this._onVis = null);
  }
  init() {
    if (this.ctx)
      return (
        this.ctx.state === "suspended" && this.ctx.resume().catch(() => {}),
        this
      );
    const e =
      typeof window < "u" && (window.AudioContext || window.webkitAudioContext);
    if (!e) return console.warn("[audio] WebAudio not supported"), this;
    let s;
    try {
      s = new e({
        latencyHint: "interactive",
      });
    } catch {
      s = new e();
    }
    return (
      (this.ctx = s),
      this._buildNoise(),
      this._buildMaster(),
      this._buildLoops(),
      (this.ready = !0),
      s.state === "suspended" && s.resume().catch(() => {}),
      typeof document < "u" &&
        ((this._onVis = () => {
          (this._hidden = document.hidden),
            this._set(this.m.vis.gain, this._hidden ? 0 : 1, 0.05);
        }),
        document.addEventListener("visibilitychange", this._onVis)),
      this
    );
  }
  setMuted(e) {
    (this._muted = !!e),
      this.ready && this._set(this.m.mute.gain, this._muted ? 0 : 1, 0.03);
  }
  setMasterVolume(e) {
    (this._volume = tt(St(e, 0.7), 0, 1)),
      this.ready && this._set(this.m.vol.gain, this._volume, 0.03);
  }
  get activeVoices() {
    return this._voices.size;
  }
  getLevels() {
    if (!this.ready) return null;
    const e = this.m,
      s = (d, f) => {
        d.getFloatTimeDomainData(f);
        let p = 0,
          w = 0;
        for (let S = 0; S < f.length; S++) {
          const y = f[S],
            b = y < 0 ? -y : y;
          b > p && (p = b), (w += y * y);
        }
        return [p, Math.sqrt(w / f.length)];
      },
      [t, i] = s(e.anMix, this._anBuf),
      [o] = s(e.anLim, this._anBuf),
      [n, c] = s(e.anOut, this._anBuf),
      r = e.comp.reduction,
      l = e.lim.reduction;
    return {
      mixPeak: t,
      mixRms: i,
      limPeak: o,
      outPeak: n,
      outRms: c,
      compReduction: typeof r == "number" ? r : (r && r.value) || 0,
      limReduction: typeof l == "number" ? l : (l && l.value) || 0,
      voices: this._voices.size,
      state: this.ctx.state,
    };
  }
  _set(e, s, t) {
    e.setTargetAtTime(s, this.ctx.currentTime, t);
  }
  _gain(e = 0, s) {
    const t = this.ctx.createGain();
    return (t.gain.value = e), s && t.connect(s), t;
  }
  _filter(e, s, t = 0.707, i = 0) {
    const o = this.ctx.createBiquadFilter();
    return (
      (o.type = e),
      (o.frequency.value = s),
      (o.Q.value = t),
      i && (o.gain.value = i),
      o
    );
  }
  _osc(e, s, t) {
    const i = this.ctx.createOscillator();
    return (
      (i.type = e), (i.frequency.value = s), t && i.connect(t), i.start(), i
    );
  }
  _chain(...e) {
    for (let s = 0; s < e.length - 1; s++) e[s].connect(e[s + 1]);
    return e[e.length - 1];
  }
  _softCurve(e = 0.75, s = 2048) {
    const t = new Float32Array(s);
    for (let i = 0; i < s; i++) {
      const o = (i / (s - 1)) * 2 - 1,
        n = Math.abs(o),
        c = n < e ? n : e + (1 - e) * Math.tanh((n - e) / (1 - e));
      t[i] = Math.sign(o) * c * 0.98;
    }
    return t;
  }
  _driveCurve(e, s = 1024) {
    const t = new Float32Array(s),
      i = Math.tanh(e);
    for (let o = 0; o < s; o++) {
      const n = (o / (s - 1)) * 2 - 1;
      t[o] = Math.tanh(e * n) / i;
    }
    return t;
  }
  _buildNoise() {
    const e = this.ctx,
      s = e.sampleRate,
      t = Math.floor(s * 4),
      i = Math.floor(s * 0.06),
      o = (n) => {
        const c = new Float32Array(t + i);
        let r = 0,
          l = 0,
          d = 0,
          f = 0,
          p = 0,
          w = 0,
          S = 0,
          y = 0;
        for (let h = 0; h < t + i; h++) {
          const u = Math.random() * 2 - 1;
          n === "white"
            ? (c[h] = u)
            : n === "pink"
              ? ((r = 0.99886 * r + u * 0.0555179),
                (l = 0.99332 * l + u * 0.0750759),
                (d = 0.969 * d + u * 0.153852),
                (f = 0.8665 * f + u * 0.3104856),
                (p = 0.55 * p + u * 0.5329522),
                (w = -0.7616 * w - u * 0.016898),
                (c[h] = r + l + d + f + p + w + S + u * 0.5362),
                (S = u * 0.115926))
              : ((y = (y + 0.02 * u) / 1.02), (c[h] = y));
        }
        let b = 0;
        for (let h = 0; h < c.length; h++) b += c[h];
        b /= c.length;
        const L = e.createBuffer(1, t, s),
          m = L.getChannelData(0);
        for (let h = 0; h < t; h++) m[h] = c[h] - b;
        for (let h = 0; h < i; h++) {
          const u = (h / i) * Math.PI * 0.5;
          m[h] = (c[h] - b) * Math.sin(u) + (c[t + h] - b) * Math.cos(u);
        }
        let v = 0;
        for (let h = 0; h < t; h++) v = Math.max(v, Math.abs(m[h]));
        const x = 0.95 / (v || 1);
        for (let h = 0; h < t; h++) m[h] *= x;
        return L;
      };
    (this._noise = {
      white: o("white"),
      pink: o("pink"),
      brown: o("brown"),
    }),
      (this._anBuf = new Float32Array(2048));
  }
  _loopNoise(e) {
    const s = this.ctx,
      t = this._noise[e],
      i = s.createChannelMerger(2);
    for (let o = 0; o < 2; o++) {
      const n = s.createBufferSource();
      (n.buffer = t),
        (n.loop = !0),
        n.connect(i, 0, o),
        n.start(0, J(0, t.duration - 0.1)),
        this._loopSrcs.push(n);
    }
    return i;
  }
  _buildMaster() {
    const e = this.ctx,
      s = e.sampleRate / 2,
      t = (this.m = {});
    (t.out = e.destination),
      (t.vis = this._gain(1, t.out)),
      (t.mute = this._gain(this._muted ? 0 : 1, t.vis)),
      (t.vol = this._gain(this._volume, t.mute)),
      (t.clip = e.createWaveShaper()),
      (t.clip.curve = this._softCurve()),
      (t.clip.oversample = "2x"),
      t.clip.connect(t.vol),
      (t.lim = e.createDynamicsCompressor()),
      (t.lim.threshold.value = -2.5),
      (t.lim.knee.value = 0),
      (t.lim.ratio.value = 20),
      (t.lim.attack.value = 0.001),
      (t.lim.release.value = 0.09),
      t.lim.connect(t.clip),
      (t.comp = e.createDynamicsCompressor()),
      (t.comp.threshold.value = -16),
      (t.comp.knee.value = 10),
      (t.comp.ratio.value = 3.5),
      (t.comp.attack.value = 0.006),
      (t.comp.release.value = 0.25),
      t.comp.connect(t.lim),
      (t.pre = this._gain(0.9, t.comp));
    const i = () => {
      const o = e.createAnalyser();
      return (o.fftSize = 2048), o;
    };
    (t.anMix = i()),
      (t.anLim = i()),
      (t.anOut = i()),
      t.pre.connect(t.anMix),
      t.lim.connect(t.anLim),
      t.clip.connect(t.anOut),
      (this._lpMax = Math.min(2e4, s * 0.92)),
      (t.slowLP2 = this._filter("lowpass", this._lpMax, 0.6)),
      t.slowLP2.connect(t.pre),
      (t.slowLP1 = this._filter("lowpass", this._lpMax, 1.1)),
      t.slowLP1.connect(t.slowLP2),
      (t.diegetic = this._gain(1, t.slowLP1)),
      (t.ui = this._gain(1, t.pre)),
      (t.sfx = this._gain(1, t.diegetic)),
      (t.loops = this._gain(1, t.diegetic)),
      (t.revIn = this._gain(1)),
      (t.conv = e.createConvolver()),
      (t.conv.buffer = this._makeImpulse(2.1, 3.4)),
      (t.revOut = this._gain(0.3, t.diegetic)),
      (t.revHP = this._filter("highpass", 180, 0.7)),
      this._chain(t.revIn, t.revHP, t.conv, t.revOut),
      (t.sfxSend = this._gain(0.22, t.revIn)),
      t.sfx.connect(t.sfxSend),
      (t.uiSend = this._gain(0.35, t.revIn)),
      t.ui.connect(t.uiSend);
  }
  tap() {
    return !this.ctx || !this.m
      ? null
      : (this.m.tapDest ||
          ((this.m.tapDest = this.ctx.createMediaStreamDestination()),
          this.m.vis.connect(this.m.tapDest)),
        this.m.tapDest.stream);
  }
  _makeImpulse(e, s) {
    const t = this.ctx,
      i = t.sampleRate,
      o = Math.floor(i * e),
      n = Math.floor(i * 0.012),
      c = t.createBuffer(2, o, i);
    for (let r = 0; r < 2; r++) {
      const l = c.getChannelData(r);
      let d = 0;
      for (let f = n; f < o; f++) {
        const p = (f - n) / i,
          w = Math.random() * 2 - 1,
          S = 0.15 + 0.8 * Math.exp(-p * 2.5);
        d += S * (w - d);
        const y = f - n < i * 0.06 ? 1.6 : 1;
        l[f] = d * Math.exp(-p * s) * y;
      }
    }
    return c;
  }
  _buildLoops() {
    const e = this.ctx,
      s = this.m,
      t = (this.L = {}),
      i = this._loopNoise("white"),
      o = this._loopNoise("pink"),
      n = this._loopNoise("brown");
    (t.motorBus = this._gain(0.85)),
      (t.motorLP = this._filter("lowpass", 7e3, 0.5)),
      (t.motorShelf = this._filter("highshelf", 2800, 0.7, -6)),
      this._chain(t.motorBus, t.motorShelf, t.motorLP, s.loops);
    const c = this._gain(0.05, s.revIn);
    t.motorLP.connect(c),
      (t.gA = this._gain(0, t.motorBus)),
      (t.oA = this._osc("sine", 80, t.gA)),
      (t.gB = this._gain(0, t.motorBus)),
      (t.oB = this._osc("triangle", 80, t.gB)),
      (t.gSub = this._gain(0, t.motorBus)),
      (t.oSub = this._osc("sine", 40, t.gSub)),
      (t.gH2 = this._gain(0, t.motorBus)),
      (t.oH2 = this._osc("sine", 160, t.gH2)),
      (t.gH3 = this._gain(0, t.motorBus)),
      (t.oH3 = this._osc("sine", 240, t.gH3)),
      (t.chorus = this._osc("sine", 0.27)),
      (t.chorusD = this._gain(7)),
      t.chorus.connect(t.chorusD),
      t.chorusD.connect(t.oB.detune),
      (t.loadLP = this._filter("lowpass", 600, 0.9)),
      (t.gLoad = this._gain(0)),
      this._chain(t.loadLP, t.gLoad, t.motorBus),
      (t.oLoad = this._osc("sawtooth", 80, t.loadLP)),
      (t.gInv = this._gain(0, t.motorBus)),
      (t.oInv1 = this._osc("sine", 1800, t.gInv)),
      (t.gInv2 = this._gain(0.55, t.gInv)),
      (t.oInv2 = this._osc("sine", 2700, t.gInv2)),
      (t.invVib = this._osc("sine", 5.5)),
      (t.invVibD = this._gain(9)),
      t.invVib.connect(t.invVibD),
      t.invVibD.connect(t.oInv1.detune),
      t.invVibD.connect(t.oInv2.detune),
      (t.invHissBP = this._filter("bandpass", 8e3, 1.6)),
      (t.gInvHiss = this._gain(0)),
      this._chain(i, t.invHissBP, t.gInvHiss, t.motorBus),
      (t.roadBus = this._gain(1, s.loops)),
      (t.rumbleLP = this._filter("lowpass", 90, 0.8)),
      (t.rumbleHP = this._filter("highpass", 28, 0.7)),
      (t.gRumble = this._gain(0)),
      this._chain(n, t.rumbleHP, t.rumbleLP, t.gRumble, t.roadBus),
      (t.roarBP = this._filter("bandpass", 400, 0.7)),
      (t.gRoar = this._gain(0)),
      this._chain(o, t.roarBP, t.gRoar, t.roadBus),
      (t.sqBus = this._gain(1, s.loops)),
      (t.sqBP1 = this._filter("bandpass", 2e3, 7)),
      (t.sqBP2 = this._filter("bandpass", 3100, 9)),
      (t.gSqN1 = this._gain(0)),
      this._chain(i, t.sqBP1, t.gSqN1, t.sqBus),
      (t.gSqN2 = this._gain(0)),
      this._chain(i, t.sqBP2, t.gSqN2, t.sqBus),
      (t.sqToneLP = this._filter("lowpass", 2500, 0.7)),
      (t.gSqT = this._gain(0)),
      this._chain(t.sqToneLP, t.gSqT, t.sqBus),
      (t.oSq1 = this._osc("triangle", 1e3, t.sqToneLP)),
      (t.oSq2 = this._osc("sine", 1500, t.sqToneLP)),
      (t.sqVib = this._osc("sine", 7.3)),
      (t.sqVibD = this._gain(22)),
      t.sqVib.connect(t.sqVibD),
      t.sqVibD.connect(t.oSq1.detune),
      t.sqVibD.connect(t.oSq2.detune);
    const r = this._gain(0.12, s.revIn);
    t.sqBus.connect(r),
      (t.windPan = e.createStereoPanner()),
      t.windPan.connect(s.loops),
      (t.windMod = this._gain(1, t.windPan)),
      (t.gust = this._osc("sine", 0.17)),
      (t.gustD = this._gain(0.22)),
      t.gust.connect(t.gustD),
      t.gustD.connect(t.windMod.gain),
      (t.swirl = this._osc("sine", 0.06)),
      (t.swirlD = this._gain(0.3)),
      t.swirl.connect(t.swirlD),
      t.swirlD.connect(t.windPan.pan),
      (t.windBP = this._filter("bandpass", 300, 0.45)),
      (t.windLP = this._filter("lowpass", 4e3, 0.5)),
      (t.gWind = this._gain(0)),
      this._chain(o, t.windBP, t.windLP, t.gWind, t.windMod),
      (t.whistleBP = this._filter("bandpass", 1400, 9)),
      (t.gWhistle = this._gain(0)),
      this._chain(i, t.whistleBP, t.gWhistle, t.windMod),
      (t.thrustShape = e.createWaveShaper()),
      (t.thrustShape.curve = this._driveCurve(1.3)),
      (t.thrustShape.oversample = "2x"),
      (t.thrustBus = this._gain(0.8)),
      this._chain(t.thrustBus, t.thrustShape, s.loops);
    const l = this._gain(0.14, s.revIn);
    t.thrustShape.connect(l),
      (t.liftSum = this._gain(1, t.thrustBus)),
      (t.flutA = this._osc("sine", 17)),
      (t.flutB = this._osc("sine", 29.3)),
      (t.flutD = this._gain(0)),
      t.flutA.connect(t.flutD),
      t.flutB.connect(t.flutD),
      t.flutD.connect(t.liftSum.gain),
      (t.liftHissLP = this._filter("lowpass", 800, 0.6)),
      (t.gLiftHiss = this._gain(0)),
      this._chain(i, t.liftHissLP, t.gLiftHiss, t.liftSum),
      (t.liftRoarBP = this._filter("bandpass", 750, 0.8)),
      (t.gLiftRoar = this._gain(0)),
      this._chain(o, t.liftRoarBP, t.gLiftRoar, t.liftSum),
      (t.liftBodyLP = this._filter("lowpass", 150, 0.7)),
      (t.liftBodyPk = this._filter("peaking", 58, 1.2, 6)),
      (t.gLiftBody = this._gain(0)),
      this._chain(n, t.liftBodyLP, t.liftBodyPk, t.gLiftBody, t.liftSum),
      (t.boostBP = this._filter("bandpass", 2400, 1.1)),
      (t.gBoostBP = this._gain(0)),
      this._chain(i, t.boostBP, t.gBoostBP, t.thrustBus),
      (t.boostHP = this._filter("highpass", 6500, 0.7)),
      (t.gBoostHP = this._gain(0)),
      this._chain(i, t.boostHP, t.gBoostHP, t.thrustBus),
      (t.boostMidBP = this._filter("bandpass", 1100, 1)),
      (t.gBoostMid = this._gain(0)),
      this._chain(o, t.boostMidBP, t.gBoostMid, t.thrustBus),
      (t.boostBodyLP = this._filter("lowpass", 115, 0.7)),
      (t.gBoostBody = this._gain(0)),
      this._chain(n, t.boostBodyLP, t.gBoostBody, t.thrustBus),
      (t.rcsHP = this._filter("highpass", 1800, 0.7)),
      (t.rcsBP = this._filter("bandpass", 4200, 0.9)),
      (t.rcsLevel = this._gain(0)),
      (t.rcsEnv = this._gain(0.12)),
      (t.rcsPan = e.createStereoPanner()),
      this._chain(
        i,
        t.rcsHP,
        t.rcsBP,
        t.rcsLevel,
        t.rcsEnv,
        t.rcsPan,
        t.thrustBus,
      ),
      (t.fanBus = this._gain(1)),
      (t.fanLP = this._filter("lowpass", 5e3, 0.6)),
      this._chain(t.fanBus, t.fanLP, s.loops),
      (t.gFan1 = this._gain(0, t.fanBus)),
      (t.oFan1 = this._osc("sine", 200, t.gFan1)),
      (t.gFan2 = this._gain(0, t.fanBus)),
      (t.oFan2 = this._osc("sine", 400, t.gFan2)),
      (t.gFan3 = this._gain(0, t.fanBus)),
      (t.oFan3 = this._osc("triangle", 600, t.gFan3)),
      (t.fanAirBP = this._filter("bandpass", 700, 1.2)),
      (t.gFanAir = this._gain(0)),
      this._chain(o, t.fanAirBP, t.gFanAir, t.fanBus);
  }
  update(e, s = {}) {
    if (!this.ready) return;
    const t = this.ctx,
      i = t.currentTime,
      o = this.L,
      n = this.m;
    (e = tt(St(e, 1 / 60), 0, 0.1)), (s = s || {});
    const c = tt(Math.abs(St(s.speed)), 0, 125),
      r = Math.min(c / 110, 1.1),
      l = tt(St(s.throttle), -1, 1),
      d = tt(St(s.boost), 0, 1),
      f = tt(St(s.lift), 0, 1),
      p = tt(St(s.rcs), 0, 1),
      w = tt(St(s.suction), 0, 1),
      S = s.onGround === !1 ? 0 : 1,
      y = tt(St(s.drifting), 0, 1),
      b = tt(St(s.timeScale, 1), 0.05, 1),
      L = 0.45 + 0.55 * b;
    this._pitch += (L - this._pitch) * (1 - Math.exp(-e / 0.12));
    const m = this._pitch;
    if (Math.abs(m - this._appliedRate) > 0.002) {
      this._appliedRate = m;
      for (const K of this._loopSrcs)
        K.playbackRate.setTargetAtTime(m, i, 0.03);
    }
    const v =
      b >= 0.995
        ? this._lpMax
        : Math.min(this._lpMax, 550 * Math.pow(32, tt((b - 0.2) / 0.8, 0, 1)));
    this._set(n.slowLP1.frequency, v, 0.12),
      this._set(n.slowLP2.frequency, Math.min(this._lpMax, v * 1.4), 0.12),
      this._set(n.revOut.gain, 0.3 + 0.35 * (1 - b), 0.2);
    const x = l >= 0 ? l : -l * 0.6,
      u = (80 + 1120 * Math.pow(Math.min(r, 1.05), 0.8)) * (1 + 0.025 * l) * m,
      T = 0.22 + 0.78 * Math.pow(Math.min(r, 1), 0.6),
      z = 0.06,
      g = 0.08;
    this._set(o.oA.frequency, u, z),
      this._set(o.oB.frequency, u * 1.003, z),
      this._set(o.oSub.frequency, u * 0.5, z),
      this._set(o.oH2.frequency, u * 2.002, z),
      this._set(o.oH3.frequency, u * 3.01, z),
      this._set(o.oLoad.frequency, u * 1.001, z),
      this._set(o.gA.gain, 0.085 * T, g),
      this._set(o.gB.gain, 0.05 * T, g),
      this._set(o.gSub.gain, 0.05 * T * (0.4 + 0.6 * x), g),
      this._set(o.gH2.gain, 0.026 * T * (0.4 + 0.6 * x), g),
      this._set(o.gH3.gain, 0.011 * T * x, g),
      this._set(
        o.loadLP.frequency,
        Math.min(9e3, u * 1.2 + 300 + (l >= 0 ? 2600 : 900) * x),
        g,
      ),
      this._set(o.gLoad.gain, 0.065 * x * (0.35 + 0.65 * T), g);
    const D = Math.min(7e3, 1700 + u * 1.35 + 300 * l) * m;
    this._set(o.oInv1.frequency, D, z),
      this._set(o.oInv2.frequency, D * 1.5, z),
      this._set(o.gInv.gain, 0.009 * x * (1 - 0.55 * Math.min(r, 1)), g),
      this._set(o.invHissBP.frequency, 8e3 * m, 0.1),
      this._set(o.gInvHiss.gain, 0.05 * x, g),
      (this._rough = tt(
        this._rough + (Math.random() - 0.5) * e * 10 - this._rough * e * 3,
        -1,
        1,
      ));
    const P = 1 + 0.18 * this._rough,
      k = 0.035;
    this._set(o.rumbleLP.frequency, (70 + 280 * r) * m, 0.1),
      this._set(o.gRumble.gain, 0.34 * Math.pow(r, 0.7) * S * P, k),
      this._set(o.roarBP.frequency, (320 + 950 * r) * m, 0.1),
      this._set(o.gRoar.gain, 0.16 * Math.pow(r, 0.9) * S, k);
    const R = y * S * tt((c - 2) / 10, 0, 1),
      A = Math.pow(R, 1.3);
    this._wob = tt(
      this._wob + (Math.random() - 0.5) * e * 9 - this._wob * e * 1.5,
      -1,
      1,
    );
    const C = (950 + 260 * Math.min(r, 1) + 140 * this._wob) * m;
    this._set(o.oSq1.frequency, C, 0.05),
      this._set(o.oSq2.frequency, C * 1.51, 0.05),
      this._set(o.sqBP1.frequency, C * 2.05, 0.05),
      this._set(o.sqBP2.frequency, C * 3.1, 0.05);
    const B = A > 0.01 ? 0.05 : 0.09;
    this._set(o.gSqN1.gain, 0.8 * A, B),
      this._set(o.gSqN2.gain, 0.42 * A, B),
      this._set(o.gSqT.gain, 0.022 * A * (0.7 + 0.3 * Math.abs(this._wob)), B);
    const N = 1 - S;
    this._set(o.windBP.frequency, (220 + 1700 * Math.pow(r, 1.2)) * m, 0.15),
      this._set(
        o.gWind.gain,
        (0.02 + 0.48 * Math.pow(r, 1.7)) * (1 + 0.3 * N),
        0.12,
      ),
      this._set(o.whistleBP.frequency, (900 + 2300 * Math.min(r, 1)) * m, 0.2),
      this._set(o.gWhistle.gain, 0.22 * r * r, 0.15);
    const q = (K, Pt) => {
        const Wt = Pt > this._thr[K] ? 0.012 : 0.05;
        return (this._thr[K] = Pt), Wt;
      },
      V = q("lift", f),
      O = q("boost", d),
      W = q("rcs", p);
    this._set(o.liftHissLP.frequency, (550 + 2600 * f) * m, V),
      this._set(o.gLiftHiss.gain, 0.32 * f, V),
      this._set(o.liftRoarBP.frequency, (650 + 450 * f) * m, V),
      this._set(o.gLiftRoar.gain, 0.42 * f, V),
      this._set(o.gLiftBody.gain, 0.72 * f, V),
      this._set(o.flutD.gain, 0.07 * f, 0.05),
      this._set(o.boostBP.frequency, (2e3 + 1500 * d) * m, O),
      this._set(o.gBoostBP.gain, 0.7 * d, O),
      this._set(o.boostHP.frequency, 6500 * m, 0.1),
      this._set(o.gBoostHP.gain, 0.16 * d, O),
      this._set(o.boostMidBP.frequency, (950 + 300 * d) * m, O),
      this._set(o.gBoostMid.gain, 0.4 * d, O),
      this._set(o.gBoostBody.gain, 0.45 * d, O),
      this._set(o.rcsLevel.gain, 0.75 * Math.sqrt(p), W),
      this._set(o.rcsHP.frequency, 1800 * m, 0.1),
      this._scheduleRcs(p, i, m);
    const at = w > this._spool ? 0.7 : 1.1;
    this._spool += (w - this._spool) * (1 - Math.exp(-e / at));
    const $ = this._spool,
      Q = (180 + 1500 * $) * m;
    this._set(o.oFan1.frequency, Q, 0.05),
      this._set(o.oFan2.frequency, Q * 2.004, 0.05),
      this._set(o.oFan3.frequency, Q * 3.02, 0.05),
      this._set(o.gFan1.gain, 0.022 * $, 0.1),
      this._set(o.gFan2.gain, 0.012 * $, 0.1),
      this._set(o.gFan3.gain, 0.005 * $, 0.1),
      this._set(o.fanAirBP.frequency, (550 + 900 * $) * m, 0.1),
      this._set(o.gFanAir.gain, 0.16 * $, 0.1);
  }
  _scheduleRcs(e, s, t) {
    const i = this.L;
    if (e < 0.02) {
      this._rcsNext = s;
      return;
    }
    this._rcsNext < s && (this._rcsNext = s + 0.005);
    const o = s + 0.09;
    for (; this._rcsNext < o; ) {
      const n = this._rcsNext,
        c = i.rcsEnv.gain,
        r = J(0.65, 1),
        l = J(0.02, 0.05) * (2 - t);
      c.setValueAtTime(0.12, n),
        c.linearRampToValueAtTime(r, n + 0.003),
        c.setTargetAtTime(0.12, n + 0.003, l),
        i.rcsPan.pan.setValueAtTime(J(-0.6, 0.6), n),
        i.rcsBP.frequency.setValueAtTime(J(3e3, 6200) * t, n),
        (this._rcsNext = n + ((1 / (5 + 15 * e)) * J(0.6, 1.4)) / t);
    }
  }
  event(e, s = 1) {
    if (!this.ready || this._hidden) return;
    const t = this["_ev_" + e];
    if (typeof t != "function") {
      this._warned[e] ||
        ((this._warned[e] = 1), console.warn(`[audio] unknown event "${e}"`));
      return;
    }
    const i = this.ctx.currentTime,
      o = Gi[e] || 0;
    if (
      !(i - (this._lastEvent[e] ?? -1e9) < o) &&
      !(this._voices.size >= Qi && e !== "ui" && e !== "uiConfirm")
    ) {
      this._lastEvent[e] = i;
      try {
        t.call(this, St(s, 1));
      } catch (n) {
        console.warn("[audio] event failed", e, n);
      }
    }
  }
  _voice(e, s) {
    const t = this.ctx,
      i = [],
      o = e !== this.m.ui;
    let n = 0,
      c = !1,
      r = 0;
    const l = {
      t: t.currentTime + 0.01,
      P: o ? this._pitch : 1,
      D: o ? 1 / Math.sqrt(this._pitch) : 1,
      out: this._gain(1, e),
      node: (f) => (i.push(f), f),
      src: (f, p, w, S = 0) => (
        i.push(f),
        n++,
        (f.onended = () => {
          --n <= 0 && d();
        }),
        f.start(p, S),
        f.stop(w),
        f
      ),
    };
    i.push(l.out);
    const d = () => {
      if (!c) {
        (c = !0), clearTimeout(r);
        for (const f of i)
          try {
            f.disconnect();
          } catch {}
        (i.length = 0), this._voices.delete(l);
      }
    };
    return (r = setTimeout(d, (s * 2 + 2) * 1e3)), this._voices.add(l), l;
  }
  _env(e, s, t, i, o, n = 0) {
    (i = Math.max(i, 2e-4)),
      e.setValueAtTime(0, s),
      e.linearRampToValueAtTime(i, s + t),
      n > 0 && e.setValueAtTime(i, s + t + n),
      e.exponentialRampToValueAtTime(1e-4, s + Math.max(o, t + n + 0.005)),
      e.setValueAtTime(0, s + Math.max(o, t + n + 0.005) + 0.001);
  }
  _tone(e, s) {
    const t = this.ctx,
      i = s.t ?? e.t,
      o = s.dur * e.D,
      n = e.P,
      c = t.createOscillator();
    (c.type = s.type || "sine"),
      c.frequency.setValueAtTime(s.f * n, i),
      s.f2 &&
        c.frequency.exponentialRampToValueAtTime(
          s.f2 * n,
          i + (s.glide ?? s.dur) * e.D,
        ),
      s.detune && (c.detune.value = s.detune);
    let r = c;
    if (s.lp) {
      const d = e.node(this._filter("lowpass", s.lp[0] * n, s.lp[1] ?? 0.7));
      s.lp[2] &&
        (d.frequency.setValueAtTime(s.lp[0] * n, i),
        d.frequency.exponentialRampToValueAtTime(
          s.lp[2] * n,
          i + (s.lp[3] ?? s.dur) * e.D,
        )),
        r.connect(d),
        (r = d);
    }
    const l = e.node(t.createGain());
    if (
      ((l.gain.value = 0),
      this._env(l.gain, i, s.a ?? 0.004, s.peak, o, s.hold ?? 0),
      r.connect(l),
      (r = l),
      s.pan)
    ) {
      const d = e.node(t.createStereoPanner());
      (d.pan.value = s.pan), r.connect(d), (r = d);
    }
    return r.connect(s.dest || e.out), e.src(c, i, i + o + 0.03), l;
  }
  _noiseShot(e, s) {
    const t = this.ctx,
      i = s.t ?? e.t,
      o = s.dur * e.D,
      n = e.P,
      c = this._noise[s.kind || "white"],
      r = t.createBufferSource();
    (r.buffer = c), (r.loop = !0), (r.playbackRate.value = (s.rate ?? 1) * n);
    let l = r;
    for (const f of s.filters || []) {
      const p = e.node(this._filter(f[0], f[1] * n, f[2] ?? 0.7));
      f[3] &&
        (p.frequency.setValueAtTime(f[1] * n, i),
        p.frequency.exponentialRampToValueAtTime(
          f[3] * n,
          i + (f[4] ?? s.dur) * e.D,
        )),
        l.connect(p),
        (l = p);
    }
    if (s.shape) {
      const f = e.node(t.createWaveShaper());
      (f.curve = this._driveCurve(s.shape)), l.connect(f), (l = f);
    }
    const d = e.node(t.createGain());
    if (
      ((d.gain.value = 0),
      this._env(d.gain, i, s.a ?? 0.002, s.peak, o, s.hold ?? 0),
      l.connect(d),
      (l = d),
      s.pan)
    ) {
      const f = e.node(t.createStereoPanner());
      (f.pan.value = s.pan), l.connect(f), (l = f);
    }
    return (
      l.connect(s.dest || e.out),
      e.src(
        r,
        i,
        i + o + 0.03,
        J(0, c.duration - o - 0.1 > 0 ? c.duration - o - 0.1 : 0),
      ),
      d
    );
  }
  _duck(e, s = 0.05, t = 0.35) {
    const i = this.m.loops.gain,
      o = this.ctx.currentTime,
      n = i.value;
    i.cancelScheduledValues(o),
      i.setValueAtTime(n, o),
      i.linearRampToValueAtTime(Math.min(n, 1 - e), o + 0.015),
      i.setTargetAtTime(1, o + 0.015 + s, t / 3);
  }
  _ev_land(e) {
    e = tt(e, 0, 1.5);
    const s = 0.4 + 0.4 * e,
      t = this._voice(this.m.sfx, 0.6),
      i = t.t;
    this._tone(t, {
      f: 115,
      f2: 42,
      glide: 0.14,
      dur: 0.38,
      a: 0.003,
      peak: 0.6 * s,
    }),
      this._noiseShot(t, {
        kind: "brown",
        dur: 0.26,
        a: 0.002,
        peak: 0.55 * s,
        filters: [["lowpass", 320, 0.8, 110]],
      }),
      this._tone(t, {
        type: "triangle",
        f: 195,
        f2: 150,
        t: i + 0.03,
        dur: 0.1,
        peak: 0.12 * s,
        lp: [900, 1],
      }),
      this._noiseShot(t, {
        t: i + 0.035,
        dur: 0.045,
        peak: 0.16 * s,
        filters: [["bandpass", 2600, 4]],
      }),
      this._tone(t, {
        type: "triangle",
        f: 165,
        f2: 130,
        t: i + 0.17,
        dur: 0.08,
        peak: 0.06 * s,
        lp: [700, 1],
      });
  }
  _ev_hardLand(e) {
    e = tt(e, 0, 1.5);
    const s = 0.6 + 0.4 * e;
    this._duck(0.45, 0.08, 0.5);
    const t = this._voice(this.m.sfx, 1.1),
      i = t.t;
    this._tone(t, {
      f: 88,
      f2: 27,
      glide: 0.28,
      dur: 0.75,
      a: 0.003,
      peak: 0.75 * s,
    }),
      this._noiseShot(t, {
        kind: "brown",
        dur: 0.6,
        a: 0.002,
        peak: 0.8 * s,
        filters: [["lowpass", 450, 0.9, 85]],
      }),
      this._noiseShot(t, {
        dur: 0.45,
        a: 0.003,
        peak: 0.3 * s,
        filters: [["bandpass", 1500, 0.9, 650]],
      }),
      this._tone(t, {
        type: "triangle",
        f: 145,
        f2: 105,
        t: i + 0.025,
        dur: 0.16,
        peak: 0.18 * s,
        lp: [800, 2],
      }),
      this._noiseShot(t, {
        t: i + 0.02,
        dur: 0.06,
        peak: 0.25 * s,
        filters: [["bandpass", 3200, 3]],
      });
    const o = Math.round(8 + 6 * e);
    for (let n = 0; n < o; n++) {
      const c = 0.05 + Math.pow(Math.random(), 1.6) * 0.7;
      this._noiseShot(t, {
        t: i + c,
        dur: J(0.02, 0.06),
        a: 0.001,
        peak: s * J(0.06, 0.2) * (1 - c * 0.8),
        filters: [["bandpass", J(1800, 7e3), J(5, 11)]],
        pan: J(-0.8, 0.8),
      });
    }
  }
  _ev_crash(e) {
    e = tt(e, 0, 1.5);
    const s = 0.6 + 0.4 * e;
    this._duck(0.6, 0.12, 0.7);
    const t = this._voice(this.m.sfx, 1.4),
      i = t.t;
    this._tone(t, {
      f: 72,
      f2: 30,
      glide: 0.3,
      dur: 0.55,
      a: 0.002,
      peak: 0.7 * s,
    }),
      this._noiseShot(t, {
        kind: "brown",
        dur: 0.5,
        peak: 0.75 * s,
        filters: [["lowpass", 700, 0.8, 100]],
      });
    const o = t.node(this._gain(1));
    for (const d of [387, 913, 1462, 2210, 3170, 4630]) {
      const f = t.node(
          this._filter("bandpass", d * J(0.92, 1.08) * t.P, J(14, 26)),
        ),
        p = t.node(this._gain(J(0.5, 0.9) * 2.2));
      this._chain(o, f, p, t.out);
    }
    [0, 0.055, 0.12, 0.2, 0.31].forEach((d, f) => {
      this._noiseShot(t, {
        t: i + d,
        dur: 0.12 - f * 0.012,
        a: 0.001,
        peak: s * (1 - f * 0.15),
        shape: 3,
        filters: [["highpass", 300, 0.7]],
        dest: o,
      }),
        this._noiseShot(t, {
          t: i + d,
          dur: 0.08,
          a: 0.001,
          peak: 0.22 * s * (1 - f * 0.15),
          filters: [["bandpass", J(1200, 2600), 1.2]],
          pan: J(-0.4, 0.4),
        });
    });
    const c = t.node(this._gain(0.5)),
      r = this.ctx.createOscillator();
    (r.type = "square"), (r.frequency.value = 33 * t.P);
    const l = t.node(this._gain(0.45));
    r.connect(l),
      l.connect(c.gain),
      c.connect(t.out),
      t.src(r, i, i + 1.2 * t.D),
      this._noiseShot(t, {
        t: i + 0.08,
        dur: 1,
        a: 0.02,
        peak: 0.3 * s,
        filters: [["bandpass", 3300, 4, 1100]],
        dest: c,
      });
    for (let d = 0; d < 6; d++)
      this._tone(t, {
        f: J(3400, 8e3),
        t: i + J(0.05, 0.55),
        dur: J(0.12, 0.3),
        a: 0.001,
        peak: J(0.025, 0.06) * s,
        pan: J(-0.7, 0.7),
      });
  }
  _ev_launchPop(e) {
    e = tt(e, 0, 1.5);
    const s = (0.6 + 0.4 * e) * 0.7;
    this._duck(0.35, 0.03, 0.3);
    const t = this._voice(this.m.sfx, 0.9),
      i = t.t;
    this._noiseShot(t, {
      dur: 0.014,
      a: 5e-4,
      peak: 0.55 * s,
      filters: [["highpass", 3e3, 0.7]],
    }),
      this._noiseShot(t, {
        dur: 0.5,
        a: 0.002,
        peak: 0.6 * s,
        filters: [["lowpass", 9500, 0.6, 650, 0.35]],
        pan: -0.35,
      }),
      this._noiseShot(t, {
        dur: 0.5,
        a: 0.002,
        peak: 0.6 * s,
        filters: [["lowpass", 9e3, 0.6, 700, 0.33]],
        pan: 0.35,
      }),
      this._noiseShot(t, {
        kind: "brown",
        dur: 0.42,
        a: 0.003,
        peak: 0.85 * s,
        filters: [["lowpass", 260, 0.9]],
      }),
      this._tone(t, {
        f: 98,
        f2: 32,
        glide: 0.18,
        dur: 0.42,
        a: 0.002,
        peak: 0.65 * s,
      }),
      this._noiseShot(t, {
        kind: "pink",
        t: i + 0.04,
        dur: 0.75,
        a: 0.03,
        peak: 0.28 * s,
        filters: [["bandpass", 2600, 0.8, 1400]],
      });
  }
  _ev_scrape(e) {
    e = tt(e, 0, 1.5);
    const s = (0.4 + 0.5 * e) * 1.8,
      t = 0.16 + 0.16 * e,
      i = this._voice(this.m.sfx, t + 0.2),
      o = i.t,
      n = i.node(this._gain(0.55, i.out)),
      c = this.ctx.createOscillator();
    (c.type = "sawtooth"), (c.frequency.value = J(38, 55) * i.P);
    const r = i.node(this._gain(0.4));
    c.connect(r), r.connect(n.gain), i.src(c, o, o + t * i.D + 0.05);
    const l = J(1900, 3200);
    this._noiseShot(i, {
      dur: t,
      a: 0.006,
      peak: 0.32 * s,
      filters: [["bandpass", l, 4, l * 0.75]],
      dest: n,
      pan: J(-0.3, 0.3),
    }),
      this._noiseShot(i, {
        dur: t * 0.9,
        a: 0.004,
        peak: 0.5 * s,
        filters: [["bandpass", l * 1.7, 28]],
        dest: n,
      });
  }
  _ev_whoosh(e) {
    e = tt(e, 0, 1.5);
    const s = (0.4 + 0.5 * e) * 1.6,
      t = this.ctx,
      i = this._voice(this.m.sfx, 0.9),
      o = i.t,
      n = 0.7 * i.D,
      c = i.P,
      r = i.node(t.createStereoPanner()),
      l = Math.random() < 0.5 ? -1 : 1;
    r.pan.setValueAtTime(-0.85 * l, o),
      r.pan.linearRampToValueAtTime(0.85 * l, o + n),
      r.connect(i.out);
    const d = i.node(this._filter("bandpass", 350 * c, 1.1));
    d.frequency.setValueAtTime(350 * c, o),
      d.frequency.exponentialRampToValueAtTime(1900 * c, o + n * 0.45),
      d.frequency.exponentialRampToValueAtTime(520 * c, o + n);
    const f = i.node(this._gain(0));
    f.gain.setValueAtTime(1e-4, o),
      f.gain.exponentialRampToValueAtTime(0.5 * s, o + n * 0.45),
      f.gain.exponentialRampToValueAtTime(1e-4, o + n);
    const p = t.createBufferSource();
    (p.buffer = this._noise.pink),
      (p.loop = !0),
      (p.playbackRate.value = c),
      this._chain(p, d, f, r),
      i.src(p, o, o + n + 0.03, J(0, 3));
  }
  _ev_trick(e) {
    const s = tt(e, 1, 8),
      t = [0, 2, 4, 5, 7, 9, 11, 12],
      i = Math.floor(s) - 1,
      o = s - Math.floor(s),
      n = t[i] + (i < 7 ? (t[i + 1] - t[i]) * o : 0),
      c = 523.25 * ue(n),
      r = [0, 4, 7, 12];
    s >= 3 && r.push(16), s >= 5 && r.push(19);
    const l = this._voice(this.m.ui, 1),
      d = l.t,
      f = 0.077 / Math.sqrt(r.length / 4);
    r.forEach((p, w) => {
      const S = c * ue(p),
        y = d + w * 0.032,
        b = 0.42 + 0.05 * s - w * 0.02;
      for (const L of [-9, 9])
        this._tone(l, {
          type: "sawtooth",
          f: S * ue(-0.4),
          f2: S,
          glide: 0.03,
          t: y,
          dur: b,
          a: 0.004,
          peak: f,
          detune: L,
          lp: [5500 + 600 * s, 1.3, 1600, b],
          pan: (w / (r.length - 1) - 0.5) * 0.5,
        });
      this._tone(l, {
        type: "triangle",
        f: S * 2,
        t: y,
        dur: b * 0.6,
        a: 0.002,
        peak: f * 0.5,
      });
    }),
      this._tone(l, {
        f: c * 4,
        t: d + 0.07,
        dur: 0.3,
        a: 0.001,
        peak: 0.05,
      }),
      this._noiseShot(l, {
        dur: 0.16,
        a: 0.03,
        peak: 0.055 + 0.008 * s,
        filters: [["highpass", 2200, 0.7, 8e3, 0.16]],
      }),
      s >= 4 &&
        this._tone(l, {
          f: 130.8 * ue(n),
          f2: 98 * ue(n),
          dur: 0.35,
          a: 0.004,
          peak: 0.17,
        });
  }
  _ev_ring(e) {
    e = tt(e, 0.2, 1.5) * 1.4;
    const s = this._voice(this.m.ui, 1.2),
      t = s.t,
      i = [1, 2, 2.76, 4.07, 5.4],
      o = [1, 0.5, 0.33, 0.2, 0.12],
      n = [0.9, 0.6, 0.4, 0.26, 0.18];
    [
      [1318.5, 0],
      [1975.5, 0.07],
    ].forEach(([c, r], l) => {
      i.forEach((d, f) =>
        this._tone(s, {
          f: c * d,
          t: t + r,
          dur: n[f] * (l ? 1.2 : 0.8),
          a: 0.001,
          peak: 0.055 * e * o[f],
          pan: l ? 0.25 : -0.25,
        }),
      );
    });
    for (let c = 0; c < 4; c++)
      this._noiseShot(s, {
        t: t + 0.02 + c * 0.045,
        dur: 0.06,
        a: 0.001,
        peak: 0.035 * e,
        filters: [["highpass", 7e3, 0.7]],
        pan: J(-0.6, 0.6),
      });
  }
  _ev_missionComplete(e) {
    e = tt(e, 0.3, 1.3);
    const s = this._voice(this.m.ui, 2.4),
      t = s.t;
    [523.25, 659.25, 783.99, 1046.5].forEach((c, r) => {
      const l = t + r * 0.09;
      this._tone(s, {
        type: "sawtooth",
        f: c,
        t: l,
        dur: 0.32,
        a: 0.004,
        peak: 0.06 * e,
        detune: -6,
        lp: [4500, 1.2, 1500],
      }),
        this._tone(s, {
          type: "square",
          f: c,
          t: l,
          dur: 0.28,
          a: 0.004,
          peak: 0.025 * e,
          detune: 6,
          lp: [3e3, 0.8],
        });
    });
    const o = t + 0.38,
      n = [261.63, 392, 523.25, 659.25, 783.99, 1046.5];
    n.forEach((c, r) => {
      for (const l of [-8, 8])
        this._tone(s, {
          type: "sawtooth",
          f: c,
          t: o,
          dur: 1.6,
          a: 0.025,
          hold: 0.35,
          peak: 0.03 * e,
          detune: l,
          lp: [1200, 0.9, 5200, 0.25],
          pan: (r / (n.length - 1) - 0.5) * 0.7,
        });
    }),
      this._tone(s, {
        f: 65.4,
        f2: 49,
        glide: 0.4,
        t: o,
        dur: 0.7,
        a: 0.004,
        peak: 0.28 * e,
      }),
      this._tone(s, {
        f: 2093,
        t: o + 0.02,
        dur: 0.9,
        a: 0.002,
        peak: 0.03 * e,
      }),
      this._noiseShot(s, {
        t: o,
        dur: 0.9,
        a: 0.05,
        peak: 0.045 * e,
        filters: [["highpass", 4e3, 0.7, 1e4, 0.9]],
      });
  }
  _ev_ui(e) {
    e = tt(e, 0.2, 1.5);
    const s = this._voice(this.m.ui, 0.1);
    this._tone(s, {
      f: 1850,
      f2: 1500,
      glide: 0.025,
      dur: 0.035,
      a: 8e-4,
      peak: 0.07 * e,
    }),
      this._noiseShot(s, {
        dur: 0.008,
        a: 5e-4,
        peak: 0.05 * e,
        filters: [["highpass", 4500, 0.7]],
      });
  }
  _ev_uiConfirm(e) {
    e = tt(e, 0.2, 1.5);
    const s = this._voice(this.m.ui, 0.3),
      t = s.t;
    this._tone(s, {
      type: "triangle",
      f: 880,
      dur: 0.08,
      a: 0.002,
      peak: 0.1 * e,
    }),
      this._tone(s, {
        type: "triangle",
        f: 1318.5,
        t: t + 0.065,
        dur: 0.16,
        a: 0.002,
        peak: 0.1 * e,
      }),
      this._tone(s, {
        f: 2637,
        t: t + 0.065,
        dur: 0.1,
        a: 0.001,
        peak: 0.025 * e,
      });
  }
}

export { AudioEngine };
