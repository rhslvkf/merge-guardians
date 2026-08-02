/**
 * Firing, projectile travel, melee contact and damage.
 *
 * Rules (spec sections 4 and 5):
 *  - A unit shoots the nearest enemy in its own column (largest row first).
 *  - Damage per shot = dps * attackInterval; projectile speed = cell * 9 /s.
 *  - `shielded` enemies take 0 damage from tier <= 3 projectiles.
 *  - An enemy that reaches an occupied cell stops and deals `meleeDps` per
 *    second until the unit dies, then resumes; `flyer` ignores units entirely.
 *
 * Stub — implemented in Phase 2.
 */

export class CombatSystem {
  /** Advance firing timers, projectiles and melee contacts by `dt` seconds. */
  update(_dt: number): void {
    // TODO(phase-2). Rule 4: projectiles come from a pool, no allocation here.
  }
}
