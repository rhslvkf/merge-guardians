import Phaser from 'phaser';

import {
  DEBUG,
  DRAG_THRESHOLD_PX,
  Depth,
  GRID_COLS,
  GRID_ROWS,
  GameEvent,
  Palette,
  RegistryKey,
  SceneKey,
} from '../config/constants';
import { Grid } from '../core/Grid';
import { MergeSystem } from '../core/MergeSystem';
import { RunState } from '../core/RunState';
import { Unit } from '../entities/Unit';
import { LayoutService, type CellCoord, type WorldPoint } from '../services/LayoutService';

/**
 * Gameplay only: board, units, and the drag-to-merge interaction.
 *
 * Owns no UI. HUD and panels live in UIScene and are reached exclusively through
 * the events in `GameEvent` (rule 7).
 *
 * Phase 1 scope — no enemies, no combat, no energy cost.
 */

const DRAG_SCALE = 1.15;
const DRAG_ALPHA = 0.82;
/**
 * The drop ring is drawn *outside* the cell bounds. A dragged unit covers about
 * 97% of a cell, so a ring drawn inside it would be invisible exactly when the
 * player needs it.
 */
const HIGHLIGHT_GROW_RATIO = 0.06;
const HIGHLIGHT_STROKE_RATIO = 0.06;

export class GameScene extends Phaser.Scene {
  private layout!: LayoutService;
  private run!: RunState;
  private grid!: Grid;
  private mergeSystem!: MergeSystem;

  private boardGfx!: Phaser.GameObjects.Graphics;
  private highlightGfx!: Phaser.GameObjects.Graphics;

  // --- drag state ---
  private pressedUnit: Unit | null = null;
  private dragging = false;
  private pressX = 0;
  private pressY = 0;

  // --- scratch objects, reused so pointer handling allocates nothing (rule 4) ---
  private readonly scratchCell: CellCoord = { col: 0, row: 0 };
  private readonly scratchPoint: WorldPoint = { x: 0, y: 0 };
  private readonly placeUnitBound = (unit: Unit): void => this.positionUnit(unit);

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    this.layout = new LayoutService();
    this.run = new RunState();
    this.run.reset();
    this.grid = new Grid(this.layout, this.run);
    this.mergeSystem = new MergeSystem(this.grid, this.run);

    // UIScene reads these rather than holding copies of its own (rules 6 and 7).
    this.registry.set(RegistryKey.Layout, this.layout);
    this.registry.set(RegistryKey.RunState, this.run);

    this.boardGfx = this.add.graphics().setDepth(Depth.Board);
    this.highlightGfx = this.add.graphics().setDepth(Depth.Highlight);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.game.events.on(GameEvent.SummonRequested, this.summonUnit, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);

    this.handleResize();
    this.scene.launch(SceneKey.UI);
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.game.events.off(GameEvent.SummonRequested, this.summonUnit, this);
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
      this.positionUnit(unit);
    });

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

  private positionUnit(unit: Unit): void {
    this.grid.gridToWorld(unit.col, unit.row, this.scratchPoint);
    unit.setPosition(this.scratchPoint.x, this.scratchPoint.y);
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
    this.positionUnit(unit);
  }

  // --- drag and drop -----------------------------------------------------

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

    if (!this.dragging) {
      const dx = pointer.x - this.pressX;
      const dy = pointer.y - this.pressY;
      // Squared compare avoids a sqrt on every pointer event.
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      this.beginDrag(unit);
    }

    unit.setPosition(pointer.x, pointer.y);
    this.drawDropHighlight(unit, pointer);
  }

  private beginDrag(unit: Unit): void {
    this.dragging = true;
    unit.setDepth(Depth.Dragging).setScale(DRAG_SCALE).setAlpha(DRAG_ALPHA);
  }

  private drawDropHighlight(unit: Unit, pointer: Phaser.Input.Pointer): void {
    const gfx = this.highlightGfx;
    gfx.clear();

    if (!this.grid.worldToGrid(pointer.x, pointer.y, this.scratchCell)) return;

    const outcome = this.mergeSystem.previewDrop(unit, this.scratchCell.col, this.scratchCell.row);
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

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const unit = this.pressedUnit;
    if (!unit) return;

    this.pressedUnit = null;
    this.highlightGfx.clear();

    // A press that never crossed the threshold is a tap, not a drag.
    if (!this.dragging) return;
    this.dragging = false;

    unit.setDepth(Depth.Unit).setScale(1).setAlpha(1);

    if (this.grid.worldToGrid(pointer.x, pointer.y, this.scratchCell)) {
      const outcome = this.mergeSystem.applyDrop(unit, this.scratchCell.col, this.scratchCell.row);
      if (outcome.kind === 'merge') {
        outcome.absorbed?.redraw(this.layout.get().cell);
        unit.destroy();
        return;
      }
    }

    // move, swap and rejected drops all end with every unit back on its cell.
    this.grid.forEachUnit(this.placeUnitBound);
  }

  override update(_time: number, _deltaMs: number): void {
    // Rule 4: no allocation here. Enemies and projectiles arrive in Phase 2.
  }
}
