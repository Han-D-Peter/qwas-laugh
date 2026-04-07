import type { Box, MazeData, Vec2 } from '../types/game-state.js';

/**
 * Check if a box collides with any maze wall.
 * Returns true if there is a collision.
 */
export function checkMazeCollision(box: Box, maze: MazeData): boolean {
  const { cellSize, cells, width, height } = maze;

  // Check boundary collision
  if (box.x < 0 || box.y < 0 ||
      box.x + box.width > width * cellSize ||
      box.y + box.height > height * cellSize) {
    return true;
  }

  // Determine which cells the box overlaps
  const startCol = Math.floor(box.x / cellSize);
  const endCol = Math.floor((box.x + box.width - 1) / cellSize);
  const startRow = Math.floor(box.y / cellSize);
  const endRow = Math.floor((box.y + box.height - 1) / cellSize);

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (row < 0 || row >= height || col < 0 || col >= width) {
        return true;
      }

      const cell = cells[row][col];
      const cellX = col * cellSize;
      const cellY = row * cellSize;
      const wallThickness = 2;

      // Check north wall
      if (cell.walls.north && box.y < cellY + wallThickness && box.y + box.height > cellY) {
        return true;
      }
      // Check south wall
      if (cell.walls.south && box.y + box.height > cellY + cellSize - wallThickness && box.y < cellY + cellSize) {
        return true;
      }
      // Check west wall
      if (cell.walls.west && box.x < cellX + wallThickness && box.x + box.width > cellX) {
        return true;
      }
      // Check east wall
      if (cell.walls.east && box.x + box.width > cellX + cellSize - wallThickness && box.x < cellX + cellSize) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a point is within the phase 2 path boundaries.
 */
export function checkPhase2WallCollision(
  clawX: number,
  clawWidth: number,
  leftWall: Vec2[],
  rightWall: Vec2[],
  clawY: number,
): boolean {
  // Find the two wall points surrounding the claw's Y position
  for (let i = 0; i < leftWall.length - 1; i++) {
    if (clawY >= leftWall[i].y && clawY <= leftWall[i + 1].y) {
      const t = (clawY - leftWall[i].y) / (leftWall[i + 1].y - leftWall[i].y);
      const leftX = leftWall[i].x + t * (leftWall[i + 1].x - leftWall[i].x);
      const rightX = rightWall[i].x + t * (rightWall[i + 1].x - rightWall[i].x);

      if (clawX < leftX || clawX + clawWidth > rightX) {
        return true;
      }
      return false;
    }
  }
  return false;
}
