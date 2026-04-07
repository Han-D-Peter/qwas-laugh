import { Graphics } from 'pixi.js';

interface DollType {
  name: string;
  bodyColor: number;
  earColor: number;
  drawShape: (g: Graphics) => void;
}

export const DOLL_TYPES: DollType[] = [
  // Bear
  {
    name: 'bear', bodyColor: 0xc4956a, earColor: 0xa87d5a,
    drawShape: (g) => {
      // Ears
      g.circle(-9, -12, 5);
      g.fill({ color: 0xa87d5a });
      g.circle(-9, -12, 3);
      g.fill({ color: 0xd4a98a });
      g.circle(9, -12, 5);
      g.fill({ color: 0xa87d5a });
      g.circle(9, -12, 3);
      g.fill({ color: 0xd4a98a });
      // Body
      g.circle(0, 0, 12);
      g.fill({ color: 0xc4956a });
      // Tummy
      g.circle(0, 3, 7);
      g.fill({ color: 0xdebea0 });
    },
  },
  // Bunny
  {
    name: 'bunny', bodyColor: 0xf5e6f0, earColor: 0xf0c0d8,
    drawShape: (g) => {
      // Long ears
      g.roundRect(-8, -26, 6, 18, 3);
      g.fill({ color: 0xf5e6f0 });
      g.roundRect(-6, -24, 2, 14, 1);
      g.fill({ color: 0xf0c0d8 });
      g.roundRect(2, -26, 6, 18, 3);
      g.fill({ color: 0xf5e6f0 });
      g.roundRect(4, -24, 2, 14, 1);
      g.fill({ color: 0xf0c0d8 });
      // Body
      g.circle(0, 0, 11);
      g.fill({ color: 0xf5e6f0 });
    },
  },
  // Cat
  {
    name: 'cat', bodyColor: 0xf5d480, earColor: 0xe8c060,
    drawShape: (g) => {
      // Triangle ears
      g.moveTo(-10, -12); g.lineTo(-6, -4); g.lineTo(-2, -12); g.closePath();
      g.fill({ color: 0xf5d480 });
      g.moveTo(2, -12); g.lineTo(6, -4); g.lineTo(10, -12); g.closePath();
      g.fill({ color: 0xf5d480 });
      // Inner ears
      g.moveTo(-8, -11); g.lineTo(-6, -6); g.lineTo(-4, -11); g.closePath();
      g.fill({ color: 0xf0a8b8 });
      g.moveTo(4, -11); g.lineTo(6, -6); g.lineTo(8, -11); g.closePath();
      g.fill({ color: 0xf0a8b8 });
      // Body
      g.circle(0, 0, 11);
      g.fill({ color: 0xf5d480 });
    },
  },
  // Dog
  {
    name: 'dog', bodyColor: 0xe8c890, earColor: 0xc4956a,
    drawShape: (g) => {
      // Floppy ears
      g.ellipse(-10, -4, 5, 8);
      g.fill({ color: 0xc4956a });
      g.ellipse(10, -4, 5, 8);
      g.fill({ color: 0xc4956a });
      // Body
      g.circle(0, 0, 11);
      g.fill({ color: 0xe8c890 });
      // Snout
      g.ellipse(0, 3, 5, 3.5);
      g.fill({ color: 0xf5e0c8 });
    },
  },
  // Penguin
  {
    name: 'penguin', bodyColor: 0x3d3d5c, earColor: 0x3d3d5c,
    drawShape: (g) => {
      // Body
      g.circle(0, 0, 12);
      g.fill({ color: 0x3d3d5c });
      // White belly
      g.ellipse(0, 2, 8, 10);
      g.fill({ color: 0xf5f0ff });
      // Beak
      g.moveTo(-3, 0); g.lineTo(0, 4); g.lineTo(3, 0); g.closePath();
      g.fill({ color: 0xf5a030 });
    },
  },
  // Frog
  {
    name: 'frog', bodyColor: 0x7ec880, earColor: 0x5ca85e,
    drawShape: (g) => {
      // Body
      g.circle(0, 0, 11);
      g.fill({ color: 0x7ec880 });
      // Big eye bumps
      g.circle(-6, -10, 5);
      g.fill({ color: 0x7ec880 });
      g.circle(6, -10, 5);
      g.fill({ color: 0x7ec880 });
    },
  },
];

/**
 * Draw a cute doll character.
 * Centered at (0, 0).
 */
export function drawDoll(typeIndex: number): Graphics {
  const g = new Graphics();
  const type = DOLL_TYPES[typeIndex % DOLL_TYPES.length];

  // Draw the specific animal shape
  type.drawShape(g);

  // Common face features
  // Eyes
  g.circle(-4, -3, 2.5);
  g.fill({ color: 0xffffff });
  g.circle(-4, -3, 1.5);
  g.fill({ color: 0x2d2d3d });

  g.circle(4, -3, 2.5);
  g.fill({ color: 0xffffff });
  g.circle(4, -3, 1.5);
  g.fill({ color: 0x2d2d3d });

  // Eye shine
  g.circle(-3.2, -3.8, 0.7);
  g.fill({ color: 0xffffff });
  g.circle(4.8, -3.8, 0.7);
  g.fill({ color: 0xffffff });

  // Blush
  g.circle(-8, 1, 2);
  g.fill({ color: 0xffb3b3, alpha: 0.4 });
  g.circle(8, 1, 2);
  g.fill({ color: 0xffb3b3, alpha: 0.4 });

  // Smile
  g.setStrokeStyle({ width: 1, color: 0x4a3f6b });
  g.arc(0, 1, 3, 0.2, Math.PI - 0.2);
  g.stroke();

  return g;
}
