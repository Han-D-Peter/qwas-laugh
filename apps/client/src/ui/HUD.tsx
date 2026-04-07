import React, { useEffect, useState } from 'react';

interface HUDProps {
  level: number;
  coins: number;
  phase: string;
  overlapPercent: number;
  lastResult: string | null;
  suspenseProgress?: number;
  suspensePhase?: string;
  probabilityA?: number;
  probabilityB?: number;
  p2LeftPlayerId?: string | null;
  p2RightPlayerId?: string | null;
  p2Countdown?: number;
  myPlayerId?: string | null;
  playerNames?: Map<string, string>;
  onRestart: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  phase1: 'Phase 1 - 미로 탐색',
  phase1_to_phase2: 'Phase 1 완료!',
  phase2_countdown: 'Phase 2 - 준비!',
  phase2: 'Phase 2 - 하강',
  phase2_to_suspense: 'Phase 2 완료!',
  suspense: '결과 확인 중...',
  result: '결과',
  paused: '일시정지',
};

export function HUD({
  level, coins, phase, overlapPercent, lastResult,
  suspenseProgress = 0, suspensePhase = '',
  probabilityA = 0, probabilityB = 0,
  p2LeftPlayerId, p2RightPlayerId, p2Countdown = 0,
  myPlayerId, playerNames,
  onRestart,
}: HUDProps) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (lastResult && (phase === 'result' || phase === 'phase1')) {
      setShowResult(true);
      const t = setTimeout(() => setShowResult(false), 2500);
      return () => clearTimeout(t);
    }
  }, [lastResult, phase]);

  const finalProb = probabilityA > 0 && probabilityB > 0
    ? Math.round((probabilityA / 100) * (probabilityB / 100) * 100)
    : 0;

  return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 8, left: 8, right: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        pointerEvents: 'none', gap: 4,
      }}>
        <div style={pillStyle}>Lv.{level}</div>
        <div style={{ ...pillStyle, flex: 1, textAlign: 'center' }}>{PHASE_LABELS[phase] || phase}</div>
        <div style={pillStyle}>Coin:{coins}</div>
      </div>

      {/* Keyboard controls hint — hidden on touch/mobile devices */}
      {('ontouchstart' in globalThis || (typeof window !== 'undefined' && window.innerWidth <= 768)) ? null : (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          ...pillStyle, fontSize: 11, opacity: 0.6,
        }}>
          {phase === 'phase2'
            ? '좌/우 Arrow: 집게 이동 | Space: 집기'
            : level >= 21
              ? 'Arrow keys: 대각선 이동 | Space: 집기 | R: 재시작'
              : 'Arrow keys: 방향 변경 | Space: 집기 | R: 재시작'
          }
        </div>
      )}

      {/* Overlap indicator (shows after grab attempts) */}
      {overlapPercent > 0 && phase !== 'suspense' && phase !== 'result' && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          ...pillStyle,
          background: overlapPercent >= 10 ? 'rgba(100, 200, 100, 0.9)' : 'rgba(200, 100, 100, 0.9)',
          fontSize: 18, fontWeight: 'bold', color: '#fff',
        }}>
          겹침: {overlapPercent.toFixed(1)}%
        </div>
      )}

      {/* Phase 1 → Phase 2 transition: show probability A */}
      {phase === 'phase1_to_phase2' && (
        <div style={centerOverlay}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#6b5b95', marginBottom: 4 }}>
            Phase 1 완료!
          </div>
          <div style={{ fontSize: 14, color: '#8b7bb5', marginBottom: 12 }}>
            집게와 인형 겹침도
          </div>
          <div style={{
            ...probBoxStyle,
            animation: 'pop-in 0.5s ease-out',
          }}>
            <span style={{ color: '#8b7bb5', fontSize: 13 }}>확률 A</span>
            <span style={{ fontSize: 48, fontWeight: 'bold', color: '#3a7bc8' }}>
              {probabilityA}%
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#9b8ec4', marginTop: 12 }}>
            Phase 2로 이동합니다...
          </div>
        </div>
      )}

      {/* Phase 2 → Suspense transition: show probability B */}
      {phase === 'phase2_to_suspense' && (
        <div style={centerOverlay}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#6b5b95', marginBottom: 4 }}>
            Phase 2 완료!
          </div>
          <div style={{ fontSize: 14, color: '#8b7bb5', marginBottom: 12 }}>
            집게와 인형 겹침도
          </div>
          <div style={{
            ...probBoxStyle,
            animation: 'pop-in 0.5s ease-out',
          }}>
            <span style={{ color: '#8b7bb5', fontSize: 13 }}>확률 B</span>
            <span style={{ fontSize: 48, fontWeight: 'bold', color: '#3a7bc8' }}>
              {probabilityB}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14 }}>
            <div style={probBoxSmall}>
              <span style={{ fontSize: 11, color: '#8b7bb5' }}>확률 A</span>
              <span style={{ fontSize: 18, fontWeight: 'bold', color: '#4a3f6b' }}>{probabilityA}%</span>
            </div>
            <span style={{ fontSize: 18, color: '#9b8ec4', alignSelf: 'center' }}>x</span>
            <div style={probBoxSmall}>
              <span style={{ fontSize: 11, color: '#8b7bb5' }}>확률 B</span>
              <span style={{ fontSize: 18, fontWeight: 'bold', color: '#4a3f6b' }}>{probabilityB}%</span>
            </div>
            <span style={{ fontSize: 18, color: '#9b8ec4', alignSelf: 'center' }}>=</span>
            <div style={{ ...probBoxSmall, background: 'rgba(126, 203, 245, 0.15)' }}>
              <span style={{ fontSize: 11, color: '#5ba3d9' }}>최종</span>
              <span style={{ fontSize: 18, fontWeight: 'bold', color: '#3a7bc8' }}>{finalProb}%</span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#9b8ec4', marginTop: 10 }}>
            결과를 확인합니다...
          </div>
        </div>
      )}

      {/* Phase 2 countdown — show role assignment */}
      {phase === 'phase2_countdown' && (() => {
        const getName = (id: string | null | undefined) =>
          id && playerNames?.get(id) || id?.slice(0, 6) || '?';
        const isLeft = myPlayerId && p2LeftPlayerId === myPlayerId;
        const isRight = myPlayerId && p2RightPlayerId === myPlayerId;
        const isAssigned = isLeft || isRight;
        const isLocal = !myPlayerId; // local single-player

        return (
          <div style={centerOverlay}>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#6b5b95', marginBottom: 12 }}>
              Phase 2 시작!
            </div>

            {/* Role assignment display */}
            <div style={{
              display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 16,
            }}>
              <div style={{
                ...roleBoxStyle,
                background: isLeft ? 'rgba(46, 204, 113, 0.15)' : 'rgba(155, 142, 196, 0.08)',
                border: isLeft ? '2px solid #2ecc71' : '1px solid rgba(155,142,196,0.2)',
              }}>
                <span style={{ fontSize: 11, color: '#8b7bb5' }}>좌 담당</span>
                <span style={{ fontSize: 22, marginTop: 2 }}>⬅️</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isLeft ? '#2ecc71' : '#4a3f6b' }}>
                  {isLocal ? '플레이어' : getName(p2LeftPlayerId)}
                </span>
                {isLeft && <span style={{ fontSize: 11, color: '#2ecc71', fontWeight: 700 }}>나!</span>}
              </div>
              <div style={{
                ...roleBoxStyle,
                background: isRight ? 'rgba(243, 156, 18, 0.15)' : 'rgba(155, 142, 196, 0.08)',
                border: isRight ? '2px solid #f39c12' : '1px solid rgba(155,142,196,0.2)',
              }}>
                <span style={{ fontSize: 11, color: '#8b7bb5' }}>우 담당</span>
                <span style={{ fontSize: 22, marginTop: 2 }}>➡️</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isRight ? '#f39c12' : '#4a3f6b' }}>
                  {isLocal ? '플레이어' : getName(p2RightPlayerId)}
                </span>
                {isRight && <span style={{ fontSize: 11, color: '#f39c12', fontWeight: 700 }}>나!</span>}
              </div>
            </div>

            {/* My role message */}
            {!isLocal && (
              <div style={{
                fontSize: 20, fontWeight: 'bold',
                color: isAssigned ? '#4a3f6b' : '#8b7bb5',
                marginBottom: 12,
                animation: 'pop-in 0.4s ease-out',
              }}>
                {isLeft ? '당신은 ⬅️ 좌 담당!' :
                 isRight ? '당신은 ➡️ 우 담당!' :
                 '휴 살았다.. 🎉'}
              </div>
            )}

            {/* Countdown */}
            <div style={{
              fontSize: 48, fontWeight: 'bold', color: '#6b5b95',
              animation: 'pulse 0.6s ease-in-out infinite',
            }}>
              {p2Countdown > 0 ? p2Countdown : 'GO!'}
            </div>
          </div>
        );
      })()}

      {/* ─── Suspense Sequence ─── */}
      {phase === 'suspense' && (
        <div style={{ ...centerOverlay, minWidth: 320, maxWidth: '90vw' }}>

          {/* Phase: Show A */}
          {suspensePhase === 'showA' && (
            <>
              <div style={{ fontSize: 16, color: '#8b7bb5', marginBottom: 8 }}>Phase 1 결과</div>
              <div style={probBoxStyle}>
                <span style={{ color: '#8b7bb5', fontSize: 13 }}>확률 A</span>
                <span style={{
                  fontSize: 42, fontWeight: 'bold', color: '#4a3f6b',
                  animation: 'pop-in 0.4s ease-out',
                }}>
                  {probabilityA}%
                </span>
              </div>
            </>
          )}

          {/* Phase: Show B */}
          {suspensePhase === 'showB' && (
            <>
              <div style={{ fontSize: 16, color: '#8b7bb5', marginBottom: 8 }}>Phase 2 결과</div>
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
                <div style={probBoxStyle}>
                  <span style={{ color: '#8b7bb5', fontSize: 12 }}>확률 A</span>
                  <span style={{ fontSize: 28, fontWeight: 'bold', color: '#4a3f6b' }}>{probabilityA}%</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: '#9b8ec4', alignSelf: 'center' }}>x</div>
                <div style={probBoxStyle}>
                  <span style={{ color: '#8b7bb5', fontSize: 12 }}>확률 B</span>
                  <span style={{
                    fontSize: 28, fontWeight: 'bold', color: '#4a3f6b',
                    animation: 'pop-in 0.4s ease-out',
                  }}>{probabilityB}%</span>
                </div>
              </div>
            </>
          )}

          {/* Phase: Calculating */}
          {suspensePhase === 'calculating' && (
            <>
              <div style={{ fontSize: 16, color: '#8b7bb5', marginBottom: 12 }}>최종 확률 계산 중...</div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
                <div style={probBoxSmall}>
                  <span style={{ fontSize: 11, color: '#8b7bb5' }}>A</span>
                  <span style={{ fontSize: 20, fontWeight: 'bold', color: '#4a3f6b' }}>{probabilityA}%</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 'bold', color: '#9b8ec4', alignSelf: 'center' }}>x</div>
                <div style={probBoxSmall}>
                  <span style={{ fontSize: 11, color: '#8b7bb5' }}>B</span>
                  <span style={{ fontSize: 20, fontWeight: 'bold', color: '#4a3f6b' }}>{probabilityB}%</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 'bold', color: '#9b8ec4', alignSelf: 'center' }}>=</div>
                <div style={{ ...probBoxSmall, background: 'rgba(126, 203, 245, 0.15)' }}>
                  <span style={{ fontSize: 11, color: '#5ba3d9' }}>최종</span>
                  <span style={{
                    fontSize: 22, fontWeight: 'bold', color: '#3a7bc8',
                    animation: 'pop-in 0.5s ease-out',
                  }}>{finalProb}%</span>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{
                width: '100%', height: 8, borderRadius: 4,
                background: 'rgba(155, 142, 196, 0.2)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${suspenseProgress * 100}%`, height: '100%', borderRadius: 4,
                  background: 'linear-gradient(90deg, #9b8ec4, #7ecbf5)',
                  transition: 'width 0.1s',
                }} />
              </div>
            </>
          )}

          {/* Phase: Drumroll — shaking tension */}
          {suspensePhase === 'drumroll' && (
            <>
              <div style={{
                fontSize: 20, fontWeight: 'bold', color: '#6b5b95',
                marginBottom: 16,
                animation: 'shake 0.15s ease-in-out infinite',
              }}>
                인형을 뽑을 수 있을까...?
              </div>
              <div style={{
                fontSize: 56, fontWeight: 'bold', color: '#4a3f6b',
                animation: 'shake 0.1s ease-in-out infinite, pulse 0.6s ease-in-out infinite',
              }}>
                {finalProb}%
              </div>
              <div style={{
                marginTop: 16,
                fontSize: 32,
                animation: 'shake 0.12s ease-in-out infinite',
              }}>
                🎰
              </div>
            </>
          )}

          {/* Phase: Reveal */}
          {suspensePhase === 'reveal' && (
            <div style={{
              fontSize: 18, fontWeight: 'bold',
              color: '#6b5b95',
              animation: 'pop-in 0.3s ease-out',
            }}>
              결과 확인 중...
            </div>
          )}
        </div>
      )}

      {/* Result popup */}
      {showResult && lastResult && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '28px 48px',
          borderRadius: 24,
          background: lastResult === 'success'
            ? 'linear-gradient(135deg, rgba(100, 220, 140, 0.97), rgba(60, 180, 120, 0.97))'
            : 'linear-gradient(135deg, rgba(220, 100, 100, 0.97), rgba(180, 60, 60, 0.97))',
          color: '#fff',
          fontSize: 36,
          fontWeight: 'bold',
          textAlign: 'center',
          boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
          animation: 'pop-in 0.4s ease-out',
          zIndex: 20,
        }}>
          {lastResult === 'success' ? '성공!' : '실패...'}
          <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6, opacity: 0.9 }}>
            {lastResult === 'success'
              ? `확률 ${finalProb}%로 인형을 뽑았습니다!`
              : `확률 ${finalProb}%... 아쉽게 놓쳤습니다`
            }
          </div>
        </div>
      )}

      <style>{`
        @keyframes pop-in {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px) rotate(-1deg); }
          75% { transform: translateX(3px) rotate(1deg); }
        }
      `}</style>
    </>
  );
}

const pillStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.85)',
  borderRadius: 12,
  padding: '5px 12px',
  fontSize: 13,
  fontWeight: 600,
  color: '#4a3f6b',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  backdropFilter: 'blur(8px)',
  whiteSpace: 'nowrap',
};

const centerOverlay: React.CSSProperties = {
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '28px 36px',
  borderRadius: 24,
  background: 'rgba(255, 255, 255, 0.95)',
  textAlign: 'center',
  boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
  backdropFilter: 'blur(12px)',
  zIndex: 10,
};

const probBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '12px 20px',
  borderRadius: 14,
  background: 'rgba(155, 142, 196, 0.1)',
  marginTop: 8,
};

const probBoxSmall: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 14px',
  borderRadius: 10,
  background: 'rgba(155, 142, 196, 0.08)',
};

const roleBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '12px 20px',
  borderRadius: 14,
  minWidth: 100,
};
