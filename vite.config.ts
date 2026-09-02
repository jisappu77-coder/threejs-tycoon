import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * SINGLE_FILE=1 builds a bundle meant to be inlined into one HTML page (see
 * tools/single-file.mjs) for sharing a playable link. A service worker cannot
 * be registered from that context, so the PWA plugin is swapped for a stub
 * that satisfies the `virtual:pwa-register` import.
 */
const singleFile = process.env.SINGLE_FILE === '1';

function pwaRegisterStub(): Plugin {
  const id = 'virtual:pwa-register';
  return {
    name: 'pwa-register-stub',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load: (resolved) =>
      resolved === `\0${id}` ? 'export function registerSW() {}' : null,
  };
}

export default defineConfig({
  // Relative by default, so the same dist/ works from a plain web server AND
  // from an Android WebView origin when this is later wrapped with Capacitor.
  //
  // CI overrides it for GitHub Pages, where the site is served from a project
  // sub-path: the bundle and models resolve fine either way, but the service
  // worker's navigation fallback needs an absolute path to behave.
  base: process.env.VITE_BASE ?? './',
  build: {
    target: 'es2020',
    sourcemap: !singleFile,
    ...(singleFile ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {}),
  },
  plugins: singleFile ? [pwaRegisterStub()] : [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Highway Tycoon',
        short_name: 'Highway',
        description: 'Grow a roadside stop into a highway empire.',
        theme_color: '#12161d',
        background_color: '#12161d',
        display: 'fullscreen',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
