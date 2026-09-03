import type { Texture } from 'three';
import { ECONOMY, SAVE } from '../data/config';
import { Clock } from './Clock';
import { Emitter } from './Events';
import { Rng } from './Rng';
import { IsoCamera } from '../render/IsoCamera';
import { Renderer, type QualityTier } from '../render/Renderer';
import { PostFx } from '../render/PostFx';
import { applyEnvironment } from '../render/environment';
import { setEnvIntensity } from '../render/assets';
import { Picker } from '../input/Picker';
import { TouchControls } from '../input/TouchControls';
import { Economy } from '../sim/Economy';
import { Progression } from '../sim/Progression';
import { TruckStop } from '../sim/TruckStop';
import type { Vehicle } from '../sim/Vehicle';
import * as Save from '../sim/Save';
import { World } from '../world/World';
import { StopView } from '../world/StopView';
import { Traffic } from '../world/Traffic';
import { Hud, format, type PanelModel } from '../ui/hud';
import { upgradeById } from '../sim/Progression';

/**
 * Wires every system together and owns the single animation loop. Simulation
 * runs on a fixed timestep; rendering runs once per frame. The order below is
 * deliberate: input, then world simulation, then view sync, then draw.
 */
export class Game {
  readonly events = new Emitter();
  readonly stop: TruckStop;

  private renderer: Renderer;
  private camera: IsoCamera;
  private post: PostFx;
  private picker = new Picker();
  private controls: TouchControls;
  private world: World;
  private stopView: StopView;
  private traffic: Traffic;
  private hud: Hud;
  private clock = new Clock();
  private rng = new Rng(Date.now() & 0xffff);

  private running = false;
  private frameHandle = 0;
  private saveTimer = SAVE.interval;
  private servingId: string | null = null;
  private lastLevelName = '';

  constructor(canvas: HTMLCanvasElement, environment: Texture | null = null) {
    this.renderer = new Renderer(canvas);
    this.camera = new IsoCamera(this.renderer.aspect);
    this.hud = new Hud(this.events);

    const saved = Save.load();
    let offline = 0;
    if (saved) {
      const restored = Save.restore(saved, (e, p) => new TruckStop(e, p));
      this.stop = restored.stop;
      offline = restored.offline;
    } else {
      this.stop = new TruckStop(new Economy(), new Progression());
    }

    this.world = new World(this.stop, this.renderer.tier);
    applyEnvironment(this.world.scene, environment);
    this.stopView = new StopView(this.world.scene, this.stop, this.picker);
    this.traffic = new Traffic(
      this.world.scene,
      this.rng,
      this.stop,
      this.picker,
      this.renderer.tier,
    );

    this.post = new PostFx(
      this.renderer.gl,
      this.world.scene,
      this.camera.camera,
      this.renderer.tier,
    );
    this.renderer.onResize = () => this.post.resize();

    this.controls = new TouchControls(canvas, this.camera);
    this.bindInput();
    this.bindStopHooks();

    this.renderer.onTier((tier) => {
      this.world.setTier(tier);
      this.traffic.setTier(tier);
      this.post?.setTier(tier);
      setEnvIntensity(this.renderer.settings.envIntensity);
    });

    window.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.persist);

    this.events.emit('cash', { total: this.stop.economy.cash, delta: 0 });
    this.emitLevel();
    if (offline > 0) {
      this.events.emit('toast', {
        text: `While you were away your crew earned $${format(offline)}`,
        tone: 'cash',
      });
    }
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    this.controls.onFirstInput = () => this.events.emit('firstInteraction', undefined);

    this.controls.onTap = ({ x, y }) => {
      const hit = this.picker.pick(x, y, this.camera.camera);
      if (!hit) {
        this.hud.closePanel();
        return;
      }
      if (hit.kind === 'cash') {
        const amount = this.stop.collect(hit.id, this.clock.elapsed);
        if (amount > 0) {
          this.events.emit('cash', { total: this.stop.economy.cash, delta: amount });
        }
        return;
      }
      if (hit.kind === 'pad') {
        this.openPad(hit.id);
        return;
      }
      // Tapping a vehicle is a shortcut for a short burst of manual work, so a
      // single tap still does something useful.
      const vehicle = this.traffic.vehicleById(hit.id);
      if (vehicle) this.serve(vehicle, 0.35);
    };

    this.controls.onHoldStart = ({ x, y }) => {
      const hit = this.picker.pick(x, y, this.camera.camera);
      this.servingId = hit?.kind === 'vehicle' ? hit.id : null;
      if (hit?.kind === 'cash') {
        const amount = this.stop.collect(hit.id, this.clock.elapsed);
        if (amount > 0) {
          this.events.emit('cash', { total: this.stop.economy.cash, delta: amount });
        }
      }
    };

    this.controls.onHoldEnd = () => {
      this.servingId = null;
    };

    this.hud.onBuy = (id) => this.buy(id);
  }

  private bindStopHooks(): void {
    this.stop.hooks = {
      onCashDrop: (drop) => this.stopView.addCash(drop),
      onCashRemoved: (drop) => this.stopView.removeCash(drop),
      onServiceComplete: (_v, amount) => {
        if (amount > 0) this.events.emit('toast', { text: `+$${amount}`, tone: 'cash' });
      },
      onStationUnlocked: (station) => {
        this.events.emit('toast', {
          text: `${station.def.label} open for business!`,
          tone: 'good',
        });
      },
    };
  }

  private serve(vehicle: Vehicle, seconds: number): void {
    this.stop.serveManually(vehicle, seconds);
  }

  private panelModel(upgradeId: string): PanelModel | null {
    const def = upgradeById(upgradeId);
    if (!def) return null;
    const cost = this.stop.progression.costOf(def);
    return {
      def,
      cost,
      level: this.stop.progression.levelOf(def.id),
      maxLevel: this.stop.progression.maxLevelOf(def),
      affordable: this.stop.economy.canAfford(cost),
    };
  }

  private openPad(upgradeId: string): void {
    const model = this.panelModel(upgradeId);
    if (!model) return;
    this.hud.openPanel(model);
    const pos = this.stopView.padPosition(upgradeId);
    if (pos) this.camera.focus(pos.x, pos.z);
  }

  private buy(upgradeId: string): void {
    const result = this.stop.tryPurchase(upgradeId);
    if (!result.ok) {
      if (result.reason) this.events.emit('toast', { text: result.reason });
      return;
    }
    const def = upgradeById(upgradeId);
    this.world.refresh();
    this.stopView.syncPads();
    this.hud.closePanel();
    this.events.emit('cash', { total: this.stop.economy.cash, delta: 0 });
    this.events.emit('purchased', { upgradeId, level: result.level });
    if (def) {
      this.events.emit('toast', { text: `${def.title} built!`, tone: 'good' });
    }
    Save.save(this.stop);
  }

  // ------------------------------------------------------------------- loop

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.reset(performance.now());
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  stop_(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.frame);
    const frameStart = performance.now();

    this.controls.update();
    const { steps } = this.clock.tick(now);
    const dt = this.clock.step;

    for (let i = 0; i < steps; i++) {
      this.traffic.update(dt);
      this.stop.update(dt, this.clock.elapsed);
      this.applyManualWork(dt);
    }

    if (steps > 0) {
      this.saveTimer -= steps * dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = SAVE.interval;
        this.persist();
      }
      this.emitLevel();
      if (this.hud.panelOpenFor) {
        const model = this.panelModel(this.hud.panelOpenFor);
        if (model) this.hud.refreshPanel(model);
      }
    }

    const frameSeconds = steps * dt || 1 / 60;
    this.camera.update(frameSeconds);
    this.world.update(frameSeconds);
    this.stopView.update(frameSeconds, this.camera.camera);
    this.traffic.render(this.camera.camera, frameSeconds);
    this.camera.setAspect(this.renderer.aspect);
    this.post.render();

    this.renderer.sampleFrame(performance.now() - frameStart, this.clock.elapsed);
  };

  /** Held touch = manual labour. Re-picks each step so a moving finger works. */
  private applyManualWork(dt: number): void {
    if (!this.controls.holding) return;
    const point = this.controls.holdPoint;
    if (!point) return;
    if (!this.servingId) {
      const hit = this.picker.pick(point.x, point.y, this.camera.camera);
      if (hit?.kind !== 'vehicle') return;
      this.servingId = hit.id;
    }
    const vehicle = this.traffic.vehicleById(this.servingId);
    if (!vehicle) {
      this.servingId = null;
      return;
    }
    this.serve(vehicle, dt);
  }

  private emitLevel(): void {
    const name = this.stop.economy.levelName;
    if (name === this.lastLevelName) return;
    this.lastLevelName = name;
    this.events.emit('level', { name });
  }

  // ------------------------------------------------------------ persistence

  private persist = (): void => {
    Save.save(this.stop);
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.persist();
      this.stop_();
    } else {
      this.start();
    }
  };

  /**
   * Forces a quality tier and remembers it. Exposed so a player can override a
   * bad guess on their own device, and so screenshots can target a tier
   * deliberately rather than whatever the machine happens to pick.
   */
  setQuality(tier: QualityTier): void {
    try {
      localStorage.setItem('highway-tycoon:quality', tier);
    } catch {
      // Private mode: the tier still applies for this session.
    }
    this.renderer.setTier(tier);
  }

  /** The tier actually in force, for diagnostics. */
  get quality(): QualityTier {
    return this.renderer.tier;
  }

  /** Wipes the save and reloads. Exposed for the dev console and testing. */
  reset(): void {
    Save.clear();
    window.location.reload();
  }

  get offlineCapHours(): number {
    return ECONOMY.offlineCapHours;
  }
}
