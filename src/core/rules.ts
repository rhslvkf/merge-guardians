import balance from '../config/balance.json';
import { GRID_COLS, GRID_ROWS } from '../config/constants';
import wavesConfig from '../config/waves.json';

/**
 * Every number the game actually decides with, as pure functions.
 *
 * Nothing here touches Phaser, the DOM or any game object, so both the running
 * game and `tools/simulate.ts` compute from exactly the same rules. If a
 * balance question can be answered without a renderer, its answer belongs here.
 */

// --- units -------------------------------------------------------------

export const MAX_TIER: number = balance.merge.maxTier;
export const TIER_DPS: readonly number[] = balance.units.tierDps;
export const ATTACK_INTERVAL: number = balance.units.attackInterval;
export const ATTACK_INTERVAL_FLOOR: number = balance.units.attackIntervalFloor;
export const HP_PER_DPS: number = balance.units.hpPerDps;
export const PROJECTILE_ROWS_PER_SECOND: number = balance.units.projectileSpeedCells;

export function tierDps(tier: number): number {
  return TIER_DPS[clampTier(tier) - 1];
}

export function unitMaxHp(tier: number): number {
  return tierDps(tier) * HP_PER_DPS;
}

/** Damage a single shot lands: `dps * attackInterval`, scaled by run upgrades. */
export function damagePerShot(dps: number, dpsMult: number, interval: number): number {
  return dps * dpsMult * interval;
}

export function clampTier(tier: number): number {
  return Math.min(MAX_TIER, Math.max(1, Math.floor(tier)));
}

/** Two units merge only at equal tier, and only below the cap (spec 4). */
export function canMergeTiers(a: number, b: number): boolean {
  return a === b && a < MAX_TIER;
}

// --- enemies -----------------------------------------------------------

export type EnemyType = 'normal' | 'shielded' | 'flyer' | 'tank' | 'boss';

export interface EnemyTypeConfig {
  hpMult: number;
  speedMult: number;
  meleeDps: number;
  /** shielded: projectiles from units at or below this tier deal no damage. */
  immuneToTierAtOrBelow?: number;
  /** flyer: walks through occupied cells and never attacks. */
  ignoresUnits?: boolean;
  showTopHealthBar?: boolean;
}

export const ENEMY_TYPES = balance.enemies.types as unknown as Record<EnemyType, EnemyTypeConfig>;

export const BASE_HP: number = balance.enemies.baseHp;
export const HP_GROWTH: number = balance.enemies.hpGrowthPerWave;
export const SECONDS_PER_CELL: number = balance.enemies.secondsPerCell;

/** hp = baseHp * pow(hpGrowthPerWave, waveIndex) * typeHpMult (spec 5). */
export function enemyHp(type: EnemyType, waveIndex: number): number {
  return BASE_HP * Math.pow(HP_GROWTH, waveIndex) * ENEMY_TYPES[type].hpMult;
}

/** Rows travelled per second, before any blocking. */
export function enemyRowsPerSecond(type: EnemyType): number {
  return ENEMY_TYPES[type].speedMult / SECONDS_PER_CELL;
}

/** Seconds for an unobstructed enemy to cross the whole board. */
export function enemyCrossingSeconds(type: EnemyType): number {
  return (GRID_ROWS - 0.5) / enemyRowsPerSecond(type);
}

/** A shielded enemy takes nothing from low tiers (spec 5). */
export function isImmuneTo(type: EnemyType, sourceTier: number): boolean {
  return sourceTier <= (ENEMY_TYPES[type].immuneToTierAtOrBelow ?? 0);
}

// --- energy ------------------------------------------------------------

export const ENERGY_START: number = balance.energy.start;
export const ENERGY_MAX: number = balance.energy.max;
export const ENERGY_REGEN: number = balance.energy.regenPerSecond;
export const SUMMON_BASE_COST: number = balance.energy.summonBaseCost;
export const SUMMON_COST_STEP: number = balance.energy.summonCostStep;
export const ENERGY_PER_KILL: number = balance.energy.energyPerKill;
export const GOLD_PER_KILL: number = balance.run.goldPerKill;
export const START_LIVES: number = balance.run.startLives;

export function summonCost(step: number, summonsThisWave: number): number {
  return SUMMON_BASE_COST + step * summonsThisWave;
}

// --- waves -------------------------------------------------------------

export interface WaveSpawnGroup {
  type: string;
  count: number;
  delaySeconds: number;
}

export interface WaveConfig {
  waveIndex: number;
  modifier: string;
  spawnIntervalSeconds: number;
  spawns: WaveSpawnGroup[];
}

export const WAVES_PER_STAGE: number = wavesConfig.wavesPerStage;
export const TOTAL_WAVES: number = wavesConfig.totalWaves;
export const INTER_WAVE_DELAY_SECONDS: number = wavesConfig.interWaveDelaySeconds;
const RUSH = balance.modifiers.rush;
const PROC = wavesConfig.procedural;

/**
 * Every wave is generated from `waves.json > procedural`.
 *
 * Hand-written waves were the entire source of the difficulty cliffs the
 * simulator found: total wave HP grows at exactly `hpGrowthPerWave` when the
 * enemy counts hold steady, so each >30% drop in the DPS/HP ratio traced back
 * to a composition that jumped. The parameters stay in config (rule 1); only
 * the shape of the ramp lives here.
 */
function generateWave(waveIndex: number): WaveConfig {
  const t = Math.min(1, waveIndex / PROC.spawnIntervalFalloffWaves);
  const interval =
    PROC.spawnIntervalStart + (PROC.spawnIntervalEnd - PROC.spawnIntervalStart) * t;
  const isBossWave = (waveIndex + 1) % WAVES_PER_STAGE === 0;
  // A boss wave still carries a share of the regular groups; without it the
  // wave weighed about half its neighbours and the next one spiked.
  const fill = isBossWave ? PROC.bossWaveFillRatio : 1;

  const spawns: WaveSpawnGroup[] = [];
  for (const g of PROC.groups) {
    if (waveIndex < g.startWave) continue;
    const raw = Math.min(g.max, g.base + g.perWave * waveIndex);
    const count = Math.round(raw * fill);
    if (count > 0) spawns.push({ type: g.type, count, delaySeconds: g.delaySeconds });
  }
  if (isBossWave) {
    spawns.push({ type: 'boss', count: 1, delaySeconds: PROC.bossDelaySeconds });
  }

  return {
    waveIndex,
    modifier: PROC.modifierCycle[waveIndex % PROC.modifierCycle.length],
    spawnIntervalSeconds: Math.round(interval * 100) / 100,
    spawns,
  };
}

const GENERATED = new Map<number, WaveConfig>();

export function waveAt(waveIndex: number): WaveConfig | undefined {
  if (waveIndex < 0 || waveIndex >= TOTAL_WAVES) return undefined;
  let wave = GENERATED.get(waveIndex);
  if (!wave) {
    wave = generateWave(waveIndex);
    GENERATED.set(waveIndex, wave);
  }
  return wave;
}

export function stageCount(): number {
  return Math.floor(TOTAL_WAVES / WAVES_PER_STAGE);
}

export interface ScheduledSpawn {
  time: number;
  type: EnemyType;
  col: number;
}

/**
 * Expand a wave into its spawn timetable.
 *
 * `rush` is applied here rather than in ModifierSystem because it only affects
 * timing and count (spec 7). `randomCol` is injected so the simulator can make
 * runs reproducible.
 */
export function buildWaveSchedule(
  waveIndex: number,
  randomCol: () => number = () => Math.floor(Math.random() * GRID_COLS)
): ScheduledSpawn[] {
  const wave = waveAt(waveIndex);
  const schedule: ScheduledSpawn[] = [];
  if (!wave) return schedule;

  const rush = wave.modifier === 'rush';
  const interval = wave.spawnIntervalSeconds * (rush ? RUSH.spawnIntervalMult : 1);
  const countMult = rush ? RUSH.enemyCountMult : 1;

  for (const group of wave.spawns) {
    const count = Math.max(1, Math.round(group.count * countMult));
    for (let i = 0; i < count; i++) {
      schedule.push({
        time: group.delaySeconds + i * interval,
        type: group.type as EnemyType,
        col: randomCol(),
      });
    }
  }
  schedule.sort((a, b) => a.time - b.time);
  return schedule;
}

/** Total enemy HP a wave throws at the player — the denominator of the curve. */
export function waveTotalHp(waveIndex: number): number {
  let total = 0;
  for (const spawn of buildWaveSchedule(waveIndex, () => 0)) {
    total += enemyHp(spawn.type, waveIndex);
  }
  return total;
}

/** Seconds from wave start until the last enemy has been released. */
export function waveSpawnSpan(waveIndex: number): number {
  let last = 0;
  for (const spawn of buildWaveSchedule(waveIndex, () => 0)) {
    if (spawn.time > last) last = spawn.time;
  }
  return last;
}
