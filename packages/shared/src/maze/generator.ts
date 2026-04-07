import type { MazeCell, MazeData, Vec2 } from '../types/game-state.js';
import { CELL_SIZE } from '../constants/game.js';

/**
 * Seeded PRNG (mulberry32) for deterministic maze generation.
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Neighbor {
  row: number;
  col: number;
  wallToRemove: 'north' | 'south' | 'east' | 'west';
  oppositeWall: 'north' | 'south' | 'east' | 'west';
}

/**
 * Generate a maze using recursive backtracker (DFS) algorithm.
 */
export function generateMaze(width: number, height: number, seed: number): MazeData {
  const rng = mulberry32(seed);

  // Initialize all cells with all walls
  const cells: MazeCell[][] = [];
  for (let row = 0; row < height; row++) {
    cells[row] = [];
    for (let col = 0; col < width; col++) {
      cells[row][col] = {
        row,
        col,
        walls: { north: true, south: true, east: true, west: true },
      };
    }
  }

  // Track visited cells
  const visited: boolean[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false)
  );

  // Start from center
  const startRow = Math.floor(height / 2);
  const startCol = Math.floor(width / 2);

  const stack: { row: number; col: number }[] = [];
  visited[startRow][startCol] = true;
  stack.push({ row: startRow, col: startCol });

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = getUnvisitedNeighbors(current.row, current.col, visited, width, height);

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    // Pick random unvisited neighbor
    const idx = Math.floor(rng() * neighbors.length);
    const neighbor = neighbors[idx];

    // Remove walls between current and chosen neighbor
    cells[current.row][current.col].walls[neighbor.wallToRemove] = false;
    cells[neighbor.row][neighbor.col].walls[neighbor.oppositeWall] = false;

    visited[neighbor.row][neighbor.col] = true;
    stack.push({ row: neighbor.row, col: neighbor.col });
  }

  return { width, height, cells, seed, cellSize: CELL_SIZE };
}

function getUnvisitedNeighbors(
  row: number, col: number,
  visited: boolean[][], width: number, height: number
): Neighbor[] {
  const neighbors: Neighbor[] = [];

  if (row > 0 && !visited[row - 1][col]) {
    neighbors.push({ row: row - 1, col, wallToRemove: 'north', oppositeWall: 'south' });
  }
  if (row < height - 1 && !visited[row + 1][col]) {
    neighbors.push({ row: row + 1, col, wallToRemove: 'south', oppositeWall: 'north' });
  }
  if (col > 0 && !visited[row][col - 1]) {
    neighbors.push({ row, col: col - 1, wallToRemove: 'west', oppositeWall: 'east' });
  }
  if (col < width - 1 && !visited[row][col + 1]) {
    neighbors.push({ row, col: col + 1, wallToRemove: 'east', oppositeWall: 'west' });
  }

  return neighbors;
}

/**
 * Place a doll at a position that is at least `minDistance` BFS steps from center.
 */
export function placeDoll(
  maze: MazeData,
  minDistance: number,
  seed: number,
): Vec2 {
  const rng = mulberry32(seed + 12345);
  const centerRow = Math.floor(maze.height / 2);
  const centerCol = Math.floor(maze.width / 2);

  // BFS from center
  const dist: number[][] = Array.from({ length: maze.height }, () =>
    Array.from({ length: maze.width }, () => -1)
  );
  const queue: { row: number; col: number }[] = [{ row: centerRow, col: centerCol }];
  dist[centerRow][centerCol] = 0;

  while (queue.length > 0) {
    const { row, col } = queue.shift()!;
    const cell = maze.cells[row][col];

    const dirs: Array<{ dr: number; dc: number; wall: keyof MazeCell['walls'] }> = [
      { dr: -1, dc: 0, wall: 'north' },
      { dr: 1, dc: 0, wall: 'south' },
      { dr: 0, dc: -1, wall: 'west' },
      { dr: 0, dc: 1, wall: 'east' },
    ];

    for (const { dr, dc, wall } of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < maze.height && nc >= 0 && nc < maze.width &&
          dist[nr][nc] === -1 && !cell.walls[wall]) {
        dist[nr][nc] = dist[row][col] + 1;
        queue.push({ row: nr, col: nc });
      }
    }
  }

  // Collect all cells at or beyond minDistance
  const candidates: Vec2[] = [];
  for (let row = 0; row < maze.height; row++) {
    for (let col = 0; col < maze.width; col++) {
      if (dist[row][col] >= minDistance) {
        candidates.push({
          x: col * maze.cellSize + maze.cellSize / 2,
          y: row * maze.cellSize + maze.cellSize / 2,
        });
      }
    }
  }

  // If no candidates far enough, use the furthest cell
  if (candidates.length === 0) {
    let maxDist = 0;
    let best = { x: 0, y: 0 };
    for (let row = 0; row < maze.height; row++) {
      for (let col = 0; col < maze.width; col++) {
        if (dist[row][col] > maxDist) {
          maxDist = dist[row][col];
          best = {
            x: col * maze.cellSize + maze.cellSize / 2,
            y: row * maze.cellSize + maze.cellSize / 2,
          };
        }
      }
    }
    return best;
  }

  // Random pick from candidates
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx];
}
