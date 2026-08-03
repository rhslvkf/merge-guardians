import { DEBUG } from '../config/constants';
import { LocalBackend, type SaveBackend } from './save/SaveBackend';

/**
 * The only path to persistence (rule 2).
 *
 * Three things this owns that a bare key-value store does not:
 *
 *  - **A versioned schema.** Every blob carries `saveVersion`, and `migrate`
 *    walks it forward one step at a time. A save from an older build is
 *    upgraded, never discarded — losing a player's gold to a schema change is
 *    the kind of bug that ends a session permanently.
 *  - **Debounced writes.** `set` is cheap and can be called from gameplay;
 *    the actual write happens 2s later, coalescing a burst into one call.
 *    Portal cloud saves are rate-limited, so writing per kill would be
 *    throttled or dropped.
 *  - **An injected backend.** localStorage now, the portal's cloud save in
 *    Phase 8, with no change here.
 *
 * The in-memory copy is authoritative during a session, so a failed write
 * degrades to "this session was not kept", never to wrong values on screen.
 */

export interface PermaUpgrades {
  life: number;
  energy: number;
  dps: number;
}

export interface Settings {
  sfx: boolean;
  bgm: boolean;
}

export interface SaveData {
  saveVersion: number;
  /** Highest stage the player has cleared. 0 before the first clear. */
  bestStage: number;
  /** Highest stage that may be selected. Always at least 1. */
  unlockedStage: number;
  gold: number;
  permaUpgrades: PermaUpgrades;
  settings: Settings;
  /** Set once the first-run merge tutorial has been completed. */
  tutorialDone: boolean;
}

export const SAVE_VERSION = 1;

export const DEFAULT_SAVE: SaveData = {
  saveVersion: SAVE_VERSION,
  bestStage: 0,
  unlockedStage: 1,
  gold: 0,
  permaUpgrades: { life: 0, energy: 0, dps: 0 },
  settings: { sfx: true, bgm: true },
  tutorialDone: false,
};

/** How long a burst of `set` calls is allowed to coalesce before it is written. */
export const FLUSH_DEBOUNCE_MS = 2000;

type Blob = Record<string, unknown>;

/**
 * One entry per version step: `MIGRATIONS[n]` upgrades a v`n` blob to v`n+1`.
 *
 * Written as a chain rather than a single "read whatever shape" function so a
 * save two versions old goes through both steps and every step stays small
 * enough to reason about on its own.
 *
 * Version 0 is anything without a recognisable `saveVersion` — including the
 * shape the Phase 0 stub declared (`version` / `meta` / `sound`). That stub
 * never actually wrote anything, but the fields were in the codebase, and
 * having a real first step is what makes the mechanism testable rather than
 * decorative.
 */
const MIGRATIONS: Record<number, (data: Blob) => Blob> = {
  0: (data) => {
    const meta = (data.meta ?? {}) as Blob;
    const sound = (data.sound ?? {}) as Blob;
    return {
      ...data,
      saveVersion: 1,
      permaUpgrades: {
        life: num(meta.startLife, 0),
        energy: num(meta.startEnergy, 0),
        dps: num(meta.dpsBoost, 0),
      },
      settings: { sfx: bool(sound.sfx, true), bgm: bool(sound.music, true) },
      tutorialDone: false,
    };
  },
};

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Walk a blob of any known age up to the current version. */
export function migrate(raw: Blob): Blob {
  let data = raw;
  let version = num(data.saveVersion, 0);

  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      // A gap in the chain means a build shipped without its migration. Better
      // to start fresh than to hand malformed values to the game.
      if (DEBUG) console.warn(`[save] no migration from v${version}; resetting`);
      return { ...DEFAULT_SAVE };
    }
    data = step(data);
    const next = num(data.saveVersion, version + 1);
    // Guard against a migration that forgets to bump, which would spin forever.
    version = next > version ? next : version + 1;
    data.saveVersion = version;
  }

  return data;
}

export class SaveService {
  private data: SaveData = { ...DEFAULT_SAVE, permaUpgrades: { ...DEFAULT_SAVE.permaUpgrades } };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly backend: SaveBackend = new LocalBackend()) {}

  /**
   * Read, migrate, and keep the result in memory.
   *
   * Any failure — absent, unparseable, wrong shape — resolves to the defaults
   * rather than rejecting. The game must boot for a first-time player and for
   * one whose storage is corrupt, and those are the same code path.
   */
  async init(): Promise<void> {
    const raw = await this.backend.read();
    this.data = SaveService.parse(raw);
    this.bindUnloadFlush();

    if (DEBUG) {
      console.log(
        `[save] loaded v${this.data.saveVersion}: stage ${this.data.unlockedStage} unlocked, ` +
          `${this.data.gold} gold, tutorial ${this.data.tutorialDone ? 'done' : 'pending'}`
      );
    }
  }

  /** Exposed for tests: the parse + migrate + fill-defaults pipeline alone. */
  static parse(raw: string | null): SaveData {
    const fresh = (): SaveData => ({
      ...DEFAULT_SAVE,
      permaUpgrades: { ...DEFAULT_SAVE.permaUpgrades },
      settings: { ...DEFAULT_SAVE.settings },
    });

    if (!raw) return fresh();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (DEBUG) console.warn('[save] unparseable blob; starting fresh');
      return fresh();
    }
    if (typeof parsed !== 'object' || parsed === null) return fresh();

    const migrated = migrate(parsed as Blob);
    const base = fresh();

    // Field-by-field rather than a spread: a blob missing a key added in a
    // later build must come back as the default, not as undefined.
    return {
      saveVersion: SAVE_VERSION,
      bestStage: num(migrated.bestStage, base.bestStage),
      unlockedStage: Math.max(1, num(migrated.unlockedStage, base.unlockedStage)),
      gold: Math.max(0, num(migrated.gold, base.gold)),
      permaUpgrades: {
        life: num((migrated.permaUpgrades as Blob)?.life, 0),
        energy: num((migrated.permaUpgrades as Blob)?.energy, 0),
        dps: num((migrated.permaUpgrades as Blob)?.dps, 0),
      },
      settings: {
        sfx: bool((migrated.settings as Blob)?.sfx, true),
        bgm: bool((migrated.settings as Blob)?.bgm, true),
      },
      tutorialDone: bool(migrated.tutorialDone, base.tutorialDone),
    };
  }

  // --- accessors ---------------------------------------------------------

  get<K extends keyof SaveData>(key: K): SaveData[K] {
    return this.data[key];
  }

  /** Update a field and schedule a write. Cheap enough to call from gameplay. */
  set<K extends keyof SaveData>(key: K, value: SaveData[K]): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this.markDirty();
  }

  /**
   * For the two nested objects, where `set` cannot see a mutation.
   *
   * Takes a partial and merges, so a caller changing one setting does not have
   * to reconstruct the other.
   */
  patch<K extends 'permaUpgrades' | 'settings'>(key: K, value: Partial<SaveData[K]>): void {
    this.data[key] = { ...this.data[key], ...value };
    this.markDirty();
  }

  /** The whole blob, for a summary screen. Copied — callers must go through `set`. */
  snapshot(): SaveData {
    return {
      ...this.data,
      permaUpgrades: { ...this.data.permaUpgrades },
      settings: { ...this.data.settings },
    };
  }

  // --- writing -----------------------------------------------------------

  private markDirty(): void {
    this.dirty = true;
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  /**
   * Write now, cancelling any pending debounce.
   *
   * Serialised behind the previous write so two flushes cannot interleave and
   * land out of order on an async backend.
   */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return this.writing;

    this.dirty = false;
    const payload = JSON.stringify(this.data);
    this.writing = this.writing.then(() => this.backend.write(payload));
    return this.writing;
  }

  /** True while a `set` is still waiting on the debounce. For tests. */
  get hasPendingWrite(): boolean {
    return this.dirty;
  }

  /**
   * A 2s debounce means a tab closed at the wrong moment loses the last
   * change, so the write is forced when the page goes away.
   *
   * `pagehide` and `visibilitychange` rather than `beforeunload`: on mobile
   * Safari a backgrounded tab is often killed without ever firing the latter,
   * and inside a portal iframe it may not fire at all.
   */
  private bindUnloadFlush(): void {
    if (typeof document === 'undefined') return;
    const force = (): void => void this.flush();
    globalThis.addEventListener?.('pagehide', force);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') force();
    });
  }
}
