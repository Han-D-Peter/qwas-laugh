import React, { useEffect, useMemo, useState } from 'react';
import { ARCADE } from '../theme/arcade.js';

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
  introSplash?: 'ready' | 'go' | null;
  onRestart: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  phase1: 'PHASE 1  MAZE',
  phase1_to_phase2: 'PHASE 1 CLEAR!',
  phase2_countdown: 'PHASE 2  READY!',
  phase2: 'PHASE 2  DESCENT',
  phase2_to_suspense: 'PHASE 2 CLEAR!',
  suspense: 'CHECKING...',
  result: 'RESULT',
  paused: 'PAUSED',
};

export function HUD({
  level, coins, phase, overlapPercent, lastResult,
  suspenseProgress = 0, suspensePhase = '',
  probabilityA = 0, probabilityB = 0,
  p2LeftPlayerId, p2RightPlayerId, p2Countdown = 0,
  myPlayerId, playerNames,
  introSplash = null,
  onRestart,
}: HUDProps) {
  void onRestart;
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (lastResult && phase === 'result') {
      setShowResult(true);
      const t = setTimeout(() => setShowResult(false), 3500);
      return () => clearTimeout(t);
    } else {
      setShowResult(false);
    }
  }, [lastResult, phase]);

  const finalProb = probabilityA > 0 && probabilityB > 0
    ? Math.round((probabilityA / 100) * (probabilityB / 100) * 100)
    : 0;

  // CSS confetti pieces (generated once)
  const confettiPieces = useMemo(
    () => Array.from({ length: 50 }, (_, i) => {
      const colors = ['#ff2e93', '#00e5ff', '#ffd23f', '#4dff7c', '#b46cff'];
      return {
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 1.8 + Math.random() * 1.5,
        color: colors[i % colors.length],
        rot: Math.random() * 360,
        size: 5 + Math.random() * 6,
      };
    }),
    [],
  );

  return (
    <>
      {/* CRT scanlines overlay — full screen, always on */}
      <div style={scanlineOverlayStyle} />
      {/* CRT vignette — darkens the screen corners */}
      <div style={vignetteOverlayStyle} />

      {/* READY / GO intro splash */}
      {introSplash && (
        <div style={introSplashWrapperStyle}>
          <div style={{
            fontFamily: ARCADE.PIXEL_FONT,
            fontSize: introSplash === 'ready' ? 64 : 96,
            color: introSplash === 'ready' ? ARCADE.CSS_NEON_CYAN : ARCADE.CSS_NEON_YELLOW,
            textShadow: introSplash === 'ready' ? ARCADE.GLOW_CYAN : ARCADE.GLOW_YELLOW,
            letterSpacing: 6,
            animation: 'stamp-in 0.35s ease-out, neon-flicker 1s infinite',
          }}>
            {introSplash === 'ready' ? 'READY?' : 'GO!!'}
          </div>
        </div>
      )}

      {/* Top HUD bar */}
      <div style={topBarStyle}>
        <div style={{ ...pillStyle, color: ARCADE.CSS_NEON_CYAN, textShadow: ARCADE.GLOW_CYAN }}>
          LV {String(level).padStart(2, '0')}
        </div>
        <div style={{
          ...pillStyle,
          flex: 1, textAlign: 'center',
          color: ARCADE.CSS_NEON_YELLOW, textShadow: ARCADE.GLOW_YELLOW,
        }}>
          {PHASE_LABELS[phase] || phase}
        </div>
        <div style={{ ...pillStyle, color: ARCADE.CSS_NEON_PINK, textShadow: ARCADE.GLOW_PINK }}>
          COIN {String(coins).padStart(2, '0')}
        </div>
      </div>

      {/* Keyboard controls panel — PC only */}
      {!('ontouchstart' in globalThis) && (typeof window === 'undefined' || window.innerWidth > 768) && (
        <div style={keyboardPanelStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 10, color: ARCADE.CSS_NEON_CYAN, letterSpacing: 1 }}>CONTROLS</div>
          {phase === 'phase2' ? (
            <>
              <div><Key k="&larr;" /> <Key k="&rarr;" /> MOVE</div>
              <div><Key k="SPACE" /> GRAB</div>
            </>
          ) : (
            <>
              <div><Key k="&uarr;" /> <Key k="&darr;" /> <Key k="&larr;" /> <Key k="&rarr;" /> MOVE</div>
              <div><Key k="SPACE" /> GRAB</div>
              <div><Key k="R" /> RESTART</div>
            </>
          )}
        </div>
      )}

      {/* Overlap indicator */}
      {overlapPercent > 0 && phase !== 'suspense' && phase !== 'result' && (
        <div style={{
          position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          padding: '7px 16px',
          borderRadius: 4,
          border: `2px solid ${overlapPercent >= 10 ? ARCADE.CSS_NEON_GREEN : ARCADE.CSS_NEON_PINK}`,
          background: 'rgba(10,14,44,0.85)',
          color: overlapPercent >= 10 ? ARCADE.CSS_NEON_GREEN : ARCADE.CSS_NEON_PINK,
          fontFamily: ARCADE.PIXEL_FONT,
          fontSize: 13,
          textShadow: overlapPercent >= 10 ? ARCADE.GLOW_GREEN : ARCADE.GLOW_PINK,
          boxShadow: overlapPercent >= 10 ? `0 0 12px ${ARCADE.CSS_NEON_GREEN}` : `0 0 12px ${ARCADE.CSS_NEON_PINK}`,
        }}>
          OVERLAP {overlapPercent.toFixed(1)}%
        </div>
      )}

      {/* Post-grab transition (Phase 2 was removed — same overlay used for
          both the local phase1_to_phase2 and the remote phase2_to_suspense
          identifiers, since both now mean "successful Phase 1 grab,
          heading into the suspense"). */}
      {(phase === 'phase1_to_phase2' || phase === 'phase2_to_suspense') && (
        <div style={centerOverlayStyle}>
          <div style={{
            fontFamily: ARCADE.PIXEL_FONT, fontSize: 22,
            color: ARCADE.CSS_NEON_YELLOW, textShadow: ARCADE.GLOW_YELLOW,
            marginBottom: 10, animation: 'stamp-in 0.6s ease-out',
          }}>
            GRAB!!
          </div>
          <div style={{ fontSize: 11, color: '#b0b0d0', marginBottom: 14, letterSpacing: 1, fontFamily: ARCADE.PIXEL_FONT }}>
            OVERLAP
          </div>
          <div style={{
            ...probBoxStyle,
            borderColor: ARCADE.CSS_NEON_CYAN,
            animation: 'stamp-in 0.6s ease-out',
          }}>
            <span style={{ color: ARCADE.CSS_NEON_CYAN, fontSize: 10, fontFamily: ARCADE.PIXEL_FONT, letterSpacing: 1 }}>CHANCE</span>
            <span style={{
              fontFamily: ARCADE.PIXEL_FONT, fontSize: 44,
              color: ARCADE.CSS_NEON_CYAN, textShadow: ARCADE.GLOW_CYAN,
              marginTop: 6,
            }}>
              {probabilityA}%
            </span>
          </div>
          <div style={{
            fontFamily: ARCADE.PIXEL_FONT, fontSize: 10,
            color: ARCADE.CSS_NEON_PINK, textShadow: ARCADE.GLOW_PINK,
            marginTop: 14, letterSpacing: 1,
            animation: 'neon-flicker 1.5s infinite',
          }}>
            CALCULATING RESULT...
          </div>
        </div>
      )}

      {/* Phase 2 countdown */}
      {phase === 'phase2_countdown' && (() => {
        const getName = (id: string | null | undefined) =>
          (id && playerNames?.get(id)) || id?.slice(0, 6) || '?';
        const isLeft = myPlayerId && p2LeftPlayerId === myPlayerId;
        const isRight = myPlayerId && p2RightPlayerId === myPlayerId;
        const isLocal = !myPlayerId;

        return (
          <div style={centerOverlayStyle}>
            <div style={{
              fontFamily: ARCADE.PIXEL_FONT, fontSize: 22,
              color: ARCADE.CSS_NEON_YELLOW, textShadow: ARCADE.GLOW_YELLOW,
              marginBottom: 16, animation: 'stamp-in 0.6s ease-out',
            }}>
              PHASE 2 START!
            </div>

            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 18 }}>
              <div style={{
                ...roleCardStyle,
                borderColor: isLeft ? ARCADE.CSS_NEON_GREEN : 'rgba(155,142,196,0.4)',
                boxShadow: isLeft ? `0 0 18px ${ARCADE.CSS_NEON_GREEN}` : undefined,
                animation: 'slide-in-left 0.5s ease-out',
              }}>
                <span style={smallLabelStyle}>LEFT</span>
                <span style={{ fontSize: 24, marginTop: 4 }}>&#x2B05;&#xFE0F;</span>
                <span style={{
                  fontFamily: ARCADE.PIXEL_FONT, fontSize: 9, marginTop: 4,
                  color: isLeft ? ARCADE.CSS_NEON_GREEN : '#d0d0e5',
                  textShadow: isLeft ? ARCADE.GLOW_GREEN : undefined,
                }}>
                  {isLocal ? 'PLAYER' : getName(p2LeftPlayerId).toUpperCase()}
                </span>
                {isLeft && <span style={{ fontSize: 9, color: ARCADE.CSS_NEON_GREEN, fontFamily: ARCADE.PIXEL_FONT, marginTop: 2 }}>YOU!</span>}
              </div>
              <div style={{
                ...roleCardStyle,
                borderColor: isRight ? ARCADE.CSS_NEON_AMBER : 'rgba(155,142,196,0.4)',
                boxShadow: isRight ? `0 0 18px ${ARCADE.CSS_NEON_AMBER}` : undefined,
                animation: 'slide-in-right 0.5s ease-out',
              }}>
                <span style={smallLabelStyle}>RIGHT</span>
                <span style={{ fontSize: 24, marginTop: 4 }}>&#x27A1;&#xFE0F;</span>
                <span style={{
                  fontFamily: ARCADE.PIXEL_FONT, fontSize: 9, marginTop: 4,
                  color: isRight ? ARCADE.CSS_NEON_AMBER : '#d0d0e5',
                  textShadow: isRight ? ARCADE.GLOW_YELLOW : undefined,
                }}>
                  {isLocal ? 'PLAYER' : getName(p2RightPlayerId).toUpperCase()}
                </span>
                {isRight && <span style={{ fontSize: 9, color: ARCADE.CSS_NEON_AMBER, fontFamily: ARCADE.PIXEL_FONT, marginTop: 2 }}>YOU!</span>}
              </div>
            </div>

            {p2Countdown > 0 ? (
              (() => {
                // Per-digit color cycle: 3 pink → 2 cyan → 1 yellow
                const digitColor =
                  p2Countdown === 3 ? ARCADE.CSS_NEON_PINK :
                  p2Countdown === 2 ? ARCADE.CSS_NEON_CYAN :
                  ARCADE.CSS_NEON_YELLOW;
                const digitGlow =
                  p2Countdown === 3 ? ARCADE.GLOW_PINK :
                  p2Countdown === 2 ? ARCADE.GLOW_CYAN :
                  ARCADE.GLOW_YELLOW;
                return (
                  <div
                    key={p2Countdown}
                    style={{
                      fontFamily: ARCADE.PIXEL_FONT,
                      fontSize: 96,
                      color: digitColor,
                      textShadow: digitGlow,
                      animation: 'bounce-in 0.5s ease-out',
                      lineHeight: 1,
                    }}
                  >
                    {p2Countdown}
                  </div>
                );
              })()
            ) : (
              <div
                style={{
                  fontFamily: ARCADE.PIXEL_FONT,
                  fontSize: 120,
                  lineHeight: 1,
                  background: 'linear-gradient(90deg, #ff2e93, #ffd23f, #4dff7c, #00e5ff, #b46cff, #ff2e93)',
                  backgroundSize: '200% 100%',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                  filter: 'drop-shadow(0 0 8px #ffd23f) drop-shadow(0 0 20px #ff2e93)',
                  animation: 'stamp-in 0.4s ease-out, neon-flicker 0.8s infinite, rainbow-slide 1.5s linear infinite',
                }}
              >
                GO!!
              </div>
            )}
          </div>
        );
      })()}

      {/* Suspense sequence (Phase 2 was removed — only probA matters) */}
      {phase === 'suspense' && (
        <div style={{ ...centerOverlayStyle, minWidth: 320, maxWidth: '90vw' }}>
          {suspensePhase === 'showA' && (
            <>
              <div style={{ fontSize: 11, color: ARCADE.CSS_NEON_CYAN, marginBottom: 10, fontFamily: ARCADE.PIXEL_FONT, letterSpacing: 1, textShadow: ARCADE.GLOW_CYAN }}>YOUR CHANCE</div>
              <div style={{ ...probBoxStyle, borderColor: ARCADE.CSS_NEON_CYAN }}>
                <span style={{ color: ARCADE.CSS_NEON_CYAN, fontSize: 10, fontFamily: ARCADE.PIXEL_FONT }}>OVERLAP</span>
                <span style={{
                  fontFamily: ARCADE.PIXEL_FONT, fontSize: 56,
                  color: '#fff', textShadow: ARCADE.GLOW_CYAN,
                  marginTop: 6, animation: 'stamp-in 0.5s ease-out',
                }}>
                  {probabilityA}%
                </span>
              </div>
            </>
          )}

          {/* showB phase no longer emitted by runSuspenseAnimation. */}

          {suspensePhase === 'calculating' && (
            <>
              <div style={{ fontSize: 11, color: ARCADE.CSS_NEON_YELLOW, marginBottom: 12, fontFamily: ARCADE.PIXEL_FONT, letterSpacing: 1, textShadow: ARCADE.GLOW_YELLOW }}>CALCULATING...</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <div style={{ ...probBoxStyle, borderColor: ARCADE.CSS_NEON_YELLOW }}>
                  <span style={{ ...smallLabelStyle, color: ARCADE.CSS_NEON_YELLOW }}>FINAL</span>
                  <span style={{
                    fontFamily: ARCADE.PIXEL_FONT, fontSize: 48,
                    color: ARCADE.CSS_NEON_YELLOW, textShadow: ARCADE.GLOW_YELLOW,
                    marginTop: 6, animation: 'stamp-in 0.5s ease-out',
                  }}>
                    {probabilityA}%
                  </span>
                </div>
              </div>
              <div style={{
                width: '100%', height: 10, borderRadius: 2,
                background: 'rgba(0,229,255,0.12)', overflow: 'hidden',
                border: `1px solid ${ARCADE.CSS_NEON_CYAN}`,
              }}>
                <div style={{
                  width: `${suspenseProgress * 100}%`, height: '100%',
                  background: `linear-gradient(90deg, ${ARCADE.CSS_NEON_PINK}, ${ARCADE.CSS_NEON_YELLOW}, ${ARCADE.CSS_NEON_CYAN})`,
                  transition: 'width 0.1s',
                  boxShadow: `0 0 10px ${ARCADE.CSS_NEON_CYAN}`,
                }} />
              </div>
            </>
          )}

          {suspensePhase === 'drumroll' && (
            <>
              <div style={{
                fontFamily: ARCADE.PIXEL_FONT, fontSize: 16,
                color: ARCADE.CSS_NEON_PINK, textShadow: ARCADE.GLOW_PINK,
                marginBottom: 16,
                animation: 'shake 0.15s ease-in-out infinite, glitch 0.3s ease-in-out infinite',
              }}>
                WILL YOU WIN?!
              </div>
              <div style={{
                fontFamily: ARCADE.PIXEL_FONT, fontSize: 64,
                color: ARCADE.CSS_NEON_YELLOW, textShadow: ARCADE.GLOW_YELLOW,
                animation: 'shake 0.1s ease-in-out infinite, pulse 0.6s ease-in-out infinite',
              }}>
                {probabilityA}%
              </div>
              <div style={{
                marginTop: 14, fontSize: 32,
                animation: 'shake 0.12s ease-in-out infinite',
              }}>
                🎰
              </div>
            </>
          )}

          {suspensePhase === 'reveal' && (
            <div style={{
              fontFamily: ARCADE.PIXEL_FONT, fontSize: 18,
              color: '#fff', textShadow: ARCADE.GLOW_WHITE,
              animation: 'stamp-in 0.3s ease-out',
            }}>
              REVEAL...
            </div>
          )}
        </div>
      )}

      {/* Result popup */}
      {showResult && lastResult && (
        <div style={resultWrapperStyle}>
          {lastResult === 'success' && (
            <div style={confettiContainerStyle}>
              {confettiPieces.map(p => (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    left: `${p.left}%`,
                    top: `-${p.size * 2}px`,
                    width: p.size,
                    height: p.size,
                    background: p.color,
                    boxShadow: `0 0 6px ${p.color}`,
                    transform: `rotate(${p.rot}deg)`,
                    animation: `confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
          {/*
            Outer wrapper owns the centering transform. The inner box owns the
            entry/idle animations (bounce-in / drop-in / glitch). Splitting
            these two responsibilities is required because `glitch`'s keyframes
            use `transform: translate(...)` relative to the inner's origin —
            if we put them on the centered element, the animation overwrites
            `translate(-50%, -50%)` and the popup visually jumps to the
            bottom-right. See user report 2026-04-10.
          */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 60,
            pointerEvents: 'none',
          }}>
            <div style={{
              padding: '32px 52px',
              borderRadius: 6,
              background: 'rgba(10,14,44,0.92)',
              border: `3px solid ${lastResult === 'success' ? ARCADE.CSS_NEON_YELLOW : ARCADE.CSS_NEON_PINK}`,
              boxShadow: lastResult === 'success'
                ? `0 0 30px ${ARCADE.CSS_NEON_YELLOW}, 0 0 60px ${ARCADE.CSS_NEON_YELLOW}, inset 0 0 20px rgba(255,210,63,0.2)`
                : `0 0 30px ${ARCADE.CSS_NEON_PINK}, 0 0 60px ${ARCADE.CSS_NEON_PINK}, inset 0 0 20px rgba(255,46,147,0.2)`,
              color: '#fff',
              textAlign: 'center',
              animation: lastResult === 'success'
                ? 'popup-bounce-in 0.6s ease-out, neon-flicker 3s infinite 0.6s'
                : 'popup-drop-in 0.5s ease-out, popup-glitch 0.15s ease-in-out infinite 0.5s',
              minWidth: 280,
            }}>
              <div style={{
                fontFamily: ARCADE.PIXEL_FONT,
                fontSize: 42,
                color: lastResult === 'success' ? ARCADE.CSS_NEON_YELLOW : ARCADE.CSS_NEON_PINK,
                textShadow: lastResult === 'success' ? ARCADE.GLOW_YELLOW : ARCADE.GLOW_PINK,
                letterSpacing: 3,
                lineHeight: 1,
              }}>
                {lastResult === 'success' ? 'JACKPOT!!' : 'MISS!!'}
              </div>
              <div style={{
                fontSize: 10,
                fontFamily: ARCADE.PIXEL_FONT,
                marginTop: 14,
                color: '#b0b0d0',
                letterSpacing: 1,
                lineHeight: 1.8,
              }}>
                {lastResult === 'success'
                  ? `YOU WON AT ${probabilityA}% CHANCE!`
                  : `${probabilityA}% CHANCE... SO CLOSE!`}
              </div>
            </div>
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
        @keyframes neon-flicker {
          0%, 100% { opacity: 1; }
          92% { opacity: 1; }
          93% { opacity: 0.3; }
          95% { opacity: 1; }
          97% { opacity: 0.6; }
          98% { opacity: 1; }
        }
        @keyframes stamp-in {
          0% { transform: scale(3) rotate(-15deg); opacity: 0; }
          60% { transform: scale(0.9) rotate(2deg); opacity: 1; }
          80% { transform: scale(1.05) rotate(-1deg); }
          100% { transform: scale(1) rotate(0); }
        }
        @keyframes slide-in-left {
          from { transform: translateX(-120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slide-in-right {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes bounce-in {
          0%   { transform: scale(0) translateY(-100px); opacity: 0; }
          50%  { transform: scale(1.3) translateY(20px); opacity: 1; }
          70%  { transform: scale(0.9) translateY(-10px); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, -2px); }
          80% { transform: translate(2px, 1px); }
        }
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0); opacity: 1; }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
        }
        @keyframes drop-in {
          0%   { transform: translate(-50%, -200%) rotate(-20deg); opacity: 0; }
          60%  { transform: translate(-50%, calc(-50% + 20px)) rotate(5deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(0); }
        }
        @keyframes rainbow-slide {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        /* Result-popup specific keyframes. These assume the element sits at
           its natural inside-wrapper origin (0,0) — the outer wrapper
           handles the top:50%/left:50%/translate(-50%,-50%) centering. */
        @keyframes popup-bounce-in {
          0%   { transform: scale(0) translateY(-100px); opacity: 0; }
          50%  { transform: scale(1.3) translateY(20px); opacity: 1; }
          70%  { transform: scale(0.9) translateY(-10px); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes popup-drop-in {
          0%   { transform: translateY(-300px) rotate(-20deg); opacity: 0; }
          60%  { transform: translateY(20px) rotate(5deg); opacity: 1; }
          100% { transform: translateY(0) rotate(0); }
        }
        @keyframes popup-glitch {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, -2px); }
          80% { transform: translate(2px, 1px); }
        }
      `}</style>
    </>
  );
}

// ─── Styles ───
const scanlineOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage: 'repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.22) 2px, rgba(0,0,0,0.22) 3px)',
  mixBlendMode: 'multiply',
  zIndex: 50,
};

const vignetteOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
  zIndex: 49,
};

const introSplashWrapperStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  zIndex: 58,
  textAlign: 'center',
};

const topBarStyle: React.CSSProperties = {
  position: 'absolute', top: 10, left: 10, right: 10,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  pointerEvents: 'none', gap: 8, zIndex: 51,
};

const pillStyle: React.CSSProperties = {
  background: 'rgba(10,14,44,0.85)',
  border: '2px solid currentColor',
  borderRadius: 4,
  padding: '6px 14px',
  fontSize: 11,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 2,
  whiteSpace: 'nowrap',
  boxShadow: '0 0 10px currentColor',
  backdropFilter: 'blur(4px)',
};

const keyboardPanelStyle: React.CSSProperties = {
  position: 'absolute', bottom: 18, right: 18,
  background: 'rgba(10,14,44,0.88)',
  border: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
  borderRadius: 4,
  padding: '10px 14px',
  boxShadow: `0 0 12px ${ARCADE.CSS_NEON_CYAN}`,
  backdropFilter: 'blur(8px)',
  fontSize: 10,
  fontFamily: ARCADE.PIXEL_FONT,
  color: '#e0e0f0',
  lineHeight: 2,
  letterSpacing: 1,
  zIndex: 51,
};

const centerOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '28px 36px',
  borderRadius: 6,
  background: 'rgba(10,14,44,0.92)',
  border: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
  boxShadow: `0 0 24px ${ARCADE.CSS_NEON_CYAN}, 0 0 60px rgba(0,229,255,0.4), inset 0 0 15px rgba(0,229,255,0.1)`,
  backdropFilter: 'blur(6px)',
  zIndex: 55,
  textAlign: 'center',
};

const probBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '14px 24px',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.35)',
  border: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
  marginTop: 8,
  minWidth: 120,
};

const probBoxSmallStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 14px',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.35)',
  border: `1px solid ${ARCADE.CSS_NEON_CYAN}`,
  minWidth: 60,
};

const smallLabelStyle: React.CSSProperties = {
  fontSize: 9,
  color: ARCADE.CSS_NEON_CYAN,
  fontFamily: ARCADE.PIXEL_FONT,
  letterSpacing: 1,
};

const smallValueStyle: React.CSSProperties = {
  fontSize: 18,
  color: '#fff',
  fontFamily: ARCADE.PIXEL_FONT,
  marginTop: 4,
  textShadow: ARCADE.GLOW_CYAN,
};

const roleCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: 4,
  minWidth: 100,
  background: 'rgba(0,0,0,0.4)',
  border: '2px solid',
};

const resultWrapperStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 60,
};

const confettiContainerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
};

function Key({ k }: { k: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: 'rgba(0,229,255,0.1)',
        border: `1px solid ${ARCADE.CSS_NEON_CYAN}`,
        borderRadius: 3,
        padding: '1px 6px',
        fontSize: 9,
        fontFamily: ARCADE.PIXEL_FONT,
        color: ARCADE.CSS_NEON_CYAN,
        marginRight: 3,
        minWidth: 16,
        textAlign: 'center',
        boxShadow: `0 0 6px ${ARCADE.CSS_NEON_CYAN}`,
      }}
      dangerouslySetInnerHTML={{ __html: k }}
    />
  );
}
