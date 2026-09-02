# Highway Tycoon

A 3D truck-stop tycoon built for Android mobile web. You start with one fuel pump on a
lonely highway; trucks pull in, you serve them by hand, they pay, and you spend the cash
on physical upgrades that visibly grow the stop until it owns the road.

Built with Vite + TypeScript + three.js. All 3D art is procedural low-poly geometry
generated in code — there is no asset pipeline and nothing to download but the bundle.

## Running it

```bash
npm install
npm run dev        # dev server
npm run build      # production build into dist/
npm run preview    # serve the production build (add --host to open it on a phone)
npm run test       # unit tests (Vitest, no WebGL needed)
npm run lint
npm run typecheck
```

## Playing it

| Gesture | Action |
| --- | --- |
| One-finger drag | Pan the camera |
| Two fingers | Pinch to zoom, twist to rotate |
| Tap a cash pile | Collect it |
| Tap and **hold** a docked vehicle | Serve it by hand |
| Tap a glowing pad | Open its upgrade panel |

Progress saves to `localStorage` every 10 seconds and whenever the page is backgrounded.
Once you have hired an attendant, the stop keeps earning while the game is closed — at a
reduced rate, capped at 4 hours.

To wipe your save, run `game.reset()` in the browser console.

## How it fits together

```
src/
  core/     Game loop, fixed-timestep clock, typed event emitter, seeded RNG
  render/   Renderer + quality tiers, isometric camera rig, lighting, shared
            materials, and the procedural mesh builders in render/meshes/
  world/    Terrain and structures (World), the stop's dynamic props (StopView),
            and two-tier highway traffic (Traffic)
  sim/      The game itself: Vehicle state machine, ServiceStation, TruckStop,
            Economy, Progression, Save. No three.js in here — it is all plain
            arithmetic, which is why it can be unit tested directly.
  input/    Touch/pointer gestures and a raycast picker
  ui/       DOM overlay (HUD, upgrade panel, toasts)
  data/     config.ts — every tunable number in the game
```

The simulation runs on a fixed 1/60s step with capped catch-up; rendering runs once per
frame. Systems tick in a deliberate order: input → traffic → stop → view sync → draw.

**Balancing** is a single-file edit: `src/data/config.ts` holds spawn rates, service times,
payouts, upgrade costs, queue capacity and camera limits. Adding an upgrade means adding a
row to `UPGRADES`, not writing code.

## Mobile performance

The renderer picks a quality tier at boot from device memory, core count and pixel count,
then steps it down if frame times stay bad. The tier controls pixel ratio, shadows, tree
count and how many distant vehicles exist. The scene is kept to a few dozen draw calls by
sharing one material per colour, caching geometry, and drawing repeated props (trees, road
dashes, distant traffic) as `InstancedMesh`.

## Android APK

The game currently ships as an installable PWA. It is written so that wrapping it with
[Capacitor](https://capacitorjs.com) needs no game-code changes: assets use relative paths
(`base: './'`), there is no server dependency, the UI respects `env(safe-area-inset-*)`, and
the loop pauses and saves on `visibilitychange`/`pagehide` — the events an Android WebView
actually fires.

When you want the APK:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Highway Tycoon" com.example.highwaytycoon --web-dir=dist
npx cap add android
npm run build && npx cap sync
# then build a signed release in Android Studio, or:
cd android && ./gradlew assembleRelease
```

## What is in this slice

Playable: fuel station, dhaba canteen, arriving traffic, queueing, manual and automated
service, cash drops, five upgrades bought as physical pads, save/load with offline earnings,
touch camera and PWA install.

Shaped but not built, with the seams left deliberately visible: a repair & wash station
(add a `StationDef` with `kind: 'repair'` plus a mesh builder), rival stops along the same
highway (anchor them at the boundary landmarks), prestige and further highway locations
(`Progression.prestige()`).
