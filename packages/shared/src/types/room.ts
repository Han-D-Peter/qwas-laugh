import type { GameState, PlayerState } from './game-state.js';

export interface Room {
  code: string;
  hostId: string;
  players: PlayerState[];
  gameState: GameState;
  createdAt: number;
  lastActivity: number;
}
