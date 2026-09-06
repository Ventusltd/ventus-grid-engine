/* firm-capacity.proof.mjs — the N-1 arithmetic, and the boundary between what
 * it may say and what it may not.
 *
 * The worked case is the one in the electrification paper: a substation with
 * two 30 MVA units, whose peak grows from 24 to 42 MVA. Installed capacity
 * never changes and never looks stressed; firm capacity is exceeded well
 * before installed is, and that is the whole point of the module.
 *
 * Run: node proofs/firm-capacity.proof.mjs
 */

import * as mod from '../engine/firm-capacity.js';
const { schema, NOT_COMPUTED, apparentPowerMva, firmCapacityMva,
    utilisationAgainstRating, assessAgainstFirm } = mod;

const failures = [];
let passed = 0;
const check = (name, condition) => { condition ? passed += 1 : failures.push(name); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, pattern) => {
    try { fn(); return false; } catch (e) { return pattern.test(e.message); }
};

check('schema is declared', schema === 'ventus-grid-engine.firm-capacity.v1');

/* ── Apparent power. The paper's data-centre case. ──────────────────────── */

check('100 MW at 0.95 power factor is 105.3 MVA (paper: 105 MVA)',
    near(apparentPowerMva({ mw: 100, powerFactor: 0.95 }).value, 105.26, 0.01));

check('unity power factor leaves the figure unchanged',
    apparentPowerMva({ mw: 100, powerFactor: 1 }).value === 100);

check('the under-count from sizing on MW is stated as a percentage',
    /5\.3%/.test(apparentPowerMva({ mw: 100, powerFactor: 0.95 }).basis));

/* ── Firm capacity. ─────────────────────────────────────────────────────── */

check('two 30 MVA units give 60 MVA installed and 30 MVA firm (paper)',
    firmCapacityMva({ units: [30, 30] }).value === 30
    && firmCapacityMva({ units: [30, 30] }).from.installedMva === 60);

check('three 30 MVA units give 90 installed and 60 firm',
    firmCapacityMva({ units: [30, 30, 30] }).value === 60);

/* Asymmetric banks are where the "less the largest" rule bites hardest. */
check('an asymmetric bank loses its LARGEST unit, not an average one',
    firmCapacityMva({ units: [90, 30] }).value === 30);

/* The answer that matters most and is most often mis-handled. */
{
    const single = firmCapacityMva({ units: [30] });
    check('a single transformer has ZERO firm capacity, returned as an answer not an error',
        single.value === 0);
    check('the single-unit basis says losing it loses the site',
        /NO firm capacity/i.test(single.basis) && /loses the site/i.test(single.basis));
}

/* ── The paper's worked substation, across its growth. ──────────────────── */
{
    const units = [30, 30];
    const before = assessAgainstFirm({ units, demandMva: 24 });
    const after = assessAgainstFirm({ units, demandMva: 42 });

    check('at 24 MVA the site is inside firm capacity',
        before.withinFirm === true && before.shortfallMva === 0);

    check('at 42 MVA the site is beyond firm but still inside installed — the gap that decides connections',
        after.withinFirm === false && after.withinInstalled === true);

    check('the shortfall against firm is reported as 12 MVA',
        near(after.shortfallMva, 12, 1e-9));

    /* The trap this module exists to expose: on installed capacity the site
       looks 70% loaded and unremarkable. On firm it is already 40% over. */
    check('installed utilisation looks comfortable at 70% while firm utilisation is 140%',
        near(after.utilisationOfInstalled, 0.7, 1e-9) && near(after.utilisationOfFirm, 1.4, 1e-9));

    check('the paper\'s 75% demand growth is what moves it across the firm boundary',
        near((42 - 24) / 24, 0.75, 1e-9));

    const beyond = assessAgainstFirm({ units, demandMva: 65 });
    check('a demand beyond installed capacity is reported as such',
        beyond.withinInstalled === false);
}

/* ── Utilisation against a stated rating. ───────────────────────────────── */
{
    const u = utilisationAgainstRating({ demandMva: 42, ratingMva: 30 });
    check('42 MVA on a 30 MVA rating is 140% and flagged as exceeding',
        near(u.percent, 140, 1e-9) && u.exceedsRating === true);
    check('the excess is quantified in MVA',
        /12\.00 MVA/.test(u.basis));
    check('the basis refuses the words spare capacity and names where the real constraint may sit',
        /not spare capacity/i.test(u.basis)
        && /upstream circuit/i.test(u.basis) && /fault level/i.test(u.basis));
    check('a demand inside the rating is not flagged as exceeding',
        utilisationAgainstRating({ demandMva: 20, ratingMva: 30 }).exceedsRating === false);
}

/* ── Input discipline. ──────────────────────────────────────────────────── */

check('a power factor of 95 is refused, and the message says to pass 0.95',
    throws(() => apparentPowerMva({ mw: 100, powerFactor: 95 }), /fraction.*0\.95/s));

check('an empty or absent transformer list is refused',
    throws(() => firmCapacityMva({ units: [] }), /non-empty array/)
    && throws(() => firmCapacityMva({ units: 30 }), /non-empty array/));

check('a zero or negative transformer rating is refused, naming the index',
    throws(() => firmCapacityMva({ units: [30, 0] }), /units\[1\].*greater than zero/s));

check('a non-numeric rating is refused by type rather than coerced',
    throws(() => firmCapacityMva({ units: [30, '30'] }), /units\[1\].*finite number/s));

/* ── Refusals. ──────────────────────────────────────────────────────────── */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function returns spare capacity, headroom or connection availability',
        callable.every(n => !/headroom|spare|available|availability/i.test(n)));
    check('no function invents a cyclic or emergency rating',
        callable.every(n => !/cyclic|emergency|overload/i.test(n)));
    check('the refusals name spare capacity, connection availability, cyclic rating and security compliance',
        ['spareCapacity', 'connectionAvailability', 'cyclicAndEmergencyRating', 'securityCompliance']
            .every(k => k in NOT_COMPUTED));
    check('each refusal is a readable reason, not a label',
        Object.values(NOT_COMPUTED).every(v => typeof v === 'string' && v.length > 60));
    check('the firm-capacity basis says plainly that this is not a P2/7 security study',
        /not a security study/i.test(firmCapacityMva({ units: [30, 30] }).basis)
        && /P2\/7/.test(firmCapacityMva({ units: [30, 30] }).basis));
}

if (failures.length) {
    console.error('firm-capacity proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('firm-capacity proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
