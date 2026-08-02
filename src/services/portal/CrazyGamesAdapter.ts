import { BasePortalAdapter } from './PortalAdapter';

/**
 * CrazyGames HTML5 SDK v3 adapter.
 *
 * Notes (spec section 10):
 *  - Basic Launch means the game must be fully playable with no SDK present,
 *    so every call here degrades to a no-op when the SDK is missing.
 *  - Play must begin immediately, or within a single click.
 *  - Gameplay events map to `sdk.game.gameplayStart/gameplayStop`, ads to
 *    `sdk.ad.requestAd('midgame' | 'rewarded')`.
 *  - Cloud save uses `sdk.data` when the user is signed in.
 *
 * Stub — implemented in Phase 8.
 */
export class CrazyGamesAdapter extends BasePortalAdapter {
  async init(): Promise<void> {
    // TODO(phase-8): load the v3 SDK, await sdk.init(), degrade to no-ops on failure.
  }

  loadingStart(): void {
    // TODO(phase-8): sdk.game.loadingStart()
  }

  loadingFinished(): void {
    // TODO(phase-8): sdk.game.loadingStop()
  }

  protected doGameplayStart(): void {
    // TODO(phase-8): sdk.game.gameplayStart()
  }

  protected doGameplayStop(): void {
    // TODO(phase-8): sdk.game.gameplayStop()
  }

  protected async doCommercialBreak(): Promise<void> {
    // TODO(phase-8): sdk.ad.requestAd('midgame')
  }

  protected async doRewardedBreak(): Promise<boolean> {
    // TODO(phase-8): sdk.ad.requestAd('rewarded')
    return false;
  }

  async save(_data: string): Promise<void> {
    // TODO(phase-8): sdk.data.setItem when available, else localStorage.
  }

  async load(): Promise<string | null> {
    // TODO(phase-8)
    return null;
  }

  happytime(): void {
    // TODO(phase-8): CrazyGames has no happytime equivalent — no-op.
  }
}
