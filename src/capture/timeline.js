// Keyframes, easing and the shot-time -> game-time curve (speed ramps, slow motion, freezes).
//
// A parameter is either a constant (number, [x,y,z], string) or keyframes:
//   [[t, value], [t, value, "ease"], ...]       t in shot seconds, ease applies to the segment ending at that key
//   { "keys": [[t, value], ...], "ease": "inOut" }   same, with a default ease
// Eases: linear, in, out, inOut (cubic, the default), sine, smooth (smoothstep), expo, hold, spline (Catmull-Rom).

const EASE = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  smooth: (u) => u * u * (3 - 2 * u),
  expo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
  hold: (u) => (u >= 1 ? 1 : 0),
};
const EASE_NAMES = [...Object.keys(EASE), "spline"];

function isKeys(v) {
  if (v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.keys)) return true;
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    Array.isArray(v[0]) &&
    v[0].length >= 2 &&
    typeof v[0][0] === "number" &&
    (typeof v[0][1] === "number" || Array.isArray(v[0][1]))
  );
}

function normKeys(v, defEase = "inOut") {
  const list = Array.isArray(v) ? v : v.keys;
  const ease = (!Array.isArray(v) && v.ease) || defEase;
  const keys = list.map((k) => {
    const e = k[2] || ease;
    if (!EASE_NAMES.includes(e)) throw new Error(`unknown ease "${e}" (use ${EASE_NAMES.join(", ")})`);
    return { t: +k[0], v: k[1], ease: e };
  });
  keys.sort((a, b) => a.t - b.t);
  return keys;
}

const mix = (a, b, w) =>
  typeof a === "number" ? a + (b - a) * w : a.map((x, i) => x + (b[i] - x) * w);

function catmull(p0, p1, p2, p3, u) {
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return typeof p1 === "number" ? f(p0, p1, p2, p3) : p1.map((_, i) => f(p0[i], p1[i], p2[i], p3[i]));
}

function sampleKeys(keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  if (b.ease === "spline") {
    const p0 = (keys[i - 1] || a).v;
    const p3 = (keys[i + 2] || b).v;
    return catmull(p0, a.v, b.v, p3, u);
  }
  return mix(a.v, b.v, EASE[b.ease](u));
}

// param(spec, default) -> function of shot time
function param(v, dflt, defEase) {
  if (v === undefined || v === null) v = dflt;
  if (isKeys(v)) {
    const keys = normKeys(v, defEase);
    return (t) => sampleKeys(keys, t);
  }
  return () => v;
}

// In-points can be anchors: start a shot at a moment of the take instead of a fixed time.
//   "launch"           the first "launch" event (lift-off on thrusters); event names as --probe prints them
//   "launch-0.25"      a quarter second (game time) before it; "+0.1" after it
//   "land#2"           the second landing
//   "rampExit(wall)"   an event with a field equal to "wall" (its surface, axis, ...)
//   "mode:air"         the car's mode changing to air (or ground, ramp, crashed, ...)
//   "cut:lineup"       the game's camera director starting a cut (lineup = the TV cut as the car overflies the first
//                      lineup vehicle; also ramp, side)
//   { "event": "launch", "n": 1, "offset": -0.25, "match": "wall" }, { "mode": "air" }, { "cut": "lineup" }
const ANCHOR_RE = /^\s*(?:(mode|cut):)?([A-Za-z_]\w*)(?:\(([^)]*)\))?(?:#(\d+))?\s*(?:([+-])\s*(\d*\.?\d+))?\s*$/;
function parseAnchor(v) {
  if (v === undefined || v === null || typeof v === "number") return null;
  if (typeof v === "string") {
    if (v.trim() !== "" && Number.isFinite(+v)) return null;
    const m = ANCHOR_RE.exec(v);
    if (!m) throw new Error(`bad in-point "${v}": use game seconds, or an event such as "launch", "launch-0.2", "land#2", "mode:air"`);
    const a = { n: m[4] ? Math.max(1, +m[4]) : 1, offset: m[6] ? (m[5] === "-" ? -1 : 1) * +m[6] : 0, label: v.trim() };
    if (m[1]) {
      a.event = m[1];
      a.value = m[2];
    } else a.event = m[2];
    if (m[3] !== undefined) a.match = m[3].trim();
    return a;
  }
  if (typeof v === "object" && (v.event || v.mode || v.cut)) {
    const a = { n: Math.max(1, Math.round(+v.n || 1)), offset: +v.offset || 0 };
    if (v.mode || v.cut) {
      a.event = v.mode ? "mode" : "cut";
      a.value = String(v.mode || v.cut);
    } else {
      a.event = String(v.event);
      if (v.value !== undefined) a.value = String(v.value);
    }
    if (v.match !== undefined) a.match = String(v.match);
    const off = a.offset ? (a.offset > 0 ? "+" : "") + a.offset : "";
    const head = a.value !== undefined ? `${a.event}:${a.value}` : a.event;
    a.label = v.label || `${head}${a.match ? `(${a.match})` : ""}${a.n > 1 ? "#" + a.n : ""}${off}`;
    return a;
  }
  throw new Error(`bad in-point ${JSON.stringify(v)}`);
}
// does an event satisfy the anchor? Physics events as emitted; mode changes and camera cuts are recorded by the
// engine as { type: "mode" | "cut", value }.
function anchorHit(a, e) {
  if (e.type !== a.event) return false;
  if (a.value !== undefined && e.value !== a.value) return false;
  return a.match === undefined || Object.values(e).some((x) => String(x) === a.match);
}

// Shot time -> game time. spec: a number (constant speed) or speed keys [[t, speed, ease], ...].
// Game time is the take time: inPoint + integral of speed. Speed 0 freezes the game; the camera keeps moving.
class TimeCurve {
  constructor(spec, inPoint, duration) {
    this.inPoint = +inPoint || 0;
    this.duration = duration;
    const speed = param(spec === undefined ? 1 : spec, 1, "inOut");
    this.speed = speed;
    const h = 1 / 2400;
    const n = Math.ceil((duration + 1) / h) + 1;
    const tab = new Float64Array(n);
    let acc = 0;
    let prev = Math.max(0, speed(0));
    for (let i = 1; i < n; i++) {
      const s = Math.max(0, speed(i * h));
      acc += 0.5 * (prev + s) * h;
      prev = s;
      tab[i] = acc;
    }
    this.h = h;
    this.tab = tab;
  }
  // game seconds at shot time t (t may be slightly negative for the first frame's shutter)
  game(t) {
    if (t <= 0) return Math.max(0, this.inPoint + Math.max(0, this.speed(0)) * t);
    const x = t / this.h;
    const i = Math.floor(x);
    if (i >= this.tab.length - 1) {
      const last = this.tab[this.tab.length - 1];
      return this.inPoint + last + Math.max(0, this.speed(t)) * (t - (this.tab.length - 1) * this.h);
    }
    const f = x - i;
    return this.inPoint + this.tab[i] + (this.tab[i + 1] - this.tab[i]) * f;
  }
}

export { EASE, EASE_NAMES, TimeCurve, anchorHit, isKeys, normKeys, param, parseAnchor, sampleKeys };
