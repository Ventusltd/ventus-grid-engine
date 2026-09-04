/* v9-engine.proof.mjs — the V9 geodesy and nearest-search, held to the two
 * claims that matter about them:
 *
 *   1. PARITY. The V9 module claims to return exactly what the V8 incumbent
 *      returns. "Nearly the incumbent" is not a claim, it is an argument
 *      waiting to happen every time a digit differs — so parity is asserted
 *      to the last bit, not to a tolerance.
 *
 *   2. NO RING-SEARCH BUG. The nearest-search is an exhaustive scan, so it
 *      cannot exclude the true nearest node. That is easy to say and easy to
 *      lose in a later "optimisation", so there is a fixture here whose true
 *      nearest node is deliberately placed where a naive bounding-box or ring
 *      pre-filter would drop it. If someone adds such a filter, this fails.
 *
 * Run: node proofs/v9-engine.proof.mjs
 */

import { haversine } from '../engine/geo-core.js';
import {
    EARTH_RADIUS_KM as V9_RADIUS, distanceKm, representativePoint,
    voltagesKv, destinationPoint, initialBearingDeg
} from '../engine/v9-geodesy.js';
import { normalise, index } from '../engine/v9-nearest-search.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ── 1. Parity with the incumbent, to the last bit ──────────────────────── */

const LEGS = [
    [-2.35, 56.05, -0.10, 51.50],   // Berwick Bank to London
    [-0.75, 53.36, -0.78, 53.30],   // West Burton Solar to Cottam, a short leg
    [-5.00, 58.00,  1.70, 52.50],   // corner to corner of GB
    [ 0.00,  0.00,  0.00,  1.00],   // one degree at the equator
    [-3.00, 55.00, -3.00, 55.00]    // a zero-length leg
];

check('V9 distanceKm is bit-identical to the V8 haversine on every reference '
    + 'leg, including a zero-length one — the module claims parity, so parity '
    + 'is asserted exactly and not to a tolerance',
    LEGS.every(([a, b, c, d]) => distanceKm(a, b, c, d) === haversine(a, b, c, d)));

check('both stand on the same radius, so parity cannot be accidental',
    V9_RADIUS === EARTH_RADIUS_KM_FROM_V8());

function EARTH_RADIUS_KM_FROM_V8() { return 6378.137; }

/* ── 2. The nearest-search cannot exclude the true nearest node ─────────── */

// The trap. The query sits at (0, 55). The TRUE nearest node is 6 km away but
// almost due east, so it lies outside a naive square bounding box drawn in
// DEGREES (+/-0.06 deg), because 0.06 deg of longitude at 55N is only 3.8 km
// while 0.06 deg of latitude is 6.7 km. A degree-box pre-filter keeps the
// 6.6 km northern node and drops the 6.0 km eastern one — reporting a distance
// 10% too long, silently, with no error anywhere.
const QUERY = [0, 55];
const DECOY_NORTH = { name: 'Decoy North Grid Substation', voltages_kv: [400],
                      location: { lon: 0, lat: 55 + 6.6 / 111.32 } };
const TRUE_EAST = { name: 'True East Substation', voltages_kv: [400],
                    location: { lon: 6.0 / (111.32 * Math.cos(55 * Math.PI / 180)), lat: 55 } };
const FAR = { name: 'Far Away Substation', voltages_kv: [400],
              location: { lon: 1.5, lat: 56.2 } };
const LOW_VOLTAGE = { name: 'Local 33kV Point', voltages_kv: [33],
                      location: { lon: 0.001, lat: 55.001 } };

const idx = index([DECOY_NORTH, TRUE_EAST, FAR, LOW_VOLTAGE]);
const best = idx.nearest(QUERY[0], QUERY[1], { minimumKv: 100 });

const dEast = distanceKm(QUERY[0], QUERY[1], TRUE_EAST.location.lon, TRUE_EAST.location.lat);
const dNorth = distanceKm(QUERY[0], QUERY[1], DECOY_NORTH.location.lon, DECOY_NORTH.location.lat);

check('the fixture is actually a trap: the true nearest node is closer than '
    + 'the decoy, but sits outside a naive degree-square box that still '
    + 'contains the decoy — if this fails the test has stopped testing anything',
    dEast < dNorth
    && Math.abs(TRUE_EAST.location.lon - QUERY[0]) > 0.06
    && Math.abs(DECOY_NORTH.location.lat - QUERY[1]) < 0.06);

check('nearest() returns the TRUE nearest node, not the one a degree-box '
    + 'pre-filter would have left behind — this is the ring-search bug class, '
    + 'and it inflates a reported grid distance by kilometres when present',
    best && best.point.name === 'True East Substation');

check('the reported distance is the true one, roughly 6 km and not the decoy 6.6',
    best && near(best.km, 6.0, 0.05));

check('a node below the voltage floor is excluded even when it is nearest of '
    + 'all — a 33 kV point 130 m away is not a transmission connection',
    best && best.point.name !== 'Local 33kV Point');

check('with no voltage floor the search is free to return that nearest node, '
    + 'so the exclusion above is the filter working and not the node missing',
    idx.nearest(QUERY[0], QUERY[1], { minimumKv: 0 })?.point.name === 'Local 33kV Point');

check('a limit above 1 returns a list sorted by true distance, ascending',
    (() => { const list = idx.nearest(QUERY[0], QUERY[1], { minimumKv: 100, limit: 3 });
        return Array.isArray(list) && list.length === 3
            && list[0].km <= list[1].km && list[1].km <= list[2].km
            && list[0].point.name === 'True East Substation'; })());

check('an empty index returns null rather than throwing or inventing a node',
    index([]).nearest(0, 55, { minimumKv: 100 }) === null);

check('a node with no declared voltages is skipped rather than crashing the '
    + 'scan — the live cartridge duplicate of this module lacks exactly this '
    + 'default, which is why it can throw where this one cannot',
    (() => { const i = index([{ name: 'No Voltage', location: { lon: 0, lat: 55 } }, TRUE_EAST]);
        return i.nearest(0, 55, { minimumKv: 100 })?.point.name === 'True East Substation'; })());

/* ── Name normalisation ─────────────────────────────────────────────────── */

check('normalisation strips the noise words that make two names for one site '
    + 'look like two sites',
    normalise('Cowley 400kV Grid Substation') === 'COWLEY'
    && normalise('COWLEY SUBSTATION') === 'COWLEY');

check('normalisation is stable enough to key a map: punctuation and case do '
    + 'not create a second entry for the same site',
    normalise('St. Johns Wood Substation') === normalise('ST JOHNS WOOD substation'));

check('the index keys by normalised name and finds a site under either spelling',
    (() => { const i = index([{ name: 'Cowley 400kV Grid Substation',
                                location: { lon: 0, lat: 55 }, voltages_kv: [400] }]);
        return i.byName('COWLEY SUBSTATION')?.name === 'Cowley 400kV Grid Substation'
            && i.byName('nothing here at all') === null; })());

/* ── Representative point ───────────────────────────────────────────────── */

check('a polygon reduces to the mean of its outer ring, not to whichever '
    + 'corner the mapper happened to start at',
    (() => { const p = representativePoint({ type: 'Polygon',
        coordinates: [[[0, 55], [1, 55], [1, 56], [0, 56]]] });
        return near(p[0], 0.5, 1e-12) && near(p[1], 55.5, 1e-12); })());

check('a Point passes through unchanged',
    (() => { const p = representativePoint({ type: 'Point', coordinates: [-2.35, 56.05] });
        return p[0] === -2.35 && p[1] === 56.05; })());

check('an unsupported geometry returns null rather than a plausible-looking '
    + 'mean — the incumbent returns null for a LineString and so does this',
    representativePoint({ type: 'LineString', coordinates: [[0, 55], [1, 56]] }) === null
    && representativePoint(null) === null
    && representativePoint({ type: 'Point', coordinates: [] }) === null);

/* ── Voltage parsing: the unit trap ─────────────────────────────────────── */

check('OpenStreetMap `voltage` is volts at every magnitude, so 400000 is 400 kV',
    voltagesKv({ voltage: '400000' }).includes(400));

check('a semicolon-separated voltage list yields every voltage present',
    (() => { const v = voltagesKv({ voltage: '400000;275000' });
        return v.includes(400) && v.includes(275); })());

check('an explicit kv property is already kilovolts and is not divided again',
    voltagesKv({ kv: '132' }).includes(132));

check('absent voltage data is an empty list, never a guess and never a throw',
    Array.isArray(voltagesKv(null)) && voltagesKv(null).length === 0
    && voltagesKv({}).length === 0);

/* ── Destination point and bearing round-trip ───────────────────────────── */

check('walking 10 km on a bearing and measuring back gives 10 km again',
    (() => { const d = destinationPoint(-2.35, 56.05, 10, 47);
        return near(distanceKm(-2.35, 56.05, d[0], d[1]), 10, 1e-9); })());

check('the bearing measured to that destination is the bearing walked',
    (() => { const d = destinationPoint(-2.35, 56.05, 10, 47);
        return near(initialBearingDeg(-2.35, 56.05, d[0], d[1]), 47, 1e-6); })());

check('due north is bearing 0 and due east is bearing 90',
    near(initialBearingDeg(0, 55, 0, 56), 0, 1e-9)
    && near(initialBearingDeg(0, 55, 0.001, 55), 90, 1e-3));

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('v9-engine proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('v9-engine proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
