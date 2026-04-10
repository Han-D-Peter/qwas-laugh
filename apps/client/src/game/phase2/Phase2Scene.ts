import { Container, Graphics, Text } from 'pixi.js';
import type { Phase2Path } from '@qwas/shared';
import { CLAW_BOX_SIZE, DOLL_BOX_SIZE } from '@qwas/shared';
import { drawClaw } from '../sprites/claw.js';
import { drawDoll } from '../sprites/doll.js';
import { buildDollPile } from '../sprites/dollPile.js';
import { buildWallDollLine } from '../sprites/wallDolls.js';
import { ARCADE } from '../../theme/arcade.js';

interface FallingStar {
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
}

export class Phase2Scene {
  private parent: Container;
  private container: Container;
  private pathGraphics: Graphics;
  private clawContainer: Container;
  private dollContainer: Container;
  private clawBoxGraphics: Graphics;
  private dollBoxGraphics: Graphics;
  private bgGraphics: Graphics;
  private dollPileContainer: Container;
  private wallDollContainer: Container;
  private scanlineGraphics: Graphics;
  private starGraphics: Graphics;
  private prizeLabel: Text | null = null;

  private path: Phase2Path | null = null;
  private stars: FallingStar[] = [];
  private lastBgRange: { minX: number; maxX: number; totalH: number } | null = null;

  constructor(parent: Container) {
    this.parent = parent;
    this.container = new Container();
    this.container.visible = false;

    this.bgGraphics = new Graphics();
    this.dollPileContainer = new Container();
    this.wallDollContainer = new Container();
    this.scanlineGraphics = new Graphics();
    this.starGraphics = new Graphics();
    this.pathGraphics = new Graphics();
    this.clawContainer = new Container();
    this.dollContainer = new Container();
    this.clawBoxGraphics = new Graphics();
    this.dollBoxGraphics = new Graphics();

    this.container.addChild(this.bgGraphics);
    this.container.addChild(this.dollPileContainer);
    this.container.addChild(this.scanlineGraphics);
    this.container.addChild(this.starGraphics);
    this.container.addChild(this.pathGraphics);
    this.container.addChild(this.wallDollContainer);
    this.container.addChild(this.dollContainer);
    this.container.addChild(this.dollBoxGraphics);
    this.container.addChild(this.clawContainer);
    this.container.addChild(this.clawBoxGraphics);

    parent.addChild(this.container);
  }

  show() { this.container.visible = true; }
  hide() { this.container.visible = false; }
  isVisible(): boolean { return this.container.visible; }

  getClawContainer(): Container { return this.clawContainer; }
  getDollContainer(): Container { return this.dollContainer; }
  getPath(): Phase2Path | null { return this.path; }

  buildPath(path: Phase2Path, dollType: number) {
    this.path = path;
    this.pathGraphics.clear();
    this.bgGraphics.clear();
    this.scanlineGraphics.clear();
    this.dollPileContainer.removeChildren();
    this.wallDollContainer.removeChildren();
    if (this.prizeLabel) {
      this.prizeLabel.destroy();
      this.prizeLabel = null;
    }

    const minX = Math.min(...path.leftWall.map(p => p.x)) - 120;
    const maxX = Math.max(...path.rightWall.map(p => p.x)) + 120;
    const totalW = maxX - minX;
    const totalH = path.totalLength + 140;

    this.lastBgRange = { minX, maxX, totalH };

    // ─── Background cabinet walls ───
    // Outer frame
    this.bgGraphics.rect(minX - 10, -50, totalW + 20, totalH + 10);
    this.bgGraphics.fill({ color: ARCADE.MID_NAVY, alpha: 0.85 });
    this.bgGraphics.setStrokeStyle({ width: 3, color: ARCADE.NEON_PINK, alpha: 0.9 });
    this.bgGraphics.stroke();

    // Interior
    this.bgGraphics.rect(minX, -40, totalW, totalH);
    this.bgGraphics.fill({ color: ARCADE.DEEP_NAVY, alpha: 0.95 });

    // Vertical darkening gradient hint
    const gradSteps = 8;
    for (let i = 0; i < gradSteps; i++) {
      const stripH = totalH / gradSteps;
      const alpha = 0.02 + i * 0.01;
      this.bgGraphics.rect(minX, -40 + i * stripH, totalW, stripH);
      this.bgGraphics.fill({ color: 0x000000, alpha });
    }

    // ─── Doll pile background (fills entire descent area) ───
    const seed = Math.floor(path.totalLength * 37 + path.dollBoxX * 13);
    const pile = buildDollPile(totalW, totalH + 40, seed, 180);
    pile.x = minX;
    pile.y = -40;
    this.dollPileContainer.addChild(pile);

    // ─── Path walls: neon double-stroke ───
    // Outer glow pass
    this.pathGraphics.setStrokeStyle({ width: 8, color: ARCADE.NEON_PINK, alpha: 0.55, cap: 'round', join: 'round' });
    this.drawPathWalls(path);
    // Main neon body
    this.pathGraphics.setStrokeStyle({ width: 5, color: ARCADE.NEON_CYAN, alpha: 1, cap: 'round', join: 'round' });
    this.drawPathWalls(path);
    // Inner highlight
    this.pathGraphics.setStrokeStyle({ width: 1.5, color: 0xffffff, alpha: 1, cap: 'round', join: 'round' });
    this.drawPathWalls(path);

    // ─── Path interior fill (subtle purple glow) ───
    this.pathGraphics.moveTo(path.leftWall[0].x, path.leftWall[0].y);
    for (let i = 1; i < path.leftWall.length; i++) {
      this.pathGraphics.lineTo(path.leftWall[i].x, path.leftWall[i].y);
    }
    for (let i = path.rightWall.length - 1; i >= 0; i--) {
      this.pathGraphics.lineTo(path.rightWall[i].x, path.rightWall[i].y);
    }
    this.pathGraphics.closePath();
    this.pathGraphics.fill({ color: ARCADE.NEON_PURPLE, alpha: 0.12 });

    // ─── Dolls lining the path walls (decorative) ───
    // Left wall: push dolls slightly outside (negative offset in the perpendicular we compute)
    const wallSeed = seed ^ 0xc0ffee;
    const leftDolls = buildWallDollLine(path.leftWall, wallSeed, -10, 46);
    const rightDolls = buildWallDollLine(path.rightWall, wallSeed ^ 0xdeadbeef, 10, 46);
    this.wallDollContainer.addChild(leftDolls);
    this.wallDollContainer.addChild(rightDolls);

    // ─── Draw target doll at bottom ───
    this.dollContainer.removeChildren();
    const dollGfx = drawDoll(dollType);
    dollGfx.scale.set(1.2);
    this.dollContainer.addChild(dollGfx);
    this.dollContainer.x = path.dollBoxX;
    this.dollContainer.y = path.totalLength - 180;

    // Target box — neon amber
    this.dollBoxGraphics.clear();
    this.dollBoxGraphics.rect(
      path.dollBoxX - DOLL_BOX_SIZE / 2 - 2,
      path.totalLength - 180 - DOLL_BOX_SIZE / 2 - 2,
      DOLL_BOX_SIZE + 4,
      DOLL_BOX_SIZE + 4,
    );
    this.dollBoxGraphics.fill({ color: ARCADE.NEON_AMBER, alpha: 0.15 });
    this.dollBoxGraphics.rect(
      path.dollBoxX - DOLL_BOX_SIZE / 2,
      path.totalLength - 180 - DOLL_BOX_SIZE / 2,
      DOLL_BOX_SIZE,
      DOLL_BOX_SIZE,
    );
    this.dollBoxGraphics.fill({ color: ARCADE.NEON_AMBER, alpha: 0.2 });
    this.dollBoxGraphics.setStrokeStyle({ width: 2, color: ARCADE.NEON_AMBER, alpha: 1 });
    this.dollBoxGraphics.stroke();

    // "PRIZE" label above doll
    this.prizeLabel = new Text({
      text: 'PRIZE',
      style: {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 14,
        fill: ARCADE.NEON_AMBER,
        letterSpacing: 3,
      },
    });
    this.prizeLabel.anchor.set(0.5);
    this.prizeLabel.x = path.dollBoxX;
    this.prizeLabel.y = path.totalLength - 180 - 40;
    this.container.addChild(this.prizeLabel);

    // ─── CRT scanlines over the whole area ───
    for (let y = -40; y < totalH; y += 3) {
      this.scanlineGraphics.rect(minX, y, totalW, 1);
      this.scanlineGraphics.fill({ color: 0x000000, alpha: 0.2 });
    }

    // ─── Init falling stars ───
    this.stars = [];
    const starCount = 30;
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: minX + Math.random() * totalW,
        y: Math.random() * totalH - 40,
        vy: 0.3 + Math.random() * 1.2,
        size: 0.8 + Math.random() * 1.4,
        alpha: 0.3 + Math.random() * 0.5,
        color: Math.random() < 0.5 ? ARCADE.NEON_CYAN : ARCADE.NEON_PINK,
      });
    }
  }

  private drawPathWalls(path: Phase2Path) {
    this.pathGraphics.moveTo(path.leftWall[0].x, path.leftWall[0].y);
    for (let i = 1; i < path.leftWall.length; i++) {
      this.pathGraphics.lineTo(path.leftWall[i].x, path.leftWall[i].y);
    }
    this.pathGraphics.stroke();
    this.pathGraphics.moveTo(path.rightWall[0].x, path.rightWall[0].y);
    for (let i = 1; i < path.rightWall.length; i++) {
      this.pathGraphics.lineTo(path.rightWall[i].x, path.rightWall[i].y);
    }
    this.pathGraphics.stroke();
  }

  setClaw(x: number, y: number) {
    this.clawContainer.x = x;
    this.clawContainer.y = y;

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

    // Scanline drift
    this.scanlineGraphics.y = (frame * 0.5) % 3 - 3;

    // Falling stars
    if (this.lastBgRange) {
      const { minX, maxX, totalH } = this.lastBgRange;
      this.starGraphics.clear();
      for (const s of this.stars) {
        s.y += s.vy;
        if (s.y > totalH) {
          s.y = -40;
          s.x = minX + Math.random() * (maxX - minX);
        }
        this.starGraphics.rect(s.x - s.size, s.y - s.size / 4, s.size * 2, s.size / 2);
        this.starGraphics.fill({ color: s.color, alpha: s.alpha });
        this.starGraphics.rect(s.x - s.size / 4, s.y - s.size, s.size / 2, s.size * 2);
        this.starGraphics.fill({ color: s.color, alpha: s.alpha });
      }
    }

    // "PRIZE" label pulse
    if (this.prizeLabel) {
      this.prizeLabel.alpha = 0.75 + Math.sin(frame * 0.08) * 0.25;
    }

    // Background doll pile subtle sway
    this.dollPileContainer.rotation = Math.sin(frame * 0.004) * 0.003;

    // Wall dolls subtle bob
    this.wallDollContainer.y = Math.sin(frame * 0.025) * 0.8;
  }
}
