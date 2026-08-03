import Phaser from 'phaser';

import { Depth } from '../config/constants';

/**
 * The one-shot juice: merges, deaths and the life-lost screen flash.
 *
 * All of it is tweens and pooled graphics rather than extra sprite frames — an
 * animation strip per tier would multiply the art budget for effects the player
 * sees for 200ms.
 *
 * Continuous motion (idle bob, fire recoil, hit flash) is *not* here: those
 * write the same properties as each other and as grid positioning, so they run
 * as an additive per-frame offset inside the entity instead. See
 * `Unit.updateVisual`.
 *
 * The pools exist because merges and kills happen inside the frame loop, where
 * allocating is not allowed (rule 4). Tweens are created per effect, but only
 * on discrete events — never per frame, per unit or per shot.
 */

const MERGE_ABSORB_MS = 130;
const MERGE_POP_MS = 220;
const MERGE_POP_SCALE = 1.3;
const RING_MS = 320;
const DEATH_MS = 220;
const SHARD_MS = 380;
const SHARD_COUNT = 6;
const VIGNETTE_MS = 200;

const RING_POOL = 4;
const SHARD_POOL = 24;
const GHOST_POOL = 8;

interface Shard {
  gfx: Phaser.GameObjects.Graphics;
  tween?: Phaser.Tweens.Tween;
}

interface Ghost {
  img: Phaser.GameObjects.Image;
  tween?: Phaser.Tweens.Tween;
}

export class Effects {
  private readonly rings: Phaser.GameObjects.Graphics[] = [];
  private readonly shards: Shard[] = [];
  private readonly ghosts: Ghost[] = [];
  private readonly flash: Phaser.GameObjects.Graphics;
  private ringNext = 0;
  private shardNext = 0;
  private ghostNext = 0;

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < RING_POOL; i++) {
      this.rings.push(scene.add.graphics().setDepth(Depth.FloatingText).setVisible(false));
    }
    for (let i = 0; i < SHARD_POOL; i++) {
      this.shards.push({
        gfx: scene.add.graphics().setDepth(Depth.FloatingText).setVisible(false),
      });
    }
    for (let i = 0; i < GHOST_POOL; i++) {
      this.ghosts.push({
        img: scene.add.image(0, 0, '__DEFAULT').setDepth(Depth.Enemy).setVisible(false),
      });
    }
    this.flash = scene.add
      .graphics()
      .setDepth(Depth.Dragging + 1)
      .setScrollFactor(0)
      .setVisible(false);
  }

  // --- merge -------------------------------------------------------------

  /**
   * The dragged unit is pulled into the target and vanishes.
   *
   * `onAbsorbed` fires when it has finished shrinking, so the caller destroys it
   * and re-textures the survivor at the right moment rather than mid-tween.
   */
  mergeAbsorb(
    consumed: Phaser.GameObjects.Container,
    toX: number,
    toY: number,
    onAbsorbed: () => void
  ): void {
    this.scene.tweens.killTweensOf(consumed);
    this.scene.tweens.add({
      targets: consumed,
      x: toX,
      y: toY,
      scale: 0,
      duration: MERGE_ABSORB_MS,
      ease: 'Quad.In',
      onComplete: onAbsorbed,
    });
  }

  /** Overshoot and settle — the payoff beat of the whole game. */
  mergePop(target: Phaser.GameObjects.Container): void {
    this.scene.tweens.killTweensOf(target);
    target.setScale(MERGE_POP_SCALE);
    this.scene.tweens.add({
      targets: target,
      scale: 1,
      duration: MERGE_POP_MS,
      ease: 'Back.Out',
    });
  }

  /** Expanding ring at the merge point. */
  ring(x: number, y: number, radius: number, color: number): void {
    const gfx = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.rings.length;

    this.scene.tweens.killTweensOf(gfx);
    gfx.clear();
    gfx.lineStyle(Math.max(2, radius * 0.12), color, 1);
    gfx.strokeCircle(0, 0, radius);
    gfx.setVisible(true).setAlpha(1).setPosition(x, y).setScale(0.2);

    this.scene.tweens.add({
      targets: gfx,
      scale: 1.5,
      alpha: 0,
      duration: RING_MS,
      ease: 'Quad.Out',
      onComplete: () => gfx.setVisible(false),
    });
  }

  // --- death -------------------------------------------------------------

  /**
   * Shrink-and-fade the dying body, and throw shards outward from it.
   *
   * The enemy itself goes straight back to the pool the frame it dies, so the
   * body the player watches shrink is a pooled stand-in holding the same
   * texture — nothing here can delay a recycle or hold a reference to one.
   */
  enemyDeath(
    x: number,
    y: number,
    size: number,
    color: number,
    texture: string,
    frame: string | number,
    scale: number
  ): void {
    const ghost = this.ghosts[this.ghostNext];
    this.ghostNext = (this.ghostNext + 1) % this.ghosts.length;

    ghost.tween?.remove();
    ghost.img
      .setTexture(texture, frame)
      .setPosition(x, y)
      .setScale(scale)
      .setAlpha(1)
      .setVisible(true);

    ghost.tween = this.scene.tweens.add({
      targets: ghost.img,
      scale: scale * 0.6,
      alpha: 0,
      duration: DEATH_MS,
      ease: 'Quad.In',
      onComplete: () => ghost.img.setVisible(false),
    });

    const shardSize = Math.max(2, size * 0.16);

    for (let i = 0; i < SHARD_COUNT; i++) {
      const shard = this.shards[this.shardNext];
      this.shardNext = (this.shardNext + 1) % this.shards.length;

      shard.tween?.remove();
      shard.gfx.clear();
      shard.gfx.fillStyle(color, 1);
      shard.gfx.fillRect(-shardSize / 2, -shardSize / 2, shardSize, shardSize);
      shard.gfx.setVisible(true).setAlpha(1).setPosition(x, y).setScale(1);

      // Even spread with a little jitter, so two kills never look identical.
      const angle = (Math.PI * 2 * i) / SHARD_COUNT + Math.random() * 0.5;
      const distance = size * (0.5 + Math.random() * 0.5);
      shard.tween = this.scene.tweens.add({
        targets: shard.gfx,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.3,
        duration: SHARD_MS,
        ease: 'Quad.Out',
      });
    }
  }

  // --- screen ------------------------------------------------------------

  /**
   * Red edge-darkening pulse when a life is lost.
   *
   * Concentric bands rather than a radial-gradient texture: it exists for a
   * fifth of a second and has to survive every resize.
   */
  vignetteFlash(width: number, height: number, color: number): void {
    const gfx = this.flash;
    this.scene.tweens.killTweensOf(gfx);

    gfx.clear();
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const inset = Math.min(width, height) * 0.5 * t;
      gfx.lineStyle(Math.min(width, height) * 0.1, color, 0.16 * (1 - t));
      gfx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    }

    gfx.setVisible(true).setAlpha(1);
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: VIGNETTE_MS,
      ease: 'Quad.Out',
      onComplete: () => gfx.setVisible(false),
    });
  }
}
