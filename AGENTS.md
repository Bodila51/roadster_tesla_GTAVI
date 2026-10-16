# Roadster v2: working notes for every agent

This is Yarik's "Roadster Unleashed" browser game (his earlier Codex build), recovered from its production bundle into readable ES modules. Mechanics must stay exactly as they are. The look and sound get redone so the new game does not look or sound like the old one.

## Run and test
- `npm run build` builds into `dist/`.
- `node tools/play.mjs --out shot.png [--tp spawn|ramp|lineup|runway|donut|halfpipe|loop|massdriver] [--keys "KeyW:3000,KeyW+Space:800,wait:500"] [--size 844x390] [--title] [--page viewer.html] [--eval "js"]` serves `dist/`, starts the game, drives it in headless Chromium (software WebGL, so a low frame rate is normal) and saves a screenshot. It prints console errors.
- Debug handle in the page: `window.__rd` (`phys`, `game`, `car`, `scene`, `camera`, `renderer`, `composer`, `audio`, `teleport(name)`, `startGame()`).
- Controls: W/S drive, A/D steer, Space lift thrusters, Shift rear thrust, Q drift, C camera, R reset.

## Rules
- Do not change gameplay: physics (`src/physics`), scoring and missions (`src/game`), camera logic (`src/camera`), input logic, or the geometry and positions of the world (ramps, lineup, colliders). Materials, lights, textures, effects and sounds are fair game.
- Edit only the files your brief says you own. If you must touch `src/main.js` or `src/viewer.js`, keep the change small and local, and say so in your report.
- Keep every public interface other files call (class names, constructor arguments, method names, returned object fields), unless your brief says otherwise.
- Assets: only CC0, MIT or self-made. Add each source to `CREDITS.md`.
- No Tesla logos or badges. The game stays "fan-made, not affiliated with Tesla".
- Phones matter: most players come from X on a phone. Keep draw calls, lights, texture sizes and file sizes modest.
- Commit your work in your own clone with clear messages. Never push anywhere.

## Art direction (shared)
Realistic daytime at a Texas test site: clear afternoon sun, light haze, blue sky, clean concrete and asphalt. It should feel like a premium car commercial, and clearly different from the old night/neon version. The Roadster follows Yarik's reference video: white upper body, dark grey lower sills, one big bronze-tinted glass canopy, black turbine wheels, a thin full-width red taillight, a thin cyan front strip, 4 lift jets underneath and 2 at the rear, and dense white cold-gas vapor when the jets fire.

References: `/mnt/project-files/x-posts/roadster-game/ref/` (reveal frames) and `ref/video-frames/` (frames of Yarik's reference video). Brief: `/mnt/project-files/x-posts/roadster-game/PROJECT-CONTEXT.md`.

## Network
Reachable: npm registry, PyPI, raw.githubusercontent.com, codeload.github.com. Blocked: Poly Haven, ambientCG, Sketchfab, Freesound, kenney.nl, jsDelivr, unpkg and most other sites.
