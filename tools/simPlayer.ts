/**
 * The scripted players the simulator plays against.
 *
 * Split from simEngine purely for size (CLAUDE.md rule 10).
 */

import { GRID_COLS, GRID_ROWS } from '../src/config/constants';
import type { Grid } from '../src/core/Grid';
import type { RunState } from '../src/core/RunState';
import {
  canMergeTiers,
  summonCost,
  tierDps,
  unitMaxHp,
} from '../src/core/rules';
import type { SimEnemy, SimUnit } from './simEngine';

export type PolicyName = 'greedy' | 'hoarder' | 'sloppy';

export interface Policy {
  name: PolicyName;
  /** Seconds between decisions — a beginner simply reacts more slowly. */
  actionInterval: number;
  /** Chance of taking an available merge when one is offered. */
  mergeReliability: number;
  /** Summon even when a merge is also available? */
  summonBeforeMerge: boolean;
  /** Does this policy plug an undefended column? */
  repositions: boolean;
  /**
   * Seconds spent doing nothing after a missed opportunity.
   *
   * Without this the miss is meaningless: a 20% failure re-rolled four times a
   * second still succeeds within half a second, which made `sloppy` and
   * `greedy` land within one wave of each other in the first sweep.
   */
  missIdleSeconds: number;
}

export const POLICIES: Record<PolicyName, Policy> = {
  // Spends the moment it can: summon whenever affordable, merge on sight.
  greedy: {
    name: 'greedy',
    actionInterval: 0.25,
    mergeReliability: 1,
    summonBeforeMerge: true,
    repositions: true,
    missIdleSeconds: 0,
  },
  // Banks energy and puts merging first, so it fields fewer, bigger units.
  hoarder: {
    name: 'hoarder',
    actionInterval: 0.25,
    mergeReliability: 1,
    summonBeforeMerge: false,
    repositions: true,
    missIdleSeconds: 0,
  },
  // Beginner: reacts slowly and misses one merge in five, losing a couple of
  // seconds each time. Still rotates defenders — never doing so at all is
  // harsher than a real beginner, and made this policy lose on wave 1.
  sloppy: {
    name: 'sloppy',
    actionInterval: 0.7,
    mergeReliability: 0.8,
    summonBeforeMerge: true,
    repositions: true,
    missIdleSeconds: 1.5,
  },
};

/**
 * One decision: cover a hole, then merge or summon per policy.
 *
 * Returns false when the player fumbled an opportunity, so the caller can make
 * that cost time.
 */
export function act(
  grid: Grid<SimUnit>,
  run: RunState,
  enemies: SimEnemy[],
  policy: Policy,
  rng: () => number
): boolean {
  const cost = summonCost(run.summonCostStep, run.summonsThisWave);
  const canSummon = run.energy >= cost && grid.freeAllyCellCount() > 0;

  // A unit only defends its own column, so plugging an undefended lane beats
  // anything else the player could do with the same second.
  if (policy.repositions && coverThreatenedColumn(grid, run, enemies)) return true;

  const wantMergeFirst = !policy.summonBeforeMerge;
  if (wantMergeFirst) {
    const merged = tryMerge(grid, run, policy, rng);
    if (merged === 'merged') return true;
    if (merged === 'missed') return false;
  }
  if (canSummon) {
    summon(grid, run, cost, rng);
    return true;
  }
  if (!wantMergeFirst) {
    const merged = tryMerge(grid, run, policy, rng);
    if (merged === 'missed') return false;
  }
  return true;
}

function summon(grid: Grid<SimUnit>, run: RunState, cost: number, rng: () => number): void {
  const cell = { col: 0, row: 0 };
  if (!randomFreeCell(grid, run, rng, cell)) return;
  run.energy -= cost;
  run.summonsThisWave += 1;
  grid.setUnit(cell.col, cell.row, makeUnit(1));
}

function makeUnit(tier: number): SimUnit {
  return {
    col: -1,
    row: -1,
    tier,
    hp: unitMaxHp(tier),
    maxHp: unitMaxHp(tier),
    dps: tierDps(tier),
    cooldown: 0,
  };
}

function randomFreeCell(
  grid: Grid<SimUnit>,
  run: RunState,
  rng: () => number,
  out: { col: number; row: number }
): boolean {
  let seen = 0;
  for (let row = run.allyTopRow; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (!grid.isFreeAllyCell(col, row)) continue;
      seen++;
      if (rng() * seen < 1) {
        out.col = col;
        out.row = row;
      }
    }
  }
  return seen > 0;
}

/** Merge the lowest available same-tier pair. */
function tryMerge(
  grid: Grid<SimUnit>,
  run: RunState,
  policy: Policy,
  rng: () => number
): 'merged' | 'missed' | 'none' {
  const byTier = new Map<number, SimUnit[]>();
  for (let i = 0; i < grid.cellCount; i++) {
    const u = grid.unitAtIndex(i);
    if (!u) continue;
    const list = byTier.get(u.tier);
    if (list) list.push(u);
    else byTier.set(u.tier, [u]);
  }

  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  for (const tier of tiers) {
    if (!canMergeTiers(tier, tier)) continue;
    const list = byTier.get(tier)!;
    if (list.length < 2) continue;
    // The opportunity exists; a sloppy player may still fail to act on it.
    if (rng() > policy.mergeReliability) return 'missed';
    const [a, b] = list;
    grid.removeUnitRef(a);
    b.tier = tier + 1;
    b.dps = tierDps(b.tier);
    b.maxHp = unitMaxHp(b.tier);
    b.hp = b.maxHp; // merging is a heal (spec 4)
    if (run.mergeHeal) {
      for (let i = 0; i < 4; i++) {
        const n = grid.neighbourUnit(b.col, b.row, i as 0 | 1 | 2 | 3);
        if (n) n.hp = Math.min(n.maxHp, n.hp + n.maxHp * 0.3);
      }
    }
    return 'merged';
  }
  return 'none';
}

/** Move a spare defender into a column that has enemies but nothing to stop them. */
function coverThreatenedColumn(
  grid: Grid<SimUnit>,
  run: RunState,
  enemies: SimEnemy[]
): boolean {
  const perCol = new Array<number>(GRID_COLS).fill(0);
  for (let i = 0; i < grid.cellCount; i++) {
    const u = grid.unitAtIndex(i);
    if (u) perCol[u.col]++;
  }
  const threat = new Array<boolean>(GRID_COLS).fill(false);
  for (const e of enemies) threat[e.col] = true;

  let target = -1;
  for (let c = 0; c < GRID_COLS; c++) {
    if (threat[c] && perCol[c] === 0 && grid.isAllyCell(c, GRID_ROWS - 1)) {
      target = c;
      break;
    }
  }
  if (target < 0) return false;

  let donor = -1;
  for (let c = 0; c < GRID_COLS; c++) if (perCol[c] > 1) donor = c;
  if (donor < 0) for (let c = 0; c < GRID_COLS; c++) if (perCol[c] > 0 && !threat[c]) donor = c;
  if (donor < 0) return false;

  for (let row = GRID_ROWS - 1; row >= run.allyTopRow; row--) {
    const u = grid.getUnit(donor, row);
    if (!u) continue;
    for (let r = GRID_ROWS - 1; r >= run.allyTopRow; r--) {
      if (!grid.isFreeAllyCell(target, r)) continue;
      grid.removeUnitRef(u);
      grid.setUnit(target, r, u);
      return true;
    }
    return false;
  }
  return false;
}

