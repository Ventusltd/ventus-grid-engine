/* network-topology.proof.mjs — what the network operator publishes about
 * one site, read as a graph, with the one property that made this module
 * worth promoting on its own: a site that owns both ends of a branch
 * publishes it twice, and physicalUnits() must fold that back to one.
 *
 * The fixture network (COWL/DIDC/STRA/ISLE/PLCH) is reused, unchanged, by
 * electrical-distance.proof.mjs and rating-envelope.proof.mjs, so the same
 * graph backs all three promoted modules' proofs.
 *
 * Run: node proofs/network-topology.proof.mjs
 */

import { ACCEPTS, UNDECLARED, physicalUnits, ratingsOf, parametersOf, index, schema }
    from '../engine/network-topology.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};

/* ── The fixture: five real sites ────────────────────────────────────────
 *
 * COWL (Cowley) at 400kV and 132kV, joined by an internal transformer —
 * the branch that gets published from both ends.
 * COWL4 --circuit(400-400)--> DIDC4 (Didcot) --circuit(400-400)--> STRA4
 * (Strand): a genuine two-hop chain, reached by electrical-distance.
 * COWL4 --circuit(400-132)--> ISLE1 (Isolated): a circuit whose two ends
 * carry different declared voltages — legal data here (network-topology
 * does not judge legality), and electrical-distance's refusal fixture.
 * COWL4 --circuit--> PLCH4 (Placeholder, 400kV): one season published at
 * 9999 MVA — rating-envelope's implausible-value fixture.
 */

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

/* A second, minimal fixture whose only job is the UNDECLARED-voltage band:
 * ALFAX shares ALFA's site but the product does NOT confirm its voltage. */
const PRODUCT_UNDECLARED = {
    schema: ACCEPTS,
    sites: [{ code: 'ALFA', name: 'Alfa', voltages_kv: [400] },
            { code: 'BETA', name: 'Beta', voltages_kv: [400] }],
    nodes: [
        { node: 'ALFA4', site_code: 'ALFA', voltage_kv: 400, voltage_consistent_with_site: true },
        { node: 'ALFAX', site_code: 'ALFA', voltage_kv: 132, voltage_consistent_with_site: false },
        { node: 'BETA4', site_code: 'BETA', voltage_kv: 400, voltage_consistent_with_site: true }
    ],
    circuits: [
        { node_1: 'ALFA4', node_2: 'BETA4', winter_mva: 100, spring_mva: 90, summer_mva: 80, autumn_mva: 85 },
        { node_1: 'ALFAX', node_2: 'BETA4', winter_mva: 10, spring_mva: 9, summer_mva: 8, autumn_mva: 8.5 }
    ]
};
const idxU = index(PRODUCT_UNDECLARED);

/* ── Schema gate ──────────────────────────────────────────────────────── */

check('a payload with the wrong schema is refused with null, not read '
    + 'partially or guessed at',
    index({ schema: 'something.else' }) === null && index(null) === null);

check('the module identifies itself with a stable schema string',
    schema === 'gridatlas.module.network-topology.v1' && idx.schema === schema);

check('a matching payload indexes every site and node it declares',
    idx.counts.sites === 5 && idx.counts.nodes === 6);

/* ── physicalUnits(): the branch counted from both ends folds to one ────── */

check('a branch seen from BOTH its ends counts as one physical unit, not '
    + 'two — this is the Cowley 5-vs-10 case the module exists to fix',
    physicalUnits([{ from_node: 'A', to_node: 'B' }, { from_node: 'B', to_node: 'A' }]) === 1);

check('a branch seen from only one end still counts as one unit — a '
    + 'voltage-filtered query that only sees one side must not undercount',
    physicalUnits([{ from_node: 'A', to_node: 'B' }]) === 1);

check('two genuinely different branches count as two units',
    physicalUnits([{ from_node: 'A', to_node: 'B' }, { from_node: 'C', to_node: 'D' }]) === 2);

check('an empty record set is zero units, not an error',
    physicalUnits([]) === 0);

/* ── Site lookup: by code or by exact name, case-insensitive ────────────── */

check('a site resolves by its code and by its exact name, regardless of '
    + 'case',
    idx.site('COWL').code === 'COWL' && idx.site('cowl').code === 'COWL'
    && idx.site('Cowley').code === 'COWL' && idx.site('cowley').code === 'COWL');

check('an unknown key resolves to null, not to a plausible-looking guess',
    idx.site('NOWHERE') === null && idx.site(null) === null);

/* ── at(): the full picture for one site ─────────────────────────────────── */

const cowl = idx.at('COWL');

check('at() groups strictly by node voltage and never returns a '
    + 'site-wide range across voltages: the 400kV and 132kV bands are '
    + 'separate entries, highest voltage first',
    cowl.by_voltage.length === 2
    && cowl.by_voltage[0].voltage_kv === 400 && cowl.by_voltage[1].voltage_kv === 132);

check('the internal transformer between COWL4 and COWL1 is published TWICE '
    + '(once landing on each node) but counted as ONE physical unit — the '
    + 'exact property physicalUnits exists to guarantee',
    cowl.counts.transformer_landings === 2 && cowl.counts.transformers === 1);

check('the three circuits landing only at COWL4 are three distinct '
    + 'physical units, none of them internally duplicated',
    cowl.counts.circuit_landings === 3 && cowl.counts.circuits === 3);

check('neighbours are the SITES those circuits reach, not the nodes — '
    + 'three circuits from COWL4 reach three distinct neighbour sites',
    cowl.neighbours.length === 3
    && cowl.neighbours.every(n => n.circuits === 1)
    && new Set(cowl.neighbours.map(n => n.site_code)).size === 3);

check('a voltage filter restricts at() to just that band',
    idx.at('COWL', { voltageKv: 400 }).by_voltage.length === 1
    && idx.at('COWL', { voltageKv: 400 }).by_voltage[0].voltage_kv === 400);

check('an unknown site returns null from at(), not an empty-but-present '
    + 'result that could be mistaken for a site with nothing published',
    idx.at('NOWHERE') === null);

/* ── The voltage-trust rule: a digit in a node code is never enough ──────── */

const alfa = idxU.at('ALFA');
const undeclaredBand = alfa.by_voltage.find(b => b.voltage_kv == null);
check('a node whose voltage the product does not confirm '
    + '(voltage_consistent_with_site: false) is reported as undeclared, '
    + 'never as the digit its own code happens to suggest',
    undeclaredBand !== undefined && undeclaredBand.circuits.length === 1
    && undeclaredBand.circuits[0].from_node === 'ALFAX');

check('the undeclared band sorts LAST, after every declared voltage, high '
    + 'to low',
    alfa.by_voltage[alfa.by_voltage.length - 1].voltage_kv == null
    && alfa.by_voltage[0].voltage_kv === 400);

/* ── planned_changes: visible in at(), absent from graph() edges ────────── */

const stra = idx.at('STRA');
check('a planned change is published at the site it was declared for',
    stra.by_voltage[0].planned_changes.length === 1
    && stra.by_voltage[0].planned_changes[0].year === 2029);

check('a planned change is NOT a neighbour and NOT a graph edge — it has '
    + 'not been built, so it cannot be walked',
    stra.neighbours.every(n => n.site_code !== 'FUTR')
    && idx.graph().edgesAt('STRA4').every(e => e.kind !== 'planned_change'));

/* ── graph(): the read-only adjacency view ───────────────────────────────── */

const g = idx.graph();
check('graph() declares its own schema so a consumer can refuse to run '
    + 'against the wrong shape of index',
    g.schema === 'gridatlas.module.network-topology.graph.v1');

check('graph().has() and nodeSiteCode() agree with what index() itself '
    + 'declared for the same nodes',
    g.has('COWL4') === true && g.nodeSiteCode('COWL4') === 'COWL'
    && g.has('NOPE') === false && g.nodeSiteCode('NOPE') === null);

check('graph().nodeVoltageKv() applies the exact same trust rule as at() '
    + 'does, on the second fixture — undeclared for ALFAX, declared for '
    + 'its neighbour',
    idxU.graph().nodeVoltageKv('ALFAX') === null
    && idxU.graph().nodeVoltageKv('BETA4') === 400
    && g.nodeVoltageKv('ISLE1') === 132);

check('graph().nodesOfSite() returns every node at a site, sorted, and '
    + 'graph().siteByCode() returns the site record itself',
    JSON.stringify(g.nodesOfSite('COWL')) === JSON.stringify(['COWL1', 'COWL4'])
    && g.siteByCode('DIDC').name === 'Didcot' && g.siteByCode('NOPE') === null);

/* ── ratingsOf / parametersOf: only what is actually published ──────────── */

check('ratingsOf returns only the seasons the row actually publishes, and '
    + 'null when none are',
    Object.keys(ratingsOf({ winter_mva: 100 })).length === 1
    && ratingsOf({}) === null);

check('parametersOf returns only the R/X/B fields the row actually '
    + 'publishes, and null when none are',
    Object.keys(parametersOf({ r_pct_100mva: 0.5 })).length === 1
    && parametersOf({}) === null);

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('network-topology proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('network-topology proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
