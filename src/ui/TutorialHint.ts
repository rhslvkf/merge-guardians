import Phaser from 'phaser';

import { Palette } from '../config/constants';
import type { TutorialHint as HintState } from '../core/TutorialSystem';
import { bakeTexture } from '../entities/shapeTextures';

/**
 * Draws the two onboarding gestures: a pulsing pointer on the summon button,
 * and a pointer travelling along a dashed trail between two units.
 *
 * No words and no art asset — a fingertip ring is the one instruction that
 * needs neither translation nor a download. The pointer is baked once so the
 * per-frame cost is a transform, not a Graphics rebuild (the Phase 6 lesson).
 */

const POINTER_RADIUS = 13;
const TAP_PERIOD_MS = 900;
const DRAG_PERIOD_MS = 1700;
/** Pause at each end of the drag, as a fraction of the loop. */
const DRAG_HOLD = 0.18;
const TRAIL_DASH = 9;
const TRAIL_GAP = 7;

const POINTER_KEY = 'tutorial-pointer';

export class TutorialHint {
  private readonly pointer: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  private readonly trail: Phaser.GameObjects.Graphics;

  private state: HintState['step'] = 'done';
  private suppressed = false;
  private targetX = 0;
  private targetY = 0;
  private fromX = 0;
  private fromY = 0;
  private elapsed = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    TutorialHint.ensureTexture(scene);

    this.trail = scene.add.graphics().setDepth(depth).setVisible(false);
    this.halo = scene.add
      .image(0, 0, POINTER_KEY)
      .setDepth(depth)
      .setVisible(false)
      .setAlpha(0.35);
    this.pointer = scene.add.image(0, 0, POINTER_KEY).setDepth(depth).setVisible(false);
  }

  /** A filled dot inside a ring: the universal "touch here". */
  private static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(POINTER_KEY)) return;

    const size = POINTER_RADIUS * 2 + 6;
    const c = size / 2;
    bakeTexture(scene, POINTER_KEY, size, size, (g) => {
      g.fillStyle(0xffffff, 0.22);
      g.fillCircle(c, c, POINTER_RADIUS);
      g.lineStyle(3, 0xffffff, 0.95);
      g.strokeCircle(c, c, POINTER_RADIUS);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(c, c, POINTER_RADIUS * 0.34);
    });
  }

  /** Point at the summon button. Called on every layout, so it follows resizes. */
  setSummonTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  /**
   * Apply a hint from TutorialSystem.
   *
   * The drag endpoints arrive in world pixels. UIScene and GameScene render to
   * the same canvas with no camera scroll, so board positions need no
   * conversion between the two.
   */
  apply(hint: HintState): void {
    if (hint.step !== this.state) this.elapsed = 0;
    this.state = hint.step;

    if (hint.step === 'merge') {
      this.fromX = hint.fromX;
      this.fromY = hint.fromY;
      this.targetX = hint.toX;
      this.targetY = hint.toY;
    }

    const visible = hint.step !== 'done' && !this.suppressed;
    this.pointer.setVisible(visible);
    this.halo.setVisible(visible);
    this.trail.setVisible(visible && hint.step === 'merge');
    if (hint.step === 'merge') this.drawTrail();
    else this.trail.clear();
  }

  /**
   * Hide without forgetting. A pulsing fingertip on top of the pause overlay
   * or a modal panel reads as a bug, but the player has not stopped needing
   * the hint — it comes back when they do.
   */
  setSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    const show = !suppressed && this.state !== 'done';
    this.pointer.setVisible(show);
    this.halo.setVisible(show);
    this.trail.setVisible(show && this.state === 'merge');
  }

  update(dt: number): void {
    if (this.state === 'done' || this.suppressed) return;
    this.elapsed += dt * 1000;

    if (this.state === 'summon') {
      this.animateTap();
      return;
    }
    this.animateDrag();
  }

  /** Pointer sits on the button; the halo swells and fades out of it. */
  private animateTap(): void {
    const phase = (this.elapsed % TAP_PERIOD_MS) / TAP_PERIOD_MS;

    this.pointer.setPosition(this.targetX, this.targetY);
    // A small dip on the beat reads as a press rather than a hover.
    this.pointer.setScale(1 - 0.12 * Math.sin(phase * Math.PI));

    this.halo.setPosition(this.targetX, this.targetY);
    this.halo.setScale(1 + phase * 1.6).setAlpha(0.35 * (1 - phase));
  }

  /** Pointer runs the trail, holding briefly at each end so it reads as a drag. */
  private animateDrag(): void {
    const phase = (this.elapsed % DRAG_PERIOD_MS) / DRAG_PERIOD_MS;
    const travel = Phaser.Math.Clamp((phase - DRAG_HOLD) / (1 - DRAG_HOLD * 2), 0, 1);
    // Ease so the gesture accelerates and settles, like a real drag.
    const eased = travel * travel * (3 - 2 * travel);

    const x = this.fromX + (this.targetX - this.fromX) * eased;
    const y = this.fromY + (this.targetY - this.fromY) * eased;

    this.pointer.setPosition(x, y).setScale(0.92);
    this.halo
      .setPosition(x, y)
      .setScale(1.1 + 0.15 * Math.sin((this.elapsed / 260) % (Math.PI * 2)))
      .setAlpha(0.3);
  }

  /**
   * Dashed line between the two units.
   *
   * Redrawn only when the pair changes, not per frame — the pointer moving
   * along it is a transform on a baked image.
   */
  private drawTrail(): void {
    const gfx = this.trail;
    gfx.clear();

    const dx = this.targetX - this.fromX;
    const dy = this.targetY - this.fromY;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;

    const ux = dx / length;
    const uy = dy / length;
    gfx.lineStyle(3, Palette.mergeHighlight, 0.75);

    for (let d = 0; d < length; d += TRAIL_DASH + TRAIL_GAP) {
      const end = Math.min(d + TRAIL_DASH, length);
      gfx.lineBetween(
        this.fromX + ux * d,
        this.fromY + uy * d,
        this.fromX + ux * end,
        this.fromY + uy * end
      );
    }
  }

  get visible(): boolean {
    return this.state !== 'done' && !this.suppressed;
  }
}
