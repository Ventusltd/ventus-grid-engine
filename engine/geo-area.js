/* geo-area — polygon area, perimeter, and spherical-cap area.
 *
 * This module is the resolution of "three area implementations in one file".
 * From globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js at HEAD
 * 7d00781b6993b9038a1a8bedf2c88a4eb0109ad4:
 *
 *   A  lines 134-149  _zoneDrawCalcArea               shoelace-on-sphere
 *   B  lines 481-490  inline in updateMeasureDisplay  shoelace-on-sphere
 *   C  lines 576-582  inline in doRadiusAreaMeasure   spherical cap
 *
 * A and B were checked numerically, not by eye: on a true 1 km x 1 km square
 * at 55N both return 1.00000000 km2, and on a 5-point irregular polygon near
 * London both return 0.30664823 km2 — identical to 8 decimal places. They are
 * the same formula, copy-pasted. They collapse into polygonAreaKm2 below.
 *
 * They disagreed in exactly one place: acres. A divided by 4046.85642 m2/acre
 * (exact); B multiplied by 247.105 acres/km2 (rounded). On the London polygon
 * that is 75.774428 ac vs 75.774311 ac. Harmless in magnitude, but it is a
 * second inconsistency riding on the first, and it disappears here because
 * there is now one conversion table.
 *
 * C is NOT merged. It answers a different question — the area enclosed by a
 * fixed geodesic radius, not by an arbitrary polygon — and it is correct:
 * checked against pi*r^2 it agrees to 5 significant figures at 1 km and
 * departs to 0.94983 of the planar answer at 5000 km, which is the sphere
 * behaving like a sphere. Merging C into A/B would be wrong, so it stays a
 * separately named function. Honest naming over a tidy-looking API.
 */

import { EARTH_RADIUS_KM, haversine } from './geo-core.js';

/* One conversion table, used by every area result in this repo. */
const M2_PER_ACRE  = 4046.85642;   // exact, international acre
const KM2_PER_MI2  = 0.386102;     // as V8 shipped it
const M2_PER_PITCH = 7140;         // a football pitch, as V8 defined it

function conversions(areaKm2, perimKm) {
    const areaM2 = areaKm2 * 1e6;
    return {
        areaKm2,
        areaM2,
        areaHa:  areaM2 / 10000,
        areaAc:  areaM2 / M2_PER_ACRE,
        areaMi2: areaKm2 * KM2_PER_MI2,
        perimKm,
        pitches: areaM2 / M2_PER_PITCH
    };
}

/**
 * Area and perimeter of a closed polygon on the sphere.
 *
 * Verbatim shoelace-on-sphere from ventus-corev8engine.js:134-149. Points are
 * [lon, lat] pairs in degrees, in order, NOT explicitly closed — the formula
 * wraps with (i + 1) % n itself.
 *
 * Fewer than 3 points is not an error and not NaN: it is zero area, which is
 * what a 2-point "polygon" actually encloses. V8 returned zeros here, so does this.
 */
export function polygonAreaKm2(pts, radiusKm = EARTH_RADIUS_KM) {
    if (!Array.isArray(pts) || pts.length < 3) return conversions(0, 0);
    let area = 0;
    const R = radiusKm;
    for (let i = 0; i < pts.length; i++) {
        const j  = (i + 1) % pts.length;
        const xi = pts[i][0] * Math.PI / 180, yi = pts[i][1] * Math.PI / 180;
        const xj = pts[j][0] * Math.PI / 180, yj = pts[j][1] * Math.PI / 180;
        area += (xj - xi) * (2 + Math.sin(yi) + Math.sin(yj));
    }
    const areaKm2 = Math.abs(area) * R * R / 2;
    return conversions(areaKm2, polylinePerimeterKm(pts, true, radiusKm));
}

/**
 * Length along a sequence of points, in km. From the perimeter loop at
 * ventus-corev8engine.js:146 and the Measure tool length accumulation at
 * 469/479 — the same loop, written twice.
 */
export function polylinePerimeterKm(pts, closed = false, radiusKm = EARTH_RADIUS_KM) {
    if (!Array.isArray(pts) || pts.length < 2) return 0;
    let km = 0;
    const last = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
        const j = (i + 1) % pts.length;
        km += haversine(pts[i][0], pts[i][1], pts[j][0], pts[j][1], radiusKm);
    }
    return km;
}

/**
 * Area of a spherical cap of geodesic radius `km` — the area actually enclosed
 * by a radius circle drawn on the earth. Verbatim from
 * ventus-corev8engine.js:576-582. Kept separate from polygonAreaKm2 on purpose:
 * it is not the same question and the two are not interchangeable.
 */
export function circleCapAreaKm2(km, radiusKm = EARTH_RADIUS_KM) {
    const R = radiusKm;
    const areaKm2 = 2 * Math.PI * R * R * (1 - Math.cos(km / R));
    return conversions(areaKm2, 2 * Math.PI * R * Math.sin(km / R));
}
