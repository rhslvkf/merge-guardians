import type { Grid } from './Grid';
import type { LayoutService, WorldPoint } from '../services/LayoutService';
import type { RunState } from './RunState';

/**
 * The first-run onboarding, as a state machine.
 *
 * Deliberately not a text tutorial. A portal player who has to read a panel
 * before touching anything is a player who leaves, so the whole thing is two
 * pointing gestures: tap here, then drag this onto that. It ends itself on the
 * first successful merge and never appears again.
 *
 * Only the *decision* lives here — no Phaser, no drawing. GameScene drives it
 * (it is what sees summons and merges) and UIScene draws whatever `hint` says,
 * over the event bus, so rule 7 still holds.
 */

export type TutorialStep = 'summon' | 'merge' | 'done';

export interface TutorialHint {
  step: TutorialStep;
  /** Board position to drag from, in world pixels. Only set for `merge`. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export class TutorialSystem {
  /** How far the player has actually progressed. */
  private progress: TutorialStep = 'done';

  /**
   * What should currently be on screen — not always the same as `progress`.
   * A player in the `merge` step with only one unit on the board is shown the
   * summon hint again, because "drag this onto that" needs a *that*.
   */
  readonly hint: TutorialHint = { step: 'done', fromX: 0, fromY: 0, toX: 0, toY: 0 };

  /** Reused so the per-frame pair search allocates nothing (rule 4). */
  private readonly scratchA: WorldPoint = { x: 0, y: 0 };
  private readonly scratchB: WorldPoint = { x: 0, y: 0 };

  constructor(
    private readonly grid: Grid,
    private readonly layout: LayoutService,
    private readonly run: RunState
  ) {}

  /**
   * Arm the tutorial. `enabled` is false for anyone who has already merged
   * once, in any earlier session.
   */
  start(enabled: boolean): void {
    this.progress = enabled ? 'summon' : 'done';
    this.run.tutorialActive = enabled;
    this.hint.step = 'done';

    // Top the energy up here rather than relying on `startStage`. The stage is
    // begun by whoever pressed PLAY, before this scene exists, so by the time
    // the tutorial knows it is running the starting energy has already been
    // dealt out. `max` so it can only ever help.
    if (enabled) this.run.energy = Math.max(this.run.energy, this.run.startingEnergy);
  }

  get active(): boolean {
    return this.progress !== 'done';
  }

  /** First summon moves the player on to the merge gesture. */
  notifySummon(): void {
    if (this.progress === 'summon') this.progress = 'merge';
  }

  /** Any merge finishes the tutorial — that was the whole thing to teach. */
  notifyMerge(): void {
    if (this.progress === 'done') return;
    this.progress = 'done';
    this.run.tutorialActive = false;
    this.hint.step = 'done';
  }

  /**
   * Recompute the hint. Returns true when it changed and needs re-emitting.
   *
   * Called every frame, so it compares before it writes: the drag hint has to
   * follow the board as units are summoned, merged and dragged around, but the
   * event bus must not see one message per frame.
   */
  update(): boolean {
    if (this.progress === 'done') return this.setStep('done');
    if (this.progress === 'summon') return this.setStep('summon');

    const pair = this.findMergeablePair();
    if (!pair) return this.setStep('summon');

    const changed =
      this.hint.step !== 'merge' ||
      this.hint.fromX !== this.scratchA.x ||
      this.hint.fromY !== this.scratchA.y ||
      this.hint.toX !== this.scratchB.x ||
      this.hint.toY !== this.scratchB.y;

    this.hint.step = 'merge';
    this.hint.fromX = this.scratchA.x;
    this.hint.fromY = this.scratchA.y;
    this.hint.toX = this.scratchB.x;
    this.hint.toY = this.scratchB.y;
    return changed;
  }

  private setStep(step: TutorialStep): boolean {
    if (this.hint.step === step) return false;
    this.hint.step = step;
    return true;
  }

  /**
   * The first two units on the board sharing a tier, written into the scratch
   * points as world positions.
   *
   * First-found rather than nearest: on wave 1 there are at most a handful of
   * units, and a stable choice matters more than an optimal one — a hint that
   * jumps between pairs as the board changes is harder to follow than one that
   * points at the same two units until they are merged.
   */
  private findMergeablePair(): boolean {
    const count = this.grid.cellCount;

    for (let i = 0; i < count; i++) {
      const a = this.grid.unitAtIndex(i);
      if (!a || a.tier >= this.run.maxTier) continue;

      for (let j = i + 1; j < count; j++) {
        const b = this.grid.unitAtIndex(j);
        if (!b || b.tier !== a.tier) continue;

        this.layout.gridToWorld(a.col, a.row, this.scratchA);
        this.layout.gridToWorld(b.col, b.row, this.scratchB);
        return true;
      }
    }
    return false;
  }
}
