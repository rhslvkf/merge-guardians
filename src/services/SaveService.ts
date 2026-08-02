/**
 * The only path to persistence (rule 2).
 *
 * Nothing else may touch localStorage/sessionStorage: on a portal this is
 * swapped for the portal's cloud save through `PortalAdapter.save/load`, which
 * is async and may fail.
 *
 * Stub — implemented in Phase 7.
 */

export interface SaveData {
  version: number;
  bestStage: number;
  unlockedStage: number;
  gold: number;
  meta: {
    startLife: number;
    startEnergy: number;
    dpsBoost: number;
  };
  sound: {
    music: boolean;
    sfx: boolean;
  };
}

export const SAVE_VERSION = 1;

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  bestStage: 0,
  unlockedStage: 1,
  gold: 0,
  meta: { startLife: 0, startEnergy: 0, dpsBoost: 0 },
  sound: { music: true, sfx: true },
};

export class SaveService {
  async load(): Promise<SaveData> {
    // TODO(phase-7): read through PortalAdapter.load(), migrate by version,
    // fall back to DEFAULT_SAVE on any parse error.
    return { ...DEFAULT_SAVE };
  }

  async save(_data: SaveData): Promise<void> {
    // TODO(phase-7): serialize and write through PortalAdapter.save().
  }
}
