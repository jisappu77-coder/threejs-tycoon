/**
 * The single-file build has nowhere to serve binary assets from, so
 * `tools/single-file.mjs` inlines every model, texture and HDRI as a data URI
 * on this global, keyed by its path relative to `dist/`.
 *
 * Loaders check here first and fall back to the network, so the same source
 * works for the served build and the one-page build with no branching at the
 * call sites.
 */
type InlineAssets = Record<string, string>;

export function inlinedUrl(path: string): string | null {
  const map = (window as Window & { __HT_ASSETS?: InlineAssets }).__HT_ASSETS;
  return map?.[path] ?? null;
}
