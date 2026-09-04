# Population plan

What each duplicate fragment found across the estate would import instead of
its current hand-rolled copy, the exact import line, and what would have to
be proven before the swap is safe. Every row below is sourced from
`docs/v9-duplication.md`, `docs/v8-duplication.md`, `docs/v9-constants.md`,
`docs/deeplink-contract.md`, `sources/provenance.json`, and this promotion's
own crawl (file:line evidence in `genome/engine-graph.json`). Nothing here
was fixed in the fragment's own repository — that stays out of scope for
this repository, same as the existing docs — but the swap is written down
precisely enough that doing it later is a decision, not an excavation.

Node/edge indices below refer to `genome/engine-graph.json`.

---

## 1. Geodesy / haversine

**gridatlas live cartridge, two inline copies of the same module**
(`atlas/cartridges/202609041330-substation-intelligence-v9-63.js:57-71` and
`:1541-1550`) — the legacy V8 haversine and a second inline `NS.geodesy` IIFE,
in the SAME 6,277-line file, both computing the identical formula on the
identical constant.

- **What it would import:** `import { distanceKm } from 'ventus-grid-engine/v9-geodesy';`
  (or, for the file's own DOM-facing name, `haversine` from
  `ventus-grid-engine/geo-core`).
- **What must be proven first:** bit-identical output on every reference leg
  already used by this cartridge's own test corpus (the parity proof this
  repo runs — `proofs/v9-engine.proof.mjs` — is the template); that removing
  the second inline copy does not change `window.__GRIDATLAS_MODULES__.geodesy`'s
  registration order relative to anything that reads it before the module
  script loads (composition order is asserted by `tools/scope/verify-compose.mjs`
  in gridatlas, not by this repository).
- **Status:** not done. Architectural risk only — both copies currently agree
  to the full constant (`docs/v9-constants.md` finding 2).

**gridatlas `atlas/cartridges/202608311910-neon-substation-links-v9-6.js:120,174-180`**
(`R_ATLAS` / hand-rolled `distanceKm`)

- **What it would import:** `import { distanceKm } from 'ventus-grid-engine/v9-geodesy';`
- **What must be proven first:** same parity check as above, applied to this
  cartridge's own `nearestSubstations()`/`nearestProjects()` call sites
  (`docs/v9-duplication.md` 2(b) item 2).
- **Status:** not done.

**pipelinenews `tools/intelligence/cartridges/grid-proximity/build_payload.py:44-47,90`**
(`A_WGS84`/`R_ATLAS` hand-roll, `haversine_km()`)

- **What it would import:** `from geodesy import R_ATLAS, haversine_km` (the
  pattern its own sibling cartridge already uses — see below).
- **The exact import line already exists next door, unused by this file:**
  `grid-proximity`'s sibling in the same `tools/intelligence/cartridges/`
  directory, `grid-distance-column/build_payload.py:50-69`, does
  `sys.path.insert(...)` then imports `grid-distance-maths/src/geodesy.py`
  directly and **refuses to run** (`raise SystemExit`) if that repo is not
  cloned beside it. `grid-proximity` could do exactly this.
- **What must be proven first:** `grid-proximity`'s ring-search
  (`nearest_segment()`/`nearest_substations()`, lines 212-299, with the
  early-termination bound `swept_radius_km()` at 190-209) is the estate's
  *reference* implementation of the correct ring-search form — canonical
  `grid-distance-maths/src/geodesy.mjs`'s own `SpatialIndex.sweptClearanceKm()`
  docstring credits this file as its origin. So the safe direction here is
  narrower than a full swap: import the *constant and haversine* from the
  canonical module (they already agree numerically — `docs/v9-constants.md`
  finding 2) while leaving the ring-search algorithm exactly where it is,
  since it is not inferior to anything in `engine/` today.
- **Status:** not done.

**Positive control, already correct — no action needed:**
`pipelinenews/tools/intelligence/cartridges/grid-distance-column/build_payload.py:50-69`
already imports `grid-distance-maths/src/geodesy.py` and fails closed without
it. This is the pattern every row above should converge on.

---

## 2. Area / circle-point (V8 monolith, already fixed IN this repo)

`globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js` carried three area
implementations and two identical circle-point generators
(`docs/v8-duplication.md`). Two of the three area implementations and both
circle-point generators are now `engine/geo-area.js` and `engine/geo-shapes.js`
in this repository — this row exists to record that **the fix has not been
carried back into `globalgrid2050` itself**. `ventus-corev8engine.js` at
`globalgrid2050` HEAD `7d00781b6993b9038a1a8bedf2c88a4eb0109ad4` still contains
all four original implementations, unchanged, because this repository only
ever reads that file — it does not write to `globalgrid2050`.

- **What `globalgrid2050`'s own `_zoneDrawCalcArea`, `updateMeasureDisplay`,
  and both circle-point functions would import, if that repository chose to:**
  `import { polygonAreaKm2 } from 'ventus-grid-engine/geo-area';` and
  `import { destinationCirclePoints } from 'ventus-grid-engine/geo-shapes';`
- **What must be proven first:** that `globalgrid2050`'s own live rendering
  (MapLibre draw calls, ~1,200 lines documented as staying in the application
  per `docs/v8-seams.md`) does not depend on any DOM-adjacent side effect the
  extraction dropped — the extraction proof (`proofs/geodesy.proof.mjs`)
  already establishes numeric identity to 8 decimal places, so the remaining
  work is integration, not arithmetic.
- **Status:** not done, and out of this repository's write scope by design.

**A second, wider instance of the SAME bug, found during this crawl and not
previously logged:** `gis-sld-v5-calculations.js` line 147
(`ac_mw_direct = total_blocks * central_skid_mva * inv_per_mv`, the double-count
bug already documented in `docs/v9-maths-inventory.md` §7 for ONE location)
exists **byte-identical, at the same line number, in five separate files**
across `globalgrid2050`:

| path | line | status |
|---|---|---|
| `globalgrid2050/solar-bess-topology-v5/gis-sld-v5-calculations.js` | 147 | bug present |
| `globalgrid2050/solar-bess-topology-v6/gis-sld-financial-sandbox/gis-sld-v5-calculations.js` | 147 | bug present |
| `globalgrid2050/solar-bess-topology-v7/gis-sld-financial-sandbox/gis-sld-v5-calculations.js` | 147 | bug present |
| `globalgrid2050/solar-bess-topology-v8/bess-gis-sld-financial-sandbox/gis-sld-v5-calculations.js` | 147 | bug present |
| `globalgrid2050/solar-bess-topology-v8/bess-pcs-standalone/gis-sld-v5-calculations.js` | 147 | bug present |

`gridatlas/atlas/modules/202609012205-sizing-arithmetic.js` (the module
`sources/v9-extracts/sizing-arithmetic.mjs` was staged from) is the one place
this bug is already **fixed** — it takes
`Math.min(inverter_ac_total, skid_ac_total)` instead. None of the five
`globalgrid2050` copies has that fix.

- **What each would import:** the corrected `centralStats`/`consistency`
  logic from a promoted `sizing-arithmetic` module — **not available yet**,
  see §4 below.
- **What must be proven first:** the fix itself needs a proof before it can
  be promoted (see §4) — promoting an unproven fix to fix five call sites
  would just relocate the risk.
- **Status:** not done. This is the worst duplication found in this crawl —
  the same three-line bug, at the same line number, in five files, unfixed,
  next to a sixth (corrected) copy in a different repository that none of
  the five import from.

---

## 3. Nearest-search

**gridatlas `atlas/cartridges/202609041330-substation-intelligence-v9-63.js:6014-6095`**
(inline `normalise()`/`state.nearest()`, the live duplicate of the dead
`substation-lookup.js`)

- **What it would import:** `import { normalise, index } from 'ventus-grid-engine/v9-nearest-search';`
- **What must be proven first:** the two behavioural differences documented
  in `docs/v9-duplication.md` 2(a) — `options?.limit ?? 1` vs.
  `(options && options.limit) || 1` disagree at `limit: 0`, and the cartridge
  lacks the `voltages_kv || []` default and can throw where the module cannot.
  `proofs/v9-engine.proof.mjs` already asserts the SAFER (module) behaviour
  for both cases, so swapping in the import fixes a live latent throw risk,
  not just deduplicates.
- **Status:** not done.

**gridatlas `atlas/modules/202609012128-declared-connections.js:213-244`**
(`nearestTransmission()`, hand-rolled running-min scan, filtered only by
`s.kv[0] >= 400`)

- **What it would import:** `import { index } from 'ventus-grid-engine/v9-nearest-search';`
  called with `{ minimumKv: 400 }` in place of the hand-rolled filter.
- **What must be proven first:** that the running-min scan's tie-breaking
  behaviour (first-seen-wins on exact ties) matches `index().nearest()`'s
  sort-and-slice — not asserted by any proof today, in this repo or gridatlas.
- **Status:** not done.

**pipelinenews `tools/intelligence/cartridges/grid-proximity/build_payload.py:212-299`**
— see §1 above. Not a should-import target for the search *algorithm* (it is
the estate's reference ring-search); only the constant/haversine underneath
it is a candidate.

---

## 4. Sizing arithmetic — extracted, PROMOTION DECLINED, and why

`sources/v9-extracts/sizing-arithmetic.mjs` (435 lines, staged from
`gridatlas/atlas/modules/202609012205-sizing-arithmetic.js`) was reviewed for
promotion into `engine/` alongside network-topology, electrical-distance,
rating-envelope and corridor-estimate. **It was left unpromoted.** Reasons,
stated rather than hidden:

1. **It is impure.** `fitToStatedCapacity` mutates the caller's own `sld`
   object and calls back into a caller-supplied `computeSldStats()` — every
   other module promoted in this pass (`network-topology`, `electrical-distance`,
   `rating-envelope`, `corridor-estimate`) is a pure function of its inputs,
   which is what let their proofs be built from small, self-contained
   fixtures in an afternoon. A proof for `fitToStatedCapacity` would need to
   fake a caller and assert on a mutation, which is a materially different
   (and weaker) kind of test than every other proof in this repository.
2. **It is financial, not electrical-engineering.** `screeningFinance` is a
   35-year revenue/capex model. Proving it honestly means proving a
   financial model, which is a different domain of expertise and evidence
   than geodesy, topology, or hop-count graph search, and risks a proof that
   asserts arithmetic rather than a real property of the system, contrary to
   this repository's own stated proof style.
3. **The one property worth proving — the double-count fix — is already
   provable narrowly**, and doing so narrowly (a `min(inverter_ac_total,
   skid_ac_total)` fact, isolated from the rest of the 435-line module) is
   both more honest and more useful than promoting the whole module to get
   one proof point. That narrower promotion was not attempted in this pass
   either, for time, and is recorded here as the concrete next step rather
   than done partially.

**What promoting just the fix would look like, if attempted next:** extract
`consistency`/`centralStats`'s `Math.min(inverter_ac_total, skid_ac_total)`
computation (source lines ~227-247) as its own small pure function —
`export function acExportLimitMw(inverterAcTotalMw, skidAcTotalMw)` — with a
proof asserting exactly the property documented in `docs/v9-maths-inventory.md`
§7: on the shipped defaults (24 inverters at 4.4 MW on 12 skids at 4.4 MVA),
the correct answer is 52.8 MW, not 105.6 MW and not 211.2 MW. That one
function, proven, is what the five `gis-sld-v5-calculations.js` copies in
§2 would import.

---

## 5. Deep link

**pipelinenews `atlas-pointer-deep-link.mjs` (the live emitter) and
`{GEN}-wider-fleet.mjs`'s `atlasLink()` (the second, independent emitter)**

- **What each would import:** `import { buildDeepLink } from 'ventus-grid-engine/deeplink';`
- **What must be proven first:** that `buildDeepLink`'s parameter set and
  emission order (`repd_ref, project, technology, capacity_mw, latitude,
  longitude, zoom`) matches both emitters' `QUERY_PARAMETER_ORDER` exactly —
  they currently agree on names but the wider-fleet emitter does not enforce
  the spine emitter's all-or-nothing lat/lon/zoom pairing rule
  (`docs/deeplink-contract.md` §1b), so a naive swap would either need
  `buildDeepLink` to support both emission modes or the wider-fleet emitter
  to adopt the spine's stricter rule as a behaviour change, not just a
  refactor.
- **Status:** not done.

**gridatlas `atlas/parts/202609040229-place-global-search-arrival-identity.js:566-747`**
(`receiveExactRepdDeepLink`, the live receiver-side parse)

- **What it would import:** `import { parseDeepLink } from 'ventus-grid-engine/deeplink';`
- **What must be proven first — and this is the one with a live,
  already-measured drift:** the receiver's own identity regex
  (`/^[A-Za-z0-9-]{1,40}$/`) is **broader** than the emitter's
  (`/^\d+$/`, digits only). `deeplink/contract.js` was built from the
  emitter's own vocabulary; before this import could land, either
  `parseDeepLink` needs to accept the receiver's broader pattern (and the
  reason it exists — is it defensive slack, or does something send
  non-numeric `repd_ref` today?) or the receiver's regex needs to narrow to
  match the emitter, which is a behaviour change outside this repository's
  scope to make unilaterally.
- **Status:** not done. This is the one `drifts_from` edge in this crawl with
  a live, currently-shipping numeric/pattern disagreement between two ends of
  the same contract — see `genome/engine-graph.json` for the edge record.

**gridatlas `atlas/parts/202609041234-sld-sandbox-technology-buckets.js:266-276`**
(`LAYER_ID_FOR_BUCKET`, the table `deeplink/contract.js`'s own table was
copied verbatim from)

- **What it would import:** `import { LAYER_ID_FOR_BUCKET, layerIdForBucket } from 'ventus-grid-engine/deeplink';`
- **What must be proven first:** nothing numeric — the two tables are
  byte-identical today (this repository copied FROM this file). The only
  open question is packaging: gridatlas's cartridges are composed and
  SHA-256-verified by `atlas/current.json`
  (`docs/deeplink-contract.md` §3), so importing an external npm-style
  package into a composed, hash-verified cartridge is a build-process
  question for gridatlas, not a data question for this repository.
- **Status:** not done.

---

## Summary table

| # | fragment | concern | import target | proven safe? |
|---|---|---|---|---|
| 1a | gridatlas cartridge, 2 inline copies | geodesy | `v9-geodesy` | no |
| 1b | neon-substation-links cartridge | geodesy | `v9-geodesy` | no |
| 1c | pipelinenews grid-proximity | geodesy constant only | `v9-geodesy` (constant), keep ring-search | no |
| 2a | globalgrid2050 ventus-corev8engine.js | area/circle-points | `geo-area`, `geo-shapes` | proven numerically (8dp), not integrated |
| 2b | 5x gis-sld-v5-calculations.js | sizing double-count | narrow fix, not yet extracted | **no module exists yet — see §4** |
| 3a | gridatlas live cartridge inline nearest | nearest-search | `v9-nearest-search` | proven safer, not integrated |
| 3b | declared-connections nearestTransmission | nearest-search | `v9-nearest-search` | no |
| 5a | pipelinenews 2 emitters | deep-link build | `deeplink` | no |
| 5b | gridatlas identity parse | deep-link parse | `deeplink` | **no — live pattern drift, see §5** |
| 5c | gridatlas bucket table | deep-link bucket map | `deeplink` | yes numerically, packaging open |

Ten rows. Zero have been swapped — this repository extracts and proves, it
does not modify the repositories it read from. The two rows worth acting on
first, in order: **5b** (a live, currently-shipping contract drift between
two ends of the same URL) and **2b** (the same uncorrected bug duplicated
five times, next to its own fix in a sixth file nothing imports).
