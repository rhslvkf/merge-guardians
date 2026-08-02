/**
 * Portal abstraction (rule 3).
 *
 * No file outside this folder may reference `PokiSDK` or `window.CrazyGames`.
 * The concrete adapter is chosen at runtime from `document.referrer` and
 * `location.hostname`.
 */

export interface PortalAdapter {
  init(): Promise<void>;
  loadingStart(): void;
  loadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(): Promise<void>;
  /** Resolves true when the reward should be granted. */
  rewardedBreak(): Promise<boolean>;
  save(data: string): Promise<void>;
  load(): Promise<string | null>;
  happytime(): void;
}

export type PortalKind = 'local' | 'poki' | 'crazygames';

/**
 * Enforces the Poki call-order rules for every adapter:
 *  - `gameplayStart` and `gameplayStop` must alternate, never repeat.
 *  - no SDK event may fire while an ad is on screen.
 *
 * Adapters extend this and implement the `do*` hooks; the guards live here so
 * all three behave identically.
 *
 * Stub — implemented in Phase 8.
 */
export abstract class BasePortalAdapter implements PortalAdapter {
  protected gameplayActive = false;
  protected adInProgress = false;

  abstract init(): Promise<void>;
  abstract loadingStart(): void;
  abstract loadingFinished(): void;
  abstract save(data: string): Promise<void>;
  abstract load(): Promise<string | null>;
  abstract happytime(): void;

  protected abstract doGameplayStart(): void;
  protected abstract doGameplayStop(): void;
  protected abstract doCommercialBreak(): Promise<void>;
  protected abstract doRewardedBreak(): Promise<boolean>;

  /**
   * Poki rejects a game that fires either event twice in a row, so the
   * alternation is enforced here once rather than in each adapter.
   *
   * The ad-in-progress suppression is wired in Phase 8, when there is a real ad
   * to be in the middle of.
   */
  gameplayStart(): void {
    if (this.adInProgress || this.gameplayActive) return;
    this.gameplayActive = true;
    this.doGameplayStart();
  }

  gameplayStop(): void {
    if (this.adInProgress || !this.gameplayActive) return;
    this.gameplayActive = false;
    this.doGameplayStop();
  }

  async commercialBreak(): Promise<void> {
    // TODO(phase-8): only valid when resuming gameplay from pause — never when
    // leaving to the level-select screen.
  }

  async rewardedBreak(): Promise<boolean> {
    // TODO(phase-8)
    return false;
  }
}

/** Detect the host portal from referrer/hostname. */
export function detectPortal(): PortalKind {
  // TODO(phase-8)
  return 'local';
}
