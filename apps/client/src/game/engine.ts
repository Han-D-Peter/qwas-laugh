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
import { ParticleSystem } from './animations/particles.js';
import { TransitionFX } from './animations/transitions.js';
import { ARCADE } from '../theme/arcade.js';

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
  /** Intro splash phase — 'ready', 'go', or null. Drives full-screen pixel text. */
  introSplash: 'ready' | 'go' | null;
}

type GamePhase = 'phase1' | 'phase1_to_phase2' | 'phase2_countdown' | 'phase2' | 'phase2_to_suspense' | 'suspense' | 'result';

export class GameEngine {
  private app: Application;
  private worldContainer!: Container;
  private fxContainer!: Container;
  private phase1Scene!: Phase1Scene;
  private phase2Scene!: Phase2Scene;
  private obstacleManager!: ObstacleManager;
  private particles!: ParticleSystem;
  private fx!: TransitionFX;
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
  private grabLocked = false;
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
      await this.app.init({ width, height, background: ARCADE.DEEP_NAVY, antialias: true });
    } catch {
      await this.app.init({ width, height, background: ARCADE.DEEP_NAVY, antialias: false });
    }
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.container.appendChild(this.app.canvas);

    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    // Particle layer sits in world space so sparkles follow the camera
    this.fxContainer = new Container();
    this.worldContainer.addChild(this.fxContainer);

    this.phase1Scene = new Phase1Scene(this.worldContainer);
    this.phase2Scene = new Phase2Scene(this.worldContainer);
    this.obstacleManager = new ObstacleManager(this.phase1Scene.getObstacleContainer());

    this.particles = new ParticleSystem(this.fxContainer);
    // TransitionFX lives on the top-level stage (screen space) so it can cover
    // the whole canvas regardless of world camera movement.
    this.fx = new TransitionFX(this.app, this.app.stage);

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
    this.phase1Scene.playIntro();

    // Spawn ghost obstacles for mid+ levels
    this.obstacleManager.spawn(level, this.maze, this.seed);

    this.probabilityA = 0;
    this.probabilityB = 0;
    this.lastOverlap = 0;
    this.lastResult = null;
    this.suspenseProgress = 0;
    this.suspensePhase = '';
    this.grabLocked = false;
    this.updateInfo();

    // CRT power-on + camera zoom entry animation
    if (this.fx) {
      this.fx.crtPowerOn(22).catch(() => {});
      this.fx.cameraZoom(this.worldContainer, 1.3, 1.0, 36);
    }
    // Intro splash: READY! → GO! (HUD will render based on introSplash phase)
    this.triggerIntroSplash();
  }

  // ─── Intro Splash ───────────────────────────────────────────────
  private introSplashPhase: 'ready' | 'go' | null = null;
  private introSplashTimer: ReturnType<typeof setTimeout> | null = null;

  private triggerIntroSplash() {
    if (this.introSplashTimer) clearTimeout(this.introSplashTimer);
    this.introSplashPhase = 'ready';
    this.updateInfo();
    this.introSplashTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.introSplashPhase = 'go';
      this.updateInfo();
      this.introSplashTimer = setTimeout(() => {
        if (this.destroyed) return;
        this.introSplashPhase = null;
        this.updateInfo();
      }, 500);
    }, 700);
  }

  private resetPhase1() {
    this.clawPos = { ...this.startPos };
    this.clawDir = { x: 0, y: 0 };
    this.coins++;
    this.phase = 'phase1';
    this.probabilityA = 0;
    this.probabilityB = 0;
    this.lastOverlap = 0;
    this.grabLocked = false;

    this.phase1Scene.show();
    this.phase2Scene.hide();
    this.phase1Scene.playIntro();
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
          case ' ':
            if (!this.grabLocked) { this.grabLocked = true; this.attemptPhase1Grab(); }
            e.preventDefault(); break;
        }
      }

      // Phase 2 controls
      if (this.phase === 'phase2') {
        switch (e.key) {
          case 'ArrowLeft':  this.p2ClawX -= 6; e.preventDefault(); break;
          case 'ArrowRight': this.p2ClawX += 6; e.preventDefault(); break;
          case ' ':
            if (!this.grabLocked) { this.grabLocked = true; this.attemptPhase2Grab(); }
            e.preventDefault(); break;
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
    console.log('[grab] claw=' + JSON.stringify(this.clawPos) +
      ' doll=' + JSON.stringify(this.dollPos) +
      ' overlap=' + Math.round(overlap * 100) + '%' +
      ' dist=' + Math.sqrt((this.clawPos.x - this.dollPos.x) ** 2 + (this.clawPos.y - this.dollPos.y) ** 2).toFixed(0));
    this.lastOverlap = overlap * 100;

    // Grab FX — flash + shake + sparkle at claw pos
    this.playGrabFX(this.clawPos.x, this.clawPos.y, overlap >= OVERLAP_THRESHOLD);

    if (overlap < OVERLAP_THRESHOLD) {
      this.lastResult = 'fail';
      this.resetPhase1();
    } else {
      this.probabilityA = overlap;
      this.transitionToPhase2();
    }
    this.updateInfo();
  }

  /** Shared grab visual FX — used by both phases and both local/remote. */
  private playGrabFX(x: number, y: number, success: boolean) {
    if (!this.fx || !this.particles) return;
    this.fx.screenShake(12, success ? 5 : 3);
    this.fx.glitchLines(6);
    this.particles.emitSparkles(x, y, 22);
    // Claw scale pulse — active claw container based on phase
    const clawContainer = this.phase === 'phase2'
      ? this.phase2Scene.getClawContainer()
      : this.phase1Scene.getClawContainer();
    if (clawContainer) {
      this.animateClawPulse(clawContainer);
    }
    if (success) {
      this.particles.emitStars(x, y, 10);
      this.particles.emitFlash(this.app.screen.width, this.app.screen.height, ARCADE.NEON_YELLOW, 8);
    } else {
      this.particles.emitFlash(this.app.screen.width, this.app.screen.height, ARCADE.NEON_PINK, 6);
    }
  }

  /** Pulse the claw container scale 1.0 → 1.15 → 1.0 over ~18 frames. */
  private animateClawPulse(container: Container) {
    let t = 0;
    const dur = 18;
    const tick = () => {
      if (this.destroyed) return;
      t++;
      const norm = t / dur;
      const scale = norm < 0.5
        ? 1 + (0.15 * (norm / 0.5))
        : 1.15 - (0.15 * ((norm - 0.5) / 0.5));
      container.scale.set(scale);
      if (t < dur) {
        requestAnimationFrame(tick);
      } else {
        container.scale.set(1);
      }
    };
    requestAnimationFrame(tick);
  }

  /**
   * Pick the scene container currently visible — used by success/fail
   * cinematics so they run on whichever scene is on screen.
   */
  private getActiveScene() {
    return this.phase1Scene.isVisible() ? this.phase1Scene : this.phase2Scene;
  }

  /** Cinematic "claw lifts doll → drops into prize chute" sequence. */
  private playSuccessCinematic() {
    const scene = this.getActiveScene();
    const clawC = scene.getClawContainer();
    const dollC = scene.getDollContainer();
    if (!clawC || !dollC) return;

    const clawStart = { x: clawC.x, y: clawC.y };
    const dollStart = { x: dollC.x, y: dollC.y };
    // Chute target — approximate bottom-right of the play area
    const chuteX = clawStart.x + 120;
    const chuteY = clawStart.y + 80;

    const STAGE1 = 12;  // squeeze pulse
    const STAGE2 = 28;  // lift + move to chute
    const STAGE3 = 14;  // drop into chute
    const STAGE4 = 10;  // fade out
    let t = 0;
    const tick = () => {
      if (this.destroyed) return;
      t++;
      if (t <= STAGE1) {
        const n = t / STAGE1;
        clawC.scale.set(1 + Math.sin(n * Math.PI) * 0.25);
      } else if (t <= STAGE1 + STAGE2) {
        const n = (t - STAGE1) / STAGE2;
        const ease = n * n * (3 - 2 * n);
        clawC.x = clawStart.x + (chuteX - clawStart.x) * ease;
        clawC.y = clawStart.y + (chuteY - clawStart.y) * ease - 20; // slight lift
        dollC.x = dollStart.x + (chuteX - dollStart.x) * ease;
        dollC.y = dollStart.y + (chuteY - dollStart.y) * ease - 20;
      } else if (t <= STAGE1 + STAGE2 + STAGE3) {
        const n = (t - STAGE1 - STAGE2) / STAGE3;
        dollC.y = (chuteY - 20) + 40 * n;
        dollC.rotation = n * 0.6;
      } else if (t <= STAGE1 + STAGE2 + STAGE3 + STAGE4) {
        const n = (t - STAGE1 - STAGE2 - STAGE3) / STAGE4;
        dollC.alpha = 1 - n;
      } else {
        // Restore — next level setup will position correctly
        clawC.scale.set(1);
        clawC.x = clawStart.x;
        clawC.y = clawStart.y;
        dollC.alpha = 1;
        dollC.rotation = 0;
        dollC.x = dollStart.x;
        dollC.y = dollStart.y;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Cinematic "doll slips out of claw → claw droops" sequence. */
  private playFailCinematic() {
    const scene = this.getActiveScene();
    const clawC = scene.getClawContainer();
    const dollC = scene.getDollContainer();
    if (!clawC || !dollC) return;

    const clawStart = { x: clawC.x, y: clawC.y, rot: clawC.rotation, alpha: clawC.alpha };
    const dollStart = { x: dollC.x, y: dollC.y, rot: dollC.rotation };

    const DUR = 30;
    let t = 0;
    const tick = () => {
      if (this.destroyed) return;
      t++;
      const n = Math.min(1, t / DUR);
      dollC.y = dollStart.y + (n < 0.3 ? -10 * (n / 0.3) : 10 * ((n - 0.3) / 0.7));
      dollC.rotation = dollStart.rot + (Math.random() - 0.5) * 0.5 * (1 - n);
      clawC.rotation = -0.2 * n;
      clawC.alpha = 1 - 0.3 * n;
      if (t < DUR) {
        requestAnimationFrame(tick);
      } else {
        clawC.rotation = clawStart.rot;
        clawC.alpha = clawStart.alpha;
        clawC.x = clawStart.x;
        clawC.y = clawStart.y;
        dollC.y = dollStart.y;
        dollC.rotation = dollStart.rot;
      }
    };
    requestAnimationFrame(tick);
  }

  // ─── Phase 1 → Phase 2 Transition ─────────────────────────────

  private transitionToPhase2() {
    this.phase = 'phase1_to_phase2';
    this.lastResult = null;
    this.updateInfo();

    // 0-1500ms: HUD shows the "PHASE 1 CLEAR!" overlay
    // 1500ms:   CRT power-off
    // 2000ms:   start Phase 2 (which immediately does power-on)
    setTimeout(() => {
      if (this.destroyed) return;
      this.fx?.crtPowerOff(20).catch(() => {});
    }, 1500);
    setTimeout(() => {
      if (this.destroyed) return;
      this.startPhase2();
    }, 2000);
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
    this.p2DescentSpeed = 1.8 + this.level * 0.08;
    this.p2DriftOffset = 0;
    this.p2DriftTime = 0;

    this.grabLocked = false;

    // In local mode, randomly assign left/right to 2 virtual players
    if (!this.remoteMode) {
      this.p2LeftPlayerId = 'local-left';
      this.p2RightPlayerId = 'local-right';
    }

    this.phase1Scene.hide();
    this.phase2Scene.show();
    this.phase2Scene.buildPath(this.p2Path, this.level % 30);
    this.phase2Scene.setClaw(this.p2ClawX, this.p2ClawY);

    // CRT power-on for Phase 2
    this.fx?.crtPowerOn(22).catch(() => {});

    // Countdown with role display
    this.phase = 'phase2_countdown';
    this.p2Countdown = 3;
    this.updateInfo();

    const countdownInterval = setInterval(() => {
      if (this.destroyed) { clearInterval(countdownInterval); return; }
      this.p2Countdown--;
      this.updateInfo();
      // Flash + shake on each tick
      if (this.fx && this.particles) {
        this.fx.screenShake(6, 2);
        this.particles.emitFlash(this.app.screen.width, this.app.screen.height, ARCADE.NEON_CYAN, 4);
      }
      if (this.p2Countdown <= 0) {
        clearInterval(countdownInterval);
        this.phase = 'phase2';
        this.updateInfo();
        // GO! burst
        if (this.fx && this.particles) {
          this.fx.screenShake(14, 6);
          this.fx.cameraZoom(this.worldContainer, 0.95, 1.0, 12);
          this.particles.emitConfetti(
            this.p2ClawX,
            this.p2ClawY + 40,
            30,
          );
          this.particles.emitStars(this.p2ClawX, this.p2ClawY + 40, 15);
          this.particles.emitFlash(this.app.screen.width, this.app.screen.height, ARCADE.NEON_YELLOW, 6);
        }
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

    // Grab FX at claw's current screen position
    this.playGrabFX(this.p2ClawX, this.p2ClawY, overlap >= OVERLAP_THRESHOLD);

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
        this.fx?.crtPowerOff(20).catch(() => {});
      }, 1500);
      setTimeout(() => {
        if (this.destroyed) return;
        this.startSuspense();
      }, 2000);
    }
    this.updateInfo();
  }

  // ─── Suspense & Final Result ───────────────────────────────────

  private async startSuspense() {
    this.phase = 'suspense';
    this.updateInfo();

    // Power the screen back on for suspense
    this.fx?.crtPowerOn(18).catch(() => {});

    const finalProbability = this.probabilityA * this.probabilityB;

    const success = await runSuspenseAnimation(
      finalProbability,
      (progress, phase) => {
        this.suspenseProgress = progress;
        this.suspensePhase = phase;
        this.updateInfo();
        this.applySuspenseFX(phase);
      },
    );

    this.phase = 'result';
    if (success) {
      this.lastResult = 'success';
      this.updateInfo();
      this.playSuccessFX();
      setTimeout(() => {
        if (this.destroyed) return;
        this.level = Math.min(30, this.level + 1);
        this.setupLevel(this.level);
      }, 2500);
    } else {
      this.lastResult = 'fail';
      this.coins++;
      this.updateInfo();
      this.playFailFX();
      setTimeout(() => {
        if (this.destroyed) return;
        this.setupLevel(this.level);
      }, 2000);
    }
  }

  // ─── Suspense & Result FX ───────────────────────────────────────
  private lastSuspensePhase = '';
  private applySuspenseFX(phase: string) {
    if (phase === this.lastSuspensePhase) return;
    this.lastSuspensePhase = phase;
    if (!this.fx || !this.particles) return;

    switch (phase) {
      case 'showA':
        this.particles.emitSparkles(this.app.screen.width / 2, this.app.screen.height / 2, 12);
        break;
      case 'showB':
        this.particles.emitSparkles(this.app.screen.width / 2, this.app.screen.height / 2, 12);
        break;
      case 'drumroll':
        this.fx.screenShake(120, 4);
        this.fx.glitchLines(120);
        break;
      case 'reveal':
        this.particles.emitFlash(this.app.screen.width, this.app.screen.height, ARCADE.NEON_WHITE, 8);
        break;
    }
  }

  private playSuccessFX() {
    if (!this.fx || !this.particles) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.fx.screenShake(30, 8);
    this.particles.emitFlash(w, h, ARCADE.NEON_YELLOW, 12);
    this.particles.emitConfetti(w / 2, h / 2, 80);
    this.particles.emitStars(w / 2, h / 2, 30);
    // Cinematic claw+doll choreography
    this.playSuccessCinematic();
    // Staggered bursts for cinematic feel
    setTimeout(() => { if (!this.destroyed) this.particles?.emitConfetti(w * 0.3, h * 0.3, 30); }, 200);
    setTimeout(() => { if (!this.destroyed) this.particles?.emitConfetti(w * 0.7, h * 0.3, 30); }, 350);
    setTimeout(() => { if (!this.destroyed) this.particles?.emitStars(w / 2, h / 2, 20); }, 500);
  }

  private playFailFX() {
    if (!this.fx || !this.particles) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.fx.screenShake(30, 10);
    this.fx.glitchLines(30);
    this.particles.emitFlash(w, h, ARCADE.NEON_PINK, 10);
    this.particles.emitSparks(w / 2, h / 2, 20);
    // Doll slip + claw droop cinematic
    this.playFailCinematic();
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

    // Global FX systems
    this.fx?.update();
    this.particles?.update();

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
      introSplash: this.introSplashPhase,
    });
  }

  private setupPhase2FromState(state: import('@qwas/shared').GameState) {
    if (!state.phase2) return;
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

    // CRT power-on for Phase 2 (mirror local startPhase2)
    this.fx?.crtPowerOn(22).catch(() => {});

    // Show countdown
    this.phase = 'phase2_countdown';
    this.p2Countdown = 3;
    this.updateInfo();
    const interval = setInterval(() => {
      if (this.destroyed) { clearInterval(interval); return; }
      this.p2Countdown--;
      this.updateInfo();
      // Per-tick flash + shake (mirror local startPhase2)
      if (this.fx && this.particles) {
        this.fx.screenShake(6, 2);
        this.particles.emitFlash(this.app.screen.width, this.app.screen.height, ARCADE.NEON_CYAN, 4);
      }
      if (this.p2Countdown <= 0) {
        clearInterval(interval);
        this.phase = 'phase2';
        this.updateInfo();
        // GO! burst
        if (this.fx && this.particles) {
          this.fx.screenShake(14, 6);
          this.fx.cameraZoom(this.worldContainer, 0.95, 1.0, 12);
          this.particles.emitConfetti(this.p2ClawX, this.p2ClawY + 40, 30);
          this.particles.emitStars(this.p2ClawX, this.p2ClawY + 40, 15);
          this.particles.emitFlash(this.app.screen.width, this.app.screen.height, ARCADE.NEON_YELLOW, 6);
        }
      }
    }, 1000);
  }

  private async startRemoteSuspense(result: 'success' | 'fail') {
    this.phase = 'suspense';
    this.updateInfo();

    this.fx?.crtPowerOn(18).catch(() => {});

    const finalProbability = this.probabilityA * this.probabilityB;

    await runSuspenseAnimation(
      finalProbability,
      (progress, phase) => {
        this.suspenseProgress = progress;
        this.suspensePhase = phase;
        this.updateInfo();
        this.applySuspenseFX(phase);
      },
    );

    // Force the known result (server already decided)
    this.phase = 'result' as any;
    this.lastResult = result;
    this.updateInfo();

    if (result === 'success') {
      this.playSuccessFX();
    } else {
      this.playFailFX();
    }
  }

  /** Handle direction input from touch controls (local mode) */
  handleDirection(dir: 'up' | 'down' | 'left' | 'right') {
    if (this.destroyed || this.remoteMode) return;

    if (this.phase === 'phase1') {
      const d = 0.707;
      const diag = this.config?.diagonalPlayerCount >= 4;
      const dirMap: Record<string, { x: number; y: number }> = diag
        ? { up: { x: -d, y: -d }, down: { x: d, y: d }, left: { x: -d, y: d }, right: { x: d, y: -d } }
        : { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
      this.clawDir = dirMap[dir];
    } else if (this.phase === 'phase2') {
      if (dir === 'left') this.p2ClawX -= 6;
      if (dir === 'right') this.p2ClawX += 6;
    }
  }

  /** Handle grab input from touch controls (local mode) */
  handleGrab() {
    if (this.destroyed || this.remoteMode || this.grabLocked) return;

    if (this.phase === 'phase1') {
      this.grabLocked = true;
      this.attemptPhase1Grab();
    } else if (this.phase === 'phase2') {
      this.grabLocked = true;
      this.attemptPhase2Grab();
    }
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
  setServerOverlap(phase: string, overlapPercent: number, serverClawPos?: any, serverDollPos?: any) {
    this.lastOverlap = overlapPercent;
    if (serverClawPos) {
      console.log('[grab-server] overlap=' + overlapPercent + '% serverClaw=' + JSON.stringify(serverClawPos) +
        ' serverDoll=' + JSON.stringify(serverDollPos) +
        ' clientClaw=' + JSON.stringify(this.clawPos) +
        ' clientDoll=' + JSON.stringify(this.dollPos));
    }
    if (phase === 'phase1') {
      this.probabilityA = overlapPercent / 100;
      // Play grab FX on multiplayer clients too
      this.playGrabFX(this.clawPos.x, this.clawPos.y, overlapPercent >= 10);
    } else if (phase === 'phase2') {
      this.probabilityB = overlapPercent / 100;
      this.playGrabFX(this.p2ClawX, this.p2ClawY, overlapPercent >= 10);
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
      const isNewLevel = this.phase !== 'phase1' || !this.maze || this.maze.seed !== state.maze.seed;
      if (isNewLevel) {
        this.maze = state.maze;
        this.config = getDifficultyConfig(state.level);
        this.phase1Scene.buildMaze(state.maze);
        this.phase1Scene.setDoll(state.doll.position, state.doll.type);
        this.phase1Scene.setShowClawBox(state.level <= 5);
        this.phase1Scene.show();
        this.phase2Scene.hide();
        this.obstacleManager.spawn(state.level, state.maze, state.maze.seed);
        // Mirror setupLevel's retro intro for multiplayer clients:
        // CRT power-on, camera zoom, claw drop, and READY→GO splash.
        this.phase1Scene.playIntro();
        this.fx?.crtPowerOn(22).catch(() => {});
        if (this.fx) this.fx.cameraZoom(this.worldContainer, 1.3, 1.0, 36);
        this.triggerIntroSplash();
      }
      this.clawPos = { ...state.claw.position };
      this.dollPos = { ...state.doll.position };
      this.phase1Scene.setClaw(this.clawPos);
      this.updatePhase1Camera();
      // Clear overlap/result from previous level
      this.lastOverlap = 0;
      this.lastResult = null;
      this.suspenseProgress = 0;
      this.suspensePhase = '';
      this.phase = 'phase1';
    }

    // Phase 2 rendering from server state
    if (state.phase === 'phase2' && state.phase2) {
      // Show Phase 1 completion overlay before jumping to Phase 2
      if (this.phase === 'phase1' && this.probabilityA > 0) {
        this.phase = 'phase1_to_phase2';
        this.updateInfo();
        // Delay Phase 2 setup
        setTimeout(() => {
          if (this.destroyed) return;
          this.setupPhase2FromState(state);
        }, 2500);
        return;
      }

      if (this.phase !== 'phase2' && this.phase !== 'phase1_to_phase2' && this.phase !== 'phase2_countdown') {
        this.setupPhase2FromState(state);
      }

      if (this.phase === 'phase2') {
        this.p2ClawX = state.phase2.clawX;
        this.p2ClawY = state.phase2.clawY;
        this.phase2Scene.setClaw(this.p2ClawX, this.p2ClawY);
        this.updatePhase2Camera();
      }
    }

    // Result: show suspense sequence before revealing
    if (state.phase === 'result' && state.lastResult) {
      if (this.phase === 'phase2' && this.probabilityA > 0 && this.probabilityB > 0) {
        // Show Phase 2 completion, then suspense
        this.phase = 'phase2_to_suspense';
        this.lastOverlap = Math.round(this.probabilityB * 100);
        this.updateInfo();
        setTimeout(() => {
          if (this.destroyed) return;
          this.startRemoteSuspense(state.lastResult as 'success' | 'fail');
        }, 2500);
        return;
      }
      if (this.phase !== 'suspense' && this.phase !== 'phase2_to_suspense') {
        this.lastResult = state.lastResult;
        this.phase = 'result' as any;
      }
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
    try { this.particles?.destroy(); } catch { /* noop */ }
    try { this.fx?.destroy(); } catch { /* noop */ }
    try { this.app.destroy(true); } catch { /* noop */ }
  }
}
