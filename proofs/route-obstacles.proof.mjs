/* route-obstacles.proof.mjs — the check a scalar corridor function could not
 * make.
 *
 * The defect this module was written against, measured and named: South Antrim
 * to the Western HVDC converter is 142.21 km, almost all of it Irish Sea, and
 * corridor-estimate printed 177.05 km of "highway corridor" because it receives
 * one scalar kilometre and never sees the coordinates. Every check below that
 * matters is a check that could not exist inside a function taking a scalar.
 *
 * Run: node proofs/route-obstacles.proof.mjs
 */

import * as mod from '../engine/route-obstacles.js';
import { forCable, CABLE_FACTOR } from '../engine/corridor-estimate.js';
const { schema, OBSTACLES, NOT_COMPUTED, crossingLengthM, crossingSchedule, routeEstimate } = mod;

const failures = [];
let passed = 0;
const check = (n, c) => { c ? passed += 1 : failures.push(n); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, p) => { try { fn(); return false; } catch (e) { return p.test(e.message); } };

check('schema is declared', schema === 'ventus-grid-engine.route-obstacles.v1');

/* ── THE DEFECT. The Irish Sea route. ───────────────────────────────────── */
{
    const SOUTH_ANTRIM_TO_WESTERN_HVDC_KM = 142.21;

    /* What the scalar function does today, unchanged and still correct for what
       it is: it has no way to know. This is not a criticism of forCable, it is
       a demonstration that the check has to live somewhere else. */
    const scalar = forCable(SOUTH_ANTRIM_TO_WESTERN_HVDC_KM);
    check('the existing scalar corridor estimate still returns its calibrated 177.05 km, unchanged',
        near(scalar.km, 177.05, 0.05));

    /* What this module does once the crossing is declared. */
    const sea = routeEstimate({
        straightLineKm: SOUTH_ANTRIM_TO_WESTERN_HVDC_KM,
        crossings: [{ type: 'open_water' }],
        corridorFactor: CABLE_FACTOR
    });
    check('a route crossing open water returns NO corridor estimate — null, not a number',
        sea.value === null && sea.corridorApplicable === false);
    check('the refusal names open water as the blocker',
        sea.schedule.blockedBy.includes('Open water / sea'));
    check('the straight line is preserved unchanged, because it is a real measurement',
        sea.straightLineKm === SOUTH_ANTRIM_TO_WESTERN_HVDC_KM);
    check('the basis says plainly that a road factor would describe a route that does not exist',
        /route that does not exist/i.test(sea.basis));
    check('the basis names the structural reason: a scalar-only function never saw the coordinates',
        /never saw the coordinates/i.test(sea.basis));

    /* And the same distance over land, where the factor IS applicable. */
    const land = routeEstimate({
        straightLineKm: SOUTH_ANTRIM_TO_WESTERN_HVDC_KM, crossings: [], corridorFactor: CABLE_FACTOR
    });
    check('the same distance over land still returns the calibrated corridor estimate',
        near(land.value, 177.05, 0.05) && land.corridorApplicable === true);
    check('so the module changes the answer ONLY where the route crosses something that blocks it',
        near(land.value, scalar.km, 1e-9));
}

/* ── Crossing method: what cannot be open-cut. ──────────────────────────── */

check('a motorway is trenchless', OBSTACLES.motorway.trenchless === true);
check('a railway is trenchless', OBSTACLES.railway.trenchless === true);
check('a navigable river is trenchless', OBSTACLES.navigable_river.trenchless === true);
check('a minor road is not — open-cut with traffic management is normal',
    OBSTACLES.minor_road.trenchless === false);
check('only open water blocks a highway-corridor estimate; a motorway is crossed, not a blocker',
    OBSTACLES.open_water.blocksCorridor === true && OBSTACLES.motorway.blocksCorridor === false);
check('every obstacle carries a reason a reader can act on',
    Object.values(OBSTACLES).every(o => typeof o.why === 'string' && o.why.length > 50));
check('the railway reason names the approval that usually governs the programme',
    /asset protection/i.test(OBSTACLES.railway.why));

/* ── Crossing length: the setback dominates. ────────────────────────────── */
{
    const m = crossingLengthM({ widthM: 30, setbackM: 15 });
    check('a 30 m motorway with 15 m setbacks is a 60 m span, not a 30 m drill', m.value === 60);
    check('the span is double the obstacle width once setbacks are counted',
        m.value / 30 === 2);

    const deep = crossingLengthM({ widthM: 30, setbackM: 15, depthM: 8 });
    check('declaring a depth lengthens the bore, because it dips and returns',
        deep.value > m.value && near(deep.value, Math.hypot(30, 8) * 2, 1e-9));
    check('with no depth declared the bore is the flat span, not a silently invented curve',
        crossingLengthM({ widthM: 30, setbackM: 15, depthM: 0 }).value === 60);
    check('the basis says a drill is never the width of the thing it passes under',
        /never the width of the thing it passes under/i.test(m.basis));
    check('the basis says widths and setbacks are the owner\'s requirements, hence inputs',
        /inputs here and not constants/i.test(m.basis));
}

/* ── The schedule. ──────────────────────────────────────────────────────── */
{
    const s = crossingSchedule({ crossings: [
        { type: 'motorway', widthM: 30, setbackM: 15 },
        { type: 'railway', count: 2, widthM: 12, setbackM: 20 },
        { type: 'minor_road', count: 3, widthM: 7, setbackM: 2 }
    ] });
    check('crossings are counted including multiples', s.crossingCount === 6);
    check('trenchless and open-cut are counted separately',
        s.trenchlessCount === 3 && s.openCutCount === 3);
    check('added length totals every crossing including multiples: 60 + 2x52 + 3x11',
        near(s.addedLengthM, 60 + 2 * 52 + 3 * 11, 1e-9));
    check('a route with no blocking crossing keeps the corridor factor applicable',
        s.corridorApplicable === true);
    check('each item reports the method a contractor would price',
        s.items[0].method === 'trenchless' && s.items[2].method === 'open-cut');
}

/* A crossing counted but not costed must say so rather than contribute zero
   silently — a zero that looks like an answer is the failure mode here. */
{
    const s = crossingSchedule({ crossings: [{ type: 'motorway' }, { type: 'railway', widthM: 12, setbackM: 20 }] });
    check('a crossing with no width declared contributes no length and is named as undeclared',
        s.undeclaredLengths.includes('Motorway') && near(s.addedLengthM, 52, 1e-9));
    check('the basis says undeclared crossings are counted, not costed',
        /counted, not costed/i.test(s.basis));
}

/* ── Route estimate arithmetic. ─────────────────────────────────────────── */
{
    const r = routeEstimate({
        straightLineKm: 10,
        crossings: [{ type: 'motorway', widthM: 30, setbackM: 15 }],
        corridorFactor: 1.245
    });
    check('corridor is the straight line times the factor', near(r.corridorKm, 12.45, 1e-9));
    check('the crossing allowance is added in kilometres', near(r.crossingAllowanceKm, 0.06, 1e-9));
    check('the total is corridor plus crossings', near(r.value, 12.51, 1e-9));
    check('the basis states how many crossings cannot be open-cut',
        /1 cannot be open-cut|of which 1/i.test(r.basis));
    check('the basis keeps the screening caveat',
        /not a route, not a constructability assessment/i.test(r.basis));
}

/* ── Input discipline. ──────────────────────────────────────────────────── */

check('an unknown obstacle type is refused and the known list is named',
    throws(() => crossingSchedule({ crossings: [{ type: 'moat' }] }), /not a known obstacle.*motorway/s));

check('a corridor factor below 1 is refused — a route cannot be shorter than the straight line',
    throws(() => routeEstimate({ straightLineKm: 10, crossings: [], corridorFactor: 0.9 }), /at least 1/));

check('a fractional crossing count is refused',
    throws(() => crossingSchedule({ crossings: [{ type: 'motorway', count: 1.5 }] }), /whole number/));

check('crossings must be an array, and an empty one is the way to say "crosses nothing"',
    throws(() => crossingSchedule({ crossings: 'motorway' }), /must be an array/)
    && crossingSchedule({ crossings: [] }).crossingCount === 0);

check('a zero or negative width is refused',
    throws(() => crossingLengthM({ widthM: 0, setbackM: 15 }), /greater than zero/));

/* ── Refusals, and the boundary with the module it protects. ────────────── */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function finds or optimises a route',
        callable.every(n => !/find|search|optimi[sz]e|path|shortest/i.test(n)));
    check('no function prices a crossing or asserts consent',
        callable.every(n => !/cost|price|consent|permit|approv/i.test(n)));
    check('the refusals name the route itself, cost, consent and ground conditions',
        ['theRouteItself', 'crossingCost', 'crossingConsent', 'groundConditions'].every(k => k in NOT_COMPUTED));
    check('the refusal on routing says crossings are declared by the user, not discovered',
        /declared by the user, not discovered/i.test(NOT_COMPUTED.theRouteItself));
    check('the straight-line first pass is untouched: corridor-estimate still exports its calibrated factor',
        CABLE_FACTOR === 1.245);
}

if (failures.length) {
    console.error('route-obstacles proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('route-obstacles proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
