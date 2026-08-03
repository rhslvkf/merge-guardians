import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import {
  HIT_FLASH_SECONDS,
  IDLE_BOB_PX,
  IDLE_BOB_SECONDS,
  Palette,
  RECOIL_PX,
  RECOIL_SECONDS,
  RegistryKey,
  TIER_HUE_LIGHTNESS,
  TIER_HUE_OFFSET,
  TIER_HUE_SATURATION,
} from '../config/constants';
import { MAX_TIER as RULES_MAX_TIER, tierDps, unitMaxHp } from '../core/rules';
import type { ArtService } from '../services/ArtService';
import type { LayoutService, WorldPoint } from '../services/LayoutService';
import { bakeTexture } from './shapeTextures';

/**
 * A player unit sitting on one ally cell.
 *
 * Art comes from the sprite sheet when the pack is installed, and falls back to
 * the drawn rounded rectangle when it is not — see ArtService. Nothing outside
 * this file needs to know which one is on screen.
 *
 * Idle bob, fire recoil and the hit flash are an additive offset recomputed in
 * `updateVisual` rather than tweens: they all write the same `y`, and competing
 * tweens on one property fight every frame. It also allocates nothing (rule 4).
 *
 * `dps` and `maxHp` are the unmodified table values. Run-wide multipliers from
 * upgrades are applied where damage is dealt, not baked in here.
 */

const MAX_TIER = RULES_MAX_TIER;

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
/** Sprites read better slightly larger than the drawn body — no stroke to spare. */
const SPRITE_SCALE = 0.92;
const CORNER_RADIUS_RATIO = 0.22;
const LABEL_SIZE_RATIO = 0.42;
/** With real art the tier is a corner badge, not the whole face of the unit. */
const BADGE_SIZE_RATIO = 0.28;
const BADGE_OFFSET_RATIO = 0.32;
const STROKE_RATIO = 0.06;
const HP_BAR_HEIGHT_RATIO = 0.09;
const HP_BAR_GAP_RATIO = 0.06;

const TWO_PI = Math.PI * 2;
/** Golden-angle spread, so two same-tier neighbours never bob in lockstep. */
const PHASE_STEP = 0.618;
let phaseSeq = 0;

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

  /**
   * Everything that moves. Kept inside its own container so the bob and recoil
   * offsets never collide with the grid position written by `snapToGrid`.
   */
  private readonly visual: Phaser.GameObjects.Container;
  private readonly shape: Phaser.GameObjects.Image;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly art?: ArtService;

  private lastCell = 0;
  private spriteMode = false;

  private bobPhase = 0;
  private recoilT = 0;
  private flashT = 0;

  constructor(scene: Phaser.Scene, tier: number) {
    super(scene, 0, 0);
    this.tier = tier;
    this.art = scene.registry.get(RegistryKey.Art) as ArtService | undefined;

    // Real texture is assigned in redraw(), once the cell size is known.
    this.shape = scene.add.image(0, 0, '__DEFAULT');
    this.hpBar = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, String(tier), {
        fontFamily: FONT_STACK,
        fontStyle: 'bold',
        color: Palette.unitLabel,
      })
      .setOrigin(0.5);

    this.visual = scene.add.container(0, 0, [this.shape, this.hpBar, this.label]);
    this.add(this.visual);
    scene.add.existing(this);

    this.bobPhase = ((tier % MAX_TIER) / MAX_TIER) * TWO_PI + phaseSeq++ * PHASE_STEP;
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
    this.dps = tierDps(this.tier);
    this.maxHp = unitMaxHp(this.tier);
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
    this.flash();
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

  // --- motion ------------------------------------------------------------

  /** Kick backwards from a shot. Decays over `RECOIL_SECONDS`. */
  kickRecoil(): void {
    this.recoilT = RECOIL_SECONDS;
  }

  /** Brief white flash. Cleared by `updateVisual`, so it costs no timer. */
  flash(): void {
    if (this.flashT <= 0) this.shape.setTintFill(0xffffff);
    this.flashT = HIT_FLASH_SECONDS;
  }

  /** One additive offset per frame: bob + recoil. Allocates nothing. */
  updateVisual(dt: number): void {
    this.bobPhase += (dt / IDLE_BOB_SECONDS) * TWO_PI;
    if (this.bobPhase > TWO_PI) this.bobPhase -= TWO_PI;

    let offset = -IDLE_BOB_PX * Math.sin(this.bobPhase);

    if (this.recoilT > 0) {
      this.recoilT -= dt;
      // Full kick on the shot, linear settle — the pop is the part that reads.
      offset += RECOIL_PX * Math.max(0, this.recoilT / RECOIL_SECONDS);
    }

    this.visual.y = offset;

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.shape.clearTint();
    }
  }

  // --- drawing -----------------------------------------------------------

  /** Redraw at the current cell size — called on creation and on every resize. */
  redraw(cell: number): this {
    this.lastCell = cell;
    this.applyArt(cell);
    this.layoutLabel(cell);
    this.drawHpBar();
    return this;
  }

  /** Sprite frame when the pack is installed, drawn shape when it is not. */
  private applyArt(cell: number): void {
    const ref = this.art?.unit(this.tier) ?? null;

    if (ref) {
      this.shape.setTexture(ref.key, ref.frame);
      const source = Math.max(this.shape.frame.width, this.shape.frame.height);
      // Whole-number upscale where it fits, so 16px pixel art stays crisp.
      this.shape.setScale(source > 0 ? (cell * SPRITE_SCALE) / source : 1);
      this.spriteMode = true;
      return;
    }

    ensureUnitTextures(this.scene, cell);
    this.shape.setTexture(unitTextureKey(this.tier)).setScale(1);
    this.spriteMode = false;
  }

  /**
   * With the drawn shape the tier number *is* the unit; with real art it is a
   * badge under it, so the sprite stays readable.
   */
  private layoutLabel(cell: number): void {
    if (this.spriteMode) {
      this.label
        .setFontSize(Math.max(8, Math.round(cell * BADGE_SIZE_RATIO)))
        .setColor(Palette.cardTitle)
        .setStroke('#0b0d14', Math.max(2, cell * 0.05))
        .setPosition(0, cell * BADGE_OFFSET_RATIO);
      return;
    }

    this.label
      .setFontSize(Math.max(8, Math.round(cell * LABEL_SIZE_RATIO)))
      .setColor(Palette.unitLabel)
      .setStroke('#0b0d14', 0)
      .setPosition(0, 0);
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
