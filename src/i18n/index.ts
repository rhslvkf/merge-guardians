import { DEBUG } from '../config/constants';
import en from './en.json';

/**
 * Minimal string table (rule 8). Every player-visible string goes through `t()`
 * so a second locale is a data change, not a code change.
 *
 * English only for now; `setLocale` exists so callers are already written
 * against the eventual API.
 */

type Catalog = Record<string, string>;

const catalogs: Record<string, Catalog> = { en };

let active: Catalog = catalogs.en;

export function setLocale(locale: string): void {
  active = catalogs[locale] ?? catalogs.en;
}

export function t(key: string): string {
  const value = active[key];
  if (value !== undefined) return value;
  if (DEBUG) console.warn(`[i18n] missing key: ${key}`);
  // Showing the key beats showing nothing when a translation is missing.
  return key;
}
