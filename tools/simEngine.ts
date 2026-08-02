/**
 * The stepped wave simulation used by `tools/simulate.ts`.
 *
 * Split out purely for size (CLAUDE.md rule 10). Nothing here imports Phaser:
 * it steps the same rules the game runs on, from `src/core/rules.ts`.
 */

import { GRID_COLS, GRID_ROWS } from '../src/config/constants';
import { Grid, type Placeable } from '../src/core/Grid';
import { RunState } from '../src/core/RunState';
import { act, type Policy } from './simPlayer';
import {
  ENEMY_TYPES,
  ENERGY_MAX,
  ENERGY_PER_KILL,
  PROJECTILE_ROWS_PER_SECOND,
  SECONDS_PER_CELL,
  buildWaveSchedule,
  damagePerShot,
  enemyHp,
  isImmuneTo,
  waveTotalHp,
  type EnemyType,
  type ScheduledSpawn,
} from '../src/core/rules';

// --- entities ---------------------------------------------------------------

export interface SimUnit extends Placeable {
  tier: number;
  hp: number;
  maxHp: number;
  dps: number;
  cooldown: number;
}

export interface SimEnemy {
  type: EnemyType;
  col: number;
  cellRow: number;
  progress: number;
  hp: number;
}

interface SimShot {
  col: number;
  row: number;
  damage: number;
  sourceTier: number;
}

const STEP = 1 / 30;
const HIT_RADIUS_ROWS = 0.45;
const LEAK_ROW = GRID_ROWS - 0.5;
/** Give up on a wave that cannot resolve, so a stalemate is reported as a loss. */
const WAVE_TIMEOUT_SECONDS = 180;

export interface WaveResult {
  wave: number;
  allyDps: number;
  waveHp: number;
  ratio: number;
  cleared: boolean;
  seconds: number;
  livesLost: number;
  units: number;
  topTier: number;
}

/**
 * Play one wave to completion, carrying the board in and out.
 *
 * Returns the outcome plus the surviving board, so a run is a chain of waves
 * rather than 50 independent snapshots — that carry-over is most of what makes
 * the curve what it is.
 */
export function simulateWave(
  waveIndex: number,
  grid: Grid<SimUnit>,
  run: RunState,
  policy: Policy,
  rng: () => number
): WaveResult {
  const schedule: ScheduledSpawn[] = buildWaveSchedule(waveIndex, () =>
    Math.floor(rng() * GRID_COLS)
  );
  const enemies: SimEnemy[] = [];
  const shots: SimShot[] = [];

  let elapsed = 0;
  let nextSpawn = 0;
  let livesLost = 0;
  let actionTimer = 0;
  run.summonsThisWave = 0;

  while (elapsed < WAVE_TIMEOUT_SECONDS) {
    elapsed += STEP;

    // energy
    run.energy = Math.min(ENERGY_MAX, run.energy + run.energyRegen * STEP);

    // spawns
    while (nextSpawn < schedule.length && schedule[nextSpawn].time <= elapsed) {
      const s = schedule[nextSpawn];
      enemies.push({ type: s.type, col: s.col, cellRow: 0, progress: 0, hp: enemyHp(s.type, waveIndex) });
      nextSpawn++;
    }

    // enemy movement + melee
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const cfg = ENEMY_TYPES[e.type];
      const blocker = cfg.ignoresUnits ? null : grid.getUnit(e.col, e.cellRow + 1);
      if (blocker) {
        blocker.hp -= cfg.meleeDps * STEP;
        if (blocker.hp <= 0) grid.removeUnitRef(blocker);
      } else {
        e.progress += (cfg.speedMult / SECONDS_PER_CELL) * STEP;
        while (e.progress >= 1) {
          e.cellRow += 1;
          e.progress -= 1;
        }
      }
      if (e.cellRow + e.progress >= LEAK_ROW) {
        livesLost++;
        run.lives -= 1;
        enemies.splice(i, 1);
      }
    }

    // units fire
    const interval = Math.max(0.25, run.attackInterval);
    for (let idx = 0; idx < grid.cellCount; idx++) {
      const u = grid.unitAtIndex(idx);
      if (!u) continue;
      u.cooldown -= STEP;
      if (u.cooldown > 0) continue;
      let target: SimEnemy | null = null;
      let bestRow = -Infinity;
      for (const e of enemies) {
        const row = e.cellRow + e.progress;
        if (e.col !== u.col || row >= u.row) continue;
        if (row > bestRow) {
          bestRow = row;
          target = e;
        }
      }
      if (!target) {
        u.cooldown = 0;
        continue;
      }
      u.cooldown = interval;
      shots.push({
        col: u.col,
        row: u.row - 0.5,
        damage: damagePerShot(u.dps, run.dpsMult, interval),
        sourceTier: u.tier,
      });
    }

    // shots travel and land
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.row -= PROJECTILE_ROWS_PER_SECOND * STEP;
      if (s.row < -1) {
        shots.splice(i, 1);
        continue;
      }
      let hit = -1;
      let bestRow = -Infinity;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        const row = e.cellRow + e.progress;
        if (e.col !== s.col || Math.abs(row - s.row) > HIT_RADIUS_ROWS) continue;
        if (row > bestRow) {
          bestRow = row;
          hit = j;
        }
      }
      if (hit < 0) continue;
      const e = enemies[hit];
      if (!isImmuneTo(e.type, s.sourceTier)) {
        e.hp -= s.damage;
        if (e.hp <= 0) {
          enemies.splice(hit, 1);
          run.energy = Math.min(ENERGY_MAX, run.energy + ENERGY_PER_KILL);
          run.gold += 1;
        }
      }
      shots.splice(i, 1);
    }

    // player
    actionTimer -= STEP;
    if (actionTimer <= 0) {
      actionTimer = policy.actionInterval;
      // A missed opportunity costs real time, not one re-roll.
      if (!act(grid, run, enemies, policy, rng)) actionTimer += policy.missIdleSeconds;
    }

    if (run.lives <= 0) break;
    if (nextSpawn >= schedule.length && enemies.length === 0) break;
  }

  let allyDps = 0;
  let units = 0;
  let topTier = 0;
  for (let i = 0; i < grid.cellCount; i++) {
    const u = grid.unitAtIndex(i);
    if (!u) continue;
    allyDps += u.dps * run.dpsMult;
    units++;
    if (u.tier > topTier) topTier = u.tier;
  }

  const waveHp = waveTotalHp(waveIndex);
  return {
    wave: waveIndex + 1,
    allyDps,
    waveHp,
    ratio: waveHp > 0 ? allyDps / waveHp : 0,
    cleared: enemies.length === 0 && nextSpawn >= schedule.length && run.lives > 0,
    seconds: elapsed,
    livesLost,
    units,
    topTier,
  };
}

