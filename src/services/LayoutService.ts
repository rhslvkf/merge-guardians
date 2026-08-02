import {
  DEBUG,
  DOCK_HEIGHT,
  GRID_COLS,
  GRID_ROWS,
  HUD_HEIGHT,
  MIN_TOUCH_CELL_PX,
  SIDE_MARGIN,
  WIDE_LAYOUT_ASPECT,
} from '../config/constants';

/**
 * The only place that turns board coordinates into screen coordinates.
 *
 * Recomputed on every resize; nothing else in the codebase may hardcode a
 * screen position (rule 5).
 */

export interface LayoutMetrics {
  width: number;
  height: number;
  cell: number;
  gridW: number;
  gridH: number;
  originX: number;
  originY: number;
  hudH: number;
  dockH: number;
  /** True when there is room beside the board for the extended HUD panels. */
  wide: boolean;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface CellCoord {
  col: number;
  row: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class LayoutService {
  private metrics: LayoutMetrics = LayoutService.compute(1, 1);

  /** Pure metric computation — no Phaser, so tools/simulate.ts can use it too. */
  static compute(width: number, height: number): LayoutMetrics {
    const hudH = clamp(height * HUD_HEIGHT.ratio, HUD_HEIGHT.min, HUD_HEIGHT.max);
    const dockH = clamp(height * DOCK_HEIGHT.ratio, DOCK_HEIGHT.min, DOCK_HEIGHT.max);

    const cell = Math.floor(
      Math.min((width - 2 * SIDE_MARGIN) / GRID_COLS, (height - hudH - dockH) / GRID_ROWS)
    );

    const gridW = cell * GRID_COLS;
    const gridH = cell * GRID_ROWS;

    return {
      width,
      height,
      cell,
      gridW,
      gridH,
      originX: (width - gridW) / 2,
      originY: hudH + (height - hudH - dockH - gridH) / 2,
      hudH,
      dockH,
      wide: width / height >= WIDE_LAYOUT_ASPECT,
    };
  }

  /**
   * Recompute for a new viewport size.
   *
   * `cssScale` converts game units to measured CSS pixels (1 unless the canvas
   * is being scaled), and is only used for the touch-target warning.
   */
  resize(width: number, height: number, cssScale = 1): LayoutMetrics {
    this.metrics = LayoutService.compute(width, height);
    this.warnIfCellTooSmallForTouch(cssScale);
    return this.metrics;
  }

  get(): LayoutMetrics {
    return this.metrics;
  }

  /** Centre of cell (col,row) in world coordinates. */
  gridToWorld(col: number, row: number, out?: WorldPoint): WorldPoint {
    const { originX, originY, cell } = this.metrics;
    const point = out ?? { x: 0, y: 0 };
    point.x = originX + (col + 0.5) * cell;
    point.y = originY + (row + 0.5) * cell;
    return point;
  }

  /**
   * Cell under a world position. Fills `out` and returns true when the point is
   * on the board; returns false and leaves `out` untouched otherwise.
   *
   * Takes an out param because pointermove calls this on every event.
   */
  worldToGrid(x: number, y: number, out: CellCoord): boolean {
    const { originX, originY, cell } = this.metrics;
    if (cell <= 0) return false;
    const col = Math.floor((x - originX) / cell);
    const row = Math.floor((y - originY) / cell);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
    out.col = col;
    out.row = row;
    return true;
  }

  /** Top-left corner of cell (col,row) — for drawing cell-sized rectangles. */
  cellTopLeft(col: number, row: number, out: WorldPoint): WorldPoint {
    const { originX, originY, cell } = this.metrics;
    out.x = originX + col * cell;
    out.y = originY + row * cell;
    return out;
  }

  private warnIfCellTooSmallForTouch(cssScale: number): void {
    const cssCell = this.metrics.cell * cssScale;
    if (cssCell > 0 && cssCell < MIN_TOUCH_CELL_PX && DEBUG) {
      console.warn(
        `[layout] cell is ${cssCell.toFixed(1)}px CSS, below the ${MIN_TOUCH_CELL_PX}px touch minimum ` +
          `(viewport ${this.metrics.width}x${this.metrics.height})`
      );
    }
  }
}
