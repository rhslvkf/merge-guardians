import Phaser from 'phaser';

import { SceneKey } from '../config/constants';

/**
 * HUD, summon dock, upgrade cards, pause and game-over panels.
 *
 * Runs in parallel with GameScene and never touches its objects — it reads
 * RunState and reacts to `GameEvent` messages (rules 6 and 7).
 *
 * Stub — built up across Phases 1-4.
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKey.UI, active: false });
  }

  create(): void {
    // TODO(phase-1): Hud + summon button.
    // TODO(phase-4): UpgradePanel 3-card draft.
  }
}
