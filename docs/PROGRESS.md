# Merge Guardians — Progress

Update this file as work lands. Do not start a phase before the one before it is
done, and do not implement a later phase early.

Status: **Phase 6 complete (art pipeline, motion, audio, backdrop). Phase 7 not started.**
The art and audio files themselves are a hand-install — see `docs/ASSETS.md`.
Until they land, the game runs on the Phase 1–5 drawn shapes and in silence,
by design: everything switches over on a file drop, with no code change.

---

## Phase 0 — Scaffolding (done)

- [x] Vite + TypeScript + Phaser 3.90.0 project, dependencies installed
- [x] Full file tree from SPEC section 12 created as stubs
- [x] `CLAUDE.md`, `docs/SPEC.md`, `docs/PROGRESS.md`
- [x] `balance.json`, `waves.json` (stages 1–3), `upgrades.json` initial values
- [x] `npm run dev` shows a black screen with the "Merge Guardians" title

---

## Phase 1 — Grid and drag-merge (done)

- [x] `LayoutService` wired into GameScene, recomputing on resize
- [x] `Grid`: cell state, ally/enemy areas, free-cell lookup
- [x] Board rendered through `gridToWorld()` only, no hardcoded positions
- [x] `Unit` entity with tier and placeholder art (rounded rect + tier number,
      tier colour from an 8-way HSL split). HP moved to Phase 2 with combat;
      sprites land in Phase 6
- [x] Drag a unit between cells, mouse and touch, 8px drag threshold
- [x] `MergeSystem`: same-tier merge → next tier, capped at T8; different tier
      swaps; empty ally cell moves. Full-HP-on-merge arrives with HP in Phase 2
- [x] Merge and invalid-drop feedback (drop ring drawn outside the cell so the
      dragged unit cannot cover it; drag is scaled up and translucent)
- [x] 44px touch-target warning verified on a phone-sized viewport
- [x] Debug SUMMON button in UIScene, communicating by event only (rule 7).
      Energy cost follows in Phase 3
- [x] i18n string table added so no display text is a literal (rule 8)

## Phase 2 — Enemies, combat, waves (done)

- [x] `Enemy` entity + object pool
- [x] Column-wise descent at `1.6s / speedMult` per cell, interpolated rather
      than snapped (position is `cellRow + progress`)
- [x] `Projectile` entity + object pool, speed `cell * 9`/s expressed as rows
      per second so it survives a resize unchanged
- [x] `CombatSystem`: target the nearest enemy above in the column,
      `dps * attackInterval` per shot
- [x] Melee: enemy stops on the cell above a unit, drains `meleeDps`, resumes on kill
- [x] Enemy types: normal / shielded (tier ≤ 3 immunity, "BLOCK" label) /
      flyer (passes through) / tank / boss
- [x] Boss health bar at the top of the screen
- [x] `WaveRunner`: spawn schedule from `waves.json`, HP curve from `balance.json`
- [x] Wave-clear detection, wave banner and remaining-enemy counter
- [x] Enemies crossing the bottom row log `[LEAK]` and are removed. Life loss
      is Phase 3
- [x] Placeholder shapes baked to textures once per board size — Graphics
      re-tessellates every frame, which cost 26 fps at 30 enemies

Deliberately not in this phase: wave modifiers are read from `waves.json` and
reported, but none are applied yet (Phase 4).

## Phase 3 — Energy, lives, game over (done)

- [x] `EnergySystem`: start 12 / cap 30 / +1.2 per second, shown as a HUD gauge
- [x] Summon cost `3 + summonsThisWave` on the button face, counter reset each wave
- [x] Summon button disabled with the reason underneath when the board is full
      or energy is short
- [x] +1 energy and +1 gold per kill, with a floating label where the enemy died
- [x] Life lost when an enemy crosses row 7, with a red flash and a camera shake;
      game over at 0
- [x] `RunState` as the single source of truth, created in BootScene and held in
      the registry so it survives restart / stage change
- [x] `UIScene` split out: `Hud`, `Button`, `GameOverPanel`, events only
- [x] Pause on ESC or the HUD button — `scene.pause` stops update, timers and
      tweens together, so energy and enemies both freeze
- [x] Game over panel: revive (once per run, restores 1 life and clears the
      board), restart, menu
- [x] Stage clear (5 waves) routes to ResultScene with gold earned, next stage
      and retry
- [x] Minimal MenuScene so the "menu" exits lead somewhere real
- [x] PortalAdapter stubs called at the right moments and logged under DEBUG;
      the gameplayStart/Stop alternation guard is enforced. Real SDK wiring and
      ad playback stay in Phase 8

## Phase 4 — Modifiers and the upgrade draft (done)

- [x] `blockedColumn`: rocks on one random column's ally cells. Enforced in
      `Grid.isAllyCell`, so summoning, dropping and merging all honour it from
      one place. Units already standing there keep fighting
- [x] `bomb`: 12s fuse on a random occupied ally cell, defused by using that
      unit in a merge, otherwise destroys the cell plus its 4 neighbours
- [x] `fog`: rows 0–1 covered so incoming types cannot be read
- [x] `rush`: spawn interval ×0.6, enemy count ×0.8, applied by WaveRunner when
      it builds the schedule
- [x] Modifier name and one-line description shown for 1.5s at wave start
- [x] `UpgradePanel`: 3 distinct cards on wave clear, game paused behind it
- [x] Candidate filtering — capped and condition-failing cards excluded
- [x] All 9 upgrade effects applied and honoured by the systems that read them
- [x] Upgrades taken this run listed in the HUD
- [x] Rewarded "double gold" button on the draft (stub until Phase 8)

GameScene passed 300 lines again once the draft landed, so the wave → draft →
next wave loop and the session transitions moved to `core/RunFlow.ts`.

## Phase 5 — Balance extraction and simulator (done)

- [x] Rules extracted to `core/rules.ts` — pure, no Phaser in its import graph.
      The entities and CombatSystem now read the HP curve, tier stats, damage
      and wave schedule from it, so game and simulator cannot drift apart
- [x] `Grid` is generic over a `Placeable`, so the simulator reuses the real
      board logic (placement, blocking, free-cell search) rather than a copy
- [x] `tools/simulate.ts`: 3 policies (greedy / hoarder / sloppy), seeded and
      reproducible, N trials per wave, CSV + console table
- [x] Report: ally DPS, wave HP, DPS/HP ratio, clear, seconds, lives lost,
      units, top tier — plus an automatic difficulty-cliff check
- [x] `npm run sim`
- [x] Retuned `balance.json`; `waves.json` compositions replaced by a generator
      because hand-authored waves were the sole source of the cliffs
- [x] Targets: greedy fails w24, sloppy w17, 26.5s average wave, zero cliffs.
      Reasoning and before/after in `docs/BALANCE.md`

The `sloppy` target of wave 12-15 was not reached — see BALANCE.md for the
measurements and why hitting it needed a harsher beginner than the brief.

## Phase 6 — Art, sound, polish (done)

- [x] `src/config/assets.ts`: sheet geometry, tier → frame, enemy type → frame,
      the nine audio keys and the font stack, all as data. Frame indices are
      placeholders until read off the debug page
- [x] `/debug-atlas/` dev page: every frame of every sheet at 4x with its
      row-major index, adjustable tile/margin/spacing, click-to-pick producing
      paste-ready manifest lines. Dev-only — Vite bundles `index.html` alone
- [x] `ArtService`: per-sheet availability, `{key, frame} | null` resolution.
      `null` means the caller keeps its drawn shape, so a fresh checkout runs
- [x] `Unit` and `Enemy` take a sprite frame when the pack is present and the
      baked shape when it is not; with sprites the tier number becomes a badge
      under the unit instead of its whole face
- [x] `services/assetProbe.ts`: HEAD-probe every optional file at boot, in one
      parallel batch, so the loader is never handed a URL that resolves to the
      host's fallback HTML (which decodes as neither image nor audio and throws)
- [x] Motion. Idle bob (±2px, 1.2s, per-unit phase) and fire recoil (4px) are an
      additive per-frame offset on an inner container, not tweens — they write
      the same `y` as each other and as grid positioning, and competing tweens on
      one property fight every frame. Hit flash is a tint with a countdown, so a
      board being shot at creates no timers. All three allocate nothing (rule 4)
- [x] `ui/Effects.ts`: the one-shot juice as pooled tweens — merge absorb (130ms
      suck-in) then pop (1.3x, Back.Out) plus an expanding ring, enemy death
      (pooled ghost shrinking to 0.6 and fading, 6 shards), red vignette on a
      life lost
- [x] `AudioService`: eight SFX + looping BGM, context unlocked on the first
      real gesture, missing clips skipped rather than erroring, `suspendForAd` /
      `resumeAfterAd` restoring the pre-ad state. Shot SFX throttled to 1/90ms
- [x] `ui/Backdrop.ts`: tiled pattern over the whole canvas (so desktop side
      margins are not flat colour) plus a baked vignette shown as four cropped
      edge strips
- [x] No webfont: `FONT_STACK` (system monospace) replaces all 18 hardcoded
      `fontFamily: 'monospace'` occurrences
- [x] `PreloadScene` is real: loading bar, portal `loadingFinished()`, then Menu
- [x] Verified: 20/20 scripted checks, Phases 1–4 regression still green,
      simulator unchanged. See "measurements" below

### Deviations from the frozen file tree

- `src/ui/Effects.ts`, `src/ui/Backdrop.ts`, `src/services/ArtService.ts`,
  `src/services/assetProbe.ts`, `src/config/assets.ts`, `debug-atlas/` — all new.
- The spec asked for tween-based animation throughout. Continuous motion (bob,
  recoil, hit flash) is a per-frame offset instead, for the reason above; the
  one-shots are tweens as specified.

### Measurements

Measured at 500x900 with 30 tanks and 14 T6 units on screen, in this container,
which has no GPU and rasterises WebGL in software (SwiftShader):

| | fps | script |
|---|---|---|
| everything on | 22–24 | 2.0–2.6 ms/frame |
| backdrop hidden | 31–32 | 2.1 ms/frame |
| backdrop + vignette hidden | 49–54 | 1.8 ms/frame |
| board also hidden | 58–59 | 1.4 ms/frame |

The fps column is fill-rate, not our code. Scaling the backdrop quad alone
confirms it: 113k px costs 0.8 ms/frame, 253k costs 4.1, 450k costs 9.8 —
superlinear in *area*, which is what a software rasteriser under memory pressure
does, and about 22 ns per pixel. A real GPU blends a 500x900 quad in well under
0.5 ms. **Script time is the number that transfers: ~2 ms/frame at 30 enemies.**

Two real fixes came out of this, both cutting work rather than pixels:

- The vignette started as a live `Graphics`. Phaser re-tessellates a Graphics
  command buffer every frame it is drawn, so a dozen full-screen alpha strokes
  were being rebuilt 60 times a second for an image that only changes on resize.
  Baking it: 19.6 → 22.3 fps, script 2.86 → 2.49 ms/frame. This is the same trap
  as the Phase 2 unit shapes (`entities/shapeTextures.ts`) — worth remembering
  that it is easy to walk into twice.
- The transparent middle of a vignette costs as much to blend as its visible
  edges, so it is drawn as four crops of the one texture and the centre of the
  screen is left alone.

### Still open

- **Four files crossed 300 lines** (rule 10 says propose the split, so:).
  **Deferred by decision — do not split these yet.**
  - `entities/Unit.ts` 314 → move the tier palette and `ensureUnitTextures` /
    `unitTextureKey` / `tierFillColor` into `entities/placeholderArt.ts`, beside
    `shapeTextures.ts`. Purely mechanical; takes Unit to ~250 and gives Enemy's
    identical baking block somewhere to go too.
  - `core/MergeSystem.ts` 315 → split the pointer interaction (press, threshold,
    drag, drop highlight) into `core/DragController.ts`, leaving MergeSystem the
    rules (`canMerge`, `previewDrop`, `applyDrop`, `healNeighbours`). The rules
    half is what the simulator would want, and it has no Phaser input in it.
  - `core/RunFlow.ts` 309 → session control (pause, resume, revive, restart,
    menu, game over) is a separable concern from the wave → draft → wave loop.
  - `core/CombatSystem.ts` 308 → projectile flight and hit resolution could move
    to `core/Projectiles.ts`, leaving enemy movement, melee and firing.
- The 44px touch minimum is still violated in phone landscape (cell 28px). The
  fix is SPEC 3's side-panel HUD layout; it is a layout change, not an art one,
  and it is still not done. Flagged since Phase 1.

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
