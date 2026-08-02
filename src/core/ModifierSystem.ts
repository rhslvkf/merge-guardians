import Phaser from 'phaser';

import balance from '../config/balance.json';
import { DEBUG, Depth, GRID_COLS, GRID_ROWS, Palette } from '../config/constants';
import type { LayoutService, WorldPoint } from '../services/LayoutService';
import type { Grid } from './Grid';
import type { WaveModifier } from './WaveRunner';

/**
 * Wave modifiers (spec 7).
 *
 * Each wave carries 0 or 1 of these, named in waves.json:
 *  - `blockedColumn` seals one column's ally cells for the wave. Grid already
 *    routes every placement question through `isAllyCell`, so blocking there
 *    covers summoning, dropping and merging in one place.
 *  - `bomb` arms one occupied ally cell. Consuming that unit in a merge defuses
 *    it; otherwise it destroys that cell and its four orthogonal neighbours.
 *  - `fog` hides the top two approach rows.
 *  - `rush` is applied by WaveRunner when it builds the schedule, since it only
 *    affects spawn timing and count.
 *
 * Owns the bomb's countdown visuals; the static rock and fog overlays are drawn
 * by BoardRenderer, which already redraws on resize.
 */

const BOMB_FUSE: number = balance.modifiers.bomb.fuseSeconds;
const FOG_ROWS: number[] = balance.modifiers.fog.hiddenRows;

export interface BombState {
  col: number;
  row: number;
  remaining: number;
}

export class ModifierSystem {
  private active: WaveModifier = 'none';
  private bombCol = -1;
  private bombRow = -1;
  private bombFuse = 0;

  private readonly bombGfx: Phaser.GameObjects.Graphics;
  private readonly bombLabel: Phaser.GameObjects.Text;
  private readonly scratch: WorldPoint = { x: 0, y: 0 };

  /** Set when a bomb goes off, so GameScene can shake the camera. */
  explodedThisFrame = false;

  constructor(
    scene: Phaser.Scene,
    private readonly grid: Grid,
    private readonly layout: LayoutService
  ) {
    this.bombGfx = scene.add.graphics().setDepth(Depth.Bomb).setVisible(false);
    this.bombLabel = scene.add
      .text(0, 0, '', { fontFamily: 'monospace', fontStyle: 'bold', color: Palette.bombText })
      .setOrigin(0.5)
      .setDepth(Depth.Bomb)
      .setVisible(false);
  }

  get current(): WaveModifier {
    return this.active;
  }

  get fogHiddenRows(): readonly number[] {
    return this.active === 'fog' ? FOG_ROWS : EMPTY_ROWS;
  }

  get bomb(): BombState | null {
    if (this.bombCol < 0) return null;
    return { col: this.bombCol, row: this.bombRow, remaining: this.bombFuse };
  }

  // --- lifecycle ---------------------------------------------------------

  activate(modifier: WaveModifier): void {
    this.deactivate();
    this.active = modifier;

    if (modifier === 'blockedColumn') {
      this.grid.setBlockedColumn(Math.floor(Math.random() * GRID_COLS));
      if (DEBUG) console.log('[modifier] blockedColumn ->', this.grid.blockedColumn);
    }

    if (modifier === 'bomb') this.armBomb();
  }

  /** Clear everything the wave owned — called at wave end and on revive. */
  deactivate(): void {
    this.active = 'none';
    this.grid.setBlockedColumn(-1);
    this.disarmBomb();
  }

  update(dt: number): void {
    this.explodedThisFrame = false;
    if (this.bombCol < 0) return;

    // A bomb that lost its unit to combat has nothing left to defuse or blow up.
    if (!this.grid.getUnit(this.bombCol, this.bombRow)) {
      this.armBomb();
      return;
    }

    this.bombFuse -= dt;
    if (this.bombFuse <= 0) {
      this.explode();
      return;
    }
    this.drawBomb();
  }

  /**
   * A merge involving the bombed cell defuses it (spec 7).
   *
   * Both cells count: the dragged unit and the one it was dropped onto are each
   * "used in a merge".
   */
  notifyMerge(fromCol: number, fromRow: number, toCol: number, toRow: number): void {
    if (this.bombCol < 0) return;
    const matches =
      (fromCol === this.bombCol && fromRow === this.bombRow) ||
      (toCol === this.bombCol && toRow === this.bombRow);
    if (!matches) return;
    if (DEBUG) console.log('[modifier] bomb defused by merge');
    this.disarmBomb();
  }

  // --- bomb --------------------------------------------------------------

  /** Arm on a random occupied ally cell; stay dormant if the board is empty. */
  private armBomb(): void {
    this.disarmBomb();

    let seen = 0;
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (!this.grid.isAllyCell(col, row)) continue;
        if (!this.grid.getUnit(col, row)) continue;
        seen++;
        // Reservoir sampling, so no candidate array is allocated (rule 4).
        if (Math.random() * seen < 1) {
          this.bombCol = col;
          this.bombRow = row;
        }
      }
    }

    if (seen === 0) {
      this.bombCol = -1;
      this.bombRow = -1;
      return;
    }

    this.bombFuse = BOMB_FUSE;
    this.drawBomb();
    if (DEBUG) console.log(`[modifier] bomb armed at ${this.bombCol},${this.bombRow}`);
  }

  private disarmBomb(): void {
    this.bombCol = -1;
    this.bombRow = -1;
    this.bombFuse = 0;
    this.bombGfx.setVisible(false);
    this.bombLabel.setVisible(false);
  }

  private explode(): void {
    const col = this.bombCol;
    const row = this.bombRow;
    if (DEBUG) console.log(`[modifier] bomb exploded at ${col},${row}`);

    this.destroyUnitAt(col, row);
    for (let i = 0; i < 4; i++) {
      const neighbour = this.grid.neighbourUnit(col, row, i as 0 | 1 | 2 | 3);
      if (!neighbour) continue;
      this.destroyUnitAt(neighbour.col, neighbour.row);
    }

    this.explodedThisFrame = true;
    // One bomb per wave: re-arming here would make the modifier relentless.
    this.disarmBomb();
    this.active = 'none';
  }

  private destroyUnitAt(col: number, row: number): void {
    const unit = this.grid.getUnit(col, row);
    if (!unit) return;
    this.grid.removeUnitRef(unit);
    unit.destroy();
  }

  private drawBomb(): void {
    const { cell } = this.layout.get();
    if (cell <= 0 || this.bombCol < 0) return;

    this.layout.cellTopLeft(this.bombCol, this.bombRow, this.scratch);
    const inset = cell * 0.08;
    const size = cell - inset * 2;
    // Pulses faster as the fuse runs out, so the threat reads without reading.
    const urgency = 1 - this.bombFuse / BOMB_FUSE;
    const alpha = 0.45 + 0.35 * Math.abs(Math.sin(this.bombFuse * (3 + urgency * 8)));

    this.bombGfx.clear();
    this.bombGfx.setVisible(true);
    this.bombGfx.lineStyle(Math.max(2, cell * 0.07), Palette.bombFill, alpha);
    this.bombGfx.strokeRoundedRect(
      this.scratch.x + inset,
      this.scratch.y + inset,
      size,
      size,
      size * 0.18
    );

    this.layout.gridToWorld(this.bombCol, this.bombRow, this.scratch);
    this.bombLabel
      .setVisible(true)
      .setFontSize(Math.max(10, Math.round(cell * 0.3)))
      .setText(Math.ceil(this.bombFuse).toString())
      .setPosition(this.scratch.x, this.scratch.y - cell * 0.3);
  }

  onResize(): void {
    if (this.bombCol >= 0) this.drawBomb();
  }
}

const EMPTY_ROWS: readonly number[] = [];
