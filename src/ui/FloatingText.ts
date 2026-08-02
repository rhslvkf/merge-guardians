import Phaser from 'phaser';

import { Depth } from '../config/constants';

/**
 * Pooled short-lived labels that rise and fade — "BLOCK", "+1" and the like.
 *
 * Fixed pool with manual lifetimes rather than tweens, because a tween per hit
 * would allocate inside the frame path (rule 4). When the pool is exhausted the
 * label is skipped rather than grown.
 */

interface Entry {
  text: Phaser.GameObjects.Text;
  life: number;
  startY: number;
  duration: number;
}

const DEFAULT_LIFETIME = 0.6;
const RISE_RATIO = 0.5;

export class FloatingTextPool {
  private readonly entries: Entry[] = [];

  constructor(scene: Phaser.Scene, size: number) {
    for (let i = 0; i < size; i++) {
      const text = scene.add
        .text(0, 0, '', { fontFamily: 'monospace', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(Depth.FloatingText)
        .setVisible(false);
      this.entries.push({ text, life: 0, startY: 0, duration: DEFAULT_LIFETIME });
    }
  }

  show(message: string, x: number, y: number, color: string, lifetime = DEFAULT_LIFETIME): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.life > 0) continue;
      entry.life = lifetime;
      entry.duration = lifetime;
      entry.startY = y;
      entry.text.setText(message).setColor(color).setPosition(x, y).setAlpha(1).setVisible(true);
      return;
    }
    // Pool exhausted: drop the label rather than allocate mid-frame.
  }

  /** `rise` is how far a label travels over its life, in pixels. */
  update(dt: number, rise: number): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.life <= 0) continue;

      entry.life -= dt;
      if (entry.life <= 0) {
        entry.text.setVisible(false);
        continue;
      }

      const progress = 1 - entry.life / entry.duration;
      entry.text.y = entry.startY - rise * progress;
      entry.text.setAlpha(1 - progress);
    }
  }

  setFontSize(size: number): void {
    for (let i = 0; i < this.entries.length; i++) this.entries[i].text.setFontSize(size);
  }

  clear(): void {
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].life = 0;
      this.entries[i].text.setVisible(false);
    }
  }
}

export { RISE_RATIO as FLOATING_TEXT_RISE_RATIO };
