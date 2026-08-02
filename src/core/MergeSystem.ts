import type { Unit } from '../entities/Unit';
import type { Grid } from './Grid';
import type { RunState } from './RunState';

/**
 * Drag resolution and merge rules.
 *
 * Rules (spec section 4):
 *  - Two units of the same tier merge into one unit of the next tier.
 *  - The merged unit spawns at full HP, which makes merging a heal.
 *  - Merging the bombed cell's unit defuses a `bomb` modifier tile. (Phase 4)
 *  - With `mergeHeal`, orthogonal neighbours recover 30% of max HP. (Phase 4)
 *
 * This file decides and mutates the *grid*; the caller owns the visuals, so the
 * merge rules stay testable without a renderer.
 */

export type DropKind = 'none' | 'move' | 'swap' | 'merge';

export interface DropOutcome {
  kind: DropKind;
  col: number;
  row: number;
  /** For a merge, the unit that absorbed the dragged one and gained a tier. */
  absorbed: Unit | null;
}

export class MergeSystem {
  /** Reused so pointermove previews allocate nothing (rule 4). */
  private readonly previewOut: DropOutcome = { kind: 'none', col: -1, row: -1, absorbed: null };
  private readonly applyOut: DropOutcome = { kind: 'none', col: -1, row: -1, absorbed: null };

  constructor(
    private readonly grid: Grid,
    private readonly run: RunState
  ) {}

  /** Same tier, and the result would still be a real tier. */
  canMerge(sourceTier: number, targetTier: number): boolean {
    return sourceTier === targetTier && sourceTier < this.run.maxTier;
  }

  /**
   * What dropping `unit` on (col,row) would do, without changing anything.
   *
   * The returned object is reused between calls — read it before calling again.
   */
  previewDrop(unit: Unit, col: number, row: number): DropOutcome {
    return this.decide(unit, col, row, this.previewOut);
  }

  /** Resolve the drop and apply it to the grid. */
  applyDrop(unit: Unit, col: number, row: number): DropOutcome {
    const outcome = this.decide(unit, col, row, this.applyOut);
    const fromCol = unit.col;
    const fromRow = unit.row;

    switch (outcome.kind) {
      case 'move':
        this.grid.moveUnit(fromCol, fromRow, col, row);
        break;

      case 'swap':
        this.grid.swapUnits(fromCol, fromRow, col, row);
        break;

      case 'merge':
        // The absorbing unit gains the tier and the dragged one is consumed, so
        // no new unit is created. Phase 2 refills its HP here, which is what
        // makes merging a heal.
        this.grid.removeUnit(fromCol, fromRow);
        outcome.absorbed?.setTier(unit.tier + 1);
        break;

      case 'none':
        break;
    }

    return outcome;
  }

  private decide(unit: Unit, col: number, row: number, out: DropOutcome): DropOutcome {
    out.kind = 'none';
    out.col = col;
    out.row = row;
    out.absorbed = null;

    // Rows 0..allyTopRow-1 are the enemy approach area — nothing may be placed there.
    if (!this.grid.isAllyCell(col, row)) return out;
    if (col === unit.col && row === unit.row) return out;

    const target = this.grid.getUnit(col, row);

    if (target === null) {
      out.kind = 'move';
      return out;
    }

    if (this.canMerge(unit.tier, target.tier)) {
      out.kind = 'merge';
      out.absorbed = target;
      return out;
    }

    // Same tier but already at the cap: leave both where they are.
    if (unit.tier === target.tier) return out;

    out.kind = 'swap';
    return out;
  }
}
