/**
 * Headless balance simulator. Run with `npm run sim`.
 *
 * Plays real waves against a scripted player, stepping the same rules the game
 * uses (`src/core/rules.ts`, `Grid`, `EnergySystem`) with no Phaser anywhere in
 * the import graph. What it measures is what the game does, not a second model
 * of it — the point is that tuning `balance.json` here moves the real game.
 *
 * Usage:
 *   npm run sim                 all three policies, waves 1..50
 *   npm run sim -- --trials=12  more runs per wave (default 8)
 *   npm run sim -- --waves=30   stop earlier
 *   npm run sim -- --csv=path   where to write the CSV
 */

import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { Grid } from '../src/core/Grid';
import { RunState } from '../src/core/RunState';
import { ENERGY_MAX, INTER_WAVE_DELAY_SECONDS, TOTAL_WAVES } from '../src/core/rules';
import { simulateWave, type SimUnit, type WaveResult } from './simEngine';
import { POLICIES, type Policy, type PolicyName } from './simPlayer';

// --- deterministic RNG so a tuning run is reproducible ----------------------

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// --- run a whole policy -----------------------------------------------------

function simulateRun(policy: Policy, waves: number, seed: number): WaveResult[] {
  const rng = makeRng(seed);
  const run = new RunState();
  run.reset();
  const grid = new Grid<SimUnit>(
    { get: () => ({ cell: 1 }) } as never,
    run
  );

  const results: WaveResult[] = [];
  for (let w = 0; w < waves; w++) {
    run.waveIndex = w;
    const result = simulateWave(w, grid, run, policy, rng);
    results.push(result);
    if (!result.cleared) break;
    // Between waves the player banks a little more energy.
    run.energy = Math.min(ENERGY_MAX, run.energy + run.energyRegen * INTER_WAVE_DELAY_SECONDS);
  }
  return results;
}

/** Average N seeded runs so one unlucky column draw does not decide a verdict. */
function aggregate(policy: Policy, waves: number, trials: number): WaveResult[] {
  const perWave: WaveResult[] = [];
  const runs: WaveResult[][] = [];
  for (let t = 0; t < trials; t++) runs.push(simulateRun(policy, waves, 1337 + t * 7919));

  for (let w = 0; w < waves; w++) {
    const samples = runs.map((r) => r[w]).filter(Boolean) as WaveResult[];
    if (samples.length === 0) break;
    const mean = (pick: (r: WaveResult) => number) =>
      samples.reduce((a, r) => a + pick(r), 0) / samples.length;
    const clearedCount = samples.filter((r) => r.cleared).length;
    perWave.push({
      wave: w + 1,
      allyDps: mean((r) => r.allyDps),
      waveHp: samples[0].waveHp,
      ratio: mean((r) => r.ratio),
      // Reached by fewer than half the runs, or lost by most of them.
      cleared: clearedCount / runs.length >= 0.5,
      seconds: mean((r) => r.seconds),
      livesLost: mean((r) => r.livesLost),
      units: mean((r) => r.units),
      topTier: mean((r) => r.topTier),
    });
  }
  return perWave;
}

// --- reporting --------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function main(): void {
  const waves = Math.min(TOTAL_WAVES, Number(arg('waves', String(TOTAL_WAVES))));
  const trials = Number(arg('trials', '8'));
  const csvPath = arg('csv', 'docs/balance-sim.csv');

  const rows: string[] = [
    'policy,wave,allyDps,waveHp,dpsPerHp,cleared,seconds,livesLost,units,topTier',
  ];

  for (const name of Object.keys(POLICIES) as PolicyName[]) {
    const table = aggregate(POLICIES[name], waves, trials);
    const firstFail = table.find((r) => !r.cleared);

    console.log(`\n=== ${name.toUpperCase()}  (${trials} seeded runs) ===`);
    console.log(
      'wave |   allyDPS |    waveHP | DPS/HP | clear |  sec | lives | units | topT'
    );
    for (const r of table) {
      rows.push(
        [
          name,
          r.wave,
          r.allyDps.toFixed(1),
          r.waveHp.toFixed(1),
          r.ratio.toFixed(4),
          r.cleared ? 1 : 0,
          r.seconds.toFixed(1),
          r.livesLost.toFixed(2),
          r.units.toFixed(1),
          r.topTier.toFixed(1),
        ].join(',')
      );
      console.log(
        `${String(r.wave).padStart(4)} |` +
          `${r.allyDps.toFixed(0).padStart(10)} |` +
          `${r.waveHp.toFixed(0).padStart(10)} |` +
          `${r.ratio.toFixed(3).padStart(7)} |` +
          `${(r.cleared ? 'yes' : 'NO').padStart(6)} |` +
          `${r.seconds.toFixed(1).padStart(5)} |` +
          `${r.livesLost.toFixed(2).padStart(6)} |` +
          `${r.units.toFixed(1).padStart(6)} |` +
          `${r.topTier.toFixed(1).padStart(5)}`
      );
    }

    const cleared = table.filter((r) => r.cleared);
    const avgSeconds = cleared.reduce((a, r) => a + r.seconds, 0) / (cleared.length || 1);
    console.log(
      `first failure: ${firstFail ? `wave ${firstFail.wave}` : 'none in range'}` +
        `   avg wave time (cleared): ${avgSeconds.toFixed(1)}s`
    );
    console.log(`  ${describeCliffs(table)}`);
  }

  writeFileSync(csvPath, rows.join('\n') + '\n');
  console.log(`\nCSV written to ${csvPath}`);
}

/** Flag any wave whose DPS/HP ratio collapses against the one before it. */
function describeCliffs(table: WaveResult[]): string {
  const cliffs: string[] = [];
  for (let i = 1; i < table.length; i++) {
    const prev = table[i - 1].ratio;
    const cur = table[i].ratio;
    if (prev <= 0 || !table[i].cleared) continue;
    const drop = (prev - cur) / prev;
    if (drop > 0.3) cliffs.push(`w${table[i].wave} -${(drop * 100).toFixed(0)}%`);
  }
  return cliffs.length === 0
    ? 'difficulty cliffs (>30% ratio drop): none'
    : `difficulty cliffs (>30% ratio drop): ${cliffs.join(', ')}`;
}

main();
