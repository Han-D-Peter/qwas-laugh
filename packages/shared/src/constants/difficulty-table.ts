import type { DifficultyConfig } from '../types/difficulty.js';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Anchor points at tier boundaries (every 4 levels)
const TIER_ANCHORS: Omit<DifficultyConfig, 'level'>[] = [
  // Tier 1: Levels 1-4
  {
    mazeWidth: 7, mazeHeight: 7, mazeCellSize: 80, clawSpeed: 3,
    dollMinDistance: 3, dollOutsideMaze: false,
    irregularBorders: false, irregularComplexity: 0,
    diagonalPlayerCount: 0,
    phase2PathLength: 500, phase2PathWidth: 120,
    phase2DriftAmplitude: 1, phase2DriftFrequency: 0.5,
    phase2Segments: 3,
  },
  // Tier 2: Levels 5-8
  {
    mazeWidth: 10, mazeHeight: 10, mazeCellSize: 75, clawSpeed: 3.2,
    dollMinDistance: 5, dollOutsideMaze: false,
    irregularBorders: false, irregularComplexity: 0,
    diagonalPlayerCount: 0,
    phase2PathLength: 650, phase2PathWidth: 105,
    phase2DriftAmplitude: 1.5, phase2DriftFrequency: 0.7,
    phase2Segments: 4,
  },
  // Tier 3: Levels 9-12
  {
    mazeWidth: 13, mazeHeight: 13, mazeCellSize: 80, clawSpeed: 3,
    dollMinDistance: 7, dollOutsideMaze: false,
    irregularBorders: false, irregularComplexity: 0,
    diagonalPlayerCount: 0,
    phase2PathLength: 800, phase2PathWidth: 90,
    phase2DriftAmplitude: 2, phase2DriftFrequency: 1.0,
    phase2Segments: 5,
  },
  // Tier 4: Levels 13-16
  {
    mazeWidth: 16, mazeHeight: 16, mazeCellSize: 70, clawSpeed: 3.5,
    dollMinDistance: 10, dollOutsideMaze: false,
    irregularBorders: true, irregularComplexity: 1,
    diagonalPlayerCount: 2,
    phase2PathLength: 1000, phase2PathWidth: 75,
    phase2DriftAmplitude: 2.5, phase2DriftFrequency: 1.3,
    phase2Segments: 7,
  },
  // Tier 5: Levels 17-20
  {
    mazeWidth: 19, mazeHeight: 19, mazeCellSize: 65, clawSpeed: 4,
    dollMinDistance: 12, dollOutsideMaze: true,
    irregularBorders: true, irregularComplexity: 1,
    diagonalPlayerCount: 2,
    phase2PathLength: 1200, phase2PathWidth: 60,
    phase2DriftAmplitude: 3, phase2DriftFrequency: 1.5,
    phase2Segments: 9,
  },
  // Tier 6: Levels 21-24
  {
    mazeWidth: 22, mazeHeight: 22, mazeCellSize: 60, clawSpeed: 4.5,
    dollMinDistance: 15, dollOutsideMaze: true,
    irregularBorders: true, irregularComplexity: 2,
    diagonalPlayerCount: 4,
    phase2PathLength: 1500, phase2PathWidth: 50,
    phase2DriftAmplitude: 4, phase2DriftFrequency: 2.0,
    phase2Segments: 11,
  },
  // Tier 7: Levels 25-28
  {
    mazeWidth: 24, mazeHeight: 24, mazeCellSize: 55, clawSpeed: 4.8,
    dollMinDistance: 18, dollOutsideMaze: true,
    irregularBorders: true, irregularComplexity: 2,
    diagonalPlayerCount: 4,
    phase2PathLength: 1800, phase2PathWidth: 42,
    phase2DriftAmplitude: 4.5, phase2DriftFrequency: 2.3,
    phase2Segments: 13,
  },
  // Tier 8: Levels 29-30
  {
    mazeWidth: 25, mazeHeight: 25, mazeCellSize: 50, clawSpeed: 5,
    dollMinDistance: 20, dollOutsideMaze: true,
    irregularBorders: true, irregularComplexity: 2,
    diagonalPlayerCount: 4,
    phase2PathLength: 2000, phase2PathWidth: 36,
    phase2DriftAmplitude: 5, phase2DriftFrequency: 2.5,
    phase2Segments: 15,
  },
];

function getTierAndProgress(level: number): { tierIndex: number; t: number } {
  const tierSize = 4;
  const tierIndex = Math.min(Math.floor((level - 1) / tierSize), TIER_ANCHORS.length - 2);
  const posInTier = ((level - 1) % tierSize) / (tierSize - 1);
  return { tierIndex, t: posInTier };
}

function lerpConfig(a: Omit<DifficultyConfig, 'level'>, b: Omit<DifficultyConfig, 'level'>, t: number): Omit<DifficultyConfig, 'level'> {
  return {
    mazeWidth: Math.round(lerp(a.mazeWidth, b.mazeWidth, t)),
    mazeHeight: Math.round(lerp(a.mazeHeight, b.mazeHeight, t)),
    mazeCellSize: Math.round(lerp(a.mazeCellSize, b.mazeCellSize, t)),
    clawSpeed: lerp(a.clawSpeed, b.clawSpeed, t),
    dollMinDistance: Math.round(lerp(a.dollMinDistance, b.dollMinDistance, t)),
    dollOutsideMaze: t >= 0.5 ? b.dollOutsideMaze : a.dollOutsideMaze,
    irregularBorders: t >= 0.5 ? b.irregularBorders : a.irregularBorders,
    irregularComplexity: t >= 0.5 ? b.irregularComplexity : a.irregularComplexity,
    diagonalPlayerCount: t >= 0.5 ? b.diagonalPlayerCount : a.diagonalPlayerCount,
    phase2PathLength: Math.round(lerp(a.phase2PathLength, b.phase2PathLength, t)),
    phase2PathWidth: Math.round(lerp(a.phase2PathWidth, b.phase2PathWidth, t)),
    phase2DriftAmplitude: lerp(a.phase2DriftAmplitude, b.phase2DriftAmplitude, t),
    phase2DriftFrequency: lerp(a.phase2DriftFrequency, b.phase2DriftFrequency, t),
    phase2Segments: Math.round(lerp(a.phase2Segments, b.phase2Segments, t)),
  };
}

// Pre-compute all 30 levels
const DIFFICULTY_TABLE: DifficultyConfig[] = [];
for (let level = 1; level <= 30; level++) {
  const { tierIndex, t } = getTierAndProgress(level);
  const nextTier = Math.min(tierIndex + 1, TIER_ANCHORS.length - 1);
  const config = lerpConfig(TIER_ANCHORS[tierIndex], TIER_ANCHORS[nextTier], t);
  DIFFICULTY_TABLE.push({ level, ...config });
}

export function getDifficultyConfig(level: number): DifficultyConfig {
  const clamped = Math.max(1, Math.min(30, level));
  return DIFFICULTY_TABLE[clamped - 1];
}

export { DIFFICULTY_TABLE };
