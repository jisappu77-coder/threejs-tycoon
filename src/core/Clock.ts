/**
 * Fixed-timestep accumulator. The simulation always advances in equal steps so
 * behaviour does not change with frame rate; catch-up is capped so a long
 * background pause resumes instantly instead of spiralling.
 */
export class Clock {
  readonly step: number;
  private readonly maxSteps: number;
  private accumulator = 0;
  private last = 0;

  /** Wall-clock seconds the sim has run. Used for cash-drop lifetimes etc. */
  elapsed = 0;

  constructor(step = 1 / 60, maxSteps = 5) {
    this.step = step;
    this.maxSteps = maxSteps;
  }

  /** Call when resuming after a pause so the gap is not simulated. */
  reset(now: number): void {
    this.last = now;
    this.accumulator = 0;
  }

  /**
   * Feeds the wall clock in and returns how many fixed steps to run, plus the
   * 0..1 interpolation alpha for rendering between steps.
   */
  tick(now: number): { steps: number; alpha: number } {
    if (this.last === 0) this.last = now;
    const frame = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.accumulator += frame;

    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      this.accumulator -= this.step;
      steps++;
    }
    if (steps === this.maxSteps) this.accumulator = 0;
    this.elapsed += steps * this.step;
    return { steps, alpha: this.accumulator / this.step };
  }
}
