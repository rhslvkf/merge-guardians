import Phaser from 'phaser';

import { FONT_STACK } from '../config/assets';
import { MIN_TOUCH_CELL_PX, Palette, RegistryKey } from '../config/constants';
import { t } from '../i18n';
import type { AudioService } from '../services/AudioService';

/**
 * Shared button: pointer states, a disabled state carrying a reason label, and
 * a hit area never smaller than MIN_TOUCH_CELL_PX.
 *
 * Label text comes from an i18n key, never a literal (rule 8).
 */

export interface ButtonOptions {
  labelKey: string;
  onClick: () => void;
  /** Fill colour override, for destructive or secondary actions. */
  fill?: number;
}

const CORNER_RADIUS_RATIO = 0.22;
const LABEL_SIZE_RATIO = 0.34;

export class Button extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hitArea = new Phaser.Geom.Rectangle(0, 0, 0, 0);
  private readonly onClick: () => void;
  private readonly fill: number;
  private readonly audio?: AudioService;

  private buttonWidth = 0;
  private buttonHeight = 0;
  private isPressed = false;
  private isEnabled = true;

  constructor(scene: Phaser.Scene, options: ButtonOptions) {
    super(scene, 0, 0);
    this.onClick = options.onClick;
    this.fill = options.fill ?? Palette.buttonFill;
    this.audio = scene.registry.get(RegistryKey.Audio) as AudioService | undefined;

    this.background = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, t(options.labelKey), {
        fontFamily: FONT_STACK,
        fontStyle: 'bold',
        color: Palette.buttonLabel,
      })
      .setOrigin(0.5);

    this.add([this.background, this.label]);
    scene.add.existing(this);

    this.setInteractive(this.hitArea, Phaser.Geom.Rectangle.Contains);
    this.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    this.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    this.on(Phaser.Input.Events.POINTER_OUT, this.handleOut, this);
  }

  /** Resize and reposition — driven by LayoutService, never hardcoded (rule 5). */
  layoutAt(x: number, y: number, width: number, height: number): this {
    this.buttonWidth = Math.round(width);
    this.buttonHeight = Math.round(Math.max(height, MIN_TOUCH_CELL_PX));
    this.setPosition(Math.round(x), Math.round(y));

    this.hitArea.setTo(
      -this.buttonWidth / 2,
      -this.buttonHeight / 2,
      this.buttonWidth,
      this.buttonHeight
    );
    this.label.setFontSize(Math.max(10, Math.round(this.buttonHeight * LABEL_SIZE_RATIO)));

    this.redraw();
    return this;
  }

  /** Replace the visible label. Text always arrives already translated. */
  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    if (this.isEnabled === enabled) return this;
    this.isEnabled = enabled;
    if (enabled) this.setInteractive(this.hitArea, Phaser.Geom.Rectangle.Contains);
    else this.disableInteractive();
    this.redraw();
    return this;
  }

  private handleDown(): void {
    this.isPressed = true;
    this.redraw();
  }

  private handleUp(): void {
    const wasPressed = this.isPressed;
    this.isPressed = false;
    this.redraw();
    if (!wasPressed || !this.isEnabled) return;
    this.audio?.play('button');
    this.onClick();
  }

  private handleOut(): void {
    if (!this.isPressed) return;
    this.isPressed = false;
    this.redraw();
  }

  private redraw(): void {
    if (this.buttonWidth <= 0 || this.buttonHeight <= 0) return;

    const fill = !this.isEnabled
      ? Palette.buttonFillDisabled
      : this.isPressed
        ? Palette.buttonFillPressed
        : this.fill;

    this.background.clear();
    this.background.fillStyle(fill, 1);
    this.background.fillRoundedRect(
      -this.buttonWidth / 2,
      -this.buttonHeight / 2,
      this.buttonWidth,
      this.buttonHeight,
      this.buttonHeight * CORNER_RADIUS_RATIO
    );
    this.label.setAlpha(this.isEnabled ? 1 : 0.5);
  }
}
