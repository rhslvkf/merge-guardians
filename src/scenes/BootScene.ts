import Phaser from 'phaser';

import { SceneKey } from '../config/constants';

/**
 * First scene. Owns nothing but the title card for now.
 *
 * Phase 8 will move on to: portal adapter detection + `init()`, then
 * `loadingStart()` before handing off to PreloadScene.
 */
export class BootScene extends Phaser.Scene {
  private title?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.title = this.add
      .text(0, 0, 'Merge Guardians', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e8ecf5',
      })
      .setOrigin(0.5);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private layout(): void {
    // Placeholder centring. From Phase 1 on, every position comes from
    // LayoutService / gridToWorld() instead (rule 5).
    const { width, height } = this.scale.gameSize;
    this.title?.setPosition(width / 2, height / 2);
  }
}
