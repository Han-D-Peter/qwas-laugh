import type { Vec2 } from '../types/game-state.js';
import { mulberry32 } from '../maze/generator.js';

export interface Phase2Path {
  /** Center-line points of the winding path */
  centerLine: Vec2[];
  /** Left wall boundary points */
  leftWall: Vec2[];
  /** Right wall boundary points */
  rightWall: Vec2[];
  /** Total vertical length of the path */
  totalLength: number;
  /** Width of the path */
  pathWidth: number;
  /** Random position for the doll box at the bottom */
  dollBoxX: number;
}

/**
 * Generate a winding descent path for Phase 2.
 * Uses cubic Bezier segments with random horizontal offsets.
 */
export function generatePhase2Path(
  pathLength: number,
  pathWidth: number,
  segments: number,
  driftAmplitude: number,
  seed: number,
): Phase2Path {
  const rng = mulberry32(seed + 99999);

  const segmentHeight = pathLength / segments;
  const centerLine: Vec2[] = [];
  const leftWall: Vec2[] = [];
  const rightWall: Vec2[] = [];

  // The horizontal center of the play area
  const centerX = 200;

  // Generate control points for each segment
  let currentX = centerX;
  const pointsPerSegment = 20;

  for (let seg = 0; seg <= segments; seg++) {
    const y = seg * segmentHeight;

    if (seg === 0) {
      // Start at top center
      centerLine.push({ x: currentX, y });
      leftWall.push({ x: currentX - pathWidth / 2, y });
      rightWall.push({ x: currentX + pathWidth / 2, y });
      continue;
    }

    // Random horizontal offset for this segment endpoint
    const maxOffset = driftAmplitude * 30;
    const targetX = centerX + (rng() - 0.5) * 2 * maxOffset;

    // Bezier control points for smooth curves
    const prevY = (seg - 1) * segmentHeight;
    const cp1x = currentX + (rng() - 0.5) * maxOffset;
    const cp1y = prevY + segmentHeight * 0.33;
    const cp2x = targetX + (rng() - 0.5) * maxOffset;
    const cp2y = prevY + segmentHeight * 0.66;

    // Sample points along the Bezier curve
    for (let i = 1; i <= pointsPerSegment; i++) {
      const t = i / pointsPerSegment;
      const px = cubicBezier(currentX, cp1x, cp2x, targetX, t);
      const py = cubicBezier(prevY, cp1y, cp2y, y, t);

      centerLine.push({ x: px, y: py });
      leftWall.push({ x: px - pathWidth / 2, y: py });
      rightWall.push({ x: px + pathWidth / 2, y: py });
    }

    currentX = targetX;
  }

  // Add extra straight runway at the bottom for aiming at the doll
  const extraRunway = 350;
  const lastCenter = centerLine[centerLine.length - 1];
  const runwaySteps = 6;
  for (let i = 1; i <= runwaySteps; i++) {
    const ry = lastCenter.y + (extraRunway / runwaySteps) * i;
    centerLine.push({ x: lastCenter.x, y: ry });
    leftWall.push({ x: lastCenter.x - pathWidth / 2, y: ry });
    rightWall.push({ x: lastCenter.x + pathWidth / 2, y: ry });
  }

  const totalWithRunway = pathLength + extraRunway;

  // Doll box X position: random within the bottom portion of the path
  const dollRange = pathWidth * 0.6;
  const dollBoxX = lastCenter.x + (rng() - 0.5) * dollRange;

  return {
    centerLine,
    leftWall,
    rightWall,
    totalLength: totalWithRunway,
    pathWidth,
    dollBoxX,
  };
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0
    + 3 * mt * mt * t * p1
    + 3 * mt * t * t * p2
    + t * t * t * p3;
}
