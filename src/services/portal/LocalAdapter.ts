import { DEBUG } from '../../config/constants';
import { BasePortalAdapter } from './PortalAdapter';

function log(method: string): void {
  if (DEBUG) console.log(`[portal:local] ${method}()`);
}

/**
 * Development / direct-hosting adapter.
 *
 * No SDK: ads resolve immediately (rewarded always grants, so reward paths stay
 * testable) and saves go to localStorage. This is the *only* file in the
 * project allowed to touch localStorage directly, and it is reached solely
 * through SaveService.
 *
 * Stub — implemented in Phase 8.
 */
export class LocalAdapter extends BasePortalAdapter {
  async init(): Promise<void> {
    log('init');
  }

  loadingStart(): void {
    log('loadingStart');
  }

  loadingFinished(): void {
    log('loadingFinished');
  }

  protected doGameplayStart(): void {
    log('gameplayStart');
  }

  protected doGameplayStop(): void {
    log('gameplayStop');
  }

  protected async doCommercialBreak(): Promise<void> {
    // TODO(phase-8): short fake delay so pause/resume plumbing gets exercised.
  }

  protected async doRewardedBreak(): Promise<boolean> {
    // TODO(phase-8)
    return true;
  }

  async save(_data: string): Promise<void> {
    // TODO(phase-8): localStorage.setItem(KEY, data)
  }

  async load(): Promise<string | null> {
    // TODO(phase-8): localStorage.getItem(KEY)
    return null;
  }

  happytime(): void {
    log('happytime');
  }
}
