import type { Room } from '@qwas/shared';
import { createInitialGameState } from '@qwas/shared';
import { ROOM_CODE_LENGTH, MAX_PLAYERS, ROOM_TIMEOUT_MS } from '@qwas/shared';
import type { AnyDirection, PlayerState } from '@qwas/shared';

const DIRECTION_ORDER: AnyDirection[] = ['up', 'down', 'left', 'right'];

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

  createRoom(hostSocketId: string, playerName: string): { room: Room; playerId: string } {
    // Generate unique code
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

  joinRoom(code: string, socketId: string, playerName: string): { room: Room; playerId: string } | { error: string } {
    const room = this.rooms.get(code);
    if (!room) return { error: '방을 찾을 수 없습니다.' };
    if (room.players.length >= MAX_PLAYERS) return { error: '방이 가득 찼습니다.' };
    if (room.gameState.phase !== 'lobby') return { error: '게임이 이미 진행 중입니다.' };

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

    return { room, playerId: socketId };
  }

  leaveRoom(socketId: string): { room: Room; removed: boolean; destroyed: boolean } | null {
    const code = this.playerToRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    this.playerToRoom.delete(socketId);
    room.players = room.players.filter(p => p.id !== socketId);
    room.gameState.players = [...room.players];

    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { room, removed: true, destroyed: true };
    }

    // Promote new host if needed
    if (room.hostId === socketId) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }

    // Reassign directions
    room.players.forEach((p, i) => {
      p.assignedDirection = DIRECTION_ORDER[i];
    });
    room.gameState.players = [...room.players];

    return { room, removed: true, destroyed: false };
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
