/* electrical-distance.proof.mjs — how far a substation is in the network
 * operator's own published circuits, not in kilometres. Two claims matter:
 *
 *   1. A genuine multi-hop path is found, shortest-first, over real hops.
 *   2. A circuit whose two ends carry different declared voltages is
 *      REFUSED unless it is a transformer — walking it would invent a
 *      voltage change the data never asserts.
 *
 * Uses the same COWL/DIDC/STRA/ISLE/PLCH fixture as
 * network-topology.proof.mjs, so a reader can cross-check both proofs
 * against one network.
 *
 * Run: node proofs/electrical-distance.proof.mjs
 */

import { ACCEPTS, index } from '../engine/network-topology.js';
import { between, within, schema, requires, NOT_A_DISTANCE, NOT_A_CAPACITY }
    from '../engine/electrical-distance.js';

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
        { node_1: 'COWL4', node_2: 'PLCH4', circuit_type: 'OHL', transmission_owner: 'NGET',
          winter_mva: 9999, spring_mva: 100, summer_mva: 90, autumn_mva: 95 }
    ],
    transformers: [
        { node_1: 'COWL4', node_2: 'COWL1', rating_mva: 240, transmission_owner: 'NGET' }
    ],
    planned_changes: [
        { node_1: 'STRA4', node_2: 'FUTR1', year: 2029, status: 'proposed', asset: 'new circuit' }
    ]
};

const idx = index(PRODUCT);

/* ── Contract gates ───────────────────────────────────────────────────── */

check('between() and within() refuse an index that exposes no graph(), '
    + 'rather than throwing on a missing method',
    between({}, 'COWL', 'DIDC') === null && within({}, 'COWL') === null
    && between(null, 'COWL', 'DIDC') === null);

check('between() refuses an unknown site on either end',
    between(idx, 'NOWHERE', 'DIDC') === null && between(idx, 'COWL', 'NOWHERE') === null);

check('the module identifies itself and the graph schema it requires',
    schema === 'gridatlas.module.electrical-distance.v1'
    && requires === 'gridatlas.module.network-topology.graph.v1');

/* ── The real two-hop path: COWL -> DIDC -> STRA ─────────────────────────── */

const cowlToStra = between(idx, 'COWL', 'STRA');

check('the shortest published path from Cowley to Strand is two hops, via '
    + 'Didcot — this is a real breadth-first result on the fixture graph, '
    + 'not a fixed number asserted without reference to it',
    cowlToStra.reached === true && cowlToStra.hops === 2 && cowlToStra.path.length === 2);

check('the path visits Didcot in the middle, in the right direction',
    cowlToStra.path[0].from_node === 'COWL4' && cowlToStra.path[0].to_node === 'DIDC4'
    && cowlToStra.path[1].from_node === 'DIDC4' && cowlToStra.path[1].to_node === 'STRA4');

check('same-site queries are zero hops without a search',
    between(idx, 'COWL', 'Cowley').reached === true
    && between(idx, 'COWL', 'Cowley').hops === 0);

/* ── The refusal: a circuit cannot change voltage, only a transformer can ── */

check('the direct 400kV-132kV circuit from Cowley to Isolated is REFUSED, '
    + 'not walked — a circuit is not allowed to change declared voltage',
    cowlToStra.refusals.some(r => r.to_node === 'ISLE1' && r.kind === 'circuit'));

const cowlToIsle = between(idx, 'COWL', 'ISLE');
check('with the illegal circuit refused and no other published path, '
    + 'Isolated is UNREACHABLE from Cowley — the refusal is not silently '
    + 'routed around',
    cowlToIsle.reached === false && cowlToIsle.hops === null
    && cowlToIsle.refusals.length === 1 && cowlToIsle.refusals[0].to_node === 'ISLE1');

check('no impedance is summed anywhere in a returned path — R, X, B are '
    + 'carried per hop exactly as published, never combined into a total',
    cowlToStra.path.every(h => h.parameters_pct_100mva === null
        || (typeof h.parameters_pct_100mva === 'object' && !('total' in h.parameters_pct_100mva))));

/* ── within(): every site reached inside a hop budget ────────────────────── */

const within1 = within(idx, 'COWL', { hops: 1 });
check('within one hop of Cowley: Didcot and Placeholder, not Strand (two '
    + 'hops away) and not Isolated (refused)',
    within1.sites.map(s => s.code).sort().join(',') === 'DIDC,PLCH'
    && within1.refusals.some(r => r.to_node === 'ISLE1'));

const within2 = within(idx, 'COWL', { hops: 2 });
check('within two hops of Cowley: Strand now appears, at hop depth 2, '
    + 'while Didcot and Placeholder stay at depth 1',
    within2.sites.find(s => s.code === 'STRA').hops === 2
    && within2.sites.find(s => s.code === 'DIDC').hops === 1
    && within2.counts.by_hop['1'] === 2 && within2.counts.by_hop['2'] === 1);

check('an unknown site returns null from within(), not an empty-but-real '
    + 'looking result',
    within(idx, 'NOWHERE') === null);

/* ── The module never claims to be a distance or a spare capacity ───────── */

check('the module states plainly, in its own exported strings, that a hop '
    + 'count is not a kilometre distance and a path is not a spare-capacity '
    + 'claim',
    /not a distance/i.test(NOT_A_DISTANCE) && /not.*flow|spare|capacity/i.test(NOT_A_CAPACITY));

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('electrical-distance proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('electrical-distance proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
