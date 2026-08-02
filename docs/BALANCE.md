# Balance — what changed and why

Phase 5 replaced hand-tuning with `tools/simulate.ts`. Everything here was
measured, not guessed: run `npm run sim` to reproduce, and re-run it after any
edit to `balance.json` or `waves.json`.

The simulator imports the same `src/core/rules.ts`, `Grid` and `RunState` the
game runs on, with no Phaser in its import graph, so a number tuned here moves
the real game rather than a second model of it.

---

## Targets and where we landed

| Target | Result |
|---|---|
| `greedy` first fails around wave 25 | **wave 24** |
| `sloppy` first fails around wave 12–15 | **wave 17** — see the note below |
| Wave duration 25–40s | **26.5s average**, ramping 18s (wave 1) → 42s (wave 23) |
| No difficulty cliff (>30% DPS/HP drop vs the previous wave) | **none, all three policies** |

`hoarder` fails at wave 24 as well, which says banking energy to merge is worth
about the same as spending immediately — not a trap, not a dominant strategy.

### Why `sloppy` sits at 17 rather than 12–15

The brief defines the beginner as "misses a merge 20% of the time". On its own
that is worth almost nothing: the player re-evaluates several times a second, so
a 20% failure just delays the merge by a fraction of a second. The first sweep
had `sloppy` and `greedy` finishing within one wave of each other for exactly
this reason.

The model now also gives the beginner slower reactions (0.7s vs 0.25s between
decisions) and makes a missed merge cost 1.5s of doing nothing. That is a
defensible beginner and produces a 7-wave gap. Pushing the gap to 10+ waves
needed either a harsher beginner than the brief describes, or a balance shape
where a *good* player also fails early. Both looked like tuning the measuring
instrument to fit the target, so the gap is reported as it is.

The trade-off is real and visible in the sweep data: lengthening waves to reach
the 25–40s target hands the slow player more time to recover, which moves
`sloppy` later. `spawn 3.0→2.0` gave `sloppy` 13 at 23s per wave; the pacing
needed for the duration target moved it to 17.

---

## Changes to `balance.json`

| Key | Before | After | Why |
|---|---:|---:|---|
| `enemies.hpGrowthPerWave` | 1.28 | **1.17** | The dominant knob. Enemy HP grows exponentially while player DPS grows roughly polynomially with the number of units banked, so this alone sets where the curves cross. At 1.28 every policy failed by wave 12–14 regardless of the economy. |
| `enemies.secondsPerCell` | 1.6 | **2.8** | Enemies crossed the board in 12.8s, which is less time than a fresh player needs to react and reposition. Slower approach is most of what makes the early waves survivable. |
| `enemies.types.boss.hpMult` | 8.0 | **3.5** | A boss at 8× dwarfed its own wave: wave 5 total HP jumped 117% over wave 4 and was the only remaining cliff in the curve. |
| `energy.regenPerSecond` | 1.2 | **2.8** | At 1.2 the board held 2–4 units. Seven columns cannot be covered by four units, so leaks were structural rather than a skill question. This is the single change that made column coverage a decision instead of a lottery. |
| `energy.max` | 30 | **45** | With the higher regen, 30 capped out during the inter-wave gap and threw the surplus away. |
| `modifiers.rush.enemyCountMult` | 0.8 | **0.9** | A rush wave at 0.8 dipped hard in total HP and the next wave read as a 58–68% spike, which the cliff check flagged. |

`merge.multiplier` stays at **2.4** and the tier DPS table is unchanged. A sweep
at 2.8 and 3.1 did not widen the gap between careful and careless play enough to
justify moving a number the spec calls out.

## Changes to `waves.json`

The 15 hand-authored waves were **replaced by a generator**. This was the single
biggest fix for the cliff requirement.

Total wave HP grows at exactly `hpGrowthPerWave` when the enemy counts hold
steady. Every cliff the simulator found traced back to a composition that
jumped — the authored curve swung +101%, +72%, +78%, −5%, +152% between adjacent
waves, because a human picked each line. The generator ramps counts smoothly, so
the curve is now the HP formula plus rounding noise.

| Parameter | Value | Note |
|---|---:|---|
| `spawnIntervalStart` → `End` | 3.4 → 2.3 over 30 waves | Sets wave duration. Waves end when the last enemy dies, so the spawn schedule dominates the clock, not enemy speed. |
| `groups[].startWave` | normal 0, flyer 1, tank 3, shielded 5 | Keeps the Phase 3 finding: `shielded` takes zero damage from tier ≤ 3, so it cannot appear before a player can field a T4. |
| `groups[].base` / `perWave` / `max` | see file | Counts ramp gently; steady counts are what keeps the curve smooth. |
| `bossWaveFillRatio` | 0.9 | A boss wave carries 90% of the normal groups too. Without it a boss wave weighed half its neighbours and the wave after spiked. |
| `modifierCycle` | 10 entries | Waves 1–5 keep the original tutorial order (`none, none, blockedColumn, rush, none`). |
| `totalWaves` | 50 | Stages 1–10. |

---

## The measured curve (`greedy`, 8 seeded runs)

DPS/HP is total ally DPS over total wave HP. It falls monotonically, which is
the shape we want: the player is always gaining ground in absolute terms and
always losing it in relative terms.

| wave | ally DPS | wave HP | DPS/HP | sec | lives lost |
|---:|---:|---:|---:|---:|---:|
| 1 | 152 | 240 | 0.63 | 19.0 | 0.00 |
| 5 | 984 | 1 094 | 0.90 | 17.8 | 0.00 |
| 10 | 2 538 | 3 024 | 0.84 | 23.4 | 0.00 |
| 15 | 5 023 | 8 467 | 0.59 | 31.0 | 0.13 |
| 20 | 6 884 | 19 353 | 0.36 | 39.6 | 0.25 |
| 23 | 7 686 | 30 491 | 0.25 | 42.6 | 0.75 |
| 24 | 8 184 | 34 194 | 0.24 | 36.5 | **fails** |

Full data: `docs/balance-sim.csv`, regenerated by `npm run sim`.

---

## Simulator vs the real game

Driving the browser build with the same policy `greedy` uses:

| | sim (waves 1–5) | real game (waves 2–5) |
|---|---:|---:|
| avg wave time | 17.2s | 22.3s |
| lives lost | 0 | 1 |
| outcome | stage clear | stage clear |

The real game runs about 25% slower per wave and is slightly harsher. The
simulated player acts instantly; a real one spends time dragging. Treat sim wave
times as a floor, and expect roughly one extra life lost per stage early on.

---

## Re-tuning

1. Edit `balance.json` or `waves.json`.
2. `npm run sim` — check first-failure waves, average wave time, and that the
   cliff line reads `none` for all three policies.
3. `npm run sim -- --trials=12` before trusting a small difference; at 4–5
   trials the first-failure wave moved by ±4 between runs.
