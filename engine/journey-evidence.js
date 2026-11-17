/** Byte-pinned, fail-closed Journey evidence. Receipt presence does not
 * authenticate a reviewer or grant rights. No DOM, network, inferred joins or MW. */
import {index as topologyIndex} from './network-topology.js';

export const REVIEW_SCHEMA = 'data-grid-gb.grid-journey-review.v1';
export const PRODUCT_SCHEMA = 'data-grid-gb.transmission-network.v1';
export const KINDS = Object.freeze({circuit: 'circuits', transformer: 'transformers', planned_change: 'planned_changes'});
export const GEOMETRY = Object.freeze(['verified_circuit_and_polyline', 'published_topology_only',
  'published_node_unlocated', 'vicinity_screening_only', 'ambiguous_or_licence_blocked']);
const encoder = new TextEncoder();
const hex = /^[0-9a-f]{64}$/;
const fail = message => { throw new Error(`Grid Journey evidence: ${message}`); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, label) => { if (typeof v !== 'string' || !v.trim()) fail(`${label} must be nonempty text`); };
export const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function canonicalJson(value) {
  const active = new Set();
  function encode(v) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail('nonfinite JSON number'); return JSON.stringify(v); }
    if (!object(v) && !Array.isArray(v)) fail('non-JSON input');
    if (active.has(v)) fail('cyclic JSON input');
    active.add(v);
    const out = Array.isArray(v) ? '[' + v.map(encode).join(',') + ']'
      : '{' + Object.keys(v).sort(ordinal).map(k => JSON.stringify(k) + ':' + encode(v[k])).join(',') + '}';
    active.delete(v);
    return out;
  }
  return encode(value);
}

export async function sha256(bytes) {
  if (typeof bytes === 'string') bytes = encoder.encode(bytes);
  if (!(bytes instanceof Uint8Array)) fail('hash input must be text or bytes');
  if (!globalThis.crypto?.subtle) fail('Web Crypto SHA256 is unavailable');
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

function url(v, label) {
  text(v, label);
  if (/[\s\\]/u.test(v)) fail(`${label} contains URL whitespace or backslash`);
  const match = /^https:\/\/([A-Za-z0-9.-]+)(?::([0-9]+))?(?:[/?#].*)?$/u.exec(v);
  if (!match || match[1].length > 253 || !match[1].split('.').every(s => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(s))
      || match[2] && (+match[2] < 1 || +match[2] > 65535)) fail(`${label} must be a credential-free HTTPS URL`);
}

function receipt(v, label) {
  if (!object(v)) fail(`${label} requires an explicit review receipt`);
  text(v.id, `${label}.id`); text(v.reviewer, `${label}.reviewer`); url(v.reference, `${label}.reference`);
  if (typeof v.reviewedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(v.reviewedAt)
      || v.reviewedAt.startsWith('0000') || !Number.isFinite(Date.parse(v.reviewedAt))
      || new Date(v.reviewedAt).toISOString().replace('.000Z', 'Z') !== v.reviewedAt) fail(`${label}.reviewedAt is not a valid UTC instant`);
}
function source(v, label) { if (!object(v)) fail(`${label} requires a source locator`); url(v.url, `${label}.url`); text(v.locator, `${label}.locator`); }
function rights(v, label) {
  if (!object(v) || !['accepted', 'unconfirmed', 'blocked'].includes(v.status)) fail(`${label} invalid rights status`);
  if (v.status === 'accepted') { url(v.licenceUrl, `${label}.licenceUrl`); text(v.attribution, `${label}.attribution`); receipt(v.review, `${label}.review`); }
}
function identity(v, label) {
  if (!object(v) || !['confirmed', 'unreviewed', 'ambiguous'].includes(v.status)) fail(`${label} invalid identity status`);
  if (v.status === 'confirmed') receipt(v.review, `${label}.review`);
}
function position(v, label) {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite) || Math.abs(v[0]) > 180 || Math.abs(v[1]) > 90) fail(`${label} must be finite WGS84 [longitude,latitude]`);
}

export function edgeUid(bundleSha, kind, sourceIndex) {
  if (!hex.test(bundleSha) || !Object.hasOwn(KINDS, kind) || !Number.isSafeInteger(sourceIndex) || sourceIndex < 0) fail('invalid source-row identity');
  return `${bundleSha}:${kind}:${sourceIndex}`;
}

export function validateProduct(product) {
  if (!object(product) || product.schema !== PRODUCT_SCHEMA) fail('unsupported network product');
  for (const key of ['nodes', ...Object.values(KINDS)]) if (!Array.isArray(product[key])) fail(`network.${key} must be an array`);
  if (product.nodes.length > 100000 || Object.values(KINDS).reduce((n, k) => n + product[k].length, 0) > 200000) fail('network exceeds contract limits');
  const ids = new Set();
  const nodeId = v => { text(v, 'source node ID'); if (/[\x00-\x1f\x7f]/u.test(v)) fail('source node ID contains control characters'); };
  for (const n of product.nodes) {
    if (!object(n)) fail('network node must be an object');
    nodeId(n.node); if (ids.has(n.node)) fail('duplicate source node identity'); ids.add(n.node);
  }
  for (const key of Object.values(KINDS)) for (const row of product[key]) {
    if (!object(row)) fail('network branch must be an object'); nodeId(row.node_1); nodeId(row.node_2);
  }
  return product;
}

export function validateLedger(ledger, product = null, expectedSha = null) {
  if (!object(ledger) || ledger.schema !== REVIEW_SCHEMA) fail('unsupported review ledger schema');
  edgeUid(ledger.sourceBundleSha, 'circuit', 0);
  if (expectedSha !== null && ledger.sourceBundleSha !== expectedSha) fail('review ledger source digest does not match actual bytes');
  if (product !== null) validateProduct(product);
  if (!Array.isArray(ledger.nodes) || !Array.isArray(ledger.edges)) fail('review ledger requires node and edge arrays');
  if (ledger.nodes.length > 100000 || ledger.edges.length > 200000) fail('review ledger exceeds contract limits');
  const sourceNodes = product && new Set(product.nodes.map(n => n.node)), nodes = new Set(), edges = new Set();
  for (const n of ledger.nodes) {
    if (!object(n)) fail('node review must be an object'); text(n.nodeId, 'nodeId');
    if (nodes.has(n.nodeId) || sourceNodes && !sourceNodes.has(n.nodeId)) fail('duplicate or unknown node review'); nodes.add(n.nodeId);
    identity(n.identity, 'node.identity'); rights(n.rights, 'node.rights'); source(n.sourceRef, 'node.sourceRef');
    const loc = Object.hasOwn(n, 'location') ? n.location : {status: 'unlocated'};
    if (!object(loc) || !['reviewed', 'unreviewed', 'unlocated', 'ambiguous'].includes(loc.status)) fail('invalid node location state');
    if (loc.status === 'reviewed') { position(loc.coordinates, 'location.coordinates'); source(loc.sourceRef, 'location.sourceRef'); receipt(loc.review, 'location.review'); rights(loc.rights, 'location.rights'); }
  }
  for (const e of ledger.edges) {
    if (!object(e)) fail('edge review must be an object');
    const uid = edgeUid(ledger.sourceBundleSha, e.kind, e.sourceIndex);
    if (e.edgeUid !== uid || edges.has(uid)) fail('duplicate or inconsistent source-row UID'); edges.add(uid);
    text(e.node1, 'node1'); text(e.node2, 'node2');
    if (product) { const row = product[KINDS[e.kind]][e.sourceIndex]; if (!row || e.node1 !== row.node_1 || e.node2 !== row.node_2) fail('review refers to a different source row or endpoint'); }
    identity(e.identity, 'edge.identity'); rights(e.rights, 'edge.rights'); source(e.sourceRef, 'edge.sourceRef');
    if (!['reviewed', 'unreviewed', 'ambiguous'].includes(e.multiplicityStatus)) fail('edge multiplicity review status is required');
    if (e.multiplicityStatus === 'reviewed') receipt(e.multiplicityReview, 'edge.multiplicityReview');
    if (!GEOMETRY.includes(e.geometryStatus)) fail('unknown geometry evidence class');
    if (e.kind === 'transformer' && e.identity.status === 'confirmed') text(e.transformerRef, 'transformerRef');
    if (e.geometryStatus === 'verified_circuit_and_polyline') {
      const g = e.geometry;
      if (!object(g) || !Array.isArray(g.coordinates) || g.coordinates.length < 2) fail('verified polyline needs reviewed coordinates');
      for (const p of g.coordinates) position(p, 'geometry.coordinates');
      source(g.sourceRef, 'geometry.sourceRef'); receipt(g.review, 'geometry.review'); rights(g.rights, 'geometry.rights');
    }
  }
  return ledger;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function classifyEdges(product, ledger, expectedSha = null) {
  validateLedger(ledger, product, expectedSha);
  const nodes = new Map(product.nodes.map(n => [n.node, n])), reviews = new Map(ledger.nodes.map(n => [n.nodeId, n]));
  const edgeReviews = new Map(ledger.edges.map(e => [e.edgeUid, e])), result = [];
  for (const [kind, key] of Object.entries(KINDS)) for (const [sourceIndex, row] of product[key].entries()) {
    const uid = edgeUid(ledger.sourceBundleSha, kind, sourceIndex), e = edgeReviews.get(uid), reasons = [];
    if (kind === 'planned_change') reasons.push('planned');
    if (!e) reasons.push('edge_unreviewed');
    else {
      if (e.identity.status !== 'confirmed') reasons.push('edge_identity');
      if (e.rights.status !== 'accepted') reasons.push('edge_rights');
      if (e.multiplicityStatus !== 'reviewed') reasons.push('multiplicity');
      if (['vicinity_screening_only', 'ambiguous_or_licence_blocked'].includes(e.geometryStatus)) reasons.push('geometry_withheld');
    }
    const positions = [], volts = [];
    for (const nid of [row.node_1, row.node_2]) {
      const n = nodes.get(nid), r = reviews.get(nid); if (!n) reasons.push('orphan_node');
      let voltage = n?.voltage_consistent_with_site === true ? n.voltage_kv : null;
      if (!Number.isFinite(voltage) || voltage <= 0) { voltage = null; reasons.push('unknown_voltage'); } volts.push(voltage);
      if (r?.identity.status !== 'confirmed') reasons.push('node_identity');
      if (r?.rights.status !== 'accepted') reasons.push('node_rights');
      positions.push(r?.location?.status === 'reviewed' && r.location.rights.status === 'accepted' ? r.location.coordinates : null);
    }
    if (kind === 'circuit' && volts.every(v => v !== null) && volts[0] !== volts[1]) reasons.push('illegal_voltage');
    let status = e?.geometryStatus ?? 'ambiguous_or_licence_blocked';
    if (e && status === 'verified_circuit_and_polyline') {
      const line = e.geometry.coordinates;
      if (e.geometry.rights.status !== 'accepted') reasons.push('geometry_rights');
      if (positions.includes(null) || !(same(line[0], positions[0]) && same(line.at(-1), positions[1]) || same(line[0], positions[1]) && same(line.at(-1), positions[0]))) reasons.push('geometry_endpoint_mismatch');
    } else if (status === 'published_topology_only' && positions.includes(null)) status = 'published_node_unlocated';
    result.push({edgeUid: uid, kind, sourceIndex, node1: row.node_1, node2: row.node_2,
      eligible: reasons.length === 0, reasons: [...new Set(reasons)].sort(ordinal), geometryStatus: status});
  }
  return result;
}

export async function prepareJourneyEvidence(sourceBytes, ledger) {
  const bytes = typeof sourceBytes === 'string' ? encoder.encode(sourceBytes) : sourceBytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 32 * 1024 * 1024) fail('network must be at most 32 MiB of exact JSON bytes');
  // Snapshot caller-owned bytes/ledger before the first asynchronous boundary.
  const snapshot = Uint8Array.from(bytes), ledgerText = canonicalJson(ledger);
  if (encoder.encode(ledgerText).length > 32 * 1024 * 1024) fail('review ledger exceeds 32 MiB');
  const frozenLedger = JSON.parse(ledgerText), product = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(snapshot));
  const digest = await sha256(snapshot);
  validateLedger(frozenLedger, product, digest);
  const records = classifyEdges(product, frozenLedger, digest);
  return {sourceBundleSha: digest, reviewLedgerSha: await sha256(ledgerText), product,
    ledger: frozenLedger, records, graph: topologyIndex(product).graph()};
}
