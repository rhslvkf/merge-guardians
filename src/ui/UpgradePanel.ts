import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { Palette } from '../config/constants';
import type { UpgradeCard } from '../core/UpgradeSystem';
import { t } from '../i18n';
import type { LayoutMetrics } from '../services/LayoutService';
import { Button } from './Button';

/**
 * The post-wave 3-card draft (spec 8).
 *
 * Renders whatever UpgradeSystem drew and reports the pick back; the filtering
 * and the effects live in UpgradeSystem so the rules stay renderer-free.
 *
 * The rewarded "double gold" button is a stub until Phase 8 wires
 * `PortalAdapter.rewardedBreak()`.
 */

export interface UpgradePanelActions {
  onPick: (id: string) => void;
  onAdBonus: () => void;
}

const PANEL_WIDTH_RATIO = 0.92;
const PANEL_MAX_WIDTH = 460;
const CARD_GAP_RATIO = 0.03;

interface CardView {
  bg: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  stacks: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  id: string;
}

export class UpgradePanel {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly cards: CardView[] = [];
  private readonly adButton: Button;
  private readonly actions: UpgradePanelActions;

  private metrics?: LayoutMetrics;
  private shown = false;
  private adTaken = false;

  constructor(scene: Phaser.Scene, actions: UpgradePanelActions) {
    this.actions = actions;
    this.backdrop = scene.add.graphics();
    this.heading = scene.add
      .text(0, 0, t('upgrade.heading'), {
        fontFamily: FONT_STACK,
        fontStyle: 'bold',
        color: Palette.bannerText,
      })
      .setOrigin(0.5);

    // Three card slots, reused across drafts rather than rebuilt each time.
    for (let i = 0; i < 3; i++) {
      const bg = scene.add.graphics();
      const title = scene.add
        .text(0, 0, '', { fontFamily: FONT_STACK, fontStyle: 'bold', color: Palette.cardTitle })
        .setOrigin(0, 0.5);
      const desc = scene.add
        .text(0, 0, '', { fontFamily: FONT_STACK, color: Palette.cardDesc })
        .setOrigin(0, 0);
      const stacks = scene.add
        .text(0, 0, '', { fontFamily: FONT_STACK, color: Palette.cardStack })
        .setOrigin(1, 0.5);
      const hit = scene.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setInteractive();
      hit.on(Phaser.Input.Events.POINTER_UP, () => this.pick(i));
      this.cards.push({ bg, title, desc, stacks, hit, id: '' });
    }

    this.adButton = new Button(scene, {
      labelKey: 'upgrade.adGold',
      onClick: () => this.takeAdBonus(),
      fill: Palette.buttonFillDanger,
    });

    this.setVisible(false);
  }

  get visible(): boolean {
    return this.shown;
  }

  show(offer: UpgradeCard[]): void {
    this.shown = true;
    this.adTaken = false;

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const data = offer[i];
      const has = data !== undefined;
      card.id = has ? data.id : '';
      if (has) {
        card.title.setText(t(data.nameKey));
        card.desc.setText(t(data.descKey));
        // Stacks are the count already taken, so the player can see it building.
        card.stacks.setText(data.stacks > 0 ? t('upgrade.stacks', { n: data.stacks }) : '');
      }
      this.setCardVisible(card, has);
    }

    this.setVisible(true);
    this.adButton.setEnabled(true).setAlpha(1);
    if (this.metrics) this.layout(this.metrics);
  }

  hide(): void {
    this.shown = false;
    this.setVisible(false);
  }

  private pick(index: number): void {
    if (!this.shown) return;
    const card = this.cards[index];
    if (!card.id) return;
    this.actions.onPick(card.id);
  }

  private takeAdBonus(): void {
    if (!this.shown || this.adTaken) return;
    this.adTaken = true;
    this.adButton.setEnabled(false).setAlpha(0.5);
    this.actions.onAdBonus();
  }

  private setCardVisible(card: CardView, visible: boolean): void {
    const on = visible && this.shown;
    card.bg.setVisible(on);
    card.title.setVisible(on);
    card.desc.setVisible(on);
    card.stacks.setVisible(on);
    card.hit.setVisible(on);
    if (on) card.hit.setInteractive();
    else card.hit.disableInteractive();
  }

  private setVisible(visible: boolean): void {
    this.backdrop.setVisible(visible);
    this.heading.setVisible(visible);
    this.adButton.setVisible(visible);
    for (const card of this.cards) this.setCardVisible(card, visible && card.id !== '');
  }

  layout(metrics: LayoutMetrics): void {
    this.metrics = metrics;
    if (!this.shown) return;

    const { width, height } = metrics;
    this.backdrop.clear();
    this.backdrop.fillStyle(Palette.panelBackdrop, 0.85);
    this.backdrop.fillRect(0, 0, width, height);

    const panelWidth = Math.min(width * PANEL_WIDTH_RATIO, PANEL_MAX_WIDTH);
    const panelX = (width - panelWidth) / 2;
    const gap = height * CARD_GAP_RATIO;
    const adHeight = Math.max(44, height * 0.062);
    const cardHeight = Math.max(64, height * 0.115);
    const blockHeight = cardHeight * 3 + gap * 2;
    const top = (height - blockHeight - adHeight - gap * 2) / 2 + height * 0.04;

    this.heading
      .setFontSize(Math.min(34, Math.round(height * 0.034)))
      .setPosition(width / 2, top - gap * 1.6);

    const pad = panelWidth * 0.06;
    let y = top;
    for (const card of this.cards) {
      if (card.id === '') continue;

      card.bg.clear();
      card.bg.fillStyle(Palette.cardFill, 0.98);
      card.bg.fillRoundedRect(panelX, y, panelWidth, cardHeight, 14);
      card.bg.lineStyle(2, Palette.cardStroke, 1);
      card.bg.strokeRoundedRect(panelX, y, panelWidth, cardHeight, 14);

      card.title
        .setFontSize(Math.max(13, Math.round(height * 0.023)))
        .setPosition(panelX + pad, y + cardHeight * 0.28);
      card.stacks
        .setFontSize(Math.max(11, Math.round(height * 0.018)))
        .setPosition(panelX + panelWidth - pad, y + cardHeight * 0.28);
      card.desc
        .setFontSize(Math.max(10, Math.round(height * 0.017)))
        .setWordWrapWidth(panelWidth - pad * 2)
        .setPosition(panelX + pad, y + cardHeight * 0.46);

      card.hit.setPosition(panelX + panelWidth / 2, y + cardHeight / 2);
      card.hit.setSize(panelWidth, cardHeight);
      card.hit.setInteractive();

      y += cardHeight + gap;
    }

    this.adButton.layoutAt(width / 2, y + adHeight / 2, panelWidth * 0.8, adHeight);
  }
}
