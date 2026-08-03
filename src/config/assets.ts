/**
 * Asset manifest: which sheet, and which frame index, every game object uses.
 *
 * The mapping is data on purpose. Nobody can tell from the code which tile in a
 * 130-sprite Kenney sheet is a knight, so the indices below are filled in from
 * the `/debug-atlas/` page, which renders every frame with its number.
 *
 * The sheets are Kenney's packed tilemaps, loaded straight as Phaser
 * spritesheets — 16x16 tiles, no repacking step, no atlas JSON. Sheet geometry
 * is declared here because the exact margin/spacing differs between packs;
 * the debug page has controls to confirm it.
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
    spacing: 1,
  },
  battle: {
    key: 'sheet-battle',
    path: 'assets/sheets/tiny-battle.png',
    frameWidth: 16,
    frameHeight: 16,
    margin: 0,
    spacing: 1,
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
 * Tier 1-8 guardians.
 *
 * PLACEHOLDER INDICES — every entry is a guess and will look wrong until the
 * indices come back from `/debug-atlas/`. `assetsReady` stays false while any
 * referenced sheet is missing, and the drawn shapes are used instead.
 */
export const UNIT_SPRITES: SpriteRef[] = [
  { sheet: 'dungeon', frame: 84 }, // T1
  { sheet: 'dungeon', frame: 85 }, // T2
  { sheet: 'dungeon', frame: 86 }, // T3
  { sheet: 'dungeon', frame: 87 }, // T4
  { sheet: 'dungeon', frame: 96 }, // T5
  { sheet: 'dungeon', frame: 97 }, // T6
  { sheet: 'dungeon', frame: 98 }, // T7
  { sheet: 'dungeon', frame: 99 }, // T8
];

export const ENEMY_SPRITES: Record<string, SpriteRef> = {
  normal: { sheet: 'creatures', frame: 0 },
  shielded: { sheet: 'creatures', frame: 1 },
  flyer: { sheet: 'creatures', frame: 2 },
  tank: { sheet: 'creatures', frame: 3 },
  boss: { sheet: 'creatures', frame: 4 },
};

/** Board decoration. `null` keeps the drawn version. */
export const TILE_SPRITES: { rock: SpriteRef | null; floorAlly: SpriteRef | null; floorEnemy: SpriteRef | null } = {
  rock: { sheet: 'dungeon', frame: 1 },
  floorAlly: null,
  floorEnemy: null,
};

/** Sheets the game actually needs before it will switch off the drawn shapes. */
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
