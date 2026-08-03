# Assets

The sprite sheets are **installed and committed**. This page records where they
came from, why these frames, and what is still missing (audio).

Everything here is optional at runtime. The game boots, plays and passes its checks with an
empty `public/assets/`: `ArtService` reports "not ready", the entities keep the
drawn shapes from Phases 1–5, and `AudioService` runs silent. Installing the
packs is a **file drop, not a code change** — nothing needs recompiling, and the
only file you may want to edit afterwards is `src/config/assets.ts`, to say which
frame is which character.

## 1. Sprite sheets

| Pack | Source | Author | In the repo |
|---|---|---|---|
| Tiny Dungeon 1.0 | <https://kenney.nl/assets/tiny-dungeon> | Kenney | `public/assets/sheets/tiny-dungeon.png` (5.3 KB, 12×11 = 132 frames) |
| Tiny Creatures 1.0 | <https://opengameart.org/content/tiny-creatures> | Clint Bellanger | `public/assets/sheets/tiny-creatures.png` (11.5 KB, 10×18 = 180 frames) |
| Tiny Battle 1.0 | <https://kenney.nl/assets/tiny-battle> | Kenney | **not shipped** — see below |

All three are **CC0 1.0** (public domain): commercial use, modification and
redistribution are all allowed, and attribution is not required. Credited in the
README anyway, because it costs nothing.

**Tiny Battle was evaluated and dropped.** It is a modern-warfare pack — tanks,
jets, warships, factories, roads, national flags. Its only humanoids are modern
infantry. Nothing in it reads as a fantasy guardian or a monster, so shipping it
would have been 9 KB the game never draws.

### Geometry — read this before adding a sheet

Each pack ships **two** tilemaps and they are not interchangeable:

- `Tilemap/tilemap.png` — 1px gaps between tiles. This is what the pack's own
  `Tilesheet.txt` describes ("Space between tiles • 1px × 1px").
- `Tilemap/tilemap_packed.png` — **no gaps.** This is the one we use.

So `spacing` is **0** in `src/config/assets.ts`, not 1. The dimensions settle it:
Tiny Dungeon's packed sheet is 192×176, which is exactly 12×11 tiles of 16px
with nothing in between (with 1px gaps it would be 203×186 — which is precisely
the size of the *other* file). Getting this wrong shears the whole grid by one
pixel per column, which looks like slightly-wrong art rather than an obvious
error, so check the arithmetic rather than trusting the readme.

Keeping the original archives under `public/assets/raw/` is fine — that folder is
gitignored and never shipped.

## 2. Which frame is which

Already chosen and recorded in `src/config/assets.ts`:

| Role | Sheet | Frame | Sprite |
|---|---|---|---|
| T1 | dungeon | 88 | bare-chested peasant |
| T2 | dungeon | 85 | villager in a tunic |
| T3 | dungeon | 112 | green-banded warrior |
| T4 | dungeon | 111 | hooded dwarf |
| T5 | dungeon | 87 | horned viking |
| T6 | dungeon | 97 | knight |
| T7 | dungeon | 96 | plate knight |
| T8 | dungeon | 84 | archmage |
| rock (`blockedColumn`) | dungeon | 56 | boulder |
| `normal` | creatures | 11 | goblin |
| `shielded` | creatures | 18 | shield-bearer |
| `flyer` | creatures | 135 | eagle |
| `tank` | creatures | 126 | ogre |
| `boss` | creatures | 96 | crowned king |

Two constraints drove the tier picks, not one. The obvious one is a legible
power ramp. The one that actually matters in a merge game is that **eight tiers
must be distinguishable at cell size** — tan, tan+white, green, dark+red, horned
grey, grey+gold, all grey, purple, with eight different silhouettes. T1 and T2
are the closest pair, which is the right place to put it: they are the two the
player merges away fastest, and both carry the tier badge.

The enemy picks are about the *rule* each type carries being readable without a
legend: the shield-bearer's shield is the tier ≤ 3 immunity, the eagle's wings
are "passes over your units", the ogre's bulk is "slow and heavy", and the crown
is the boss.

The board floors stay drawn rather than tiled. A dungeon floor texture behind a
7×8 grid reads as a second, conflicting grid, and the ally/enemy split is
already carried by the two board tints.

### Changing them

To re-pick, use the page that produced this table:

```bash
npm run dev
# then open http://localhost:5173/debug-atlas/
```

It renders every frame of every sheet at 4× with its index underneath, numbered
row-major from 0 — the same order Phaser assigns. Controls at the top adjust
tile size, margin, spacing and zoom; if the tiles look sheared or offset, nudge
margin/spacing until each cell frames one sprite cleanly, then note what worked
and put it in `SHEETS` in `src/config/assets.ts`.

Click tiles to build a paste-ready list in the bottom-right panel:

```ts
{ sheet: 'dungeon', frame: 84 },
```

Paste those into `UNIT_SPRITES` (eight entries, T1 → T8) and `ENEMY_SPRITES`
(`normal`, `shielded`, `flyer`, `tank`, `boss`) in `src/config/assets.ts`.

The page is dev-only: Vite bundles `index.html` alone, so `/debug-atlas/` ships
nowhere.

## 3. Audio — still missing

Nothing is installed yet, so the game runs silent. Every trigger below is wired
and will start working the moment the file appears; no code change needed.

Nine files, all under `public/assets/audio/`. Mono OGG Vorbis at ~64 kbps is the
target — stereo buys nothing for one-shot SFX and doubles the bytes.

| Key | File | Length | Fires when |
|---|---|---|---|
| `summon` | `summon.ogg` | ~0.2s | a T1 unit is summoned |
| `merge` | `merge.ogg` | ~0.3s | a merge completes (after the absorb) |
| `shoot` | `shoot.ogg` | ~0.1s | a unit fires — throttled to 1 per 90ms |
| `enemyDeath` | `enemy-death.ogg` | ~0.3s | an enemy is killed |
| `lifeLost` | `life-lost.ogg` | ~0.5s | an enemy reaches the bottom row |
| `waveClear` | `wave-clear.ogg` | ~0.8s | the last enemy of a wave dies |
| `upgrade` | `upgrade.ogg` | ~0.4s | an upgrade card is picked |
| `button` | `button.ogg` | ~0.1s | any `Button` is released |
| — | `bgm.ogg` | loop | looping music, starts on the first input |

Suggested CC0 sources: [Kenney's audio packs](https://kenney.nl/assets/category:Audio)
(UI Audio, Impact Sounds, Interface Sounds) and
[OpenGameArt](https://opengameart.org/) filtered to CC0.

Encoding, once you have WAVs:

```bash
ffmpeg -i in.wav -ac 1 -c:a libvorbis -b:a 64k out.ogg
```

## 4. Budget

`public/assets` must stay under **1.5 MB** total. Currently **16.5 KB** — the two
sheets. Eight SFX will add 3–8 KB each; the music is the only thing that can
threaten the budget, so keep it to about 60 seconds of loop (~500 KB at 64 kbps
mono) and there is still an order of magnitude of headroom.

## 5. What happens if a file is missing

Checked at boot by a parallel batch of HEAD requests (`services/assetProbe.ts`)
before the loader runs, because handing Phaser a URL that resolves to a dev
server's fallback HTML produces a decode failure rather than a clean miss.

- Missing sheet → `ArtService.ready` stays false, entities draw their Phase 1–5
  shapes. Individual sheets are tracked separately, so a partial install works.
- Missing clip → `AudioService` skips that key. No error, no gap in play.
- Missing everything → the game is exactly what it was at the end of Phase 5,
  plus the backdrop, the motion and the merge feedback, all of which are drawn
  rather than loaded.
