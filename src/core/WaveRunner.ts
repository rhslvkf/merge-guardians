/**
 * Spawn scheduling, wave-clear detection and modifier application.
 *
 * Reads waves.json for composition and balance.json for the HP curve
 * (`hp = baseHp * pow(hpGrowthPerWave, waveIndex) * typeHpMult`).
 *
 * Modifiers (spec section 7): none | blockedColumn | bomb | fog | rush.
 *
 * Stub — implemented in Phase 2 (spawning) and Phase 4 (modifiers).
 */

export type WaveModifier = 'none' | 'blockedColumn' | 'bomb' | 'fog' | 'rush';

export class WaveRunner {
  /** Begin the wave at RunState's current cumulative waveIndex. */
  startWave(): void {
    // TODO(phase-2)
  }

  /** True once every scheduled enemy has spawned and none remain alive. */
  isWaveCleared(): boolean {
    // TODO(phase-2)
    return false;
  }

  update(_dt: number): void {
    // TODO(phase-2). Rule 4: enemies come from a pool.
  }
}
