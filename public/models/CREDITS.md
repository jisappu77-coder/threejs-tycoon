# Third-party 3D assets

All models in this directory are by **Kenney** (https://kenney.nl) and are released
under **CC0 1.0 Universal (public domain dedication)**:
https://creativecommons.org/publicdomain/zero/1.0/

CC0 places the work in the public domain — it may be used commercially, modified and
redistributed with no attribution required. The credit below is given voluntarily,
because Kenney's work deserves it.

| Directory | Kenney pack | Source |
| --- | --- | --- |
| `cars/` | Car Kit | https://kenney.nl/assets/car-kit |
| `nature/` | Nature Kit | https://kenney.nl/assets/nature-kit |
| `commercial/` | City Kit (Commercial) | https://kenney.nl/assets/city-kit-commercial |
| `industrial/` | City Kit (Industrial) | https://kenney.nl/assets/city-kit-industrial |
| `roads/` | City Kit (Roads) | https://kenney.nl/assets/city-kit-roads |
| `characters/` | Mini Characters | https://kenney.nl/assets/mini-characters |

Only the models actually used by the game are vendored here, in glTF binary (`.glb`)
format. They are unmodified originals; all scaling happens at runtime in
`src/render/assets.ts`.

Each kit keeps its own directory because the models reference their colour atlas by the
relative path `Textures/colormap.png`, and every kit ships a different atlas — flattening
them into one folder would paint every model with the wrong colours. The Nature Kit has
no atlas at all: it colours by material instead.

## What is *not* from Kenney

The road surface, ground, lane markings, upgrade pads, cash piles, progress bars and the
fuel island and its canopy are generated procedurally in code (`src/render/meshes/`).
Kenney has no fuel-station model, and the pads and HUD-like world objects need to match
the game's own palette rather than the asset atlas.
