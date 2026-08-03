import type { PortalAdapter } from '../portal/PortalAdapter';

/**
 * Where a save blob physically goes.
 *
 * Injected into `SaveService` so the storage and the schema are separable
 * problems: locally it is `localStorage`, on a portal it is the portal's cloud
 * save (async, rate-limited, and allowed to fail).
 *
 * Both sides are string in / string out. Versioning, migration and debouncing
 * are `SaveService`'s job, not the backend's — a backend that also understood
 * the schema would have to be reimplemented for every host.
 */
export interface SaveBackend {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
}

/** The one and only key. Namespaced because a portal shares an origin. */
export const SAVE_KEY = 'merge-guardians:save';

/**
 * `localStorage`, and **the only place in the codebase that touches it**
 * (rule 2).
 *
 * Every call is wrapped: Safari private mode throws on `setItem`, and some
 * embedded webviews throw on `localStorage` access itself. A failed save must
 * degrade to "progress not kept this session", never to a crash mid-run.
 */
export class LocalBackend implements SaveBackend {
  async read(): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(SAVE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  async write(data: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(SAVE_KEY, data);
    } catch {
      // Quota, private mode, or storage disabled. Nothing useful to do here —
      // SaveService keeps the in-memory copy, so the session still plays.
    }
  }
}

/**
 * The portal's own cloud save, through `PortalAdapter` (rule 3).
 *
 * Not wired into the boot path until Phase 8, when `detectPortal()` picks a
 * real adapter — but it is written now so Phase 8 is a one-line swap in
 * BootScene rather than a change to SaveService.
 */
export class PortalBackend implements SaveBackend {
  constructor(private readonly portal: PortalAdapter) {}

  async read(): Promise<string | null> {
    try {
      return await this.portal.load();
    } catch {
      return null;
    }
  }

  async write(data: string): Promise<void> {
    try {
      await this.portal.save(data);
    } catch {
      // Same reasoning as LocalBackend: a cloud save that failed is not a
      // reason to interrupt play.
    }
  }
}
