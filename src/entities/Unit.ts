import Phaser from 'phaser';

import balance from '../config/balance.json';
import { Palette, TIER_HUE_LIGHTNESS, TIER_HUE_SATURATION } from '../config/constants';

/**
 * A player unit sitting on one ally cell.
 *
 * Placeholder art: a rounded rectangle with the tier number. Phase 6 swaps the
 * drawn shape for a sprite; nothing outside this file should care which it is.
 *
 * Combat fields (hp, dps, cooldown) arrive in Phase 2.
 */

const MAX_TIER: number = balance.merge.maxTier;

/** Even slices of the HSL wheel, so neighbouring tiers never look alike. */
const TIER_FILL: number[] = [];
const TIER_STROKE: number[] = [];

for (let tier = 1; tier <= MAX_TIER; tier++) {
  const hue = (tier - 1) / MAX_TIER;
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

export class Unit extends Phaser.GameObjects.Container {
  tier: number;
  col = -1;
  row = -1;

  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, tier: number) {
    super(scene, 0, 0);
    this.tier = tier;

    this.shape = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, String(tier), {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: Palette.unitLabel,
      })
      .setOrigin(0.5);

    this.add([this.shape, this.label]);
    scene.add.existing(this);
  }

  setTier(tier: number): this {
    this.tier = Phaser.Math.Clamp(tier, 1, MAX_TIER);
    this.label.setText(String(this.tier));
    return this;
  }

  /** Redraw at the current cell size — called on creation and on every resize. */
  redraw(cell: number): this {
    const size = cell * BODY_SCALE;
    const half = size / 2;
    const radius = size * CORNER_RADIUS_RATIO;
    const stroke = Math.max(1, Math.round(size * STROKE_RATIO));

    this.shape.clear();
    this.shape.fillStyle(tierFillColor(this.tier), 1);
    this.shape.fillRoundedRect(-half, -half, size, size, radius);
    this.shape.lineStyle(stroke, TIER_STROKE[this.tier - 1], 1);
    this.shape.strokeRoundedRect(-half, -half, size, size, radius);

    this.label.setFontSize(Math.max(8, Math.round(cell * LABEL_SIZE_RATIO)));
    return this;
  }
}
