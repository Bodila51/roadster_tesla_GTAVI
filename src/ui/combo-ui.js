import "./combo-ui.css";

// Combo meter and landing-grade call of the rules module. The meter sits under
// the HUD's multiplier + points plate in #center and shows the element count
// and the ground grace left before the combo banks; the grade call shows
// PERFECT / GOOD / SLOPPY on landings that score (from the rd:land event).
const GRADE_TXT = {
    perfect: ["PERFECT", "×1.5"],
    good: ["GOOD", ""],
    sloppy: ["SLOPPY", "×0.5"],
  },
  fmt = (n) => Math.round(n).toLocaleString("en-US"),
  make = (tag, cls, html) => {
    const e = document.createElement(tag);
    return (cls && (e.className = cls), html != null && (e.innerHTML = html), e);
  };

class ComboUi {
  constructor(game, grace) {
    (this.game = game),
      (this.graceMax = grace),
      (this.shownCount = -1),
      (this.shownGrace = -1),
      (this.meter = make(
        "div",
        "rd-combo",
        '<span class="rd-c-n">COMBO</span><span class="rd-c-bar"><span class="rd-c-fill"></span></span>',
      )),
      (this.meterN = this.meter.querySelector(".rd-c-n")),
      (this.meterFill = this.meter.querySelector(".rd-c-fill")),
      (this.grade = make("div", "rd-grade"));
    const center = document.getElementById("center"),
      plate = center && center.querySelector(".combo");
    plate
      ? plate.after(this.meter)
      : center
        ? center.prepend(this.meter)
        : (this.meter.classList.add("rd-solo"), document.body.append(this.meter));
    (document.getElementById("hud") || document.body).append(this.grade),
      addEventListener("rd:land", (e) => this.onLand(e.detail));
  }
  onLand(d) {
    if (!d || !GRADE_TXT[d.grade] || !(d.points > 0 || d.airTime >= 1)) return;
    const [w, m] = GRADE_TXT[d.grade];
    (this.grade.className = `rd-grade rd-g-${d.grade}`),
      (this.grade.innerHTML =
        `<div class="rd-g-in"><span class="rd-g-w">${w}</span>` +
        (m ? `<span class="rd-g-m">${m}</span>` : "") +
        (d.points > 0 ? `<span class="rd-g-p">+${fmt(d.points)}</span>` : "") +
        "</div>"),
      this.grade.offsetWidth,
      this.grade.classList.add("on"),
      clearTimeout(this.gradeT),
      (this.gradeT = setTimeout(() => this.grade.classList.remove("on"), 1300));
  }
  // Called by the game every update.
  frame() {
    const c = this.game.combo,
      n = c ? c.count : 0;
    n !== this.shownCount &&
      ((this.shownCount = n),
      this.meter.classList.toggle("on", n > 0),
      n > 0 && (this.meterN.textContent = `COMBO ${n}`));
    const g =
      n > 0
        ? Math.round(Math.max(0, Math.min(1, c.grace / this.graceMax)) * 50) / 50
        : 0;
    g !== this.shownGrace &&
      ((this.shownGrace = g),
      (this.meterFill.style.transform = `scaleX(${g})`));
  }
}

export { ComboUi };
