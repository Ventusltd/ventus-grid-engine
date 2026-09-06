/* build-graph.mjs — generates genome/engine-graph.json from a named node/edge
 * list, so edges are written by name (not by hand-counted array index) and a
 * transcription error becomes a ReferenceError instead of a wrong edge.
 *
 * This script is NOT part of verify.mjs and is not a proof. It is a one-time
 * (and CI-rerunnable) generator, matching the brief's request that the CI
 * workflow "regenerates the graph". Run manually with:
 *   node genome/build-graph.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Nodes. `id` is the stable key edges reference below; `type` drives the
// badge/colour in genome/index.html (see its BADGE/RAG/ECSS tables, which
// extend — not replace — the Spider Sandbox vocabulary read from
// data-federation-map-for-globalgrid2050-all-repos/dashboard/sandbox/spider_full_po_test.html).
const nodes = [
  // ---- Canonical, ventus-grid-engine/engine + deeplink (rag: green) ----
  { id: 'geo-core', label: 'engine/geo-core.js', type: 'canonical', rag: 'green',
    reason: 'the one haversine + R_ATLAS/R_UK/R_MEAN, (lon,lat) order',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/geo-core.js' },
  { id: 'geo-area', label: 'engine/geo-area.js', type: 'canonical', rag: 'green',
    reason: 'polygonAreaKm2, polylinePerimeterKm, circleCapAreaKm2',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/geo-area.js' },
  { id: 'geo-shapes', label: 'engine/geo-shapes.js', type: 'canonical', rag: 'green',
    reason: 'destinationCirclePoints, the deduplicated circle generator',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/geo-shapes.js' },
  { id: 'geo-geojson', label: 'engine/geo-geojson.js', type: 'canonical', rag: 'green',
    reason: 'circleFeatureCollection, GeoJSON shaping kept out of the maths',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/geo-geojson.js' },
  { id: 'v9-geodesy', label: 'engine/v9-geodesy.js', type: 'canonical', rag: 'green',
    reason: 'distanceKm, destinationPoint, initialBearingDeg, voltagesKv, representativePoint',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/v9-geodesy.js' },
  { id: 'v9-nearest-search', label: 'engine/v9-nearest-search.js', type: 'canonical', rag: 'green',
    reason: 'normalise + index, exhaustive scan, proven free of the ring-search bug',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/v9-nearest-search.js' },
  { id: 'deeplink-contract', label: 'deeplink/contract.js', type: 'canonical', rag: 'green',
    reason: 'buildDeepLink/parseDeepLink, LAYER_ID_FOR_BUCKET, the MAP button as one testable thing',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/deeplink/contract.js' },
  { id: 'network-topology', label: 'engine/network-topology.js', type: 'canonical', rag: 'green',
    reason: 'PROMOTED this session: index/at/graph over one site’s published nodes/branches',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/network-topology.js' },
  { id: 'electrical-distance', label: 'engine/electrical-distance.js', type: 'canonical', rag: 'green',
    reason: 'PROMOTED this session: between/within, BFS hop-count over network-topology.graph()',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/electrical-distance.js' },
  { id: 'rating-envelope', label: 'engine/rating-envelope.js', type: 'canonical', rag: 'green',
    reason: 'PROMOTED this session: at(), per-season lowest/highest range, never summed',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/rating-envelope.js' },
  { id: 'corridor-estimate', label: 'engine/corridor-estimate.js', type: 'canonical', rag: 'green',
    reason: 'PROMOTED this session: forCable(), calibrated straight-line-to-corridor multiplier',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/corridor-estimate.js' },
  { id: 'published-fault-level', label: 'engine/published-fault-level.js', type: 'canonical', rag: 'green',
    reason: 'AUTHORED 2026-09-05: record() and quote() for a fault figure that is published, dated and named by exact metric; no callable computes a current or a headroom, and the proof asserts that absence. Vocabulary copied from data-grid-gb ingest_etys.py FAULT_COLUMNS.',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/published-fault-level.js' },
  { id: 'electrification-demand', label: 'engine/electrification-demand.js', type: 'canonical', rag: 'green',
    reason: 'AUTHORED 2026-09-06: the arithmetic of the electrification paper made exact — average power, peak from a stated load factor, load factor measured from a published peak, nameplate at a capacity factor, and electricity for displaced fuel. Every worked example in the paper is recomputed by the proof. No callable returns headroom, connection availability, per-site uplift or adequacy, and the proof asserts that absence.',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/electrification-demand.js' },
  { id: 'firm-capacity', label: 'engine/firm-capacity.js', type: 'canonical', rag: 'green',
    reason: 'AUTHORED 2026-09-06: N-1 firm capacity, apparent power from a stated power factor, and utilisation against a caller-supplied rating. Exposes the gap the paper names - a site at 42 MVA on two 30 MVA units is 70% of installed and 140% of firm. Refuses spare capacity, connection availability, cyclic ratings and P2/7 compliance; the proof asserts that absence.',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/firm-capacity.js' },
  { id: 'diversified-demand', label: 'engine/diversified-demand.js', type: 'canonical', rag: 'green',
    reason: 'AUTHORED 2026-09-06: After Diversity Maximum Demand, coincidence measured from a group peak rather than assumed, and average-across-a-window kept separate from peak-inside-a-window. The paper's 10 million vehicles read 2.85 GW annual average, 8.56 GW across an 8-hour window and 14 GW at 20% coincidence - the same vehicles, differing by a factor of five.',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/diversified-demand.js' },
  { id: 'connection-capacity', label: 'engine/connection-capacity.js', type: 'canonical', rag: 'green',
    reason: 'AUTHORED 2026-09-06: sizing against a STATED connection cap for developers, EPCs and heavy users. Exceedance over a profile, battery power from the peak excess and store from the area above the cap, solar clipping, and net position against separate import/export caps. A spike and a plateau share a peak and need eight times the store; the proof holds both.',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/engine/connection-capacity.js' },

  // ---- Staged, unpromoted (rag: blue) ----
  { id: 'sizing-arithmetic-extract', label: 'sources/v9-extracts/sizing-arithmetic.mjs', type: 'extract', rag: 'blue',
    reason: 'staged verbatim, promotion DECLINED this session — impure + financial-domain, see population-plan.md §4',
    gh: 'https://github.com/Ventusltd/ventus-grid-engine/blob/main/sources/v9-extracts/sizing-arithmetic.mjs' },

  // ---- Fragments: geodesy / haversine family ----
  { id: 'v8-haversine', label: 'ventus-corev8engine.js haversine()', type: 'fragment', rag: 'green',
    reason: 'the one distance primitive in the V8 monolith, correctly reused everywhere — not duplicated',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/repd_grid_atlasv8/ventus-corev8engine.js#L45-L50' },
  { id: 'gridatlas-geodesy-module', label: 'gridatlas 202609011950-geodesy.js', type: 'fragment', rag: 'green',
    reason: 'live, composed module; source that engine/v9-geodesy.js was extracted from, byte-identical',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609011950-geodesy.js' },
  { id: 'gridatlas-cartridge-geodesy-1', label: 'substation-intelligence cartridge, geodesy copy #1', type: 'fragment', rag: 'amber',
    reason: 'inline legacy V8 haversine at line 57 of a 6,277-line composed cartridge',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/cartridges/202609041330-substation-intelligence-v9-63.js#L57-L71' },
  { id: 'gridatlas-cartridge-geodesy-2', label: 'substation-intelligence cartridge, geodesy copy #2', type: 'fragment', rag: 'amber',
    reason: 'a SECOND inline NS.geodesy IIFE at line 1544 of the SAME file as copy #1',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/cartridges/202609041330-substation-intelligence-v9-63.js#L1541-L1550' },
  { id: 'neon-links-geodesy', label: 'neon-substation-links-v9-6.js R_ATLAS/distanceKm', type: 'fragment', rag: 'amber',
    reason: 'hand-rolled constant and distance function, own comment: “the house constant”',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/cartridges/202608311910-neon-substation-links-v9-6.js#L120' },
  { id: 'pipelinenews-grid-proximity-geodesy', label: 'grid-proximity/build_payload.py haversine_km()', type: 'fragment', rag: 'amber',
    reason: 'hand-rolled A_WGS84/R_ATLAS + haversine_km, does not import grid-distance-maths despite a sibling cartridge doing so',
    gh: 'https://github.com/Ventusltd/pipelinenews/blob/main/tools/intelligence/cartridges/grid-proximity/build_payload.py#L44-L90' },
  { id: 'pipelinenews-grid-distance-column', label: 'grid-distance-column/build_payload.py', type: 'fragment', rag: 'green',
    reason: 'the POSITIVE control: imports grid-distance-maths/src/geodesy.py directly and refuses to run without it',
    gh: 'https://github.com/Ventusltd/pipelinenews/blob/main/tools/intelligence/cartridges/grid-distance-column/build_payload.py#L50-L69' },
  { id: 'grid-distance-maths-geodesy', label: 'grid-distance-maths/src/geodesy.mjs', type: 'reference', rag: 'blue',
    reason: 'the estate’s canonical geodesy repository — R_ATLAS/R_UK/R_MEAN identical to geo-core.js, by design',
    gh: 'https://github.com/Ventusltd/grid-distance-maths/blob/main/src/geodesy.mjs' },

  // ---- Fragments: area / circle-point (V8 monolith) ----
  { id: 'v8-area-a', label: 'ventus-corev8engine.js _zoneDrawCalcArea (Impl A)', type: 'fragment', rag: 'green',
    reason: 'spherical-excess polygon area, Zone Draw tool',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/repd_grid_atlasv8/ventus-corev8engine.js#L134-L149' },
  { id: 'v8-area-b', label: 'ventus-corev8engine.js updateMeasureDisplay (Impl B)', type: 'fragment', rag: 'amber',
    reason: 'the identical shoelace-on-sphere formula, copy-pasted into the Measure tool',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/repd_grid_atlasv8/ventus-corev8engine.js#L481-L490' },
  { id: 'v8-area-c', label: 'ventus-corev8engine.js doRadiusAreaMeasure (Impl C)', type: 'fragment', rag: 'green',
    reason: 'spherical-cap area — a different question, correctly kept separate',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/repd_grid_atlasv8/ventus-corev8engine.js#L576-L582' },
  { id: 'v8-circle-a', label: 'ventus-corev8engine.js _zoneDrawCirclePoints', type: 'fragment', rag: 'green',
    reason: 'destination-point circle generator, Zone Draw (n=24)',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/repd_grid_atlasv8/ventus-corev8engine.js#L122-L132' },
  { id: 'v8-circle-b', label: 'ventus-corev8engine.js createGeoJSONCircle', type: 'fragment', rag: 'amber',
    reason: 'byte-identical destination-point formula, Radius tool (n=64/96/128), plus FeatureCollection wrapping',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/repd_grid_atlasv8/ventus-corev8engine.js#L727-L740' },

  // ---- Fragments: sizing-arithmetic double-count bug (5 live copies) ----
  { id: 'sld-calc-v5', label: 'solar-bess-topology-v5/gis-sld-v5-calculations.js', type: 'fragment', rag: 'red',
    reason: 'ac_mw_direct double-count bug, line 147, LIVE and unfixed',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/solar-bess-topology-v5/gis-sld-v5-calculations.js#L147' },
  { id: 'sld-calc-v6', label: 'solar-bess-topology-v6/.../gis-sld-v5-calculations.js', type: 'fragment', rag: 'red',
    reason: 'the same bug, same line number, byte-identical',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/solar-bess-topology-v6/gis-sld-financial-sandbox/gis-sld-v5-calculations.js#L147' },
  { id: 'sld-calc-v7', label: 'solar-bess-topology-v7/.../gis-sld-v5-calculations.js', type: 'fragment', rag: 'red',
    reason: 'the same bug, same line number, byte-identical',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/solar-bess-topology-v7/gis-sld-financial-sandbox/gis-sld-v5-calculations.js#L147' },
  { id: 'sld-calc-v8a', label: 'solar-bess-topology-v8/bess-gis-sld-financial-sandbox/gis-sld-v5-calculations.js', type: 'fragment', rag: 'red',
    reason: 'the same bug, same line number, byte-identical',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/solar-bess-topology-v8/bess-gis-sld-financial-sandbox/gis-sld-v5-calculations.js#L147' },
  { id: 'sld-calc-v8b', label: 'solar-bess-topology-v8/bess-pcs-standalone/gis-sld-v5-calculations.js', type: 'fragment', rag: 'red',
    reason: 'the same bug, same line number, byte-identical — fifth copy',
    gh: 'https://github.com/Ventusltd/globalgrid2050/blob/main/solar-bess-topology-v8/bess-pcs-standalone/gis-sld-v5-calculations.js#L147' },
  { id: 'gridatlas-sizing-arithmetic', label: 'gridatlas 202609012205-sizing-arithmetic.js', type: 'fragment', rag: 'green',
    reason: 'the CORRECTED port: Math.min(inverter_ac_total, skid_ac_total) — the fix none of the five above has',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609012205-sizing-arithmetic.js#L220-L250' },

  // ---- Fragments: nearest-search ----
  { id: 'gridatlas-substation-lookup', label: 'gridatlas 202609011950-substation-lookup.js', type: 'fragment', rag: 'grey',
    reason: 'committed but DEAD — zero manifests reference it; source engine/v9-nearest-search.js was extracted from',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609011950-substation-lookup.js' },
  { id: 'gridatlas-cartridge-nearest', label: 'substation-intelligence cartridge, inline nearest()', type: 'fragment', rag: 'red',
    reason: 'live duplicate, LESS defensive than the dead module — can throw on a point with no voltages_kv',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/cartridges/202609041330-substation-intelligence-v9-63.js#L6014-L6095' },
  { id: 'declared-connections-nearest', label: 'declared-connections.js nearestTransmission()', type: 'fragment', rag: 'amber',
    reason: 'hand-rolled running-min scan, correct by construction but not importing the shared search',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609012128-declared-connections.js#L213-L244' },
  { id: 'pipelinenews-ring-search', label: 'grid-proximity/build_payload.py nearest_segment()/nearest_substations()', type: 'fragment', rag: 'green',
    reason: 'the estate’s REFERENCE ring-search: cell-bucketed with a proven early-termination bound; grid-distance-maths credits it as origin',
    gh: 'https://github.com/Ventusltd/pipelinenews/blob/main/tools/intelligence/cartridges/grid-proximity/build_payload.py#L190-L299' },

  // ---- Fragments: deep-link ----
  { id: 'pipelinenews-spine-emitter', label: 'atlas-pointer-deep-link.mjs buildAtlasV9DeepLink()', type: 'fragment', rag: 'amber',
    reason: 'the LIVE emitter app.mjs actually imports; hand-rolls its own URL construction',
    gh: 'https://github.com/Ventusltd/pipelinenews/blob/main/releases/202609032329-pipelinenews/assets/202608312037-atlas-pointer-deep-link.mjs#L156-L187' },
  { id: 'pipelinenews-wider-fleet-emitter', label: 'wider-fleet.mjs atlasLink()', type: 'fragment', rag: 'amber',
    reason: 'a SECOND, independent emitter for ~20 non-spine technology types; its own URLSearchParams, own code path',
    gh: 'https://github.com/Ventusltd/pipelinenews/blob/main/tools/intelligence/cartridges/wider-fleet/assets/wider-fleet.mjs#L58-L70' },
  { id: 'gridatlas-bucket-table', label: 'sld-sandbox-technology-buckets.js LAYER_ID_FOR_BUCKET', type: 'fragment', rag: 'green',
    reason: 'the LIVE source table deeplink/contract.js copied verbatim from; the v9.109 100%-failure fix',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/parts/202609041234-sld-sandbox-technology-buckets.js#L266-L276' },
  { id: 'gridatlas-v8-delegation', label: 'ventus-corev8engine-exact-repd-delegation.js', type: 'fragment', rag: 'grey',
    reason: 'the engine’s OWN former deep-link handler, now inert: publishes DEFERRED_TO_EXACT_REPD_RECEIVER and returns',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/parts/202609040229-ventus-corev8engine-exact-repd-delegation.js#L796-L840' },
  { id: 'gridatlas-identity-receiver', label: 'place-global-search-arrival-identity.js receiveExactRepdDeepLink()', type: 'fragment', rag: 'red',
    reason: 'the LIVE receiver-side parse — its identity regex is BROADER than the emitter’s, a live pattern drift',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/parts/202609040229-place-global-search-arrival-identity.js#L566-L747' },

  // ---- Fragments: the composed live sources of the four newly-promoted modules ----
  { id: 'gridatlas-network-topology-live', label: 'gridatlas 202609012245-network-topology.js', type: 'fragment', rag: 'green',
    reason: 'live, composed module — the direct source engine/network-topology.js was promoted from',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609012245-network-topology.js' },
  { id: 'gridatlas-electrical-distance-live', label: 'gridatlas 202609012245-electrical-distance.js', type: 'fragment', rag: 'green',
    reason: 'live, composed module — the direct source engine/electrical-distance.js was promoted from',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609012245-electrical-distance.js' },
  { id: 'gridatlas-rating-envelope-live', label: 'gridatlas 202609012250-rating-envelope.js', type: 'fragment', rag: 'green',
    reason: 'live, composed module — the direct source engine/rating-envelope.js was promoted from',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609012250-rating-envelope.js' },
  { id: 'gridatlas-corridor-estimate-live', label: 'gridatlas 202609030205-corridor-estimate.js', type: 'fragment', rag: 'green',
    reason: 'live, composed module — the direct source engine/corridor-estimate.js was promoted from',
    gh: 'https://github.com/Ventusltd/gridatlas/blob/main/atlas/modules/202609030205-corridor-estimate.js' },
];

// ---------------------------------------------------------------------------
// Edges. `kind` in {duplicates, supersedes, imports, should_import, drifts_from}.
// `evidence` is mandatory: { file, lines, method }.
const edges = [
  // ---- geodesy ----
  { from: 'geo-core', to: 'v8-haversine', kind: 'supersedes',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '45-50',
      method: 'verbatim extraction, verified by sha256 in sources/provenance.json; docs/v8-duplication.md confirms this was the one undupliated primitive' } },
  { from: 'v9-geodesy', to: 'gridatlas-geodesy-module', kind: 'supersedes',
    evidence: { file: 'gridatlas/atlas/modules/202609011950-geodesy.js', lines: '1-145',
      method: 'sources/provenance.json: "otherwise byte-identical to the source"; parity asserted bit-for-bit by proofs/v9-engine.proof.mjs' } },
  { from: 'gridatlas-geodesy-module', to: 'gridatlas-cartridge-geodesy-1', kind: 'duplicates',
    evidence: { file: 'gridatlas/atlas/cartridges/202609041330-substation-intelligence-v9-63.js', lines: '50-71',
      method: 'grep -n EARTH_RADIUS_KM across gridatlas; docs/v9-constants.md row "gridatlas (live cartridge, copy #1)"' } },
  { from: 'gridatlas-cartridge-geodesy-1', to: 'gridatlas-cartridge-geodesy-2', kind: 'duplicates',
    evidence: { file: 'gridatlas/atlas/cartridges/202609041330-substation-intelligence-v9-63.js', lines: '57 and 1544',
      method: 'docs/v9-constants.md finding 3: two EARTH_RADIUS_KM definitions in the same 6,277-line file' } },
  { from: 'gridatlas-cartridge-geodesy-1', to: 'v9-geodesy', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§1, row 1',
      method: 'manual review: this inline copy could be replaced by an import with no behaviour change (constants already agree)' } },
  { from: 'gridatlas-cartridge-geodesy-2', to: 'v9-geodesy', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§1, row 1',
      method: 'same as copy #1 — second inline copy in the same file' } },
  { from: 'neon-links-geodesy', to: 'v9-geodesy', kind: 'duplicates',
    evidence: { file: 'gridatlas/atlas/cartridges/202608311910-neon-substation-links-v9-6.js', lines: '120, 174-180',
      method: 'docs/v9-duplication.md 2(b) item 2: own comment "Identical in form and constant to ventus-corev8engine.js haversine()"' } },
  { from: 'neon-links-geodesy', to: 'v9-geodesy', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§1, row 2', method: 'manual review' } },
  { from: 'pipelinenews-grid-proximity-geodesy', to: 'grid-distance-maths-geodesy', kind: 'duplicates',
    evidence: { file: 'pipelinenews/tools/intelligence/cartridges/grid-proximity/build_payload.py', lines: '44-47, 90',
      method: 'docs/v9-constants.md row "pipelinenews"; A_WGS84/R_ATLAS hard-coded, matches canonical value exactly (no drift)' } },
  { from: 'pipelinenews-grid-proximity-geodesy', to: 'grid-distance-maths-geodesy', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§1, row 3',
      method: 'sibling cartridge grid-distance-column/build_payload.py:50-69 already does this in the same directory' } },
  { from: 'pipelinenews-grid-distance-column', to: 'grid-distance-maths-geodesy', kind: 'imports',
    evidence: { file: 'pipelinenews/tools/intelligence/cartridges/grid-distance-column/build_payload.py', lines: '50-69',
      method: 'source inspection: sys.path.insert + `from geodesy import ...`, raises SystemExit if the canonical repo is not present' } },
  { from: 'geo-core', to: 'grid-distance-maths-geodesy', kind: 'duplicates',
    evidence: { file: 'engine/geo-core.js vs grid-distance-maths/src/geodesy.mjs', lines: '50-60 vs 16-27',
      method: 'value comparison: R_ATLAS/R_UK/R_MEAN identical to the last published digit; README states this repo follows grid-distance-maths/docs/EARTH-MODEL.md by design, so no drift is expected or found' } },

  // ---- area / circle-point ----
  { from: 'geo-area', to: 'v8-area-a', kind: 'supersedes',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '134-149',
      method: 'sources/provenance.json engine/geo-area.js entry' } },
  { from: 'geo-area', to: 'v8-area-b', kind: 'supersedes',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '481-490',
      method: 'sources/provenance.json engine/geo-area.js entry: "Implementations A and B verified numerically identical and collapsed"' } },
  { from: 'v8-area-a', to: 'v8-area-b', kind: 'duplicates',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '134-149 vs 481-490',
      method: 'docs/v8-duplication.md: identical to 8 decimal places on a reference London polygon (0.30664823 km2) and a 1km square' } },
  { from: 'geo-area', to: 'v8-area-c', kind: 'supersedes',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '576-582',
      method: 'sources/provenance.json: "kept separate and unmerged: different question, correct as written"' } },
  { from: 'geo-shapes', to: 'v8-circle-a', kind: 'supersedes',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '122-132',
      method: 'sources/provenance.json engine/geo-shapes.js entry' } },
  { from: 'geo-shapes', to: 'v8-circle-b', kind: 'supersedes',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '727-740',
      method: 'sources/provenance.json engine/geo-shapes.js entry' } },
  { from: 'v8-circle-a', to: 'v8-circle-b', kind: 'duplicates',
    evidence: { file: 'globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js', lines: '122-132 vs 727-740',
      method: 'docs/v8-duplication.md: "0 absolute difference over 64 points" between the two destination-point implementations' } },

  // ---- sizing-arithmetic: the worst duplication found in this crawl ----
  { from: 'sld-calc-v5', to: 'sld-calc-v6', kind: 'duplicates',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v{5,6}/.../gis-sld-v5-calculations.js', lines: '147',
      method: 'grep -n "ac_mw_direct = total_blocks \\* central_skid_mva \\* inv_per_mv" across both files, both 170 lines, byte-identical' } },
  { from: 'sld-calc-v5', to: 'sld-calc-v7', kind: 'duplicates',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v{5,7}/.../gis-sld-v5-calculations.js', lines: '147',
      method: 'grep -n across both files, both 170 lines, byte-identical' } },
  { from: 'sld-calc-v5', to: 'sld-calc-v8a', kind: 'duplicates',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v{5,8}/.../gis-sld-v5-calculations.js', lines: '147',
      method: 'grep -n across both files, both 170 lines, byte-identical' } },
  { from: 'sld-calc-v5', to: 'sld-calc-v8b', kind: 'duplicates',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v5 vs v8/bess-pcs-standalone', lines: '147',
      method: 'grep -n across both files, both 170 lines, byte-identical — fifth copy of the same file' } },
  { from: 'sld-calc-v5', to: 'gridatlas-sizing-arithmetic', kind: 'drifts_from',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v5/gis-sld-v5-calculations.js:147 vs gridatlas/atlas/modules/202609012205-sizing-arithmetic.js:~230',
      method: 'docs/v9-maths-inventory.md §7: shipped defaults give 211.2 MW (bug: total_blocks double-counts inv_per_mv and multiplies by a transformer rating) vs the corrected Math.min(inverter_ac_total=105.6, skid_ac_total=52.8)=52.8 MW' } },
  { from: 'sld-calc-v6', to: 'gridatlas-sizing-arithmetic', kind: 'drifts_from',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v6/.../gis-sld-v5-calculations.js:147', lines: '147',
      method: 'same bug, same worked numbers, confirmed by direct file read of this copy' } },
  { from: 'sld-calc-v7', to: 'gridatlas-sizing-arithmetic', kind: 'drifts_from',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v7/.../gis-sld-v5-calculations.js:147', lines: '147',
      method: 'same bug, same worked numbers, confirmed by direct file read of this copy' } },
  { from: 'sld-calc-v8a', to: 'gridatlas-sizing-arithmetic', kind: 'drifts_from',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v8/bess-gis-sld-financial-sandbox/gis-sld-v5-calculations.js:147', lines: '147',
      method: 'same bug, same worked numbers, confirmed by direct file read of this copy' } },
  { from: 'sld-calc-v8b', to: 'gridatlas-sizing-arithmetic', kind: 'drifts_from',
    evidence: { file: 'globalgrid2050/solar-bess-topology-v8/bess-pcs-standalone/gis-sld-v5-calculations.js:147', lines: '147',
      method: 'same bug, same worked numbers, confirmed by direct file read of this copy' } },
  { from: 'sizing-arithmetic-extract', to: 'gridatlas-sizing-arithmetic', kind: 'duplicates',
    evidence: { file: 'sources/v9-maths-provenance.json', lines: 'extract/sizing-arithmetic.mjs entry',
      method: 'verbatim staged copy, promotion declined this session (see population-plan.md §4) — correctly carries the FIXED form, not the bug' } },

  // ---- nearest-search ----
  { from: 'v9-nearest-search', to: 'gridatlas-substation-lookup', kind: 'supersedes',
    evidence: { file: 'gridatlas/atlas/modules/202609011950-substation-lookup.js', lines: '1-82',
      method: 'sources/provenance.json engine/v9-nearest-search.js entry' } },
  { from: 'gridatlas-substation-lookup', to: 'gridatlas-cartridge-nearest', kind: 'duplicates',
    evidence: { file: 'gridatlas/atlas/cartridges/202609041330-substation-intelligence-v9-63.js', lines: '6014-6095',
      method: 'docs/v9-duplication.md 2(a): full side-by-side diff of normalise() and nearest(), byte-different, semantically near-identical' } },
  { from: 'gridatlas-cartridge-nearest', to: 'v9-nearest-search', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§3, row 1', method: 'manual review' } },
  { from: 'gridatlas-cartridge-nearest', to: 'gridatlas-substation-lookup', kind: 'drifts_from',
    evidence: { file: 'gridatlas/atlas/cartridges/202609041330-substation-intelligence-v9-63.js:6083-6092 vs atlas/modules/202609011950-substation-lookup.js:57-70',
      method: 'docs/v9-duplication.md 2(a) points 2-3: options?.limit ?? 1 vs (options&&options.limit)||1 disagree at limit:0; cartridge lacks the voltages_kv||[] default and can throw where the module cannot — confirmed by proofs/v9-engine.proof.mjs' } },
  { from: 'declared-connections-nearest', to: 'v9-nearest-search', kind: 'duplicates',
    evidence: { file: 'gridatlas/atlas/modules/202609012128-declared-connections.js', lines: '213-244',
      method: 'docs/v9-duplication.md 2(b) item 3: running-min scan over every candidate' } },
  { from: 'declared-connections-nearest', to: 'v9-nearest-search', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§3, row 2', method: 'manual review' } },
  { from: 'pipelinenews-ring-search', to: 'v9-nearest-search', kind: 'duplicates',
    evidence: { file: 'pipelinenews/tools/intelligence/cartridges/grid-proximity/build_payload.py', lines: '190-299',
      method: 'docs/v9-duplication.md 2(b) item 4: same nearest-node concern, but an INDEXED ring-search rather than v9-nearest-search’s exhaustive scan — algorithmically ahead, not a should_import candidate' } },

  // ---- deep-link ----
  { from: 'deeplink-contract', to: 'gridatlas-bucket-table', kind: 'supersedes',
    evidence: { file: 'gridatlas/atlas/parts/202609041234-sld-sandbox-technology-buckets.js', lines: '266-276',
      method: 'sources/provenance.json deeplink/contract.js entry: "LAYER_ID_FOR_BUCKET and layerIdForBucket copied verbatim from the receiver"' } },
  { from: 'gridatlas-bucket-table', to: 'deeplink-contract', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§5, row 3',
      method: 'values already agree byte-for-byte; only packaging (composed, SHA-256-verified cartridge) is open' } },
  { from: 'pipelinenews-spine-emitter', to: 'deeplink-contract', kind: 'duplicates',
    evidence: { file: 'pipelinenews/.../202608312037-atlas-pointer-deep-link.mjs', lines: '104-187',
      method: 'docs/deeplink-contract.md §1a; sources/provenance.json: "buildDeepLink and parseDeepLink are NEW... neither was a reusable function" before this extraction' } },
  { from: 'pipelinenews-spine-emitter', to: 'deeplink-contract', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§5, row 1', method: 'manual review' } },
  { from: 'pipelinenews-wider-fleet-emitter', to: 'pipelinenews-spine-emitter', kind: 'duplicates',
    evidence: { file: 'pipelinenews/tools/intelligence/cartridges/wider-fleet/assets/wider-fleet.mjs', lines: '58-70',
      method: 'docs/deeplink-contract.md §1b: "a SECOND cartridge... builds its own URLSearchParams independently... own code path"' } },
  { from: 'pipelinenews-wider-fleet-emitter', to: 'deeplink-contract', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§5, row 1', method: 'manual review' } },
  { from: 'gridatlas-v8-delegation', to: 'deeplink-contract', kind: 'duplicates',
    evidence: { file: 'gridatlas/atlas/parts/202609040229-ventus-corev8engine-exact-repd-delegation.js', lines: '796-840',
      method: 'docs/deeplink-contract.md §3 Step 2: re-parses repd_ref/technology, validates, then publishes DEFERRED_TO_EXACT_REPD_RECEIVER and returns — inert but structurally a second parser' } },
  { from: 'gridatlas-identity-receiver', to: 'deeplink-contract', kind: 'should_import',
    evidence: { file: 'genome/population-plan.md', lines: '§5, row 2', method: 'manual review' } },
  { from: 'gridatlas-identity-receiver', to: 'pipelinenews-spine-emitter', kind: 'drifts_from',
    evidence: { file: 'gridatlas/atlas/parts/202609040229-place-global-search-arrival-identity.js:604 vs pipelinenews/.../atlas-pointer-deep-link.mjs:161',
      method: 'docs/deeplink-contract.md §3 Step 1 and §1a: receiver regex /^[A-Za-z0-9-]{1,40}$/ vs emitter regex /^\\d+$/ — the receiver silently accepts identities the live emitter would never send' } },

  // ---- the composed live sources this session promoted from ----
  { from: 'network-topology', to: 'gridatlas-network-topology-live', kind: 'supersedes',
    evidence: { file: 'gridatlas/atlas/modules/202609012245-network-topology.js', lines: '1-384',
      method: 'sources/provenance.json engine/network-topology.js entry (added this session); sha256 recorded' } },
  { from: 'electrical-distance', to: 'gridatlas-electrical-distance-live', kind: 'supersedes',
    evidence: { file: 'gridatlas/atlas/modules/202609012245-electrical-distance.js', lines: '1-365',
      method: 'sources/provenance.json engine/electrical-distance.js entry (added this session); sha256 recorded' } },
  { from: 'rating-envelope', to: 'gridatlas-rating-envelope-live', kind: 'supersedes',
    evidence: { file: 'gridatlas/atlas/modules/202609012250-rating-envelope.js', lines: '1-213',
      method: 'sources/provenance.json engine/rating-envelope.js entry (added this session); sha256 recorded' } },
  { from: 'corridor-estimate', to: 'gridatlas-corridor-estimate-live', kind: 'supersedes',
    evidence: { file: 'gridatlas/atlas/modules/202609030205-corridor-estimate.js', lines: '1-114',
      method: 'sources/provenance.json engine/corridor-estimate.js entry (added this session); sha256 recorded' } },
  { from: 'electrical-distance', to: 'network-topology', kind: 'imports',
    evidence: { file: 'engine/electrical-distance.js', lines: '21-22, 111-113',
      method: 'source inspection: REQUIRES = "gridatlas.module.network-topology.graph.v1"; between()/within() call index.graph() and refuse to run on a mismatched schema; exercised by proofs/electrical-distance.proof.mjs' } },
  { from: 'rating-envelope', to: 'network-topology', kind: 'imports',
    evidence: { file: 'engine/rating-envelope.js', lines: '21-22, 85-87',
      method: 'source inspection: REQUIRES = "gridatlas.module.network-topology.graph.v1"; at() calls index.graph() and refuses on schema mismatch; exercised by proofs/rating-envelope.proof.mjs' } },
];

const idIndex = new Map(nodes.map((n, i) => [n.id, i]));
for (const e of edges) {
  if (!idIndex.has(e.from)) throw new Error('unknown edge.from: ' + e.from);
  if (!idIndex.has(e.to)) throw new Error('unknown edge.to: ' + e.to);
}

const KIND_LABEL = {
  duplicates: 'duplicates',
  supersedes: 'supersedes',
  imports: 'imports',
  should_import: 'should import',
  drifts_from: 'drifts from'
};

const graph = {
  schema: 'ventus-grid-engine.genome.v1',
  label: 'ventus-grid-engine genome · the spider pattern applied to the engine’s own maths',
  generated_utc: new Date().toISOString(),
  note: 'Nodes and edges match the node shape used by the live Spider Sandbox '
    + '(data-federation-map-for-globalgrid2050-all-repos/dashboard/sandbox/spider_full_po_test.html: '
    + 'SCOPES[key].nodes = [{label,type,rag,reason,gh,ext,child}], edges = [from,to,type]). '
    + 'Edges here are objects, not bare [from,to,type] tuples, because every edge in this '
    + 'genome must carry evidence; edge.type stays a plain string for compatibility with a '
    + 'receiver expecting the tuple shape (read edges[i].type, .from, .to as the tuple).',
  focus_default: idIndex.get('geo-core'),
  kind_labels: KIND_LABEL,
  nodes: nodes.map(({ id, ...rest }) => rest),
  node_ids: nodes.map(n => n.id), // parallel array: node_ids[i] is nodes[i]'s stable key
  edges: edges.map(e => ({
    from: idIndex.get(e.from),
    to: idIndex.get(e.to),
    type: e.kind,
    evidence: e.evidence
  }))
};

const counts = {};
for (const e of graph.edges) counts[e.type] = (counts[e.type] || 0) + 1;
graph.edge_kind_counts = counts;

writeFileSync(join(here, 'engine-graph.json'), JSON.stringify(graph, null, 2) + '\n');
console.log('wrote genome/engine-graph.json:', nodes.length, 'nodes,', edges.length, 'edges');
console.log('edge kinds:', JSON.stringify(counts));
