import type { Room } from '@qwas/shared';
import { createInitialGameState, getDifficultyConfig } from '@qwas/shared';
import { ROOM_CODE_LENGTH, MAX_PLAYERS, ROOM_TIMEOUT_MS } from '@qwas/shared';
import type { AnyDirection, PlayerState } from '@qwas/shared';

const CARDINAL_DIRECTIONS: AnyDirection[] = ['up', 'down', 'left', 'right'];
const DIAGONAL_DIRECTIONS: AnyDirection[] = ['up-left', 'up-right', 'down-right', 'down-left'];

export function getDirectionsForLevel(level: number): AnyDirection[] {
  const config = getDifficultyConfig(level);
  if (config.diagonalPlayerCount >= 4) return DIAGONAL_DIRECTIONS;
  if (config.diagonalPlayerCount >= 2) {
    return ['up', 'down', 'up-right', 'down-left'];
  }
  return CARDINAL_DIRECTIONS;
}

const DIRECTION_ORDER = CARDINAL_DIRECTIONS;

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private playerToRoom = new Map<string, string>();
  /** Tracks the phase before a pause, so we can resume to it */
  private pausedPhase = new Map<string, string>();

  createRoom(hostSocketId: string, playerName: string): { room: Room; playerId: string } {
    let code: string;
    do {
      code = generateCode();
    } while (this.rooms.has(code));

    const player: PlayerState = {
      id: hostSocketId,
      name: playerName,
      assignedDirection: DIRECTION_ORDER[0],
      inputCount: 0,
      isHost: true,
      connected: true,
    };

    const room: Room = {
      code,
      hostId: hostSocketId,
      players: [player],
      gameState: createInitialGameState(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    room.gameState.players = [player];

    this.rooms.set(code, room);
    this.playerToRoom.set(hostSocketId, code);

    return { room, playerId: hostSocketId };
  }

  joinRoom(code: string, socketId: string, playerName: string): { room: Room; playerId: string; rejoined: boolean } | { error: string } {
    const room = this.rooms.get(code);
    if (!room) return { error: '방을 찾을 수 없습니다.' };

    // Check if there's a disconnected slot to rejoin
    const disconnectedPlayer = room.players.find(p => !p.connected);
    if (disconnectedPlayer) {
      // Rejoin: take over the disconnected player's slot
      const oldId = disconnectedPlayer.id;
      this.playerToRoom.delete(oldId);
      disconnectedPlayer.id = socketId;
      disconnectedPlayer.name = playerName;
      disconnectedPlayer.connected = true;
      this.playerToRoom.set(socketId, code);

      // Update host if the disconnected player was host
      if (room.hostId === oldId) {
        room.hostId = socketId;
      }

      room.gameState.players = [...room.players];
      room.lastActivity = Date.now();
      return { room, playerId: socketId, rejoined: true };
    }

    // Normal join (lobby only)
    if (room.players.length >= MAX_PLAYERS) return { error: '방이 가득 찼습니다.' };
    if (room.gameState.phase !== 'lobby' && room.gameState.phase !== 'paused') {
      return { error: '게임이 이미 진행 중입니다.' };
    }

    const directionIndex = room.players.length;
    const player: PlayerState = {
      id: socketId,
      name: playerName,
      assignedDirection: DIRECTION_ORDER[directionIndex],
      inputCount: 0,
      isHost: false,
      connected: true,
    };

    room.players.push(player);
    room.gameState.players = [...room.players];
    room.lastActivity = Date.now();
    this.playerToRoom.set(socketId, code);

    return { room, playerId: socketId, rejoined: false };
  }

  /**
   * Handle a player disconnecting. Instead of removing, mark as disconnected.
   * Returns pause info if the game should be paused.
   */
  disconnectPlayer(socketId: string): {
    room: Room;
    destroyed: boolean;
    shouldPause: boolean;
    disconnectedName: string;
  } | null {
    const code = this.playerToRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.find(p => p.id === socketId);
    if (!player) return null;

    const disconnectedName = player.name;

    // If still in lobby, just remove the player
    if (room.gameState.phase === 'lobby') {
      this.playerToRoom.delete(socketId);
      room.players = room.players.filter(p => p.id !== socketId);
      room.gameState.players = [...room.players];

      if (room.players.length === 0) {
        this.rooms.delete(code);
        return { room, destroyed: true, shouldPause: false, disconnectedName };
      }

      if (room.hostId === socketId) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
      }
      room.players.forEach((p, i) => {
        p.assignedDirection = DIRECTION_ORDER[i];
      });
      room.gameState.players = [...room.players];
      return { room, destroyed: false, shouldPause: false, disconnectedName };
    }

    // During game: mark as disconnected, pause
    player.connected = false;
    room.gameState.players = [...room.players];

    // Check if all players are disconnected
    const allDisconnected = room.players.every(p => !p.connected);
    if (allDisconnected) {
      // Destroy room
      for (const p of room.players) {
        this.playerToRoom.delete(p.id);
      }
      this.rooms.delete(code);
      return { room, destroyed: true, shouldPause: false, disconnectedName };
    }

    // Save current phase and pause
    const shouldPause = room.gameState.phase !== 'paused';
    if (shouldPause) {
      this.pausedPhase.set(code, room.gameState.phase);
      room.gameState.phase = 'paused';
    }

    return { room, destroyed: false, shouldPause, disconnectedName };
  }

  /**
   * Check if all players are connected and the game can resume.
   * Returns the phase to resume to, or null if still waiting.
   */
  checkResume(code: string): string | null {
    const room = this.rooms.get(code);
    if (!room || room.gameState.phase !== 'paused') return null;

    const allConnected = room.players.every(p => p.connected);
    if (!allConnected) return null;

    const resumePhase = this.pausedPhase.get(code) || 'phase1';
    this.pausedPhase.delete(code);
    room.gameState.phase = resumePhase as any;
    return resumePhase;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getRoomByPlayer(socketId: string): Room | undefined {
    const code = this.playerToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  isHost(socketId: string): boolean {
    const room = this.getRoomByPlayer(socketId);
    return room?.hostId === socketId;
  }

  getPlayer(socketId: string): PlayerState | undefined {
    const room = this.getRoomByPlayer(socketId);
    return room?.players.find(p => p.id === socketId);
  }

  cleanupStaleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > ROOM_TIMEOUT_MS) {
        for (const p of room.players) {
          this.playerToRoom.delete(p.id);
        }
        this.rooms.delete(code);
      }
    }
  }
}
