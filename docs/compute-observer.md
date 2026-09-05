# Grid computation receipts

`engine/compute-observer.js` is an additive, dependency-free ES module for Node
and browsers. It imports only the sibling `v9-geodesy.js`. Serve both files
with a JavaScript content type when using them in a browser. No bundler,
browser extension, DOM, Chrome API, or npm package is required.

The current Atlas computes nearest substations in an inline cartridge closure.
It does not automatically import this repository. Installing this module alone
therefore changes neither a live Atlas nor its results. Instrument the actual
calculation closure, including its early returns and failures. Wrapping an
exported alias misses callers that invoke the closure directly.

```js
import { createComputeObserver } from './engine/compute-observer.js';

const observer = createComputeObserver({
  onEvent(receipt) {
    // Browser adapter only; the engine module itself needs no window.
    window.dispatchEvent(new CustomEvent('ventus:grid-compute', { detail: receipt }));
  }
});

const selection = {
  entity: { kind: 'repd', id: String(repdRef) },
  location: { lon: origin[0], lat: origin[1] },
  operation: 'nearest-grid',
  dataset: 'the actual loaded substation dataset version'
};
const attemptId = observer.request(selection);
const receipt = await observer.run(attemptId, async request => {
  // Put the real calculation here, not a second synthetic calculation that
  // could pass while the application's own path never ran.
  const nearest = nearestTransmission(origin, await loadSubstations());
  if (!nearest) {
    // Supply a measured scan count only when the actual search exposes one.
    // Otherwise throw or report unsupported; do not manufacture scan evidence.
    throw new Error('No measured grid node returned');
  }
  return {
    entity: request.entity,
    origin: request.location,
    measurements: [{
      node_id: String(nearest.id || nearest.name),
      lon: nearest.at[0], lat: nearest.at[1], km: nearest.km
    }]
  };
});
const assessment = observer.assess(attemptId, selection);
```

An adapter must reject a missing node ID before converting it to a string.
`"undefined"` is not a meaningful grid node identity. The snippet assumes the
application result has an ID or a name; adapt its exact field names explicitly.
For industrial selections use `entity.kind: 'industrial'` and the source's
stable facility ID. An emissions value is not generation capacity and is not
part of this receipt's input or result.

The receipt contains schema, attempt ID, entity, origin location, operation,
dataset label, requested and updated millisecond timestamps, ordered event
sequence, terminal reason where applicable, and measured-result summary.
IDs are local to an observer. Save the page/test-run identity with them when
combining browser reports. Create one observer per selection surface, not per
project, so a new request makes previous results stale even for the same REPD.

| Status | Meaning | Measured result passes? |
|---|---|---|
| requested | The selection requested a calculation | No |
| started | The actual supplied calculation callback was invoked | No |
| completed | Callback returned a nonempty list of verified finite measurements | Yes, only for the latest matching selection |
| completed_empty | Callback explicitly completed a search with an integer scanned count and no results | No |
| failed | Callback threw or returned invalid/mismatched results | No |
| unsupported | Location is absent/invalid, or the adapter explicitly reports unsupported input | No |

An empty result requires `measurements: []`, `search_completed: true`, and
`scanned_count: N` (an integer >= 0). This distinguishes a completed empty scan
from an uninvoked engine; it does not turn an empty result into success.
`unsupported(id, reason)` terminates an unstarted request explicitly.

Distances must be raw, unrounded kilometres from the estate's WGS84 equatorial
sphere (radius 6378.137 km). The observer independently checks each distance
against its request origin and reported node coordinates, with a 1 mm absolute
or 1e-9 relative tolerance. It does not silently accept a different earth model,
a formatted display string, null/NaN, or a cached measurement from another
origin. A zero-distance node is valid. This is a nearest-grid distance receipt,
not a load-flow, routing, connection approval, or available-capacity proof.

`snapshot(id)` returns an isolated copy. `assess(id, expected)` fails if the ID
was never requested, a newer request exists, the entity/location differs, or
the status is anything other than completed. A timeout detector should take a
snapshot and report requested/started as unfinished; initialization and map
rendering are not evidence. Logging listeners cannot suppress the computation
by throwing, and receipts remain queryable if event delivery fails.

The observer can validate facts returned at its integration boundary; it
cannot prove that an arbitrary callback really searched a dataset, that the
dataset is authoritative, or that the browser displayed the result. The Test
Code detector must retain the actual callback integration, dataset identity,
browser errors, selected project, visible result, and screenshots as separate
evidence. No engine-only unit test certifies Safari, Android, or a live page.

Run `node proofs/compute-observer.proof.mjs` for deliberately failing inputs,
late completions, stale selections, listener failures, and real nearest-search
fixtures. `node verify.mjs` includes it in the repository gate.
