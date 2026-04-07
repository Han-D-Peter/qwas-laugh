import React, { useEffect, useState } from 'react';

interface HUDProps {
  level: number;
  coins: number;
  phase: string;
  overlapPercent: number;
  lastResult: string | null;
  suspenseProgress?: number;
  suspensePhase?: string;
  onRestart: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  phase1: 'Phase 1 - 미로 탐색',
  phase1_to_phase2: '전환 중...',
  phase2_countdown: 'Phase 2 - 준비!',
  phase2: 'Phase 2 - 하강',
  suspense: '결과 확인 중...',
  result: '결과',
};

export function HUD({
  level, coins, phase, overlapPercent, lastResult,
  suspenseProgress = 0, suspensePhase = '',
  onRestart,
}: HUDProps) {
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
        <div style={pillStyle}>Level {level}</div>
        <div style={pillStyle}>{PHASE_LABELS[phase] || phase}</div>
        <div style={pillStyle}>Coins: {coins}</div>
      </div>

      {/* Phase 2 controls hint */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        ...pillStyle,
        fontSize: 12,
        opacity: 0.7,
      }}>
        {phase === 'phase2'
          ? '좌/우 Arrow: 집게 이동 | Space: 집기'
          : level >= 21
            ? 'Arrow keys: 대각선 이동 | Space: 집기 | R: 재시작'
            : 'Arrow keys: 방향 변경 | Space: 집기 | R: 재시작'
        }
      </div>

      {/* Overlap indicator */}
      {overlapPercent > 0 && phase !== 'suspense' && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          ...pillStyle,
          background: overlapPercent >= 10 ? 'rgba(100, 200, 100, 0.9)' : 'rgba(200, 100, 100, 0.9)',
          fontSize: 18, fontWeight: 'bold', color: '#fff',
        }}>
          겹침: {overlapPercent.toFixed(1)}%
        </div>
      )}

      {/* Phase transition indicator */}
      {phase === 'phase1_to_phase2' && (
        <div style={centerOverlay}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#6b5b95' }}>
            Phase 2로 전환!
          </div>
          <div style={{ fontSize: 16, color: '#8b7bb5', marginTop: 8 }}>
            확률 A: {overlapPercent.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Phase 2 countdown */}
      {phase === 'phase2_countdown' && (
        <div style={centerOverlay}>
          <div style={{ fontSize: 18, color: '#8b7bb5' }}>좌/우 키를 준비하세요!</div>
          <div style={{ fontSize: 64, fontWeight: 'bold', color: '#6b5b95', marginTop: 8 }}>
            {/* countdown value calculated from engine */}
          </div>
        </div>
      )}

      {/* Suspense bar */}
      {phase === 'suspense' && (
        <div style={{
          ...centerOverlay,
          width: 300,
        }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#6b5b95', marginBottom: 12 }}>
            {suspensePhase === 'building' ? '인형을 잡는 중...' : '결과는...?'}
          </div>
          <div style={{
            width: '100%', height: 12, borderRadius: 6,
            background: 'rgba(155, 142, 196, 0.3)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${suspenseProgress * 100}%`,
              height: '100%',
              borderRadius: 6,
              background: suspensePhase === 'building'
                ? 'linear-gradient(90deg, #9b8ec4, #7ecbf5)'
                : 'linear-gradient(90deg, #f5c27e, #f57e7e)',
              transition: 'width 0.1s',
            }} />
          </div>
        </div>
      )}

      {/* Result popup */}
      {showResult && lastResult && phase === 'result' && (
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
          zIndex: 10,
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

const centerOverlay: React.CSSProperties = {
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '24px 36px',
  borderRadius: 20,
  background: 'rgba(255, 255, 255, 0.92)',
  textAlign: 'center',
  boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  zIndex: 10,
};
