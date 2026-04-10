import React, { useEffect, useState } from 'react';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * DevTest page: simulates N players in a single browser window.
 *
 * Flow:
 *  1. User clicks "Start".
 *  2. We mount N iframes. P1 (host=1) creates the room, then publishes the
 *     room code over a BroadcastChannel. P2..PN listen on the channel and
 *     join when they receive the code.
 *  3. The DevTest harness itself also listens on the same channel so the
 *     control bar can show the live room code for humans.
 *
 * This avoids the previous "controller creates a room that gets destroyed
 * before iframes can join it" quirk.
 */
export function DevTest() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // Listen to BroadcastChannel for the host's room code so the control bar
  // can display it as soon as P1's iframe creates the room.
  useEffect(() => {
    if (!started) return;
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('qwas-devtest-room');
    const onMessage = (ev: MessageEvent) => {
      if (ev?.data?.type === 'room-code' && typeof ev.data.code === 'string') {
        if (!roomCode) {
          setRoomCode(ev.data.code);
          addLog('Received room code from P1: ' + ev.data.code);
        }
      }
    };
    channel.addEventListener('message', onMessage);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
    };
  }, [started, roomCode]);

  const startTest = () => {
    addLog('Starting devtest with ' + playerCount + ' players...');
    setStarted(true);
  };

  const gridCols = playerCount <= 2 ? 2 : 2;
  const gridRows = playerCount <= 2 ? 1 : 2;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column' }}>
      {/* Control bar */}
      <div style={{
        padding: '8px 16px', background: '#16213e',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <span style={{ color: '#e94560', fontWeight: 700, fontSize: 14 }}>DEV TEST</span>

        <select
          value={playerCount}
          onChange={e => setPlayerCount(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={2}>2 Players</option>
          <option value={3}>3 Players</option>
          <option value={4}>4 Players</option>
        </select>

        {!started ? (
          <button onClick={startTest} style={btnStyle}>
            Start {playerCount}-player Test
          </button>
        ) : roomCode ? (
          <span style={{ color: '#0f3460', background: '#e94560', padding: '4px 12px', borderRadius: 6, fontWeight: 700, fontFamily: 'monospace', fontSize: 16 }}>
            {roomCode}
          </span>
        ) : (
          <span style={{ color: '#ffd23f', fontSize: 12, fontStyle: 'italic' }}>
            waiting for P1 to create room...
          </span>
        )}

        <span style={{ color: '#666', fontSize: 11, marginLeft: 'auto' }}>
          Server: {SERVER_URL}
        </span>
      </div>

      {/* Player iframes */}
      {started ? (
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: 2,
          background: '#0f3460',
        }}>
          {Array.from({ length: playerCount }).map((_, i) => (
            <div key={i} style={{ position: 'relative', overflow: 'hidden' }}>
              {/* Player label */}
              <div style={{
                position: 'absolute', top: 4, left: 4, zIndex: 10,
                background: PLAYER_COLORS[i], color: '#fff',
                padding: '2px 8px', borderRadius: 4,
                fontSize: 11, fontWeight: 700,
              }}>
                P{i + 1}{i === 0 ? ' (Host)' : ''}
              </div>
              <iframe
                src={`/?devtest=1&name=P${i + 1}&host=${i === 0 ? '1' : '0'}`}
                style={{
                  width: '100%', height: '100%', border: 'none',
                  borderTop: `3px solid ${PLAYER_COLORS[i]}`,
                }}
                title={`Player ${i + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{ color: '#e94560', fontSize: 24, fontWeight: 700 }}>
            Cooperative Claw Machine - Dev Test
          </div>
          <div style={{ color: '#a2a2a2', fontSize: 14 }}>
            Click "Start" to simulate {playerCount} players
          </div>
          <div style={{ color: '#666', fontSize: 12, maxWidth: 520, textAlign: 'center' }}>
            Each player panel is an independent iframe with its own socket connection.
            <br />P1 creates the room and broadcasts the code to siblings via BroadcastChannel.
            <br />P1 is the host (can grab with Space). All players have directional controls.
          </div>
        </div>
      )}

      {/* Log panel */}
      <div style={{
        height: 80, overflow: 'auto', padding: '4px 12px',
        background: '#0a0a1a', fontFamily: 'monospace', fontSize: 11, color: '#4a4a6a',
        flexShrink: 0,
      }}>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}

const PLAYER_COLORS = ['#e94560', '#3498db', '#2ecc71', '#f39c12'];

const btnStyle: React.CSSProperties = {
  padding: '6px 16px', borderRadius: 6, border: 'none',
  background: '#e94560', color: '#fff', fontWeight: 600,
  fontSize: 13, cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 4, border: '1px solid #333',
  background: '#1a1a2e', color: '#ccc', fontSize: 12,
};
