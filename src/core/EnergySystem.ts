import balance from '../config/balance.json';
import type { Grid } from './Grid';
import type { RunState } from './RunState';

/**
 * Energy regeneration and summon pricing.
 *
 * Rules (spec section 6): start 12, cap 30, +1.2/s (plus `energyRegen`
 * upgrades), +1 per kill. Cost = 3 + step * summonsThisWave, and the wave
 * counter resets at every wave start.
 *
 * All values come from balance.json (rule 1); state lives in RunState (rule 6).
 */

const MAX_ENERGY: number = balance.energy.max;
const BASE_COST: number = balance.energy.summonBaseCost;
const ENERGY_PER_KILL: number = balance.energy.energyPerKill;
const GOLD_PER_KILL: number = balance.run.goldPerKill;

export type SummonBlockedReason = 'energy' | 'boardFull' | null;

export class EnergySystem {
  constructor(
    private readonly run: RunState,
    private readonly grid: Grid
  ) {}

  update(dt: number): void {
    if (this.run.energy >= MAX_ENERGY) return;
    this.run.energy = Math.min(MAX_ENERGY, this.run.energy + this.run.energyRegen * dt);
  }

  get max(): number {
    return MAX_ENERGY;
  }

  /** Cost of the next summon — rises with each summon made this wave. */
  get summonCost(): number {
    return BASE_COST + this.run.summonCostStep * this.run.summonsThisWave;
  }

  /** Why summoning is unavailable, or null when it is available. */
  get blockedReason(): SummonBlockedReason {
    if (this.grid.freeAllyCellCount() === 0) return 'boardFull';
    if (this.run.energy < this.summonCost) return 'energy';
    return null;
  }

  /** i18n key for the disabled tooltip, or null when the button is live. */
  get blockedReasonKey(): string | null {
    const reason = this.blockedReason;
    return reason === null ? null : `summon.blocked.${reason}`;
  }

  /**
   * Spend the cost and count the summon.
   *
   * Returns false and changes nothing when the summon is not allowed, so the
   * caller never has to re-check.
   */
  trySpendForSummon(): boolean {
    if (this.blockedReason !== null) return false;
    this.run.energy -= this.summonCost;
    this.run.summonsThisWave += 1;
    return true;
  }

  /** Kill reward from spec 5: +1 energy, +1 gold. */
  grantKillReward(): void {
    this.run.energy = Math.min(MAX_ENERGY, this.run.energy + ENERGY_PER_KILL);
    this.run.gold += GOLD_PER_KILL;
  }

  get energyPerKill(): number {
    return ENERGY_PER_KILL;
  }

  get goldPerKill(): number {
    return GOLD_PER_KILL;
  }
}
