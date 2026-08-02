import Phaser from 'phaser';

import { Palette, RegistryKey, SceneKey } from '../config/constants';
import type { RunState } from '../core/RunState';
import { t } from '../i18n';
import { LayoutService } from '../services/LayoutService';
import { Button } from '../ui/Button';

/**
 * Title screen.
 *
 * Minimal on purpose: it exists so the "menu" exits from the game-over and
 * result panels lead somewhere real. Stage select and the permanent-upgrade
 * shop are Phase 7.
 *
 * Poki note — entering this scene is *not* gameplay. `gameplayStart()` fires on
 * the player's first input inside GameScene, never here.
 */
export class MenuScene extends Phaser.Scene {
  private layout!: LayoutService;
  private title!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private playButton!: Button;

  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    this.layout = this.registry.get(RegistryKey.Layout) as LayoutService;

    this.title = this.add
      .text(0, 0, t('game.title'), {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: Palette.bannerText,
      })
      .setOrigin(0.5);

    this.hint = this.add
      .text(0, 0, t('menu.hint'), { fontFamily: 'monospace', color: Palette.hudLabel })
      .setOrigin(0.5);

    this.playButton = new Button(this, {
      labelKey: 'menu.play',
      onClick: () => this.startRun(),
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    });

    this.applyLayout();
  }

  private startRun(): void {
    const run = this.registry.get(RegistryKey.RunState) as RunState;
    run.reset();
    this.scene.start(SceneKey.Game);
  }

  private applyLayout(): void {
    const { width, height } = this.scale.gameSize;
    // This scene runs without GameScene, so it drives the resize itself.
    this.layout.resize(width, height);

    this.title
      .setFontSize(Math.min(52, Math.round(height * 0.06)))
      .setPosition(width / 2, height * 0.32);
    this.hint
      .setFontSize(Math.max(11, Math.round(height * 0.02)))
      .setPosition(width / 2, height * 0.4);

    const buttonWidth = Math.min(width * 0.6, 300);
    this.playButton.layoutAt(width / 2, height * 0.58, buttonWidth, Math.max(52, height * 0.075));
  }
}
