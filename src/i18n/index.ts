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

export type TParams = Record<string, string | number>;

/**
 * Look up a string, substituting `{name}` placeholders from `params`.
 *
 * Word order differs between languages, so the placeholder has to travel inside
 * the translated string rather than being concatenated by the caller.
 */
export function t(key: string, params?: TParams): string {
  const value = active[key];
  if (value === undefined) {
    if (DEBUG) console.warn(`[i18n] missing key: ${key}`);
    // Showing the key beats showing nothing when a translation is missing.
    return key;
  }
  if (!params) return value;

  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const replacement = params[name];
    return replacement === undefined ? match : String(replacement);
  });
}
