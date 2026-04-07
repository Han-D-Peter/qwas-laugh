import { io, Socket } from 'socket.io-client';
import type { GameState } from '@qwas/shared';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface RoomInfo {
  code: string;
  playerId: string;
}

export class GameSocket {
  private socket: Socket;
  private onStateUpdate: ((state: GameState) => void) | null = null;
  private onRoomEvent: ((event: string, data: any) => void) | null = null;
  private onPhaseChange: ((phase: string, data: any) => void) | null = null;
  private onGrabResult: ((data: { probabilityA: number; probabilityB: number; success: boolean }) => void) | null = null;

  connectionState: ConnectionState = 'disconnected';
  roomInfo: RoomInfo | null = null;

  constructor() {
    this.socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      this.connectionState = 'connected';
      this.onRoomEvent?.('connection', { connected: true });
    });

    this.socket.on('disconnect', () => {
      this.connectionState = 'disconnected';
      this.onRoomEvent?.('connection', { connected: false });
    });

    this.socket.on('room:created', ({ code, playerId }: { code: string; playerId: string }) => {
      this.roomInfo = { code, playerId };
      this.onRoomEvent?.('room:created', { code, playerId });
    });

    this.socket.on('room:joined', ({ playerId, code, state }: { playerId: string; code: string; state: GameState }) => {
      this.roomInfo = { code, playerId };
      this.onStateUpdate?.(state);
      this.onRoomEvent?.('room:joined', { playerId, code });
    });

    this.socket.on('room:player-joined', (data: any) => {
      this.onRoomEvent?.('room:player-joined', data);
    });

    this.socket.on('room:player-left', (data: any) => {
      this.onRoomEvent?.('room:player-left', data);
    });

    this.socket.on('room:error', ({ message }: { message: string }) => {
      this.onRoomEvent?.('room:error', { message });
    });

    this.socket.on('game:state', (state: GameState) => {
      this.onStateUpdate?.(state);
    });

    this.socket.on('game:phase-change', ({ phase, data }: { phase: string; data: any }) => {
      this.onPhaseChange?.(phase, data);
    });

    this.socket.on('game:grab-result', (data: any) => {
      this.onGrabResult?.(data);
    });
  }

  connect() {
    this.connectionState = 'connecting';
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
    this.roomInfo = null;
  }

  createRoom(playerName: string) {
    this.socket.emit('room:create', { playerName });
  }

  joinRoom(code: string, playerName: string) {
    this.socket.emit('room:join', { code, playerName });
  }

  leaveRoom() {
    this.socket.emit('room:leave');
    this.roomInfo = null;
  }

  startGame() {
    this.socket.emit('game:start');
  }

  sendInput(direction: string) {
    this.socket.emit('player:input', { direction });
  }

  sendGrab() {
    this.socket.emit('player:grab');
  }

  // Voice signaling
  sendVoiceOffer(targetId: string, offer: RTCSessionDescriptionInit) {
    this.socket.emit('voice:offer', { targetId, offer });
  }

  sendVoiceAnswer(targetId: string, answer: RTCSessionDescriptionInit) {
    this.socket.emit('voice:answer', { targetId, answer });
  }

  sendVoiceIceCandidate(targetId: string, candidate: RTCIceCandidateInit) {
    this.socket.emit('voice:ice-candidate', { targetId, candidate });
  }

  /** Expose internal socket for voice signaling listeners */
  get rawSocket(): { on: (event: string, cb: (...args: any[]) => void) => void } { return this.socket; }

  // Callbacks
  onState(cb: (state: GameState) => void) { this.onStateUpdate = cb; }
  onRoom(cb: (event: string, data: any) => void) { this.onRoomEvent = cb; }
  onPhase(cb: (phase: string, data: any) => void) { this.onPhaseChange = cb; }
  onGrab(cb: (data: { probabilityA: number; probabilityB: number; success: boolean }) => void) { this.onGrabResult = cb; }

  get id() { return this.socket.id; }
  get connected() { return this.socket.connected; }
}
