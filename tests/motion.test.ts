import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGalaxyMotion } from '../src/ui/galaxy-motion';

function fixture(initial = 0) {
  const dom = new JSDOM('<div id="track"><div id="runway"><span id="fill"></span><div id="starfield"></div><div id="thumb"><span id="wake"></span><span id="halo"></span><div id="avatar"></div></div></div></div>');
  const get = <T extends HTMLElement>(id: string) => dom.window.document.getElementById(id) as T;
  const track = get('track'), runway = get('runway'), fill = get('fill'), thumb = get('thumb'), avatar = get('avatar');
  const starfield = get('starfield'), wake = get('wake'), halo = get('halo');
  let time = 0, nextId = 1, reads = 0, left = 100, width = 300;
  const frames = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  runway.getBoundingClientRect = () => { reads += 1; return { left, width } as DOMRect; };
  const motion = createGalaxyMotion({ track, runway, thumb, avatar, fill, starfield, wake, halo }, initial, {
    raf: callback => { const id = nextId++; frames.set(id, callback); return id; },
    caf: id => { cancelled.push(id); frames.delete(id); },
    now: () => time,
  });
  return {
    motion, track, thumb, avatar, fill, starfield, wake, halo, frames, cancelled,
    reads: () => reads,
    advance(ms: number) { time += ms; },
    resize(newLeft: number, newWidth: number) { left = newLeft; width = newWidth; motion.refreshBounds(); },
    step(ms = 1000 / 60) {
      time += ms;
      const queued = [...frames.values()];
      frames.clear();
      for (const callback of queued) callback(time);
    },
    close() { motion.dispose(); dom.window.close(); },
  };
}

test('pointer translation is immediate without waiting for an animation frame', () => {
  const f = fixture();
  f.motion.beginDrag();
  f.advance(16);
  f.motion.dragTo(.473);
  assert.equal(f.motion.snapshot().position, .473);
  assert.equal(f.thumb.style.transform, 'translate3d(141.900px,0,0)');
  assert.equal(Number.parseFloat(f.fill.style.width), 47.3);
  assert.equal(f.starfield.style.getPropertyValue('--dsg-pixel-reveal'), '141.900px');
  assert.equal(f.fill.style.opacity, '0.473');
  assert.equal(f.motion.snapshot().lean, 0);
  f.step();
  assert.ok(f.motion.snapshot().lean > 0);
  assert.ok(f.motion.snapshot().lean < 8);
  f.close();
});

test('release integrates a damped spring to the exact option with bounded position', () => {
  const f = fixture(.2);
  f.motion.beginDrag();
  f.advance(16); f.motion.dragTo(.53);
  f.motion.settle(2 / 3);
  assert.equal(f.motion.snapshot().position, .53);
  for (let i = 0; i < 120; i += 1) {
    f.step();
    assert.ok(f.motion.snapshot().position >= 0 && f.motion.snapshot().position <= 1);
  }
  assert.equal(f.motion.snapshot().position, 2 / 3);
  assert.ok(Math.abs(f.motion.snapshot().lean) < .001);
  assert.match(f.thumb.style.transform, /200\.000px/);
  assert.equal(f.frames.size, 0); // CSS pixel flow/twinkle remains; idle JS has stopped.
  f.close();
});

test('direction reversal is smoothed, not an instantaneous angle flip', () => {
  const f = fixture(.3);
  f.motion.beginDrag();
  f.advance(16); f.motion.dragTo(.65); f.step(); f.step();
  const before = f.motion.snapshot().lean;
  f.advance(16); f.motion.dragTo(.4);
  assert.equal(f.motion.snapshot().lean, before);
  for (let i = 0; i < 3; i += 1) { f.advance(16); f.motion.dragTo(.35 - i * .04); f.step(); }
  for (let i = 0; i < 8; i += 1) f.step();
  assert.ok(f.motion.snapshot().lean < before);
  assert.ok(Math.abs(f.motion.snapshot().lean) <= 8.5);
  f.close();
});

test('cancel settles to authoritative value and cannot retain drag momentum', () => {
  const f = fixture(.25);
  f.motion.beginDrag(); f.advance(16); f.motion.dragTo(.94); f.step();
  f.motion.cancel(.25);
  assert.equal(f.motion.snapshot().dragging, false);
  assert.equal(f.motion.snapshot().target, .25);
  for (let i = 0; i < 100; i += 1) f.step();
  assert.equal(f.motion.snapshot().position, .25);
  f.close();
});

test('hidden/offscreen pause cancels the loop and stale callbacks cannot restart it', () => {
  const f = fixture(.4);
  const stale = [...f.frames.values()][0];
  f.motion.settle(.8);
  f.motion.setActive(false);
  assert.equal(f.frames.size, 0);
  assert.equal(f.motion.snapshot().position, .8);
  const before = f.thumb.getAttribute('style');
  stale(200000);
  assert.equal(f.frames.size, 0);
  assert.equal(f.thumb.getAttribute('style'), before);
  f.motion.setActive(true);
  assert.equal(f.frames.size, 1);
  stale(200100);
  assert.equal(f.frames.size, 1);
  f.step(120000);
  assert.ok(Number.isFinite(f.motion.snapshot().position));
  f.close();
});

test('live reduced-motion changes stop animation and preserve direct input', () => {
  const f = fixture(.2);
  f.motion.beginDrag(); f.advance(16); f.motion.dragTo(.65); f.step();
  f.motion.setReducedMotion(true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.avatar.style.transform, 'none');
  f.motion.dragTo(.8);
  assert.equal(f.motion.snapshot().position, .8);
  f.motion.settle(1);
  assert.equal(f.motion.snapshot().position, 1);
  assert.equal(f.frames.size, 0);
  f.motion.setReducedMotion(false);
  assert.equal(f.frames.size, 1);
  f.close();
});

test('geometry reads are bounded to initialization, gesture start and resize', () => {
  const f = fixture();
  assert.equal(f.reads(), 1);
  f.motion.beginDrag();
  assert.equal(f.reads(), 2);
  for (let i = 0; i < 120; i += 1) { f.advance(8); f.motion.dragTo(i / 120); f.step(8); }
  assert.equal(f.reads(), 2);
  f.resize(70, 240);
  assert.equal(f.reads(), 3);
  assert.deepEqual(f.motion.bounds(), { left: 70, width: 240 });
  assert.equal(f.fill.style.transform, ''); // Pixels are never scaled horizontally.
  f.close();
});

test('dispose cancels every scheduled frame and rejects all subsequent writes', () => {
  const f = fixture(.5);
  const stale = [...f.frames.values()][0];
  f.motion.beginDrag(); f.motion.dragTo(.9);
  f.motion.dispose();
  const before = [f.thumb.getAttribute('style'), f.avatar.getAttribute('style'), f.fill.getAttribute('style')];
  stale(500);
  f.motion.dragTo(.2); f.motion.settle(.8); f.motion.setActive(true); f.motion.refreshBounds();
  assert.equal(f.frames.size, 0);
  assert.deepEqual([f.thumb.getAttribute('style'), f.avatar.getAttribute('style'), f.fill.getAttribute('style')], before);
  f.close();
});
