export type SuspensePhase = 'showA' | 'showB' | 'calculating' | 'drumroll' | 'reveal';

/**
 * Runs the suspense animation sequence after a successful Phase 1 grab.
 *
 * Phase 2 was removed from the game flow — final success/failure is decided
 * solely by the Phase 1 overlap probability. The suspense sequence is now:
 *   1. Show probability A      (1.5s)
 *   2. Calculating               (1.6s)
 *   3. Drumroll / tension       (2s)
 *   4. Reveal result             (1s)
 *
 * The 'showB' phase identifier is kept in the union type for backwards
 * compatibility with existing HUD render branches but is never emitted.
 */
export function runSuspenseAnimation(
  probability: number,
  onUpdate: (progress: number, phase: SuspensePhase) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const phases: { phase: SuspensePhase; duration: number }[] = [
      { phase: 'showA', duration: 1500 },
      { phase: 'calculating', duration: 1600 },
      { phase: 'drumroll', duration: 2000 },
      { phase: 'reveal', duration: 1000 },
    ];
    const totalDuration = phases.reduce((sum, p) => sum + p.duration, 0);

    const success = Math.random() < probability;
    const startTime = performance.now();

    function animate() {
      const elapsed = performance.now() - startTime;

      // Determine which phase we're in
      let accumulated = 0;
      for (const p of phases) {
        if (elapsed < accumulated + p.duration) {
          const phaseProgress = (elapsed - accumulated) / p.duration;
          onUpdate(Math.min(phaseProgress, 1), p.phase);
          break;
        }
        accumulated += p.duration;
      }

      if (elapsed < totalDuration) {
        requestAnimationFrame(animate);
      } else {
        onUpdate(1, 'reveal');
        resolve(success);
      }
    }

    requestAnimationFrame(animate);
  });
}
