import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/engine.js';
import { GameSocket } from './network/socket.js';
import { VoiceChatManager } from './voice/webrtc.js';
import { HUD } from './ui/HUD.js';
import { Lobby } from './ui/Lobby.js';
import { VoiceControls } from './ui/VoiceControls.js';
import { PlayerDirectionOverlay } from './ui/PlayerDirectionOverlay.js';
import { TouchControls } from './ui/TouchControls.js';
import type { AnyDirection } from '@qwas/shared';
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
  const [pauseMessage, setPauseMessage] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);

  const [gameInfo, setGameInfo] = useState({
    level: 1,
    coins: 0,
    phase: 'phase1' as string,
    overlapPercent: 0,
    lastResult: null as string | null,
    suspenseProgress: 0,
    suspensePhase: '' as string,
    probabilityA: 0,
    probabilityB: 0,
    p2LeftPlayerId: null as string | null,
    p2RightPlayerId: null as string | null,
    p2Countdown: 0,
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
        case 'connection':
          if (data.connected) {
            setConnectionLost(false);
          } else if (data.connected === false && appMode === 'multiplayer') {
            setConnectionLost(true);
          }
          break;
      }
    });

    gs.onState((state: GameState) => {
      setPlayers([...state.players]);
      const names = new Map<string, string>();
      for (const p of state.players) {
        names.set(p.id, p.name);
      }
      setPlayerNames(names);

      if (state.phase === 'paused') {
        setAppMode('multiplayer');
        // Keep pause overlay visible
      } else if (state.phase !== 'lobby') {
        setAppMode('multiplayer');
        setPauseMessage(null);
        setGameInfo(prev => ({
          ...prev,
          level: state.level,
          coins: state.coins,
          phase: state.phase,
          overlapPercent: 0,
          lastResult: state.lastResult,
          probabilityA: Math.round(state.probabilityA * 100),
          probabilityB: Math.round(state.probabilityB * 100),
        }));
      }
    });

    // Listen for pause/resume events
    gs.rawSocket.on('game:paused', ({ reason }: { reason: string }) => {
      setPauseMessage(reason);
    });
    gs.rawSocket.on('game:resumed', () => {
      setPauseMessage(null);
    });

    // Listen for Phase 2 player assignments
    gs.rawSocket.on('game:phase-change', ({ phase, data }: { phase: string; data: any }) => {
      if (phase === 'phase2' && data?.p2Players) {
        const [leftId, rightId] = data.p2Players;
        engineRef.current?.setPhase2Players(leftId, rightId);
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

    // Create engine in remote mode (no local simulation, rendering only)
    const engine = new GameEngine(canvasContainerRef.current, (info) => {
      setGameInfo(info);
    });
    engine.setRemoteMode();
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

  // ─── Touch Controls ─────────────────────────────────────────

  const isTouchDevice = typeof window !== 'undefined' &&
    ('ontouchstart' in window || window.innerWidth <= 768);

  const myPlayer = players.find(p => p.id === myPlayerId);
  const myDirections: AnyDirection[] = myPlayer?.assignedDirections || (myPlayer ? [myPlayer.assignedDirection] : []);

  const handleTouchDirection = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (appMode === 'local') {
      // Simulate keyboard for local engine
      const keyMap: Record<string, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: keyMap[dir] }));
    } else if (appMode === 'multiplayer') {
      socketRef.current?.sendInput(dir);
    }
  }, [appMode]);

  const handleTouchGrab = useCallback(() => {
    if (appMode === 'local') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    } else if (appMode === 'multiplayer') {
      socketRef.current?.sendGrab();
    }
  }, [appMode]);

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
        probabilityA={gameInfo.probabilityA}
        probabilityB={gameInfo.probabilityB}
        p2LeftPlayerId={gameInfo.p2LeftPlayerId}
        p2RightPlayerId={gameInfo.p2RightPlayerId}
        p2Countdown={gameInfo.p2Countdown}
        myPlayerId={myPlayerId}
        playerNames={playerNames}
        onRestart={handleRestart}
      />
      {appMode === 'multiplayer' && (
        <div style={{
          position: 'absolute', top: 44, left: 8, right: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          pointerEvents: 'none', zIndex: 5,
        }}>
          <div style={{ pointerEvents: 'auto' }}>
            {myPlayerId && <PlayerDirectionOverlay players={players} myPlayerId={myPlayerId} />}
          </div>
          <div style={{ pointerEvents: 'auto' }}>
            <VoiceControls
              voiceManager={voiceManager}
              playerNames={playerNames}
              playerIds={players.map(p => p.id)}
            />
          </div>
        </div>
      )}
      {/* Touch controls for mobile */}
      {isTouchDevice && (
        <TouchControls
          myDirections={appMode === 'multiplayer' ? myDirections : []}
          onDirection={handleTouchDirection}
          onGrab={handleTouchGrab}
          phase={gameInfo.phase}
          isHost={appMode === 'local' || isHost}
        />
      )}
      {/* Room code badge (multiplayer) */}
      {appMode === 'multiplayer' && roomCode && (
        <div
          onClick={() => { navigator.clipboard.writeText(roomCode); }}
          title="클릭하여 복사"
          style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(255,255,255,0.85)',
            borderRadius: 10, padding: '5px 12px',
            fontSize: 11, color: '#8b7bb5',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            cursor: 'pointer', userSelect: 'none',
          }}>
          코드: <span style={{ fontWeight: 700, color: '#4a3f6b', letterSpacing: 2, fontFamily: 'monospace' }}>{roomCode}</span>
          <span style={{ marginLeft: 6, fontSize: 10 }}>📋</span>
        </div>
      )}
      {/* Connection lost overlay */}
      {connectionLost && !pauseMessage && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(40, 35, 55, 0.5)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 99, backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            width: 36, height: 36,
            border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 16,
          }} />
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
            서버 재연결 중...
          </div>
        </div>
      )}
      {/* Pause overlay */}
      {pauseMessage && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(40, 35, 55, 0.55)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 100,
          backdropFilter: 'blur(3px)',
        }}>
          {/* Spinner */}
          <div style={{
            width: 48, height: 48,
            border: '4px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 20,
          }} />
          <div style={{
            color: '#fff', fontSize: 18, fontWeight: 600,
            textAlign: 'center', maxWidth: 320,
          }}>
            {pauseMessage}
          </div>
          {roomCode && (
            <div
              onClick={() => { navigator.clipboard.writeText(roomCode); }}
              style={{
                marginTop: 16, padding: '8px 20px',
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 10, color: '#fff', fontSize: 13,
                cursor: 'pointer', userSelect: 'none',
              }}>
              접속 코드: <span style={{ fontWeight: 700, letterSpacing: 3, fontFamily: 'monospace', fontSize: 18 }}>{roomCode}</span>
              <span style={{ marginLeft: 8, fontSize: 14 }}>📋</span>
            </div>
          )}
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
