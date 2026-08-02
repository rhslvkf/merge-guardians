import balance from '../config/balance.json';
import { ALLY_TOP_ROW_DEFAULT } from '../config/constants';

/**
 * The single source of truth for the current run (rule 6).
 *
 * Lives, energy, gold, cumulative wave index, picked upgrades and the derived
 * modifiers they produce all live here. Scenes read this object — they never
 * keep their own copy of any of it.
 *
 * Phase 1 only populates the board-shape and merge fields; the economy fields
 * arrive in Phase 3 and the upgrade fields in Phase 4.
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

  /** Topmost row the player may occupy. `boardExpand` lowers this to 3. */
  allyTopRow: number = ALLY_TOP_ROW_DEFAULT;

  /** Highest tier a merge can produce. */
  readonly maxTier: number = balance.merge.maxTier;

  /** Reset for a new run, seeded by permanent upgrades from SaveService. */
  reset(): void {
    this.lives = balance.run.startLives;
    this.energy = balance.energy.start;
    this.gold = 0;
    this.waveIndex = 0;
    this.stageId = 1;
    this.summonsThisWave = 0;
    this.revivesUsed = 0;
    this.allyTopRow = ALLY_TOP_ROW_DEFAULT;
    // TODO(phase-7): apply permanent upgrades from SaveService here.
  }
}
