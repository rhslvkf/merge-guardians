import Phaser from 'phaser';

import { GameEvent, RegistryKey, SceneKey } from '../config/constants';
import type { LayoutService } from '../services/LayoutService';
import { Button } from '../ui/Button';

/**
 * HUD, summon dock, upgrade cards, pause and game-over panels.
 *
 * Runs in parallel with GameScene and never touches its objects — it reads the
 * shared LayoutService and talks back through `GameEvent` only (rules 6 and 7).
 *
 * Phase 1 scope — just the debug summon button.
 */

const BUTTON_WIDTH_RATIO = 0.44;
const BUTTON_MAX_WIDTH = 260;
const BUTTON_HEIGHT_RATIO = 0.5;

export class UIScene extends Phaser.Scene {
  private layout!: LayoutService;
  private summonButton!: Button;

  constructor() {
    super({ key: SceneKey.UI, active: false });
  }

  create(): void {
    this.layout = this.registry.get(RegistryKey.Layout) as LayoutService;

    this.summonButton = new Button(this, {
      labelKey: 'debug.summon',
      onClick: () => this.game.events.emit(GameEvent.SummonRequested),
    });

    this.game.events.on(GameEvent.LayoutChanged, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GameEvent.LayoutChanged, this.applyLayout, this);
    });

    this.applyLayout();
  }

  /** Everything positions off LayoutService metrics — no literals (rule 5). */
  private applyLayout(): void {
    const { width, height, dockH } = this.layout.get();

    const buttonWidth = Math.min(width * BUTTON_WIDTH_RATIO, BUTTON_MAX_WIDTH);
    const buttonHeight = dockH * BUTTON_HEIGHT_RATIO;

    this.summonButton.layoutAt(width / 2, height - dockH / 2, buttonWidth, buttonHeight);
  }
}
