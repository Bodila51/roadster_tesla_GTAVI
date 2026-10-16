const qs = (a) => document.querySelector(a);
const fmt = (n) => n.toLocaleString("en-US");
const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

class Hud {
  constructor() {
    (this.el = {
      speed: qs("#spd-val"),
      mode: qs("#spd-mode"),
      gas: qs("#gas-fill"),
      gasWrap: qs("#gas"),
      lift: qs("#ind-lift"),
      boost: qs("#ind-boost"),
      score: qs("#score-val"),
      best: qs("#best-val"),
      feed: qs("#trick-feed"),
      pending: qs("#pending"),
      mult: qs("#mult"),
      toasts: qs("#toasts"),
      flash: qs("#flash"),
      drift: qs("#drift"),
      driftBar: qs("#drift-fill"),
      driftPts: qs("#drift-pts"),
      missions: qs("#missions-list"),
      mcount: qs("#missions-count"),
      alt: qs("#alt"),
      launch: qs("#launch"),
      hints: qs("#hints"),
    }),
      (this._lastMode = ""),
      (this._feedItems = []),
      (this._shownScore = null),
      (this._scoreRaf = 0);
  }
  renderMissions(e, s) {
    // open missions first (in game order), finished ones sink to the bottom;
    // the next three open ones show their how-to line, the rest stay one row
    const open = e.filter((t) => !s.has(t.id)),
      next = new Set(open.slice(0, 3).map((t) => t.id));
    (this.el.missions.innerHTML = [...open, ...e.filter((t) => s.has(t.id))]
      .map(
        (t) => `
      <li class="${s.has(t.id) ? "done" : next.has(t.id) ? "next" : ""}">
        <span class="chk">${s.has(t.id) ? "✓" : ""}</span>
        <span class="mn">${t.name}</span>
        <span class="md">${t.desc}</span>
      </li>`,
      )
      .join("")),
      (this.el.mcount.textContent = `${s.size}/${e.length}`);
    const panel = this.el.missions.closest("#missions");
    panel && panel.style.setProperty("--mp", e.length ? s.size / e.length : 0);
  }
  setScore(e, s) {
    this.el.best.textContent = fmt(s);
    this._countTo(e);
    this.el.score.classList.remove("bump"),
      this.el.score.offsetWidth,
      this.el.score.classList.add("bump");
  }
  // Ticks the score readout up to its new value (a broadcast-style count-up).
  // The final value is always written, so the readout never ends stale.
  _countTo(target) {
    cancelAnimationFrame(this._scoreRaf);
    const from = this._shownScore;
    if (from === null || from === target || target < from || reducedMotion()) {
      this._shownScore = target;
      this.el.score.textContent = fmt(target);
      return;
    }
    const t0 = performance.now(),
      dur = Math.min(650, 250 + (target - from) / 40);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur),
        v = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      this._shownScore = v;
      this.el.score.textContent = fmt(v);
      k < 1 && (this._scoreRaf = requestAnimationFrame(step));
    };
    this._scoreRaf = requestAnimationFrame(step);
  }
  trick(e, s, t) {
    const i = document.createElement("div");
    for (
      i.className = "trick",
        i.innerHTML = `<span class="tn">${e}</span><span class="tp">+${fmt(s)}</span>`,
        this.el.feed.prepend(i),
        this._feedItems.push(i);
      this.el.feed.children.length > 4;

    )
      this.el.feed.lastChild.remove();
    setTimeout(() => i.classList.add("out"), 2200),
      setTimeout(() => i.remove(), 2800),
      (this.el.mult.textContent = `×${t.toFixed(1)}`),
      this.el.mult.classList.toggle("on", t > 1);
  }
  banked(e, s) {
    const t = document.createElement("div");
    (t.className = "banked"),
      (t.innerHTML = `<span>${s}</span><b>+${fmt(e)}</b>`),
      this.el.feed.prepend(t),
      setTimeout(() => t.classList.add("out"), 1800),
      setTimeout(() => t.remove(), 2400),
      this.el.mult.classList.remove("on");
  }
  lost() {
    const e = document.createElement("div");
    (e.className = "banked lost"),
      (e.innerHTML = "<span>COMBO LOST</span>"),
      this.el.feed.prepend(e),
      setTimeout(() => e.remove(), 1800),
      this.el.mult.classList.remove("on");
  }
  toast(e, s, t = !1) {
    const i = document.createElement("div");
    (i.className = "toast" + (t ? " good" : "")),
      (i.innerHTML = `<div class="tt">${e}</div><div class="ts">${s}</div>`),
      this.el.toasts.appendChild(i),
      setTimeout(() => i.classList.add("out"), 3200),
      setTimeout(() => i.remove(), 3900);
  }
  flash(e, s) {
    (this.el.flash.innerHTML = `<div class="ft">${e}</div><div class="fs">${s}</div>`),
      this.el.flash.classList.remove("show"),
      this.el.flash.offsetWidth,
      this.el.flash.classList.add("show");
  }
  drift(e, s) {
    this.el.drift.classList.toggle("on", e > 0.3),
      (this.el.driftBar.style.width = `${Math.min(100, (e / 4) * 100)}%`),
      (this.el.driftPts.textContent = fmt(s));
  }
  telemetry(e) {
    this.el.speed.textContent = Math.round(e.mph);
    const s =
      {
        ground: "ROAD",
        ramp: "SUCTION",
        air: "FLIGHT",
        crashed: "RCS RECOVERY",
      }[e.mode] || e.mode;
    s !== this._lastMode &&
      ((this.el.mode.textContent = s),
      (this._lastMode = s),
      (this.el.mode.dataset.mode = e.mode),
      (this.el.hints.dataset.mode = e.mode)),
      (this.el.gas.style.transform = `scaleX(${e.gas.toFixed(3)})`),
      this.el.gasWrap.classList.toggle("low", e.gas < 0.2),
      this.el.lift.classList.toggle("on", e.lift),
      this.el.boost.classList.toggle("on", e.boost),
      (this.el.alt.textContent =
        e.mode === "air"
          ? `ALT ${e.alt.toFixed(1)} m · AIR ${e.air.toFixed(1)} s`
          : ""),
      (this.el.pending.textContent =
        e.pending > 0 ? `${fmt(Math.round(e.pending))}` : ""),
      e.launchT !== null && e.launchT > 0.02
        ? ((this.el.launch.textContent = `${e.launchT.toFixed(2)} s`),
          this.el.launch.classList.add("on"))
        : this.el.launch.classList.remove("on");
  }
}

export { Hud };
