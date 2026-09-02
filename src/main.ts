import { registerSW } from 'virtual:pwa-register';
import { Game } from './core/Game';
import './ui/style.css';

const canvas = document.getElementById('game');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Canvas #game is missing');
}

try {
  const game = new Game(canvas);
  game.start();
  // Handy from the browser console during development.
  (window as Window & { game?: Game }).game = game;
} catch (error) {
  // A failed WebGL context is the realistic failure here (old device, blocked
  // context, battery saver) and a blank black screen tells the player nothing.
  console.error(error);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.textContent =
      'This game needs WebGL. Try updating your browser, or turn off battery saver and reload.';
    boot.classList.remove('hidden');
  }
}

registerSW({ immediate: true });
