/**
 * Layout and structural constants.
 *
 * These are *structural* values (board shape, margins, breakpoints), not balance
 * values. Anything a designer would tune to change difficulty lives in
 * config/*.json instead — see rule 1 in CLAUDE.md.
 */

/** Board columns. */
export const GRID_COLS = 7;

/** Board rows. Row 0 is the spawn row, row GRID_ROWS - 1 is the leak row. */
export const GRID_ROWS = 8;

/** Rows 0..ENEMY_ROWS-1 are the enemy approach area — units may not be placed there. */
export const ENEMY_ROWS = 4;

/** Topmost row the player may occupy by default. `boardExpand` lowers this to 3. */
export const ALLY_TOP_ROW_DEFAULT = 4;

/** Topmost row the player may occupy after the `boardExpand` upgrade. */
export const ALLY_TOP_ROW_EXPANDED = 3;

/** Crossing this row costs a life. */
export const LEAK_ROW = GRID_ROWS - 1;

/** Horizontal breathing room on each side of the board, in CSS pixels. */
export const SIDE_MARGIN = 16;

/** Top HUD band: clamp(H * ratio, min, max). */
export const HUD_HEIGHT = { ratio: 0.12, min: 72, max: 140 } as const;

/** Bottom summon/reward dock: clamp(H * ratio, min, max). */
export const DOCK_HEIGHT = { ratio: 0.14, min: 88, max: 160 } as const;

/** Below this measured CSS cell size, touch targets stop being reliably tappable. */
export const MIN_TOUCH_CELL_PX = 44;

/** Above this width/height ratio we have room for the side HUD panels. */
export const WIDE_LAYOUT_ASPECT = 1.2;

/** Pointer travel before a press turns into a drag rather than a tap. */
export const DRAG_THRESHOLD_PX = 8;

/**
 * Presentation palette. Placeholder art only — Phase 6 replaces the drawn
 * shapes with sprites. These are colours, not balance, so they stay in code.
 */
export const Palette = {
  boardEnemyArea: 0x151a26,
  boardAllyArea: 0x1e2636,
  boardLine: 0x2a3346,
  boardEdge: 0x3b465e,
  mergeHighlight: 0x4ade80,
  moveHighlight: 0x60a5fa,
  unitStrokeDarken: 0.55,
  unitLabel: '#0b0d14',
  buttonFill: 0x3b82f6,
  buttonFillPressed: 0x2563eb,
  buttonFillDisabled: 0x374151,
  buttonLabel: '#f8fafc',
} as const;

/**
 * Tier colour = an even slice of the HSL wheel, so T1..T8 stay distinguishable
 * at cell size without an art pass.
 */
export const TIER_HUE_SATURATION = 0.62;
export const TIER_HUE_LIGHTNESS = 0.58;

/**
 * Render order within GameScene.
 *
 * Highlight sits *above* resting units so the drop ring is not hidden by the
 * unit being dropped on, and below the dragged unit so the drag stays on top.
 */
export const Depth = {
  Board: 0,
  Unit: 2,
  Highlight: 5,
  Dragging: 10,
} as const;

/** Shared registry keys, so scenes never reach for each other's fields. */
export const RegistryKey = {
  Layout: 'layout',
  RunState: 'runState',
} as const;

/** Vite replaces `__DEBUG__` at build time so debug logging drops out of production. */
declare const __DEBUG__: boolean;
export const DEBUG: boolean = typeof __DEBUG__ === 'undefined' ? false : __DEBUG__;

/** Scene keys, so no scene is started by a bare string literal. */
export const SceneKey = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Menu: 'MenuScene',
  Game: 'GameScene',
  UI: 'UIScene',
  Result: 'ResultScene',
} as const;

export type SceneKeyName = (typeof SceneKey)[keyof typeof SceneKey];

/** Cross-scene event names. GameScene and UIScene only ever talk through these. */
export const GameEvent = {
  LayoutChanged: 'layout:changed',
  EnergyChanged: 'run:energy-changed',
  LivesChanged: 'run:lives-changed',
  WaveStarted: 'wave:started',
  WaveCleared: 'wave:cleared',
  StageCleared: 'stage:cleared',
  UpgradeOffered: 'upgrade:offered',
  UpgradePicked: 'upgrade:picked',
  SummonRequested: 'summon:requested',
  GameOver: 'run:game-over',
  Paused: 'run:paused',
  Resumed: 'run:resumed',
} as const;
