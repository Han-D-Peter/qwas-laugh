import { Container, Graphics } from 'pixi.js';
import { NEON_PALETTE, ARCADE } from '../../theme/arcade.js';

type ParticleKind = 'rect' | 'star' | 'circle' | 'line';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
  gravity: number;
  kind: ParticleKind;
  alpha: number;
}

/**
 * Lightweight particle system for arcade FX (confetti, sparkles, stars, flash).
 * Re-draws a single Graphics object each frame — suitable for ~200 particles at 60fps.
 */
export class ParticleSystem {
  private particles: Particle[] = [];
  private graphics: Graphics;
  // Fullscreen flash overlay drawn separately so it can cover everything
  private flashGraphics: Graphics;
  private flashLife = 0;
  private flashMax = 1;
  private flashColor = 0xffffff;
  private flashAlpha = 0;

  constructor(container: Container) {
    this.graphics = new Graphics();
    this.flashGraphics = new Graphics();
    container.addChild(this.graphics);
    container.addChild(this.flashGraphics);
  }

  /** Neon confetti burst falling with gravity. */
  emitConfetti(x: number, y: number, count = 60) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 120 + Math.random() * 60,
        maxLife: 180,
        color: NEON_PALETTE[Math.floor(Math.random() * NEON_PALETTE.length)],
        size: 3 + Math.random() * 4,
        gravity: 0.18,
        kind: 'rect',
        alpha: 1,
      });
    }
  }

  /** Small sparkle points that twinkle and fade fast. */
  emitSparkles(x: number, y: number, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: 0,
        vr: 0,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: [ARCADE.NEON_YELLOW, ARCADE.NEON_WHITE, ARCADE.NEON_CYAN][Math.floor(Math.random() * 3)],
        size: 2 + Math.random() * 2,
        gravity: 0,
        kind: 'star',
        alpha: 1,
      });
    }
  }

  /** Outward-flying stars for big celebrations. */
  emitStars(x: number, y: number, count = 15) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        life: 80 + Math.random() * 40,
        maxLife: 120,
        color: NEON_PALETTE[Math.floor(Math.random() * NEON_PALETTE.length)],
        size: 4 + Math.random() * 3,
        gravity: 0.05,
        kind: 'star',
        alpha: 1,
      });
    }
  }

  /** Fast radial line streaks. */
  emitSparks(x: number, y: number, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 4;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: angle,
        vr: 0,
        life: 20,
        maxLife: 20,
        color: ARCADE.NEON_YELLOW,
        size: 8,
        gravity: 0,
        kind: 'line',
        alpha: 1,
      });
    }
  }

  /** Full-screen color flash. Pass screen dimensions. */
  emitFlash(screenW: number, screenH: number, color: number = ARCADE.NEON_WHITE, durationFrames = 10) {
    this.flashColor = color;
    this.flashLife = durationFrames;
    this.flashMax = durationFrames;
    this.flashAlpha = 0.85;
    this.flashGraphics.clear();
    this.flashGraphics.rect(0, 0, screenW, screenH);
    this.flashGraphics.fill({ color, alpha: this.flashAlpha });
  }

  /** Advance physics and redraw. Call once per frame. */
  update() {
    // Flash fade
    if (this.flashLife > 0) {
      this.flashLife--;
      const t = this.flashLife / this.flashMax;
      this.flashAlpha = 0.85 * t;
      this.flashGraphics.alpha = this.flashAlpha;
      if (this.flashLife <= 0) {
        this.flashGraphics.clear();
        this.flashGraphics.alpha = 0;
      }
    }

    // Particle physics
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      p.alpha = Math.min(1, p.life / (p.maxLife * 0.5));
    }

    // Redraw
    const g = this.graphics;
    g.clear();
    for (const p of this.particles) {
      if (p.kind === 'rect') {
        // Rotate around particle center — approximate with 4-pt poly
        const hs = p.size / 2;
        const cos = Math.cos(p.rotation);
        const sin = Math.sin(p.rotation);
        const pts: [number, number][] = [
          [-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs],
        ];
        const rotated = pts.map(([x, y]) => [p.x + x * cos - y * sin, p.y + x * sin + y * cos] as [number, number]);
        g.moveTo(rotated[0][0], rotated[0][1]);
        for (let k = 1; k < rotated.length; k++) g.lineTo(rotated[k][0], rotated[k][1]);
        g.closePath();
        g.fill({ color: p.color, alpha: p.alpha });
      } else if (p.kind === 'star') {
        // 4-pointed pixel star: two crossed rects
        const s = p.size;
        g.rect(p.x - s, p.y - s * 0.25, s * 2, s * 0.5);
        g.fill({ color: p.color, alpha: p.alpha });
        g.rect(p.x - s * 0.25, p.y - s, s * 0.5, s * 2);
        g.fill({ color: p.color, alpha: p.alpha });
      } else if (p.kind === 'circle') {
        g.circle(p.x, p.y, p.size);
        g.fill({ color: p.color, alpha: p.alpha });
      } else if (p.kind === 'line') {
        // Spark streak
        const len = p.size;
        const dx = Math.cos(p.rotation) * len;
        const dy = Math.sin(p.rotation) * len;
        g.setStrokeStyle({ width: 2, color: p.color, alpha: p.alpha });
        g.moveTo(p.x - dx, p.y - dy);
        g.lineTo(p.x + dx, p.y + dy);
        g.stroke();
      }
    }
  }

  isActive(): boolean {
    return this.particles.length > 0 || this.flashLife > 0;
  }

  clear() {
    this.particles.length = 0;
    this.graphics.clear();
    this.flashGraphics.clear();
    this.flashLife = 0;
    this.flashAlpha = 0;
  }

  destroy() {
    this.clear();
    this.graphics.destroy();
    this.flashGraphics.destroy();
  }
}
