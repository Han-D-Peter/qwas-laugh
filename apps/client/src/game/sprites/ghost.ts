import { Graphics } from 'pixi.js';

/**
 * Draw a scary ghost/doll obstacle.
 * Pac-Man ghost style with angry eyes.
 */
export function drawGhostObstacle(colorIndex: number): Graphics {
  const g = new Graphics();
  const colors = [0xe74c3c, 0xff6b9d, 0x8e44ad, 0xe67e22];
  const color = colors[colorIndex % colors.length];

  // Ghost body
  g.moveTo(-12, 4);
  g.lineTo(-12, -4);
  g.arc(0, -4, 12, Math.PI, 0);
  g.lineTo(12, 4);
  // Wavy bottom
  g.lineTo(10, 0);
  g.lineTo(8, 4);
  g.lineTo(4, 0);
  g.lineTo(0, 4);
  g.lineTo(-4, 0);
  g.lineTo(-8, 4);
  g.lineTo(-10, 0);
  g.lineTo(-12, 4);
  g.closePath();
  g.fill({ color });

  // Eyes (white)
  g.circle(-5, -6, 4);
  g.fill({ color: 0xffffff });
  g.circle(5, -6, 4);
  g.fill({ color: 0xffffff });

  // Pupils (angry, looking to the side)
  g.circle(-4, -6, 2.2);
  g.fill({ color: 0x1a1a2e });
  g.circle(6, -6, 2.2);
  g.fill({ color: 0x1a1a2e });

  // Angry eyebrows
  g.setStrokeStyle({ width: 1.5, color: 0x1a1a2e });
  g.moveTo(-8, -10);
  g.lineTo(-3, -9);
  g.stroke();
  g.moveTo(8, -10);
  g.lineTo(3, -9);
  g.stroke();

  return g;
}
