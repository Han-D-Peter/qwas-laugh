import type { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/room-manager.js';
import { GameLoopManager } from '../game/game-loop.js';
import { MIN_PLAYERS } from '@qwas/shared';

export function setupSocketHandlers(io: Server) {
  const roomManager = new RoomManager();
  const gameLoop = new GameLoopManager(io);

  // Cleanup stale rooms every 5 minutes
  setInterval(() => roomManager.cleanupStaleRooms(), 5 * 60 * 1000);

  io.on('connection', (socket: Socket) => {
    console.log(`[connect] ${socket.id}`);

    // ─── Room: Create ──────────────────────────────────────
    socket.on('room:create', ({ playerName }: { playerName: string }) => {
      const { room, playerId } = roomManager.createRoom(socket.id, playerName);
      socket.join(room.code);
      socket.emit('room:created', { code: room.code, playerId });
      socket.emit('game:state', room.gameState);
    });

    // ─── Room: Join ────────────────────────────────────────
    socket.on('room:join', ({ code, playerName }: { code: string; playerName: string }) => {
      const result = roomManager.joinRoom(code.toUpperCase(), socket.id, playerName);
      if ('error' in result) {
        socket.emit('room:error', { message: result.error });
        return;
      }
      const { room, playerId, rejoined, oldPlayerId } = result;
      socket.join(room.code);
      socket.emit('room:joined', { playerId, code: room.code, state: room.gameState });
      socket.to(room.code).emit('room:player-joined', { playerName, playerId });

      // Update game loop player IDs after reconnection
      if (rejoined && oldPlayerId) {
        gameLoop.updatePlayerId(room.code, oldPlayerId, playerId);
      }

      // Check if rejoining completes the party and should resume
      if (rejoined) {
        console.log(`[room] Player ${playerName} (${socket.id}) rejoined room ${room.code}. Checking resume...`);
        const resumePhase = roomManager.checkResume(room.code);
        if (resumePhase) {
          console.log(`[room] Resuming room ${room.code} to phase: ${resumePhase}`);
          io.to(room.code).emit('game:resumed', { phase: resumePhase });
          gameLoop.resumeGame(room.code);
        } else {
          console.log(`[room] Room ${room.code} not ready to resume. Players:`,
            room.players.map(p => `${p.name}(${p.connected ? 'on' : 'off'})`).join(', '));
        }
      }

      io.to(room.code).emit('game:state', room.gameState);
    });

    // ─── Room: Leave ───────────────────────────────────────
    socket.on('room:leave', () => {
      handleDisconnect(socket);
    });

    // ─── Game: Start ───────────────────────────────────────
    socket.on('game:start', () => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      if (room.hostId !== socket.id) return;
      if (room.players.length < MIN_PLAYERS) {
        socket.emit('room:error', { message: `최소 ${MIN_PLAYERS}명이 필요합니다.` });
        return;
      }
      room.gameState.phase = 'phase1';
      gameLoop.startGame(room);
    });

    // ─── Player: Input (direction change) ──────────────────
    socket.on('player:input', ({ direction }: { direction: string }) => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      if (room.gameState.phase === 'phase1') {
        gameLoop.handleInput(room.code, socket.id, direction as any);
      } else if (room.gameState.phase === 'phase2') {
        if (direction === 'left' || direction === 'right') {
          gameLoop.handlePhase2Input(room.code, socket.id, direction);
        }
      }
    });

    // ─── Player: Grab ──────────────────────────────────────
    socket.on('player:grab', () => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      gameLoop.handleGrab(room.code, socket.id);
    });

    // ─── Voice: Signaling relay ────────────────────────────
    socket.on('voice:offer', ({ targetId, offer }: { targetId: string; offer: unknown }) => {
      io.to(targetId).emit('voice:offer', { fromId: socket.id, offer });
    });

    socket.on('voice:answer', ({ targetId, answer }: { targetId: string; answer: unknown }) => {
      io.to(targetId).emit('voice:answer', { fromId: socket.id, answer });
    });

    socket.on('voice:ice-candidate', ({ targetId, candidate }: { targetId: string; candidate: unknown }) => {
      io.to(targetId).emit('voice:ice-candidate', { fromId: socket.id, candidate });
    });

    // ─── Disconnect ────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[disconnect] ${socket.id}`);
      handleDisconnect(socket);
    });

    function handleDisconnect(sock: Socket) {
      const result = roomManager.disconnectPlayer(sock.id);
      if (!result) return;

      if (result.destroyed) {
        gameLoop.stopGame(result.room.code);
      } else {
        sock.to(result.room.code).emit('room:player-left', {
          playerId: sock.id,
          disconnectedName: result.disconnectedName,
        });

        if (result.shouldPause) {
          gameLoop.pauseGame(result.room.code);
          io.to(result.room.code).emit('game:paused', {
            reason: `${result.disconnectedName}님의 연결이 끊겼습니다. 재접속 대기 중...`,
          });
        }

        io.to(result.room.code).emit('game:state', result.room.gameState);
      }
    }
  });
}
