import { Container, Graphics } from 'pixi.js';
import type { MazeData, Vec2 } from '@qwas/shared';
import { CLAW_BOX_SIZE, DOLL_BOX_SIZE } from '@qwas/shared';
import { drawClaw } from '../sprites/claw.js';
import { drawDoll } from '../sprites/doll.js';

export class Phase1Scene {
  private parent: Container;
  private container: Container;
  private bgGraphics: Graphics;
  private mazeGraphics: Graphics;
  private clawContainer: Container;
  private clawBoxGraphics: Graphics;
  private dollContainer: Container;
  private dollBoxGraphics: Graphics;
  private obstacleContainer: Container;
  private showClawBox = false;

  constructor(parent: Container) {
    this.parent = parent;
    this.container = new Container();
    this.bgGraphics = new Graphics();
    this.mazeGraphics = new Graphics();
    this.clawContainer = new Container();
    this.clawBoxGraphics = new Graphics();
    this.dollContainer = new Container();
    this.dollBoxGraphics = new Graphics();
    this.obstacleContainer = new Container();

    this.container.addChild(this.bgGraphics);
    this.container.addChild(this.mazeGraphics);
    this.container.addChild(this.obstacleContainer);
    this.container.addChild(this.dollContainer);
    this.container.addChild(this.dollBoxGraphics);
    this.container.addChild(this.clawBoxGraphics);
    this.container.addChild(this.clawContainer);
    parent.addChild(this.container);
  }

  show() { this.container.visible = true; }
  hide() { this.container.visible = false; }

  buildMaze(maze: MazeData) {
    this.bgGraphics.clear();
    this.mazeGraphics.clear();

    const { cells, width, height, cellSize } = maze;
    const totalW = width * cellSize;
    const totalH = height * cellSize;
    const pad = 30;

    // ─── Claw machine frame (outer border) ───
    // Outer metallic frame
    this.bgGraphics.roundRect(-pad - 8, -pad - 8, totalW + (pad + 8) * 2, totalH + (pad + 8) * 2, 20);
    this.bgGraphics.fill({ color: 0x6b5b95, alpha: 0.3 });

    // Inner frame border
    this.bgGraphics.roundRect(-pad, -pad, totalW + pad * 2, totalH + pad * 2, 16);
    this.bgGraphics.fill({ color: 0x9b8ec4, alpha: 0.15 });
    this.bgGraphics.setStrokeStyle({ width: 4, color: 0x9b8ec4, alpha: 0.5 });
    this.bgGraphics.stroke();

    // Glass background (play area)
    this.bgGraphics.roundRect(0, 0, totalW, totalH, 8);
    this.bgGraphics.fill({ color: 0xfaf5ff, alpha: 0.7 });

    // Corner bolts (decorative)
    const boltPositions = [
      [-pad + 10, -pad + 10], [totalW + pad - 10, -pad + 10],
      [-pad + 10, totalH + pad - 10], [totalW + pad - 10, totalH + pad - 10],
    ];
    for (const [bx, by] of boltPositions) {
      this.bgGraphics.circle(bx, by, 5);
      this.bgGraphics.fill({ color: 0x7d6fa8, alpha: 0.6 });
      this.bgGraphics.circle(bx, by, 2);
      this.bgGraphics.fill({ color: 0xc4b8e0, alpha: 0.8 });
    }

    // Top label area
    this.bgGraphics.roundRect(totalW * 0.2, -pad - 4, totalW * 0.6, 16, 4);
    this.bgGraphics.fill({ color: 0xf5c27e, alpha: 0.6 });

    // Subtle grid pattern on the floor
    this.bgGraphics.setStrokeStyle({ width: 0.5, color: 0xd4c8f0, alpha: 0.3 });
    for (let i = 0; i <= width; i++) {
      this.bgGraphics.moveTo(i * cellSize, 0);
      this.bgGraphics.lineTo(i * cellSize, totalH);
      this.bgGraphics.stroke();
    }
    for (let i = 0; i <= height; i++) {
      this.bgGraphics.moveTo(0, i * cellSize);
      this.bgGraphics.lineTo(totalW, i * cellSize);
      this.bgGraphics.stroke();
    }

    // ─── Maze walls ───
    this.mazeGraphics.setStrokeStyle({ width: 4, color: 0x7d6fa8, cap: 'round' });

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

  setShowClawBox(show: boolean) {
    this.showClawBox = show;
    if (!show) this.clawBoxGraphics.clear();
  }

  setClaw(pos: Vec2) {
    this.clawContainer.x = pos.x;
    this.clawContainer.y = pos.y;

    // Show claw bounding box for early levels (training)
    if (this.showClawBox) {
      this.clawBoxGraphics.clear();
      this.clawBoxGraphics.rect(
        pos.x - CLAW_BOX_SIZE / 2,
        pos.y - CLAW_BOX_SIZE / 2,
        CLAW_BOX_SIZE,
        CLAW_BOX_SIZE,
      );
      this.clawBoxGraphics.setStrokeStyle({ width: 1.5, color: 0x7ecbf5, alpha: 0.6 });
      this.clawBoxGraphics.stroke();
    }
  }

  setDoll(pos: Vec2, type: number) {
    this.dollContainer.removeChildren();
    this.dollContainer.x = pos.x;
    this.dollContainer.y = pos.y;

    const dollGraphics = drawDoll(type);
    this.dollContainer.addChild(dollGraphics);

    // Doll box indicator
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

  // ─── Obstacles (scary dolls) ───

  getObstacleContainer(): Container {
    return this.obstacleContainer;
  }

  clearObstacles() {
    this.obstacleContainer.removeChildren();
  }

  updateAnimations(frame: number) {
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
