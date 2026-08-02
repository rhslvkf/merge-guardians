import Phaser from 'phaser';

import balance from '../config/balance.json';
import { DEBUG, Depth, GRID_ROWS, Palette } from '../config/constants';
import { Enemy, EnemyPool, SECONDS_PER_CELL } from '../entities/Enemy';
import { PROJECTILE_ROWS_PER_SECOND, ProjectilePool } from '../entities/Projectile';
import type { Unit } from '../entities/Unit';
import { t } from '../i18n';
import type { LayoutService, WorldPoint } from '../services/LayoutService';
import type { Grid } from './Grid';
import type { RunState } from './RunState';

/**
 * Movement, firing, projectile flight, melee and damage.
 *
 * Enemy movement lives here rather than in WaveRunner because stopping to
 * attack is the same decision as advancing (spec 4 and 5).
 *
 * Everything in `update` runs over preallocated pools and index loops; nothing
 * in the frame path allocates (rule 4).
 */

const ATTACK_INTERVAL_FLOOR: number = balance.units.attackIntervalFloor;

/** An enemy centre this close to a shot counts as a hit, in rows. */
const HIT_RADIUS_ROWS = 0.45;

/** Enemy centre at this row has reached the bottom edge of the board. */
const LEAK_ROW = GRID_ROWS - 0.5;

const BLOCK_TEXT_POOL_SIZE = 8;
const BLOCK_TEXT_LIFETIME = 0.6;
const BLOCK_TEXT_RISE_RATIO = 0.5;

interface BlockLabel {
  text: Phaser.GameObjects.Text;
  life: number;
  startY: number;
}

export class CombatSystem {
  /** Reused label pool so a blocked hit allocates nothing mid-frame. */
  private readonly blockLabels: BlockLabel[] = [];
  private readonly scratchPoint: WorldPoint = { x: 0, y: 0 };

  /** Kills this frame, drained by GameScene for rewards (Phase 3). */
  killsThisFrame = 0;
  leaksThisFrame = 0;

  /** Current frame delta, so melee does not thread it through every call. */
  private frameDt = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly grid: Grid,
    private readonly run: RunState,
    private readonly layout: LayoutService,
    private readonly enemies: EnemyPool,
    private readonly projectiles: ProjectilePool
  ) {
    for (let i = 0; i < BLOCK_TEXT_POOL_SIZE; i++) {
      const text = scene.add
        .text(0, 0, t('combat.block'), {
          fontFamily: 'monospace',
          fontStyle: 'bold',
          color: Palette.blockText,
        })
        .setOrigin(0.5)
        .setDepth(Depth.FloatingText)
        .setVisible(false);
      this.blockLabels.push({ text, life: 0, startY: 0 });
    }
  }

  update(dt: number): void {
    this.frameDt = dt;
    this.killsThisFrame = 0;
    this.leaksThisFrame = 0;
    this.advanceEnemies(dt);
    this.fireUnits(dt);
    this.advanceProjectiles(dt);
    this.updateBlockLabels(dt);
  }

  onResize(cell: number): void {
    this.enemies.redrawAll(cell);
    for (let i = 0; i < this.projectiles.active.length; i++) {
      this.projectiles.active[i].redraw(cell);
    }
    for (let i = 0; i < this.blockLabels.length; i++) {
      this.blockLabels[i].text.setFontSize(Math.max(9, Math.round(cell * 0.26)));
    }
  }

  // --- enemies -----------------------------------------------------------

  private advanceEnemies(dt: number): void {
    const active = this.enemies.active;

    for (let i = active.length - 1; i >= 0; i--) {
      const enemy = active[i];

      // A blocker in the next cell stops the advance and takes melee damage.
      const blocker = enemy.ignoresUnits ? null : this.grid.getUnit(enemy.col, enemy.cellRow + 1);
      if (blocker) {
        this.applyMelee(enemy, blocker);
      } else {
        const rowsPerSecond = enemy.speedMult / SECONDS_PER_CELL;
        enemy.progress += rowsPerSecond * dt;
        while (enemy.progress >= 1) {
          enemy.cellRow += 1;
          enemy.progress -= 1;
        }
      }

      if (enemy.row >= LEAK_ROW) {
        if (DEBUG) {
          console.log(`[LEAK] ${enemy.enemyType} passed row ${GRID_ROWS - 1} in column ${enemy.col}`);
        }
        this.leaksThisFrame++;
        this.enemies.releaseAt(i);
        continue;
      }

      this.positionEnemy(enemy);
    }
  }

  private applyMelee(enemy: Enemy, target: Unit): void {
    const destroyed = target.takeDamage(enemy.meleeDps * this.frameDt);
    if (!destroyed) return;
    // The cell empties and every enemy behind this one resumes next frame.
    this.grid.removeUnitRef(target);
    target.destroy();
  }

  private positionEnemy(enemy: Enemy): void {
    this.layout.gridToWorld(enemy.col, enemy.row, this.scratchPoint);
    enemy.setPosition(this.scratchPoint.x, this.scratchPoint.y);
  }

  // --- units firing ------------------------------------------------------

  private fireUnits(dt: number): void {
    const interval = Math.max(ATTACK_INTERVAL_FLOOR, this.run.attackInterval);
    const cell = this.layout.get().cell;

    for (let i = 0; i < this.grid.cellCount; i++) {
      const unit = this.grid.unitAtIndex(i);
      if (!unit) continue;

      unit.cooldown -= dt;
      if (unit.cooldown > 0) continue;

      const target = this.nearestEnemyAbove(unit.col, unit.row);
      if (!target) {
        unit.cooldown = 0;
        continue;
      }

      unit.cooldown = interval;
      const damage = unit.dps * this.run.dpsMult * interval;
      const shot = this.projectiles.spawn(unit.col, unit.row - 0.5, damage, unit.tier, cell);
      this.layout.gridToWorld(shot.col, shot.row, this.scratchPoint);
      shot.setPosition(this.scratchPoint.x, this.scratchPoint.y);
      shot.setDepth(Depth.Projectile);
    }
  }

  /** Closest enemy above the unit in its own column — largest row wins (spec 4). */
  private nearestEnemyAbove(col: number, row: number): Enemy | null {
    const active = this.enemies.active;
    let best: Enemy | null = null;
    let bestRow = -Infinity;

    for (let i = 0; i < active.length; i++) {
      const enemy = active[i];
      if (enemy.col !== col) continue;
      if (enemy.row >= row) continue;
      if (enemy.row > bestRow) {
        bestRow = enemy.row;
        best = enemy;
      }
    }
    return best;
  }

  // --- projectiles -------------------------------------------------------

  private advanceProjectiles(dt: number): void {
    const active = this.projectiles.active;
    const step = PROJECTILE_ROWS_PER_SECOND * dt;

    for (let i = active.length - 1; i >= 0; i--) {
      const shot = active[i];
      shot.row -= step;

      if (shot.row < -1) {
        this.projectiles.releaseAt(i);
        continue;
      }

      const hitIndex = this.findHit(shot.col, shot.row);
      if (hitIndex >= 0) {
        this.resolveHit(hitIndex, shot.damage, shot.sourceTier);
        this.projectiles.releaseAt(i);
        continue;
      }

      this.layout.gridToWorld(shot.col, shot.row, this.scratchPoint);
      shot.setPosition(this.scratchPoint.x, this.scratchPoint.y);
    }
  }

  /** Index into the enemy pool of the lowest enemy overlapping this point. */
  private findHit(col: number, row: number): number {
    const active = this.enemies.active;
    let bestIndex = -1;
    let bestRow = -Infinity;

    for (let i = 0; i < active.length; i++) {
      const enemy = active[i];
      if (enemy.col !== col) continue;
      if (Math.abs(enemy.row - row) > HIT_RADIUS_ROWS) continue;
      if (enemy.row > bestRow) {
        bestRow = enemy.row;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private resolveHit(enemyIndex: number, damage: number, sourceTier: number): void {
    const enemy = this.enemies.active[enemyIndex];

    // shielded: low-tier shots land but deal nothing (spec 5).
    if (sourceTier <= enemy.immuneToTierAtOrBelow) {
      this.showBlock(enemy);
      return;
    }

    if (enemy.takeDamage(damage)) {
      this.killsThisFrame++;
      this.enemies.releaseAt(enemyIndex);
    }
  }

  // --- BLOCK labels ------------------------------------------------------

  private showBlock(enemy: Enemy): void {
    for (let i = 0; i < this.blockLabels.length; i++) {
      const label = this.blockLabels[i];
      if (label.life > 0) continue;
      label.life = BLOCK_TEXT_LIFETIME;
      label.startY = enemy.y;
      label.text.setPosition(enemy.x, enemy.y).setAlpha(1).setVisible(true);
      return;
    }
    // Pool exhausted: skip the label rather than allocate mid-frame.
  }

  private updateBlockLabels(dt: number): void {
    const rise = this.layout.get().cell * BLOCK_TEXT_RISE_RATIO;

    for (let i = 0; i < this.blockLabels.length; i++) {
      const label = this.blockLabels[i];
      if (label.life <= 0) continue;

      label.life -= dt;
      if (label.life <= 0) {
        label.text.setVisible(false);
        continue;
      }

      const progress = 1 - label.life / BLOCK_TEXT_LIFETIME;
      label.text.y = label.startY - rise * progress;
      label.text.setAlpha(1 - progress);
    }
  }
}
