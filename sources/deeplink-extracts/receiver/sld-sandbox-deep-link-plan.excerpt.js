/*
 * PROVENANCE (excerpt)
 * source_repo: gridatlas
 * source_path: atlas/parts/202609041234-sld-sandbox-technology-buckets.js
 * head_sha (gridatlas): 64268fd06a0da54ddffbcdaaaee382e314e829f7
 * lines: 1684-1702
 *
 * deepLinkPlan(): the pure decision of what route an arrival takes, based on
 * whether the link supplied usable coordinates and/or a repd_ref. Exported as
 * link.measure.deepLinkPlan so a proof can run it against the whole PipelineNews
 * link corpus without booting a map.
 *   MEASURE_LINK_FIRST -- usable longitude+latitude present: measure/draw at
 *     once using the link's own point; register identity verifies concurrently.
 *   WAIT_FOR_REGISTER  -- no usable coordinates but a repd_ref is present:
 *     nothing safe to draw until the register (see the search-lane excerpt)
 *     resolves it.
 *   NO_USABLE_POINT    -- neither: nothing this cartridge can do.
 */
  /* The receiver decision is pure and exported because Pipeline News owns
     the complete link corpus. The product path below consumes this exact
     plan; the corpus proof can therefore pass all 8,756 derived source
     points (8,753 served coordinate rows and 8,743 clickable actions)
     through the same decision without booting a map or a 35.7 MB register. */
  function deepLinkPlan(rawLon, rawLat, rawRepdRef) {
    const longitude = rawLon === null ? NaN : Number(rawLon);
    const latitude = rawLat === null ? NaN : Number(rawLat);
    const repdRef = String(rawRepdRef || '').trim();
    const coordinatesUsable = Number.isFinite(longitude) && Number.isFinite(latitude)
      && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90
      && !(Math.abs(longitude) < 1e-9 && Math.abs(latitude) < 1e-9);
    return Object.freeze({
      longitude, latitude, repd_ref: repdRef, coordinates_usable: coordinatesUsable,
      route: coordinatesUsable ? 'MEASURE_LINK_FIRST'
        : (repdRef ? 'WAIT_FOR_REGISTER' : 'NO_USABLE_POINT')
    });
  }
  link.measure.deepLinkPlan = deepLinkPlan;
