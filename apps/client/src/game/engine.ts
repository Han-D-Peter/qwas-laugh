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
import { ObstacleManager } from './phase1/ObstacleManager.js';
import { runSuspenseAnimation } from './animations/suspense.js';

export interface GameInfo {
  level: number;
  coins: number;
  phase: string;
  overlapPercent: number;
  lastResult: string | null;
  suspenseProgress: number;
  suspensePhase: string;
  probabilityA: number;
  probabilityB: number;
  /** Phase 2 left player ID (null = not assigned) */
  p2LeftPlayerId: string | null;
  /** Phase 2 right player ID (null = not assigned) */
  p2RightPlayerId: string | null;
  /** Phase 2 countdown seconds remaining */
  p2Countdown: number;
}

type GamePhase = 'phase1' | 'phase1_to_phase2' | 'phase2_countdown' | 'phase2' | 'phase2_to_suspense' | 'suspense' | 'result';

export class GameEngine {
  private app: Application;
  private worldContainer!: Container;
  private phase1Scene!: Phase1Scene;
  private phase2Scene!: Phase2Scene;
  private obstacleManager!: ObstacleManager;
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
  private p2LeftPlayerId: string | null = null;
  private p2RightPlayerId: string | null = null;

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
  /**
   * When true, the engine only renders server state (no local simulation or input).
   * Used in multiplayer mode.
   */
  private remoteMode = false;
  private initDone = false;
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
    this.obstacleManager = new ObstacleManager(this.phase1Scene.getObstacleContainer());

    if (!this.remoteMode) {
      this.setupLevel(this.level);
      this.setupInput();
    }
    this.running = true;
    this.initDone = true;
    this.gameLoop();
  }

  // ─── Level Setup ───────────────────────────────────────────────

  private setupLevel(level: number) {
    this.config = getDifficultyConfig(level);
    this.seed = Date.now();
    this.phase = 'phase1';

    this.maze = generateMaze(this.config.mazeWidth, this.config.mazeHeight, this.seed, this.config.mazeCellSize);
    if (this.config.irregularBorders) {
      applyIrregularBorders(this.maze, this.config.irregularComplexity, this.seed);
    }
    this.clawSpeed = this.config.clawSpeed;

    const cs = this.maze.cellSize;
    const centerX = Math.floor(this.maze.width / 2) * cs + cs / 2;
    const centerY = Math.floor(this.maze.height / 2) * cs + cs / 2;
    this.clawPos = { x: centerX, y: centerY };
    this.startPos = { ...this.clawPos };

    this.clawDir = { x: 0, y: 0 };

    this.dollPos = placeDoll(this.maze, this.config.dollMinDistance, this.seed);

    this.phase1Scene.buildMaze(this.maze);
    this.phase1Scene.setDoll(this.dollPos, level % 30);
    this.phase1Scene.setShowClawBox(level <= 5);
    this.phase1Scene.setClaw(this.clawPos);
    this.phase1Scene.show();
    this.phase2Scene.hide();

    // Spawn ghost obstacles for mid+ levels
    this.obstacleManager.spawn(level, this.maze, this.seed);

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
    this.clawDir = { x: 0, y: 0 };
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

    // Hold the overlap/probability A display for 2.5 seconds
    setTimeout(() => {
      if (this.destroyed) return;
      this.startPhase2();
    }, 2500);
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

    // In local mode, randomly assign left/right to 2 virtual players
    if (!this.remoteMode) {
      this.p2LeftPlayerId = 'local-left';
      this.p2RightPlayerId = 'local-right';
    }

    this.phase1Scene.hide();
    this.phase2Scene.show();
    this.phase2Scene.buildPath(this.p2Path, this.level % 30);
    this.phase2Scene.setClaw(this.p2ClawX, this.p2ClawY);

    // Countdown with role display
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

  /** Called by App when server announces Phase 2 player assignments */
  setPhase2Players(leftId: string, rightId: string) {
    this.p2LeftPlayerId = leftId;
    this.p2RightPlayerId = rightId;
    this.updateInfo();
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
      y: this.p2Path.totalLength - 180 - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE, height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    this.lastOverlap = overlap * 100;

    if (overlap < OVERLAP_THRESHOLD) {
      this.lastResult = 'fail';
      this.coins++;
      this.phase = 'result';
      this.updateInfo();
      setTimeout(() => {
        if (this.destroyed) return;
        this.setupLevel(this.level);
      }, 2000);
    } else {
      this.probabilityB = overlap;
      // Show Phase 2 overlap result before suspense
      this.phase = 'phase2_to_suspense';
      this.updateInfo();
      setTimeout(() => {
        if (this.destroyed) return;
        this.startSuspense();
      }, 2500);
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

    // Only run local simulation in local mode (not remote/multiplayer)
    if (this.running && !this.remoteMode) {
      if (this.phase === 'phase1') {
        this.updatePhase1();
      } else if (this.phase === 'phase2') {
        this.updatePhase2();
      }
    }

    this.animFrame++;
    if (this.phase === 'phase1' || this.phase === 'phase1_to_phase2') {
      this.phase1Scene.updateAnimations(this.animFrame);
      // Update ghost animation even in remote mode
      if (this.remoteMode && this.maze) {
        this.obstacleManager.update(this.animFrame, this.clawPos);
      }
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

    // Update ghost obstacles and check collision
    const ghostHit = this.obstacleManager.update(this.animFrame, this.clawPos);
    if (ghostHit) {
      this.resetPhase1();
      return;
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
    if (this.p2ClawY >= this.p2Path.totalLength - 10) {
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
      probabilityA: Math.round(this.probabilityA * 100),
      probabilityB: Math.round(this.probabilityB * 100),
      p2LeftPlayerId: this.p2LeftPlayerId,
      p2RightPlayerId: this.p2RightPlayerId,
      p2Countdown: this.p2Countdown,
    });
  }

  /**
   * Switch to remote mode — disables local simulation and input.
   * Call this before applyServerState for multiplayer.
   */
  setRemoteMode() {
    this.remoteMode = true;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  /**
   * Receive overlap result from server (multiplayer).
   */
  setServerOverlap(phase: string, overlapPercent: number) {
    this.lastOverlap = overlapPercent;
    if (phase === 'phase1') {
      this.probabilityA = overlapPercent / 100;
    } else if (phase === 'phase2') {
      this.probabilityB = overlapPercent / 100;
    }
    this.updateInfo();
  }

  /**
   * Apply authoritative server state for multiplayer rendering.
   * Replaces local simulation with server data.
   */
  async applyServerState(state: import('@qwas/shared').GameState) {
    // Wait for PixiJS init to complete before rendering
    if (!this.initDone) {
      await this.initPromise;
    }

    this.level = state.level;
    this.coins = state.coins;
    this.lastResult = state.lastResult;

    // Sync probabilities from server
    if (state.probabilityA > 0) this.probabilityA = state.probabilityA;
    if (state.probabilityB > 0) this.probabilityB = state.probabilityB;

    // Phase 1 rendering from server state
    if (state.phase === 'phase1' && state.maze) {
      if (this.phase !== 'phase1' || !this.maze || this.maze.seed !== state.maze.seed) {
        this.maze = state.maze;
        this.config = getDifficultyConfig(state.level);
        this.phase1Scene.buildMaze(state.maze);
        this.phase1Scene.setDoll(state.doll.position, state.doll.type);
        this.phase1Scene.setShowClawBox(state.level <= 5);
        this.phase1Scene.show();
        this.phase2Scene.hide();
        this.obstacleManager.spawn(state.level, state.maze, state.maze.seed);
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
