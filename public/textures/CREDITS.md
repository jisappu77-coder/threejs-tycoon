# Ground and road textures

CC0 1.0 (public domain) PBR texture sets from [Poly Haven](https://polyhaven.com):

| Files | Source | Author |
| --- | --- | --- |
| `asphalt_*` | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel |

Only the road surface is photographic. Photographic grass was tried and rejected: Poly
Haven's ground sets are naturalistic (dry, rocky, leaf-littered) and read as mud beside
the stylised models. The grass is generated procedurally instead.

Each set is `_diff` (base colour), `_nor` (OpenGL normal map) and `_arm` (ambient
occlusion / roughness / metalness packed into R / G / B). 1K resolution — the ground is
seen at a distance and from a fixed camera pitch, so a larger source would cost download
size for no visible gain.

License: https://creativecommons.org/publicdomain/zero/1.0/
