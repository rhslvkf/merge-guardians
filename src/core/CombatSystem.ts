import Phaser from 'phaser';

import { DEBUG, Depth, GRID_ROWS, Palette } from '../config/constants';
import { Enemy, EnemyPool } from '../entities/Enemy';
import { ProjectilePool } from '../entities/Projectile';
import {
  ATTACK_INTERVAL_FLOOR,
  PROJECTILE_ROWS_PER_SECOND,
  SECONDS_PER_CELL,
  damagePerShot,
  isImmuneTo,
} from './rules';
import type { Unit } from '../entities/Unit';
import { t } from '../i18n';
import type { LayoutService, WorldPoint } from '../services/LayoutService';
import { FLOATING_TEXT_RISE_RATIO, FloatingTextPool } from '../ui/FloatingText';
import type { EnergySystem } from './EnergySystem';
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

/** An enemy centre this close to a shot counts as a hit, in rows. */
const HIT_RADIUS_ROWS = 0.45;

/** Enemy centre at this row has reached the bottom edge of the board. */
const LEAK_ROW = GRID_ROWS - 0.5;

const LABEL_POOL_SIZE = 16;
const LABEL_SIZE_RATIO = 0.26;

export class CombatSystem {
  /** Reused label pool so a hit or a reward allocates nothing mid-frame. */
  private readonly labels: FloatingTextPool;
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
    private readonly projectiles: ProjectilePool,
    private readonly energy: EnergySystem
  ) {
    this.labels = new FloatingTextPool(scene, LABEL_POOL_SIZE);
  }

  update(dt: number): void {
    this.frameDt = dt;
    this.killsThisFrame = 0;
    this.leaksThisFrame = 0;
    this.advanceEnemies(dt);
    this.fireUnits(dt);
    this.advanceProjectiles(dt);
    this.labels.update(dt, this.layout.get().cell * FLOATING_TEXT_RISE_RATIO);
  }

  onResize(cell: number): void {
    this.enemies.redrawAll(cell);
    for (let i = 0; i < this.projectiles.active.length; i++) {
      this.projectiles.active[i].redraw(cell);
    }
    this.labels.setFontSize(Math.max(9, Math.round(cell * LABEL_SIZE_RATIO)));
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
      const damage = damagePerShot(unit.dps, this.run.dpsMult, interval);
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
    if (isImmuneTo(enemy.enemyType, sourceTier)) {
      this.showBlock(enemy);
      return;
    }

    if (enemy.takeDamage(damage)) {
      this.killsThisFrame++;
      this.grantKillReward(enemy);
      this.enemies.releaseAt(enemyIndex);
    }
  }

  /** +1 energy and +1 gold per kill (spec 5), shown where the enemy died. */
  private grantKillReward(enemy: Enemy): void {
    this.energy.grantKillReward();
    this.labels.show(
      t('reward.kill', { energy: this.energy.energyPerKill, gold: this.energy.goldPerKill }),
      enemy.x,
      enemy.y,
      Palette.goldText
    );
  }

  // --- labels ------------------------------------------------------------

  private showBlock(enemy: Enemy): void {
    this.labels.show(t('combat.block'), enemy.x, enemy.y, Palette.blockText);
  }

  /** Drop every live label — used when a revive wipes the board. */
  clearLabels(): void {
    this.labels.clear();
  }
}
