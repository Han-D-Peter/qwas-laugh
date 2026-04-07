export interface DifficultyConfig {
  level: number;
  mazeWidth: number;
  mazeHeight: number;
  mazeCellSize: number;
  clawSpeed: number;
  dollMinDistance: number;
  dollOutsideMaze: boolean;
  irregularBorders: boolean;
  irregularComplexity: number; // 0 = none, 1 = mild, 2 = complex
  diagonalPlayerCount: number; // 0, 2, or 4 players use diagonal controls
  phase2PathLength: number;
  phase2PathWidth: number;
  phase2DriftAmplitude: number;
  phase2DriftFrequency: number;
  phase2Segments: number;
}
