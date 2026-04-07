import { Application, Container } from 'pixi.js';
import {
  generateMaze, placeDoll, getDifficultyConfig,
  CELL_SIZE, CLAW_BOX_SIZE, DOLL_BOX_SIZE, OVERLAP_THRESHOLD,
  calculateOverlap,
  checkMazeCollision,
} from '@qwas/shared';
import type { GameState, MazeData, Vec2 } from '@qwas/shared';
import { Phase1Scene } from './phase1/Phase1Scene.js';

export interface GameInfo {
  level: number;
  coins: number;
  phase: string;
  overlapPercent: number;
  lastResult: string | null;
}

export class GameEngine {
  private app: Application;
  private worldContainer!: Container;
  private phase1Scene!: Phase1Scene;
  private onInfoUpdate: (info: GameInfo) => void;

  // Game state
  private level = 1;
  private coins = 0;
  private phase: 'phase1' | 'phase2' | 'result' = 'phase1';

  // Phase 1 state
  private maze!: MazeData;
  private clawPos: Vec2 = { x: 0, y: 0 };
  private clawDir: Vec2 = { x: 1, y: 0 };
  private clawSpeed = 2;
  private dollPos: Vec2 = { x: 0, y: 0 };
  private startPos: Vec2 = { x: 0, y: 0 };

  // Camera
  private cameraTarget: Vec2 = { x: 0, y: 0 };

  // Input
  private lastOverlap = 0;
  private lastResult: string | null = null;
  private animFrame = 0;
  private running = false;
  private container: HTMLElement;
  private destroyed = false;
  private initPromise: Promise<void>;

  constructor(container: HTMLElement, onInfoUpdate: (info: GameInfo) => void) {
    this.container = container;
    this.onInfoUpdate = onInfoUpdate;
    this.app = new Application();
    this.initPromise = this.init();
  }

  private async init() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    try {
      await this.app.init({
        width,
        height,
        background: '#e8dff5',
        antialias: true,
      });
    } catch {
      // Fallback: try without antialias
      await this.app.init({
        width,
        height,
        background: '#e8dff5',
        antialias: false,
      });
    }
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.container.appendChild(this.app.canvas);

    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.phase1Scene = new Phase1Scene(this.worldContainer);

    this.setupLevel(this.level);
    this.setupInput();
    this.running = true;
    this.gameLoop();
  }

  private setupLevel(level: number) {
    const config = getDifficultyConfig(level);
    const seed = Date.now();

    this.maze = generateMaze(config.mazeWidth, config.mazeHeight, seed);
    this.clawSpeed = config.clawSpeed;

    // Place claw at center
    const centerX = Math.floor(this.maze.width / 2) * CELL_SIZE + CELL_SIZE / 2;
    const centerY = Math.floor(this.maze.height / 2) * CELL_SIZE + CELL_SIZE / 2;
    this.clawPos = { x: centerX, y: centerY };
    this.startPos = { ...this.clawPos };

    // Random initial direction
    const dirs: Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    this.clawDir = dirs[Math.floor(Math.random() * dirs.length)];

    // Place doll
    this.dollPos = placeDoll(this.maze, config.dollMinDistance, seed);

    // Render maze
    this.phase1Scene.buildMaze(this.maze);
    this.phase1Scene.setDoll(this.dollPos, level % 30);
    this.phase1Scene.setClaw(this.clawPos);

    this.lastOverlap = 0;
    this.lastResult = null;
    this.updateInfo();
  }

  private resetToStart() {
    this.clawPos = { ...this.startPos };
    const dirs: Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    this.clawDir = dirs[Math.floor(Math.random() * dirs.length)];
    this.coins++;
    this.lastOverlap = 0;
    this.updateInfo();
  }

  private setupInput() {
    const handleKey = (e: KeyboardEvent) => {
      if (this.destroyed) return;
      if (this.phase !== 'phase1') return;

      switch (e.key) {
        case 'ArrowUp':
          this.clawDir = { x: 0, y: -1 };
          e.preventDefault();
          break;
        case 'ArrowDown':
          this.clawDir = { x: 0, y: 1 };
          e.preventDefault();
          break;
        case 'ArrowLeft':
          this.clawDir = { x: -1, y: 0 };
          e.preventDefault();
          break;
        case 'ArrowRight':
          this.clawDir = { x: 1, y: 0 };
          e.preventDefault();
          break;
        case ' ':
          this.attemptGrab();
          e.preventDefault();
          break;
        case 'r':
        case 'R':
          this.restart();
          e.preventDefault();
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
  }

  private attemptGrab() {
    const clawBox = {
      x: this.clawPos.x - CLAW_BOX_SIZE / 2,
      y: this.clawPos.y - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE,
      height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: this.dollPos.x - DOLL_BOX_SIZE / 2,
      y: this.dollPos.y - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE,
      height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    this.lastOverlap = overlap * 100;

    if (overlap < OVERLAP_THRESHOLD) {
      // Fail - under 10%
      this.lastResult = 'fail';
      this.resetToStart();
    } else {
      // Success! In single-player MVP we use probability A directly
      // Full game would transition to Phase 2 here
      const probabilityA = overlap;
      const roll = Math.random();

      if (roll < probabilityA) {
        this.lastResult = 'success';
        this.level = Math.min(30, this.level + 1);
        setTimeout(() => {
          this.setupLevel(this.level);
        }, 2000);
      } else {
        this.lastResult = 'fail';
        this.coins++;
        this.resetToStart();
      }
    }
    this.updateInfo();
  }

  private gameLoop() {
    if (this.destroyed) return;

    if (this.running && this.phase === 'phase1') {
      // Move claw
      const newPos = {
        x: this.clawPos.x + this.clawDir.x * this.clawSpeed,
        y: this.clawPos.y + this.clawDir.y * this.clawSpeed,
      };

      // Check collision
      const newBox = {
        x: newPos.x - CLAW_BOX_SIZE / 2,
        y: newPos.y - CLAW_BOX_SIZE / 2,
        width: CLAW_BOX_SIZE,
        height: CLAW_BOX_SIZE,
      };

      if (checkMazeCollision(newBox, this.maze)) {
        this.resetToStart();
      } else {
        this.clawPos = newPos;
      }

      // Update rendering
      this.phase1Scene.setClaw(this.clawPos);

      // Camera follow with lerp
      this.updateCamera();
    }

    this.animFrame++;
    this.phase1Scene.updateAnimations(this.animFrame);

    requestAnimationFrame(() => this.gameLoop());
  }

  private updateCamera() {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;

    const targetX = -this.clawPos.x + screenW / 2;
    const targetY = -this.clawPos.y + screenH / 2;

    const lerpFactor = 0.08;
    this.worldContainer.x += (targetX - this.worldContainer.x) * lerpFactor;
    this.worldContainer.y += (targetY - this.worldContainer.y) * lerpFactor;
  }

  private updateInfo() {
    this.onInfoUpdate({
      level: this.level,
      coins: this.coins,
      phase: this.phase,
      overlapPercent: this.lastOverlap,
      lastResult: this.lastResult,
    });
  }

  restart() {
    this.level = 1;
    this.coins = 0;
    this.phase = 'phase1';
    this.setupLevel(this.level);
  }

  destroy() {
    this.destroyed = true;
    this.running = false;
    try {
      this.app.destroy(true);
    } catch {
      // PixiJS may throw during destroy if init didn't complete
    }
  }
}
