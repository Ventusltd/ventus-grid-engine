/* geo-shapes — walking a circle of points around a centre on the sphere.
 *
 * The fourth duplication, and the cleanest to collapse. From
 * globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js at HEAD
 * 7d00781b6993b9038a1a8bedf2c88a4eb0109ad4:
 *
 *   lines 122-132  _zoneDrawCirclePoints(lon, lat, radiusKm, n)   n fixed at 24
 *   lines 727-740  createGeoJSONCircle(lon, lat, radiusKm)        n chosen by radius
 *
 * Both contain the same destination-point-on-a-sphere formula. Checked, not
 * assumed: called with identical arguments they agree to 0 absolute difference
 * over 64 points. The difference between them was never the maths — it was how
 * many points each wanted and whether the result got wrapped as GeoJSON.
 *
 * So the formula lives once, here, and the point count becomes an argument.
 */

import { EARTH_RADIUS_KM } from './geo-core.js';

/**
 * n points evenly spaced around a geodesic circle, as [lon, lat] degree pairs.
 * The ring is NOT closed — the first point is not repeated at the end.
 */
export function destinationCirclePoints(lon, lat, radiusKm, n, earthRadiusKm = EARTH_RADIUS_KM) {
    const R = earthRadiusKm, DEG = Math.PI / 180;
    const ad = radiusKm / R;
    const lat1 = lat * DEG;
    return Array.from({ length: n }, (_, i) => {
        const b = (i / n) * 2 * Math.PI;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ad) + Math.cos(lat1) * Math.sin(ad) * Math.cos(b));
        const lon2 = lon * DEG + Math.atan2(Math.sin(b) * Math.sin(ad) * Math.cos(lat1), Math.cos(ad) - Math.sin(lat1) * Math.sin(lat2));
        return [lon2 / DEG, lat2 / DEG];
    });
}

/**
 * The vertex count V8 chose for a rendered radius circle, preserved exactly so
 * a rendered ring stays comparable with V8. From createGeoJSONCircle's own
 * branch at ventus-corev8engine.js:727-740.
 */
export function circleVertexCount(radiusKm) {
    return radiusKm > 5000 ? 128 : radiusKm > 500 ? 96 : 64;
}

/* ZONE_DRAW_VERTICES, as V8 fixed it. */
export const ZONE_DRAW_VERTICES = 24;
