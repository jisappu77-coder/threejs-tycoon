# Highway Tycoon

A 3D truck-stop tycoon built for Android mobile web. You start with one fuel pump on a
lonely highway; trucks pull in, you serve them by hand, they pay, and you spend the cash
on physical upgrades that visibly grow the stop until it owns the road. Across the road is
a city with its own street grid and traffic; behind the lot, a dirt track climbs into the
hills.

Built with Vite + TypeScript + three.js. The 3D art is Kenney's CC0 (public-domain)
low-poly kits (`public/models/`), lit by a Poly Haven CC0 HDRI (`public/env/`) and driving
over a Poly Haven CC0 asphalt PBR set (`public/textures/`) — each directory has its own
`CREDITS.md`. The markings, upgrade pads and the fuel island are still generated
procedurally in code, because no kit ships a fuel station and the world-space UI has to
match the game's own palette.

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

`build:single` inlines the styles, bundle and every binary asset — models, textures and
the HDRI, as data URIs on `window.__HT_ASSETS` — into `dist/highway-tycoon.html` so the
game can be hosted as a single page with no other files. It swaps the PWA plugin for a stub, since a service worker
cannot register from an embedded context — the normal `npm run build` is unaffected.

## Playing it

| Gesture | Action |
| --- | --- |
| One-finger drag | Pan the camera — the world follows your finger |
| Two fingers | Pinch to zoom, twist to rotate |
| Tap a cash pile | Collect it |
| Tap and **hold** a docked vehicle | Serve it by hand |
| Tap a glowing pad | Open its upgrade panel |

Progress saves to `localStorage` every 10 seconds and whenever the page is backgrounded.
Once you have hired an attendant, the stop keeps earning while the game is closed — at a
reduced rate, capped at 4 hours.

The rig orbits, so panning is built from the camera's own right and forward vectors rather
than a fixed rotation — an easy place to get a sign wrong in a way that looks correct at
one rotation and inverted at another, which is exactly what shipped first.
`src/render/IsoCamera.test.ts` pins it down by projecting a fixed world point through the
camera at four different yaws and checking it moves the same way the finger did.

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
            two-tier highway traffic (Traffic), and the city grid across the
            road with its own instanced buildings and traffic (City)
  sim/      The game itself: Vehicle state machine, ServiceStation, TruckStop,
            Economy, Progression, Save, and the separation pass that keeps
            vehicles out of each other. No three.js in here — it is all plain
            arithmetic, which is why it can be unit tested directly.
  input/    Touch/pointer gestures and a raycast picker
  ui/       DOM overlay (HUD, upgrade panel, toasts)
  data/     config.ts — every tunable number in the game
```

The simulation runs on a fixed 1/60s step with capped catch-up; rendering runs once per
frame. Systems tick in a deliberate order: input → traffic → stop → view sync → draw.

**Balancing** is a single-file edit: `src/data/config.ts` holds spawn rates, service times,
payouts, upgrade costs, queue capacity, camera limits and the city grid. Adding an upgrade
means adding a row to `UPGRADES`, not writing code.

## Traffic and the forecourt layout

Vehicles used to drive through each other around the pumps. Two things caused it, and both
are fixed in ways worth knowing about before moving a bay:

- **Routes are authored, not derived.** Each bay in `config.ts` carries its own `approach`
  and `exit` waypoints. The old code guessed an approach at `bay.x - 10`, which for the
  second canteen bay landed exactly on the first one. The forecourt is laid out as parallel
  corridors running away from the highway — exit lane, queue, canteen aisle, then the two
  fuel lanes — spaced far enough apart that vehicles in neighbouring corridors clear each
  other. Routes may *cross*; what they must never do is run alongside one another.
- **`sim/separation.ts` makes vehicles give way.** Once per step, any vehicle with another
  in the corridor directly ahead holds position. Ties (head-on, or two routes crossing) go
  to whoever has been on the road longer, so a pair can never deadlock staring at each
  other.

Some constraints cannot be fixed by yielding and have to hold in the layout itself:
`SERVICE.queueSpacing` must exceed the longest vehicle in `VEHICLE_FOOTPRINT`, because a
queued vehicle has arrived and will not move out of the way. `sim/separation.test.ts`
asserts that, and runs three minutes of full traffic checking that no two vehicles on the
forecourt ever overlap — as oriented boxes, not as circles.

Highway filler traffic is scenery with no separation logic of its own, so its spacing is a
property of how it moves: cars are dealt along the road in even slices and every car in a
lane runs at that lane's single speed. Per-car speeds looked better for a few seconds and
then fell apart, as a faster car slowly reeled in the one ahead and drove through it.

## Art and assets

Models load once at boot (`src/render/assets.ts`) behind a progress bar. The loader does
two things that matter:

- **Normalises** each model to a declared world-space size from its real bounding box, by
  height for tall things (trees, poles, people) and by length for everything else — so no
  hand-tuned scale numbers to break when a kit is updated.
- **Deduplicates materials** to one `MeshStandardMaterial` per colour atlas. Each Kenney
  kit ships its own `colormap.png`, so the share is per atlas; folding them together would
  paint every model with the wrong colours.

Everything is PBR and lit by an image-based environment (`src/render/environment.ts`
prefilters the HDRI into a PMREM cube). That is what gives paint and glass something to
reflect and stops the shadow side falling to flat black — the single biggest difference
between this build and the earlier Lambert one. The procedural materials in
`materials.ts` are `MeshStandardMaterial` too, so procedural and glTF meshes sit in the
same world rather than reading as two engines bolted together.

The far lane of highway traffic draws the real car models as `InstancedMesh` (one per
model, six models). It used to be a tinted rounded box, which was the most obviously cheap
thing on screen precisely because it sat next to the real models.

The city across the road (`world/City.ts`) is a real grid — an avenue parallel to the
highway, cross streets running back from it, blocks of buildings between — because the
traffic in it has to have somewhere to go, and cars sliding across a painted backdrop
read as fake the moment they move. Every building is instanced, so the whole skyline is a
handful of draw calls. Kenney's `low-detail-*` variants carry the bulk of the district and
the three full-detail towers are held back to the rear rows, which is what gives it depth.

The ground is a displaced mesh (`terrainHeight` in `render/meshes/terrain.ts`), flat
across the forecourt, highway and city — every road, bay and building is placed at y=0 and
none of them follow a slope — and rolling once past all of that. Scenery and the off-road
track sample the same function, so nothing floats or sinks on a hillside.

Kenney's Nature Kit foliage is a cool mint that clashes with this game's grass, so those
few materials are remapped by name to the game palette (`NATURE_PALETTE`). Note also that
the Car Kit has no articulated truck — the customer fleet is box trucks, pickups, vans
and flatbeds, and each model's paint colour is fixed by its atlas UVs, so variety comes
from using several models rather than from tinting one.

## Mobile performance

The renderer picks a quality tier at boot from device memory and core count, then steps it
down if frame times stay bad. **Every tier gets shadows and image-based lighting**; the
tier scales what they cost — pixel ratio (1.25 / 1.5 / 2), shadow map size (512 / 1024 /
2048), MSAA samples, bloom, contact shadows, scenery density and how many distant vehicles
exist. An earlier version switched shadows and anti-aliasing *off* on the low tier, which
made the game look broken rather than cheap; resolution is the thing to trade.

Force a tier with `?quality=low|medium|high` or `game.setQuality('high')` — the choice is
remembered in `localStorage`. This exists so a bad guess can be overridden on a real phone,
and so screenshots target a tier deliberately instead of whatever the machine picks.

Measured on a built-out scene at a 412x915 phone viewport (scene pass only, via
`renderer.info`):

| Tier | Draw calls | Triangles | Programs | Textures |
| --- | --- | --- | --- | --- |
| low | 269 | 179k | 28 | 39 |
| medium | 264 | 250k | 35 | 50 |
| high | 266 | 334k | 35 | 51 |

Repeated props and all scenery are drawn as `InstancedMesh`, materials are shared per
atlas, and geometry is cached and reused. Roughly fifty of those draw calls are the city,
which is the price of it being a real grid with traffic rather than a backdrop.

Total download is 7.4 MB, of which 7.0 MB is art (models 3.6 MB, textures 2.2 MB, HDRI
1.2 MB). The city buildings account for the 0.7 MB the models grew by: Kenney's
`low-detail-*` variants are 7-27 KB each, which is why a whole district of them is
affordable, and only three full-detail towers are vendored.

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
