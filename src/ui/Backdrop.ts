import Phaser from 'phaser';

import { Depth, Palette } from '../config/constants';
import { bakeTexture } from '../entities/shapeTextures';

/**
 * The tiled pattern behind the board and the vignette over it.
 *
 * The pattern covers the whole canvas, not just the board: on desktop the board
 * is a narrow column with wide empty margins, and flat colour out there makes
 * the game look like an unfinished prototype.
 *
 * One TileSprite is a single draw call however large it is, so the pattern is
 * free at any viewport size. The vignette is redrawn only on resize.
 *
 * Self-contained on purpose — it listens for its own resize so any scene can
 * add one line and have a background. It reads the canvas size rather than the
 * board metrics because it is not positioned relative to the grid (rule 5 is
 * about board coordinates, and this has none).
 */

/** Pattern tile in texture pixels. */
const TILE = 32;
const TEXTURE_KEY = 'backdrop-tile';
const VIGNETTE_KEY = 'backdrop-vignette';

const VIGNETTE_BANDS = 12;
const VIGNETTE_MAX_ALPHA = 0.42;
/** How far in from the edge the darkening reaches, as a fraction of the short side. */
const VIGNETTE_REACH = 0.34;

export class Backdrop {
  private readonly scene: Phaser.Scene;
  private readonly tiles: Phaser.GameObjects.TileSprite;
  /** Four cropped views of one texture — see `bakeVignette`. */
  private readonly vignette: Phaser.GameObjects.Image[] = [];
  private bakedFor = '';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    Backdrop.ensureTexture(scene);

    this.tiles = scene.add
      .tileSprite(0, 0, 1, 1, TEXTURE_KEY)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(Depth.Background);

    for (let i = 0; i < 4; i++) {
      this.vignette.push(
        scene.add
          .image(0, 0, '__DEFAULT')
          .setOrigin(0)
          .setScrollFactor(0)
          .setDepth(Depth.Vignette)
          .setVisible(false)
      );
    }

    scene.scale.on(Phaser.Scale.Events.RESIZE, this.redraw, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.redraw, this);
    });

    this.redraw(scene.scale.gameSize);
  }

  /**
   * A dark base, a faint diagonal, and a few specks.
   *
   * Deliberately not a chequer: a regular light/dark grid behind a 7x8 game
   * board reads as a second grid and fights the real one. Irregular marks give
   * the surface some texture without implying structure.
   */
  private static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;

    bakeTexture(scene, TEXTURE_KEY, TILE, TILE, (g) => {
      g.fillStyle(Palette.backdropBase, 1);
      g.fillRect(0, 0, TILE, TILE);

      // Diagonal hatch, one pixel wide, drawn as steps so it tiles seamlessly.
      g.fillStyle(Palette.backdropTint, 1);
      for (let i = 0; i < TILE; i++) g.fillRect(i, TILE - 1 - i, 1, 1);

      g.fillStyle(Palette.backdropSpeck, 1);
      g.fillRect(6, 9, 1, 1);
      g.fillRect(21, 4, 1, 1);
      g.fillRect(13, 24, 1, 1);
      g.fillRect(27, 18, 1, 1);
    });
  }

  private redraw(size: Phaser.Structs.Size): void {
    const width = Math.ceil(size.width);
    const height = Math.ceil(size.height);
    if (width <= 0 || height <= 0) return;

    this.tiles.setSize(width, height);
    this.bakeVignette(width, height);
  }

  /**
   * Concentric rectangles thickening toward the edge, baked once per size and
   * shown as four cropped edge strips.
   *
   * Two separate costs were measured here, at 500x900 with 30 enemies on screen:
   *
   *  - As a live Graphics it was rebuilt every frame — Phaser re-tessellates a
   *    Graphics command buffer on each draw. 19.6 fps; baking took it to 22.3.
   *    Same lesson as the Phase 2 unit shapes (`entities/shapeTextures.ts`).
   *  - Even baked, a full-screen alpha quad blends every pixel on the canvas.
   *    Hiding it entirely was worth another ~18 fps *in this container*, which
   *    rasterises in software. The transparent middle of the vignette costs as
   *    much to blend as the visible edges, so only the edges are drawn: four
   *    crops of the one texture, positioned where they were anyway, leaving the
   *    centre of the screen untouched.
   */
  private bakeVignette(width: number, height: number): void {
    const signature = `${width}x${height}`;
    if (this.bakedFor === signature && this.scene.textures.exists(VIGNETTE_KEY)) return;
    this.bakedFor = signature;

    const reach = Math.min(width, height) * VIGNETTE_REACH;
    const band = reach / VIGNETTE_BANDS;

    bakeTexture(this.scene, VIGNETTE_KEY, width, height, (g) => {
      for (let i = 0; i < VIGNETTE_BANDS; i++) {
        const inset = i * band + band / 2;
        const alpha = VIGNETTE_MAX_ALPHA * (1 - i / VIGNETTE_BANDS) ** 2;
        g.lineStyle(band, Palette.vignetteEdge, alpha);
        g.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
      }
    });

    const edge = Math.ceil(reach);
    const middle = Math.max(0, height - edge * 2);
    // top, bottom, then the two sides between them — no overlap, so the alpha
    // never doubles up at the corners.
    const crops: [number, number, number, number][] = [
      [0, 0, width, edge],
      [0, height - edge, width, edge],
      [0, edge, edge, middle],
      [width - edge, edge, edge, middle],
    ];

    for (let i = 0; i < this.vignette.length; i++) {
      const [x, y, w, h] = crops[i];
      this.vignette[i]
        .setTexture(VIGNETTE_KEY)
        .setPosition(0, 0)
        .setCrop(x, y, w, h)
        .setVisible(w > 0 && h > 0);
    }
  }
}
