/**
 * A player unit sitting on one ally cell.
 *
 * Tier 1-8; `dps` comes from balance.json `units.tierDps` scaled by run and
 * permanent DPS upgrades. `maxHp = dps * hpPerDps`.
 *
 * Stub — implemented in Phase 1.
 */

export class Unit {
  tier = 1;
  col = 0;
  row = 0;
  hp = 0;
  maxHp = 0;
  cooldown = 0;
}
