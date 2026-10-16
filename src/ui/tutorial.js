// First-play tutorial: one short hint at a time, in the game view, each gone
// as soon as the player does it. Order: drive, steer (then follow the arrow to
// the Semi), hold lift to take off, let go over the Semi, thrust, flip, reset.
// A hint whose moment has not come yet (say, a ground hint while flying) gives
// way to a later one that fits, so the player is never told something they
// can't do right now. Shown once (remembered in localStorage), skippable, and
// re-opened from the "?" button next to the minimap.
import { storageGet, storageSet } from "../util/storage.js";
import "./guide.css";
import { semiSpot } from "./targets.js";
import "./tutorial.css";

const STORE = "rdstr.tutorial";
const NEAR_SEMI = 75; // metres: close enough for the take-off lesson
const ROUTE_GIVE_UP = 40; // s: after this the lift lessons work anywhere

const key = (s) => `<span class="rd-key">${s}</span>`;
const RESET_ICON =
  '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M11.6 7.2A4.6 4.6 0 1 1 10 3.6"/><path d="M10.9 1v3.2H7.7"/></svg>';

// Wording per input: k = keyboard, t = touch. Short, no long dashes.
const TEXT = {
  drive: { k: `Hold ${key("W")} to drive`, t: "Push the stick up to drive" },
  steer: { k: `${key("A")} ${key("D")} to steer`, t: "Stick left or right to steer" },
  route: { k: "Follow the arrow to the Semi", t: "Follow the arrow to the Semi" },
  lift: { k: `Hold ${key("SPACE")} to take off`, t: `Hold ${key("LIFT")} to take off` },
  letgo: { k: "Let go over the Semi", t: "Let go over the Semi" },
  letgoSub: { k: `Release ${key("SPACE")} to drop`, t: `Release ${key("LIFT")} to drop` },
  letgoAny: { k: `Let go of ${key("SPACE")} to drop`, t: `Let go of ${key("LIFT")} to drop` },
  thrust: { k: `Hold ${key("SHIFT")} to thrust`, t: `Hold ${key("THRUST")} to boost` },
  flipAir: { k: `${key("A")} or ${key("D")} to flip`, t: "Stick sideways to flip" },
  flipGround: { k: `Jump, then ${key("A")} or ${key("D")} to flip`, t: "Jump, then stick sideways to flip" },
  reset: { k: `Stuck? ${key("R")} resets the car`, t: `Stuck? Tap <span class="rd-key rd-key-ico">${RESET_ICON}</span> to reset` },
  done: { k: "All set. The arrow shows the next mission", t: "All set. The arrow shows the next mission" },
};

const ORDER = ["drive", "steer", "lift", "letgo", "thrust", "flip", "reset"];

export class Tutorial {
  /**
   * @param {{phys, game, minimap?, dock?: HTMLElement, parent?: HTMLElement}} o
   */
  constructor({ phys, game, minimap, dock, parent }) {
    this.phys = phys;
    this.game = game;
    this.minimap = minimap || null;
    this.running = false;
    this.autoChecked = false;
    this._final = 0;
    this._shownId = null;
    this._shownKey = "";
    this._resetHit = false;

    const host = parent || document.getElementById("hud") || document.body;
    const el = (this.el = document.createElement("div"));
    el.className = "rd-tut";
    el.dataset.rd = "tut";
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<div class="rd-tut-card rd-cut"><span class="rd-tut-n"></span><div class="rd-tut-txt"><div class="rd-tut-main"></div><div class="rd-tut-sub"></div></div><button class="rd-tut-skip" type="button">Skip</button></div>';
    host.appendChild(el);
    this.card = el.querySelector(".rd-tut-card");
    this.nEl = el.querySelector(".rd-tut-n");
    this.mainEl = el.querySelector(".rd-tut-main");
    this.subEl = el.querySelector(".rd-tut-sub");
    const skip = el.querySelector(".rd-tut-skip");
    skip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    });
    skip.addEventListener("click", (e) => e.preventDefault());

    // "?" re-opens the tutorial
    const q = (this.qBtn = document.createElement("button"));
    q.type = "button";
    q.className = "rd-tut-q";
    q.dataset.rd = "tutq";
    q.setAttribute("aria-label", "Show the tutorial");
    q.title = "Show the tutorial";
    q.textContent = "?";
    q.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.start();
    });
    (dock || host).appendChild(q);

    addEventListener("keydown", (e) => {
      if (e.code === "KeyR" && !e.repeat) this._resetHit = true;
    });
    addEventListener(
      "pointerdown",
      (e) => {
        const t = e.target;
        if (t && t.closest && t.closest('[data-act="reset"]')) this._resetHit = true;
      },
      true,
    );
  }

  /** True while hints are being shown (the replay stays off meanwhile). */
  get active() {
    return this.running;
  }

  get touch() {
    return document.body.classList.contains("touch");
  }

  start() {
    this.running = true;
    this.autoChecked = true;
    this.done = new Set();
    this.acc = { drive: 0, steer: 0, boost: 0, liftAir: 0, ctx: {} };
    this.steered = false;
    this.routeT = 0;
    this.routeGaveUp = false;
    this._final = 0;
    this._shownId = null;
    this._shownKey = "";
    this._resetHit = false;
    this._okT = 0;
    this._stepT = 0;
    this.el.classList.add("on");
    document.body.classList.add("rd-tut-on");
    this.qBtn.classList.add("hide");
  }

  skip() {
    storageSet(STORE, "skipped");
    this._stop();
  }

  _finish() {
    storageSet(STORE, "done");
    this._stop();
    this._final = 2.8;
    this._show("done", "", TEXT.done[this.touch ? "t" : "k"], "", true);
    this.el.classList.add("on");
  }

  _stop() {
    this.running = false;
    this.el.classList.remove("on");
    document.body.classList.remove("rd-tut-on");
    this.qBtn.classList.remove("hide");
    if (this.minimap) this.minimap.setOverride(null);
  }

  _show(id, n, main, sub, final = false) {
    const k = id + "|" + main + "|" + sub;
    if (k === this._shownKey) return;
    const changed = id !== this._shownId;
    this._shownKey = k;
    this._shownId = id;
    this.nEl.textContent = n;
    this.mainEl.innerHTML = main;
    this.subEl.innerHTML = sub;
    this.subEl.hidden = !sub;
    this.card.classList.toggle("final", final);
    if (changed) {
      this.card.classList.remove("in");
      void this.card.offsetWidth;
      this.card.classList.add("in");
    }
  }

  /**
   * @param {number} dt real seconds
   * @param {object} input the frame's input (throttle, brake, steer, lift, boost)
   * @param {boolean} playing state is "play" and no replay is running
   */
  update(dt, input, playing) {
    this.qBtn.classList.toggle("off", !playing);
    if (!playing) {
      this.el.classList.add("paused");
      return;
    }
    this.el.classList.remove("paused");
    if (!this.autoChecked) {
      this.autoChecked = true;
      const q = new URLSearchParams(location.search);
      // ?notutorial keeps it off (release checks); ?tutorial forces it on
      const want = q.has("tutorial") || (!storageGet(STORE) && !q.has("notutorial"));
      if (want && !document.body.classList.contains("cine")) this.start();
    }
    if (!this.running) {
      if (this._final > 0 && (this._final -= dt) <= 0) this.el.classList.remove("on");
      return;
    }
    const p = this.phys,
      a = this.acc,
      I = input || {};
    const mode = p.mode;
    const air = mode === "air";
    const ground = mode === "ground" || mode === "ramp";
    const sp = p.speed || 0;
    const semi = semiSpot(this.game);
    const dSemi = Math.hypot(p.pos.x - semi.x, p.pos.z - semi.z);
    const near = dSemi < NEAR_SEMI || this.routeGaveUp;
    const d = this.done;

    // progress counters
    if (ground && I.throttle > 0.3 && sp > 6) a.drive += dt;
    if (ground && Math.abs(I.steer || 0) > 0.3 && sp > 2) a.steer += dt;
    if (p.thrust && p.thrust.boost > 0) a.boost += dt;
    if (air && I.lift) a.liftAir += dt;
    else if (!air) a.liftAir = 0;
    if (this.steered && !d.has("steer")) {
      this.routeT += dt;
      if (this.routeT > ROUTE_GIVE_UP) this.routeGaveUp = true;
    }

    // lessons done (also when the player does it before the hint shows)
    const before = d.size;
    if (a.drive >= 0.4) d.add("drive");
    if (a.steer >= 0.5) this.steered = true;
    if (this.steered && (dSemi < NEAR_SEMI || this.routeGaveUp)) d.add("steer");
    if (near && air && I.lift && p.airTime > 0.3) d.add("lift");
    if (near && air && !I.lift && a.liftAir >= 0.25) d.add("letgo");
    if (near && !air && this._wasLiftAir && d.has("lift")) d.add("letgo");
    this._wasLiftAir = air && a.liftAir >= 0.25;
    if (a.boost >= 0.4) d.add("thrust");
    if (p.events && p.events.some((e) => e.type === "trick")) d.add("flip");
    if (this._resetHit) {
      if (this._shownId === "reset") d.add("reset");
      this._resetHit = false;
    }
    if (this._shownId === "reset" && (this._stepT += dt) > 6) d.add("reset");
    if (d.size !== before) this._okT = 0.35;

    // arrow to the Semi while the route and the lift lessons are open
    const routing =
      !this.routeGaveUp && (this.steered || d.has("steer")) && !(d.has("lift") && d.has("letgo"));
    if (this.minimap) this.minimap.setOverride(routing ? { name: "THE SEMI", pos: semi } : null);

    if (ORDER.every((id) => d.has(id))) return this._finish();

    // which hint fits right now
    const ok = {
      drive: ground,
      steer: ground,
      lift: mode === "ground" && near,
      letgo: air && !!I.lift && near,
      thrust: mode !== "crashed",
      flip: mode !== "crashed",
      reset: true,
    };
    for (const id of ORDER) if (ok[id]) a.ctx[id] = 0;
    else a.ctx[id] = (a.ctx[id] || 0) + dt;
    // keep the current hint through short context blips (a bounce, a hop)
    let id = this._shownId;
    if (!id || d.has(id) || !ORDER.includes(id) || a.ctx[id] > 0.8) {
      id = ORDER.find((x) => !d.has(x) && ok[x]) || ORDER.find((x) => !d.has(x));
    } else {
      const first = ORDER.find((x) => !d.has(x) && ok[x]);
      if (first && ORDER.indexOf(first) < ORDER.indexOf(id)) id = first;
    }
    if (id !== this._shownId) this._stepT = 0;

    if (this._okT > 0) {
      this._okT -= dt;
      this.card.classList.add("ok");
      return;
    }
    this.card.classList.remove("ok");

    const w = this.touch ? "t" : "k";
    const n = `${ORDER.indexOf(id) + 1}/${ORDER.length}`;
    let main = TEXT[id] ? TEXT[id][w] : "",
      sub = "";
    if (id === "steer" && this.steered) main = TEXT.route[w];
    if (id === "letgo") {
      if (this.routeGaveUp && dSemi >= NEAR_SEMI) main = TEXT.letgoAny[w];
      else sub = TEXT.letgoSub[w];
    }
    if (id === "flip") main = air ? TEXT.flipAir[w] : TEXT.flipGround[w];
    this._show(id, n, main, sub);
  }
}
