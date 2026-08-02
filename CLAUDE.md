# CLAUDE.md — Merge Guardians

## Read this first

**Before any work in this repository, read `docs/SPEC.md`.** It is the frozen
design contract: board shape, combat rules, enemy stats, upgrade pool, portal
SDK obligations. If an instruction conflicts with the spec, the spec wins — and
if the spec itself needs to change, change `docs/SPEC.md` in the same commit.

Then check `docs/PROGRESS.md` for which of the 8 phases is in flight, and update
it as work lands. Do not implement a later phase early.

## Project

A 2D HTML5 merge × lane-defense game for web portals (Poki, CrazyGames).
Desktop and mobile browsers, 3–5 minutes per stage, instant retry.

Loop: summon T1 units with energy → drag same-tier units together to merge →
units auto-fire up their column at descending enemies → clear the wave → draft 1
of 3 upgrades → 5 waves per stage, last one a boss.

## Stack (do not change)

- **Phaser 3.90.0** — not v4. This project gains nothing from v4's renderer, and
  writing against the v4 API risks calling methods that do not exist.
- TypeScript + Vite.
- **No physics engine**, arcade included. The board is a grid.
- No new runtime dependencies (portal SDK scripts excepted).
- Rendering: `pixelArt: true`, `roundPixels: true`, `antialias: false`.
- Scale: `Phaser.Scale.RESIZE` + `CENTER_BOTH`. Never FIT with a fixed resolution.

## Coding rules

1. **No balance numbers in code.** Everything comes from `src/config/*.json`.
2. **No direct `localStorage` / `sessionStorage`.** Use `SaveService` only.
3. **No direct portal SDK globals** (`PokiSDK`, `CrazyGames`). Use `PortalAdapter` only.
4. **No allocation inside the update loop** — no new objects, arrays or closures.
   Projectiles and enemies use object pools.
5. **No hardcoded screen coordinates.** Use `LayoutService` and `gridToWorld()`.
6. **One source of truth for game state: `RunState`.** Scenes do not keep their
   own copies of it.
7. **`GameScene` (gameplay) and `UIScene` (HUD/panels) stay separate.** They
   communicate by events only.
8. **All display text goes through i18n keys** (English only for now). No Korean
   string literals in code.
9. **`console.log` is wrapped in the `DEBUG` flag** and must be stripped from
   production builds.
10. **A file over 300 lines should be split** — propose the split.

## Layout

Grid is 7×8. Rows 0–3 are the enemy approach area, rows 4–7 are the ally area
(`boardExpand` extends it to row 3). `LayoutService` recomputes on every resize:

```
sideMargin = 16
hudH  = clamp(H * 0.12, 72, 140)
dockH = clamp(H * 0.14, 88, 160)
cell    = floor(min((W - 2*sideMargin) / 7, (H - hudH - dockH) / 8))
originX = (W - gridW) / 2
originY = hudH + (H - hudH - dockH - gridH) / 2
```

Warn on the console when the computed cell measures under 44 CSS px.

## Portal rules that get a game rejected

- Poki: `gameplayStart()` fires on the player's **first input**, never on load.
- Poki: `gameplayStop()` fires on every interruption — pause, menu, level end, cutscene.
- Poki: those two must alternate; neither may fire twice in a row.
- Poki: no SDK event may fire while an ad is playing.
- Poki: `commercialBreak()` only when returning to gameplay from pause, never on
  the way out to level select.
- CrazyGames: the game must be fully playable with no SDK loaded (Basic Launch).
- Every ad: pause the game, mute audio, stop timers — then restore all three.

## Layout of the source tree

```
src/config/     balance.json, waves.json, upgrades.json, constants.ts
src/core/       Grid, MergeSystem, CombatSystem, WaveRunner, EnergySystem, RunState
src/entities/   Unit, Enemy, Projectile
src/scenes/     Boot, Preload, Menu, Game, UI, Result
src/services/   LayoutService, SaveService, AudioService, portal/*
src/ui/         Hud, UpgradePanel, GameOverPanel, Button
tools/          simulate.ts (Node-only balance simulator)
public/assets/  art and audio
```

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # typecheck + production build
npm run typecheck  # tsc --noEmit
npm run simulate   # headless balance simulator (Phase 5)
```
