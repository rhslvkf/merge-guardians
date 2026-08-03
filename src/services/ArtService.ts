import Phaser from 'phaser';

import {
  ENEMY_SPRITES,
  REQUIRED_SHEETS,
  SHEETS,
  TILE_SPRITES,
  UNIT_SPRITES,
  type SpriteRef,
} from '../config/assets';
import { DEBUG } from '../config/constants';
import { exists } from './assetProbe';

/**
 * Knows whether the art pack is present, and turns a manifest entry into a
 * Phaser texture key + frame.
 *
 * The sheets are hand-supplied CC0 packs that a fresh checkout does not have.
 * Rather than fail to boot, the game asks this service and falls back to the
 * drawn shapes when a sheet is missing — so the repo stays runnable and the
 * switch to real art is a file drop, not a code change.
 */
export class ArtService {
  private loaded = new Set<string>();
  private present = new Set<string>();

  /**
   * Check which sheets exist before the loader runs.
   *
   * Handing Phaser a URL that does not resolve to an image is not free: a dev
   * server answers an unknown path with the SPA fallback HTML, and a 200 of the
   * wrong type produces a decode failure and an uncaught rejection rather than
   * a clean miss. One parallel batch of HEAD requests avoids all of it.
   */
  async probe(): Promise<void> {
    this.present.clear();
    await Promise.all(
      Object.entries(SHEETS).map(async ([name, spec]) => {
        if (await exists(spec.path, 'image/')) this.present.add(name);
      })
    );
  }

  /** Queue the sheets that `probe` found. */
  preload(scene: Phaser.Scene): void {
    for (const [name, spec] of Object.entries(SHEETS)) {
      if (!this.present.has(name)) continue;
      scene.load.spritesheet(spec.key, spec.path, {
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
        margin: spec.margin,
        spacing: spec.spacing,
      });
    }
  }

  /** Call after the loader finishes; records which sheets actually arrived. */
  markLoaded(scene: Phaser.Scene): void {
    this.loaded.clear();
    for (const [name, spec] of Object.entries(SHEETS)) {
      if (scene.textures.exists(spec.key)) this.loaded.add(name);
    }
    if (DEBUG) {
      console.log(
        `[art] sheets present: ${[...this.loaded].join(', ') || 'none'} — ` +
          `${this.ready ? 'using sprites' : 'falling back to drawn shapes'}`
      );
    }
  }

  /** True once every sheet the game needs is available. */
  get ready(): boolean {
    return REQUIRED_SHEETS.every((name) => this.loaded.has(name));
  }

  private resolve(ref: SpriteRef | null): { key: string; frame: number } | null {
    if (!ref) return null;
    if (!this.loaded.has(ref.sheet as string)) return null;
    return { key: SHEETS[ref.sheet].key, frame: ref.frame };
  }

  unit(tier: number): { key: string; frame: number } | null {
    return this.resolve(UNIT_SPRITES[Phaser.Math.Clamp(tier, 1, UNIT_SPRITES.length) - 1] ?? null);
  }

  enemy(type: string): { key: string; frame: number } | null {
    return this.resolve(ENEMY_SPRITES[type] ?? null);
  }

  rock(): { key: string; frame: number } | null {
    return this.resolve(TILE_SPRITES.rock);
  }
}
