import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { GameEvent, MAX_FRAME_SECONDS, Palette, RegistryKey, SceneKey } from '../config/constants';
import type { EnergySystem } from '../core/EnergySystem';
import type { RunState } from '../core/RunState';
import { t } from '../i18n';
import type { LayoutService } from '../services/LayoutService';
import type { UpgradeCard } from '../core/UpgradeSystem';
import type { WaveModifier } from '../core/WaveRunner';
import { Button } from '../ui/Button';
import { GameOverPanel } from '../ui/GameOverPanel';
import { Hud } from '../ui/Hud';
import { UpgradePanel } from '../ui/UpgradePanel';

/**
 * HUD, summon dock, wave/modifier banners, upgrade draft, pause and game-over.
 *
 * Runs in parallel with GameScene and never touches its objects — it reads the
 * shared LayoutService and RunState and talks back through `GameEvent` only
 * (rules 6 and 7). It is never paused, so it can still drive the resume.
 */

const BUTTON_WIDTH_RATIO = 0.44;
const BUTTON_MAX_WIDTH = 260;
const BUTTON_HEIGHT_RATIO = 0.46;
const BANNER_SECONDS = 1.4;
const BANNER_SIZE_RATIO = 0.055;
const BANNER_SIZE_MAX = 54;
const MODIFIER_BANNER_SECONDS = 1.5;

export class UIScene extends Phaser.Scene {
  private layout!: LayoutService;
  private run!: RunState;
  private energy?: EnergySystem;

  private pauseOverlay!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private summonButton!: Button;
  private summonHint!: Phaser.GameObjects.Text;
  private pauseButton!: Button;
  private banner!: Phaser.GameObjects.Text;
  private gameOverPanel!: GameOverPanel;
  private upgradePanel!: UpgradePanel;
  private modifierBanner!: Phaser.GameObjects.Text;
  private modifierTimer = 0;

  private bannerTimer = 0;
  private remainingEnemies = 0;
  private waveInStage = 1;
  private lastSummonCost = -1;
  private lastHint: string | null = '';
  private isPaused = false;

  constructor() {
    super({ key: SceneKey.UI, active: false });
  }

  create(): void {
    this.layout = this.registry.get(RegistryKey.Layout) as LayoutService;
    this.run = this.registry.get(RegistryKey.RunState) as RunState;
    this.energy = this.registry.get(RegistryKey.EnergySystem) as EnergySystem | undefined;

    // Created first: UIScene renders above GameScene, so anything here covers
    // the board, and everything added after this stays crisp on top of it.
    this.pauseOverlay = this.add.graphics().setVisible(false);

    this.hud = new Hud(this);
    if (this.energy) this.hud.setEnergyMax(this.energy.max);

    this.summonButton = new Button(this, {
      labelKey: 'summon.label',
      onClick: () => this.game.events.emit(GameEvent.SummonRequested),
    });
    this.summonHint = this.add
      .text(0, 0, '', { fontFamily: FONT_STACK, color: Palette.hudLabel })
      .setOrigin(0.5)
      .setAlpha(0.9);

    this.pauseButton = new Button(this, {
      labelKey: 'hud.pause',
      onClick: () => this.togglePause(),
      fill: Palette.buttonFillMuted,
    });

    this.banner = this.add
      .text(0, 0, '', { fontFamily: FONT_STACK, fontStyle: 'bold', color: Palette.bannerText })
      .setOrigin(0.5)
      .setVisible(false);

    this.modifierBanner = this.add
      .text(0, 0, '', {
        fontFamily: FONT_STACK,
        fontStyle: 'bold',
        color: Palette.bannerText,
        align: 'center',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.upgradePanel = new UpgradePanel(this, {
      onPick: (id) => this.onUpgradePicked(id),
      onAdBonus: () => this.game.events.emit(GameEvent.UpgradeAdBonus),
    });

    this.gameOverPanel = new GameOverPanel(this, {
      onRevive: () => this.game.events.emit(GameEvent.ReviveRequested),
      onRestart: () => this.game.events.emit(GameEvent.RestartRequested),
      onMenu: () => this.game.events.emit(GameEvent.MenuRequested),
    });

    this.bindEvents();
    this.input.keyboard?.on('keydown-ESC', this.togglePause, this);

    this.applyLayout();
  }

  private bindEvents(): void {
    const bus = this.game.events;
    bus.on(GameEvent.LayoutChanged, this.applyLayout, this);
    bus.on(GameEvent.WaveStarted, this.onWaveStarted, this);
    bus.on(GameEvent.WaveCleared, this.onWaveCleared, this);
    bus.on(GameEvent.EnemyCountChanged, this.onEnemyCountChanged, this);
    bus.on(GameEvent.BossHealthChanged, this.onBossHealthChanged, this);
    bus.on(GameEvent.GameOver, this.onGameOver, this);
    bus.on(GameEvent.Resumed, this.onResumed, this);
    bus.on(GameEvent.ModifierChanged, this.onModifierChanged, this);
    bus.on(GameEvent.UpgradeOffered, this.onUpgradeOffered, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off(GameEvent.LayoutChanged, this.applyLayout, this);
      bus.off(GameEvent.WaveStarted, this.onWaveStarted, this);
      bus.off(GameEvent.WaveCleared, this.onWaveCleared, this);
      bus.off(GameEvent.EnemyCountChanged, this.onEnemyCountChanged, this);
      bus.off(GameEvent.BossHealthChanged, this.onBossHealthChanged, this);
      bus.off(GameEvent.GameOver, this.onGameOver, this);
      bus.off(GameEvent.Resumed, this.onResumed, this);
      bus.off(GameEvent.ModifierChanged, this.onModifierChanged, this);
      bus.off(GameEvent.UpgradeOffered, this.onUpgradeOffered, this);
      this.input.keyboard?.off('keydown-ESC', this.togglePause, this);
    });
  }

  // --- events ------------------------------------------------------------

  private onWaveStarted(_waveIndex: number, waveInStage: number): void {
    this.waveInStage = waveInStage;
    this.showBanner(t('wave.banner', { n: waveInStage }));
  }

  private onWaveCleared(): void {
    this.showBanner(t('wave.cleared'));
  }

  private onEnemyCountChanged(remaining: number): void {
    this.remainingEnemies = remaining;
  }

  /** Name plus a one-line explanation, held briefly at the wave start (spec 7). */
  private onModifierChanged(modifier: WaveModifier): void {
    if (modifier === 'none') {
      this.modifierBanner.setVisible(false);
      this.modifierTimer = 0;
      return;
    }
    const name = t(`modifier.${modifier}.name`);
    this.modifierBanner.setText(`${name}\n${t(`modifier.${modifier}.desc`)}`);
    this.modifierBanner.setVisible(true).setAlpha(1);
    this.modifierTimer = MODIFIER_BANNER_SECONDS;
  }

  private onUpgradeOffered(offer: UpgradeCard[]): void {
    this.isPaused = true;
    this.upgradePanel.show(offer);
  }

  private onUpgradePicked(id: string): void {
    this.upgradePanel.hide();
    this.hud.invalidate();
    this.game.events.emit(GameEvent.UpgradePicked, id);
  }

  private onBossHealthChanged(ratio: number): void {
    this.hud.setBossRatio(ratio);
  }

  private onGameOver(): void {
    this.isPaused = true;
    this.gameOverPanel.show(this.run.goldThisStage, this.run.canRevive);
    this.gameOverPanel.layout(this.layout.get());
  }

  /** Fired after a revive or a resume, so the panel and pause state clear. */
  private onResumed(): void {
    this.isPaused = false;
    this.pauseOverlay.setVisible(false);
    this.gameOverPanel.hide();
    this.upgradePanel.hide();
    this.hud.invalidate();
  }

  private togglePause(): void {
    // The game-over and draft panels are modal: pause must not dismiss them.
    if (this.gameOverPanel.visible || this.upgradePanel.visible) return;
    this.isPaused = !this.isPaused;
    this.game.events.emit(this.isPaused ? GameEvent.PauseRequested : GameEvent.ResumeRequested);
    this.pauseOverlay.setVisible(this.isPaused);
    if (this.isPaused) this.showBanner(t('pause.title'), Number.POSITIVE_INFINITY);
    else this.hideBanner();
  }

  // --- frame -------------------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);

    this.hud.refresh(this.run, this.energy?.max ?? 0, this.remainingEnemies, this.waveInStage);
    this.refreshSummonButton();

    if (this.modifierTimer > 0) {
      this.modifierTimer -= dt;
      if (this.modifierTimer <= 0) this.modifierBanner.setVisible(false);
      else this.modifierBanner.setAlpha(Math.min(1, this.modifierTimer / 0.4));
    }

    if (this.bannerTimer > 0 && Number.isFinite(this.bannerTimer)) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner.setVisible(false);
      } else {
        // Hold, then fade over the last third.
        this.banner.setAlpha(Math.min(1, this.bannerTimer / (BANNER_SECONDS / 3)));
      }
    }
  }

  /** Cost on the face, reason underneath when it cannot be pressed (spec 6). */
  private refreshSummonButton(): void {
    if (!this.energy) return;

    // Compare the number, not the formatted string: t() allocates, and this
    // runs every frame (rule 4).
    const cost = this.energy.summonCost;
    if (cost !== this.lastSummonCost) {
      this.lastSummonCost = cost;
      this.summonButton.setLabel(t('summon.label', { cost }));
    }

    const reasonKey = this.isPaused ? null : this.energy.blockedReasonKey;
    this.summonButton.setEnabled(!this.isPaused && reasonKey === null);

    if (reasonKey !== this.lastHint) {
      this.lastHint = reasonKey;
      this.summonHint.setText(reasonKey === null ? '' : t(reasonKey));
    }
  }

  private showBanner(text: string, seconds = BANNER_SECONDS): void {
    this.banner.setText(text).setVisible(true).setAlpha(1);
    this.bannerTimer = seconds;
  }

  private hideBanner(): void {
    this.bannerTimer = 0;
    this.banner.setVisible(false);
  }

  /** Everything positions off LayoutService metrics — no literals (rule 5). */
  private applyLayout(): void {
    const metrics = this.layout.get();
    const { width, height, hudH, dockH, originY } = metrics;

    this.pauseOverlay.clear();
    this.pauseOverlay.fillStyle(Palette.panelBackdrop, 0.72);
    this.pauseOverlay.fillRect(0, 0, width, height);

    const pauseSize = Math.max(36, hudH * 0.34);
    this.pauseButton.layoutAt(width - pauseSize * 0.75, hudH * 0.3, pauseSize, pauseSize);
    this.hud.layout(metrics, pauseSize);

    const buttonWidth = Math.min(width * BUTTON_WIDTH_RATIO, BUTTON_MAX_WIDTH);
    const buttonHeight = dockH * BUTTON_HEIGHT_RATIO;
    this.summonButton.layoutAt(width / 2, height - dockH * 0.58, buttonWidth, buttonHeight);
    this.summonHint
      .setFontSize(Math.max(10, Math.round(height * 0.017)))
      .setPosition(width / 2, height - dockH * 0.16);

    this.banner
      .setFontSize(Math.min(BANNER_SIZE_MAX, Math.round(height * BANNER_SIZE_RATIO)))
      .setPosition(width / 2, originY + (height - dockH - originY) / 2);

    this.modifierBanner
      .setFontSize(Math.min(26, Math.round(height * 0.026)))
      // Descriptions are a full sentence, so they must wrap inside the board.
      .setWordWrapWidth(Math.min(width * 0.86, 420))
      .setPosition(width / 2, originY + (height - dockH - originY) / 2 + height * 0.08);

    this.gameOverPanel.layout(metrics);
    this.upgradePanel.layout(metrics);
  }
}
