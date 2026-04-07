import React, { useState } from 'react';
import type { PlayerState } from '@qwas/shared';

interface LobbyProps {
  mode: 'menu' | 'creating' | 'joining' | 'waiting';
  roomCode: string | null;
  players: PlayerState[];
  isHost: boolean;
  error: string | null;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (code: string, name: string) => void;
  onStartGame: () => void;
  onStartLocal: () => void;
}

export function Lobby({
  mode, roomCode, players, isHost, error,
  onCreateRoom, onJoinRoom, onStartGame, onStartLocal,
}: LobbyProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ color: '#4a3f6b', fontSize: 28, margin: '0 0 8px' }}>
          협동 인형뽑기
        </h1>
        <p style={{ color: '#8b7bb5', fontSize: 14, margin: '0 0 24px' }}>
          4명이 함께하는 협동 게임
        </p>

        {error && (
          <div style={errorStyle}>{error}</div>
        )}

        {mode === 'menu' && (
          <>
            <input
              style={inputStyle}
              placeholder="닉네임 입력"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={12}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                style={btnPrimary}
                onClick={() => name.trim() && onCreateRoom(name.trim())}
                disabled={!name.trim()}
              >
                방 만들기
              </button>
              <button
                style={btnSecondary}
                onClick={() => name.trim() && onJoinRoom('', name.trim())}
                disabled={!name.trim()}
              >
                참여하기
              </button>
            </div>
            <button
              style={{ ...btnText, marginTop: 16 }}
              onClick={onStartLocal}
            >
              로컬 싱글플레이
            </button>
          </>
        )}

        {mode === 'joining' && (
          <>
            <input
              style={inputStyle}
              placeholder="접속 코드 입력 (4자리)"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={4}
            />
            <button
              style={{ ...btnPrimary, marginTop: 12 }}
              onClick={() => code.length === 4 && onJoinRoom(code, name)}
              disabled={code.length !== 4}
            >
              입장하기
            </button>
          </>
        )}

        {mode === 'waiting' && roomCode && (
          <>
            <div style={{ margin: '16px 0' }}>
              <div style={{ color: '#8b7bb5', fontSize: 13, marginBottom: 4 }}>접속 코드</div>
              <div
                onClick={() => { navigator.clipboard.writeText(roomCode!); }}
                title="클릭하여 복사"
                style={{ ...codeDisplayStyle, cursor: 'pointer', position: 'relative' }}
              >
                {roomCode}
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.6 }}>📋</span>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#8b7bb5', fontSize: 13, marginBottom: 8 }}>플레이어 ({players.length}/4)</div>
              {players.map((p, i) => (
                <div key={p.id} style={playerRowStyle}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: '#9b8ec4', fontSize: 12 }}>
                    {p.assignedDirection === 'up' ? '위' :
                     p.assignedDirection === 'down' ? '아래' :
                     p.assignedDirection === 'left' ? '좌' : '우'}
                    {p.isHost ? ' (방장)' : ''}
                  </span>
                </div>
              ))}
              {Array.from({ length: 4 - players.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{ ...playerRowStyle, opacity: 0.4 }}>
                  대기 중...
                </div>
              ))}
            </div>

            {isHost && (
              <button
                style={btnPrimary}
                onClick={onStartGame}
              >
                게임 시작
              </button>
            )}
            {!isHost && (
              <p style={{ color: '#8b7bb5', fontSize: 13 }}>방장이 게임을 시작할 때까지 대기 중...</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(135deg, #f0e6f6 0%, #e0d4f0 100%)',
  padding: 16,
  overflow: 'auto',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 24,
  padding: '28px 24px',
  boxShadow: '0 8px 40px rgba(100, 80, 160, 0.15)',
  textAlign: 'center',
  minWidth: 340,
  maxWidth: 420,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  border: '2px solid #e0d4f0',
  fontSize: 16,
  outline: 'none',
  textAlign: 'center',
  boxSizing: 'border-box',
};

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '12px 24px',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(135deg, #9b8ec4 0%, #7ecbf5 100%)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  flex: 1,
  padding: '12px 24px',
  borderRadius: 12,
  border: '2px solid #9b8ec4',
  background: 'transparent',
  color: '#9b8ec4',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnText: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#9b8ec4',
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'underline',
};

const codeDisplayStyle: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 'bold',
  color: '#4a3f6b',
  letterSpacing: 8,
  padding: '12px 24px',
  background: '#f0e6f6',
  borderRadius: 12,
  fontFamily: 'monospace',
};

const playerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderRadius: 8,
  background: '#faf5ff',
  marginBottom: 4,
  fontSize: 14,
  color: '#4a3f6b',
};

const errorStyle: React.CSSProperties = {
  background: '#ffe0e0',
  color: '#c44',
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 12,
};
