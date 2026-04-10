import { Container } from 'pixi.js';
import type { MazeData, Vec2 } from '@qwas/shared';
import { drawDoll, DOLL_TYPES } from './doll.js';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a Container of tiny dolls sitting along each wall segment of a maze.
 * Dolls are decorative only — collision still uses the underlying wall lines.
 */
export function buildWallDolls(maze: MazeData, seed: number): Container {
  const container = new Container();
  const { cells, width, height, cellSize } = maze;
  const rand = mulberry32(seed ^ 0x13371337);

  const DOLLS_PER_SEGMENT = 2;
  const OFFSET = 8; // pixel offset inward from wall line

  const placeDoll = (x: number, y: number) => {
    const doll = drawDoll(Math.floor(rand() * DOLL_TYPES.length));
    doll.x = x + (rand() - 0.5) * 4;
    doll.y = y + (rand() - 0.5) * 4;
    doll.scale.set(0.42 + rand() * 0.1);
    doll.rotation = (rand() - 0.5) * 0.5;
    doll.alpha = 0.9;
    container.addChild(doll);
  };

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = cells[row][col];
      const x = col * cellSize;
      const y = row * cellSize;

      if (cell.walls.north) {
        for (let i = 0; i < DOLLS_PER_SEGMENT; i++) {
          const t = (i + 1) / (DOLLS_PER_SEGMENT + 1);
          placeDoll(x + cellSize * t, y + OFFSET);
        }
      }
      if (cell.walls.south) {
        // Only draw south dolls if this is the boundary row (next row's north
        // would otherwise draw the same). Draw them only for the outermost
        // south wall to prevent stacking.
        if (row === height - 1) {
          for (let i = 0; i < DOLLS_PER_SEGMENT; i++) {
            const t = (i + 1) / (DOLLS_PER_SEGMENT + 1);
            placeDoll(x + cellSize * t, y + cellSize - OFFSET);
          }
        }
      }
      if (cell.walls.west) {
        for (let i = 0; i < DOLLS_PER_SEGMENT; i++) {
          const t = (i + 1) / (DOLLS_PER_SEGMENT + 1);
          placeDoll(x + OFFSET, y + cellSize * t);
        }
      }
      if (cell.walls.east) {
        if (col === width - 1) {
          for (let i = 0; i < DOLLS_PER_SEGMENT; i++) {
            const t = (i + 1) / (DOLLS_PER_SEGMENT + 1);
            placeDoll(x + cellSize - OFFSET, y + cellSize * t);
          }
        }
      }
    }
  }

  return container;
}

/**
 * Build a row of small dolls tracing a polyline (Phase 2 wall).
 * `offsetX` pushes them slightly outside the wall (negative = left of line).
 * Seeded to stay deterministic across clients.
 */
export function buildWallDollLine(
  polyline: Vec2[],
  seed: number,
  offsetX: number,
  spacing: number = 48,
): Container {
  const container = new Container();
  if (polyline.length < 2) return container;
  const rand = mulberry32(seed);

  // Walk the polyline and place a doll every `spacing` units
  let remainder = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.001) continue;
    const nx = dx / segLen;
    const ny = dy / segLen;
    // Perpendicular for the offset (rotate 90° clockwise)
    const px = ny;
    const py = -nx;

    let d = remainder;
    while (d < segLen) {
      const cx = a.x + nx * d + px * offsetX;
      const cy = a.y + ny * d + py * offsetX;
      const doll = drawDoll(Math.floor(rand() * DOLL_TYPES.length));
      doll.x = cx + (rand() - 0.5) * 4;
      doll.y = cy + (rand() - 0.5) * 4;
      doll.scale.set(0.45 + rand() * 0.1);
      doll.rotation = (rand() - 0.5) * 0.5;
      doll.alpha = 0.85;
      container.addChild(doll);
      d += spacing;
    }
    remainder = d - segLen;
  }

  return container;
}

