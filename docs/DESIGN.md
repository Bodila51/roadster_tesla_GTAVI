# Roadster v2 interface design

**Direction: broadcast telemetry plates.** Solid ink plates with one chamfer
signature, a single hi-vis orange accent and condensed tabular numerals, in the
spirit of a motorsport TV graphics package. Every readable thing sits on a plate,
because the scene behind it is a bright sky and sunlit concrete.

All tokens are CSS custom properties on `:root` in `src/style.css`. Use the
tokens and the `.ui-*` primitives below rather than new hex values.
`viewer.html` inlines a copy of a token subset; change both together.

## Tokens

### Colour
| Token | Value | Use |
|---|---|---|
| `--ink` | `#0b0e13` | base of every plate; text on light fills |
| `--ink-2` / `--ink-3` | `#151a22` / `#222a35` | raised rows and buttons / keycaps, tracks, toggles |
| `--plate` | ink at 84% | HUD plates over the scene |
| `--plate-hi` | ink at 93% | feedback, toasts, modals |
| `--scrim` | ink at 62% | behind modals (no blur); `#hud` and `#touch` hide while `#menu` is open |
| `--hair` / `--hair-2` | white 13% / 30% | dividers / outlines, keycap borders |
| `--fg` `--fg-2` `--fg-3` | white 100 / 72 / 48% | primary / secondary / label text |
| `--accent` | `#ff5a1f` signal orange | primary action, active state, live values, tabs |
| `--accent-hi` | `#ff7a45` | orange **as text** on ink, hover |
| `--on-accent` | `#0b0e13` | text on orange, white, green or air fills |
| `--good` | `#2fe08a` | success: mission done, banked points |
| `--bad` | `#ff3b4e` | danger: crash, low air, combo lost, missed |
| `--air` | `#e8f3ff` | cold gas, flight state |

One meaning per colour. Text on orange is always ink, never white.

### Type
- `--display`: **Big Shoulders Display** 900. Wordmark, trick calls, big one-word
  moments (CRASH, PAUSED, grades). Caps only. It has no tabular figures, so never
  use it for changing numbers.
- `--ui`: **Archivo** (variable, width 62–100). Labels, text and numerals.
  Numerals: `font-weight: 800; font-stretch: var(--num-stretch); font-variant-numeric: tabular-nums` (or `.ui-num`).
- Sizes: `--fs-micro` 9.5, `--fs-label` 10.5, `--fs-small` 11.5, `--fs-body` 13,
  `--fs-lead` 17; numerals `--fs-num-s/m/l/xl` 22/30/40/66; display
  `--fs-disp-s/m/l` 24/44/68; `--fs-wordmark` (clamped).
- Caps labels: weight 800, `letter-spacing: var(--track-caps)` (0.14em). CTA
  labels use `--track-cta` (0.22em). Nothing wider, no italics, no skew.

### Shape, elevation, motion
- `--radius: 0`. No rounded corners except the joystick (round on purpose).
- The chamfer: top-right and bottom-left corners cut at 45°, size `--cut`
  (10px; `--cut-s` 7, `--cut-l` 16). Add class `.ui-cut` or `.ui-plate`.
- Accent tab: a `--tab` (3px) bar on a plate's left edge (`.ui-tab`, with
  `.good` / `.bad` / `.air` variants).
- No glass blur, no glows. `--shadow-float` only for round floating items;
  `--shadow-drop` (a `filter`) for images. Clipped plates cannot cast shadows.
- `--snap` easing; `--t-fast` .12s, `--t-med` .3s, `--t-slow` .6s. Entrances
  are short wipes or slides (`.ui-in`, `.ui-rise`); keep loops off screens that
  are hidden; everything respects `prefers-reduced-motion`.

### Layout and stacking
- Gutters `--edge-t/r/b/l` already include safe-area insets (notch, home bar).
  `body.touch` tightens them. Never place controls or text outside them.
- `--touch-min` 44px minimum hit target. `--gap` 8px between plates.
- `--z-touch` 5, `--z-goals` 6, `--z-dev` 20, `--z-menu` 30, `--z-fade` 40.
  New modals (results, replay) use `--z-menu`.
- `#hud` carries `--dash-b` and `--dash-h` (where the speed plate sits), so
  anything that must stack above the dash can use
  `bottom: calc(var(--dash-b) + var(--dash-h) + 10px)`.

## Primitives (ready-made classes)
| Class | What it is |
|---|---|
| `.ui-plate` (+ `.hi`) | chamfered ink plate |
| `.ui-tab` (+ `.good` `.bad` `.air`) | accent bar on the left edge (needs left padding ≥ 12px) |
| `.ui-label` | small caps label, `--fg-3` |
| `.ui-num` | condensed tabular numerals |
| `.ui-display` | Big Shoulders 900 |
| `.ui-chip` (+ `.good` `.bad` `.air` `.ghost`) | small solid tag |
| `.ui-key` | keycap |
| `.ui-btn` (+ `.primary` `.secondary`) | chamfered button, 44px min height, hover / active / focus / disabled |
| `.ui-in`, `.ui-rise` | entrance wipe / rise |

Patterns already in the HUD to copy: score plate (`#scorebox`), toast
(`.toast`, label + message + 3.2s life bar), trick call (`.trick`: display word
on ink + orange points chip), banked (`.banked`: green chip + number), dash
meter (`#gas`: segmented bar with ink gaps).

## Screen zones
| | Desktop / keyboard | Phone landscape (`body.touch`) | Phone portrait |
|---|---|---|---|
| Top-left | missions tower (Tab) | pause, goals, cam, reset; goals panel drops below | icon buttons; goals panel drops below |
| Top-centre | toasts | **free: run timer** | run timer just under the top row, toasts under that |
| Top-right | score; **run timer goes left of the score** | score; toasts under it | score |
| Centre band (≈20–45% from top) | combo, trick calls, then one slot for 0–60 / drift meter (ground events) and the crash call; **combo meter and landing grade go here** | same, from 13%, scaled 0.7 | same, from 25% |
| Middle | the car: keep clear | the car (≈45–80% of the height) | the car: keep it between ≈45% and ≈66% of the height (camera framing) |
| Bottom-centre | speed + air dash | compact dash | dash above the thumb pads |
| Bottom-left | key hints (**tutorial hints reuse this slot**) | joystick zone: keep clear | joystick: keep clear |
| Bottom-right | @0xCodila badge (**minimap can take it**) | action pads: keep clear | action pads: keep clear |

Toasts: newest three on desktop, newest two on touch (older ones wait
hidden). Phone portrait keeps everything informational in the top 45% and
the thumbs in the bottom 26%; the dash top sits `safe-area-bottom + 272px`
above the bottom edge.

Results screen and replay overlay: full-screen `--scrim` with a `.m-box`-style
plate (see the pause menu); primary action bottom-right in landscape, full-width
at the bottom in portrait (thumb reach). "Save clip" is a `.ui-btn.primary`.

## Run mode slots (already in the markup)
- Title: `#start-run` (hidden) sits above `#start` in `.t-cta`. Unhide it and
  bind it to `startRun()`; `#start` then reads FREE ROAM and turns white on its
  own (CSS `:has`), and becomes `startFreeRoam()`.
- Pause menu: `#menu-run` (`data-act="run"`) and `#menu-roam`
  (`data-act="roam"`) in `.m-modes`, hidden. Unhide and handle the acts.

## Do not
Rounded or pill buttons · glass blur · glow or neon · italic or skewed type ·
letter-spacing above 0.3em · Michroma or Inter · white text straight on the 3D
scene · colours outside the token list.
