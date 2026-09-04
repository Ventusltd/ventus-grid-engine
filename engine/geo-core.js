/* geo-core — the one distance primitive, and the earth model it stands on.
 *
 * Extracted verbatim from globalgrid2050/repd_grid_atlasv8/ventus-corev8engine.js
 * at globalgrid2050 HEAD 7d00781b6993b9038a1a8bedf2c88a4eb0109ad4:
 *   lines 32-33  EARTH_RADIUS_KM, MAX_RADIUS_KM
 *   line  36     DEG_TO_RAD
 *   lines 45-50  haversine
 *
 * The only edit is `export` plus an optional radius argument that defaults to
 * the V8 value, so existing behaviour is bit-identical. No formula was
 * rewritten. This cluster had no closure dependency in the original, which is
 * why it extracts cleanly.
 *
 * ── On the radius ────────────────────────────────────────────────────────────
 * The estate has already decided this, in grid-distance-maths/docs/EARTH-MODEL.md,
 * and the decision is not the obvious one. It is restated here because the
 * obvious assumption — "6378.137 is the equatorial radius, so it must be the
 * wrong choice for a mean-radius formula" — is wrong, and acting on it would
 * make every distance in the estate worse rather than better.
 *
 * At GB latitudes the best single sphere is the Gaussian mean radius of
 * curvature, about 6384.7 km at 54N. Measured against that:
 *
 *   6371.0088  IUGG mean         -2,194 ppm mean error,  206 m worst
 *   6378.137   WGS84 equatorial  -1,078 ppm mean error,  141 m worst
 *   6384.7272  UK Gaussian          -46 ppm mean error,  102 m worst
 *
 * BOTH deployed constants are too small here. 6378.137 is not the sloppy
 * choice — it is the more accurate of the two actually in use, by a factor of
 * two, and switching to the IUGG mean radius would double the error.
 *
 * So the estate's decision, followed exactly here:
 *   - R_ATLAS (6378.137) stays the default, because every deployed tool uses
 *     it and every published Ventus figure depends on it. Changing it silently
 *     would move numbers already quoted from the Atlas, the sandbox and
 *     Pipeline News.
 *   - R_UK (6384.7272) is for new work where accuracy matters more than
 *     agreement with existing output. It cuts mean error by a factor of 23.
 *   - R_MEAN (6371.0088) should NOT be used in new code. It is exported only so
 *     existing Turf-based results can be reproduced and compared.
 *
 * And the honest proportion: the gap between R_ATLAS and the truth is about one
 * part in a thousand, which is well inside the uncertainty of a REPD site
 * centroid — that can sit hundreds of metres from the actual point of
 * connection. The radius is not the dominant error. Measuring to a sampled
 * vertex instead of to the line is, and it is five times larger. Nothing in
 * this module fixes that one.
 */

/** WGS84 semi-major (equatorial) axis, km. The estate default: R_ATLAS. */
export const EARTH_RADIUS_KM = 6378.137;

/** Alias under the estate's own name, for code that reads better with it. */
export const R_ATLAS = EARTH_RADIUS_KM;

/** Gaussian mean radius of curvature at 54N, km. For new accuracy-led work. */
export const R_UK = 6384.7272;

/** IUGG mean radius, km. Reproduction of Turf-based results only. Not for new code. */
export const R_MEAN = 6371.0088;

/** Half the circumference on the default model — the antipodal distance. */
export const MAX_RADIUS_KM = Math.PI * EARTH_RADIUS_KM; // 20037.508 km

export const DEG_TO_RAD = Math.PI / 180;

/**
 * Great-circle distance between two points, in km.
 *
 * Verbatim from ventus-corev8engine.js:45-50, including its argument order,
 * which is (lon, lat) pairs — GeoJSON order, not the (lat, lon) order most
 * haversine implementations take. Getting this backwards is silent and wrong,
 * so the order is asserted by proofs/geodesy.proof.mjs rather than trusted.
 *
 * @param {number} lon1 degrees east
 * @param {number} lat1 degrees north
 * @param {number} lon2 degrees east
 * @param {number} lat2 degrees north
 * @param {number} [radiusKm] earth radius; defaults to the estate's R_ATLAS
 * @returns {number} km
 */
export function haversine(lon1, lat1, lon2, lat2, radiusKm = EARTH_RADIUS_KM) {
    const R = radiusKm, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The same distance on the UK Gaussian radius — the accurate option for new
 * work that does not have to agree with already-published Ventus figures.
 */
export function haversineUK(lon1, lat1, lon2, lat2) {
    return haversine(lon1, lat1, lon2, lat2, R_UK);
}
