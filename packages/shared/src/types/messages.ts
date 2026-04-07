import type { AnyDirection, GameState } from './game-state.js';

// Client → Server messages
export interface ClientMessages {
  'room:create': { playerName: string };
  'room:join': { code: string; playerName: string };
  'room:leave': {};
  'game:start': {};
  'player:input': { direction: AnyDirection; timestamp: number };
  'player:grab': { timestamp: number };
  'voice:offer': { targetId: string; offer: unknown };
  'voice:answer': { targetId: string; answer: unknown };
  'voice:ice-candidate': { targetId: string; candidate: unknown };
}

// Server → Client messages
export interface ServerMessages {
  'room:created': { code: string; playerId: string };
  'room:joined': { playerId: string; state: GameState };
  'room:player-joined': { playerName: string; playerId: string };
  'room:player-left': { playerId: string };
  'room:error': { message: string };
  'game:state': GameState;
  'game:phase-change': { phase: GameState['phase']; data?: unknown };
  'game:grab-result': { probabilityA: number; probabilityB: number; success: boolean };
  'game:level-complete': { level: number; nextLevel: number };
  'voice:offer': { fromId: string; offer: unknown };
  'voice:answer': { fromId: string; answer: unknown };
  'voice:ice-candidate': { fromId: string; candidate: unknown };
}
