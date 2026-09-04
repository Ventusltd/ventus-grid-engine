# ventus-grid-engine

The grid engine's **mathematics** and the **deep-link contract**, taken out of
the two applications that had grown their own copies of both.

The estate already owns the network data in
[data-grid-gb](https://github.com/Ventusltd/data-grid-gb) and the geodesy in
[grid-distance-maths](https://github.com/Ventusltd/grid-distance-maths). It did
not own the engine. The consequence showed up twice, in the same week:

- **The maths had forked inside a single file.** `ventus-corev8engine.js` is
  one 1,427-line closure containing *three* area implementations and *two*
  identical circle-point generators. Nothing was wrong with any one of them.
  The problem is that there were four, and no test compared them.

- **The deep link had no owner.** Pipeline News built a URL and GridAtlas
  parsed it, and the two codebases never imported each other, so nothing
  checked that they still agreed. They stopped agreeing. Three technology
  buckets — `wind_onshore`, `wind_offshore`, `other` — failed **every single
  arrival**, on 2,508 of 7,680 register rows, while the arrival's own
  self-check reported green.

This repository holds both, once, with proofs.

## The products

### `engine/` — the pure maths, no DOM, no network

| module | what it owns |
|---|---|
| `geo-core.js` | the earth model and the one `haversine`, in `(lon, lat)` GeoJSON order |
| `geo-area.js` | `polygonAreaKm2`, `polylinePerimeterKm`, `circleCapAreaKm2` |
| `geo-shapes.js` | `destinationCirclePoints` — the deduplicated circle generator |
| `geo-geojson.js` | GeoJSON shaping, kept out of the maths |
| `v9-geodesy.js` | the V9 line: `distanceKm`, `representativePoint`, `voltagesKv`, `destinationPoint`, `initialBearingDeg` |
| `v9-nearest-search.js` | `normalise` and `index` — name matching and nearest-node search |

`v9-geodesy.distanceKm` and the V8 `haversine` are **bit-identical** on every
reference leg, and the proof asserts that exactly rather than to a tolerance.
"Nearly the incumbent" is not a claim — it is an argument waiting to happen
every time a digit differs.

Every function is extracted **verbatim** from its source. The formulas were not
rewritten. Where a change was unavoidable it is marked in the file and stated
in the header comment, so a difference in output is always traceable to a
decision somebody made rather than to a refactor nobody recorded.

### `deeplink/contract.js` — the MAP button, as one testable thing

Identity, parameter list, bucket vocabulary, the engine's real layer ids, the
correction table between them, and a `buildDeepLink` / `parseDeepLink` pair.
The emitter and the receiver are both meant to import this. Until they do, the
proof at least holds the contract to itself.

## What was found on the way in

**Two of the three area implementations were identical.** Checked, not assumed:
on a 1 km square at 55°N and on a reference polygon near London they agree to
eight decimal places (0.30664823 km²). They are now one function. They had
disagreed in exactly one place — acres, where one divided by the exact
4046.85642 m²/acre and the other multiplied by a rounded 247.105 — and that
drift is gone with them.

**The third was not merged, because it is not the same question.** The
spherical-cap formula answers "what area does a circle of this radius enclose",
not "what area does this polygon enclose". It is correct: it reduces to πr² at
1 km and falls to 0.9498 of the planar answer at 5,000 km, which is a sphere
behaving like a sphere. Merging it into the polygon function would have been
tidier and wrong, so it keeps its own name.

**The radius is a trap, and the obvious fix is the wrong one.** V8 uses
6378.137 km, the WGS84 *equatorial* radius, which looks like a mistake in a
formula that wants a mean radius. It is not. At GB latitudes the best single
sphere is the Gaussian mean radius of curvature — about 6384.7 km at 54°N — and
measured against that, **both** constants in the estate are too small:

| sphere | mean error | worst |
|---|---|---|
| 6371.0088 IUGG mean | −2,194 ppm | 206 m |
| 6378.137 WGS84 equatorial (the default) | −1,078 ppm | 141 m |
| 6384.7272 UK Gaussian at 54°N | −46 ppm | 102 m |

"Switching to the mean radius" would have **doubled** the error. This repo
therefore follows the decision already recorded in
`grid-distance-maths/docs/EARTH-MODEL.md`: `R_ATLAS = 6378.137` stays the
default, because every deployed tool uses it and every published Ventus figure
depends on it; `R_UK = 6384.7272` is there for new work where accuracy matters
more than agreement; and `R_MEAN = 6371.0088` is exported only to reproduce
existing Turf-based results and should not be used in new code.

The proof asserts the ordering `R_MEAN < R_ATLAS < R_UK` precisely so that this
trap cannot be walked into again by someone reasoning from the names.

**The nearest-search is sound, and that is a finding, not an assumption.** Four
hand-rolled nearest-searches exist across the estate rather than one shared
import. All four were checked for the failure that would matter — a ring or
bounding-box pre-filter that can exclude the true nearest node and silently
inflate a grid distance — and **none of them has it**. The three in `gridatlas`
are unindexed exhaustive scans, correct by construction. The cell-bucketed ring
search in `pipelinenews`' `grid-proximity/build_payload.py` has a proven
early-termination bound; `grid-distance-maths` credits that file as the origin
of its own `sweptClearanceKm`. Details in `docs/v9-duplication.md`.

**One dead module and one live duplicate of it.** `gridatlas`'
`atlas/modules/202609011950-substation-lookup.js` is committed but appears in no
composition manifest — nothing imports it. The live cartridge reimplements
`normalise()`/`nearest()` inline, byte-different, and the live copy is the *less*
defensive of the two: it lacks the `voltages_kv || []` default the module has, so
it can throw where the module cannot. That is latent, not currently firing, and
it is written down in `docs/v9-duplication.md` rather than fixed here — fixing it
belongs in `gridatlas`, under its own proof.

## What this is not

**Nothing here says a project can or cannot connect.** These are distances,
areas and a URL contract. A distance is a distance. Queue position, committed
connections, consent and commercial terms decide connection, and none of them
are in this repository or derivable from anything in it.

**The radius is not the dominant error, and nothing here pretends otherwise.**
The gap between the default and the UK-accurate sphere is about one part in a
thousand — well inside the uncertainty of a REPD site centroid, which can sit
hundreds of metres from the actual point of connection. Two errors are larger:

- **Measuring to a sampled vertex instead of to the line.** Typically 130 m of
  systematic overstatement, up to 560 m — five times the worst case from the
  radius choice. Not fixed by anything in `engine/`.
- **Choosing the wrong node.** A ring or bounding-box pre-filter that can
  exclude the true nearest substation costs *kilometres*. Every hand-rolled
  nearest-search in the estate was checked for this on the way in; the results
  are in `docs/`.

**This is not the renderer.** The MapLibre and DOM halves of the V8 engine
(~1,200 lines: zone draw, measure tool, radius tools, popups, layers) stayed in
the application. `docs/v8-seams.md` records where they divide and what they
depend on, so moving them later is a decision and not an excavation.

## Verifying

```
node verify.mjs
```

Runs every proof in `proofs/` and exits non-zero if any one fails. The CI
workflow runs it **before** the step that commits anything — that ordering, not
the assertions themselves, is what stops an unverified product reaching a
consumer. The verifier also fails when `proofs/` is empty, because an empty
proof set must never read as a pass.

Current state: **3 proofs, 69 checks.**

Each check is a sentence about the real system, not a test number. Two of them
carry most of the weight:

- **The extraction did not rewrite the maths.** The collapsed area function
  reproduces both original V8 implementations to eight decimal places on a
  reference polygon. If that number moves, something was rewritten.

- **The nearest-search still cannot miss the true nearest node.** The fixture
  places the true nearest substation 6.0 km east of the query, where a naive
  degree-square pre-filter would drop it while keeping a 6.6 km decoy to the
  north. That trap was confirmed to spring: with such a filter added, the
  search returns the wrong substation and overstates the distance by exactly
  10%. A test that cannot fail proves nothing, so this one was made to fail
  before it was trusted to pass.

## Provenance

`sources/provenance.json` records, for every extracted function: the source
repository, path, line range, and the commit SHA it was taken from. The three
sources at extraction time were:

| repo | HEAD |
|---|---|
| `globalgrid2050` | `7d00781b6993b9038a1a8bedf2c88a4eb0109ad4` |
| `gridatlas` | `64268fd0` |
| `pipelinenews` | `ade103ae` |
