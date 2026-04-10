import { Container, Graphics, Application } from 'pixi.js';
import { ARCADE } from '../../theme/arcade.js';

/**
 * Screen-level visual FX layered on top of the Pixi stage.
 * Not tied to phase logic — engine calls these at transition points.
 */
export class TransitionFX {
  private overlay: Graphics;      // Used for CRT power on/off and full-cover FX
  private glitchOverlay: Graphics; // Rapid random horizontal strips during glitch
  private vignette: Graphics;      // Permanent corner darkening

  private crtActive = false;
  private crtT = 0;
  private crtDuration = 30;
  private crtMode: 'on' | 'off' | 'idle' = 'idle';
  private crtResolve: (() => void) | null = null;

  private glitchFrames = 0;

  // Screen shake
  private shakeFrames = 0;
  private shakeIntensity = 0;
  private shakeTarget: Container | null = null;
  private shakeBaseX = 0;
  private shakeBaseY = 0;

  // Camera zoom
  private zoomTarget: Container | null = null;
  private zoomStartScale = 1;
  private zoomEndScale = 1;
  private zoomFrames = 0;
  private zoomDuration = 0;
  private zoomPivotX = 0;
  private zoomPivotY = 0;

  constructor(
    private app: Application,
    private stage: Container,
  ) {
    this.overlay = new Graphics();
    this.glitchOverlay = new Graphics();
    this.vignette = new Graphics();
    stage.addChild(this.vignette);
    stage.addChild(this.glitchOverlay);
    stage.addChild(this.overlay);

    this.drawVignette();
  }

  private get screenW() { return this.app.screen.width; }
  private get screenH() { return this.app.screen.height; }

  private drawVignette() {
    const w = this.screenW;
    const h = this.screenH;
    this.vignette.clear();
    // Approximate radial vignette with 6 stacked rects of increasing alpha from edges
    const layers = 6;
    for (let i = 0; i < layers; i++) {
      const inset = (i / layers) * Math.min(w, h) * 0.45;
      const alpha = 0.04;
      this.vignette.rect(0, 0, w, inset);                         // top
      this.vignette.fill({ color: 0x000000, alpha });
      this.vignette.rect(0, h - inset, w, inset);                 // bottom
      this.vignette.fill({ color: 0x000000, alpha });
      this.vignette.rect(0, 0, inset, h);                         // left
      this.vignette.fill({ color: 0x000000, alpha });
      this.vignette.rect(w - inset, 0, inset, h);                 // right
      this.vignette.fill({ color: 0x000000, alpha });
    }
  }

  /** Resize — call when canvas dimensions change. */
  resize() {
    this.drawVignette();
  }

  /**
   * CRT power-off: screen squishes to a horizontal line then a dot.
   * Returns a promise that resolves when complete.
   */
  crtPowerOff(durationFrames = 24): Promise<void> {
    return new Promise((resolve) => {
      this.crtActive = true;
      this.crtT = 0;
      this.crtDuration = durationFrames;
      this.crtMode = 'off';
      this.crtResolve = resolve;
    });
  }

  /**
   * CRT power-on: dot expands to a horizontal line then full screen.
   */
  crtPowerOn(durationFrames = 24): Promise<void> {
    return new Promise((resolve) => {
      this.crtActive = true;
      this.crtT = 0;
      this.crtDuration = durationFrames;
      this.crtMode = 'on';
      this.crtResolve = resolve;
    });
  }

  /** Begin a screen shake. Intensity in px. */
  screenShake(durationFrames: number, intensity: number, target?: Container) {
    this.shakeFrames = durationFrames;
    this.shakeIntensity = intensity;
    this.shakeTarget = target ?? this.stage;
    this.shakeBaseX = this.shakeTarget.x;
    this.shakeBaseY = this.shakeTarget.y;
  }

  /** Begin a glitch pass — random horizontal strips displaced. */
  glitchLines(durationFrames: number) {
    this.glitchFrames = Math.max(this.glitchFrames, durationFrames);
  }

  /**
   * Tween a container's scale from `from` to `to` over `durationFrames`.
   * Uses the container's current pivot; suitable for the world container.
   */
  cameraZoom(target: Container, from: number, to: number, durationFrames: number) {
    this.zoomTarget = target;
    this.zoomStartScale = from;
    this.zoomEndScale = to;
    this.zoomFrames = 0;
    this.zoomDuration = Math.max(1, durationFrames);
    // Anchor the zoom around the current screen center
    this.zoomPivotX = this.screenW / 2;
    this.zoomPivotY = this.screenH / 2;
    target.scale.set(from);
  }

  /**
   * Call every frame from the main loop. Updates overlay states.
   */
  update() {
    // CRT transition
    if (this.crtActive) {
      this.crtT++;
      const t = Math.min(1, this.crtT / this.crtDuration);
      const ease = t * t * (3 - 2 * t); // smoothstep
      this.overlay.clear();
      const w = this.screenW;
      const h = this.screenH;

      if (this.crtMode === 'off') {
        // Stage 1 (0..0.5): vertical collapse, cover top/bottom with black
        // Stage 2 (0.5..1): horizontal collapse, cover left/right with black
        if (ease < 0.5) {
          const p = ease / 0.5;
          const coverH = (h / 2) * p;
          this.overlay.rect(0, 0, w, coverH);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          this.overlay.rect(0, h - coverH, w, coverH);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
        } else {
          // Keep horizontal bands fully closed
          this.overlay.rect(0, 0, w, h / 2);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          this.overlay.rect(0, h / 2, w, h / 2);
          this.overlay.fill({ color: 0x000000, alpha: 1 });

          const p = (ease - 0.5) / 0.5;
          const coverW = (w / 2) * p;
          // Leave a glowing center line that shrinks
          const lineW = Math.max(2, (1 - p) * w * 0.6);
          const lineH = Math.max(1, (1 - p) * 4);
          this.overlay.rect(w / 2 - lineW / 2, h / 2 - lineH / 2, lineW, lineH);
          this.overlay.fill({ color: ARCADE.NEON_CYAN, alpha: 0.95 });
          // Side covers
          this.overlay.rect(0, 0, coverW, h);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          this.overlay.rect(w - coverW, 0, coverW, h);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
        }
      } else if (this.crtMode === 'on') {
        // Reverse: start as black cover + tiny bright line, expand outward
        if (ease < 0.5) {
          const p = ease / 0.5;
          // Black sides retract
          const coverW = (1 - p) * (w / 2);
          this.overlay.rect(0, 0, coverW, h);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          this.overlay.rect(w - coverW, 0, coverW, h);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          // Horizontal bands still covering top/bottom
          this.overlay.rect(0, 0, w, h / 2);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          this.overlay.rect(0, h / 2, w, h / 2);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          // Bright expanding line
          const lineW = p * w;
          const lineH = 2 + p * 4;
          this.overlay.rect(w / 2 - lineW / 2, h / 2 - lineH / 2, lineW, lineH);
          this.overlay.fill({ color: ARCADE.NEON_CYAN, alpha: 0.95 });
        } else {
          const p = (ease - 0.5) / 0.5;
          // Horizontal bands retract
          const bandH = (1 - p) * (h / 2);
          this.overlay.rect(0, 0, w, bandH);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          this.overlay.rect(0, h - bandH, w, bandH);
          this.overlay.fill({ color: 0x000000, alpha: 1 });
          // Bright line fades out
          const lineAlpha = (1 - p) * 0.7;
          this.overlay.rect(0, h / 2 - 2, w, 4);
          this.overlay.fill({ color: ARCADE.NEON_CYAN, alpha: lineAlpha });
        }
      }

      if (this.crtT >= this.crtDuration) {
        this.crtActive = false;
        this.overlay.clear();
        const resolve = this.crtResolve;
        this.crtResolve = null;
        this.crtMode = 'idle';
        if (resolve) resolve();
      }
    }

    // Glitch lines
    if (this.glitchFrames > 0) {
      this.glitchFrames--;
      this.glitchOverlay.clear();
      const w = this.screenW;
      const h = this.screenH;
      const stripCount = 4 + Math.floor(Math.random() * 5);
      for (let i = 0; i < stripCount; i++) {
        const y = Math.random() * h;
        const stripH = 2 + Math.random() * 10;
        const offset = (Math.random() - 0.5) * 30;
        const color = Math.random() < 0.5 ? ARCADE.NEON_PINK : ARCADE.NEON_CYAN;
        this.glitchOverlay.rect(offset, y, w, stripH);
        this.glitchOverlay.fill({ color, alpha: 0.18 });
      }
      if (this.glitchFrames === 0) this.glitchOverlay.clear();
    }

    // Camera zoom tween
    if (this.zoomTarget && this.zoomFrames < this.zoomDuration) {
      this.zoomFrames++;
      const t = Math.min(1, this.zoomFrames / this.zoomDuration);
      const ease = t * t * (3 - 2 * t); // smoothstep
      const s = this.zoomStartScale + (this.zoomEndScale - this.zoomStartScale) * ease;
      this.zoomTarget.scale.set(s);
      if (this.zoomFrames >= this.zoomDuration) {
        this.zoomTarget.scale.set(this.zoomEndScale);
        this.zoomTarget = null;
      }
    }

    // Screen shake
    if (this.shakeFrames > 0 && this.shakeTarget) {
      this.shakeFrames--;
      const t = this.shakeFrames / Math.max(1, this.shakeFrames + 1);
      // Decaying shake
      const decay = Math.max(0, this.shakeFrames) / 30;
      const intensity = this.shakeIntensity * Math.min(1, decay + 0.3);
      this.shakeTarget.x = this.shakeBaseX + (Math.random() - 0.5) * intensity * 2;
      this.shakeTarget.y = this.shakeBaseY + (Math.random() - 0.5) * intensity * 2;
      if (this.shakeFrames === 0) {
        this.shakeTarget.x = this.shakeBaseX;
        this.shakeTarget.y = this.shakeBaseY;
        this.shakeTarget = null;
      }
      // consume t to avoid unused var
      void t;
    }
  }

  /** Instantly cover screen with color for N frames (not a gradient). */
  coverScreen(color: number, alpha = 1) {
    this.overlay.clear();
    this.overlay.rect(0, 0, this.screenW, this.screenH);
    this.overlay.fill({ color, alpha });
  }

  clearOverlay() {
    this.overlay.clear();
  }

  destroy() {
    this.overlay.destroy();
    this.glitchOverlay.destroy();
    this.vignette.destroy();
  }
}
