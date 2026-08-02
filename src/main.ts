import Phaser from 'phaser';

import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { ResultScene } from './scenes/ResultScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0d14',
  // Rule 5 / spec section 3: RESIZE + CENTER_BOTH. Never FIT with a fixed
  // resolution — it letterboxes badly on both phone portrait and desktop.
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  // Spec section 11: no physics engine. The board is grid-based.
  // BootScene is first in the list, so Phaser starts it automatically.
  scene: [BootScene, PreloadScene, MenuScene, GameScene, UIScene, ResultScene],
};

const game = new Phaser.Game(config);

export default game;
