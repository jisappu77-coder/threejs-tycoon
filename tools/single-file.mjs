/**
 * Builds a single self-contained HTML fragment from dist/, for sharing the
 * game as one hostable page. The output has no <html>/<head>/<body> wrapper —
 * just a title, inlined styles, the markup, and the inlined bundle — so it can
 * be dropped into any host page.
 *
 * Usage: SINGLE_FILE=1 npm run build && node tools/single-file.mjs [outPath]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = process.argv[2] ?? join(dist, 'highway-tycoon.html');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));

const jsName = assets.find((f) => f.endsWith('.js'));
const cssName = assets.find((f) => f.endsWith('.css'));
if (!jsName) throw new Error('No JS bundle found in dist/assets');

const js = readFileSync(join(dist, 'assets', jsName), 'utf8');
const css = cssName ? readFileSync(join(dist, 'assets', cssName), 'utf8') : '';

// Inline every model as a data URI. A single-page build has nowhere to serve
// .glb files from, so the models travel inside the HTML. They must already have
// their textures embedded (tools/embed-models.mjs) — a data URI has no
// directory for a relative texture path to resolve against.
const modelsDir = join(dist, 'models');
const models = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!name.endsWith('.glb')) continue;
    const key = relative(modelsDir, path).split(/[\\/]/).join('/');
    models[key] = `data:model/gltf-binary;base64,${readFileSync(path).toString('base64')}`;
  }
})(modelsDir);

// Pull the page body out of the built index.html so the markup stays in one
// place (index.html) rather than being duplicated here.
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
const markup = body
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link[^>]*>/g, '')
  .trim();

const page = `<title>Highway Tycoon</title>
<style>
${css}
</style>
${markup}
<script>window.__HT_MODELS = ${JSON.stringify(models)};</script>
<script type="module">
${js}
</script>
`;

writeFileSync(out, page);
console.warn(
  `wrote ${out} (${(Buffer.byteLength(page) / 1024 / 1024).toFixed(2)} MB, ` +
    `${Object.keys(models).length} models inlined)`,
);
