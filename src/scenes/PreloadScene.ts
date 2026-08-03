import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { DEBUG, Palette, RegistryKey, SceneKey } from '../config/constants';
import { t } from '../i18n';
import type { ArtService } from '../services/ArtService';
import type { AudioService } from '../services/AudioService';
import type { PortalAdapter } from '../services/portal/PortalAdapter';

/**
 * Loads the sprite sheets and audio, shows a loading bar, and hands over to the
 * menu.
 *
 * Every file here is optional. The art and audio packs are CC0 downloads that a
 * fresh checkout does not contain, so a load failure is logged and swallowed:
 * ArtService then reports "not ready" and the entities keep their drawn shapes,
 * and AudioService runs silent. A missing pack must never stop the game booting.
 */

const BAR_WIDTH_RATIO = 0.6;
const BAR_HEIGHT = 10;

export class PreloadScene extends Phaser.Scene {
  private failed: string[] = [];

  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    this.buildLoadingBar();

    const art = this.registry.get(RegistryKey.Art) as ArtService;
    const audio = this.registry.get(RegistryKey.Audio) as AudioService;
    art.preload(this);
    audio.preload(this);

    // Phaser aborts nothing on a 404; it just fires this and moves on.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failed.push(file.key);
    });
  }

  create(): void {
    const art = this.registry.get(RegistryKey.Art) as ArtService;
    const audio = this.registry.get(RegistryKey.Audio) as AudioService;
    const portal = this.registry.get(RegistryKey.Portal) as PortalAdapter | undefined;

    art.markLoaded(this);
    audio.markLoaded(this);

    if (DEBUG && this.failed.length > 0) {
      console.log(`[preload] ${this.failed.length} asset(s) absent: ${this.failed.join(', ')}`);
    }

    portal?.loadingFinished();
    this.scene.start(SceneKey.Menu);
  }

  /** Bar plus percentage. Both are torn down with the scene. */
  private buildLoadingBar(): void {
    const { width, height } = this.scale.gameSize;
    const barWidth = width * BAR_WIDTH_RATIO;
    const x = (width - barWidth) / 2;
    const y = height / 2;

    const label = this.add
      .text(width / 2, y - 28, t('preload.loading'), {
        fontFamily: FONT_STACK,
        color: Palette.hudLabel,
      })
      .setOrigin(0.5);

    const back = this.add.graphics();
    back.fillStyle(Palette.energyBack, 1);
    back.fillRect(x, y, barWidth, BAR_HEIGHT);

    const fill = this.add.graphics();
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      fill.clear();
      fill.fillStyle(Palette.energyFill, 1);
      fill.fillRect(x, y, barWidth * value, BAR_HEIGHT);
      label.setText(t('preload.progress', { percent: Math.round(value * 100) }));
    });
  }
}
