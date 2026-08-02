/**
 * Board state: what occupies each cell, which cells the player may use, and
 * free-cell lookup for summoning.
 *
 * Grid holds *logical* cells only. Screen positions come from LayoutService
 * (rule 5); this file never sees a pixel.
 *
 * Stub — implemented in Phase 1.
 */

export type CellContent = 'empty' | 'unit' | 'rock' | 'bomb';

export interface CellCoord {
  col: number;
  row: number;
}

export class Grid {
  /** True when (col,row) is inside the board. */
  contains(_col: number, _row: number): boolean {
    // TODO(phase-1)
    return false;
  }

  /** True when the player may place or merge on this cell right now. */
  isAllyCell(_col: number, _row: number): boolean {
    // TODO(phase-1): respects the boardExpand upgrade and blockedColumn rocks.
    return false;
  }

  /** A random free ally cell, or null when the board is full. */
  randomFreeAllyCell(): CellCoord | null {
    // TODO(phase-1)
    return null;
  }

  /** Free ally cell count — drives the "board full" summon lockout. */
  freeAllyCellCount(): number {
    // TODO(phase-1)
    return 0;
  }
}
