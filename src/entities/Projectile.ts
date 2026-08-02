import Phaser from 'phaser';

import balance from '../config/balance.json';
import { tierFillColor } from './Unit';
import { bakeTexture } from './shapeTextures';

/**
 * A shot travelling up a column toward the enemies above it.
 *
 * Speed is expressed in rows per second: `cell * projectileSpeedCells` pixels
 * per second is exactly `projectileSpeedCells` cells per second, so the shot
 * keeps the same felt speed at any board size and needs no rescaling on resize.
 *
 * Collision is positional rather than target-tracking, so a shot whose intended
 * victim dies mid-flight still hits whatever else is in the column instead of
 * being wasted.
 *
 * Pooled — never construct one directly outside ProjectilePool (rule 4).
 */

export const PROJECTILE_ROWS_PER_SECOND: number = balance.units.projectileSpeedCells;

const RADIUS_RATIO = 0.09;

const TEXTURE_PREFIX = 'shot-t';
const MAX_TIER: number = balance.merge.maxTier;
let bakedCell = -1;

export function projectileTextureKey(tier: number): string {
  return `${TEXTURE_PREFIX}${tier}`;
}

/** Rebake the shot textures when the board size changes. */
export function ensureProjectileTextures(scene: Phaser.Scene, cell: number): void {
  if (bakedCell === cell && scene.textures.exists(projectileTextureKey(1))) return;
  bakedCell = cell;

  const radius = Math.max(2, cell * RADIUS_RATIO);
  const stroke = Math.max(1, radius * 0.35);
  const dim = (radius + stroke) * 2;
  const c = dim / 2;

  for (let tier = 1; tier <= MAX_TIER; tier++) {
    bakeTexture(scene, projectileTextureKey(tier), dim, dim, (g) => {
      g.fillStyle(tierFillColor(tier), 1);
      g.fillCircle(c, c, radius);
      g.lineStyle(stroke, 0xf8fafc, 0.75);
      g.strokeCircle(c, c, radius);
    });
  }
}

export class Projectile extends Phaser.GameObjects.Image {
  col = 0;
  /** Fractional row; decreases as the shot travels upward. */
  row = 0;
  damage = 0;
  /** Tier of the firing unit — shielded enemies ignore low-tier shots. */
  sourceTier = 1;

  constructor(scene: Phaser.Scene) {
    // Real texture is assigned in redraw(), once the cell size is known.
    super(scene, 0, 0, '__DEFAULT');
    scene.add.existing(this);
  }

  reset(col: number, row: number, damage: number, sourceTier: number, cell: number): this {
    this.col = col;
    this.row = row;
    this.damage = damage;
    this.sourceTier = sourceTier;
    this.setActive(true).setVisible(true);
    this.redraw(cell);
    return this;
  }

  /** Swaps to the baked texture; flight only changes the transform. */
  redraw(cell: number): void {
    ensureProjectileTextures(this.scene, cell);
    this.setTexture(projectileTextureKey(this.sourceTier));
  }

  sleep(): void {
    this.setActive(false).setVisible(false);
  }
}

export class ProjectilePool {
  readonly active: Projectile[] = [];
  private readonly idle: Projectile[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(col: number, row: number, damage: number, sourceTier: number, cell: number): Projectile {
    const shot = this.idle.pop() ?? new Projectile(this.scene);
    shot.reset(col, row, damage, sourceTier, cell);
    this.active.push(shot);
    return shot;
  }

  releaseAt(index: number): void {
    const shot = this.active[index];
    if (!shot) return;
    shot.sleep();
    const last = this.active.pop();
    if (last && last !== shot) this.active[index] = last;
    this.idle.push(shot);
  }

  releaseAll(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.releaseAt(i);
  }

  get count(): number {
    return this.active.length;
  }
}
