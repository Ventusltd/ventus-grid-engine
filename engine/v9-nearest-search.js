/**
 * Module: nearest-search (substation-lookup)
 *
 * Extracted from gridatlas/atlas/modules/202609011950-substation-lookup.js.
 *
 * IMPORTANT PROVENANCE NOTE (see ../duplication.md 2(a)):
 * This module is committed to the gridatlas repo but is NOT referenced by
 * any composition/parts manifest and is NOT loaded by the live Atlas. The
 * nearest-substation search that actually runs in production is a
 * byte-different inline duplicate inside
 * atlas/cartridges/202609041330-substation-intelligence-v9-63.js
 * (state.nearest, lines 6083-6092 of that file). Both implementations do a
 * full exhaustive O(n) scan with no bbox/ring pre-filter, so neither has
 * the ring-search-excludes-true-nearest bug; the divergence is purely
 * architectural (dead module vs. hand-rolled duplicate), documented in
 * duplication.md.
 *
 * Finding a substation by the name someone wrote, and by position. Two
 * jobs, one boundary:
 *
 *   normalise(name)   the lookup key, matching the one data-grid-gb's own
 *                     join uses, so a name that matched there matches here
 *   index(points)     a name map and a located list, built once
 *   nearest(...)      the closest located sites, measured on the estate's
 *                     single radius via the geodesy module
 *
 * It does NOT fetch, render, summarise or decide. The cartridge fetches;
 * the summary module writes sentences; this only finds.
 *
 * CHANGED: source is an IIFE that reads its geodesy dependency off
 * `window.__GRIDATLAS_MODULES__.geodesy` and throws at load time if it is
 * absent. Replaced with a static ES import of ./geodesy.mjs. No formula or
 * control flow changed otherwise.
 */
import { distanceKm } from './v9-geodesy.js';

/* Deliberately dull. This is a lookup key, not a search engine, and it
   must stay byte-compatible with the normalisation the owner product's
   join uses - if the two drift, a name that joined upstream stops
   resolving downstream and nobody sees it happen. */
const NOISE = /\b(SUBSTATION|SUB STATION|SUBSTN|GRID|SUPPLY|POINT|GSP|NATIONAL|POWER|STATION|WIND|FARM|WINDFARM|OFFSHORE|ONSHORE|EXTENSION|400KV|275KV|132KV|66KV|33KV|11KV|NGET|SSE|SP|SHE)\b/g;

export function normalise(name) {
  return String(name || '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(NOISE, ' ')
    .split(/\s+/).filter(Boolean).join(' ');
}

export function index(points) {
  const byName = new Map();
  const located = [];
  for (const point of points || []) {
    const key = normalise(point && point.name);
    if (key && !byName.has(key)) byName.set(key, point);
    if (point && point.location) located.push(point);
  }
  return {
    size: byName.size,
    located: located.length,
    byName: (name) => byName.get(normalise(name)) || null,
    /* Nearest by measurement, not by guess. minimumKv filters on the
       highest voltage the site declares; limit 1 returns one match or
       null, anything else returns a sorted list.

       NOTE: this is an exhaustive scan over every located point -- no
       bbox/ring pre-filter -- so it cannot exhibit the ring-search bug
       (a pre-filter that excludes the true nearest node). It is O(n) per
       call; grid-distance-maths' SpatialIndex.nearest() is the estate's
       answer for when that stops being fast enough, with a proven
       early-termination bound (see ./nearest-search-spatial-index.mjs). */
    nearest: (lon, lat, options) => {
      const minimumKv = (options && options.minimumKv) || 0;
      const limit = (options && options.limit) || 1;
      const found = [];
      for (const point of located) {
        const voltages = point.voltages_kv || [];
        if (!voltages.length || Math.max(...voltages) < minimumKv) continue;
        found.push({
          point,
          km: distanceKm(lon, lat, point.location.lon, point.location.lat)
        });
      }
      found.sort((a, b) => a.km - b.km);
      return limit === 1 ? (found[0] || null) : found.slice(0, limit);
    }
  };
}

export const schema = 'gridatlas.module.substation-lookup.v1';
