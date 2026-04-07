import { Container, Graphics, Text } from 'pixi.js';
import type { MazeData, Vec2 } from '@qwas/shared';
import { CLAW_BOX_SIZE, DOLL_BOX_SIZE } from '@qwas/shared';
import { drawClaw } from '../sprites/claw.js';
import { drawDoll, DOLL_TYPES } from '../sprites/doll.js';

export class Phase1Scene {
  private parent: Container;
  private mazeGraphics: Graphics;
  private clawContainer: Container;
  private dollContainer: Container;
  private clawBoxGraphics: Graphics;
  private dollBoxGraphics: Graphics;

  constructor(parent: Container) {
    this.parent = parent;
    this.mazeGraphics = new Graphics();
    this.clawContainer = new Container();
    this.dollContainer = new Container();
    this.clawBoxGraphics = new Graphics();
    this.dollBoxGraphics = new Graphics();

    parent.addChild(this.mazeGraphics);
    parent.addChild(this.dollContainer);
    parent.addChild(this.dollBoxGraphics);
    parent.addChild(this.clawContainer);
    parent.addChild(this.clawBoxGraphics);
  }

  buildMaze(maze: MazeData) {
    this.mazeGraphics.clear();

    const { cells, width, height, cellSize } = maze;

    // Background fill for maze area
    this.mazeGraphics.roundRect(
      -10, -10,
      width * cellSize + 20, height * cellSize + 20,
      12
    );
    this.mazeGraphics.fill({ color: 0xfaf5ff, alpha: 0.6 });

    // Draw maze walls with rounded style
    this.mazeGraphics.setStrokeStyle({ width: 3, color: 0x9b8ec4, cap: 'round' });

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell = cells[row][col];
        const x = col * cellSize;
        const y = row * cellSize;

        if (cell.walls.north) {
          this.mazeGraphics.moveTo(x, y);
          this.mazeGraphics.lineTo(x + cellSize, y);
          this.mazeGraphics.stroke();
        }
        if (cell.walls.south) {
          this.mazeGraphics.moveTo(x, y + cellSize);
          this.mazeGraphics.lineTo(x + cellSize, y + cellSize);
          this.mazeGraphics.stroke();
        }
        if (cell.walls.west) {
          this.mazeGraphics.moveTo(x, y);
          this.mazeGraphics.lineTo(x, y + cellSize);
          this.mazeGraphics.stroke();
        }
        if (cell.walls.east) {
          this.mazeGraphics.moveTo(x + cellSize, y);
          this.mazeGraphics.lineTo(x + cellSize, y + cellSize);
          this.mazeGraphics.stroke();
        }
      }
    }
  }

  setClaw(pos: Vec2) {
    this.clawContainer.x = pos.x;
    this.clawContainer.y = pos.y;

    // Update claw box indicator
    this.clawBoxGraphics.clear();
    this.clawBoxGraphics.rect(
      pos.x - CLAW_BOX_SIZE / 2,
      pos.y - CLAW_BOX_SIZE / 2,
      CLAW_BOX_SIZE,
      CLAW_BOX_SIZE
    );
    this.clawBoxGraphics.fill({ color: 0x7ecbf5, alpha: 0.3 });
    this.clawBoxGraphics.setStrokeStyle({ width: 2, color: 0x5ba3d9 });
    this.clawBoxGraphics.stroke();
  }

  setDoll(pos: Vec2, type: number) {
    this.dollContainer.removeChildren();
    this.dollContainer.x = pos.x;
    this.dollContainer.y = pos.y;

    const dollGraphics = drawDoll(type);
    this.dollContainer.addChild(dollGraphics);

    // Update doll box indicator
    this.dollBoxGraphics.clear();
    this.dollBoxGraphics.rect(
      pos.x - DOLL_BOX_SIZE / 2,
      pos.y - DOLL_BOX_SIZE / 2,
      DOLL_BOX_SIZE,
      DOLL_BOX_SIZE
    );
    this.dollBoxGraphics.fill({ color: 0xf5c27e, alpha: 0.3 });
    this.dollBoxGraphics.setStrokeStyle({ width: 2, color: 0xd9a35b });
    this.dollBoxGraphics.stroke();
  }

  updateAnimations(frame: number) {
    // Claw gentle bob animation
    if (this.clawContainer.children.length === 0) {
      const clawGfx = drawClaw();
      this.clawContainer.addChild(clawGfx);
    }

    // Subtle floating animation
    const bobOffset = Math.sin(frame * 0.05) * 2;
    if (this.clawContainer.children[0]) {
      this.clawContainer.children[0].y = bobOffset;
    }

    // Doll subtle bounce
    const dollBob = Math.sin(frame * 0.03 + 1) * 1.5;
    if (this.dollContainer.children[0]) {
      this.dollContainer.children[0].y = dollBob;
    }
  }
}
