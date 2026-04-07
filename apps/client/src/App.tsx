import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/engine.js';
import { HUD } from './ui/HUD.js';

export function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const mountedRef = useRef(false);
  const [gameInfo, setGameInfo] = useState({
    level: 1,
    coins: 0,
    phase: 'phase1' as string,
    overlapPercent: 0,
    lastResult: null as string | null,
  });

  useEffect(() => {
    if (!canvasContainerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const engine = new GameEngine(canvasContainerRef.current, (info) => {
      setGameInfo(info);
    });
    engineRef.current = engine;

    return () => {
      mountedRef.current = false;
      engine.destroy();
    };
  }, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.restart();
  }, []);

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
        onRestart={handleRestart}
      />
    </div>
  );
}
