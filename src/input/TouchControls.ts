import type { IsoCamera } from '../render/IsoCamera';

export interface PointerTap {
  x: number;
  y: number;
}

interface Tracked {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
}

const TAP_SLOP = 12; // px of movement still counted as a tap
const HOLD_DELAY = 130; // ms before a stationary press becomes a hold

/**
 * Pointer-events based camera control. One finger pans, two fingers pinch-zoom
 * and twist. A press that does not move becomes a "hold" — that is how the
 * player does manual work on a vehicle — while a short press is a tap.
 */
export class TouchControls {
  /** Set while the player is pressing and holding on the world. */
  holding = false;
  /** Screen position of the active hold, for hit-testing each frame. */
  holdPoint: PointerTap | null = null;

  onTap?: (p: PointerTap) => void;
  onHoldStart?: (p: PointerTap) => void;
  onHoldEnd?: () => void;
  onFirstInput?: () => void;

  private pointers = new Map<number, Tracked>();
  private pinchDistance = 0;
  private pinchAngle = 0;
  private sawInput = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: IsoCamera,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    // Long-press context menus fire mid-hold on Android and steal the gesture.
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent): void => {
    this.element.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      moved: false,
    });
    if (!this.sawInput) {
      this.sawInput = true;
      this.onFirstInput?.();
    }
    if (this.pointers.size === 2) this.beginPinch();
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    const travel = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (travel > TAP_SLOP) p.moved = true;

    if (this.pointers.size === 1) {
      if (this.holding) {
        // A hold that starts dragging becomes a camera pan again.
        if (p.moved) this.endHold();
        else return;
      }
      if (p.moved) this.camera.pan(dx, dy, window.innerHeight);
      return;
    }

    if (this.pointers.size === 2) {
      this.endHold();
      const [a, b] = [...this.pointers.values()];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinchDistance > 0) {
        this.camera.zoomBy(dist / this.pinchDistance);
        let dAngle = angle - this.pinchAngle;
        // Normalise across the ±π wrap so a twist never snaps a half-turn.
        if (dAngle > Math.PI) dAngle -= Math.PI * 2;
        if (dAngle < -Math.PI) dAngle += Math.PI * 2;
        this.camera.rotateBy(dAngle);
      }
      this.pinchDistance = dist;
      this.pinchAngle = angle;
    }
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (!p) return;

    const held = performance.now() - p.startTime;
    if (this.holding) {
      this.endHold();
    } else if (!p.moved && held < 400) {
      this.onTap?.({ x: p.startX, y: p.startY });
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.camera.zoomBy(e.deltaY > 0 ? 0.92 : 1.08);
  };

  private beginPinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
  }

  private endHold(): void {
    if (!this.holding) return;
    this.holding = false;
    this.holdPoint = null;
    this.onHoldEnd?.();
  }

  /**
   * Called once per frame. Promotes a stationary single press into a hold once
   * it has lasted long enough to not be a tap.
   */
  update(): void {
    if (this.holding || this.pointers.size !== 1) return;
    const p = [...this.pointers.values()][0]!;
    if (p.moved || performance.now() - p.startTime < HOLD_DELAY) return;
    this.holding = true;
    this.holdPoint = { x: p.x, y: p.y };
    this.onHoldStart?.(this.holdPoint);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onUp);
    this.element.removeEventListener('wheel', this.onWheel);
  }
}
