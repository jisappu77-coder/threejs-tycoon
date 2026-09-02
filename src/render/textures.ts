import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * Procedural textures painted into a canvas at boot. Flat untextured colour is
 * what makes primitive geometry read as programmer art; a little surface
 * variation does more for the look than extra polygons, and costs no assets
 * and no download.
 *
 * Textures are small and tiled. Everything is cached by key — a texture is
 * built once and shared by every material that asks for it.
 */

const cache = new Map<string, Texture>();

type Painter = (ctx: CanvasRenderingContext2D, size: number) => void;

function make(key: string, size: number, repeat: number, paint: Painter): Texture {
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  paint(ctx, size);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

/**
 * Returns a copy of a texture tiled to a surface's real proportions. A box
 * face maps UVs 0..1 regardless of its size, so one shared repeat value
 * stretches the tile on every non-square surface and the seams read as a
 * pattern. Clones share the underlying image, so this costs almost nothing.
 */
const tiledCache = new Map<string, Texture>();
let tiledId = 0;
const tiledIds = new WeakMap<Texture, number>();

export function tiled(texture: Texture, width: number, depth: number, unitsPerTile = 7): Texture {
  let id = tiledIds.get(texture);
  if (id === undefined) {
    id = tiledId++;
    tiledIds.set(texture, id);
  }
  const rx = Math.max(1, Math.round(width / unitsPerTile));
  const ry = Math.max(1, Math.round(depth / unitsPerTile));
  const key = `${id}:${rx}:${ry}`;
  const hit = tiledCache.get(key);
  if (hit) return hit;

  const copy = texture.clone();
  copy.wrapS = RepeatWrapping;
  copy.wrapT = RepeatWrapping;
  copy.repeat.set(rx, ry);
  copy.needsUpdate = true;
  tiledCache.set(key, copy);
  return copy;
}

/** Deterministic pseudo-random, so a texture looks the same every session. */
function rand(seed: { v: number }): number {
  seed.v = (seed.v * 1664525 + 1013904223) >>> 0;
  return seed.v / 4294967296;
}

/** Soft mottled blobs — the base of every organic surface here. */
function mottle(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: { v: number },
  colors: string[],
  count: number,
  radius: [number, number],
): void {
  for (let i = 0; i < count; i++) {
    const x = rand(seed) * size;
    const y = rand(seed) * size;
    const r = radius[0] + rand(seed) * (radius[1] - radius[0]);
    const color = colors[Math.floor(rand(seed) * colors.length)]!;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: { v: number },
  colors: string[],
  count: number,
  maxSize = 2,
): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand(seed) * colors.length)]!;
    const s = 0.5 + rand(seed) * maxSize;
    ctx.fillRect(rand(seed) * size, rand(seed) * size, s, s);
  }
}

/** Grass: mottled greens with fine blade flecks. */
export function grassTexture(): Texture {
  return make('grass', 256, 64, (ctx, size) => {
    const seed = { v: 7 };
    ctx.fillStyle = '#6f8f4f';
    ctx.fillRect(0, 0, size, size);
    // Low-contrast, small-radius mottle only. Large bold blobs tile into a
    // visible grid across a ground plane this size; the fine blade flecks
    // below carry the texture instead.
    mottle(
      ctx,
      size,
      seed,
      ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.06)'],
      60,
      [8, 26],
    );
    // Blade flecks, slightly vertical so the ground reads as grass not gravel.
    for (let i = 0; i < 1600; i++) {
      ctx.strokeStyle =
        rand(seed) > 0.5 ? 'rgba(150,178,104,0.5)' : 'rgba(80,106,54,0.45)';
      ctx.lineWidth = 1;
      const x = rand(seed) * size;
      const y = rand(seed) * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand(seed) - 0.5) * 2, y - 1 - rand(seed) * 3);
      ctx.stroke();
    }
  });
}

/**
 * Asphalt: gritty, with lighter wear speckle. `base` lets the forecourt be
 * paved a shade lighter than the highway so the two read as different
 * surfaces — a tint multiplier can only darken, never lighten.
 */
export function asphaltTexture(repeat = 16, base = '#3c414b'): Texture {
  return make(`asphalt${repeat}${base}`, 256, repeat, (ctx, size) => {
    const seed = { v: 91 };
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // Low-contrast mottle: strong blobs turn into an obvious repeating
    // pattern once the texture tiles across a big forecourt.
    mottle(
      ctx,
      size,
      seed,
      ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.07)'],
      50,
      [16, 44],
    );
    speckle(
      ctx,
      size,
      seed,
      ['rgba(150,156,166,0.5)', 'rgba(28,31,37,0.6)', 'rgba(108,114,124,0.35)'],
      5000,
      1.8,
    );
  });
}

/** Concrete: pale, fine-grained, with a few hairline cracks. */
export function concreteTexture(): Texture {
  return make('concrete', 256, 6, (ctx, size) => {
    const seed = { v: 313 };
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(0, 0, size, size);
    mottle(ctx, size, seed, ['rgba(176,182,190,0.4)', 'rgba(126,132,140,0.4)'], 30, [
      20, 64,
    ]);
    speckle(ctx, size, seed, ['rgba(200,205,212,0.4)', 'rgba(110,116,124,0.4)'], 2200);
    ctx.strokeStyle = 'rgba(96,102,110,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      let x = rand(seed) * size;
      let y = rand(seed) * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += (rand(seed) - 0.5) * 40;
        y += (rand(seed) - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/** Painted metal panel: subtle vertical seams and a soft sheen band. */
export function panelTexture(base: string, seam: string): Texture {
  return make(`panel${base}${seam}`, 128, 1, (ctx, size) => {
    const seed = { v: 555 };
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const sheen = ctx.createLinearGradient(0, 0, 0, size);
    sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = seam;
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= size; x += size / 3) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    speckle(ctx, size, seed, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.10)'], 400);
  });
}

/** Rendered/plastered wall for the dhaba. */
export function plasterTexture(): Texture {
  return make('plaster', 128, 3, (ctx, size) => {
    const seed = { v: 1201 };
    ctx.fillStyle = '#e8d9be';
    ctx.fillRect(0, 0, size, size);
    mottle(ctx, size, seed, ['rgba(244,236,220,0.5)', 'rgba(206,190,164,0.45)'], 40, [
      10, 40,
    ]);
    speckle(ctx, size, seed, ['rgba(190,174,146,0.35)', 'rgba(252,246,234,0.35)'], 1800);
    // Damp line along the base, the way roadside buildings actually weather.
    const damp = ctx.createLinearGradient(0, size, 0, size * 0.72);
    damp.addColorStop(0, 'rgba(150,132,104,0.4)');
    damp.addColorStop(1, 'rgba(150,132,104,0)');
    ctx.fillStyle = damp;
    ctx.fillRect(0, size * 0.72, size, size * 0.28);
  });
}

/** Corrugated / tiled roof, drawn as ribbed rows. */
export function roofTexture(): Texture {
  return make('roof', 128, 5, (ctx, size) => {
    const seed = { v: 77 };
    ctx.fillStyle = '#c0553f';
    ctx.fillRect(0, 0, size, size);
    const step = size / 10;
    for (let y = 0; y < size; y += step) {
      const g = ctx.createLinearGradient(0, y, 0, y + step);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, size, step);
    }
    speckle(ctx, size, seed, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.10)'], 700);
  });
}

/** Timber for posts and veranda beams. */
export function woodTexture(): Texture {
  return make('wood', 128, 2, (ctx, size) => {
    const seed = { v: 404 };
    ctx.fillStyle = '#9c6b3f';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle =
        rand(seed) > 0.5 ? 'rgba(122,82,46,0.5)' : 'rgba(180,136,90,0.35)';
      ctx.lineWidth = 0.6 + rand(seed) * 1.6;
      const y = rand(seed) * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + (rand(seed) - 0.5) * 8, size * 0.7, y + (rand(seed) - 0.5) * 8, size, y + (rand(seed) - 0.5) * 5);
      ctx.stroke();
    }
  });
}

/** Dirt/gravel verge where the tarmac meets the grass. */
export function dirtTexture(): Texture {
  return make('dirt', 128, 10, (ctx, size) => {
    const seed = { v: 8821 };
    ctx.fillStyle = '#a8875c';
    ctx.fillRect(0, 0, size, size);
    mottle(ctx, size, seed, ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.08)'], 30, [
      8, 26,
    ]);
    speckle(ctx, size, seed, ['rgba(96,76,50,0.5)', 'rgba(212,186,146,0.4)'], 2600, 2.4);
  });
}
