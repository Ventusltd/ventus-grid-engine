/**
 * Module: current-from-power
 *
 * APPLIED ENGINEERING. The amps implied by a power and a voltage.
 *
 * WHY THIS FILE EXISTS AT ALL.
 * Every published network figure in this estate is a power: a circuit is
 * rated in MVA, a demand is quoted in MW, a firm capacity is an MVA number.
 * Every cable calculation in this estate takes a current: voltage-drop.js
 * asks for `currentA` and will not proceed without it. Nothing joined the
 * two. A reader could hold a 1,200 MVA circuit rating in one hand and a
 * voltage-drop calculator in the other and have no honest way to connect
 * them, so the chain from a published rating to a cable answer stopped in
 * the middle. This module is that one step and nothing more.
 *
 * THE ARITHMETIC.
 *
 *     three phase:   I = S / (sqrt(3) x V_line)
 *     single phase:  I = S / V
 *
 * S is apparent power in volt-amperes and V is the line-to-line voltage for
 * a three-phase circuit, the line-to-neutral voltage for a single-phase one.
 *
 * WHY THE THREE-PHASE FACTOR IS NOT THE ONE IN voltage-drop.js.
 * That file exports PHASE_FACTOR = { three: sqrt(3), single: 2 } and it is
 * tempting to import it here. It is the wrong constant and importing it
 * would be a silent factor-of-two error on every single-phase answer. In a
 * voltage drop the single-phase factor is 2 because the current goes out
 * along one conductor and back along another and loses volts in both. In a
 * current calculation there is one current, not two conductors' worth of
 * impedance, so the single-phase factor is 1. The three-phase factor is
 * sqrt(3) in both, for the same reason in both, which is exactly what makes
 * the mistake easy to make. The two constants are therefore declared
 * separately and this paragraph is why.
 *
 * WHAT THIS MODULE REFUSES.
 * It will not tell you what a circuit is carrying. A rating is what a
 * circuit is rated to carry; the current that flows is set by the load, and
 * no amount of arithmetic on a nameplate discovers it. It will not choose a
 * voltage: a site with 400 kV and 132 kV busbars has two answers and only
 * the caller knows which circuit is meant. It carries no derating: ambient
 * temperature, grouping, burial depth, soil resistivity and season all move
 * the number a real conductor may carry, and none of them is here. And it
 * will not accept a power factor to convert MW into MVA, because that is
 * power-factor.js's question and answering it twice in two files is how the
 * two answers begin to disagree.
 *
 * Schema: ventus-grid-engine.current-from-power.v1
 */

export const schema = 'ventus-grid-engine.current-from-power.v1';

/* The divisor between apparent power and current. NOT the same map as
   voltage-drop.js PHASE_FACTOR; see the header. */
export const CURRENT_PHASE_FACTOR = Object.freeze({
    three: Math.sqrt(3),
    single: 1
});

export const NOT_COMPUTED = Object.freeze({
    actualCurrent:
        'This is the current implied by a stated power at a stated voltage. It '
        + 'is not what the circuit is carrying. Load sets the flow; a nameplate '
        + 'does not.',
    derating:
        'No ambient temperature, grouping factor, burial depth, soil thermal '
        + 'resistivity or seasonal rating is applied. The amps here are the '
        + 'arithmetic of the stated power, not a thermal limit for a real '
        + 'conductor in a real trench.',
    voltageChoice:
        'A site publishes several voltages. This module never chooses one. The '
        + 'caller states the voltage of the circuit being asked about.',
    powerFactor:
        'Converting MW to MVA needs a power factor and that is power-factor.js. '
        + 'This module takes apparent power only, so the two files cannot '
        + 'disagree about the same number.'
});

export const NOT_A_HEADROOM =
    'The current implied by a rating is not spare capacity. What is free on a '
    + 'circuit is the rating minus what is already flowing, and nothing here '
    + 'knows what is already flowing.';

function positive(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

function phasesOf(phases) {
    if (phases !== 'three' && phases !== 'single') {
        throw new RangeError(`phases must be "three" or "single", received ${JSON.stringify(phases)}`);
    }
    return phases;
}

/**
 * Amps implied by an apparent power at a stated voltage.
 *
 * `apparentPowerVa` is volt-amperes and `voltageV` is volts, both in base
 * units, because a unit named in a parameter is the only unit check this
 * repository has. For a three-phase circuit `voltageV` is the line-to-line
 * voltage.
 */
export function currentA({ apparentPowerVa, voltageV, phases = 'three' }) {
    positive('apparentPowerVa', apparentPowerVa);
    positive('voltageV', voltageV);
    phasesOf(phases);

    const factor = CURRENT_PHASE_FACTOR[phases];
    const amps = apparentPowerVa / (factor * voltageV);

    return {
        schema,
        quantity: 'current_amperes',
        value: amps,
        unit: 'A',
        from: { apparentPowerVa, voltageV, phases, factor },
        basis:
            'I = S / (' + (phases === 'three' ? 'sqrt(3) x V_line' : 'V') + '). '
            + 'The current a stated apparent power implies at a stated voltage, '
            + 'with no derating and no claim about what flows.',
        not_computed: NOT_COMPUTED.actualCurrent,
        not_a_headroom: NOT_A_HEADROOM
    };
}

/**
 * The same question asked in the units the network is actually published in:
 * megavolt-amperes and kilovolts. This is the call a rating-envelope result
 * feeds, so it exists to stop every caller writing its own 1e6 and 1e3.
 */
export function currentFromMvaAtKv({ mva, kv, phases = 'three' }) {
    positive('mva', mva);
    positive('kv', kv);
    const answer = currentA({
        apparentPowerVa: mva * 1e6,
        voltageV: kv * 1e3,
        phases
    });
    return { ...answer, from: { mva, kv, phases, factor: answer.from.factor } };
}
