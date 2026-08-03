import balance from '../config/balance.json';
import type { PermaUpgrades, SaveService } from '../services/SaveService';

/**
 * The permanent-upgrade shop, as rules rather than as UI.
 *
 * Cost lookup, affordability, purchase and the resulting run bonuses all live
 * here so MenuScene only lays out buttons and RunState only reads three
 * numbers. Every value comes from `balance.json` (rule 1).
 */

export type PermaId = keyof PermaUpgrades;

export interface PermaDefinition {
  id: PermaId;
  maxLevel: number;
  costs: readonly number[];
  /** i18n key stems: `shop.<id>.name`, `shop.<id>.desc`. */
  key: string;
}

/**
 * `PermaUpgrades` keys are short (`life`), the balance keys are descriptive
 * (`startLife`). Mapping them here keeps the save blob small without making
 * the config cryptic.
 */
export const PERMA_UPGRADES: readonly PermaDefinition[] = [
  {
    id: 'life',
    maxLevel: balance.meta.startLife.maxLevel,
    costs: balance.meta.startLife.costs,
    key: 'life',
  },
  {
    id: 'energy',
    maxLevel: balance.meta.startEnergy.maxLevel,
    costs: balance.meta.startEnergy.costs,
    key: 'energy',
  },
  {
    id: 'dps',
    maxLevel: balance.meta.dpsBoost.maxLevel,
    costs: balance.meta.dpsBoost.costs,
    key: 'dps',
  },
];

export function definitionOf(id: PermaId): PermaDefinition {
  const found = PERMA_UPGRADES.find((u) => u.id === id);
  if (!found) throw new Error(`unknown permanent upgrade: ${id}`);
  return found;
}

/** Gold for the next level, or `null` when the upgrade is maxed. */
export function nextCost(id: PermaId, level: number): number | null {
  const def = definitionOf(id);
  if (level >= def.maxLevel) return null;
  return def.costs[level] ?? null;
}

export type PurchaseResult = 'bought' | 'maxed' | 'tooExpensive';

/**
 * Spend gold on one level, writing straight through SaveService.
 *
 * The save is the authority on both gold and levels, so there is no window in
 * which the shop shows one number and the next run uses another.
 */
export function buy(save: SaveService, id: PermaId): PurchaseResult {
  const levels = save.get('permaUpgrades');
  const level = levels[id];
  const cost = nextCost(id, level);

  if (cost === null) return 'maxed';
  if (save.get('gold') < cost) return 'tooExpensive';

  save.set('gold', save.get('gold') - cost);
  save.patch('permaUpgrades', { [id]: level + 1 } as Partial<PermaUpgrades>);
  return 'bought';
}

// --- what the levels are worth ----------------------------------------------

export function bonusLives(levels: PermaUpgrades): number {
  return levels.life * balance.meta.startLife.livesPerLevel;
}

export function bonusEnergy(levels: PermaUpgrades): number {
  return levels.energy * balance.meta.startEnergy.energyPerLevel;
}

/** Multiplier, not a delta: 2 levels of +5% is 1.10. */
export function dpsMultiplier(levels: PermaUpgrades): number {
  return 1 + levels.dps * balance.meta.dpsBoost.dpsMultPerLevel;
}

/** Per-level effect text for the shop card, e.g. "+1" / "+5" / "+5%". */
export function effectLabel(id: PermaId): string {
  switch (id) {
    case 'life':
      return `+${balance.meta.startLife.livesPerLevel}`;
    case 'energy':
      return `+${balance.meta.startEnergy.energyPerLevel}`;
    case 'dps':
      return `+${Math.round(balance.meta.dpsBoost.dpsMultPerLevel * 100)}%`;
  }
}
