/**
 * Asset manifest: which sheet, and which frame index, every game object uses.
 *
 * The mapping is data on purpose. Nobody can tell from the code which tile in a
 * 130-sprite Kenney sheet is a knight, so the indices below are filled in from
 * the `/debug-atlas/` page, which renders every frame with its number.
 *
 * The sheets are the packed tilemaps out of each pack, loaded straight as
 * Phaser spritesheets — 16x16 tiles, no repacking step, no atlas JSON.
 *
 * Note the spacing: each pack ships both `tilemap.png` (1px gaps, which is what
 * the pack's own Tilesheet.txt describes) and `tilemap_packed.png` (no gaps).
 * We use the packed ones, so spacing is 0 — the dimensions prove it, e.g. Tiny
 * Dungeon is 192x176 = exactly 12x11 tiles of 16px with nothing between.
 *
 * Until the files exist the game falls back to the Phase 1-5 drawn shapes, so
 * nothing breaks in a fresh checkout.
 */

export interface SheetSpec {
  key: string;
  /** Path under `public/`, so the URL is relative for portal sub-path hosting. */
  path: string;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
}

export const SHEETS: Record<string, SheetSpec> = {
  dungeon: {
    key: 'sheet-dungeon',
    path: 'assets/sheets/tiny-dungeon.png',
    frameWidth: 16,
    frameHeight: 16,
    margin: 0,
    spacing: 0,
  },
  creatures: {
    key: 'sheet-creatures',
    path: 'assets/sheets/tiny-creatures.png',
    frameWidth: 16,
    frameHeight: 16,
    margin: 0,
    spacing: 0,
  },
};

export interface SpriteRef {
  sheet: keyof typeof SHEETS;
  frame: number;
}

/**
 * Tier 1-8 guardians, read off `/debug-atlas/`.
 *
 * Chosen for a legible power ramp *and* eight distinguishable silhouettes and
 * palettes at cell size — a merge game is unplayable if two adjacent tiers look
 * alike. Peasant, villager, warrior, dwarf, viking, knight, plate knight, mage;
 * tan, tan+white, green, dark+red, horned grey, grey+gold, all grey, purple.
 *
 * T1 and T2 are the closest pair, which is the right place for it: they are the
 * two the player sees most and merges away fastest, and both carry the badge.
 */
export const UNIT_SPRITES: SpriteRef[] = [
  { sheet: 'dungeon', frame: 88 }, // T1 bare-chested peasant
  { sheet: 'dungeon', frame: 85 }, // T2 villager in a tunic
  { sheet: 'dungeon', frame: 112 }, // T3 green-banded warrior
  { sheet: 'dungeon', frame: 111 }, // T4 hooded dwarf
  { sheet: 'dungeon', frame: 87 }, // T5 horned viking
  { sheet: 'dungeon', frame: 97 }, // T6 knight
  { sheet: 'dungeon', frame: 96 }, // T7 plate knight
  { sheet: 'dungeon', frame: 84 }, // T8 archmage
];

/**
 * One per enemy type, picked so the *rule* each type carries is readable
 * without a legend (spec 5).
 */
export const ENEMY_SPRITES: Record<string, SpriteRef> = {
  normal: { sheet: 'creatures', frame: 11 }, // goblin
  shielded: { sheet: 'creatures', frame: 18 }, // shield-bearer — the tier<=3 immunity is the sprite
  flyer: { sheet: 'creatures', frame: 135 }, // eagle — wings say "passes over your units"
  tank: { sheet: 'creatures', frame: 126 }, // ogre — bulk says "slow and heavy"
  boss: { sheet: 'creatures', frame: 96 }, // crowned king
};

/**
 * Board decoration. `null` keeps the drawn version.
 *
 * The floors stay drawn: the board tints carry the ally/enemy split, and a
 * dungeon floor tile behind a 7x8 grid reads as a second, conflicting grid.
 */
export const TILE_SPRITES: { rock: SpriteRef | null; floorAlly: SpriteRef | null; floorEnemy: SpriteRef | null } = {
  rock: { sheet: 'dungeon', frame: 56 },
  floorAlly: null,
  floorEnemy: null,
};

/**
 * Sheets the game actually needs before it will switch off the drawn shapes.
 *
 * Kenney's Tiny Battle was evaluated and dropped rather than listed here: it is
 * a modern-warfare pack (tanks, jets, factories, roads) with nothing that reads
 * as a fantasy guardian or monster. Shipping it would have been 9KB the game
 * never draws.
 */
export const REQUIRED_SHEETS: (keyof typeof SHEETS)[] = ['dungeon', 'creatures'];

// --- audio ------------------------------------------------------------------

export interface SoundSpec {
  key: string;
  path: string;
}

/**
 * Eight SFX plus one looping track.
 *
 * Missing files are tolerated: AudioService no-ops on any key that failed to
 * load, so the game is silent rather than broken.
 */
export const SOUNDS: Record<string, SoundSpec> = {
  summon: { key: 'sfx-summon', path: 'assets/audio/summon.ogg' },
  merge: { key: 'sfx-merge', path: 'assets/audio/merge.ogg' },
  shoot: { key: 'sfx-shoot', path: 'assets/audio/shoot.ogg' },
  enemyDeath: { key: 'sfx-enemy-death', path: 'assets/audio/enemy-death.ogg' },
  lifeLost: { key: 'sfx-life-lost', path: 'assets/audio/life-lost.ogg' },
  waveClear: { key: 'sfx-wave-clear', path: 'assets/audio/wave-clear.ogg' },
  upgrade: { key: 'sfx-upgrade', path: 'assets/audio/upgrade.ogg' },
  button: { key: 'sfx-button', path: 'assets/audio/button.ogg' },
};

export const MUSIC: SoundSpec = { key: 'bgm', path: 'assets/audio/bgm.ogg' };

// --- fonts ------------------------------------------------------------------

/**
 * System stack only — no webfont.
 *
 * A portal build must not block first paint on a font request, and a 200KB
 * webfont would be a seventh of the whole asset budget.
 */
export const FONT_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
