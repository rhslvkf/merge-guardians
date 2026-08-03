import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { Palette } from '../config/constants';
import {
  PERMA_UPGRADES,
  effectLabel,
  nextCost,
  type PermaId,
  type PermaDefinition,
} from '../core/MetaProgress';
import { t } from '../i18n';
import type { LayoutMetrics } from '../services/LayoutService';
import type { PermaUpgrades } from '../services/SaveService';
import { Button } from './Button';

/**
 * The permanent-upgrade shop, as a modal over the menu.
 *
 * A modal rather than a third screen: the player's whole reason for being here
 * is the gold number, which is on the menu behind it. Levels are shown as pips
 * instead of "2/3" because the state has to be readable at a glance on a phone.
 */

const PANEL_WIDTH_RATIO = 0.9;
const PANEL_MAX_WIDTH = 460;
const ROW_GAP_RATIO = 0.16;

export interface ShopPanelOptions {
  onBuy: (id: PermaId) => void;
  onClose: () => void;
}

interface Row {
  def: PermaDefinition;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  buy: Button;
  y: number;
  height: number;
}

export class ShopPanel {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly goldLine: Phaser.GameObjects.Text;
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly closeButton: Button;
  private readonly rows: Row[] = [];

  private levels: PermaUpgrades = { life: 0, energy: 0, dps: 0 };
  private gold = 0;
  visible = false;

  constructor(scene: Phaser.Scene, options: ShopPanelOptions) {
    this.backdrop = scene.add.graphics();
    this.panel = scene.add.graphics();
    this.title = scene.add
      .text(0, 0, t('shop.title'), {
        fontFamily: FONT_STACK,
        fontStyle: 'bold',
        color: Palette.bannerText,
      })
      .setOrigin(0.5);
    this.goldLine = scene.add
      .text(0, 0, '', { fontFamily: FONT_STACK, color: Palette.goldText })
      .setOrigin(0.5);
    this.pips = scene.add.graphics();

    for (const def of PERMA_UPGRADES) {
      this.rows.push({
        def,
        name: scene.add.text(0, 0, t(`shop.${def.key}.name`), {
          fontFamily: FONT_STACK,
          fontStyle: 'bold',
          color: Palette.cardTitle,
        }),
        desc: scene.add.text(0, 0, t(`shop.${def.key}.desc`, { amount: effectLabel(def.id) }), {
          fontFamily: FONT_STACK,
          color: Palette.cardDesc,
        }),
        buy: new Button(scene, { labelKey: 'shop.buy', onClick: () => options.onBuy(def.id) }),
        y: 0,
        height: 0,
      });
    }

    this.closeButton = new Button(scene, {
      labelKey: 'shop.close',
      onClick: options.onClose,
      fill: Palette.buttonFillMuted,
    });

    this.hide();
  }

  show(gold: number, levels: PermaUpgrades, metrics: LayoutMetrics): void {
    this.visible = true;
    this.gold = gold;
    this.levels = levels;
    this.setObjectsVisible(true);
    this.layout(metrics);
  }

  /** Refresh after a purchase without rebuilding anything. */
  update(gold: number, levels: PermaUpgrades, metrics: LayoutMetrics): void {
    this.gold = gold;
    this.levels = levels;
    if (this.visible) this.layout(metrics);
  }

  hide(): void {
    this.visible = false;
    this.setObjectsVisible(false);
  }

  private setObjectsVisible(visible: boolean): void {
    this.backdrop.setVisible(visible);
    this.panel.setVisible(visible);
    this.title.setVisible(visible);
    this.goldLine.setVisible(visible);
    this.pips.setVisible(visible);
    this.closeButton.setShown(visible);
    for (const row of this.rows) {
      row.name.setVisible(visible);
      row.desc.setVisible(visible);
      row.buy.setShown(visible);
    }
  }

  layout(metrics: LayoutMetrics): void {
    if (!this.visible) return;
    const { width, height } = metrics;

    this.backdrop.clear();
    this.backdrop.fillStyle(Palette.panelBackdrop, 0.82);
    this.backdrop.fillRect(0, 0, width, height);

    const panelWidth = Math.min(width * PANEL_WIDTH_RATIO, PANEL_MAX_WIDTH);
    const rowHeight = Math.max(58, height * 0.09);
    const gap = rowHeight * ROW_GAP_RATIO;
    const headerHeight = Math.max(70, height * 0.11);
    const footerHeight = Math.max(56, height * 0.08);
    const panelHeight =
      headerHeight + this.rows.length * rowHeight + (this.rows.length - 1) * gap + footerHeight + gap;
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;

    this.panel.clear();
    this.panel.fillStyle(Palette.panelFill, 1);
    this.panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 16);
    this.panel.lineStyle(2, Palette.panelStroke, 1);
    this.panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 16);

    this.title
      .setFontSize(Math.max(15, Math.round(height * 0.026)))
      .setPosition(width / 2, panelY + headerHeight * 0.34);
    this.goldLine
      .setText(t('menu.gold', { n: this.gold }))
      .setFontSize(Math.max(13, Math.round(height * 0.022)))
      .setPosition(width / 2, panelY + headerHeight * 0.7);

    this.pips.clear();
    let y = panelY + headerHeight;
    const inset = panelWidth * 0.06;
    const buttonWidth = Math.min(panelWidth * 0.3, 120);

    for (const row of this.rows) {
      row.y = y;
      row.height = rowHeight;
      this.layoutRow(row, panelX + inset, y, panelWidth - inset * 2, rowHeight, buttonWidth, height);
      y += rowHeight + gap;
    }

    this.closeButton.layoutAt(
      width / 2,
      panelY + panelHeight - footerHeight * 0.55,
      Math.min(panelWidth * 0.5, 200),
      footerHeight * 0.72
    );
  }

  private layoutRow(
    row: Row,
    x: number,
    y: number,
    width: number,
    height: number,
    buttonWidth: number,
    screenHeight: number
  ): void {
    const level = this.levels[row.def.id];
    const cost = nextCost(row.def.id, level);
    const textWidth = width - buttonWidth - 12;

    row.name
      .setFontSize(Math.max(12, Math.round(screenHeight * 0.02)))
      .setPosition(x, y + height * 0.1);
    row.desc
      .setFontSize(Math.max(10, Math.round(screenHeight * 0.016)))
      .setWordWrapWidth(textWidth)
      .setPosition(x, y + height * 0.42);

    this.drawPips(x, y + height * 0.86, row.def.maxLevel, level, screenHeight);

    // Maxed shows MAX and is dead; unaffordable stays visible but disabled, so
    // the player can see what they are saving towards.
    const affordable = cost !== null && this.gold >= cost;
    row.buy
      .setLabel(cost === null ? t('shop.maxed') : t('shop.buy', { cost }))
      .setEnabled(affordable)
      .layoutAt(x + width - buttonWidth / 2, y + height / 2, buttonWidth, height * 0.66);
  }

  /** One filled dot per level owned, hollow for the rest. */
  private drawPips(x: number, y: number, maxLevel: number, level: number, screenHeight: number): void {
    const radius = Math.max(3, screenHeight * 0.006);
    const step = radius * 3;
    for (let i = 0; i < maxLevel; i++) {
      const cx = x + radius + i * step;
      if (i < level) {
        this.pips.fillStyle(Palette.mergeHighlight, 1);
        this.pips.fillCircle(cx, y, radius);
      } else {
        this.pips.lineStyle(1.5, Palette.gaugeStroke, 1);
        this.pips.strokeCircle(cx, y, radius);
      }
    }
  }
}
