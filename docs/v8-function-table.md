# Function table — ventus-corev8engine.js

Source: `repd_grid_atlasv8/ventus-corev8engine.js` (1427 lines), one closure returned as
`window.initVentusMap = function({config, center, zoom}) {...}` (line 3 – line 1427).
Repo HEAD at time of this audit: `7d00781b6993b9038a1a8bedf2c88a4eb0109ad4`.

Classification legend: **PURE MATHS** (no DOM, no network, deterministic — geodesy,
distance, area, bearing, arithmetic) · **DATA LOAD** (fetch/parse/cache) ·
**MAP/DOM** (touches `document`, the MapLibre `map` object, or CSS) · **GLUE** (wiring,
state, event handlers, or pure-but-non-geodesic utility code).

| Name | Start | End | Purpose | Class |
|---|---|---|---|---|
| `window.initVentusMap` (outer closure) | 3 | 1427 | Entry point; builds the whole engine in one closure over `map` | GLUE |
| `deepFreeze` | 10 | 15 | Recursively `Object.freeze`s the config tree | GLUE (pure utility, non-maths) |
| `escapeHTML` | 17 | 21 | HTML-escapes a value for popup templates | GLUE (pure utility, non-maths) |
| `normalizeStatus` | 23 | 25 | Lower-cases/trims a status string for colour lookup | GLUE (pure utility, non-maths) |
| `fmt` | 27 | 29 | `toLocaleString` number formatter | GLUE (pure utility, non-maths) |
| `EARTH_RADIUS_KM`, `MAX_RADIUS_KM` | 32 | 33 | Earth-model constants (sphere radius, half-circumference) | PURE MATHS |
| Named-constant block (`DEG_TO_RAD`, `HIT_RADIUS_VERTEX_PX`, `HIT_RADIUS_EDGE_PX`, `CLICK_DEBOUNCE_MS`, `HOVER_THROTTLE_MS`, `POPUP_MAX_WIDTH`, `ZONE_DRAW_VERTICES`, `ZONE_DRAW_DEFAULT_KM`) | 36 | 43 | UI/geometry tuning constants | GLUE |
| `haversine` | 45 | 50 | Great-circle distance between two lon/lat points (km) | PURE MATHS |
| `GRID_CONFIG` (`deepFreeze(config)`) | 53 | 53 | Frozen copy of the injected layer config | GLUE |
| `RUNTIME_STATE` init loop | 54 | 59 | Per-layer `{status,loading,loaded}` state map | GLUE |
| `layerConfigById` | 61 | 63 | `Map` from layer id → config object | GLUE |
| `REPD_IDS` | 66 | 66 | List of REPD technology layer ids | GLUE |
| `TRANSIT_IDS`, `TRANSIT_SOURCE_MAP`, `TRANSIT_URLS` | 67 | 69 | Transit layer id/source/url wiring | GLUE |
| `SEARCH_THRESHOLD` | 71 | 74 | Per-tech MW threshold for showing News/Images buttons | GLUE |
| `TECH_TERMS` | 76 | 81 | Tech id → human search term | GLUE |
| `TECH_COLOURS` | 83 | 87 | Tech id → hex colour | GLUE |
| `STATUS_COLOURS` | 89 | 93 | Status string → hex colour | GLUE |
| Tool-mode state (`statusMode`, `radiusMode`, `radiusMarker`, `radiusCenter`, `radiusAreaMode`, `radiusAreaMarker`, `radiusAreaCenter`) | 95 | 102 | Mutable tool-mode flags/markers | GLUE |
| Zone-draw state block | 104 | 111 | `zoneDrawMode`, `zoneDrawPoints`, drag state, `ZONE_DRAW_MAX_KM` | GLUE |
| `_zoneDrawGetRadius` | 113 | 120 | Reads/clamps the zone-draw radius `<input>` | MAP/DOM |
| `_zoneDrawCirclePoints` | 122 | 132 | Destination-point circle vertices around a centre (n points) | PURE MATHS |
| `_zoneDrawCalcArea` | 134 | 149 | Spherical polygon area + perimeter + derived units | PURE MATHS |
| `_zoneDrawUpdateLayers` | 151 | 176 | Pushes zone-draw polygon/points into MapLibre sources | MAP/DOM |
| `_zoneDrawPopupRaf` | 178 | 178 | rAF handle for popup debounce | GLUE |
| `_zoneDrawShowPopup` | 180 | 217 | Builds/opens the zone-draw stats popup HTML | MAP/DOM |
| `_zoneDrawShowPopupDebounced` | 219 | 222 | rAF-throttled wrapper around `_zoneDrawShowPopup` | GLUE |
| `_zoneDrawClear` | 224 | 236 | Resets zone-draw state and clears layers/popup/DOM display | MAP/DOM |
| `zoneDrawUndo` | 238 | 243 | Pops last vertex or clears if ≤3 left | GLUE |
| `toggleZoneDrawMode` | 245 | 259 | Enables/disables zone-draw tool, deconflicts other tools | MAP/DOM |
| `_zoneDrawNearVertex` | 261 | 268 | Pixel hit-test against vertices via `map.project` | MAP/DOM |
| `_zoneDrawNearEdgeDot` | 270 | 282 | Pixel hit-test against edge midpoint dots | MAP/DOM |
| `_zoneDrawOnClick` | 284 | 322 | Click handler: seed circle / add vertex / recentre | MAP/DOM |
| `_zoneDrawOnMouseDown` | 324 | 335 | Starts vertex drag | MAP/DOM |
| `_zoneDrawOnMouseMove` | 337 | 349 | Drags vertex / sets hover cursor | MAP/DOM |
| `_zoneDrawOnMouseUp` | 351 | 361 | Ends vertex drag | MAP/DOM |
| `urlCache`, `globalSubsData`, `allREPDFeatures`, `searchIndex` | 364 | 367 | Module-level data caches | GLUE |
| `activePopup` | 370 | 370 | Singleton popup handle | GLUE |
| `openPopup` | 371 | 379 | Opens (and replaces) the single MapLibre popup | MAP/DOM |
| `closeActivePopup` | 380 | 382 | Removes the active popup | MAP/DOM |
| `window._closePopupKeepShape` | 383 | 383 | Popup-close hook called from inline `onclick` HTML | MAP/DOM |
| `fsActive`, `curtainOpen` | 386 | 387 | Fullscreen state flags | GLUE |
| `window.enterFullscreen` | 389 | 399 | Enters fullscreen, toggles classes, calls `map.resize()` | MAP/DOM |
| `window.exitFullscreen` | 401 | 414 | Exits fullscreen, reverse of above | MAP/DOM |
| `toggleCurtain` | 416 | 422 | Toggles the fullscreen layer-curtain panel | MAP/DOM |
| `fullscreenchange`/`webkitfullscreenchange` listeners | 424 | 425 | Syncs state if user exits fullscreen via browser chrome | GLUE |
| `RADIUS_MIN`, `RADIUS_MAX` | 428 | 429 | Radius-tool bounds | GLUE |
| `getRadiusValue` | 431 | 436 | Reads/clamps the radius `<input>` | MAP/DOM |
| `validateRadiusInput` | 438 | 444 | Validates radius input, toggles `.invalid` class | MAP/DOM |
| Measure-tool state (`measureMode`, `measurePoints`, `measureClosed`, `_lastMouseMoveRaf`) | 447 | 450 | Mutable measure-tool state | GLUE |
| `updateMeasureDisplay` | 452 | 498 | Recomputes length/area (inline maths, lines 467-490) and writes many DOM nodes | MAP/DOM (contains inline PURE MATHS, see duplication.md) |
| `updateMeasureLayers` | 500 | 507 | Pushes measure line/fill/points into MapLibre sources | MAP/DOM |
| `clearMeasure` | 509 | 512 | Resets measure state/layers/DOM | MAP/DOM |
| `undoLastMeasurePoint` | 514 | 517 | Pops last measure point | MAP/DOM |
| `toggleMeasureMode` | 519 | 530 | Enables/disables measure tool, deconflicts other tools | MAP/DOM |
| `toggleRadiusAreaMode` | 533 | 557 | Enables/disables radius-area tool | MAP/DOM |
| `doRadiusAreaMeasure` | 559 | 599 | Draws circle, computes spherical-cap area (inline, 576-582), opens popup | MAP/DOM (contains inline PURE MATHS, see duplication.md) |
| Clock `setInterval` | 602 | 608 | Updates clock/date/countdown DOM every second | MAP/DOM |
| `map` (MapLibre instance) | 611 | 617 | Creates the MapLibre GL map | MAP/DOM |
| `ResizeObserver` wiring | 619 | 619 | Calls `map.resize()` on container resize | MAP/DOM |
| `updateUIState` | 622 | 642 | Writes layer status/label text into the key panel | MAP/DOM |
| `FetchQueue` (class) | 645 | 653 | Bounded-concurrency async task queue | GLUE |
| `networkQueue` | 654 | 654 | `FetchQueue(4)` instance used by all fetches | GLUE |
| `fetchWithTimeout` | 656 | 665 | `fetch` with `AbortController` timeout | DATA LOAD |
| `fetchAndParseGeoJSON` | 667 | 678 | Fetches + memoises a GeoJSON URL into `.features` | DATA LOAD |
| `snapLines` | 681 | 725 | Snaps LineString/MultiLineString endpoints onto nearby substation points | PURE MATHS |
| `createGeoJSONCircle` | 727 | 740 | Destination-point circle → GeoJSON `FeatureCollection` (radius tool) | PURE MATHS |
| `drawRadiusCircle` | 742 | 742 | Writes circle geometry into `src-radius-circle` | MAP/DOM |
| `clearRadiusCircle` | 743 | 743 | Empties `src-radius-circle` | MAP/DOM |
| `_visibleInteractiveIds`, `_visibleHoverIds` | 745 | 746 | Cached lists of currently-visible interactive layer ids | GLUE |
| `_rebuildVisibleCache` | 748 | 754 | Rebuilds the above from `map.getLayoutProperty` | MAP/DOM |
| `_lastHoverMs` | 756 | 756 | Hover-throttle timestamp | GLUE |
| `buildSearchButtons` | 759 | 770 | Builds News/Images `<a>` HTML for a popup | GLUE (pure string build, non-maths) |
| `buildSearchIndex` | 772 | 776 | Builds `searchIndex` from `allREPDFeatures` | GLUE |
| `flyToProject` | 778 | 794 | `map.flyTo` + opens a project popup | MAP/DOM |
| `focusCanonicalProjectDeepLink` | 798 | 860 | Fetches V9 manifest/project JSON, resolves `?repd_ref=`, adds a source/layer, flies to it | DATA LOAD (network-dominant; also touches map/DOM) |
| `searchProjects` | 862 | 884 | Filters `searchIndex`, renders results list, wires click handlers | MAP/DOM |
| `exportCSV` | 887 | 902 | Builds a CSV Blob from visible REPD features and triggers a download | MAP/DOM |
| `toggleStatusMode` | 905 | 939 | Repaints REPD layers by status vs. capacity colour ramps | MAP/DOM |
| `toggleRadiusMode` | 941 | 953 | Enables/disables radius-search tool | MAP/DOM |
| `doRadiusSearch` | 955 | 986 | Filters `allREPDFeatures` by `haversine` distance, builds summary popup | MAP/DOM (uses PURE MATHS `haversine`) |
| `buildLayerRow` | 989 | 997 | Builds one fullscreen-curtain layer checkbox row | MAP/DOM |
| `buildDOM` | 999 | 1106 | Builds the whole layer-key panel + wires ~15 event listeners | MAP/DOM |
| `handleLayerToggle` | 1109 | 1121 | Shows/hides a layer, updates visible-id caches, triggers hydration | MAP/DOM |
| `getLayerConfig` | 1123 | 1123 | `layerConfigById.get(id)` accessor | GLUE |
| `getSourceIdForLayer` | 1125 | 1130 | Maps a layer id to its MapLibre source id | GLUE |
| `hydrateLayer` | 1132 | 1198 | Fetches a layer's GeoJSON, snaps it, pushes into its source, updates stats/UI | DATA LOAD |
| ⤷ nested `evalFilter` | 1163 | 1170 | Mini interpreter for MapLibre `['==']/['all']/['>=']` filter expressions | GLUE (pure logic, non-maths) |
| `map.on('load', …)` | 1201 | 1426 | Adds every MapLibre source/layer (basemap, tool overlays, REPD glow/base layers, transit, EV, NAEI), then wires all map event handlers | MAP/DOM |
| ⤷ `mousedown` listener (zone-draw) | 1341 | 1345 | Forwards canvas mousedown to `_zoneDrawOnMouseDown` | MAP/DOM |
| ⤷ `map.on('click', …)` | 1347 | 1391 | Master click router: tool modes → feature-type popups (supermarket/station/stadium/NAEI emitter/default REPD-or-infra) | MAP/DOM |
| ⤷ `map.on('dblclick', …)` | 1393 | 1401 | Closes the measure polygon | MAP/DOM |
| ⤷ `mouseup` (window) listener | 1403 | 1403 | Ends zone-draw drag | MAP/DOM |
| ⤷ `map.on('mousemove', …)` | 1405 | 1422 | Zone-draw drag/hover, throttled hover cursor for other tools | MAP/DOM |
| ⤷ preload + deep-link kickoff | 1424 | 1425 | Hydrates `preload:true` layers, calls `focusCanonicalProjectDeepLink()` | GLUE |

**Totals:** ~90 named entities. 6 are PURE MATHS as standalone functions/constants
(`EARTH_RADIUS_KM`/`MAX_RADIUS_KM`, `haversine`, `_zoneDrawCirclePoints`,
`_zoneDrawCalcArea`, `snapLines`, `createGeoJSONCircle`); 2 more pure-maths blocks are
buried inline inside otherwise DOM-heavy functions (`updateMeasureDisplay` lines
467-490, `doRadiusAreaMeasure` lines 576-582) — see `duplication.md` and `extract/`.
