import Phaser from 'phaser';

import { Palette } from '../config/constants';
import { t } from '../i18n';
import type { LayoutMetrics } from '../services/LayoutService';
import { Button } from './Button';

/**
 * Modal shown when lives reach zero.
 *
 * Three ways out: a rewarded revive (once per run), a restart, or back to the
 * menu. The panel only reports the choice — GameScene owns what each one does.
 *
 * Phase 8 puts the revive behind `PortalAdapter.rewardedBreak()`; for now the
 * button grants it immediately.
 */

export interface GameOverActions {
  onRevive: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

const PANEL_WIDTH_RATIO = 0.82;
const PANEL_MAX_WIDTH = 420;
const TITLE_SIZE_RATIO = 0.05;
const TITLE_SIZE_MAX = 44;
const BUTTON_GAP_RATIO = 0.16;

export class GameOverPanel {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly reviveButton: Button;
  private readonly restartButton: Button;
  private readonly menuButton: Button;

  private metrics?: LayoutMetrics;
  private reviveAvailable = true;

  constructor(scene: Phaser.Scene, actions: GameOverActions) {
    this.backdrop = scene.add.graphics();
    this.panel = scene.add.graphics();
    this.title = scene.add
      .text(0, 0, t('gameOver.title'), {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: Palette.bannerText,
      })
      .setOrigin(0.5);
    this.subtitle = scene.add
      .text(0, 0, '', { fontFamily: 'monospace', color: Palette.hudLabel })
      .setOrigin(0.5);

    this.reviveButton = new Button(scene, {
      labelKey: 'gameOver.revive',
      onClick: actions.onRevive,
      fill: Palette.buttonFillDanger,
    });
    this.restartButton = new Button(scene, {
      labelKey: 'gameOver.restart',
      onClick: actions.onRestart,
    });
    this.menuButton = new Button(scene, {
      labelKey: 'gameOver.menu',
      onClick: actions.onMenu,
      fill: Palette.buttonFillMuted,
    });

    this.setVisible(false);
  }

  show(goldEarned: number, reviveAvailable: boolean): void {
    this.reviveAvailable = reviveAvailable;
    this.subtitle.setText(t('gameOver.goldEarned', { n: goldEarned }));
    this.setVisible(true);
    this.reviveButton.setEnabled(reviveAvailable);
    this.reviveButton.setAlpha(reviveAvailable ? 1 : 0.45);
    if (this.metrics) this.layout(this.metrics);
  }

  hide(): void {
    this.setVisible(false);
  }

  get visible(): boolean {
    return this.panel.visible;
  }

  private setVisible(visible: boolean): void {
    this.backdrop.setVisible(visible);
    this.panel.setVisible(visible);
    this.title.setVisible(visible);
    this.subtitle.setVisible(visible);
    this.reviveButton.setVisible(visible);
    this.restartButton.setVisible(visible);
    this.menuButton.setVisible(visible);
  }

  layout(metrics: LayoutMetrics): void {
    this.metrics = metrics;
    const { width, height } = metrics;

    this.backdrop.clear();
    this.backdrop.fillStyle(Palette.panelBackdrop, 0.78);
    this.backdrop.fillRect(0, 0, width, height);

    const panelWidth = Math.min(width * PANEL_WIDTH_RATIO, PANEL_MAX_WIDTH);
    const buttonHeight = Math.max(46, height * 0.07);
    const gap = buttonHeight * BUTTON_GAP_RATIO;
    const panelHeight = buttonHeight * 3 + gap * 2 + height * 0.2;
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;

    this.panel.clear();
    this.panel.fillStyle(Palette.panelFill, 0.98);
    this.panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 16);
    this.panel.lineStyle(2, Palette.panelStroke, 1);
    this.panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 16);

    this.title
      .setFontSize(Math.min(TITLE_SIZE_MAX, Math.round(height * TITLE_SIZE_RATIO)))
      .setPosition(width / 2, panelY + panelHeight * 0.16);
    this.subtitle
      .setFontSize(Math.max(11, Math.round(height * 0.022)))
      .setPosition(width / 2, panelY + panelHeight * 0.3);

    const buttonWidth = panelWidth * 0.78;
    let y = panelY + panelHeight * 0.44;
    for (const button of [this.reviveButton, this.restartButton, this.menuButton]) {
      button.layoutAt(width / 2, y, buttonWidth, buttonHeight);
      y += buttonHeight + gap;
    }
    this.reviveButton.setAlpha(this.reviveAvailable ? 1 : 0.45);
  }
}
