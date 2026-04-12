import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/engine.js';
import { GameSocket } from './network/socket.js';
import { VoiceChatManager } from './voice/webrtc.js';
import { HUD } from './ui/HUD.js';
import { Lobby } from './ui/Lobby.js';
import { VoiceControls } from './ui/VoiceControls.js';
import { PlayerDirectionOverlay } from './ui/PlayerDirectionOverlay.js';
import { TouchControls } from './ui/TouchControls.js';
import { ARCADE } from './theme/arcade.js';
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
    introSplash: null as 'ready' | 'go' | null,
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

  // ─── Auto-join for devtest mode ──────────────────────────────

  // ─── Devtest auto-connect (host creates room, joiners wait for broadcast) ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devtest = params.get('devtest');
    const name = params.get('name');
    const isHostParam = params.get('host') === '1';
    const roomFromUrl = params.get('room'); // back-compat if provided

    if (!devtest || !name) return;

    const channel = (typeof BroadcastChannel !== 'undefined')
      ? new BroadcastChannel('qwas-devtest-room')
      : null;

    let joinedCode: string | null = null;

    // Joiner: listen for the host's room code broadcast.
    const onMessage = (ev: MessageEvent) => {
      if (isHostParam) return;
      if (joinedCode) return;
      if (!ev?.data || typeof ev.data !== 'object') return;
      if (ev.data.type !== 'room-code' || typeof ev.data.code !== 'string') return;
      joinedCode = ev.data.code;
      const gs = socketRef.current ?? initSocket();
      const tryJoin = () => {
        if (gs.connected) {
          gs.joinRoom(joinedCode!, name);
        } else {
          setTimeout(tryJoin, 200);
        }
      };
      setTimeout(tryJoin, Math.random() * 300);
    };
    channel?.addEventListener('message', onMessage);

    // Host: create the room ONCE shortly after mount.
    const hostTimer = isHostParam ? setTimeout(() => {
      const gs = initSocket();
      const tryCreate = () => {
        if (gs.connected) {
          gs.createRoom(name);
        } else {
          setTimeout(tryCreate, 200);
        }
      };
      tryCreate();
    }, 200) : null;

    // Joiner with pre-baked URL room code (back-compat): join directly.
    const joinerUrlTimer = (!isHostParam && roomFromUrl) ? setTimeout(() => {
      const gs = initSocket();
      const tryJoin = () => {
        if (gs.connected) {
          gs.joinRoom(roomFromUrl, name);
        } else {
          setTimeout(tryJoin, 200);
        }
      };
      tryJoin();
    }, 500 + Math.random() * 500) : null;

    // Pre-warm the joiner's socket so `joinRoom` is instant when the broadcast
    // arrives (no extra round-trip waiting for socket connect).
    const joinerPrewarmTimer = (!isHostParam && !roomFromUrl) ? setTimeout(() => {
      if (!socketRef.current) initSocket();
    }, 400) : null;

    return () => {
      if (hostTimer) clearTimeout(hostTimer);
      if (joinerUrlTimer) clearTimeout(joinerUrlTimer);
      if (joinerPrewarmTimer) clearTimeout(joinerPrewarmTimer);
      channel?.removeEventListener('message', onMessage);
      channel?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Devtest host: publish our room code to sibling iframes ───
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('devtest') !== '1') return;
    if (params.get('host') !== '1') return;
    if (!roomCode) return;

    const channel = new BroadcastChannel('qwas-devtest-room');
    // Publish immediately, then a few more times to cover slow-mounting siblings.
    const publish = () => channel.postMessage({ type: 'room-code', code: roomCode });
    publish();
    const interval = setInterval(publish, 300);
    const stop = setTimeout(() => clearInterval(interval), 4000);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
      channel.close();
    };
  }, [roomCode]);

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
      // 1. Update React UI state
      setPlayers([...state.players]);
      const names = new Map<string, string>();
      for (const p of state.players) {
        names.set(p.id, p.name);
      }
      setPlayerNames(names);

      if (state.phase === 'paused') {
        setAppMode('multiplayer');
      } else if (state.phase !== 'lobby') {
        setAppMode('multiplayer');
        setPauseMessage(null);
        setConnectionLost(false);
        // Only sync HUD-safe fields here. DO NOT set phase, lastResult,
        // overlapPercent, suspenseProgress, or suspensePhase — those are
        // managed exclusively by the engine's updateInfo callback so the
        // engine's suspense/result choreography is never overridden by a
        // raw server broadcast that races ahead.
        setGameInfo(prev => ({
          ...prev,
          level: state.level,
          coins: state.coins,
        }));
      }

      // 2. Pipe to engine for rendering (if engine exists).
      // The engine's applyServerState → updateInfo callback is the
      // authoritative source for phase, lastResult, probabilities, and
      // suspense state in the HUD.
      engineRef.current?.applyServerState(state);
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

    // Listen for overlap results from server grab calculations
    gs.rawSocket.on('game:overlap', ({ phase, overlap, serverClawPos, serverDollPos }: any) => {
      engineRef.current?.setServerOverlap(phase, overlap, serverClawPos, serverDollPos);
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
    // Engine will receive state via the single onState callback in initSocket

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

  // Phase 2: determine which directions this player controls
  const myPhase2Directions: AnyDirection[] = (() => {
    if (appMode !== 'multiplayer' || !myPlayerId) return [];
    const p2Left = gameInfo.p2LeftPlayerId;
    const p2Right = gameInfo.p2RightPlayerId;
    const dirs: AnyDirection[] = [];
    if (p2Left === myPlayerId) dirs.push('left');
    if (p2Right === myPlayerId) dirs.push('right');
    return dirs;
  })();

  const isPhase2 = gameInfo.phase === 'phase2' || gameInfo.phase === 'phase2_countdown' || gameInfo.phase === 'phase2_to_suspense';
  const touchDirections = appMode === 'multiplayer'
    ? (isPhase2 ? myPhase2Directions : myDirections)
    : [];

  const handleTouchDirection = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (appMode === 'local') {
      engineRef.current?.handleDirection(dir);
    } else if (appMode === 'multiplayer') {
      socketRef.current?.sendInput(dir);
    }
  }, [appMode]);

  const handleTouchGrab = useCallback(() => {
    if (appMode === 'local') {
      engineRef.current?.handleGrab();
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
        voiceManager={voiceManager}
        playerNames={playerNames}
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
        introSplash={gameInfo.introSplash}
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
          myDirections={touchDirections}
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
          background: 'rgba(10,14,44,0.7)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 99, backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            width: 36, height: 36,
            border: `3px solid rgba(0,229,255,0.3)`,
            borderTopColor: ARCADE.CSS_NEON_CYAN,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 20,
            boxShadow: `0 0 18px ${ARCADE.CSS_NEON_CYAN}`,
          }} />
          <div style={{
            fontFamily: ARCADE.PIXEL_FONT,
            color: ARCADE.CSS_NEON_CYAN,
            textShadow: ARCADE.GLOW_CYAN,
            fontSize: 14,
            letterSpacing: 2,
            animation: 'neon-flicker 2s infinite',
          }}>
            RECONNECTING...
          </div>
        </div>
      )}
      {/* Pause overlay */}
      {pauseMessage && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(10,14,44,0.75)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 100,
          backdropFilter: 'blur(5px)',
        }}>
          <div style={{
            width: 48, height: 48,
            border: `4px solid rgba(255,46,147,0.3)`,
            borderTopColor: ARCADE.CSS_NEON_PINK,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 24,
            boxShadow: `0 0 18px ${ARCADE.CSS_NEON_PINK}`,
          }} />
          <div style={{
            fontFamily: ARCADE.PIXEL_FONT,
            color: ARCADE.CSS_NEON_PINK,
            textShadow: ARCADE.GLOW_PINK,
            fontSize: 14,
            textAlign: 'center',
            maxWidth: 320,
            letterSpacing: 2,
            lineHeight: 1.8,
            padding: '0 20px',
          }}>
            {pauseMessage}
          </div>
          {roomCode && (
            <div
              onClick={() => { navigator.clipboard.writeText(roomCode); }}
              style={{
                marginTop: 20,
                padding: '10px 22px',
                background: 'rgba(0,0,0,0.4)',
                border: `2px solid ${ARCADE.CSS_NEON_YELLOW}`,
                borderRadius: 4,
                color: ARCADE.CSS_NEON_YELLOW,
                fontSize: 11,
                fontFamily: ARCADE.PIXEL_FONT,
                letterSpacing: 2,
                textShadow: ARCADE.GLOW_YELLOW,
                boxShadow: `0 0 12px ${ARCADE.CSS_NEON_YELLOW}`,
                cursor: 'pointer',
                userSelect: 'none',
              }}>
              CODE: <span style={{ fontWeight: 700, letterSpacing: 4, fontSize: 16 }}>{roomCode}</span>
              <span style={{ marginLeft: 8, fontSize: 13 }}>📋</span>
            </div>
          )}
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @keyframes neon-flicker {
              0%, 100% { opacity: 1; }
              92% { opacity: 1; }
              93% { opacity: 0.3; }
              95% { opacity: 1; }
              97% { opacity: 0.6; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
