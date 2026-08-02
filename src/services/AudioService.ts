/**
 * Music and SFX, plus the mute/restore pair every ad break needs.
 *
 * Ad contract (spec section 10): before an ad, pause the game, mute audio and
 * stop timers; after it, restore exactly what was suspended.
 *
 * Stub — implemented in Phase 6.
 */

export class AudioService {
  /** Mute for an ad break, remembering the pre-ad state. */
  suspendForAd(): void {
    // TODO(phase-6)
  }

  /** Restore the state captured by `suspendForAd`. */
  resumeAfterAd(): void {
    // TODO(phase-6)
  }

  setMusicEnabled(_enabled: boolean): void {
    // TODO(phase-6)
  }

  setSfxEnabled(_enabled: boolean): void {
    // TODO(phase-6)
  }
}
