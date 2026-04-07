/**
 * Runs the suspense animation for the final grab result.
 * Returns a promise that resolves to the success/fail result after the animation.
 */
export function runSuspenseAnimation(
  probability: number,
  onUpdate: (progress: number, phase: 'building' | 'reveal') => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const totalDuration = 2500; // ms
    const revealAt = 2000;
    const startTime = performance.now();

    // Determine outcome upfront
    const success = Math.random() < probability;

    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);

      if (elapsed < revealAt) {
        onUpdate(elapsed / revealAt, 'building');
      } else {
        onUpdate((elapsed - revealAt) / (totalDuration - revealAt), 'reveal');
      }

      if (elapsed < totalDuration) {
        requestAnimationFrame(animate);
      } else {
        resolve(success);
      }
    }

    requestAnimationFrame(animate);
  });
}
