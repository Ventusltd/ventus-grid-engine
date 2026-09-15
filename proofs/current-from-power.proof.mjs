/* current-from-power.proof.mjs — the step that was missing between a
 * published rating and a cable calculation. Every published network figure
 * here is a power; every cable calculation here takes a current; nothing
 * joined them. These checks fix the join, and they spend most of their
 * effort on the two ways it can be got wrong silently: the single-phase
 * factor, and the belief that a rating is a flow.
 *
 * Run: node proofs/current-from-power.proof.mjs
 */

import {
    schema, CURRENT_PHASE_FACTOR, NOT_COMPUTED, NOT_A_HEADROOM,
    currentA, currentFromMvaAtKv
} from '../engine/current-from-power.js';
import { PHASE_FACTOR } from '../engine/voltage-drop.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, Kind) => {
    try { fn(); return false; } catch (e) { return e instanceof Kind; }
};

/* ── The constants, and the one that is a trap ───────────────────────────── */

check('the three-phase divisor is root three',
    near(CURRENT_PHASE_FACTOR.three, Math.sqrt(3), 1e-15));

check('the single-phase divisor is one, not two',
    CURRENT_PHASE_FACTOR.single === 1);

check('the single-phase divisor DIFFERS from voltage-drop\'s single-phase '
    + 'factor, which is 2 because a drop is lost in both conductors while a '
    + 'current is one current: importing that map here would halve every '
    + 'single-phase answer',
    CURRENT_PHASE_FACTOR.single !== PHASE_FACTOR.single
    && PHASE_FACTOR.single === 2);

check('the three-phase divisor MATCHES voltage-drop\'s, which is why the '
    + 'single-phase mistake is easy to make and is worth a proof',
    near(CURRENT_PHASE_FACTOR.three, PHASE_FACTOR.three, 1e-15));

check('the schema names this module and this version',
    schema === 'ventus-grid-engine.current-from-power.v1');

/* ── The arithmetic, against hand-computed values ────────────────────────── */

/* 1,200 MVA at 400 kV: 1.2e9 / (1.7320508 x 4e5) = 1732.0508 A */
check('1,200 MVA on a 400 kV circuit implies 1,732.05 A',
    near(currentFromMvaAtKv({ mva: 1200, kv: 400 }).value, 1732.0508075688772, 1e-9));

/* 90 MVA at 132 kV: 9e7 / (1.7320508 x 1.32e5) = 393.6479 A */
check('90 MVA on a 132 kV circuit implies 393.65 A',
    near(currentFromMvaAtKv({ mva: 90, kv: 132 }).value, 393.6479108111085, 1e-9));

check('the megavolt-ampere call and the base-unit call are the same '
    + 'calculation, so a caller cannot get two answers for one question',
    near(currentFromMvaAtKv({ mva: 1200, kv: 400 }).value,
         currentA({ apparentPowerVa: 1200e6, voltageV: 400e3 }).value, 1e-9));

/* 50 kVA at 400 V single phase: 5e4 / 4e2 = 125 A exactly */
check('50 kVA single phase at 400 V is exactly 125 A, the textbook case that '
    + 'would read 62.5 A if the wrong phase factor were used',
    currentA({ apparentPowerVa: 50e3, voltageV: 400, phases: 'single' }).value === 125);

check('single phase gives root-three times the current of three phase for the '
    + 'same power and voltage, never half of it',
    near(currentA({ apparentPowerVa: 1e6, voltageV: 1e3, phases: 'single' }).value
       / currentA({ apparentPowerVa: 1e6, voltageV: 1e3, phases: 'three' }).value,
         Math.sqrt(3), 1e-12));

check('halving the voltage doubles the current, because the relationship is '
    + 'inverse and any other behaviour would be a dimensional error',
    near(currentFromMvaAtKv({ mva: 100, kv: 66 }).value,
         2 * currentFromMvaAtKv({ mva: 100, kv: 132 }).value, 1e-9));

/* ── The result carries its units and its basis ──────────────────────────── */

const answer = currentFromMvaAtKv({ mva: 1200, kv: 400 });

check('the result states its unit, so a wire into a currentA pin can be '
    + 'checked rather than assumed',
    answer.unit === 'A');

check('the result names its quantity',
    answer.quantity === 'current_amperes');

check('the result carries the inputs it was given back out with it',
    answer.from.mva === 1200 && answer.from.kv === 400
    && answer.from.phases === 'three');

check('the result prints the formula it used, and the printed formula '
    + 'changes with the phase count',
    answer.basis.includes('sqrt(3) x V_line')
    && currentA({ apparentPowerVa: 1e6, voltageV: 1e3, phases: 'single' })
        .basis.includes('I = S / (V)'));

/* ── The refusals, which are the point of the module ─────────────────────── */

check('every result says in its own body that it is not what the circuit is '
    + 'carrying, because the single most likely misreading of an amps figure '
    + 'derived from a rating is that it is a flow',
    answer.not_computed === NOT_COMPUTED.actualCurrent
    && /not what the circuit is carrying/.test(answer.not_computed));

check('every result refuses headroom explicitly, since a rating minus nothing '
    + 'is not spare capacity',
    answer.not_a_headroom === NOT_A_HEADROOM
    && /not spare capacity/.test(NOT_A_HEADROOM));

check('the module refuses derating in writing: no ambient, grouping, burial '
    + 'depth, soil resistivity or season is applied',
    /ambient temperature/.test(NOT_COMPUTED.derating)
    && /soil thermal/.test(NOT_COMPUTED.derating));

check('the module refuses to choose a voltage for a site that publishes '
    + 'several',
    /never chooses one/.test(NOT_COMPUTED.voltageChoice));

check('the module refuses to convert MW to MVA, leaving power factor to the '
    + 'one file that owns it, so two files cannot disagree about one number',
    /power-factor\.js/.test(NOT_COMPUTED.powerFactor));

check('the refusals are frozen, so a caller cannot edit the sentence that '
    + 'qualifies its own answer',
    Object.isFrozen(NOT_COMPUTED) && Object.isFrozen(CURRENT_PHASE_FACTOR));

/* ── Guards: bad input is refused loudly, never quietly ──────────────────── */

check('a missing power throws rather than returning NaN',
    throws(() => currentA({ voltageV: 400e3 }), TypeError));

check('a zero voltage throws rather than returning Infinity, which is the '
    + 'failure a division would otherwise hand downstream',
    throws(() => currentA({ apparentPowerVa: 1e6, voltageV: 0 }), RangeError));

check('a negative power throws',
    throws(() => currentA({ apparentPowerVa: -1, voltageV: 400e3 }), RangeError));

check('a null power throws a TypeError naming the parameter',
    throws(() => currentA({ apparentPowerVa: null, voltageV: 400e3 }), TypeError));

check('an unknown phase count throws instead of defaulting, because a silent '
    + 'default here is a root-three error',
    throws(() => currentA({ apparentPowerVa: 1e6, voltageV: 1e3, phases: 'two' }), RangeError));

check('phases defaults to three only when omitted entirely',
    currentA({ apparentPowerVa: 1e6, voltageV: 1e3 }).from.phases === 'three');

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('current-from-power proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('current-from-power proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
