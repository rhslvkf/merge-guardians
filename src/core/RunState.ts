/**
 * The single source of truth for the current run (rule 6).
 *
 * Lives, energy, gold, cumulative wave index, picked upgrades and the derived
 * modifiers they produce all live here. Scenes read this object — they never
 * keep their own copy of any of it.
 *
 * Stub — filled in across Phases 1-4.
 */

export interface RunUpgradeState {
  attackInterval: number;
  dpsMult: number;
  summonCostStep: number;
  energyRegen: number;
  allyTopRow: number;
  mergeHeal: boolean;
  picked: string[];
}

export class RunState {
  lives = 0;
  energy = 0;
  gold = 0;
  /** Cumulative across stages: stage 3, wave 3 is waveIndex 12. */
  waveIndex = 0;
  stageId = 1;
  summonsThisWave = 0;
  revivesUsed = 0;

  /** Reset for a new run, seeded by permanent upgrades from SaveService. */
  reset(): void {
    // TODO(phase-3)
  }
}
