import Phaser from 'phaser';

import balance from '../config/balance.json';
import {
  DEBUG,
  Depth,
  GameEvent,
  LIFE_LOST_FLASH_MS,
  LIFE_LOST_SHAKE_INTENSITY,
  LIFE_LOST_SHAKE_MS,
  SceneKey,
} from '../config/constants';
import { EnemyPool } from '../entities/Enemy';
import { ProjectilePool } from '../entities/Projectile';
import { Unit } from '../entities/Unit';
import type { LayoutService, CellCoord } from '../services/LayoutService';
import type { PortalAdapter } from '../services/portal/PortalAdapter';
import type { BoardRenderer } from '../ui/BoardRenderer';
import type { CombatSystem } from './CombatSystem';
import type { EnergySystem } from './EnergySystem';
import type { Grid } from './Grid';
import type { ModifierSystem } from './ModifierSystem';
import { RunState } from './RunState';
import type { UpgradeSystem } from './UpgradeSystem';
import { INTER_WAVE_DELAY, WaveRunner } from './WaveRunner';

/**
 * The wave → draft → next wave loop, plus session control (pause, revive,
 * restart, stage clear).
 *
 * Extracted from GameScene, which had grown past the 300-line limit once the
 * Phase 4 draft landed. GameScene keeps setup, rendering and input; everything
 * about *what happens next* lives here.
 *
 * It holds the scene because pausing, restarting and changing scene are all
 * scene operations — but it touches no display object beyond the board redraw.
 */

const REVIVE_LIVES: number = balance.ads.reviveLifeRestored;

export type RunPhase = 'wave' | 'between' | 'drafting' | 'over';

export interface RunFlowDeps {
  scene: Phaser.Scene;
  run: RunState;
  grid: Grid;
  layout: LayoutService;
  board: BoardRenderer;
  waves: WaveRunner;
  modifiers: ModifierSystem;
  upgrades: UpgradeSystem;
  energy: EnergySystem;
  combat: CombatSystem;
  enemies: EnemyPool;
  projectiles: ProjectilePool;
  portal?: PortalAdapter;
}

export class RunFlow {
  private readonly d: RunFlowDeps;
  private readonly scratchCell: CellCoord = { col: 0, row: 0 };

  phase: RunPhase = 'wave';
  private betweenTimer = 0;

  constructor(deps: RunFlowDeps) {
    this.d = deps;
  }

  // --- frame -------------------------------------------------------------

  update(dt: number): void {
    if (this.phase === 'over' || this.phase === 'drafting') return;

    this.d.energy.update(dt);
    this.d.modifiers.update(dt);
    if (this.d.modifiers.explodedThisFrame) {
      this.d.scene.cameras.main.shake(LIFE_LOST_SHAKE_MS, LIFE_LOST_SHAKE_INTENSITY);
    }

    if (this.phase === 'wave') {
      this.d.waves.update(dt);
      this.d.combat.update(dt);
      if (this.d.combat.leaksThisFrame > 0) this.onLifeLost(this.d.combat.leaksThisFrame);
      // onLifeLost can end the run, which invalidates the wave-clear question.
      if (this.phase !== 'wave') return;
      if (this.d.waves.isWaveCleared()) this.onWaveCleared();
      return;
    }

    this.d.combat.update(dt);
    this.betweenTimer -= dt;
    if (this.betweenTimer <= 0) {
      this.d.run.waveIndex++;
      this.startCurrentWave();
    }
  }

  // --- waves -------------------------------------------------------------

  startCurrentWave(): void {
    const { run, waves, modifiers, board, portal, scene } = this.d;

    if (!waves.hasWaveForCurrentIndex) {
      if (DEBUG) console.log('[waves] no wave configured for index', run.waveIndex);
      return;
    }

    run.summonsThisWave = 0;
    waves.startWave();
    modifiers.activate(waves.modifier);
    board.redraw();
    this.grantPendingFreeUnits();
    this.phase = 'wave';

    // TODO(phase-8): Poki requires this on the player's *first input*, not on
    // wave start. Placed here for now so the start/stop pair alternates.
    portal?.gameplayStart();

    scene.game.events.emit(
      GameEvent.WaveStarted,
      run.waveIndex,
      waves.waveInStage,
      waves.stageOfCurrentWave,
      waves.modifier
    );
    scene.game.events.emit(GameEvent.ModifierChanged, waves.modifier);
  }

  private onWaveCleared(): void {
    const { run, waves, modifiers, board, projectiles, scene } = this.d;

    waves.stop();
    projectiles.releaseAll();
    scene.game.events.emit(GameEvent.WaveCleared, run.waveIndex);

    if (RunState.isLastWaveOfStage(run.waveIndex)) {
      this.onStageCleared();
      return;
    }

    modifiers.deactivate();
    board.redraw();
    this.offerUpgrades();
  }

  private onStageCleared(): void {
    this.phase = 'over';
    // TODO(phase-8): gameplayStop() first, then the end-of-stage midroll.
    this.d.portal?.gameplayStop();
    this.d.scene.game.events.emit(GameEvent.StageCleared, this.d.run.stageId);
    this.d.scene.scene.stop(SceneKey.UI);
    this.d.scene.scene.start(SceneKey.Result);
  }

  // --- draft -------------------------------------------------------------

  /** Pause and present the draft (spec 8). With nothing eligible — every card
   * capped or condition-blocked — the run just continues after the usual gap. */
  private offerUpgrades(): void {
    const offer = this.d.upgrades.draw();
    if (offer.length === 0) {
      this.beginInterWaveGap();
      return;
    }

    this.phase = 'drafting';
    this.d.portal?.gameplayStop();
    this.d.scene.game.events.emit(GameEvent.UpgradeOffered, offer);
    this.d.scene.scene.pause();
  }

  applyUpgrade(id: string): void {
    const spawn = this.d.upgrades.apply(id);
    if (spawn?.immediate) this.placeUnits(spawn.tier, spawn.count);

    // boardExpand changes the ally area, so the board has to be redrawn.
    this.d.board.redraw();

    this.d.scene.scene.resume();
    this.d.portal?.gameplayStart();
    this.d.scene.game.events.emit(GameEvent.Resumed);
    this.beginInterWaveGap();
  }

  /** Rewarded-ad stub: doubles the gold earned so far this stage. */
  grantAdGoldBonus(): void {
    const earned = this.d.run.goldThisStage;
    this.d.run.gold += earned;
    if (DEBUG) console.log(`[ads] double-gold stub granted +${earned}`);
  }

  private beginInterWaveGap(): void {
    this.phase = 'between';
    this.betweenTimer = INTER_WAVE_DELAY;
  }

  // --- units -------------------------------------------------------------

  /** `startTier`: free units owed from a previous draft (spec 8). */
  private grantPendingFreeUnits(): void {
    const pending = this.d.run.pendingFreeUnits;
    for (let i = 0; i < pending.length; i++) {
      this.placeUnits(pending[i].tier, pending[i].count);
    }
    pending.length = 0;
  }

  /** Place `count` units of `tier` on random free ally cells. */
  placeUnits(tier: number, count: number): void {
    const cell = this.d.layout.get().cell;
    for (let i = 0; i < count; i++) {
      if (!this.d.grid.randomFreeAllyCell(this.scratchCell)) return;
      const unit = new Unit(this.d.scene, tier);
      unit.setDepth(Depth.Unit).redraw(cell);
      this.d.grid.setUnit(this.scratchCell.col, this.scratchCell.row, unit);
      unit.snapToGrid(this.d.layout);
    }
  }

  // --- lives and session -------------------------------------------------

  private onLifeLost(count: number): void {
    const { run, scene } = this.d;
    run.lives = Math.max(0, run.lives - count);
    scene.cameras.main.flash(LIFE_LOST_FLASH_MS, 180, 30, 30);
    scene.cameras.main.shake(LIFE_LOST_SHAKE_MS, LIFE_LOST_SHAKE_INTENSITY);
    scene.game.events.emit(GameEvent.LifeLost, run.lives);
    if (run.lives <= 0) this.onGameOver();
  }

  private onGameOver(): void {
    this.phase = 'over';
    this.d.portal?.gameplayStop();
    this.d.scene.game.events.emit(GameEvent.GameOver, this.d.run.goldThisStage);
    this.d.scene.scene.pause();
  }

  /** `scene.pause` stops update, timers and tweens together, which is what
   * keeps energy from regenerating behind the pause overlay. */
  pause(): void {
    const s = this.d.scene;
    if (s.scene.isPaused(SceneKey.Game)) return;
    // TODO(phase-8): this is where gameplayStop() must fire for Poki.
    this.d.portal?.gameplayStop();
    s.scene.pause();
    s.game.events.emit(GameEvent.Paused);
  }

  resume(): void {
    const s = this.d.scene;
    if (!s.scene.isPaused(SceneKey.Game)) return;
    s.scene.resume();
    // TODO(phase-8): commercialBreak() belongs here — only when returning to
    // gameplay from pause, never on the way out to the menu.
    this.d.portal?.gameplayStart();
    s.game.events.emit(GameEvent.Resumed);
  }

  /** Rewarded revive: one life back, board wiped, back into the wave. Phase 8
   * puts `rewardedBreak()` in front and only grants it on ad success. */
  revive(): void {
    const { run, enemies, projectiles, combat, modifiers, board, waves, scene } = this.d;
    if (!run.canRevive) return;
    if (DEBUG) console.log('[ads] revive requested (rewardedBreak stub)');

    run.revivesUsed += 1;
    run.lives = REVIVE_LIVES;
    enemies.releaseAll();
    projectiles.releaseAll();
    combat.clearLabels();
    modifiers.deactivate();
    board.redraw();

    this.phase = waves.isRunning ? 'wave' : 'between';
    scene.scene.resume();
    this.d.portal?.gameplayStart();
    scene.game.events.emit(GameEvent.Resumed);
  }

  restartRun(): void {
    const s = this.d.scene;
    this.d.run.startStage(this.d.run.stageId);
    s.scene.stop(SceneKey.UI);
    s.scene.resume();
    s.scene.restart();
  }

  goToMenu(): void {
    // TODO(phase-8): no commercialBreak() on the way out to the menu — that is
    // an instant Poki rejection.
    const s = this.d.scene;
    s.scene.stop(SceneKey.UI);
    s.scene.resume();
    s.scene.start(SceneKey.Menu);
  }
}
