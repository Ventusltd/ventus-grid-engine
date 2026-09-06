/* electrification-demand.proof.mjs — the arithmetic of electrification,
 * checked against the worked examples in the paper it implements, against the
 * definitions it claims to be exact, and against the errors it exists to make
 * impossible.
 *
 * Three kinds of check here, in order of what they are worth:
 *
 *   1. Identity. Where a relation is a definition, the round trip must return
 *      the input. These cannot drift; if one fails, the arithmetic is wrong.
 *   2. Worked examples. Every figure in the paper is recomputed. If the module
 *      and the paper disagree, one of them is wrong and both are published.
 *   3. Refusals. The functions that must NOT exist, and the inputs that must
 *      be rejected. A percentage passed where a fraction is required is the
 *      error most likely to reach a published number quietly.
 *
 * Run: node proofs/electrification-demand.proof.mjs
 */

import * as mod from '../engine/electrification-demand.js';
const {
    schema, HOURS_PER_YEAR, HOURS_TWH_TO_GW, NOT_COMPUTED,
    averagePowerGw, peakFromLoadFactorGw, loadFactorFromPeak,
    nameplateFromCapacityFactorGw, electricityForDisplacedFuelTwh
} = mod;

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};
/* Compared to a tolerance because the paper rounds its published figures for
   reading. The tolerance is stated per check rather than global, so a loose
   one cannot hide behind a tight one. */
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, pattern) => {
    try { fn(); return false; } catch (e) { return pattern.test(e.message); }
};

/* ── 1. Definitions. These are exact. ───────────────────────────────────── */

check('a year is 8,760 hours and the TWh->GW divisor follows from it',
    HOURS_PER_YEAR === 8760 && HOURS_TWH_TO_GW === 8.76);

check('schema is declared',
    schema === 'ventus-grid-engine.electrification-demand.v1');

/* 8.76 TWh is exactly 1 GW held for a year. If this is not exact, nothing
   below can be trusted. */
check('8.76 TWh a year is exactly 1 GW average',
    averagePowerGw({ annualTwh: 8.76 }).value === 1);

/* Round trip: average -> peak at a load factor -> load factor back. */
{
    const avg = averagePowerGw({ annualTwh: 480 }).value;
    const peak = peakFromLoadFactorGw({ averageGw: avg, loadFactor: 0.6 }).value;
    const lf = loadFactorFromPeak({ averageGw: avg, peakGw: peak }).value;
    check('peak and load factor are exact inverses of one another',
        near(lf, 0.6, 1e-12));
}

/* Round trip: energy -> nameplate at a capacity factor -> energy back. */
{
    const cap = nameplateFromCapacityFactorGw({ annualTwh: 480, capacityFactor: 0.4 }).value;
    check('nameplate at a capacity factor returns the annual energy it was derived from',
        near(cap * HOURS_TWH_TO_GW * 0.4, 480, 1e-9));
}

/* ── 2. The paper's worked examples, recomputed. ────────────────────────── */

check('480 TWh is 54.8 GW average (paper: 54.8)',
    near(averagePowerGw({ annualTwh: 480 }).value, 54.8, 0.05));

check('300 TWh is 34.2 GW average (paper: 34.2)',
    near(averagePowerGw({ annualTwh: 300 }).value, 34.2, 0.05));

/* The three load-factor sensitivities the paper prints for the 480 TWh case.
   These are the numbers most likely to be quoted onward, so they are checked
   to a tenth of a gigawatt. */
{
    const avg = averagePowerGw({ annualTwh: 480 }).value;
    check('480 TWh at 70% load factor is 78.3 GW peak (paper: 78.3)',
        near(peakFromLoadFactorGw({ averageGw: avg, loadFactor: 0.7 }).value, 78.3, 0.1));
    check('480 TWh at 60% load factor is 91.3 GW peak (paper: 91.3)',
        near(peakFromLoadFactorGw({ averageGw: avg, loadFactor: 0.6 }).value, 91.3, 0.1));
    check('480 TWh at 50% load factor is 109.6 GW peak (paper: 109.6)',
        near(peakFromLoadFactorGw({ averageGw: avg, loadFactor: 0.5 }).value, 109.6, 0.1));
}

check('480 TWh at a 40% capacity factor needs about 137 GW nameplate (paper: ~137)',
    near(nameplateFromCapacityFactorGw({ annualTwh: 480, capacityFactor: 0.4 }).value, 137, 0.5));

/* The three displaced-fuel examples. The third is the important one: where
   both routes are already efficient, electrification barely reduces the
   energy, and any rule of thumb that assumes it does is wrong. */
check('100 TWh of boiler fuel at 90% into a COP 3 heat pump is 30.0 TWh (paper: 30.0)',
    near(electricityForDisplacedFuelTwh({ fuelTwh: 100, oldEfficiency: 0.9, newPerformance: 3.0 }).value, 30.0, 0.01));

check('100 TWh of road fuel at 25% into an 80%-efficient EV is 31.25 TWh (paper: 31.25)',
    near(electricityForDisplacedFuelTwh({ fuelTwh: 100, oldEfficiency: 0.25, newPerformance: 0.8 }).value, 31.25, 0.01));

check('100 TWh of industrial heat at 90% into a 95%-efficient electrical route is 94.74 TWh (paper: 94.74)',
    near(electricityForDisplacedFuelTwh({ fuelTwh: 100, oldEfficiency: 0.9, newPerformance: 0.95 }).value, 94.74, 0.01));

/* NESO's three published 2050 pathways, checked the honest direction: derive
   the load factor from the published peak rather than assuming one. These are
   the figures that show why a single national multiplier cannot be right —
   Hydrogen Evolution has the LARGEST annual demand and a LOWER peak than
   Electric Engagement. */
{
    const pathways = [
        ['Holistic Transition', 705, 120],
        ['Electric Engagement', 785, 144],
        ['Hydrogen Evolution', 797, 122]
    ];
    const factors = pathways.map(([, twh, peak]) =>
        loadFactorFromPeak({ averageGw: averagePowerGw({ annualTwh: twh }).value, peakGw: peak }).value);
    check('NESO pathway load factors land between 0.62 and 0.75',
        factors.every(f => f > 0.62 && f < 0.75));
    check('Hydrogen Evolution has more annual energy than Electric Engagement but a lower peak, '
        + 'so no single national peak-to-average ratio can describe both',
        797 > 785 && 122 < 144);
    /* The specific trap: applying today's ratio forward. A peak-to-average of
       1.83, taken from an inferred present peak against a rounded reference,
       would put Holistic Transition at ~147 GW against a published 120. */
    const htAvg = averagePowerGw({ annualTwh: 705 }).value;
    check('applying a 1.83 peak-to-average ratio to Holistic Transition overshoots '
        + 'NESO\'s published 120 GW peak by more than 20%',
        peakFromLoadFactorGw({ averageGw: htAvg, loadFactor: 1 / 1.83 }).value > 120 * 1.2);
}

/* ── 3. Refusals and input discipline. ──────────────────────────────────── */

/* The error this module exists to catch: 40 passed where 0.4 was meant. A
   silent acceptance returns a number 100x wrong in a plausible-looking unit. */
check('a load factor of 40 is refused, and the message says to pass 0.4',
    throws(() => peakFromLoadFactorGw({ averageGw: 54.8, loadFactor: 40 }), /must be a fraction.*0\.4/s));

check('a capacity factor above one is refused',
    throws(() => nameplateFromCapacityFactorGw({ annualTwh: 480, capacityFactor: 40 }), /fraction/));

/* A heat pump legitimately exceeds unity. This must NOT be refused, or the
   module cannot express the case that matters most. */
check('a heat-pump COP above one is accepted, because a heat pump moves heat rather than making it',
    electricityForDisplacedFuelTwh({ fuelTwh: 100, oldEfficiency: 0.9, newPerformance: 3.5 }).value > 0);

check('a negative or zero energy is refused',
    throws(() => averagePowerGw({ annualTwh: 0 }), /greater than zero/)
    && throws(() => averagePowerGw({ annualTwh: -5 }), /greater than zero/));

check('a non-numeric input is refused by type, not coerced',
    throws(() => averagePowerGw({ annualTwh: '480' }), /finite number/));

check('a peak below the average it contains is refused as physically impossible',
    throws(() => loadFactorFromPeak({ averageGw: 54.8, peakGw: 30 }), /cannot be lower than the mean/));

/* Every returned figure carries its unit and the assumption it rests on. A
   value alone is how a sensitivity becomes a forecast in the retelling. */
{
    const r = peakFromLoadFactorGw({ averageGw: 54.8, loadFactor: 0.6 });
    check('a returned figure carries its unit, its inputs and its basis',
        r.unit === 'GW' && typeof r.basis === 'string' && r.basis.length > 40
        && r.from.loadFactor === 0.6);
    check('the peak figure says in words that it is a sensitivity and not a published peak',
        /sensitivity/i.test(r.basis) && /not a published peak/i.test(r.basis));
}

/* The absent functions. Anything matching these names would be the module
   quietly becoming a connection-assessment tool. */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function computes headroom, spare capacity or connection availability',
        callable.every(n => !/headroom|spare|available|availability|uplift|adequacy/i.test(n)));
    check('the refusals are stated as readable reasons a card can print',
        Object.values(NOT_COMPUTED).every(v => typeof v === 'string' && v.length > 40));
    check('the refusals name headroom, connection availability, per-site uplift and adequacy',
        ['headroom', 'connectionAvailability', 'perSiteUplift', 'adequacy']
            .every(k => k in NOT_COMPUTED));
}

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('electrification-demand proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('electrification-demand proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
