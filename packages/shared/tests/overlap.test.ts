import { describe, it, expect } from 'vitest';
import { calculateOverlap } from '../src/physics/overlap.js';
import { generateMaze, placeDoll } from '../src/maze/generator.js';
import { getDifficultyConfig } from '../src/constants/difficulty-table.js';
import { CLAW_BOX_SIZE, DOLL_BOX_SIZE } from '../src/constants/game.js';

describe('calculateOverlap', () => {
  it('returns 1.0 for identical boxes', () => {
    const box = { x: 100, y: 100, width: 36, height: 36 };
    expect(calculateOverlap(box, box)).toBe(1.0);
  });

  it('returns 0 for non-overlapping boxes', () => {
    const a = { x: 0, y: 0, width: 36, height: 36 };
    const b = { x: 100, y: 100, width: 34, height: 34 };
    expect(calculateOverlap(a, b)).toBe(0);
  });

  it('returns ~0.5 for half-overlapping boxes', () => {
    const a = { x: 0, y: 0, width: 20, height: 20 };
    const b = { x: 10, y: 0, width: 20, height: 20 };
    const overlap = calculateOverlap(a, b);
    expect(overlap).toBe(0.5); // 10*20 / 20*20 = 0.5
  });

  it('returns >0 when claw is on top of doll (same center)', () => {
    const cx = 200, cy = 200;
    const clawBox = {
      x: cx - CLAW_BOX_SIZE / 2,
      y: cy - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE,
      height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: cx - DOLL_BOX_SIZE / 2,
      y: cy - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE,
      height: DOLL_BOX_SIZE,
    };
    const overlap = calculateOverlap(clawBox, dollBox);
    expect(overlap).toBeGreaterThan(0.9);
  });
});

describe('Phase 1 grab simulation', () => {
  it('overlap > 0 when claw moves to doll position', () => {
    const config = getDifficultyConfig(1);
    const seed = 12345;
    const maze = generateMaze(config.mazeWidth, config.mazeHeight, seed, config.mazeCellSize);
    const dollPos = placeDoll(maze, config.dollMinDistance, seed);

    // Simulate claw at exact doll position
    const clawPos = { x: dollPos.x, y: dollPos.y };

    const clawBox = {
      x: clawPos.x - CLAW_BOX_SIZE / 2,
      y: clawPos.y - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE,
      height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: dollPos.x - DOLL_BOX_SIZE / 2,
      y: dollPos.y - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE,
      height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    console.log('Claw pos:', clawPos);
    console.log('Doll pos:', dollPos);
    console.log('Claw box:', clawBox);
    console.log('Doll box:', dollBox);
    console.log('Overlap:', overlap);
    expect(overlap).toBeGreaterThan(0.9);
  });

  it('server-side grab: check positions match what client sees', () => {
    // Simulate exactly what the server does
    const config = getDifficultyConfig(1);
    const seed = Date.now();
    const maze = generateMaze(config.mazeWidth, config.mazeHeight, seed, config.mazeCellSize);
    const cs = maze.cellSize;

    const centerX = Math.floor(maze.width / 2) * cs + cs / 2;
    const centerY = Math.floor(maze.height / 2) * cs + cs / 2;
    const dollPos = placeDoll(maze, config.dollMinDistance, seed);

    console.log('Maze cellSize:', cs);
    console.log('Maze dimensions:', maze.width, 'x', maze.height);
    console.log('Claw start (center):', centerX, centerY);
    console.log('Doll pos:', dollPos.x, dollPos.y);
    console.log('Distance:', Math.sqrt((centerX - dollPos.x) ** 2 + (centerY - dollPos.y) ** 2));

    // If claw moved to doll position
    const clawBox = {
      x: dollPos.x - CLAW_BOX_SIZE / 2,
      y: dollPos.y - CLAW_BOX_SIZE / 2,
      width: CLAW_BOX_SIZE,
      height: CLAW_BOX_SIZE,
    };
    const dollBox = {
      x: dollPos.x - DOLL_BOX_SIZE / 2,
      y: dollPos.y - DOLL_BOX_SIZE / 2,
      width: DOLL_BOX_SIZE,
      height: DOLL_BOX_SIZE,
    };

    const overlap = calculateOverlap(clawBox, dollBox);
    expect(overlap).toBeGreaterThan(0.9);
  });

  it('check if BOX_SIZE constants are positive', () => {
    console.log('CLAW_BOX_SIZE:', CLAW_BOX_SIZE);
    console.log('DOLL_BOX_SIZE:', DOLL_BOX_SIZE);
    expect(CLAW_BOX_SIZE).toBeGreaterThan(0);
    expect(DOLL_BOX_SIZE).toBeGreaterThan(0);
  });
});
