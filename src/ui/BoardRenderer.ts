import Phaser from 'phaser';

import { Depth, GRID_COLS, GRID_ROWS, Palette } from '../config/constants';
import type { Grid } from '../core/Grid';
import type { RunState } from '../core/RunState';
import type { LayoutService, WorldPoint } from '../services/LayoutService';

/**
 * Draws the board: cell tints for the two areas, the grid lines, the outer edge
 * and the line the player may not build past.
 *
 * Presentation only — it reads Grid and RunState and owns no state of its own,
 * which keeps GameScene down to orchestration.
 *
 * Redrawn on resize, and whenever the ally area changes (the `boardExpand`
 * upgrade in Phase 4).
 */
export class BoardRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly scratch: WorldPoint = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly layout: LayoutService,
    private readonly grid: Grid,
    private readonly run: RunState
  ) {
    this.gfx = scene.add.graphics().setDepth(Depth.Board);
  }

  redraw(): void {
    const { cell, originX, originY, gridW, gridH } = this.layout.get();
    const gfx = this.gfx;

    gfx.clear();
    if (cell <= 0) return;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const ally = this.grid.isAllyCell(col, row);
        this.layout.cellTopLeft(col, row, this.scratch);
        gfx.fillStyle(ally ? Palette.boardAllyArea : Palette.boardEnemyArea, 1);
        gfx.fillRect(this.scratch.x, this.scratch.y, cell, cell);
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
}
