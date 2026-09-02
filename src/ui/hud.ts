import './style.css';
import type { Emitter } from '../core/Events';
import type { UpgradeDef } from '../data/config';

export interface PanelModel {
  def: UpgradeDef;
  cost: number;
  level: number;
  maxLevel: number;
  affordable: boolean;
}

/**
 * The DOM overlay. All UI is HTML on top of the canvas: text in a WebGL scene
 * is expensive and unreadable at phone sizes, and this way the HUD costs
 * nothing on frames where nothing changed.
 */
export class Hud {
  private cashValue = el('cash-value');
  private cashPill = el('cash-pill');
  private levelValue = el('level-value');
  private toasts = el('toasts');
  private hint = el('hint');
  private panel = el('panel');
  private panelTitle = el('panel-title');
  private panelDesc = el('panel-desc');
  private panelStats = el('panel-stats');
  private panelBuy = el('panel-buy') as HTMLButtonElement;

  private shownCash = -1;
  private openUpgradeId: string | null = null;

  onBuy?: (upgradeId: string) => void;
  onPanelClosed?: () => void;

  constructor(events: Emitter) {
    events.on('cash', ({ total }) => this.setCash(total));
    events.on('level', ({ name }) => (this.levelValue.textContent = name));
    events.on('toast', ({ text, tone }) => this.toast(text, tone));
    events.on('firstInteraction', () => this.hint.classList.add('hidden'));

    el('panel-close').addEventListener('click', () => this.closePanel());
    this.panelBuy.addEventListener('click', () => {
      if (this.openUpgradeId) this.onBuy?.(this.openUpgradeId);
    });
  }

  setCash(total: number): void {
    const rounded = Math.floor(total);
    if (rounded === this.shownCash) return;
    const grew = rounded > this.shownCash && this.shownCash >= 0;
    this.shownCash = rounded;
    this.cashValue.textContent = format(rounded);
    if (grew) {
      this.cashPill.classList.remove('bump');
      // Force a reflow so the animation restarts on consecutive collections.
      void this.cashPill.offsetWidth;
      this.cashPill.classList.add('bump');
    }
  }

  toast(text: string, tone?: 'good' | 'cash'): void {
    const node = document.createElement('div');
    node.className = `toast${tone ? ` ${tone}` : ''}`;
    node.textContent = text;
    this.toasts.append(node);
    window.setTimeout(() => {
      node.classList.add('leaving');
      window.setTimeout(() => node.remove(), 350);
    }, 2200);
  }

  openPanel(model: PanelModel): void {
    this.openUpgradeId = model.def.id;
    this.panelTitle.textContent = model.def.title;
    this.panelDesc.textContent = model.def.description;
    this.panelStats.replaceChildren(
      stat(model.def.short),
      stat(
        model.maxLevel > 1
          ? `Level ${model.level} → ${model.level + 1} of ${model.maxLevel}`
          : 'One-off',
      ),
    );
    this.panelBuy.textContent = model.affordable
      ? `Build · $${format(model.cost)}`
      : `Need $${format(model.cost)}`;
    this.panelBuy.disabled = !model.affordable;
    this.panel.classList.remove('hidden');
  }

  /** Keeps the open panel's affordability in sync as cash comes in. */
  refreshPanel(model: PanelModel): void {
    if (this.openUpgradeId !== model.def.id) return;
    this.openPanel(model);
  }

  closePanel(): void {
    if (this.panel.classList.contains('hidden')) return;
    this.panel.classList.add('hidden');
    this.openUpgradeId = null;
    this.onPanelClosed?.();
  }

  get panelOpenFor(): string | null {
    return this.openUpgradeId;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
    this.hint.classList.remove('hidden');
  }

  fatal(message: string): void {
    const boot = el('boot');
    boot.textContent = message;
    boot.classList.remove('hidden');
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element #${id}`);
  return node;
}

function stat(text: string): HTMLElement {
  const node = document.createElement('span');
  node.className = 'stat';
  node.textContent = text;
  return node;
}

export function format(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return Math.floor(value).toLocaleString('en-US');
}
