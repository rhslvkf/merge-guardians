/**
 * Headless balance simulator. Run with `npm run simulate`.
 *
 * Replays waves against a scripted player policy (summon when affordable, merge
 * greedily) using the same config JSON the game loads, and reports per-wave
 * clear rate, average lives lost and the DPS-vs-enemy-HP curve. Nothing here
 * imports Phaser — the core rules must stay renderer-free enough to run in Node.
 *
 * Stub — implemented in Phase 5.
 */

async function main(): Promise<void> {
  // TODO(phase-5): load balance.json + waves.json, run N trials per wave,
  // print a table of clear rate / lives lost / time to clear.
  console.log('simulate: not implemented yet (Phase 5)');
}

void main();
