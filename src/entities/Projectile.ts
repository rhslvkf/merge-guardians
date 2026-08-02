/**
 * A shot travelling up a column toward its target enemy.
 *
 * Pooled (rule 4). Speed is `cell * projectileSpeedCells` per second, so it
 * rescales with the board on every resize.
 *
 * Stub — implemented in Phase 2.
 */

export class Projectile {
  col = 0;
  row = 0;
  damage = 0;
  /** Tier of the firing unit — `shielded` enemies ignore tier <= 3 shots. */
  sourceTier = 1;
  active = false;
}
