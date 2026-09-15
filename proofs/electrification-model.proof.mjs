/* electrification-model.proof.mjs — the module exists because a published
 * report had to be corrected for conflating a heat pump's thermal output with
 * its electrical input, and both were written in kilowatts. Most of these
 * checks are therefore about meanings rather than arithmetic: the arithmetic
 * here is division, and the errors in this field are substitutions.
 *
 * Run: node proofs/electrification-model.proof.mjs
 */

import {
    schema, MEANING, NOT_COMPUTED, NEVER_ADDED, NOT_A_FORECAST,
    quantity, electricalInputFromHeat, heatFromElectricalInput,
    fleetDemand, combinedPeak, primaryEnergyForWork
} from '../engine/electrification-model.js';

const failures = [];
let passed = 0;
const check = (name, condition) => { condition ? passed++ : failures.push(name); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, Kind) => { try { fn(); return false; } catch (e) { return e instanceof Kind; } };

/* ── the correction this module exists to prevent ────────────────────────── */

const heat = quantity(12.25, 'kW', MEANING.THERMAL_OUTPUT);
const elec = electricalInputFromHeat({ thermal: heat, scop: 3.5 });

check('12.25 kW of heat at a seasonal coefficient of performance of 3.5 needs '
    + '3.5 kW of electricity, the exact pair the published correction turned on',
    near(elec.value, 3.5, 1e-12) && elec.unit === 'kW');

check('the answer carries the meaning ELECTRICAL_INPUT, so it cannot later be '
    + 'read back as heat',
    elec.meaning === MEANING.ELECTRICAL_INPUT && heat.meaning === MEANING.THERMAL_OUTPUT);

check('the conversion REFUSES a quantity that carries the wrong meaning: '
    + 'handing it an electrical input where heat is expected throws, rather '
    + 'than dividing a number that is already electricity',
    throws(() => electricalInputFromHeat({
        thermal: quantity(3.5, 'kW', MEANING.ELECTRICAL_INPUT), scop: 3.5 }), RangeError));

check('the refusal message says why, naming the two kilowatts that are not the '
    + 'same quantity',
    (() => { try { electricalInputFromHeat({ thermal: quantity(3.5, 'kW', MEANING.ELECTRICAL_INPUT), scop: 3.5 }); }
             catch (e) { return /kilowatt/i.test(e.message) && /not the same/i.test(e.message); }
             return false; })());

check('the round trip is exact: heat to electricity and back returns the heat',
    near(heatFromElectricalInput({ electrical: elec, scop: 3.5 }).value, 12.25, 1e-12));

check('a coefficient of performance of 1 or less is refused, because a machine '
    + 'that returns no more heat than the electricity it eats is a resistance '
    + 'heater and calling it a heat pump hides that',
    throws(() => electricalInputFromHeat({ thermal: heat, scop: 1 }), RangeError)
    && throws(() => electricalInputFromHeat({ thermal: heat, scop: 0.9 }), RangeError));

check('the published range is named but never applied: no coefficient of '
    + 'performance is carried in the module',
    /3\.5 to 5/.test(NOT_COMPUTED.coefficientOfPerformance));

/* ── the fleet: a stress test and a planning number are different answers ── */

const pumps = fleetDemand({
    units: 28_000_000,
    perUnitNameplate: quantity(3.5, 'kW', MEANING.ELECTRICAL_INPUT),
    perUnitAfterDiversity: quantity(1.7, 'kW', MEANING.AFTER_DIVERSITY)
});

check('28 million heat pumps at 3.5 kW each, all at once, is 98 GW — the stress '
    + 'test figure in the report',
    near(pumps.simultaneous.value / 1e6, 98, 1e-9));

check('the same fleet after diversity at 1.7 kW is 47.6 GW, which is the number '
    + 'a network planner uses',
    near(pumps.diversified.value / 1e6, 47.6, 1e-9));

check('the stress test is labelled a stress test in the result itself, not in a '
    + 'footnote someone can drop when quoting it',
    /stress test/.test(pumps.simultaneous.label) && /not an expectation/.test(pumps.simultaneous.label));

check('the two figures carry different meanings, so nothing downstream can add '
    + 'them',
    pumps.simultaneous.meaning === MEANING.NAMEPLATE
    && pumps.diversified.meaning === MEANING.AFTER_DIVERSITY
    && pumps.never_added === NEVER_ADDED);

check('diversity is reported as a ratio so the assumption is visible: 1.7 of '
    + '3.5 is about 49 percent',
    near(pumps.diversified.ratio, 1.7 / 3.5, 1e-12));

check('an after-diversity figure LARGER than nameplate is refused, because that '
    + 'can only mean the two have been swapped',
    throws(() => fleetDemand({ units: 100,
        perUnitNameplate: quantity(1.7, 'kW', MEANING.ELECTRICAL_INPUT),
        perUnitAfterDiversity: quantity(3.5, 'kW', MEANING.AFTER_DIVERSITY) }), RangeError));

check('a nameplate passed where an after-diversity figure is expected is '
    + 'refused by meaning, even though both are kilowatts',
    throws(() => fleetDemand({ units: 100,
        perUnitNameplate: quantity(3.5, 'kW', MEANING.ELECTRICAL_INPUT),
        perUnitAfterDiversity: quantity(1.7, 'kW', MEANING.NAMEPLATE) }), RangeError));

check('with no diversity factor supplied, only the stress test is answered and '
    + 'the absence is stated',
    (() => { const f = fleetDemand({ units: 100, perUnitNameplate: quantity(3.5, 'kW', MEANING.NAMEPLATE) });
             return f.diversified === null && /diversity/i.test(f.not_computed); })());

check('a fractional number of units is refused: half a heat pump is not a fleet',
    throws(() => fleetDemand({ units: 1.5, perUnitNameplate: quantity(3.5, 'kW', MEANING.NAMEPLATE) }), RangeError));

const evs = fleetDemand({
    units: 20_000_000,
    perUnitNameplate: quantity(7.4, 'kW', MEANING.ELECTRICAL_INPUT),
    perUnitAfterDiversity: quantity(1.5, 'kW', MEANING.AFTER_DIVERSITY)
});

check('20 million vehicles charging at 7.4 kW simultaneously is 148 GW, the '
    + 'second stress test figure in the report',
    near(evs.simultaneous.value / 1e6, 148, 1e-9));

check('the two stress tests together are the 246 GW the report quotes, and that '
    + 'number is the sum of two figures the module refuses to add for you',
    near((pumps.simultaneous.value + evs.simultaneous.value) / 1e6, 246, 1e-9));

/* ── combining fleets: an assumption about time, stated ──────────────────── */

const both = combinedPeak({ fleets: [pumps, evs] });

check('combining the two diversified fleets gives 77.6 GW, well inside the 90 to '
    + '100 GW ceiling the report calls manageable, and far from 246',
    near(both.value / 1e6, 47.6 + 30, 1e-9));

check('the combination states the assumption it cannot check: that both peaks '
    + 'fall in the same hour',
    /same hour/.test(both.assumes) && /no clock/.test(both.assumes));

check('combining fleets REFUSES a fleet that has no diversity figure, because '
    + 'adding stress tests across fleets multiplies one fiction by another',
    throws(() => combinedPeak({ fleets: [pumps,
        fleetDemand({ units: 10, perUnitNameplate: quantity(3, 'kW', MEANING.NAMEPLATE) })] }), RangeError));

check('combining fleets in different units is refused rather than silently '
    + 'converted',
    throws(() => combinedPeak({ fleets: [pumps, fleetDemand({ units: 10,
        perUnitNameplate: quantity(3, 'MW', MEANING.ELECTRICAL_INPUT),
        perUnitAfterDiversity: quantity(1, 'MW', MEANING.AFTER_DIVERSITY) })] }), RangeError));

/* ── the efficiency case, which is the whole argument ────────────────────── */

const car = primaryEnergyForWork({
    usefulWork: quantity(100, 'TWh', MEANING.USEFUL_WORK),
    incumbentEfficiency: 0.25,
    electrifiedEfficiency: 0.70
});

check('the same motion from a 25 percent engine and a 70 percent drivetrain '
    + 'needs 400 TWh against 142.9 TWh',
    near(car.before.value, 400, 1e-9) && near(car.after.value, 100 / 0.7, 1e-9));

check('that is a 64.3 percent reduction in primary energy for the same work, '
    + 'which is the shape of the claim the report makes',
    near(car.reductionRatio, 1 - (100 / 0.7) / 400, 1e-12) && car.reductionRatio > 0.64);

const boiler = primaryEnergyForWork({
    usefulWork: quantity(100, 'TWh', MEANING.USEFUL_WORK),
    incumbentEfficiency: 0.85,
    electrifiedEfficiency: 3.5
});

check('the same heat from an 85 percent boiler and a heat pump at 3.5 needs '
    + '117.6 TWh against 28.6 TWh, a 75.7 percent reduction',
    near(boiler.before.value, 100 / 0.85, 1e-9) && near(boiler.after.value, 100 / 3.5, 1e-9)
    && boiler.reductionRatio > 0.75);

check('the result says what is NOT in the reduction: no behaviour change, no '
    + 'fabric improvement, no generation mix',
    /no behaviour change/.test(car.basis) && /generation mix/.test(car.basis));

check('a useful-work quantity is required; primary energy passed in its place '
    + 'is refused, because dividing primary energy by an efficiency again is '
    + 'the double-counting this whole area is prone to',
    throws(() => primaryEnergyForWork({
        usefulWork: quantity(100, 'TWh', MEANING.PRIMARY_ENERGY),
        incumbentEfficiency: 0.25, electrifiedEfficiency: 0.7 }), RangeError));

check('every result declares it is arithmetic on supplied assumptions and not a '
    + 'forecast',
    car.not_a_forecast === NOT_A_FORECAST && pumps.not_a_forecast === NOT_A_FORECAST
    && /not a prediction/.test(NOT_A_FORECAST));

check('no emissions figure is produced anywhere, and the module says why',
    /carbon intensity/.test(NOT_COMPUTED.emissions)
    && !('emissions' in car) && !('co2' in car));

/* ── the quantity type itself ────────────────────────────────────────────── */

check('a quantity is frozen, so a caller cannot relabel a number after the '
    + 'module has typed it',
    Object.isFrozen(heat) && Object.isFrozen(MEANING) && Object.isFrozen(NOT_COMPUTED));

check('an unknown meaning is refused rather than accepted as a free-text note',
    throws(() => quantity(1, 'kW', 'power'), RangeError)
    && throws(() => quantity(1, 'kW', 'THERMAL_OUTPUT'), RangeError));

check('there are seven declared meanings and three of them are powers, which is '
    + 'why a unit check alone cannot protect this arithmetic',
    Object.keys(MEANING).length === 7);

check('the schema names this module and this version',
    schema === 'ventus-grid-engine.electrification-model.v1');

/* ── report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('electrification-model proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('electrification-model proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
