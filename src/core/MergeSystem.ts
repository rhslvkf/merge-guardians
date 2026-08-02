import Phaser from 'phaser';

import { DRAG_THRESHOLD_PX, Depth, Palette } from '../config/constants';
import type { Unit } from '../entities/Unit';
import type { CellCoord, LayoutService, WorldPoint } from '../services/LayoutService';
import type { Grid } from './Grid';
import type { RunState } from './RunState';

/**
 * Drag handling and merge rules.
 *
 * Rules (spec section 4):
 *  - Two units of the same tier merge into one unit of the next tier.
 *  - The merged unit is refilled to full HP, which makes merging a heal.
 *  - Merging the bombed cell's unit defuses a `bomb` modifier tile. (Phase 4)
 *  - With `mergeHeal`, orthogonal neighbours recover 30% of max HP. (Phase 4)
 *
 * Owns the pointer interaction as well as the rules, so GameScene stays an
 * orchestrator. Drop decisions mutate only the grid, keeping the rules testable
 * without a renderer.
 */

export type DropKind = 'none' | 'move' | 'swap' | 'merge';

export interface DropOutcome {
  kind: DropKind;
  col: number;
  row: number;
  /** For a merge, the unit that absorbed the dragged one and gained a tier. */
  absorbed: Unit | null;
}

const DRAG_SCALE = 1.15;
const DRAG_ALPHA = 0.82;
/**
 * The drop ring is drawn *outside* the cell bounds. A dragged unit covers about
 * 97% of a cell, so a ring drawn inside it would be invisible exactly when the
 * player needs it.
 */
const HIGHLIGHT_GROW_RATIO = 0.06;
const HIGHLIGHT_STROKE_RATIO = 0.06;

export class MergeSystem {
  private readonly highlight: Phaser.GameObjects.Graphics;

  private pressedUnit: Unit | null = null;
  private dragging = false;
  private pressX = 0;
  private pressY = 0;

  /** Reused so pointer handling allocates nothing (rule 4). */
  private readonly previewOut: DropOutcome = { kind: 'none', col: -1, row: -1, absorbed: null };
  private readonly applyOut: DropOutcome = { kind: 'none', col: -1, row: -1, absorbed: null };
  private readonly scratchCell: CellCoord = { col: 0, row: 0 };
  private readonly scratchPoint: WorldPoint = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: Grid,
    private readonly run: RunState,
    private readonly layout: LayoutService
  ) {
    this.highlight = scene.add.graphics().setDepth(Depth.Highlight);
  }

  attachInput(): void {
    const input = this.scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
  }

  detachInput(): void {
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
  }

  // --- rules -------------------------------------------------------------

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
        // no new unit is created. setTier refills HP, which is the heal.
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

    // Rows above allyTopRow are the enemy approach area — nothing goes there.
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

  // --- pointer interaction -----------------------------------------------

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.pressedUnit) return;
    if (!this.grid.worldToGrid(pointer.x, pointer.y, this.scratchCell)) return;

    const unit = this.grid.getUnit(this.scratchCell.col, this.scratchCell.row);
    if (!unit) return;

    this.pressedUnit = unit;
    this.dragging = false;
    this.pressX = pointer.x;
    this.pressY = pointer.y;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const unit = this.pressedUnit;
    if (!unit) return;

    // Combat can destroy the unit mid-drag; a destroyed object loses its scene.
    if (!unit.scene) {
      this.resetDrag();
      return;
    }

    if (!this.dragging) {
      const dx = pointer.x - this.pressX;
      const dy = pointer.y - this.pressY;
      // Squared compare avoids a sqrt on every pointer event.
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      this.dragging = true;
      unit.setDepth(Depth.Dragging).setScale(DRAG_SCALE).setAlpha(DRAG_ALPHA);
    }

    unit.setPosition(pointer.x, pointer.y);
    this.drawDropHighlight(unit, pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const unit = this.pressedUnit;
    if (!unit) return;

    this.pressedUnit = null;
    this.highlight.clear();

    if (!unit.scene) {
      this.dragging = false;
      return;
    }

    // A press that never crossed the threshold is a tap, not a drag.
    if (!this.dragging) return;
    this.dragging = false;

    unit.setDepth(Depth.Unit).setScale(1).setAlpha(1);

    if (this.grid.worldToGrid(pointer.x, pointer.y, this.scratchCell)) {
      const outcome = this.applyDrop(unit, this.scratchCell.col, this.scratchCell.row);
      if (outcome.kind === 'merge') {
        outcome.absorbed?.redraw(this.layout.get().cell);
        unit.destroy();
        return;
      }
    }

    // move, swap and rejected drops all end with every unit back on its cell.
    this.snapAllUnits();
  }

  private resetDrag(): void {
    this.pressedUnit = null;
    this.dragging = false;
    this.highlight.clear();
  }

  private snapAllUnits(): void {
    for (let i = 0; i < this.grid.cellCount; i++) {
      this.grid.unitAtIndex(i)?.snapToGrid(this.layout);
    }
  }

  private drawDropHighlight(unit: Unit, pointer: Phaser.Input.Pointer): void {
    const gfx = this.highlight;
    gfx.clear();

    if (!this.grid.worldToGrid(pointer.x, pointer.y, this.scratchCell)) return;

    const outcome = this.previewDrop(unit, this.scratchCell.col, this.scratchCell.row);
    if (outcome.kind === 'none') return;

    const merge = outcome.kind === 'merge';
    const { cell } = this.layout.get();
    const grow = Math.max(2, cell * HIGHLIGHT_GROW_RATIO);
    const size = cell + grow * 2;
    const stroke = Math.max(2, Math.round(cell * HIGHLIGHT_STROKE_RATIO));
    const color = merge ? Palette.mergeHighlight : Palette.moveHighlight;

    this.layout.cellTopLeft(outcome.col, outcome.row, this.scratchPoint);
    const x = this.scratchPoint.x - grow;
    const y = this.scratchPoint.y - grow;

    // A merge tints the cell as well, so the unit being absorbed reads clearly.
    gfx.fillStyle(color, merge ? 0.3 : 0.12);
    gfx.fillRoundedRect(x, y, size, size, size * 0.18);
    gfx.lineStyle(stroke, color, merge ? 1 : 0.7);
    gfx.strokeRoundedRect(x, y, size, size, size * 0.18);
  }
}
