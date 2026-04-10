import React, { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { drawDoll, DOLL_TYPES } from '../game/sprites/doll.js';
import { drawClaw } from '../game/sprites/claw.js';
import { ARCADE } from '../theme/arcade.js';

interface FloatingDoll {
  gfx: Container;
  vx: number;
  bobPhase: number;
  bobAmp: number;
  layer: 'back' | 'mid' | 'front';
}

interface TwinkleStar {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

type ClawState = 'idle' | 'descending' | 'pausing' | 'ascending';

/**
 * Animated arcade-themed background for the lobby. Renders three parallax
 * layers of drifting plushies, twinkling stars, a periodic descending claw,
 * CRT scanlines, and a flashing "INSERT COIN" marquee.
 */
export function LobbyBackground() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    appRef.current = app;

    (async () => {
      try {
        await app.init({
          resizeTo: wrapperRef.current ?? window,
          background: ARCADE.DEEP_NAVY,
          antialias: true,
        });
      } catch {
        await app.init({
          resizeTo: wrapperRef.current ?? window,
          background: ARCADE.DEEP_NAVY,
          antialias: false,
        });
      }
      if (destroyed) {
        try { app.destroy(true); } catch { /* noop */ }
        return;
      }
      if (!wrapperRef.current) {
        try { app.destroy(true); } catch { /* noop */ }
        return;
      }
      wrapperRef.current.appendChild(app.canvas);
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';

      buildAndRun(app);
    })();

    return () => {
      destroyed = true;
      try { app.destroy(true); } catch { /* noop */ }
      appRef.current = null;
    };
  }, []);

  return <div ref={wrapperRef} style={wrapperStyle} />;
}

function buildAndRun(app: Application) {
  const stage = app.stage;
  const bgLayer = new Graphics();
  const starLayer = new Graphics();
  const backDollLayer = new Container();
  const midDollLayer = new Container();
  const frontDollLayer = new Container();
  const clawLayer = new Container();
  const scanlineLayer = new Graphics();
  const marqueeLayer = new Container();

  stage.addChild(bgLayer);
  stage.addChild(starLayer);
  stage.addChild(backDollLayer);
  stage.addChild(midDollLayer);
  stage.addChild(frontDollLayer);
  stage.addChild(clawLayer);
  stage.addChild(scanlineLayer);
  stage.addChild(marqueeLayer);

  const dolls: FloatingDoll[] = [];
  const stars: TwinkleStar[] = [];

  // ─── Background gradient + scanlines (drawn once, redrawn on resize) ───
  const drawBackground = () => {
    const w = app.screen.width;
    const h = app.screen.height;
    bgLayer.clear();
    // Vertical gradient (stacked stripes)
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const color = interpolateColor(ARCADE.DEEP_NAVY, ARCADE.DARK_NAVY, t);
      bgLayer.rect(0, (h / steps) * i, w, h / steps + 1);
      bgLayer.fill({ color });
    }
    // Subtle neon glow bands
    bgLayer.rect(0, h * 0.3, w, 2);
    bgLayer.fill({ color: ARCADE.NEON_PINK, alpha: 0.15 });
    bgLayer.rect(0, h * 0.7, w, 2);
    bgLayer.fill({ color: ARCADE.NEON_CYAN, alpha: 0.15 });

    // Scanlines
    scanlineLayer.clear();
    for (let y = 0; y < h; y += 3) {
      scanlineLayer.rect(0, y, w, 1);
      scanlineLayer.fill({ color: 0x000000, alpha: 0.25 });
    }
  };

  // ─── Spawn twinkling stars ───
  const spawnStars = () => {
    stars.length = 0;
    const count = 60;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * app.screen.width,
        y: Math.random() * app.screen.height,
        size: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.04,
      });
    }
  };

  // ─── Spawn parallax dolls ───
  const spawnDolls = () => {
    dolls.length = 0;
    backDollLayer.removeChildren();
    midDollLayer.removeChildren();
    frontDollLayer.removeChildren();

    const w = app.screen.width;
    const h = app.screen.height;

    const addLayer = (layer: 'back' | 'mid' | 'front', parent: Container, count: number, scale: number, alpha: number, vxBase: number) => {
      for (let i = 0; i < count; i++) {
        const d = drawDoll(Math.floor(Math.random() * DOLL_TYPES.length));
        d.scale.set(scale);
        d.alpha = alpha;
        d.x = Math.random() * w;
        d.y = 40 + Math.random() * (h - 80);
        d.rotation = (Math.random() - 0.5) * 0.4;
        parent.addChild(d);
        dolls.push({
          gfx: d,
          vx: vxBase + Math.random() * 0.3,
          bobPhase: Math.random() * Math.PI * 2,
          bobAmp: 4 + Math.random() * 6,
          layer,
        });
      }
    };

    addLayer('back', backDollLayer, 12, 0.55, 0.45, 0.3);
    addLayer('mid', midDollLayer, 10, 0.8, 0.7, 0.6);
    addLayer('front', frontDollLayer, 5, 1.15, 0.95, 1.0);
  };

  // ─── Descending claw animation ───
  const clawGfx = drawClaw();
  clawGfx.scale.set(2.2);
  clawLayer.addChild(clawGfx);

  let clawState: ClawState = 'idle';
  let clawT = 0;
  let clawIdleTimer = 120; // wait before first descent
  let clawTargetY = 0;

  const resetClaw = () => {
    clawGfx.x = app.screen.width * (0.3 + Math.random() * 0.4);
    clawGfx.y = -80;
    clawTargetY = app.screen.height * (0.35 + Math.random() * 0.25);
  };
  resetClaw();

  // ─── INSERT COIN marquee ───
  const coinText = new Text({
    text: 'INSERT COIN',
    style: {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 14,
      fill: ARCADE.NEON_YELLOW,
      letterSpacing: 3,
    },
  });
  coinText.anchor.set(0.5);
  marqueeLayer.addChild(coinText);

  const titleText = new Text({
    text: 'CLAW  MACHINE',
    style: {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 22,
      fill: ARCADE.NEON_PINK,
      letterSpacing: 4,
    },
  });
  titleText.anchor.set(0.5);
  marqueeLayer.addChild(titleText);

  const updateMarqueePositions = () => {
    const w = app.screen.width;
    const h = app.screen.height;
    coinText.x = w / 2;
    coinText.y = h - 40;
    titleText.x = w / 2;
    titleText.y = 50;
  };

  // ─── Initial setup + resize listener ───
  drawBackground();
  spawnStars();
  spawnDolls();
  updateMarqueePositions();

  const onResize = () => {
    drawBackground();
    spawnStars();
    spawnDolls();
    updateMarqueePositions();
    resetClaw();
  };
  app.renderer.on('resize', onResize);

  // ─── Animation ticker ───
  let frame = 0;
  app.ticker.add(() => {
    frame++;
    const w = app.screen.width;
    const h = app.screen.height;

    // Star twinkle
    starLayer.clear();
    for (const s of stars) {
      s.phase += s.speed;
      const alpha = 0.3 + Math.abs(Math.sin(s.phase)) * 0.7;
      // Cross-shaped star
      starLayer.rect(s.x - s.size, s.y - s.size / 4, s.size * 2, s.size / 2);
      starLayer.fill({ color: 0xffffff, alpha });
      starLayer.rect(s.x - s.size / 4, s.y - s.size, s.size / 2, s.size * 2);
      starLayer.fill({ color: 0xffffff, alpha });
    }

    // Parallax dolls drift
    for (const d of dolls) {
      d.gfx.x -= d.vx;
      d.gfx.y += Math.sin(frame * 0.02 + d.bobPhase) * 0.3;
      d.gfx.rotation = Math.sin(frame * 0.01 + d.bobPhase) * 0.05;
      if (d.gfx.x < -60) {
        d.gfx.x = w + 60;
        d.gfx.y = 40 + Math.random() * (h - 80);
      }
    }

    // Claw state machine
    switch (clawState) {
      case 'idle':
        clawIdleTimer--;
        if (clawIdleTimer <= 0) {
          clawState = 'descending';
          clawT = 0;
        }
        break;
      case 'descending': {
        clawT++;
        const dur = 90;
        const t = Math.min(1, clawT / dur);
        const ease = t * t * (3 - 2 * t);
        clawGfx.y = -80 + (clawTargetY - -80) * ease;
        if (clawT >= dur) {
          clawState = 'pausing';
          clawT = 0;
        }
        break;
      }
      case 'pausing': {
        clawT++;
        if (clawT >= 30) {
          clawState = 'ascending';
          clawT = 0;
        }
        break;
      }
      case 'ascending': {
        clawT++;
        const dur = 90;
        const t = Math.min(1, clawT / dur);
        const ease = t * t;
        clawGfx.y = clawTargetY + (-80 - clawTargetY) * ease;
        if (clawT >= dur) {
          clawState = 'idle';
          clawIdleTimer = 180 + Math.floor(Math.random() * 180);
          resetClaw();
        }
        break;
      }
    }
    // Gentle sway while descending
    if (clawState === 'descending' || clawState === 'ascending') {
      clawGfx.rotation = Math.sin(frame * 0.08) * 0.08;
    }

    // Marquee blink
    const blinkPhase = (frame % 60) / 60;
    coinText.alpha = blinkPhase < 0.5 ? 1 : 0.3;

    // Title gentle pulse
    const pulse = 1 + Math.sin(frame * 0.04) * 0.03;
    titleText.scale.set(pulse);
  });
}

function interpolateColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const wrapperStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  overflow: 'hidden',
};
