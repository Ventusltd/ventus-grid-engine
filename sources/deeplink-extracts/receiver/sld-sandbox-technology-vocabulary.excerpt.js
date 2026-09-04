/*
 * PROVENANCE (excerpt)
 * source_repo: gridatlas
 * source_path: atlas/parts/202609041234-sld-sandbox-technology-buckets.js
 * head_sha (gridatlas): 64268fd06a0da54ddffbcdaaaee382e314e829f7
 * lines: 145-276
 *
 * Assembled into the LIVE cartridge "sld-sandbox" (current.json generation
 * 202609041244, v9.109) via
 * atlas/manifests/202609041244-sld-sandbox-v9-8-parts.json ('part' role).
 * Loaded as the FOURTH and last script the shell loads (replaces
 * 202608292126-pre-snapped-config-adapter.js).
 *
 * THIS IS THE v9.109 FIX. Version ledger entry for generation 202609041244:
 * "Pipeline News' three broken technology buckets (wind_onshore, wind_offshore,
 * other) resolve to the engine's real layer id through one table instead of a
 * set-membership test that read enabled while the layer sat off, on a third of
 * the register." (atlas/modules/202609030157-version-ledger.js, VERSION_LEDGER
 * entry g=202609041244, v=v9.109.)
 *
 * Before this table existed, isProjectTech('wind_onshore') returning true was
 * read as "the layer is enabled" even though no DOM control named
 * data-layer-id="wind_onshore" has ever existed -- the engine's own layer id is
 * 'wind' (see REPD_IDS in ventus-corev8engine-exact-repd-delegation.excerpt.js).
 * 2,508 of 7,680 register rows (a third) had a MAP button that silently did
 * nothing.
 *
 * LAYER_ID_FOR_BUCKET is the canonical mapping table, verbatim from source:
 *   wind_onshore -> 'wind'
 *   wind_offshore -> 'wind'
 *   other -> null   (no layer exists; the caller must say so, not search for one)
 *   any other bucket -> itself unchanged (solar, bess, biomass, hydro, hydrogen,
 *     tidal, geothermal, flywheel, caes, act all already match a real layer id)
 */
  const LINK_COUNT = 5;              // how many substations to reach for
  const MAX_LINK_KM = 40;            // beyond this, silence is more honest
  const SUBS_URL = 'data/grid_substations.geojson';
  const SUBS_LAYER_ID = 'l-subs';    // engine convention: layer `l-<id>`, source `src-<id>`

  // Project technologies this fires for. Onshore only: an offshore turbine's
  // export route is nothing like a straight line to the nearest onshore
  // substation, so drawing one would be a picture of a lie.
  /* Every technology the register actually uses, and then some.
     ----------------------------------------------------------------------
     This set was solar, bess and two spellings of wind, and it silently
     rejected the rest. Counted against the shipped register: 2,399 onshore
     wind projects and 109 offshore, so 2,508 of 7,680 — a third of the
     register — had a MAP button that did nothing at all. Not an error, not a
     message, nothing: the deep link tested membership and returned.

     The register writes `wind_onshore`. The engine has had a `wind_onshore`
     layer the whole time. Only this list disagreed with both.

     So it no longer decides alone. The list below is the fast path, and
     anything the ENGINE has a layer control for is accepted too — the engine
     owns the layers, so the engine's vocabulary is the authority and this
     stops being a place a technology can be forgotten. */
  const PROJECT_TECHS = new Set([
    'solar', 'solar_operational', 'solar_roof',
    'bess', 'bess_operational',
    'wind', 'wind_onshore', 'wind_onshore_operational',
    'wind_offshore', 'wind_offshore_operational',
    // The rest of the engine's own generation and storage dashboard, read off
    // the live page rather than guessed. Note wind_onshore is NOT among the
    // engine's layer ids -- it has `wind` and `wind_onshore_operational` --
    // yet the register writes wind_onshore for 2,399 projects. Asking the
    // engine alone would still have missed every one of them, which is why the
    // explicit entry above is not redundant with the lookup below.
    'biomass', 'hydro', 'hydrogen', 'tidal', 'geothermal',
    'flywheel', 'caes', 'act',
    /* `other` is what the register writes for a category it has no
       bucket for. Over the 11,069-row REPD product this Atlas's search
       lane reads, 25 DESNZ categories normalise to 14 ids and `other` was
       the only one missing here - 4 projects, 2 Unknown and 2 Air Source
       Heat Pumps. Not many; not zero; and written again the next time the
       register gains a category. */
    'other'
  ]);

  /* Which technologies measure, and what each measurement is OF, is owned by
     the technology-coverage module rather than by this file. It is assembled
     into this cartridge ahead of this part, so it is here by the time any of
     this runs; the fallback below exists only so a proof can load this part
     alone, and it reproduces the module's answer rather than a different one.

     Offshore NO LONGER WITHHOLDS. It used to open a card and draw nothing, on
     reasoning about export cables and landfalls that was right about routes
     and wrong about whether to measure at all. An offshore project's export
     cable does land at an onshore substation, so the distance is a
     measurement of something real. What changed is the answer; what did not
     change is a single word of the route reasoning, which the module now
     prints beside the number instead of instead of it. */
  const coverage = (() => {
    try {
      const module = window.__GRIDATLAS_MODULES__?.technologyCoverage;
      if (module && typeof module.policy === 'function') return module;
    } catch (_) { /* fall through to the local reproduction */ }
    const OFF = new Set(['wind_offshore', 'wind_offshore_operational']);
    return {
      policy: (tech) => ({ technology: tech || null, measure: true,
        offshore: OFF.has(String(tech || '')),
        sample: 'nearest of the mapped substations at or above the voltage '
          + 'floor that this search could see',
        notes: [] }),
      namedOffshore: () => false
    };
  })();
  const OFFSHORE_TECHS = new Set(['wind_offshore', 'wind_offshore_operational']);

  function isProjectTech(tech) {
    if (!tech) return false;
    if (PROJECT_TECHS.has(tech)) return true;
    // Ask the engine. If it has a control for this layer, it is a technology
    // this map knows about, whatever this cartridge was written knowing.
    try {
      return Boolean(document.querySelector(
        'input[type=checkbox][data-layer-id="' + String(tech).replace(/"/g, '') + '"]'));
    } catch (error) {
      return false;
    }
  }

  /* Pipeline News' MAP link sends a technology BUCKET, not a layer id, and
     the two are not the same vocabulary. There are exactly thirteen buckets
     it can send -- the four-member spine solar/bess/wind_onshore/
     wind_offshore, plus the nine wider-fleet buckets biomass/hydro/
     hydrogen/act/tidal/geothermal/caes/flywheel/other -- see
     atlas/modules/202609031310-technology-coverage.js SPINE and
     widerFleetBuckets(), which is the one place that list is owned.

     isProjectTech() above tests membership of PROJECT_TECHS, which
     deliberately contains wind_onshore, wind_offshore and other so that an
     arrival for one of them is not abandoned. That membership test answers
     "is this a technology the map recognises", not "is there a layer
     control with this exact id" -- and those are different questions here:

       - wind_onshore and wind_offshore are not layer ids. The engine
         publishes one combined `wind` layer, filtered on tech === 'wind',
         which is inclusive of both orientations and every status (see
         ukConfig's REPD layer group); wind_onshore_operational and
         wind_offshore_operational are narrower operational-only subsets,
         not the general layer. A deep link for either bucket wants the
         general layer switched on, so both resolve to 'wind'.
       - other has never had a layer control at all. 25 DESNZ categories
         normalise to 14 register ids and `other` is the one bucket that
         genuinely has nothing to switch on -- not a bug to retry, a fact
         to state.

     Measured live on v9.107: because isProjectTech('wind_onshore') is
     true, the arrival's own technology_layer.enabled read true while the
     DOM search for a control literally named "wind_onshore" failed every
     time -- 2,508 of 7,680 register rows, a third of it. One table here,
     consulted at the one place a control is actually looked up, so a
     bucket cannot go missing from it the way these three did while still
     passing the membership test that was supposed to catch that. */
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
