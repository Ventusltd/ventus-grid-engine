/**
 * Module: power-factor
 *
 * APPLIED ENGINEERING. How much reactive power a load draws, what it costs in
 * capacity, and how much of that capacity correction gives back.
 *
 * WHY THIS IS THE CHEAPEST CAPACITY ANYBODY EVER BUYS.
 * Plant is limited by current, and current follows apparent power. A 1,000 kW
 * load at 0.85 power factor draws 1,176 kVA; the same load corrected to 0.98
 * draws 1,020 kVA. The site has not reduced its consumption by a single
 * kilowatt-hour, and it has released 156 kVA of transformer and cable capacity.
 * Where a connection is the constraint — which, for anyone trying to electrify
 * behind an existing supply, it usually is — that is capacity obtained without
 * an application, a reinforcement, or a wait.
 *
 * THE ARITHMETIC, WHICH IS TRIGONOMETRY AND NOTHING CLEVERER.
 * Real power P, reactive power Q and apparent power S form a right triangle:
 *
 *     S = sqrt(P^2 + Q^2)      pf = cos(phi) = P / S      Q = P x tan(phi)
 *
 * Correcting from pf1 to pf2 means supplying the difference in reactive power
 * locally instead of drawing it across the network:
 *
 *     Qc = P x (tan(phi1) - tan(phi2))
 *
 * That is the size of the correction equipment, in kVAr. It is exact, and it is
 * the whole of what this module computes.
 *
 * WHY UNITY IS NOT THE TARGET, AND WHY THE MODULE WILL NOT PICK ONE.
 * Correcting to exactly 1.0 is usually wrong: the last few percent costs
 * disproportionately, an over-corrected site exports reactive power and can be
 * charged for it, and a fixed bank on a varying load will over-correct at part
 * load. Networks and tariffs generally reward somewhere around 0.95 to 0.98,
 * and the right figure depends on the tariff and the load profile. So the
 * target is an input here and there is no default.
 *
 * WHAT THIS MODULE REFUSES.
 * It does not design a capacitor bank. Real correction equipment has to be
 * assessed for harmonic resonance with the supply impedance — an installation
 * can amplify existing harmonic voltages badly enough to destroy itself and
 * the plant around it — and that needs a harmonic study with the network
 * operator's data. It does not calculate a reactive power charge, because
 * tariffs differ by network and change. It does not decide whether correction
 * is worth doing, which is a commercial question with a payback in it.
 *
 * Schema: ventus-grid-engine.power-factor.v1
 */

export const schema = 'ventus-grid-engine.power-factor.v1';

function positive(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

function powerFactor(name, v) {
    positive(name, v);
    if (v > 1) throw new RangeError(
        `${name} must be a fraction in (0, 1], received ${v}. A power factor of 95% must be passed as 0.95.`);
    return v;
}

/* tan(arccos(pf)), the reactive power per unit of real power. Written from the
   identity rather than through two trig calls, so it is exact at pf = 1 where
   arccos returns a value whose tangent is a floating-point approximation of
   zero. */
function tanPhi(pf) {
    return Math.sqrt(1 - pf * pf) / pf;
}

/**
 * The reactive power a load draws at a stated power factor.
 */
export function reactivePowerKvar({ kw, powerFactor: pf }) {
    positive('kw', pf === undefined ? kw : kw);
    powerFactor('powerFactor', pf);
    return {
        schema,
        quantity: 'reactive_power_kvar',
        value: kw * tanPhi(pf),
        unit: 'kVAr',
        from: { kw, powerFactor: pf },
        basis:
            `${kw} kW at a power factor of ${pf} draws ${(kw * tanPhi(pf)).toFixed(1)} kVAr of reactive ` +
            `power. Reactive power does no work, but it is carried by the same conductors and occupies ` +
            `the same plant rating as the real power beside it.`
    };
}

/**
 * Apparent power, which is what the plant is actually rated for.
 */
export function apparentPowerKva({ kw, powerFactor: pf }) {
    positive('kw', kw);
    powerFactor('powerFactor', pf);
    return {
        schema,
        quantity: 'apparent_power_kva',
        value: kw / pf,
        unit: 'kVA',
        from: { kw, powerFactor: pf },
        basis:
            `${kw} kW at ${pf} is ${(kw / pf).toFixed(1)} kVA. This is the figure the transformer, the ` +
            `cable and the agreed capacity are all measured against.`
    };
}

/**
 * The correction needed to move from one power factor to another, and the
 * capacity that releases.
 *
 * Both power factors are the caller's. There is no default target: see the
 * header on why unity is usually the wrong answer.
 */
export function correctionKvar({ kw, fromPowerFactor, toPowerFactor }) {
    positive('kw', kw);
    powerFactor('fromPowerFactor', fromPowerFactor);
    powerFactor('toPowerFactor', toPowerFactor);
    if (toPowerFactor <= fromPowerFactor) {
        throw new RangeError(
            `toPowerFactor (${toPowerFactor}) must be better than fromPowerFactor (${fromPowerFactor}); ` +
            `correction improves a power factor, it does not worsen one.`);
    }
    const qBefore = kw * tanPhi(fromPowerFactor);
    const qAfter = kw * tanPhi(toPowerFactor);
    const sBefore = kw / fromPowerFactor;
    const sAfter = kw / toPowerFactor;
    return {
        schema,
        quantity: 'correction_kvar',
        value: qBefore - qAfter,
        unit: 'kVAr',
        reactiveBeforeKvar: qBefore,
        reactiveAfterKvar: qAfter,
        apparentBeforeKva: sBefore,
        apparentAfterKva: sAfter,
        capacityReleasedKva: sBefore - sAfter,
        capacityReleasedPercent: ((sBefore - sAfter) / sBefore) * 100,
        from: { kw, fromPowerFactor, toPowerFactor },
        basis:
            `${(qBefore - qAfter).toFixed(1)} kVAr of correction moves ${kw} kW from ${fromPowerFactor} ` +
            `to ${toPowerFactor}, taking apparent power from ${sBefore.toFixed(1)} kVA to ` +
            `${sAfter.toFixed(1)} kVA and releasing ${(sBefore - sAfter).toFixed(1)} kVA — ` +
            `${(((sBefore - sAfter) / sBefore) * 100).toFixed(1)}% of the site's demand on its ` +
            `connection, for no reduction in consumption at all. Correcting to unity is usually the ` +
            `wrong target: the last few percent costs disproportionately, and a fixed bank on a varying ` +
            `load will over-correct at part load and may then be charged for exporting reactive power.`
    };
}

/**
 * What a released capacity is worth in headroom against a STATED agreed
 * capacity — arithmetic on two figures the caller supplies.
 */
export function againstAgreedCapacity({ kw, powerFactor: pf, agreedKva }) {
    const s = apparentPowerKva({ kw, powerFactor: pf });
    positive('agreedKva', agreedKva);
    return {
        schema,
        quantity: 'demand_against_agreed_capacity',
        value: s.value / agreedKva,
        unit: 'dimensionless',
        percent: (s.value / agreedKva) * 100,
        apparentKva: s.value,
        agreedKva,
        exceeds: s.value > agreedKva,
        from: { kw, powerFactor: pf, agreedKva },
        basis:
            `${s.value.toFixed(1)} kVA against an agreed ${agreedKva} kVA is ` +
            `${((s.value / agreedKva) * 100).toFixed(1)}%` +
            (s.value > agreedKva
                ? `, which EXCEEDS the agreed capacity by ${(s.value - agreedKva).toFixed(1)} kVA.`
                : `.`) +
            ` The agreed capacity is a commercial figure from a connection agreement, supplied by you. ` +
            `This is a ratio of two stated numbers and not a connection assessment.`
    };
}

export const NOT_COMPUTED = Object.freeze({
    capacitorBankDesign:
        'This does not design correction equipment. A real installation must be assessed for harmonic resonance against the supply impedance — a bank can amplify existing harmonic voltages badly enough to destroy itself and the plant around it — and that needs a harmonic study with the network operator\'s data.',
    reactiveCharges:
        'What excess reactive power costs depends on the network and the tariff, and tariffs change. No charge is calculated here.',
    payback:
        'Whether correction is worth installing is a commercial question with equipment cost, installation, maintenance and a tariff in it. This module sizes the duty only.',
    varyingLoad:
        'A single power factor describes one operating point. A real site varies, and a fixed bank sized for full load will over-correct at part load; staged or automatic correction is an equipment decision this arithmetic does not make.'
});
