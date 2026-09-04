/* geo-geojson — GeoJSON shaping, kept out of the maths modules.
 *
 * createGeoJSONCircle (ventus-corev8engine.js:727-740) did two jobs: generate
 * the ring, and wrap it as a FeatureCollection. The ring generation moved to
 * geo-shapes.js because zone-draw wants points and not GeoJSON. The wrapping
 * is here, so a caller that only wants coordinates does not depend on a
 * GeoJSON shape it never reads.
 */

import { destinationCirclePoints, circleVertexCount } from './geo-shapes.js';

/**
 * A closed circle as a GeoJSON FeatureCollection containing one Polygon.
 * The ring is explicitly closed (first point repeated last), as GeoJSON requires.
 */
export function circleFeatureCollection(lon, lat, radiusKm) {
    const ring = destinationCirclePoints(lon, lat, radiusKm, circleVertexCount(radiusKm));
    ring.push(ring[0]);
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { radius_km: radiusKm, centre: [lon, lat] },
            geometry: { type: 'Polygon', coordinates: [ring] }
        }]
    };
}
