/**
 * Module: corridor-estimate
 *
 * Extracted verbatim from
 * gridatlas/atlas/modules/202609030205-corridor-estimate.js.
 *
 * A straight line is not a route: an empirically calibrated multiplier
 * (CABLE_FACTOR = 1.245) turning a great-circle distance into an
 * indicative highway-corridor screening estimate for CABLE circuits only,
 * calibrated against 95 published GB transmission cable circuits spanning
 * 59 distinct site pairs (median absolute error 8.45%, 73% within 15%).
 * Refuses to estimate below 1 km (MINIMUM_KM), where centroid resolution
 * dominates the geometry. Deliberately has no forOverhead(): OHL_FACTOR
 * (1.13) is published only so a reader can see why the cable factor is
 * the wrong model for an overhead-line question.
 *
 * Depends on: nothing. Pure scalar arithmetic on a caller-supplied
 * straight-line km (the caller is expected to have produced that km via
 * geodesy.mjs distanceKm).
 *
 * CHANGED: source is an IIFE registering itself on
 * `window.__GRIDATLAS_MODULES__.corridorEstimate`. That wiring is
 * removed; `forCable()` is otherwise unchanged.
 */

export const CABLE_FACTOR = 1.245;
export const OHL_FACTOR = 1.13;
export const MINIMUM_KM = 1;

export const BASIS = Object.freeze({
  factor: CABLE_FACTOR,
  median_absolute_error_pct: 8.45,
  within_15_pct: 73,
  circuits: 95,
  distinct_site_pairs: 59,
  source: 'published built lengths of GB transmission cable circuits',
  sample_note: 'parallel circuits between the same two sites duplicate the '
    + 'geometry, so the sample is 59 distinct site pairs and not 95 circuits',
  minimum_separation_km: MINIMUM_KM,
  below_minimum: 'under about a kilometre the site-centroid resolution '
    + 'dominates: median published length 0.59 km against a median error of '
    + '52.5%, so a straight line between centroids is not measuring route '
    + 'factor and no estimate is offered'
});

export const CAVEAT = 'Indicative highway-corridor screening only. Not a connection '
  + 'offer, not a constructability assessment and not a consenting design.';

export const NOT_FOR_OVERHEAD = 'Calibrated on cable circuits, which follow the '
  + 'highway network. Overhead line crosses open country and measures 1.13; '
  + 'this factor is not applied to an overhead-line question.';

/**
 * The corridor estimate for a CABLE route of `km` straight-line distance.
 * @returns null when there is nothing honest to say - no distance, or a
 *   separation short enough that the straight line is not measuring
 *   route factor. Null is the answer, not zero.
 */
export function forCable(km) {
  const straight = Number(km);
  if (!Number.isFinite(straight) || straight <= 0) return null;
  if (straight < MINIMUM_KM) {
    return { km: null, factor: CABLE_FACTOR, straight_km: straight,
      withheld: BASIS.below_minimum };
  }
  return {
    km: straight * CABLE_FACTOR,
    factor: CABLE_FACTOR,
    straight_km: straight,
    withheld: null
  };
}

/* Deliberately no forOverhead(). A module that offered one would be used,
   and OHL_FACTOR above is published here so a reader can see WHY the
   cable factor is not the answer to that question - not so that this
   module can start answering it. */

export const not_an_assessment = 'An estimated corridor length says nothing about '
  + 'whether a connection is available, consentable or affordable.';

export const schema = 'gridatlas.module.corridor-estimate.v1';
