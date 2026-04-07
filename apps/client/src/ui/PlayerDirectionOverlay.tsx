import React from 'react';
import type { PlayerState } from '@qwas/shared';

interface PlayerDirectionOverlayProps {
  players: PlayerState[];
  myPlayerId: string | null;
}

const DIRECTION_COLORS: Record<string, string> = {
  up: '#e74c3c',
  down: '#3498db',
  left: '#2ecc71',
  right: '#f39c12',
  'up-left': '#e74c3c',
  'up-right': '#f39c12',
  'down-left': '#2ecc71',
  'down-right': '#3498db',
};

const DIRECTION_LABELS: Record<string, string> = {
  up: '위',
  down: '아래',
  left: '좌',
  right: '우',
  'up-left': '좌상',
  'up-right': '우상',
  'down-left': '좌하',
  'down-right': '우하',
};

function ArrowIcon({ direction, color, size = 28 }: { direction: string; color: string; size?: number }) {
  const rotations: Record<string, number> = {
    up: 0, down: 180, left: -90, right: 90,
    'up-left': -45, 'up-right': 45, 'down-left': -135, 'down-right': 135,
  };
  const rot = rotations[direction] ?? 0;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${rot}deg)` }}>
      <path
        d="M12 4 L6 14 L10 14 L10 20 L14 20 L14 14 L18 14 Z"
        fill={color}
        stroke="#fff"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayerDirectionOverlay({ players, myPlayerId }: PlayerDirectionOverlayProps) {
  if (players.length === 0) return null;

  return (
    <div style={containerStyle}>
      {players.map(p => {
        const dirs = p.assignedDirections || [p.assignedDirection];
        const primaryColor = DIRECTION_COLORS[dirs[0]] || '#999';
        const isMe = p.id === myPlayerId;

        return (
          <div key={p.id} style={{
            ...playerCardStyle,
            borderBottom: `3px solid ${primaryColor}`,
            background: isMe ? 'rgba(126, 203, 245, 0.15)' : 'rgba(255,255,255,0.6)',
          }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {dirs.map(d => (
                <ArrowIcon key={d} direction={d} color={DIRECTION_COLORS[d] || '#999'} size={16} />
              ))}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: isMe ? 800 : 600,
              color: '#4a3f6b',
              lineHeight: 1.2,
            }}>
              {p.name}
              {isMe && <span style={{ color: primaryColor, fontSize: 9 }}>(나)</span>}
            </div>
            <div style={{ fontSize: 9, color: primaryColor, fontWeight: 700 }}>
              {dirs.map(d => DIRECTION_LABELS[d] || d).join('·')}
              {p.isHost ? ' · 방장' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '4px',
  borderRadius: 14,
  background: 'rgba(255, 255, 255, 0.88)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
  backdropFilter: 'blur(8px)',
};

const playerCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 10,
  minWidth: 60,
  gap: 2,
};
