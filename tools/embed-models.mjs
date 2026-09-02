/**
 * Rewrites each .glb so its texture is embedded in the binary chunk instead of
 * referenced as a sibling file.
 *
 * Kenney's kits reference `Textures/colormap.png` by relative path, which works
 * fine when the models are served as files. It cannot work when a model is
 * loaded from a `data:` URI — there is no directory to resolve against — so the
 * single-file build needs self-contained models.
 *
 * Usage: node tools/embed-models.mjs <srcDir> <outDir>
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function pad4(n) {
  return (4 - (n % 4)) % 4;
}

function readGlb(buf) {
  const total = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset < total) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'));
    else if (type === BIN_CHUNK) bin = Buffer.from(data);
    offset += 8 + length + pad4(length);
  }
  return { json, bin };
}

function writeGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc(pad4(jsonBuf.length), 0x20); // spaces
  const binPad = Buffer.alloc(pad4(bin.length), 0);

  const jsonLen = jsonBuf.length + jsonPad.length;
  const binLen = bin.length + binPad.length;
  const total = 12 + 8 + jsonLen + (binLen > 0 ? 8 + binLen : 0);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonLen, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);

  const parts = [header, jsonHeader, jsonBuf, jsonPad];
  if (binLen > 0) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binLen, 0);
    binHeader.writeUInt32LE(BIN_CHUNK, 4);
    parts.push(binHeader, bin, binPad);
  }
  return Buffer.concat(parts);
}

function embed(path) {
  const { json, bin } = readGlb(readFileSync(path));
  if (!json?.images?.some((image) => image.uri)) return null;

  let binOut = bin;
  json.bufferViews ??= [];
  for (const image of json.images) {
    if (!image.uri) continue;
    const png = readFileSync(join(dirname(path), decodeURIComponent(image.uri)));

    // bufferView offsets must stay 4-byte aligned.
    const padding = Buffer.alloc(pad4(binOut.length), 0);
    const byteOffset = binOut.length + padding.length;
    binOut = Buffer.concat([binOut, padding, png]);

    json.bufferViews.push({ buffer: 0, byteOffset, byteLength: png.length });
    image.bufferView = json.bufferViews.length - 1;
    image.mimeType = image.mimeType ?? 'image/png';
    delete image.uri;
  }

  json.buffers = [{ byteLength: binOut.length + pad4(binOut.length) }];
  return writeGlb(json, binOut);
}

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('usage: node tools/embed-models.mjs <srcDir> <outDir>');
  process.exit(1);
}

let embedded = 0;
let copied = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!name.endsWith('.glb')) continue;
    const target = join(outDir, relative(srcDir, path));
    mkdirSync(dirname(target), { recursive: true });
    const result = embed(path);
    if (result) {
      writeFileSync(target, result);
      embedded++;
    } else {
      writeFileSync(target, readFileSync(path));
      copied++;
    }
  }
})(srcDir);

console.warn(`embedded textures in ${embedded} models, copied ${copied} unchanged`);
