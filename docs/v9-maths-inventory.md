# V9 grid-engine maths inventory

Sources: `gridatlas` @ `64268fd06a0da54ddffbcdaaaee382e314e829f7`, `grid-distance-maths` @ `30d2f817a4b007b7c3be334f3aff308331a848b8`.
All line numbers verified with `sed -n` against the working tree.

---

## 1. geodesy
**Path:** `gridatlas/atlas/modules/202609011950-geodesy.js` (145 lines)
Registers `window.__GRIDATLAS_MODULES__.geodesy`.

| export | args (units) | returns (units) | formula |
|---|---|---|---|
| `EARTH_RADIUS_KM` | — | constant, km | `6378.137` (WGS84 semi-major axis) |
| `distanceKm(lon1, lat1, lon2, lat2)` | degrees | km | haversine, atan2 form: `R·2·atan2(√a, √(1-a))`, `a = sin²(Δlat/2) + cosφ1·cosφ2·sin²(Δlon/2)` |
| `representativePoint(geometry)` | GeoJSON geometry (Point/Polygon/MultiPolygon) | `[lon, lat]` or `null` | mean of the outer ring's vertices (not the first vertex); Point passes through; anything else (e.g. LineString) → `null` |
| `voltagesKv(properties)` | GeoJSON feature properties | `number[]` kV, descending, deduped | reads `kv`/`KV` as already-kV; reads `voltage`/`VOLTAGE` as **volts** and divides by 1000 |
| `destinationPoint(lon, lat, km, bearingDeg)` | degrees, km, degrees | `[lon, lat]` degrees | spherical direct/forward geodesic problem |
| `initialBearingDeg(lon1, lat1, lon2, lat2)` | degrees | degrees, 0-360 | spherical initial bearing |

**Numerical assumptions:** spherical earth, single fixed radius 6378.137 km (WGS84 **semi-major axis**, i.e. equatorial radius — not a mean radius). No small-angle approximation; full trig. No ellipsoidal correction anywhere in this module. The atan2 form is used deliberately (not asin) — the module's own comment records that swapping to `2R·asin(√a)` changes the 16th significant figure and was rejected purely to preserve bit-for-bit parity with the incumbent `ventus-corev8engine.js haversine()`, not for any numerical-stability reason.

---

## 2. nearest-search (substation-lookup)
**Path:** `gridatlas/atlas/modules/202609011950-substation-lookup.js` (82 lines)
Registers `window.__GRIDATLAS_MODULES__.substationLookup`. **Not composed into the live Atlas — see duplication.md 2(a).**

| export | args (units) | returns | formula |
|---|---|---|---|
| `normalise(name)` | string | canonicalised uppercase key | strips non-alnum, strips a fixed noise-word list (SUBSTATION, GRID, 400KV, NGET, …) |
| `index(points)` | `{name, location:{lon,lat}, voltages_kv}[]` | `{size, located, byName(name), nearest(lon, lat, options)}` | builds a `Map` keyed by `normalise(name)` and a flat `located[]` array once |
| `.nearest(lon, lat, {minimumKv, limit})` | degrees, kV floor, count | one match `{point, km}` or array | **exhaustive O(n) scan** over every located point, filters by `max(voltages_kv) >= minimumKv`, computes `geodesy.distanceKm` for every candidate, sorts ascending, slices. No bbox/ring pre-filter of any kind. |

**Numerical assumptions:** inherits geodesy's sphere/radius. No pre-filtering means it cannot exhibit the ring-search-excludes-true-nearest bug class (see duplication.md), at the cost of being O(n) per query.

---

## 3. network-topology
Two committed versions; **202609012245 is a strict superset of 202609012145** (`at()` byte-identical, verified by `diff`; 202609012245 adds `physicalUnits()` and `graph()`).

**Path:** `gridatlas/atlas/modules/202609012245-network-topology.js` (384 lines, supersedes the 279-line 202609012145 version)
Registers `window.__GRIDATLAS_MODULES__.networkTopology`. Accepts schema `data-grid-gb.transmission-network.v1`.

| export | args | returns | notes |
|---|---|---|---|
| `index(product)` | parsed transmission-network payload | index object with `.site(key)`, `.at(key, options)`, `.graph()`, or `null` if schema mismatches | fail-closed on unrecognised schema |
| `.at(key, {voltageKv})` | site code/name, optional kV filter | per-voltage bands of circuits/transformers/planned_changes, physical-unit counts, neighbour sites | **never a site-wide range** — grouped strictly by node voltage |
| `.graph()` | — | `{has, nodeVoltageKv, nodeSiteCode, edgesAt, nodesOfSite, siteByCode, ratingsOf, parametersOf}` | adjacency view added at 202609012245 so electrical-distance doesn't rebuild one |
| `physicalUnits(records)` | branch records | integer count | de-duplicates a branch counted once per end it lands on at the same site (a transformer's two windings, or an internal circuit) — pairs keyed by `(from_node,to_node)`, taking `max(forward,reverse)` when seen from both directions, else `forward+reverse` |
| `voltageOf(node)` (internal) | node record | kV or `null` | trusts `voltage_kv` **only** when `voltage_consistent_with_site === true`; never decodes the node-code digit convention |

**Numerical assumptions:** none — this is graph/set arithmetic only, no distance, no coordinate is ever touched (module's own header states this explicitly). R/X/B percentages are carried, never combined.

---

## 4. electrical-distance
**Path:** `gridatlas/atlas/modules/202609012245-electrical-distance.js` (365 lines)
Registers `window.__GRIDATLAS_MODULES__.electricalDistance`. Requires a `network-topology` index whose `.graph()` reports schema `gridatlas.module.network-topology.graph.v1`.

| export | args | returns | formula |
|---|---|---|---|
| `between(index, fromKey, toKey, {voltageKv, maxHops=6})` | site codes/names | fewest-hop path object: `hops`, `path[]` (each hop with R/X/B, ratings, voltage-change flag), `ties`, `refusals[]` | **breadth-first search** over the graph, hop count only (not km); a circuit whose ends carry two different declared voltages is refused unless the edge is a transformer |
| `within(index, key, {hops=2, voltageKv})` | site code/name, hop budget | every site reached within N hops, tagged with the hop depth first reached | same BFS, collects reached sites instead of stopping at one target |

**Numerical assumptions:** none — hop count is an integer graph distance, explicitly documented as **not** a kilometre distance and **not** an impedance sum (R, X, B are carried per-hop on a 100 MVA base and never combined — module contains no arithmetic over them, which is asserted structurally, not just by convention).

---

## 5. rating-envelope
**Path:** `gridatlas/atlas/modules/202609012250-rating-envelope.js` (213 lines)
Registers `window.__GRIDATLAS_MODULES__.ratingEnvelope`. Requires the same `network-topology.graph.v1`.

| export | args | returns | formula |
|---|---|---|---|
| `at(index, key, {voltageKv})` | site code/name, optional kV filter | per-circuit seasonal ratings (winter/spring/summer/autumn MVA), flags, and a per-season `{lowest_circuit_mva, highest_circuit_mva}` **range** | range = `Math.min`/`Math.max` across qualifying circuits' published values — **never a sum, never a mean** |
| `IMPLAUSIBLE_MVA` | — | constant `9999` | any seasonal value `>= 9999` MVA is flagged as a placeholder and excluded from the range (not from the reported circuit) |

**Numerical assumptions:** none beyond simple min/max; explicitly refuses summation (structurally, by construction of the returned object — no site-total field exists).

---

## 6. corridor-estimate
**Path:** `gridatlas/atlas/modules/202609030205-corridor-estimate.js` (114 lines)
Registers `window.__GRIDATLAS_MODULES__.corridorEstimate`. No dependency — pure scalar function on a caller-supplied km.

| export | args (units) | returns | formula |
|---|---|---|---|
| `forCable(km)` | great-circle km | `{km, factor, straight_km, withheld}` or `null` | `km_estimate = straight_km × 1.245` for cable circuits; returns `withheld` (no estimate) below `MINIMUM_KM = 1` |
| `CABLE_FACTOR` | — | `1.245` | calibrated against 95 published GB transmission cable circuits (59 distinct site pairs); median absolute error 8.45%, 73% within 15% |
| `OHL_FACTOR` | — | `1.13` | published for reference only — **no `forOverhead()` function exists**; deliberately unimplemented so the module cannot be misused for overhead-line questions |

**Numerical assumptions:** a fixed empirical multiplier, not a physical/geometric model; explicitly not valid under ~1 km separation (site-centroid resolution dominates: median published length 0.59 km, median error 52.5% in that band).

---

## 7. sizing-arithmetic
**Path:** `gridatlas/atlas/modules/202609012205-sizing-arithmetic.js` (573 lines)
Registers `window.__GRIDATLAS_MODULES__.sizingArithmetic`. No geodesy/distance dependency — plant-sizing and financial screening arithmetic for the SLD sandbox (string/central PV topology, DC/AC ratios, 35-year revenue/capex model).

Key exports: `buildStats`, `consistency` (design/export/headroom DC-AC ratios), `stringStats`, `centralStats`, `screeningFinance` (port of `gis-sld-v5-finance.js`), `computeStats`, `fitToStatedCapacity` (two-variable integer-topology fit to a target MW, **impure** — mutates the caller's `sld` object and calls back into a caller-supplied `computeSldStats()`).

**Numerical assumptions:** none earth-model related. Documents a corrected double-count bug (`centralStats`, source lines ~227-247) inherited from `gis-sld-v5-calculations.js` line 147, where `total_blocks` (already containing `inv_per_mv_c`) was multiplied a second time by an inverter rating and by a transformer rating that doesn't exist as a quantity — the corrected form takes `Math.min(inverter_ac_total, skid_ac_total)`.

---

## Not extracted but load-bearing context

- **`gridatlas/atlas/cartridges/202609041330-substation-intelligence-v9-63.js`** (6,277 lines) is the actual live script (composition `replace_script: ventus-corev8engine.js`). It carries its **own inline copies** of `geodesy`, `networkTopology`, `electricalDistance`, `ratingEnvelope`, and a hand-rolled nearest-substation search (`state.nearest`, lines 6083-6092) that duplicates but does not call `substation-lookup.js`. See duplication.md.
- **`grid-distance-maths/src/geodesy.mjs`** (411 lines, the estate's canonical repo) is the reference this whole extraction is meant to converge on. It additionally exports `distanceEllipsoidalKm` (Vincenty inverse, WGS84 ellipsoid, mm-grade), `distanceToSegmentKm`/`distanceToLineKm` (point-to-polyline projection on a local tangent plane), `polygonAreaKm2`, `geodesicCircle`, and `SpatialIndex` — a cell-bucketed ring-search nearest-neighbour with a **proven early-termination bound** (`sweptClearanceKm`). None of the gridatlas modules above use `SpatialIndex`; all current nearest-search code in gridatlas is an unindexed exhaustive scan (correct but O(n), not the fast/indexed path this canonical repo offers).
