/**
 * Builds a single self-contained HTML fragment from dist/, for sharing the
 * game as one hostable page. The output has no <html>/<head>/<body> wrapper —
 * just a title, inlined styles, the markup, and the inlined bundle — so it can
 * be dropped into any host page.
 *
 * Usage: SINGLE_FILE=1 npm run build && node tools/single-file.mjs [outPath]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = process.argv[2] ?? join(dist, 'highway-tycoon.html');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const bundleFiles = readdirSync(join(dist, 'assets'));

const jsName = bundleFiles.find((f) => f.endsWith('.js'));
const cssName = bundleFiles.find((f) => f.endsWith('.css'));
if (!jsName) throw new Error('No JS bundle found in dist/assets');

const js = readFileSync(join(dist, 'assets', jsName), 'utf8');
const css = cssName ? readFileSync(join(dist, 'assets', cssName), 'utf8') : '';

// Inline every binary asset as a data URI. A single-page build has nowhere to
// serve files from, so models, textures and the HDRI travel inside the HTML.
// Models must already have their textures embedded (tools/embed-models.mjs) —
// a data URI has no directory for a relative texture path to resolve against.
const MIME = {
  '.glb': 'model/gltf-binary',
  '.hdr': 'image/vnd.radiance',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};
const assets = {};
for (const top of ['models', 'textures', 'env']) {
  const dir = join(dist, top);
  if (!existsSync(dir)) continue;
  (function walk(current) {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const ext = name.slice(name.lastIndexOf('.'));
      const mime = MIME[ext];
      if (!mime) continue;
      const key = relative(dist, path).split(/[\\/]/).join('/');
      assets[key] = `data:${mime};base64,${readFileSync(path).toString('base64')}`;
    }
  })(dir);
}

// Pull the page body out of the built index.html so the markup stays in one
// place (index.html) rather than being duplicated here.
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
const markup = body
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link[^>]*>/g, '')
  .trim();

// A charset declaration has to come first: the output is a fragment with no
// <head>, so without this the host page's default decoding mangles the UTF-8
// glyphs in the HUD (the level star and the separator dot). Browsers honour a
// meta charset found anywhere in the first 1024 bytes.
const page = `<meta charset="utf-8">
<title>Highway Tycoon</title>
<style>
${css}
</style>
${markup}
<script>window.__HT_ASSETS = ${JSON.stringify(assets)};</script>
<script type="module">
${js}
</script>
`;

writeFileSync(out, page);
console.warn(
  `wrote ${out} (${(Buffer.byteLength(page) / 1024 / 1024).toFixed(2)} MB, ` +
    `${Object.keys(assets).length} assets inlined)`,
);
