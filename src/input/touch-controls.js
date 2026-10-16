const ji = () =>
  (matchMedia("(pointer: coarse)").matches || "ontouchstart" in window) &&
  !new URLSearchParams(location.search).get("desktop");
class TouchControls {
  constructor(e) {
    (this.state = {
      x: 0,
      y: 0,
      lift: !1,
      boost: !1,
      drift: !1,
    }),
      (this.el = document.createElement("div")),
      (this.el.id = "touch"),
      (this.el.innerHTML = `
      <div class="t-stick" id="t-stick"><div class="t-ring"></div><div class="t-knob" id="t-knob"></div>
        <span class="t-hint t-up">GAS</span><span class="t-hint t-down">BRAKE</span></div>
      <div class="t-btns">
        <button class="t-btn t-lift" data-k="lift"><b>LIFT</b><i>jump · hover</i></button>
        <button class="t-btn t-boost" data-k="boost"><b>THRUST</b></button>
        <button class="t-btn t-drift" data-k="drift"><b>DRIFT</b><i>spin</i></button>
      </div>
      <div class="t-top">
        <button class="t-mini t-pause" data-act="pause" aria-label="Pause"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.5 2v10M9.5 2v10"/></svg></button>
        <button class="t-mini" data-act="missions" aria-label="Goals"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 13V1.5h8.5l-2 3 2 3H3"/></svg><span>GOALS</span></button>
        <button class="t-mini" data-act="cam" aria-label="Camera"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 4.5h3l1-2h3l1 2h3v7.5h-11z"/><circle cx="7" cy="8.2" r="2.1"/></svg><span>CAM</span></button>
        <button class="t-mini" data-act="reset" aria-label="Reset car"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M11.6 7.2A4.6 4.6 0 1 1 10 3.6"/><path d="M10.9 1v3.2H7.7"/></svg><span>RESET</span></button>
      </div>`),
      e.appendChild(this.el),
      (this.stick = this.el.querySelector("#t-stick")),
      (this.knob = this.el.querySelector("#t-knob")),
      (this.stickId = null),
      (this.onAction = () => {});
    const s = document.createElement("div");
    (s.className = "t-zone"),
      this.el.prepend(s),
      s.addEventListener("pointerdown", (i) => {
        if (this.stickId !== null) return;
        (this.stickId = i.pointerId), s.setPointerCapture(i.pointerId);
        const o = this.el.getBoundingClientRect();
        (this.cx = i.clientX),
          (this.cy = i.clientY),
          (this.stick.style.left = `${i.clientX - o.left}px`),
          (this.stick.style.top = `${i.clientY - o.top}px`),
          this.stick.classList.add("active"),
          this.move(i);
      }),
      s.addEventListener("pointermove", (i) => {
        i.pointerId === this.stickId && this.move(i);
      });
    const t = (i) => {
      i.pointerId === this.stickId &&
        ((this.stickId = null),
        (this.state.x = 0),
        (this.state.y = 0),
        (this.knob.style.transform = "translate(-50%,-50%)"),
        this.stick.classList.remove("active"));
    };
    s.addEventListener("pointerup", t), s.addEventListener("pointercancel", t);
    for (const i of this.el.querySelectorAll(".t-btn")) {
      const o = i.dataset.k,
        n = (r) => {
          var l, d;
          r.preventDefault(),
            (l = i.setPointerCapture) == null || l.call(i, r.pointerId),
            (this.state[o] = !0),
            i.classList.add("on"),
            (d = navigator.vibrate) == null || d.call(navigator, 8);
        },
        c = (r) => {
          r.preventDefault(), (this.state[o] = !1), i.classList.remove("on");
        };
      i.addEventListener("pointerdown", n),
        i.addEventListener("pointerup", c),
        i.addEventListener("pointercancel", c),
        i.addEventListener("pointerleave", c);
    }
    for (const i of this.el.querySelectorAll(".t-mini"))
      i.addEventListener("pointerdown", (o) => {
        o.preventDefault(), this.onAction(i.dataset.act);
      });
    this.el.addEventListener("touchstart", (i) => i.preventDefault(), {
      passive: !1,
    }),
      this.el.addEventListener("contextmenu", (i) => i.preventDefault());
  }
  move(e) {
    let t = e.clientX - this.cx,
      i = e.clientY - this.cy;
    const o = Math.hypot(t, i);
    o > 62 && ((t *= 62 / o), (i *= 62 / o)),
      (this.knob.style.transform = `translate(calc(-50% + ${t}px), calc(-50% + ${i}px))`);
    const n = 0.12,
      c = t / 62,
      r = i / 62;
    (this.state.x = Math.abs(c) < n ? 0 : c),
      (this.state.y = Math.abs(r) < n ? 0 : r);
  }
  show(e) {
    this.el.classList.toggle("show", e);
  }
}

export { TouchControls, ji };
