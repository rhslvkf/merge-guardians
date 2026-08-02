import Phaser from 'phaser';

import { SceneKey } from '../config/constants';

/**
 * First scene.
 *
 * Phase 8 will move on to: portal adapter detection + `init()`, then
 * `loadingStart()` before handing off to PreloadScene. Until PreloadScene and
 * MenuScene have content (Phases 6 and 7), this goes straight to gameplay.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.scene.start(SceneKey.Game);
  }
}
