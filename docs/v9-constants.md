# Earth-radius / unit-conversion constants found

All values verified with `grep -n` / `sed -n` against the working tree.

| value (km) | meaning | file:line | repo |
|---|---|---|---|
| `6378.137` | WGS84 semi-major axis, used as the estate's fixed haversine radius | `grid-distance-maths/src/geodesy.mjs:16` (`R_ATLAS`) | grid-distance-maths — **canonical** |
| `6371.0088` | IUGG mean radius (Turf.js default), documented as **not** the default, "reads 0.112% shorter than R_ATLAS" | `grid-distance-maths/src/geodesy.mjs:19` (`R_MEAN`) | grid-distance-maths |
| `6384.7272` | Gaussian mean radius of curvature at 54°N (UK centroid), opt-in higher-accuracy sphere | `grid-distance-maths/src/geodesy.mjs:27` (`R_UK`) | grid-distance-maths |
| `6378.137` / `f=1/298.257223563` | WGS84 ellipsoid semi-major axis + flattening, for the Vincenty inverse (`distanceEllipsoidalKm`) and curvature functions | `grid-distance-maths/src/geodesy.mjs:30-31` (`WGS84.a`, `WGS84.f`) | grid-distance-maths |
| `6378.137` | `EARTH_RADIUS_KM`, single fixed haversine radius | `gridatlas/atlas/modules/202609011950-geodesy.js:21` | gridatlas (module) |
| `6378.137` | `EARTH_RADIUS_KM`, legacy inline haversine carried from `ventus-corev8engine.js` | `gridatlas/atlas/cartridges/202609041330-substation-intelligence-v9-63.js:57` | gridatlas (live cartridge, copy #1) |
| `6378.137` | `EARTH_RADIUS_KM`, second inline copy of the geodesy module (`NS.geodesy`) in the **same file** | `gridatlas/atlas/cartridges/202609041330-substation-intelligence-v9-63.js:1544` | gridatlas (live cartridge, copy #2) |
| `6378.137` | `R_ATLAS`, "WGS84 semi-major axis. The house constant." | `gridatlas/atlas/cartridges/202608311910-neon-substation-links-v9-6.js:120` | gridatlas (cartridge) |
| `6378.137` | `A_WGS84` / `R_ATLAS`, local hard-coded copy, comment: "the constant GridAtlas and the Sandbox both use" | `pipelinenews/tools/intelligence/cartridges/grid-proximity/build_payload.py:44,47` | pipelinenews |
| **`6371.0088`** | **"The project-intelligence cartridge used 6371.0088, which reads 0.112% short"** — recorded as a retired/reconciled prior value | `pipelinenews/tools/intelligence/cartridges/grid-proximity/build_payload.py:25` (comment) and `:452` (`"project_intelligence_circuit_km": 6371.0088`, carried as metadata in the output payload for comparison) | pipelinenews |
| n/a (imported, not hard-coded) | — | `pipelinenews/tools/intelligence/cartridges/grid-distance-column/build_payload.py:50-69` imports `R_ATLAS` (and all geodesy) directly from `grid-distance-maths/src/geodesy.py`, refuses to run without it | pipelinenews |

## Route-factor / non-earth-radius constants (corridor-estimate only, no earth model)

| value | meaning | file:line |
|---|---|---|
| `1.245` | `CABLE_FACTOR`, straight-line-to-corridor multiplier for cable circuits | `gridatlas/atlas/modules/202609030205-corridor-estimate.js:48` |
| `1.13` | `OHL_FACTOR`, published for reference only, never applied (no `forOverhead()`) | `gridatlas/atlas/modules/202609030205-corridor-estimate.js:49` |

## Flagged disagreements

**1. `6371.0088` vs. `6378.137` (0.112% difference) — CONFIRMED, historical.**
`pipelinenews/tools/intelligence/cartridges/grid-proximity/build_payload.py:25` explicitly documents that a now-retired "project-intelligence cartridge" used `6371.0088` (IUGG mean radius) while every other live component in the estate (gridatlas geodesy module and both its inline cartridge copies, the neon-substation-links cartridge, and this file itself) uses `6378.137` (WGS84 semi-major axis). The old value is preserved only as a labelled comparison field (`project_intelligence_circuit_km`) in the output payload at line 452, not used in any live calculation — so this is a **documented-and-closed** disagreement, not a live one, but it is direct evidence that the "four implementations on three Earth radii" problem this estate's comments repeatedly reference (`grid-distance-column/build_payload.py:57-58`: *"the estate had four implementations on three Earth radii because every consumer carried its own"*) is real and already happened once.

**2. No live numeric disagreement found among the six 6378.137 instances above** — every currently-composed/live constant in gridatlas and pipelinenews agrees to the full value `6378.137` (WGS84 semi-major axis). The risk is architectural, not currently numerical: six independent hard-coded copies of the same literal (`grid-distance-maths` canonical `R_ATLAS`, gridatlas module, gridatlas cartridge x2 in the same file, gridatlas neon-links cartridge, pipelinenews grid-proximity) plus one file that correctly imports instead of hard-coding (`grid-distance-column`). A future edit to any one of the six copies without the others is exactly how the `6371.0088` divergence happened before.

**3. Same file, two definitions of `EARTH_RADIUS_KM` (`202609041330-substation-intelligence-v9-63.js:57` and `:1544`).** Both currently `6378.137`, both consumed by different code paths within the same 6,277-line cartridge (the legacy V8-engine haversine at line 70-71, and the inline `NS.geodesy` IIFE at line 1541 registering `window.__GRIDATLAS_MODULES__.geodesy`). This is the exact configuration the gridatlas geodesy module's own header warns about (*"This existed three times tonight - in the sandbox, in the substation cartridge and in the data repository - which is exactly how two of them end up on different radii without anyone noticing"*), still present in the live file today, just not (yet) diverged in value.

**4. Formula-form difference, not a radius difference:** `grid-distance-maths/src/geodesy.mjs:72-79` and every gridatlas `distanceKm`/`haversine` use the atan2 form (`R·2·atan2(√a,√(1-a))`). The gridatlas geodesy module's own comment (`202609011950-geodesy.js:29-40`) records that an early extraction draft used the asin form (`2R·asin(√a)`) instead — algebraically identical, differs in the ~16th significant figure (1e-15 km), and was rejected purely for byte-parity with the incumbent, not for any accuracy reason. Not a disagreement in the shipped code, but the nearest thing to one that was caught in review.
