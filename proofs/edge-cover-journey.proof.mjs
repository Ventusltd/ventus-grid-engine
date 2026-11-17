/** Synthetic GJ-01/GJ-02 acceptance. No real identities, licence or route grant. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planJourney} from '../engine/edge-cover-journey.js';
import {canonicalJson, classifyEdges, edgeUid, prepareJourneyEvidence, sha256, validateLedger} from '../engine/journey-evidence.js';

let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const yes = (v, label) => { assert.ok(v, label); checks++; };
const rejects = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };
const throws = (fn, pattern) => { assert.throws(fn, pattern); checks++; };
const clone = v => JSON.parse(JSON.stringify(v));
const review = (id = 'fixture') => ({id, reviewer: 'SYNTHETIC TEST ONLY', reviewedAt: '2026-11-17T00:00:00Z', reference: `https://fixture.invalid/reviews/${id}`});
const rights = () => ({status: 'accepted', licenceUrl: 'https://fixture.invalid/synthetic-licence', attribution: 'Synthetic fixture; no real-source approval', review: review('rights')});
const source = locator => ({url: 'https://fixture.invalid/network.json', locator});

async function fixture({nodes = [{id: 'A', kv: 132}, {id: 'B', kv: 132}], circuits = [['A', 'B']], transformers = [], planned = [], located = true} = {}) {
  const product = {schema: 'data-grid-gb.transmission-network.v1', sites: nodes.map(n => ({code: n.id})),
    nodes: nodes.map(n => ({node: n.id, site_code: n.id, voltage_kv: n.kv, voltage_consistent_with_site: n.trusted !== false})),
    circuits: circuits.map(([a, b]) => ({node_1: a, node_2: b})), transformers: transformers.map(([a, b]) => ({node_1: a, node_2: b})),
    planned_changes: planned.map(([a, b]) => ({node_1: a, node_2: b, year: '2029'}))};
  const networkText = canonicalJson(product) + '\n', digest = await sha256(networkText);
  const ledger = {schema: 'data-grid-gb.grid-journey-review.v1', sourceBundleSha: digest,
    nodes: nodes.map((n, i) => ({nodeId: n.id, sourceRef: source(`/nodes/${i}`), identity: {status: 'confirmed', review: review(n.id)}, rights: rights(),
      location: located ? {status: 'reviewed', coordinates: n.coords || [(i % 100) / 100, 51 + Math.floor(i / 100) / 1000], sourceRef: source(`/locations/${i}`), review: review('location'), rights: rights()} : {status: 'unlocated'}})), edges: []};
  for (const [kind, key] of [['circuit', 'circuits'], ['transformer', 'transformers'], ['planned_change', 'planned_changes']]) for (const [i, row] of product[key].entries()) ledger.edges.push({edgeUid: edgeUid(digest, kind, i), kind, sourceIndex: i, node1: row.node_1, node2: row.node_2,
    sourceRef: source(`/${key}/${i}`), identity: {status: 'confirmed', review: review('edge')}, rights: rights(),
    multiplicityStatus: 'reviewed', multiplicityReview: review('source-record-multiplicity'), geometryStatus: 'published_topology_only',
    ...(kind === 'transformer' ? {transformerRef: `synthetic-transformer-${i}`} : {})});
  return {product, ledger, networkText, sourceBytes: networkText, query: {seed: {chosenNode: nodes[0]?.id}}};
}

function continuity(result) {
  let at = result.seedNode;
  const catalog = new Map(result.edgeCatalog.map(e => [e.edgeUid, e]));
  for (const [i, step] of result.steps.entries()) {
    eq(step.order, i); eq(step.nearNode, at, 'no teleport');
    const e = catalog.get(step.edgeUid); yes(e, 'step names a visited source row');
    yes(e.node1 === step.nearNode && e.node2 === step.farNode || e.node2 === step.nearNode && e.node1 === step.farNode, 'explicit source endpoints');
    at = step.farNode;
  }
  eq(result.endNode, at); eq(new Set(result.steps.map(s => s.edgeUid)).size, result.visitedUniqueEdges);
}

const pairBytes = readFileSync(new URL('./fixtures/grid-journey-reviewed-pair.v1.json', import.meta.url));
eq(await sha256(pairBytes), '174ac6824c5a8fa5d161d6529840211d7d94472e2b2a172abdc25643b0230087', 'data-owner synthetic fixture pin');
const pair = JSON.parse(pairBytes), pairProduct = JSON.parse(pair.networkText);
eq(classifyEdges(pairProduct, pair.ledger).map(r => [r.eligible, r.geometryStatus]), [[true, 'published_topology_only']]);
let result = await planJourney({sourceBytes: pair.networkText, ledger: pair.ledger, query: {seed: {chosenNode: 'A1'}}});
eq(result.visitedUniqueEdges, 1, 'two graph landing wrappers count once'); eq(result.steps.length, 2); eq(result.physicalUnits, null);
eq(result.edgeCatalog[0].schematic, true); yes(result.edgeCatalog[0].label.includes('not a cable route')); continuity(result);
eq(await planJourney({sourceBytes: pair.networkText, ledger: pair.ledger, query: {seed: {chosenNode: 'A1'}}}), result, 'repeatability');

const radial = await fixture({nodes: Array.from({length: 9}, (_, i) => ({id: 'N' + i, kv: 132})), circuits: [[0,1],[1,2],[1,3],[3,4],[3,5],[0,6],[6,7],[6,8]].map(p => p.map(i => 'N' + i))});
result = await planJourney(radial); eq(result.visitedUniqueEdges, 8); eq(result.steps.length, 16); eq(result.coverage, 1); eq(result.endNode, 'N0'); continuity(result);
const triangle = await fixture({nodes: ['A','B','C'].map(id => ({id, kv: 132})), circuits: [['A','B'],['B','C'],['C','A']]});
result = await planJourney(triangle); eq(result.visitedUniqueEdges, 3); eq(result.steps.length, 6); continuity(result);
const parallel = await fixture({circuits: [['A','B'],['A','B']]});
result = await planJourney(parallel); eq(result.visitedUniqueEdges, 2, 'identical rows retain distinct source-row UIDs'); eq(new Set(result.edgeCatalog.map(e => e.edgeUid)).size, 2); eq(result.physicalUnits, null); continuity(result);
parallel.ledger.edges[1].multiplicityStatus = 'ambiguous';
result = await planJourney(parallel); eq(result.visitedUniqueEdges, 1); eq(result.excluded.refusalCounts.multiplicity, 1);
const self = await fixture({nodes: [{id:'A',kv:132}],circuits:[['A','A']]}); result=await planJourney(self); eq(result.visitedUniqueEdges,1);eq(result.steps.length,2);continuity(result);

const separated = await fixture({nodes: ['A','B','X','Y'].map(id => ({id, kv:132})), circuits:[['A','B'],['X','Y']]});
result=await planJourney(separated);eq(result.eligibleEdges,2);eq(result.eligibleReachableEdges,1);eq(result.excluded.disconnectedEligibleEdges,1);eq(result.coverage,1);continuity(result);
const voltageNodes = [{id:'A',kv:400,coords:[0,51]},{id:'B',kv:132,coords:[0,51]}];
result=await planJourney(await fixture({nodes:voltageNodes,circuits:[]}));eq(result.status,'empty');eq(result.steps.length,0,'shared coordinate creates no edge');
result=await planJourney(await fixture({nodes:voltageNodes}));eq(result.eligibleEdges,0);eq(result.excluded.refusalCounts.illegal_voltage,1);
result=await planJourney(await fixture({nodes:voltageNodes,circuits:[],transformers:[['A','B']]}));eq(result.visitedUniqueEdges,1);yes(result.steps.every(s=>s.transformerRef==='synthetic-transformer-0'));continuity(result);
const unknown = await fixture({nodes:[{id:'A',kv:132},{id:'B',kv:132,trusted:false}]});
result=await planJourney(unknown);eq(result.eligibleEdges,0);eq(result.excluded.refusalCounts.unknown_voltage,1);
result=await planJourney({...unknown,query:{seed:{chosenNode:'B'}}});eq(result.status,'refused');eq(result.refusal,'seed_voltage_unknown');
result=await planJourney(await fixture({circuits:[],planned:[['A','B']]}));eq(result.eligibleEdges,0);eq(result.excluded.refusalCounts.planned,1);
const orphan=await fixture({nodes:[{id:'A',kv:132}],circuits:[['A','MISSING']]});result=await planJourney(orphan);eq(result.eligibleEdges,0);eq(result.excluded.refusalCounts.orphan_node,1);
result=await planJourney({...triangle,query:{}});eq(result.refusal,'chosen_node_required');
result=await planJourney({...triangle,query:{seed:{siteCode:'A'}}});eq(result.refusal,'chosen_node_required');
result=await planJourney({...triangle,query:{seed:{chosenNode:'NO'}}});eq(result.refusal,'seed_not_in_source');

for (const [key, value] of [['maxMoves',1],['maxMoves',0],['maxEdges',1],['maxEdges',0],['maxNodes',1],['maxGeometryBytes',0]]) {
  result=await planJourney({...radial,query:{...radial.query,bounds:{[key]:value}}});eq(result.status,'truncated');yes(result.truncationReasons.includes(key));yes(result.coverage<1);continuity(result);
}
const unlocated=await fixture({located:false});result=await planJourney({...unlocated,query:{...unlocated.query,bounds:{maxGeometryBytes:0}}});eq(result.visitedUniqueEdges,1);yes(result.steps.every(s=>s.kind==='unlocated'));eq(result.edgeCatalog[0].coordinates,null);continuity(result);
for(const bounds of [{maxMillis:10},{radiusKm:40},{maxMoves:-1},{maxNodes:0},{maxEdges:1.5},{maxMoves:Infinity}])await rejects(()=>planJourney({...radial,query:{...radial.query,bounds}}),/bound|nonfinite/);
await rejects(()=>planJourney({...radial,query:{...radial.query,requireReviewedIdentity:false}}),/cannot be disabled/);
await rejects(()=>planJourney({...radial,query:{...radial.query,modes:['flow_context']}}),/Only published/);
await rejects(()=>planJourney({...radial,query:{...radial.query,sourceBundleSha:'0'.repeat(64)}}),/digest mismatch/);
await rejects(()=>planJourney({...radial,query:{...radial.query,crosswalkSha:'0'.repeat(64)}}),/digest mismatch/);

for (const mutate of [e=>e.identity.status='ambiguous',e=>e.rights.status='blocked',e=>e.multiplicityStatus='unreviewed',e=>e.geometryStatus='vicinity_screening_only']) {
  const f=await fixture();mutate(f.ledger.edges[0]);result=await planJourney(f);eq(result.eligibleEdges,0);eq(result.steps.length,0);
}
const zero = await fixture();zero.ledger.nodes=[];zero.ledger.edges=[];result=await planJourney(zero);eq(result.status,'refused');eq(result.eligibleEdges,0,'no automatic approval for default ledger');
for (const mutate of [l=>l.edges[0].sourceIndex=99,l=>l.edges[0].node2='FAKE',l=>l.edges[0].kind='transformer',l=>l.edges.push(clone(l.edges[0])),l=>l.nodes.push(clone(l.nodes[0])),l=>l.edges[0].identity.review=null,l=>l.nodes[0].location=null]) {
  const f=await fixture();mutate(f.ledger);await rejects(()=>planJourney(f),/Grid Journey evidence/);
}
for(const bad of ['https://bad host.invalid/','https://good.invalid\\bad','https://good.invalid/\npath','https://user:secret@good.invalid/','https://good.invalid:99999/','https://%65xample.com/','https://good.invalid:/']) {
  const f=await fixture();f.ledger.edges[0].sourceRef.url=bad;throws(()=>validateLedger(f.ledger,f.product),/URL|HTTPS/);
}
for (const mutate of [p=>p.nodes.push(clone(p.nodes[0])),p=>delete p.circuits,p=>p.transformers=null,p=>p.nodes[0].node='',p=>p.circuits[0].node_2='bad\nnode']) {
  const f=await fixture();mutate(f.product);throws(()=>validateLedger(f.ledger,f.product),/Grid Journey evidence/);
}
await rejects(()=>prepareJourneyEvidence(pair.networkText+' ',pair.ledger),/source digest/);

// Callers cannot change the source/ledger/query while Web Crypto is pending.
const mutable = await fixture(), callerBytes = Buffer.from(mutable.networkText), callerLedger = clone(mutable.ledger);
const callerQuery = {seed: {chosenNode: 'A'}, bounds: {maxMoves: 10}, sourceBundleSha: mutable.ledger.sourceBundleSha};
const pendingPlan = planJourney({sourceBytes: callerBytes, ledger: callerLedger, query: callerQuery});
callerBytes.fill(32); callerLedger.nodes[0].identity.status = 'ambiguous';
callerQuery.seed.chosenNode = 'B'; callerQuery.bounds.maxMoves = 0; callerQuery.sourceBundleSha = '0'.repeat(64);
const snapshotted = await pendingPlan;
eq(snapshotted.seedNode, 'A'); eq(snapshotted.status, 'complete'); eq(snapshotted.steps.length, 2);
eq(snapshotted.sourceBundleSha, mutable.ledger.sourceBundleSha); continuity(snapshotted);

const polyline=await fixture(), e=polyline.ledger.edges[0], coords=polyline.ledger.nodes.map(n=>n.location.coordinates);
e.geometryStatus='verified_circuit_and_polyline';e.geometry={coordinates:[coords[0],[0.005,51.001],coords[1]],sourceRef:source('/polyline/0'),review:review('polyline'),rights:rights()};
result=await planJourney(polyline);eq(result.edgeCatalog[0].schematic,false);eq(result.edgeCatalog[0].coordinates,e.geometry.coordinates);continuity(result);
e.geometry.coordinates.reverse();result=await planJourney(polyline);eq(result.edgeCatalog[0].coordinates[0],coords[0],'catalog orientation follows explicit node1');
e.geometry.coordinates[0]=[2,52];result=await planJourney(polyline);eq(result.eligibleEdges,0);eq(result.excluded.refusalCounts.geometry_endpoint_mismatch,1);

// Iterative traversal: depth exceeds typical JavaScript recursion limits.
const count=12000,deep=await fixture({nodes:Array.from({length:count},(_,i)=>({id:'D'+i,kv:132})),circuits:Array.from({length:count-1},(_,i)=>['D'+i,'D'+(i+1)]),located:false});
result=await planJourney({...deep,query:{...deep.query,bounds:{maxNodes:count,maxEdges:count,maxMoves:count*2,maxGeometryBytes:0}}});
eq(result.status,'complete');eq(result.visitedUniqueEdges,count-1);eq(result.steps.length,(count-1)*2);eq(result.endNode,'D0');eq(result.coverage,1);continuity(result);

console.log(`edge-cover-journey PASS — ${checks} checks`);
