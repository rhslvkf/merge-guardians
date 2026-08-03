import Phaser from 'phaser';

import { Depth, GRID_COLS, GRID_ROWS, Palette, RegistryKey } from '../config/constants';
import type { Grid } from '../core/Grid';
import type { ModifierSystem } from '../core/ModifierSystem';
import type { RunState } from '../core/RunState';
import type { ArtService } from '../services/ArtService';
import type { LayoutService, WorldPoint } from '../services/LayoutService';

/**
 * Draws the board: cell tints for the two areas, the grid lines, the outer edge
 * and the line the player may not build past.
 *
 * Presentation only — it reads Grid and RunState and owns no state of its own,
 * which keeps GameScene down to orchestration.
 *
 * Also draws the static wave-modifier overlays: the `blockedColumn` rocks and
 * the `fog` band. Both change only at wave boundaries, so they ride along with
 * the board's own redraw instead of costing anything per frame. The bomb's
 * countdown is dynamic and lives in ModifierSystem.
 *
 * Redrawn on resize, on wave start, and whenever the ally area changes
 * (`boardExpand`).
 */
export class BoardRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly rockGfx: Phaser.GameObjects.Graphics;
  private readonly fogGfx: Phaser.GameObjects.Graphics;
  /** One per board row — the most a sealed column can ever need. */
  private readonly rockSprites: Phaser.GameObjects.Image[] = [];
  private readonly art?: ArtService;
  private readonly scratch: WorldPoint = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly layout: LayoutService,
    private readonly grid: Grid,
    private readonly run: RunState,
    private readonly modifiers: ModifierSystem
  ) {
    this.gfx = scene.add.graphics().setDepth(Depth.Board);
    this.rockGfx = scene.add.graphics().setDepth(Depth.Rock);
    this.fogGfx = scene.add.graphics().setDepth(Depth.Fog);
    this.art = scene.registry.get(RegistryKey.Art) as ArtService | undefined;

    for (let i = 0; i < GRID_ROWS; i++) {
      this.rockSprites.push(
        scene.add.image(0, 0, '__DEFAULT').setDepth(Depth.Rock).setVisible(false)
      );
    }
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

    this.drawRocks(cell);
    this.drawFog(cell, originX, gridW);
  }

  /** `blockedColumn`: rock over the sealed column's ally cells (spec 7). */
  private drawRocks(cell: number): void {
    const gfx = this.rockGfx;
    gfx.clear();
    for (let i = 0; i < this.rockSprites.length; i++) this.rockSprites[i].setVisible(false);

    const col = this.grid.blockedColumn;
    if (col < 0) return;

    const sprite = this.art?.rock() ?? null;
    const inset = cell * 0.1;
    const size = cell - inset * 2;
    let used = 0;

    for (let row = 0; row < GRID_ROWS; row++) {
      if (!this.grid.isAllyArea(col, row)) continue;
      this.layout.cellTopLeft(col, row, this.scratch);
      const x = this.scratch.x + inset;
      const y = this.scratch.y + inset;

      if (sprite) {
        const image = this.rockSprites[used++];
        image.setTexture(sprite.key, sprite.frame);
        const source = Math.max(image.frame.width, image.frame.height);
        image
          .setScale(source > 0 ? size / source : 1)
          .setPosition(x + size / 2, y + size / 2)
          .setVisible(true);
        continue;
      }

      gfx.fillStyle(Palette.rockFill, 0.92);
      gfx.fillRoundedRect(x, y, size, size, size * 0.3);
      gfx.lineStyle(Math.max(1, cell * 0.04), Palette.rockStroke, 1);
      gfx.strokeRoundedRect(x, y, size, size, size * 0.3);
    }
  }

  /** `fog`: translucent band over the top approach rows (spec 7). */
  private drawFog(cell: number, originX: number, gridW: number): void {
    const gfx = this.fogGfx;
    gfx.clear();

    const rows = this.modifiers.fogHiddenRows;
    if (rows.length === 0) return;

    for (let i = 0; i < rows.length; i++) {
      this.layout.cellTopLeft(0, rows[i], this.scratch);
      // Near-opaque: the point is that the incoming types cannot be read.
      gfx.fillStyle(Palette.fogFill, 0.97);
      gfx.fillRect(originX, this.scratch.y, gridW, cell);
    }
  }
}
