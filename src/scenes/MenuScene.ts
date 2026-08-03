import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { Palette, RegistryKey, SceneKey } from '../config/constants';
import { buy, type PermaId } from '../core/MetaProgress';
import type { RunState } from '../core/RunState';
import { t } from '../i18n';
import type { AudioService } from '../services/AudioService';
import { LayoutService } from '../services/LayoutService';
import type { SaveService } from '../services/SaveService';
import { Backdrop } from '../ui/Backdrop';
import { Button } from '../ui/Button';
import { ShopPanel } from '../ui/ShopPanel';
import { StageSelect } from '../ui/StageSelect';

/**
 * Title, stage select, permanent-upgrade shop and the sound toggles.
 *
 * The save is the authority for everything shown here — gold, unlocked stages,
 * shop levels — and every purchase writes through `SaveService` immediately, so
 * the screen can never disagree with what the next run will start with.
 *
 * Poki note: entering this scene is *not* gameplay. `gameplayStart()` fires on
 * the player's first input inside GameScene, never here.
 */
export class MenuScene extends Phaser.Scene {
  private layout!: LayoutService;
  private save!: SaveService;
  private audio!: AudioService;

  private title!: Phaser.GameObjects.Text;
  private goldLine!: Phaser.GameObjects.Text;
  private stagesLabel!: Phaser.GameObjects.Text;
  private playButton!: Button;
  private shopButton!: Button;
  private sfxButton!: Button;
  private bgmButton!: Button;
  private stages!: StageSelect;
  private shop!: ShopPanel;

  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    this.layout = this.registry.get(RegistryKey.Layout) as LayoutService;
    this.save = this.registry.get(RegistryKey.Save) as SaveService;
    this.audio = this.registry.get(RegistryKey.Audio) as AudioService;

    // The title screen is where the player's first gesture usually lands, so
    // this is where the audio context gets unlocked.
    this.audio.attach(this);
    new Backdrop(this);

    this.title = this.add
      .text(0, 0, t('game.title'), {
        fontFamily: FONT_STACK,
        fontStyle: 'bold',
        color: Palette.bannerText,
      })
      .setOrigin(0.5);

    this.goldLine = this.add
      .text(0, 0, '', { fontFamily: FONT_STACK, fontStyle: 'bold', color: Palette.goldText })
      .setOrigin(1, 0.5);

    this.stagesLabel = this.add
      .text(0, 0, t('menu.stages'), { fontFamily: FONT_STACK, color: Palette.hudLabel })
      .setOrigin(0.5);

    this.playButton = new Button(this, {
      labelKey: 'menu.play',
      onClick: () => this.startRun(this.save.get('unlockedStage')),
    });
    this.shopButton = new Button(this, {
      labelKey: 'menu.shop',
      onClick: () => this.openShop(),
      fill: Palette.buttonFillMuted,
    });

    this.sfxButton = new Button(this, {
      labelKey: 'settings.sfx',
      onClick: () => this.toggleSound('sfx'),
      fill: Palette.buttonFillMuted,
    });
    this.bgmButton = new Button(this, {
      labelKey: 'settings.bgm',
      onClick: () => this.toggleSound('bgm'),
      fill: Palette.buttonFillMuted,
    });

    this.stages = new StageSelect(this, { onPick: (stageId) => this.startRun(stageId) });
    this.shop = new ShopPanel(this, {
      onBuy: (id) => this.onBuy(id),
      onClose: () => this.closeShop(),
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    });

    this.refresh();
    this.applyLayout();
  }

  // --- actions -----------------------------------------------------------

  /**
   * Start at `stageId`, seeding the run from the save.
   *
   * `reset()` deliberately does not clear gold — it is the meta currency and
   * lives in the save — so it is copied in here, along with the shop levels
   * that `startStage` turns into starting lives, energy and damage.
   */
  private startRun(stageId: number): void {
    const run = this.registry.get(RegistryKey.RunState) as RunState;
    run.applyPerma(this.save.get('permaUpgrades'));
    run.gold = this.save.get('gold');
    run.reset();
    if (stageId > 1) run.startStage(stageId);
    this.scene.start(SceneKey.Game);
  }

  private openShop(): void {
    this.shop.show(this.save.get('gold'), this.save.get('permaUpgrades'), this.layout.get());
    this.setMenuVisible(false);
  }

  private closeShop(): void {
    this.shop.hide();
    this.setMenuVisible(true);
    this.refresh();
  }

  private onBuy(id: PermaId): void {
    // MetaProgress writes gold and levels straight through SaveService, so the
    // panel refresh below reads the authoritative numbers, not a local copy.
    if (buy(this.save, id) !== 'bought') return;
    void this.save.flush();
    this.shop.update(this.save.get('gold'), this.save.get('permaUpgrades'), this.layout.get());
    this.refresh();
  }

  private toggleSound(channel: 'sfx' | 'bgm'): void {
    const settings = this.save.get('settings');
    const next = !settings[channel];
    this.save.patch('settings', { [channel]: next });

    if (channel === 'sfx') this.audio.setSfxEnabled(next);
    else this.audio.setMusicEnabled(next);
    this.refresh();
  }

  // --- state -> screen ---------------------------------------------------

  /** Repaint everything that depends on the save. */
  private refresh(): void {
    const unlocked = this.save.get('unlockedStage');
    const settings = this.save.get('settings');

    this.goldLine.setText(t('menu.gold', { n: this.save.get('gold') }));
    this.playButton.setLabel(t('menu.play', { n: unlocked }));
    this.stages.setProgress(unlocked, this.save.get('bestStage'));

    this.sfxButton.setLabel(t(settings.sfx ? 'settings.sfx' : 'settings.sfxOff'));
    this.bgmButton.setLabel(t(settings.bgm ? 'settings.bgm' : 'settings.bgmOff'));
  }

  private setMenuVisible(visible: boolean): void {
    this.title.setVisible(visible);
    this.goldLine.setVisible(visible);
    this.stagesLabel.setVisible(visible);
    this.playButton.setShown(visible);
    this.shopButton.setShown(visible);
    this.sfxButton.setShown(visible);
    this.bgmButton.setShown(visible);
    this.stages.setVisible(visible);
  }

  // --- layout ------------------------------------------------------------

  private applyLayout(): void {
    const { width, height } = this.scale.gameSize;
    // This scene runs without GameScene, so it drives the resize itself.
    const metrics = this.layout.resize(width, height);
    const margin = Math.max(16, width * 0.05);

    const toggleSize = Math.max(40, Math.min(56, height * 0.05));
    this.sfxButton.layoutAt(margin + toggleSize / 2, margin + toggleSize / 2, toggleSize * 1.6, toggleSize);
    this.bgmButton.layoutAt(
      margin + toggleSize * 2.4,
      margin + toggleSize / 2,
      toggleSize * 1.6,
      toggleSize
    );
    this.goldLine
      .setFontSize(Math.max(14, Math.round(height * 0.024)))
      .setPosition(width - margin, margin + toggleSize / 2);

    this.title
      .setFontSize(Math.min(46, Math.round(height * 0.055)))
      .setPosition(width / 2, height * 0.19);

    const buttonWidth = Math.min(width * 0.66, 320);
    const buttonHeight = Math.max(52, height * 0.072);
    this.playButton.layoutAt(width / 2, height * 0.32, buttonWidth, buttonHeight);

    this.stagesLabel
      .setFontSize(Math.max(11, Math.round(height * 0.018)))
      .setPosition(width / 2, height * 0.42);

    const gridWidth = Math.min(width - margin * 2, 400);
    const gridHeight = this.stages.layout(width / 2, height * 0.46, gridWidth);

    this.shopButton.layoutAt(
      width / 2,
      Math.min(height - buttonHeight * 0.9, height * 0.46 + gridHeight + buttonHeight),
      buttonWidth,
      buttonHeight
    );

    this.shop.layout(metrics);
  }
}
