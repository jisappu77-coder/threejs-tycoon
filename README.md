# Highway Tycoon

A 3D truck-stop tycoon built for Android mobile web. You start with one fuel pump on a
lonely highway; trucks pull in, you serve them by hand, they pay, and you spend the cash
on physical upgrades that visibly grow the stop until it owns the road.

Built with Vite + TypeScript + three.js. The 3D art is Kenney's CC0 (public-domain)
low-poly kits, vendored in `public/models/` — see `public/models/CREDITS.md`. The road
surface, markings, upgrade pads and the fuel island are still generated procedurally in
code, because no kit ships a fuel station and the world-space UI has to match the game's
own palette.

**Play it:** https://jisappu77-coder.github.io/threejs-tycoon/ — deployed from `claude/dev`
on every push by `.github/workflows/deploy.yml`.

## Running it

```bash
npm install
npm run dev        # dev server
npm run build      # production build into dist/
npm run preview    # serve the production build (add --host to open it on a phone)
npm run test       # unit tests (Vitest, no WebGL needed)
npm run lint
npm run typecheck

npm run build:single   # one self-contained HTML page, for sharing a playable link
```

`build:single` inlines the styles and bundle into `dist/highway-tycoon.html` so the game
can be hosted as a single page. It swaps the PWA plugin for a stub, since a service worker
cannot register from an embedded context — the normal `npm run build` is unaffected.

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
  render/   Renderer + quality tiers, isometric camera rig, three-light rig,
            post-processing (grade/vignette, tier-gated bloom), the glTF asset
            loader in assets.ts, procedural textures, and the remaining
            procedural mesh builders in render/meshes/
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

## Art and assets

Models load once at boot (`src/render/assets.ts`) behind a progress bar. The loader does
two things that matter:

- **Normalises** each model to a declared world-space size from its real bounding box, by
  height for tall things (trees, poles, people) and by length for everything else — so no
  hand-tuned scale numbers to break when a kit is updated.
- **Deduplicates materials** to one Lambert per colour atlas. Each Kenney kit ships its
  own `colormap.png`, so the share is per atlas; folding them together would paint every
  model with the wrong colours.

Kenney's Nature Kit foliage is a cool mint that clashes with this game's grass, so those
few materials are remapped by name to the game palette (`NATURE_PALETTE`). Note also that
the Car Kit has no articulated truck — the customer fleet is box trucks, pickups, vans
and flatbeds, and each model's paint colour is fixed by its atlas UVs, so variety comes
from using several models rather than from tinting one.

## Mobile performance

The renderer picks a quality tier at boot from device memory, core count and pixel count,
then steps it down if frame times stay bad. The tier controls pixel ratio, shadows, tree
count and how many distant vehicles exist. A fully built-out scene is roughly 145 draw
calls and 58k triangles: repeated props and all scenery are drawn as `InstancedMesh`,
materials are shared per atlas, and geometry is cached and reused.

## Deployment

`.github/workflows/deploy.yml` typechecks, lints, tests and builds on every push to
`claude/dev`, then publishes `dist/` to GitHub Pages. Pull requests run the same checks
without publishing. Each run also attaches a self-contained `highway-tycoon.html` as a
downloadable artifact.

Two settings have to be right for the deploy to work, and neither can be set from CI:

- The repo must be **public**, unless the account has GitHub Pro/Team — Pages is not
  available for private repos on the free plan.
- **Settings → Pages → Source** must be set to **GitHub Actions**. If it is not, the
  deploy job fails with a "Pages not enabled" error; fix the setting and re-run the
  workflow (it has a `workflow_dispatch` trigger for exactly this).

The site is served from a project sub-path (`/threejs-tycoon/`), so CI builds with
`VITE_BASE=/threejs-tycoon/`. Locally and for the Capacitor build, `base` stays relative
(`./`) — see the comment in `vite.config.ts`.

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
