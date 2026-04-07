export type GamePhase = 'lobby' | 'phase1' | 'phase2' | 'grab_attempt' | 'result' | 'paused';

export type Direction = 'up' | 'down' | 'left' | 'right';
export type DiagonalDirection = 'up-left' | 'up-right' | 'down-left' | 'down-right';
export type AnyDirection = Direction | DiagonalDirection;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MazeCell {
  row: number;
  col: number;
  walls: { north: boolean; south: boolean; east: boolean; west: boolean };
}

export interface MazeData {
  width: number;
  height: number;
  cells: MazeCell[][];
  seed: number;
  cellSize: number;
}

export interface ClawState {
  position: Vec2;
  direction: Vec2;
  speed: number;
  box: Box;
}

export interface DollState {
  position: Vec2;
  box: Box;
  type: number; // 0-29, determines which cute animal sprite
}

export interface Phase2State {
  pathPoints: Vec2[];
  wallLeft: Vec2[];
  wallRight: Vec2[];
  clawY: number;
  clawX: number;
  driftOffset: number;
  dollBox: Box;
  pathWidth: number;
}

export interface PlayerState {
  id: string;
  name: string;
  assignedDirection: AnyDirection;
  inputCount: number; // tracks activity for Phase 2 selection
  isHost: boolean;
  connected: boolean;
}

export interface GameState {
  phase: GamePhase;
  level: number;
  coins: number;
  maze: MazeData | null;
  claw: ClawState;
  doll: DollState;
  phase2: Phase2State | null;
  players: PlayerState[];
  probabilityA: number;
  probabilityB: number;
  lastResult: 'success' | 'fail' | null;
}

export function createInitialGameState(): GameState {
  return {
    phase: 'lobby',
    level: 1,
    coins: 0,
    maze: null,
    claw: {
      position: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 2,
      box: { x: 0, y: 0, width: 30, height: 30 },
    },
    doll: {
      position: { x: 0, y: 0 },
      box: { x: 0, y: 0, width: 30, height: 30 },
      type: 0,
    },
    phase2: null,
    players: [],
    probabilityA: 0,
    probabilityB: 0,
    lastResult: null,
  };
}
