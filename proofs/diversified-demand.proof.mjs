/* diversified-demand.proof.mjs — the peak of the sum is not the sum of the
 * peaks, and the average across a window is not the peak inside it. Both
 * confusions size networks wrongly, in opposite directions.
 *
 * Run: node proofs/diversified-demand.proof.mjs
 */

import * as mod from '../engine/diversified-demand.js';
const { schema, NOT_COMPUTED, diversifiedDemandKw, impliedCoincidence,
    averageOverWindowGw, populationEnergyTwh } = mod;

const failures = [];
let passed = 0;
const check = (n, c) => { c ? passed += 1 : failures.push(n); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, p) => { try { fn(); return false; } catch (e) { return p.test(e.message); } };

check('schema is declared', schema === 'ventus-grid-engine.diversified-demand.v1');

/* ── The paper's EV population. ─────────────────────────────────────────── */

check('10 million vehicles at 2,500 kWh a year is 25 TWh (paper: 25)',
    near(populationEnergyTwh({ unitCount: 10_000_000, perUnitKwhPerYear: 2500 }).value, 25, 1e-9));

/* The three figures the paper prints for that same population, which are three
   DIFFERENT quantities and are routinely conflated. */
{
    /* 25 TWh across a full year. */
    const annual = 25 / 8.76;
    check('25 TWh averages 2.85 GW across the year (paper: 2.85)', near(annual, 2.85, 0.01));

    /* 25 TWh across an eight-hour nightly window. */
    const win = averageOverWindowGw({ annualTwh: 25, windowHoursPerDay: 8 });
    check('25 TWh inside an 8-hour nightly window averages 8.56 GW (paper: 8.56)',
        near(win.value, 8.56, 0.01));
    check('the window figure says in words that it is an average and not a peak',
        /AVERAGE, not a peak/i.test(win.basis));

    /* Unrestricted simultaneous draw, and the paper's 20% coincidence. */
    const unrestricted = diversifiedDemandKw({ unitCount: 10_000_000, perUnitKw: 7, coincidenceFactor: 1 });
    check('10 million 7 kW chargers could draw 70 GW between them (paper: 70 GW simultaneous)',
        near(unrestricted.value / 1e6, 70, 1e-9));

    const admd = diversifiedDemandKw({ unitCount: 10_000_000, perUnitKw: 7, coincidenceFactor: 0.2 });
    check('at 20% coincidence the same population presents 14 GW (paper: 14 GW)',
        near(admd.value / 1e6, 14, 1e-9));

    /* The spread between the three is the point: 2.85, 8.56 and 14 GW all
       describe the same vehicles. Quoting the wrong one sizes the network
       wrongly by a factor of five. */
    check('the three quantities for one population differ by roughly a factor of five, '
        + 'which is why they must not be collapsed',
        near(admd.value / 1e6 / annual, 4.91, 0.05));
}

/* ── Diversity itself. ──────────────────────────────────────────────────── */

check('the unrestricted total travels back with the answer, so the diversity applied is visible',
    diversifiedDemandKw({ unitCount: 100, perUnitKw: 7, coincidenceFactor: 0.3 }).from.unrestrictedKw === 700);

check('100 homes with 7 kW chargers at 0.3 coincidence present 210 kW, not 700',
    diversifiedDemandKw({ unitCount: 100, perUnitKw: 7, coincidenceFactor: 0.3 }).value === 210);

check('a coincidence factor of 1 is permitted and means no diversity at all',
    diversifiedDemandKw({ unitCount: 100, perUnitKw: 7, coincidenceFactor: 1 }).value === 700);

check('the basis warns that the factor belongs to a group of this size',
    /group of THIS size/i.test(diversifiedDemandKw({ unitCount: 10, perUnitKw: 7, coincidenceFactor: 0.6 }).basis));

/* The honest direction: measure the factor, do not assume it. */
{
    const imp = impliedCoincidence({ unitCount: 100, perUnitKw: 7, measuredGroupPeakKw: 210 });
    check('a measured 210 kW peak on 100 x 7 kW implies a coincidence factor of 0.3',
        near(imp.value, 0.3, 1e-12));
    check('measuring and assuming are exact inverses',
        near(diversifiedDemandKw({ unitCount: 100, perUnitKw: 7, coincidenceFactor: imp.value }).value, 210, 1e-9));
    check('the measured basis says it is measured rather than assumed',
        /Measured, not assumed/i.test(imp.basis));
}

/* ── Heat pumps, the paper's cold-period case. ──────────────────────────── */

check('10 million homes at 5 kW with full coincidence in a cold snap is 50 GW; '
    + 'at the paper\'s 25 GW the implied coincidence is 0.5',
    near(impliedCoincidence({ unitCount: 10_000_000, perUnitKw: 5, measuredGroupPeakKw: 25_000_000 }).value, 0.5, 1e-12));

/* ── Input discipline. ──────────────────────────────────────────────────── */

check('a coincidence factor of 20 is refused, and the message says to pass 0.2',
    throws(() => diversifiedDemandKw({ unitCount: 100, perUnitKw: 7, coincidenceFactor: 20 }), /fraction.*0\.2/s));

check('a fractional unit count is refused — half a house is not a load',
    throws(() => diversifiedDemandKw({ unitCount: 10.5, perUnitKw: 7, coincidenceFactor: 0.3 }), /whole number/));

check('a window longer than a day is refused',
    throws(() => averageOverWindowGw({ annualTwh: 25, windowHoursPerDay: 30 }), /at most 24/));

check('a measured group peak above the unrestricted total is refused as impossible',
    throws(() => impliedCoincidence({ unitCount: 10, perUnitKw: 7, measuredGroupPeakKw: 100 }),
        /cannot draw more than all its units/));

check('a non-numeric input is refused by type rather than coerced',
    throws(() => populationEnergyTwh({ unitCount: '100', perUnitKwhPerYear: 2500 }), /finite number/));

/* ── Refusals. ──────────────────────────────────────────────────────────── */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function derives a coincidence factor from first principles',
        !callable.some(n => /^(estimate|derive|assume|default)Coincidence/i.test(n)));
    check('no function decides whether a group can be connected',
        callable.every(n => !/fits|canConnect|available|headroom/i.test(n)));
    check('the refusals name all four boundaries',
        ['coincidenceFromFirstPrinciples', 'peakInsideAWindow', 'whetherTheGroupFits', 'futureCoincidence']
            .every(k => k in NOT_COMPUTED));
    check('the refusals are readable reasons rather than labels',
        Object.values(NOT_COMPUTED).every(v => typeof v === 'string' && v.length > 60));
    check('the refusals warn that measured coincidence does not survive a change in control',
        /smart charging|time-of-use|vehicle-to-grid/i.test(NOT_COMPUTED.futureCoincidence));
}

if (failures.length) {
    console.error('diversified-demand proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('diversified-demand proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
