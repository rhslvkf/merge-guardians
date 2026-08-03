import balance from '../config/balance.json';
import { ALLY_TOP_ROW_DEFAULT } from '../config/constants';
import wavesConfig from '../config/waves.json';
import type { PermaUpgrades } from '../services/SaveService';
import { bonusEnergy, bonusLives, dpsMultiplier } from './MetaProgress';

/**
 * The single source of truth for the current run (rule 6).
 *
 * Created once in BootScene and kept in the registry, so it survives the scene
 * changes that game over, retry and stage clear go through. Scenes read it;
 * none of them keep a copy.
 *
 * Phase 4 fills in the run upgrade fields. Phase 7 adds `perma`, seeded from
 * SaveService at boot and re-applied on every `startStage`, which is what makes
 * a shop purchase show up in the next run without a reload.
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

  /**
   * Permanent upgrade levels, mirrored from the save.
   *
   * Held here rather than read from SaveService on demand so the run has a
   * single source of truth (rule 6) and the simulator can drive RunState
   * without a storage layer.
   */
  perma: PermaUpgrades = { life: 0, energy: 0, dps: 0 };

  /**
   * Set while the first-run merge tutorial is on screen. Grants the larger
   * starting energy, so nothing about the economy is what stops a new player
   * reaching their first merge.
   */
  tutorialActive = false;

  get maxLives(): number {
    return balance.run.maxLives;
  }

  /** Starting lives including the permanent upgrade, capped at the heart row. */
  get startingLives(): number {
    return Math.min(this.maxLives, balance.run.startLives + bonusLives(this.perma));
  }

  /** Starting energy including the permanent upgrade and the tutorial grant. */
  get startingEnergy(): number {
    const base = this.tutorialActive ? balance.energy.tutorialStart : balance.energy.start;
    return base + bonusEnergy(this.perma);
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

  /**
   * A brand new run from stage 1.
   *
   * Gold is *not* cleared: it is the meta currency and lives in the save, so
   * `startRun` seeds it from there. Clearing it here would delete a purchase
   * budget every time the player pressed PLAY.
   */
  reset(): void {
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
    this.lives = this.startingLives;
    this.energy = this.startingEnergy;
    this.summonsThisWave = 0;
    this.revivesUsed = 0;
    this.allyTopRow = ALLY_TOP_ROW_DEFAULT;
    this.attackInterval = balance.units.attackInterval;
    this.dpsMult = dpsMultiplier(this.perma);
    this.energyRegen = balance.energy.regenPerSecond;
    this.summonCostStep = balance.energy.summonCostStep;
    this.upgrades.length = 0;
    this.mergeHeal = false;
    this.pendingFreeUnits.length = 0;
  }

  /** Copy the shop levels in. Takes effect from the next `startStage`. */
  applyPerma(levels: PermaUpgrades): void {
    this.perma = { ...levels };
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
