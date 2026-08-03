import Phaser from 'phaser';

import { MUSIC, SOUNDS } from '../config/assets';
import { DEBUG } from '../config/constants';
import { exists } from './assetProbe';

/**
 * Music and SFX, plus the mute/restore pair every ad break needs.
 *
 * Two things this has to get right:
 *
 *  - **Autoplay policy.** Browsers start the Web Audio context suspended and
 *    only resume it inside a real user gesture. `unlockOnFirstInput` wires that
 *    up once; until then every play call is a no-op rather than an error.
 *  - **Missing files.** The audio pack is hand-supplied, so any key that failed
 *    to load is skipped. A checkout with no audio is silent, not broken.
 *
 * Ad contract (spec 10): before an ad, pause the game, mute audio and stop
 * timers; after it, restore exactly what was suspended.
 */

const SFX_VOLUME = 0.55;
const MUSIC_VOLUME = 0.3;

export class AudioService {
  private scene?: Phaser.Scene;
  private music?: Phaser.Sound.BaseSound;

  private sfxEnabled = true;
  private musicEnabled = true;
  private unlocked = false;

  /** State captured by `suspendForAd`, so resume restores rather than guesses. */
  private preAdSfx = true;
  private preAdMusic = true;

  private available = new Set<string>();
  private present = new Set<string>();

  /**
   * Check which clips exist before the loader runs.
   *
   * Queuing a missing clip is worse than skipping it: the loader receives the
   * host's fallback page, hands it to `decodeAudioData`, and the rejection
   * surfaces as an uncaught error. See `assetProbe`.
   */
  async probe(): Promise<void> {
    this.present.clear();
    const specs = [...Object.values(SOUNDS), MUSIC];
    await Promise.all(
      specs.map(async (spec) => {
        if (await exists(spec.path, 'audio/')) this.present.add(spec.key);
      })
    );
  }

  /** Queue the clips that `probe` found. */
  preload(scene: Phaser.Scene): void {
    for (const spec of [...Object.values(SOUNDS), MUSIC]) {
      if (this.present.has(spec.key)) scene.load.audio(spec.key, spec.path);
    }
  }

  /** Called once after the loader finishes: records which clips arrived. */
  markLoaded(scene: Phaser.Scene): void {
    this.available.clear();
    for (const spec of Object.values(SOUNDS)) {
      if (scene.cache.audio.exists(spec.key)) this.available.add(spec.key);
    }
    if (scene.cache.audio.exists(MUSIC.key)) this.available.add(MUSIC.key);

    if (DEBUG) {
      console.log(
        `[audio] ${this.available.size}/${Object.keys(SOUNDS).length + 1} clips loaded` +
          (this.available.size === 0 ? ' — running silent' : '')
      );
    }
  }

  /**
   * Point playback at a live scene and arm the unlock gesture.
   *
   * Called by every scene that makes noise: the sound manager is global, but
   * the input events that can legally resume the audio context are per-scene.
   */
  attach(scene: Phaser.Scene): void {
    this.scene = scene;
    this.unlockOnFirstInput(scene);
  }

  /**
   * Resume the audio context on the player's first gesture.
   *
   * Registered on the scene's input rather than the document so it works the
   * same inside a portal iframe.
   */
  private unlockOnFirstInput(scene: Phaser.Scene): void {
    if (this.unlocked) return;
    const unlock = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      const sound = scene.sound as Phaser.Sound.WebAudioSoundManager;
      if (sound.context && sound.context.state === 'suspended') {
        void sound.context.resume();
      }
      if (DEBUG) console.log('[audio] context unlocked on first input');
      this.startMusic();
    };
    scene.input.once(Phaser.Input.Events.POINTER_DOWN, unlock);
    scene.input.keyboard?.once('keydown', unlock);
  }

  // --- playback ----------------------------------------------------------

  play(name: keyof typeof SOUNDS): void {
    if (!this.sfxEnabled || !this.unlocked || !this.scene) return;
    const spec = SOUNDS[name];
    if (!spec || !this.available.has(spec.key)) return;
    this.scene.sound.play(spec.key, { volume: SFX_VOLUME });
  }

  private startMusic(): void {
    if (!this.scene || !this.musicEnabled) return;
    if (!this.available.has(MUSIC.key)) return;
    if (this.music?.isPlaying) return;
    this.music = this.scene.sound.add(MUSIC.key, { loop: true, volume: MUSIC_VOLUME });
    this.music.play();
  }

  // --- settings ----------------------------------------------------------

  setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) this.music?.stop();
    else if (this.unlocked) this.startMusic();
  }

  get isSfxEnabled(): boolean {
    return this.sfxEnabled;
  }

  get isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  // --- ads ---------------------------------------------------------------

  /** Mute for an ad break, remembering the pre-ad state. */
  suspendForAd(): void {
    this.preAdSfx = this.sfxEnabled;
    this.preAdMusic = this.musicEnabled;
    this.setSfxEnabled(false);
    this.setMusicEnabled(false);
  }

  /** Restore the state captured by `suspendForAd`. */
  resumeAfterAd(): void {
    this.setSfxEnabled(this.preAdSfx);
    this.setMusicEnabled(this.preAdMusic);
  }
}
