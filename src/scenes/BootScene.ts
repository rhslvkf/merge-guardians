import Phaser from 'phaser';

import { DEBUG, RegistryKey, SceneKey } from '../config/constants';
import { RunState } from '../core/RunState';
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

    const portal = new LocalAdapter();
    this.registry.set(RegistryKey.Portal, portal);
    void portal.init().then(() => {
      portal.loadingFinished();
    });

    if (DEBUG) console.log('[boot] portal adapter: local');

    // PreloadScene stays empty until Phase 6 has assets to load.
    this.scene.start(SceneKey.Menu);
  }
}
