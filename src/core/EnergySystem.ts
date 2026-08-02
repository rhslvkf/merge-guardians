/**
 * Energy regeneration and summon pricing.
 *
 * Rules (spec section 6): start 12, cap 30, +1.2/s (plus `energyRegen`
 * upgrades), +1 per kill. Cost = 3 + step * summonsThisWave, and the wave
 * counter resets at every wave start.
 *
 * Stub — implemented in Phase 3.
 */

export class EnergySystem {
  /** Current cost of the next summon. */
  summonCost(): number {
    // TODO(phase-3)
    return 0;
  }

  /** Why summoning is unavailable, or null when it is available. */
  summonBlockedReasonKey(): string | null {
    // TODO(phase-3): 'summon.blocked.energy' | 'summon.blocked.boardFull'
    return null;
  }

  update(_dt: number): void {
    // TODO(phase-3)
  }
}
