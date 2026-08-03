import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { MIN_TOUCH_CELL_PX, Palette } from '../config/constants';
import { stageCount } from '../core/rules';

/**
 * The stage grid: one tappable tile per stage, locked ones wearing a padlock.
 *
 * The padlock is drawn rather than a glyph or a sprite. `🔒` is not in the
 * monospace stack the rest of the UI uses and renders as a box on some
 * Androids, and pulling a lock out of the tilesheet would tie the menu to an
 * optional asset pack. Two shapes cost nothing and always look the same.
 */

const COLUMNS = 5;
const GAP_RATIO = 0.18;
const LABEL_RATIO = 0.42;
const CORNER_RATIO = 0.2;

export interface StageSelectOptions {
  onPick: (stageId: number) => void;
}

interface Tile {
  stageId: number;
  zone: Phaser.GameObjects.Zone;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  size: number;
}

export class StageSelect {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly tiles: Tile[] = [];
  private unlocked = 1;
  private best = 0;
  private height = 0;

  constructor(scene: Phaser.Scene, options: StageSelectOptions) {
    this.gfx = scene.add.graphics();

    for (let stageId = 1; stageId <= stageCount(); stageId++) {
      const zone = scene.add.zone(0, 0, 10, 10).setOrigin(0.5).setInteractive();
      zone.on(Phaser.Input.Events.POINTER_UP, () => {
        if (stageId <= this.unlocked) options.onPick(stageId);
      });
      const label = scene.add
        .text(0, 0, String(stageId), {
          fontFamily: FONT_STACK,
          fontStyle: 'bold',
          color: Palette.cardTitle,
        })
        .setOrigin(0.5);
      this.tiles.push({ stageId, zone, label, x: 0, y: 0, size: 0 });
    }
  }

  /** Progress from the save. Redraws immediately. */
  setProgress(unlockedStage: number, bestStage: number): void {
    this.unlocked = unlockedStage;
    this.best = bestStage;
    this.redraw();
  }

  /**
   * Lay the grid out inside `width`, centred on `centerX`, starting at `top`.
   * Returns the height consumed so the caller can stack whatever comes next.
   */
  layout(centerX: number, top: number, width: number): number {
    const rows = Math.ceil(this.tiles.length / COLUMNS);
    // Solve for a tile size that fits the width including the gaps between.
    const size = Math.max(
      MIN_TOUCH_CELL_PX,
      Math.floor(width / (COLUMNS + (COLUMNS - 1) * GAP_RATIO))
    );
    const gap = size * GAP_RATIO;
    const gridWidth = COLUMNS * size + (COLUMNS - 1) * gap;
    const originX = centerX - gridWidth / 2;

    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      tile.size = size;
      tile.x = originX + col * (size + gap) + size / 2;
      tile.y = top + row * (size + gap) + size / 2;
      tile.zone.setPosition(tile.x, tile.y).setSize(size, size);
      tile.zone.input!.hitArea.setTo(0, 0, size, size);
      tile.label.setFontSize(Math.round(size * LABEL_RATIO)).setPosition(tile.x, tile.y);
    }

    this.height = rows * size + (rows - 1) * gap;
    this.redraw();
    return this.height;
  }

  private redraw(): void {
    const gfx = this.gfx;
    gfx.clear();

    for (const tile of this.tiles) {
      if (tile.size <= 0) continue;

      const locked = tile.stageId > this.unlocked;
      const cleared = tile.stageId <= this.best;
      const half = tile.size / 2;
      const x = tile.x - half;
      const y = tile.y - half;
      const radius = tile.size * CORNER_RATIO;

      gfx.fillStyle(locked ? Palette.buttonFillDisabled : Palette.cardFill, 1);
      gfx.fillRoundedRect(x, y, tile.size, tile.size, radius);
      // A cleared stage gets the green edge; the next one to play gets the
      // bright edge, so PLAY and the grid always agree on where you are.
      gfx.lineStyle(
        Math.max(2, tile.size * 0.05),
        locked ? Palette.panelStroke : cleared ? Palette.mergeHighlight : Palette.buttonFill,
        1
      );
      gfx.strokeRoundedRect(x, y, tile.size, tile.size, radius);

      tile.label.setVisible(!locked);
      if (locked) this.drawPadlock(tile.x, tile.y, tile.size);
    }
  }

  /** Shackle arc over a body rectangle — the smallest readable lock. */
  private drawPadlock(cx: number, cy: number, size: number): void {
    const gfx = this.gfx;
    const bodyW = size * 0.4;
    const bodyH = size * 0.3;
    const bodyY = cy - bodyH * 0.1;
    const shackleR = bodyW * 0.34;

    gfx.lineStyle(Math.max(2, size * 0.055), Palette.hudLabelFill, 1);
    gfx.beginPath();
    gfx.arc(cx, bodyY, shackleR, Math.PI, 0);
    gfx.strokePath();

    gfx.fillStyle(Palette.hudLabelFill, 1);
    gfx.fillRoundedRect(cx - bodyW / 2, bodyY, bodyW, bodyH, size * 0.05);
  }

  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible);
    for (const tile of this.tiles) {
      tile.label.setVisible(visible && tile.stageId <= this.unlocked);
      if (visible) tile.zone.setInteractive();
      else tile.zone.disableInteractive();
    }
  }
}
