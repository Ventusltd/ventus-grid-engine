/**
 * Module: rating-envelope
 *
 * PROMOTED from sources/v9-extracts/rating-envelope.mjs (itself extracted
 * verbatim from gridatlas/atlas/modules/202609012250-rating-envelope.js).
 *
 * What the operator publishes a circuit can carry, season by season — and
 * a structural refusal to add those numbers up. Per-circuit thermal
 * ratings, never summed across a site, never averaged into a mean that no
 * circuit is rated at; only the published lowest/highest across the
 * circuits that qualify.
 *
 * Depends on: a `network-topology` index exposing `.graph()` with schema
 * 'gridatlas.module.network-topology.graph.v1', and `.site(key)`.
 *
 * CHANGED FROM THE SOURCE: the IIFE and `window.__GRIDATLAS_MODULES__`
 * registration are removed. `at()` and its helpers are otherwise
 * unchanged — verified verbatim against
 * gridatlas/atlas/modules/202609012250-rating-envelope.js at HEAD
 * 64268fd06a0da54ddffbcdaaaee382e314e829f7 (see sources/provenance.json).
 */

const SCHEMA = 'gridatlas.module.rating-envelope.v1';
const REQUIRES = 'gridatlas.module.network-topology.graph.v1';

export const SEASONS = Object.freeze(['winter', 'spring', 'summer', 'autumn']);
const FIELD = Object.freeze({
  winter: 'winter_mva', spring: 'spring_mva',
  summer: 'summer_mva', autumn: 'autumn_mva'
});

export const NEVER_SUMMED =
  'These are per-circuit thermal ratings under stated seasonal '
  + 'conditions. They are not additive and they are not simultaneous: '
  + 'the sum of the circuits at a site is not a quantity that exists in '
  + 'the network, and this module contains no code that produces one.';

export const NOT_A_CAPACITY =
  'A rating is what a circuit is rated to carry, not what is free on '
  + 'it. Existing flows, committed connections, queue position, outage '
  + 'conditions and commercial terms decide what a project could use, '
  + 'and no published appendix contains any of them.';

/* A rating that is obviously not a rating. 9999 on a one-kilometre span
   with zero impedance is a placeholder, not a thermal limit; so is
   69,275 on a hundred-metre cable. The test is deliberately narrow: a
   value at or above this threshold is flagged and excluded from the
   range, nothing else is second-guessed. */
export const IMPLAUSIBLE_MVA = 9999;

function seasonsOf(row) {
  const published = {};
  const absent = [];
  for (const season of SEASONS) {
    const value = row[FIELD[season]];
    if (Number.isFinite(value)) published[season] = value;
    else absent.push(season);
  }
  return { published, absent };
}

function flagsFor(published) {
  const flags = [];
  for (const [season, value] of Object.entries(published)) {
    if (value >= IMPLAUSIBLE_MVA) {
      flags.push({
        season,
        value,
        reason: 'at or above ' + IMPLAUSIBLE_MVA + ' MVA, which has the '
          + 'shape of a placeholder rather than a thermal rating; it is '
          + 'reported and excluded from the range below'
      });
    }
  }
  return flags;
}

/**
 * Every circuit landing at a site, at one voltage, with its own seasonal
 * ratings. No total anywhere.
 *
 * @param index      a network-topology index exposing graph()
 * @param key        site code or exact site name
 * @param options    { voltageKv }
 */
export function at(index, key, options) {
  if (!index || typeof index.graph !== 'function') return null;
  const graph = index.graph();
  if (!graph || graph.schema !== REQUIRES) return null;

  const site = index.site(key);
  if (!site) return null;

  const opts = options || {};
  const voltageKv = Number.isFinite(opts.voltageKv) ? opts.voltageKv : null;

  const nodes = graph.nodesOfSite(site.code)
    .filter((name) => voltageKv == null || graph.nodeVoltageKv(name) === voltageKv);

  const circuits = [];
  const seen = new Set();
  for (const nodeName of nodes) {
    for (const entry of graph.edgesAt(nodeName)) {
      if (entry.kind !== 'circuit') continue;
      const far = entry.row[entry.far];
      const id = [nodeName, far].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      const { published, absent } = seasonsOf(entry.row);
      if (!Object.keys(published).length) continue;
      circuits.push({
        from_node: nodeName,
        to_node: far,
        to_site_code: graph.nodeSiteCode(far) || null,
        voltage_kv: graph.nodeVoltageKv(nodeName),
        circuit_type: typeof entry.row.circuit_type === 'string' ? entry.row.circuit_type : null,
        ohl_km: Number.isFinite(entry.row.ohl_km) ? entry.row.ohl_km : null,
        cable_km: Number.isFinite(entry.row.cable_km) ? entry.row.cable_km : null,
        ratings_mva: published,
        seasons_not_published: absent,
        flags: flagsFor(published),
        parameters_pct_100mva: graph.parametersOf(entry.row)
      });
    }
  }

  circuits.sort((a, b) => String(a.to_node).localeCompare(String(b.to_node)));

  /* The per-season RANGE across circuits — a lowest and a highest rating,
     which are two real published values — never a sum, and never a
     mean, which would be a number no circuit is rated at. */
  const by_season = {};
  for (const season of SEASONS) {
    const values = circuits
      .filter((c) => Number.isFinite(c.ratings_mva[season])
        && c.ratings_mva[season] < IMPLAUSIBLE_MVA)
      .map((c) => c.ratings_mva[season]);
    const excluded = circuits
      .filter((c) => Number.isFinite(c.ratings_mva[season])
        && c.ratings_mva[season] >= IMPLAUSIBLE_MVA).length;
    by_season[season] = values.length
      ? {
        lowest_circuit_mva: Math.min.apply(null, values),
        highest_circuit_mva: Math.max.apply(null, values),
        circuits: values.length,
        excluded_as_implausible: excluded
      }
      : { circuits: 0, excluded_as_implausible: excluded, published: false };
  }

  const flagged = circuits.filter((c) => c.flags.length);
  const missingSeasons = circuits.filter((c) => c.seasons_not_published.length);

  return {
    schema: SCHEMA,
    site: { code: site.code, name: site.name },
    requested_voltage_kv: voltageKv,
    scope: voltageKv == null
      ? 'every voltage at this site; a range across two busbar voltages '
        + 'is a number about neither of them'
      : voltageKv + ' kV nodes at this site only',
    circuits,
    by_season,
    counts: {
      circuits: circuits.length,
      with_a_flagged_value: flagged.length,
      with_a_season_not_published: missingSeasons.length
    },
    never_summed: NEVER_SUMMED,
    not_a_capacity: NOT_A_CAPACITY
  };
}

export const schema = SCHEMA;
export const requires = REQUIRES;
