# Environment map

`sky_1k.hdr` is **Kloofendal 43d Clear (Pure Sky)** by **Greg Zaal**, from
[Poly Haven](https://polyhaven.com/a/kloofendal_43d_clear_puresky), released under
**CC0 1.0** (public domain): https://creativecommons.org/publicdomain/zero/1.0/

It is used only as an image-based lighting source — it gives materials something to
reflect and fills shadows with sky colour. The visible sky in game is the procedural
gradient dome in `src/render/meshes/terrain.ts`, not this image.

1K resolution was chosen deliberately: the map is prefiltered into a small PMREM cube at
load, so a larger source would cost download size for no visible gain.
