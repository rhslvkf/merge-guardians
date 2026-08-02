import Phaser from 'phaser';

import { SceneKey } from '../config/constants';

/**
 * Loads config JSON and art/audio atlases, shows the loading bar, and reports
 * progress to the portal adapter (`loadingStart` / `loadingFinished`).
 *
 * Stub — implemented in Phase 6 (assets) and Phase 8 (portal hooks).
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    // TODO(phase-6): load atlases and audio from public/assets.
  }

  create(): void {
    // TODO(phase-8): portal.loadingFinished() before starting MenuScene.
  }
}
