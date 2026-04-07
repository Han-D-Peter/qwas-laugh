import type { Server } from 'socket.io';
import type { Room } from '@qwas/shared';
import type { AnyDirection, Vec2 } from '@qwas/shared';
import { getDirectionsForLevel } from '../rooms/room-manager.js';
import {
  TICK_INTERVAL, CELL_SIZE, CLAW_BOX_SIZE, DOLL_BOX_SIZE,
  OVERLAP_THRESHOLD,
  generateMaze, placeDoll, getDifficultyConfig, applyIrregularBorders,
  calculateOverlap, checkMazeCollision,
  generatePhase2Path,
} from '@qwas/shared';
import type { Phase2Path } from '@qwas/shared';

interface ActiveGame {
  room: Room;
  intervalId: ReturnType<typeof setInterval>;
  // Phase 1
  clawPos: Vec2;
  clawDir: Vec2;
  clawSpeed: number;
  startPos: Vec2;
  dollPos: Vec2;
  seed: number;
  // Phase 2
  p2Path: Phase2Path | null;
  p2ClawX: number;
  p2ClawY: number;
  p2DescentSpeed: number;
  p2DriftTime: number;
  p2Countdown: number;
  probabilityA: number;
  probabilityB: number;
  // Queued input per player (latest direction change)
  inputQueue: Map<string, AnyDirection>;
  // Phase 2 input queue
  p2InputQueue: Map<string, 'left' | 'right'>;
}

const DIRECTION_VECTORS: Record<string, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  'up-left': { x: -0.707, y: -0.707 },
  'up-right': { x: 0.707, y: -0.707 },
  'down-left': { x: -0.707, y: 0.707 },
  'down-right': { x: 0.707, y: 0.707 },
};

export class GameLoopManager {
  private games = new Map<string, ActiveGame>();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  startGame(room: Room) {
    const config = getDifficultyConfig(room.gameState.level);
    const seed = Date.now();
    const maze = generateMaze(config.mazeWidth, config.mazeHeight, seed);
    if (config.irregularBorders) {
      applyIrregularBorders(maze, config.irregularComplexity, seed);
    }

    const centerX = Math.floor(maze.width / 2) * CELL_SIZE + CELL_SIZE / 2;
    const centerY = Math.floor(maze.height / 2) * CELL_SIZE + CELL_SIZE / 2;
    const dollPos = placeDoll(maze, config.dollMinDistance, seed);

    room.gameState.phase = 'phase1';
    room.gameState.maze = maze;
    room.gameState.claw = {
      position: { x: centerX, y: centerY },
      direction: { x: 1, y: 0 },
      speed: config.clawSpeed,
      box: { x: centerX - CLAW_BOX_SIZE / 2, y: centerY - CLAW_BOX_SIZE / 2, width: CLAW_BOX_SIZE, height: CLAW_BOX_SIZE },
    };
    room.gameState.doll = {
      position: dollPos,
      box: { x: dollPos.x - DOLL_BOX_SIZE / 2, y: dollPos.y - DOLL_BOX_SIZE / 2, width: DOLL_BOX_SIZE, height: DOLL_BOX_SIZE },
      type: room.gameState.level % 30,
    };

    // Reassign directions based on current level's difficulty
    const directions = getDirectionsForLevel(room.gameState.level);
    for (let i = 0; i < room.players.length; i++) {
      room.players[i].assignedDirection = directions[i % directions.length];
      room.players[i].inputCount = 0;
    }
    room.gameState.players = [...room.players];

    const game: ActiveGame = {
      room,
      intervalId: setInterval(() => this.tick(room.code), TICK_INTERVAL),
      clawPos: { x: centerX, y: centerY },
      clawDir: { x: 1, y: 0 },
      clawSpeed: config.clawSpeed,
      startPos: { x: centerX, y: centerY },
      dollPos,
      seed,
      p2Path: null,
      p2ClawX: 200,
      p2ClawY: 0,
      p2DescentSpeed: 1.2 + room.gameState.level * 0.05,
      p2DriftTime: 0,
      p2Countdown: 0,
      probabilityA: 0,
      probabilityB: 0,
      inputQueue: new Map(),
      p2InputQueue: new Map(),
    };

    this.games.set(room.code, game);
    this.broadcastState(room.code);
  }

  stopGame(roomCode: string) {
    const game = this.games.get(roomCode);
    if (game) {
      clearInterval(game.intervalId);
      this.games.delete(roomCode);
    }
  }

  handleInput(roomCode: string, playerId: string, direction: AnyDirection) {
    const game = this.games.get(roomCode);
    if (!game) return;

    const player = game.room.players.find(p => p.id === playerId);
    if (!player) return;

    // Validate: player can only send their assigned direction
    if (direction !== player.assignedDirection) return;

    player.inputCount++;

    if (game.room.gameState.phase === 'phase1') {
      game.inputQueue.set(playerId, direction);
    }
  }

  handlePhase2Input(roomCode: string, playerId: string, dir: 'left' | 'right') {
    const game = this.games.get(roomCode);
    if (!game || game.room.gameState.phase !== 'phase2') return;
    game.p2InputQueue.set(playerId, dir);
  }

  handleGrab(roomCode: string, playerId: string) {
    const game = this.games.get(roomCode);
    if (!game) return;

    // Only host can grab
    if (game.room.hostId !== playerId) return;

    if (game.room.gameState.phase === 'phase1') {
      this.phase1Grab(game);
    } else if (game.room.gameState.phase === 'phase2') {
      this.phase2Grab(game);
    }
  }

  // ─── Tick ──────────────────────────────────────────────────────

  private tick(roomCode: string) {
    const game = this.games.get(roomCode);
    if (!game) return;

    const phase = game.room.gameState.phase;

    if (phase === 'phase1') {
      this.tickPhase1(game);
    } else if (phase === 'phase2') {
      this.tickPhase2(game);
    }

    this.broadcastState(roomCode);
  }

  private tickPhase1(game: ActiveGame) {
    // Apply latest queued input (direction change)
    for (const [, direction] of game.inputQueue) {
      const vec = DIRECTION_VECTORS[direction];
      if (vec) {
        game.clawDir = { ...vec };
      }
    }
    game.inputQueue.clear();

    // Move claw
    const newPos = {
      x: game.clawPos.x + game.clawDir.x * game.clawSpeed,
      y: game.clawPos.y + game.clawDir.y * game.clawSpeed,
    };
    const newBox = {
      x: newPos.x - CLAW_BOX_SIZE / 2,
      y: newPos.y - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE, height: CLAW_BOX_SIZE,
    };

    if (checkMazeCollision(newBox, game.room.gameState.maze!)) {
      this.resetPhase1(game);
    } else {
      game.clawPos = newPos;
      game.room.gameState.claw.position = { ...newPos };
      game.room.gameState.claw.box = { ...newBox };
      game.room.gameState.claw.direction = { ...game.clawDir };
    }
  }

  private tickPhase2(game: ActiveGame) {
    if (!game.p2Path) return;

    const config = getDifficultyConfig(game.room.gameState.level);

    // Apply lateral input
    for (const [, dir] of game.p2InputQueue) {
      game.p2ClawX += dir === 'left' ? -6 : 6;
    }
    game.p2InputQueue.clear();

    // Descent
    game.p2ClawY += game.p2DescentSpeed;

    // Drift
    game.p2DriftTime += 0.02;
    const drift = Math.sin(game.p2DriftTime * config.phase2DriftFrequency * 3)
      * config.phase2DriftAmplitude * 0.4;
    game.p2ClawX += drift;

    // Wall collision check
    if (this.checkP2WallCollision(game)) {
      this.failAndResetToPhase1(game);
      return;
    }

    // Auto-grab at bottom
    if (game.p2ClawY >= game.p2Path.totalLength - 30) {
      this.phase2Grab(game);
      return;
    }

    // Update state for broadcast
    if (game.room.gameState.phase2) {
      game.room.gameState.phase2.clawX = game.p2ClawX;
      game.room.gameState.phase2.clawY = game.p2ClawY;
    }
  }

  // ─── Phase 1 Grab ──────────────────────────────────────────────

  private phase1Grab(game: ActiveGame) {
    const clawBox = {
      x: game.clawPos.x - CLAW_BOX_SIZE / 2,
      y: game.clawPos.y - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE, height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: game.dollPos.x - DOLL_BOX_SIZE / 2,
      y: game.dollPos.y - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE, height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    game.room.gameState.probabilityA = overlap;

    if (overlap < OVERLAP_THRESHOLD) {
      this.failAndResetToPhase1(game);
    } else {
      game.probabilityA = overlap;
      this.transitionToPhase2(game);
    }
  }

  // ─── Phase 2 Grab ──────────────────────────────────────────────

  private phase2Grab(game: ActiveGame) {
    if (!game.p2Path) return;

    const clawBox = {
      x: game.p2ClawX - CLAW_BOX_SIZE / 2,
      y: game.p2ClawY - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE, height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: game.p2Path.dollBoxX - DOLL_BOX_SIZE / 2,
      y: game.p2Path.totalLength - 20 - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE, height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    game.room.gameState.probabilityB = overlap;

    if (overlap < OVERLAP_THRESHOLD) {
      this.failAndResetToPhase1(game);
    } else {
      game.probabilityB = overlap;
      const finalProb = game.probabilityA * game.probabilityB;
      const success = Math.random() < finalProb;

      game.room.gameState.phase = 'result';
      game.room.gameState.lastResult = success ? 'success' : 'fail';

      this.io.to(game.room.code).emit('game:grab-result', {
        probabilityA: game.probabilityA,
        probabilityB: game.probabilityB,
        success,
      });

      // Schedule next phase
      setTimeout(() => {
        if (!this.games.has(game.room.code)) return;
        if (success) {
          game.room.gameState.level = Math.min(30, game.room.gameState.level + 1);
        } else {
          game.room.gameState.coins++;
        }
        this.restartLevel(game);
      }, 2500);
    }
  }

  // ─── Transitions ───────────────────────────────────────────────

  private transitionToPhase2(game: ActiveGame) {
    const config = getDifficultyConfig(game.room.gameState.level);

    // Select top 2 most active players for Phase 2 L/R controls
    const sorted = [...game.room.players].sort((a, b) => b.inputCount - a.inputCount);
    const p2Players = sorted.slice(0, 2);

    game.p2Path = generatePhase2Path(
      config.phase2PathLength,
      config.phase2PathWidth,
      config.phase2Segments,
      config.phase2DriftAmplitude,
      game.seed + 7777,
    );

    game.p2ClawX = game.p2Path.centerLine[0].x;
    game.p2ClawY = 0;
    game.p2DescentSpeed = 1.2 + game.room.gameState.level * 0.05;
    game.p2DriftTime = 0;

    game.room.gameState.phase = 'phase2';
    game.room.gameState.phase2 = {
      pathPoints: game.p2Path.centerLine,
      wallLeft: game.p2Path.leftWall,
      wallRight: game.p2Path.rightWall,
      clawY: 0,
      clawX: game.p2ClawX,
      driftOffset: 0,
      dollBox: {
        x: game.p2Path.dollBoxX - DOLL_BOX_SIZE / 2,
        y: game.p2Path.totalLength - 20 - DOLL_BOX_SIZE / 2,
        width: DOLL_BOX_SIZE,
        height: DOLL_BOX_SIZE,
      },
      pathWidth: game.p2Path.pathWidth,
    };

    this.io.to(game.room.code).emit('game:phase-change', {
      phase: 'phase2',
      data: { p2Players: p2Players.map(p => p.id) },
    });
  }

  private resetPhase1(game: ActiveGame) {
    game.clawPos = { ...game.startPos };
    game.clawDir = { x: 1, y: 0 };
    game.room.gameState.coins++;
    game.room.gameState.claw.position = { ...game.startPos };
    game.room.gameState.claw.direction = { x: 1, y: 0 };
  }

  private failAndResetToPhase1(game: ActiveGame) {
    game.room.gameState.coins++;
    game.room.gameState.lastResult = 'fail';
    game.room.gameState.phase = 'result';

    this.broadcastState(game.room.code);

    setTimeout(() => {
      if (!this.games.has(game.room.code)) return;
      this.restartLevel(game);
    }, 1500);
  }

  private restartLevel(game: ActiveGame) {
    // Stop current tick
    clearInterval(game.intervalId);
    this.games.delete(game.room.code);
    // Restart
    this.startGame(game.room);
  }

  // ─── Collision ─────────────────────────────────────────────────

  private checkP2WallCollision(game: ActiveGame): boolean {
    if (!game.p2Path) return false;
    const { leftWall, rightWall } = game.p2Path;
    const halfClaw = CLAW_BOX_SIZE / 2;

    for (let i = 0; i < leftWall.length - 1; i++) {
      if (game.p2ClawY >= leftWall[i].y && game.p2ClawY <= leftWall[i + 1].y) {
        const t = (game.p2ClawY - leftWall[i].y) / (leftWall[i + 1].y - leftWall[i].y || 1);
        const lx = leftWall[i].x + t * (leftWall[i + 1].x - leftWall[i].x);
        const rx = rightWall[i].x + t * (rightWall[i + 1].x - rightWall[i].x);
        return game.p2ClawX - halfClaw < lx || game.p2ClawX + halfClaw > rx;
      }
    }
    return false;
  }

  // ─── Broadcast ─────────────────────────────────────────────────

  private broadcastState(roomCode: string) {
    const game = this.games.get(roomCode);
    if (!game) return;
    this.io.to(roomCode).emit('game:state', game.room.gameState);
  }
}
