import { Container, Graphics, Text } from 'pixi.js';
import type { Phase2Path } from '@qwas/shared';
import { CLAW_BOX_SIZE, DOLL_BOX_SIZE } from '@qwas/shared';
import { drawClaw } from '../sprites/claw.js';
import { drawDoll } from '../sprites/doll.js';

export class Phase2Scene {
  private parent: Container;
  private container: Container;
  private pathGraphics: Graphics;
  private clawContainer: Container;
  private dollContainer: Container;
  private clawBoxGraphics: Graphics;
  private dollBoxGraphics: Graphics;
  private bgGraphics: Graphics;
  private countdownText: Text | null = null;

  private path: Phase2Path | null = null;

  constructor(parent: Container) {
    this.parent = parent;
    this.container = new Container();
    this.container.visible = false;

    this.bgGraphics = new Graphics();
    this.pathGraphics = new Graphics();
    this.clawContainer = new Container();
    this.dollContainer = new Container();
    this.clawBoxGraphics = new Graphics();
    this.dollBoxGraphics = new Graphics();

    this.container.addChild(this.bgGraphics);
    this.container.addChild(this.pathGraphics);
    this.container.addChild(this.dollContainer);
    this.container.addChild(this.dollBoxGraphics);
    this.container.addChild(this.clawContainer);
    this.container.addChild(this.clawBoxGraphics);

    parent.addChild(this.container);
  }

  show() {
    this.container.visible = true;
  }

  hide() {
    this.container.visible = false;
  }

  buildPath(path: Phase2Path, dollType: number) {
    this.path = path;
    this.pathGraphics.clear();
    this.bgGraphics.clear();

    // Background
    const minX = Math.min(...path.leftWall.map(p => p.x)) - 60;
    const maxX = Math.max(...path.rightWall.map(p => p.x)) + 60;
    this.bgGraphics.rect(minX, -40, maxX - minX, path.totalLength + 100);
    this.bgGraphics.fill({ color: 0xf0e6f6, alpha: 0.95 });

    // Draw path walls (left)
    this.pathGraphics.setStrokeStyle({ width: 4, color: 0x9b8ec4, cap: 'round', join: 'round' });
    this.pathGraphics.moveTo(path.leftWall[0].x, path.leftWall[0].y);
    for (let i = 1; i < path.leftWall.length; i++) {
      this.pathGraphics.lineTo(path.leftWall[i].x, path.leftWall[i].y);
    }
    this.pathGraphics.stroke();

    // Draw path walls (right)
    this.pathGraphics.moveTo(path.rightWall[0].x, path.rightWall[0].y);
    for (let i = 1; i < path.rightWall.length; i++) {
      this.pathGraphics.lineTo(path.rightWall[i].x, path.rightWall[i].y);
    }
    this.pathGraphics.stroke();

    // Fill the path interior with a lighter color
    this.pathGraphics.moveTo(path.leftWall[0].x, path.leftWall[0].y);
    for (let i = 1; i < path.leftWall.length; i++) {
      this.pathGraphics.lineTo(path.leftWall[i].x, path.leftWall[i].y);
    }
    for (let i = path.rightWall.length - 1; i >= 0; i--) {
      this.pathGraphics.lineTo(path.rightWall[i].x, path.rightWall[i].y);
    }
    this.pathGraphics.closePath();
    this.pathGraphics.fill({ color: 0xfaf5ff, alpha: 0.7 });

    // Draw doll at bottom
    this.dollContainer.removeChildren();
    const dollGfx = drawDoll(dollType);
    this.dollContainer.addChild(dollGfx);
    this.dollContainer.x = path.dollBoxX;
    this.dollContainer.y = path.totalLength - 20;

    // Doll box indicator
    this.dollBoxGraphics.clear();
    this.dollBoxGraphics.rect(
      path.dollBoxX - DOLL_BOX_SIZE / 2,
      path.totalLength - 20 - DOLL_BOX_SIZE / 2,
      DOLL_BOX_SIZE,
      DOLL_BOX_SIZE,
    );
    this.dollBoxGraphics.fill({ color: 0xf5c27e, alpha: 0.3 });
    this.dollBoxGraphics.setStrokeStyle({ width: 2, color: 0xd9a35b });
    this.dollBoxGraphics.stroke();
  }

  setClaw(x: number, y: number) {
    this.clawContainer.x = x;
    this.clawContainer.y = y;

    // Ensure claw sprite is present
    if (this.clawContainer.children.length === 0) {
      const clawGfx = drawClaw();
      this.clawContainer.addChild(clawGfx);
    }
  }

  updateAnimations(frame: number) {
    // Claw gentle sway
    if (this.clawContainer.children[0]) {
      this.clawContainer.children[0].rotation = Math.sin(frame * 0.08) * 0.05;
    }
    // Doll subtle bounce
    if (this.dollContainer.children[0]) {
      this.dollContainer.children[0].y = Math.sin(frame * 0.04) * 1.5;
    }
  }
}
