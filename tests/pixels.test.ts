import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGalaxyPixels } from '../src/ui/galaxy-pixels';

interface PixelDraw { x: number; y: number; width: number; height: number; alpha: number; color: string }
interface PixelContext {
  globalAlpha: number;
  fillStyle: string;
  fills: PixelDraw[];
  transforms: number[][];
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

function fixture(dpr = 1) {
  const surfaces = [0, 1, 2, 3, 4].map(layer => `<canvas data-pixels="${layer}"></canvas>`).join('');
  const dom = new JSDOM(`<div id="track">${surfaces}</div>`);
  Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: dpr });
  const track = dom.window.document.getElementById('track')!;
  const contexts = new Map<HTMLCanvasElement, PixelContext>();
  const canvases = [...track.querySelectorAll<HTMLCanvasElement>('canvas[data-pixels]')];
  for (const canvas of canvases) {
    const context: PixelContext = {
      globalAlpha: 1,
      fillStyle: '',
      fills: [],
      transforms: [],
      clearRect() { this.fills.length = 0; },
      fillRect(x, y, width, height) { this.fills.push({ x, y, width, height, alpha: this.globalAlpha, color: this.fillStyle }); },
      setTransform(a, b, c, d, e, f) { this.transforms.push([a, b, c, d, e, f]); },
    };
    contexts.set(canvas, context);
    Object.defineProperty(canvas, 'getContext', { configurable: true, value: (kind: string) => kind === '2d' ? context : null });
  }
  let time = 0;
  const pixels = createGalaxyPixels(track, () => time);
  return {
    dom, track, pixels, canvases,
    setTime(next: number) { time = next; },
    surfaces(layer: number) { return canvases.filter(canvas => canvas.dataset.pixels === String(layer)); },
    context(canvas: HTMLCanvasElement) { return contexts.get(canvas)!; },
    close() { dom.window.close(); },
  };
}

function closeTo(actual: number, expected: number, epsilon = .001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

function frame(ctx: PixelContext) {
  return ctx.fills.map(({ x, y, width, height, color }) => ({ x, y, width, height, color }));
}

test('rasters original pixel counts, coordinates, colors, sizes, and per-layer backing dimensions', () => {
  const f = fixture();
  f.pixels.resize(100);
  f.pixels.paint(0);
  assert.deepEqual([0, 1, 2, 3, 4].map(layer => f.context(f.surfaces(layer)[0]).fills.length), [44, 58, 118, 24, 12]);
  assert.deepEqual([0, 1, 2, 3].map(layer => f.surfaces(layer)[0].width), [200, 200, 200, 200]);
  assert.equal(f.surfaces(4)[0].width, 91);
  assert.deepEqual([0, 1, 2, 3].map(layer => f.surfaces(layer)[0].height), [27, 27, 27, 27]);
  assert.equal(f.surfaces(4)[0].height, 31);
  for (let layer = 0; layer < 5; layer += 1) {
    assert.equal(f.surfaces(layer).length, 1, `one canvas for layer ${layer}`);
  }
  closeTo(f.context(f.surfaces(0)[0]).fills[0].alpha, .18);
  assert.deepEqual(frame(f.context(f.surfaces(0)[0]))[0], {
    x: 0, y: 0, width: 3, height: 3, color: '#bd86ff',
  });
  assert.deepEqual(frame(f.context(f.surfaces(1)[0]))[0], {
    x: 11, y: 15.389999999999999, width: 3, height: 3, color: '#bd86ff',
  });
  assert.deepEqual(frame(f.context(f.surfaces(2)[0]))[0], {
    x: 37, y: 5.13, width: 3, height: 3, color: '#79dcfc',
  });
  const foreground = f.context(f.surfaces(3)[0]).fills[4];
  assert.deepEqual({ x: foreground.x, y: foreground.y, width: foreground.width, height: foreground.height, color: foreground.color }, {
    x: 66, y: 12.15, width: 3, height: 3, color: '#ffc3e5',
  });
  assert.equal(foreground.alpha, .58);
  f.close();
});

test('each track canvas draws matching clipped copies one rail apart', () => {
  const f = fixture();
  f.pixels.resize(303.5);
  f.pixels.setActive(true);
  f.pixels.paint(725);
  for (let layer = 0; layer < 4; layer += 1) {
    const canvas = f.surfaces(layer)[0];
    const fills = f.context(canvas).fills;
    assert.equal(canvas.width, 607);
    assert.equal(fills.length, [44, 58, 118, 24][layer]);
    for (let i = 0; i < fills.length; i += 2) {
      const first = fills[i], second = fills[i + 1];
      assert.ok(first.x + first.width <= 303.5 && first.y + first.height <= 27);
      closeTo(second.x - first.x, 303.5, 1e-9);
      assert.deepEqual(
        { y: second.y, width: second.width, height: second.height, alpha: second.alpha, color: second.color },
        { y: first.y, width: first.width, height: first.height, alpha: first.alpha, color: first.color },
        `matching copies in layer ${layer}, pixel ${i / 2}`,
      );
    }
  }
  assert.equal(f.surfaces(4).length, 1);
  assert.equal(f.context(f.surfaces(4)[0]).fills.length, 12, 'wake remains a single, unreplicated layer');
  f.close();
});

test('twinkle retains per-pixel phase, duration, keyframes, and eased interpolation', () => {
  const f = fixture();
  f.pixels.resize(300);
  f.pixels.setActive(true);
  const ctx = f.context(f.surfaces(0)[0]);
  const alphaAt = (time: number, index: number) => { f.pixels.paint(time); return ctx.fills[index * 2].alpha; };

  closeTo(alphaAt(0, 0), .18);
  assert.equal(alphaAt(0, 1), .58);
  assert.ok(alphaAt(0, 4) > .9, 'the fifth background star keeps its independent negative-delay phase');
  closeTo(alphaAt(315, 0), .59, .002);
  closeTo(alphaAt(630, 0), 1);
  closeTo(alphaAt(855, 0), .73, .002);
  closeTo(alphaAt(1080, 0), .46);
  closeTo(alphaAt(1290, 0), .32, .002);
  closeTo(alphaAt(1500, 0), .18, .001);
  closeTo(alphaAt(1800, 4), .18, .001);
  f.close();
});

test('pause and resume preserve elapsed twinkle time without a phase jump', () => {
  const f = fixture();
  f.pixels.resize(300);
  f.pixels.setActive(true);
  f.setTime(315);
  f.pixels.paint();
  const ctx = f.context(f.surfaces(0)[0]);
  const atPause = ctx.fills[0].alpha;

  f.pixels.setActive(false);
  f.setTime(10_000);
  f.pixels.paint();
  assert.equal(ctx.fills[0].alpha, atPause);
  f.pixels.setActive(true);
  f.pixels.paint();
  assert.equal(ctx.fills[0].alpha, atPause);
  f.setTime(10_315);
  f.pixels.paint();
  closeTo(ctx.fills[0].alpha, 1);
  f.close();
});

test('reduced motion freezes animated pixels at .72 and static pixels at .58', () => {
  const f = fixture();
  f.pixels.resize(300);
  f.pixels.setActive(true);
  f.pixels.setReducedMotion(true);
  const ctx = f.context(f.surfaces(0)[0]);
  assert.equal(f.pixels.animated, false);
  assert.equal(ctx.fills[0].alpha, .72);
  assert.equal(ctx.fills[2].alpha, .58);
  f.setTime(10_000);
  f.pixels.paint();
  assert.equal(ctx.fills[0].alpha, .72);
  f.pixels.setReducedMotion(false);
  assert.equal(f.pixels.animated, true);
  f.close();
});

test('resizes each backing canvas for DPR and keeps CSS-space drawing transforms', () => {
  const f = fixture(2);
  f.pixels.resize(101);
  for (let layer = 0; layer < 5; layer += 1) {
    const canvas = f.surfaces(layer)[0];
    const ctx = f.context(canvas);
    const cssWidth = layer === 4 ? 91 : 202;
    const cssHeight = layer === 4 ? 31 : 27;
    assert.equal(canvas.width, cssWidth * 2);
    assert.equal(canvas.height, cssHeight * 2);
    assert.deepEqual(ctx.transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  }
  const transformCounts = f.canvases.map(canvas => f.context(canvas).transforms.length);
  f.pixels.resize(101);
  assert.deepEqual(f.canvases.map(canvas => f.context(canvas).transforms.length), transformCounts, 'unchanged backing dimensions are not reset');

  Object.defineProperty(f.dom.window, 'devicePixelRatio', { configurable: true, value: 1.5 });
  f.pixels.resize(77);
  for (let layer = 0; layer < 5; layer += 1) {
    const canvas = f.surfaces(layer)[0];
    const ctx = f.context(canvas);
    const cssWidth = layer === 4 ? 91 : 154;
    const cssHeight = layer === 4 ? 31 : 27;
    const bitmapWidth = Math.round(cssWidth * 1.5);
    const bitmapHeight = Math.round(cssHeight * 1.5);
    assert.equal(canvas.width, bitmapWidth);
    assert.equal(canvas.height, bitmapHeight);
    assert.deepEqual(ctx.transforms.at(-1), [bitmapWidth / cssWidth, 0, 0, bitmapHeight / cssHeight, 0, 0]);
  }
  f.close();
});
