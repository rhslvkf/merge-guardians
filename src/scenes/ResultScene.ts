import Phaser from 'phaser';

import { SceneKey } from '../config/constants';

/**
 * Stage clear / run summary: gold earned, best stage, retry and next-stage.
 *
 * Poki note — the end-of-stage midroll fires *after* `gameplayStop()`, from the
 * transition into this scene.
 *
 * Stub — implemented in Phase 7.
 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Result);
  }

  create(): void {
    // TODO(phase-7): summary + SaveService commit.
    // TODO(phase-8): portal.commercialBreak() after gameplayStop().
  }
}
