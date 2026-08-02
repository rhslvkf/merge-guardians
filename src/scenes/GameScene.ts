import Phaser from 'phaser';

import {
  DEBUG,
  Depth,
  GameEvent,
  LIFE_LOST_FLASH_MS,
  LIFE_LOST_SHAKE_INTENSITY,
  LIFE_LOST_SHAKE_MS,
  MAX_FRAME_SECONDS,
  RegistryKey,
  SceneKey,
} from '../config/constants';
import { CombatSystem } from '../core/CombatSystem';
import { EnergySystem } from '../core/EnergySystem';
import { Grid } from '../core/Grid';
import { MergeSystem } from '../core/MergeSystem';
import { RunState } from '../core/RunState';
import { INTER_WAVE_DELAY, WaveRunner } from '../core/WaveRunner';
import { EnemyPool } from '../entities/Enemy';
import { ProjectilePool } from '../entities/Projectile';
import { Unit } from '../entities/Unit';
import type { PortalAdapter } from '../services/portal/PortalAdapter';
import { LayoutService, type CellCoord } from '../services/LayoutService';
import { BoardRenderer } from '../ui/BoardRenderer';
import balance from '../config/balance.json';

/**
 * Gameplay only: board, units, enemies, projectiles.
 *
 * Owns no UI. HUD and panels live in UIScene and are reached exclusively through
 * the events in `GameEvent` (rule 7). Drag handling lives in MergeSystem and
 * combat in CombatSystem; this scene wires them together and draws the board.
 *
 * Pausing uses `scene.pause`, which halts this scene's update, timers and
 * tweens in one step. UIScene is never paused, so it can still drive the resume.
 *
 * Phase 4 adds wave modifiers and the upgrade draft.
 */

const REVIVE_LIVES: number = balance.ads.reviveLifeRestored;

export class GameScene extends Phaser.Scene {
  private layout!: LayoutService;
  private run!: RunState;
  private portal?: PortalAdapter;
  private grid!: Grid;
  private mergeSystem!: MergeSystem;
  private energy!: EnergySystem;
  private combat!: CombatSystem;
  private waves!: WaveRunner;
  private enemies!: EnemyPool;
  private projectiles!: ProjectilePool;

  private board!: BoardRenderer;

  /** 'wave' while a wave runs, 'between' during the gap before the next one. */
  private phase: 'wave' | 'between' | 'over' = 'wave';
  private betweenTimer = 0;
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

    this.grid = new Grid(this.layout, this.run);
    this.enemies = new EnemyPool(this);
    this.projectiles = new ProjectilePool(this);
    this.energy = new EnergySystem(this.run, this.grid);
    this.mergeSystem = new MergeSystem(this, this.grid, this.run, this.layout);
    this.combat = new CombatSystem(
      this,
      this.grid,
      this.run,
      this.layout,
      this.enemies,
      this.projectiles,
      this.energy
    );
    this.waves = new WaveRunner(this.run, this.layout, this.enemies);

    // UIScene reads these rather than holding copies of its own (rules 6 and 7).
    this.registry.set(RegistryKey.EnergySystem, this.energy);

    this.board = new BoardRenderer(this, this.layout, this.grid, this.run);

    this.mergeSystem.attachInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.bindEvents();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);

    this.handleResize();
    this.scene.launch(SceneKey.UI);

    // UIScene subscribes during its own create, which runs after this one, so
    // the first wave banner is emitted on the next tick rather than now.
    this.time.delayedCall(0, this.startCurrentWave, undefined, this);
  }

  private bindEvents(): void {
    const bus = this.game.events;
    bus.on(GameEvent.SummonRequested, this.summonUnit, this);
    bus.on(GameEvent.PauseRequested, this.pauseGame, this);
    bus.on(GameEvent.ResumeRequested, this.resumeGame, this);
    bus.on(GameEvent.ReviveRequested, this.revive, this);
    bus.on(GameEvent.RestartRequested, this.restartRun, this);
    bus.on(GameEvent.MenuRequested, this.goToMenu, this);
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    const bus = this.game.events;
    bus.off(GameEvent.SummonRequested, this.summonUnit, this);
    bus.off(GameEvent.PauseRequested, this.pauseGame, this);
    bus.off(GameEvent.ResumeRequested, this.resumeGame, this);
    bus.off(GameEvent.ReviveRequested, this.revive, this);
    bus.off(GameEvent.RestartRequested, this.restartRun, this);
    bus.off(GameEvent.MenuRequested, this.goToMenu, this);
    this.mergeSystem.detachInput();
  }

  // --- pause -------------------------------------------------------------

  /**
   * `scene.pause` stops update, this scene's timers and its tweens together,
   * which is what keeps energy from regenerating behind the pause overlay.
   */
  private pauseGame(): void {
    if (this.scene.isPaused(SceneKey.Game)) return;
    // TODO(phase-8): this is where gameplayStop() must fire for Poki.
    this.portal?.gameplayStop();
    this.scene.pause();
    this.game.events.emit(GameEvent.Paused);
  }

  private resumeGame(): void {
    if (!this.scene.isPaused(SceneKey.Game)) return;
    this.scene.resume();
    // TODO(phase-8): commercialBreak() belongs here — only when returning to
    // gameplay from pause, never on the way out to the menu.
    this.portal?.gameplayStart();
    this.game.events.emit(GameEvent.Resumed);
  }

  // --- run flow ----------------------------------------------------------

  private startCurrentWave(): void {
    if (!this.waves.hasWaveForCurrentIndex) {
      if (DEBUG) console.log('[waves] no wave configured for index', this.run.waveIndex);
      return;
    }

    this.run.summonsThisWave = 0;
    this.waves.startWave();
    this.phase = 'wave';
    this.lastReportedRemaining = -1;
    // TODO(phase-8): Poki requires this on the player's *first input*, not on
    // wave start. Placed here for now so the start/stop pair alternates.
    this.portal?.gameplayStart();

    this.game.events.emit(
      GameEvent.WaveStarted,
      this.run.waveIndex,
      this.waves.waveInStage,
      this.waves.stageOfCurrentWave,
      this.waves.modifier
    );
  }

  private onWaveCleared(): void {
    this.waves.stop();
    this.projectiles.releaseAll();
    this.game.events.emit(GameEvent.WaveCleared, this.run.waveIndex);

    if (RunState.isLastWaveOfStage(this.run.waveIndex)) {
      this.onStageCleared();
      return;
    }

    this.phase = 'between';
    this.betweenTimer = INTER_WAVE_DELAY;
    // Phase 4 inserts the 3-card upgrade draft here.
  }

  private onStageCleared(): void {
    this.phase = 'over';
    // TODO(phase-8): gameplayStop() first, then the end-of-stage midroll.
    this.portal?.gameplayStop();
    this.game.events.emit(GameEvent.StageCleared, this.run.stageId);
    this.scene.stop(SceneKey.UI);
    this.scene.start(SceneKey.Result);
  }

  private onLifeLost(count: number): void {
    this.run.lives = Math.max(0, this.run.lives - count);
    this.cameras.main.flash(LIFE_LOST_FLASH_MS, 180, 30, 30);
    this.cameras.main.shake(LIFE_LOST_SHAKE_MS, LIFE_LOST_SHAKE_INTENSITY);
    this.game.events.emit(GameEvent.LifeLost, this.run.lives);
    if (this.run.lives <= 0) this.onGameOver();
  }

  private onGameOver(): void {
    this.phase = 'over';
    this.portal?.gameplayStop();
    this.game.events.emit(GameEvent.GameOver, this.run.goldThisStage);
    this.scene.pause();
  }

  /**
   * Rewarded revive: one life back, board wiped, straight back into the wave.
   *
   * Phase 8 puts `PortalAdapter.rewardedBreak()` in front of this and only
   * grants it when the ad reports success.
   */
  private revive(): void {
    if (!this.run.canRevive) return;
    if (DEBUG) console.log('[ads] revive requested (rewardedBreak stub)');

    this.run.revivesUsed += 1;
    this.run.lives = REVIVE_LIVES;
    this.enemies.releaseAll();
    this.projectiles.releaseAll();
    this.combat.clearLabels();
    this.lastReportedBossHp = -1;

    this.phase = this.waves.isRunning ? 'wave' : 'between';
    this.scene.resume();
    this.portal?.gameplayStart();
    this.game.events.emit(GameEvent.Resumed);
  }

  private restartRun(): void {
    this.run.startStage(this.run.stageId);
    this.scene.stop(SceneKey.UI);
    this.scene.resume();
    this.scene.restart();
  }

  private goToMenu(): void {
    // TODO(phase-8): no commercialBreak() on the way out to the menu — that is
    // an instant Poki rejection.
    this.scene.stop(SceneKey.UI);
    this.scene.resume();
    this.scene.start(SceneKey.Menu);
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

    this.game.events.emit(GameEvent.LayoutChanged);
  }

  // --- summoning ---------------------------------------------------------

  /** Costs energy and needs a free cell — EnergySystem owns both checks. */
  private summonUnit(): void {
    if (this.phase === 'over') return;
    if (!this.energy.trySpendForSummon()) {
      this.game.events.emit(GameEvent.SummonRejected, this.energy.blockedReasonKey);
      return;
    }
    if (!this.grid.randomFreeAllyCell(this.scratchCell)) return;

    const unit = new Unit(this, 1);
    unit.setDepth(Depth.Unit).redraw(this.layout.get().cell);
    this.grid.setUnit(this.scratchCell.col, this.scratchCell.row, unit);
    unit.snapToGrid(this.layout);
  }

  // --- frame -------------------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    // Clamped so a backgrounded tab does not teleport enemies on return.
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);

    if (this.phase === 'over') return;

    this.energy.update(dt);

    if (this.phase === 'wave') {
      this.waves.update(dt);
      this.combat.update(dt);
      if (this.combat.leaksThisFrame > 0) this.onLifeLost(this.combat.leaksThisFrame);
      if (this.phase !== 'wave') return;
      if (this.waves.isWaveCleared()) this.onWaveCleared();
    } else {
      this.combat.update(dt);
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) {
        this.run.waveIndex++;
        this.startCurrentWave();
      }
    }

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
