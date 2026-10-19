interface Pixel {
  x: number; y: number; color: string; duration: number; delay: number;
}
const colors = ['#bd86ff', '#79dcfc', '#fe9acf'];
const background = Array.from({ length: 110 }, (_, i): Pixel => ({
  x: i * 37 % 100 / 100, y: i * 19 % 100 / 100, color: colors[i % 3],
  duration: 1500 + (i * 7 % 16) * 100, delay: (i * 23 % 41) * 100,
}));
const foreground = Array.from({ length: 12 }, (_, i): Pixel => ({
  x: (i * 29 + 8) % 100 / 100, y: (i * 17 + 11) % 100 / 100,
  color: ['#d4b2ff', '#b0ecff', '#ffc3e5'][i % 3],
  duration: 1600 + (i * 3 % 12) * 100, delay: (i * 13 % 29) * 100,
}));
const layers = [
  background.filter((_, i) => i % 5 === 0),
  background.filter((_, i) => i % 5 !== 0 && i % 3 === 0),
  background.filter((_, i) => i % 5 !== 0 && i % 3 !== 0),
  foreground, foreground,
];
// Sample the original CSS ease-in-out once; every star keeps its own phase and duration.
const twinkle = Float32Array.from({ length: 1025 }, (_, i) => {
  const phase = i / 1024;
  const [start, end, from, to] = phase < .42 ? [0, .42, .18, 1]
    : phase < .72 ? [.42, .72, 1, .46] : [.72, 1, .46, .18];
  const x = (phase - start) / (end - start);
  let low = 0, high = 1, t = x;
  for (let step = 0; step < 16; step += 1) {
    t = (low + high) / 2;
    const a = 1 - t;
    const bx = 3 * a * a * t * .42 + 3 * a * t * t * .58 + t * t * t;
    if (bx < x) low = t; else high = t;
  }
  return from + (to - from) * (3 * (1 - t) * t * t + t * t * t);
});

/** Rasterize the same squares in five layers, retaining CSS flow, depth and clipping. */
export function createGalaxyPixels(track: HTMLElement, now: () => number) {
  const groups = layers.map((pixels, layer) => ({
    pixels, layer, width: 0, height: layer === 4 ? 28 : 27,
    surfaces: [...track.querySelectorAll<HTMLCanvasElement>(`canvas[data-pixels="${layer}"]`)]
      .flatMap(canvas => { const ctx = canvas.getContext('2d'); return ctx ? [{ canvas, ctx }] : []; }),
  }));
  let active = false, reduced = false, elapsed = 0, started = now();

  function paint(time = now()) {
    const age = elapsed + (active && !reduced ? Math.max(0, time - started) : 0);
    for (const { pixels, layer, surfaces, width, height } of groups) {
      if (!surfaces.length || !width) continue;
      for (const { ctx } of surfaces) ctx.clearRect(0, 0, layer === 4 ? width + 3 : width * 2, height + 3);
      for (let i = 0; i < pixels.length; i += 1) {
        const pixel = pixels[i];
        let alpha = .58;
        if (i % 4 === 0) {
          const phase = (age + pixel.delay) % pixel.duration / pixel.duration * 1024;
          const index = Math.floor(phase), fraction = phase - index;
          alpha = reduced ? .72 : twinkle[index] + (twinkle[index + 1] - twinkle[index]) * fraction;
        }
        const size = layer < 3 ? (i % 5 === 4 ? 2 : 3) : layer === 3 && i % 3 === 2 ? 3 : 2;
        const x = pixel.x * width, y = pixel.y * height;
        for (const { ctx } of surfaces) {
          ctx.globalAlpha = alpha; ctx.fillStyle = pixel.color;
          if (layer === 4) ctx.fillRect(x, y, size, size);
          else {
            const w = Math.min(size, width - x), h = Math.min(size, height - y);
            ctx.fillRect(x, y, w, h);
            ctx.fillRect(x + width, y, w, h);
          }
        }
      }
    }
  }
  return {
    paint,
    get animated() { return active && !reduced && groups.some(group => group.surfaces.length > 0); },
    resize(railWidth: number) {
      const ratio = track.ownerDocument.defaultView!.devicePixelRatio || 1;
      for (const group of groups) {
        group.width = group.layer === 4 ? 88 : railWidth;
        for (const { canvas, ctx } of group.surfaces) {
          const cssWidth = group.layer === 4 ? group.width + 3 : group.width * 2;
          const cssHeight = group.height + (group.layer === 4 ? 3 : 0);
          const width = Math.round(cssWidth * ratio), height = Math.round(cssHeight * ratio);
          if (canvas.width === width && canvas.height === height) continue;
          canvas.width = width; canvas.height = height;
          ctx.setTransform(width / cssWidth, 0, 0, height / cssHeight, 0, 0);
        }
      }
      paint();
    },
    setActive(next: boolean) {
      if (active === next) return;
      if (active && !reduced) elapsed += Math.max(0, now() - started);
      active = next; started = now();
    },
    setReducedMotion(next: boolean) {
      if (reduced === next) return;
      reduced = next; elapsed = 0; started = now(); paint();
    },
  };
}
