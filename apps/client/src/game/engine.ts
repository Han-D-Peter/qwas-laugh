import { Application, Container } from 'pixi.js';
import {
  generateMaze, placeDoll, getDifficultyConfig, applyIrregularBorders,
  CELL_SIZE, CLAW_BOX_SIZE, DOLL_BOX_SIZE, OVERLAP_THRESHOLD,
  calculateOverlap,
  checkMazeCollision,
  generatePhase2Path,
} from '@qwas/shared';
import type { MazeData, Vec2, DifficultyConfig } from '@qwas/shared';
import type { Phase2Path } from '@qwas/shared';
import { Phase1Scene } from './phase1/Phase1Scene.js';
import { Phase2Scene } from './phase2/Phase2Scene.js';
import { runSuspenseAnimation } from './animations/suspense.js';

export interface GameInfo {
  level: number;
  coins: number;
  phase: string;
  overlapPercent: number;
  lastResult: string | null;
  suspenseProgress: number;
  suspensePhase: string;
}

type GamePhase = 'phase1' | 'phase1_to_phase2' | 'phase2_countdown' | 'phase2' | 'suspense' | 'result';

export class GameEngine {
  private app: Application;
  private worldContainer!: Container;
  private phase1Scene!: Phase1Scene;
  private phase2Scene!: Phase2Scene;
  private onInfoUpdate: (info: GameInfo) => void;

  // Game state
  private level = 1;
  private coins = 0;
  private phase: GamePhase = 'phase1';
  private config!: DifficultyConfig;

  // Phase 1 state
  private maze!: MazeData;
  private clawPos: Vec2 = { x: 0, y: 0 };
  private clawDir: Vec2 = { x: 1, y: 0 };
  private clawSpeed = 2;
  private dollPos: Vec2 = { x: 0, y: 0 };
  private startPos: Vec2 = { x: 0, y: 0 };
  private probabilityA = 0;

  // Phase 2 state
  private p2Path: Phase2Path | null = null;
  private p2ClawX = 200;
  private p2ClawY = 0;
  private p2DescentSpeed = 1.5;
  private p2DriftOffset = 0;
  private p2DriftTime = 0;
  private p2Countdown = 0;
  private probabilityB = 0;

  // Shared
  private animFrame = 0;
  private running = false;
  private container: HTMLElement;
  private destroyed = false;
  private lastOverlap = 0;
  private lastResult: string | null = null;
  private suspenseProgress = 0;
  private suspensePhase = '';
  private seed = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, onInfoUpdate: (info: GameInfo) => void) {
    this.container = container;
    this.onInfoUpdate = onInfoUpdate;
    this.app = new Application();
    this.init();
  }

  private async init() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    try {
      await this.app.init({ width, height, background: '#e8dff5', antialias: true });
    } catch {
      await this.app.init({ width, height, background: '#e8dff5', antialias: false });
    }
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.container.appendChild(this.app.canvas);

    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.phase1Scene = new Phase1Scene(this.worldContainer);
    this.phase2Scene = new Phase2Scene(this.worldContainer);

    this.setupLevel(this.level);
    this.setupInput();
    this.running = true;
    this.gameLoop();
  }

  // ─── Level Setup ───────────────────────────────────────────────

  private setupLevel(level: number) {
    this.config = getDifficultyConfig(level);
    this.seed = Date.now();
    this.phase = 'phase1';

    this.maze = generateMaze(this.config.mazeWidth, this.config.mazeHeight, this.seed);
    if (this.config.irregularBorders) {
      applyIrregularBorders(this.maze, this.config.irregularComplexity, this.seed);
    }
    this.clawSpeed = this.config.clawSpeed;

    const centerX = Math.floor(this.maze.width / 2) * CELL_SIZE + CELL_SIZE / 2;
    const centerY = Math.floor(this.maze.height / 2) * CELL_SIZE + CELL_SIZE / 2;
    this.clawPos = { x: centerX, y: centerY };
    this.startPos = { ...this.clawPos };

    const dirs: Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    this.clawDir = dirs[Math.floor(Math.random() * dirs.length)];

    this.dollPos = placeDoll(this.maze, this.config.dollMinDistance, this.seed);

    this.phase1Scene.buildMaze(this.maze);
    this.phase1Scene.setDoll(this.dollPos, level % 30);
    this.phase1Scene.setClaw(this.clawPos);
    this.phase1Scene.show();
    this.phase2Scene.hide();

    this.probabilityA = 0;
    this.probabilityB = 0;
    this.lastOverlap = 0;
    this.lastResult = null;
    this.suspenseProgress = 0;
    this.suspensePhase = '';
    this.updateInfo();
  }

  private resetPhase1() {
    this.clawPos = { ...this.startPos };
    const dirs: Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    this.clawDir = dirs[Math.floor(Math.random() * dirs.length)];
    this.coins++;
    this.phase = 'phase1';
    this.probabilityA = 0;
    this.probabilityB = 0;
    this.lastOverlap = 0;

    this.phase1Scene.show();
    this.phase2Scene.hide();
    this.updateInfo();
  }

  // ─── Input ─────────────────────────────────────────────────────

  private setupInput() {
    this.keyHandler = (e: KeyboardEvent) => {
      if (this.destroyed) return;

      // Phase 1 controls — diagonal at higher levels
      if (this.phase === 'phase1') {
        const diag = this.config.diagonalPlayerCount >= 4;
        const d = 0.707; // 1/sqrt(2)
        switch (e.key) {
          case 'ArrowUp':    this.clawDir = diag ? { x: -d, y: -d } : { x: 0, y: -1 }; e.preventDefault(); break;
          case 'ArrowDown':  this.clawDir = diag ? { x: d, y: d }   : { x: 0, y: 1 };  e.preventDefault(); break;
          case 'ArrowLeft':  this.clawDir = diag ? { x: -d, y: d }  : { x: -1, y: 0 }; e.preventDefault(); break;
          case 'ArrowRight': this.clawDir = diag ? { x: d, y: -d }  : { x: 1, y: 0 };  e.preventDefault(); break;
          case ' ': this.attemptPhase1Grab(); e.preventDefault(); break;
        }
      }

      // Phase 2 controls
      if (this.phase === 'phase2') {
        switch (e.key) {
          case 'ArrowLeft':  this.p2ClawX -= 6; e.preventDefault(); break;
          case 'ArrowRight': this.p2ClawX += 6; e.preventDefault(); break;
          case ' ': this.attemptPhase2Grab(); e.preventDefault(); break;
        }
      }

      // Universal
      if (e.key === 'r' || e.key === 'R') {
        this.restart();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  // ─── Phase 1 Grab ──────────────────────────────────────────────

  private attemptPhase1Grab() {
    const clawBox = {
      x: this.clawPos.x - CLAW_BOX_SIZE / 2,
      y: this.clawPos.y - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE, height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: this.dollPos.x - DOLL_BOX_SIZE / 2,
      y: this.dollPos.y - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE, height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    this.lastOverlap = overlap * 100;

    if (overlap < OVERLAP_THRESHOLD) {
      this.lastResult = 'fail';
      this.resetPhase1();
    } else {
      this.probabilityA = overlap;
      this.transitionToPhase2();
    }
    this.updateInfo();
  }

  // ─── Phase 1 → Phase 2 Transition ─────────────────────────────

  private transitionToPhase2() {
    this.phase = 'phase1_to_phase2';
    this.lastResult = null;
    this.updateInfo();

    // Short transition delay for visual effect
    setTimeout(() => {
      if (this.destroyed) return;
      this.startPhase2();
    }, 800);
  }

  private startPhase2() {
    this.p2Path = generatePhase2Path(
      this.config.phase2PathLength,
      this.config.phase2PathWidth,
      this.config.phase2Segments,
      this.config.phase2DriftAmplitude,
      this.seed + 7777,
    );

    this.p2ClawX = this.p2Path.centerLine[0].x;
    this.p2ClawY = 0;
    this.p2DescentSpeed = 1.2 + this.level * 0.05;
    this.p2DriftOffset = 0;
    this.p2DriftTime = 0;

    this.phase1Scene.hide();
    this.phase2Scene.show();
    this.phase2Scene.buildPath(this.p2Path, this.level % 30);
    this.phase2Scene.setClaw(this.p2ClawX, this.p2ClawY);

    // Countdown before controls activate
    this.phase = 'phase2_countdown';
    this.p2Countdown = 3;
    this.updateInfo();

    const countdownInterval = setInterval(() => {
      if (this.destroyed) { clearInterval(countdownInterval); return; }
      this.p2Countdown--;
      this.updateInfo();
      if (this.p2Countdown <= 0) {
        clearInterval(countdownInterval);
        this.phase = 'phase2';
        this.updateInfo();
      }
    }, 1000);
  }

  // ─── Phase 2 Grab ──────────────────────────────────────────────

  private attemptPhase2Grab() {
    if (!this.p2Path) return;

    const clawBox = {
      x: this.p2ClawX - CLAW_BOX_SIZE / 2,
      y: this.p2ClawY - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE, height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: this.p2Path.dollBoxX - DOLL_BOX_SIZE / 2,
      y: this.p2Path.totalLength - 20 - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE, height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    this.lastOverlap = overlap * 100;

    if (overlap < OVERLAP_THRESHOLD) {
      this.lastResult = 'fail';
      this.coins++;
      // Go back to Phase 1 start (same level)
      this.phase = 'result';
      this.updateInfo();
      setTimeout(() => {
        if (this.destroyed) return;
        this.resetPhase1();
        // Re-setup the current level's Phase 1
        this.setupLevel(this.level);
      }, 1500);
    } else {
      this.probabilityB = overlap;
      this.startSuspense();
    }
    this.updateInfo();
  }

  // ─── Suspense & Final Result ───────────────────────────────────

  private async startSuspense() {
    this.phase = 'suspense';
    this.updateInfo();

    const finalProbability = this.probabilityA * this.probabilityB;

    const success = await runSuspenseAnimation(
      finalProbability,
      (progress, phase) => {
        this.suspenseProgress = progress;
        this.suspensePhase = phase;
        this.updateInfo();
      },
    );

    this.phase = 'result';
    if (success) {
      this.lastResult = 'success';
      this.updateInfo();
      setTimeout(() => {
        if (this.destroyed) return;
        this.level = Math.min(30, this.level + 1);
        this.setupLevel(this.level);
      }, 2000);
    } else {
      this.lastResult = 'fail';
      this.coins++;
      this.updateInfo();
      setTimeout(() => {
        if (this.destroyed) return;
        this.setupLevel(this.level);
      }, 1500);
    }
  }

  // ─── Game Loop ─────────────────────────────────────────────────

  private gameLoop() {
    if (this.destroyed) return;

    if (this.running) {
      if (this.phase === 'phase1') {
        this.updatePhase1();
      } else if (this.phase === 'phase2') {
        this.updatePhase2();
      }
    }

    this.animFrame++;
    if (this.phase === 'phase1' || this.phase === 'phase1_to_phase2') {
      this.phase1Scene.updateAnimations(this.animFrame);
    }
    if (this.phase === 'phase2' || this.phase === 'phase2_countdown' || this.phase === 'suspense') {
      this.phase2Scene.updateAnimations(this.animFrame);
    }

    requestAnimationFrame(() => this.gameLoop());
  }

  private updatePhase1() {
    const newPos = {
      x: this.clawPos.x + this.clawDir.x * this.clawSpeed,
      y: this.clawPos.y + this.clawDir.y * this.clawSpeed,
    };
    const newBox = {
      x: newPos.x - CLAW_BOX_SIZE / 2,
      y: newPos.y - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE, height: CLAW_BOX_SIZE,
    };

    if (checkMazeCollision(newBox, this.maze)) {
      this.resetPhase1();
    } else {
      this.clawPos = newPos;
    }

    this.phase1Scene.setClaw(this.clawPos);
    this.updatePhase1Camera();
  }

  private updatePhase2() {
    if (!this.p2Path) return;

    // Descent
    this.p2ClawY += this.p2DescentSpeed;

    // Random lateral drift
    this.p2DriftTime += 0.02;
    const driftForce = Math.sin(this.p2DriftTime * this.config.phase2DriftFrequency * 3)
      * this.config.phase2DriftAmplitude * 0.4;
    this.p2ClawX += driftForce;

    // Check wall collision using center-line interpolation
    const collision = this.checkPhase2Collision();
    if (collision) {
      this.lastResult = 'fail';
      this.coins++;
      this.phase = 'result';
      this.updateInfo();
      setTimeout(() => {
        if (this.destroyed) return;
        this.setupLevel(this.level);
      }, 1500);
      return;
    }

    // Auto-grab when reaching the bottom
    if (this.p2ClawY >= this.p2Path.totalLength - 30) {
      this.attemptPhase2Grab();
      return;
    }

    this.phase2Scene.setClaw(this.p2ClawX, this.p2ClawY);
    this.updatePhase2Camera();
  }

  private checkPhase2Collision(): boolean {
    if (!this.p2Path) return false;

    const { leftWall, rightWall } = this.p2Path;
    const halfClaw = CLAW_BOX_SIZE / 2;

    // Find surrounding wall segment for current Y
    for (let i = 0; i < leftWall.length - 1; i++) {
      if (this.p2ClawY >= leftWall[i].y && this.p2ClawY <= leftWall[i + 1].y) {
        const t = (this.p2ClawY - leftWall[i].y) / (leftWall[i + 1].y - leftWall[i].y || 1);
        const lx = leftWall[i].x + t * (leftWall[i + 1].x - leftWall[i].x);
        const rx = rightWall[i].x + t * (rightWall[i + 1].x - rightWall[i].x);

        if (this.p2ClawX - halfClaw < lx || this.p2ClawX + halfClaw > rx) {
          return true;
        }
        return false;
      }
    }

    // Out of bounds
    return this.p2ClawY > 0 && this.p2ClawY < this.p2Path.totalLength;
  }

  // ─── Camera ────────────────────────────────────────────────────

  private updatePhase1Camera() {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const targetX = -this.clawPos.x + screenW / 2;
    const targetY = -this.clawPos.y + screenH / 2;
    this.worldContainer.x += (targetX - this.worldContainer.x) * 0.08;
    this.worldContainer.y += (targetY - this.worldContainer.y) * 0.08;
  }

  private updatePhase2Camera() {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const targetX = -this.p2ClawX + screenW / 2;
    const targetY = -this.p2ClawY + screenH / 2;
    this.worldContainer.x += (targetX - this.worldContainer.x) * 0.1;
    this.worldContainer.y += (targetY - this.worldContainer.y) * 0.1;
  }

  // ─── Info & Lifecycle ──────────────────────────────────────────

  private updateInfo() {
    this.onInfoUpdate({
      level: this.level,
      coins: this.coins,
      phase: this.phase,
      overlapPercent: this.lastOverlap,
      lastResult: this.lastResult,
      suspenseProgress: this.suspenseProgress,
      suspensePhase: this.suspensePhase,
    });
  }

  /**
   * Apply authoritative server state for multiplayer rendering.
   * Replaces local simulation with server data.
   */
  applyServerState(state: import('@qwas/shared').GameState) {
    this.level = state.level;
    this.coins = state.coins;
    this.lastResult = state.lastResult;

    // Phase 1 rendering from server state
    if (state.phase === 'phase1' && state.maze) {
      if (this.phase !== 'phase1' || !this.maze || this.maze.seed !== state.maze.seed) {
        this.maze = state.maze;
        this.config = getDifficultyConfig(state.level);
        this.phase1Scene.buildMaze(state.maze);
        this.phase1Scene.setDoll(state.doll.position, state.doll.type);
        this.phase1Scene.show();
        this.phase2Scene.hide();
      }
      this.clawPos = { ...state.claw.position };
      this.phase1Scene.setClaw(this.clawPos);
      this.updatePhase1Camera();
      this.phase = 'phase1';
    }

    // Phase 2 rendering from server state
    if (state.phase === 'phase2' && state.phase2) {
      if (this.phase !== 'phase2') {
        this.config = getDifficultyConfig(state.level);
        const p2 = state.phase2;
        this.p2Path = {
          centerLine: p2.pathPoints,
          leftWall: p2.wallLeft,
          rightWall: p2.wallRight,
          totalLength: p2.wallLeft[p2.wallLeft.length - 1]?.y || 500,
          pathWidth: p2.pathWidth,
          dollBoxX: p2.dollBox.x + p2.dollBox.width / 2,
        };
        this.phase1Scene.hide();
        this.phase2Scene.show();
        this.phase2Scene.buildPath(this.p2Path, state.doll.type);
      }
      this.p2ClawX = state.phase2.clawX;
      this.p2ClawY = state.phase2.clawY;
      this.phase2Scene.setClaw(this.p2ClawX, this.p2ClawY);
      this.updatePhase2Camera();
      this.phase = 'phase2';
    }

    if (state.phase === 'result') {
      this.phase = 'result' as any;
    }

    this.updateInfo();
  }

  restart() {
    this.level = 1;
    this.coins = 0;
    this.setupLevel(this.level);
  }

  destroy() {
    this.destroyed = true;
    this.running = false;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
    try { this.app.destroy(true); } catch { /* noop */ }
  }
}
