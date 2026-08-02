import Phaser from 'phaser';

import balance from '../config/balance.json';
import {
  Palette,
  TIER_HUE_LIGHTNESS,
  TIER_HUE_OFFSET,
  TIER_HUE_SATURATION,
} from '../config/constants';
import type { LayoutService, WorldPoint } from '../services/LayoutService';
import { bakeTexture } from './shapeTextures';

/**
 * A player unit sitting on one ally cell.
 *
 * Placeholder art: a rounded rectangle with the tier number. Phase 6 swaps the
 * drawn shape for a sprite; nothing outside this file should care which it is.
 *
 * `dps` and `maxHp` are the unmodified table values. Run-wide multipliers from
 * upgrades are applied where damage is dealt, not baked in here.
 */

const MAX_TIER: number = balance.merge.maxTier;
const TIER_DPS: number[] = balance.units.tierDps;
const HP_PER_DPS: number = balance.units.hpPerDps;

/** Even slices of the HSL wheel, so neighbouring tiers never look alike. */
const TIER_FILL: number[] = [];
const TIER_STROKE: number[] = [];

for (let tier = 1; tier <= MAX_TIER; tier++) {
  const hue = (TIER_HUE_OFFSET + (tier - 1) / MAX_TIER) % 1;
  TIER_FILL.push(
    Phaser.Display.Color.HSLToColor(hue, TIER_HUE_SATURATION, TIER_HUE_LIGHTNESS).color
  );
  TIER_STROKE.push(
    Phaser.Display.Color.HSLToColor(
      hue,
      TIER_HUE_SATURATION,
      TIER_HUE_LIGHTNESS * Palette.unitStrokeDarken
    ).color
  );
}

export function tierFillColor(tier: number): number {
  return TIER_FILL[Phaser.Math.Clamp(tier, 1, MAX_TIER) - 1];
}

/** Fraction of the cell the unit body occupies, leaving a visible gutter. */
const BODY_SCALE = 0.84;
const CORNER_RADIUS_RATIO = 0.22;
const LABEL_SIZE_RATIO = 0.42;
const STROKE_RATIO = 0.06;
const HP_BAR_HEIGHT_RATIO = 0.09;
const HP_BAR_GAP_RATIO = 0.06;

/** Shared scratch for snapToGrid, so positioning allocates nothing (rule 4). */
const SNAP_POINT: WorldPoint = { x: 0, y: 0 };

const TEXTURE_PREFIX = 'unit-t';
let bakedCell = -1;

export function unitTextureKey(tier: number): string {
  return `${TEXTURE_PREFIX}${tier}`;
}

/**
 * Rebake the tier textures when the board size changes.
 *
 * Cheap to call every frame — it returns immediately unless the cell size moved.
 */
export function ensureUnitTextures(scene: Phaser.Scene, cell: number): void {
  if (bakedCell === cell && scene.textures.exists(unitTextureKey(1))) return;
  bakedCell = cell;

  const size = cell * BODY_SCALE;
  const radius = size * CORNER_RADIUS_RATIO;
  const stroke = Math.max(1, Math.round(size * STROKE_RATIO));
  const dim = size + stroke * 2;

  for (let tier = 1; tier <= MAX_TIER; tier++) {
    bakeTexture(scene, unitTextureKey(tier), dim, dim, (g) => {
      g.fillStyle(TIER_FILL[tier - 1], 1);
      g.fillRoundedRect(stroke, stroke, size, size, radius);
      g.lineStyle(stroke, TIER_STROKE[tier - 1], 1);
      g.strokeRoundedRect(stroke, stroke, size, size, radius);
    });
  }
}

export class Unit extends Phaser.GameObjects.Container {
  tier: number;
  col = -1;
  row = -1;

  /** Base table values, before any run or permanent upgrade multiplier. */
  dps = 0;
  maxHp = 0;
  hp = 0;

  /** Seconds until this unit may fire again. */
  cooldown = 0;

  private readonly shape: Phaser.GameObjects.Image;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private lastCell = 0;

  constructor(scene: Phaser.Scene, tier: number) {
    super(scene, 0, 0);
    this.tier = tier;

    // Real texture is assigned in redraw(), once the cell size is known.
    this.shape = scene.add.image(0, 0, '__DEFAULT');
    this.hpBar = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, String(tier), {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: Palette.unitLabel,
      })
      .setOrigin(0.5);

    this.add([this.shape, this.hpBar, this.label]);
    scene.add.existing(this);
    this.applyTierStats(tier);
  }

  /**
   * Set the tier and refill HP.
   *
   * Merging routes through here, which is what makes a merge a heal (spec 4).
   */
  setTier(tier: number): this {
    this.applyTierStats(tier);
    this.label.setText(String(this.tier));
    return this;
  }

  private applyTierStats(tier: number): void {
    this.tier = Phaser.Math.Clamp(tier, 1, MAX_TIER);
    this.dps = TIER_DPS[this.tier - 1];
    this.maxHp = this.dps * HP_PER_DPS;
    this.hp = this.maxHp;
  }

  /** Move to the screen position of the cell this unit occupies (rule 5). */
  snapToGrid(layout: LayoutService): this {
    layout.gridToWorld(this.col, this.row, SNAP_POINT);
    this.setPosition(SNAP_POINT.x, SNAP_POINT.y);
    return this;
  }

  /** Returns true when this damage destroyed the unit. */
  takeDamage(amount: number): boolean {
    if (this.hp <= 0) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      return true;
    }
    this.drawHpBar();
    return false;
  }

  /** Restore HP without exceeding the maximum. */
  heal(amount: number): void {
    if (this.hp <= 0 || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.drawHpBar();
  }

  /** Redraw at the current cell size — called on creation and on every resize. */
  redraw(cell: number): this {
    this.lastCell = cell;
    ensureUnitTextures(this.scene, cell);
    this.shape.setTexture(unitTextureKey(this.tier));

    this.label.setFontSize(Math.max(8, Math.round(cell * LABEL_SIZE_RATIO)));
    this.drawHpBar();
    return this;
  }

  /**
   * Only redrawn when HP changes, not per frame — a full unit shows no bar at
   * all, so an untouched board costs nothing to draw.
   */
  private drawHpBar(): void {
    const cell = this.lastCell;
    this.hpBar.clear();
    if (cell <= 0 || this.hp >= this.maxHp || this.hp <= 0) return;

    const width = cell * BODY_SCALE;
    const height = Math.max(2, cell * HP_BAR_HEIGHT_RATIO);
    const y = width / 2 + cell * HP_BAR_GAP_RATIO;
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);

    this.hpBar.fillStyle(Palette.hpBarBack, 0.85);
    this.hpBar.fillRect(-width / 2, y, width, height);
    this.hpBar.fillStyle(Palette.hpBarUnit, 1);
    this.hpBar.fillRect(-width / 2, y, width * ratio, height);
  }
}
