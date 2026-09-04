# Proposed module split — ventus-corev8engine.js

Principle: follow the seams the code already has (its own state clusters and comment
banners — `// ── Zone Draw`, `// ── Radius Tool`, `// ── Measure Tool`, etc.), not an
idealised layering. Where a function is genuinely mixed (pure maths inline inside a DOM
function), the split pulls the pure part out and leaves a thin DOM caller behind, rather
than reclassifying the whole function as one thing it isn't.

## 1. `geo-core.js` — PURE, trivially testable
**Takes:** lines 32-33 (`EARTH_RADIUS_KM`, `MAX_RADIUS_KM`), 36 (`DEG_TO_RAD`), 45-50
(`haversine`).
**Depends on:** nothing (Math only).
**Exports:** `EARTH_RADIUS_KM`, `MAX_RADIUS_KM`, `DEG_TO_RAD`, `haversineKm(lon1,lat1,lon2,lat2)`.
This is the foundation every other geo module sits on — it's the one primitive in the
file that was already correctly deduplicated (see `duplication.md`), so the split must
not let downstream refactors fork it again.

## 2. `geo-shapes.js` — PURE, trivially testable
**Takes:** lines 122-132 (`_zoneDrawCirclePoints`), 727-740 (`createGeoJSONCircle`,
minus its `FeatureCollection` wrapping), 681-725 (`snapLines`).
**Depends on:** `geo-core.js` (`EARTH_RADIUS_KM`); `createGeoJSONCircle`'s GeoJSON
wrapping step depends on nothing extra (pure object construction) and can stay a thin
wrapper in this module or move to `geo-geojson.js` (below).
**Exports:** `destinationCirclePoints(lon, lat, radiusKm, n)` (the deduplicated form of
the two identical implementations — see `duplication.md` §4), `snapLines(features, subs)`.
This is where the fourth duplication (circle-point formula) actually gets fixed: one
function, called by both the zone-draw path (`n=24`) and the radius-circle path
(`n = radiusKm>5000?128:radiusKm>500?96:64`).

## 3. `geo-area.js` — PURE, trivially testable
**Takes:** lines 134-149 (`_zoneDrawCalcArea`), the inline maths at lines 467-470 +
479-490 (`updateMeasureDisplay`'s length/area block), and lines 576-582
(`doRadiusAreaMeasure`'s spherical-cap block).
**Depends on:** `geo-core.js` (`EARTH_RADIUS_KM`, `haversineKm` for perimeter legs).
**Exports:** `polygonAreaKm2(pts)` (returns `{areaKm2, areaHa, areaAc, areaMi2, areaM2,
pitches}`, one shared acre constant — this is where duplication A/B collapses to one
function and the acre-conversion drift disappears), `polylinePerimeterKm(pts, closed)`,
`circleCapAreaKm2(radiusKm)` (Impl C, kept as an explicitly separate function per
`duplication.md`'s finding that it is not interchangeable with the polygon formula).
This module is the direct fix for "three area implementations" — two of the three merge
into one, the third stays distinct but named honestly.

## 4. `geo-geojson.js` — PURE
**Takes:** lines 727-740 (`createGeoJSONCircle`'s wrapping half, now calling
`destinationCirclePoints` from `geo-shapes.js`).
**Depends on:** `geo-shapes.js`.
**Exports:** `circleFeatureCollection(lon, lat, radiusKm)`.
Kept separate from `geo-shapes.js` because it returns a GeoJSON `FeatureCollection`
(a data-shape decision, still pure/no DOM) rather than raw coordinate pairs — callers
that only want points (zone draw) shouldn't have to depend on GeoJSON shaping.

## 5. `data-loading.js` — DATA LOAD, testable with a mocked `fetch`
**Takes:** lines 645-653 (`FetchQueue`), 654 (`networkQueue`), 656-665
(`fetchWithTimeout`), 667-678 (`fetchAndParseGeoJSON`), 364 (`urlCache`).
**Depends on:** nothing beyond the platform `fetch`/`AbortController`.
**Exports:** `FetchQueue`, `fetchWithTimeout`, `fetchAndParseGeoJSON`.
No MapLibre/DOM references at all in this cluster — it's already accidentally clean;
the only reason it wasn't already a module is that it lives in the same closure as
everything else.

## 6. `config.js` — GLUE, data-only
**Takes:** lines 53-93 (`GRID_CONFIG`, `RUNTIME_STATE` init, `layerConfigById`,
`REPD_IDS`, `TRANSIT_IDS`, `TRANSIT_SOURCE_MAP`, `TRANSIT_URLS`, `SEARCH_THRESHOLD`,
`TECH_TERMS`, `TECH_COLOURS`, `STATUS_COLOURS`), 10-15 (`deepFreeze`).
**Depends on:** the `config` object passed into `initVentusMap`.
**Exports:** all of the above as named consts/functions.
Pure data shaping — no DOM, no network, no maths — but not "PURE MATHS" either, so it's
its own thin GLUE module rather than forced into `geo-*`.

## 7. `format-utils.js` — GLUE (pure, non-geodesic), trivially testable
**Takes:** lines 17-21 (`escapeHTML`), 23-25 (`normalizeStatus`), 27-29 (`fmt`).
**Depends on:** nothing.
**Exports:** `escapeHTML`, `normalizeStatus`, `fmt`.
Deliberately not filed under PURE MATHS (per the task's own domain boundary — geodesy/
distance/area/bearing/arithmetic) but it is just as easy to unit-test; called out
separately so a reviewer doesn't miss it while only skimming `geo-*`.

## 8. `zone-draw.js` — MAP/DOM (needs a MapLibre `map` + `document`)
**Takes:** lines 104-111 (state), 113-120 (`_zoneDrawGetRadius`), 151-361 (everything
from `_zoneDrawUpdateLayers` through `_zoneDrawOnMouseUp`), excluding the two pure
functions already pulled into `geo-shapes.js`/`geo-area.js`.
**Depends on:** `map`, `document`, `geo-shapes.js` (`destinationCirclePoints`),
`geo-area.js` (`polygonAreaKm2`), `geo-core.js` (`haversineKm` for perimeter),
`format-utils.js` (`fmt`), `openPopup`/`closeActivePopup` from `popups.js`.
**Exports:** `toggleZoneDrawMode`, `zoneDrawUndo`, and the mouse handlers for wiring
into `map.on(...)` in the bootstrap module.
This is the most self-contained DOM tool — a good template for how the other tools
should look post-split.

## 9. `measure-tool.js` — MAP/DOM
**Takes:** lines 447-530 (`updateMeasureDisplay` through `toggleMeasureMode`, with its
area/length maths now delegating to `geo-area.js`).
**Depends on:** `map`, `document`, `geo-area.js`, `geo-core.js`, `format-utils.js`.
**Exports:** `toggleMeasureMode`, `undoLastMeasurePoint`, click/dblclick hooks.

## 10. `radius-tools.js` — MAP/DOM
**Takes:** lines 428-444 (radius bounds/validation), 533-599 (radius-area tool), 941-986
(radius-search tool), 742-743 (`drawRadiusCircle`/`clearRadiusCircle`).
**Depends on:** `map`, `document`, `geo-core.js` (`haversineKm`), `geo-area.js`
(`circleCapAreaKm2`), `geo-geojson.js` (`circleFeatureCollection`), `format-utils.js`,
`allREPDFeatures` (from `data-state.js`, below).
**Exports:** `toggleRadiusMode`, `toggleRadiusAreaMode`, `doRadiusSearch`,
`doRadiusAreaMeasure`.
Note: `doRadiusSearch` (955-986) is the one place `haversine` is used as a *filter*
rather than a shape-builder — worth keeping visible in review since it's a third,
independent consumer of the one deduplicated distance primitive.

## 11. `popups.js` — MAP/DOM
**Takes:** lines 370-383 (`activePopup`, `openPopup`, `closeActivePopup`,
`window._closePopupKeepShape`), 759-794 (`buildSearchButtons`, `flyToProject`),
862-884 (`searchProjects`), the big popup-template branch inside `map.on('click', …)`
(lines 1367-1390).
**Depends on:** `map`, `document`, `config.js` (`REPD_IDS`, `TECH_COLOURS`,
`SEARCH_THRESHOLD`, `TECH_TERMS`, `STATUS_COLOURS`), `format-utils.js`.
**Exports:** `openPopup`, `closeActivePopup`, `flyToProject`, `searchProjects`,
`buildSearchIndex`.

## 12. `layers.js` — MAP/DOM, the biggest remaining chunk
**Takes:** lines 989-1198 (`buildLayerRow`, `buildDOM`, `handleLayerToggle`,
`getLayerConfig`, `getSourceIdForLayer`, `hydrateLayer` incl. nested `evalFilter`),
905-939 (`toggleStatusMode`), 1201-1336 (the source/layer-construction half of
`map.on('load', …)` — basemap, tool-overlay sources, every REPD glow/base layer, transit,
EV, NAEI).
**Depends on:** `map`, `document`, `config.js`, `data-loading.js`
(`fetchAndParseGeoJSON`), `geo-shapes.js` (`snapLines`), `popups.js`
(`buildSearchIndex`), `format-utils.js` (`fmt`).
**Exports:** `buildDOM`, `handleLayerToggle`, `hydrateLayer`.
This is the module most worth splitting further later (layer *construction* — mostly
static paint/style objects — is naturally separable from layer *hydration* — the fetch
+ stats pipeline), but the task is to follow existing seams, and today they are one
function/one `map.on('load')` block, so it is proposed as one module for the first cut.

## 13. `deep-link.js` — DATA LOAD (network-dominant, touches map at the end)
**Takes:** lines 798-860 (`focusCanonicalProjectDeepLink`).
**Depends on:** `fetch`, `map`, `popups.js` (`flyToProject`), `layers.js`
(`handleLayerToggle`).
**Exports:** `focusCanonicalProjectDeepLink`.
Called out separately from `data-loading.js` because, unlike `fetchWithTimeout`/
`fetchAndParseGeoJSON`, it is not reusable fetch infrastructure — it's one specific,
V9-manifest-shaped feature with its own error handling and a hard dependency on `map`
and DOM (`document.querySelector('input[data-layer-id=...]')`).

## 14. `bootstrap.js` — MAP/DOM, glue-only
**Takes:** the rest: 3-9 (guard clause), 386-425 (fullscreen), 601-619 (map init, clock,
ResizeObserver), 745-756 (visible-layer cache), 1339-1426 (event-handler wiring half of
`map.on('load', …)`: mousedown/click/dblclick/mouseup/mousemove, preload kickoff).
**Depends on:** every module above.
**Exports:** nothing — this is the file that becomes the new, much smaller
`ventus-corev8engine.js`, importing and wiring the rest together exactly as
`window.initVentusMap` does today.

---

## PURE vs. needs-a-DOM, at a glance

**Trivially unit-testable today, zero test scaffolding needed** (modules 1-5, 7):
`geo-core.js`, `geo-shapes.js`, `geo-area.js`, `geo-geojson.js`, `data-loading.js`
(with `fetch` mocked), `format-utils.js`. This is ~230 of the file's 1427 lines
(haversine, both circle-point formulas, both duplicated area formulas, the spherical
cap, snapLines, the fetch queue) — small in line count but it is *all* of the file's
actual mathematics and its only real duplication bugs.

**Needs a live/mocked `document` and MapLibre `map` object** (modules 8-14): the
remaining ~1200 lines. None of it is inherently untestable — MapLibre GL JS can run
headless against a stub style — but it needs that harness, whereas modules 1-7 need
nothing but a JS runtime. `config.js` (module 6) sits in between: no DOM/map, but not
maths either, so it's pure-but-parked with the GLUE group rather than claimed by either
extreme.
