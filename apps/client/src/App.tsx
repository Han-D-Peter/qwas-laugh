import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/engine.js';
import { GameSocket } from './network/socket.js';
import { VoiceChatManager } from './voice/webrtc.js';
import { HUD } from './ui/HUD.js';
import { Lobby } from './ui/Lobby.js';
import { VoiceControls } from './ui/VoiceControls.js';
import { PlayerDirectionOverlay } from './ui/PlayerDirectionOverlay.js';
import type { GameState, PlayerState } from '@qwas/shared';

type AppMode = 'lobby' | 'local' | 'multiplayer';
type LobbyMode = 'menu' | 'creating' | 'joining' | 'waiting';

export function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  const mountedRef = useRef(false);

  const [appMode, setAppMode] = useState<AppMode>('lobby');
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('menu');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const voiceRef = useRef<VoiceChatManager | null>(null);
  const [voiceManager, setVoiceManager] = useState<VoiceChatManager | null>(null);
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map());

  const [gameInfo, setGameInfo] = useState({
    level: 1,
    coins: 0,
    phase: 'phase1' as string,
    overlapPercent: 0,
    lastResult: null as string | null,
    suspenseProgress: 0,
    suspensePhase: '' as string,
  });

  // ─── Local Game ─────────────────────────────────────────────

  const startLocalGame = useCallback(() => {
    setAppMode('local');
    setLobbyMode('menu');
  }, []);

  useEffect(() => {
    if (appMode !== 'local') return;
    if (!canvasContainerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const engine = new GameEngine(canvasContainerRef.current, (info) => {
      setGameInfo(info);
    });
    engineRef.current = engine;

    return () => {
      mountedRef.current = false;
      engine.destroy();
      engineRef.current = null;
    };
  }, [appMode]);

  // ─── Multiplayer Connection ─────────────────────────────────

  const initSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const gs = new GameSocket();

    gs.onRoom((event, data) => {
      switch (event) {
        case 'room:created':
          setRoomCode(data.code);
          setMyPlayerId(data.playerId);
          setIsHost(true);
          setLobbyMode('waiting');
          // Initialize voice chat manager
          if (!voiceRef.current) {
            const vm = new VoiceChatManager(gs, () => setVoiceManager(vm));
            voiceRef.current = vm;
            setVoiceManager(vm);
          }
          break;
        case 'room:joined':
          setMyPlayerId(data.playerId);
          if (data.code) setRoomCode(data.code);
          setLobbyMode('waiting');
          if (!voiceRef.current) {
            const vm = new VoiceChatManager(gs, () => setVoiceManager(vm));
            voiceRef.current = vm;
            setVoiceManager(vm);
          }
          break;
        case 'room:player-joined':
          // Connect voice to new peer
          if (voiceRef.current && data.playerId) {
            voiceRef.current.connectToPeer(data.playerId);
          }
          break;
        case 'room:player-left':
          if (voiceRef.current && data.playerId) {
            voiceRef.current.removePeer(data.playerId);
          }
          break;
        case 'room:error':
          setError(data.message);
          break;
      }
    });

    gs.onState((state: GameState) => {
      setPlayers([...state.players]);
      // Update player name map for voice controls
      const names = new Map<string, string>();
      for (const p of state.players) {
        names.set(p.id, p.name);
      }
      setPlayerNames(names);
      if (state.phase !== 'lobby') {
        // Game has started — switch to multiplayer game view
        setAppMode('multiplayer');
        setGameInfo({
          level: state.level,
          coins: state.coins,
          phase: state.phase,
          overlapPercent: 0,
          lastResult: state.lastResult,
          suspenseProgress: 0,
          suspensePhase: '',
        });
      }
    });

    gs.connect();
    socketRef.current = gs;
    return gs;
  }, []);

  const handleCreateRoom = useCallback((name: string) => {
    setError(null);
    const gs = initSocket();
    // Wait for connection, then create
    const tryCreate = () => {
      if (gs.connected) {
        gs.createRoom(name);
      } else {
        setTimeout(tryCreate, 200);
      }
    };
    tryCreate();
  }, [initSocket]);

  const handleJoinRoom = useCallback((code: string, name: string) => {
    setError(null);
    if (!code) {
      setLobbyMode('joining');
      initSocket();
      return;
    }
    const gs = initSocket();
    const tryJoin = () => {
      if (gs.connected) {
        gs.joinRoom(code, name);
      } else {
        setTimeout(tryJoin, 200);
      }
    };
    tryJoin();
  }, [initSocket]);

  const handleStartGame = useCallback(() => {
    socketRef.current?.startGame();
  }, []);

  // ─── Multiplayer Input ──────────────────────────────────────

  useEffect(() => {
    if (appMode !== 'multiplayer') return;

    const handleKey = (e: KeyboardEvent) => {
      const gs = socketRef.current;
      if (!gs) return;

      switch (e.key) {
        case 'ArrowUp':    gs.sendInput('up');    e.preventDefault(); break;
        case 'ArrowDown':  gs.sendInput('down');  e.preventDefault(); break;
        case 'ArrowLeft':  gs.sendInput('left');  e.preventDefault(); break;
        case 'ArrowRight': gs.sendInput('right'); e.preventDefault(); break;
        case ' ':          gs.sendGrab();          e.preventDefault(); break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [appMode]);

  // ─── Multiplayer game rendering ─────────────────────────────

  useEffect(() => {
    if (appMode !== 'multiplayer') return;
    if (!canvasContainerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    // Create engine in "remote" mode (no local game loop)
    const engine = new GameEngine(canvasContainerRef.current, (info) => {
      setGameInfo(info);
    });
    engineRef.current = engine;

    // Pipe server state into engine for rendering
    socketRef.current?.onState((state) => {
      engine.applyServerState(state);
    });

    return () => {
      mountedRef.current = false;
      engine.destroy();
      engineRef.current = null;
    };
  }, [appMode]);

  const handleRestart = useCallback(() => {
    engineRef.current?.restart();
  }, []);

  // ─── Render ─────────────────────────────────────────────────

  if (appMode === 'lobby') {
    return (
      <Lobby
        mode={lobbyMode}
        roomCode={roomCode}
        players={players}
        isHost={isHost}
        error={error}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onStartGame={handleStartGame}
        onStartLocal={startLocalGame}
      />
    );
  }

  // Game view (local or multiplayer)
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={canvasContainerRef}
        style={{ width: '100%', height: '100%' }}
      />
      <HUD
        level={gameInfo.level}
        coins={gameInfo.coins}
        phase={gameInfo.phase}
        overlapPercent={gameInfo.overlapPercent}
        lastResult={gameInfo.lastResult}
        suspenseProgress={gameInfo.suspenseProgress}
        suspensePhase={gameInfo.suspensePhase}
        onRestart={handleRestart}
      />
      {appMode === 'multiplayer' && myPlayerId && (
        <PlayerDirectionOverlay players={players} myPlayerId={myPlayerId} />
      )}
      {appMode === 'multiplayer' && (
        <VoiceControls
          voiceManager={voiceManager}
          playerNames={playerNames}
          playerIds={players.map(p => p.id)}
        />
      )}
    </div>
  );
}
