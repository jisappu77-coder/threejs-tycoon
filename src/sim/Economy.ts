import { ECONOMY, LEVELS } from '../data/config';

/**
 * Cash, income and the offline-earnings calculation. Pure arithmetic — no
 * three.js, no DOM — so the balance rules are directly testable.
 */
export class Economy {
  cash: number;
  totalEarned = 0;
  /** Rolling estimate of automated income, used for offline earnings. */
  incomePerSecond = 0;

  private earnWindow: { t: number; amount: number }[] = [];

  constructor(startCash: number = ECONOMY.startCash) {
    this.cash = startCash;
  }

  /** Records income and keeps the trailing 60s average up to date. */
  earn(amount: number, now: number): void {
    this.cash += amount;
    this.totalEarned += amount;
    this.earnWindow.push({ t: now, amount });
    this.refreshRate(now);
  }

  /** Cash granted without counting toward the income estimate (e.g. offline). */
  grant(amount: number): void {
    this.cash += amount;
    this.totalEarned += amount;
  }

  spend(amount: number): boolean {
    if (this.cash < amount) return false;
    this.cash -= amount;
    return true;
  }

  canAfford(amount: number): boolean {
    return this.cash >= amount;
  }

  refreshRate(now: number): void {
    const cutoff = now - 60;
    while (this.earnWindow.length && this.earnWindow[0]!.t < cutoff) {
      this.earnWindow.shift();
    }
    const total = this.earnWindow.reduce((n, e) => n + e.amount, 0);
    const span = Math.max(10, Math.min(60, now));
    this.incomePerSecond = total / span;
  }

  get levelName(): string {
    let name = LEVELS[0]!.name;
    for (const level of LEVELS) {
      if (this.totalEarned >= level.at) name = level.name;
    }
    return name;
  }
}

/**
 * What the stop earned while the game was closed. Only the automated part of
 * the business runs while away, it runs at a reduced rate, and it is capped —
 * so coming back is a pleasant bonus rather than a substitute for playing.
 */
export function computeOfflineEarnings(
  elapsedSeconds: number,
  incomePerSecond: number,
  automationLevel: number,
): number {
  if (automationLevel <= 0 || incomePerSecond <= 0 || elapsedSeconds <= 0) return 0;
  const capped = Math.min(elapsedSeconds, ECONOMY.offlineCapHours * 3600);
  return Math.floor(capped * incomePerSecond * ECONOMY.offlineRate);
}

/**
 * How likely a passing driver is to pull in. A long line puts drivers off, so
 * queue capacity upgrades really do earn their cost.
 */
export function divertChance(queueLength: number, queueCapacity: number): number {
  if (queueLength >= queueCapacity) return 0;
  const chance = ECONOMY.baseDivertChance - queueLength * ECONOMY.queuePenalty;
  return Math.max(0.05, Math.min(1, chance));
}
