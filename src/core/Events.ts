/**
 * Minimal typed emitter. The simulation pushes events; the DOM UI listens.
 * This keeps the UI off the per-frame path — it only touches the DOM when
 * something actually changed.
 */
export type GameEvents = {
  cash: { total: number; delta: number };
  level: { name: string };
  toast: { text: string; tone?: 'good' | 'cash' };
  padSelected: { upgradeId: string } | null;
  padDeselected: undefined;
  purchased: { upgradeId: string; level: number };
  unlocked: { label: string };
  firstInteraction: undefined;
};

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

export class Emitter {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(key: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const fn of set) (fn as Handler<K>)(payload);
  }
}
