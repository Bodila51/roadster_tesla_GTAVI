// Roadster v2 audio engine.
//
// Public surface is unchanged from the original engine, so main.js and game-state.js need no edits:
//   new AudioEngine(), .ctx, .ready, init(), update(dt, state), event(name, x), setMuted(on),
//   setMasterVolume(v), getLevels(), tap(), activeVoices
//
// The sound itself is all new. One-shots and textures are rendered offline (src/audio/tools/render_sounds.py
// writes public/sounds/*.mp3 and sound-files.js); the drivetrain is synthesised live so its pitch tracks the
// wheels exactly. Everything ends in a gentle glue compressor, a limiter and a safety clipper.

import { SOUND_FILES } from './sound-files.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const sstep = (x, a, b) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const ease = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));

const MPH = 2.236936;
const WHINE_HZ_PER_MS = 18; // primary motor order in Hz per m/s of wheel speed (fixed single-speed reduction)
const FRONT_RATIO = 1.137; // front motor spins faster than the rear pair (different reduction)
const GEAR_ORDER = 3.17; // gear-mesh whine relative to the primary order
const INVERTER_HZ = 4200; // PWM carrier; sidebands sit at carrier +/- primary order
const MAX_VOICES = 40;
// The compressor and limiter add automatic make-up gain (+6.4 dB together, same kernel in Chrome, Safari and
// Firefox). The mix bus is trimmed by most of that so quiet passages are not pushed up into the dynamics.
const MASTER_PRE = 0.6;
const THRUST_TRIM = 1.78; // cold-gas jets and their valve edges sit on top of the drivetrain

// Minimum spacing (s) between repeats of the same diegetic event. Score events are arbitrated per frame instead.
const GAP = { land: 0.09, hardLand: 0.14, crash: 0.2, scrape: 0.06, launchPop: 0.12, ui: 0.03, uiConfirm: 0.1, whoosh: 0.12 };
const SCORE_EVENTS = new Set(['trick', 'ring', 'missionComplete']);
// Per combo level, so each step up the combo is as loud as the last or a touch louder (the files differ in density).
const TRICK_GAIN = [0, 0.37, 0.5, 0.48, 0.52, 0.58];

// Motor order spectra as PeriodicWave harmonics of half the primary order: [harmonic, amplitude].
const DRIVE_ORDERS = [[1, 0.16], [2, 1], [3, 0.1], [4, 0.42], [6, 0.2], [8, 0.1], [12, 0.08], [16, 0.04], [24, 0.025]];
const REGEN_ORDERS = [[2, 0.55], [3, 0.5], [5, 0.38], [6, 0.18], [7, 0.16], [10, 0.07], [14, 0.04]];

// Decode order: what the game needs first comes first.
const FIRST = ['ui_confirm', 'ui_click', 'ambience', 'tyre_roll', 'wind', 'jet_lift', 'jet_rumble', 'lift_burst_a',
  'lift_burst_b', 'lift_tail', 'lift_open', 'jet_rear', 'rear_burst', 'rear_tail', 'land_soft_a', 'land_soft_b'];
const decodeOrder = () => [...FIRST.filter((n) => SOUND_FILES[n]), ...Object.keys(SOUND_FILES).filter((n) => !FIRST.includes(n))];

function decode(c, ab) {
  return new Promise((res, rej) => {
    let done = false;
    const ok = (b) => { if (!done) { done = true; res(b); } };
    const ko = (e) => { if (!done) { done = true; rej(e || new Error('decode failed')); } };
    try {
      const p = c.decodeAudioData(ab, ok, ko);
      if (p && typeof p.then === 'function') p.then(ok, ko);
    } catch (e) {
      ko(e);
    }
  });
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.m = null;
    this.buf = Object.create(null);
    this._muted = false;
    this._userMuted = false; // the player's own mute (M key / unpaused state)
    this._paused = false; // pause menu open: game muted, menu clicks still audible
    this._volume = 0.7;
    this._hidden = false;
    this._offline = false;
    this._voices = new Set();
    this._lastEvent = Object.create(null);
    this._warned = Object.create(null);
    this._lastPick = Object.create(null);
    this._waiting = [];
    this._layers = [];
    this._sq = [];
    this._sqArmed = false;
    this._combo = 0;
    this._ring = { t: -99, step: 0 };
    // continuous state
    this._pitch = 1;
    this._slow = 0;
    this._inSlow = false;
    this._slowT0 = 0;
    this._ws = 0;
    this._load = 0;
    this._regen = 0;
    this._acc = 0;
    this._prevV = 0;
    this._lift = 0;
    this._rear = 0;
    this._liftOn = false;
    this._rearOn = false;
    this._liftLvl = 0;
    this._liftPopT = -99;
    this._edgeT = { lift: -99, rear: -99 };
    this._spool = 0;
    this._sqA = 0;
    this._wob = 0;
    this._rcsNext = 0;
    this._launchT = null;
    this._launchCool = -99;
    this._prevSpd = 0;
    this._driftT = 0;
    this._st = { v: 0, onG: true, ground: true };
    if (typeof window !== 'undefined') {
      this._installGestures();
      this._prefetch();
    }
  }

  // ------------------------------------------------------------------ setup ---
  init(opts) {
    opts = opts || {};
    if (!this.ctx) {
      const c = opts.context || this._createContext();
      if (!c) return this;
      this._adopt(c);
    }
    this._resume();
    if (!this.ready) this._startGame();
    return this;
  }

  /** Resolves when every sound file has been decoded (or failed). Used by the offline render harness. */
  whenLoaded() {
    return this._decoding || Promise.resolve();
  }

  _createContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this._warnOnce('nowa', '[audio] WebAudio not supported');
      return null;
    }
    try {
      return new AC({ latencyHint: 'interactive' });
    } catch {
      try {
        return new AC();
      } catch {
        return null;
      }
    }
  }

  _adopt(c) {
    this.ctx = c;
    this._offline = typeof c.startRendering === 'function';
    this._buildMaster();
    if (!this._decoder) this._decodeAll(c);
    else if (this._retry && this._retry.length) this._retryDecode();
    if (!this._offline && typeof document !== 'undefined') {
      this._onVis = () => this._visibility();
      document.addEventListener('visibilitychange', this._onVis);
      this._visibility();
    }
  }

  _prefetch() {
    if (this._files || typeof fetch !== 'function') return;
    let base = AudioEngine.baseUrl;
    if (!base) {
      try {
        base = new URL('sounds/', document.baseURI).href;
      } catch {
        base = 'sounds/';
      }
    }
    this._files = {};
    for (const name of decodeOrder()) {
      const p = fetch(base + SOUND_FILES[name][0]).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      });
      p.catch(() => {});
      this._files[name] = p;
    }
    // Decode straight away on an offline context: needs no user gesture, so buffers are ready when the game starts.
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (Off) {
      try {
        this._decoder = new Off(1, 1, 44100);
      } catch {
        this._decoder = null;
      }
    }
    if (this._decoder) this._decodeAll(this._decoder);
  }

  _decodeAll(dc) {
    if (this._decoding || !this._files) return this._decoding;
    const names = decodeOrder();
    this._retry = [];
    let i = 0;
    const next = () => {
      if (i >= names.length) return Promise.resolve();
      const name = names[i++];
      return this._files[name]
        .then((ab) => decode(dc, ab.slice(0)).then((b) => this._gotBuffer(name, b), () => this._retry.push(name)))
        .catch((e) => this._warnOnce('load:' + name, `[audio] could not load ${name}: ${e && e.message}`))
        .then(next);
    };
    this._decoding = Promise.all([next(), next(), next(), next()]).then(() => this._retryDecode());
    return this._decoding;
  }

  _retryDecode() {
    if (!this.ctx || !this._retry || !this._retry.length) return Promise.resolve();
    const names = this._retry.splice(0);
    return Promise.all(names.map((name) => this._files[name]
      .then((ab) => decode(this.ctx, ab.slice(0)))
      .then((b) => this._gotBuffer(name, b))
      .catch((e) => this._warnOnce('dec:' + name, `[audio] could not decode ${name}: ${e && e.message}`))));
  }

  _gotBuffer(name, b) {
    this.buf[name] = b;
    if (!this.ready) return;
    for (const L of this._layers) if (L.name === name) this._attach(L);
    if (this._waiting.length) {
      const now = this.ctx.currentTime;
      const keep = [];
      for (const w of this._waiting) {
        if (w.name !== name) keep.push(w);
        else if (now - w.t < 0.35) this._shot(name, w.o);
      }
      this._waiting = keep;
    }
  }

  _installGestures() {
    // iPhone: audio only starts from inside a user gesture. Any tap or key unlocks (and later re-unlocks) it.
    const unlock = () => this._unlock();
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click']) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    }
    if (typeof document === 'undefined') return;
    // Menu clicks: the pause menu and the touch mini-buttons have no audio calls of their own.
    document.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('#menu button, #menu input[type="checkbox"], #menu select') : null;
      if (el && this.ready) this.event('ui', el.tagName === 'BUTTON' ? 1 : 0.75);
    }, true);
    document.addEventListener('pointerdown', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('.t-mini') : null;
      if (el && this.ready && el.dataset.act !== 'pause') this.event('ui', 0.7);
    }, true);
  }

  _unlock() {
    if (this._offline) return;
    if (!this.ctx) {
      const c = this._createContext();
      if (!c) return;
      this._adopt(c);
    }
    const c = this.ctx;
    if (c.state !== 'running' && !this._hidden && c.resume) c.resume().catch(() => {});
    if (!this._unlocked) {
      try {
        const s = c.createBufferSource();
        s.buffer = c.createBuffer(1, 1, c.sampleRate);
        s.connect(c.destination);
        s.start(0);
        this._unlocked = true;
      } catch {}
    }
  }

  _resume() {
    const c = this.ctx;
    if (c && !this._offline && c.state !== 'running' && !this._hidden && c.resume) c.resume().catch(() => {});
  }

  _visibility() {
    this._hidden = !!document.hidden;
    if (!this.m) return;
    this._set(this.m.vis.gain, this._hidden ? 0 : 1, 0.04);
    clearTimeout(this._suspendTimer);
    if (this._hidden) {
      this._suspendTimer = setTimeout(() => {
        if (this._hidden && this.ctx.state === 'running' && this.ctx.suspend) this.ctx.suspend().catch(() => {});
      }, 300);
    } else this._resume();
  }

  // ------------------------------------------------------------ node helpers ---
  _gain(v = 0, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  _filter(type, f, q = 0.707, gain = 0) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    if (gain) b.gain.value = gain;
    return b;
  }

  _chain(...n) {
    for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]);
    return n[n.length - 1];
  }

  _panner(p, dest) {
    if (!this.ctx.createStereoPanner) return null;
    const s = this.ctx.createStereoPanner();
    s.pan.value = p;
    if (dest) s.connect(dest);
    return s;
  }

  /** Ramp an AudioParam toward v, skipping writes that would not change anything. */
  _set(param, v, tau = 0.05) {
    if (param._v !== undefined && Math.abs(param._v - v) <= 1e-4 * (Math.abs(v) + 1e-3)) return;
    param._v = v;
    param.setTargetAtTime(v, this.ctx.currentTime, tau);
  }

  /** Looping smoothed noise (unit RMS, band-limited to `cut` Hz), shared per cutoff. */
  _noiseBuffer(cut) {
    this._nb = this._nb || {};
    if (this._nb[cut]) return this._nb[cut];
    const c = this.ctx;
    const sr = c.sampleRate;
    const n = Math.floor(sr * 3);
    const x = new Float32Array(n);
    const a = cut >= sr / 2 ? 1 : 1 - Math.exp((-2 * Math.PI * cut) / sr);
    let y1 = 0;
    let y2 = 0;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      y1 += a * (w - y1);
      y2 += a * (y1 - y2);
      x[i] = cut >= sr / 2 ? w : y2;
      acc += x[i] * x[i];
    }
    const k = 1 / Math.sqrt(acc / n || 1);
    const xf = Math.floor(n * 0.1);
    const b = c.createBuffer(1, n - xf, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < n - xf; i++) d[i] = x[i] * k;
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      d[i] = (x[i] * Math.sqrt(t) + x[n - xf + i] * Math.sqrt(1 - t)) * k; // loop seam crossfade
    }
    this._nb[cut] = b;
    return b;
  }

  _noise(cut, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuffer(cut);
    s.loop = true;
    s.connect(dest);
    s.start(0, rnd(0, s.buffer.duration));
    return s;
  }

  /** Random modulation source: smoothed noise scaled to `depth`. */
  _mod(cut, depth) {
    const g = this._gain(depth);
    this._noise(cut, g);
    return g;
  }

  _wave(parts) {
    const n = Math.max(...parts.map((p) => p[0])) + 1;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (const [h, a] of parts) {
      const ph = (h * 2.399963) % (2 * Math.PI); // fixed, spread phases
      re[h] = a * Math.sin(ph);
      im[h] = a * Math.cos(ph);
    }
    return this.ctx.createPeriodicWave(re, im);
  }

  _osc(type, f, dest) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = f;
    o.connect(dest);
    o.start();
    return o;
  }

  // ----------------------------------------------------------------- master ---
  _buildMaster() {
    const c = this.ctx;
    const m = (this.m = {});
    const nyq = c.sampleRate / 2;
    m.vis = this._gain(1, c.destination);
    m.mute = this._gain(this._userMuted ? 0 : 1, m.vis);
    m.vol = this._gain(this._volume, m.mute);
    m.clip = c.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      const ax = Math.abs(x);
      curve[i] = Math.sign(x) * (ax < 0.88 ? ax : 0.88 + 0.11 * Math.tanh((ax - 0.88) / 0.11));
    }
    m.clip.curve = curve;
    m.clip.oversample = '2x';
    m.clip.connect(m.vol);
    m.lim = c.createDynamicsCompressor();
    m.lim.threshold.value = -4;
    m.lim.knee.value = 0;
    m.lim.ratio.value = 20;
    m.lim.attack.value = 0.002;
    m.lim.release.value = 0.12;
    m.lim.connect(m.clip);
    m.comp = c.createDynamicsCompressor();
    m.comp.threshold.value = -20;
    m.comp.knee.value = 12;
    m.comp.ratio.value = 2;
    m.comp.attack.value = 0.012;
    m.comp.release.value = 0.3;
    m.comp.connect(m.lim);
    m.pre = this._gain(MASTER_PRE, m.comp);
    m.mix = this._gain(1, m.pre);
    const an = () => {
      const a = c.createAnalyser();
      a.fftSize = 2048;
      return a;
    };
    m.anMix = an();
    m.anLim = an();
    m.anOut = an();
    m.mix.connect(m.anMix);
    m.lim.connect(m.anLim);
    m.clip.connect(m.anOut);
    this._anBuf = new Float32Array(2048);
    // game world (muted while paused) and the UI/score bus (never slowed)
    m.game = this._gain(1, m.mix);
    m.ui = this._gain(1, m.mix);
    m.duck = this._gain(1, m.game); // lets big UI stingers sit on top of the world
    m.slowLP = this._filter('lowpass', Math.min(20000, nyq * 0.95), 0.7);
    m.slowPk = this._filter('peaking', 620, 0.9, 0);
    this._chain(m.slowPk, m.slowLP, m.duck);
    m.dieg = this._gain(1, m.slowPk);
    m.loops = this._gain(1, m.dieg);
    m.sfx = this._gain(1, m.dieg);
    this._buildSpace();
  }

  /** Outdoor test site: near reflections off the ground and parked vehicles, plus a slap off distant hangars. */
  _buildSpace() {
    const c = this.ctx;
    const m = this.m;
    m.spaceIn = this._gain(1);
    const hp = this._filter('highpass', 240, 0.7);
    const lp = this._filter('lowpass', 2600, 0.7);
    lp.channelCount = 2;
    lp.channelCountMode = 'explicit';
    lp.channelInterpretation = 'speakers';
    this._chain(m.spaceIn, hp, lp);
    const split = c.createChannelSplitter(2);
    const merge = c.createChannelMerger(2);
    lp.connect(split);
    const dL = c.createDelay(1);
    const dR = c.createDelay(1);
    dL.delayTime.value = 0.187;
    dR.delayTime.value = 0.233;
    split.connect(dL, 0);
    split.connect(dR, 1);
    dL.connect(merge, 0, 0);
    dR.connect(merge, 0, 1);
    const fbL = this._gain(0.16, dR);
    const fbR = this._gain(0.16, dL);
    dL.connect(fbL);
    dR.connect(fbR);
    m.slap = this._gain(0.2, m.dieg);
    merge.connect(m.slap);
    m.early = c.createConvolver();
    m.early.normalize = false;
    m.early.buffer = this._outdoorIR();
    m.spaceIn.connect(m.early);
    m.earlyOut = this._gain(0.3, m.dieg);
    m.early.connect(m.earlyOut);
    m.sfxSend = this._gain(0.35, m.spaceIn);
    m.sfx.connect(m.sfxSend);
    m.loopSend = this._gain(0.05, m.spaceIn);
    m.loops.connect(m.loopSend);
  }

  _outdoorIR() {
    const c = this.ctx;
    const sr = c.sampleRate;
    const n = Math.floor(sr * 0.42);
    const b = c.createBuffer(2, n, sr);
    const taps = [[0.0042, 0.3], [0.019, 0.2], [0.031, 0.16], [0.047, 0.13], [0.066, 0.1], [0.094, 0.07], [0.13, 0.05]];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let z = 0;
      for (let i = Math.floor(sr * 0.012); i < n; i++) {
        z += 0.35 * (Math.random() * 2 - 1 - z);
        d[i] = z * 0.06 * Math.exp(-(i / sr) / 0.075);
      }
      for (const [t, g] of taps) {
        const i = Math.floor(t * (ch ? 1.06 : 0.95) * sr);
        if (i + 2 < n) {
          d[i] += g;
          d[i + 1] += g * 0.5;
          d[i + 2] += g * 0.2;
        }
      }
    }
    return b;
  }

  // ------------------------------------------------------------- game layers ---
  _startGame() {
    const m = this.m;
    const B = (this.bus = {});
    B.motor = this._gain(0.28, m.loops);
    B.tyre = this._gain(1, m.loops);
    B.wind = this._gain(1, m.loops);
    B.thrust = this._gain(THRUST_TRIM, m.loops);
    B.fan = this._gain(2.5, m.loops);
    B.amb = this._gain(1, m.loops);
    this._buildMotor();
    const L = (this.L = {});
    const nyq = this.ctx.sampleRate / 2;
    L.roll = this._loop('tyre_roll', B.tyre, ['lowpass', 3000, 0.6]);
    L.deck = this._loop('tyre_deck', B.tyre, ['lowpass', 3000, 0.6]);
    L.sqA = this._loop('squeal', B.tyre);
    L.sqB = this._loop('squeal', B.tyre);
    L.scrub = this._loop('scrub', B.tyre, ['lowpass', 4000, 0.6]);
    L.windLo = this._loop('wind', B.wind, ['lowpass', 900, 0.6]);
    L.windHi = this._loop('wind', B.wind, ['highpass', 1500, 0.6]);
    L.lift = this._loop('jet_lift', B.thrust, ['lowpass', Math.min(16000, nyq * 0.9), 0.6]);
    L.rumble = this._loop('jet_rumble', B.thrust);
    L.rear = this._loop('jet_rear', B.thrust);
    L.fan = this._loop('fan', B.fan, ['lowpass', 1500, 0.6]);
    L.amb = this._loop('ambience', B.amb);
    this._set(L.amb.g.gain, 0.7, 0.5);
    this.ready = true;
    for (const layer of this._layers) this._attach(layer);
  }

  _loop(name, dest, filter) {
    const L = { name, src: null, g: this._gain(0, dest), f: null, rate: 1 };
    if (filter) {
      L.f = this._filter(filter[0], filter[1], filter[2]);
      L.f.connect(L.g);
    }
    this._layers.push(L);
    return L;
  }

  _attach(L) {
    const b = this.buf[L.name];
    if (L.src || !b || !this.ctx) return;
    const spec = SOUND_FILES[L.name];
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.loop = true;
    const ls = spec[1];
    const le = Math.min(spec[2], b.duration - 0.002);
    s.loopStart = ls;
    s.loopEnd = le;
    s.playbackRate.value = L.rate;
    s.connect(L.f || L.g);
    s.start(this.ctx.currentTime, ls + Math.random() * (le - ls) * 0.98);
    L.src = s;
  }

  _buildMotor() {
    const M = (this.motor = {});
    const out = (M.out = this._gain(1));
    M.hp = this._filter('highpass', 55, 0.7);
    M.pk = this._filter('peaking', 1150, 0.9, 2.5);
    M.lp = this._filter('lowpass', 3000, 0.55);
    this._chain(out, M.hp, M.pk, M.lp, this.bus.motor);
    const drive = this._wave(DRIVE_ORDERS);
    const regen = this._wave(REGEN_ORDERS);
    // three motors (rear pair + front) share a torque-ripple stage
    M.rip = this._gain(1, out);
    this._mod(11, 0.13).connect(M.rip.gain);
    M.gA = this._gain(0, M.rip);
    M.oA = this._osc(drive, 0, M.gA);
    M.gB = this._gain(0, M.rip);
    M.oB = this._osc(drive, 0, M.gB);
    M.gF = this._gain(0, M.rip);
    M.oF = this._osc(drive, 0, M.gF);
    M.gGear = this._gain(0, out);
    M.oGear = this._osc('sine', 0, M.gGear);
    M.gGearF = this._gain(0, out);
    M.oGearF = this._osc('sine', 0, M.gGearF);
    M.gRegen = this._gain(0, out);
    M.oRegen = this._osc(regen, 0, M.gRegen);
    // grit: the primary order smeared into a narrow band by ring-modulating it with slow noise
    M.gGrit = this._gain(0, out);
    M.rm = this._gain(0, M.gGrit);
    M.oGrit = this._osc('sine', 0, M.rm);
    this._mod(45, 1).connect(M.rm.gain);
    // inverter: fixed carrier, amplitude-modulated by the primary order -> sidebands that spread with speed
    M.gInv = this._gain(0, out);
    M.invAM = this._gain(0.5, M.gInv);
    M.oInv = this._osc('sine', INVERTER_HZ, M.invAM);
    M.invDepth = this._gain(0.5, M.invAM.gain);
    M.oInvMod = this._osc('sine', 0, M.invDepth);
    // body: sub-order hum and drivetrain rumble under torque
    M.gBody = this._gain(0, out);
    M.bodyLP = this._filter('lowpass', 220, 0.7);
    M.bodyLP.connect(M.gBody);
    M.oBody = this._osc('sine', 0, M.bodyLP);
    M.gBodyN = this._gain(0, out);
    M.bodyNLP = this._filter('lowpass', 130, 0.8);
    M.bodyNLP.connect(M.gBodyN);
    this._noise(24000, M.bodyNLP);
    // shared wow/flutter (cents)
    const jit = this._mod(2.2, 4.5);
    for (const o of [M.oA, M.oB, M.oF, M.oGear, M.oGearF, M.oRegen, M.oGrit]) jit.connect(o.detune);
  }

  // ----------------------------------------------------------------- update ---
  update(dt, s = {}) {
    if (!this.ready) return;
    const c = this.ctx;
    if (!this._offline && c.state !== 'running') return;
    const now = c.currentTime;
    dt = clamp(num(dt, 1 / 60), 0, 0.1);
    s = s || {};
    const v = clamp(Math.abs(num(s.speed)), 0, 130);
    const thr = clamp(num(s.throttle), -1, 1);
    const boost = clamp(num(s.boost), 0, 1);
    const lift = clamp(num(s.lift), 0, 1);
    const rcs = clamp(num(s.rcs), 0, 1);
    const suction = clamp(num(s.suction), 0, 1);
    const onG = s.onGround !== false;
    const drift = clamp(num(s.drifting), 0, 1);
    const ts = clamp(num(s.timeScale, 1), 0.05, 1);
    const ground = onG && suction < 0.5;
    const ramp = onG && suction >= 0.5;
    const sdt = dt * ts; // game time
    this._st = { v, onG, ground, ramp };
    const L = this.L;
    const M = this.motor;
    const m = this.m;

    // ---- slow motion: pitch everything diegetic down and close the air in
    const slowT = clamp((1 - ts) / 0.65, 0, 1);
    this._slow = ease(this._slow, slowT, dt, slowT > this._slow ? 0.05 : 0.16);
    const P = (this._pitch = 1 - 0.27 * this._slow);
    this._set(m.slowLP.frequency, Math.min(20000, c.sampleRate * 0.45) * Math.pow(1300 / 20000, this._slow), 0.03);
    this._set(m.slowPk.gain, 3.5 * this._slow, 0.05);
    if (ts < 0.95 && !this._inSlow) {
      this._inSlow = true;
      this._slowT0 = now;
      this._shot('slowmo_in', { bus: m.ui, gain: 0.5, ui: true });
    } else if (ts >= 0.95 && this._inSlow) {
      this._inSlow = false;
      if (now - this._slowT0 > 0.25) this._shot('slowmo_out', { bus: m.ui, gain: 0.42, ui: true });
    }

    // ---- drivetrain state: wheel speed, load, regen (reversing under power counts as load)
    const accel = sdt > 1e-4 ? (v - this._prevV) / sdt : 0;
    this._acc = ease(this._acc, clamp(accel, -40, 40), dt, 0.15);
    this._prevV = v;
    let load = 0;
    let regen = 0;
    const burnout = onG && drift > 0.25 && thr > 0.3 && v < 8;
    if (onG) {
      if (burnout) load = 0.95; // wheels spinning against the brakes: full torque
      else if (thr > 0.05) load = thr;
      else if (thr < -0.05) {
        if (this._acc > 0.4 && v > 0.5) load = Math.min(1, -thr * 2);
        else regen = Math.min(1, -thr * 2) * sstep(v, 0.5, 4);
      } else regen = 0.3 * sstep(v, 3, 10);
    }
    let wsT = v;
    if (burnout) wsT = Math.max(v, 16 + 14 * drift);
    this._ws = onG ? ease(this._ws, wsT, dt, 0.05) : this._ws * Math.exp(-0.5 * sdt);
    this._load = ease(this._load, load, dt, load > this._load ? 0.06 : 0.12);
    this._regen = ease(this._regen, regen, dt, 0.1);
    const ws = this._ws;
    const Ls = this._load;
    const Rs = this._regen;
    const f1 = WHINE_HZ_PER_MS * ws * P;
    const spd = sstep(ws, 0.4, 5);
    const hi = sstep(ws, 45, 100);
    const drv = spd * (0.2 + 0.8 * Ls) * (1 - 0.3 * hi);
    const fT = 0.03;
    this._set(M.oA.frequency, f1 * 0.5, fT);
    this._set(M.oB.frequency, f1 * 0.5 * 1.0045, fT);
    this._set(M.oF.frequency, f1 * 0.5 * FRONT_RATIO, fT);
    this._set(M.oGear.frequency, f1 * GEAR_ORDER, fT);
    this._set(M.oGearF.frequency, f1 * GEAR_ORDER * FRONT_RATIO, fT);
    this._set(M.oRegen.frequency, f1 * 0.5 * 0.995, fT);
    this._set(M.oGrit.frequency, f1, fT);
    this._set(M.oInv.frequency, INVERTER_HZ * P, fT);
    this._set(M.oInvMod.frequency, f1, fT);
    this._set(M.oBody.frequency, f1 * 0.25, fT);
    const gT = 0.05;
    this._set(M.gA.gain, 0.3 * drv, gT);
    this._set(M.gB.gain, 0.2 * drv, gT);
    this._set(M.gF.gain, 0.2 * drv * (0.35 + 0.65 * Ls), gT);
    this._set(M.gGear.gain, spd * (0.035 + 0.07 * Ls + 0.05 * Rs), gT);
    this._set(M.gGearF.gain, spd * (0.02 + 0.045 * Ls), gT);
    this._set(M.gGrit.gain, 0.12 * drv, gT);
    this._set(M.gRegen.gain, 0.3 * Rs * spd, gT);
    this._set(M.gInv.gain, (0.012 + 0.05 * Math.max(Ls, Rs)) * sstep(ws, 0.2, 2) * (1 - sstep(ws, 15, 50)), gT);
    const body = Math.pow(Ls, 0.8) * sstep(ws, 0, 2) * (1 - 0.6 * sstep(ws, 20, 60));
    this._set(M.gBody.gain, 0.25 * body, gT);
    this._set(M.gBodyN.gain, 0.5 * body, gT);
    this._set(M.lp.frequency, Math.min(16000, 1800 + 6500 * Ls + 2000 * Rs + 3000 * hi), 0.08);

    // ---- tyres: rolling by speed and surface, squeal and scrub when sliding
    // roughly +22 dB per decade of speed up to motorway pace, flattening out above (wind takes over)
    const vr = v / 25;
    const vp = Math.pow(vr, 0.9);
    const roll = sstep(v, 0.3, 4) * vp / (1 + 0.45 * vp);
    this._set(L.roll.g.gain, ground ? 0.71 * roll : 0, 0.03);
    this._set(L.deck.g.gain, ramp ? 0.78 * roll : 0, 0.03);
    const rollRate = clamp(0.55 + 0.45 * Math.pow(vr, 0.6), 0.5, 1.6) * P;
    this._rate(L.roll, rollRate);
    this._rate(L.deck, rollRate);
    const rollLP = Math.min(14000, 2000 + 3000 * vr);
    this._set(L.roll.f.frequency, rollLP, 0.08);
    this._set(L.deck.f.frequency, rollLP * 1.2, 0.08);
    const vEff = burnout ? Math.max(v, 12) : v;
    const sq = onG ? Math.pow(drift, 1.2) * sstep(vEff, 1, 6) : 0;
    this._sqA = ease(this._sqA, sq, dt, sq > this._sqA ? 0.04 : 0.09);
    this._wob = clamp(this._wob + (Math.random() - 0.5) * dt * 8 - this._wob * dt * 1.6, -1, 1);
    this._set(L.sqA.g.gain, 0.95 * this._sqA, 0.02);
    this._set(L.sqB.g.gain, 0.63 * this._sqA, 0.02);
    const sqRate = (0.95 + 0.08 * drift + 0.03 * this._wob) * P;
    this._rate(L.sqA, sqRate);
    this._rate(L.sqB, sqRate * 1.063);
    this._set(L.scrub.g.gain, onG ? 0.8 * drift * (0.35 + 0.65 * sstep(v, 3, 25)) : 0, 0.03);
    this._rate(L.scrub, (0.85 + 0.25 * sstep(v, 3, 40)) * P);

    // ---- wind
    const vw = v / 100;
    this._set(L.windLo.g.gain, (0.01 + 1.1 * Math.pow(vw, 1.2)) * (onG ? 1 : 1.15), 0.12);
    this._set(L.windHi.g.gain, 0.5 * Math.pow(vw, 2.5), 0.12);
    this._set(L.windLo.f.frequency, 450 + 3800 * vw, 0.15);
    const wr = (0.82 + 0.3 * vw) * P;
    this._rate(L.windLo, wr);
    this._rate(L.windHi, wr * 1.07);

    // ---- cold-gas thrusters: valve crack on open, sustained jets, bleed-off tail on close
    const liftOn = lift > 0.05;
    if (liftOn && !this._liftOn) {
      if (now - this._liftPopT > 0.2 && now - this._edgeT.lift > 0.08) this._shot('lift_open', { gain: 0.82 * (0.6 + 0.4 * lift), send: 0.5 });
      this._edgeT.lift = now;
    } else if (!liftOn && this._liftOn) {
      this._shot('lift_tail', { gain: 0.6 * THRUST_TRIM * (0.5 + 0.5 * this._liftLvl), send: 0.5 });
      this._edgeT.lift = now;
    }
    this._liftOn = liftOn;
    if (liftOn) this._liftLvl = lift;
    const rearOn = boost > 0.05;
    if (rearOn && !this._rearOn) {
      if (now - this._edgeT.rear > 0.08) this._shot('rear_burst', { gain: 0.82, send: 0.5 });
      this._edgeT.rear = now;
    } else if (!rearOn && this._rearOn) {
      this._shot('rear_tail', { gain: 0.5 * THRUST_TRIM, send: 0.4 });
      this._edgeT.rear = now;
    }
    this._rearOn = rearOn;
    this._lift = ease(this._lift, lift, dt, lift > this._lift ? 0.012 : 0.03);
    this._rear = ease(this._rear, boost, dt, boost > this._rear ? 0.015 : 0.03);
    this._set(L.lift.g.gain, 0.55 * this._lift, 0.01);
    this._set(L.rumble.g.gain, 0.5 * this._lift, 0.01);
    this._set(L.rear.g.gain, 0.6 * this._rear, 0.01);
    this._rate(L.lift, P);
    this._rate(L.rumble, P);
    this._rate(L.rear, P);
    this._rcs(rcs, now, P);

    // ---- suction fans spool with ramp contact
    const suck = ramp ? 1 : 0;
    this._spool = ease(this._spool, suck, sdt, suck > this._spool ? 0.55 : 1.3);
    const sp = this._spool;
    this._set(L.fan.g.gain, 0.38 * Math.pow(sp, 1.3), 0.05);
    this._rate(L.fan, (0.3 + 0.7 * sp) * P);
    this._set(L.fan.f.frequency, 800 + 9000 * sp, 0.08);

    // ---- moments: standstill launch, 0-60 (mirrors the game's own timer), drift banked
    const launchIn = thr > 0.5 || boost > 0;
    if (ground) {
      if (this._prevSpd < 0.3 && launchIn && this._launchT === null) {
        this._launchT = 0;
        if (now - this._launchCool > 1.2) {
          this._launchCool = now;
          this._shot('launch', { gain: (0.5 + 0.35 * boost) * clamp(thr, 0.6, 1), send: 0.6 });
        }
      }
      if (this._launchT !== null) {
        if (!launchIn) this._launchT = null;
        else {
          this._launchT += sdt;
          if (v * MPH >= 60) {
            this._score('sixty', this._launchT);
            this._launchT = null;
          } else if (this._launchT > 5) this._launchT = null;
        }
      }
    } else this._launchT = null;
    if (v < 0.3 && thr < 0.5 && !boost) this._launchT = null;
    this._prevSpd = v;
    if (ground && drift > 0.034 && v > 6) this._driftT += sdt;
    else {
      if (this._driftT > 1.2) this._score('bankDrift');
      this._driftT = 0;
    }
  }

  _rate(L, r) {
    L.rate = r;
    if (L.src) this._set(L.src.playbackRate, r, 0.04);
  }

  _rcs(rcs, now, P) {
    if (rcs < 0.02 || !this.buf.rcs_1) {
      this._rcsNext = now;
      return;
    }
    if (this._rcsNext < now) this._rcsNext = now + 0.004;
    const horizon = now + 0.08;
    while (this._rcsNext < horizon) {
      const t = this._rcsNext;
      this._shot(this._pick('rcs', ['rcs_1', 'rcs_2', 'rcs_3', 'rcs_4']), {
        when: t, gain: (0.24 + 0.27 * Math.random()) * (0.55 + 0.45 * rcs), pan: rnd(-0.75, 0.75), rate: rnd(0.9, 1.12), send: 0.3,
      });
      this._rcsNext = t + ((1 / (3.5 + 9 * rcs)) * rnd(0.55, 1.45)) / P;
    }
  }

  // ----------------------------------------------------------------- events ---
  event(name, x = 1) {
    if (!this.ready || this._hidden) return;
    const fn = this['_ev_' + name];
    if (typeof fn !== 'function') {
      this._warnOnce('ev:' + name, `[audio] unknown event "${name}"`);
      return;
    }
    if (!SCORE_EVENTS.has(name)) {
      const now = this.ctx.currentTime;
      if (now - (this._lastEvent[name] ?? -1e9) < (GAP[name] || 0)) return;
      if (this._voices.size >= MAX_VOICES && name !== 'ui' && name !== 'uiConfirm') return;
      this._lastEvent[name] = now;
    }
    try {
      fn.call(this, num(x, 1));
    } catch (e) {
      this._warnOnce('evf:' + name, '[audio] event failed ' + name, e);
    }
  }

  _ev_land(e) {
    const k = clamp(e, 0, 1);
    this._shot(this._pick('land', ['land_soft_a', 'land_soft_b']), { gain: 0.35 + 0.6 * k, rate: 1.05 - 0.08 * k, send: 1 });
    this._score('land');
  }

  _ev_hardLand(e) {
    const k = clamp((e - 0.8) / 0.2, 0, 1);
    this._duck(4, 0.08, 0.5);
    this._shot(this._pick('hland', ['land_hard_a', 'land_hard_b']), { gain: 1.3 + 0.3 * k, rate: 1 - 0.04 * k, send: 1 });
    this._score('land');
  }

  _ev_crash(e) {
    const k = clamp(e, 0, 1.2);
    this._duck(6, 0.12, 0.7);
    this._shot(k > 0.75 ? 'crash_a' : 'crash_b', { gain: 1.1 + 0.6 * Math.min(k, 1), rate: rnd(0.96, 1.03), send: 1 });
    this._score('crash');
  }

  _ev_scrape(e) {
    const k = clamp(e, 0, 1);
    this._shot(this._pick('scrape', ['scrape_a', 'scrape_b', 'scrape_c']), {
      gain: 0.25 + 0.7 * k, rate: rnd(0.9, 1.1), pan: rnd(-0.3, 0.3), send: 0.8,
    });
  }

  _ev_launchPop(e) {
    const now = this.ctx.currentTime;
    this._liftPopT = now;
    if (e < 0.75) {
      // crash recovery: the RCS rights the car with a softer lift puff
      this._shot('lift_burst_b', { gain: 0.42, rate: 1.12, send: 0.5 });
      return;
    }
    this._duck(2.5, 0.05, 0.3);
    this._shot(this._pick('lift', ['lift_burst_a', 'lift_burst_b']), { gain: 0.7 + 0.25 * clamp(e, 0, 1), send: 0.8 });
  }

  _ev_ring() {
    this._score('ring');
  }

  _ev_trick(n) {
    this._score('trick', clamp(Math.round(n), 1, 5));
  }

  _ev_missionComplete() {
    this._score('mission');
  }

  _ev_ui(e) {
    this._shot('ui_click', { bus: this.m.ui, gain: 0.32 * clamp(e, 0.2, 1.5), rate: rnd(0.97, 1.03), ui: true });
  }

  _ev_uiConfirm(e) {
    this._shot('ui_confirm', { bus: this.m.ui, gain: 0.5 * clamp(e, 0.2, 1.5), ui: true });
  }

  _ev_whoosh(e) {
    this._shot('whoosh', { gain: 0.45 * clamp(e, 0, 1.5), rate: rnd(0.92, 1.08), send: 0.4 });
  }

  // Score sounds are collected for the rest of the frame and resolved once: a landing that banks a combo
  // plays one "banked" sound instead of three trick blips, a ring swallows its own trick call, and a mission
  // complete outranks everything else that frame.
  _score(kind, arg) {
    this._sq.push([kind, arg]);
    if (this._sqArmed) return;
    this._sqArmed = true;
    const run = () => this._flushScore();
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else Promise.resolve().then(run);
  }

  _flushScore() {
    this._sqArmed = false;
    const q = this._sq;
    this._sq = [];
    if (!this.ready) return;
    let tricks = 0;
    let lvl = 0;
    let ring = false;
    let mission = false;
    let land = false;
    let crash = false;
    let sixty = false;
    let drift = false;
    for (const [k, a] of q) {
      if (k === 'trick') {
        tricks++;
        lvl = Math.max(lvl, a || 1);
      } else if (k === 'ring') ring = true;
      else if (k === 'mission') mission = true;
      else if (k === 'land') land = true;
      else if (k === 'crash') crash = true;
      else if (k === 'sixty') sixty = true;
      else if (k === 'bankDrift') drift = true;
    }
    const ui = this.m.ui;
    if (crash) this._combo = 0;
    if (mission) {
      this._duck(5, 0.7, 0.6, true);
      this._shot('mission', { bus: ui, gain: 0.62, ui: true });
    }
    if (land) {
      const total = this._combo + tricks;
      this._combo = 0;
      if (!mission && total > 0) this._shot(total >= 3 ? 'bank_l' : 'bank_s', { bus: ui, gain: 0.58, ui: true, delay: 0.07 });
    } else if (tricks || ring) {
      this._combo += tricks;
      if (!mission) {
        if (ring) this._ringShot();
        else {
          const l = clamp(lvl, 1, 5);
          this._shot('trick_' + l, { bus: ui, gain: TRICK_GAIN[l], ui: true });
        }
      }
      // a trick called while rolling on plain ground (loop-the-loop) is banked on the spot
      if (tricks && this._st.ground) {
        if (!mission) this._shot('bank_s', { bus: ui, gain: 0.55, ui: true, delay: 0.35 });
        this._combo = 0;
      }
    }
    if (sixty && !mission) this._shot('sixty', { bus: ui, gain: 0.5, ui: true });
    if (drift && !mission && !land) this._shot('bank_s', { bus: ui, gain: 0.52, ui: true, rate: 0.94 });
  }

  _ringShot() {
    const now = this.ctx.currentTime;
    const steps = [0, 2, 4, 7, 9];
    this._ring.step = now - this._ring.t < 12 ? Math.min(steps.length - 1, this._ring.step + 1) : 0;
    this._ring.t = now;
    this._shot('ring', { bus: this.m.ui, gain: 0.62, ui: true, rate: Math.pow(2, steps[this._ring.step] / 12) });
  }

  // -------------------------------------------------------------- one-shots ---
  _pick(group, names) {
    let i = Math.floor(Math.random() * names.length);
    if (names.length > 1 && names[i] === this._lastPick[group]) i = (i + 1) % names.length;
    this._lastPick[group] = names[i];
    return names[i];
  }

  /** Play a decoded one-shot. o: bus, gain, rate, pan, when, delay, send (outdoor space), ui (skip slow-mo pitch). */
  _shot(name, o = {}) {
    if (!this.ctx || !this.m) return null;
    const b = this.buf[name];
    if (!b) {
      if (this.ready && this._waiting.length < 16) this._waiting.push({ name, o, t: this.ctx.currentTime });
      return null;
    }
    if (this._voices.size >= MAX_VOICES && !o.ui) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = b;
    const rate = (o.rate || 1) * (o.ui ? 1 : this._pitch);
    src.playbackRate.value = rate;
    const g = this._gain(o.gain ?? 1);
    src.connect(g);
    let node = g;
    const nodes = [src, g];
    if (o.pan) {
      const p = this._panner(o.pan);
      if (p) {
        g.connect(p);
        node = p;
        nodes.push(p);
      }
    }
    node.connect(o.bus || this.m.sfx);
    if (o.send && !o.ui) {
      const sg = this._gain(o.send, this.m.spaceIn);
      node.connect(sg);
      nodes.push(sg);
    }
    const when = Math.max(c.currentTime, o.when || c.currentTime) + (o.delay || 0);
    src.start(when);
    const voice = { name, src, g, end: when + b.duration / rate };
    this._voices.add(voice);
    src.onended = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {}
      }
      this._voices.delete(voice);
    };
    return voice;
  }

  /** Dip the world (loops, or the whole diegetic mix for UI stingers) so a big moment reads. */
  _duck(dbAmt, hold, release, world = false) {
    const p = (world ? this.m.duck : this.m.loops).gain;
    const now = this.ctx.currentTime;
    const floor = Math.pow(10, -dbAmt / 20);
    const cur = Math.min(1, p.value);
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now);
    else {
      p.cancelScheduledValues(now);
      p.setValueAtTime(cur, now);
    }
    p.linearRampToValueAtTime(Math.min(cur, floor), now + 0.02);
    p.setTargetAtTime(1, now + 0.02 + hold, release / 3);
  }

  // ------------------------------------------------------------ mute/volume ---
  setMuted(on) {
    on = !!on;
    this._muted = on;
    if (on && this._menuOpen()) {
      // pause: silence the world, keep the menu audible unless the player muted
      const was = this._paused;
      this._paused = true;
      this._applyMute();
      if (!was && this.ready) this._shot('ui_pause', { bus: this.m.ui, gain: 0.45, ui: true });
      return;
    }
    const wasPaused = this._paused;
    const wasUserMuted = this._userMuted;
    this._paused = false;
    this._userMuted = on;
    this._applyMute();
    if (!this.ready || on) return;
    if (wasPaused) this._shot('ui_resume', { bus: this.m.ui, gain: 0.45, ui: true });
    else if (wasUserMuted) this._shot('ui_click', { bus: this.m.ui, gain: 0.3, ui: true });
  }

  _applyMute() {
    if (!this.m) return;
    this._set(this.m.mute.gain, this._userMuted ? 0 : 1, 0.02);
    this._set(this.m.game.gain, this._paused ? 0 : 1, 0.03);
  }

  _menuOpen() {
    try {
      const el = document.getElementById('menu');
      return !!el && !el.classList.contains('hidden');
    } catch {
      return false;
    }
  }

  setMasterVolume(v) {
    this._volume = clamp(num(v, 0.7), 0, 1);
    if (!this.m) return;
    this._set(this.m.vol.gain, this._volume, 0.03);
    const now = this.ctx.currentTime;
    if (this.ready && now - (this._volTick ?? -1) > 0.09) {
      this._volTick = now;
      this._shot('ui_click', { bus: this.m.ui, gain: 0.3, rate: 0.9 + 0.25 * this._volume, ui: true });
    }
  }

  get activeVoices() {
    return this._voices.size;
  }

  getLevels() {
    if (!this.ready) return null;
    const m = this.m;
    const read = (a) => {
      const d = this._anBuf;
      a.getFloatTimeDomainData(d);
      let pk = 0;
      let sq = 0;
      for (let i = 0; i < d.length; i++) {
        const x = d[i];
        const ax = x < 0 ? -x : x;
        if (ax > pk) pk = ax;
        sq += x * x;
      }
      return [pk, Math.sqrt(sq / d.length)];
    };
    const [mixPeak, mixRms] = read(m.anMix);
    const [limPeak] = read(m.anLim);
    const [outPeak, outRms] = read(m.anOut);
    const red = (n) => (typeof n.reduction === 'number' ? n.reduction : (n.reduction && n.reduction.value) || 0);
    return {
      mixPeak, mixRms, limPeak, outPeak, outRms,
      compReduction: red(m.comp), limReduction: red(m.lim),
      voices: this._voices.size, state: this.ctx.state,
    };
  }

  tap() {
    if (!this.ctx || !this.m || this._offline || !this.ctx.createMediaStreamDestination) return null;
    if (!this.m.tapDest) {
      this.m.tapDest = this.ctx.createMediaStreamDestination();
      this.m.vis.connect(this.m.tapDest);
    }
    return this.m.tapDest.stream;
  }

  _warnOnce(key, ...msg) {
    if (this._warned[key]) return;
    this._warned[key] = 1;
    console.warn(...msg);
  }
}

AudioEngine.baseUrl = null; // override (e.g. for the offline render harness); default resolves ./sounds/

export { AudioEngine };
