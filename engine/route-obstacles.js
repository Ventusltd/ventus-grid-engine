/**
 * Module: route-obstacles
 *
 * APPLIED ENGINEERING. What actually gets in the way of a cable route, and
 * what each obstacle costs in length and in method.
 *
 * WHY THIS MODULE EXISTS — A REAL DEFECT, NAMED.
 * `corridor-estimate.js` turns a straight-line kilometre into a highway-
 * corridor screening estimate by multiplying by 1.245. It is well calibrated
 * on 95 GB cable circuits and it stays exactly as it is: the straight line
 * remains the first pass and this module does not touch it.
 *
 * But `forCable()` takes ONE SCALAR KILOMETRE. It has no coordinates. It
 * therefore cannot know what the line crossed, and a land/sea test inside it
 * is structurally impossible — every one of its checks operates on the same
 * scalar, so none of them could ever go red for a route across open water.
 * The measured consequence: South Antrim to the Western HVDC converter is
 * 142.21 km of mostly Irish Sea, and was printed as a 177.05 km "highway
 * corridor" — a road route that does not exist, stated with the confidence of
 * a calibrated number.
 *
 * This module is where the coordinates and the crossings live. It does not
 * replace the corridor factor; it decides whether that factor is applicable at
 * all, and adds what the crossings cost.
 *
 * THE CROSSINGS THAT ACTUALLY DECIDE A ROUTE.
 * A motorway, a railway, a navigable river, a canal, a trunk road: each is an
 * asset with an owner, a crossing agreement and a method constraint. You do
 * not open-cut a live motorway or a running railway — those are trenchless
 * crossings, horizontal directional drilling or auger bore, with launch and
 * reception pits set back from the asset boundary. So the drill is always
 * substantially longer than the obstacle is wide, and the setback is the
 * dominant term for a narrow obstacle: a 30 m motorway is not a 30 m drill.
 *
 * WHY WIDTHS AND SETBACKS ARE INPUTS AND NOT CONSTANTS.
 * Every network owner publishes its own minimum cover, setback and separation
 * requirements, and they differ — between Network Rail and a highways
 * authority, and between one utility's plant and another's. Inventing a
 * default here would produce a plausible number that no owner would accept.
 * The module therefore takes the width and the setback from the caller, and
 * refuses a crossing that declares neither.
 *
 * WHAT IT REFUSES.
 * It will not route around anything: there is no pathfinder here, because a
 * real one needs the obstacle geometry, land ownership, ground conditions and
 * consenting constraints, none of which are in this module. It will not price
 * a crossing. It will not tell you a crossing will be permitted. And it
 * refuses outright to apply a highway-corridor factor to a route that crosses
 * open water, because there is no highway.
 *
 * Depends on: nothing. Pure arithmetic and classification over caller-declared
 * crossings. The straight-line distance is supplied by the caller, from
 * v9-geodesy.js distanceKm or geo-core.js haversine, exactly as before.
 *
 * Schema: ventus-grid-engine.route-obstacles.v1
 */

export const schema = 'ventus-grid-engine.route-obstacles.v1';

/* The obstacle classes a GB cable route actually meets, and whether the
   crossing can be open-cut. `trenchless: true` means the asset cannot be
   opened: the crossing is drilled or bored beneath it. `blocksCorridor: true`
   means a highway-corridor factor is not applicable to a route crossing it at
   all — there is no road that goes there. */
export const OBSTACLES = Object.freeze({
    motorway: { label: 'Motorway', trenchless: true, blocksCorridor: false,
        why: 'A live motorway cannot be open-cut. Crossing is trenchless, under a highways authority agreement, with pits set back beyond the boundary fence.' },
    trunk_road: { label: 'Trunk road', trenchless: true, blocksCorridor: false,
        why: 'Strategic road network. Trenchless in practice; a lane closure for open-cut is rarely permitted and never assumed at screening.' },
    minor_road: { label: 'Minor road', trenchless: false, blocksCorridor: false,
        why: 'Open-cut with traffic management is normal, subject to the street authority\'s permit.' },
    railway: { label: 'Railway', trenchless: true, blocksCorridor: false,
        why: 'A running railway cannot be open-cut. Network Rail asset protection sets the method, the cover and the setback, and its own approval timescale usually governs the programme.' },
    navigable_river: { label: 'Navigable river', trenchless: true, blocksCorridor: false,
        why: 'Trenchless beneath the bed. The navigation authority and the environmental regulator both have a say, and the drill must clear the deepest scour, not the current bed level.' },
    canal: { label: 'Canal', trenchless: true, blocksCorridor: false,
        why: 'Trenchless beneath the invert, under the navigation authority\'s agreement.' },
    watercourse: { label: 'Minor watercourse', trenchless: false, blocksCorridor: false,
        why: 'Open-cut is often possible in a dry season with consent, but the regulator may still require trenchless.' },
    open_water: { label: 'Open water / sea', trenchless: true, blocksCorridor: true,
        why: 'This is a marine cable, not a buried land route. A highway-corridor factor calibrated on road-following circuits does not describe it, and no land estimate is offered.' },
    protected_habitat: { label: 'Protected habitat', trenchless: true, blocksCorridor: false,
        why: 'Trenchless to avoid surface disturbance where consent requires it. Whether it is permitted at all is a consenting question, not an engineering one.' }
});

function positive(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

/**
 * Length of one trenchless crossing.
 *
 *   L = width + 2 x setback   (the straight-line span between pits)
 *
 * The setback dominates for a narrow obstacle, which is exactly why a drill is
 * never the width of the thing it passes under. A real drill is longer again
 * because it dips: the entry and exit angles and the required depth add a
 * curve the caller may supply as `depthM`.
 */
export function crossingLengthM({ widthM, setbackM, depthM = 0 }) {
    positive('widthM', widthM);
    positive('setbackM', setbackM);
    if (typeof depthM !== 'number' || !Number.isFinite(depthM) || depthM < 0) {
        throw new TypeError(`depthM must be a finite number of zero or more, received ${depthM}`);
    }
    const span = widthM + 2 * setbackM;
    /* Pythagorean allowance for the dip: the bore runs from surface down to
       depth and back. Approximate, stated as approximate, and zero when no
       depth is declared. */
    const withDip = depthM > 0 ? Math.hypot(span / 2, depthM) * 2 : span;
    return {
        schema,
        quantity: 'crossing_length_m',
        value: withDip,
        unit: 'm',
        spanM: span,
        from: { widthM, setbackM, depthM },
        basis:
            `${widthM} m of obstacle plus ${setbackM} m of setback on each side gives a ${span} m span ` +
            `between pits` +
            (depthM > 0
                ? `, and running to ${depthM} m depth and back adds a dip, giving ${withDip.toFixed(1)} m of bore. `
                : `. `) +
            `The setback dominates for a narrow obstacle: a drill is never the width of the thing it ` +
            `passes under. Widths, setbacks and cover are the asset owner's requirements and differ ` +
            `between owners, which is why they are inputs here and not constants.`
    };
}

/**
 * Classify and total a set of declared crossings.
 *
 * Returns the trenchless schedule, the open-cut schedule, the added length,
 * and — decisively — whether any crossing invalidates a highway-corridor
 * estimate for this route.
 */
export function crossingSchedule({ crossings }) {
    if (!Array.isArray(crossings)) {
        throw new TypeError('crossings must be an array, empty if the route crosses nothing');
    }
    const items = crossings.map((c, i) => {
        const spec = OBSTACLES[c.type];
        if (!spec) {
            throw new RangeError(
                `crossings[${i}].type "${c.type}" is not a known obstacle. Known: ${Object.keys(OBSTACLES).join(', ')}`);
        }
        const count = c.count === undefined ? 1 : c.count;
        if (!Number.isInteger(count) || count <= 0) {
            throw new RangeError(`crossings[${i}].count must be a whole number greater than zero, received ${c.count}`);
        }
        let lengthM = 0, lengthBasis = 'no length declared';
        if (c.widthM !== undefined || c.setbackM !== undefined) {
            const l = crossingLengthM({ widthM: c.widthM, setbackM: c.setbackM, depthM: c.depthM });
            lengthM = l.value * count;
            lengthBasis = l.basis;
        }
        return {
            index: i, type: c.type, label: spec.label, count,
            trenchless: spec.trenchless, blocksCorridor: spec.blocksCorridor,
            method: spec.trenchless ? 'trenchless' : 'open-cut',
            why: spec.why, lengthM, lengthBasis,
            lengthDeclared: lengthM > 0
        };
    });

    const blocking = items.filter(i => i.blocksCorridor);
    const trenchless = items.filter(i => i.trenchless);
    const undeclared = items.filter(i => !i.lengthDeclared);

    return {
        schema,
        quantity: 'crossing_schedule',
        items,
        crossingCount: items.reduce((a, b) => a + b.count, 0),
        trenchlessCount: trenchless.reduce((a, b) => a + b.count, 0),
        openCutCount: items.filter(i => !i.trenchless).reduce((a, b) => a + b.count, 0),
        addedLengthM: items.reduce((a, b) => a + b.lengthM, 0),
        corridorApplicable: blocking.length === 0,
        blockedBy: blocking.map(b => b.label),
        undeclaredLengths: undeclared.map(u => u.label),
        basis: blocking.length
            ? `This route crosses ${blocking.map(b => b.label).join(' and ')}. A highway-corridor factor ` +
              `is calibrated on circuits that follow the road network, and there is no road here, so no ` +
              `land corridor estimate is offered for this route.`
            : `${items.reduce((a, b) => a + b.count, 0)} declared crossing(s): ` +
              `${trenchless.reduce((a, b) => a + b.count, 0)} trenchless, ` +
              `${items.filter(i => !i.trenchless).reduce((a, b) => a + b.count, 0)} open-cut.` +
              (undeclared.length
                  ? ` ${undeclared.length} crossing(s) have no width or setback declared and contribute ` +
                    `no length: ${undeclared.map(u => u.label).join(', ')}. They are counted, not costed.`
                  : ``)
    };
}

/**
 * A route estimate that knows what it crossed.
 *
 * Straight line in, corridor factor applied ONLY where it is applicable, plus
 * the declared crossing allowances. Returns null where there is nothing honest
 * to say — the same discipline corridor-estimate already uses.
 */
export function routeEstimate({ straightLineKm, crossings = [], corridorFactor }) {
    positive('straightLineKm', straightLineKm);
    positive('corridorFactor', corridorFactor);
    if (corridorFactor < 1) {
        throw new RangeError(
            `corridorFactor must be at least 1, received ${corridorFactor}; a route cannot be shorter than the straight line between its ends.`);
    }
    const sched = crossingSchedule({ crossings });

    if (!sched.corridorApplicable) {
        return {
            schema,
            quantity: 'route_estimate',
            value: null,
            unit: 'km',
            straightLineKm,
            schedule: sched,
            corridorApplicable: false,
            basis:
                `No estimate. ${sched.basis} The straight-line distance of ${straightLineKm} km stands ` +
                `and is unchanged — it is a real measurement — but multiplying it by a road factor would ` +
                `describe a route that does not exist. This is the check that a scalar-only corridor ` +
                `function could not make, because it never saw the coordinates.`
        };
    }

    const corridorKm = straightLineKm * corridorFactor;
    const crossingKm = sched.addedLengthM / 1000;
    return {
        schema,
        quantity: 'route_estimate',
        value: corridorKm + crossingKm,
        unit: 'km',
        straightLineKm,
        corridorKm,
        crossingAllowanceKm: crossingKm,
        corridorApplicable: true,
        schedule: sched,
        basis:
            `${straightLineKm} km straight line, x${corridorFactor} for a highway corridor gives ` +
            `${corridorKm.toFixed(2)} km, plus ${crossingKm.toFixed(3)} km of declared crossing ` +
            `allowance across ${sched.crossingCount} crossing(s), of which ${sched.trenchlessCount} ` +
            `cannot be open-cut. Indicative screening only: not a route, not a constructability ` +
            `assessment, and not a consenting design.`
    };
}

export const NOT_COMPUTED = Object.freeze({
    theRouteItself:
        'There is no pathfinder here. A real route needs obstacle geometry, land ownership, ground conditions, existing plant and consenting constraints — none of which are in this module. Crossings are declared by the user, not discovered.',
    crossingCost:
        'What a crossing costs depends on ground conditions, the owner\'s requirements, programme and risk allocation. A length is not a price.',
    crossingConsent:
        'Whether a crossing is permitted is the asset owner\'s and the regulator\'s answer. Network Rail asset protection alone often governs the programme, regardless of engineering feasibility.',
    groundConditions:
        'Whether a drill is achievable depends on the ground. Rock, running sand, contamination and existing services decide the method, and none of them are visible from a map.'
});
