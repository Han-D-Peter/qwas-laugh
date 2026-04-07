export type SuspensePhase = 'showA' | 'showB' | 'calculating' | 'drumroll' | 'reveal';

/**
 * Runs the full suspense animation sequence:
 * 1. Show probability A (1.5s)
 * 2. Show probability B (1.5s)
 * 3. Calculating A*B with dramatic build (2s)
 * 4. Drumroll / tension (2s)
 * 5. Reveal result (1s)
 */
export function runSuspenseAnimation(
  probability: number,
  onUpdate: (progress: number, phase: SuspensePhase) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const phases: { phase: SuspensePhase; duration: number }[] = [
      { phase: 'showA', duration: 1500 },
      { phase: 'showB', duration: 1500 },
      { phase: 'calculating', duration: 2000 },
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
