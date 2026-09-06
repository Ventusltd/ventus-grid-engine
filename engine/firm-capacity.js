/**
 * Module: firm-capacity
 *
 * APPLIED ENGINEERING. What a substation can carry when one unit is out.
 *
 * WHY THIS IS THE FIRST QUESTION A PLANNER ASKS.
 * A substation's nameplate is the sum of its transformers. Its FIRM capacity
 * is what remains when the largest single unit is unavailable, because a
 * network planned to N-1 must survive the loss of any one element without
 * shedding load. Two 30 MVA transformers are a 60 MVA site with 30 MVA of firm
 * capacity. A site loaded to 42 MVA is comfortable on nameplate and already
 * beyond firm — it is running on the assumption that nothing breaks. That gap
 * between installed and firm is where most connection refusals actually live,
 * and it is invisible if you only look at the total.
 *
 * WHY MVA AND NOT MW.
 * Transformers and cables are limited by current, and current is set by
 * apparent power, not real power. A 100 MW load at 0.95 power factor draws
 * 105.3 MVA and it is the 105.3 that the plant has to carry. Sizing on MW
 * silently under-counts by the reciprocal of the power factor — 5% here, more
 * for a poorer load. Every rating in this module is therefore in MVA, and
 * converting from MW requires a power factor the caller states.
 *
 * N-1 AND WHAT IT IS NOT.
 * The rule implemented here is the ordinary planning one: firm capacity is the
 * total less the largest single unit. That is what a two- or three-transformer
 * distribution substation means by firm. It is NOT a substitute for a security
 * study: real security standards (ER P2/7 in GB) set the required restoration
 * time and permitted interruption by group demand, allow for transfer capacity
 * from adjacent sites, and count generation and storage contributions under
 * stated conditions. A site can pass this arithmetic and fail P2/7, and it can
 * fail this arithmetic and still be compliant because load transfers away.
 * The functions say so in their basis text rather than leaving the caller to
 * assume otherwise.
 *
 * CYCLIC AND EMERGENCY RATINGS ARE NOT MODELLED, DELIBERATELY.
 * A transformer will carry more than its nameplate for a period, set by its
 * thermal time constant, its oil and winding temperatures, the ambient, and
 * how much life the owner will spend. That is a real and routinely used margin
 * — and it belongs to the owner's asset policy and IEC 60076-7 loading guide,
 * not to a screening tool. Passing one nameplate figure in and getting a
 * bigger number out would misrepresent an engineering judgement as arithmetic.
 *
 * WHAT THIS MODULE REFUSES.
 * There is no function returning spare capacity, headroom, or whether a
 * connection can be made. Utilisation against a rating the CALLER supplies is
 * arithmetic and is offered. Inferring availability from it is not, because
 * the binding constraint is frequently somewhere else entirely — the upstream
 * circuit, the fault level at the busbar, a voltage step, or a commercial
 * position in a queue. The proof asserts these functions are absent.
 *
 * Depends on: nothing. Pure arithmetic on caller-supplied ratings.
 *
 * Schema: ventus-grid-engine.firm-capacity.v1
 */

export const schema = 'ventus-grid-engine.firm-capacity.v1';

function requirePositive(name, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number, received ${value === null ? 'null' : typeof value}`);
    }
    if (value <= 0) throw new RangeError(`${name} must be greater than zero, received ${value}`);
    return value;
}

function requireRatio(name, value) {
    requirePositive(name, value);
    if (value > 1) {
        throw new RangeError(
            `${name} must be a fraction in (0, 1], received ${value}. A percentage such as 95 must be passed as 0.95.`
        );
    }
    return value;
}

function requireUnits(units) {
    if (!Array.isArray(units) || units.length === 0) {
        throw new TypeError('units must be a non-empty array of transformer ratings in MVA');
    }
    units.forEach((u, i) => requirePositive(`units[${i}]`, u));
    return units;
}

/**
 * Apparent power from real power and a stated power factor.
 *
 *   S (MVA) = P (MW) / pf
 *
 * The conversion plant is actually rated for.
 */
export function apparentPowerMva({ mw, powerFactor }) {
    requirePositive('mw', mw);
    requireRatio('powerFactor', powerFactor);
    return {
        schema,
        quantity: 'apparent_power_mva',
        value: mw / powerFactor,
        unit: 'MVA',
        from: { mw, powerFactor },
        basis:
            `Plant is limited by current, and current follows apparent power: ${mw} MW at a power ` +
            `factor of ${powerFactor} draws the MVA stated. Sizing on MW alone under-counts by ` +
            `1/pf — here that is ${(((1 / powerFactor) - 1) * 100).toFixed(1)}%.`
    };
}

/**
 * Installed and firm capacity for a set of transformers.
 *
 * Firm is the total less the largest single unit — the ordinary N-1 planning
 * rule. A single-transformer site has zero firm capacity, and that is the
 * correct and important answer, not an error.
 */
export function firmCapacityMva({ units }) {
    requireUnits(units);
    const installed = units.reduce((a, b) => a + b, 0);
    const largest = Math.max(...units);
    const firm = installed - largest;
    return {
        schema,
        quantity: 'firm_capacity_mva',
        value: firm,
        unit: 'MVA',
        from: { units: [...units], installedMva: installed, largestUnitMva: largest, unitCount: units.length },
        basis: units.length === 1
            ? `A single ${largest} MVA transformer has NO firm capacity: losing it loses the site. ` +
              `Installed capacity is ${installed} MVA and firm capacity is zero. That is the answer, not a fault.`
            : `N-1: ${units.length} units totalling ${installed} MVA, less the largest single unit ` +
              `(${largest} MVA), leaves ${firm} MVA with any one unit out. This is the ordinary ` +
              `planning rule, not a security study — ER P2/7 also counts transfer capacity from ` +
              `adjacent sites and permits interruption by group demand, so a site can pass this and ` +
              `fail that, or fail this and remain compliant because load transfers away.`
    };
}

/**
 * Utilisation of a demand against a rating the caller supplies.
 *
 * Arithmetic on two stated numbers. Deliberately NOT called headroom: see the
 * header, and the refusal text returned alongside.
 */
export function utilisationAgainstRating({ demandMva, ratingMva }) {
    requirePositive('demandMva', demandMva);
    requirePositive('ratingMva', ratingMva);
    const ratio = demandMva / ratingMva;
    return {
        schema,
        quantity: 'utilisation_of_stated_rating',
        value: ratio,
        unit: 'dimensionless',
        percent: ratio * 100,
        exceedsRating: ratio > 1,
        from: { demandMva, ratingMva },
        basis:
            `${demandMva} MVA against a stated rating of ${ratingMva} MVA is ` +
            `${(ratio * 100).toFixed(1)}% of that rating` +
            (ratio > 1
                ? `, which EXCEEDS it by ${(demandMva - ratingMva).toFixed(2)} MVA.`
                : `.`) +
            ` This is a ratio of two figures you supplied. It is not spare capacity and not a ` +
            `connection assessment: the binding constraint is frequently elsewhere — the upstream ` +
            `circuit, the fault level at the busbar, a voltage step, or a position in a queue.`
    };
}

/**
 * The N-1 question in the form a planner actually asks it: does this demand
 * still sit inside firm capacity, and by how much does it miss if not?
 */
export function assessAgainstFirm({ units, demandMva }) {
    const firm = firmCapacityMva({ units });
    requirePositive('demandMva', demandMva);
    const installed = firm.from.installedMva;
    const withinFirm = demandMva <= firm.value;
    const withinInstalled = demandMva <= installed;
    return {
        schema,
        quantity: 'n_minus_one_assessment',
        withinFirm,
        withinInstalled,
        firmMva: firm.value,
        installedMva: installed,
        demandMva,
        shortfallMva: withinFirm ? 0 : demandMva - firm.value,
        utilisationOfFirm: demandMva / firm.value,
        utilisationOfInstalled: demandMva / installed,
        basis: withinFirm
            ? `${demandMva} MVA sits inside the ${firm.value} MVA firm capacity: the site carries ` +
              `this demand with any one unit out.`
            : withinInstalled
                ? `${demandMva} MVA is inside the ${installed} MVA installed but BEYOND the ` +
                  `${firm.value} MVA firm capacity, short by ${(demandMva - firm.value).toFixed(2)} MVA. ` +
                  `The site carries this demand only while nothing is out. This is the gap that most ` +
                  `often decides a connection, and it is invisible if you look only at the total.`
                : `${demandMva} MVA exceeds even the ${installed} MVA installed capacity.`
    };
}

export const NOT_COMPUTED = Object.freeze({
    spareCapacity:
        'Spare capacity is the network operator\'s figure, from its model, its running arrangement and its outage plan. A rating minus a demand is not it.',
    connectionAvailability:
        'Whether a connection can be made is answered by an application and an offer. The binding constraint is often the upstream circuit, the fault level or a queue position, none of which appear in this arithmetic.',
    cyclicAndEmergencyRating:
        'A transformer carries more than nameplate for a period, set by its thermal time constants, the ambient and how much insulation life the owner will spend. That is the owner\'s asset policy under IEC 60076-7, not a screening calculation.',
    securityCompliance:
        'ER P2/7 compliance depends on group demand, permitted interruption, restoration time and transfer capacity from adjacent sites. Passing the N-1 arithmetic here neither demonstrates nor refutes it.'
});
