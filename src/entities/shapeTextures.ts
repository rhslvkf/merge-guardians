import Phaser from 'phaser';

/**
 * Bakes the placeholder shapes into textures once per board size.
 *
 * Phaser re-tessellates a Graphics command buffer on every frame it is drawn,
 * so a rounded rectangle with a stroke costs real geometry per unit per frame.
 * Baked textures render as batched Images instead, which is flat in the number
 * of entities.
 *
 * Phase 6 replaces these with authored art; the entities already consume
 * textures by key, so that swap will not touch their code.
 */

/** Draw once into an offscreen Graphics and bake the result to a texture. */
export function bakeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(graphics);
  graphics.generateTexture(key, Math.ceil(width), Math.ceil(height));
  graphics.destroy();
}
