import { registerSW } from 'virtual:pwa-register';
import { Game } from './core/Game';
import { loadAssets } from './render/assets';
import './ui/style.css';

const canvas = document.getElementById('game');
const boot = document.getElementById('boot');

function showBoot(html: string): void {
  if (!boot) return;
  boot.innerHTML = html;
  boot.classList.remove('hidden');
}

async function main(): Promise<void> {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas #game is missing');
  }

  // The 3D models have to be in memory before the world can be built, so the
  // loading screen is a real step rather than a flash.
  showBoot('<div class="boot-inner"><h1>Highway Tycoon</h1><p id="boot-status">Loading the highway…</p><div class="boot-bar"><i id="boot-fill"></i></div></div>');
  const fill = document.getElementById('boot-fill');
  await loadAssets((ratio) => {
    if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
  });

  const game = new Game(canvas);
  game.start();
  boot?.classList.add('hidden');
  // Handy from the browser console during development.
  (window as Window & { game?: Game }).game = game;
}

main().catch((error) => {
  // A failed WebGL context is the realistic failure here (old device, blocked
  // context, battery saver) and a blank black screen tells the player nothing.
  console.error(error);
  showBoot(
    '<div class="boot-inner"><h1>Cannot start</h1><p>This game needs WebGL. Try updating your browser, or turn off battery saver and reload.</p></div>',
  );
});

registerSW({ immediate: true });
