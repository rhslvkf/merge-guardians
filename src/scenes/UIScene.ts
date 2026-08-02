import Phaser from 'phaser';

import {
  EnemyPalette,
  GameEvent,
  MAX_FRAME_SECONDS,
  Palette,
  RegistryKey,
  SceneKey,
} from '../config/constants';
import { t } from '../i18n';
import type { LayoutService } from '../services/LayoutService';
import { Button } from '../ui/Button';

/**
 * HUD, summon dock, upgrade cards, pause and game-over panels.
 *
 * Runs in parallel with GameScene and never touches its objects — it reads the
 * shared LayoutService and talks back through `GameEvent` only (rules 6 and 7).
 *
 * Phase 2 scope — the debug summon button, the wave banner and the remaining
 * enemy count. Lives, energy and gold arrive with the real HUD in Phase 3.
 */

const BUTTON_WIDTH_RATIO = 0.44;
const BUTTON_MAX_WIDTH = 260;
const BUTTON_HEIGHT_RATIO = 0.5;
const BANNER_SECONDS = 1.4;
const BANNER_SIZE_RATIO = 0.055;
const BANNER_SIZE_MAX = 54;
const COUNTER_SIZE_RATIO = 0.028;
const COUNTER_SIZE_MAX = 22;
const BOSS_BAR_WIDTH_RATIO = 0.72;
const BOSS_BAR_HEIGHT_RATIO = 0.16;

export class UIScene extends Phaser.Scene {
  private layout!: LayoutService;
  private summonButton!: Button;
  private banner!: Phaser.GameObjects.Text;
  private enemyCounter!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bannerTimer = 0;
  /** Latest boss HP ratio, or -1 when no boss is alive. */
  private bossRatio = -1;

  constructor() {
    super({ key: SceneKey.UI, active: false });
  }

  create(): void {
    this.layout = this.registry.get(RegistryKey.Layout) as LayoutService;

    this.summonButton = new Button(this, {
      labelKey: 'debug.summon',
      onClick: () => this.game.events.emit(GameEvent.SummonRequested),
    });

    this.banner = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontStyle: 'bold', color: Palette.bannerText })
      .setOrigin(0.5)
      .setVisible(false);

    this.enemyCounter = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: Palette.bannerText })
      .setOrigin(0.5, 0.5)
      .setAlpha(0.85);

    this.bossBar = this.add.graphics().setVisible(false);

    const bus = this.game.events;
    bus.on(GameEvent.LayoutChanged, this.applyLayout, this);
    bus.on(GameEvent.WaveStarted, this.onWaveStarted, this);
    bus.on(GameEvent.WaveCleared, this.onWaveCleared, this);
    bus.on(GameEvent.EnemyCountChanged, this.onEnemyCountChanged, this);
    bus.on(GameEvent.BossHealthChanged, this.onBossHealthChanged, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off(GameEvent.LayoutChanged, this.applyLayout, this);
      bus.off(GameEvent.WaveStarted, this.onWaveStarted, this);
      bus.off(GameEvent.WaveCleared, this.onWaveCleared, this);
      bus.off(GameEvent.EnemyCountChanged, this.onEnemyCountChanged, this);
      bus.off(GameEvent.BossHealthChanged, this.onBossHealthChanged, this);
    });

    this.applyLayout();
  }

  private onWaveStarted(_waveIndex: number, waveInStage: number): void {
    this.showBanner(t('wave.banner', { n: waveInStage }));
  }

  private onWaveCleared(): void {
    this.showBanner(t('wave.cleared'));
  }

  private onEnemyCountChanged(remaining: number): void {
    this.enemyCounter.setText(t('hud.enemiesRemaining', { n: remaining }));
  }

  private onBossHealthChanged(ratio: number): void {
    this.bossRatio = ratio;
    this.drawBossBar();
  }

  /**
   * The boss gets its own bar across the top of the screen (spec 5), separate
   * from the small bar every enemy carries.
   */
  private drawBossBar(): void {
    this.bossBar.clear();
    if (this.bossRatio < 0) {
      this.bossBar.setVisible(false);
      return;
    }

    const { width, hudH } = this.layout.get();
    const barWidth = width * BOSS_BAR_WIDTH_RATIO;
    const height = Math.max(6, hudH * BOSS_BAR_HEIGHT_RATIO);
    const x = (width - barWidth) / 2;
    const y = hudH - height * 2;

    this.bossBar.setVisible(true);
    this.bossBar.fillStyle(Palette.hpBarBack, 0.9);
    this.bossBar.fillRect(x, y, barWidth, height);
    this.bossBar.fillStyle(EnemyPalette.boss, 1);
    this.bossBar.fillRect(x, y, barWidth * this.bossRatio, height);
    this.bossBar.lineStyle(1, Palette.boardEdge, 1);
    this.bossBar.strokeRect(x, y, barWidth, height);
  }

  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true).setAlpha(1);
    this.bannerTimer = BANNER_SECONDS;
  }

  override update(_time: number, deltaMs: number): void {
    if (this.bannerTimer <= 0) return;

    this.bannerTimer -= Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    if (this.bannerTimer <= 0) {
      this.banner.setVisible(false);
      return;
    }
    // Hold, then fade over the last third.
    const fade = Math.min(1, this.bannerTimer / (BANNER_SECONDS / 3));
    this.banner.setAlpha(fade);
  }

  /** Everything positions off LayoutService metrics — no literals (rule 5). */
  private applyLayout(): void {
    const { width, height, hudH, dockH, originY } = this.layout.get();

    const buttonWidth = Math.min(width * BUTTON_WIDTH_RATIO, BUTTON_MAX_WIDTH);
    this.summonButton.layoutAt(
      width / 2,
      height - dockH / 2,
      buttonWidth,
      dockH * BUTTON_HEIGHT_RATIO
    );

    this.banner
      .setFontSize(Math.min(BANNER_SIZE_MAX, Math.round(height * BANNER_SIZE_RATIO)))
      .setPosition(width / 2, originY + (height - dockH - originY) / 2);

    this.enemyCounter
      .setFontSize(Math.min(COUNTER_SIZE_MAX, Math.round(height * COUNTER_SIZE_RATIO)))
      .setPosition(width / 2, hudH / 2);

    this.drawBossBar();
  }
}
