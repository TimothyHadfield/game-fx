// Node tests for fx.js settings + sound gating. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- fake browser bits (set before loading fx.js) ----
const mem = new Map();
let storageBlocked = false, reduceMotion = false;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() {
    if (storageBlocked) throw new Error('SecurityError: storage blocked');
    return { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  },
});
globalThis.matchMedia = q => ({ matches: q.includes('reduce') && reduceMotion });

// Fake Web Audio: counts nodes and records the latest stop time of every source.
const audio = { nodes: 0, maxStop: 0, starts: 0, clock: 0 };
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = extra => { audio.nodes++; return Object.assign({ connect() {}, disconnect() {} }, extra); };
const source = () => node({ start() { audio.starts++; }, stop(t) { audio.maxStop = Math.max(audio.maxStop, t); } });
class FakeAC {
  get currentTime() { return audio.clock; }
  constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
  createGain() { return node({ gain: param() }); }
  createOscillator() { return Object.assign(source(), { type: 'sine', frequency: param() }); }
  createBufferSource() { return Object.assign(source(), { buffer: null, loop: false }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); }
  createStereoPanner() { return node({ pan: param() }); }
  createDynamicsCompressor() { return node({}); }
  createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
globalThis.AudioContext = FakeAC;

await import('../fx.js');
const FX = globalThis.FX;
const fresh = (game, extra) => { mem.clear(); return FX.init(Object.assign({ game, clicks: false }, extra)); };
const playCount = (name, o) => { audio.clock += 1; const before = audio.nodes; const ok = FX.play(name, o); return { ok, made: audio.nodes - before }; };

test('defaults', () => {
  storageBlocked = false; reduceMotion = false;
  fresh('t-defaults');
  assert.deepEqual(FX.settings, { sound: true, volume: 60, moves: true, alerts: true, ui: true, celebrations: true, animations: true, animSpeed: 'normal' });
});

test('settings persist per game key and reload', () => {
  storageBlocked = false; reduceMotion = false;
  fresh('risk');
  FX.set('volume', 35); FX.set('moves', false); FX.set('animSpeed', 'fast');
  assert.ok(mem.has('fx:risk'));
  FX.init({ game: 'hearts', clicks: false });
  assert.equal(FX.settings.volume, 60, 'another game has its own settings');
  FX.init({ game: 'risk', clicks: false });
  assert.equal(FX.settings.volume, 35); assert.equal(FX.settings.moves, false); assert.equal(FX.settings.animSpeed, 'fast');
  FX.init({ game: 'risk', settingsKey: 'custom-key', clicks: false });
  assert.equal(FX.settings.volume, 60, 'settingsKey overrides the key');
});

test('bad values are cleaned', () => {
  storageBlocked = false;
  fresh('t-clean');
  FX.set('volume', 250); assert.equal(FX.settings.volume, 100);
  FX.set('volume', -5); assert.equal(FX.settings.volume, 0);
  FX.set('animSpeed', 'turbo'); assert.equal(FX.settings.animSpeed, 'normal');
  FX.set('sound', 'yes'); assert.equal(FX.settings.sound, true, 'non-boolean ignored');
  assert.equal(FX.set('nope', 1), false);
  mem.set('fx:t-junk', '{not json');
  FX.init({ game: 't-junk', clicks: false });
  assert.equal(FX.settings.volume, 60, 'corrupt storage falls back to defaults');
});

test('storage blocked: works in memory, never throws', () => {
  storageBlocked = true;
  assert.doesNotThrow(() => FX.init({ game: 't-blocked', clicks: false }));
  assert.equal(FX.settings.sound, true);
  assert.doesNotThrow(() => FX.set('volume', 20));
  assert.equal(FX.settings.volume, 20, 'kept in memory');
  storageBlocked = false;
});

test('prefers-reduced-motion turns animations off by default, but a saved choice wins', () => {
  reduceMotion = true;
  fresh('t-reduce');
  assert.equal(FX.settings.animations, false);
  FX.set('animations', true);
  FX.init({ game: 't-reduce', clicks: false });
  assert.equal(FX.settings.animations, true);
  reduceMotion = false;
});

test('onChange fires with key and value, unsubscribe works', () => {
  fresh('t-change');
  const seen = [];
  const off = FX.onChange((k, v) => seen.push([k, v]));
  FX.set('alerts', false); FX.set('alerts', false); // second is no change
  off(); FX.set('alerts', true);
  assert.deepEqual(seen, [['alerts', false]]);
});

test('no audio before the first gesture; play returns false', () => {
  fresh('t-nogesture');
  assert.equal(FX.play('tap'), false);
});

test('every built-in sound makes nodes when on, and is shorter than 1.2 s', async () => {
  fresh('t-sounds');
  FX.unlock(); // simulates the first user gesture
  const names = ['tap', 'click', 'cardFlip', 'cardDeal', 'cardSlide', 'shuffle', 'chip', 'chips', 'coin', 'coins', 'diceShake', 'diceRoll', 'diceLand', 'place', 'slide', 'capture', 'hit', 'miss', 'splash', 'explosion', 'sink', 'whoosh', 'ding', 'turn', 'error', 'tick', 'alarm', 'train', 'stamp', 'pop', 'drumroll', 'win', 'lose', 'cheer'];
  for (const n of names) assert.ok(FX.sounds.includes(n), n + ' exists');
  for (const n of names) {
    audio.maxStop = 0;
    const { ok, made } = playCount(n);
    // a voice stops at start(+0.01 offset) + duration + 0.02 release tail
    const len = audio.maxStop - audio.clock - 0.03;
    assert.equal(ok, true, n + ' played'); assert.ok(made > 1, n + ' made nodes');
    assert.ok(len > 0 && len <= 1.2, `${n} lasts ${len.toFixed(2)} s`);
  }
});

test('category gating: a category off plays nothing (zero nodes)', () => {
  fresh('t-gate'); FX.unlock();
  FX.set('moves', false);
  assert.deepEqual(playCount('diceRoll'), { ok: false, made: 0 });
  assert.equal(playCount('turn').ok, true, 'alerts still on');
  FX.set('alerts', false); assert.deepEqual(playCount('turn'), { ok: false, made: 0 });
  FX.set('ui', false); assert.deepEqual(playCount('tap'), { ok: false, made: 0 });
  FX.set('celebrations', false); assert.deepEqual(playCount('win'), { ok: false, made: 0 });
  assert.equal(playCount('diceRoll', { cat: 'celebrations' }).ok, false);
  FX.set('moves', true); assert.equal(playCount('diceRoll').ok, true);
});

test('master Sound off or volume 0 silences everything, even force', () => {
  fresh('t-master'); FX.unlock();
  FX.set('sound', false);
  for (const n of ['tap', 'turn', 'win', 'place']) assert.deepEqual(playCount(n), { ok: false, made: 0 });
  assert.equal(playCount('turn', { force: true }).made, 0);
  FX.set('sound', true); FX.set('volume', 0);
  assert.equal(playCount('place').made, 0);
  FX.set('volume', 50); FX.set('alerts', false);
  assert.equal(playCount('turn', { force: true }).ok, true, 'Test button ignores categories');
});

test('throttle: 20 identical sounds at once become at most 3 voices', () => {
  fresh('t-throttle'); FX.unlock();
  let played = 0;
  for (let i = 0; i < 20; i++) if (FX.play('diceLand')) played++;
  assert.equal(played, 3);
});

test('define adds a custom sound (array or function) with a category', () => {
  fresh('t-define'); FX.unlock();
  assert.equal(FX.define('beep', [{ f: 600, dur: 0.1 }, { noise: true, f: 2000, dur: 0.05 }], 'alerts'), true);
  assert.equal(FX.soundCategory('beep'), 'alerts');
  assert.equal(playCount('beep').ok, true);
  FX.set('alerts', false);
  assert.equal(playCount('beep').ok, false);
  assert.equal(FX.define('boom', k => k.tone({ f: 80, dur: 0.3 })), true);
  assert.equal(FX.soundCategory('boom'), 'moves');
  assert.equal(FX.play('missing-sound'), false);
});

test('animation helpers resolve immediately when off or with no DOM', async () => {
  fresh('t-anim');
  FX.set('animations', false);
  const el = { textContent: '' };
  await Promise.all([FX.pop(el), FX.shake(el), FX.pulse(el), FX.flash(el), FX.flyTo(el, el), FX.floatText(el, '+5')]);
  await FX.countUp(el, 0, 42);
  assert.equal(el.textContent, '42', 'countUp jumps to the end when off');
  FX.set('celebrations', true);
  await FX.celebrate({ kind: 'win' });
});
