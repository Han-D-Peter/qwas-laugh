import { Container, Graphics, Text } from 'pixi.js';
import type { MazeData, Vec2 } from '@qwas/shared';
import { CLAW_BOX_SIZE, DOLL_BOX_SIZE } from '@qwas/shared';
import { drawClaw } from '../sprites/claw.js';
import { drawDoll } from '../sprites/doll.js';
import { buildDollPile } from '../sprites/dollPile.js';
import { buildWallDolls } from '../sprites/wallDolls.js';
import { ARCADE } from '../../theme/arcade.js';

export class Phase1Scene {
  private parent: Container;
  private container: Container;
  private bgGraphics: Graphics;
  private dollPileContainer: Container;
  private scanlineGraphics: Graphics;
  private mazeGraphics: Graphics;
  private wallDollContainer: Container;
  private clawContainer: Container;
  private clawBoxGraphics: Graphics;
  private dollContainer: Container;
  private dollBoxGraphics: Graphics;
  private obstacleContainer: Container;
  private spotlightGraphics: Graphics;
  private marqueeText: Text | null = null;
  private showClawBox = false;

  // Entry animation state
  private introFrame = 0;
  private introActive = false;

  constructor(parent: Container) {
    this.parent = parent;
    this.container = new Container();
    this.bgGraphics = new Graphics();
    this.dollPileContainer = new Container();
    this.scanlineGraphics = new Graphics();
    this.mazeGraphics = new Graphics();
    this.wallDollContainer = new Container();
    this.clawContainer = new Container();
    this.clawBoxGraphics = new Graphics();
    this.dollContainer = new Container();
    this.dollBoxGraphics = new Graphics();
    this.obstacleContainer = new Container();
    this.spotlightGraphics = new Graphics();

    // Z-order: background → doll pile → scanlines → maze walls → wall dolls →
    // obstacles → target doll → target box → claw box → claw → spotlight
    this.container.addChild(this.bgGraphics);
    this.container.addChild(this.dollPileContainer);
    this.container.addChild(this.scanlineGraphics);
    this.container.addChild(this.mazeGraphics);
    this.container.addChild(this.wallDollContainer);
    this.container.addChild(this.obstacleContainer);
    this.container.addChild(this.dollContainer);
    this.container.addChild(this.dollBoxGraphics);
    this.container.addChild(this.clawBoxGraphics);
    this.container.addChild(this.clawContainer);
    this.container.addChild(this.spotlightGraphics);
    parent.addChild(this.container);
  }

  show() { this.container.visible = true; }
  hide() { this.container.visible = false; }
  isVisible(): boolean { return this.container.visible; }

  getClawContainer(): Container { return this.clawContainer; }
  getDollContainer(): Container { return this.dollContainer; }

  /** Start an intro animation where the claw drops in from above. */
  playIntro() {
    this.introFrame = 0;
    this.introActive = true;
  }

  buildMaze(maze: MazeData) {
    this.bgGraphics.clear();
    this.mazeGraphics.clear();
    this.scanlineGraphics.clear();
    this.spotlightGraphics.clear();
    this.dollPileContainer.removeChildren();
    this.wallDollContainer.removeChildren();
    if (this.marqueeText) {
      this.marqueeText.destroy();
      this.marqueeText = null;
    }

    const { width, height, cellSize } = maze;
    const totalW = width * cellSize;
    const totalH = height * cellSize;
    const pad = 40;

    // ─── Cabinet interior: deep navy gradient + neon frame ───
    // Outer glow frame (pink neon)
    this.bgGraphics.roundRect(-pad - 14, -pad - 14, totalW + (pad + 14) * 2, totalH + (pad + 14) * 2, 24);
    this.bgGraphics.fill({ color: ARCADE.NEON_PINK, alpha: 0.12 });

    // Inner cabinet body
    this.bgGraphics.roundRect(-pad - 8, -pad - 8, totalW + (pad + 8) * 2, totalH + (pad + 8) * 2, 20);
    this.bgGraphics.fill({ color: ARCADE.MID_NAVY, alpha: 0.85 });
    this.bgGraphics.setStrokeStyle({ width: 3, color: ARCADE.NEON_PINK, alpha: 0.9 });
    this.bgGraphics.stroke();

    // Inner play-field border (cyan)
    this.bgGraphics.roundRect(-pad, -pad, totalW + pad * 2, totalH + pad * 2, 16);
    this.bgGraphics.fill({ color: ARCADE.DARK_NAVY, alpha: 0.95 });
    this.bgGraphics.setStrokeStyle({ width: 2, color: ARCADE.NEON_CYAN, alpha: 0.9 });
    this.bgGraphics.stroke();

    // Play area (glass interior) — deep navy base
    this.bgGraphics.roundRect(0, 0, totalW, totalH, 10);
    this.bgGraphics.fill({ color: ARCADE.DEEP_NAVY, alpha: 0.85 });

    // Vertical gradient hint (few translucent stripes getting darker downward)
    const gradSteps = 6;
    for (let i = 0; i < gradSteps; i++) {
      const stripH = totalH / gradSteps;
      const alpha = 0.02 + i * 0.015;
      this.bgGraphics.rect(0, i * stripH, totalW, stripH);
      this.bgGraphics.fill({ color: 0x000000, alpha });
    }

    // Corner bolts — cyan glow
    const boltPositions = [
      [-pad + 12, -pad + 12], [totalW + pad - 12, -pad + 12],
      [-pad + 12, totalH + pad - 12], [totalW + pad - 12, totalH + pad - 12],
    ];
    for (const [bx, by] of boltPositions) {
      // Outer glow
      this.bgGraphics.circle(bx, by, 8);
      this.bgGraphics.fill({ color: ARCADE.NEON_CYAN, alpha: 0.25 });
      // Bolt
      this.bgGraphics.circle(bx, by, 5);
      this.bgGraphics.fill({ color: ARCADE.MID_NAVY, alpha: 1 });
      // Center shine
      this.bgGraphics.circle(bx, by, 2);
      this.bgGraphics.fill({ color: ARCADE.NEON_CYAN, alpha: 1 });
    }

    // Top marquee label band — pink with "CLAW MACHINE" text
    this.bgGraphics.roundRect(totalW * 0.15, -pad - 18, totalW * 0.7, 22, 6);
    this.bgGraphics.fill({ color: ARCADE.NEON_PINK, alpha: 0.65 });
    this.bgGraphics.setStrokeStyle({ width: 1, color: ARCADE.NEON_PINK, alpha: 1 });
    this.bgGraphics.stroke();

    this.marqueeText = new Text({
      text: 'CLAW  MACHINE',
      style: {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 11,
        fill: 0xffffff,
        letterSpacing: 2,
      },
    });
    this.marqueeText.anchor.set(0.5);
    this.marqueeText.x = totalW / 2;
    this.marqueeText.y = -pad - 7;
    this.bgGraphics.addChild(this.marqueeText);

    // Bottom prize chute opening
    const chuteW = 60;
    const chuteH = 14;
    this.bgGraphics.roundRect(totalW - chuteW - 20, totalH + pad - chuteH - 4, chuteW, chuteH, 4);
    this.bgGraphics.fill({ color: 0x000000, alpha: 1 });
    this.bgGraphics.setStrokeStyle({ width: 1.5, color: ARCADE.NEON_AMBER, alpha: 1 });
    this.bgGraphics.stroke();
    // Tiny "PRIZE" under chute
    this.bgGraphics.rect(totalW - chuteW - 20 + 10, totalH + pad - 2, chuteW - 20, 1);
    this.bgGraphics.fill({ color: ARCADE.NEON_AMBER, alpha: 0.6 });

    // Subtle grid — cyan dots at cell intersections
    for (let i = 0; i <= width; i++) {
      for (let j = 0; j <= height; j++) {
        this.bgGraphics.circle(i * cellSize, j * cellSize, 0.8);
        this.bgGraphics.fill({ color: ARCADE.NEON_CYAN, alpha: 0.22 });
      }
    }

    // ─── Doll pile background ───
    const pile = buildDollPile(totalW, totalH, maze.seed ?? 0, Math.min(120, width * height * 0.8));
    this.dollPileContainer.addChild(pile);

    // ─── Maze walls: neon double-stroke ───
    // First pass: outer glow stroke (thick, pink)
    this.mazeGraphics.setStrokeStyle({ width: 7, color: ARCADE.NEON_PINK, alpha: 0.55, cap: 'round', join: 'round' });
    this.strokeAllWalls(maze);
    // Middle pass: main neon body (cyan)
    this.mazeGraphics.setStrokeStyle({ width: 5, color: ARCADE.NEON_CYAN, alpha: 1, cap: 'round', join: 'round' });
    this.strokeAllWalls(maze);
    // Inner highlight (white)
    this.mazeGraphics.setStrokeStyle({ width: 1.5, color: 0xffffff, alpha: 1, cap: 'round', join: 'round' });
    this.strokeAllWalls(maze);

    // ─── Dolls lining the walls (decorative) ───
    const wallDolls = buildWallDolls(maze, maze.seed ?? 0);
    this.wallDollContainer.addChild(wallDolls);

    // ─── CRT scanlines ───
    const scanArea = {
      x: -pad - 14,
      y: -pad - 14,
      w: totalW + (pad + 14) * 2,
      h: totalH + (pad + 14) * 2,
    };
    for (let y = scanArea.y; y < scanArea.y + scanArea.h; y += 3) {
      this.scanlineGraphics.rect(scanArea.x, y, scanArea.w, 1);
      this.scanlineGraphics.fill({ color: 0x000000, alpha: 0.22 });
    }

    // ─── Spotlight cone from top ───
    this.drawSpotlight(totalW, totalH);
  }

  private strokeAllWalls(maze: MazeData) {
    const { cells, width, height, cellSize } = maze;
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

  private drawSpotlight(totalW: number, totalH: number) {
    // Approximate a downward cone of light with stacked triangles
    const cx = totalW / 2;
    const topY = -30;
    const bottomY = totalH;
    const topHalfWidth = 40;
    const bottomHalfWidth = totalW * 0.55;
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      const alpha = 0.06 * (1 - t);
      const thw = topHalfWidth + (bottomHalfWidth - topHalfWidth) * t;
      const bhw = topHalfWidth + (bottomHalfWidth - topHalfWidth) * (t + 1 / layers);
      this.spotlightGraphics.moveTo(cx - thw, topY + (bottomY - topY) * t);
      this.spotlightGraphics.lineTo(cx + thw, topY + (bottomY - topY) * t);
      this.spotlightGraphics.lineTo(cx + bhw, topY + (bottomY - topY) * (t + 1 / layers));
      this.spotlightGraphics.lineTo(cx - bhw, topY + (bottomY - topY) * (t + 1 / layers));
      this.spotlightGraphics.closePath();
      this.spotlightGraphics.fill({ color: ARCADE.NEON_CYAN, alpha });
    }
  }

  setShowClawBox(show: boolean) {
    this.showClawBox = show;
    if (!show) this.clawBoxGraphics.clear();
  }

  setClaw(pos: Vec2) {
    this.clawContainer.x = pos.x;
    this.clawContainer.y = pos.y;

    if (this.showClawBox) {
      this.clawBoxGraphics.clear();
      this.clawBoxGraphics.rect(
        pos.x - CLAW_BOX_SIZE / 2,
        pos.y - CLAW_BOX_SIZE / 2,
        CLAW_BOX_SIZE,
        CLAW_BOX_SIZE,
      );
      this.clawBoxGraphics.setStrokeStyle({ width: 1.5, color: ARCADE.NEON_CYAN, alpha: 0.6 });
      this.clawBoxGraphics.stroke();
    }
  }

  setDoll(pos: Vec2, type: number) {
    this.dollContainer.removeChildren();
    this.dollContainer.x = pos.x;
    this.dollContainer.y = pos.y;

    const dollGraphics = drawDoll(type);
    dollGraphics.scale.set(1.2); // target doll slightly larger
    this.dollContainer.addChild(dollGraphics);

    // Target indicator — neon amber frame (looks like the prize)
    this.dollBoxGraphics.clear();
    // Outer glow
    this.dollBoxGraphics.rect(
      pos.x - DOLL_BOX_SIZE / 2 - 2,
      pos.y - DOLL_BOX_SIZE / 2 - 2,
      DOLL_BOX_SIZE + 4,
      DOLL_BOX_SIZE + 4,
    );
    this.dollBoxGraphics.fill({ color: ARCADE.NEON_AMBER, alpha: 0.15 });
    this.dollBoxGraphics.rect(
      pos.x - DOLL_BOX_SIZE / 2,
      pos.y - DOLL_BOX_SIZE / 2,
      DOLL_BOX_SIZE,
      DOLL_BOX_SIZE,
    );
    this.dollBoxGraphics.fill({ color: ARCADE.NEON_AMBER, alpha: 0.2 });
    this.dollBoxGraphics.setStrokeStyle({ width: 2, color: ARCADE.NEON_AMBER, alpha: 1 });
    this.dollBoxGraphics.stroke();
  }

  // ─── Obstacles ───
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

    // Claw intro drop + bob
    const bobOffset = Math.sin(frame * 0.05) * 2;
    let introOffset = 0;
    if (this.introActive) {
      this.introFrame++;
      const introDur = 30;
      if (this.introFrame >= introDur) {
        this.introActive = false;
      } else {
        const t = 1 - this.introFrame / introDur;
        const ease = t * t * t;
        introOffset = -180 * ease;
      }
    }
    if (this.clawContainer.children[0]) {
      this.clawContainer.children[0].y = bobOffset + introOffset;
    }

    // Target doll bounce
    const dollBob = Math.sin(frame * 0.03 + 1) * 1.5;
    if (this.dollContainer.children[0]) {
      this.dollContainer.children[0].y = dollBob;
    }

    // Background pile gentle sway
    this.dollPileContainer.rotation = Math.sin(frame * 0.005) * 0.005;

    // Wall dolls subtle bob
    this.wallDollContainer.y = Math.sin(frame * 0.025) * 0.8;

    // Spotlight alpha pulse
    this.spotlightGraphics.alpha = 0.85 + Math.sin(frame * 0.02) * 0.15;

    // Scanlines drift (CRT interlace illusion)
    this.scanlineGraphics.y = (frame * 0.5) % 3 - 3;
  }
}
