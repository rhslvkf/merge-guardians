# Merge Guardians — Progress

Update this file as work lands. Do not start a phase before the one before it is
done, and do not implement a later phase early.

Status: **Phase 0 complete (scaffolding). Phase 1 not started.**

---

## Phase 0 — Scaffolding (done)

- [x] Vite + TypeScript + Phaser 3.90.0 project, dependencies installed
- [x] Full file tree from SPEC section 12 created as stubs
- [x] `CLAUDE.md`, `docs/SPEC.md`, `docs/PROGRESS.md`
- [x] `balance.json`, `waves.json` (stages 1–3), `upgrades.json` initial values
- [x] `npm run dev` shows a black screen with the "Merge Guardians" title

---

## Phase 1 — Grid and drag-merge

- [ ] `LayoutService` wired into GameScene, recomputing on resize
- [ ] `Grid`: cell state, ally/enemy areas, free-cell lookup
- [ ] Board rendered through `gridToWorld()` only, no hardcoded positions
- [ ] `Unit` entity with tier, HP, sprite
- [ ] Drag a unit between cells (pointer and touch)
- [ ] `MergeSystem`: same-tier merge → next tier at full HP, capped at T8
- [ ] Merge and invalid-drop feedback
- [ ] 44px touch-target warning verified on a phone-sized viewport

## Phase 2 — Enemies, combat, waves

- [ ] `Enemy` entity + object pool
- [ ] Column-wise descent at `1.6s / speedMult` per cell
- [ ] `Projectile` entity + object pool, speed `cell * 9`/s
- [ ] `CombatSystem`: target the nearest enemy in the column, `dps * attackInterval` per shot
- [ ] Melee: enemy stops on an occupied cell, drains `meleeDps`, resumes on kill
- [ ] Enemy types: normal / shielded (tier ≤ 3 immunity) / flyer (passes through) / tank / boss
- [ ] Boss health bar at the top of the screen
- [ ] `WaveRunner`: spawn schedule from `waves.json`, HP curve from `balance.json`
- [ ] Wave-clear detection

## Phase 3 — Energy, lives, game over

- [ ] `EnergySystem`: start 12 / cap 30 / +1.2 per second
- [ ] Summon cost `3 + summonsThisWave`, counter reset each wave
- [ ] Summon button disabled with a reason when the board is full or energy is short
- [ ] +1 energy and +1 gold per kill
- [ ] Life lost when an enemy crosses row 7; game over at 0
- [ ] `RunState` as the single source of truth
- [ ] `UIScene` split out: `Hud`, `Button`, `GameOverPanel`, events only
- [ ] Retry from game over with no reload

## Phase 4 — Modifiers and the upgrade draft

- [ ] `blockedColumn`: rocks on one column's ally cells for the wave
- [ ] `bomb`: 12s fuse, defused by merging, otherwise destroys the cell plus 4 neighbours
- [ ] `fog`: rows 0–1 hidden
- [ ] `rush`: spawn interval ×0.6, enemy count ×0.8
- [ ] `UpgradePanel`: 3 distinct cards on wave clear
- [ ] Candidate filtering — capped and condition-failing cards excluded
- [ ] All 9 upgrade effects applied to `RunState` and honoured by the systems
- [ ] Upgrades taken this run shown in the HUD side panel on wide layouts

## Phase 5 — Balance extraction and simulator

- [ ] Every remaining literal moved out of code into `config/*.json`
- [ ] Core rules importable from Node (no Phaser dependency in the rules)
- [ ] `tools/simulate.ts`: N trials per wave under a scripted player policy
- [ ] Report: clear rate, lives lost, time to clear, DPS vs enemy HP curve
- [ ] Retune `balance.json` / `waves.json` from the results
- [ ] Stage 1 clearable by a first-time player; stage 3 requires real decisions

## Phase 6 — Art, sound, polish

- [ ] Unit sprites, T1–T8 clearly distinguishable at cell size
- [ ] Enemy sprites per type, readable under `fog`
- [ ] Hit / merge / explosion / life-lost effects
- [ ] SFX + BGM through `AudioService`, with mute/restore for ads
- [ ] i18n table (English) and every string routed through a key
- [ ] 60fps on a mid-range phone, no allocation in the update loop

## Phase 7 — Meta progression and saving

- [ ] `SaveService` with versioning and migration, `LocalAdapter`-backed
- [ ] Persist best stage, unlocked stage, gold, permanent upgrades, sound
- [ ] `MenuScene`: stage select and the permanent-upgrade shop
- [ ] The 3 permanent upgrades (3 levels each) seeded into `RunState` at run start
- [ ] `ResultScene`: run summary, retry, next stage

## Phase 8 — SDK, build, submission prep

- [ ] `BasePortalAdapter` state machine: `gameplayStart`/`Stop` alternation enforced
- [ ] No SDK event fires while an ad is playing
- [ ] `PokiAdapter` complete, with `gameplayStart` on first input only
- [ ] `CrazyGamesAdapter` (SDK v3) complete, and verified playable with no SDK
- [ ] `detectPortal()` from referrer/hostname, adapter injected at boot
- [ ] Ad placement: revive / double gold / stall relief (120s cooldown) / stage-end midroll
- [ ] Pause + mute + timer stop around every ad, restored afterwards
- [ ] Production build: `DEBUG` logging stripped, size checked
- [ ] Submission packages for Poki and CrazyGames
