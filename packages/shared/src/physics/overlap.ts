import type { Box } from '../types/game-state.js';

/**
 * Calculate the overlap ratio between two AABB boxes.
 * Returns the overlapping area divided by the target box area (0.0 to 1.0).
 */
export function calculateOverlap(clawBox: Box, targetBox: Box): number {
  const overlapX = Math.max(0,
    Math.min(clawBox.x + clawBox.width, targetBox.x + targetBox.width) -
    Math.max(clawBox.x, targetBox.x)
  );
  const overlapY = Math.max(0,
    Math.min(clawBox.y + clawBox.height, targetBox.y + targetBox.height) -
    Math.max(clawBox.y, targetBox.y)
  );
  const overlapArea = overlapX * overlapY;
  const targetArea = targetBox.width * targetBox.height;
  if (targetArea === 0) return 0;
  return overlapArea / targetArea;
}
