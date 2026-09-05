import assert from 'node:assert/strict';
import { createComputeObserver } from '../engine/compute-observer.js';
import { index } from '../engine/v9-nearest-search.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('  PASS ' + name); };
const selection = { entity: { kind: 'repd', id: '10919' }, location: { lon: -3, lat: 54 } };
const lookup = index([{ name: 'Fixture grid node', location: { lon: -2.9, lat: 54 }, voltages_kv: [400] }]);
const compute = request => {
  const found = lookup.nearest(request.location.lon, request.location.lat);
  return { entity: request.entity, origin: request.location, measurements: [{
    node_id: found.point.name, ...found.point.location, km: found.km
  }] };
};
const events = [];
const observer = createComputeObserver({ onEvent: event => events.push(event) });
check('never requested cannot pass', () => assert.equal(observer.assess('absent', selection).passed, false));
let id = observer.request(selection);
check('request alone cannot pass', () => assert.equal(observer.assess(id, selection).passed, false));
await observer.run(id, compute);
check('actual nearest calculation produces finite verified measurement', () => {
  assert.equal(observer.assess(id, selection).passed, true);
  assert.ok(observer.snapshot(id).measurements[0].km > 0);
  assert.deepEqual(events.map(event => event.status), ['requested', 'started', 'completed']);
});
check('wrong project cannot use a completed result', () => assert.equal(observer.assess(id, {
  ...selection, entity: { kind: 'repd', id: 'different' }
}).passed, false));
check('wrong location cannot use a completed result', () => assert.equal(observer.assess(id, {
  ...selection, location: { lon: -4, lat: 54 }
}).passed, false));
const oldId = id;
id = observer.request(selection);
check('same project selected again invalidates old attempt', () => assert.equal(observer.assess(oldId, selection).reason, 'stale-attempt'));
await observer.run(id, () => { throw new Error('Network unavailable'); });
check('exception is recorded and cannot pass', () => {
  assert.equal(observer.assess(id, selection).passed, false);
  assert.match(observer.snapshot(id).reason, /Network unavailable/);
});
for (const [name, mutate] of [
  ['empty results', result => { result.measurements = []; }],
  ['NaN distance', result => { result.measurements[0].km = NaN; }],
  ['null distance', result => { result.measurements[0].km = null; }],
  ['negative distance', result => { result.measurements[0].km = -1; }],
  ['invented distance', result => { result.measurements[0].km += 1; }],
  ['stale result origin', result => { result.origin = { lon: -4, lat: 54 }; }],
  ['stale result identity', result => { result.entity = { kind: 'repd', id: 'old' }; }]
]) {
  id = observer.request(selection);
  await observer.run(id, request => { const result = compute(request); mutate(result); return result; });
  check(name + ' fails closed', () => assert.equal(observer.snapshot(id).status, 'failed'));
}
id = observer.request({ ...selection, location: { lon: null, lat: 54 } });
let invoked = false;
await observer.run(id, () => { invoked = true; });
check('missing geometry is unsupported, never completed or invoked', () => {
  assert.equal(invoked, false); assert.equal(observer.snapshot(id).status, 'unsupported');
});
id = observer.request(selection);
await observer.run(id, request => ({ entity: request.entity, origin: request.location,
  measurements: [], search_completed: true, scanned_count: 45 }));
check('completed empty scan is explicit and never passes as a measured result', () => {
  assert.equal(observer.snapshot(id).status, 'completed_empty');
  assert.equal(observer.snapshot(id).summary.scanned_count, 45);
  assert.equal(observer.assess(id, selection).passed, false);
});
id = observer.request(selection);
let release;
const pending = observer.run(id, async request => {
  await new Promise(resolve => { release = resolve; }); return compute(request);
});
check('running calculation is not a success', () => assert.equal(observer.snapshot(id).status, 'started'));
observer.request(selection);
release(); await pending;
check('late completion from previous selection stays stale', () => assert.equal(observer.assess(id, selection).reason, 'stale-attempt'));
check('consumer mutation cannot turn requested into completed', () => {
  const receipt = observer.snapshot(); receipt.status = 'completed';
  assert.equal(observer.snapshot().status, 'requested');
});
const brokenListener = createComputeObserver({ onEvent() { throw Error('logger'); } });
id = brokenListener.request(selection); await brokenListener.run(id, compute);
check('logging errors do not suppress real computation', () => assert.equal(brokenListener.assess(id, selection).passed, true));
await assert.rejects(() => brokenListener.run(id, compute), /already invoked/);
check('attempt cannot be run twice', () => assert.equal(brokenListener.snapshot(id).events.length, 3));
const industrial = { entity: { kind: 'industrial', id: 'fixture-emitter-1' }, location: { lon: -2.9, lat: 54 } };
id = observer.request(industrial); await observer.run(id, compute);
check('industrial identity supports actual zero-distance results without invented capacity', () => {
  assert.equal(observer.assess(id, industrial).passed, true);
  assert.equal(observer.snapshot(id).measurements[0].km, 0);
  assert.equal(observer.snapshot(id).entity.kind, 'industrial');
});
console.log(`compute-observer PASS — ${checks} checks`);
