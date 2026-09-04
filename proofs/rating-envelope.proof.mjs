/* rating-envelope.proof.mjs — what a circuit is published to carry, season
 * by season, and a structural refusal to add those numbers up. Two claims
 * matter:
 *
 *   1. The per-season figure is a RANGE (lowest/highest across qualifying
 *      circuits), never a sum and never a mean.
 *   2. A placeholder value (>= IMPLAUSIBLE_MVA) is flagged and excluded
 *      from the range, without dropping the circuit itself or its other
 *      seasons.
 *
 * Uses the same COWL/DIDC/STRA/ISLE/PLCH fixture as
 * network-topology.proof.mjs and electrical-distance.proof.mjs.
 *
 * Run: node proofs/rating-envelope.proof.mjs
 */

import { ACCEPTS, index } from '../engine/network-topology.js';
import { at, schema, requires, IMPLAUSIBLE_MVA, SEASONS, NEVER_SUMMED, NOT_A_CAPACITY }
    from '../engine/rating-envelope.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};

const PRODUCT = {
    schema: ACCEPTS,
    sites: [
        { code: 'COWL', name: 'Cowley', transmission_owner: 'NGET', voltages_kv: [400, 132] },
        { code: 'DIDC', name: 'Didcot', transmission_owner: 'NGET', voltages_kv: [400] },
        { code: 'STRA', name: 'Strand', transmission_owner: 'NGET', voltages_kv: [400] },
        { code: 'ISLE', name: 'Isolated', transmission_owner: 'NGET', voltages_kv: [132] },
        { code: 'PLCH', name: 'Placeholder', transmission_owner: 'NGET', voltages_kv: [400] }
    ],
    nodes: [
        { node: 'COWL4', site_code: 'COWL', voltage_kv: 400, voltage_consistent_with_site: true },
        { node: 'COWL1', site_code: 'COWL', voltage_kv: 132, voltage_consistent_with_site: true },
        { node: 'DIDC4', site_code: 'DIDC', voltage_kv: 400, voltage_consistent_with_site: true },
        { node: 'STRA4', site_code: 'STRA', voltage_kv: 400, voltage_consistent_with_site: true },
        { node: 'ISLE1', site_code: 'ISLE', voltage_kv: 132, voltage_consistent_with_site: true },
        { node: 'PLCH4', site_code: 'PLCH', voltage_kv: 400, voltage_consistent_with_site: true }
    ],
    circuits: [
        { node_1: 'COWL4', node_2: 'DIDC4', circuit_type: 'OHL', transmission_owner: 'NGET',
          winter_mva: 1200, spring_mva: 1100, summer_mva: 900, autumn_mva: 1150,
          r_pct_100mva: 0.5, x_pct_100mva: 5, b_pct_100mva: 10, ohl_km: 20 },
        { node_1: 'DIDC4', node_2: 'STRA4', circuit_type: 'OHL', transmission_owner: 'NGET',
          winter_mva: 800, spring_mva: 750, summer_mva: 600, autumn_mva: 700, ohl_km: 15 },
        { node_1: 'COWL4', node_2: 'ISLE1', circuit_type: 'OHL', transmission_owner: 'NGET',
          winter_mva: 500, spring_mva: 480, summer_mva: 400, autumn_mva: 450 },
        // The implausible-value fixture: a placeholder winter figure that
        // must be flagged and excluded from the winter range, without
        // touching this circuit's spring/summer/autumn figures.
        { node_1: 'COWL4', node_2: 'PLCH4', circuit_type: 'OHL', transmission_owner: 'NGET',
          winter_mva: 9999, spring_mva: 100, summer_mva: 90, autumn_mva: 95 }
    ],
    transformers: [
        { node_1: 'COWL4', node_2: 'COWL1', rating_mva: 240, transmission_owner: 'NGET' }
    ],
    planned_changes: []
};

const idx = index(PRODUCT);

/* ── Contract gates ───────────────────────────────────────────────────── */

check('at() refuses an index that exposes no graph(), rather than throwing',
    at({}, 'COWL') === null && at(null, 'COWL') === null);

check('at() refuses an unknown site',
    at(idx, 'NOWHERE') === null);

check('the module identifies itself and the graph schema it requires, and '
    + 'SEASONS is the fixed four-season vocabulary every result is built from',
    schema === 'gridatlas.module.rating-envelope.v1'
    && requires === 'gridatlas.module.network-topology.graph.v1'
    && SEASONS.length === 4 && SEASONS.includes('winter') && SEASONS.includes('summer'));

/* ── The three circuits at Cowley, and the RANGE they produce ────────────── */

const cowl = at(idx, 'COWL');

check('only circuits are considered — the internal transformer landing at '
    + 'COWL4/COWL1 contributes no rating row, because a transformer has no '
    + 'seasonal MVA rating in this fixture',
    cowl.circuits.length === 3
    && cowl.circuits.every(c => ['DIDC4', 'ISLE1', 'PLCH4'].includes(c.to_node)));

check('spring is untouched by the winter placeholder: all three circuits '
    + 'qualify, and the range is a real lowest/highest across them — '
    + '100 (Placeholder) to 1100 (Didcot)',
    cowl.by_season.spring.circuits === 3
    && cowl.by_season.spring.lowest_circuit_mva === 100
    && cowl.by_season.spring.highest_circuit_mva === 1100
    && cowl.by_season.spring.excluded_as_implausible === 0);

check('the range is never a sum: the winter total of the two legitimate '
    + 'circuits (1200 + 500 = 1700) does not appear anywhere as '
    + 'highest_circuit_mva, and it is not the mean either (850)',
    cowl.by_season.winter.highest_circuit_mva !== 1700
    && cowl.by_season.winter.highest_circuit_mva !== 850);

/* ── The implausible-value flag ──────────────────────────────────────────── */

check('a value at or above IMPLAUSIBLE_MVA (9999) is EXCLUDED from the '
    + 'winter range — the range is 500 to 1200, the two real circuits, not '
    + '9999',
    IMPLAUSIBLE_MVA === 9999
    && cowl.by_season.winter.lowest_circuit_mva === 500
    && cowl.by_season.winter.highest_circuit_mva === 1200
    && cowl.by_season.winter.circuits === 2
    && cowl.by_season.winter.excluded_as_implausible === 1);

check('the flagged circuit is not dropped from the result set — its '
    + 'spring/summer/autumn figures are still reported, only its winter '
    + 'value is flagged',
    cowl.circuits.find(c => c.to_node === 'PLCH4').ratings_mva.spring === 100
    && cowl.circuits.find(c => c.to_node === 'PLCH4').flags.length === 1
    && cowl.circuits.find(c => c.to_node === 'PLCH4').flags[0].season === 'winter');

check('exactly one circuit across the site carries a flagged value, and '
    + 'the site-level count agrees',
    cowl.counts.with_a_flagged_value === 1);

/* ── A season with nothing qualifying reports so honestly, not as zero ──── */

const isleOnly = at(idx, 'COWL', { voltageKv: 132 });
check('restricted to the 132kV node, no circuit lands there (the only '
    + 'circuits at Cowley are on the 400kV node) — every season reports '
    + 'published: false rather than a range of nothing',
    isleOnly.circuits.length === 0
    && Object.values(isleOnly.by_season).every(s => s.published === false && s.circuits === 0));

/* ── The module never claims a total or a spare capacity ─────────────────── */

check('the module states plainly, in its own exported strings, that a '
    + 'rating is not additive and not a spare-capacity claim',
    /not additive/i.test(NEVER_SUMMED) && /not.*free|spare/i.test(NOT_A_CAPACITY));

check('a caller-visible check: no field anywhere in a returned result is '
    + 'named a site total or a summed rating — the refusal to sum is '
    + 'structural, not just documented',
    !JSON.stringify(cowl).toLowerCase().includes('total_mva')
    && !JSON.stringify(cowl).toLowerCase().includes('site_rating'));

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('rating-envelope proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('rating-envelope proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
