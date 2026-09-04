# GridAtlas deep-link contract

Authoritative as of:
- pipelinenews HEAD `ade103ae2a2eec4f334e159b479f20b857d63515`
- gridatlas HEAD `64268fd06a0da54ddffbcdaaaee382e314e829f7`
- globalgrid2050 HEAD `7d00781b6993b9038a1a8bedf2c88a4eb0109ad4` (searched; hosts only the standby legacy receiver and build mirrors — see "Two receivers" below)

Both working trees have small unrelated untracked/uncommitted files (in-progress builds, debug scripts, log files). None touch any file cited here; every fact below is read from committed HEAD.

There are **two live emitters** and **three receiver-side scripts** that each independently read the URL. This document covers all of them.

---

## 1. Emitters

### 1a. The main spine emitter — `atlas-pointer-deep-link.mjs`

File: `pipelinenews/releases/202609032329-pipelinenews/assets/202608312037-atlas-pointer-deep-link.mjs` (full copy at `emitter/atlas-pointer-deep-link.mjs`).

This is the file `app.mjs` actually imports (`import { buildAtlasV9DeepLink } from "./202608312037-atlas-pointer-deep-link.mjs"`, app.mjs line 1). **Important**: a sibling file exists at the same path with generation stamp `202608311343` and is byte-identical except for one line — `ACTIVE_TARGET = "legacy"` instead of `"ported"`. That sibling is **not imported by anything** as of HEAD; it is dead weight left in the releases tree. The live emitter's `ACTIVE_TARGET` is **`"ported"`**, i.e. `https://ventusltd.github.io/gridatlas/atlas/`. Do not be misled by grepping the repo for `atlas-pointer-deep-link.mjs` and finding the legacy-target copy first — check `app.mjs`'s own import line to find the one that's actually wired in.

Function: `buildAtlasV9DeepLink(project)` (lines 156–187 of the file), fed a "compact project index" row shaped `{repd_ref, gg_project_id, name, technology, status, capacity_mw, county, region, operator, repd_record_updated, geometry_status, latitude, longitude}`.

**Eligibility gate** (line 157): `project.geometry_status !== "valid"` ⇒ returns `""` (no MAP button rendered; presentation is `"NO MAP"`, per `ATLAS_DEEP_LINK_CONTRACT.eligibility.presentation`).

#### Query parameters (spine emitter)

| param | type | units | example | optional? | source line |
|---|---|---|---|---|---|
| `repd_ref` | numeric string | REPD reference id | `6502` | **No** — identity anchor, required or the function returns `""` | 160–164 |
| `project` | string (URL-encoded) | project name | `Cleve Hill Solar Project` | Yes — emitted only if non-empty after trim | 166–167 |
| `technology` | string | one of the four spine buckets | `solar` | Yes — emitted only if non-empty after trim | 169–170 |
| `capacity_mw` | numeric string | MW | `373` | Yes — emitted only if finite and `> 0` | 172–175 |
| `latitude` | numeric string (decimal degrees) | degrees, WGS84 | `51.338767` | Yes — emitted **as a pair with `longitude`**, or not at all | 178–184 |
| `longitude` | numeric string (decimal degrees) | degrees, WGS84 | `0.913885` | Yes — same pairing rule | 178–184 |
| `zoom` | integer string | MapLibre zoom level | `12` (hard-coded `DEFAULT_ZOOM`) | Yes — emitted only when lat/lon pair is emitted | 108, 183 |

Emission order (`QUERY_PARAMETER_ORDER`, line 104–106): `repd_ref, project, technology, capacity_mw, latitude, longitude, zoom`.

Validation specifics worth knowing:
- `repd_ref` must match `/^\d+$/u` (line 161) — **numeric only**. (The receiver's own regex is looser — see §3.)
- `finiteInRange(value, limit)` (lines 134–143) treats `null`/`undefined`/`""` as "absent", not zero — this exists specifically because `Number(null) === 0`, and without the guard a project with a missing longitude would silently emit at longitude `0` (Null Island / the Greenwich meridian) instead of dropping both coordinates. Verified by `selfTest()`'s "drops both coordinates when only one is present" case.
- Out-of-range coordinates (`|lat| > 90` or `|lon| > 180`) are dropped, never clamped.
- `capacity_mw` must be finite and `> 0`, else omitted.

Identity: **`repd_ref` is the project identity.** There is no `repd_id` parameter anywhere in either repo (`git grep -c repd_id` returns zero hits in both `pipelinenews` and `gridatlas`). Everything else the emitter sends is documented as `context_parameters_are_advisory: true` (line 129) — the receiver's own `inbound_match_semantics` is `"EXACT_PROJECT_REPD_REF"` (line 128).

### 1b. The wider-fleet emitter (a second, independent URL builder)

File: `pipelinenews/tools/intelligence/cartridges/wider-fleet/assets/{GEN}-wider-fleet.mjs`, function `atlasLink(row)` (lines ~58–70; excerpted at `emitter/wider-fleet-deep-link.excerpt.mjs`).

This is a **separate cartridge**, additive to the product's technology row, covering the ~20 REPD technology types the four-bucket spine above does not carry (biomass, hydro, hydrogen, tidal, geothermal, CAES, flywheel, ACT, and `other`). It builds its own `URLSearchParams` independently — same target host (`https://ventusltd.github.io/gridatlas/atlas/`), same parameter names, but its own code path, so it is a second contract surface to keep in sync, not a caller of §1a.

Parameters emitted: `repd_ref` (omitted if the row has none — a join failure, not a gate), `project`, `technology`, `capacity_mw`, `latitude`, `longitude`, `zoom=12` — same seven names, same order, always all-or-nothing on lat/lon/zoom is **not** enforced here the way it is in §1a (lat/lon/zoom are set unconditionally from `row.ll`).

`technology` here (`row.t`) comes from `build_payload.py` line 168: `props.get("tech") or "other"` — i.e. **this emitter is confirmed to send `"other"` live**, for REPD categories the register's own `tech` bucketer can't place (measured at build time: 4 projects, 2 "Unknown" and 2 "Air Source Heat Pumps").

### 1c. Full emitted technology-bucket vocabulary

Combining both emitters, and confirmed against the receiver's own comment stating what it must accept (`atlas/parts/202609041234-sld-sandbox-technology-buckets.js` lines 233–239): **exactly thirteen buckets**, "the four-member spine `solar`/`bess`/`wind_onshore`/`wind_offshore`, plus the nine wider-fleet buckets `biomass`/`hydro`/`hydrogen`/`act`/`tidal`/`geothermal`/`caes`/`flywheel`/`other`."

Spine vocabulary is defined in `app.mjs` lines 105–118 (`TECHNOLOGIES = new Set(["all", "solar", "bess", "wind_onshore", "wind_offshore"])`; `"all"` is a UI filter state, never emitted per-project).

---

## 2. Two receivers (and which one is actually live)

`ATLAS_TARGETS` in the emitter (§1a, lines 51–82) declares two:

- `"legacy"` → `https://globalgrid2050.com/repd_grid_atlasv8/` — proven, was in service; still exists in the `globalgrid2050` repo at `repd_grid_atlasv8/` (confirmed present, last touched by commit `7135d8cc`).
- `"ported"` → `https://ventusltd.github.io/gridatlas/atlas/` — **the currently active target** (`ACTIVE_TARGET = "ported"`, §1a line 85).

Everything below describes the `"ported"` receiver, i.e. `gridatlas/atlas/`, since that is what the live emitter points at.

---

## 3. Receiver: parse/normalise path, in reading order

The live route `/gridatlas/atlas/` is not itself a static page. `atlas/index.html` (`receiver/index-composer.html`) is a **composer**: it fetches `atlas/current.json`, fetches the pinned immutable shell (`atlas/releases/202608300453-atlas-v9/index.html`), and replaces four `<script src>` tags in that shell with four cartridges named in `current.json`, verified by SHA-256, then `document.write`s the result. The query string is untouched by this step — every cartridge below reads `window.location.search` independently, in DOM script order.

Shell script order (`atlas/releases/202608300453-atlas-v9/index.html` lines 133–139, after `maplibre-gl`):

1. `202608292311-maplibre-worker-bridge.js` → replaced by cartridge **streaming-parquet-bridge** (does not touch the deep link).
2. `202608291818-place-postcode-search.js` → replaced by cartridge **uk-gazetteer-flyto**, generation `202609040337` → part `atlas/parts/202609040229-place-global-search-arrival-identity.js`.
3. `ventus-corev8engine.js` → replaced by cartridge **substation-intelligence**, generation `202609041330`, v9.111 → carries `atlas/parts/202609040229-ventus-corev8engine-exact-repd-delegation.js`.
4. `202608292126-pre-snapped-config-adapter.js` → replaced by cartridge **sld-sandbox**, generation `202609041244`, v9.109 → part `atlas/parts/202609041234-sld-sandbox-technology-buckets.js`.

### Step-by-step, in the order each actually fires

**Step 1 — `place-global-search-arrival-identity.js`, `receiveExactRepdDeepLink()`, lines 591–682 (fires first, on `DOMContentLoaded`, line 742).**
- `params.get('repd_ref')` (line 594) → trimmed string. If empty, publishes `state.deep_link = { status: 'ABSENT', ... }` and returns (line 596).
- Identity regex: `/^[A-Za-z0-9-]{1,40}$/` (line 604) — **broader than the emitter's own `/^\d+$/`** (letters and hyphens are accepted here even though the emitter never sends them).
- `suppliedArrivalFields(params, repdRef)` (lines 566–589) reads the advisory fields: `project`→`name`, `technology`, `capacity_mw`, `longitude`, `latitude`, and (not sent by the live emitter, but honoured if another producer sends it) `status`.
- Queries the pinned active-register product for an exact `repd_ref` match; publishes `state.deep_link.status` as one of `RECEIVING` → `RESOLVED` / `NOT_IN_ACTIVE_REGISTER` / `FAILED`. On `RESOLVED` it also republishes the register's own `technology`, `longitude`, `latitude`, `capacity_mw` (lines 653–668), i.e. **the register can override the link-supplied technology/coordinates.**

**Step 2 — `ventus-corev8engine-exact-repd-delegation.js`, `focusCanonicalProjectDeepLink()`, lines 798–840 (called once from `initVentusMap` at line 1495 during engine boot).**
- Re-reads `repd_ref` (line 800) and `technology` (line 804) itself, but **does nothing with them** beyond validating the identity regex and checking `technology` membership against a local `allowedTechnologies` set (lines 805–812, includes `wind_onshore`/`wind_offshore`/`other`). It publishes `window.__GRIDATLAS_V8_DEEP_LINK__ = { status: 'DEFERRED_TO_EXACT_REPD_RECEIVER', ... }` (line 823) and returns. This used to be the V8 engine's own deep-link handler (fetching a legacy `/uk_renewables_pipeline` path); it is now inert by design, deferring to Steps 1 and 3.

**Step 3 — `sld-sandbox-technology-buckets.js`, `runDeepLink()`, lines 4178–4607 (the cartridge that actually measures, draws and cards).**
Boot trigger (`current.json`, `sld-sandbox.boot`): "whichever of `style.load` or `load` arrives first, then an 8s timer" → calls `runDeepLink()` once the tab is visible (lines 4623–4664; retried up to `MAX_AUTO_ARRIVAL_ATTEMPTS = 5` on `visibilitychange` if no visible outcome yet — this exists because iOS Safari does not tick `requestAnimationFrame` in a backgrounded tab, which stalled every arrival opened via the MAP button's `target="_blank"` on touch).
- `q.get('longitude')`, `q.get('latitude')`, `q.get('repd_ref')` → `deepLinkPlan()` (lines 1689–1701) → `route` of `MEASURE_LINK_FIRST` (coordinates usable) / `WAIT_FOR_REGISTER` (repd_ref only) / `NO_USABLE_POINT`.
- `tech = q.get('technology')` (line 4197, raw string, not yet mapped).
- `name = q.get('project')`, `stated = Number(q.get('capacity_mw'))`, `suppliedStatus = q.get('status')`.
- `q.get('zoom')` (line 4216) — parsed, bounds-checked to `[3, 18]`, and applied via `honourRequestedZoom()`. Notable: a code comment records that **until this fix, nothing in the whole repository ever called `get('zoom')`** — Pipeline News had sent it since the emitter's first "full payload" version and it was silently ignored, the map instead using a hard-coded `zoom: 12` baked into the immutable shell's own `flyTo`.
- If `MEASURE_LINK_FIRST`: measures/draws at once from the link's own coordinates while Step 1's register lookup verifies concurrently (`identityVerification`, lines 4287–4299); a different resolved point later triggers a reconciliation re-fly (lines ~4520–4595).
- If `WAIT_FOR_REGISTER`: awaits Step 1's `state.deep_link` to reach a terminal status before doing anything (lines 4300–4346).
- `map.flyTo({ center, zoom })` (lines 4358–4369).
- `arrive()` (lines 4412–4426): `waitForLayerControls(12000)` **then** `enableBoth()` (substation layer + technology layer). This runs *alongside* the measurement, not before it — a prior version awaited this 12s budget before measuring at all, which is the "West Burton on a phone: nothing for ~20s" bug noted in `current.json`'s `arrival_latency` entry.
- `runArrivalSelection()` (from line 4438): card is created **before** the measurement lines are drawn (`ensureArrivalCard`, then declared-connection lookup, then the nearest-substation measurement) — enforced because a `MutationObserver` elsewhere wipes any drawing that exists with no card on screen.

---

## 4. Technology bucket vocabulary: mapping table (verbatim from code)

Source: `atlas/parts/202609041234-sld-sandbox-technology-buckets.js`, lines 266–276 (`receiver/sld-sandbox-technology-vocabulary.excerpt.js`).

```js
const LAYER_ID_FOR_BUCKET = Object.freeze({
  wind_onshore: 'wind',
  wind_offshore: 'wind',
  other: null   // no layer exists; the caller must say so, not search for one
});

function layerIdForBucket(tech) {
  const id = String(tech == null ? '' : tech);
  return Object.prototype.hasOwnProperty.call(LAYER_ID_FOR_BUCKET, id)
    ? LAYER_ID_FOR_BUCKET[id] : id;
}
```

Every other bucket (`solar`, `bess`, `biomass`, `hydro`, `hydrogen`, `tidal`, `geothermal`, `flywheel`, `caes`, `act`) maps to **itself unchanged** — those strings already match a real `data-layer-id` on the engine's own dashboard (confirmed against `REPD_IDS` in `ventus-corev8engine-exact-repd-delegation.js` line 66: `['solar','solar_operational','solar_roof','wind','wind_onshore_operational','wind_offshore_operational','bess','bess_operational','biomass','tidal','hydrogen','hydro','flywheel','act','geothermal','caes']` — note **`wind` is the only wind-related id here**; there is no `wind_onshore` or `wind_offshore` layer id, and no `other` id at all).

### Why this table exists — the 100% failure and its fix

Per the on-page version ledger (`atlas/modules/202609030157-version-ledger.js`, entry `g=202609041244, v=v9.109`, verbatim):

> "Pipeline News' three broken technology buckets (wind_onshore, wind_offshore, other) resolve to the engine's real layer id through one table instead of a set-membership test that read enabled while the layer sat off, on a third of the register; substation-intelligence carried forward unchanged to keep the on-page version ledger current"

The inline comment at lines 259–265 of the same file states the measured blast radius precisely: *"because `isProjectTech('wind_onshore')` is true, the arrival's own `technology_layer.enabled` read true while the DOM search for a control literally named 'wind_onshore' failed every time — 2,508 of 7,680 register rows, a third of it."* This matches the task brief's "failed 100% on release v9.108": the code path existed and passed its own membership test (`PROJECT_TECHS`, lines 163–183, has always included `wind_onshore`/`wind_offshore`/`other`) while the actual DOM lookup for a checkbox by that exact id could never succeed, for every single arrival of that bucket, up to and including v9.108 (the version immediately prior, per `current.json`'s ledger). **v9.109** (generation `202609041244`) is where `LAYER_ID_FOR_BUCKET` was introduced. **v9.111** (generation `202609041330`, current live `substation-intelligence` version) is a later, unrelated UI fix (hides a duplicate v8 masthead); its ledger entry explicitly notes `substation-intelligence carried forward unchanged` — i.e. by v9.111 the bucket fix from v9.109 is simply still in effect, not re-applied. If your source described the fix as landing "in v9.111," that is the version that was *current* when observed, not the version that introduced the fix — the actual authoring generation is `202609041244` / v9.109.

Call sites (`enableTechnologyLayer(tech)`, lines 3007–3053, and the arrival-time `link.technology_layer` assignment, lines 4392–4399): both route through `layerIdForBucket()` exclusively; there is now exactly one place a control is looked up by id.

---

## 5. Arrival sequence after parse (what fires, in order, file:line)

1. `atlas/index.html` — verifies + splices cartridges by SHA-256, `document.write`s the composed shell. (`atlas/index.html:38-97`)
2. `place-global-search-arrival-identity.js:742` — `DOMContentLoaded` → `receiveExactRepdDeepLink(input, resultsEl)` (`:591`) → parses `repd_ref` (`:594`) and advisory fields (`:566-589`) → queries the register → publishes `state.deep_link` (`:613-668`).
3. `ventus-corev8engine-exact-repd-delegation.js:1495` — engine boot calls `focusCanonicalProjectDeepLink()` (`:798`) → re-parses `repd_ref`/`technology` for validation only → publishes `window.__GRIDATLAS_V8_DEEP_LINK__.status = 'DEFERRED_TO_EXACT_REPD_RECEIVER'` (`:823`) → returns; no map action.
4. `sld-sandbox-technology-buckets.js` boot trigger (style/load event, then 8s timer; visibility-gated at `:4635-4642`) → `runDeepLink()` (`:4178`).
5. Inside `runDeepLink()`: `deepLinkPlan()` (`:4193`, defined `:1689`) → zoom parse+bound (`:4216-4223`) → fullscreen entry on touch (`:4265-4273`) → route branch `MEASURE_LINK_FIRST`/`WAIT_FOR_REGISTER` (`:4288-4349`) → `map.flyTo` (`:4358-4369`) → `arrive()` = `waitForLayerControls(12000)` (`:2973`, called `:4420`) racing `runArrivalSelection()` (`:4438`) which does `ensureArrivalCard()` then the nearest-substation measurement → `enableBoth()` (`:4412`) ticks the substation layer and, via `enableTechnologyLayer()` (`:3007`, using `layerIdForBucket()` `:272`), the one technology layer → late-arriving controls recovered by `watchForLayerControls()` (`:2940`, a one-shot `MutationObserver`) → any later register-resolved identity that disagrees with the link-supplied point triggers a reconciliation re-fly/re-measure/re-enable (`:4520-4595`).

---

## 6. Known failure modes and where they're produced

| Failure | Where it's produced | What happens |
|---|---|---|
| **`repd_ref` absent** | `place-global-search-arrival-identity.js:595-598` | `state.deep_link = { status: 'ABSENT' }`; no query, no card. |
| **`repd_ref` present but not in the active-register snapshot** | `place-global-search-arrival-identity.js:624-642` | `status: 'NOT_IN_ACTIVE_REGISTER'`; explicitly *not* treated as a network failure — "evidence about this active snapshot, not evidence the project never existed." |
| **Register query genuinely fails** | `place-global-search-arrival-identity.js:669-681` | `status: 'FAILED'`, pushed to `state.failures`, logged via `console.error('[V9 EXACT REPD DEEP LINK]', ...)`. |
| **Coordinates present but at/near `(0,0)`** | `sld-sandbox-technology-buckets.js:4254-4256` (`coordsUsable`) and `deepLinkPlan:1693-1695` | Null Island guard: `!(Math.abs(lon) < 1e-9 && Math.abs(lat) < 1e-9)`. A link with `Number(null)` coordinates is treated as having none, not as `(0,0)`. |
| **Unusable/out-of-range `zoom`** | `sld-sandbox-technology-buckets.js:4216-4222` | Recorded in `link.failures` ("deep link: unusable zoom \"…\""), falls back to `12`. |
| **Unrecognised `technology` bucket** | `sld-sandbox-technology-buckets.js:4382-4399` (`isProjectTech`, `:220`) | Arrival is **not** abandoned (this used to `return` the whole arrival and cost the card, ring, measurement and substation layer for a "newer register id" case); only `link.technology_layer.enabled` stays `false` with a stated reason. |
| **Recognised bucket, no layer control at all (`other`)** | `sld-sandbox-technology-buckets.js:3013-3021` (`enableTechnologyLayer`) | `layerIdForBucket('other') === null` → `link.technology_layer.reason = 'GridAtlas has no map layer for the "other" technology; nothing to switch on. The card and the distances above it are unaffected.'` — stated as a fact, not retried. |
| **"layer control not found: `<layerId>`"** | `sld-sandbox-technology-buckets.js:3036` | The resolved layer id (post-`layerIdForBucket`) has no matching `input[data-layer-id="…"]` in the DOM *yet*. Pushed via `noteFailure`; recovered automatically the moment a matching control appears (`recoverFailures`, `:3046`, paired with the `MutationObserver` at `:2940`). |
| **12-second grid-data budget exceeded** | `sld-sandbox-technology-buckets.js:2973-3005` (`waitForLayerControls`) | If `link.links_drawn > 0` already, the notice is suppressed (answer already on screen). Otherwise shows: *"The grid data has not finished loading yet. The distances below are already measured; the layers will switch on by themselves if it arrives."* (`:3000-3002`). Budget is **not** a hard cutoff — a `MutationObserver` (`:2940-2959`) keeps watching indefinitely afterward and switches layers on whenever the dashboard does render (measured live arriving anywhere from 2s to 86s). |
| **Tab backgrounded on arrival (iOS Safari)** | `sld-sandbox-technology-buckets.js:4623-4664` | `runDeepLink()` is never started while `document.visibilityState !== 'visible'`; retried up to 5 times on `visibilitychange` until a "visible outcome" (`links_drawn > 0` or a terminal not-in-register state) is reached. Root cause per inline comment: MapLibre's `flyTo` and the engine's paint-driven boot both depend on `requestAnimationFrame`, which iOS Safari does not tick in an uncomposited background tab — Pipeline News' MAP button opens `target="_blank"` on touch devices, so this was reproducible on every phone arrival before the fix. |

---

## 7. Files delivered

- `emitter/atlas-pointer-deep-link.mjs` — the live URL builder (full file).
- `emitter/app-technology-vocabulary.excerpt.mjs` — import + bucket vocabulary + call site from `app.mjs`.
- `emitter/wider-fleet-deep-link.excerpt.mjs`, `emitter/wider-fleet-build_payload.excerpt.py` — the second, independent emitter that can send `technology=other`.
- `receiver/index-composer.html`, `receiver/current.json` — the composition layer (loader + manifest/changelog of record).
- `receiver/place-global-search-arrival-identity.excerpt.js` — Step 1 (identity parse + register lookup).
- `receiver/ventus-corev8engine-exact-repd-delegation.excerpt.js` — Step 2 (now-inert engine handler) + the engine's real layer-id vocabulary (`REPD_IDS`).
- `receiver/sld-sandbox-technology-vocabulary.excerpt.js` — the `LAYER_ID_FOR_BUCKET` fix table.
- `receiver/sld-sandbox-deep-link-plan.excerpt.js` — `deepLinkPlan()`.
- `receiver/sld-sandbox-layer-control.excerpt.js` — the 12s budget, both named failure-mode producers, and late-arrival recovery.
- `receiver/sld-sandbox-run-deep-link.excerpt.js` — `runDeepLink()`, the full Step 3 arrival sequence.
- `receiver/sld-sandbox-boot-trigger.excerpt.js` — the visibility-gated call site.

Exact line ranges and hashes for every file above are in `provenance.json`.
