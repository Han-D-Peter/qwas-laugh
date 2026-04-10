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

  // ─── Tests ─────────────────────────────────────────────────────

  const TESTS: { id: string; name: string; run: () => Promise<{ pass: boolean; msg: string; diag?: string }> }[] = [

    // ─── GROUP A: LOCAL MODE ───────────────────────────────────
    {
      id: 'L1',
      name: 'Local: successful Phase 1 grab transitions through full sequence',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        // Wait a tick for engine to settle (intro animation)
        await wait(100);
        const startPhase = e.phase;
        if (startPhase !== 'phase1') return { pass: false, msg: `Expected initial phase='phase1', got '${startPhase}'` };
        // Force grab on doll
        const ok = localForceP1GrabSuccess();
        if (!ok) return { pass: false, msg: 'Could not invoke localForceP1GrabSuccess' };
        // Should immediately be in phase1_to_phase2
        if (e.phase !== 'phase1_to_phase2') {
          return { pass: false, msg: `Expected phase='phase1_to_phase2' immediately after grab, got '${e.phase}'` };
        }
        if (!e.phase1GrabCommitted) return { pass: false, msg: 'phase1GrabCommitted should be true after success' };
        if (!(e.probabilityA > 0)) return { pass: false, msg: `probabilityA should be > 0, got ${e.probabilityA}` };
        // Wait for the scheduled startPhase2 (2000ms)
        const reached = await waitForAnyPhase(['phase2_countdown', 'phase2'], 3000);
        if (!reached) return { pass: false, msg: `Timeout: never reached phase2_countdown after 3s. Current phase=${e.phase}` };
        // Wait for countdown to finish (3s) and reach phase2
        const inPhase2 = await waitForPhase('phase2', 5000, 'after countdown');
        if (!inPhase2) return { pass: false, msg: `Timeout: never reached phase2 after countdown. Current phase=${e.phase}` };
        return { pass: true, msg: 'Reached phase2 cleanly via phase1→phase1_to_phase2→phase2_countdown→phase2' };
      },
    },
    {
      id: 'L2',
      name: 'Local: failed Phase 1 grab (no overlap) returns to phase1 cleanly',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        await wait(100);
        // Force claw away from doll
        e.clawPos.x = e.dollPos.x + 200;
        e.clawPos.y = e.dollPos.y;
        const startCoins = e.coins;
        e.attemptPhase1Grab();
        // Should fail and reset to phase1
        if (e.phase !== 'phase1') return { pass: false, msg: `Expected phase='phase1' after fail, got '${e.phase}'` };
        if (e.coins !== startCoins + 1) return { pass: false, msg: `Coins should increment on fail (was ${startCoins}, now ${e.coins})` };
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
        // Trigger first grab via the keyboard handler
        e.keyHandler?.({ key: ' ', preventDefault: () => {} });
        const afterFirst = { phase: e.phase, committed: e.phase1GrabCommitted, probA: e.probabilityA };
        // Try a second press immediately
        e.keyHandler?.({ key: ' ', preventDefault: () => {} });
        const afterSecond = { phase: e.phase, committed: e.phase1GrabCommitted, probA: e.probabilityA };
        if (afterFirst.phase !== 'phase1_to_phase2') return { pass: false, msg: `First grab should set phase=phase1_to_phase2, got '${afterFirst.phase}'` };
        if (!afterFirst.committed) return { pass: false, msg: 'First grab should set phase1GrabCommitted=true' };
        if (afterSecond.phase !== afterFirst.phase || afterSecond.probA !== afterFirst.probA) {
          return { pass: false, msg: `Second press should be no-op. After1=${JSON.stringify(afterFirst)} After2=${JSON.stringify(afterSecond)}` };
        }
        return { pass: true, msg: 'Second rapid grab press correctly ignored after Phase 1 commit' };
      },
    },
    {
      id: 'L4',
      name: 'Local: 3 consecutive Phase 1→2 cycles (no state leakage)',
      async run() {
        let succeeded = 0;
        for (let i = 0; i < 3; i++) {
          resetLocal();
          const e = engineRef.current as any;
          await wait(100);
          localForceP1GrabSuccess();
          if (e.phase !== 'phase1_to_phase2') {
            return { pass: false, msg: `Cycle ${i + 1}: phase mismatch immediately after grab. Expected phase1_to_phase2, got '${e.phase}'` };
          }
          // Wait for phase2_countdown
          const ok = await waitForPhase('phase2_countdown', 3000, `cycle ${i + 1} countdown`);
          if (!ok) return { pass: false, msg: `Cycle ${i + 1}: never reached phase2_countdown` };
          // Don't wait for full countdown, just verify the state machine progressed
          succeeded++;
        }
        return { pass: succeeded === 3, msg: `${succeeded}/3 cycles reached phase2_countdown without state leakage` };
      },
    },

    // ─── GROUP B: REMOTE MODE (synthetic state injection) ──────
    {
      id: 'R1',
      name: 'Remote: phase=phase2 broadcast triggers transition through countdown',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        // Need a baseline phase1 state with maze cached
        await e.applyServerState(makeState());
        await wait(100);
        // Server overlap event sets probA
        e.setServerOverlap('phase1', 50);
        if (!(e.probabilityA > 0)) return { pass: false, msg: `setServerOverlap did not set probabilityA: ${e.probabilityA}` };
        // Inject phase=phase2 state (simulating server transition)
        await e.applyServerState(makePhase2State());
        if (e.phase !== 'phase1_to_phase2') {
          return { pass: false, msg: `Expected phase='phase1_to_phase2' after phase2 injection, got '${e.phase}'` };
        }
        // Wait for the 2.5s setTimeout to fire setupPhase2FromState → phase2_countdown
        const reachedCountdown = await waitForPhase('phase2_countdown', 4000, 'after setTimeout');
        if (!reachedCountdown) return { pass: false, msg: `Timeout: never reached phase2_countdown. Current=${e.phase}` };
        // Wait for full countdown
        const inPhase2 = await waitForPhase('phase2', 5000, 'after countdown');
        if (!inPhase2) return { pass: false, msg: `Timeout: never reached phase2. Current=${e.phase}` };
        return { pass: true, msg: 'Remote phase1→phase2 transition completed through countdown to phase2' };
      },
    },
    {
      id: 'R2',
      name: 'Remote: race guard blocks phase1 broadcasts during phase1_to_phase2',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        await wait(50);
        e.setServerOverlap('phase1', 50);
        await e.applyServerState(makePhase2State());
        if (e.phase !== 'phase1_to_phase2') return { pass: false, msg: `Setup failed: phase=${e.phase}` };
        // Inject 5 phase1 broadcasts at the SAME maze seed
        const beforePhase = e.phase;
        for (let i = 0; i < 5; i++) {
          await e.applyServerState(makeState());
          await wait(20);
        }
        if (e.phase !== beforePhase) {
          return { pass: false, msg: `Race guard failed: phase changed from '${beforePhase}' to '${e.phase}' during phase1_to_phase2` };
        }
        return { pass: true, msg: `Race guard held: phase stayed '${beforePhase}' across 5 racing phase1 broadcasts` };
      },
    },
    {
      id: 'R3',
      name: 'Remote: same-seed phase1 broadcasts during phase2_countdown do NOT tear down',
      async run() {
        // This is the bug from commit decfece — was previously broken
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        await wait(50);
        e.setServerOverlap('phase1', 50);
        await e.applyServerState(makePhase2State());
        // Wait for phase1_to_phase2 → phase2_countdown
        const inCountdown = await waitForPhase('phase2_countdown', 4000, 'enter countdown');
        if (!inCountdown) return { pass: false, msg: `Timeout: never reached phase2_countdown` };
        // Now inject 10 racing phase1 broadcasts with the SAME maze seed
        for (let i = 0; i < 10; i++) {
          await e.applyServerState(makeState());
          await wait(50);
        }
        // The countdown should still be running (or already at phase2)
        if (e.phase !== 'phase2_countdown' && e.phase !== 'phase2') {
          return { pass: false, msg: `BUG: phase torn down from countdown. Now phase='${e.phase}'` };
        }
        return { pass: true, msg: `Phase stayed in countdown/phase2 across 10 racing phase1 broadcasts (decfece fix verified)` };
      },
    },
    {
      id: 'R4',
      name: 'Remote: NEW level phase1 broadcast (different seed) DOES rebuild',
      async run() {
        // After R3, verify the seed-based isNewLevel still detects real new levels
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        const initialSeed = e.maze?.seed;
        // Inject phase1 with a DIFFERENT seed (a real new level)
        const newSeedState = makeState({
          maze: { ...e.maze, seed: (initialSeed ?? 0) + 999999 },
        });
        await e.applyServerState(newSeedState);
        if (e.maze?.seed !== (initialSeed ?? 0) + 999999) {
          return { pass: false, msg: `New seed not applied: was ${initialSeed}, expected ${(initialSeed ?? 0) + 999999}, got ${e.maze?.seed}` };
        }
        if (e.phase !== 'phase1') {
          return { pass: false, msg: `Expected phase='phase1' after new-level broadcast, got '${e.phase}'` };
        }
        return { pass: true, msg: `Real new-level broadcast triggered scene rebuild (seed ${initialSeed}→${e.maze?.seed})` };
      },
    },
    {
      id: 'R5',
      name: 'Remote: phase2_to_suspense racing phase1 broadcast does not break suspense',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        await e.applyServerState(makeState());
        e.setServerOverlap('phase1', 50);
        await e.applyServerState(makePhase2State());
        await waitForPhase('phase2_countdown', 4000, 'countdown');
        await waitForPhase('phase2', 5000, 'phase2');
        // Now simulate Phase 2 grab via the result block
        e.setServerOverlap('phase2', 80); // probB = 0.8
        const resultState = makeState({
          phase: 'result',
          probabilityA: 0.5,
          probabilityB: 0.8,
          lastResult: 'success',
        });
        await e.applyServerState(resultState);
        if (e.phase !== 'phase2_to_suspense') {
          return { pass: false, msg: `Expected phase='phase2_to_suspense' after result injection, got '${e.phase}'` };
        }
        // Inject racing phase1 broadcasts
        for (let i = 0; i < 5; i++) {
          await e.applyServerState(makeState());
          await wait(30);
        }
        if (e.phase !== 'phase2_to_suspense') {
          return { pass: false, msg: `Race guard failed during phase2_to_suspense: phase=${e.phase}` };
        }
        return { pass: true, msg: `phase2_to_suspense protected from racing phase1 broadcasts` };
      },
    },
    {
      id: 'R6',
      name: 'Remote: result lock holds for 3.5s then releases',
      async run() {
        resetLocal();
        const e = engineRef.current as any;
        e.setRemoteMode();
        // Manually arm: pretend startRemoteSuspense just resolved
        e.phase = 'result';
        e.lastResult = 'success';
        e.resultLockUntil = Date.now() + 3500;
        e.probabilityA = 0.6;
        e.probabilityB = 0.7;
        // Inject phase1 broadcast — should be blocked
        await e.applyServerState(makeState());
        if (e.phase !== 'result') {
          return { pass: false, msg: `Result lock failed: phase changed to '${e.phase}' while lock active` };
        }
        // Force lock to expire
        e.resultLockUntil = Date.now() - 100;
        // Inject another phase1 — should now flow through
        await e.applyServerState(makeState({
          maze: { ...e.maze, seed: 8888888 },
        }));
        if (e.phase !== 'phase1') {
          return { pass: false, msg: `After lock expiration, expected phase='phase1', got '${e.phase}'` };
        }
        return { pass: true, msg: 'Result lock correctly held then released' };
      },
    },
    {
      id: 'R7',
      name: 'Remote: stress test — 20 cycles of phase1→phase2 transition',
      async run() {
        let cycles = 0;
        for (let i = 0; i < 20; i++) {
          resetLocal();
          const e = engineRef.current as any;
          e.setRemoteMode();
          await e.applyServerState(makeState({
            maze: { ...(e.maze ?? makeState().maze), seed: 100000 + i },
          }));
          await wait(20);
          e.setServerOverlap('phase1', 50);
          await e.applyServerState(makePhase2State(1, 100000 + i));
          if (e.phase !== 'phase1_to_phase2') {
            return { pass: false, msg: `Cycle ${i + 1}: phase=${e.phase} after phase2 inject` };
          }
          // Race the transition with phase1 broadcasts
          for (let j = 0; j < 3; j++) {
            await e.applyServerState(makeState({
              maze: { ...e.maze, seed: 100000 + i },
            }));
            await wait(10);
          }
          if (e.phase !== 'phase1_to_phase2') {
            return { pass: false, msg: `Cycle ${i + 1}: race guard broke at sub-iteration. phase=${e.phase}` };
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
