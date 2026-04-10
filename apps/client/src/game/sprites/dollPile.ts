import { Container } from 'pixi.js';
import { drawDoll, DOLL_TYPES } from './doll.js';

/**
 * Seeded pseudo-random generator — Mulberry32. Keeps pile generation
 * deterministic per level so the layout is stable on rebuild.
 */
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
 * Build a scattered pile of small dolls filling a given rectangle.
 * Used as decorative background — evokes "plushies packed in the machine".
 *
 * The returned Container holds the pile — caller positions it as needed.
 */
export function buildDollPile(
  width: number,
  height: number,
  seed: number,
  density: number = 90,
): Container {
  const container = new Container();
  const rand = mulberry32(seed);

  for (let i = 0; i < density; i++) {
    const doll = drawDoll(Math.floor(rand() * DOLL_TYPES.length));
    doll.x = rand() * width;
    doll.y = rand() * height;
    // Small scale for background fill
    const scale = 0.35 + rand() * 0.25;
    doll.scale.set(scale);
    doll.rotation = (rand() - 0.5) * 0.6;
    doll.alpha = 0.28 + rand() * 0.22;
    container.addChild(doll);
  }

  return container;
}

/**
 * Build a column of stacked dolls — used to decorate Phase 2 side walls.
 * Dolls stack vertically, slightly overlapping like plushies jammed in a chute.
 */
export function buildDollColumn(
  height: number,
  seed: number,
  spacing: number = 42,
): Container {
  const container = new Container();
  const rand = mulberry32(seed);

  const count = Math.ceil(height / spacing);
  for (let i = 0; i < count; i++) {
    const doll = drawDoll(Math.floor(rand() * DOLL_TYPES.length));
    doll.y = i * spacing + rand() * 6 - 3;
    doll.x = (rand() - 0.5) * 6;
    const scale = 0.7 + rand() * 0.2;
    doll.scale.set(scale);
    doll.rotation = (rand() - 0.5) * 0.4;
    doll.alpha = 0.85;
    container.addChild(doll);
  }

  return container;
}
