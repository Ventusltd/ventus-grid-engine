/**
 * Module: voltage-drop
 *
 * APPLIED ENGINEERING. What a cable run costs in volts and in watts.
 *
 * WHY THIS DECIDES CABLE SIZE MORE OFTEN THAN CURRENT DOES.
 * A cable is chosen for three things: it must carry the current without
 * overheating, it must clear a fault, and it must deliver the voltage at the
 * far end. On a long run — a solar farm's internal collection, a depot's
 * feeders, anything measured in hundreds of metres — the third constraint bites
 * first. A conductor perfectly happy on ampacity can still be the wrong size,
 * because by the time the current reaches the far inverter the voltage has
 * fallen further than the equipment will accept.
 *
 * THE ARITHMETIC.
 * A cable has resistance and reactance per unit length. The load draws current
 * at some power factor, and the drop along the run is the component of the
 * impedance voltage in phase with the supply:
 *
 *     three phase:   Vdrop = sqrt(3) x I x L x (R cos(phi) + X sin(phi))
 *     single phase:  Vdrop = 2      x I x L x (R cos(phi) + X sin(phi))
 *
 * The factor differs because a single-phase circuit's current returns down a
 * second conductor and drops volts in both, while a balanced three-phase
 * circuit's return currents cancel. Getting that factor wrong is a 15% error
 * in the same direction every time.
 *
 * Note the power factor term. At unity the reactance contributes nothing and
 * only R matters; at 0.8 the reactance contributes 60% of its value, and on a
 * large cable — where X approaches and can exceed R — ignoring it under-states
 * the drop badly. Motors, and any poorly corrected industrial load, are exactly
 * where that error lands.
 *
 * LOSSES ARE A SEPARATE QUESTION AND ARE ANSWERED SEPARATELY.
 * Heat is I squared R, and only R: reactance stores and returns energy rather
 * than dissipating it. So a run can have an acceptable voltage drop and
 * expensive losses, or the reverse, and the two are computed here as two
 * different numbers rather than one conflated one.
 *
 * WHAT THIS MODULE REFUSES.
 * It will not choose a cable. Selection needs the installation method, the
 * grouping, the ambient and ground temperature, the soil thermal resistivity,
 * the depth of burial, the protective device and the fault clearance time —
 * and it needs the manufacturer's tables for the actual product. Every one of
 * those is absent here. It also carries no R and X values of its own: those
 * belong to a specific conductor in a specific arrangement, and a plausible
 * default would be the most dangerous thing this file could contain.
 *
 * Schema: ventus-grid-engine.voltage-drop.v1
 */

export const schema = 'ventus-grid-engine.voltage-drop.v1';

export const PHASE_FACTOR = Object.freeze({
    three: Math.sqrt(3),
    single: 2
});

function positive(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

function nonNegative(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v < 0) throw new RangeError(`${name} must not be negative, received ${v}`);
    return v;
}

function ratio(name, v) {
    positive(name, v);
    if (v > 1) throw new RangeError(
        `${name} must be a fraction in (0, 1], received ${v}. A power factor of 90% must be passed as 0.9.`);
    return v;
}

function phasesOf(phases) {
    if (phases !== 'three' && phases !== 'single') {
        throw new RangeError(`phases must be "three" or "single", received ${JSON.stringify(phases)}`);
    }
    return phases;
}

/**
 * Volts lost along a run.
 *
 * R and X are per kilometre and belong to the conductor you are actually
 * using. There is no default: see the header.
 */
export function voltageDropVolts({
    currentA, lengthM, resistanceOhmPerKm, reactanceOhmPerKm = 0, powerFactor, phases = 'three'
}) {
    positive('currentA', currentA);
    positive('lengthM', lengthM);
    positive('resistanceOhmPerKm', resistanceOhmPerKm);
    nonNegative('reactanceOhmPerKm', reactanceOhmPerKm);
    ratio('powerFactor', powerFactor);
    phasesOf(phases);

    const km = lengthM / 1000;
    const sinPhi = Math.sqrt(1 - powerFactor * powerFactor);
    const zEffective = resistanceOhmPerKm * powerFactor + reactanceOhmPerKm * sinPhi;
    const factor = PHASE_FACTOR[phases];
    const drop = factor * currentA * km * zEffective;

    const resistivePart = factor * currentA * km * resistanceOhmPerKm * powerFactor;
    return {
        schema,
        quantity: 'voltage_drop_volts',
        value: drop,
        unit: 'V',
        resistiveVolts: resistivePart,
        reactiveVolts: drop - resistivePart,
        from: { currentA, lengthM, resistanceOhmPerKm, reactanceOhmPerKm, powerFactor, phases },
        basis:
            `${currentA} A over ${lengthM} m of conductor at ${resistanceOhmPerKm} ohm/km resistance and ` +
            `${reactanceOhmPerKm} ohm/km reactance, at a power factor of ${powerFactor}, ` +
            `${phases}-phase (factor ${factor.toFixed(4)}). Of ${drop.toFixed(2)} V lost, ` +
            `${resistivePart.toFixed(2)} V is resistive and ${(drop - resistivePart).toFixed(2)} V is ` +
            `reactive. At unity power factor the reactance would contribute nothing; the lower the ` +
            `power factor the more of X appears in the answer, which is why ignoring X on a large ` +
            `cable feeding a poorly corrected load under-states the drop.`
    };
}

/**
 * The drop as a percentage of a nominal voltage, which is how every limit is
 * written.
 */
export function dropPercent({ dropVolts, nominalVolts }) {
    positive('dropVolts', dropVolts);
    positive('nominalVolts', nominalVolts);
    return {
        schema,
        quantity: 'voltage_drop_percent',
        value: (dropVolts / nominalVolts) * 100,
        unit: '%',
        from: { dropVolts, nominalVolts },
        basis:
            `${dropVolts.toFixed(2)} V on a ${nominalVolts} V nominal system is ` +
            `${((dropVolts / nominalVolts) * 100).toFixed(3)}%. What limit applies is a design and ` +
            `compliance question — it depends on the installation, on what is at the far end, and on ` +
            `how much of the allowance the rest of the system has already spent. No limit is asserted here.`
    };
}

/**
 * Heat: I squared R, and only R.
 *
 * Reactance stores and returns energy; it does not dissipate it. A run can have
 * an acceptable drop and expensive losses, or the reverse.
 */
export function lossesWatts({ currentA, lengthM, resistanceOhmPerKm, phases = 'three' }) {
    positive('currentA', currentA);
    positive('lengthM', lengthM);
    positive('resistanceOhmPerKm', resistanceOhmPerKm);
    phasesOf(phases);
    const km = lengthM / 1000;
    /* Three phase: three conductors each carrying I. Single phase: two
       conductors, both carrying the full current. */
    const conductors = phases === 'three' ? 3 : 2;
    const watts = conductors * currentA * currentA * resistanceOhmPerKm * km;
    return {
        schema,
        quantity: 'losses_watts',
        value: watts,
        unit: 'W',
        conductors,
        from: { currentA, lengthM, resistanceOhmPerKm, phases },
        basis:
            `${conductors} conductors carrying ${currentA} A through ` +
            `${(resistanceOhmPerKm * km).toFixed(4)} ohm each dissipate ${watts.toFixed(1)} W as heat. ` +
            `Only resistance appears: reactance stores and returns energy rather than dissipating it, ` +
            `so a run may have an acceptable voltage drop and expensive losses, or the reverse.`
    };
}

/**
 * Annual energy lost, at a stated loss load factor.
 *
 * Losses vary with the SQUARE of current, so they cannot be scaled by the
 * ordinary load factor. The loss load factor is a different quantity and it is
 * required rather than derived.
 */
export function annualLossKwh({ peakLossWatts, lossLoadFactor, hours = 8760 }) {
    positive('peakLossWatts', peakLossWatts);
    ratio('lossLoadFactor', lossLoadFactor);
    positive('hours', hours);
    return {
        schema,
        quantity: 'annual_loss_kwh',
        value: (peakLossWatts * lossLoadFactor * hours) / 1000,
        unit: 'kWh',
        from: { peakLossWatts, lossLoadFactor, hours },
        basis:
            `${peakLossWatts.toFixed(1)} W at peak, held for the equivalent of ${lossLoadFactor} of ` +
            `${hours} hours. The LOSS load factor is not the load factor: losses follow the square of ` +
            `current, so a site with a load factor of 0.5 typically has a loss load factor well below ` +
            `it. Using the load factor here over-states annual losses, sometimes badly.`
    };
}

export const NOT_COMPUTED = Object.freeze({
    cableSelection:
        'This will not choose a cable. Selection needs the installation method, grouping, ambient and ground temperature, soil thermal resistivity, depth of burial, the protective device and the fault clearance time, plus the manufacturer\'s tables for the actual product. None of that is here.',
    conductorParameters:
        'No R or X values are carried. They belong to a specific conductor in a specific arrangement, and a plausible-looking default would be the most dangerous thing this file could contain.',
    permittedDrop:
        'What drop is permitted depends on the installation, on what sits at the far end, and on how much of the allowance the rest of the system has already spent. No limit is asserted.',
    faultWithstand:
        'Whether a conductor survives a fault until the protection clears is a separate calculation needing the prospective fault current and the device characteristic. A cable adequate for volts and amps can still be inadequate for a fault.'
});
