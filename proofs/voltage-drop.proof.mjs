/* voltage-drop.proof.mjs — volts and watts along a run.
 *
 * Two errors this exists to prevent, both of which produce a confident wrong
 * answer in a consistent direction:
 *
 *   1. The wrong phase factor. sqrt(3) against 2 is a 15% error every time.
 *   2. Dropping the reactance term, or applying it as if the power factor were
 *      unity. On a large cable X approaches R, and a poorly corrected load is
 *      exactly where that under-statement lands.
 *
 * Run: node proofs/voltage-drop.proof.mjs
 */

import * as mod from '../engine/voltage-drop.js';
const { schema, PHASE_FACTOR, NOT_COMPUTED,
    voltageDropVolts, dropPercent, lossesWatts, annualLossKwh } = mod;

const failures = [];
let passed = 0;
const check = (n, c) => { c ? passed += 1 : failures.push(n); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, p) => { try { fn(); return false; } catch (e) { return p.test(e.message); } };

check('schema is declared', schema === 'ventus-grid-engine.voltage-drop.v1');

check('the phase factors are sqrt(3) and 2, not 1.73 typed in',
    PHASE_FACTOR.three === Math.sqrt(3) && PHASE_FACTOR.single === 2);

/* ── A worked run: 200 A, 250 m, 0.1 ohm/km R, 0.08 ohm/km X, pf 0.9. ───── */
{
    const a = { currentA: 200, lengthM: 250, resistanceOhmPerKm: 0.1,
        reactanceOhmPerKm: 0.08, powerFactor: 0.9, phases: 'three' };
    const r = voltageDropVolts(a);
    const sinPhi = Math.sqrt(1 - 0.9 * 0.9);
    const expected = Math.sqrt(3) * 200 * 0.25 * (0.1 * 0.9 + 0.08 * sinPhi);
    check('the three-phase drop matches the formula exactly', near(r.value, expected, 1e-9));
    check('resistive and reactive parts are reported separately and sum to the whole',
        near(r.resistiveVolts + r.reactiveVolts, r.value, 1e-9));
    check('the reactive part is a real fraction of the answer at pf 0.9, not a rounding artefact',
        r.reactiveVolts / r.value > 0.25);
}

/* The phase factor. Same circuit, both conventions. */
{
    const base = { currentA: 200, lengthM: 250, resistanceOhmPerKm: 0.1,
        reactanceOhmPerKm: 0.08, powerFactor: 0.9 };
    const three = voltageDropVolts({ ...base, phases: 'three' }).value;
    const single = voltageDropVolts({ ...base, phases: 'single' }).value;
    check('single phase drops more than three phase for the same current and run',
        single > three);
    check('and the ratio is exactly 2 over sqrt(3) — a 15.5% error if the factor is wrong',
        near(single / three, 2 / Math.sqrt(3), 1e-12));
}

/* The reactance term against power factor. */
{
    const base = { currentA: 200, lengthM: 250, resistanceOhmPerKm: 0.1, reactanceOhmPerKm: 0.15 };
    const unity = voltageDropVolts({ ...base, powerFactor: 1 });
    const poor = voltageDropVolts({ ...base, powerFactor: 0.8 });
    check('at unity power factor the reactance contributes exactly nothing',
        unity.reactiveVolts === 0);
    check('at unity the drop is the resistive term alone',
        near(unity.value, Math.sqrt(3) * 200 * 0.25 * 0.1, 1e-9));
    check('at 0.8 the reactance contributes 60% of its value, because sin(phi) is 0.6',
        near(poor.reactiveVolts, Math.sqrt(3) * 200 * 0.25 * 0.15 * 0.6, 1e-9));
    /* On a cable where X exceeds R, ignoring X is the bigger error. */
    const ignoringX = voltageDropVolts({ ...base, reactanceOhmPerKm: 0, powerFactor: 0.8 }).value;
    check('ignoring reactance on a cable where X exceeds R under-states the drop by over a third',
        (poor.value - ignoringX) / poor.value > 0.33);
    check('the basis warns about exactly that',
        /ignoring X on a large\s+cable/i.test(poor.basis.replace(/\s+/g, ' '))
        || /ignoring X on a large cable/i.test(poor.basis.replace(/\s+/g, ' ')));
}

/* ── Percentage, and the absence of an asserted limit. ──────────────────── */
{
    const p = dropPercent({ dropVolts: 9.2, nominalVolts: 400 });
    check('9.2 V on 400 V is 2.3%', near(p.value, 2.3, 1e-9));
    check('no permitted limit is asserted, and the basis says why',
        /No limit is asserted here/i.test(p.basis));
}

/* ── Losses: only resistance, and the right conductor count. ────────────── */
{
    const l3 = lossesWatts({ currentA: 200, lengthM: 250, resistanceOhmPerKm: 0.1, phases: 'three' });
    check('three-phase losses count three conductors', l3.conductors === 3);
    check('losses are I squared R times the conductor count',
        near(l3.value, 3 * 200 * 200 * 0.1 * 0.25, 1e-9));

    const l1 = lossesWatts({ currentA: 200, lengthM: 250, resistanceOhmPerKm: 0.1, phases: 'single' });
    check('single-phase losses count two conductors, both carrying the full current',
        l1.conductors === 2 && near(l1.value, 2 * 200 * 200 * 0.1 * 0.25, 1e-9));

    /* Reactance must not appear in heat. This is the check that catches
       somebody "improving" losses by passing the impedance in. */
    const withX = lossesWatts({ currentA: 200, lengthM: 250, resistanceOhmPerKm: 0.1, phases: 'three' });
    check('reactance cannot enter the loss calculation, because losses take only R',
        !('reactanceOhmPerKm' in withX.from));
    check('the basis says reactance stores and returns energy rather than dissipating it',
        /stores and returns energy/i.test(withX.basis));

    /* Losses follow the square of current: double the current, quadruple the heat. */
    const doubled = lossesWatts({ currentA: 400, lengthM: 250, resistanceOhmPerKm: 0.1, phases: 'three' });
    check('doubling the current quadruples the losses', near(doubled.value / l3.value, 4, 1e-9));
}

/* ── Annual losses, and the trap in scaling them. ───────────────────────── */
{
    const a = annualLossKwh({ peakLossWatts: 3000, lossLoadFactor: 0.3 });
    check('3 kW at peak with a 0.3 loss load factor is 7,884 kWh a year',
        near(a.value, 3000 * 0.3 * 8760 / 1000, 1e-9));
    check('the basis says the LOSS load factor is not the load factor, and why',
        /LOSS load factor is not the load factor/i.test(a.basis)
        && /square of\s+current/i.test(a.basis.replace(/\s+/g, ' ')));
}

/* ── Input discipline. ──────────────────────────────────────────────────── */

check('an unknown phase convention is refused, and the two valid ones are named',
    throws(() => voltageDropVolts({ currentA: 100, lengthM: 100, resistanceOhmPerKm: 0.1,
        powerFactor: 0.9, phases: 'two' }), /"three" or "single"/));

check('a power factor of 90 is refused, and the message says to pass 0.9',
    throws(() => voltageDropVolts({ currentA: 100, lengthM: 100, resistanceOhmPerKm: 0.1,
        powerFactor: 90 }), /fraction.*0\.9/s));

check('a zero resistance is refused — a conductor with no resistance is not a conductor',
    throws(() => voltageDropVolts({ currentA: 100, lengthM: 100, resistanceOhmPerKm: 0,
        powerFactor: 0.9 }), /greater than zero/));

check('a zero reactance IS accepted, because a purely resistive figure is a legitimate input',
    voltageDropVolts({ currentA: 100, lengthM: 100, resistanceOhmPerKm: 0.1,
        reactanceOhmPerKm: 0, powerFactor: 0.9 }).reactiveVolts === 0);

check('a negative reactance is refused',
    throws(() => voltageDropVolts({ currentA: 100, lengthM: 100, resistanceOhmPerKm: 0.1,
        reactanceOhmPerKm: -0.05, powerFactor: 0.9 }), /not be negative/));

/* ── Refusals. ──────────────────────────────────────────────────────────── */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function selects or sizes a cable',
        callable.every(n => !/select|size|choose|csa|recommend/i.test(n)));
    check('no conductor parameters are carried as data',
        !Object.keys(mod).some(k => /^(CABLE|CONDUCTOR|CSA|R_|X_)/i.test(k)));
    check('the refusals name selection, conductor parameters, permitted drop and fault withstand',
        ['cableSelection', 'conductorParameters', 'permittedDrop', 'faultWithstand']
            .every(k => k in NOT_COMPUTED));
    check('the conductor-parameter refusal says a plausible default would be the dangerous thing',
        /most dangerous thing this file could contain/i.test(NOT_COMPUTED.conductorParameters));
    check('the fault refusal warns a cable adequate for volts and amps can still fail a fault',
        /still be inadequate for a fault/i.test(NOT_COMPUTED.faultWithstand));
}

if (failures.length) {
    console.error('voltage-drop proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('voltage-drop proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
