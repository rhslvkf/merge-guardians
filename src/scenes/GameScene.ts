import Phaser from 'phaser';

import { SceneKey } from '../config/constants';

/**
 * Gameplay only: board, units, enemies, projectiles.
 *
 * Owns no UI. HUD and panels live in UIScene and are reached exclusively through
 * the events in `GameEvent` (rule 7).
 *
 * Stub — built up across Phases 1-4.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    // TODO(phase-1): Grid + LayoutService wiring, drag-to-merge.
    // TODO(phase-2): WaveRunner + CombatSystem.
  }

  override update(_time: number, _deltaMs: number): void {
    // Rule 4: no allocations in here. Enemies and projectiles come from pools.
  }
}
