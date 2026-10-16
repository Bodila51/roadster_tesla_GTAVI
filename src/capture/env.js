// Virtual environment for frame-exact capture.
// Seeded Math.random, a virtual clock (performance.now, Date), a manual requestAnimationFrame queue and,
// once armed, virtual setTimeout/setInterval. The game then only advances when the capture engine says so.
//
// Keep this file self-contained (no imports, plain functions): tools/capture.mjs injects this exact source
// before any page script runs, and src/capture/boot.js installs it when the page is opened in a normal browser.
function installCaptureEnv(w, opts) {
  if (w.__capEnv) return w.__capEnv;
  const o = opts || {};
  const perf = w.performance;
  const real = {
    now: perf.now.bind(perf),
    Date: w.Date,
    raf: w.requestAnimationFrame.bind(w),
    caf: w.cancelAnimationFrame.bind(w),
    setTimeout: w.setTimeout.bind(w),
    clearTimeout: w.clearTimeout.bind(w),
    setInterval: w.setInterval.bind(w),
    clearInterval: w.clearInterval.bind(w),
  };
  const epoch = o.epoch || 1760000000000; // fixed wall-clock origin for Date
  let now = 0; // virtual milliseconds since load

  // mulberry32, the same generator tools/sim.mjs uses
  const makeRng = (seed) => {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  let cur = makeRng(o.seed == null ? 12345 : o.seed);
  w.Math.random = () => cur();
  try {
    // crypto randomness too, in case a module draws noise or ids from it
    const c = w.crypto;
    if (c && typeof c.getRandomValues === "function") {
      Object.defineProperty(c, "getRandomValues", {
        configurable: true,
        value: (arr) => {
          const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
          for (let i = 0; i < b.length; i++) b[i] = (cur() * 256) | 0;
          return arr;
        },
      });
      if (typeof c.randomUUID === "function")
        Object.defineProperty(c, "randomUUID", {
          configurable: true,
          value: () => "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (d) => (+d ^ (((cur() * 256) | 0) & (15 >> (+d / 4)))).toString(16)),
        });
    }
  } catch (e) {
    /* keep the real crypto */
  }

  perf.now = () => now;
  const RealDate = real.Date;
  class VirtualDate extends RealDate {
    constructor(...a) {
      if (a.length) super(...a);
      else super(epoch + now);
    }
    static now() {
      return epoch + now;
    }
  }
  w.Date = VirtualDate;

  let rafQueue = [];
  let rafId = 0;
  w.requestAnimationFrame = (cb) => {
    rafQueue.push([++rafId, cb]);
    return rafId;
  };
  w.cancelAnimationFrame = (id) => {
    rafQueue = rafQueue.filter((e) => e[0] !== id);
  };

  const timers = new Map();
  let timerId = 1 << 29; // far from real timer ids
  let timersArmed = false;

  const env = {
    real,
    makeRng,
    get now() {
      return now;
    },
    setNow(ms) {
      now = ms;
    },
    // reseed the generator behind Math.random
    seed(s) {
      cur = makeRng(s);
    },
    // run fn with Math.random drawing from another generator, so it cannot disturb the main stream
    isolate(rng, fn, self, args) {
      const prev = cur;
      cur = rng;
      try {
        return fn.apply(self, args);
      } finally {
        cur = prev;
      }
    },
    // run the queued animation-frame callbacks once, with the current virtual time
    frame() {
      const list = rafQueue;
      rafQueue = [];
      for (const [, cb] of list) cb(now);
    },
    get pendingFrames() {
      return rafQueue.length;
    },
    // from now on setTimeout/setInterval run on the virtual clock
    armTimers() {
      if (timersArmed) return;
      timersArmed = true;
      w.setTimeout = (fn, ms, ...args) => {
        const id = ++timerId;
        timers.set(id, { fn, args, at: now + Math.max(0, +ms || 0), every: 0 });
        return id;
      };
      w.setInterval = (fn, ms, ...args) => {
        const id = ++timerId;
        const every = Math.max(1, +ms || 0);
        timers.set(id, { fn, args, at: now + every, every });
        return id;
      };
      w.clearTimeout = w.clearInterval = (id) => {
        if (!timers.delete(id)) {
          real.clearTimeout(id);
          real.clearInterval(id);
        }
      };
    },
    // fire the timers that are due; timers created meanwhile wait for the next call
    fireTimers() {
      if (!timers.size) return;
      const due = [];
      for (const [id, t] of timers) if (t.at <= now) due.push([id, t]);
      due.sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      for (const [id, t] of due) {
        if (!timers.has(id)) continue;
        if (t.every) t.at += t.every;
        else timers.delete(id);
        if (typeof t.fn === "function") {
          try {
            t.fn(...t.args);
          } catch (e) {
            console.error("[capture] timer", e);
          }
        }
      }
    },
  };
  w.__capEnv = env;
  return env;
}

export { installCaptureEnv };
