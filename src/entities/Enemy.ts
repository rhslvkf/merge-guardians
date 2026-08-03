import Phaser from 'phaser';

import { EnemyPalette, HIT_FLASH_SECONDS, Palette, RegistryKey } from '../config/constants';
import {
  ENEMY_TYPES,
  SECONDS_PER_CELL,
  enemyHp,
  type EnemyType,
  type EnemyTypeConfig,
} from '../core/rules';
import type { ArtService } from '../services/ArtService';
import { bakeTexture } from './shapeTextures';

/**
 * An enemy marching down one column.
 *
 * Art comes from the sprite sheet when the pack is installed, and falls back to
 * the type-coloured diamond when it is not — see ArtService.
 *
 * Position is `cellRow + progress`, where `cellRow` is the integer cell it
 * occupies and `progress` runs 0..1 toward the next one. Keeping them apart is
 * what lets an enemy stop cleanly in front of a unit instead of snapping.
 *
 * Pooled — never construct one directly outside EnemyPool (rule 4).
 */

// The stats and the HP curve live in core/rules so the simulator computes from
// the same source. Re-exported here for the callers that already had them.
export { ENEMY_TYPES, SECONDS_PER_CELL, enemyHp as enemyHpFor };
export type { EnemyType, EnemyTypeConfig };

const BODY_SCALE = 0.7;
/** Sprites carry their own silhouette, so they can fill more of the cell. */
const SPRITE_SCALE = 0.86;
const HP_BAR_HEIGHT_RATIO = 0.08;
const HP_BAR_GAP_RATIO = 0.08;

const TEXTURE_PREFIX = 'enemy-';
const ENEMY_TYPE_NAMES: EnemyType[] = ['normal', 'shielded', 'flyer', 'tank', 'boss'];
let bakedCell = -1;

export function enemyTextureKey(type: EnemyType): string {
  return `${TEXTURE_PREFIX}${type}`;
}

/** Rebake the diamond textures when the board size changes. */
export function ensureEnemyTextures(scene: Phaser.Scene, cell: number): void {
  if (bakedCell === cell && scene.textures.exists(enemyTextureKey('normal'))) return;
  bakedCell = cell;

  const size = cell * BODY_SCALE;
  const half = size / 2;
  const stroke = Math.max(1, cell * 0.04);
  const dim = size + stroke * 2;
  const c = dim / 2;

  for (const type of ENEMY_TYPE_NAMES) {
    bakeTexture(scene, enemyTextureKey(type), dim, dim, (g) => {
      g.fillStyle(EnemyPalette[type], 1);
      g.beginPath();
      g.moveTo(c, c - half);
      g.lineTo(c + half, c);
      g.lineTo(c, c + half);
      g.lineTo(c - half, c);
      g.closePath();
      g.fillPath();
      g.lineStyle(stroke, 0x0b0d14, 0.7);
      g.strokePath();
    });
  }
}

export class Enemy extends Phaser.GameObjects.Container {
  enemyType: EnemyType = 'normal';
  col = 0;
  /** Integer cell currently occupied. */
  cellRow = 0;
  /** 0..1 progress toward `cellRow + 1`. */
  progress = 0;

  hp = 0;
  maxHp = 0;
  meleeDps = 0;
  speedMult = 1;
  ignoresUnits = false;
  immuneToTierAtOrBelow = 0;
  showTopHealthBar = false;

  private readonly shape: Phaser.GameObjects.Image;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly art?: ArtService;
  private lastCell = 0;
  private flashT = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.art = scene.registry.get(RegistryKey.Art) as ArtService | undefined;
    // Real texture is assigned in redraw(), once the cell size is known.
    this.shape = scene.add.image(0, 0, '__DEFAULT');
    this.hpBar = scene.add.graphics();
    this.add([this.shape, this.hpBar]);
    scene.add.existing(this);
  }

  /** Colour the death shards take, so the kill reads as the type that died. */
  get bodyColor(): number {
    return EnemyPalette[this.enemyType];
  }

  /**
   * The body as a texture reference, so the death effect can keep showing it
   * after the pool has already recycled this instance.
   */
  get bodyTexture(): string {
    return this.shape.texture.key;
  }

  get bodyFrame(): string | number {
    return this.shape.frame.name;
  }

  get bodyScale(): number {
    return this.shape.scaleX;
  }

  /** Fractional row used by movement, targeting and collision. */
  get row(): number {
    return this.cellRow + this.progress;
  }

  reset(type: EnemyType, col: number, waveIndex: number, cell: number): this {
    const config = ENEMY_TYPES[type];
    this.enemyType = type;
    this.col = col;
    this.cellRow = 0;
    this.progress = 0;
    this.maxHp = enemyHp(type, waveIndex);
    this.hp = this.maxHp;
    this.meleeDps = config.meleeDps;
    this.speedMult = config.speedMult;
    this.ignoresUnits = config.ignoresUnits === true;
    this.immuneToTierAtOrBelow = config.immuneToTierAtOrBelow ?? 0;
    this.showTopHealthBar = config.showTopHealthBar === true;

    this.flashT = 0;
    this.shape.clearTint();
    this.setActive(true).setVisible(true).setAlpha(1).setScale(1);
    this.redraw(cell);
    return this;
  }

  /** Returns true when this damage killed the enemy. */
  takeDamage(amount: number): boolean {
    if (this.hp <= 0) return false;
    this.hp -= amount;
    this.flash();
    if (this.hp <= 0) {
      this.hp = 0;
      return true;
    }
    this.drawHpBar();
    return false;
  }

  /** Brief white flash. Cleared by `updateVisual`, so it costs no timer. */
  flash(): void {
    if (this.flashT <= 0) this.shape.setTintFill(0xffffff);
    this.flashT = HIT_FLASH_SECONDS;
  }

  /** Per-frame visual decay. Allocates nothing (rule 4). */
  updateVisual(dt: number): void {
    if (this.flashT <= 0) return;
    this.flashT -= dt;
    if (this.flashT <= 0) this.shape.clearTint();
  }

  redraw(cell: number): void {
    this.lastCell = cell;

    const ref = this.art?.enemy(this.enemyType) ?? null;
    if (ref) {
      this.shape.setTexture(ref.key, ref.frame);
      const source = Math.max(this.shape.frame.width, this.shape.frame.height);
      this.shape.setScale(source > 0 ? (cell * SPRITE_SCALE) / source : 1);
    } else {
      ensureEnemyTextures(this.scene, cell);
      this.shape.setTexture(enemyTextureKey(this.enemyType)).setScale(1);
    }

    this.drawHpBar();
  }

  /** Redrawn only when HP changes, never per frame. */
  private drawHpBar(): void {
    const cell = this.lastCell;
    this.hpBar.clear();
    if (cell <= 0 || this.hp <= 0) return;

    const width = cell * BODY_SCALE;
    const height = Math.max(2, cell * HP_BAR_HEIGHT_RATIO);
    const y = -(width / 2) - cell * HP_BAR_GAP_RATIO - height;
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);

    this.hpBar.fillStyle(Palette.hpBarBack, 0.85);
    this.hpBar.fillRect(-width / 2, y, width, height);
    this.hpBar.fillStyle(Palette.hpBarEnemy, 1);
    this.hpBar.fillRect(-width / 2, y, width * ratio, height);
  }

  sleep(): void {
    this.setActive(false).setVisible(false);
  }
}

/**
 * Fixed-capacity-free pool. `active` is the live list; release by index so the
 * caller can iterate backwards and swap-remove without allocating (rule 4).
 */
export class EnemyPool {
  readonly active: Enemy[] = [];
  private readonly idle: Enemy[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(type: EnemyType, col: number, waveIndex: number, cell: number): Enemy {
    const enemy = this.idle.pop() ?? new Enemy(this.scene);
    enemy.reset(type, col, waveIndex, cell);
    this.active.push(enemy);
    return enemy;
  }

  releaseAt(index: number): void {
    const enemy = this.active[index];
    if (!enemy) return;
    enemy.sleep();
    const last = this.active.pop();
    if (last && last !== enemy) this.active[index] = last;
    this.idle.push(enemy);
  }

  releaseAll(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.releaseAt(i);
  }

  redrawAll(cell: number): void {
    for (let i = 0; i < this.active.length; i++) this.active[i].redraw(cell);
  }

  get count(): number {
    return this.active.length;
  }

  /** The live boss, if any — it gets its own health bar at the top (spec 5). */
  findBoss(): Enemy | null {
    for (let i = 0; i < this.active.length; i++) {
      if (this.active[i].showTopHealthBar) return this.active[i];
    }
    return null;
  }
}
