/* corridor-estimate.proof.mjs — a straight line is not a route, and this
 * module's whole job is to say so honestly: a calibrated multiplier where
 * one is defensible, and a refusal everywhere it is not.
 *
 * Run: node proofs/corridor-estimate.proof.mjs
 */

import { CABLE_FACTOR, OHL_FACTOR, MINIMUM_KM, BASIS, forCable, schema }
    from '../engine/corridor-estimate.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ── The constant itself ─────────────────────────────────────────────────── */

check('the cable factor is the published calibration value, 1.245, not a '
    + 'round number chosen for convenience',
    CABLE_FACTOR === 1.245);

check('the overhead factor is published for context but is a different '
    + 'number from the cable factor, evidence the two are not interchangeable',
    OHL_FACTOR === 1.13 && OHL_FACTOR !== CABLE_FACTOR);

check('the calibration basis records what it was measured against: 95 '
    + 'circuits collapsing to 59 distinct site pairs, not 95 independent '
    + 'measurements',
    BASIS.circuits === 95 && BASIS.distinct_site_pairs === 59
    && BASIS.distinct_site_pairs < BASIS.circuits);

/* ── forCable(): the arithmetic ──────────────────────────────────────────── */

check('a 10 km straight line becomes a 12.45 km corridor estimate, exactly '
    + 'the calibrated factor applied once',
    near(forCable(10).km, 12.45, 1e-9));

check('the estimate always carries the straight-line input it was built '
    + 'from, so a caller can recover the multiplier that was applied',
    near(forCable(10).straight_km, 10, 1e-12)
    && near(forCable(10).km / forCable(10).straight_km, CABLE_FACTOR, 1e-12));

check('the estimate scales linearly — doubling the straight-line distance '
    + 'exactly doubles the corridor estimate, because the model is a fixed '
    + 'multiplier and not a curve',
    near(forCable(20).km, forCable(10).km * 2, 1e-9));

/* ── The refusal below MINIMUM_KM: null is the answer, not zero ─────────── */

check('MINIMUM_KM is 1 — the documented threshold below which centroid '
    + 'resolution dominates the geometry',
    MINIMUM_KM === 1);

check('a separation below the minimum withholds an estimate — km is null, '
    + 'not a small or zero number that looks like a real answer',
    forCable(0.5).km === null && typeof forCable(0.5).withheld === 'string'
    && forCable(0.5).withheld.length > 0);

check('the withheld case still reports the straight-line distance it was '
    + 'given and the factor that would have applied, so a caller can see '
    + 'why nothing was returned',
    near(forCable(0.5).straight_km, 0.5, 1e-12) && forCable(0.5).factor === CABLE_FACTOR);

check('exactly at the minimum the estimate is produced, not withheld — '
    + 'the threshold is a closed lower bound',
    forCable(1).km !== null && near(forCable(1).km, 1.245, 1e-9));

check('just under the minimum the estimate is withheld — the boundary is '
    + 'not off by one in the other direction either',
    forCable(0.999).km === null);

/* ── Non-distances: zero, negative, non-finite ───────────────────────────── */

check('zero, negative and non-finite input all return null rather than a '
    + 'negative or NaN corridor length',
    forCable(0) === null && forCable(-5) === null
    && forCable(NaN) === null && forCable(undefined) === null
    && forCable('not a number') === null);

/* ── No forOverhead(): the module cannot be misused for the wrong question ── */

check('the module exports no forOverhead function — OHL_FACTOR is '
    + 'published for a reader to see, not for a caller to reach',
    typeof forCable === 'function'
    && Object.prototype.hasOwnProperty.call(
        await import('../engine/corridor-estimate.js'), 'forOverhead') === false);

check('the module identifies itself with a stable schema string, so a '
    + 'consumer can assert which contract it is talking to',
    schema === 'gridatlas.module.corridor-estimate.v1');

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('corridor-estimate proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('corridor-estimate proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
