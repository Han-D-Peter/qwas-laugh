/**
 * Retro arcade visual tokens — shared across Pixi scenes and CSS UI.
 *
 * Colors come in two forms:
 *  - 0x-prefixed numbers for Pixi Graphics
 *  - CSS hex strings for React inline styles / text-shadow
 */

export const ARCADE = {
  // Neon palette (Pixi number form)
  NEON_PINK: 0xff2e93,
  NEON_CYAN: 0x00e5ff,
  NEON_PURPLE: 0xb46cff,
  NEON_GREEN: 0x4dff7c,
  NEON_YELLOW: 0xffd23f,
  NEON_AMBER: 0xffb000,
  NEON_WHITE: 0xffffff,

  // Deep background stack
  DEEP_NAVY: 0x0a0e2c,
  DARK_NAVY: 0x1a1a3d,
  MID_NAVY: 0x2d2d5c,

  // CSS string equivalents (for inline styles, text-shadow, borders)
  CSS_NEON_PINK: '#ff2e93',
  CSS_NEON_CYAN: '#00e5ff',
  CSS_NEON_PURPLE: '#b46cff',
  CSS_NEON_GREEN: '#4dff7c',
  CSS_NEON_YELLOW: '#ffd23f',
  CSS_NEON_AMBER: '#ffb000',
  CSS_DEEP_NAVY: '#0a0e2c',
  CSS_DARK_NAVY: '#1a1a3d',

  // Reusable text-shadow glow stacks
  GLOW_PINK:  '0 0 4px #ff2e93, 0 0 10px #ff2e93, 0 0 20px #ff2e93',
  GLOW_CYAN:  '0 0 4px #00e5ff, 0 0 10px #00e5ff, 0 0 20px #00e5ff',
  GLOW_YELLOW:'0 0 4px #ffd23f, 0 0 10px #ffd23f, 0 0 20px #ffd23f',
  GLOW_GREEN: '0 0 4px #4dff7c, 0 0 10px #4dff7c, 0 0 20px #4dff7c',
  GLOW_WHITE: '0 0 4px #ffffff, 0 0 10px #ffffff, 0 0 20px #ffffff',
  GLOW_RED:   '0 0 4px #ff2e93, 0 0 10px #ff2e93, 0 0 20px #ff0040',

  // Box glow for card borders
  BOX_GLOW_CYAN: '0 0 20px #00e5ff, 0 0 40px rgba(0,229,255,0.5), inset 0 0 15px rgba(0,229,255,0.1)',
  BOX_GLOW_PINK: '0 0 20px #ff2e93, 0 0 40px rgba(255,46,147,0.5), inset 0 0 15px rgba(255,46,147,0.1)',

  // Pixel font stack. Press Start 2P has no Korean glyphs, so we fall back
  // to system fonts for Korean text.
  PIXEL_FONT: "'Press Start 2P', 'Courier New', monospace",
  SYSTEM_FONT: "'Segoe UI', system-ui, -apple-system, sans-serif",
} as const;

/**
 * Pick a neon palette entry for procedural variation.
 */
export const NEON_PALETTE = [
  ARCADE.NEON_PINK,
  ARCADE.NEON_CYAN,
  ARCADE.NEON_PURPLE,
  ARCADE.NEON_GREEN,
  ARCADE.NEON_YELLOW,
  ARCADE.NEON_AMBER,
] as const;
