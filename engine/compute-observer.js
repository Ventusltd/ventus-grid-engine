/** Actual-computation receipts, shared by Node and browsers. No DOM or network. */
import { distanceKm } from './v9-geodesy.js';

export const schema = 'ventus.grid-compute-receipt.v1';
const copy = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const located = point => point && finite(point.lon) && finite(point.lat)
  && Math.abs(point.lon) <= 180 && Math.abs(point.lat) <= 90;
const sameLocation = (a, b) => located(a) && located(b) && a.lon === b.lon && a.lat === b.lat;
const sameEntity = (a, b) => a && b && a.kind === b.kind && String(a.id) === String(b.id);

/**
 * Create one observer per selection surface, not one per project. Every request
 * invalidates the previous selection for assessment, including repeated IDs.
 * Receipts are evidence about the supplied callback, not proof that a renderer
 * used this module. Attach run() at the real calculation call site.
 */
export function createComputeObserver({ onEvent = () => {}, now = () => Date.now() } = {}) {
  const attempts = new Map();
  let sequence = 0;
  let latest = null;
  const publish = (attempt, status, extra = {}) => {
    Object.assign(attempt, extra, { status, sequence: ++sequence, updated_at_ms: now() });
    attempt.events.push({ status, sequence: attempt.sequence, at_ms: attempt.updated_at_ms });
    // A broken logging consumer must never break the grid calculation itself.
    try { onEvent(copy(attempt)); } catch { /* receipt remains queryable */ }
    return copy(attempt);
  };
  const get = id => {
    const attempt = attempts.get(id);
    if (!attempt) throw new Error('Unknown computation attempt: ' + id);
    return attempt;
  };
  return {
    request({ entity, location = null, operation = 'nearest-grid', dataset = null }) {
      if (!entity || typeof entity.kind !== 'string' || !entity.kind.trim()
          || entity.id == null || !String(entity.id).trim()) {
        throw new TypeError('A computation request requires an entity kind and ID');
      }
      const id = 'compute-' + (sequence + 1);
      const attempt = {
        schema, id, entity: { kind: entity.kind, id: String(entity.id) },
        location: located(location) ? { lon: location.lon, lat: location.lat } : null,
        operation, dataset, requested_at_ms: now(), events: []
      };
      attempts.set(id, attempt);
      latest = id;
      publish(attempt, 'requested');
      return id;
    },
    unsupported(id, reason) {
      const attempt = get(id);
      if (attempt.status !== 'requested') throw new Error('Attempt already invoked or terminal');
      return publish(attempt, 'unsupported', { reason: String(reason || 'Unsupported input') });
    },
    async run(id, compute) {
      const attempt = get(id);
      if (attempt.status !== 'requested') throw new Error('Attempt already invoked or terminal');
      if (!attempt.location) return publish(attempt, 'unsupported', { reason: 'No valid project location' });
      if (typeof compute !== 'function') return publish(attempt, 'failed', { reason: 'No computation callback' });
      publish(attempt, 'started');
      try {
        const result = await compute(copy(attempt));
        if (!sameLocation(result?.origin, attempt.location)) throw new Error('Result origin does not match this request');
        if (!sameEntity(result?.entity, attempt.entity)) throw new Error('Result entity does not match this request');
        if (!Array.isArray(result.measurements)) throw new Error('Computation returned no measurements array');
        if (result.measurements.length === 0) {
          if (result.search_completed !== true || !Number.isInteger(result.scanned_count) || result.scanned_count < 0) {
            throw new Error('Empty result lacks completed-search and scanned-count evidence');
          }
          return publish(attempt, 'completed_empty', { measurements: [],
            summary: { measured_count: 0, scanned_count: result.scanned_count, nearest_km: null } });
        }
        const measurements = result.measurements.map(row => {
          if (!row || row.node_id == null || !String(row.node_id).trim()
              || !located(row) || !finite(row.km) || row.km < 0) {
            throw new Error('Computation returned an invalid grid measurement');
          }
          const expected = distanceKm(attempt.location.lon, attempt.location.lat, row.lon, row.lat);
          // Receipts carry unrounded values from the shared geodesy, not UI text.
          if (Math.abs(expected - row.km) > Math.max(1e-6, expected * 1e-9)) {
            throw new Error('Grid distance does not match the request and measured node');
          }
          return { node_id: String(row.node_id), lon: row.lon, lat: row.lat, km: row.km };
        });
        return publish(attempt, 'completed', { measurements,
          summary: { measured_count: measurements.length, nearest_km: Math.min(...measurements.map(row => row.km)) } });
      } catch (error) {
        return publish(attempt, 'failed', { reason: String(error?.message || error) });
      }
    },
    snapshot(id = latest) { return id == null ? null : copy(get(id)); },
    assess(id, expected) {
      if (!attempts.has(id)) return { passed: false, reason: 'never-requested' };
      const attempt = get(id);
      if (id !== latest) return { passed: false, reason: 'stale-attempt' };
      if (!sameEntity(attempt.entity, expected?.entity) || !sameLocation(attempt.location, expected?.location)) {
        return { passed: false, reason: 'selection-mismatch' };
      }
      return { passed: attempt.status === 'completed', reason: attempt.status };
    }
  };
}
