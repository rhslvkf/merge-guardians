# Merge Guardians — Specification

Frozen design spec. Sections 1–11 are the contract; code follows this document,
and any change to a rule here must be made here first.

Numbers written in this document are *initial* values. Their runtime source is
always `src/config/*.json` — see CLAUDE.md rule 1. Values retuned in Phase 5 are
recorded, with the measurements behind them, in `docs/BALANCE.md`.

---

## 1. Overview

| | |
|---|---|
| Title | Merge Guardians |
| Genre | Merge × lane defense |
| Platform | Desktop and mobile browsers (Poki / CrazyGames) |
| Session target | 3–5 minutes per stage, instant retry |

**Core hook:** merge units to hold the line inside a single screen, and reshape
every run with a 3-card upgrade draft after each wave.

---

## 2. Core loop

1. Spend energy to summon a T1 unit — it lands on a random free cell in the ally area.
2. Drag one unit onto another of the same tier to merge them into a single unit of the next tier.
3. Enemies descend column by column from the top. Units auto-fire upward along their own column.
4. An enemy that reaches a cell holding a unit stops and attacks it in melee. When the unit dies, the enemy resumes its advance.
5. An enemy that crosses the bottom row of the grid costs 1 life. At 0 lives the run ends.
6. Wiping out the wave clears it → 3-card upgrade draft → next wave.
7. Clearing 5 waves (the last is a boss) clears the stage and unlocks the next.

---

## 3. Layout (responsive)

Grid: **7 columns × 8 rows**.

- Rows 0–3: enemy approach area. No unit placement.
- Rows 4–7: ally area. Placement and merging allowed. The `boardExpand` upgrade extends it up to row 3.
- Enemies spawn at row 0; crossing row 7 costs a life.

**No hardcoded screen coordinates.** `LayoutService` recomputes on every resize:

```
sideMargin = 16
hudH  = clamp(H * 0.12, 72, 140)   // top HUD
dockH = clamp(H * 0.14, 88, 160)   // bottom summon/reward dock

cell    = floor(min((W - 2*sideMargin) / 7, (H - hudH - dockH) / 8))
gridW   = cell * 7
gridH   = cell * 8
originX = (W - gridW) / 2
originY = hudH + (H - hudH - dockH - gridH) / 2
```

Every game object positions itself through `gridToWorld(col, row)` only.

Phaser scale config: `mode = Phaser.Scale.RESIZE`, `autoCenter = CENTER_BOTH`.
**Do not use FIT with a fixed resolution** — it leaves large margins in both
portrait and landscape.

On landscape/desktop (16:9) the formula sizes the cell from height and centres
the board; the leftover space on the left and right carries the extended HUD
panels (wave info, upgrades taken this run).

**Mobile minimum:** if the computed cell measures under **44 CSS px**, log a
console warning.

---

## 4. Units and combat

- Tiers T1–T8. Merge multiplier **2.4** — two units become one, so anything under 2.0 removes the incentive to merge. This value changes in `balance.json` only.
- `attackInterval = 0.8s`, identical for every tier. Damage per shot = `dps * attackInterval`.
- `maxHp = dps * 3.0`.
- A merged unit spawns at **full HP**, which makes merging a healing move.
- Firing: target the nearest enemy in the unit's own column (largest row). Projectile speed = `cell * 9` per second.
- An enemy reaching a unit's cell stops and drains `enemy.meleeDps` HP per second.
- At 0 HP the unit is destroyed, the cell empties, and the enemy resumes.

Tier table (`balance.json` initial values):

| Tier | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 |
|---|---|---|---|---|---|---|---|---|
| DPS | 10 | 24 | 58 | 138 | 332 | 796 | 1911 | 4587 |

---

## 5. Enemies

- HP: `hp = 40 * pow(1.17, waveIndex) * typeHpMult`
- Movement: `2.8s` per cell, divided by `typeSpeedMult`
- Kill reward: +1 energy, +1 gold

| Type | hpMult | speedMult | meleeDps | Special |
|---|---|---|---|---|
| normal | 1.0 | 1.0 | 12 | — |
| shielded | 1.4 | 0.9 | 14 | Projectiles from units of tier ≤ 3 deal 0 damage |
| flyer | 0.7 | 1.4 | 0 | Passes through occupied cells, never attacks in melee, still takes projectile damage |
| tank | 3.0 | 0.6 | 25 | — |
| boss | 3.5 | 0.5 | 40 | Separate health bar at the top of the screen |

---

## 6. Energy and summoning

- Start 12, cap 45, regeneration 2.8/s.
- Summon cost = `3 + (summons already made this wave)`. The counter resets at the start of each wave.
- With no free cell in the ally area, the summon button is disabled and shows the reason.
- +1 energy per enemy killed.

---

## 7. Wave modifiers

Required feature — this is what keeps waves from feeling identical. Each wave
carries 0 or 1 modifier, assigned in `waves.json`.

| Modifier | Effect |
|---|---|
| `none` | — |
| `blockedColumn` | One random column's ally cells are blocked by rock for the wave |
| `bomb` | A bomb tile appears on a random ally cell. If that cell's unit is not consumed by a merge within 12s, it explodes and destroys the units on that cell and its 4 orthogonal neighbours. Merging defuses it |
| `fog` | Rows 0–1 are hidden, so incoming enemy types can't be scouted |
| `rush` | Spawn interval ×0.6, total enemy count ×0.9 |

---

## 8. 3-card upgrade draft

On wave clear, draw 3 distinct cards from the pool. Effects last for the current
run only.

| id | Effect |
|---|---|
| `atkSpeed` | Attack interval −12% (stacks, floor 0.25s) |
| `dpsAll` | All unit DPS +10% (stacks) |
| `summonCost` | Summon cost step −1 (minimum step 0) |
| `energyRegen` | Energy regeneration +0.4/s |
| `startTier` | 2 free T2 units placed at the start of the next wave |
| `lifePlus` | +1 life (max 5) |
| `instantT4` | Place 1 T4 unit immediately |
| `boardExpand` | Extend the ally area up to row 3 (offered once per run) |
| `mergeHeal` | Merging heals adjacent units for 30% HP |

**Important:** cards already at their cap, or whose condition is unmet, are
excluded from the candidate pool before drawing.

---

## 9. Progression and saving

- A stage is 5 waves. Clearing a stage unlocks the next. 10 stages, 50 waves.
- Wave composition is generated from the `procedural` block in `waves.json`
  rather than authored per wave — hand-written compositions were the source of
  every difficulty cliff the Phase 5 simulator found.
- `waveIndex` accumulates across stages — stage 3's third wave is `waveIndex 12`.
- Saved: best cleared stage, unlocked stage, accumulated gold, the 3 permanent upgrades, sound settings.
- Permanent upgrades (bought with gold, 3 levels each): starting lives +1 / starting energy +5 / all-tier DPS +5%.
- **All persistence goes through `SaveService`. No file calls `localStorage` directly** — it gets swapped for portal cloud save.

---

## 10. Portal SDK requirements

Define a common `PortalAdapter` interface and implement `LocalAdapter`,
`PokiAdapter` and `CrazyGamesAdapter`. Detect the host at runtime from
`document.referrer` and `location.hostname`, and inject the matching adapter.

```ts
interface PortalAdapter {
  init(): Promise<void>
  loadingStart(): void
  loadingFinished(): void
  gameplayStart(): void
  gameplayStop(): void
  commercialBreak(): Promise<void>
  rewardedBreak(): Promise<boolean>   // true = grant the reward
  save(data: string): Promise<void>
  load(): Promise<string | null>
  happytime(): void
}
```

### Poki rules (violations get the game rejected)

- `gameplayStart()` fires on the player's **first input**, not on load.
- `gameplayStop()` fires on every gameplay interruption: pause, menu open, level end, cutscene.
- `gameplayStart()` must never fire twice in a row, and neither must `gameplayStop()` — enforce this with a state machine.
- **No SDK event may fire while a midroll or rewarded video is playing.**
- `commercialBreak()` is called only when leaving pause and returning to gameplay — never when exiting to the level-select screen.

### CrazyGames rules

- HTML5 SDK v3.
- Basic Launch (no SDK integration) is a valid first submission, so the game must work correctly with no SDK present.
- Play must begin immediately, or within a single click.

### Ad handling (common)

Pause the game, mute audio and stop timers before any ad; restore all three afterwards.

### Ad placement

| Trigger | Type | Detail |
|---|---|---|
| Lives hit 0 | Rewarded | Once per run; restore 1 life and resume immediately |
| Wave clear | Rewarded | Double the gold reward |
| Board stalled | Rewarded | Place 1 T5 unit immediately, 120s cooldown |
| Stage end | Midroll | Called *after* `gameplayStop()` |

---

## 11. Tech stack (fixed)

- **Phaser 3.90.0.** Not v4 — this project gains nothing from v4's new renderer, and writing against the v4 API risks inventing methods that don't exist.
- TypeScript + Vite.
- **No physics engine**, arcade physics included. The logic is grid-based and doesn't need one.
- No additional runtime dependencies (portal SDK scripts excepted).
- Rendering: `pixelArt: true`, `roundPixels: true`, `antialias: false`.

---

## 12. Assets (added in Phase 6)

Art and audio are **optional at runtime**. The packs are hand-installed CC0
downloads (see `docs/ASSETS.md`), so the game must boot, play and be testable
without them: with no files present the entities keep their drawn shapes and the
game is silent. Installing the packs is a file drop, never a code change.

- The manifest is `src/config/assets.ts` — sheet geometry, tier → frame, enemy
  type → frame, audio keys, font stack. It is data, and it is the only place any
  of that mapping may live.
- Which frame is which character is read off the dev-only `/debug-atlas/` page,
  never guessed in code.
- Missing files are detected before the loader runs, by HEAD request. Handing
  Phaser a URL that resolves to a host's fallback HTML is not a clean miss — it
  decodes as neither image nor audio and throws.
- `public/assets` total stays under **1.5 MB**.
- **No webfont.** UI text uses the system monospace stack in `FONT_STACK`; a
  portal build must not block first paint on a font request.
- Continuous motion (idle bob, fire recoil, hit flash) is a per-frame additive
  offset, not a tween: bob and recoil write the same property, and two tweens on
  one property fight every frame. One-shot effects (merge, death, life lost) are
  pooled tweens.
