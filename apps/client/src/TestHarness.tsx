import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, type GameInfo } from './game/engine.js';
import { ARCADE } from './theme/arcade.js';

/**
 * /test — comprehensive Phase 1 → Phase 2 transition test harness.
 *
 * This page mounts a local-mode GameEngine in a hidden canvas, then exposes
 * a battery of tests that drive every transition path deterministically.
 * Tests are split into two groups:
 *
 *   GROUP A — Local-mode tests
 *     The engine runs `attemptPhase1Grab` etc. directly. No server, no
 *     network, no setTimeout race conditions. Verifies the underlying
 *     state machine is sound.
 *
 *   GROUP B — Remote-mode tests
 *     Engine is in `setRemoteMode()`. We synthesize `GameState` payloads
 *     and call `applyServerState` directly, mimicking what the multiplayer
 *     socket would deliver. Specifically targets the race conditions that
 *     have caused user-reported "phase1→phase2 freeze/glitch" bugs:
 *       - racing phase1 broadcasts during phase1_to_phase2 window
 *       - racing phase1 broadcasts after the race guard lifts (at
 *         phase2_countdown), which used to tear down the transition via
 *         the old `isNewLevel = this.phase !== 'phase1' || ...` formula
 *       - phase2 → result with racing next-level phase1 broadcasts
 *
 * Each test logs its before/after engine state and emits PASS/FAIL with
 * an expected-vs-actual diff. All tests run from a single button click so
 * the user can re-run quickly after any change.
 */

type TestResult = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'pass' | 'fail';
  message?: string;
  diagnostic?: string;
};

type TransitionLog = {
  t: number;
  from: string;
  to: string;
  trigger: string;
};

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function TestHarness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const transitionLogRef = useRef<TransitionLog[]>([]);
  const lastPhaseRef = useRef<string>('');
  const [info, setInfo] = useState<GameInfo | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  // Mount the engine once. We start in LOCAL mode for the first batch of
  // tests, then setRemoteMode() before the multiplayer-shaped tests.
  useEffect(() => {
    if (!containerRef.current || engineRef.current) return;
    const eng = new GameEngine(containerRef.current, (gi) => {
      setInfo(gi);
      // Capture every phase transition so tests can assert sequences
      if (gi.phase !== lastPhaseRef.current) {
        transitionLogRef.current.push({
          t: Date.now(),
          from: lastPhaseRef.current,
          to: gi.phase,
          trigger: 'updateInfo',
        });
        lastPhaseRef.current = gi.phase;
      }
    });
    engineRef.current = eng;
    return () => { eng.destroy(); engineRef.current = null; };
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────

  const logLine = (s: string) => setLog(prev => [...prev.slice(-200), `[${new Date().toLocaleTimeString()}] ${s}`]);

  const updateResult = (id: string, patch: Partial<TestResult>) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  /** Wait until the engine's `phase` matches expected, or timeout. */
  const waitForPhase = async (expected: string, timeoutMs: number, label: string): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const e = engineRef.current as any;
      if (e?.phase === expected) return true;
      await wait(50);
    }
    logLine(`  ⏱  TIMEOUT waiting for phase='${expected}' (${label}), saw='${(engineRef.current as any)?.phase}'`);
    return false;
  };

  /** Wait until any of the listed phases is reached. */
  const waitForAnyPhase = async (expected: string[], timeoutMs: number): Promise<string | null> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const e = engineRef.current as any;
      if (e && expected.includes(e.phase)) return e.phase;
      await wait(50);
    }
    return null;
  };

  /** Force claw onto doll and call attemptPhase1Grab directly (LOCAL mode only). */
  const localForceP1GrabSuccess = () => {
    const e = engineRef.current as any;
    if (!e) return false;
    e.clawPos.x = e.dollPos.x;
    e.clawPos.y = e.dollPos.y;
    e.attemptPhase1Grab();
    return true;
  };

  /** Reset engine to a clean local-mode phase1 starting state.
   *  Critically, calls `cancelPendingTransitions()` so any in-flight
   *  setTimeouts/setIntervals from the previous test bail out instead
   *  of mutating phase mid-test. */
  const resetLocal = () => {
    const e = engineRef.current as any;
    if (!e) return;
    e.cancelPendingTransitions();
    e.remoteMode = false;
    e.phase1GrabCommitted = false;
    e.grabLocked = false;
    e.lastResult = null;
    e.probabilityA = 0;
    e.probabilityB = 0;
    e.lastOverlap = 0;
    e.suspenseProgress = 0;
    e.suspensePhase = '';
    e.phase = 'phase1';
    e.resultLockUntil = 0;
    transitionLogRef.current = [];
    lastPhaseRef.current = e.phase;
  };

  /** Build a synthetic GameState for applyServerState injection. */
  const makeState = (override: Record<string, any> = {}) => {
    const e = engineRef.current as any;
    return {
      phase: 'phase1',
      level: 1,
      coins: 0,
      lastResult: null,
      probabilityA: 0,
      probabilityB: 0,
      maze: e?.maze ?? {
        width: 9, height: 9, seed: 12345, cellSize: 60,
        cells: Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => ({
          row: r, col: c,
          walls: { north: r === 0, south: r === 8, east: c === 8, west: c === 0 },
        }))),
      },
      claw: { position: { x: 280, y: 280 }, direction: { x: 0, y: 0 }, speed: 2, box: { x: 262, y: 262, width: 36, height: 36 } },
      doll: { position: { x: 120, y: 280 }, box: { x: 102, y: 262, width: 36, height: 36 }, type: 0 },
      phase2: null,
      players: [],
      ...override,
    };
  };

  const makePhase2State = (level = 1, mazeSeed?: number) => {
    const e = engineRef.current as any;
    const maze = mazeSeed != null
      ? { width: 9, height: 9, seed: mazeSeed, cellSize: 60, cells: e?.maze?.cells ?? [] }
      : e?.maze;
    return makeState({
      phase: 'phase2',
      level,
      probabilityA: 0.5,
      maze,
      phase2: {
        pathPoints: [{ x: 200, y: 0 }, { x: 200, y: 500 }],
        wallLeft: [{ x: 100, y: 0 }, { x: 100, y: 500 }],
        wallRight: [{ x: 300, y: 0 }, { x: 300, y: 500 }],
        clawY: 0, clawX: 200, driftOffset: 0,
        dollBox: { x: 180, y: 320, width: 40, height: 40 },
        pathWidth: 200,
      },
    });
  };

  /** Build a remote-mode "result" state with a Phase-1-only success/fail. */
  const makeResultState = (success: boolean, overlap = 0.5, mazeSeed?: number) => {
    const e = engineRef.current as any;
    const maze = mazeSeed != null
      ? { ...e?.maze, seed: mazeSeed }
      : e?.maze;
    return makeState({
      phase: 'result',
      probabilityA: overlap,
      probabilityB: 1.0,
      lastResult: success ? 'success' : 'fail',
      maze,
    });
  };

  // ─── Tests ─────────────────────────────────────────────────────
  //
  // Phase 2 was removed from the game. The new flow is:
  //
  //     phase1
  //       └─ overlap >= 10% ──> phase1_to_phase2  (now means
  //                                "PHASE 1 CLEAR! → suspense")
  //                              └─ ~1.6s ──> suspense
  //                                            └─ ~6.1s ──> result
  //                                                          └─ next level
  //       └─ overlap <  10% ──> resetPhase1 (immediate)
  //
  // The phase identifiers `phase1_to_phase2` and `phase2_to_suspense`
  // are still in the union type but now both mean "post-grab transition".
  // The old phase2_countdown / phase2 / phase2_to_suspense visual states
  // are dead in the new flow.

  const TESTS: { id: string; name: string; run: () => Promise<{ pass: boolean; msg: string; diag?: string }> }[] = [

    // ─── GROUP A: LOCAL MODE ───────────────────────────────────
    {
      id: 'L1',
      name: 'Local: successful Phase 1 grab → phase1_to_phase2 → suspense → result',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        await wait(100);
        if (e.phase !== 'phase1') return { pass: false, msg: `Expected initial phase='phase1', got '${e.phase}'` };
        // Force grab on doll
        if (!localForceP1GrabSuccess()) return { pass: false, msg: 'localForceP1GrabSuccess returned false' };
        if (e.phase !== 'phase1_to_phase2') {
          return { pass: false, msg: `Expected phase='phase1_to_phase2' immediately after grab, got '${e.phase}'` };
        }
        if (!e.phase1GrabCommitted) return { pass: false, msg: 'phase1GrabCommitted should be true' };
        if (!(e.probabilityA > 0)) return { pass: false, msg: `probabilityA should be > 0, got ${e.probabilityA}` };
        if (e.probabilityB !== 1.0) return { pass: false, msg: `probabilityB should be 1.0 (Phase 2 removed), got ${e.probabilityB}` };
        // Wait for the scheduled startSuspense (~1.6s)
        const inSuspense = await waitForPhase('suspense', 3000, 'enter suspense');
        if (!inSuspense) return { pass: false, msg: `Timeout: never reached suspense. Current=${e.phase}` };
        // Wait for suspense to resolve to result (~6.1s = 1.5+1.6+2+1)
        const inResult = await waitForPhase('result', 9000, 'after suspense');
        if (!inResult) return { pass: false, msg: `Timeout: never reached result. Current=${e.phase}` };
        if (e.lastResult !== 'success' && e.lastResult !== 'fail') {
          return { pass: false, msg: `lastResult should be set after result, got '${e.lastResult}'` };
        }
        return { pass: true, msg: `phase1 → phase1_to_phase2 → suspense → result (lastResult=${e.lastResult})` };
      },
    },
    {
      id: 'L2',
      name: 'Local: failed Phase 1 grab (overlap < 10%) returns to phase1 cleanly',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        await wait(100);
        e.clawPos.x = e.dollPos.x + 200;
        e.clawPos.y = e.dollPos.y;
        const startCoins = e.coins;
        e.attemptPhase1Grab();
        if (e.phase !== 'phase1') return { pass: false, msg: `Expected phase='phase1' after fail, got '${e.phase}'` };
        if (e.coins !== startCoins + 1) return { pass: false, msg: `Coins should increment on fail (${startCoins}→${e.coins})` };
        if (e.phase1GrabCommitted) return { pass: false, msg: 'phase1GrabCommitted should be false after fail' };
        if (e.lastResult !== 'fail') return { pass: false, msg: `lastResult should be 'fail', got '${e.lastResult}'` };
        return { pass: true, msg: `Failed grab cleanly reset (coins ${startCoins}→${e.coins})` };
      },
    },
    {
      id: 'L3',
      name: 'Local: rapid double-grab guard blocks second press',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        await wait(100);
        e.clawPos.x = e.dollPos.x;
        e.clawPos.y = e.dollPos.y;
        e.keyHandler?.({ key: ' ', preventDefault: () => {} });
        const after1 = { phase: e.phase, committed: e.phase1GrabCommitted, probA: e.probabilityA };
        e.keyHandler?.({ key: ' ', preventDefault: () => {} });
        const after2 = { phase: e.phase, committed: e.phase1GrabCommitted, probA: e.probabilityA };
        if (after1.phase !== 'phase1_to_phase2') return { pass: false, msg: `First grab should set phase='phase1_to_phase2', got '${after1.phase}'` };
        if (!after1.committed) return { pass: false, msg: 'First grab should set phase1GrabCommitted=true' };
        if (after2.phase !== after1.phase || after2.probA !== after1.probA) {
          return { pass: false, msg: `Second press should be no-op. After1=${JSON.stringify(after1)} After2=${JSON.stringify(after2)}` };
        }
        return { pass: true, msg: 'Second rapid grab press correctly ignored' };
      },
    },
    {
      id: 'L4',
      name: 'Local: 3 consecutive Phase 1 grabs progress through suspense each time',
      async run() {
        let succeeded = 0;
        for (let i = 0; i < 3; i++) {
          resetLocal();
          const e = engineRef.current as any;
          await wait(100);
          localForceP1GrabSuccess();
          if (e.phase !== 'phase1_to_phase2') {
            return { pass: false, msg: `Cycle ${i + 1}: expected phase='phase1_to_phase2' after grab, got '${e.phase}'` };
          }
          // Wait for suspense to start (~1.6s)
          const ok = await waitForPhase('suspense', 3000, `cycle ${i + 1}`);
          if (!ok) return { pass: false, msg: `Cycle ${i + 1}: never reached suspense` };
          succeeded++;
        }
        return { pass: succeeded === 3, msg: `${succeeded}/3 cycles reached suspense without state leakage` };
      },
    },
    {
      id: 'L5',
      name: 'Local: probabilityB is set to 1.0 after a successful grab (Phase 2 removed)',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        await wait(100);
        if (e.probabilityB !== 0) return { pass: false, msg: `probB should start at 0, got ${e.probabilityB}` };
        localForceP1GrabSuccess();
        if (e.probabilityB !== 1.0) return { pass: false, msg: `probB should be 1.0 after grab (Phase 2 removed), got ${e.probabilityB}` };
        // The suspense math (probA × probB) should equal probA
        const finalProb = e.probabilityA * e.probabilityB;
        if (Math.abs(finalProb - e.probabilityA) > 0.0001) {
          return { pass: false, msg: `finalProb (${finalProb}) should equal probA (${e.probabilityA})` };
        }
        return { pass: true, msg: `probB=1.0, finalProb=probA=${e.probabilityA}` };
      },
    },

    // ─── GROUP B: REMOTE MODE (synthetic state injection) ──────
    {
      id: 'R1',
      name: 'Remote: server result broadcast triggers suspense from phase1',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        await wait(50);
        // Server emits overlap event first (sets probA + probB=1.0)
        e.setServerOverlap('phase1', 50);
        if (!(e.probabilityA > 0)) return { pass: false, msg: `probabilityA not set: ${e.probabilityA}` };
        if (e.probabilityB !== 1.0) return { pass: false, msg: `probabilityB should be 1.0 after phase1 overlap, got ${e.probabilityB}` };
        // Server then broadcasts state.phase='result' with lastResult set
        await e.applyServerState(makeResultState(true, 0.5));
        if (e.phase !== 'phase2_to_suspense') {
          return { pass: false, msg: `Expected phase='phase2_to_suspense' (transitional) after result inject, got '${e.phase}'` };
        }
        // Wait for suspense (1.6s setTimeout)
        const inSuspense = await waitForPhase('suspense', 3000, 'enter suspense');
        if (!inSuspense) return { pass: false, msg: `Timeout: never reached suspense. Current=${e.phase}` };
        // Wait for result
        const inResult = await waitForPhase('result', 9000, 'after suspense');
        if (!inResult) return { pass: false, msg: `Timeout: never reached result. Current=${e.phase}` };
        return { pass: true, msg: `Remote phase1 → suspense → result completed (lastResult=${e.lastResult})` };
      },
    },
    {
      id: 'R2',
      name: 'Remote: race guard blocks phase1 broadcasts during phase2_to_suspense',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        await wait(20);
        e.setServerOverlap('phase1', 50);
        await e.applyServerState(makeResultState(true, 0.5));
        if (e.phase !== 'phase2_to_suspense') return { pass: false, msg: `Setup failed: phase=${e.phase}` };
        for (let i = 0; i < 5; i++) {
          await e.applyServerState(makeState());
          await wait(20);
        }
        if (e.phase !== 'phase2_to_suspense') {
          return { pass: false, msg: `Race guard failed: phase=${e.phase} during phase2_to_suspense` };
        }
        return { pass: true, msg: `Race guard held: phase stayed 'phase2_to_suspense' across 5 racing phase1 broadcasts` };
      },
    },
    {
      id: 'R3',
      name: 'Remote: race guard blocks phase1 broadcasts during suspense',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        await wait(20);
        e.setServerOverlap('phase1', 50);
        await e.applyServerState(makeResultState(true, 0.5));
        // Wait for suspense
        const inSuspense = await waitForPhase('suspense', 3000, 'enter suspense');
        if (!inSuspense) return { pass: false, msg: `Timeout: never reached suspense` };
        // Inject racing phase1 broadcasts during the suspense window
        for (let i = 0; i < 10; i++) {
          await e.applyServerState(makeState());
          await wait(50);
        }
        if (e.phase !== 'suspense' && e.phase !== 'result') {
          return { pass: false, msg: `Race guard failed: phase=${e.phase} during/after suspense` };
        }
        return { pass: true, msg: `Phase stayed in suspense/result across 10 racing phase1 broadcasts` };
      },
    },
    {
      id: 'R4',
      name: 'Remote: NEW level phase1 broadcast (different seed) DOES rebuild',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        const initialSeed = e.maze?.seed;
        const newSeed = (initialSeed ?? 0) + 999999;
        await e.applyServerState(makeState({ maze: { ...e.maze, seed: newSeed } }));
        if (e.maze?.seed !== newSeed) return { pass: false, msg: `New seed not applied (${initialSeed}→${e.maze?.seed})` };
        if (e.phase !== 'phase1') return { pass: false, msg: `Expected phase='phase1', got '${e.phase}'` };
        return { pass: true, msg: `Real new-level broadcast triggered scene rebuild (seed ${initialSeed}→${e.maze?.seed})` };
      },
    },
    {
      id: 'R5',
      name: 'Remote: result lock holds for 3.5s then releases',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        e.phase = 'result';
        e.lastResult = 'success';
        e.resultLockUntil = Date.now() + 3500;
        e.probabilityA = 0.6;
        e.probabilityB = 1.0;
        await e.applyServerState(makeState());
        if (e.phase !== 'result') return { pass: false, msg: `Result lock failed: phase=${e.phase}` };
        e.resultLockUntil = Date.now() - 100;
        await e.applyServerState(makeState({ maze: { ...e.maze, seed: 8888888 } }));
        if (e.phase !== 'phase1') return { pass: false, msg: `After lock expiration, expected phase='phase1', got '${e.phase}'` };
        return { pass: true, msg: 'Result lock correctly held then released' };
      },
    },
    {
      id: 'R6',
      name: 'Remote: legacy state.phase=phase2 broadcast is silently ignored',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        const beforePhase = e.phase;
        // Inject a legacy phase2 state — should be a no-op (Phase 2 removed)
        await e.applyServerState(makePhase2State());
        if (e.phase !== beforePhase) {
          return { pass: false, msg: `Legacy phase2 broadcast changed phase: '${beforePhase}' → '${e.phase}'` };
        }
        return { pass: true, msg: `Legacy phase2 broadcast silently ignored (phase stayed '${beforePhase}')` };
      },
    },
    {
      id: 'R7',
      name: 'Remote: stress test — 20 cycles of phase1 grab → result',
      async run() {
        let cycles = 0;
        for (let i = 0; i < 20; i++) {
          resetLocal();
          const e = engineRef.current as any;
          e.setRemoteMode();
          await e.applyServerState(makeState({ maze: { ...(e.maze ?? makeState().maze), seed: 100000 + i } }));
          await wait(15);
          e.setServerOverlap('phase1', 50);
          const phaseBeforeResult = e.phase;
          const probABefore = e.probabilityA;
          await e.applyServerState(makeResultState(true, 0.5, 100000 + i));
          if (e.phase !== 'phase2_to_suspense') {
            return { pass: false, msg: `Cycle ${i + 1}: phase=${e.phase} after result inject (was ${phaseBeforeResult}, probA=${probABefore})` };
          }
          // Race the transition with phase1 broadcasts. Track every change.
          const trace: string[] = [`start=${e.phase}`];
          for (let j = 0; j < 3; j++) {
            const before = e.phase;
            await e.applyServerState(makeState({ maze: { ...e.maze, seed: 100000 + i } }));
            const after = e.phase;
            trace.push(`j${j}:${before}->${after}`);
            await wait(10);
            if (e.phase !== before) trace.push(`j${j}post:${before}->${e.phase}`);
          }
          if (e.phase !== 'phase2_to_suspense') {
            return { pass: false, msg: `Cycle ${i + 1}: race guard broke (phase=${e.phase}) trace=[${trace.join(', ')}]` };
          }
          cycles++;
        }
        return { pass: cycles === 20, msg: `${cycles}/20 cycles passed without stuck states` };
      },
    },
  ];

  // ─── Runner ────────────────────────────────────────────────────

  const runAll = async () => {
    setRunning(true);
    setResults(TESTS.map(t => ({ id: t.id, name: t.name, status: 'pending' as const })));
    setLog([]);
    for (const test of TESTS) {
      logLine(`▶ ${test.id}  ${test.name}`);
      updateResult(test.id, { status: 'running' });
      try {
        const r = await test.run();
        updateResult(test.id, {
          status: r.pass ? 'pass' : 'fail',
          message: r.msg,
          diagnostic: r.diag,
        });
        logLine(`${r.pass ? '✓' : '✗'} ${test.id}  ${r.msg}`);
      } catch (err: any) {
        updateResult(test.id, {
          status: 'fail',
          message: 'EXCEPTION: ' + (err?.message ?? String(err)),
        });
        logLine(`✗ ${test.id}  EXCEPTION: ${err?.message ?? String(err)}`);
        logLine(`   stack: ${err?.stack?.split('\n').slice(0, 3).join(' | ')}`);
      }
      // Brief pause between tests so the engine settles
      await wait(150);
    }
    setRunning(false);
    logLine('━━━ all tests complete ━━━');
  };

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const totalCount = TESTS.length;

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: ARCADE.CSS_DEEP_NAVY,
      color: '#e0e0f0',
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <span style={{
          fontFamily: ARCADE.PIXEL_FONT, fontSize: 14,
          color: ARCADE.CSS_NEON_PINK, textShadow: ARCADE.GLOW_PINK,
          letterSpacing: 2,
        }}>
          PHASE TRANSITION TEST HARNESS
        </span>
        <button
          onClick={runAll}
          disabled={running}
          style={{
            padding: '8px 18px',
            background: running ? '#444' : 'rgba(0,229,255,0.15)',
            color: ARCADE.CSS_NEON_CYAN,
            border: `2px solid ${ARCADE.CSS_NEON_CYAN}`,
            borderRadius: 4,
            fontFamily: ARCADE.PIXEL_FONT, fontSize: 11,
            letterSpacing: 1.5,
            cursor: running ? 'wait' : 'pointer',
            boxShadow: running ? 'none' : `0 0 12px ${ARCADE.CSS_NEON_CYAN}`,
          }}
        >
          {running ? 'RUNNING...' : 'RUN ALL TESTS'}
        </button>
        <span style={{ fontSize: 12, marginLeft: 'auto' }}>
          {results.length > 0 && (
            <>
              <span style={{ color: ARCADE.CSS_NEON_GREEN, marginRight: 12 }}>PASS {passCount}</span>
              <span style={{ color: ARCADE.CSS_NEON_PINK, marginRight: 12 }}>FAIL {failCount}</span>
              <span style={{ color: '#999' }}>TOTAL {totalCount}</span>
            </>
          )}
        </span>
      </div>

      {/* Body: results on the left, log on the right */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Test results column */}
        <div style={{
          flex: 1, padding: '12px 20px', overflow: 'auto',
          borderRight: '1px solid #2a2a4a',
        }}>
          {results.length === 0 && (
            <div style={{ color: '#888', fontSize: 13, padding: 20 }}>
              Click "RUN ALL TESTS" to verify Phase 1 → Phase 2 transitions in both local and remote modes.
              <ul style={{ marginTop: 12, lineHeight: 1.8 }}>
                <li><strong style={{ color: ARCADE.CSS_NEON_CYAN }}>L1–L4</strong>: Local-mode tests (deterministic, no server)</li>
                <li><strong style={{ color: ARCADE.CSS_NEON_PINK }}>R1–R7</strong>: Remote-mode tests (synthetic GameState injection)</li>
              </ul>
            </div>
          )}
          {results.map(r => (
            <div
              key={r.id}
              style={{
                marginBottom: 8,
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${
                  r.status === 'pass' ? ARCADE.CSS_NEON_GREEN :
                  r.status === 'fail' ? ARCADE.CSS_NEON_PINK :
                  r.status === 'running' ? ARCADE.CSS_NEON_YELLOW : '#444'
                }`,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontFamily: ARCADE.PIXEL_FONT, fontSize: 10,
                  color:
                    r.status === 'pass' ? ARCADE.CSS_NEON_GREEN :
                    r.status === 'fail' ? ARCADE.CSS_NEON_PINK :
                    r.status === 'running' ? ARCADE.CSS_NEON_YELLOW : '#666',
                }}>
                  {r.status === 'pass' ? '✓' :
                   r.status === 'fail' ? '✗' :
                   r.status === 'running' ? '◌' : '·'} {r.id}
                </span>
                <span style={{ color: '#ccc', fontWeight: 500 }}>{r.name}</span>
              </div>
              {r.message && (
                <div style={{
                  marginTop: 4, marginLeft: 24,
                  color: r.status === 'fail' ? '#ff8aa6' : '#aaa',
                  fontSize: 11, fontFamily: 'Menlo, monospace',
                }}>
                  {r.message}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Live engine state + log column */}
        <div style={{
          width: 420, padding: '12px 16px', overflow: 'auto',
          background: 'rgba(0,0,0,0.3)',
          fontSize: 11, fontFamily: 'Menlo, monospace',
        }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: ARCADE.CSS_NEON_CYAN, marginBottom: 4 }}>ENGINE STATE</div>
            {info ? (
              <div style={{ color: '#aaa', lineHeight: 1.6 }}>
                phase: <span style={{ color: '#fff' }}>{info.phase}</span><br />
                level: {info.level}, coins: {info.coins}<br />
                probA: {info.probabilityA}%, probB: {info.probabilityB}%<br />
                lastResult: {info.lastResult ?? 'null'}<br />
                overlapPercent: {info.overlapPercent.toFixed(1)}%<br />
                introSplash: {info.introSplash ?? 'null'}
              </div>
            ) : <div style={{ color: '#666' }}>(engine initializing...)</div>}
          </div>

          <div style={{ color: ARCADE.CSS_NEON_PINK, marginBottom: 4 }}>RUN LOG</div>
          <div style={{ color: '#888', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {log.length === 0 ? '(no run yet)' : log.join('\n')}
          </div>
        </div>
      </div>

      {/* Hidden engine canvas */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          left: -10000, top: -10000,
          width: 800, height: 600,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
