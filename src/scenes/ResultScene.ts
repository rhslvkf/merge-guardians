import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { DEBUG, Palette, RegistryKey, SceneKey } from '../config/constants';
import type { RunState } from '../core/RunState';
import { hasStage } from '../core/WaveRunner';
import { t } from '../i18n';
import { LayoutService } from '../services/LayoutService';
import type { PortalAdapter } from '../services/portal/PortalAdapter';
import { Backdrop } from '../ui/Backdrop';
import { Button } from '../ui/Button';

/**
 * Stage clear summary: gold earned, then next stage or retry.
 *
 * Phase 7 adds the run summary against saved progress; persistence goes through
 * SaveService (rule 2), which is not wired yet, so nothing here is stored.
 */
export class ResultScene extends Phaser.Scene {
  private layout!: LayoutService;
  private run!: RunState;

  private title!: Phaser.GameObjects.Text;
  private goldLine!: Phaser.GameObjects.Text;
  private totalLine!: Phaser.GameObjects.Text;
  private nextButton!: Button;
  private retryButton!: Button;
  private menuButton!: Button;
  private hasNextStage = false;

  constructor() {
    super(SceneKey.Result);
  }

  create(): void {
    this.layout = this.registry.get(RegistryKey.Layout) as LayoutService;
    this.run = this.registry.get(RegistryKey.RunState) as RunState;
    this.hasNextStage = hasStage(this.run.stageId + 1);
    new Backdrop(this);

    // TODO(phase-8): the end-of-stage midroll fires here, after gameplayStop().
    const portal = this.registry.get(RegistryKey.Portal) as PortalAdapter | undefined;
    portal?.happytime();
    if (DEBUG) console.log('[ads] stage-end midroll would play here (commercialBreak stub)');

    const mono = (color: string) => ({ fontFamily: FONT_STACK, color });
    this.title = this.add
      .text(0, 0, t('result.title', { n: this.run.stageId }), {
        fontFamily: FONT_STACK,
        fontStyle: 'bold',
        color: Palette.bannerText,
      })
      .setOrigin(0.5);
    this.goldLine = this.add
      .text(0, 0, t('result.goldEarned', { n: this.run.goldThisStage }), mono(Palette.goldText))
      .setOrigin(0.5);
    this.totalLine = this.add
      .text(0, 0, t('result.goldTotal', { n: this.run.gold }), mono(Palette.hudLabel))
      .setOrigin(0.5);

    this.nextButton = new Button(this, {
      labelKey: this.hasNextStage ? 'result.next' : 'result.allClear',
      onClick: () => this.nextStage(),
    });
    this.nextButton.setEnabled(this.hasNextStage);
    this.nextButton.setAlpha(this.hasNextStage ? 1 : 0.45);

    this.retryButton = new Button(this, {
      labelKey: 'result.retry',
      onClick: () => this.retryStage(),
      fill: Palette.buttonFillMuted,
    });
    this.menuButton = new Button(this, {
      labelKey: 'result.menu',
      onClick: () => this.scene.start(SceneKey.Menu),
      fill: Palette.buttonFillMuted,
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    });

    this.applyLayout();
  }

  private nextStage(): void {
    // Gold carries across stages; lives and energy are restored per stage.
    this.run.startStage(this.run.stageId + 1);
    this.scene.start(SceneKey.Game);
  }

  private retryStage(): void {
    this.run.startStage(this.run.stageId);
    this.scene.start(SceneKey.Game);
  }

  private applyLayout(): void {
    const { width, height } = this.scale.gameSize;
    // This scene runs without GameScene, so it drives the resize itself.
    this.layout.resize(width, height);

    this.title
      .setFontSize(Math.min(46, Math.round(height * 0.052)))
      .setPosition(width / 2, height * 0.26);
    this.goldLine
      .setFontSize(Math.max(13, Math.round(height * 0.026)))
      .setPosition(width / 2, height * 0.36);
    this.totalLine
      .setFontSize(Math.max(11, Math.round(height * 0.02)))
      .setPosition(width / 2, height * 0.41);

    const buttonWidth = Math.min(width * 0.7, 320);
    const buttonHeight = Math.max(48, height * 0.07);
    const gap = buttonHeight * 0.24;
    let y = height * 0.54;
    for (const button of [this.nextButton, this.retryButton, this.menuButton]) {
      button.layoutAt(width / 2, y, buttonWidth, buttonHeight);
      y += buttonHeight + gap;
    }
    this.nextButton.setAlpha(this.hasNextStage ? 1 : 0.45);
  }
}
