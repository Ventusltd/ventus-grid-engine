# Duplication audit

All line numbers verified with `sed -n` / `grep -n` against the working tree.
`gridatlas` @ `64268fd06a0da54ddffbcdaaaee382e314e829f7`, `grid-distance-maths` @ `30d2f817a4b007b7c3be334f3aff308331a848b8`, `pipelinenews` @ `ade103ae2a2eec4f334e159b479f20b857d63515`.

---

## 2(a) — Is `substation-lookup.js` dead, and does the live cartridge carry a byte-different inline duplicate?

### **YES.**

**Evidence it is never composed:**

`grep -rln "202609011950-substation-lookup" gridatlas/atlas/manifests/*.json` returns **zero** matches, across all 47 `*-composition.json` manifests and all `*-parts.json` files in `gridatlas/atlas/manifests/`. By contrast, the sibling module `202609011950-geodesy.js` **is** declared — it appears as a `"path": "atlas/modules/202609011950-geodesy.js"` build part in every `*-sld-sandbox-v9-8-parts.json` and `*-substation-intelligence-v9-63-parts.json` manifest from generation 202609012045 onward. `current.json` (the live-release pointer) likewise names `geodesy` nowhere but also never names `substation-lookup`. The only file in the whole `gridatlas/atlas/` tree containing the string `substation-lookup` is the module itself: `atlas/modules/202609011950-substation-lookup.js`.

**Evidence the live cartridge reimplements it inline instead:**

The live substation-intelligence cartridge is `atlas/cartridges/202609041330-substation-intelligence-v9-63.js` (pointed to by `current.json` → `cartridges[].id == "substation-intelligence"` → `"path": "./cartridges/202609041330-substation-intelligence-v9-63.js"`, `"replace_script": "ventus-corev8engine.js"`, i.e. this file **replaces** the whole engine script at runtime). Inside it, lines 6014-6095 build an independent `normalise()` / `byName` Map / `located[]` array / `state.nearest()` — structurally the same job as `substation-lookup.js`'s `index()`, but standing alone rather than calling `NS.substationLookup`.

**Diff, side by side:**

`normalise()` — module (`substation-lookup.js:34-39`):
```js
function normalise(name) {
    return String(name || '').toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(NOISE, ' ')
      .split(/\s+/).filter(Boolean).join(' ');
  }
```
vs. cartridge inline (`202609041330-substation-intelligence-v9-63.js:6019-6023`):
```js
function normalise(name) {
    return String(name || '').toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ').replace(NOISE, ' ')
      .split(/\s+/).filter(Boolean).join(' ');
  }
```
Byte-different (line wrap only); semantically identical.

`nearest()` — module (`substation-lookup.js:57-70`, inside `index()`):
```js
nearest: (lon, lat, options) => {
        const minimumKv = (options && options.minimumKv) || 0;
        const limit = (options && options.limit) || 1;
        const found = [];
        for (const point of located) {
          const voltages = point.voltages_kv || [];
          if (!voltages.length || Math.max(...voltages) < minimumKv) continue;
          found.push({
            point,
            km: geodesy.distanceKm(lon, lat, point.location.lon, point.location.lat)
          });
        }
        found.sort((a, b) => a.km - b.km);
        return limit === 1 ? (found[0] || null) : found.slice(0, limit);
      }
```
vs. cartridge inline (`202609041330-substation-intelligence-v9-63.js:6083-6092`):
```js
state.nearest = (lon, lat, options) => {
    if (!state.loaded) return null;
    const minimumKv = options?.minimumKv ?? 0;
    const limit = options?.limit ?? 1;
    const found = [];
    for (const point of located) {
      if (Math.max(...point.voltages_kv) < minimumKv) continue;
      found.push({ point, km: distanceKm(lon, lat, point.location.lon, point.location.lat) });
    }
    found.sort((a, b) => a.km - b.km);
    return limit === 1 ? (found[0] || null) : found.slice(0, limit);
  };
```

**Real (not merely stylistic) differences:**
1. The cartridge adds a `state.loaded` guard the module has no equivalent of (module's caller is expected to check `state.loaded`/`ready` externally — the module itself has no `state`).
2. `options?.minimumKv ?? 0` / `options?.limit ?? 1` (cartridge, optional chaining + nullish coalescing) vs. `(options && options.minimumKv) || 0` / `(options && options.limit) || 1` (module, `&&`/`||`). These diverge on `limit: 0`: the cartridge's `??` preserves `0` (then `limit === 1` is false, so it falls through to `.slice(0, 0)` → empty array); the module's `||` silently promotes `limit: 0` to `1`. Edge case, but a genuine behavioural difference, not just style.
3. The module defensively defaults `point.voltages_kv || []` before spreading into `Math.max(...voltages)`; the cartridge spreads `point.voltages_kv` directly with no fallback — `Math.max(...undefined)` throws `TypeError` if any located point ever lacks `voltages_kv`. The module cannot throw there; the cartridge can.
4. The module is a reusable factory (`index(points)` can be called on any point array, any number of times); the cartridge inlines the same logic once, bound directly to its own module-level `state`/`located`/`byName` closures — there is no reusable `index()` in the cartridge at all.

Neither implementation has a bbox/ring pre-filter — both are full unindexed scans — so **neither exhibits the ring-search bug** (see 2(b)). The duplication here is architectural risk (two sources of truth that can silently diverge, per the cartridge's own comment at line 6083: *"ONE geodesy, and it is the module's"* — an aspiration the code does not extend to nearest-search) rather than a live correctness bug today.

---

## 2(b) — Hand-rolled ring/bbox nearest-search instead of importing `grid-distance-maths`

Searched `gridatlas/atlas/**`, `pipelinenews/tools/**`, and the wider GitHub folder (excluding worktree mirrors, codex forks, and frozen historical `releases/` snapshots) for nested-loop distance scans, `Math.min`/best-distance tracking, and ring/bbox pre-filters.

### Found, with ring-search-bug verdict for each:

**1. `gridatlas/atlas/modules/202609011950-substation-lookup.js`** (dead, see 2(a)) and its live inline duplicate in `202609041330-substation-intelligence-v9-63.js:6083-6092` — **exhaustive scan, no pre-filter → NO ring-search bug.** Both hand-roll `distanceKm` too (via the estate's own inline `geodesy` module rather than importing `grid-distance-maths`), but agree numerically with it (see constants.md).

**2. `gridatlas/atlas/cartridges/202608311910-neon-substation-links-v9-6.js`** — `nearestSubstations()` (lines 251-260) and `nearestProjects()` (lines 266-291): both compute `distanceKm` for **every** candidate first, then apply a `> MAX_LINK_KM` cutoff and sort/slice. **NO ring-search bug** — a max-distance cutoff can only drop far candidates, never hide a nearer one, because distance is computed exhaustively before any filtering happens. Hand-rolls its own `distanceKm` (line 174-180, comment: *"Identical in form and constant to ventus-corev8engine.js haversine()"*) instead of importing `grid-distance-maths`.

**3. `gridatlas/atlas/modules/202609012128-declared-connections.js`** — `nearestTransmission()` (lines 217-244): `for (const s of subs)` with running-min tracking (`if (!best || km < best.km) best = ...`), filtered only by `s.kv[0] >= 400` (a voltage filter, not a geographic pre-filter). **NO ring-search bug** — every candidate's distance is computed; nothing is excluded before measurement.

**4. `pipelinenews/tools/intelligence/cartridges/grid-proximity/build_payload.py`** — this is the significant one. `nearest_segment()` (lines 212-260) and `nearest_substations()` (lines 266-299) implement a genuine **cell-bucketed Chebyshev ring search** (`CELL = 0.1` degrees, expanding `for ring in range(0, 90)`) with an early-termination guard `swept_radius_km()` (lines 190-209) that computes the true minimum guaranteed-covered radius from the four box edges, not `ring * CELL`. This is the **correct, proven form** of the ring-search — in fact `grid-distance-maths/src/geodesy.mjs`'s own `SpatialIndex.sweptClearanceKm()` docstring (lines 340-366) credits this file as the origin of the fix and says "the canonical module should not be behind its own consumer." **NO ring-search bug** in the current code.
   - **But it does not import `grid-distance-maths`.** It hand-rolls `haversine_km()` at line 90 with a locally hard-coded `A_WGS84 = 6378.137` / `R_ATLAS = 6378.137` (lines 44, 47), even though the **sibling cartridge in the same `tools/intelligence/cartridges/` directory**, `grid-distance-column/build_payload.py` (lines 50-69), correctly imports `grid-distance-maths/src/geodesy.py` and refuses to run (`raise SystemExit`) if the canonical repo isn't cloned beside it. Same tools directory, two cartridges, one imports canonically and one hand-rolls independently — this is the duplication class 2(b) is asking about, confirmed **YES** for this file, even though its arithmetic happens to be correct and constant-consistent.
   - Its own top-of-file comment (line 25) documents a **third, inconsistent implementation** elsewhere in the estate: *"The project-intelligence cartridge used 6371.0088, which reads 0.112% short."* — see constants.md.

### Summary for 2(b): **YES**, hand-rolled nearest-search/geodesy exists outside `grid-distance-maths` in multiple places (gridatlas modules 1-3 above, and `pipelinenews/grid-proximity/build_payload.py`). None currently carries the ring-search-excludes-true-nearest bug — the three gridatlas instances are unindexed exhaustive scans (correct by construction), and the one genuine ring-indexed search found (`pipelinenews/grid-proximity`) independently implements the same proven early-termination bound that `grid-distance-maths` itself now documents. The risk is architectural (multiple independent sources of truth for the same formula/constant, one of which — the retired "project-intelligence cartridge" — is already known to have drifted; see constants.md) rather than a currently-live distance-inflation bug.
