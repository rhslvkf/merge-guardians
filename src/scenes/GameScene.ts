import Phaser from 'phaser';

import { DEBUG, Depth, GameEvent, MAX_FRAME_SECONDS, RegistryKey, SceneKey } from '../config/constants';
import { CombatSystem } from '../core/CombatSystem';
import { EnergySystem } from '../core/EnergySystem';
import { Grid } from '../core/Grid';
import { MergeSystem } from '../core/MergeSystem';
import { ModifierSystem } from '../core/ModifierSystem';
import { RunFlow } from '../core/RunFlow';
import { RunState } from '../core/RunState';
import { UpgradeSystem } from '../core/UpgradeSystem';
import { WaveRunner } from '../core/WaveRunner';
import { EnemyPool } from '../entities/Enemy';
import { ProjectilePool } from '../entities/Projectile';
import { Unit } from '../entities/Unit';
import type { AudioService } from '../services/AudioService';
import type { PortalAdapter } from '../services/portal/PortalAdapter';
import { LayoutService, type CellCoord } from '../services/LayoutService';
import { Backdrop } from '../ui/Backdrop';
import { BoardRenderer } from '../ui/BoardRenderer';
import { Effects } from '../ui/Effects';

/**
 * Gameplay only: board, units, enemies, projectiles.
 *
 * Owns no UI — HUD and panels live in UIScene and are reached exclusively
 * through the events in `GameEvent` (rule 7). This scene builds the systems,
 * draws the board, handles summoning and drives the frame; the wave → draft →
 * next wave loop and every session transition live in RunFlow.
 */
export class GameScene extends Phaser.Scene {
  private layout!: LayoutService;
  private run!: RunState;
  private portal?: PortalAdapter;

  private grid!: Grid;
  private mergeSystem!: MergeSystem;
  private energy!: EnergySystem;
  private combat!: CombatSystem;
  private waves!: WaveRunner;
  private modifiers!: ModifierSystem;
  private upgrades!: UpgradeSystem;
  private enemies!: EnemyPool;
  private projectiles!: ProjectilePool;
  private board!: BoardRenderer;
  private effects!: Effects;
  private audio!: AudioService;
  private flow!: RunFlow;

  private lastReportedRemaining = -1;
  private lastReportedBossHp = -1;

  private readonly scratchCell: CellCoord = { col: 0, row: 0 };

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    this.layout = this.registry.get(RegistryKey.Layout) as LayoutService;
    this.run = this.registry.get(RegistryKey.RunState) as RunState;
    this.portal = this.registry.get(RegistryKey.Portal) as PortalAdapter | undefined;
    this.audio = this.registry.get(RegistryKey.Audio) as AudioService;
    this.audio.attach(this);

    new Backdrop(this);
    this.effects = new Effects(this);

    this.grid = new Grid(this.layout, this.run);
    this.enemies = new EnemyPool(this);
    this.projectiles = new ProjectilePool(this);
    this.energy = new EnergySystem(this.run, this.grid);
    this.mergeSystem = new MergeSystem(
      this,
      this.grid,
      this.run,
      this.layout,
      this.effects,
      this.audio
    );
    this.combat = new CombatSystem(
      this,
      this.grid,
      this.run,
      this.layout,
      this.enemies,
      this.projectiles,
      this.energy,
      this.effects,
      this.audio
    );
    this.waves = new WaveRunner(this.run, this.layout, this.enemies);
    this.modifiers = new ModifierSystem(this, this.grid, this.layout);
    this.upgrades = new UpgradeSystem(this.run, this.grid);
    this.board = new BoardRenderer(this, this.layout, this.grid, this.run, this.modifiers);

    this.flow = new RunFlow({
      scene: this,
      run: this.run,
      grid: this.grid,
      layout: this.layout,
      board: this.board,
      waves: this.waves,
      modifiers: this.modifiers,
      upgrades: this.upgrades,
      energy: this.energy,
      combat: this.combat,
      enemies: this.enemies,
      projectiles: this.projectiles,
      effects: this.effects,
      audio: this.audio,
      portal: this.portal,
    });

    // The bomb modifier defuses when the marked cell takes part in a merge.
    this.mergeSystem.onMerge = (fc, fr, tc, tr) => this.modifiers.notifyMerge(fc, fr, tc, tr);

    // UIScene reads these rather than holding copies of its own (rules 6 and 7).
    this.registry.set(RegistryKey.EnergySystem, this.energy);

    this.mergeSystem.attachInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.bindEvents();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);

    this.handleResize();
    this.scene.launch(SceneKey.UI);

    // UIScene subscribes during its own create, which runs after this one, so
    // the first wave banner is emitted on the next tick rather than now.
    this.time.delayedCall(0, () => this.flow.startCurrentWave());
  }

  private bindEvents(): void {
    const bus = this.game.events;
    bus.on(GameEvent.SummonRequested, this.summonUnit, this);
    bus.on(GameEvent.PauseRequested, this.onPause, this);
    bus.on(GameEvent.ResumeRequested, this.onResume, this);
    bus.on(GameEvent.ReviveRequested, this.onRevive, this);
    bus.on(GameEvent.RestartRequested, this.onRestart, this);
    bus.on(GameEvent.MenuRequested, this.onMenu, this);
    bus.on(GameEvent.UpgradePicked, this.onUpgradePicked, this);
    bus.on(GameEvent.UpgradeAdBonus, this.onUpgradeAdBonus, this);
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    const bus = this.game.events;
    bus.off(GameEvent.SummonRequested, this.summonUnit, this);
    bus.off(GameEvent.PauseRequested, this.onPause, this);
    bus.off(GameEvent.ResumeRequested, this.onResume, this);
    bus.off(GameEvent.ReviveRequested, this.onRevive, this);
    bus.off(GameEvent.RestartRequested, this.onRestart, this);
    bus.off(GameEvent.MenuRequested, this.onMenu, this);
    bus.off(GameEvent.UpgradePicked, this.onUpgradePicked, this);
    bus.off(GameEvent.UpgradeAdBonus, this.onUpgradeAdBonus, this);
    this.mergeSystem.detachInput();
  }

  // Thin adapters: the event bus hands work straight to RunFlow.
  private onPause(): void {
    this.flow.pause();
  }
  private onResume(): void {
    this.flow.resume();
  }
  private onRevive(): void {
    this.flow.revive();
    this.lastReportedBossHp = -1;
  }
  private onRestart(): void {
    this.flow.restartRun();
  }
  private onMenu(): void {
    this.flow.goToMenu();
  }
  private onUpgradePicked(id: string): void {
    this.flow.applyUpgrade(id);
  }
  private onUpgradeAdBonus(): void {
    this.flow.grantAdGoldBonus();
  }

  // --- layout ------------------------------------------------------------

  private handleResize(): void {
    const { width, height } = this.scale.gameSize;
    const displayWidth = this.scale.displaySize.width;
    // Ratio of measured CSS pixels to game units, for the 44px touch warning.
    const cssScale = width > 0 ? displayWidth / width : 1;

    const metrics = this.layout.resize(width, height, cssScale);

    this.board.redraw();
    this.grid.forEachUnit((unit) => {
      unit.redraw(metrics.cell);
      unit.snapToGrid(this.layout);
    });
    this.combat.onResize(metrics.cell);
    this.modifiers.onResize();

    this.game.events.emit(GameEvent.LayoutChanged);
  }

  // --- summoning ---------------------------------------------------------

  /** Costs energy and needs a free cell — EnergySystem owns both checks. */
  private summonUnit(): void {
    if (this.flow.phase === 'over' || this.flow.phase === 'drafting') return;
    if (!this.energy.trySpendForSummon()) {
      this.game.events.emit(GameEvent.SummonRejected, this.energy.blockedReasonKey);
      return;
    }
    if (!this.grid.randomFreeAllyCell(this.scratchCell)) return;

    const unit = new Unit(this, 1);
    unit.setDepth(Depth.Unit).redraw(this.layout.get().cell);
    this.grid.setUnit(this.scratchCell.col, this.scratchCell.row, unit);
    unit.snapToGrid(this.layout);
    this.audio.play('summon');
    if (DEBUG && this.grid.blockedColumn >= 0) {
      // Sanity check while the blockedColumn modifier is young.
      console.assert(this.scratchCell.col !== this.grid.blockedColumn, 'summoned into rock');
    }
  }

  // --- frame -------------------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    // Clamped so a backgrounded tab does not teleport enemies on return.
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);

    this.flow.update(dt);

    this.reportRemaining();
    this.reportBossHealth();
  }

  /** Emit only on change, so the UI is not spammed every frame. */
  private reportRemaining(): void {
    const remaining = this.waves.remaining;
    if (remaining === this.lastReportedRemaining) return;
    this.lastReportedRemaining = remaining;
    this.game.events.emit(GameEvent.EnemyCountChanged, remaining);
  }

  /** -1 means no boss on the board; otherwise the HP ratio (spec 5). */
  private reportBossHealth(): void {
    const boss = this.enemies.findBoss();
    const ratio = boss ? Math.max(0, boss.hp / boss.maxHp) : -1;
    // Quantised so a slowly draining bar does not emit on every frame.
    const quantised = ratio < 0 ? -1 : Math.round(ratio * 200) / 200;
    if (quantised === this.lastReportedBossHp) return;
    this.lastReportedBossHp = quantised;
    this.game.events.emit(GameEvent.BossHealthChanged, quantised);
  }
}
