import { SAVE } from '../data/config';
import { Economy, computeOfflineEarnings } from './Economy';
import { Progression } from './Progression';
import type { TruckStop } from './TruckStop';

export interface SaveData {
  version: number;
  savedAt: number;
  cash: number;
  totalEarned: number;
  incomePerSecond: number;
  upgrades: Record<string, number>;
}

/**
 * Versioned localStorage persistence. Save data is the one thing a player
 * cannot get back, so reads are defensive: anything malformed is treated as a
 * fresh game rather than throwing on boot.
 */
export function serialize(stop: TruckStop, now = Date.now()): SaveData {
  return {
    version: SAVE.version,
    savedAt: now,
    cash: Math.round(stop.economy.cash),
    totalEarned: Math.round(stop.economy.totalEarned),
    incomePerSecond: Number(stop.economy.incomePerSecond.toFixed(3)),
    upgrades: stop.progression.toJSON(),
  };
}

export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<SaveData>;
  if (typeof data.version !== 'number' || data.version > SAVE.version) return null;
  if (typeof data.cash !== 'number' || !Number.isFinite(data.cash)) return null;

  // Version 1 is the first format; future versions add their step here and
  // fall through, so old saves keep working.
  return {
    version: SAVE.version,
    savedAt: typeof data.savedAt === 'number' ? data.savedAt : Date.now(),
    cash: Math.max(0, data.cash),
    totalEarned: Math.max(0, data.totalEarned ?? data.cash),
    incomePerSecond: Math.max(0, data.incomePerSecond ?? 0),
    upgrades:
      data.upgrades && typeof data.upgrades === 'object' ? { ...data.upgrades } : {},
  };
}

export function load(storage: Storage = localStorage): SaveData | null {
  try {
    const text = storage.getItem(SAVE.key);
    if (!text) return null;
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}

export function save(stop: TruckStop, storage: Storage = localStorage): void {
  try {
    storage.setItem(SAVE.key, JSON.stringify(serialize(stop)));
  } catch {
    // Private-mode or a full quota — losing a save beats crashing the game.
  }
}

export function clear(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SAVE.key);
  } catch {
    /* ignore */
  }
}

/**
 * Rebuilds a stop from save data and returns what the business earned while
 * the game was closed.
 */
export function restore(
  data: SaveData,
  makeStop: (economy: Economy, progression: Progression) => TruckStop,
  now = Date.now(),
): { stop: TruckStop; offline: number } {
  const economy = new Economy(data.cash);
  economy.totalEarned = data.totalEarned;
  economy.incomePerSecond = data.incomePerSecond;
  const progression = Progression.fromJSON(data.upgrades);
  const stop = makeStop(economy, progression);

  const elapsed = Math.max(0, (now - data.savedAt) / 1000);
  const offline = computeOfflineEarnings(
    elapsed,
    data.incomePerSecond,
    stop.automationLevel,
  );
  if (offline > 0) economy.grant(offline);
  return { stop, offline };
}
