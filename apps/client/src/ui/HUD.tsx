import React, { useEffect, useState } from 'react';

interface HUDProps {
  level: number;
  coins: number;
  phase: string;
  overlapPercent: number;
  lastResult: string | null;
  onRestart: () => void;
}

export function HUD({ level, coins, phase, overlapPercent, lastResult, onRestart }: HUDProps) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (lastResult) {
      setShowResult(true);
      const t = setTimeout(() => setShowResult(false), 2500);
      return () => clearTimeout(t);
    }
  }, [lastResult]);

  return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        pointerEvents: 'none',
      }}>
        <div style={pillStyle}>
          Level {level}
        </div>
        <div style={pillStyle}>
          {phase === 'phase1' ? 'Phase 1 - 미로 탐색' : phase === 'phase2' ? 'Phase 2 - 하강' : phase}
        </div>
        <div style={pillStyle}>
          Coins: {coins}
        </div>
      </div>

      {/* Controls hint */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        ...pillStyle,
        fontSize: 12,
        opacity: 0.7,
      }}>
        Arrow keys: 방향 변경 | Space: 집기 | R: 재시작
      </div>

      {/* Overlap indicator */}
      {overlapPercent > 0 && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          ...pillStyle,
          background: overlapPercent >= 10 ? 'rgba(100, 200, 100, 0.9)' : 'rgba(200, 100, 100, 0.9)',
          fontSize: 18,
          fontWeight: 'bold',
        }}>
          겹침: {overlapPercent.toFixed(1)}%
        </div>
      )}

      {/* Result popup */}
      {showResult && lastResult && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '24px 48px',
          borderRadius: 20,
          background: lastResult === 'success' ? 'rgba(100, 220, 140, 0.95)' : 'rgba(220, 100, 100, 0.95)',
          color: '#fff',
          fontSize: 32,
          fontWeight: 'bold',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          animation: 'pop-in 0.3s ease-out',
        }}>
          {lastResult === 'success' ? '성공!' : '실패...'}
        </div>
      )}

      <style>{`
        @keyframes pop-in {
          from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}

const pillStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.85)',
  borderRadius: 16,
  padding: '8px 18px',
  fontSize: 15,
  fontWeight: 600,
  color: '#4a3f6b',
  boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
  backdropFilter: 'blur(8px)',
};
