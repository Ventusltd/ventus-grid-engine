/* geodesy.proof.mjs — the maths this repo isolated must keep answering the
 * same numbers, and must keep disagreeing where it is right to disagree.
 *
 * Every check below names a property of the real system in plain English.
 * A check is not "test 7 passed"; it is a sentence worth reading in a failure
 * report at 2am.
 *
 * Run: node proofs/geodesy.proof.mjs
 */

import {
    EARTH_RADIUS_KM, R_ATLAS, R_UK, R_MEAN, MAX_RADIUS_KM,
    haversine, haversineUK
} from '../engine/geo-core.js';
import { polygonAreaKm2, polylinePerimeterKm, circleCapAreaKm2 } from '../engine/geo-area.js';
import { destinationCirclePoints, circleVertexCount, ZONE_DRAW_VERTICES } from '../engine/geo-shapes.js';
import { circleFeatureCollection } from '../engine/geo-geojson.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ── The earth model ─────────────────────────────────────────────────────── */

check('the default radius is the estate default R_ATLAS = 6378.137, unchanged, '
    + 'so an extracted function reproduces V8 numbers exactly and a regression '
    + 'looks like a regression',
    EARTH_RADIUS_KM === 6378.137 && R_ATLAS === EARTH_RADIUS_KM);

check('R_UK is the Gaussian mean radius of curvature at 54N, the accurate '
    + 'option for new work, and it is LARGER than the default — both deployed '
    + 'constants are too small at GB latitudes, which is the fact that makes '
    + '"swap to the mean radius" the wrong instinct',
    R_UK === 6384.7272 && R_UK > R_ATLAS && R_ATLAS > R_MEAN);

check('R_MEAN is exported only to reproduce existing Turf-based results, and '
    + 'is the least accurate of the three here: switching the default to it '
    + 'would roughly double the error rather than remove it',
    R_MEAN === 6371.0088
    && Math.abs(R_MEAN - R_UK) > Math.abs(R_ATLAS - R_UK));

check('the default is within about one part in a thousand of the UK-accurate '
    + 'radius — smaller than the uncertainty in a REPD site centroid, so the '
    + 'radius is not the dominant error in any grid distance this repo reports',
    Math.abs(R_ATLAS - R_UK) / R_UK < 1.5e-3);

check('MAX_RADIUS_KM is the antipodal distance on the model actually in use',
    near(MAX_RADIUS_KM, Math.PI * EARTH_RADIUS_KM, 1e-9));

/* ── haversine: argument order is (lon, lat), and getting it backwards is
 *    silent, so it is asserted rather than trusted ─────────────────────────── */

// One degree of latitude is about 111.3 km anywhere. One degree of LONGITUDE
// at 60N is about half that. If the argument order were (lat, lon) these two
// would come out swapped, and nothing else in the system would complain.
const oneDegLat = haversine(0, 0, 0, 1);
const oneDegLonAt60 = haversine(0, 60, 1, 60);
check('haversine takes (lon, lat) pairs in GeoJSON order, not (lat, lon): one '
    + 'degree of latitude is about 111.3 km and one degree of longitude at 60N '
    + 'is about half that, which only holds if the order is as documented',
    near(oneDegLat, 111.32, 0.05) && near(oneDegLonAt60, 55.66, 0.1));

check('a zero-length leg is 0 km and not NaN',
    haversine(-2.35, 56.05, -2.35, 56.05) === 0);

check('distance is symmetric',
    near(haversine(-2.35, 56.05, -0.1, 51.5), haversine(-0.1, 51.5, -2.35, 56.05), 1e-12));

check('haversineUK returns the same leg LONGER than the default, by exactly the '
    + 'radius ratio — the UK-accurate sphere is bigger, so the accurate answer '
    + 'is bigger, which is the opposite of what the naming instinct suggests',
    near(haversineUK(-2.35, 56.05, -0.1, 51.5) / haversine(-2.35, 56.05, -0.1, 51.5),
         R_UK / R_ATLAS, 1e-12)
    && haversineUK(-2.35, 56.05, -0.1, 51.5) > haversine(-2.35, 56.05, -0.1, 51.5));

/* ── Polygon area: the collapsed A/B implementations ─────────────────────── */

// The reference polygon, measured independently against BOTH original V8
// implementations before extraction. If this number moves, the extraction
// changed the maths.
const LONDON = [[-0.1000, 51.5000], [-0.0950, 51.5020], [-0.0900, 51.4995],
                [-0.0930, 51.4960], [-0.0990, 51.4965]];
const london = polygonAreaKm2(LONDON);

check('the collapsed polygon area reproduces both original V8 implementations to '
    + '8 decimal places on the reference London polygon (0.30664823 km2) — this '
    + 'is the check that proves the extraction did not rewrite the maths',
    near(london.areaKm2, 0.30664823, 5e-9));

// A 1 km x 1 km square at 55N, constructed on the SAME spherical model the
// formula integrates over. Building it from the usual ellipsoidal constants
// (110.574 km/deg lat, 111.320 km/deg lon) instead leaves a 0.44% residual
// that is the ellipsoid-vs-sphere difference, not an error in this code — a
// distinction worth keeping, because a test that blames the wrong component
// is worse than no test.
const D = Math.PI / 180, lat0 = 55;
const kmPerDegLat = EARTH_RADIUS_KM * D;
const dLat = 1 / kmPerDegLat;
const dLon = 1 / (EARTH_RADIUS_KM * D * Math.cos((lat0 + dLat / 2) * D));
const SQUARE = [[0, lat0], [dLon, lat0], [dLon, lat0 + dLat], [0, lat0 + dLat]];
// Measured residual is 1.02e-9 km2, about a thousandth of a square metre per
// square kilometre. That is the second-order term in the small-angle
// construction of the square, not slack in the formula, so the tolerance is
// set just above it rather than rounded up to something comfortable.
check('a 1 km by 1 km square at 55N, built on the same sphere the formula '
    + 'integrates over, measures 1 km2 to within five parts in a billion',
    near(polygonAreaKm2(SQUARE).areaKm2, 1.0, 5e-9));

check('area is orientation-independent: reversing the winding does not flip the sign',
    near(polygonAreaKm2([...LONDON].reverse()).areaKm2, london.areaKm2, 1e-12));

check('fewer than three points encloses zero area and returns zeros, not NaN',
    polygonAreaKm2([[0, 0], [1, 1]]).areaKm2 === 0
    && polygonAreaKm2([]).areaKm2 === 0
    && !Number.isNaN(polygonAreaKm2([[0, 0]]).areaHa));

/* ── The acre drift that the collapse was supposed to remove ────────────── */

check('acres come from the exact 4046.85642 m2 per acre constant, not the rounded '
    + '247.105 acres per km2 that the Measure tool used — on the reference polygon '
    + 'that is 75.774428 ac, where the old rounded path gave 75.774311',
    near(london.areaAc, 75.774428, 5e-6)
    && !near(london.areaAc, london.areaKm2 * 247.105, 1e-6));

check('every area result carries the same conversion family, so no caller has to '
    + 'convert for itself and drift again',
    near(london.areaHa, london.areaM2 / 10000, 1e-12)
    && near(london.areaM2, london.areaKm2 * 1e6, 1e-6)
    && near(london.pitches, london.areaM2 / 7140, 1e-12));

/* ── The cap area that was deliberately NOT merged ───────────────────────── */

check('the spherical cap reduces to pi r squared at 1 km, where the earth is flat enough',
    near(circleCapAreaKm2(1).areaKm2, Math.PI, 1e-5));

check('the spherical cap departs from pi r squared at 5000 km, to 0.9498 of the '
    + 'planar answer — the sphere behaving like a sphere, and exactly why this '
    + 'function was not merged into the polygon one',
    near(circleCapAreaKm2(5000).areaKm2 / (Math.PI * 5000 * 5000), 0.94983, 1e-4));

check('cap area and polygon area remain different functions with different names, '
    + 'neither silently substitutable for the other',
    circleCapAreaKm2 !== polygonAreaKm2);

/* ── Perimeter ───────────────────────────────────────────────────────────── */

check('a closed perimeter includes the closing leg and an open one does not',
    polylinePerimeterKm(LONDON, true) > polylinePerimeterKm(LONDON, false));

check('the closing leg is exactly the last-to-first haversine',
    near(polylinePerimeterKm(LONDON, true) - polylinePerimeterKm(LONDON, false),
         haversine(LONDON[4][0], LONDON[4][1], LONDON[0][0], LONDON[0][1]), 1e-12));

check('a single point has no length', polylinePerimeterKm([[0, 0]], true) === 0);

/* ── Circle points: the fourth duplication, now one function ─────────────── */

const ring24 = destinationCirclePoints(-2.35, 56.05, 10, 24);
check('the circle generator returns exactly the requested number of points, '
    + 'unclosed, so one function serves both the 24-vertex zone-draw path and the '
    + '64/96/128-vertex render path that used to keep their own copies',
    ring24.length === 24
    && !(ring24[0][0] === ring24[23][0] && ring24[0][1] === ring24[23][1]));

check('every generated point is the requested geodesic radius from the centre',
    ring24.every(p => near(haversine(-2.35, 56.05, p[0], p[1]), 10, 1e-6)));

check('the first point is due north of the centre, as bearing zero requires',
    near(ring24[0][0], -2.35, 1e-9) && ring24[0][1] > 56.05);

check('V8 vertex counts are preserved exactly, so a rendered ring stays comparable '
    + 'with what V8 drew',
    circleVertexCount(10) === 64 && circleVertexCount(600) === 96
    && circleVertexCount(6000) === 128 && ZONE_DRAW_VERTICES === 24);

/* ── GeoJSON shaping stays out of the maths ─────────────────────────────── */

const fc = circleFeatureCollection(-2.35, 56.05, 10);
const ring = fc.features[0].geometry.coordinates[0];
check('the GeoJSON ring is explicitly closed, as the spec requires, while the raw '
    + 'generator leaves it open',
    ring.length === 65 && ring[0][0] === ring[64][0] && ring[0][1] === ring[64][1]);

check('the FeatureCollection records the radius and centre it was built from, so a '
    + 'rendered circle can be traced back to the query that made it',
    fc.features[0].properties.radius_km === 10
    && fc.features[0].properties.centre[0] === -2.35);

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('geodesy proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('geodesy proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
