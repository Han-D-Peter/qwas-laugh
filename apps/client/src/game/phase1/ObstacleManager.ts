import { Container } from 'pixi.js';
import type { MazeData, Vec2 } from '@qwas/shared';
import { CLAW_BOX_SIZE } from '@qwas/shared';
import { drawGhostObstacle } from '../sprites/ghost.js';
import { mulberry32 } from '@qwas/shared';

interface Ghost {
  container: Container;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  cellRow: number;
  cellCol: number;
}

export class ObstacleManager {
  private ghosts: Ghost[] = [];
  private maze: MazeData | null = null;
  private parentContainer: Container;

  constructor(parentContainer: Container) {
    this.parentContainer = parentContainer;
  }

  /**
   * Spawn ghosts for the current level.
   * @param level Current game level
   * @param maze Current maze data
   * @param seed Random seed
   */
  spawn(level: number, maze: MazeData, seed: number) {
    this.clear();
    this.maze = maze;

    // No ghosts before level 9
    if (level < 9) return;

    // Number of ghosts scales with level
    const count = Math.min(Math.floor((level - 7) / 2), 6);
    const rng = mulberry32(seed + 33333);

    for (let i = 0; i < count; i++) {
      // Place ghost in a random cell, away from center
      const centerRow = Math.floor(maze.height / 2);
      const centerCol = Math.floor(maze.width / 2);

      let row: number, col: number;
      do {
        row = Math.floor(rng() * maze.height);
        col = Math.floor(rng() * maze.width);
      } while (Math.abs(row - centerRow) + Math.abs(col - centerCol) < 3);

      const gfx = drawGhostObstacle(i);
      const container = new Container();
      container.addChild(gfx);

      const pos = {
        x: col * maze.cellSize + maze.cellSize / 2,
        y: row * maze.cellSize + maze.cellSize / 2,
      };
      container.x = pos.x;
      container.y = pos.y;
      this.parentContainer.addChild(container);

      // Pick a random valid initial direction
      const dir = this.pickRandomDir(row, col, rng);

      this.ghosts.push({
        container,
        pos,
        dir,
        speed: 1.2 + level * 0.06,
        cellRow: row,
        cellCol: col,
      });
    }
  }

  clear() {
    for (const g of this.ghosts) {
      g.container.destroy();
    }
    this.ghosts = [];
  }

  /**
   * Update ghost positions. Returns true if any ghost collides with claw.
   */
  update(frame: number, clawPos: Vec2): boolean {
    if (!this.maze) return false;
    const cs = this.maze.cellSize;
    let collision = false;

    for (const ghost of this.ghosts) {
      // Move ghost
      ghost.pos.x += ghost.dir.x * ghost.speed;
      ghost.pos.y += ghost.dir.y * ghost.speed;

      // Check if ghost reached center of next cell or hit a wall
      const cellCenterX = ghost.cellCol * cs + cs / 2;
      const cellCenterY = ghost.cellRow * cs + cs / 2;
      const dx = ghost.pos.x - cellCenterX;
      const dy = ghost.pos.y - cellCenterY;

      // When ghost passes through cell center, decide next direction
      if (Math.abs(dx) > cs * 0.45 || Math.abs(dy) > cs * 0.45) {
        // Calculate which cell we'd move into
        const nextCol = ghost.cellCol + Math.sign(ghost.dir.x);
        const nextRow = ghost.cellRow + Math.sign(ghost.dir.y);

        const canPass = this.canMove(ghost.cellRow, ghost.cellCol, ghost.dir);

        if (canPass && nextRow >= 0 && nextRow < this.maze.height && nextCol >= 0 && nextCol < this.maze.width) {
          ghost.cellRow = nextRow;
          ghost.cellCol = nextCol;
        } else {
          // Bounce: reverse and pick a new direction
          ghost.pos.x = cellCenterX;
          ghost.pos.y = cellCenterY;
          const rng = mulberry32(frame * 31 + ghost.cellRow * 7 + ghost.cellCol);
          ghost.dir = this.pickRandomDir(ghost.cellRow, ghost.cellCol, rng);
        }
      }

      // Update visual
      ghost.container.x = ghost.pos.x;
      ghost.container.y = ghost.pos.y;

      // Ghost wobble animation
      ghost.container.children[0].y = Math.sin(frame * 0.08 + ghost.cellRow) * 2;

      // Check collision with claw
      const cDist = Math.abs(ghost.pos.x - clawPos.x) + Math.abs(ghost.pos.y - clawPos.y);
      if (cDist < CLAW_BOX_SIZE) {
        collision = true;
      }
    }

    return collision;
  }

  private canMove(row: number, col: number, dir: Vec2): boolean {
    if (!this.maze) return false;
    const cell = this.maze.cells[row][col];
    if (dir.y < 0 && !cell.walls.north) return true;
    if (dir.y > 0 && !cell.walls.south) return true;
    if (dir.x < 0 && !cell.walls.west) return true;
    if (dir.x > 0 && !cell.walls.east) return true;
    return false;
  }

  private pickRandomDir(row: number, col: number, rng: () => number): Vec2 {
    if (!this.maze) return { x: 1, y: 0 };
    const cell = this.maze.cells[row][col];
    const dirs: Vec2[] = [];
    if (!cell.walls.north) dirs.push({ x: 0, y: -1 });
    if (!cell.walls.south) dirs.push({ x: 0, y: 1 });
    if (!cell.walls.west) dirs.push({ x: -1, y: 0 });
    if (!cell.walls.east) dirs.push({ x: 1, y: 0 });
    if (dirs.length === 0) return { x: 0, y: 0 };
    return dirs[Math.floor(rng() * dirs.length)];
  }
}
