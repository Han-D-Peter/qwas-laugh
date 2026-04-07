import { Graphics } from 'pixi.js';

/**
 * Draw a cute claw character with face.
 * Centered at (0, 0).
 */
export function drawClaw(): Graphics {
  const g = new Graphics();

  // Claw body (rounded rectangle)
  g.roundRect(-14, -10, 28, 16, 6);
  g.fill({ color: 0x7ecbf5 });

  // Claw arms (left)
  g.moveTo(-12, 6);
  g.lineTo(-16, 16);
  g.lineTo(-10, 14);
  g.closePath();
  g.fill({ color: 0x6bb8e8 });

  // Claw arms (right)
  g.moveTo(12, 6);
  g.lineTo(16, 16);
  g.lineTo(10, 14);
  g.closePath();
  g.fill({ color: 0x6bb8e8 });

  // Claw arms (center)
  g.moveTo(-2, 6);
  g.lineTo(-3, 18);
  g.lineTo(3, 18);
  g.lineTo(2, 6);
  g.closePath();
  g.fill({ color: 0x6bb8e8 });

  // Eyes
  g.circle(-5, -2, 3);
  g.fill({ color: 0xffffff });
  g.circle(-5, -2, 1.8);
  g.fill({ color: 0x2d2d3d });

  g.circle(5, -2, 3);
  g.fill({ color: 0xffffff });
  g.circle(5, -2, 1.8);
  g.fill({ color: 0x2d2d3d });

  // Eye shine
  g.circle(-4, -3, 0.8);
  g.fill({ color: 0xffffff });
  g.circle(6, -3, 0.8);
  g.fill({ color: 0xffffff });

  // Blush
  g.circle(-9, 1, 2.5);
  g.fill({ color: 0xffb3b3, alpha: 0.5 });
  g.circle(9, 1, 2.5);
  g.fill({ color: 0xffb3b3, alpha: 0.5 });

  // Smile
  g.setStrokeStyle({ width: 1.2, color: 0x4a3f6b });
  g.arc(0, 0, 4, 0.2, Math.PI - 0.2);
  g.stroke();

  // Cable going up
  g.setStrokeStyle({ width: 2.5, color: 0x9b8ec4 });
  g.moveTo(0, -10);
  g.lineTo(0, -25);
  g.stroke();

  return g;
}
