import balance from '../config/balance.json';
import { ALLY_TOP_ROW_EXPANDED, DEBUG } from '../config/constants';
import upgradesConfig from '../config/upgrades.json';
import type { Grid } from './Grid';
import type { RunState } from './RunState';

/**
 * The post-wave 3-card draft (spec 8).
 *
 * Two jobs, both renderer-free so they stay testable:
 *  - build the candidate list, excluding anything capped or whose condition is
 *    unmet, then draw N distinct cards;
 *  - apply the chosen effect to RunState.
 *
 * Effects that need to put a unit on the board (`instantT4`, `startTier`) are
 * reported back to the caller instead of being applied here, because this class
 * does not own the scene.
 */

interface UpgradeEffect {
  type: string;
  value?: number;
  floor?: number;
  cap?: number;
  tier?: number;
  count?: number;
}

interface UpgradeDef {
  id: string;
  nameKey: string;
  descKey: string;
  stackable: boolean;
  maxStacks: number | null;
  condition: string;
  effect: UpgradeEffect;
}

export interface UpgradeCard {
  id: string;
  nameKey: string;
  descKey: string;
  /** Times already taken this run, shown on the card. */
  stacks: number;
}

/** A unit the caller must place once the pick is applied. */
export interface UpgradeSpawn {
  tier: number;
  count: number;
  /** true = place now, false = queue for the next wave start. */
  immediate: boolean;
}

const POOL = upgradesConfig.pool as UpgradeDef[];
const CARDS_OFFERED: number = upgradesConfig.cardsOffered;
const ATTACK_INTERVAL_FLOOR: number = balance.units.attackIntervalFloor;
const SUMMON_STEP_FLOOR: number = balance.energy.summonCostStepFloor;

export class UpgradeSystem {
  /** Reused across draws so offering cards allocates nothing extra. */
  private readonly candidates: UpgradeDef[] = [];
  private readonly offer: UpgradeCard[] = [];

  constructor(
    private readonly run: RunState,
    private readonly grid: Grid
  ) {}

  /**
   * Draw up to `cardsOffered` distinct cards.
   *
   * The returned array is reused between draws — read it before drawing again.
   */
  draw(): UpgradeCard[] {
    this.candidates.length = 0;
    for (const def of POOL) {
      if (this.isEligible(def)) this.candidates.push(def);
    }

    // Partial Fisher-Yates over the candidate list gives distinct picks without
    // rejection sampling.
    for (let i = this.candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.candidates[i];
      this.candidates[i] = this.candidates[j];
      this.candidates[j] = tmp;
    }

    this.offer.length = 0;
    const take = Math.min(CARDS_OFFERED, this.candidates.length);
    for (let i = 0; i < take; i++) {
      const def = this.candidates[i];
      this.offer.push({
        id: def.id,
        nameKey: def.nameKey,
        descKey: def.descKey,
        stacks: this.run.stacksOf(def.id),
      });
    }

    if (DEBUG && this.offer.length < CARDS_OFFERED) {
      console.log('[upgrades] only', this.offer.length, 'cards eligible');
    }
    return this.offer;
  }

  /** Spec 8: capped or condition-failing cards never reach the draw. */
  private isEligible(def: UpgradeDef): boolean {
    const stacks = this.run.stacksOf(def.id);
    if (def.maxStacks !== null && stacks >= def.maxStacks) return false;

    switch (def.condition) {
      case 'attackIntervalAboveFloor':
        return this.run.attackInterval > ATTACK_INTERVAL_FLOOR + 1e-6;
      case 'livesBelowMax':
        return this.run.lives < this.run.maxLives;
      case 'summonCostStepAboveFloor':
        return this.run.summonCostStep > SUMMON_STEP_FLOOR;
      case 'boardNotExpanded':
        return this.run.allyTopRow > ALLY_TOP_ROW_EXPANDED;
      case 'hasFreeAllyCell':
        return this.grid.freeAllyCellCount() > 0;
      case 'always':
        return true;
      default:
        if (DEBUG) console.warn('[upgrades] unknown condition', def.condition);
        return false;
    }
  }

  /**
   * Apply the pick to RunState.
   *
   * Returns a spawn request when the effect places units, which the caller
   * fulfils; everything else is a pure state change.
   */
  apply(id: string): UpgradeSpawn | null {
    const def = POOL.find((entry) => entry.id === id);
    if (!def) {
      if (DEBUG) console.warn('[upgrades] unknown id', id);
      return null;
    }

    this.run.upgrades.push(id);
    const effect = def.effect;

    switch (effect.type) {
      case 'attackIntervalMult':
        this.run.attackInterval = Math.max(
          effect.floor ?? ATTACK_INTERVAL_FLOOR,
          this.run.attackInterval * (effect.value ?? 1)
        );
        return null;

      case 'dpsMultAdd':
        this.run.dpsMult += effect.value ?? 0;
        return null;

      case 'summonCostStepAdd':
        this.run.summonCostStep = Math.max(
          effect.floor ?? SUMMON_STEP_FLOOR,
          this.run.summonCostStep + (effect.value ?? 0)
        );
        return null;

      case 'energyRegenAdd':
        this.run.energyRegen += effect.value ?? 0;
        return null;

      case 'lifeAdd':
        this.run.lives = Math.min(
          effect.cap ?? this.run.maxLives,
          this.run.lives + (effect.value ?? 0)
        );
        return null;

      case 'allyTopRow':
        this.run.allyTopRow = effect.value ?? ALLY_TOP_ROW_EXPANDED;
        return null;

      case 'mergeHealNeighbours':
        this.run.mergeHeal = true;
        return null;

      case 'instantSpawn':
        return { tier: effect.tier ?? 1, count: effect.count ?? 1, immediate: true };

      case 'waveStartSpawn':
        this.run.pendingFreeUnits.push({
          tier: effect.tier ?? 1,
          count: effect.count ?? 1,
        });
        return { tier: effect.tier ?? 1, count: effect.count ?? 1, immediate: false };

      default:
        if (DEBUG) console.warn('[upgrades] unhandled effect', effect.type);
        return null;
    }
  }
}

/** Fraction of max HP `mergeHeal` restores to each orthogonal neighbour. */
export const MERGE_HEAL_FRACTION: number =
  (POOL.find((d) => d.id === 'mergeHeal')?.effect.value as number) ?? 0;
