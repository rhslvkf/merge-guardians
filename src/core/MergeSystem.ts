/**
 * Drag handling and merge resolution.
 *
 * Rules (spec section 4):
 *  - Two units of the same tier merge into one unit of the next tier.
 *  - The merged unit spawns at full HP, which makes merging a heal.
 *  - Merging the bombed cell's unit defuses a `bomb` modifier tile.
 *  - With `mergeHeal`, orthogonal neighbours recover 30% of max HP.
 *
 * Stub — implemented in Phase 1 (merge) and Phase 4 (bomb/mergeHeal).
 */

export class MergeSystem {
  /** Can `sourceTier` merge into `targetTier`? */
  canMerge(_sourceTier: number, _targetTier: number): boolean {
    // TODO(phase-1): same tier, below maxTier, both are ally units.
    return false;
  }

  /** Resolve a completed drag from one cell onto another. */
  resolveDrop(): void {
    // TODO(phase-1)
  }
}
