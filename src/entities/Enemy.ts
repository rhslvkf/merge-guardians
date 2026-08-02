/**
 * An enemy marching down one column.
 *
 * Pooled (rule 4): `spawn()` and `despawn()` recycle instances rather than
 * allocating during the update loop.
 *
 * Stub — implemented in Phase 2.
 */

export type EnemyType = 'normal' | 'shielded' | 'flyer' | 'tank' | 'boss';

export class Enemy {
  type: EnemyType = 'normal';
  col = 0;
  /** Fractional row — enemies move continuously between cells. */
  row = 0;
  hp = 0;
  maxHp = 0;
  active = false;
}
