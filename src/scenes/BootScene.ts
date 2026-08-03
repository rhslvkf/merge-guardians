import Phaser from 'phaser';

import { DEBUG, RegistryKey, SceneKey } from '../config/constants';
import { RunState } from '../core/RunState';
import { ArtService } from '../services/ArtService';
import { AudioService } from '../services/AudioService';
import { LayoutService } from '../services/LayoutService';
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
    this.registry.set(RegistryKey.RunState, new RunState());

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

    // The probes run alongside portal init, so the optional packs cost one
    // round trip rather than a serialised wait. PreloadScene then queues only
    // the files that are actually there, and calls loadingFinished().
    void Promise.all([portal.init(), art.probe(), audio.probe()]).then(() =>
      this.scene.start(SceneKey.Preload)
    );
  }
}
