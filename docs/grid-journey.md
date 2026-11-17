# Grid Journey — source-record evidence and bounded itinerary

`engine/journey-evidence.js` validates the same
`data-grid-gb.grid-journey-review.v1` ledger as the data owner's Python contract.
`engine/edge-cover-journey.js` uses the existing `network-topology.index().graph()`
to return a deterministic educational plan. Existing shortest-path, ratings,
geometry and live-map implementations are unchanged.

```js
import {planJourney} from './engine/edge-cover-journey.js';
const plan = await planJourney({
  sourceBytes: exactPinnedNetworkJsonBytes,
  ledger: independentlyReviewedLedger,
  query: {
    seed: {chosenNode: 'explicit-reviewed-source-node'},
    sourceBundleSha: 'expected-source-SHA256',
    crosswalkSha: 'optional-canonical-ledger-SHA256',
    bounds: {maxNodes: 250, maxEdges: 500, maxMoves: 1000, maxGeometryBytes: 1000000}
  }
});
```

The exact source bytes are hash-bound before acceptance. A copied digest attached
to an unrelated parsed object cannot pass. Review-ledger SHA256 uses canonical
JSON (ordinal object keys, no newline). Web Crypto is required (Node 24 and
current browsers support it); no HTTP request or DOM access occurs.
Receipt structure does **not** authenticate a reviewer, grant rights or perform
independent electrical review. Those are externally accepted inputs. Default
empty/unreviewed ledgers admit zero edges. All test rights/identities are
explicitly synthetic; no real ETYS/GIS join is approved by a test PASS.

The shared ledger fixture is vendored only for contract tests at
`proofs/fixtures/grid-journey-reviewed-pair.v1.json`, SHA256
`174ac6824c5a8fa5d161d6529840211d7d94472e2b2a172abdc25643b0230087`.
Its source owner is `data-grid-gb/journey/fixtures/reviewed-pair.v1.json`.
It is not a second source registry or a live data product.

Each original source row has UID `bundleSHA:kind:sourceArrayIndex`. Both graph
landings reference that one row. Repeated input rows retain distinct UIDs and
require explicit multiplicity review; physical-unit count remains `null`.
Planned rows, orphan nodes, unreviewed identity/rights, unknown voltage and
cross-voltage circuits are refused. Only an explicit reviewed transformer can
bridge voltage levels. Shared coordinates, nearby sites and crossing lines
never create graph edges.

The iterative stack covers eligible source-row edges in the chosen reachable
component. It retains branches, cycles, parallel records and explicit
backtracking. Coverage denominator excludes disconnected eligible components,
which are separately counted. Refusal reason counts overlap and are not an
additive partition. Missing coordinates remain text-only `unlocated` steps;
topology-only connectors are labelled schematic, not surveyed cable routes.
Verified geometry needs separate source/review/rights and exact reviewed-node
endpoints. Playback direction is itinerary order, never measured MW direction.

Structural budgets are deterministic. Unsupported radius/time bounds are
rejected rather than silently ignored. A truncated plan ends at the actual
last node, reports its cap, and never teleports to the seed. Consumers may use
an external watchdog to abort the entire calculation; a timing-dependent
prefix must not be called a complete deterministic plan. Source input and
ledger are each limited to 32 MiB; nodes/rows and query bounds have hard caps.

Run the focused proof or the incumbent full verifier:

```powershell
node proofs/edge-cover-journey.proof.mjs
node verify.mjs
```

GJ-03 must consume this exact plan/ledger identity through an isolated,
source-built native MapLibre preview and its own approved budget. This library
does not modify a live map/current manifest, establish a surveyed real route,
certify switching state, solve load flow or assess connection capacity.
