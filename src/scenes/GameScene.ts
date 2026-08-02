import Phaser from 'phaser';

import {
  DEBUG,
  Depth,
  GRID_COLS,
  GRID_ROWS,
  GameEvent,
  MAX_FRAME_SECONDS,
  Palette,
  RegistryKey,
  SceneKey,
} from '../config/constants';
import { CombatSystem } from '../core/CombatSystem';
import { Grid } from '../core/Grid';
import { MergeSystem } from '../core/MergeSystem';
import { RunState } from '../core/RunState';
import { INTER_WAVE_DELAY, WaveRunner } from '../core/WaveRunner';
import { EnemyPool } from '../entities/Enemy';
import { ProjectilePool } from '../entities/Projectile';
import { Unit } from '../entities/Unit';
import { LayoutService, type CellCoord, type WorldPoint } from '../services/LayoutService';

/**
 * Gameplay only: board, units, enemies, projectiles.
 *
 * Owns no UI. HUD and panels live in UIScene and are reached exclusively through
 * the events in `GameEvent` (rule 7). Drag handling lives in MergeSystem and
 * combat in CombatSystem; this scene wires them together and draws the board.
 *
 * Phase 2 scope — combat and waves. Energy cost and lives arrive in Phase 3,
 * wave modifiers and the upgrade draft in Phase 4.
 */

export class GameScene extends Phaser.Scene {
  private layout!: LayoutService;
  private run!: RunState;
  private grid!: Grid;
  private mergeSystem!: MergeSystem;
  private combat!: CombatSystem;
  private waves!: WaveRunner;
  private enemies!: EnemyPool;
  private projectiles!: ProjectilePool;

  private boardGfx!: Phaser.GameObjects.Graphics;

  /** 'wave' while a wave runs, 'between' during the gap before the next one. */
  private phase: 'wave' | 'between' = 'wave';
  private betweenTimer = 0;
  private lastReportedRemaining = -1;
  private lastReportedBossHp = -1;

  private readonly scratchCell: CellCoord = { col: 0, row: 0 };
  private readonly scratchPoint: WorldPoint = { x: 0, y: 0 };

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    this.layout = new LayoutService();
    this.run = new RunState();
    this.run.reset();
    this.grid = new Grid(this.layout, this.run);

    this.enemies = new EnemyPool(this);
    this.projectiles = new ProjectilePool(this);
    this.mergeSystem = new MergeSystem(this, this.grid, this.run, this.layout);
    this.combat = new CombatSystem(
      this,
      this.grid,
      this.run,
      this.layout,
      this.enemies,
      this.projectiles
    );
    this.waves = new WaveRunner(this.run, this.layout, this.enemies);

    // UIScene reads these rather than holding copies of its own (rules 6 and 7).
    this.registry.set(RegistryKey.Layout, this.layout);
    this.registry.set(RegistryKey.RunState, this.run);

    this.boardGfx = this.add.graphics().setDepth(Depth.Board);

    this.mergeSystem.attachInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.game.events.on(GameEvent.SummonRequested, this.summonUnit, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);

    this.handleResize();
    this.scene.launch(SceneKey.UI);

    // UIScene subscribes during its own create, which runs after this one, so
    // the first wave banner is emitted on the next tick rather than now.
    this.time.delayedCall(0, this.startCurrentWave, undefined, this);
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.game.events.off(GameEvent.SummonRequested, this.summonUnit, this);
    this.mergeSystem.detachInput();
  }

  // --- waves -------------------------------------------------------------

  private startCurrentWave(): void {
    if (!this.waves.hasWaveForCurrentIndex) {
      if (DEBUG) console.log('[waves] no wave configured for index', this.run.waveIndex);
      return;
    }

    this.waves.startWave();
    this.phase = 'wave';
    this.lastReportedRemaining = -1;

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
    this.phase = 'between';
    this.betweenTimer = INTER_WAVE_DELAY;
    this.projectiles.releaseAll();
    this.game.events.emit(GameEvent.WaveCleared, this.run.waveIndex);
    // Phase 4 inserts the 3-card upgrade draft here.
  }

  // --- layout ------------------------------------------------------------

  private handleResize(): void {
    const { width, height } = this.scale.gameSize;
    const displayWidth = this.scale.displaySize.width;
    // Ratio of measured CSS pixels to game units, for the 44px touch warning.
    const cssScale = width > 0 ? displayWidth / width : 1;

    const metrics = this.layout.resize(width, height, cssScale);

    this.drawBoard();
    this.grid.forEachUnit((unit) => {
      unit.redraw(metrics.cell);
      unit.snapToGrid(this.layout);
    });
    this.combat.onResize(metrics.cell);

    this.game.events.emit(GameEvent.LayoutChanged);
  }

  private drawBoard(): void {
    const { cell, originX, originY, gridW, gridH } = this.layout.get();
    const gfx = this.boardGfx;

    gfx.clear();
    if (cell <= 0) return;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const ally = this.grid.isAllyCell(col, row);
        this.layout.cellTopLeft(col, row, this.scratchPoint);
        gfx.fillStyle(ally ? Palette.boardAllyArea : Palette.boardEnemyArea, 1);
        gfx.fillRect(this.scratchPoint.x, this.scratchPoint.y, cell, cell);
      }
    }

    gfx.lineStyle(1, Palette.boardLine, 1);
    for (let col = 0; col <= GRID_COLS; col++) {
      const x = originX + col * cell;
      gfx.lineBetween(x, originY, x, originY + gridH);
    }
    for (let row = 0; row <= GRID_ROWS; row++) {
      const y = originY + row * cell;
      gfx.lineBetween(originX, y, originX + gridW, y);
    }

    // Emphasise the board edge and the line the player may not build past.
    gfx.lineStyle(2, Palette.boardEdge, 1);
    gfx.strokeRect(originX, originY, gridW, gridH);
    const allyY = originY + this.run.allyTopRow * cell;
    gfx.lineBetween(originX, allyY, originX + gridW, allyY);
  }

  // --- summoning ---------------------------------------------------------

  /**
   * Debug summon: free T1 on a random empty ally cell.
   *
   * Phase 3 puts this behind the energy cost from balance.json.
   */
  private summonUnit(): void {
    if (!this.grid.randomFreeAllyCell(this.scratchCell)) {
      if (DEBUG) console.warn('[summon] ally area is full');
      return;
    }

    const unit = new Unit(this, 1);
    unit.setDepth(Depth.Unit).redraw(this.layout.get().cell);
    this.grid.setUnit(this.scratchCell.col, this.scratchCell.row, unit);
    unit.snapToGrid(this.layout);
  }

  // --- frame -------------------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    // Clamped so a backgrounded tab does not teleport enemies on return.
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);

    if (this.phase === 'wave') {
      this.waves.update(dt);
      this.combat.update(dt);
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
