# Assets — what to download and where to put it

Everything here is optional. The game boots, plays and passes its checks with an
empty `public/assets/`: `ArtService` reports "not ready", the entities keep the
drawn shapes from Phases 1–5, and `AudioService` runs silent. Installing the
packs is a **file drop, not a code change** — nothing needs recompiling, and the
only file you may want to edit afterwards is `src/config/assets.ts`, to say which
frame is which character.

## 1. Sprite sheets

All three packs are **CC0 1.0** (public domain): commercial use, modification and
redistribution are all allowed, and attribution is not required.

| Pack | Download | File inside the archive | Copy it to |
|---|---|---|---|
| Kenney — Tiny Dungeon | <https://kenney.nl/assets/tiny-dungeon> | `Tilemap/tilemap_packed.png` | `public/assets/sheets/tiny-dungeon.png` |
| Kenney — Tiny Battle | <https://kenney.nl/assets/tiny-battle> | `Tilemap/tilemap_packed.png` | `public/assets/sheets/tiny-battle.png` |
| OpenGameArt — Tiny Creatures | <https://opengameart.org/content/tiny-creatures> | the packed sheet PNG | `public/assets/sheets/tiny-creatures.png` |

Notes:

- Both Kenney archives contain a `Tilemap/` folder with `tilemap_packed.png`
  (the packed sheet) and a `tilemap.png` (an unpacked variant), plus a `Tiles/`
  folder of individual 16×16 PNGs. Take **`tilemap_packed.png`** — one HTTP
  request instead of a hundred and thirty.
- Both Kenney sheets are 16×16 tiles with **1px spacing and 0 margin**. That is
  already declared in `src/config/assets.ts`.
- Tiny Creatures is not packed by the same tool, so its tile size, margin and
  spacing may differ. The debug page below has controls for exactly this.
- Only `tiny-dungeon` and `tiny-creatures` are required (`REQUIRED_SHEETS`).
  `tiny-battle` is optional extra variety.

Keeping the original archives under `public/assets/raw/` is fine — that folder is
gitignored and never shipped.

## 2. Picking the frame indices

Nobody can tell from the code which tile in a 130-sprite sheet is a knight, so
the mapping is data, and there is a page for reading it off:

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
(`normal`, `shielded`, `flyer`, `tank`, `boss`) in `src/config/assets.ts`. The
indices currently in the file are **placeholders** and will look wrong.

The page is dev-only: Vite bundles `index.html` alone, so `/debug-atlas/` ships
nowhere.

## 3. Audio

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

`public/assets` must stay under **1.5 MB** total. Expected: three sheets at
roughly 10–40 KB each, eight SFX at 3–8 KB each, and music — the music is the
only thing that can blow the budget, so keep it to about 60 seconds of loop
(~500 KB at 64 kbps mono).

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
