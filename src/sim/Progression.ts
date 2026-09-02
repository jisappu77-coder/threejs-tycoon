import { UPGRADES, type UpgradeDef } from '../data/config';

/**
 * Which upgrades have been bought and how far. Upgrades are data (see
 * `data/config.ts`); this class only tracks levels and answers what is
 * currently purchasable, so adding a new upgrade never means touching code
 * here.
 */
export class Progression {
  /** upgradeId -> times purchased. */
  private levels = new Map<string, number>();

  levelOf(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  maxLevelOf(def: UpgradeDef): number {
    return def.maxLevel ?? 1;
  }

  isMaxed(def: UpgradeDef): boolean {
    return this.levelOf(def.id) >= this.maxLevelOf(def);
  }

  /** Cost of the next purchase, growing for repeatable upgrades. */
  costOf(def: UpgradeDef): number {
    const level = this.levelOf(def.id);
    const growth = def.costGrowth ?? 1;
    return Math.round(def.cost * Math.pow(growth, level));
  }

  /** Prerequisites met and not yet maxed out — i.e. the pad should be visible. */
  isAvailable(def: UpgradeDef): boolean {
    if (this.isMaxed(def)) return false;
    return (def.requires ?? []).every((req) => this.levelOf(req) > 0);
  }

  /** Records a purchase and returns the new level. */
  purchase(id: string): number {
    const level = this.levelOf(id) + 1;
    this.levels.set(id, level);
    return level;
  }

  visibleUpgrades(): UpgradeDef[] {
    return UPGRADES.filter((u) => this.isAvailable(u));
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(this.levels);
  }

  static fromJSON(data: Record<string, number> | undefined): Progression {
    const p = new Progression();
    for (const [id, level] of Object.entries(data ?? {})) {
      if (typeof level === 'number' && level > 0) p.levels.set(id, level);
    }
    return p;
  }

  // Extension point: prestige() would reset `levels`, bank a multiplier and
  // unlock the next highway location. The save format already versions this
  // map, so adding it will not invalidate existing saves.
}

export function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}
