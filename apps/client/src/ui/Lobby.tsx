import React, { useState } from 'react';
import type { PlayerState } from '@qwas/shared';
import type { VoiceChatManager } from '../voice/webrtc.js';
import { VoiceControls } from './VoiceControls.js';
import { LobbyBackground } from './LobbyBackground.js';
import { ARCADE } from '../theme/arcade.js';

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
  voiceManager: VoiceChatManager | null;
  playerNames: Map<string, string>;
}

export function Lobby({
  mode, roomCode, players, isHost, error,
  onCreateRoom, onJoinRoom, onStartGame, onStartLocal,
  voiceManager, playerNames,
}: LobbyProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  return (
    <div style={containerStyle}>
      <LobbyBackground />

      {/* Scanline overlay across entire lobby */}
      <div style={scanlineOverlayStyle} />

      <div style={cardStyle}>
        <h1 style={titleStyle}>
          CLAW MACHINE
        </h1>
        <div style={subtitleStyle}>
          협동 인형뽑기
        </div>
        <p style={taglineStyle}>
          4-PLAYER CO-OP GAME
        </p>

        {error && (
          <div style={errorStyle}>{error}</div>
        )}

        {mode === 'menu' && (
          <>
            <input
              style={inputStyle}
              placeholder="NICKNAME"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={12}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                style={name.trim() ? btnPrimary : btnDisabled}
                onClick={() => name.trim() && onCreateRoom(name.trim())}
                disabled={!name.trim()}
              >
                CREATE
              </button>
              <button
                style={name.trim() ? btnSecondary : btnDisabled}
                onClick={() => name.trim() && onJoinRoom('', name.trim())}
                disabled={!name.trim()}
              >
                JOIN
              </button>
            </div>
            <button
              style={{ ...btnText, marginTop: 18 }}
              onClick={onStartLocal}
            >
              &gt;&gt;  LOCAL  SOLO  PLAY  &lt;&lt;
            </button>
          </>
        )}

        {mode === 'joining' && (
          <>
            <input
              style={inputStyle}
              placeholder="ROOM CODE (4)"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={4}
            />
            <button
              style={{ ...(code.length === 4 ? btnPrimary : btnDisabled), marginTop: 12, flex: 'none', width: '100%' }}
              onClick={() => code.length === 4 && onJoinRoom(code, name)}
              disabled={code.length !== 4}
            >
              ENTER
            </button>
          </>
        )}

        {mode === 'waiting' && roomCode && (
          <>
            <div style={{ margin: '16px 0' }}>
              <div style={sectionLabel}>ROOM CODE</div>
              <div
                onClick={() => { navigator.clipboard.writeText(roomCode!); }}
                title="Click to copy"
                style={codeDisplayStyle}
              >
                {roomCode}
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.6 }}>📋</span>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={sectionLabel}>PLAYERS ({players.length}/4)</div>
              {players.map((p) => (
                <div key={p.id} style={playerRowStyle}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: ARCADE.CSS_NEON_CYAN, fontSize: 10, fontFamily: ARCADE.PIXEL_FONT, letterSpacing: 1 }}>
                    {p.assignedDirection === 'up' ? 'UP' :
                     p.assignedDirection === 'down' ? 'DOWN' :
                     p.assignedDirection === 'left' ? 'LEFT' : 'RIGHT'}
                    {p.isHost ? ' *HOST' : ''}
                  </span>
                </div>
              ))}
              {Array.from({ length: 4 - players.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{ ...playerRowStyle, opacity: 0.35 }}>
                  WAITING...
                </div>
              ))}
            </div>

            {/* Voice chat in lobby */}
            <div style={voicePanelStyle}>
              <VoiceControls
                voiceManager={voiceManager}
                playerNames={playerNames}
                playerIds={players.map(p => p.id)}
              />
            </div>

            {isHost && (
              <button
                style={{ ...btnPrimary, width: '100%', marginTop: 4 }}
                onClick={onStartGame}
              >
                START GAME
              </button>
            )}
            {!isHost && (
              <p style={{ color: ARCADE.CSS_NEON_CYAN, fontSize: 10, fontFamily: ARCADE.PIXEL_FONT, letterSpacing: 1, marginTop: 8, textShadow: ARCADE.GLOW_CYAN }}>
                WAITING FOR HOST...
              </p>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes neon-flicker {
          0%, 100% { opacity: 1; }
          92% { opacity: 1; }
          93% { opacity: 0.3; }
          95% { opacity: 1; }
          97% { opacity: 0.6; }
          98% { opacity: 1; }
        }
        @keyframes title-pulse {
          0%, 100% { text-shadow: 0 0 4px #ff2e93, 0 0 10px #ff2e93, 0 0 20px #ff2e93; }
          50% { text-shadow: 0 0 6px #ff2e93, 0 0 16px #ff2e93, 0 0 28px #ff2e93, 0 0 40px #ff2e93; }
        }
      `}</style>
    </div>
  );
}

// ─── Styles ───

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: ARCADE.CSS_DEEP_NAVY,
  padding: 16,
  overflow: 'hidden',
  position: 'relative',
};

const scanlineOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage: 'repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 3px)',
  mixBlendMode: 'multiply',
  zIndex: 2,
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(10,14,44,0.82)',
  border: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
  borderRadius: 8,
  padding: '30px 28px',
  // Plan spec: cyan outer glow + pink secondary glow + inset cyan wash
  boxShadow: '0 0 20px #00e5ff, 0 0 40px #ff2e93, inset 0 0 15px rgba(0,229,255,0.1)',
  backdropFilter: 'blur(4px)',
  textAlign: 'center',
  minWidth: 340,
  maxWidth: 420,
  zIndex: 3,
  position: 'relative',
  color: '#e0e0f0',
};

const titleStyle: React.CSSProperties = {
  fontFamily: ARCADE.PIXEL_FONT,
  fontSize: 32,
  color: '#fff',
  margin: '0 0 8px',
  letterSpacing: 2,
  animation: 'title-pulse 2s ease-in-out infinite',
  textShadow: ARCADE.GLOW_PINK,
};

const subtitleStyle: React.CSSProperties = {
  color: ARCADE.CSS_NEON_CYAN,
  fontSize: 14,
  margin: '0 0 4px',
  letterSpacing: 2,
  textShadow: ARCADE.GLOW_CYAN,
  fontFamily: ARCADE.SYSTEM_FONT,
  fontWeight: 600,
};

const taglineStyle: React.CSSProperties = {
  color: ARCADE.CSS_NEON_YELLOW,
  fontSize: 9,
  margin: '0 0 22px',
  letterSpacing: 2,
  fontFamily: ARCADE.PIXEL_FONT,
  textShadow: ARCADE.GLOW_YELLOW,
  animation: 'neon-flicker 3s infinite',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 4,
  border: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
  background: 'rgba(0,0,0,0.5)',
  fontSize: 14,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 2,
  color: '#fff',
  outline: 'none',
  textAlign: 'center',
  boxSizing: 'border-box',
  boxShadow: `inset 0 0 10px rgba(0,229,255,0.15)`,
};

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '12px 18px',
  borderRadius: 4,
  border: `2px solid ${ARCADE.CSS_NEON_PINK}`,
  background: 'rgba(255,46,147,0.15)',
  color: ARCADE.CSS_NEON_PINK,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 2,
  cursor: 'pointer',
  boxShadow: `0 0 12px ${ARCADE.CSS_NEON_PINK}`,
  textShadow: ARCADE.GLOW_PINK,
  transition: 'all 0.15s ease',
};

const btnSecondary: React.CSSProperties = {
  flex: 1,
  padding: '12px 18px',
  borderRadius: 4,
  border: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
  background: 'rgba(0,229,255,0.12)',
  color: ARCADE.CSS_NEON_CYAN,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 2,
  cursor: 'pointer',
  boxShadow: `0 0 12px ${ARCADE.CSS_NEON_CYAN}`,
  textShadow: ARCADE.GLOW_CYAN,
  transition: 'all 0.15s ease',
};

const btnDisabled: React.CSSProperties = {
  flex: 1,
  padding: '12px 18px',
  borderRadius: 4,
  border: `2px solid rgba(155,142,196,0.3)`,
  background: 'rgba(0,0,0,0.3)',
  color: 'rgba(200,200,220,0.3)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 2,
  cursor: 'not-allowed',
};

const btnText: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: ARCADE.CSS_NEON_YELLOW,
  fontSize: 10,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 2,
  cursor: 'pointer',
  textShadow: ARCADE.GLOW_YELLOW,
  animation: 'neon-flicker 4s infinite',
};

const codeDisplayStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 'bold',
  color: ARCADE.CSS_NEON_YELLOW,
  letterSpacing: 10,
  padding: '14px 24px',
  background: 'rgba(0,0,0,0.5)',
  border: `2px solid ${ARCADE.CSS_NEON_YELLOW}`,
  borderRadius: 4,
  fontFamily: ARCADE.PIXEL_FONT,
  boxShadow: `0 0 18px ${ARCADE.CSS_NEON_YELLOW}, inset 0 0 10px rgba(255,210,63,0.2)`,
  textShadow: ARCADE.GLOW_YELLOW,
  cursor: 'pointer',
  position: 'relative',
};

const playerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: 3,
  background: 'rgba(0,229,255,0.06)',
  border: `1px solid rgba(0,229,255,0.25)`,
  marginBottom: 6,
  fontSize: 13,
  color: '#e0e0f0',
};

const voicePanelStyle: React.CSSProperties = {
  margin: '16px 0',
  padding: 12,
  background: 'rgba(0,0,0,0.35)',
  border: `1px solid rgba(0,229,255,0.3)`,
  borderRadius: 4,
};

const sectionLabel: React.CSSProperties = {
  color: ARCADE.CSS_NEON_CYAN,
  fontSize: 9,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 2,
  marginBottom: 8,
  textAlign: 'left',
  textShadow: ARCADE.GLOW_CYAN,
};

const errorStyle: React.CSSProperties = {
  background: 'rgba(255,46,147,0.15)',
  color: ARCADE.CSS_NEON_PINK,
  border: `1px solid ${ARCADE.CSS_NEON_PINK}`,
  padding: '10px 16px',
  borderRadius: 3,
  fontSize: 11,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 1,
  marginBottom: 12,
  textShadow: ARCADE.GLOW_PINK,
};
