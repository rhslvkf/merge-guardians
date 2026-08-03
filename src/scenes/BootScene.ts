import Phaser from 'phaser';

import { DEBUG, RegistryKey, SceneKey } from '../config/constants';
import { RunState } from '../core/RunState';
import { ArtService } from '../services/ArtService';
import { AudioService } from '../services/AudioService';
import { LayoutService } from '../services/LayoutService';
import { SaveService } from '../services/SaveService';
import { LocalAdapter } from '../services/portal/LocalAdapter';

/**
 * First scene. Builds the objects that must outlive any single scene and puts
 * them in the registry: the layout, the run state (rule 6) and the portal
 * adapter (rule 3).
 *
 * Phase 8 replaces the hardcoded LocalAdapter with `detectPortal()` and awaits
 * `init()` before continuing; nothing else has to change, because every caller
 * already goes through the PortalAdapter interface.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.registry.set(RegistryKey.Layout, new LayoutService());

    const run = new RunState();
    this.registry.set(RegistryKey.RunState, run);

    // LocalBackend by default; Phase 8 swaps in PortalBackend(adapter) here and
    // nothing else changes.
    const save = new SaveService();
    this.registry.set(RegistryKey.Save, save);

    // Created here rather than in PreloadScene: entities resolve their art
    // through the registry on construction, so the service has to exist before
    // any scene that builds one.
    const art = new ArtService();
    const audio = new AudioService();
    this.registry.set(RegistryKey.Art, art);
    this.registry.set(RegistryKey.Audio, audio);

    const portal = new LocalAdapter();
    this.registry.set(RegistryKey.Portal, portal);
    portal.loadingStart();

    if (DEBUG) console.log('[boot] portal adapter: local');

    // The probes and the save read all run alongside portal init, so the
    // optional packs cost one round trip rather than a serialised wait.
    // PreloadScene then queues only the files that are there.
    void Promise.all([portal.init(), art.probe(), audio.probe(), save.init()]).then(() => {
      // Everything downstream reads the save through these two, so seed them
      // before any scene that might look: the shop levels the next run starts
      // with, and the sound settings the first note obeys.
      run.applyPerma(save.get('permaUpgrades'));
      run.gold = save.get('gold');
      const settings = save.get('settings');
      audio.setSfxEnabled(settings.sfx);
      audio.setMusicEnabled(settings.bgm);

      this.scene.start(SceneKey.Preload);
    });
  }
}
