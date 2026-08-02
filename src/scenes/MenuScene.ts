import Phaser from 'phaser';

import { SceneKey } from '../config/constants';

/**
 * Title screen: play, stage select, permanent-upgrade shop, sound toggle.
 *
 * Poki note — entering this scene is *not* gameplay. `gameplayStart()` fires on
 * the player's first input inside GameScene, never here.
 *
 * Stub — implemented in Phase 7.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    // TODO(phase-7): stage select + meta shop, driven by SaveService.
  }
}
