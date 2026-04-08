import React, { useCallback, useRef } from 'react';
import type { AnyDirection } from '@qwas/shared';

interface TouchControlsProps {
  /** All my assigned directions in multiplayer, empty for local */
  myDirections: AnyDirection[];
  onDirection: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onGrab: () => void;
  phase: string;
  /** Only host can grab */
  isHost: boolean;
}

const DIR_COLORS: Record<string, string> = {
  up: '#e74c3c',
  down: '#3498db',
  left: '#2ecc71',
  right: '#f39c12',
};

const DIR_LABELS: Record<string, string> = {
  up: '위', down: '아래', left: '좌', right: '우',
  'up-left': '좌상', 'up-right': '우상', 'down-left': '좌하', 'down-right': '우하',
};

/**
 * Hook to prevent double-fire from onTouchStart + onClick on mobile.
 * After a touch event, ignores click events for 500ms.
 */
function useTouchSafe(handler: () => void) {
  const lastTouchRef = useRef(0);

  const onTouch = useCallback(() => {
    lastTouchRef.current = Date.now();
    handler();
  }, [handler]);

  const onClick = useCallback(() => {
    // Ignore click if it was preceded by a touch within 500ms
    if (Date.now() - lastTouchRef.current < 500) return;
    handler();
  }, [handler]);

  return { onTouchStart: onTouch, onClick };
}

export function TouchControls({ myDirections, onDirection, onGrab, phase, isHost }: TouchControlsProps) {
  const press = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    onDirection(dir);
  }, [onDirection]);

  const isPhase2 = phase === 'phase2';

  const grabSafe = useTouchSafe(onGrab);
  const upSafe = useTouchSafe(() => press('up'));
  const downSafe = useTouchSafe(() => press('down'));
  const leftSafe = useTouchSafe(() => press('left'));
  const rightSafe = useTouchSafe(() => press('right'));

  return (
    <div style={containerStyle}>
      {/* D-Pad area */}
      <div style={dpadContainer}>
        {/* Up */}
        {!isPhase2 && (
          <DirButton
            dir="up"
            myDirs={myDirections}
            touchHandlers={upSafe}
            style={{ gridArea: 'up' }}
          />
        )}
        {/* Left */}
        <DirButton
          dir="left"
          myDirs={myDirections}
          touchHandlers={leftSafe}
          style={{ gridArea: 'left' }}
        />
        {/* Grab button (center) — host only */}
        {isHost ? (
          <button
            onTouchStart={grabSafe.onTouchStart}
            onClick={grabSafe.onClick}
            style={grabBtnStyle}
          >
            집기
          </button>
        ) : (
          <div style={{
            ...grabBtnStyle,
            background: 'rgba(155,142,196,0.2)',
            fontSize: 11,
            color: '#8b7bb5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            방장만
          </div>
        )}
        {/* Right */}
        <DirButton
          dir="right"
          myDirs={myDirections}
          touchHandlers={rightSafe}
          style={{ gridArea: 'right' }}
        />
        {/* Down */}
        {!isPhase2 && (
          <DirButton
            dir="down"
            myDirs={myDirections}
            touchHandlers={downSafe}
            style={{ gridArea: 'down' }}
          />
        )}
      </div>
    </div>
  );
}

function DirButton({ dir, myDirs, touchHandlers, style }: {
  dir: 'up' | 'down' | 'left' | 'right';
  myDirs: AnyDirection[];
  touchHandlers: { onTouchStart: () => void; onClick: () => void };
  style: React.CSSProperties;
}) {
  const isMine = myDirs.length === 0 || myDirs.includes(dir);
  const color = DIR_COLORS[dir];
  const rotations: Record<string, number> = { up: 0, down: 180, left: -90, right: 90 };
  const rot = rotations[dir];

  return (
    <button
      onTouchStart={touchHandlers.onTouchStart}
      onClick={touchHandlers.onClick}
      style={{
        ...dirBtnBase,
        ...style,
        background: isMine ? color : 'rgba(255,255,255,0.85)',
        color: isMine ? '#fff' : '#666',
        border: isMine ? `3px solid ${color}` : '2px solid rgba(0,0,0,0.1)',
        boxShadow: isMine ? `0 2px 12px ${color}44` : '0 2px 6px rgba(0,0,0,0.08)',
      }}
    >
      <svg width={22} height={22} viewBox="0 0 24 24" style={{ transform: `rotate(${rot}deg)` }}>
        <path
          d="M12 4 L6 14 L10 14 L10 20 L14 20 L14 14 L18 14 Z"
          fill={isMine ? '#fff' : '#888'}
        />
      </svg>
      {isMine && (
        <span style={{ fontSize: 9, fontWeight: 700, display: 'block', marginTop: -2 }}>
          {DIR_LABELS[dir] || dir}
        </span>
      )}
    </button>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 50,
  pointerEvents: 'auto',
};

const dpadContainer: React.CSSProperties = {
  display: 'grid',
  gridTemplateAreas: `
    ".    up    ."
    "left grab  right"
    ".    down  ."
  `,
  gridTemplateColumns: '56px 56px 56px',
  gridTemplateRows: '56px 56px 56px',
  gap: 4,
};

const dirBtnBase: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  touchAction: 'manipulation',
  userSelect: 'none',
  padding: 0,
  WebkitTapHighlightColor: 'transparent',
};

const grabBtnStyle: React.CSSProperties = {
  gridArea: 'grab',
  width: 56,
  height: 56,
  borderRadius: 28,
  background: 'linear-gradient(135deg, #9b8ec4, #7ecbf5)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  border: 'none',
  cursor: 'pointer',
  touchAction: 'manipulation',
  userSelect: 'none',
  boxShadow: '0 3px 12px rgba(126, 203, 245, 0.4)',
  WebkitTapHighlightColor: 'transparent',
};
