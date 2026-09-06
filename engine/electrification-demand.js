/**
 * Module: electrification-demand
 *
 * APPLIED ENGINEERING. Every function here is arithmetic a grid engineer
 * would do on paper, made exact, named, and given a unit. Nothing here is a
 * forecast, and nothing here decides anything.
 *
 * WHY THIS MODULE EXISTS.
 * The electrification paper (globalgrid2050.com/papers/202609060203-electrification/)
 * sets out how annual energy, average power, peak demand, capacity factor and
 * displaced fuel relate to one another. Written down, that arithmetic is
 * unambiguous. Repeated from memory into a table, it is where the errors get
 * in: a peak-to-average ratio measured against a rounded reference, a load
 * factor quietly reused across two different systems, a capacity factor
 * applied to peak instead of to energy. This module is the arithmetic, once,
 * with the boundary conditions attached to it.
 *
 * THE FOUR RELATIONS, AND WHAT EACH ONE IS ACTUALLY SAYING.
 *
 * 1. Average power. P_avg (GW) = E (TWh) / 8.76. There are 8,760 hours in a
 *    non-leap year and 1 TWh = 1,000 GWh, so TWh/8.76 gives GW directly. This
 *    is a definition, not a model: it is exact, and it is the only quantity
 *    here that carries no assumption. It is also the least useful number on
 *    its own, because no network is ever sized for its average.
 *
 * 2. Peak from load factor. P_peak = P_avg / LF. The load factor is the
 *    ratio of average to peak over a stated period, so this is the definition
 *    rearranged. The assumption is entirely in the choice of LF, which is why
 *    this function REQUIRES the caller to state it rather than defaulting to
 *    one. GB's present system load factor and a deeply electrified system's
 *    load factor are different numbers, and a system with heat pumps and one
 *    with smart-charged EVs are different again — heat drives a winter peak
 *    upward while managed charging fills a trough. There is no single correct
 *    value, so this module supplies none.
 *
 * 3. Nameplate from capacity factor. C (GW) = E (TWh) / (8.76 x CF). Note
 *    what this is NOT: it is not a statement about meeting peak, about firm
 *    capacity, or about adequacy. It answers exactly one question — how much
 *    nameplate, at a stated annual capacity factor, produces this much annual
 *    energy. A system that satisfies this equation may still fail on a still,
 *    cold evening, which is why adequacy is a chronological study and not a
 *    division.
 *
 * 4. Electricity for displaced fuel.
 *      E_elec = E_fuel x eta_old / eta_new
 *    Burning fuel to make heat or motion wastes most of it; doing the same
 *    work electrically wastes much less, and a heat pump moves more heat than
 *    the energy it consumes. So displaced fuel energy does NOT map one-for-one
 *    onto electricity, and the ratio is not a constant — it is roughly 0.33
 *    for a gas boiler replaced by a COP 3 heat pump, roughly 0.31 for a petrol
 *    car replaced by an EV, and roughly 0.95 for industrial heat where both
 *    routes are already efficient. The single most common error in
 *    electrification arithmetic is skipping this step and treating primary
 *    energy as future electrical load. This function exists to make that
 *    error impossible to make silently.
 *
 * WHAT THIS MODULE REFUSES TO DO, AND WHY THE PROOF CHECKS THE REFUSAL.
 * There is no function here that returns headroom, spare capacity, connection
 * availability, or a per-site uplift. The paper is explicit that a national
 * load factor cannot establish utilisation at any particular transformer, and
 * that scenario arithmetic is not evidence of connection headroom. Those are
 * not gaps to be filled later by a keener version of this file: computing
 * them needs the network operator's model, its running arrangement and its
 * outage plan, none of which are public. The proof asserts these functions are
 * ABSENT, so that their absence is a tested property rather than an oversight
 * somebody helpfully corrects.
 *
 * Depends on: nothing. Pure arithmetic on caller-supplied scalars. No network,
 * no DOM, no data files, no clock.
 *
 * Schema: ventus-grid-engine.electrification-demand.v1
 */

export const schema = 'ventus-grid-engine.electrification-demand.v1';

/* 8,760 hours in a non-leap year, expressed so that TWh / HOURS_TWH_TO_GW is
   GW. Stated as a constant because a magic 8.76 in four functions is four
   chances to type 8.67. A leap year is 8,784 h; the 0.27% difference is far
   below the uncertainty in any scenario this module will be handed, and using
   one figure keeps two calls comparable. Where that 0.27% would matter, the
   quantity being computed is not an annual average. */
export const HOURS_PER_YEAR = 8760;
export const HOURS_TWH_TO_GW = HOURS_PER_YEAR / 1000;

/* A ratio that must be a fraction of one. Load factors, capacity factors,
   coincidence factors and efficiencies all live in (0, 1]; a caller passing
   40 for "40%" is the error this catches, and it catches it loudly rather
   than returning a number 100 times too small. */
function requireRatio(name, value, { allowAboveOne = false } = {}) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number, received ${describe(value)}`);
    }
    if (value <= 0) {
        throw new RangeError(`${name} must be greater than zero, received ${value}`);
    }
    if (!allowAboveOne && value > 1) {
        throw new RangeError(
            `${name} must be a fraction in (0, 1], received ${value}. ` +
            `A percentage such as 40 must be passed as 0.4.`
        );
    }
    return value;
}

function requirePositive(name, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number, received ${describe(value)}`);
    }
    if (value <= 0) {
        throw new RangeError(`${name} must be greater than zero, received ${value}`);
    }
    return value;
}

function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array';
    return typeof value;
}

/**
 * Average power over a year, from annual energy.
 *
 * Exact by definition. Returns GW for TWh in.
 */
export function averagePowerGw({ annualTwh }) {
    requirePositive('annualTwh', annualTwh);
    return {
        schema,
        quantity: 'average_power_gw',
        value: annualTwh / HOURS_TWH_TO_GW,
        unit: 'GW',
        from: { annualTwh, hoursPerYear: HOURS_PER_YEAR },
        basis: 'Definition: mean power is annual energy divided by the hours in the year. Exact; carries no assumption.'
    };
}

/**
 * Peak demand implied by an average and a STATED load factor.
 *
 * The load factor is the assumption. It is required, never defaulted, and it
 * is returned alongside the answer so a figure cannot travel without it.
 */
export function peakFromLoadFactorGw({ averageGw, loadFactor }) {
    requirePositive('averageGw', averageGw);
    requireRatio('loadFactor', loadFactor);
    return {
        schema,
        quantity: 'peak_demand_gw',
        value: averageGw / loadFactor,
        unit: 'GW',
        from: { averageGw, loadFactor },
        basis:
            `Definition rearranged: peak = average / load factor, at a load factor of ${loadFactor} ` +
            `supplied by the caller. The load factor is the whole assumption; this figure is only ` +
            `as good as it. It is a sensitivity, not a forecast, and it is not a published peak.`
    };
}

/**
 * The load factor implied by an average and a peak that are both known.
 *
 * The inverse of the above, and the honest direction of travel: where a peak
 * is published, derive the load factor from it rather than assuming one.
 */
export function loadFactorFromPeak({ averageGw, peakGw }) {
    requirePositive('averageGw', averageGw);
    requirePositive('peakGw', peakGw);
    if (peakGw < averageGw) {
        throw new RangeError(
            `peakGw (${peakGw}) is below averageGw (${averageGw}); a peak cannot be lower than the mean it contains.`
        );
    }
    return {
        schema,
        quantity: 'load_factor',
        value: averageGw / peakGw,
        unit: 'dimensionless',
        from: { averageGw, peakGw },
        basis: 'Measured from a published peak rather than assumed. Prefer this direction wherever a peak is published.'
    };
}

/**
 * Nameplate capacity that yields a stated annual energy at a stated annual
 * capacity factor.
 *
 * Answers an energy question only. Says nothing about peak, firm capacity or
 * adequacy — see the header.
 */
export function nameplateFromCapacityFactorGw({ annualTwh, capacityFactor }) {
    requirePositive('annualTwh', annualTwh);
    requireRatio('capacityFactor', capacityFactor);
    return {
        schema,
        quantity: 'nameplate_capacity_gw',
        value: annualTwh / (HOURS_TWH_TO_GW * capacityFactor),
        unit: 'GW',
        from: { annualTwh, capacityFactor },
        basis:
            `Energy equivalence only: the nameplate that produces ${annualTwh} TWh a year at an annual ` +
            `capacity factor of ${capacityFactor}. It does not follow that this capacity meets peak, ` +
            `provides firm capacity, or satisfies adequacy — those are chronological studies.`
    };
}

/**
 * Electricity required to do work presently done by burning fuel.
 *
 *   E_elec = E_fuel x eta_old / eta_new
 *
 * eta_new may exceed 1 for a heat pump, which moves heat rather than making
 * it — a COP of 3 delivers three units of heat per unit of electricity. That
 * is the one ratio here allowed above one, and it is allowed deliberately.
 */
export function electricityForDisplacedFuelTwh({ fuelTwh, oldEfficiency, newPerformance }) {
    requirePositive('fuelTwh', fuelTwh);
    requireRatio('oldEfficiency', oldEfficiency);
    requireRatio('newPerformance', newPerformance, { allowAboveOne: true });
    const usefulTwh = fuelTwh * oldEfficiency;
    return {
        schema,
        quantity: 'electricity_required_twh',
        value: usefulTwh / newPerformance,
        unit: 'TWh',
        from: { fuelTwh, oldEfficiency, newPerformance, usefulOutputTwh: usefulTwh },
        basis:
            `Useful output is conserved, not fuel energy: ${fuelTwh} TWh of fuel at ${oldEfficiency} ` +
            `delivers ${usefulTwh.toFixed(3)} TWh of useful output, which an electrical route of ` +
            `performance ${newPerformance} supplies from the electricity stated. Displaced fuel energy ` +
            `never maps one-for-one onto electricity.`
    };
}

/* The refusals. Named here so a reader looking for them finds the reason
   rather than an empty space, and so the proof can assert that no function of
   these names is exported. */
export const NOT_COMPUTED = Object.freeze({
    headroom:
        'Spare capacity at a site is the network operator\'s figure, from its model, running arrangement and outage plan. None of those are public.',
    connectionAvailability:
        'Whether a connection can be made is answered by an application and an offer, never by scenario arithmetic.',
    perSiteUplift:
        'There is no defensible rule that every site receives the same percentage uplift; national growth does not distribute evenly.',
    adequacy:
        'Security of supply is a chronological study over weather years and outage scenarios. An annual total cannot demonstrate it.'
});
