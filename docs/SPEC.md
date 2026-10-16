# Roadster — Unleashed: Architecture and Game Spec

This spec was reconstructed from structured maps of the shipped, prettified bundles: `fx.pretty.js` lines 28440–30109, `main.pretty.js` lines 1–9584, `viewer.pretty.js` lines 1–5496, plus `index.html`, `viewer.html` and `main.pretty.css`. Minified symbol names are given in brackets so you can find things in the original.

**Units and conventions**

- Distances are in metres, time in seconds, angles in radians, speeds in m/s, unless a line says otherwise. mph = m/s × 2.236936.
- "Derived" marks a number computed from the mapped constants. It was not read from the code.
- World frame: +Y is up and the ground is y = 0.
  - Car forward is (sin yaw, 0, cos yaw), so yaw π faces −Z.
  - Car local frame: +Z is the front, +Y is up, +X is the car's left. The body is mirrored in x.
- Ramp frame: f is the heading, up is +Y, r = f × up. s is arc length along the profile and u is the lateral offset.
- "Ease toward a target at rate k" means an exponential-style approach. Where the code is known to use `min(1, k·dt)` the text says so; otherwise the exact form was not captured (see §4).

---

## 1. Overview

### 1.1 Stack

- **Three.js r170** (WebGL2), bundled into a shared Vite chunk.
- **pmndrs `postprocessing`**, unmodified: EffectComposer, RenderPass, EffectPass, Bloom, ChromaticAberration, Vignette, Noise (film grain), SMAA and ToneMapping.
- **N8AO** screen-space AO, a vendored copy of `N8AOPostPass` for pmndrs. Used by the game only.
- **Three.js addons**, used by the viewer only: `OrbitControls` and `RectAreaLightUniformsLib` (the LTC tables).
- **Everything is procedural.** There are no model files. Geometry is lofted, lathed or extruded in code. Textures are canvases and DataTextures. Audio is synthesized with WebAudio; there are no samples and no music.
- **HUD and menus** are a DOM/CSS overlay. Fonts are Michroma (display) and Inter (UI) from Google Fonts.
- **Progress** is stored in localStorage.

### 1.2 Files and chunks

| File | Role |
|---|---|
| `index.html` | Game page. Contains `canvas#gl`, `#hud` (starts with `.hidden`), `#title`, `#menu`, `#fade`, `#dev` and `#rotate`. Viewport: `width=device-width, maximum-scale=1, user-scalable=no, viewport-fit=cover`; also `apple-mobile-web-app-capable=yes` and theme-color `#05070a`. Page title "Roadster — Unleashed". |
| main bundle (`main.pretty.js`, about 9,584 prettified lines; hashed filename not captured) | All game code, listed by line range below. |
| `main.pretty.css` (about 1,085 lines) | HUD, title, pause menu, touch layout. |
| `/assets/fx-BAJnSUTD.js` | Shared chunk: three.js r170, postprocessing, and the shared app code (Roadster car builder and four VFX systems). Re-exports everything under short aliases. |
| `viewer.html` + `/assets/viewer-hlSpoB6V.js` | Standalone 3D showroom page. Modulepreloads the fx chunk. |

**main.pretty.js layout**

| Lines | Contents |
|---|---|
| 1–91 | Imports from the fx chunk |
| 92–1710 | Vendored N8AO (SSAO pass, shaders, blue-noise texture, MRT shim) |
| 1711 | Dead top-level base64 decode |
| 1712–2105 | `ne`: curvature-profile ramp base class, which is also the reveal wall (deck mesh, truss tower, dressing) |
| 2107–2190 | `Os` procedural concrete textures, `Us` seeded PRNG |
| 2191–2384 | `ni` halfpipe |
| 2385–2597 | `ci` loop |
| 2598–2787 | `ui` mass driver |
| 2788–2863 | `pi` bullseye target |
| 2864–2946 | Helpers: `Qs` instanced struts, `Be` footprint→AABB, `gs` neon sign, `mi` stripe texture |
| 2947–2957 | `G` world anchor table |
| 2958–3272 | `gi` world/environment builder |
| 3273–3585 | Sky `wi`, ground `vi`, barrier geometry `xi/yi`, beam shader `Zs`, floodlight `Mi`, env map `Si` |
| 3586–3818 | Math utilities, `Rt` lineup-vehicle material library, `Di` monotone cubic spline |
| 3819–4105 | Vehicle body lofter (`Ks/Ri/Li/Fs/ki/zi/Xs`) |
| 4106–4756 | Surface projector `ce`, projected decals, wheel generator, wheel wells, mirrors, profile wrapper `ws/Ne` |
| 4757–5986 | Lineup vehicles: model3 `Ci`, modelY `Bi`, cybercab `Vi`, cybertruck `Ei`, semi `Hi` |
| 5987–6037 | Lineup stage `qi` |
| 6038–6758 | Physics constants (`ze`, `he`, `As`, `ot`) and car physics `Wi` |
| 6760–6928 | Camera director `Ni` (mode list `Ke`) |
| 6929–7389 | Missions `fe`, mph factor `Oi`, game manager `Ui`, localStorage helpers `Xe/de` |
| 7390–7522 | DOM HUD controller `Yi` |
| 7523–8772 | Audio engine `Zi` and helpers |
| 8773–8868 | Touch detection `ji`, touch overlay `Ki` |
| 8869–9584 | Bootstrap: renderer and post, scene assembly, input, state machine, menus, teleports, car visual sync, title camera, main loop, URL flags, `window.__rd` |

**fx chunk app code (export alias in brackets)**

| Lines | Symbol | Contents |
|---|---|---|
| up to 28703 | — | three.js r170 + postprocessing library (EffectPass at 28447–28703) |
| 28704–28805 | `P0`, `Jt` | Loft mesher; Hermite profile spline |
| 28806–29021 | `Cn` (`ab`), `xt`, `L0` | Car dimensions, body profile curves, cross-section generator |
| 29022–29221 | `kn/Bi/ds/jc/Ni`, `U0`, `B0`, `N0` | Geometry helpers, car materials, licence-plate and underbody canvases |
| 29222–29651 | `O0`, `lx` (`as`) | Wheel builder; Roadster assembler |
| 29652–29805 | `ux` (`au`) | Smoke/dust particles |
| 29806–29864 | `hx` (`av`) | Thruster plumes |
| 29865–29927 | `fx` (`aw`) | Skid marks |
| 29928–30006 | `dx` (`ax`) | Sparks |
| 30007–30109 | export table | Also `ar` = EffectPass, `ag` EffectComposer, `ah` RenderPass, `ai` Bloom, `aj` ChromaticAberration, `ak` Vignette, `al` Noise, `an` SMAA, `ap` ToneMapping, `ao` ToneMappingMode, `aq` SMAA preset, `am` BlendFunction, plus the three.js classes |

### 1.3 Boot sequence (main bundle)

1. **Touch detection.** `De = ji()` is true when `matchMedia('(pointer: coarse)')` matches or `'ontouchstart' in window`, unless the URL has `?desktop`. Touch adds `body.touch`.
2. **Renderer and post.** Create the renderer on `canvas#gl`, then the camera (FOV 62, near 0.1, far 6000, position (8, 3, 40)), then the composer: RenderPass → N8AO (skipped on touch; on failure it logs "AO disabled") → EffectPass(Bloom, ChromaticAberration) → EffectPass(ToneMapping, Vignette, Noise, SMAA).
3. **World.** `gi(scene, renderer)` builds fog, sky, ground, markings, LEDs, barriers, 14 floodlights, power line, background industry, moon, hemisphere light and the env map.
4. **Set pieces.** Reveal wall `ne` with 2 floodlight SpotLights, halfpipe `ni`, loop `ci`, mass driver `ui`, bullseye `pi`, and the lineup stage `qi()` placed at `G.lineup`.
5. **Car and physics.**
   - Build the car `lx()` and parent its lights to `car.body`.
   - Build the collider and surface lists.
   - Create physics `Wi({ramps: [wall, halfpipe, loop, massdriver], colliders, surfaces})`.
   - Reset at `G.spawn` (0,0,30) heading π, then reset again at **(0, 0, −112) heading π**. That second position is where play starts: 38 m in front of the wall, facing −Z.
6. **Subsystems.**
   - VFX: smoke `ux` (2,600 particles), plumes `hx`, skid marks `fx` (1,600 quads), sparks `dx` (400).
   - Camera rig `Ni`, HUD `Yi`, and audio `Zi`. Audio is created here but not initialized until the game starts.
   - Game manager `Ui`: reads localStorage, builds the 8 rings and renders the mission list.
7. **Touch setup** (touch devices only). Create the touch overlay `Ki`. Turn off floodlight shadows, drop the moon shadow map to 1024, and start the missions panel collapsed.
8. **Listeners.** Keyboard, blur, menu, options and resize.
9. **Start.** Add `#fade.off`. Apply URL flags (`?notitle`, `?og`, `?cine`). Start the rAF loop. Expose `window.__rd`. With `?autostart`, call start after 300 ms.

### 1.4 Game states

`title` → start (the `#start` button, Enter or Space, or `?autostart`) → `play` ⇄ `pause` (Esc or the ❚❚ button). There is no way back to the title.

On the title screen, physics keeps running with neutral input and an orbit camera circles the parked car.

**Start, `Ue()`** (runs once):

- Audio: `audio.init()`, then the `uiConfirm` sound. State becomes `play` and `body` gets `playing`.
- Camera rig: chase direction = the car's flattened forward vector; position = car − 9·forward, at y 3.2.
- Overlays: `#title.out` and `#hud` un-hidden.
- On touch: show the controls, call `requestFullscreen({navigationUI:'hide'})`, then `screen.orientation.lock('landscape')`. Errors are swallowed.
- Welcome toast (good style, skipped with `?cine`): "THE REVEAL WALL IS STRAIGHT AHEAD" / "Hold W — the suction keeps you on it". On touch the subtitle is "Push the stick up — the suction keeps you on it".

**Pause, `He()`:**

- Going into pause: show `#menu`, mute the master bus, hide the touch controls.
- Resuming: hide the menu, restore the user's own mute flag (M key), show the touch controls.

### 1.5 Main loop

```
loop():                                   # requestAnimationFrame
  dt = min(0.05, clock.getDelta())        # real seconds, no fixed-step accumulator
  if state == 'pause': composer.render(dt); return
  scale = (state == 'play') ? game.timeScale : 1      # slow-mo
  s = dt * scale; gameTime += s
  input = (state == 'play') ? readInput() : NEUTRAL   # all zero on the title
  phys.events.length = 0
  phys.update(s, input)                   # internal substeps of at most 1/240 s
  worldBoundary()                         # radius 1600 around the origin
  if state == 'play': game.update(dt, s, phys, input, rig)   # score, missions, HUD, audio events
  syncCarVisuals(s, input, gameTime)      # pose, wheels, lights, wing, plumes, emitters, skids, sparks
  smoke.update(s, spotLightEstimate)
  sparks.update(s)
  world.update(s, gameTime, phys.pos)     # moon shadow follow, blinkers, sky recentre
  beamShader.uTime = gameTime
  massDriver.update(s, gameTime, (phys.mode=='ramp' && phys.R==massDriver) ? phys.rs : null)
  bullseye.update(gameTime)
  wallBeacon.emissiveIntensity = 0.5 + 9*max(0, sin(2.4*gameTime + 1))^3
  if state == 'play': rig.update(dt, phys, {boost: input.boost && phys.thrust.boost > 0})
  else: titleOrbit(dt)
  audio.update(dt, {...})                 # unscaled dt
  composer.render(dt)
```

**World boundary.** When the car's XZ distance from the origin exceeds 1600, its position is clamped back onto that circle and 1.5× the outward radial velocity is removed, so it rebounds at half speed. During play this shows the toast "EDGE OF THE TEST SITE / Turn around", at most once every 4 s.

### 1.6 Event flow

During its substeps, physics pushes typed events into `phys.events`. The game manager reads them in the same frame, and the list is cleared at the start of the next frame.

| Event | Payload |
|---|---|
| `launch` | — (ground launch pop) |
| `airborne` | — |
| `rampEnter` | surface |
| `rampExit` | inverted, theta (= rampMaxTheta), surface |
| `rampDone` | surface (end of a ground-ended ramp, i.e. the loop) |
| `rampFall` | surface |
| `trick` | axis (roll, pitch or yaw), count, sign |
| `land` | impact, airTime, rot, fromRamp, surface, tilt |
| `crash` | impact |
| `scrape` | speed |
| `recover` | — |
| `collide` | speed, name |

The game manager turns these into score, missions, HUD calls, camera cuts, camera shake, slow-mo and audio events (§2.4, §2.8, §2.11).

---

## 2. Systems

### 2.1 Car physics and controls [`Wi`]

**Purpose.** An arcade sim of the Roadster with four modes: `ground`, `ramp` (stuck to a curved surface by suction), `air` and `crashed`.

**State.**

- Body: `pos`, `vel`, `angVel` (body frame), `quat`, `yaw`, `yawRate`, `steer`.
- Mode: `mode`, `h` (current surface height), `airTime`, `rot{roll, pitch, yaw}`, `tricksCalled`, `crashT`, `recoverT`.
- Cosmetic: `susp`, `suspV`, `bodyRoll`, `bodyPitch`, `wheelSpin`.
- Driving: `slip`, `burnout`, `thrust{lift, boost, rcs, side}`, `gas`.
- Ramps: `fromRamp`, `rampMaxTheta`, `rampCooldown`, `R`, `rs`, `ru`, `rpsi`, `rv`.
- Bookkeeping: `lastInputT`, `onSurface`, `events[]`.
- Getters: `fwd` = local +Z, `up` = local +Y, `left` = local +X, `speed` = the length of `vel` in 3D.

**Input object** (built each frame, §2.13):

| Field | Meaning |
|---|---|
| `throttle`, `brake` | 0..1 |
| `steer` | −1..1, positive = left |
| `lift` | Space held |
| `liftPressed` | rising edge of lift |
| `boost` | bool |
| `drift` | bool |
| `yawL`, `yawR` | 0 or 1 |

**Integration.**

- `update(dt, input)` runs n = max(1, ceil(dt·240)) substeps of dt/n.
- Each substep zeroes `thrust.lift/boost/rcs/side`, runs the step function for the current mode, then clamps `gas` to [0, 100].
- Once per frame, on the full dt, a cosmetic suspension spring runs: `suspV += (−180·susp − 16·suspV)·dt; susp += suspV·dt`. That is ω ≈ 13.4 rad/s (2.14 Hz) with a damping ratio of 0.60.

**Surfaces.** `surfaceAt(x, z, maxY)` returns the highest AABB top that is at or below maxY and whose XZ footprint contains the point, as `{h, name}`. The default is `{0, 'ground'}`. Ground mode only ever sits on flat box tops: there is no slope alignment anywhere except on the ramps.

**Reset.** `reset(pos, yaw = π)` clears all state, sets gas = 100 and mode `ground`, and snaps `h` to `surfaceAt(x, z, y + 0.5)`.

**Ground step, in order:**

1. **Split velocity.** vf is the speed along the heading (sin yaw, 0, cos yaw); vl is the speed along (cos yaw, 0, −sin yaw).
2. **Steering.**
   - `steer` eases toward the input at rate 7.
   - Maximum wheel angle = 0.62/(1 + |vf|/15): 35.5° at rest, half that at 15 m/s.
   - Target yaw rate = vf·tan(steer·maxAngle)/2.84 (a bicycle model with wheelbase 2.84).
3. **Drift** (drift held and |vf| > 4).
   - Target yaw rate = 1.75·base + 0.6·steer·sign(vf). The yaw rate eases at rate 4 (9 when not drifting).
   - Adds an extra −1.2 m/s² along vf.
4. **Yaw.** yaw += yawRate·dt.
5. **Longitudinal acceleration (`longAccel`).**
   - Motor: throttle·min(17, 340/max(0.5, |vf|)). That is a flat 17 m/s² up to 20 m/s, then constant power.
   - Throttle while rolling backward (vf < −0.5) gives +16·throttle instead, which acts as a brake.
   - Brake input gives −16 when vf > 0.5. Otherwise it gives −6 (reverse) while vf > −14, else 0. Reverse speed is hard-clamped at vf ≥ −14.
   - Resistance: −sign(vf)·(0.25 + 0.0009·vf²).
6. **Boost** (boost held and gas > 0.5).
   - Adds 6.5 + 19.5·max(0, 1 − |vf|/40): 26 m/s² at rest, falling to 6.5 at 40 m/s and above.
   - Burns 15 gas/s and sets `thrust.boost = 1`.
7. **Burnout** (throttle > 0.5, brake > 0.5 and |vf| < 4).
   - No engine force. vf *= e^(−6·dt), and yaw gets an extra 2.2·steer rad/s.
   - The burnout meter rises 3/s, and falls 3/s otherwise. It is presumably clamped to 0..1.
8. **Lateral grip.**
   - vl *= e^(−r·dt), where r = 1.5 while drifting, else max(5, 12 − |vf|/14).
   - `slip = |vl|`. This drives drift scoring, tyre smoke, skid marks and squeal audio.
9. **Recompose and regen.** vel = f·vf + l·vl, with vel.y = 0. Gas regenerates +32/s whenever boost is not held.
10. **Height.** Probe the surface under the 4 wheels at local (±0.84, ·, +1.36) and (±0.84, ·, −1.48), taking the highest surface with top ≤ h + 0.35.
    - 0.35 m is the maximum step-up. A step-up of dh kicks the suspension: susp −= 0.6·dh.
    - If the surface found is below h − 0.25, the car goes airborne (it drives off the ledge).
11. **Cosmetic body motion.**
    - Body pitch target = −clamp(dvf/dt, −40, 40)·0.0022.
    - Body roll target = yawRate·vf·0.0016. Both ease at rate 6.
    - The orientation itself is yaw-only.
    - wheelSpin += vf·dt/0.325.
12. **Then:** `collide()`, `checkRampEntry()`, and the **launch pop**: on `liftPressed` with gas > 8, set vel.y = 8.2, spend 6 gas, emit `launch` and switch to air.

**Derived ground performance**

| Quantity | Value |
|---|---|
| Top speed, throttle only | 71.0 m/s (158.8 mph) |
| Boost equilibrium speed | 103.0 m/s (230.4 mph), not reachable on one tank |
| Boost duration on a full tank | 6.7 s |
| Peak from a standstill with boost held | 80.9 m/s (181 mph) |
| Peak from a 159 mph cruise on a full tank | 95.0 m/s (212.5 mph) |
| 0–60 mph, Shift+W | ≈ 0.78 s |
| 0–60 mph, W only | ≈ 1.70 s |
| Launch pop alone | 1.67 s in the air, 3.43 m apex |

**Quirks to reproduce or fix on purpose**

- Ground orientation is always perfectly flat.
- The suspension spring is integrated once per frame, not per substep.
- Air drag (0.0012·|v|·v) is about 33% higher than ground drag, so a car at 71 m/s starts decelerating harder the moment it leaves the ground.
- Simulation is variable-step: physics takes the raw frame dt (capped at 0.05 s). Below 20 fps the game runs in slow motion.

### 2.2 Ramps, suction and wall riding

#### 2.2.1 Curvature-profile surface [`ne`]

Every ramp is a 2D profile (forward F, height Y, pitch θ) built by integrating a curvature function κ(s) along the arc length. The profile is swept across a lateral width, with an optional lateral shift function.

- **Constructor options and defaults.**
  - Placement: `position (0,0,−150)`, `heading (0,0,−1)`, `width 7.2`, `name 'wall'`.
  - Shape: `kappa = ne.kappa`, `length 35.2`, `theta0 0`.
  - Behaviour: `entry 'lip'` (or `'flat'`), `startEnd 'ground'` (or `'launch'`), `endEnd 'launch'` (or `'ground'`), `build true`, `shift null`, `sideSolid true`.
- **Frame.** f = the normalized heading, up = +Y, r = f × up, half = width/2.
- **Profile build.**
  - ds = 0.05 and n = round(L/0.05) + 1 samples.
  - Midpoint integration: p = θ + κ·ds/2; F += cos p·ds; Y += sin p·ds; θ += κ·ds.
  - Stores Float32Arrays S, F, Y, TH, KA, plus `height` = Y[n−1], `fMax`, `topY` and `minY`.
- **Lookups.**
  - `sample(s)` clamps s to [0, L] and linearly interpolates {f, y, th, k}.
  - `point(s, lat)` = origin + f·F + up·Y + r·(lat + shift(s)).
  - `tangent(s)` = f·cos θ + up·sin θ; `normal(s)` = −f·sin θ + up·cos θ.
- **`project(worldPos)`** returns `{s, u, d, fl, yl}`: u is the lateral offset minus the shift, and d is the signed height above the surface along the normal.
  - Coarse pass: every 4th sample (0.2 m), minimizing dF² + dY².
  - Lateral penalty, only when a shift function exists: (|o − shift| − half)² outside the lane.
  - Fine pass: ±4 samples around the coarse result.
  - Ramps without a shift have no lateral bound, so callers must check |u| themselves.

#### 2.2.2 The four ramps

| | Reveal wall [`ne`] | Halfpipe [`ni`] | Loop [`ci`] | Mass driver [`ui`] |
|---|---|---|---|---|
| name | `wall` | `halfpipe` | `loop` | `massdriver` |
| origin | (0, 0.04, −150) | (−230, 9.12, −156.5) | (−275, 0.04, −60) | (230, 0.04, −300) |
| f / r | −Z / +X | −Z / +X (the pipe axis is X) | +Z / −X | +X / +Z |
| width | 7.2 | 64 (the pipe's length along X) | 6.4 | 6.2 |
| L | 35.2 | 38.76 | 79.69 | 66.76 |
| theta0 | 0 | −π/2 | 0 | 0 |
| entry | lip | flat | lip | lip |
| startEnd / endEnd | ground / launch | launch / launch | ground / ground | ground (default) / launch |
| sideSolid | true | true | false | false |
| extremes | top 23.32 local (23.36 world), lip at forward 12.35, max reach 15.51, ends at 161.1° (overhang) | bottom at local −9.1 (world 0.02), ends at forward 26.99, 90.3° | top 19.16, ends at forward 19.99, 360°, lane shifted 8 m | top ≈ 29, reach ≈ 58.9, exit pitch 32° |

**Curvature functions**

- **Wall `ne.kappa`** (piecewise; past 35.2 it returns 1/4.6, which is harmless because `sample` clamps):

  | s (m) | κ |
  |---|---|
  | 0–2.5 | 0 (flat) |
  | 2.5–9 | linear 0 → 0.117647 (R 8.5) |
  | 9–15.5 | 0.117647 (R 8.5) |
  | 15.5–19.5 | eases to 0.012 (R 83.3); exact easing not captured |
  | 19.5–27.5 | 0.012 |
  | 27.5–31 | ramps to 0.217391 (R 4.6) |
  | 31–35.2 | 0.217391 |

- **Halfpipe `ai`.** H = 9.1 (deck height), transition radius 7.5, pipe span 27 m from deck to deck. Origin = centre − heading·13.5 at y H + 0.02. flatS0 = 13.38 and flatS1 = 25.38.

  | Segment | Length (m) | κ |
  |---|---|---|
  | vertical drop | 1.6 | 0 |
  | quarter circle | 7.5·π/2 | 1/7.5 |
  | flat bottom | 12 | 0 |
  | quarter circle | 7.5·π/2 | 1/7.5 |
  | vertical | 1.6 | 0 |

- **Loop `li`.** Ce = 2π − 6/9.5 = 5.6516 rad, so the total turn is exactly 2π.

  | Segment | Length (m) | κ |
  |---|---|---|
  | entry flat | 4 | 0 |
  | clothoid | 6 | 0 → 1/9.5 |
  | constant arc | 9.5·Ce | 1/9.5 |
  | clothoid | 6 | 1/9.5 → 0 |
  | exit flat | 10 | 0 |

  Lateral shift(s) = 8.0·smoothstep((s − 7)/(66.69 − 7)), where 8.0 = width + 1.6, so the exit clears the entry. `shiftTotal` = 8.
- **Mass driver `di`.** 0 for s < 4, then 1/30 for 30·0.5585 = 16.76 m (up to 32°), then 0 for a 46 m straight incline. `railAccel` = 42 and `railTop` = 80.

#### 2.2.3 Entering a ramp from the ground [`checkRampEntry`, `enterSurface`]

The car's position in the ramp frame is t = (pos − origin)·f along the ramp and i = (pos − origin)·r across it.

- **Lip ramps (wall, loop, mass driver).** The car attaches when −0.2 ≤ t < 2.4, |i| < half − 0.4 and vel·f > 1 m/s, at s = max(0, t), u = i.
- **Solid sides** (sideSolid ramps only, i.e. the wall). When 2.4 < t < fMax + 0.2 and |i| < half + 1, and the car is below `sample(min(L, t)).y + 0.2` or t > 6:
  - the car is pushed out sideways to |i| = half + 1;
  - lateral velocity reflects with restitution 0.3 (v += −1.3·vn);
  - `collide` is emitted.
- **Flat entry (halfpipe).** The footprint is 0 < t < 27, |i| < half + 1.
  - Inside the flat-bottom band [f(flatS0) + 0.3, f(flatS1) − 0.3], the car attaches when |i| < half and pos.y < 0.6, at s = flatS0 + (t − f(flatS0)).
  - Under the curved walls the car is pushed out of the pipe ends the same way (restitution 0.3), unless pos.y > H − 0.5.
- **`enterSurface`** sets mode `ramp` and stores R, rs and ru.
  - rpsi = atan2(fwd·r, fwd·tangent) is the heading relative to the ramp.
  - rv = |vel|·sign(vel·fwd).
  - Resets rampMaxTheta and emits `rampEnter`.

#### 2.2.4 Driving on a ramp [`stepRamp`]

1. **Sample.** Sample the profile at rs: θ, κ, y, f, tangent and normal.
2. **Steering.** Maximum angle 0.62/(1 + |rv|/15). Heading rate = rv·tan(steer·max)/2.84, scaled ×1.0 on the halfpipe and ×0.55 on lip ramps; rpsi −= rate·dt. On lip ramps rpsi also decays by e^(−0.4·dt), so the car straightens itself.
3. **Longitudinal.**
   - The same `longAccel` as on the ground (engine, brake, boost, drag).
   - On the halfpipe, positive acceleration is scaled by max(0.3, cos θ).
   - On the mass driver, while 0 < rv < 80, add +42 m/s² and set `thrust.boost`.
   - Slope gravity: −9.81·sin θ·cos rpsi.
4. **Integrate.** rv += a·dt; rs += rv·cos(rpsi)·dt; ru += rv·sin(rpsi)·dt; rampMaxTheta = max(θ). slip = 0.
5. **Gas.** Regen is 32·0.4 = 12.8/s and applies even while boosting, for a net −2.2/s when boosting.
6. **Pose.**
   - dir = tangent·cos ψ + r·sin ψ; vel = dir·rv.
   - The quaternion comes from the basis (normal × dir, normal, dir); position = `point(rs, ru)`.
   - Body pitch and roll *= 0.9 per substep.
7. **Suction (adhesion).**
   - Required normal acceleration: w = rv²·κ·cos²ψ + 9.81·cos θ.
   - The limit S is 15 m/s² when throttle > 0.05 or |rv| > 4, else 2.5.
   - The car detaches when w < −S. Because 15 > g, holding throttle (or moving faster than 4 m/s) keeps the car stuck even fully inverted: this is "the fans hold you upside down".
   - `thrust.suction` = 1 drives the fan audio. It is never reset.

#### 2.2.5 Leaving a ramp

- **Launch exit.** Triggered at rs ≥ L − 0.02 with endEnd `launch`, or at rs ≤ 0 with startEnd `launch`.
  - Mass driver: rv = max(rv, railTop − 2 = 78).
  - Halfpipe: |rv| above 16 is compressed to 16 + 0.3·(|rv| − 16).
  - Mode becomes `air` with rot and tricksCalled reset, and angVel.x = −sign(rv)·min(3.2, |rv|·κ·0.4), so 40% of the curve's pitch rate carries over. fromRamp = true.
  - rampCooldown is 0.3 s on the halfpipe and 0.8 s elsewhere.
  - Emits `rampExit{inverted: up.y < 0, theta, surface}`.
- **Ground end** (loop). Mode `ground`, yaw = atan2(dir.x, dir.z), h = 0; emits `rampDone`.
- **Backing off** at rs ≤ 0 with startEnd `ground`: the car silently returns to the ground. Leaving the halfpipe's flat band sideways (|ru| > half, out of the pipe ends) also returns to the ground.
- **Fall-off** (|ru| > half, or w < −S).
  - The car goes to air with angVel.x = −min(2.5, rv·κ·0.4), fromRamp = true and rampCooldown 0.5 s.
  - It is pushed 0.05 m along the normal and `rampFall` is emitted.

#### 2.2.6 Mass driver runtime [`ui.update(dt, t, playerS)`]

- `charge` eases toward 1 while the car is on the rail (rate 6) and toward 0 otherwise (rate 1.5).
- Each frame it sets the chase-light shader's `uTime` and `uCharge`.
- Coil glow: emissiveIntensity = 1 + 0.6·sin(3t − 0.3·s) + 14·e^(−0.25·|s − playerS|).

### 2.3 Thrusters and air

**Thruster hardware** (from the car model, §2.9.6). Mount points are `{p, d}`, where d is the exhaust direction:

| Group | Positions | Exhaust direction |
|---|---|---|
| lift ×4 | (±0.6, 0.18, 1.6), (±0.6, 0.18, −1.62) | down |
| rear ×4 | the large nozzles at (±0.6 / ±0.22, 0.44, −2.29) | −Z |
| side ×2 | (±1, 0.62, 0) | ±X |
| top ×4 | (±0.55, 0.95, 1.1), (±0.55, 0.95, −1.3) | up |

Two small dummy nozzles at x = ±0.41 have glow discs but no thruster entry.

**Gas economy** (max 100; the HUD flavour text "COLD GAS · 600 L COPV" is cosmetic)

| Where | Effect | Rate or cost | Gate |
|---|---|---|---|
| Ground | regen | +32/s when boost is not held | — |
| Ramp | regen | +12.8/s always | — |
| Air | regen | none | — |
| Ground boost | drain | 15/s | gas > 0.5 |
| Launch pop | cost | 6 | gas > 8 |
| Air lift | drain | 26/s | gas > 0 |
| Air boost | drain | 15/s | gas > 0 |
| RCS (any rotation input in air) | drain | 3/s | not gated (rotation works with an empty tank) |

**Taking off, `toAir()`.** Sets mode `air`, resets airTime, rot and tricksCalled, sets angVel = (0, 0.8·yawRate, 0) and emits `airborne`.

**Air step**

- **Attitude.** Target body rates are pitch x = (throttle − brake)·5.4, yaw y = (yawL − yawR)·4.4 and roll z = −steer·7.6 rad/s. Each axis eases toward its target at rate 7.5 while that axis has input, or 2.2 without input (decaying to 0). `thrust.rcs` = 1 while any rotation input is held.
- **Auto-level.**
  - Engages when there has been no input for more than 0.25 s, vel.y < 1, height above the surface below < 7 m, and up.y > −0.1.
  - Slerps toward upright at the current heading (flattened forward, or velocity) with factor 1 − e^(−dt·k), where k = 2.4 if up.y > 0.2, else 1.4.
  - Damps spin by e^(−2·dt) and holds rcs ≥ 0.5.
- **Orientation.** Integrated in the body frame: q = q·axisAngle(angVel, |angVel|·dt).
- **Forces.**
  - Gravity −9.81.
  - Lift (Space held): +17 along car up.
  - Boost (Shift held): +9 along car forward.
  - Drag: −0.0012·|v|·v.
- **Then:** wheelSpin *= e^(−0.5·dt), body pitch and roll *= 0.95, `collide()`, then the ramp or ground contact checks (§2.4).
- **Rotation counting.** rot.roll/pitch/yaw accumulate angVel.z/x/y·dt. A `trick{axis, count, sign}` fires whenever floor((|rot| + 0.55)/2π) increases, so a rotation is credited at 2π − 0.55 rad (≈ 328.5°).

**Derived air numbers**

| Quantity | Value |
|---|---|
| Net upright lift acceleration | +7.19 m/s² |
| Full tank of lift / boost / RCS | 3.85 s / 6.7 s / 33 s |
| Terminal speed, free fall | 90.4 m/s (202 mph) |
| Terminal speed, level boost | 86.6 m/s (194 mph) |
| Terminal speed, nose-down boost dive | 125 m/s (280 mph) |
| No-input mass-driver shot (78 m/s, 32°, from ≈ 29 m) | lands ≈ 417 m past the lip at x ≈ 706, ≈ 6.8 m short of the bullseye centre (inner ring). About 8.4 s in the air, apex ≈ 100 m. With an 80 m/s exit it lands ≈ 7 m past the centre. |

**Visual and audio hookup** (§2.8 and §2.11):

- Plume levels: `{lift: thrust.lift, rear: thrust.boost, side, top}`.
  - side = max(|steer| in air, 0.4·rcs), only in air or crashed.
  - top = 0.8·|throttle − brake| in air, plus rcs while crashed.
- Nozzle glow emissive is 6 while boosting.
- The under-body PointLight eases toward 260 while lifting.
- Lift ground dust appears within 9 m of the ground.
- Separate synth loops for lift, boost, RCS puffs and the suction fan.

### 2.4 Landing, crashes and collisions

**Contact points.** There are 13 in the body frame:

- 4 wheels at (±0.84, 0, +1.36 and −1.48);
- 8 body corners at (±0.92, y 0.25 and 1.05, z ±2.15);
- the roof at (0, 1.15, −0.2).

**Ground contact.** Each point queries `surfaceAt(x, z, y + 1.2)` and the deepest penetration wins.

- **Landing** (up.y > 0.5, i.e. tilted less than 60°):
  - yaw comes from the flattened forward vector (or velocity), mode becomes `ground`, h = the surface height;
  - vel.y = 0 (horizontal velocity is kept), yawRate = 0.5·angVel.y, angVel = 0;
  - suspension kick: susp = −min(0.12, 0.008·impact), suspV = −0.15·impact;
  - the orientation snaps instantly to yaw-only (a visible pop);
  - emits `land{impact = −vel.y, airTime, rot, fromRamp, surface, tilt = up.y}`, then sets fromRamp = false.
- **Too steep:** the car is pushed out of the penetration, then `crash(impact)`.

**Ramp contact.** Skipped while rampCooldown > 0.

- Project the probe pos + up·0.5 onto each ramp as {s, u, d}.
- The contact is rejected if any of these holds:
  - |u| > half + 0.3;
  - d > 0.75 or d < −1.5;
  - s < 2.4 on a lip ramp;
  - s ≤ 0.02 or s ≥ L − 0.02;
  - the normal velocity is above 2 m/s away from the surface.
- **Landing** (up·n > 0.55 and |u| < half): attach to the ramp with rpsi from the forward vector, rv = velocity projected on the heading, angVel 0, susp −0.08. Emits `land` with tilt = up·n.
- **Otherwise:** push the car to d = 0.75, bounce with restitution 0.4 (v += −1.4·vn) and crash with impact −vn.

**Crash and tumble [`crash`, `stepCrashed`].**

- **Crash.** Mode `crashed`, crashT = 1.35 s.
  - Velocity: vel.y = 0.3·|vel.y| (always upward), horizontal velocity ×0.55.
  - Spin: angVel ×0.4, plus random ±1.5 rad/s on x and z.
  - Emits `crash{impact}`.
- **Tumble** (1.35 s): gravity only, body-frame spin damped by e^(−1.8·dt).
  - Contact points push the car up out of the ground.
  - On downward contact: emit `scrape` if vel.y < −3, bounce vel.y *= −0.25, and apply horizontal friction e^(−3·dt).
  - `collide()` keeps running.
- **Recovery** (0.8 s smoothstep, s = recoverT/0.8, t = s²(3 − 2s)):
  - The first frame records the target yaw (flattened forward), the start quaternion and the start position, and emits `recover`.
  - The quaternion slerps to upright. Height = ground + 1.2·sin(πt) + (1 − t)·max(0, startY − ground), a 1.2 m hop.
  - Velocity decays by e^(−4·dt) but is not integrated, so XZ is frozen.
  - Lift 0.6 and rcs 1 drive the flame visuals.
  - At the end: mode `ground`, recorded yaw, everything zeroed. Total downtime is about 2.15 s.

**Static colliders [`collide`].**

- Three spheres of radius 0.82 at body-local (0, 0.55, −1.45 / 0 / +1.45) are tested against the AABB collider list.
- The normal comes from the closest point on the box. If the sphere centre is inside the box, the normal is ±X or ±Z by the smaller penetration.
- **Top contact** (normal.y > 0.65): skipped for `drivable` boxes, because their surfaces handle it. Otherwise the car is pushed up and downward vel.y is zeroed. The car stays in air mode, so it can rest on a non-drivable box top.
- **Side contact:** horizontal push-out. If the car is approaching, normal velocity reflects with restitution 0.3 and 25% of the tangential velocity is removed. On the ground, facing into the wall (fwd·n < −0.5) re-baselines `_lastVF` so the cosmetic body pitch does not spike.
- Emits `collide{speed: −vn, name}`. A normal impact above 16 m/s (36 mph), when not already crashed, adds random spin (yaw ±2, roll ±1.5) and calls `crash`.
- The spheres reach 0.82 m from the centreline but the body half-width is 0.92, so the car's sides can clip about 0.1 m into walls.

### 2.5 Tricks and scoring [`Ui`]

**Combo model.**

- `callTrick(name, pts)` adds pts to `pending`, appends the trick, and sets `mult = min(8, 1 + 0.5·(tricks − 1))` (the cap is reached at 15 tricks). It shows the trick in the HUD and plays audio `trick` at level min(5, count).
- `bank(label)`: score += round(pending·mult); the HUD shows "label +N"; pending, mult and tricks reset. Banks happen on landing (`LANDED` if clean, else `SKETCHY`), on finishing the loop (`LOOP`), and for drifts (`DRIFT`).
- `lose()` on a crash drops pending; the HUD shows "COMBO LOST" if pending > 0.
- `addScore(n, pending = false)` goes straight to the score, updates best and persists `rdstr.best`.
- Landing callouts (AIR, CLEAN LANDING and so on) are tricks too, so they also raise the multiplier.

**Trick and bonus catalogue**

| Callout | Trigger | Points |
|---|---|---|
| `KICKFLIP`, `DOUBLE KICKFLIP`, `n× KICKFLIP` | roll rotation n in a jump | 800·n per callout (cumulative: rolls 1..n give 800·n(n+1)/2) |
| `FRONTFLIP` / `BACKFLIP` (`n× ` prefix when n > 1) | pitch rotation; sign > 0 (nose down, W) is a front flip | 700·n per callout |
| `360`, `720`, … (360·n) | yaw rotation | 400·n per callout |
| `WALL RIDE` | on the wall with rampMaxTheta > π/2 + 0.05 (≈ 92.9°), once per entry | 500 |
| `INVERTED EXIT` | wall launch exit with up.y < 0 | 600, plus slow-mo 1.1 s at 0.3 |
| `VERT AIR` | halfpipe launch exit | 300 |
| `MASS DRIVER LAUNCH` | mass driver exit | 1000, slow-mo 1.2 s at 0.35, toast "AIM FOR THE BEAM / Lift to stretch · thrust to push · land in the gold ring" |
| `LOOP THE LOOP` | `rampDone` on the loop with rampMaxTheta > 2π − 0.6 (≈ 325.6°) | 1500, then `bank('LOOP')` |
| `RING n/8` | ring collected | 500 |
| `AIR x.xs` | landing with airTime > 0.8 | round(150·airTime) |
| `THE REVEAL` | landing after an inverted wall exit, on a surface other than wall or halfpipe | 2000 |
| `<label> · d.d m` | landing after a mass-driver exit inside a bullseye ring | 5000 / 2000 / 800 |
| `PIPE AIR x.x m` | landing after a halfpipe exit with pipeAir ≥ 5 | round(120·pipeAir) |
| `LINEUP CLEARED` | landing with at least 5 vehicle boxes overflown in this jump | 1500 |
| `ROOFTOP` | landing surface is `semi` | 1200 |
| `CLEAN LANDING` / `HEAVY LANDING` | clean landing (tilt > 0.82, ≈ 35°) with airTime > 1; heavy if impact > 12 m/s | 300 / 100 |
| `DRIFT` (banked) | drift ends after more than 1.2 s | round(driftScore), added directly with no multiplier |
| Mission completion | first time each mission is done | +2500, straight to the score |

**Per-frame handling, `Ui.update(realDt, scaledDt, car, input, camera)`.** Speed n = car.speed (3D) and mph = n·2.236936.

- **`launch`:** audio `launchPop`, shake 0.25.
- **`airborne`:** start a jump record `{over: Set, semiRoll, …}`.
- **`rampEnter`:**
  - `wall`: start the ramp cut and reset the wall-ride flag.
  - `loop`: start the side cut (12, 26, 8).
- **`rampExit`:** start a jump `{fromRamp: true, inverted: inverted && surface == 'wall', surface, pipeAir: 0}`, plus the exit callouts above.
- **`rampDone`** (loop): `endCut(0.8)`, then the loop check.
- **`rampFall`:** jump = `{fromRamp: true}`, `endCut(1.6)`.
- **`trick`:** callouts as in the table.
  - A roll count of 2 or more completes `double` immediately.
  - A roll while over the Semi now, or with `rollOverSemi` set, sets `semiRoll`.
- **`land`, in this order:**
  1. Ignore hops with airTime < 0.35 that did not start from a ramp. The jump is cleared and nothing is banked; pending is kept.
  2. Audio `hardLand` (impact > 12) or `land`, at level min(1, impact/14). Shake min(0.9, 0.05·impact).
  3. AIR bonus; `hang` mission if airTime ≥ 6.
  4. THE REVEAL.
  5. Bullseye score (after a mass-driver exit). A miss toasts "MISSED THE TARGET / `N` m off — try lift and thrust".
  6. PIPE AIR / `pipe`.
  7. LINEUP CLEARED / `lineup`.
  8. `semiflip` if semiRoll.
  9. ROOFTOP / `roof`.
  10. CLEAN or HEAVY LANDING.
  11. `bank(clean ? 'LANDED' : 'SKETCHY')`, jump = null, `endCut(0.9)`.
- **`crash`:** audio `crash` at min(1, (impact or 8)/14), shake 1, `lose()`, flash "CRASH / RCS recovery…", jump = null, `endCut(1.4)`.
- **`scrape`:** audio `scrape`.
- **`collide`** above 3 m/s: audio `crash` if above 10 m/s, else `scrape`, at min(1, speed/16). Shake min(0.6, 0.04·speed).
- **`recover`:** audio `launchPop` at 0.5.
- **Wall ride:** checked continuously in ramp mode.
- **Pipe air:** while airborne after a halfpipe exit, pipeAir = max(pipeAir, pos.y − 9.1).
- **Lineup flyover** (airborne with a jump active):
  - Each vehicle box (not `platform`) counts once when pos.x is within [min − 0.3, max + 0.3], pos.z within [min − 0.5, max + 0.5], and pos.y > top − 0.2. There is no upper height limit.
  - The first box overflown triggers the lineup cut (dir = sign(vel.x)) and slow-mo 1.4 s at 0.38.
  - Inside the `semi` box: overSemiNow = true, and |angVel.z| > 3 sets `rollOverSemi`.
- **0–60 timer** (ground only):
  - Starts when the previous frame's speed was < 0.3 and throttle > 0.5 or boost is held. It accumulates scaled dt.
  - It aborts if the input is released, the car leaves the ground, or 5 s pass.
  - At 60 mph or more it toasts "0–60 MPH / x.xx s" (good style if under 1 s) and completes `launch` if under 1.0 s.
  - It resets when speed < 0.3 with throttle < 0.5 and no boost.
  - It counts its first frame twice.
- **Top speed:** mph ≥ 230 in any mode completes `vmax`.
- **Drift** (ground, slip > 3.2, speed > 6): drift time += dt and driftScore += 6·speed·dt (6 points per metre). The HUD meter updates. 4 s completes `smoke`. When the drift ends after more than 1.2 s, the score is banked as DRIFT, even if the drift ended in a crash.
- **Telemetry to the HUD** every frame: {mph, gas/100, mode, boost, lift, alt = pos.y in air, air = airTime, pending, mult, launchT}.

### 2.6 Missions [`fe`] and ring course

**Mission rules.**

- `complete(id)` runs at most once per mission, ever. It persists `rdstr.done`, re-renders the list, toasts "MISSION COMPLETE / <name>" (good style), plays `missionComplete` and adds +2500.
- When all 14 are done, "ALL MISSIONS / You are a Roadster pilot." follows 2500 ms later.

| # | id | Name | HUD description | Completes when |
|---|---|---|---|---|
| 1 | `launch` | LAUNCH | 0–60 mph in under 1.0 s — hold Shift + W from a standstill | ground 0–60 timer finishes under 1.0 s |
| 2 | `wall` | WALL RIDE | Drive up the reveal wall past vertical | on the wall with rampMaxTheta > π/2 + 0.05 |
| 3 | `reveal` | THE REVEAL | Leave the wall upside down and land it clean | any non-crash landing after an inverted wall launch exit, on a surface other than wall or halfpipe (no tilt check in code) |
| 4 | `lineup` | CLEAR THE LINEUP | Fly over all five vehicles in one jump | landing with all 5 vehicle boxes overflown in the same jump |
| 5 | `semiflip` | KICKFLIP THE SEMI | Complete a barrel roll right above the Semi | landing after a roll callout made over the Semi box (or with roll rate > 3 rad/s inside it) |
| 6 | `double` | DOUBLE KICKFLIP | Two barrel rolls in a single jump | the 2nd roll callout, immediately and mid-air (a later crash does not undo it) |
| 7 | `hang` | HANG TIME | 6 seconds airborne | landing with airTime ≥ 6 s (a no-input mass-driver shot gives ≈ 8.4 s, derived) |
| 8 | `vmax` | 230 MPH | Hit top speed on the runway | 3D speed ≥ 230 mph anywhere (feasibility in §4) |
| 9 | `rings` | RING RUN | Fly through all 8 rings | 8th ring collected (ring progress persists across sessions) |
| 10 | `smoke` | SMOKE SHOW | Hold a drift for 4 seconds (Q) | continuous drift time ≥ 4 s |
| 11 | `roof` | ROOFTOP | Land on the roof of the Semi | landing surface is the `semi` box (top at y 4.22) |
| 12 | `pipe` | HALFPIPE HERO | Launch 5 m above the halfpipe coping and land back in | landing after a halfpipe exit with pipeAir ≥ 5 (no check that the car lands in the pipe) |
| 13 | `loop` | LOOP THE LOOP | Drive the full 360° loop — the fans hold you upside down | loop finished with rampMaxTheta > 2π − 0.6 |
| 14 | `bullseye` | BULLSEYE | Get fired by the Mass Driver and land in the gold centre ring | landing after a mass-driver exit within 6 m (horizontal) of (713, −300) |

**Ring course [`Ui.buildRings`].**

- **Mesh:** each ring is a TorusGeometry(5.5, 0.22, 12, 72) at (x, y, z) with rotation.y = yaw. Its normal is (0, 0, 1) rotated by that yaw. Rings spin visually: rotation.z += 0.4·realDt.
- **Detection:** a ring is collected once ever when side = sign((pos − centre)·normal) flips from the previous frame while pos is within 6.0 m (5.5 + 0.5) of the centre.
- **On collection:** persist `rdstr.rings`, swap to the "got" material, play audio `ring`, and call trick `RING n/8` (+500).
- **Materials:** uncollected = colour 0x001018, emissive 0x5AD8FF ×5, roughness 0.3. Collected = colour 0x050505, emissive 0x30FF9A ×1.2, transparent at opacity 0.35.

| Ring | x | y | z | yaw (rad) |
|---|---|---|---|---|
| 1 | 30 | 14 | −30 | 0.3 |
| 2 | 70 | 22 | −90 | 1.0 |
| 3 | 10 | 30 | −200 | 1.6 |
| 4 | −70 | 20 | −180 | 2.4 |
| 5 | −120 | 12 | −90 | 3.0 |
| 6 | −90 | 26 | 40 | 3.8 |
| 7 | 0 | 38 | 70 | 4.7 |
| 8 | 80 | 16 | 60 | 5.6 |

### 2.7 World layout

#### 2.7.1 Global

- **Night test site.** Ground plane 5000 × 5000. Sky dome of radius 3000 that follows the car's XZ. FogExp2 colour 0x070B10, density 0.0028. Soft boundary circle of radius 1600.
- **Anchors `G`** (§2.7.2 has the details):

  | Anchor | Position | Notes |
  |---|---|---|
  | spawn | (0, 0, 30) | heading π |
  | ramp | (0, 0, −150) | heading −Z |
  | lineup | (110, 0, −40) | |
  | runwayZ | 140 | |
  | donut | (−110, 0, −40) | |
  | halfpipe | (−230, 0, −170) | along +X, length 64 |
  | loop | (−275, 0, −60) | heading +Z |
  | massdriver | (230, 0, −300) | heading +X |
  | bullseye | (713, 0, −300) | |

  The wall, loop and mass driver are placed with y set to 0.04, and that call mutates the anchor vectors.

| Zone | Teleport (position, heading) | Footprint (world) | Gameplay |
|---|---|---|---|
| Spawn / start | `spawn` (0,0,30), π | — | Play actually starts at (0,0,−112) facing −Z |
| Reveal wall | `ramp` (0,0,−40), π | lane x ±3.6 from z −150 to −165.5; tower to z −169.1; lip ≈ 23.4 m high | WALL RIDE, INVERTED EXIT, THE REVEAL |
| Lineup stage | `lineup` (0,0,−40), π/2 (same point as `ramp`, facing +X) | platform x 101.86–118.18, z −43.83 to −36.20 | CLEAR THE LINEUP, KICKFLIP THE SEMI, ROOFTOP |
| Runway | `runway` (−1100,0,140), π/2 | x −1200 to 1200, z 112–168 | intended for 230 MPH |
| Donut pad | `donut` (−110,0,−22), π/2 | painted rings r 10 and 24, LED ring r 25 | decorative; drifting scores anywhere |
| Halfpipe | `halfpipe` (−170,0,−170), −π/2 | x −262 to −198, z −153.0 to −187.0 | VERT AIR, HALFPIPE HERO |
| Loop | `loop` (−275,0,−130), 0 | entry lane x −278.2 to −271.8 at z −60, exit lane shifted 8 m to −X, out by z ≈ −40 | LOOP THE LOOP |
| Mass driver | `massdriver` (140,0,−300), π/2 | x 230 to 288.9, z −303.1 to −296.9, lip y ≈ 29 | MASS DRIVER LAUNCH, HANG TIME |
| Bullseye | — | rings r 6, 14 and 26 at (713, −300) | BULLSEYE |

**Teleport behaviour.**

- Teleporting resets the car at the point and cancels any camera cut.
- The camera is placed at pos + (−8·sin h, 3, −8·cos h), with its chase direction set to (sin h, 0, cos h).
- All 4 skid trails break and a "TELEPORT / <NAME>" toast shows (not with `?cine`).
- `T` cycles: spawn, ramp, lineup, runway, donut, halfpipe, loop, massdriver.
- Pause-menu labels: Start, Wall, Lineup, Runway, Donut, Halfpipe, Loop, Mass Driver.
- **Reset in place** (`R` / RESET): reset at the current XZ with y = 0 and heading atan2(fwd.x, fwd.z); skid trails break. On raised structures this can drop the car inside geometry.

#### 2.7.2 Zones

**Spawn and the approach to the wall**

- A floodlight at (40, 60) lights the spawn, aimed at (0, 0, 20).
- Painted ramp centreline 0.18 × 160 centred at (0, −70), covering z +10 to −150.
- Red LED strips 120 m long at x = ±7.5, centred on z −85 (z −25 to −145).
- Crowd barriers along x = ±14 from z −20 to −140, with a gap at z −48 to −32.

**Reveal wall** (ramp physics in §2.2):

- **Deck mesh:** 176 × 12 grid on a 0.2 m step; per-vertex normals from the profile; UV = (lateral fraction, s/L).
  - Material: MeshStandard colour 0xcfcfcb with `Os` map, roughness and bump (bumpScale 1.2), roughness 1, metalness 0, DoubleSide. Casts and receives shadows.
  - Deck thickness 0.55. Underside 0x3b3d40 (roughness 0.8, metalness 0.4); side faces 0x9a9a96.
- **Edges:**
  - Red LED tubes (0x220000, emissive 0xFF1428 ×6) of radius 0.035, at lateral ±(half − 0.07), raised 0.03 along the normal, 141 control points.
  - Metal rails of radius 0.05 at ±(half + 0.02), raised 0.05 (0x2a2b2e, metalness 0.8, roughness 0.35).
- **Support tower:** an InstancedMesh of 8-sided unit cylinders (0x8b8f95, metalness 0.9, roughness 0.35).
  - Footprint: forward 15.91 to 19.11 (z −165.91 to −169.11), lateral ±4.2, height 24.52.
  - Members: corner posts (r 0.09); rings every 1.6 m (17 levels, r 0.06); X-diagonals (r 0.04); a top gantry out to forward ≈ 10.85, over the lip (r 0.08, with a diagonal of r 0.05); under-deck braces every 2.4 m from s = 6 at lateral ±(half − 0.4), running from 0.55 m under the deck to the tower face (r 0.05).
  - Collider `tower`: the footprint padded by 0.3 (lateral ±4.4), height 0 to 24.52.
- **Beacon:** Sphere(0.18) emissive 0xFF2020 on top of the tower (y ≈ 24.86), pulsing 0.5 + 9·max(0, sin(2.4t + 1))³.
- **Dressing:**
  - Pad 10.2 × 0.04 × 6 (0x8d8c88) centred at z −147.
  - Two floodlight housings at (±4.8, 0.18, −151.5): box 0.5 × 0.35 × 0.5, with an emissive lens Circle(0.16) 0xBFE0FF ×6. Each has a SpotLight (§2.8.3) at y 0.5, aimed at `wall.point(22, 0)`.
- **Ramp cut camera:** (34, 7, −152).

**Lineup stage** [`qi`] at (110, 0, −40). Vehicles face +Z with their fronts aligned at local z = 3.35 (world z −36.65).

| Box (`name`) | World min | World max |
|---|---|---|
| `model3` | (102.562, 0.12, −41.378) | (104.631, 1.56, −36.65) |
| `modelY` | (105.531, 0.12, −41.452) | (107.68, 1.735, −36.65) |
| `semi` | (108.58, 0.12, −43.375) | (111.42, 4.22, −36.65) |
| `cybertruck` | (112.32, 0.12, −42.371) | (114.635, 1.92, −36.65) |
| `cybercab` | (115.535, 0.12, −40.962) | (117.484, 1.56, −36.65) |
| `platform` | (101.862, 0, −43.825) | (118.184, 0.12, −36.2) |

- Every box is a drivable surface. The vehicle boxes (not the platform) are also colliders.
- Local car centres on x: −6.403, −3.394, 0, 3.477, 6.509. Gap between neighbouring bounding boxes 0.9; platform margins 0.7 on the sides and 0.45 front/back.
- **Approach lane:** red LED strips 75 m long centred on x 57 at z −47 and −33 (x 19.5 to 94.5); a painted line 220 m long at z −28 (centred x 80).
- **Fence:** barriers at z −14 from x 10 to 200, with a gap at x 85 to 135.
- **Power line:** 5 wooden poles at x = 20, 70, 120, 170, 220, z −58.
  - Pole: Cylinder(0.16, 0.22, 13), colour 0x2A2018; crossarm 0.15 × 0.15 × 3.2 at y 12.2; collider 0.6 × 0.6 × 13.
  - 3 wires (1 px Lines) at z offsets −1.4, 0, +1.4 from y 12.3, 20 segments per span, sagging 1.2·sin(πt).
- **Lineup cut camera:** (110 − 6·dir, 1.4, −6).

**Runway**

- Runs along X from x −1200 to 1200.
- Markings: centreline dashes 14 × 0.4 every 30 m (from x −1200 to 1170, at z 140); edge lines 2400 × 0.35 at z 112 and 168.
- Red LED strips 2400 m long at z 110 and 170.
- Threshold "piano keys" at x = ±1160: 21 bars 30 × 1.6 at z = 140 + 2.5v for v = −10..10.

**Donut pad** at (−110, 0, −40)

- Painted rings r 23.6–24.0 and 9.8–10.1 at y 0.007.
- Red LED torus of radius 25 (tube 0.07) at y 0.05.

**Halfpipe** (pipe axis along X, x −262 to −198)

- **Deck surface:** 120 × 24 grid; `Os(L, 64)` maps with RepeatWrapping and repeat (5, 1); colour 0xc9c8c3, bumpScale 1, DoubleSide. Underside offset −0.6 (0x5d5c59).
- **End walls:** ShapeGeometry cross-sections at x = ±32 tracing the solid fill under the profile, from (−3.5, 0) to (30.5, 9.1) (0x8e8d89).
- **Deck platforms:** two Box(3.5, 9.1, 64) at z −154.75 and −185.25 (0x6d6c69). They are drivable surfaces named `deck` and also colliders.
- **Coping:** Cylinder(0.09, 64) at both lips (0xc7ccd2, metalness 1).
- **Trim:** red lip LED boxes 0.06 × 0.06 × 64 (emissive 0xFF1830 ×5) at s = 0.25 and L − 0.25; a cyan centre line 0.2 × 0.02 × 64 (0x5AD8FF ×3) along the flat bottom.
- **Coping height for pipe air:** 9.1.

**Loop**

- **Track:** 360 × 8 segments; UV repeats every 6 m along s. MeshPhysical colour 0xe6e4df, map `mi()` (a 256² stripe texture: white, with 3 px #d9d7d2 lines every 64 px and an 8 px red #ff2a3c stripe at x 124–132 over the top half), roughness 0.38, clearcoat 0.6 / 0.2, FrontSide.
- **Underside and skirts:** offset −0.45 (0x14161a). Edge LED tubes of radius 0.04 (emissive 0xFF1830 ×4).
- **Axle:** at the middle of the arc (s 36.85). The hub centre is 9.5 m off the track along its normal at the top of the loop.
  - Hubs: Cylinder(0.9, 0.8) at ±9.4 m laterally from the mid-lane (x ≈ −269.6 and −288.4), each with an emissive torus ring (0.95, 0.12, ×5).
  - 16 spokes per side (r 0.07) to the track underside.
  - A-frame legs (r 0.22) to the ground at f ±7, r ±3 outboard.
  - Support material 0x9aa1a8.
- **Colliders:** each hub has a `structure` footprint 15 × 2 (height = hub y + 1); gate posts are 0.6 × 0.6 × 6.5.
- **Entry gate** at s = 1.5: crossbeam 9.4 × 0.5 × 0.5 at y 6.5; posts 0.4 × 6.5 × 0.4 at lateral ±4.5; neon sign "LOOP" (#ff2a3c) at y 7.6, rotated π.
- **Side cut camera:** ≈ (−245.8, 8, −48).

**Mass driver**

- **Deck:** 160 × 6 segments, no UVs, MeshPhysical 0x1b1e23 (metalness 0.85, roughness 0.3, clearcoat 0.5).
- **Chase-light rails:** two ribbons per side at lateral ±(half − 0.1) to ±(half − 0.32), raised 0.03 along the normal, with a per-vertex attribute aS = s. Shader: speed = mix(8, 60, uCharge); w = fract(0.12·vS − 0.12·uTime·speed); pulse = smoothstep(0.75, 1, w); colour = (0.1, 0.55, 1.0)·(0.6 + 5.5·pulse·(0.4 + uCharge)). Pulses repeat every 8.33 m. The shader has no fog or tonemapping includes.
- **Coils:** 11 tori TorusGeometry(4.6, 0.28, 12, 64) every 5.2 m from s = 8 to 60. Each is centred 1.2 m above the deck with its axis along the tangent, so the car drives through it. Each has its own material: 0x001018, emissive 0x3FC8FF, base intensity 1.2, animated per §2.2.6.
- **Supports:** where the underside is above y 0.6, two legs (r 0.18) at ±(half − 0.6) plus a brace (r 0.08) at height max(0.5, y/2). Material 0x8e959c.
- **Under-ramp colliders:** at s = 20, 28, …, 60. Each is an 8.5 × 6.8 footprint with height max(1, y − 0.2), flat-topped, so it pokes through the incline.
- **Entry gate** at s = 2: neon sign "MASS DRIVER" (#3fc8ff) at y 6.8, rotated π; posts at ±(half + 1.2) with 0.6 × 0.6 × 6.5 colliders; crossbeam (width + 3) × 0.5 × 0.5 at y 6.5.
- **Distance:** the lip is ≈ 424 m short of the bullseye, which is 483 m from the mass driver's origin.

**Bullseye** [`pi`] at (713, 0, −300)

- **Rings:** three RingGeometry(r − 0.45, r, 128), additive, no depthWrite, polygonOffset −6, at y 0.04. Opacity = 0.75 + 0.25·sin(2.2t + index).

  | Ring | Radius | Points | Label | HDR colour |
  |---|---|---|---|---|
  | 1 | 6 | 5000 | BULLSEYE | (3.2, 2.2, 0.6) |
  | 2 | 14 | 2000 | INNER RING | (0.5, 2, 3.2) |
  | 3 | 26 | 800 | OUTER RING | (2.6, 0.25, 0.35) |

- **Centre disc:** Circle(6) colour (0.9, 0.6, 0.15), opacity 0.18, additive, y 0.03.
- **Marker beam:** open cylinder (radius 1.2 at the top, 2.4 at the bottom, height 160) spanning y 0..160. Additive shader: alpha = rim²·(1 − vY)·(0.55 + 0.45·sin(2t − 20·vY)), colour (1, 0.75, 0.3)·0.9.
- **Sign:** "BULLSEYE" (#ffc04a) at (713, 9, −330).
- **`score(pos)`:** horizontal distance d to the centre; returns the first ring with d ≤ r, else {MISSED, 0}. There is no height or trajectory check.

#### 2.7.3 Background set dressing

Material 0x0C0F13 (roughness 0.9, metalness 0.2) unless stated.

| Item | Placement and size | Colliders |
|---|---|---|
| Industrial tower group at (−520, 0, −1100) | Shaft 14 × 145 × 14. Arms 3 × 3 × 34 at local (±9, 110, 16), rotated y ±0.25. Silo r 4.5, h 70 (0x404650, metalness 0.9) at local (−22, 55, 0). Box 20³ at local (−22, 10, 0). Blinkers at (−520, 147, −1100) and (−542, 92, −1100). | `tower`: x −527..−513, y 0..145, z −1107..−1093; x −552..−532, y 0..90, z −1110..−1090; x −512..−480, y 105..113, z −1104..−1074 (does not match the arms) |
| 6 storage tanks | Cylinder r 5, heights 26 / 34 / 42 repeating, at x = −380 + 13g (g = 0..5), z −980 | `tank`, 10 × 10, full height |
| 4 hangars | Box 60 × 22 × 40 at (380, 11, −640), (455, 11, −660), (530, 11, −680), (605, 11, −700). Warm door strip 48 × 2.4 (0xFFD9A0, opacity 0.55, no fog) at y 15 on the +Z face. Roof blinker at y 23. | `hangar` collider, and the roof is a drivable surface |
| Radio/water tower at (700, 0, 300) | Column Cylinder(1.2, 2.2, 30) at y 15; sphere r 8 at y 34; blinker at (700, 43, 300) | x 697.5..702.5, y 0..26; x and z 692..708, y 26..42 |
| Aircraft-warning blinkers | Sphere(1.4), MeshBasic 0xFF2A2A, no fog, one material each | — |

#### 2.7.4 Floodlights (14 poles [`Mi`]; * = casts shadows)

| # | Pole (x, z) | Target | # | Pole (x, z) | Target |
|---|---|---|---|---|---|
| 0* | (−34, −120) | (0, 8, −150) | 7 | (−300, 100) | (−300, 0, 140) |
| 1* | (36, −112) | (0, 14, −158) | 8 | (300, 100) | (300, 0, 140) |
| 2* | (−30, −40) | (0, 0, −100) | 9* | (−250, −205) | (−250, 3, −170) |
| 3* | (70, −10) | (110, 2, −40) | 10 | (−190, −135) | (−210, 3, −170) |
| 4* | (150, −12) | (110, 4, −40) | 11 | (−250, −20) | (−272, 8, −40) |
| 5 | (−80, −10) | (−110, 0, −40) | 12 | (255, −330) | (262, 12, −300) |
| 6 | (40, 60) | (0, 0, 20) | 13 | (690, −340) | (700, 0, −300) |

Each pole has a `pole` collider 1.4 × 1.4 × 30. The poles are 22 m tall; the build is in §2.8.3.

#### 2.7.5 Collision and surface sets

- **Colliders:** world colliders (barriers padded 0.3 to height 1.15, floodlight and power poles, towers, tanks, hangars, radio tower), the wall tower box, the halfpipe deck boxes, the loop structures, the mass driver structures, and the lineup vehicle boxes.
  - Barrier colliders: x = ±14 over z −141.5..−48.6 and −31.4..−18.7; z = −14 over x 8.8..85.2 and 134.8..201.
  - `Be()` turns an oriented footprint into a world AABB. That is only exact for axis-aligned headings, which all current instances are.
- **Drivable surfaces:** all lineup boxes, the halfpipe decks and the hangar roofs.

### 2.8 Camera and slow-mo

#### 2.8.1 Camera director [`Ni`]

- **Modes and switching.** Modes are `['chase', 'broadcast', 'drone', 'bumper']`. `cycle()` (C, gamepad Y, touch CAM) advances the mode and clears any cut. Keyboard and touch toast "CAMERA / <MODE>"; the gamepad does not.
- **Target and smoothing.** Target point r = car pos + car up·0.6. FOV always eases at rate 4.
- **Start positions.** The three.js camera object starts at (8, 3, 40) with FOV 62. The rig's internal state starts at (0, 4, 40).

| Mode | Placement | FOV | Smoothing |
|---|---|---|---|
| chase | **Direction:** flattened car forward on the ground, full forward on ramps, horizontal velocity in air or crashed (kept when speed < 2). Snaps if the dot with the desired direction is < −0.3, else lerps at rate 5.5 (2.2 in air). **Position:** r − dir·L + up·m, where L = 6.6 + min(4, 0.035v) (+2.5 in air) and m = 2 + min(1.2, 0.008v) (+1.6 in air). "Up" is world up, or car up on ramps. Camera y ≥ 0.6. **Look-at:** r + dir·(2.5 + 0.02v) + up·0.4. | 60 + min(20, 0.2v), +6 while boosting | position rate 9 (7 on ramps), look-at rate 14 |
| broadcast | Nearest of 12 fixed trackside cameras each frame, with no hysteresis | clamp(2·atan(7/dist), 8°, 55°), keeping about 14 m in frame | teleports when more than 30 m from the chosen camera, else rate 8; look-at rate 9 |
| drone | Orbit at radius 22, height 14, angle 0.18·t | 45 | position rate 3, look-at rate 8 |
| bumper | Rigid at pos + fwd·2.35 + up·0.45, looking at that point + fwd·10 + up·0.2; camera.up = car up (the view rolls) | 72 + min(16, 0.15v) | none |

Broadcast camera positions: (−30, 3, −120), (30, 9, −95), (110, 2.5, −8), (60, 1.6, −60), (−60, 6, 10), (−120, 3, 0), (0, 2, 90), (200, 4, 115), (−200, 4, 165), (500, 3, 110), (−500, 3, 170), (160, 14, −70).

**Auto cuts** (chase mode only; `autoCuts` defaults to on; menu toggle "Auto camera cuts")

| Cut | Trigger | Camera position |
|---|---|---|
| Ramp cut | `rampEnter` on the wall | wall origin + 2f + 34r at y 7 |
| Side cut | `rampEnter` on the loop | origin + 12f + r·(−(half + shiftTotal/2 + 26) + shiftTotal/2) at y 8 |
| Lineup cut | first lineup box overflown | centre + (−6·dir, 1.4, 34) |

- During a cut, the position lerps to the cut point (rate 6) and the look-at lerps to the car (rate 10). FOV = clamp(2·atan(9/dist), 14°, 60°).
- `endCut(delay = 0.6)` clears the cut after the delay. The game passes 0.8 (loop done), 1.6 (fall-off), 0.9 (landing) and 1.4 (crash).

**Ramp-surface avoidance** (every mode except bumper). When the target is within half + 2.5 laterally and −0.5..30 m off a ramp surface, the camera position is projected onto that ramp. If it lies within half + 1.5 and is less than 0.9 m off the surface (d > −10), it is pushed along the normal to d = 0.9.

**Shake.**

- `shake(a)`: amp = min(1.2, amp + a), decaying by e^(−4.5·dt).
- Offset added in world X/Y: x = (sin 47.3t + sin 31.1t)·0.5·p·0.18, y = (sin 53.7t + sin 23.9t)·0.5·p·0.18, where p = amp + rumble. `rumble` is never passed.
- Sources: launch 0.25, landing min(0.9, 0.05·impact), crash 1, collision min(0.6, 0.04·speed).

**Title orbit [`ua`].**

- Angle = `?ta`, or titleTime·(`?tspeed` or 0.07) + 0.6. Radius = `?td` or 8.6. Height = (`?th` or 1.5) + 0.3·sin(0.2t), absolute.
- Looks at car + (0, 1.25, 0) and forces FOV 30 every frame.
- Ambient haze puffs: spawn probability dt·6, within ±15 m X and −25..+5 m Z of the target; size 4, grow 1.5, life 9, alpha 0.03, drag 0.3, rise 0.05.

**Quirks.**

- The chase camera's reverse handling negates twice, so it has no effect.
- Shake is added in world X/Y, not in camera-local axes.
- The broadcast camera can flip back and forth between two cameras at a midpoint.

#### 2.8.2 Slow motion

- **Request.** `Ui.requestSlowmo(dur = 0.9, scale = 0.33)` only takes effect when "Auto slow-motion" is on (default checked) and the 3.5 s cooldown has passed. While active, `game.timeScale` = scale. The slow-mo timer and cooldown count down in real time.
- **Callers:** INVERTED EXIT (1.1 s at 0.3), MASS DRIVER LAUNCH (1.2 s at 0.35), first lineup flyover (1.4 s at 0.38).
- **What is scaled:** physics, VFX, world animation, the mass driver and bullseye animation, and gameTime. The 0–60 timer accumulates scaled dt.
- **What runs on real dt:** camera, HUD timers, ring spin and audio.
- **Audio during slow-mo** (§2.11):
  - pitch 0.45 + 0.55·ts (τ 0.12 s);
  - diegetic lowpass 550·32^clamp((ts − 0.2)/0.8, 0, 1) Hz, full band at ts ≥ 0.995;
  - reverb return 0.3 + 0.35·(1 − ts);
  - one-shots stretched by 1/sqrt(pitch).

### 2.9 Rendering and effects

#### 2.9.1 Renderer and post-processing

- **WebGLRenderer** on `canvas#gl`.
  - Options: antialias false, stencil false, depth false (depth comes from the composer targets), powerPreference "high-performance".
  - Pixel ratio = min(devicePixelRatio, cap). The cap is `?pr` if given, else 1.25 on touch or 1.5 on desktop.
  - Shadows: PCFSoftShadowMap. Renderer tone mapping: NoToneMapping (it is done in post). Output colour space sRGB.
- **EffectComposer** with HalfFloat frame buffers. Pass order:

| Pass | Settings |
|---|---|
| RenderPass | — |
| N8AO | aoRadius 1.6, distanceFalloff 1, intensity 2.2, halfRes true, gammaCorrection false. Library defaults otherwise: aoSamples 16, denoiseSamples 8, denoiseRadius 12 (6 px effective at half res), denoiseIterations 2, accumulate false, transparency auto-detect. Disabled on touch and at Medium quality. Wrapped in try/catch ("AO disabled"). |
| EffectPass 1 | Bloom (mipmapBlur, luminanceThreshold 0.92, luminanceSmoothing 0.25, intensity 1.25, radius 0.78) + ChromaticAberration (offset (0.0006, 0.0006), radialModulation, modulationOffset 0.35) |
| EffectPass 2 | ToneMapping ACES_FILMIC (AGX with `?tm=agx`) + Vignette (darkness 0.62, offset 0.28) + Noise (OVERLAY blend, premultiply false, opacity 0.06) + SMAA preset HIGH |

- **Quality select** `#opt-quality` (not persisted):
  - High (the default, listed first): DPR up to 1.5, AO on.
  - Ultra: DPR up to 2, AO on.
  - Medium: DPR 1, AO off.
  - On a phone, picking High or Ultra turns AO back on.
- **Resize:** the renderer and composer are resized and the camera aspect is updated.
- **N8AO internals**, for a faithful rebuild:
  - Hemisphere sampling on a golden-angle spiral, jittered by a 128² blue-noise texture offset per frame with the R2 sequence (1.618034, 1.324718).
  - Depth-reconstructed normals; Poisson bilateral denoise (2 iterations); half-res checkerboard min/max depth downsample; depth-aware 3×3 upsample.
  - Fog-aware compositing.
  - Transparency auto-detect turns transparency handling on permanently once any transparent material appears, which adds 2 extra scene renders per frame.

#### 2.9.2 Lighting

| Light | Settings |
|---|---|
| Moon (DirectionalLight) | 0x9FB8FF, intensity 0.55, positioned at target + (−60, 120, 40). The target follows the car, snapped to light-space texels of 80/2048 m. Shadow map 2048 (1024 on touch), ortho ±40, near 1, far 400, bias −0.0004, normalBias 0.03. |
| Hemisphere | sky 0x23324A, ground 0x0A0806, intensity 0.18 |
| Environment | PMREM from the studio scene `Si`, sigma 0.02; `environmentIntensity` 0.9 |
| 14 floodlights (SpotLight) | 0xDFF0FF, intensity 9000, distance 220, angle 0.42, penumbra 0.55, decay 2. Indices 0–4 and 9 cast 1024² shadows (bias −0.0003, near 2, far 220); no spotlight casts shadows on touch. |
| 2 wall floodlights (SpotLight) | 0xCFE6FF, 2600, distance 60, angle 0.5, penumbra 0.6, decay 2 |
| Car headlights, 2 SpotLights | 0xEAF2FF, 1800, distance 140, angle 0.42, penumbra 0.5, decay 2, at body (±0.7, 0.62, 2.1), aimed at (±0.9, 0, 20) |
| Car tail light (PointLight) | 0xFF1A2A, 1.5 (5 when braking), distance 5, decay 2, at body (0, 0.5, −3.2) |
| Car lift glow (PointLight) | 0xBFE0FF, eases 0 → 260 while lifting (rate min(1, 12·dt)), distance 18, decay 2, at body (0, −0.4, 0) |

#### 2.9.3 Environment and world shaders

- **Studio env map `Si`:**
  - BackSide sphere r 50 with a gradient (0.015, 0.014, 0.013) → (0.03, 0.04, 0.06) → (0.008, 0.012, 0.025).
  - 7 softboxes 4 × 2.4, HDR (6, 6.5, 7), on a 40 m ring at heights 14 + (i mod 3)·3, starting at angle 0.3, facing the origin.
  - Overhead strip 60 × 3 at y 40, colour (2.5, 3, 3.6).
  - Two red floor strips 90 × 0.6 at z ±12, y −1.2, colour (4, 0.15, 0.2).
- **Sky dome `wi`:** SphereGeometry(3000, 48, 24), BackSide, no depthWrite, no fog, renderOrder −10.
  - Gradient by view direction y: horizon (0.06, 0.07, 0.085) → mid (0.020, 0.032, 0.050) via smoothstep(−0.02, 0.12) → top (0.006, 0.010, 0.022) via smoothstep(0.12, 0.7).
  - City glow: e^(−14|y|)·(0.5 + 0.5·max(0, dir.xz·normalize(0.6, −0.8)))·(0.10, 0.055, 0.03).
  - Stars: a cell grid over dir·520; a cell has a star if its hash > 0.9965. Stars are jittered, sized smoothstep(0.22, 0), masked above the horizon with smoothstep(0.04, 0.3), at brightness 0.9·(0.55 + 0.45·sin(hash·900)), colour (0.9, 0.95, 1.0). The `uTime` uniform exists but is unused, so there is no twinkle.
- **Ground `vi`:** 5000² plane with three 512² canvases made with seeded RNG `Us(42)`, repeated 600× (a tile ≈ 8.33 m), anisotropy 16.
  - Albedo: #2b2c2e + 60,000 grey speckles (value 25–75, α 0.35–0.85, 1–2 px) + 400 flecks (70–120, α 0.5).
  - Roughness: #c8c8c8 + 30,000 speckles of 2 px (150–255, α 0.5).
  - Bump: #808080 + 40,000 specks of 1–2 px (α 0.35).
  - Material: MeshStandard 0xB8B8B8, roughness 1, bumpScale 0.3, envMapIntensity 0.55, receives shadows.
  - `onBeforeCompile` adds a world-space 5-octave fbm: diffuse ×mix(0.78, 1.18, fbm(xz·0.018)); 12 m slab joints (step(0.985, fract(x/12)), same for z) darken by 35%; wet patches smoothstep(0.52, 0.66, fbm(xz·0.035 + 7.3)) pull roughness toward 0.24 with weight 0.8.
- **Concrete `Os`** (wall and halfpipe), using three 512 × 2048 canvases and PRNG `Us(7)` (mulberry32-style):
  - Bases: colour #a9a8a3, roughness #d8d8d8, bump #808080.
  - 26,000 speckles (1–7 px, L 140–190, α 0.08–0.2), mirrored into the bump map at 0.6× size.
  - 180 blotches of radius 20–110.
  - Expansion joints every 3.2 m starting at 3 m, cut into colour and bump.
  - Tyre-wear lanes at u 0.33 and 0.67 (darker colour, smoother roughness).
  - A painted line #efefe9, 7 px wide at u 0.47 (≈ 0.17 m off centre).
  - sRGB colour map, anisotropy 8.
- **Markings:** MeshStandard 0xDEDCD2, roughness 0.65, polygonOffset −4, at y 0.006.
- **LED strips:**
  - Box (length × 0.04 × 0.1) at y 0.02 using `ledMat` (0x200000, emissive 0xFF1830 ×2.2).
  - Plus a 0.9 m-wide additive glow plane at y 0.045, using a 64 × 4 gradient texture, colour (2.6, 0.18, 0.28), polygonOffset −8, renderOrder 2.
- **Blinkers:** pulse h = max(0, sin 2.4t)³; colour = (0.15 + 2.4h, 0.02 + 0.3h, 0.02 + 0.3h).
- **Crowd barriers `xi`:** an InstancedMesh of merged tubes in 2.4 m sections, metal 0x9AA0A6 (metalness 0.85, roughness 0.4), placed every 2.6 m.
  - Posts at x ±1.2 from y 0.15 to 1.1; top rail at 1.1 and bottom rail at 0.2 (tube r 0.025).
  - Vertical bars every 0.2 m (r 0.01).
  - Splayed feet to (±1.45, 0) (r 0.02).
- **Floodlight `Mi`:**
  - Pole: Cylinder(0.22, 0.4, 22), 0x55595F, casts shadows.
  - Head at y 22.8: box 3.6 × 2.4 × 0.3 with a 4 × 3 grid of Circle(0.32) LEDs (emissive 0xE8F4FF ×6), turned to look at the target.
  - Glow sprite: 128 px radial gradient, additive, colour (1.6, 1.8, 2), scale 9.
  - Fake volumetric beam: an open cone of length min(110, 1.3·distance), radius 0.9 at the top and tan(0.42)·length at the bottom, using shader `Zs`.
- **Beam shader `Zs`:** additive, DoubleSide, no depthWrite, no fog. alpha = rim^1.6·vT^1.8·dust·0.035, where dust = 0.65 + 0.7·noise3(worldPos·0.12 + (0, −0.4t, 0.2t)). Colour 0xBFE6FF. `uTime` is set every frame.
- **Neon signs `gs`:**
  - Canvas 1024 × 160, font `italic 400 104px Michroma, "Arial Black", sans-serif`. A glow pass (fill in the sign colour with shadowBlur 28), then a white pass at α 0.85.
  - PlaneGeometry 9 × 1.4, MeshBasic colour (1.8, 1.8, 1.8), transparent, no depthWrite, DoubleSide.
  - Fixed orientation, so the text reads mirrored from behind.
- **Light estimate for smoke `ha(p)`:** starts at ambient 0.16. For each spotlight with cos(angle to its axis) > cos(cone), add k·2.6·min(1, (cos − cosCone)/0.08)/(1 + d²/4000), where k = intensity/9000. Capped at 1.6.

#### 2.9.4 VFX systems (fx chunk)

| System | Implementation | Key numbers |
|---|---|---|
| Smoke/dust `ux` | **Draw:** one InstancedBufferGeometry of view-space billboards; per-instance iPos, iData (size, alpha, rotation) and iCol. **Texture:** procedural 128² puff, alpha = max(0, 1 − 2r)^1.5·(0.45 + 0.9·fbm), where fbm is 5 octaves at base frequency 4. **Shader:** its own exp2 fog (#070B10, 0.0028); discards below α 0.003. **Update:** vel *= e^(−drag·dt); vel.y += rise·dt; floor at y 0.2 with bounce 0.2; size += grow·dt·(1 − 0.6·age/life); render alpha = alpha·min(1, age/0.12)·(1 − age/life)²; colour × optional `lightFn(pos)`. | max 2600 (when full, the oldest is shifted out); spawn defaults: size 1, grow 2, life 3, alpha 0.35, colour (0.75, 0.78, 0.82), drag 1.2, rise 0.6, spin ±0.3 rad/s; renderOrder 5 |
| Thruster plumes `hx` | One open cone per mount: Cylinder(0.05 → 0.42, height 1, 18 segments), translated to hang from the nozzle and oriented from −Y to the exhaust direction. Child of `car.body`. Additive shader: along = 1 − vUv.y; rim = abs(N·V)^1.2; turbulence = 0.6·noise(x·8, along·6 − 14t) + 0.4·noise(x·19, along·13 − 23t); alpha = rim·smoothstep(1, 0, along)·(0.45 + 0.9·turb)·smoothstep(0, 0.06, along); colour white → (0.55, 0.75, 1.0), ×1.4. | Level eases up at min(1, 30·dt) and down at min(1, 10·dt); visible above 0.02. Scale (0.6 + 0.6L, len·L·rand(0.9–1.1), 0.6 + 0.6L), len = 2.6 lift, 2.0 rear, 1.3 side/top. renderOrder 6 |
| Skid marks `fx` | Ring buffer of quads, colour 0.02 grey with α·0.55, polygonOffsetFactor −6. `mark(key, pos, side, alpha, y = 0.012)`: a jump of more than 3 m breaks the trail; moves under 0.15 m emit nothing; otherwise emit a quad from the previous p ± prevSide·0.14 to p ± side·0.14 (0.28 m wide), at y + pos.y when pos.y > 0.05. `break(key)` ends a trail. | max 1600 quads; marks never fade |
| Sparks `dx` | Additive LineSegments with vertex colours. `burst(pos, dir?, count = 40, speed = 12)`: direction normalize(rand − 0.5, 0.2 + 0.8·rand, rand − 0.5)·speed·(0.3–1.3), plus dir·speed·0.4; life 0.4–1.0 s. **Update:** gravity 9.81; at ground y 0.02, vy *= −0.4 and vx, vz *= 0.7; streak from pos to pos − vel·0.03; head colour (3a, 1.6a², 0.5a³) with a = 1 − age/life; tail ×0.3. | max 400 |

#### 2.9.5 Car visual sync and emitters [`da`]

- **Pose.** The car root copies the physics position and quaternion. Body y = 0.9·susp; body rotation = (bodyPitch, 0, bodyRoll).
- **Wheels.** spin.rotation.x = wheelSpin; the front pivots yaw by 0.45·steer; pivot y = 0.325 + (−0.06 in air or crashed, else 0.4·susp).
- **Brake lights** (brake > 0, ground mode, forward speed > 1): the tail material's emissive goes to 9 (otherwise 1.2) and the tail PointLight to 5 (otherwise 1.5). Which material this is, is ambiguous; see §4.
- **Rear wing** deploys when speed > 30, in air, crashed or ramp mode, or while boost is held. Its y eases toward `upY` or `stowY` at min(1, 5·dt), and it is hidden within 0.02 of `stowY`.
- **Plumes and glows:** per §2.3.

| Emitter | Spawn probability per frame | Spawn parameters |
|---|---|---|
| Tyre smoke (each rear wheel) when slip > 3 or burnout > 0.2 | dt·60·d, where d = 1 for a burnout, else min(1, (slip − 3)/6) | position at the wheel, y 0.35 (absolute world height); vel = 0.25·carVel + (±1, 1.2, ±1); size 1.2, grow 3, life 4, alpha 0.18d + 0.05, rise 0.35, drag 0.9 |
| Skid marks (rear wheels, same condition) | every frame | `mark(wheel, pos at carY + 0.012, left vector, min(1, d + 0.3))`; trails break otherwise. All 4 break outside ground mode. |
| Lift exhaust (each lift nozzle) when lifting, or crashed with RCS | dt·45 | position = nozzle + 1.2·dir; vel = 14·dir + 0.5·carVel; size 0.5, grow 2.4, life 1.6, alpha 0.22, drag 2.6, rise 0.4, colour (0.8, 0.86, 0.95) |
| Lift ground dust, height h < 9 above the surface, nozzle pointing down (dir.y < −0.3) | dt·70·(1 − h/9) | at the ray–ground hit, y = ground + 0.3; radial speed 8–18, up 1–3; size 1.5, grow 4.5, life 4.5, alpha 0.24·(1 − h/9), drag 1.4, rise 0.5 |
| Boost puffs (each rear nozzle) | dt·30 | vel = 10·dir + 0.6·carVel; size 0.4, grow 2.2, life 1.4, alpha 0.16, drag 2, rise 0.3, colour (0.85, 0.88, 0.95) |
| Side-thruster puffs (in air) | dt·20 | vel = 9·dir + 0.7·carVel; size 0.35, grow 1.8, life 1.1, alpha 0.18, drag 2.5, rise 0.2 |
| Landing ring (air → ground) | once | min(40, 10 + 6·abs(suspV)) puffs on a 1.5 × 2 ellipse at +0.3; radial vel 7, up 0.8, + 0.3·carVel; size 1, grow 3, life 3, alpha 0.22, drag 1.8, rise 0.4 |
| Crash sparks (entering `crashed`) | once | `burst(pos + 0.3·up, normalized vel, 70, 10)` |

Each emitter spawns at most one particle per frame, so particle density drops at low frame rates.

#### 2.9.6 Procedural Roadster model (fx chunk `lx`, `Cn`)

**Dimensions (`Cn`, exported for physics):**

- wheelRadius 0.325; frontAxle z +1.36; rearAxle z −1.48 (wheelbase 2.84); half-track 0.84 (track 1.68).
- Body z −2.2..+2.2 (4.4 m long). Overall width ≈ 2.09 (max half-width 1.045 at z −1.56). Roof peak ≈ 1.128 near z −0.3. Belly ≈ 0.116 above the ground between the axles.

**Profile curves (`xt.*`).** Each is a function of z built by `Jt`: a cubic Hermite spline with Catmull-Rom tangents scaled by 0.85, linearly extrapolated end tangents, and values clamped outside the key range.

| Curve | Known values |
|---|---|
| `yb` (underside) | 0.30 at the rear, 0.12 between z −1.6 and 1.7, 0.16 at the front |
| `wSill` (sill half-width) | 0.86 → 0.92 → 0.80, then 0.84 and 0.60 at the nose |
| `wSh` / `ySh` (shoulder crease) | width max 1.045 at z −1.55; height 0.86–0.925 at the rear, 0.725–0.79 mid, 0.46 at the nose |
| `wSide/ySide`, `wLow/yLow`, `wDeck/yDeck` | side crease, lower crease and beltline (key values not captured) |
| `yRoof` (centreline) | peak 1.127 at z −0.23; 0.475 at the nose; 0.864 at the tail |
| `wRS` (roof rail half-width) | 0.43–0.645 |

- **Greenhouse:** z −1.68..1.22. Cabin blend E = smoothstep(1.3 → 1.16)·smoothstep(−1.9 → −1.64).
- **Wheel arches `jl`:** within 0.355 of an axle, the floor rises to 0.325 + sqrt(0.355² − dz²), giving semicircles with their top at y 0.68.

**Cross-sections (`L0`).** Sampled every 0.02 m (221 sections), each with 13 points ordered from the floor centre up to the roof centre:

| Point | Position |
|---|---|
| 0 | floor centre (0, yb) |
| 1 | floor edge (min(0.55, wSill − 0.05), yb), crease |
| 2 | same x at arch height |
| 3 | sill or arch edge |
| 4–6 | lower body, side crease and side line (interpolated along the sill → wLow → wSide → wSh ladder) |
| 7 | shoulder (wSh, c), where c = max(ySh, arch + 0.035) |
| 8–10 | outside the cabin: from the shoulder to the roof rail at 0.34 and 0.67 (a smooth hood or deck). Inside the cabin: deck (wDeck, yDeck), an inset of 0.035 in x and +0.03 in y, and the roof rail (min(wRS, inset − 0.03), max(+0.02, P − 0.075)). Point 10 is a crease only when E < 0.5. |
| 11 | (0.55·x10, blended y) |
| 12 | roof centre (0, P), where P = max(yRoof, c + 0.03) |

**Loft (`P0`).**

- Mirrored in two passes (+x, and −x with winding flipped).
- Vertices are duplicated per strip, so every strip edge is hard.
- Normal = profile tangent × along-z tangent; at crease points the profile tangent is one-sided.
- UV = (pointIndex/12, (z + 3)/6). Degenerate quads (both edges shorter than 1e-5) are skipped.
- Six material groups, chosen per strip:

| Strip | Material |
|---|---|
| 0–2 | liner |
| 3 | paint inside an arch, else trim |
| 4 | trim when z < −1.835; paint inside an arch or when z > 2; else trim |
| 5–6 | paint |
| 7 | sideGlass for −1 < z < 1.2, else paint |
| 8 | gloss inside the greenhouse, else paint |
| 9–11 | inside the greenhouse: glass, with gloss bands within 0.06 of either end; otherwise paint |

**Materials (`U0`, returned as `mats` so the game can tweak them):**

| Material | Definition |
|---|---|
| paint | Physical #DEDCD8, metalness 0.08, roughness 0.42, clearcoat 0.55 / 0.28, sheen 0.35 (sheenRoughness 0.5), envMapIntensity 1.1 |
| trim | #0B0C0E, metalness 0.2, roughness 0.5, clearcoat 0.4 / 0.35 |
| gloss (piano black) | #040405, metalness 0.3, roughness 0.14, clearcoat 1 / 0.04 |
| liner | Standard #070709, roughness 0.92 |
| glass | Physical #7A5434, metalness 0.92, roughness 0.05, clearcoat 1, envMapIntensity 1.5, iridescence 0.12. Opaque: no transparency or transmission. |
| sideGlass | #6A4A30, metalness 0.9, roughness 0.05 |
| chrome | #D8D8D8, metalness 1, roughness 0.12 |
| tail | #300000, emissive #FF1020 ×7 |
| tailDim | #200000, emissive #FF0A14 ×1.2 |
| head | #FFFFFF, emissive #EAF2FF ×9 |
| lamp | emissive #DFE9FF ×2.2, DoubleSide |
| amber | #402000, emissive #FF8A1A ×4 |
| nozzle | #D2C6B4, metalness 1, roughness 0.18 |
| nozzleGlow | #0C0806, emissive #FF7A2A, intensity 0 at start (driven at runtime) |
| tire | #111113, roughness 0.85 |
| rimDark / rimInsert / rimSilver / gold / seam | #1C1D20 / #E6E6E4 / #B9BCC0 / #C8955A / #1A1A1C |

- **Licence plate:** a 512 × 256 canvas (#808080 fill, #a0a0a0 border, "RDSTR" in 600 150px "Arial Narrow" with blur 2px) used only as a bumpMap (bumpScale 2.5) on Physical #DCDAD6.
- **Underbody:** a 512 × 1024 canvas (#3a3d42 base, #15171a grid lines every 128 × 146 px, #5a5e64 rivets of radius 7), tinted #9AA0A8.

**Parts (`lx`).** `root` is a Group named "Roadster". The body Group is its child. The wheels are added to `root`, not `body`, so the body can pitch and roll on its own.

| Part | Geometry and placement |
|---|---|
| Front fascia (z +2.2) | Outline clipped into a gloss-black grille trapezoid plus painted corners |
| Headlight bar | Tube r 0.012 (head material) along front points 7..12 mirrored, at z 2.206 |
| Splitter | 1.34 × 0.03 × 0.14 gloss at (0, 0.15, 2.18) |
| Intake slot | 0.5 × 0.05 × 0.01 at (0, 0.36, 2.203) |
| Corner lamps | Single triangles between z 1.93 and 2.19 (lamp material), with a chrome tube outline r 0.004 |
| Seams (r 0.003–0.0035) | Hood cross seam at z 1.58; hood side seams from z 2.17 to 1.27; door cuts at z 0.82 and −0.42 (doors 1.24 m long) |
| Side marker | Amber 0.012 × 0.022 × 0.08 near z 0.9, with a chrome stalk |
| Underbody | Plane 1.08 × 3.4 at (0, 0.148, −0.05) |
| Rear face (z −2.2) | Paint above y 0.6, trim below |
| Tail bar (`parts.tailBar`) | Tube r 0.011 (tail material) at z −2.206 |
| Brake bar (`parts.brakeBar`) | 1.3 × 0.008 × 0.01 (tailDim) at y ≈ 0.82 |
| Diffuser | 7 gloss fins 0.012 × 0.13 × 0.26 at x = 0.24j, y 0.35, z −2.08 |
| Rear bar | 1.7 × 0.035 × 0.08 at (0, 0.58, −2.23) |
| Plate | 0.36 × 0.17 × 0.012 at (0, 0.69, −2.212) |
| Reflectors | tailDim 0.04³-ish at (±0.8, 0.5, −2.22) |
| Nozzles | 4 large (r 0.062) at x ±0.6 and ±0.22, 2 small (r 0.03) at x ±0.41, all at y 0.44. Each has a liner cylinder at z −2.23, a lip torus at −2.28, and a glow disc at −2.2. All 6 discs are in `nozzleGlows`. |
| Rear wing (`wing`) | Group at z −1.98. Two gloss endplates at x ±0.77, a 1.6 m airfoil main plane, struts at x ±0.41. `userData.stowY` ≈ 0.571, `upY` ≈ 0.871 (0.30 m of travel). |
| Interior | Seats 0.48 × 0.62 × 0.14 at (±0.37, 0.6, −0.6), tilted −0.38; half-torus steering wheel at (−0.37, 0.68, 0.3). Hidden behind the opaque glass. |
| Wheel pivots | (±0.84, 0.325, 1.36) and (±0.84, 0.325, −1.48). Each entry is `{pivot, spin, front, side, baseY 0.325}`. Rear wheels are `wheels[2]` and `[3]`. |

**Wheel (`O0`), axis along x:**

- Tyre: 64-segment lathe from rim radius 0.272 to tread radius 0.325, width 0.31, shoulder radius 0.035.
- Barrel: r 0.268, height 0.28.
- Rim face: white insert disc r 0.262.
- Lip: torus 0.268 / 0.012.
- Spokes: 6, each tapering from r 0.06 to 0.266. A bevelled silver extrude with an inset window, a dark inner fill, and a gold accent box at r 0.167.
- Hub: r 0.068–0.072, with a silver ring.
- Brake disc: r 0.2.
- Every car mesh casts and receives shadows.

**Returned object:** `{root, body, wheels, thrusters{lift, rear, side, top}, mats, wing, nozzleGlows, parts{tailBar, brakeBar}}`. Thruster mounts are listed in §2.3.

#### 2.9.7 Lineup display vehicles (main bundle)

**Generic toolkit.**

- **Monotone spline `Di`:** Fritsch–Carlson, used for the profile tables.
- **Section lofter `Ks` / body lofter `Xs`:**
  - Each half-profile has 3 bottom, 5 corner, 11 side, 4 shoulder and 15 greenhouse points, plus a closing point, labelled bottom / corner / side / shoulder / green.
  - Sections are generated by `Fs` from the tables yb, ys, yBelt, yt, wl, wg, wgf, sh, wr and ng, plus kUp/kDn (tumblehome and tuck-under), rc (corner radius), plan-view superellipse taper (zF/rF/pF, zR/rR/pR), end softening {f 0.5, r 0.35, n 3.4}, nose/tail vertical squash {a, q, y, k, kb 0.85}, and wheel-arch circles.
  - Stations: a 0.04 m step (0.05 for the semi cab), clustered at the ends, 27 per arch, with hard break stations at the arch edges, minimum spacing 0.016.
  - Mirrored output, one draw group per material.
  - Materials via `ws`: bottom → under; green inside the window range → glass; everything else → paint.
- **Surface projector `ce`:**
  - Built per body in 5 directions (front, rear, right, left, top).
  - A 128² grid of binned triangles; rays start 100 units back; Möller–Trumbore intersection; returns {p, n}.
- **Projected decals:**
  - Panels `nt`: filleted 4-corner outlines filled with a Coons patch and cast onto the body; offset 0.004, ds 0.025.
  - Ribbons `et`: offset 0.005, ds 0.01, with optional raised side walls.
  - All lights, seams, handles and glass patches are real geometry sitting 2–7.5 mm above the surface.
- **Wheel generator `Fi`/`Ai`/`Mt`:** cached per parameter set.
  - Tyre: superellipse exponent 3.4.
  - Rim face styles: spokes, cover, aero, truck, plain.
  - Brake disc r 0.8·rimR; caliper.
- **Supporting parts:**
  - Wells `We`/`Ii`: 0x040404, DoubleSide.
  - Mirrors `$s`: body-coloured, toe 0.12.
  - Materials `Rt`: paints blue 0x0B2A6E, black 0x050506, white 0xF1F1EE and gold 0xC9A46A (metalness 0.95). Brushed steel 0xC9CCD0 with a random-hairline roughness map. Glass 0x010103. Tyres with sheen. Five rim finishes. Emissives: lightW ×6, lightW2 ×3, lightR ×5.5, lightA ×6, led ×6.

| Vehicle | Wheels {R, W, rimR, style} | Axles (front / rear z), wheel x | Body and paint | Size w × h × l |
|---|---|---|---|---|
| model3 | 0.334, 0.235, 0.229, 10 spokes (rimDark) | 1.52 / −1.355, ±0.7925 | Lofted, blue, glass z −1.55..1.12, roof peak 1.44. LED headlights, tail bar, seams, handles, mirrors. | 2.069 × 1.44 × 4.728 |
| modelY | 0.356, 0.255, 0.2413, 5 spokes (rimGrey) | 1.515 / −1.375, ±0.8145 | Lofted, black, glass z −1.88..1.02, roof peak 1.615. Full-width front and rear light bars. | 2.149 × 1.615 × 4.802 |
| cybercab | 0.37, 0.235, 0.265, cover ×14 (rimCover) | 1.3 / −1.48, ±0.8425 | Lofted, gold fastback, 2 doors, no mirrors | 1.949 × 1.44 × 4.312 |
| cybertruck | 0.445, 0.29, 0.254, aero ×6 (rimAero) | 1.9 / −1.91, ±0.855 | Faceted `Ks` loft (390 triangles) of brushed steel, glass z −0.97..1.2, tonneau bed, angular fender flares | 2.315 × 1.8 × 5.721 |
| semi | Steer 0.52, 0.3, 0.286, truck; drive duals at x ±1.13 / ±0.815 | Steer 2.35; drive −1.45 and −2.75 | Cab-over lofted cab (white) plus box chassis, fifth wheel, fenders, mud flaps, amber roof markers | 2.84 × 4.1 × 6.725 |

The stage holds 317 meshes and about 228k triangles. It is built at startup on the main thread, taking about 390 ms in Node.

### 2.10 Audio [`Zi`]

**Engine.**

- `new AudioContext({latencyHint: 'interactive'})`, falling back to no options. `init()` runs on game start and resumes the context; calling it again only resumes.
- Without WebAudio it logs "[audio] WebAudio not supported" and stays inert.

**Graph:**

```
loops ─┐
sfx  ──┴→ diegetic → slowLP1 (LP, Q 1.1) → slowLP2 (LP, Q 0.6, 1.4× freq) → pre (0.9) ─┐
ui ───────────────────────────────────────────────────────────────────────────────────┴→
  comp (−16 dB, knee 10, 3.5:1, att 6 ms, rel 250 ms) → lim (−2.5 dB, knee 0, 20:1, 1 ms, 90 ms)
  → clip (soft clip, 2× oversample) → vol (0.7) → mute → vis (tab hidden → 0) → destination
reverb: sends → revIn → HP 180 Hz → Convolver (generated 2.1 s IR) → revOut (0.3) → diegetic
sends: sfx 0.22, ui 0.35, motor 0.05, squeal 0.12, thrust 0.14
```

- **Impulse response:** stereo, 2.1 s, 12 ms predelay, envelope e^(−3.4t), filtered by a one-pole whose coefficient is 0.15 + 0.8e^(−2.5t) (the tail darkens), first 60 ms ×1.6.
- **Noise beds:** 4 s loops of white, pink (Paul Kellet) and brown noise, with a 60 ms equal-power seam crossfade, normalized to 0.95. Looped beds use two decorrelated sources merged to L/R.
- **Soft clip curve:** linear up to 0.75, then a tanh knee, ×0.98.
- **Hidden tab:** gain → 0 (τ 0.05) and one-shots are ignored.
- **Mute and volume:** mute gain 0/1 (τ 0.03); volume 0..1 (τ 0.03).
- **Debug:** `tap()` (MediaStream capture) and `getLevels()` (3 analysers, fft 2048) are reachable only through `window.__rd.audio`.

**Per-frame inputs** (dt clamped to 0..0.1; all targets set with `setTargetAtTime`):

| Input | Source |
|---|---|
| speed | `F.speed` |
| throttle | input.throttle − 0.5·input.brake |
| boost / lift / rcs | `F.thrust.*` |
| suction | 1 in ramp mode, else 0 |
| drifting | min(1, max(slip − 3, 6·burnout)/6) on the ground, else 0 |
| onGround | true in ground or ramp mode |
| timeScale | the game time scale |

The speed is normalized as c = clamp(abs(speed), 0, 125) and r = min(c/110, 1.1).

**Continuous layers**

| Layer | Synthesis |
|---|---|
| Motor | Fundamental u = (80 + 1120·min(r, 1.05)^0.8)·(1 + 0.025·throttle)·pitch. Layers: sine u (0.085T); triangle 1.003u with a 0.27 Hz ±7-cent chorus (0.05T); sine 0.5u; sine 2.002u; sine 3.01u; sawtooth 1.001u through a load lowpass. T = 0.22 + 0.78·min(r, 1)^0.6; load x = throttle (or 0.6·abs(throttle) in reverse). Bus 0.85 → high shelf 2.8 kHz −6 dB → LP 7 kHz. |
| Inverter | Whine: sines at D and 1.5D, D = min(7000, 1700 + 1.35u + 300·throttle)·pitch, 5.5 Hz ±9-cent vibrato. Hiss: white noise BP 8 kHz. |
| Road | Brown rumble HP 28 → LP (70 + 280r), gain 0.34·r^0.7 with a random-walk roughness. Pink tyre roar BP (320 + 950r), gain 0.16·r^0.9. |
| Tyre squeal | A = (drifting·onGround·clamp((speed − 2)/10))^1.3; C = (950 + 260·min(r, 1) + 140·wobble)·pitch. Triangle C + sine 1.51C (7.3 Hz ±22 cent) → LP 2.5 kHz; noise bands at 2.05C (Q 7) and 3.1C (Q 9). |
| Wind | Pink BP (220 + 1700·r^1.2), gain (0.02 + 0.48·r^1.7)·(1.3 in air). White whistle BP (900 + 2300r), Q 9, gain 0.22r². Gust LFO 0.17 Hz (±0.22 amplitude), swirl pan 0.06 Hz (±0.3). |
| Lift | White LP (550 + 2600f), pink BP (650 + 450f), brown LP 150 + 58 Hz peak +6 dB; 17 Hz and 29.3 Hz flutter. Attack τ 0.012, release τ 0.05. |
| Boost | White BP (2000 + 1500d), white HP 6.5 kHz, pink BP (950 + 300d), brown LP 115 Hz. Same attack and release. |
| RCS | Scheduled puffs 90 ms ahead: each rises from 0.12 to 0.65–1 in 3 ms and decays with τ 0.02–0.05·(2 − pitch); random pan ±0.6; BP 3000–6200 Hz. Interval (1/(5 + 15·rcs))·rand(0.6–1.4)/pitch, i.e. 5–20 puffs/s. Off below rcs 0.02. |
| Suction fan | Spool follows suction (τ 0.7 s up, 1.1 s down). Q = (180 + 1500·spool)·pitch; sines Q and 2.004Q, triangle 3.02Q; pink BP (550 + 900·spool); LP 5 kHz. |

The thrusters share a bus (gain 0.8) with tanh drive 1.3. Running all the time: 21 oscillators, 6 looping noise sources, a convolver and 3 analysers, even at zero gain.

**One-shots, `event(name, intensity = 1)`.**

- Dispatches to `_ev_<name>`. Unknown names warn once.
- Each event has a per-event retrigger cooldown. There is a 48-voice cap; `ui` and `uiConfirm` are exempt; voices are never stolen.
- Voices start 10 ms ahead. Diegetic voices inherit the slow-mo pitch and the 1/sqrt(pitch) stretch.

| Event | Synthesis | Fired by |
|---|---|---|
| land | Sine 115→42 Hz; brown LP 320→110; triangle 195→150; 2.6 kHz tick; triangle 165→130 at +170 ms | landing (intensity min(1, impact/14)) |
| hardLand | Ducks loops 0.45 (hold 0.08, release 0.5); sine 88→27; brown LP 450→85; white BP 1500→650; click; 8 + 6e debris ticks | landing with impact > 12 |
| crash | Ducks 0.6 (hold 0.12, release 0.7); sine 72→30; brown LP 700→100. Metal resonator bank at 387/913/1462/2210/3170/4630 Hz (±8%, Q 14–26), hit 5 times at 0, 55, 120, 200 and 310 ms. 1 s rattle tail (BP 3.3→1.1 kHz, 33 Hz square AM). Six 3.4–8 kHz tinkles. | crash, collisions above 10 m/s |
| launchPop | Ducks 0.35 (hold 0.03, release 0.3); 14 ms HP crack; two stereo LP sweeps 9.5/9 kHz → 650/700 Hz; brown boom; sine 98→32; pink tail | launch pop, recovery (at 0.5) |
| scrape | Noise BP 1900–3200 Hz sweeping to 0.75f, plus a resonant BP at 1.7f (Q 28), with 38–55 Hz saw AM | crash bounce, collisions 3–10 m/s |
| trick (UI bus) | Root 523.25 Hz × 2^(n/12), stepping up the C-major scale [0,2,4,5,7,9,11,12] with level. Chord [0,4,7,12], plus 16 at level ≥ 3 and 19 at level ≥ 5, arpeggiated 32 ms apart; twin saws ±9 cents through LP (5500 + 600·level) → 1600; sparkle at 4× root; HP swish; bass drop 130.8→98 at level ≥ 4 | trick callouts (level min(5, combo count)) |
| ring (UI bus) | Bells E6 1318.5 Hz then B6 1975.5 Hz at +70 ms; partials ×[1, 2, 2.76, 4.07, 5.4]; 4 HP sparkle ticks | ring collected |
| missionComplete (UI bus) | Arpeggio C5–E5–G5–C6, 90 ms apart; pad at +0.38 s (C4 G4 C5 E5 G5 C6, 1.6 s); bass 65.4→49; 2093 Hz shimmer; HP noise swell | mission completed |
| uiConfirm (UI bus) | Triangle 880 Hz for 80 ms, triangle 1318.5 Hz at +65 ms, sine 2637 Hz | game start |
| ui, whoosh | Defined but never fired | — |

Cooldowns (s): land 0.08, hardLand 0.12, crash 0.15, trick 0.06, ui 0.025, uiConfirm 0.05, ring 0.03, missionComplete 0.6, launchPop 0.1, scrape 0.05, whoosh 0.12.

**Controls.** Pause mutes the master. M toggles a user mute that is restored on resume. `#opt-vol` sets the master volume (0..1, step 0.05, default 0.7).

### 2.11 HUD and menus [`Yi`, CSS]

**Design tokens.**

- Colours: `--fg #eef1f4`, `--dim rgba(238,241,244,.55)`, `--faint .22`, `--glass rgba(14,17,21,.42)`, `--line rgba(255,255,255,.09)`, `--red #ff2a3c`, `--cyan #7fdcff`, `--gold #e8c27a`, `--green #59f0a6`.
- Fonts: `--disp` Michroma / Eurostile / Arial Black; `--ui` Inter / system.
- Body background `#05070a`.
- `.panel`: glass background, blur(14px) saturate(1.2), 1px border, radius 14.

**`#hud` elements** (all filled at runtime):

| Element | Position | Behaviour |
|---|---|---|
| `#missions` (`#missions-count`, `#missions-list`) | top 22 / left 22, 330 px wide | Header "MISSIONS" + "n/14". Each row is an `li` (`.done` when done) holding `span.chk` (✓, green glow when done), `span.mn` (name) and `span.md` (description, struck through when done). Footer "TAB to hide". `.collapsed` fades it out and slides it −20px (0.3 s). |
| `#scorebox` (`#score-val`, `#best-val`) | top 22 / right 22 | "SCORE" in Michroma 30px with en-US number formatting. `.bump` is a 0.35 s gold scale pop, restarted by a forced reflow. Below it, "BEST". |
| `#center`: `#mult`, `#pending`, `#trick-feed` | top 16%, 760 px wide | `#mult` "×n.n" (gold, `.on` when mult > 1). `#pending` shows the rounded pending points. The feed prepends `div.trick` (`.tn` name, Michroma 34px italic gradient; `.tp` "+pts" gold), keeps at most 4, adds `out` at 2200 ms and removes at 2800 ms. Pop-in: 0.45 s from scale 1.6 with blur 6px. `banked(pts, label)` shows a green "label +pts" (out at 1800 ms, removed at 2400). `lost()` shows a red "COMBO LOST" (removed at 1800 ms). |
| `#launch` | top 36% | Live 0–60 timer "x.xx s" in Michroma 44px cyan, `.on` while launchT > 0.02 |
| `#flash` (`.ft`, `.fs`) | top 40% | 1.6 s keyframe animation; "CRASH" in Michroma 54px red italic, "RCS recovery…" below |
| `#toasts` | top 22, centred | `.toast` with `.tt` (10px) and `.ts` (20px). `.good` gives a green border and glow. `out` at 3200 ms, removed at 3900 ms. |
| `#drift` (`#drift-fill`, `#drift-pts`) | bottom 190 | `.on` when drift time > 0.3 s. A 220 × 3 bar filled to min(100, t/4·100)%, plus points. |
| `#dash` | bottom 26, centred | `#alt` "ALT x.x m · AIR x.x s" in the air (absolute pos.y). `#spd-val` rounded 3D mph (Michroma 64px) + "MPH". `#spd-mode` label by mode: ROAD, SUCTION, FLIGHT, RCS RECOVERY, coloured by `data-mode` (dim, gold, cyan, red). `#gasrow`: `#ind-lift` "LIFT", `#gas` 300 × 6 bar (`#gas-fill` scaleX = gas/100, blue gradient, `.low` red below 20%, 10 tick segments), `#ind-boost` "THRUST". Caption "COLD GAS · 600 L COPV". |
| `#hints` | bottom 26 / left 22 | Groups `.h-ground`, `.h-air`, `.h-ramp`, `.h-all`, chosen by `data-mode` (crashed shows the air hints). Strings: "W/S drive · A/D steer · SPACE jump/hover · SHIFT thrust · Q drift"; "A/D kickflip · W/S flip · Q/E spin · SPACE lift · SHIFT thrust"; "W hold — suction keeps you on the wall · let go at the top to drop off like the reveal"; "C camera · R reset · T teleport · ESC menu" (always shown, at 0.7 opacity). |

**Other overlays.**

- `#fade`: black, fades out over 1.2 s.
- `#dev`: logo + "More stuff" link, bottom-right, hidden while playing on touch.
- `#rotate`: "ROTATE TO LANDSCAPE" with an animated phone outline, shown in portrait on touch.

**Title `#title`:**

- Full-screen column with padding-top 9vh, a radial and linear vignette, and `.out` fades it over 0.8 s.
- Tagline `.t-top` "FAN-MADE PLAYGROUND · INSPIRED BY THE OCT 15 2026 REVEAL".
- Wordmark `h1` "ROADSTER": Michroma clamp(56px, 10vw, 150px), italic, skew −12°, champagne gradient.
- `.t-sub` "UNLEASHED": red, letter-spacing 1.2em.
- `.t-specs`: 0–60 "<0.9 s", V-MAX "230 mph", "10 × cold gas" (label not captured), SUCTION "multi-mode fans".
- `#start` "DRIVE": a pill button that turns white on hover.
- `.t-keys`: "W A S D drive / steer", "SPACE thrusters up — jump & hover", "SHIFT rear thrust", "A / D in air kickflip", "W / S in air front / back flip", "Q drift · C camera · T teleport".
- `.t-foot`: "Gamepad supported · Best with sound on · 3D VIEWER", with a link to `./viewer.html`.

**Pause menu `#menu .m-box`** (glass panel 520 px wide, "PAUSED"), top to bottom:

1. Resume (`data-act=resume`).
2. Teleport row of 8 buttons (`data-tp`); a teleport also unpauses.
3. `#opt-slowmo` "Auto slow-motion" (checked).
4. `#opt-cuts` "Auto camera cuts" (checked).
5. `#opt-vol` volume.
6. `#opt-quality` (High / Ultra / Medium).
7. "Reset mission progress" (`data-act=reset-progress`, ghost style).

**Toast catalogue**

| Trigger | Title / subtitle | Style |
|---|---|---|
| Game start | THE REVEAL WALL IS STRAIGHT AHEAD / Hold W — the suction keeps you on it (touch: Push the stick up — …) | good |
| Mission completed | MISSION COMPLETE / name | good |
| All missions | ALL MISSIONS / You are a Roadster pilot. | — |
| Mass-driver exit | AIM FOR THE BEAM / Lift to stretch · thrust to push · land in the gold ring | good |
| Bullseye miss | MISSED THE TARGET / N m off — try lift and thrust | — |
| 0–60 finished | 0–60 MPH / x.xx s | good if < 1 s |
| Camera, mute, teleport | CAMERA / MODE; SOUND / OFF or ON; TELEPORT / NAME | — |
| Boundary | EDGE OF THE TEST SITE / Turn around | — |

**Touch and responsive CSS.**

- At `@media (max-width: 900px)`, `#missions` and `#hints` are hidden.
- `body.touch`:
  - hides `#hints` and `.t-keys`;
  - scales `#dash` to .66 (bottom 4), `#center` to .72 (top 13%) and `#toasts` to .72 (top-right);
  - shows `#missions` at top 56, 270 px wide, scale .85 (it starts `.collapsed` and the GOALS button toggles it);
  - compacts the title.
- `body.og` hides the interactive title parts, for OG image capture.
- `body.cine` hides missions, hints, dev link, scorebox and non-good toasts, and scales the dash to .85.
- Known CSS bug: `.t-top` is used both for the title tagline and the touch mini-button row, so the later rule overrides the tagline position.

### 2.12 Input (keyboard, gamepad, touch)

**Keyboard** (held keys tracked in a Set; window blur clears it)

| Key | Action |
|---|---|
| W / ↑ | throttle 1 (in air: pitch, front flip) |
| S / ↓ | brake/reverse 1 (in air: back flip) |
| A / ← and D / → | steer +1 / −1 (in air: roll, kickflip) |
| Space | lift. On the ground the press edge is the launch pop; held in air it hovers. |
| Shift (either) | boost / rear thrust |
| Q / E | drift. Q also sets yawL and E sets yawR (air spin). |
| C | cycle camera (play) |
| R | reset in place (play) |
| T | next teleport (play) |
| M | sound on/off (play) |
| Tab | toggle the missions panel (play) |
| Esc | pause / resume |
| Enter / Space | start, from the title |

In play, `preventDefault` is called for Space, the arrow keys and Tab.

**Gamepad** (first connected pad, standard mapping, 0.12 axis dead zone)

| Control | Action |
|---|---|
| RT (button 7) | analog throttle, max'ed with the keyboard |
| LT (button 6) | analog brake |
| Left stick X | steer = −axis0 when outside the dead zone |
| Left stick Y (air only) | up adds to throttle, down adds to brake |
| A (0) | lift |
| RB (5) or X (2) | boost |
| B (1) or LB (4) | drift. LB also sets yawL; B sets yawR only in the air. |
| Y (3) | camera cycle on the rising edge (latched by an expando on the Gamepad object; no toast) |

**Touch [`Ki`]** builds `div#touch`.

- **Floating stick:** an invisible `.t-zone` (left half of the screen, below 18% of its height) captures the first pointer and recentres the stick there.
  - The knob is clamped to 62 px; each axis = offset/62 with a 0.12 square dead zone.
  - steer = −x. Up: throttle = max(throttle, min(1, −1.25y)). Down: brake = min(1, 1.25y). Full output is reached at 80% deflection.
  - Stick labels: GAS / BRAKE.
- **Hold buttons** (`pointerdown` with capture and `vibrate(8)`; release on up, cancel or leave):

  | Button | Size | Effect |
  |---|---|---|
  | `.t-lift` "LIFT / jump · hover" | 116 px, cyan | lift |
  | `.t-boost` "THRUST" | 82 px, gold | boost |
  | `.t-drift` "DRIFT / spin" | 74 px | drift; in air it sets yawL only, so there is no right yaw on touch |

- **Mini buttons:** GOALS (toggle missions), CAM, RESET, ❚❚ (pause). Touch defaults and the context menu are suppressed.

**Derived fields and the airborne latch.**

- `liftPressed` = lift && !previousLift.
- On the frame the physics mode first becomes `air`, any throttle and brake already held are latched. They read as 0 until released, so input held at take-off does not carry into air control.

### 2.13 Persistence, URL flags and debug handles

- **localStorage** (via try/catch wrappers `Xe`/`de`):
  - `rdstr.best`: a number.
  - `rdstr.done`: a JSON array of mission ids.
  - `rdstr.rings`: a JSON array of ring indices.
  - `resetProgress()` clears done and rings and reloads the page. Best score is kept.
  - Settings (quality, volume, toggles) are not persisted.
- **Game URL flags:**

  | Flag | Effect |
  |---|---|
  | `pr` | pixel-ratio cap |
  | `desktop` | force non-touch |
  | `tm=agx` | AgX tone mapping |
  | `cine` | clean capture: body class plus suppressed toasts |
  | `ta`, `tspeed`, `td`, `th` | title orbit angle, speed, distance, height |
  | `notitle` | hide the title |
  | `og` | OG-image layout |
  | `autostart` | start after 300 ms, with no user gesture, so audio may stay suspended |

- **Debug handle:** `window.__rd = {audio, touch, phys, game, rig, car, ramp, scene, camera, startGame, teleport, renderer, composer, aoPass, smoke, world, bloom}`.

### 2.14 Viewer page (`viewer.html`, `viewer-hlSpoB6V.js`)

**Purpose.** A showroom turntable for the same procedural Roadster (fx `lx` and `hx`). There is no gameplay, no audio and no keyboard.

**Renderer.** `canvas#c`, antialias / depth / stencil off, high-performance, DPR min(devicePixelRatio, 2), PCFSoftShadowMap, NoToneMapping. Resize updates the size and aspect but not the DPR.

**Camera and controls.**

- Camera: FOV 30, near 0.1, far 200, starting at (5.2, 1.5, 6).
- OrbitControls (unmodified r170 addon):
  - target (0, 0.55, 0), damping 0.06, distance 3.2–18, maxPolarAngle 0.495π;
  - autoRotate at speed 0.6. `update()` is called without a delta, so it turns 2π/3600·0.6 per frame (about 100 s per turn at 60 fps, faster on 120 Hz screens);
  - pan is unlimited;
  - left-drag rotates, right-drag pans, middle-drag or wheel dollies (0.95 per 100 wheel units; ctrl-wheel pinch ×10); one finger rotates, two fingers pinch-zoom and pan;
  - the first `start` event fades out `#hint`.

**Environment.** Two PMREM maps are baked at startup (sigma 0.03) from an offscreen scene: a BackSide sphere r 40 (#2a2c30 by day, #050608 at night) plus lightformer planes. Panel colours are multiplied by i = 0.6 at night, 1 by day.

| Lightformer | Size | Position, facing | Colour |
|---|---|---|---|
| Overhead | 30 × 6 | (0, 18, 0), facing the origin | (5i, 5i, 5.2i) |
| Side panel | 14 × 8 | (16, 6, 8), facing (0, 1, 0) | (3i, 3i, 3.2i) |
| Side panel | 14 × 8 | (−16, 6, −6), facing (0, 1, 0) | (2.2i, 2.2i, 2.4i) |
| Horizon strip | 30 × 1.2 | (0, 1.5, −18) | (1.6, 1.6, 1.6) by day, red (4, 0.2, 0.3) at night |

**Scene.**

- Floor: Circle r 30 (96 segments), #1a1c20, roughness 0.42, receives shadows. Its `onBeforeCompile` hook adds an unused line.
- Background #15171b by day, #050608 at night. Linear fog from 14 to 34, colour copied from the background every frame.

**Lights.**

| Light | Settings |
|---|---|
| Top softbox (RectAreaLight) | #ffffff, intensity 6 (night 1.5), 8 × 2.5 at (0, 6, 0) |
| Cool rim (RectAreaLight) | #dfe8ff, 4 (night 3), 6 × 1.5 at (−6, 2.5, −5), aimed at (0, 0.6, 0) |
| Warm key (RectAreaLight) | #fff4e8, 3 (night 0.6), 5 × 2 at (6, 2, 5), aimed at (0, 0.6, 0) |
| DirectionalLight | 1.2 at (3, 10, 4); shadow 2048², ortho ±4, near 1, far 30. Its `radius 6` has no effect under PCFSoft. |
| HemisphereLight | #8090a0 / #101010, 0.25 |
| Headlight SpotLight | #eaf2ff, 60, distance 30, angle 0.5, penumbra 0.6, decay 2, at body (0, 0.6, 2.2), aimed at (0, 0, 10) |

- The LTC tables (two 64×64 float tables, plus half-float copies) are about 91% of the bundle.

**Post.** EffectComposer (HalfFloat): RenderPass → Bloom (mipmapBlur, threshold 0.95, intensity 1, radius 0.7) → ToneMapping ACES_FILMIC + Vignette (darkness 0.5, offset 0.3) + SMAA (library default MEDIUM).

**Toggle bar.** State `{lights: true, wing: false, night: false, thrust: false}`. Each click toggles the button's `.on` class.

| Button | Effect |
|---|---|
| `#b-rot` AUTO-ROTATE (on) | toggles auto-rotate |
| `#b-lights` LIGHTS (on) | instant: head 9, lamp 2.2, tail 7, tailDim 1.2 and spot 60, or all 0 |
| `#b-wing` WING | eases y at min(1, 4·dt), hidden within 0.02 of `stowY` |
| `#b-env` NIGHT | swaps env map, background, fog and light intensities |
| `#b-thrust` THRUSTERS | lift and rear plumes at 0.7 + 0.3·sin 3t; nozzle glow 6. Side and top plumes are never driven. |
| "PLAY ▸" | link to `./` |

The wheels are forced to spin 0 every frame. The loop never idles.

**Page layout.**

- Body #0a0c10. Michroma wordmark "ROADSTER" with subline "FAN-MADE 3D MODEL · DRAG TO ROTATE · SCROLL / PINCH TO ZOOM".
- Bottom pill bar (Michroma 9.5px, glass, radius 22, safe-area aware). The `.on` state is a white pill; the play link has a red border.
- Hint "drag to orbit · right-drag to pan". @snicklink logo top-right.
- Page title "Roadster 3D".

**URL flags and debug.**

- `?cine=1` hides the bar, hint, top and logo. `?spin=n` sets the rotate speed (a non-number gives NaN and a blank screen). `?night=1` and `?wing=1` set state without updating the button classes.
- Flags need a truthy value; a bare `?cine` is ignored.
- `window.__v = {car, scene, camera, controls, state}`.

---

## 3. Key tuning constants

| System | Constant | Value |
|---|---|---|
| Physics | gravity | 9.81 |
| Physics | substep | ≤ 1/240 s; frame dt capped at 0.05 |
| Car geometry | wheel radius / axles / half-track / wheelbase | 0.325 / +1.36, −1.48 / 0.84 / 2.84 |
| Ground | motor | min(17, 340/max(0.5, v)) m/s² |
| Ground | brake / reverse / reverse cap | 16 / 6 / 14 m/s |
| Ground | rolling + drag | 0.25 + 0.0009·v² |
| Ground | boost | 6.5 + 19.5·max(0, 1 − v/40) |
| Ground | max steer | 0.62/(1 + v/15) rad; steer rate 7 |
| Ground | yaw-rate smoothing | 9 (4 while drifting) |
| Ground | lateral grip | decay max(5, 12 − v/14) per s; 1.5 while drifting |
| Ground | drift | min speed 4; yaw ×1.75 + 0.6·steer; extra decel 1.2 |
| Ground | burnout | speed < 4, spin 2.2 rad/s, speed decay 6/s, meter 3/s |
| Ground | step-up / drop-off | 0.35 / 0.25 m |
| Ground | launch pop | vy 8.2, cost 6, needs gas > 8 |
| Cosmetic | suspension k / c | 180 / 16 (per frame) |
| Cosmetic | body pitch / roll gain | 0.0022 (accel ±40) / 0.0016; rate 6 |
| Gas | max / ground regen / ramp regen | 100 / 32 per s (not boosting) / 12.8 per s |
| Gas | boost / lift / RCS drain | 15 / 26 / 3 per s |
| Air | lift / air boost | 17 / 9 m/s² |
| Air | drag | 0.0012·abs(v)·v |
| Air | pitch / yaw / roll rate | 5.4 / 4.4 / 7.6 rad/s |
| Air | rate response | 7.5 (input) / 2.2 (release) |
| Air | auto-level | idle 0.25 s, vy < 1, altitude < 7, up.y > −0.1, slerp 2.4 / 1.4 |
| Air | trick rotation tolerance | 0.55 rad (credit at ≈ 328.5°) |
| Ramp | suction limit | 15 m/s² (throttle > 0.05 or speed > 4), else 2.5 |
| Ramp | lip entry | t −0.2..2.4, lateral margin 0.4, approach > 1 m/s |
| Ramp | steer factor / self-straighten | 0.55 lip, 1.0 halfpipe / 0.4 per s |
| Ramp | halfpipe drive scale / exit cap | max(0.3, cos θ) / 16 + 30% of the excess |
| Ramp | mass driver rail | +42 m/s² up to 80; exit at least 78 |
| Ramp | exit pitch spin | min(3.2, v·κ·0.4); fall spin min(2.5, …) |
| Ramp | contact cooldown | 0.3 halfpipe / 0.8 lip / 0.5 fall-off |
| Landing | tilt limit, ground / ramp | up.y > 0.5 / up·n > 0.55 |
| Landing | clean tilt / heavy impact / short-hop filter | 0.82 / 12 m/s / 0.35 s |
| Crash | tumble / recovery / hop | 1.35 s / 0.8 s / 1.2 m |
| Crash | from collision | normal impact > 16 m/s |
| Collision | probe spheres | r 0.82 at y 0.55, z −1.45, 0, +1.45; restitution 0.3; tangential loss 25% |
| World | boundary | radius 1600; removes 1.5× the outward velocity |
| Scoring | multiplier | 1 + 0.5 per extra trick, cap 8 |
| Scoring | mission reward | 2500 (no multiplier) |
| Scoring | roll / flip / spin | 800·n / 700·n / 400·n per callout |
| Scoring | air / pipe air | 150 per s above 0.8 s / 120 per m at ≥ 5 m |
| Scoring | drift | slip > 3.2, speed > 6, 6 pts per m, banks after 1.2 s |
| Missions | hang / vmax / 0–60 | 6 s / 230 mph / under 1.0 s (5 s timeout) |
| Missions | loop / wall thresholds | rampMaxTheta > 2π − 0.6 / > π/2 + 0.05 |
| Rings | radius / pass tolerance / points | 5.5 / 6.0 / 500 |
| Bullseye | rings | r 6 = 5000, r 14 = 2000, r 26 = 800 |
| Slow-mo | default / cooldown | 0.9 s at 0.33 / 3.5 s |
| Slow-mo | inverted exit / mass driver / lineup | 1.1 s at 0.3 / 1.2 s at 0.35 / 1.4 s at 0.38 |
| Camera | chase distance / height | 6.6 + min(4, 0.035v) (+2.5 air) / 2 + min(1.2, 0.008v) (+1.6 air) |
| Camera | chase FOV / bumper FOV | 60 + min(20, 0.2v) + 6 boost / 72 + min(16, 0.15v) |
| Camera | shake | cap 1.2, decay 4.5, amplitude 0.18 m |
| Camera | ramp clearance | 0.9 m |
| Render | DPR cap | 1.5 desktop / 1.25 touch / 2 Ultra / 1 Medium |
| Render | bloom (game) | threshold 0.92, smoothing 0.25, intensity 1.25, radius 0.78 |
| Render | N8AO (game) | radius 1.6, intensity 2.2, half resolution |
| Render | vignette / grain / SMAA | 0.62, 0.28 / 0.06 overlay / HIGH |
| Render | fog | FogExp2 0x070B10, 0.0028 |
| Render | moon shadow | 2048 (1024 touch), ±40 m |
| Render | floodlight spot | 9000, distance 220, angle 0.42 rad, penumbra 0.55 |
| VFX | pool sizes | smoke 2600, skid quads 1600, sparks 400 |
| VFX | plume ease | up 30 per s, down 10 per s; lengths 2.6 / 2.0 / 1.3 |
| Audio | master | volume 0.7; compressor −16 dB 3.5:1; limiter −2.5 dB 20:1 |
| Audio | voices / reverb | 48 / 2.1 s IR, return 0.3 (0.65 in slow-mo) |
| Audio | slow-mo | pitch 0.45 + 0.55·ts; lowpass floor 550 Hz |
| Input | dead zone / stick radius | 0.12 / 62 px; touch ×1.25 |
| Viewer | bloom | threshold 0.95, intensity 1, radius 0.7 |
| Viewer | orbit | target y 0.55, distance 3.2–18, damping 0.06, auto-rotate 0.6 |

---

## 4. Unknowns, gaps and contradictions

### 4.1 Not resolved by the maps

1. **Smoothing formulas.** For most "ease or lerp at rate k" sites (steering, yaw rate, camera, body pitch and roll), the exact form was not captured: e^(−k·dt) versus min(1, k·dt). It is known only for the plumes, the wing and the lift light, which use min(1, k·dt).
2. **Reveal wall κ between 15.5 and 19.5 m.** The map says the curvature "eases" from 0.1176 to 0.012 but does not say how. Assuming linear gives 161.4° at the end; the map computed 161.1°.
3. **Full spline key tables are missing** for the Roadster (`xt.wSide/ySide`, `wLow/yLow`, `wDeck/yDeck`, and the rest of every curve) and for the lineup vehicles' profile tables. Only endpoints and peaks were recorded, so the exact silhouettes cannot be rebuilt. The `L0` interpolation formulas for points 4–6 and 8–11 are also only described.
4. **Brake-light material.** The brake-light code sets "the tail material" to 9 when braking and 1.2 otherwise. Is that `mats.tail` (default 7) or `mats.tailDim` (default 1.2, used by the brake bar)? Not resolved.
5. **Other small physics details.**
   - The burnout meter's clamp range is not stated.
   - Whether drift time accumulates real or scaled dt is not stated.
   - Which RNG and spin conventions the roll-trick sign uses (KICKFLIP does not distinguish direction) is not stated.
6. **Build and markup details not captured.**
   - The main bundle's hashed filename and the `index.html` script/CSS tags.
   - The Vite configuration.
   - Whether `index.html` loads Google Fonts (the viewer does).
   - The exact markup nesting of `#hud` and `#title`.
7. **Title copy and hint mapping.**
   - The label for the title spec value "10 × cold gas" was not captured; it is probably "THRUSTERS".
   - Which hint line belongs to which `.h-*` class is inferred from order.
8. **Rendering settings not captured.**
   - Whether the car headlights cast shadows.
   - `toneMappingExposure` and any ToneMapping white point (library defaults assumed).
   - The exact profile of the LED glow gradient texture.
9. **Never called.** No caller uses `requestSlowmo`'s default (0.9 s, 0.33). The donut pad has no gameplay hook.
10. **No music** exists anywhere in the maps.

### 4.2 Design gaps found in the maps

1. **The 230 MPH mission may be unreachable.**
   - The ground boost equilibrium is 103.0 m/s (230.4 mph), but one tank gives only 6.7 s of boost: about 181 mph from a standstill and 212.5 mph from cruise.
   - The physics map says it can only be done in a powered dive (dive terminal speed ≈ 280 mph).
   - A trajectory search over simple strategies (gas 100, ideal instant attitude control, after a mass-driver launch at 78–80 m/s) topped out at ≈ 99 m/s (≈ 222 mph). This is my own derived check, scripts in an internal analysis script.
   - Either way, the description "on the runway" does not match the physics. Retune, or test in the original before relying on it.
2. **Mission rules are looser than their descriptions.**
   - THE REVEAL does not require a clean landing.
   - HALFPIPE HERO does not check that the car lands back in the pipe.
   - DOUBLE KICKFLIP completes mid-air even if the jump ends in a crash.
   - The lineup and Semi flyover checks have no upper height limit.
3. **Air rotation works with an empty tank.** Gas only gates the RCS drain and its flame.
4. **The ramp hint may mislead.** "Let go at the top to drop off like the reveal": at the top, releasing throttle while slower than 4 m/s drops suction to 2.5, which makes the car fall off (`rampFall`). A fall does not count as the inverted exit that THE REVEAL needs; only driving off the lip does.
5. **The 0–60 timer** counts its first frame twice and can be started during a burnout.
6. **The bullseye is tuned near a no-input shot (derived).** With no input, a 78 m/s launch lands ≈ 6.8 m short of the centre (inner ring), and an 80 m/s launch lands ≈ 7 m long. A BULLSEYE needs small corrections, which matches the toast's advice.

### 4.3 Contradictions between maps (both versions noted)

1. **Camera start position.** The three.js camera starts at (8, 3, 40); the rig `Ni` keeps an internal start of (0, 4, 40). Both are true; they are separate state.
2. **Bullseye distance.** "About 424 m" is measured from the mass driver's lip (x ≈ 288.9); "483 m" is measured from its origin (x 230).
3. **N8AO intensity.** The shader default is 10, the configuration default is 5, and the game sets 2.2.
4. **What `Rt` is for.** One map calls `Rt` "shared by all car models". The other maps show the player Roadster uses fx `U0` materials, and `Rt` is used only by the lineup vehicles.
5. **What the lineup is.** One map called the `G.lineup` group a "drag-lineup / start grid". It is the 5-vehicle display stage `qi`.
6. **What `mi()` textures.** One map said the wall; the other shows it is the loop track.
7. **0–60 numbers.** The title advertises "<0.9 s", the LAUNCH mission threshold is under 1.0 s, and the derived Shift+W time is ≈ 0.78 s.
8. **Mass driver end height.** The map's computed ≈ 28.99 m versus the closed-form ≈ 28.93 m local (+0.04 origin). Both round to ≈ 29 m.
9. **Game versus viewer settings.** These are deliberately different configs, not errors: bloom (0.92 / 1.25 / 0.78 versus 0.95 / 1 / 0.7), SMAA (HIGH versus MEDIUM), headlights (two spots at 1800 versus one at 60), wing ease rate (5 versus 4).

### 4.4 Provenance

- The lineup vehicle sizes and boxes came from running the builders in Node, using the harness at an internal analysis script.
- The mass-driver trajectory and top-speed estimates come from an internal analysis script and an internal analysis script.