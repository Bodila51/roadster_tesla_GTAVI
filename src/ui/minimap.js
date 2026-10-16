// Radar, GTA style: a round map that turns with the car, with the player arrow
// in the centre and a north marker on the rim. It zooms out with speed and
// draws roads, blocks, the beach and the sea, the playground features as
// icons, mission blips in yellow and the 2-minute-run letters in orange. Blips
// past the edge stick to the rim. An on-screen arrow points at the target (the
// nearest unfinished mission, or the nearest letter during the run). Tap or
// click the radar (or press N) to cycle the target.
import { Vector3 } from "three";
import "./guide.css";
import "./minimap.css";
import { buildRadarMap } from "./radar-map.js";
import { getTargets, runActive } from "./targets.js";

const R_MIN = 115; // metres from the car to the rim, parked
const R_MAX = 400; // ... flat out
const R_AIR = 70; // extra while airborne
const GROUP = 14; // missions closer than this share one target
const DRAW_HZ = 30;
const TAU = Math.PI * 2;

const tmp = new Vector3();
const tmp2 = new Vector3();

export class Minimap {
  /**
   * @param {{phys, game, camera, parent?: HTMLElement}} o
   */
  constructor({ phys, game, camera, parent }) {
    this.phys = phys;
    this.game = game;
    this.camera = camera;
    this.override = null; // {name, pos} set by the tutorial
    this.manualKey = null; // target picked by tapping the radar
    this.target = null; // {key, name, pos, kind}
    this.visible = false;
    this._R = R_MIN;
    this._ang = null;
    this._drawT = 0;
    this._listT = 1;
    this._list = { missions: [], letters: [] };
    this._lastKey = null;
    this._t = 0;

    const host = parent || document.getElementById("hud") || document.body;
    const el = (this.el = document.createElement("div"));
    el.className = "rd-map";
    el.dataset.rd = "map";
    el.innerHTML = '<canvas class="rd-map-c" role="button" aria-label="Radar. Tap for the next target"></canvas>';
    el.title = "Radar: click or press N for the next target";
    this.dock = document.createElement("div");
    this.dock.className = "rd-map-dock";
    el.appendChild(this.dock);
    host.appendChild(el);
    this.canvas = el.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");

    const wp = (this.wp = document.createElement("div"));
    wp.className = "rd-wp";
    wp.dataset.rd = "wp";
    wp.innerHTML =
      '<div class="rd-wp-ico"></div><div class="rd-wp-lbl"><b class="rd-wp-name"></b><span class="rd-wp-dist"></span></div>';
    host.appendChild(wp);
    this.wpIco = wp.querySelector(".rd-wp-ico");
    this.wpName = wp.querySelector(".rd-wp-name");
    this.wpDist = wp.querySelector(".rd-wp-dist");
    this._wpX = null;
    this._wpY = null;
    this._wpText = "";

    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycle();
    });
    addEventListener("keydown", (e) => {
      if (e.code === "KeyN" && !e.repeat && this.visible) this.cycle();
    });
    addEventListener("resize", () => this._layout());
    this.map = buildRadarMap({ phys, game });
    this._layout();
  }

  /** Tutorial hook: point the arrow at {name, pos} instead of a mission. null clears it. */
  setOverride(o) {
    this.override = o;
  }

  /** Next target, ordered by distance from the car. */
  cycle() {
    const c = this._candidates();
    if (!c.length) return;
    const i = this.target ? c.findIndex((x) => x.key === this.target.key) : -1;
    const n = c[(i + 1) % c.length];
    this.manualKey = n.key;
    this.target = n;
  }

  _readTokens() {
    const cs = getComputedStyle(this.el);
    const g = (k, d) => (cs.getPropertyValue(k) || "").trim() || d;
    this.col = {
      fg: g("--rd-fg", "#ffffff"),
      ink: g("--rd-ink", "#0b0e13"),
      land: g("--rd-plate", "rgba(11, 14, 19, 0.84)"),
      accent: g("--rd-accent", "#ff5a1f"),
      mission: g("--rd-mission", "#ffd23f"),
      sea: g("--rd-sea", "#2a6eaa"),
      sand: g("--rd-sand", "#cdb478"),
      air: g("--rd-air", "#e8f3ff"),
    };
    this.font = g("--rd-font", "Arial, sans-serif");
  }

  _layout() {
    const r = this.el.getBoundingClientRect();
    const css = Math.max(40, Math.round(r.width || 120));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    this.px = px;
    this.dpr = dpr;
    this.small = css < 130;
    this._readTokens();
  }

  _carXZ() {
    return this.phys.pos;
  }

  _candidates() {
    if (this.override) return [{ key: "override", name: this.override.name, pos: this.override.pos, kind: "tut" }];
    const car = this._carXZ();
    const out = [];
    const L = this._list;
    if (L.letters && L.letters.length) {
      for (const l of L.letters)
        if (!l.got && l.pos) out.push({ key: "L" + l.index, name: "LETTER " + l.letter, pos: l.pos, kind: "letter" });
    }
    if (!out.length || !runActive(this.game)) {
      for (const gr of this._groups()) {
        const m = gr.items.find((x) => !x.done);
        if (!m) continue;
        const more = gr.items.filter((x) => !x.done).length - 1;
        out.push({ key: "M" + m.id, name: m.name + (more > 0 ? ` +${more}` : ""), pos: gr.pos, kind: "mission" });
      }
    }
    for (const c of out) c.d = Math.hypot(c.pos.x - car.x, c.pos.z - car.z);
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // Missions that share a spot (wall + reveal, the Semi pair, ...) become one target.
  _groups() {
    if (this._groupCache && this._groupCache.list === this._list) return this._groupCache.groups;
    const groups = [];
    for (const m of this._list.missions) {
      if (!m.pos) continue;
      let gr = groups.find((x) => Math.hypot(x.pos.x - m.pos.x, x.pos.z - m.pos.z) < GROUP);
      if (!gr) groups.push((gr = { pos: m.pos, items: [] }));
      gr.items.push(m);
    }
    // which playground feature each mission belongs to (its icon turns yellow)
    const feats = this.map.features;
    const open = new Set(),
      loose = [];
    for (const m of this._list.missions) {
      if (!m.pos) continue;
      const f = feats.find(
        (f) => Math.min(Math.hypot(m.pos.x - f.x, m.pos.z - f.z), Math.hypot(m.pos.x - f.ax, m.pos.z - f.az)) < f.r,
      );
      if (f) {
        if (!m.done) open.add(f.kind);
      } else loose.push(m);
    }
    this._groupCache = { list: this._list, groups, open, loose };
    return groups;
  }

  _pickTarget() {
    const c = this._candidates();
    if (!c.length) {
      this.target = null;
      return;
    }
    if (this.override) {
      this.target = c[0];
      return;
    }
    if (this.manualKey) {
      const m = c.find((x) => x.key === this.manualKey);
      if (m) {
        this.target = m;
        return;
      }
      this.manualKey = null;
    }
    const cur = this.target && c.find((x) => x.key === this.target.key);
    // Hysteresis: keep the current target unless another is clearly nearer.
    if (cur && c[0] !== cur && c[0].d > cur.d * 0.82 - 4) this.target = cur;
    else this.target = c[0];
  }

  // Radar "up": the car's heading on the ground, the direction of travel in
  // the air (so flips and spins don't whirl the map), smoothed.
  _heading(dt) {
    const p = this.phys;
    const vh = Math.hypot(p.vel.x, p.vel.z);
    const air = p.mode === "air" || p.mode === "crashed";
    let hx = 0,
      hz = 0;
    const f = p.fwd;
    if (air && vh > 5) (hx = p.vel.x), (hz = p.vel.z);
    else if (f && Math.hypot(f.x, f.z) > 0.35) (hx = f.x), (hz = f.z);
    else if (vh > 3) (hx = p.vel.x), (hz = p.vel.z);
    if (!hx && !hz) {
      if (this._ang === null) this._ang = Math.PI; // facing north (-Z), as at the spawn
      return;
    }
    const ang = Math.atan2(hx, hz);
    if (this._ang === null) this._ang = ang;
    let da = ang - this._ang;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this._ang += da * (1 - Math.exp(-dt * 6));
  }

  /**
   * @param {number} dt real seconds
   * @param {boolean} show whether the radar and arrow should be on screen
   */
  update(dt, show) {
    this._t += dt;
    const vis = !!show;
    if (vis !== this.visible) {
      this.visible = vis;
      this.el.classList.toggle("on", vis);
      if (!vis) this.wp.classList.remove("on");
      if (vis) this._layout();
    }
    // phones: the goals list drops down over this corner, so step aside while it is open
    const g = this._goals || (this._goals = document.getElementById("missions"));
    const goals = vis && !!g && document.body.classList.contains("touch") && !g.classList.contains("collapsed");
    this.el.classList.toggle("hide-goals", goals);
    document.body.classList.toggle("rd-map-on", vis && !goals);
    if (!vis) return;

    this._listT += dt;
    if (this._listT > 0.1) {
      this._listT = 0;
      this._list = getTargets(this.game, this._carXZ());
    }
    this._pickTarget();

    const p = this.phys;
    const sp = p.speed || 0;
    const air = p.mode === "air";
    const want = Math.min(R_MAX, R_MIN + Math.max(0, sp - 8) * 2.9) + (air ? R_AIR : 0);
    this._R += (want - this._R) * (1 - Math.exp(-dt * 1.1));
    this._heading(dt);
    this.camera.getWorldDirection(tmp); // refreshes the camera matrices for the arrow

    this._drawT += dt;
    if (this._drawT >= 1 / DRAW_HZ) {
      this._drawT = 0;
      this._draw();
    }
    this._updateArrow();
  }

  _draw() {
    const ctx = this.ctx,
      S = this.px,
      h = S / 2,
      c = this.col,
      dpr = this.dpr;
    if (!S) return;
    const car = this._carXZ();
    const rim = h - 2.5 * dpr; // radius of the map disc
    const k = rim / this._R; // canvas px per metre
    const fx = Math.sin(this._ang),
      fz = Math.cos(this._ang);
    const rx = -fz,
      rz = fx;
    const toX = (x, z) => h + k * (rx * (x - car.x) + rz * (z - car.z));
    const toY = (x, z) => h - k * (fx * (x - car.x) + fz * (z - car.z));
    const M = this.map;
    const u = 1 / k; // one canvas px in metres

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(h, h, rim, 0, TAU);
    ctx.fillStyle = c.land;
    ctx.fill();
    ctx.clip();

    // ── world layers (canvas = A·(x, z) + e) ──
    ctx.setTransform(k * rx, -k * fx, k * rz, -k * fz, h - k * (rx * car.x + rz * car.z), h + k * (fx * car.x + fz * car.z));
    fillPolys(ctx, M.sea, c.sea, 0.92);
    fillPolys(ctx, M.beach, c.sand, 0.5);
    fillPolys(ctx, M.green, "#6f9a62", 0.38);
    fillPolys(ctx, M.blocks, "#a7b1bf", 0.2);
    fillPolys(ctx, M.paved, "#c4cdda", 0.3);
    fillPolys(ctx, M.asphalt, "#c4cdda", 0.55);
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    for (const r of M.roads) {
      ctx.strokeStyle = r.kind === "runway" ? "rgba(196, 205, 218, 0.3)" : "rgba(196, 205, 218, 0.55)";
      ctx.lineWidth = Math.max(r.w, 2.2 * dpr * u);
      strokePath(ctx, r.pts);
      if (r.kind === "runway") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.1 * dpr * u;
        ctx.setLineDash([16, 18]);
        strokePath(ctx, r.pts);
        ctx.setLineDash([]);
      }
    }
    ctx.strokeStyle = "rgba(196, 205, 218, 0.45)";
    for (const r of M.rings) {
      ctx.lineWidth = Math.max(r.w, 1.6 * dpr * u);
      ctx.beginPath();
      ctx.arc(r.x, r.z, r.r, 0, TAU);
      ctx.stroke();
    }
    for (const b of M.structures) {
      ctx.fillStyle = b.k === "vehicle" ? "rgba(255, 255, 255, 0.62)" : b.k === "barrier" ? "rgba(214, 222, 232, 0.5)" : "rgba(196, 205, 218, 0.36)";
      ctx.fillRect(b.x0, b.z0, Math.max(b.x1 - b.x0, 1.3 * dpr * u), Math.max(b.z1 - b.z0, 1.3 * dpr * u));
    }
    ctx.strokeStyle = "rgba(230, 236, 245, 0.72)";
    for (const r of M.ribbons) {
      ctx.lineWidth = Math.max(r.w, 2.6 * dpr * u);
      strokePath(ctx, r.pts);
    }

    // ── blips (screen space, upright) ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const s = (this.small ? 4.6 : 5.6) * dpr; // icon half-size
    const lw = 1.25 * dpr; // ink outline
    const edgeR = rim - s * 0.95;
    const place = (x, z) => {
      const X = toX(x, z),
        Y = toY(x, z);
      const dx = X - h,
        dy = Y - h,
        d = Math.hypot(dx, dy);
      if (d <= edgeR) return [X, Y, false];
      return [h + (dx / d) * edgeR, h + (dy / d) * edgeR, true];
    };
    this._groups();
    const gc = this._groupCache;
    const g = this.game;

    // ring course: hollow checkpoints, only in range
    if (g && g.rings) {
      ctx.lineWidth = 1.4 * dpr;
      for (const r of g.rings) {
        if (g.ringsGot && g.ringsGot.has(r.i)) continue;
        const [x, y, out] = place(r.center.x, r.center.z);
        if (out) continue;
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 3.4 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 2.6 * dpr, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = c.air;
        ctx.lineWidth = 1.4 * dpr;
        ctx.stroke();
      }
    }
    // feature icons: yellow while a mission there is open (and then pinned to the rim)
    for (const f of M.features) {
      const open = gc.open.has(f.kind);
      const [x, y, out] = place(f.x, f.z);
      if (out && !open) continue;
      glyph(ctx, f.kind, x, y, out ? s * 0.78 : s, open ? c.mission : c.fg, c.ink, lw);
    }
    // missions away from the features: yellow dots
    for (const m of gc.loose) {
      const [x, y, out] = place(m.pos.x, m.pos.z);
      if (m.done) {
        if (!out) dot(ctx, x, y, s * 0.36, "rgba(255, 255, 255, 0.45)", c.ink, lw);
        continue;
      }
      dot(ctx, x, y, s * (out ? 0.5 : 0.62), c.mission, c.ink, lw);
    }
    // run letters: orange, with the letter
    if (this._list.letters && this._list.letters.length) {
      const fs = Math.round((this.small ? 7.5 : 8.5) * dpr);
      ctx.font = `800 ${fs}px ${this.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const l of this._list.letters) {
        if (l.got || !l.pos) continue;
        const [x, y, out] = place(l.pos.x, l.pos.z);
        const r = s * (out ? 0.82 : 0.98);
        dot(ctx, x, y, r, c.accent, c.ink, lw);
        if (!out) {
          ctx.fillStyle = c.ink;
          ctx.fillText(l.letter, x, y + 0.6 * dpr);
        }
      }
    }
    // the target: a white ring that breathes
    const tgt = this.target;
    if (tgt && tgt.pos && Math.hypot(tgt.pos.x - car.x, tgt.pos.z - car.z) > 10) {
      const [x, y] = place(tgt.pos.x, tgt.pos.z);
      const pul = 0.5 + 0.5 * Math.sin(this._t * 5);
      ctx.strokeStyle = c.fg;
      ctx.globalAlpha = 0.55 + 0.45 * pul;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, s * (1.55 + 0.35 * pul), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore(); // drop the clip

    // rim
    ctx.beginPath();
    ctx.arc(h, h, rim, 0, TAU);
    ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = c.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(h, h, rim + 1.25 * dpr - 0.5 * dpr, 0, TAU);
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.stroke();

    // north marker on the rim
    const nx = toX(car.x, car.z - 1000) - h,
      ny = toY(car.x, car.z - 1000) - h;
    const nl = Math.hypot(nx, ny) || 1;
    const nr = (this.small ? 6 : 7) * dpr;
    const NX = h + (nx / nl) * (rim - nr * 0.55),
      NY = h + (ny / nl) * (rim - nr * 0.55);
    dot(ctx, NX, NY, nr, c.ink, "rgba(255, 255, 255, 0.35)", 0.8 * dpr);
    ctx.font = `800 ${Math.round((this.small ? 7.5 : 8.5) * dpr)}px ${this.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = c.fg;
    ctx.fillText("N", NX, NY + 0.5 * dpr);

    // the player arrow: points where the car faces (up, unless it spins in the air)
    const f = this.phys.fwd;
    let ax = 0,
      ay = -1;
    if (f && Math.hypot(f.x, f.z) > 0.2) {
      ax = rx * f.x + rz * f.z;
      ay = -(fx * f.x + fz * f.z);
    }
    playerArrow(ctx, h, h, Math.atan2(ax, -ay), (this.small ? 6 : 7.2) * dpr, c.fg, c.ink, 1.4 * dpr);
  }

  _updateArrow() {
    const t = this.target;
    const car = this.phys.pos;
    const W = innerWidth,
      H = innerHeight;
    if (!t || !t.pos) return this._hideArrow();
    const dist = Math.hypot(t.pos.x - car.x, t.pos.z - car.z);
    if (dist < 10) return this._hideArrow();
    const cam = this.camera;
    tmp.set(t.pos.x, (t.pos.y || 0) + 4, t.pos.z);
    tmp2.copy(tmp).applyMatrix4(cam.matrixWorldInverse);
    const front = tmp2.z < -1;
    let sx = 0,
      sy = 0;
    if (front) {
      tmp.applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
      sx = (tmp.x * 0.5 + 0.5) * W;
      sy = (0.5 - tmp.y * 0.5) * H;
    }
    const { top, bottom, left, right } = this._safeBox(W, H);
    const onScreen = front && sx > left && sx < right && sy > top && sy < bottom;
    let x, y, rot, side;
    const cx = W / 2,
      cy = (top + bottom) / 2;
    if (onScreen) {
      x = sx;
      y = sy;
      rot = 90;
      side = "t";
    } else {
      // direction from the screen centre; camera-space x/y also works behind the camera
      let dx = tmp2.x,
        dy = -tmp2.y;
      if (front) (dx = sx - cx), (dy = sy - cy);
      if (Math.hypot(dx, dy) < 1e-3) (dx = 0), (dy = 1);
      const L = Math.hypot(dx, dy);
      dx /= L;
      dy /= L;
      const sxk = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
      const syk = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
      const s = Math.min(sxk, syk);
      x = cx + dx * s;
      y = cy + dy * s;
      rot = (Math.atan2(dy, dx) * 180) / Math.PI;
      side = sxk < syk ? (dx > 0 ? "l" : "r") : dy > 0 ? "t" : "b";
    }
    if (this._wpX === null) (this._wpX = x), (this._wpY = y);
    const a = 1 - Math.exp(-(1 / 60) * 18);
    this._wpX += (x - this._wpX) * a;
    this._wpY += (y - this._wpY) * a;
    this.wp.style.transform = `translate(${this._wpX.toFixed(1)}px, ${this._wpY.toFixed(1)}px)`;
    this.wpIco.style.transform = `rotate(${rot.toFixed(1)}deg)`;
    if (this.wp.dataset.side !== side) this.wp.dataset.side = side;
    this.wp.classList.toggle("edge", !onScreen);
    const text = t.name + "|" + Math.round(dist);
    if (text !== this._wpText) {
      this._wpText = text;
      this.wpName.textContent = t.name;
      this.wpDist.textContent = `${Math.round(dist)} m`;
    }
    if (this._lastKey !== t.key) {
      this._lastKey = t.key;
      this.wp.classList.remove("new");
      void this.wp.offsetWidth;
      this.wp.classList.add("new");
    }
    this.wp.classList.add("on");
  }

  // Where the arrow may sit: clear of the top bar, the dash and the thumb
  // controls, then shrunk on one side so it also clears this map and an open
  // goals list. Re-measured a few times a second.
  _safeBox(W, H) {
    const now = this._t;
    if (this._box && now - this._boxT < 0.25 && this._box.W === W && this._box.H === H) return this._box;
    const touch = document.body.classList.contains("touch");
    const portrait = H > W;
    const b = { W, H, top: H * 0.2, bottom: H * (touch ? (portrait ? 0.56 : 0.44) : 0.7) };
    b.left = W * 0.08 + 24;
    b.right = W * (touch && !portrait ? 0.9 : 0.92) - 24;
    const avoid = [];
    if (this.visible && !this.el.classList.contains("hide-goals")) avoid.push(this.el.getBoundingClientRect());
    const g = this._goals;
    if (g && !g.classList.contains("collapsed")) avoid.push(g.getBoundingClientRect());
    const pad = 24;
    for (const r of avoid) {
      if (!(r.width > 0 && r.height > 0)) continue;
      if (r.right + pad <= b.left || r.left - pad >= b.right || r.bottom + pad <= b.top || r.top - pad >= b.bottom) continue;
      const w = b.right - b.left,
        h = b.bottom - b.top,
        k = portrait ? 1.6 : 1; // width is scarce in portrait
      const opts = [
        ["left", r.right + pad, ((r.right + pad - b.left) / w) * k],
        ["right", r.left - pad, ((b.right - r.left + pad) / w) * k],
        ["top", r.bottom + pad, (r.bottom + pad - b.top) / h],
        ["bottom", r.top - pad, (b.bottom - r.top + pad) / h],
      ].sort((x, y) => x[2] - y[2]);
      if (opts[0][2] < 0.6) b[opts[0][0]] = opts[0][1];
    }
    this._box = b;
    this._boxT = now;
    return b;
  }

  _hideArrow() {
    this.wp.classList.remove("on");
    if (!this.target) this._wpText = "";
  }
}

function fillPolys(ctx, polys, color, alpha) {
  if (!polys.length) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const p of polys) {
    p.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.closePath();
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
  ctx.stroke();
}

function dot(ctx, x, y, r, fill, edge, lw) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

// Upright pictograms for the playground features, with an ink outline.
function glyph(ctx, kind, x, y, s, col, ink, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  const solid = (build) => {
    ctx.beginPath();
    build();
    ctx.lineWidth = lw * 2;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fill();
  };
  const line = (build, w) => {
    ctx.beginPath();
    build();
    ctx.strokeStyle = ink;
    ctx.lineWidth = w + lw * 2;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  switch (kind) {
    case "wall": // quarter pipe that goes vertical
      solid(() => {
        ctx.moveTo(s, -s);
        ctx.lineTo(s, s);
        ctx.lineTo(-s, s);
        ctx.arc(-s, -s, 2 * s, Math.PI / 2, 0, true);
        ctx.closePath();
      });
      break;
    case "lineup": // the Semi: trailer, cab, wheels
      solid(() => {
        ctx.rect(-s, -0.62 * s, 1.28 * s, 0.98 * s);
        ctx.rect(0.42 * s, -0.22 * s, 0.58 * s, 0.58 * s);
      });
      solid(() => {
        for (const wx of [-0.68, -0.18, 0.72]) {
          ctx.moveTo(wx * s + 0.24 * s, 0.62 * s);
          ctx.arc(wx * s, 0.62 * s, 0.24 * s, 0, TAU);
        }
      });
      break;
    case "loop":
      line(() => ctx.arc(0, -0.12 * s, 0.7 * s, 0.62 * Math.PI, 2.38 * Math.PI), 0.36 * s);
      line(() => {
        ctx.moveTo(-s, 0.82 * s);
        ctx.lineTo(s, 0.82 * s);
      }, 0.3 * s);
      break;
    case "halfpipe":
      line(() => {
        ctx.moveTo(-0.8 * s, -0.95 * s);
        ctx.lineTo(-0.8 * s, -0.1 * s);
        ctx.arc(0, -0.1 * s, 0.8 * s, Math.PI, 0, true);
        ctx.lineTo(0.8 * s, -0.95 * s);
      }, 0.38 * s);
      break;
    case "massdriver": // launch arrow, up and away
      solid(() => {
        ctx.moveTo(-0.95 * s, 0.62 * s);
        ctx.lineTo(0.12 * s, -0.45 * s);
        ctx.lineTo(-0.28 * s, -0.85 * s);
        ctx.lineTo(0.95 * s, -0.95 * s);
        ctx.lineTo(0.85 * s, 0.28 * s);
        ctx.lineTo(0.45 * s, -0.12 * s);
        ctx.lineTo(-0.62 * s, 0.95 * s);
        ctx.closePath();
      });
      break;
    case "bullseye":
      line(() => ctx.arc(0, 0, 0.78 * s, 0, TAU), 0.3 * s);
      solid(() => ctx.arc(0, 0, 0.32 * s, 0, TAU));
      break;
    default:
      solid(() => ctx.arc(0, 0, 0.6 * s, 0, TAU));
  }
  ctx.restore();
}

function playerArrow(ctx, x, y, a, s, fill, edge, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.15);
  ctx.lineTo(s * 0.82, s * 0.85);
  ctx.lineTo(0, s * 0.42);
  ctx.lineTo(-s * 0.82, s * 0.85);
  ctx.closePath();
  ctx.lineJoin = "miter";
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}
