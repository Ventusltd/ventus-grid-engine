/**
 * Module: interconnector-economics
 *
 * APPLIED ENGINEERING. What an interconnector does, and what a price
 * difference across it is worth — in text, deliberately never as a drawing.
 *
 * WHY THERE IS NO GEOMETRY HERE, AND WHY THAT IS A DECISION NOT A GAP.
 * Subsea cable routes are, in practice, licensed data. TeleGeography's route
 * geometry is the usual source and it is not ours to redraw, and neither NESO
 * nor National Grid publishes a route the estate could carry instead. So this
 * module holds no coordinates, exports no geometry, and the estate's map does
 * not draw these cables. That is a licensing position, stated once, in the
 * place a reader will look — not a missing feature somebody helpfully adds
 * later from a screenshot. If a route is ever published under terms that allow
 * it, this refusal is the thing to change, deliberately.
 *
 * Everything an interconnector actually needs for analysis — the link, its
 * countries, its capacity, its status, its BMRS code, and what the price
 * spread across it means — is text and numbers, and text and numbers are here.
 *
 * WHAT AN INTERCONNECTOR IS, ELECTRICALLY AND ECONOMICALLY.
 * It is an edge between two systems, not a generator. It produces nothing. It
 * moves energy from wherever it is cheaper to wherever it is dearer, because
 * that is what the market instructs it to do, and the direction therefore
 * follows the price spread rather than any physical preference. A link at full
 * capacity is not "generating" — it is importing, and the exporting system's
 * plant is doing the generating.
 *
 * CONGESTION RENT, AND WHY IT IS THE HONEST NUMBER.
 * The economic value created by a link over a period is the energy it moves
 * multiplied by the price difference it moves that energy across:
 *
 *     rent = capacity x utilisation x hours x |spread|
 *
 * That is the gross value of the arbitrage, and it is what an interconnector
 * earns before costs, before losses and before any capacity-market or cap-and-
 * floor arrangement. It is not profit and this module does not call it profit.
 *
 * WHAT IT REFUSES.
 * It does not forecast a price, and it will not take a forecast as an input
 * dressed up as a fact — every price is supplied by the caller and travels back
 * with the answer so nobody can quote the output without the assumption. It
 * does not model losses, availability outages, cap-and-floor regimes, or the
 * flow the market actually schedules, which follows day-ahead coupling and not
 * a single spread. And it draws nothing.
 *
 * Depends on: nothing. Pure arithmetic over caller-supplied prices and a
 * caller-supplied link list.
 *
 * Schema: ventus-grid-engine.interconnector-economics.v1
 */

export const schema = 'ventus-grid-engine.interconnector-economics.v1';

function finite(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    return v;
}

function positive(name, v) {
    finite(name, v);
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

function ratio(name, v) {
    positive(name, v);
    if (v > 1) throw new RangeError(
        `${name} must be a fraction in (0, 1], received ${v}. A percentage such as 70 must be passed as 0.7.`);
    return v;
}

/**
 * Which way the energy goes, from two prices the caller states.
 *
 * Both prices travel back with the answer. A direction without the prices that
 * produced it is an opinion.
 */
export function flowDirection({ gbPriceGbpPerMwh, neighbourPriceGbpPerMwh }) {
    finite('gbPriceGbpPerMwh', gbPriceGbpPerMwh);
    finite('neighbourPriceGbpPerMwh', neighbourPriceGbpPerMwh);
    const spread = gbPriceGbpPerMwh - neighbourPriceGbpPerMwh;
    const direction = spread > 0 ? 'import to GB' : spread < 0 ? 'export from GB' : 'no commercial incentive';
    return {
        schema,
        quantity: 'commercial_flow_direction',
        direction,
        spreadGbpPerMwh: Math.abs(spread),
        signedSpreadGbpPerMwh: spread,
        from: { gbPriceGbpPerMwh, neighbourPriceGbpPerMwh },
        basis: spread === 0
            ? `Both systems are at £${gbPriceGbpPerMwh}/MWh. With no spread there is no commercial ` +
              `reason to flow either way, though a link may still flow for system reasons this ` +
              `module does not model.`
            : `GB at £${gbPriceGbpPerMwh}/MWh against £${neighbourPriceGbpPerMwh}/MWh gives a spread ` +
              `of £${Math.abs(spread).toFixed(2)}/MWh, so energy moves ${direction === 'import to GB' ? 'INTO' : 'OUT OF'} ` +
              `GB — from the cheaper system to the dearer one. An interconnector generates nothing; ` +
              `it moves what the exporting system's plant produced. Real scheduling follows day-ahead ` +
              `market coupling, not a single spread.`
    };
}

/**
 * Energy moved over a period at a stated utilisation.
 */
export function energyTransferredGwh({ capacityGw, hours, utilisation }) {
    positive('capacityGw', capacityGw);
    positive('hours', hours);
    ratio('utilisation', utilisation);
    return {
        schema,
        quantity: 'energy_transferred_gwh',
        value: capacityGw * hours * utilisation,
        unit: 'GWh',
        from: { capacityGw, hours, utilisation },
        basis:
            `${capacityGw} GW at ${(utilisation * 100).toFixed(0)}% utilisation over ${hours} hours. ` +
            `Utilisation is stated by the caller, never assumed: a link's actual load factor depends ` +
            `on the spread persisting, on availability, and on what the coupled markets schedule.`
    };
}

/**
 * Gross congestion rent: the value of moving energy across a price difference.
 *
 * Before losses, before costs, before any cap-and-floor arrangement. Not
 * profit, and this module will not call it profit.
 */
export function congestionRentGbp({ capacityGw, hours, utilisation, spreadGbpPerMwh }) {
    const energy = energyTransferredGwh({ capacityGw, hours, utilisation });
    positive('spreadGbpPerMwh', spreadGbpPerMwh);
    const mwh = energy.value * 1000;
    return {
        schema,
        quantity: 'gross_congestion_rent_gbp',
        value: mwh * spreadGbpPerMwh,
        unit: 'GBP',
        energyGwh: energy.value,
        from: { capacityGw, hours, utilisation, spreadGbpPerMwh },
        basis:
            `${energy.value.toFixed(1)} GWh moved across a £${spreadGbpPerMwh}/MWh spread. This is the ` +
            `GROSS value of the arbitrage: before transmission losses, before availability outages, ` +
            `before operating cost, and before any cap-and-floor regime. It is not profit and nothing ` +
            `here calls it profit.`
    };
}

/**
 * Capacity totals across a fleet of links, split by status.
 *
 * The distinction that matters: a link with a BMRS code is wired and its flow
 * is observable; one without a code is a project, and its capacity is a plan.
 */
export function fleetCapacity({ links }) {
    if (!Array.isArray(links) || links.length === 0) {
        throw new TypeError('links must be a non-empty array');
    }
    const byStatus = {};
    const byCountry = {};
    let observable = 0, planned = 0;
    links.forEach((l, i) => {
        positive(`links[${i}].capacityGw`, l.capacityGw);
        if (typeof l.status !== 'string' || !l.status) {
            throw new TypeError(`links[${i}].status must be a non-empty string`);
        }
        byStatus[l.status] = (byStatus[l.status] || 0) + l.capacityGw;
        byCountry[l.country] = (byCountry[l.country] || 0) + l.capacityGw;
        if (l.bmrsCode) observable += l.capacityGw; else planned += l.capacityGw;
    });
    const total = links.reduce((a, b) => a + b.capacityGw, 0);
    return {
        schema,
        quantity: 'fleet_capacity_gw',
        value: total,
        unit: 'GW',
        byStatus,
        byCountry,
        observableGw: observable,
        unobservableGw: planned,
        linkCount: links.length,
        basis:
            `${links.length} links totalling ${total.toFixed(2)} GW. ${observable.toFixed(2)} GW carries ` +
            `a BMRS code and its flow is therefore observable in published data; ${planned.toFixed(2)} GW ` +
            `does not, and its capacity is a plan rather than a measurement. Capacity is not energy: a ` +
            `link at 2 GW moves nothing when the spread is against it.`
    };
}

/**
 * What a link's transfer is worth as a share of a stated GB demand.
 *
 * Deliberately expressed against a demand the caller supplies, because "X% of
 * GB demand" is meaningless without saying which demand and when.
 */
export function shareOfDemand({ transferGw, gbDemandGw }) {
    positive('transferGw', transferGw);
    positive('gbDemandGw', gbDemandGw);
    return {
        schema,
        quantity: 'share_of_stated_demand',
        value: transferGw / gbDemandGw,
        unit: 'dimensionless',
        percent: (transferGw / gbDemandGw) * 100,
        from: { transferGw, gbDemandGw },
        basis:
            `${transferGw} GW against a stated GB demand of ${gbDemandGw} GW is ` +
            `${((transferGw / gbDemandGw) * 100).toFixed(1)}%. The demand figure is yours: a share of ` +
            `"GB demand" means nothing without saying which demand and at what moment, and the same ` +
            `link is a very different share of a summer minimum and a winter peak.`
    };
}

export const NOT_COMPUTED = Object.freeze({
    cableGeometry:
        'This module holds no route geometry and the estate does not draw subsea cables. Route data is licensed — TeleGeography is the usual source and it is not ours to redraw — and neither NESO nor National Grid publishes a route the estate could carry instead. This is a licensing position, not a missing feature. If a route is ever published under terms that permit it, change this refusal deliberately rather than adding a drawing from a screenshot.',
    priceForecast:
        'No price is forecast here. Every price is supplied by the caller and travels back with the answer, so an output cannot be quoted without the assumption that produced it.',
    scheduledFlow:
        'What actually flows follows day-ahead market coupling, intraday trading, availability and system constraints — not a single price spread. This arithmetic describes the incentive, not the schedule.',
    profit:
        'Congestion rent is gross value before losses, outages, operating cost and any cap-and-floor regime. It is not profit and is never labelled as profit here.',
    lossesAndAvailability:
        'Converter and cable losses, planned outages and forced outages all reduce delivered energy. They are the operator\'s figures for a specific link and are not modelled.'
});
