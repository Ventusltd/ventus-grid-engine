/**
 * Module: diversified-demand
 *
 * APPLIED ENGINEERING. What a group of loads actually draws together, which is
 * never the sum of what each could draw alone.
 *
 * WHY DIVERSITY IS THE WHOLE PROBLEM.
 * A hundred homes with 7 kW chargers do not present 700 kW to the transformer,
 * because they do not all charge at once. The figure that sizes the plant is
 * the After Diversity Maximum Demand — the peak of the SUM, not the sum of the
 * peaks. The ratio between them is the coincidence factor, and it falls as the
 * group grows: two homes are highly correlated, ten thousand are not.
 *
 * This is the single most consequential number in distribution planning, and
 * the one most often assumed rather than measured. Assume it too low and the
 * transformer overheats; too high and a viable connection is refused, or a
 * network is built that nobody needs. This module therefore REQUIRES the
 * coincidence factor as an input and supplies no default. Where a network
 * operator publishes one for a load class, use theirs.
 *
 * WHY THE NUMBER OF UNITS MATTERS AND IS NOT A FREE PARAMETER.
 * Coincidence is not a property of the appliance, it is a property of the
 * group. A coincidence factor quoted for 1,000 homes applied to 10 homes will
 * badly under-size. So `diversifiedDemand` records the unit count alongside the
 * factor, and `impliedCoincidence` runs the calculation the honest way round:
 * where a measured group peak exists, derive the factor from it.
 *
 * THE CHARGING-WINDOW CASE, WHICH IS DIFFERENT AND OFTEN CONFLATED.
 * Energy delivered in a window sets an AVERAGE power over that window; it does
 * not set the peak. Ten million vehicles taking 25 TWh a year average 2.85 GW
 * across the year and 8.56 GW across an eight-hour nightly window — but their
 * unrestricted simultaneous draw is far higher, and the number that matters
 * depends entirely on whether the charging is managed. Both quantities are
 * offered here, separately named, because collapsing them is how a flexibility
 * assumption gets smuggled into a network study.
 *
 * WHAT THIS MODULE REFUSES.
 * No function returns a coincidence factor from first principles: there is no
 * closed form, only measurement and the operator's published figures. No
 * function decides whether a group fits — that is firm capacity, and it is a
 * different module with its own refusals.
 *
 * Schema: ventus-grid-engine.diversified-demand.v1
 */

export const schema = 'ventus-grid-engine.diversified-demand.v1';

const HOURS_PER_YEAR = 8760;

function positive(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

function ratio(name, v) {
    positive(name, v);
    if (v > 1) throw new RangeError(
        `${name} must be a fraction in (0, 1], received ${v}. A percentage such as 20 must be passed as 0.2.`);
    return v;
}

function count(name, v) {
    positive(name, v);
    if (!Number.isInteger(v)) throw new RangeError(`${name} must be a whole number, received ${v}`);
    return v;
}

/**
 * After Diversity Maximum Demand for a group of like units.
 *
 *   ADMD = n x P_unit x coincidence
 *
 * The coincidence factor is required and belongs to the group size, not to the
 * appliance — which is why the unit count travels back with the answer.
 */
export function diversifiedDemandKw({ unitCount, perUnitKw, coincidenceFactor }) {
    count('unitCount', unitCount);
    positive('perUnitKw', perUnitKw);
    ratio('coincidenceFactor', coincidenceFactor);
    const unrestricted = unitCount * perUnitKw;
    const value = unrestricted * coincidenceFactor;
    return {
        schema,
        quantity: 'after_diversity_maximum_demand_kw',
        value,
        unit: 'kW',
        from: { unitCount, perUnitKw, coincidenceFactor, unrestrictedKw: unrestricted },
        basis:
            `${unitCount.toLocaleString('en-GB')} units of ${perUnitKw} kW could draw ` +
            `${unrestricted.toLocaleString('en-GB')} kW between them if every one ran at once. At a ` +
            `coincidence factor of ${coincidenceFactor} the group presents ${value.toLocaleString('en-GB', { maximumFractionDigits: 1 })} kW — ` +
            `the peak of the sum, not the sum of the peaks. That factor belongs to a group of THIS ` +
            `size: one quoted for a thousand units will badly under-size ten. Where the network ` +
            `operator publishes a factor for this load class, use theirs.`
    };
}

/**
 * The honest direction: derive the coincidence factor from a measured group
 * peak rather than assuming one.
 */
export function impliedCoincidence({ unitCount, perUnitKw, measuredGroupPeakKw }) {
    count('unitCount', unitCount);
    positive('perUnitKw', perUnitKw);
    positive('measuredGroupPeakKw', measuredGroupPeakKw);
    const unrestricted = unitCount * perUnitKw;
    if (measuredGroupPeakKw > unrestricted) {
        throw new RangeError(
            `measuredGroupPeakKw (${measuredGroupPeakKw}) exceeds the unrestricted total ` +
            `(${unrestricted}); a group cannot draw more than all its units at full rating.`);
    }
    return {
        schema,
        quantity: 'coincidence_factor',
        value: measuredGroupPeakKw / unrestricted,
        unit: 'dimensionless',
        from: { unitCount, perUnitKw, measuredGroupPeakKw, unrestrictedKw: unrestricted },
        basis:
            `Measured, not assumed: a group peak of ${measuredGroupPeakKw} kW against an unrestricted ` +
            `${unrestricted} kW implies this coincidence factor for a group of ${unitCount}. Prefer ` +
            `this direction wherever a measurement exists.`
    };
}

/**
 * Average power over a delivery window. NOT a peak.
 *
 * Energy in a window sets an average across it. The peak inside that window
 * depends on whether the load is managed, and nothing here can tell you.
 */
export function averageOverWindowGw({ annualTwh, windowHoursPerDay }) {
    positive('annualTwh', annualTwh);
    positive('windowHoursPerDay', windowHoursPerDay);
    if (windowHoursPerDay > 24) {
        throw new RangeError(`windowHoursPerDay must be at most 24, received ${windowHoursPerDay}`);
    }
    const windowHoursPerYear = windowHoursPerDay * 365;
    return {
        schema,
        quantity: 'average_power_across_window_gw',
        value: (annualTwh * 1000) / windowHoursPerYear,
        unit: 'GW',
        from: { annualTwh, windowHoursPerDay, windowHoursPerYear, hoursPerYear: HOURS_PER_YEAR },
        basis:
            `${annualTwh} TWh delivered inside a ${windowHoursPerDay}-hour daily window averages the ` +
            `power stated across that window. This is an AVERAGE, not a peak: the peak inside the ` +
            `window depends on whether the load is managed, and this figure cannot tell you. Quoting ` +
            `it as a peak is how a flexibility assumption gets smuggled into a network study.`
    };
}

/**
 * Annual energy for a population of like units.
 *
 *   E = n x e_unit
 *
 * The paper's ten million vehicles at 2,500 kWh each.
 */
export function populationEnergyTwh({ unitCount, perUnitKwhPerYear }) {
    count('unitCount', unitCount);
    positive('perUnitKwhPerYear', perUnitKwhPerYear);
    const kwh = unitCount * perUnitKwhPerYear;
    return {
        schema,
        quantity: 'population_annual_energy_twh',
        value: kwh / 1e9,
        unit: 'TWh',
        from: { unitCount, perUnitKwhPerYear, totalKwh: kwh },
        basis:
            `${unitCount.toLocaleString('en-GB')} units at ${perUnitKwhPerYear.toLocaleString('en-GB')} kWh ` +
            `a year. Annual energy only — it says nothing about when any of it is drawn.`
    };
}

export const NOT_COMPUTED = Object.freeze({
    coincidenceFromFirstPrinciples:
        'There is no closed form for a coincidence factor. It comes from measurement of a group of that size and load class, or from the network operator\'s published figure. This module requires it as an input for that reason.',
    peakInsideAWindow:
        'Energy delivered in a window fixes the average across it, never the peak inside it. The peak depends on whether the load is managed, which is a control decision, not arithmetic.',
    whetherTheGroupFits:
        'Whether a diversified demand can be connected is a firm-capacity and security question, and the binding constraint is often upstream of the transformer entirely.',
    futureCoincidence:
        'Coincidence factors measured on today\'s appliances do not survive a change in control: smart charging, time-of-use tariffs and vehicle-to-grid all move the factor, in both directions.'
});
