import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { EnemyPalette, Palette } from '../config/constants';
import type { RunState } from '../core/RunState';
import { t } from '../i18n';
import type { LayoutMetrics } from '../services/LayoutService';

/**
 * Top HUD: lives, energy gauge, gold, wave/stage, enemy count and the boss bar.
 *
 * Lives in UIScene. Reads RunState — the single source of truth (rule 6) — and
 * only touches a display object when the value it shows actually changed, so an
 * idle HUD costs nothing.
 */

const LABEL_SIZE_RATIO = 0.2;
const VALUE_SIZE_RATIO = 0.26;
/**
 * The HUD band is split into three rows plus a boss strip along its bottom
 * edge, so the gauge never collides with the wave/enemy line.
 *   0.00-0.32  lives | energy value | gold
 *   0.32-0.57  energy gauge
 *   0.57-0.84  stage/wave | enemies remaining
 *   0.86-1.00  boss health, when a boss is alive
 */
const ROW_TOP_RATIO = 0.24;
const ROW_BOTTOM_RATIO = 0.72;
const GAUGE_Y_RATIO = 0.4;
const GAUGE_HEIGHT_RATIO = 0.17;
const GAUGE_WIDTH_RATIO = 0.42;
const BOSS_BAR_WIDTH_RATIO = 0.72;
const BOSS_BAR_HEIGHT_RATIO = 0.11;

/**
 * Compact roster of everything taken this run, e.g. "ATK x2  DMG x1".
 *
 * Rebuilt only when the upgrade count changes, so it never runs per frame.
 */
function formatUpgrades(ids: readonly string[]): string {
  if (ids.length === 0) return '';
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  let out = '';
  for (const [id, n] of counts) {
    if (out.length > 0) out += '   ';
    out += n > 1 ? `${t(`upgrade.${id}.short`)} x${n}` : t(`upgrade.${id}.short`);
  }
  return out;
}

export class Hud {
  private readonly energyGauge: Phaser.GameObjects.Graphics;
  private readonly energyLabel: Phaser.GameObjects.Text;
  private readonly livesLabel: Phaser.GameObjects.Text;
  private readonly goldLabel: Phaser.GameObjects.Text;
  private readonly waveLabel: Phaser.GameObjects.Text;
  private readonly enemyLabel: Phaser.GameObjects.Text;
  private readonly bossBar: Phaser.GameObjects.Graphics;
  private readonly upgradeList: Phaser.GameObjects.Text;

  private metrics?: LayoutMetrics;

  // Last rendered values, so refresh() is a no-op when nothing moved.
  private lastEnergy = -1;
  private lastLives = -1;
  private lastGold = -1;
  private lastEnemies = -1;
  private lastWaveKey = -1;
  private lastUpgradeCount = -1;
  private bossRatio = -1;

  constructor(scene: Phaser.Scene) {
    this.energyGauge = scene.add.graphics();
    this.bossBar = scene.add.graphics().setVisible(false);

    const mono = (color: string) => ({ fontFamily: FONT_STACK, color });
    this.energyLabel = scene.add.text(0, 0, '', mono(Palette.energyText)).setOrigin(0.5);
    this.livesLabel = scene.add.text(0, 0, '', mono(Palette.lifeFull)).setOrigin(0, 0.5);
    this.goldLabel = scene.add.text(0, 0, '', mono(Palette.goldText)).setOrigin(1, 0.5);
    this.waveLabel = scene.add.text(0, 0, '', mono(Palette.hudLabel)).setOrigin(0, 0.5);
    this.enemyLabel = scene.add.text(0, 0, '', mono(Palette.hudLabel)).setOrigin(1, 0.5);
    this.upgradeList = scene.add.text(0, 0, '', mono(Palette.cardStack)).setOrigin(0.5, 0);
  }

  /** `rightInset` keeps the top-right values clear of the pause button. */
  layout(metrics: LayoutMetrics, rightInset = 0): void {
    this.metrics = metrics;
    const { width, hudH } = metrics;
    const pad = Math.max(12, width * 0.03);
    const rightEdge = width - pad - rightInset;
    const valueSize = Math.max(12, Math.round(hudH * VALUE_SIZE_RATIO));
    const labelSize = Math.max(10, Math.round(hudH * LABEL_SIZE_RATIO));

    const topRow = hudH * ROW_TOP_RATIO;
    const bottomRow = hudH * ROW_BOTTOM_RATIO;

    this.livesLabel.setFontSize(valueSize).setPosition(pad, topRow);
    this.goldLabel.setFontSize(valueSize).setPosition(rightEdge, topRow);
    this.waveLabel.setFontSize(labelSize).setPosition(pad, bottomRow);
    this.enemyLabel.setFontSize(labelSize).setPosition(rightEdge, bottomRow);
    this.energyLabel.setFontSize(labelSize).setPosition(width / 2, topRow);

    this.upgradeList
      .setFontSize(Math.max(9, Math.round(hudH * 0.17)))
      .setWordWrapWidth(width * 0.9)
      .setPosition(width / 2, hudH + 2);

    this.redrawEnergy();
    this.redrawBossBar();
  }

  /** Pull the current values out of RunState and repaint what changed. */
  refresh(run: RunState, energyMax: number, remainingEnemies: number, waveInStage: number): void {
    const energy = Math.floor(run.energy);
    if (energy !== this.lastEnergy) {
      this.lastEnergy = energy;
      this.energyLabel.setText(t('hud.energy', { n: energy, max: energyMax }));
      this.redrawEnergy();
    }

    if (run.lives !== this.lastLives) {
      this.lastLives = run.lives;
      this.livesLabel.setText(t('hud.lives', { n: run.lives }));
    }

    if (run.gold !== this.lastGold) {
      this.lastGold = run.gold;
      this.goldLabel.setText(t('hud.gold', { n: run.gold }));
    }

    if (remainingEnemies !== this.lastEnemies) {
      this.lastEnemies = remainingEnemies;
      this.enemyLabel.setText(t('hud.enemiesRemaining', { n: remainingEnemies }));
    }

    // Upgrades only change between waves, so compare the count.
    if (run.upgrades.length !== this.lastUpgradeCount) {
      this.lastUpgradeCount = run.upgrades.length;
      this.upgradeList.setText(formatUpgrades(run.upgrades));
    }

    // Key off the two numbers rather than the formatted string, so the common
    // case allocates nothing (rule 4).
    const waveKey = run.stageId * 100 + waveInStage;
    if (waveKey !== this.lastWaveKey) {
      this.lastWaveKey = waveKey;
      this.waveLabel.setText(t('hud.wave', { stage: run.stageId, wave: waveInStage }));
    }
  }

  setBossRatio(ratio: number): void {
    this.bossRatio = ratio;
    this.redrawBossBar();
  }

  /** Force the next refresh to repaint everything, e.g. after a restart. */
  invalidate(): void {
    this.lastEnergy = -1;
    this.lastLives = -1;
    this.lastGold = -1;
    this.lastEnemies = -1;
    this.lastWaveKey = -1;
    this.lastUpgradeCount = -1;
  }

  private redrawEnergy(): void {
    if (!this.metrics) return;
    const { width, hudH } = this.metrics;
    const barWidth = width * GAUGE_WIDTH_RATIO;
    const height = Math.max(6, hudH * GAUGE_HEIGHT_RATIO);
    const x = (width - barWidth) / 2;
    const y = hudH * GAUGE_Y_RATIO;
    const ratio = this.lastEnergy < 0 ? 0 : Math.min(1, this.lastEnergy / this.energyMax);

    this.energyGauge.clear();
    this.energyGauge.fillStyle(Palette.energyBack, 1);
    this.energyGauge.fillRoundedRect(x, y, barWidth, height, height / 2);
    if (ratio > 0) {
      this.energyGauge.fillStyle(Palette.energyFill, 1);
      this.energyGauge.fillRoundedRect(x, y, Math.max(height, barWidth * ratio), height, height / 2);
    }
    this.energyGauge.lineStyle(1, Palette.gaugeStroke, 1);
    this.energyGauge.strokeRoundedRect(x, y, barWidth, height, height / 2);
  }

  private energyMax = 1;

  setEnergyMax(max: number): void {
    this.energyMax = max;
  }

  /** The boss gets its own bar across the top of the screen (spec 5). */
  private redrawBossBar(): void {
    this.bossBar.clear();
    if (!this.metrics || this.bossRatio < 0) {
      this.bossBar.setVisible(false);
      return;
    }

    const { width, hudH } = this.metrics;
    const barWidth = width * BOSS_BAR_WIDTH_RATIO;
    const height = Math.max(5, hudH * BOSS_BAR_HEIGHT_RATIO);
    const x = (width - barWidth) / 2;
    const y = hudH - height - 1;

    this.bossBar.setVisible(true);
    this.bossBar.fillStyle(Palette.hpBarBack, 0.9);
    this.bossBar.fillRect(x, y, barWidth, height);
    this.bossBar.fillStyle(EnemyPalette.boss, 1);
    this.bossBar.fillRect(x, y, barWidth * this.bossRatio, height);
    this.bossBar.lineStyle(1, Palette.boardEdge, 1);
    this.bossBar.strokeRect(x, y, barWidth, height);
  }
}
