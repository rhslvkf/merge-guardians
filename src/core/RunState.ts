import balance from '../config/balance.json';
import { ALLY_TOP_ROW_DEFAULT } from '../config/constants';
import wavesConfig from '../config/waves.json';

/**
 * The single source of truth for the current run (rule 6).
 *
 * Created once in BootScene and kept in the registry, so it survives the scene
 * changes that game over, retry and stage clear go through. Scenes read it;
 * none of them keep a copy.
 *
 * Phase 4 fills in the upgrade fields; Phase 7 seeds the permanent upgrades
 * from SaveService.
 */

const WAVES_PER_STAGE: number = wavesConfig.wavesPerStage;

export class RunState {
  lives = 0;
  energy = 0;
  gold = 0;
  /** Cumulative across stages: stage 3, wave 3 is waveIndex 12. */
  waveIndex = 0;
  stageId = 1;
  summonsThisWave = 0;
  revivesUsed = 0;

  /** Gold total when the current stage began, so the result screen can diff. */
  stageStartGold = 0;

  /** Topmost row the player may occupy. `boardExpand` lowers this to 3. */
  allyTopRow: number = ALLY_TOP_ROW_DEFAULT;

  /** Seconds between shots. `atkSpeed` upgrades shrink this (Phase 4). */
  attackInterval: number = balance.units.attackInterval;

  /** Run-wide unit damage multiplier. `dpsAll` upgrades raise it (Phase 4). */
  dpsMult = 1;

  /** Energy per second. `energyRegen` upgrades raise it (Phase 4). */
  energyRegen: number = balance.energy.regenPerSecond;

  /** Added to the summon cost per summon this wave. `summonCost` lowers it. */
  summonCostStep: number = balance.energy.summonCostStep;

  /** Upgrade ids taken this run, in order. Repeats mean stacks. */
  readonly upgrades: string[] = [];

  /** `mergeHeal`: merging also heals the orthogonal neighbours. */
  mergeHeal = false;

  /**
   * Free units owed at the next wave start, from `startTier`.
   *
   * Queued rather than placed immediately because the spec grants them "at the
   * start of the next wave", and the draft happens between waves.
   */
  readonly pendingFreeUnits: { tier: number; count: number }[] = [];

  /** Highest tier a merge can produce. */
  readonly maxTier: number = balance.merge.maxTier;

  get maxLives(): number {
    return balance.run.maxLives;
  }

  get canRevive(): boolean {
    return this.revivesUsed < balance.ads.revivesPerRun;
  }

  /** First wave index of a stage — stage 1 starts at 0, stage 2 at 5. */
  static firstWaveOfStage(stageId: number): number {
    return (stageId - 1) * WAVES_PER_STAGE;
  }

  /** True once the wave just cleared was the last of its stage. */
  static isLastWaveOfStage(waveIndex: number): boolean {
    return (waveIndex + 1) % WAVES_PER_STAGE === 0;
  }

  /** A brand new run from stage 1. */
  reset(): void {
    this.gold = 0;
    this.stageId = 1;
    this.upgrades.length = 0;
    this.startStage(1);
  }

  /**
   * Begin a stage: rewind the wave index to its first wave and restore the
   * per-stage resources. Gold and unlocked progress carry over.
   */
  startStage(stageId: number): void {
    this.stageId = stageId;
    this.waveIndex = RunState.firstWaveOfStage(stageId);
    this.stageStartGold = this.gold;
    this.lives = balance.run.startLives;
    this.energy = balance.energy.start;
    this.summonsThisWave = 0;
    this.revivesUsed = 0;
    this.allyTopRow = ALLY_TOP_ROW_DEFAULT;
    this.attackInterval = balance.units.attackInterval;
    this.dpsMult = 1;
    this.energyRegen = balance.energy.regenPerSecond;
    this.summonCostStep = balance.energy.summonCostStep;
    this.upgrades.length = 0;
    this.mergeHeal = false;
    this.pendingFreeUnits.length = 0;
    // TODO(phase-7): apply permanent upgrades from SaveService here.
  }

  /** How many times an upgrade has been taken this run. */
  stacksOf(id: string): number {
    let n = 0;
    for (let i = 0; i < this.upgrades.length; i++) if (this.upgrades[i] === id) n++;
    return n;
  }

  /** Gold picked up during the stage currently in progress. */
  get goldThisStage(): number {
    return this.gold - this.stageStartGold;
  }
}
