import { BasePortalAdapter } from './PortalAdapter';

/**
 * Poki SDK adapter.
 *
 * Certification rules this adapter must uphold (spec section 10):
 *  - `gameplayStart()` fires on the player's first input, not on load.
 *  - `gameplayStop()` fires on pause, menu open, level end and cutscenes.
 *  - Neither event may fire twice in a row (the state machine in
 *    BasePortalAdapter enforces this).
 *  - No SDK event may fire while a midroll or rewarded video is playing.
 *  - `commercialBreak()` only on resuming gameplay from pause — never on the
 *    way out to level select.
 *
 * Poki has no cloud save API, so `save`/`load` fall back to localStorage via
 * the same key LocalAdapter uses.
 *
 * Stub — implemented in Phase 8.
 */
export class PokiAdapter extends BasePortalAdapter {
  async init(): Promise<void> {
    // TODO(phase-8): inject the SDK script, await PokiSDK.init(), and continue
    // in degraded mode if it rejects (ad blockers) rather than blocking play.
  }

  loadingStart(): void {
    // TODO(phase-8): PokiSDK.gameLoadingStart()
  }

  loadingFinished(): void {
    // TODO(phase-8): PokiSDK.gameLoadingFinished()
  }

  protected doGameplayStart(): void {
    // TODO(phase-8): PokiSDK.gameplayStart()
  }

  protected doGameplayStop(): void {
    // TODO(phase-8): PokiSDK.gameplayStop()
  }

  protected async doCommercialBreak(): Promise<void> {
    // TODO(phase-8): PokiSDK.commercialBreak()
  }

  protected async doRewardedBreak(): Promise<boolean> {
    // TODO(phase-8): PokiSDK.rewardedBreak()
    return false;
  }

  async save(_data: string): Promise<void> {
    // TODO(phase-8)
  }

  async load(): Promise<string | null> {
    // TODO(phase-8)
    return null;
  }

  happytime(): void {
    // TODO(phase-8): PokiSDK.happyTime(1) on stage clear.
  }
}
