# Docs for agents

`SPEC.md` describes the original game (mechanics, physics constants, missions, camera, audio, HUD) as reverse-engineered from the shipped bundle. It names code by the bundle's minified symbols and the line numbers of `ru/main.pretty.js` and `ru/fx.pretty.js`. `CRITIQUE.json` lists weak points of the original.

## Where each minified line range lives in `src/`

| Bundle | Lines | File |
|---|---|---|
| fx | 28704-28805 | `src/car/loft.js` |
| fx | 28806-29068 | `src/car/profile.js` |
| fx | 29069-29221 | `src/car/materials.js` |
| fx | 29222-29329 | `src/car/wheels.js` |
| fx | 29330-29651 | `src/car/roadster.js` |
| fx | 29652-29805 | `src/fx/smoke.js` |
| fx | 29806-29864 | `src/fx/plumes.js` |
| fx | 29865-29927 | `src/fx/skids.js` |
| fx | 29928-30006 | `src/fx/sparks.js` |
| main | 1712-2106 | `src/world/ramp.js` |
| main | 2107-2190 | `src/world/concrete-texture.js` |
| main | 2191-2384 | `src/world/halfpipe.js` |
| main | 2385-2597 | `src/world/loop.js` |
| main | 2598-2787 | `src/world/mass-driver.js` |
| main | 2788-2863 | `src/world/bullseye.js` |
| main | 2864-2946 | `src/world/helpers.js` |
| main | 2947-2957 | `src/world/layout.js` |
| main | 2958-3272 | `src/world/environment.js` |
| main | 3273-3310 | `src/world/sky.js` |
| main | 3311-3409 | `src/world/ground.js` |
| main | 3410-3444 | `src/world/barriers.js` |
| main | 3445-3552 | `src/world/floodlights.js` |
| main | 3553-3585 | `src/world/env-map.js` |
| main | 3586-3620 | `src/util/math.js` |
| main | 3621-3771 | `src/vehicles/materials.js` |
| main | 3772-3818 | `src/vehicles/spline.js` |
| main | 3819-4105 | `src/vehicles/loft.js` |
| main | 4106-4235 | `src/vehicles/projector.js` |
| main | 4236-4505 | `src/vehicles/decals.js` |
| main | 4506-4660 | `src/vehicles/wheels.js` |
| main | 4661-4756 | `src/vehicles/parts.js` |
| main | 4757-5019 | `src/vehicles/model3.js` |
| main | 5020-5281 | `src/vehicles/model-y.js` |
| main | 5282-5464 | `src/vehicles/cybercab.js` |
| main | 5465-5708 | `src/vehicles/cybertruck.js` |
| main | 5709-5986 | `src/vehicles/semi.js` |
| main | 5987-6037 | `src/world/lineup.js` |
| main | 6038-6759 | `src/physics/car-physics.js` |
| main | 6760-6928 | `src/camera/camera-director.js` |
| main | 6929-6981 | `src/game/missions.js` |
| main | 6982-7377 | `src/game/game-state.js` |
| main | 7378-7389 | `src/util/storage.js` |
| main | 7390-7522 | `src/ui/hud.js` |
| main | 7523-8772 | `src/audio/audio.js` |
| main | 8773-8868 | `src/input/touch-controls.js` |
| main | 8869-9584 | `src/main.js` |
| viewer | 5310-99999 | `src/viewer.js` |

## Minified names that were given real names

| Bundle:symbol | Name in `src/` |
|---|---|
| `fx:P0` | `loftBody` |
| `fx:Jt` | `profileSpline` |
| `fx:Cn` | `CAR_DIMS` |
| `fx:L0` | `makeSections` |
| `fx:U0` | `createCarMaterials` |
| `fx:B0` | `makePlateTexture` |
| `fx:N0` | `makeUnderbodyTexture` |
| `fx:O0` | `buildWheel` |
| `fx:lx` | `buildRoadster` |
| `fx:F0` | `makePuffTexture` |
| `fx:ux` | `SmokeSystem` |
| `fx:$c` | `plumeMaterial` |
| `fx:hx` | `ThrusterPlumes` |
| `fx:fx` | `SkidMarks` |
| `fx:dx` | `Sparks` |
| `main:ne` | `ProfileRamp` |
| `main:Os` | `makeConcreteTextures` |
| `main:Us` | `seededRandom` |
| `main:ni` | `Halfpipe` |
| `main:ci` | `Loop` |
| `main:ui` | `MassDriver` |
| `main:pi` | `BullseyeTarget` |
| `main:Qs` | `buildStruts` |
| `main:Be` | `footprintToBox` |
| `main:gs` | `makeNeonSign` |
| `main:mi` | `makeStripeTexture` |
| `main:G` | `WORLD` |
| `main:gi` | `buildEnvironment` |
| `main:wi` | `buildSky` |
| `main:vi` | `buildGround` |
| `main:Mi` | `buildFloodlight` |
| `main:bi` | `glowTexture` |
| `main:Si` | `buildEnvMap` |
| `main:Zs` | `beamMaterial` |
| `main:X` | `Vec3` |
| `main:E` | `PI` |
| `main:Bt` | `clamp` |
| `main:ht` | `lerp` |
| `main:js` | `mergeGeometries` |
| `main:Rt` | `vehicleMaterials` |
| `main:Ti` | `brushedTexture` |
| `main:Di` | `monotoneSpline` |
| `main:ce` | `SurfaceProjector` |
| `main:Ci` | `buildModel3` |
| `main:Bi` | `buildModelY` |
| `main:Vi` | `buildCybercab` |
| `main:Ei` | `buildCybertruck` |
| `main:Hi` | `buildSemi` |
| `main:qi` | `buildLineup` |
| `main:ze` | `GRAVITY` |
| `main:he` | `UP` |
| `main:As` | `WHEELBASE` |
| `main:ot` | `TUNING` |
| `main:Wi` | `CarPhysics` |
| `main:Ke` | `CAMERA_MODES` |
| `main:Ni` | `CameraDirector` |
| `main:fe` | `MISSIONS` |
| `main:Oi` | `MPS_TO_MPH` |
| `main:Ui` | `GameState` |
| `main:Xe` | `storageGet` |
| `main:de` | `storageSet` |
| `main:it` | `qs` |
| `main:Yi` | `Hud` |
| `main:Zi` | `AudioEngine` |
| `main:Ki` | `TouchControls` |

Every other symbol keeps its minified name in `src/`, so `grep -rn 'symbol' src/` finds it.
