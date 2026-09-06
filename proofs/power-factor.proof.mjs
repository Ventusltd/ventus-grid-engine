/* power-factor.proof.mjs — the cheapest capacity anybody ever buys, checked.
 *
 * The worked case throughout: 1,000 kW at 0.85, corrected to 0.98. It is the
 * ordinary industrial one, and the numbers are round enough that an error is
 * obvious rather than plausible.
 *
 * Run: node proofs/power-factor.proof.mjs
 */

import * as mod from '../engine/power-factor.js';
const { schema, NOT_COMPUTED, reactivePowerKvar, apparentPowerKva,
    correctionKvar, againstAgreedCapacity } = mod;

const failures = [];
let passed = 0;
const check = (n, c) => { c ? passed += 1 : failures.push(n); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, p) => { try { fn(); return false; } catch (e) { return p.test(e.message); } };

check('schema is declared', schema === 'ventus-grid-engine.power-factor.v1');

/* ── The triangle. These are identities and must be exact. ──────────────── */

check('1,000 kW at 0.85 is 1,176.5 kVA',
    near(apparentPowerKva({ kw: 1000, powerFactor: 0.85 }).value, 1176.47, 0.01));

check('1,000 kW at 0.85 draws 619.7 kVAr',
    near(reactivePowerKvar({ kw: 1000, powerFactor: 0.85 }).value, 619.75, 0.01));

/* S^2 = P^2 + Q^2 must hold exactly, or the trigonometry is wrong. */
{
    const P = 1000, pf = 0.85;
    const S = apparentPowerKva({ kw: P, powerFactor: pf }).value;
    const Q = reactivePowerKvar({ kw: P, powerFactor: pf }).value;
    check('the power triangle closes: S squared equals P squared plus Q squared',
        near(S * S, P * P + Q * Q, 1e-6));
    check('and the power factor is P over S, by definition', near(P / S, pf, 1e-12));
}

/* At unity there is no reactive power at all. Written from the identity
   rather than through arccos/tan, so this is exactly zero and not 6e-9. */
check('at unity power factor the reactive power is EXACTLY zero, not nearly zero',
    reactivePowerKvar({ kw: 1000, powerFactor: 1 }).value === 0);

check('at unity, apparent power equals real power',
    apparentPowerKva({ kw: 1000, powerFactor: 1 }).value === 1000);

/* ── The correction, and the capacity it releases. ──────────────────────── */
{
    const c = correctionKvar({ kw: 1000, fromPowerFactor: 0.85, toPowerFactor: 0.98 });
    check('correcting 1,000 kW from 0.85 to 0.98 needs 416.7 kVAr',
        near(c.value, 416.70, 0.02));
    check('reactive power falls from 619.7 to 203.0 kVAr',
        near(c.reactiveBeforeKvar, 619.75, 0.01) && near(c.reactiveAfterKvar, 203.05, 0.01));
    check('apparent power falls from 1,176.5 to 1,020.4 kVA',
        near(c.apparentBeforeKva, 1176.47, 0.01) && near(c.apparentAfterKva, 1020.41, 0.01));
    check('156.1 kVA of connection capacity is released',
        near(c.capacityReleasedKva, 156.06, 0.02));
    check('that is 13.3% of the site demand on its connection',
        near(c.capacityReleasedPercent, 13.27, 0.02));
    check('the correction equals the difference in reactive power, which is the whole method',
        near(c.value, c.reactiveBeforeKvar - c.reactiveAfterKvar, 1e-9));
    check('the basis says the released capacity comes with no reduction in consumption',
        /no reduction in consumption/i.test(c.basis));
    check('the basis warns that unity is usually the wrong target and why',
        /unity is usually the\s+wrong target/i.test(c.basis.replace(/\s+/g, ' '))
        || /unity is usually the wrong target/i.test(c.basis.replace(/\s+/g, ' ')));
    check('the basis warns a fixed bank over-corrects at part load',
        /over-correct at part load/i.test(c.basis));
}

/* A worse target is not a correction. */
check('correcting to a WORSE power factor is refused',
    throws(() => correctionKvar({ kw: 1000, fromPowerFactor: 0.95, toPowerFactor: 0.85 }),
        /must be better than/));

check('correcting to the same power factor is refused, because it is not a correction',
    throws(() => correctionKvar({ kw: 1000, fromPowerFactor: 0.9, toPowerFactor: 0.9 }),
        /must be better than/));

/* The relationship that makes this worth doing: the worse the starting point,
   the more capacity correction returns. */
{
    const poor = correctionKvar({ kw: 1000, fromPowerFactor: 0.70, toPowerFactor: 0.95 });
    const fair = correctionKvar({ kw: 1000, fromPowerFactor: 0.90, toPowerFactor: 0.95 });
    check('a site at 0.70 releases far more capacity than one already at 0.90',
        poor.capacityReleasedKva > fair.capacityReleasedKva * 4);
    check('a site at 0.70 releases over a quarter of its connection demand',
        poor.capacityReleasedPercent > 25);
}

/* ── Against an agreed capacity. ────────────────────────────────────────── */
{
    const over = againstAgreedCapacity({ kw: 1000, powerFactor: 0.85, agreedKva: 1100 });
    check('1,000 kW at 0.85 exceeds an agreed 1,100 kVA', over.exceeds === true);
    check('the excess is quantified', /EXCEEDS the agreed capacity by 76\.5 kVA/.test(over.basis));

    const under = againstAgreedCapacity({ kw: 1000, powerFactor: 0.98, agreedKva: 1100 });
    check('the same load corrected to 0.98 fits inside the same agreed capacity',
        under.exceeds === false);
    check('which is the point: the connection stopped being the constraint without any '
        + 'reduction in consumption',
        over.exceeds && !under.exceeds && over.from.kw === under.from.kw);
    check('the basis says the agreed capacity is commercial and this is not a connection assessment',
        /commercial figure from a connection agreement/i.test(under.basis)
        && /not a connection assessment/i.test(under.basis));
}

/* ── Input discipline. ──────────────────────────────────────────────────── */

check('a power factor of 95 is refused, and the message says to pass 0.95',
    throws(() => apparentPowerKva({ kw: 1000, powerFactor: 95 }), /fraction.*0\.95/s));

check('a power factor above 1 is refused even just above',
    throws(() => apparentPowerKva({ kw: 1000, powerFactor: 1.01 }), /fraction/));

check('a zero or negative load is refused',
    throws(() => apparentPowerKva({ kw: 0, powerFactor: 0.9 }), /greater than zero/));

check('a non-numeric input is refused by type rather than coerced',
    throws(() => apparentPowerKva({ kw: '1000', powerFactor: 0.9 }), /finite number/));

/* ── Refusals. ──────────────────────────────────────────────────────────── */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function designs equipment or prices anything',
        callable.every(n => !/design|bank|cost|price|charge|payback|tariff/i.test(n)));
    check('the refusals name bank design, charges, payback and varying load',
        ['capacitorBankDesign', 'reactiveCharges', 'payback', 'varyingLoad'].every(k => k in NOT_COMPUTED));
    check('the bank-design refusal names harmonic resonance as the reason, not vagueness',
        /harmonic resonance/i.test(NOT_COMPUTED.capacitorBankDesign)
        && /supply impedance/i.test(NOT_COMPUTED.capacitorBankDesign));
    check('each refusal is a readable reason rather than a label',
        Object.values(NOT_COMPUTED).every(v => typeof v === 'string' && v.length > 60));
}

if (failures.length) {
    console.error('power-factor proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('power-factor proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
