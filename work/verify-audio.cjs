const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const js = fs.readFileSync(path.join(__dirname, '../dist/audio.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../dist/replay.html'), 'utf8');
let count = 0;
function check(name, run) { run(); count++; console.log('PASS ' + name); }
function setup(options = {}) {
  const events = {}, windowEvents = {}, nodes = [], storage = new Map();
  if (options.preferences) storage.set('salud-de-mision/audio/v1', options.preferences);
  const elements = Object.fromEntries(['sound-toggle','sound-volume','sound-volume-value','sound-ambient','sound-test','sound-status'].map(id => [id, { id, events: {}, value: '', checked: false, textContent: '', attributes: {}, addEventListener(name, fn) { this.events[name] = fn; }, setAttribute(name, value) { this.attributes[name] = value; } }]));
  class Param { constructor() { this.value = 0; } setValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
  class Node { constructor(kind) { this.kind = kind; this.gain = new Param(); this.frequency = new Param(); this.Q = new Param(); this.threshold = new Param(); this.knee = new Param(); this.ratio = new Param(); nodes.push(this); } connect() {} disconnect() { this.disconnected = true; } start() { this.started = true; } stop() { this.stopped = true; } }
  let context;
  class Audio { constructor() { context = this; this.currentTime = 0; this.sampleRate = 100; this.state = 'suspended'; this.destination = {}; } createGain() { return new Node('gain'); } createOscillator() { return new Node('osc'); } createBiquadFilter() { return new Node('filter'); } createDynamicsCompressor() { return new Node('limiter'); } createBuffer(channels, size) { const data = new Float32Array(size); return {getChannelData: () => data}; } createBufferSource() { return new Node('noise'); } async resume() { if (options.rejectResume) throw Error('blocked'); this.state = 'running'; } async suspend() { this.state = 'suspended'; } }
  const sandbox = { document: { hidden: false, getElementById: id => elements[id], addEventListener: (name, fn) => { events[name] = fn; } }, localStorage: { getItem: key => { if(options.badStorage) throw Error('blocked'); return storage.get(key) || null; }, setItem: (key, value) => { if(options.badStorage) throw Error('blocked'); storage.set(key, value); } }, addEventListener: (name, fn) => { windowEvents[name] = fn; }, setTimeout: fn => fn(), console };
  if (!options.noAudio) sandbox.AudioContext = Audio;
  vm.runInNewContext(js, sandbox);
  const toneCount = () => nodes.filter(node => node.kind === 'osc' && node.type === 'sine' && node.frequency.value >= 196 && node.started).length;
  return { elements, nodes, storage, sandbox, events, windowEvents, api: sandbox.MissionAudio, context: () => context, toneCount, enable: () => elements['sound-toggle'].events.click() };
}
(async () => {
  const app = setup();
  check('Starts muted without creating an audio context or changing mission storage', () => { assert.equal(app.context(), undefined); assert.equal(app.storage.size, 0); assert.equal(app.elements['sound-toggle'].attributes['aria-pressed'], 'false'); assert.equal(app.elements['sound-test'].disabled, true); });
  await app.enable();
  check('User activation creates a running context and one confirmation', () => { assert.equal(app.context().state, 'running'); assert.equal(app.toneCount(), 2); assert.equal(app.elements['sound-toggle'].attributes['aria-pressed'], 'true'); });
  const update = (day, kind = 'nominal', extras = {}) => app.api.update({ day, kind, crew: 'A', scenario: 'nominal', visible: true, ...extras });
  update(0); app.context().currentTime = 1; update(1);
  check('Launch has its own motif and identical redraws stay silent', () => { assert.equal(app.toneCount(), 5); update(1); assert.equal(app.toneCount(), 5); });
  app.context().currentTime = 2; update(9);
  check('Accelerated playback sounds only the last crossed milestone', () => { assert.equal(app.toneCount(), 7); });
  app.context().currentTime = 3; update(73, 'alert');
  check('Review transition sounds once without repeating at the next day', () => { assert.equal(app.toneCount(), 9); update(74, 'alert'); update(74, 'alert'); assert.equal(app.toneCount(), 9); });
  app.context().currentTime = 3.5; update(73, 'review', { scenario: 'missing' });
  check('Rapid scenario changes are rate limited', () => assert.equal(app.toneCount(), 9));
  app.context().currentTime = 7; update(60, 'nominal', { scenario: 'missing' }); update(73, 'review', { scenario: 'missing' });
  check('Incomplete data has a different pair of notes', () => { assert.equal(app.toneCount(), 11); const tones = app.nodes.filter(n => n.kind === 'osc').slice(-2); assert.deepEqual(tones.map(n => n.frequency.value), [440,330]); });
  app.context().currentTime = 8; update(90); app.context().currentTime = 9; update(118); app.context().currentTime = 10; update(120);
  check('Reentry and mission completion each sound their motif', () => assert.equal(app.toneCount(), 17));
  check('Ambient scenes do not restart on redraws and all stop when leaving the simulation', () => { const before=app.nodes.length;update(120);assert.equal(app.nodes.length,before);app.api.view(false);assert.ok(app.nodes.filter(n => n.kind === 'noise').every(n => n.stopped)); });
  update(120); app.elements['sound-ambient'].checked = false; app.elements['sound-ambient'].events.change();
  check('Ambient switch preserves effects and remembers only preferences', () => { assert.ok(app.nodes.filter(n => n.kind === 'noise').every(n => n.stopped)); assert.equal(app.elements['sound-toggle'].attributes['aria-pressed'], 'true'); const saved = JSON.parse(app.storage.get('salud-de-mision/audio/v1')); assert.equal(saved.ambiance, false); assert.equal(saved.enabled, undefined); });
  app.elements['sound-volume'].value = '0'; app.elements['sound-volume'].events.input(); const mutedCount = app.toneCount(); app.api.cue('saved');
  check('Zero volume suppresses effects and disables sound testing', () => { assert.equal(app.toneCount(), mutedCount); assert.equal(app.elements['sound-test'].disabled, true); });
  app.elements['sound-volume'].value = '35'; app.elements['sound-volume'].events.input(); app.sandbox.document.hidden = true; app.events.visibilitychange(); app.api.cue('saved');
  check('Hidden tab suspends audio and suppresses tones', () => { assert.equal(app.context().state, 'suspended'); assert.equal(app.toneCount(), mutedCount); });
  app.sandbox.document.hidden = false; app.events.visibilitychange(); await Promise.resolve(); await app.enable();
  check('Mute suspends context immediately and remains independent of mission', () => { assert.equal(app.context().state, 'suspended'); assert.equal(app.elements['sound-toggle'].attributes['aria-pressed'], 'false'); });
  const restored = setup({preferences:'{"volume":64,"ambiance":false}'});
  check('Restoring preferences never starts audio automatically', () => { assert.equal(restored.elements['sound-volume'].value, '64'); assert.equal(restored.elements['sound-ambient'].checked, false); assert.equal(restored.context(), undefined); });
  for (const options of [{noAudio:true}, {rejectResume:true}]) { const broken = setup(options); await broken.enable(); check('Unsupported or blocked audio gives a usable muted state', () => { assert.match(broken.elements['sound-status'].textContent, /no pudo activar/); assert.equal(broken.elements['sound-toggle'].disabled, false); assert.equal(broken.elements['sound-toggle'].attributes['aria-pressed'], 'false'); }); }
  const denied = setup({badStorage:true}); await denied.enable(); denied.elements['sound-volume'].value = '50';
  check('Unavailable storage does not stop the audio controls', () => { assert.doesNotThrow(() => denied.elements['sound-volume'].events.input()); assert.equal(denied.elements['sound-volume-value'].textContent, '50 %'); });
  check('Audio file is local and no remote audio resources are loaded', () => { assert.match(html, /<script src="audio.js"><\/script>/); assert.doesNotMatch(js, /fetch\(|https?:\/\//); });
  const scene = setup(); await scene.enable();
  const travel = day => scene.api.update({day,kind:'nominal',crew:'A',scenario:'nominal',visible:true});
  check('Ambient changes with mission stage and sustained reentry does not restart', () => {
    travel(1);assert.match(scene.elements['sound-status'].textContent,/motores y vibración/);assert.ok(scene.nodes.some(n=>n.frequency.value===7));
    travel(2);assert.match(scene.elements['sound-status'].textContent,/Órbita/);
    travel(118);assert.match(scene.elements['sound-status'].textContent,/turbulencia/);const before=scene.nodes.length;travel(119);assert.equal(scene.nodes.length,before);
    travel(120);assert.match(scene.elements['sound-status'].textContent,/reposo/);
  });
  check('Airlock effects play once per EVA entry and stop with the environmental switch', () => {
    travel(90);assert.equal(scene.nodes.filter(n=>n.kind==='osc'&&n.type==='triangle').length,2);const before=scene.nodes.length;travel(90);assert.equal(scene.nodes.length,before);
    scene.elements['sound-ambient'].checked=false;scene.elements['sound-ambient'].events.change();assert.ok(scene.nodes.filter(n=>n.kind==='noise'||n.type==='triangle').every(n=>n.stopped));
    const off=scene.nodes.length;travel(1);assert.equal(scene.nodes.filter(n=>n.kind==='noise').at(-1).stopped,true);assert.ok(scene.nodes.slice(off).every(n=>n.kind!=='noise'));
  });
  console.log(count + ' audio checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
