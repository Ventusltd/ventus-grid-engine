/** Bounded educational itinerary over reviewed source-row edges. No MW solver,
 * current direction, nearest-site connection, inferred transformer or GIS drawing. */
import {canonicalJson, ordinal, prepareJourneyEvidence, sha256} from './journey-evidence.js';

export const SCHEMA = 'ventus.grid-journey.plan.v1';
export const CAVEAT = 'Journey shows documented network connectivity. The travelling light is a learning cursor, not measured current or a power-flow simulation. Dotted links are schematic; missing routes are not invented.';
const defaults = Object.freeze({maxNodes: 250, maxEdges: 500, maxMoves: 1000, maxGeometryBytes: 1000000});
const ceilings = Object.freeze({maxNodes: 100000, maxEdges: 200000, maxMoves: 400000, maxGeometryBytes: 32 * 1024 * 1024});
const encoder = new TextEncoder();

function limits(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error('Grid Journey query must be an object');
  if (query.requireReviewedIdentity === false) throw new Error('Grid Journey review gates cannot be disabled');
  if (query.modes !== undefined && (!Array.isArray(query.modes) || query.modes.length !== 1 || query.modes[0] !== 'published_circuits')) throw new Error('Only published_circuits mode is implemented');
  if (query.bounds !== undefined && (!query.bounds || typeof query.bounds !== 'object' || Array.isArray(query.bounds))) throw new Error('Invalid journey bounds');
  for (const k of Object.keys(query.bounds || {})) if (!Object.hasOwn(defaults, k)) throw new Error(`Unsupported journey bound ${k}`);
  const out = {...defaults, ...query.bounds};
  for (const [key, value] of Object.entries(out)) if (!Number.isSafeInteger(value) || value < (key === 'maxNodes' ? 1 : 0) || value > ceilings[key]) throw new Error(`Invalid journey bound ${key}`);
  return out;
}

/** Exact JSON source bytes are required: a caller cannot attach a digest to an
 * unrelated parsed object. Review-ledger hash is over canonical JSON, no newline. */
export async function planJourney({sourceBytes, ledger, query = {}}) {
  // Snapshot caller-owned query before hashing introduces an async boundary.
  query = JSON.parse(canonicalJson(query));
  const bounds = limits(query), evidence = await prepareJourneyEvidence(sourceBytes, ledger);
  const {product, graph, records, sourceBundleSha, reviewLedgerSha} = evidence;
  if (query.sourceBundleSha && query.sourceBundleSha !== sourceBundleSha) throw new Error('Query source digest mismatch');
  if (query.crosswalkSha && query.crosswalkSha !== reviewLedgerSha) throw new Error('Query review ledger digest mismatch');
  const nodeReviews = new Map(evidence.ledger.nodes.map(n => [n.nodeId, n]));
  const edgeReviews = new Map(evidence.ledger.edges.map(e => [e.edgeUid, e]));
  const eligible = records.filter(e => e.eligible), rowRecords = new WeakMap(), refusalCounts = {};
  for (const r of records) {
    if (r.kind !== 'planned_change') rowRecords.set(product[r.kind === 'circuit' ? 'circuits' : 'transformers'][r.sourceIndex], r);
    for (const reason of r.reasons) refusalCounts[reason] = (refusalCounts[reason] || 0) + 1;
  }
  const seed = query.seed?.chosenNode ?? null;
  const result = {schema: SCHEMA, sourceBundleSha, reviewLedgerSha, seedNode: seed, endNode: seed,
    bounds, status: 'empty', steps: [], edgeCatalog: [], eligibleEdges: eligible.length,
    eligibleReachableEdges: 0, reachableNodes: 0, visitedUniqueEdges: 0, physicalUnits: null,
    coverage: null, truncated: false, truncationReasons: [],
    excluded: {refusalCounts, disconnectedEligibleEdges: 0, outsideBoundsEdges: 0}, caveats: [CAVEAT]};
  async function finish() { result.planSha256 = await sha256(canonicalJson(result)); return result; }
  const review = nodeReviews.get(seed);
  const seedReason = !seed ? 'chosen_node_required' : !graph.has(seed) ? 'seed_not_in_source'
    : review?.identity.status !== 'confirmed' ? 'seed_identity_unreviewed'
      : review?.rights.status !== 'accepted' ? 'seed_rights_withheld'
        : !Number.isFinite(graph.nodeVoltageKv(seed)) || graph.nodeVoltageKv(seed) <= 0 ? 'seed_voltage_unknown' : null;
  if (seedReason) { result.status = 'refused'; result.refusal = seedReason; return finish(); }

  const adjacency = new Map();
  for (const n of product.nodes) {
    const seen = new Set(), rows = [];
    // Read the incumbent graph; its two landings reference one source row.
    for (const landing of graph.edgesAt(n.node)) {
      const record = rowRecords.get(landing.row);
      if (!record?.eligible || record.kind !== landing.kind || seen.has(record.edgeUid)) continue;
      seen.add(record.edgeUid); rows.push(record);
    }
    rows.sort((a, b) => ordinal(a.edgeUid, b.edgeUid)); adjacency.set(n.node, rows);
  }
  const componentNodes = new Set([seed]), componentEdges = new Set(), pending = [seed];
  for (let i = 0; i < pending.length; i++) for (const e of adjacency.get(pending[i]) || []) {
    componentEdges.add(e.edgeUid);
    const far = e.node1 === pending[i] ? e.node2 : e.node1;
    if (!componentNodes.has(far)) { componentNodes.add(far); pending.push(far); }
  }
  result.reachableNodes = componentNodes.size; result.eligibleReachableEdges = componentEdges.size;
  result.excluded.disconnectedEligibleEdges = eligible.length - componentEdges.size;
  if (!componentEdges.size) return finish();

  function catalogFor(e) {
    const r = edgeReviews.get(e.edgeUid), a = nodeReviews.get(e.node1), b = nodeReviews.get(e.node2);
    let coordinates = null;
    if (e.geometryStatus === 'verified_circuit_and_polyline') {
      coordinates = r.geometry.coordinates.map(p => [...p]);
      if (canonicalJson(coordinates[0]) !== canonicalJson(a.location.coordinates)) coordinates.reverse();
    } else if (e.geometryStatus === 'published_topology_only') coordinates = [[...a.location.coordinates], [...b.location.coordinates]];
    return {edgeUid: e.edgeUid, kind: e.kind, node1: e.node1, node2: e.node2, sourceIndex: e.sourceIndex,
      geometryStatus: e.geometryStatus, coordinates, schematic: e.geometryStatus === 'published_topology_only',
      sourceRef: r.sourceRef, transformerRef: e.kind === 'transformer' ? r.transformerRef : null,
      label: e.geometryStatus === 'published_topology_only' ? 'Schematic topology connector; not a cable route'
        : e.geometryStatus === 'published_node_unlocated' ? 'Published topology; location unavailable — text only'
          : 'Reviewed source circuit/polyline association; precision remains source-specific'};
  }
  const stack = [{node: seed, next: 0, via: null}], visited = new Set(), visitedNodes = new Set([seed]);
  const blocked = new Set(), truncated = new Set(); let geometryBytes = 0;
  const move = (kind, edge, from, to) => {
    result.steps.push({kind: edge.geometryStatus === 'published_node_unlocated' ? 'unlocated' : kind,
      traversal: kind, edgeUid: edge.edgeUid, nearNode: from, farNode: to, order: result.steps.length,
      nearVoltageKv: graph.nodeVoltageKv(from), farVoltageKv: graph.nodeVoltageKv(to),
      geometryStatus: edge.geometryStatus, direction: from === edge.node1 ? 'forward' : 'reverse',
      transformerRef: edge.kind === 'transformer' ? edgeReviews.get(edge.edgeUid).transformerRef : null,
      sourceRef: edgeReviews.get(edge.edgeUid).sourceRef}); result.endNode = to;
  };
  walk: while (stack.length) {
    const frame = stack.at(-1), rows = adjacency.get(frame.node) || [];
    if (frame.next >= rows.length) {
      if (frame.via) {
        if (result.steps.length >= bounds.maxMoves) { truncated.add('maxMoves'); break; }
        move('backtrack', frame.via, frame.node, stack[stack.length - 2].node);
      }
      stack.pop(); continue;
    }
    const e = rows[frame.next++]; if (visited.has(e.edgeUid) || blocked.has(e.edgeUid)) continue;
    if (visited.size >= bounds.maxEdges) { truncated.add('maxEdges'); break; }
    const far = e.node1 === frame.node ? e.node2 : e.node1;
    if (!visitedNodes.has(far) && visitedNodes.size >= bounds.maxNodes) { truncated.add('maxNodes'); blocked.add(e.edgeUid); continue; }
    const catalog = catalogFor(e), addedBytes = catalog.coordinates ? encoder.encode(canonicalJson(catalog.coordinates)).length : 0;
    if (geometryBytes + addedBytes > bounds.maxGeometryBytes) { truncated.add('maxGeometryBytes'); blocked.add(e.edgeUid); continue; }
    if (result.steps.length >= bounds.maxMoves) { truncated.add('maxMoves'); break walk; }
    geometryBytes += addedBytes; visited.add(e.edgeUid); visitedNodes.add(far); result.edgeCatalog.push(catalog);
    move('advance', e, frame.node, far); stack.push({node: far, next: 0, via: e});
  }
  result.visitedUniqueEdges = visited.size; result.coverage = visited.size / componentEdges.size;
  result.truncated = truncated.size > 0; result.truncationReasons = [...truncated].sort(ordinal);
  result.excluded.outsideBoundsEdges = componentEdges.size - visited.size;
  result.status = result.truncated ? 'truncated' : 'complete';
  result.geometryBytes = geometryBytes;
  return finish();
}
