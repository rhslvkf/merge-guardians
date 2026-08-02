import { GRID_COLS, GRID_ROWS } from '../config/constants';
import type { Unit } from '../entities/Unit';
import type { CellCoord, LayoutService, WorldPoint } from '../services/LayoutService';
import type { RunState } from './RunState';

/**
 * Board state: what occupies each cell, which cells the player may use, and
 * free-cell lookup for summoning.
 *
 * Grid holds *logical* cells; the pixel maths lives in LayoutService (rule 5).
 * The coordinate helpers here are thin delegates so entities only need a Grid
 * reference to place themselves.
 */

export type CellContent = 'empty' | 'unit' | 'rock' | 'bomb';

export type { CellCoord };

/**
 * The only thing Grid needs from whatever it stores.
 *
 * Generic so `tools/simulate.ts` can put its own lightweight unit on the same
 * board logic instead of reimplementing placement, blocking and free-cell
 * search — the game keeps the `Unit` default and reads unchanged.
 */
export interface Placeable {
  col: number;
  row: number;
}

export class Grid<T extends Placeable = Unit> {
  /** Row-major, length GRID_COLS * GRID_ROWS. */
  private readonly cells: (T | null)[] = new Array(GRID_COLS * GRID_ROWS).fill(null);

  /**
   * Column sealed off by the `blockedColumn` modifier, or -1.
   *
   * Held here rather than in RunState because it belongs to the wave, not the
   * run, and every placement question already goes through this class.
   */
  private blockedCol = -1;

  constructor(
    private readonly layout: LayoutService,
    private readonly run: RunState
  ) {}

  // --- coordinates -------------------------------------------------------

  gridToWorld(col: number, row: number, out?: WorldPoint): WorldPoint {
    return this.layout.gridToWorld(col, row, out);
  }

  worldToGrid(x: number, y: number, out: CellCoord): boolean {
    return this.layout.worldToGrid(x, y, out);
  }

  get cellSize(): number {
    return this.layout.get().cell;
  }

  // --- cell queries ------------------------------------------------------

  contains(col: number, row: number): boolean {
    return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
  }

  /**
   * True when the player may place or merge on this cell.
   *
   * Reads `allyTopRow` from RunState so the `boardExpand` upgrade needs no
   * change here (rule 6), and refuses a column the `blockedColumn` modifier has
   * sealed off, so placement, merging and summoning all honour it for free.
   */
  isAllyCell(col: number, row: number): boolean {
    if (!this.contains(col, row)) return false;
    if (col === this.blockedCol) return false;
    return row >= this.run.allyTopRow;
  }

  /** Ally area regardless of the wave modifier — used to draw the rocks. */
  isAllyArea(col: number, row: number): boolean {
    return this.contains(col, row) && row >= this.run.allyTopRow;
  }

  get blockedColumn(): number {
    return this.blockedCol;
  }

  setBlockedColumn(col: number): void {
    this.blockedCol = col;
  }

  private index(col: number, row: number): number {
    return row * GRID_COLS + col;
  }

  getUnit(col: number, row: number): T | null {
    if (!this.contains(col, row)) return null;
    return this.cells[this.index(col, row)];
  }

  isFreeAllyCell(col: number, row: number): boolean {
    return this.isAllyCell(col, row) && this.cells[this.index(col, row)] === null;
  }

  /** Orthogonal neighbour of (col,row) — used by bomb blast and mergeHeal. */
  neighbourUnit(col: number, row: number, index: 0 | 1 | 2 | 3): T | null {
    const dc = index === 0 ? -1 : index === 1 ? 1 : 0;
    const dr = index === 2 ? -1 : index === 3 ? 1 : 0;
    return this.getUnit(col + dc, row + dr);
  }

  // --- mutation ----------------------------------------------------------

  /** Place (or clear, with null) a unit and keep its own col/row in sync. */
  setUnit(col: number, row: number, unit: T | null): void {
    if (!this.contains(col, row)) return;
    this.cells[this.index(col, row)] = unit;
    if (unit) {
      unit.col = col;
      unit.row = row;
    }
  }

  moveUnit(fromCol: number, fromRow: number, toCol: number, toRow: number): void {
    const unit = this.getUnit(fromCol, fromRow);
    if (!unit) return;
    this.setUnit(fromCol, fromRow, null);
    this.setUnit(toCol, toRow, unit);
  }

  swapUnits(aCol: number, aRow: number, bCol: number, bRow: number): void {
    const a = this.getUnit(aCol, aRow);
    const b = this.getUnit(bCol, bRow);
    this.setUnit(aCol, aRow, b);
    this.setUnit(bCol, bRow, a);
  }

  removeUnit(col: number, row: number): void {
    this.setUnit(col, row, null);
  }

  // --- searches ----------------------------------------------------------

  freeAllyCellCount(): number {
    let count = 0;
    for (let row = this.run.allyTopRow; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (col === this.blockedCol) continue;
        if (this.cells[this.index(col, row)] === null) count++;
      }
    }
    return count;
  }

  /**
   * A uniformly random free ally cell, or null when the area is full.
   *
   * Reservoir sampling, so no candidate array is allocated (rule 4).
   */
  randomFreeAllyCell(out: CellCoord): boolean {
    let seen = 0;
    let chosenCol = -1;
    let chosenRow = -1;

    for (let row = this.run.allyTopRow; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (col === this.blockedCol) continue;
        if (this.cells[this.index(col, row)] !== null) continue;
        seen++;
        if (Math.random() * seen < 1) {
          chosenCol = col;
          chosenRow = row;
        }
      }
    }

    if (seen === 0) return false;
    out.col = chosenCol;
    out.row = chosenRow;
    return true;
  }

  /** Cell count, for index-based iteration that allocates no closure (rule 4). */
  get cellCount(): number {
    return this.cells.length;
  }

  unitAtIndex(index: number): T | null {
    return this.cells[index];
  }

  /** Clear whichever cell holds this unit. Used when combat destroys it. */
  removeUnitRef(unit: T): void {
    const i = this.index(unit.col, unit.row);
    if (this.cells[i] === unit) this.cells[i] = null;
  }

  /** Visit every occupied cell — used to reposition units after a resize. */
  forEachUnit(callback: (unit: T) => void): void {
    for (let i = 0; i < this.cells.length; i++) {
      const unit = this.cells[i];
      if (unit) callback(unit);
    }
  }

  clear(): void {
    this.cells.fill(null);
  }
}
