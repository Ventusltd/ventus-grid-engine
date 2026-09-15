/**
 * Module: electrification-model
 *
 * APPLIED ENGINEERING. What electrifying a fleet of end uses does to energy
 * demand, and what it does to peak load. Two different questions with two
 * different answers, kept apart here because conflating them is the mistake
 * this file exists to prevent.
 *
 * WHY THIS FILE EXISTS, AND THE ERROR THAT JUSTIFIES IT.
 * A published UK report on electrification had to be corrected after an early
 * draft conflated the THERMAL OUTPUT of a heat pump with its ELECTRICAL INPUT.
 * A heat pump delivering 12.25 kW of heat draws about 3.5 kW of electricity at
 * a seasonal coefficient of performance of 3.5. Both numbers are written in
 * kilowatts. Both are correct. Interchanging them overstates electrical demand
 * by a factor of three and a half, and no unit check in the world would catch
 * it, because the unit is the same.
 *
 * So this module does not accept a power. It accepts a power WITH A MEANING,
 * and refuses to read one meaning as another. That is the whole design:
 *
 *     THERMAL_OUTPUT     heat delivered to a building
 *     ELECTRICAL_INPUT   electricity drawn from the network
 *     NAMEPLATE          the rating on the appliance, drawn only if it runs flat out
 *     AFTER_DIVERSITY    the contribution one unit makes to a network peak
 *     PRIMARY_ENERGY     energy entering the economy, fuel as burned
 *     FINAL_ENERGY       energy delivered to the end user
 *     USEFUL_WORK        the heat or motion actually obtained
 *
 * Seven meanings, three of them measured in watts, and every published error in
 * this field is a substitution between two of them.
 *
 * THE DIVERSITY POINT, WHICH IS THE ONE PLANNERS CARE ABOUT.
 * Twenty-eight million homes each with a 3.5 kW heat pump is not a 98 GW load,
 * because they do not all run at once. After diversity the maximum demand is
 * about 1.7 kW per home, so the same fleet contributes roughly 48 GW to a
 * network peak. The 98 GW figure is a stress test and must be labelled one.
 * This module returns both and names each, and it will not let a caller add a
 * nameplate sum to an after-diversity sum.
 *
 * WHAT THIS MODULE REFUSES.
 * It will not choose a coefficient of performance, a diversity factor or a
 * charging power: those are properties of a real appliance in a real place and
 * a plausible default would be the most dangerous thing this file could carry.
 * It will not tell you whether a network can take the answer, because that is
 * the rating and it is not here. It will not produce an emissions figure. And
 * it will not sum two quantities of different meaning, at all, ever.
 *
 * Schema: ventus-grid-engine.electrification-model.v1
 */

export const schema = 'ventus-grid-engine.electrification-model.v1';

/** The seven meanings a quantity may carry. A number without one is not an
 *  input to this module. */
export const MEANING = Object.freeze({
    THERMAL_OUTPUT: 'thermal_output',
    ELECTRICAL_INPUT: 'electrical_input',
    NAMEPLATE: 'nameplate',
    AFTER_DIVERSITY: 'after_diversity',
    PRIMARY_ENERGY: 'primary_energy',
    FINAL_ENERGY: 'final_energy',
    USEFUL_WORK: 'useful_work'
});

const POWER_MEANINGS = new Set([
    MEANING.THERMAL_OUTPUT, MEANING.ELECTRICAL_INPUT,
    MEANING.NAMEPLATE, MEANING.AFTER_DIVERSITY
]);

const ENERGY_MEANINGS = new Set([
    MEANING.PRIMARY_ENERGY, MEANING.FINAL_ENERGY, MEANING.USEFUL_WORK
]);

export const NOT_COMPUTED = Object.freeze({
    coefficientOfPerformance:
        'No seasonal coefficient of performance is carried here. It belongs to a '
        + 'specific machine in a specific building at a specific flow temperature, '
        + 'and the published range for heat pumps is roughly 3.5 to 5.',
    diversityFactor:
        'No after-diversity factor is carried here. It is measured, not derived, '
        + 'and it belongs to a particular network with a particular customer mix.',
    networkCapacity:
        'Whether a network can carry the answer is a question about ratings and '
        + 'about what already flows. Neither is in this module.',
    emissions:
        'No carbon intensity is carried here. An energy figure is not an '
        + 'emissions figure until someone states the intensity and its date.',
    timing:
        'This module has no clock. It says how much, never when, so it cannot '
        + 'tell you whether two peaks coincide.'
});

export const NEVER_ADDED =
    'Two quantities of different meaning are never summed. A nameplate total and '
    + 'an after-diversity total are different questions about the same fleet, and '
    + 'adding them answers neither.';

export const NOT_A_FORECAST =
    'A scenario is arithmetic on assumptions the caller supplied. It is not a '
    + 'prediction, and the assumptions travel with the answer so they can be '
    + 'argued with.';

/* ── guards ──────────────────────────────────────────────────────────────── */

function positive(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

function nonNegativeCount(name, v) {
    if (!Number.isInteger(v) || v < 0) {
        throw new RangeError(`${name} must be a whole number of units, received ${v}`);
    }
    return v;
}

function meaningOf(name, m, allowed) {
    if (typeof m !== 'string' || !Object.values(MEANING).includes(m)) {
        throw new RangeError(`${name} must carry one of the declared meanings, received ${JSON.stringify(m)}`);
    }
    if (allowed && !allowed.has(m)) {
        throw new RangeError(
            `${name} carries the meaning "${m}", which is not one this argument accepts. ` +
            `A kilowatt of heat delivered and a kilowatt of electricity drawn are both kilowatts ` +
            `and they are not the same quantity.`);
    }
    return m;
}

/** A quantity is a number, a unit and a meaning. Nothing in this module accepts
 *  a bare number where a quantity is expected. */
export function quantity(value, unit, meaning) {
    positive('value', value);
    if (typeof unit !== 'string' || !unit) throw new TypeError('unit must be a non-empty string');
    meaningOf('meaning', meaning);
    return Object.freeze({ value, unit, meaning });
}

/* ── the heat pump: the conversion that was got wrong ────────────────────── */

/**
 * Electrical input implied by a thermal output at a stated seasonal
 * coefficient of performance.
 *
 * This is the ONLY route in this module between heat and electricity, and it
 * is explicit in both directions, because the correction that prompted this
 * file was a silent substitution in exactly this place.
 */
export function electricalInputFromHeat({ thermal, scop }) {
    if (!thermal || typeof thermal !== 'object') throw new TypeError('thermal must be a quantity');
    meaningOf('thermal.meaning', thermal.meaning, new Set([MEANING.THERMAL_OUTPUT]));
    positive('thermal.value', thermal.value);
    positive('scop', scop);
    if (scop <= 1) throw new RangeError(
        `scop must be greater than 1; a coefficient of performance of ${scop} would mean the machine `
        + 'delivers no more heat than the electricity it consumes, which is a resistance heater.');

    return {
        schema,
        quantity: 'electrical_input',
        value: thermal.value / scop,
        unit: thermal.unit,
        meaning: MEANING.ELECTRICAL_INPUT,
        from: { thermal: { ...thermal }, scop },
        basis:
            `Electricity drawn = heat delivered / SCOP. ${thermal.value} ${thermal.unit} of heat at a `
            + `seasonal coefficient of performance of ${scop} needs `
            + `${(thermal.value / scop).toFixed(3)} ${thermal.unit} of electricity. The two numbers share `
            + 'a unit and are not interchangeable.',
        not_computed: NOT_COMPUTED.coefficientOfPerformance
    };
}

/** The same conversion the other way, for a caller who knows the electrical
 *  input and wants the heat. Declared separately so neither direction is ever
 *  implied. */
export function heatFromElectricalInput({ electrical, scop }) {
    if (!electrical || typeof electrical !== 'object') throw new TypeError('electrical must be a quantity');
    meaningOf('electrical.meaning', electrical.meaning, new Set([MEANING.ELECTRICAL_INPUT]));
    positive('electrical.value', electrical.value);
    positive('scop', scop);
    return {
        schema,
        quantity: 'thermal_output',
        value: electrical.value * scop,
        unit: electrical.unit,
        meaning: MEANING.THERMAL_OUTPUT,
        from: { electrical: { ...electrical }, scop },
        basis: `Heat delivered = electricity drawn x SCOP.`,
        not_computed: NOT_COMPUTED.coefficientOfPerformance
    };
}

/* ── fleets: the stress test and the planning number, side by side ───────── */

/**
 * What a fleet of identical units contributes to demand, answered twice.
 *
 * `perUnitNameplate` is what one unit draws running flat out.
 * `perUnitAfterDiversity` is what one unit contributes to a network peak, which
 * is a measured property of a population and is always smaller.
 *
 * Both are returned, each labelled, and they are never added. The simultaneous
 * figure is marked as a stress test because that is what it is: nobody expects
 * twenty-eight million heat pumps to start in the same second, and a number
 * that assumes they do should never be quoted as a forecast.
 */
export function fleetDemand({ units, perUnitNameplate, perUnitAfterDiversity = null }) {
    nonNegativeCount('units', units);
    if (!perUnitNameplate || typeof perUnitNameplate !== 'object') {
        throw new TypeError('perUnitNameplate must be a quantity');
    }
    meaningOf('perUnitNameplate.meaning', perUnitNameplate.meaning,
        new Set([MEANING.NAMEPLATE, MEANING.ELECTRICAL_INPUT]));
    positive('perUnitNameplate.value', perUnitNameplate.value);

    const simultaneous = {
        value: units * perUnitNameplate.value,
        unit: perUnitNameplate.unit,
        meaning: MEANING.NAMEPLATE,
        label: 'every unit at once: a stress test, not an expectation'
    };

    let diversified = null;
    if (perUnitAfterDiversity) {
        meaningOf('perUnitAfterDiversity.meaning', perUnitAfterDiversity.meaning,
            new Set([MEANING.AFTER_DIVERSITY]));
        positive('perUnitAfterDiversity.value', perUnitAfterDiversity.value);
        if (perUnitAfterDiversity.unit !== perUnitNameplate.unit) {
            throw new RangeError(
                `after-diversity demand is in ${perUnitAfterDiversity.unit} and nameplate is in `
                + `${perUnitNameplate.unit}; this module does not convert units`);
        }
        if (perUnitAfterDiversity.value > perUnitNameplate.value) {
            throw new RangeError(
                `after-diversity demand (${perUnitAfterDiversity.value}) exceeds nameplate `
                + `(${perUnitNameplate.value}). Diversity can only reduce a contribution to peak; a `
                + 'larger figure means the two have been swapped.');
        }
        diversified = {
            value: units * perUnitAfterDiversity.value,
            unit: perUnitAfterDiversity.unit,
            meaning: MEANING.AFTER_DIVERSITY,
            label: 'contribution to a network peak, after diversity',
            ratio: perUnitAfterDiversity.value / perUnitNameplate.value
        };
    }

    return {
        schema,
        quantity: 'fleet_demand',
        units,
        simultaneous,
        diversified,
        never_added: NEVER_ADDED,
        not_computed: diversified ? NOT_COMPUTED.networkCapacity : NOT_COMPUTED.diversityFactor,
        not_a_forecast: NOT_A_FORECAST,
        basis: diversified
            ? `${units} units. Flat out: ${simultaneous.value} ${simultaneous.unit}. After diversity: `
              + `${diversified.value} ${diversified.unit}, which is `
              + `${(diversified.ratio * 100).toFixed(1)}% of the nameplate sum.`
            : `${units} units at ${perUnitNameplate.value} ${perUnitNameplate.unit} each, flat out. `
              + 'No diversity factor was supplied, so only the stress test is answered.'
    };
}

/** Two fleets contribute to one peak only if their peaks coincide, and this
 *  module has no clock. So it adds the after-diversity contributions and says
 *  plainly what that addition assumes. */
export function combinedPeak({ fleets }) {
    if (!Array.isArray(fleets) || fleets.length === 0) {
        throw new TypeError('fleets must be a non-empty array of fleetDemand results');
    }
    const parts = [];
    let unit = null;
    for (const f of fleets) {
        if (!f || !f.diversified) throw new RangeError(
            'every fleet must carry an after-diversity figure; summing nameplate totals across fleets '
            + 'multiplies one stress test by another and means nothing');
        if (unit === null) unit = f.diversified.unit;
        else if (unit !== f.diversified.unit) throw new RangeError(
            `fleets are in different units (${unit} and ${f.diversified.unit}); this module does not convert`);
        parts.push({ units: f.units, value: f.diversified.value, unit: f.diversified.unit });
    }
    return {
        schema,
        quantity: 'combined_peak',
        value: parts.reduce((a, p) => a + p.value, 0),
        unit,
        meaning: MEANING.AFTER_DIVERSITY,
        parts,
        assumes: 'that every fleet reaches its after-diversity maximum at the same hour. This module has '
               + 'no clock and cannot check that. If the peaks are separated in time the true combined '
               + 'peak is lower, and if a shared driver such as cold weather moves them together it is not.',
        not_computed: NOT_COMPUTED.timing,
        not_a_forecast: NOT_A_FORECAST
    };
}

/* ── the efficiency case for electrification ─────────────────────────────── */

/**
 * The primary energy a use case needs, before and after electrification, for
 * the same useful work.
 *
 * This is the arithmetic behind the claim that electrifying can cut primary
 * energy demand substantially: an internal combustion car turns roughly a
 * quarter of the fuel into motion while an electric one turns most of the
 * electricity into motion, and a gas boiler delivers a little less heat than
 * the gas it burns while a heat pump delivers several times its electricity.
 * The saving is real and it is a ratio of efficiencies, nothing more.
 */
export function primaryEnergyForWork({ usefulWork, incumbentEfficiency, electrifiedEfficiency }) {
    if (!usefulWork || typeof usefulWork !== 'object') throw new TypeError('usefulWork must be a quantity');
    meaningOf('usefulWork.meaning', usefulWork.meaning, new Set([MEANING.USEFUL_WORK]));
    positive('usefulWork.value', usefulWork.value);
    positive('incumbentEfficiency', incumbentEfficiency);
    positive('electrifiedEfficiency', electrifiedEfficiency);

    const before = usefulWork.value / incumbentEfficiency;
    const after = usefulWork.value / electrifiedEfficiency;
    const saved = before - after;

    return {
        schema,
        quantity: 'primary_energy_for_work',
        unit: usefulWork.unit,
        meaning: MEANING.PRIMARY_ENERGY,
        before: { value: before, unit: usefulWork.unit, meaning: MEANING.PRIMARY_ENERGY },
        after: { value: after, unit: usefulWork.unit, meaning: MEANING.PRIMARY_ENERGY },
        saved: { value: saved, unit: usefulWork.unit, meaning: MEANING.PRIMARY_ENERGY },
        reductionRatio: before > 0 ? saved / before : 0,
        from: { usefulWork: { ...usefulWork }, incumbentEfficiency, electrifiedEfficiency },
        basis:
            `Same useful work, two conversion chains. At ${incumbentEfficiency} it needs `
            + `${before.toFixed(3)} ${usefulWork.unit}; at ${electrifiedEfficiency} it needs `
            + `${after.toFixed(3)} ${usefulWork.unit}. The reduction is a ratio of efficiencies and `
            + 'nothing else: no behaviour change, no fabric improvement and no generation mix is in it.',
        not_computed: NOT_COMPUTED.emissions,
        not_a_forecast: NOT_A_FORECAST
    };
}
