/* interconnector-economics.proof.mjs — an edge between two systems, priced.
 *
 * The fleet used throughout is the real one in data-interconnectors:
 * ten operational links with BMRS codes totalling 10.3 GW, and six future
 * projects totalling 7.65 GW with no code yet. The distinction those codes
 * mark — observable flow against planned capacity — is the one most easily
 * lost when someone adds the two numbers together.
 *
 * Run: node proofs/interconnector-economics.proof.mjs
 */

import * as mod from '../engine/interconnector-economics.js';
const { schema, NOT_COMPUTED, flowDirection, energyTransferredGwh,
    congestionRentGbp, fleetCapacity, shareOfDemand } = mod;

const failures = [];
let passed = 0;
const check = (n, c) => { c ? passed += 1 : failures.push(n); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, p) => { try { fn(); return false; } catch (e) { return p.test(e.message); } };

/* The committed reference table, reference/interconnector_cables.csv. */
const FLEET = [
    { bmrsCode: 'INTFR', country: 'France', name: 'IFA', capacityGw: 2.0, status: 'operational' },
    { bmrsCode: 'INTIFA2', country: 'France', name: 'IFA2', capacityGw: 1.0, status: 'operational' },
    { bmrsCode: 'INTELEC', country: 'France', name: 'ElecLink', capacityGw: 1.0, status: 'operational' },
    { bmrsCode: 'INTNED', country: 'Netherlands', name: 'BritNed', capacityGw: 1.0, status: 'operational' },
    { bmrsCode: 'INTNEM', country: 'Belgium', name: 'Nemo Link', capacityGw: 1.0, status: 'operational' },
    { bmrsCode: 'INTNSL', country: 'Norway', name: 'North Sea Link', capacityGw: 1.4, status: 'operational' },
    { bmrsCode: 'INTVKL', country: 'Denmark', name: 'Viking Link', capacityGw: 1.4, status: 'operational' },
    { bmrsCode: 'INTEW', country: 'Ireland', name: 'East West Interconnector', capacityGw: 0.5, status: 'operational' },
    { bmrsCode: 'INTGRNL', country: 'Ireland', name: 'Greenlink', capacityGw: 0.5, status: 'operational' },
    { bmrsCode: 'INTIRL', country: 'Northern Ireland', name: 'Moyle', capacityGw: 0.5, status: 'operational' },
    { bmrsCode: '', country: 'Germany', name: 'NeuConnect', capacityGw: 1.4, status: 'future' },
    { bmrsCode: '', country: 'Germany', name: 'Tarchon Energy', capacityGw: 1.4, status: 'future' },
    { bmrsCode: '', country: 'Netherlands', name: 'LionLink', capacityGw: 2.0, status: 'future' },
    { bmrsCode: '', country: 'Belgium', name: 'Nautilus', capacityGw: 1.4, status: 'future' },
    { bmrsCode: '', country: 'Ireland', name: 'MaresConnect', capacityGw: 0.75, status: 'future' },
    { bmrsCode: '', country: 'Northern Ireland', name: 'LirIC', capacityGw: 0.7, status: 'future' }
];

check('schema is declared', schema === 'ventus-grid-engine.interconnector-economics.v1');

/* ── Direction follows the spread, not a preference. ────────────────────── */

check('GB dearer than the neighbour imports',
    flowDirection({ gbPriceGbpPerMwh: 90, neighbourPriceGbpPerMwh: 60 }).direction === 'import to GB');

check('GB cheaper than the neighbour exports',
    flowDirection({ gbPriceGbpPerMwh: 40, neighbourPriceGbpPerMwh: 75 }).direction === 'export from GB');

check('equal prices give no commercial incentive, and say a link may still flow for system reasons',
    flowDirection({ gbPriceGbpPerMwh: 70, neighbourPriceGbpPerMwh: 70 }).direction === 'no commercial incentive'
    && /system reasons/i.test(flowDirection({ gbPriceGbpPerMwh: 70, neighbourPriceGbpPerMwh: 70 }).basis));

check('the spread is reported unsigned, and the signed value is kept alongside it',
    (r => r.spreadGbpPerMwh === 35 && r.signedSpreadGbpPerMwh === -35)(
        flowDirection({ gbPriceGbpPerMwh: 40, neighbourPriceGbpPerMwh: 75 })));

check('both prices travel back with the direction, so it cannot be quoted without them',
    (r => r.from.gbPriceGbpPerMwh === 90 && r.from.neighbourPriceGbpPerMwh === 60)(
        flowDirection({ gbPriceGbpPerMwh: 90, neighbourPriceGbpPerMwh: 60 })));

check('a negative price is accepted, because negative prices are real',
    flowDirection({ gbPriceGbpPerMwh: -15, neighbourPriceGbpPerMwh: 40 }).direction === 'export from GB');

check('the basis says an interconnector generates nothing',
    /generates nothing/i.test(flowDirection({ gbPriceGbpPerMwh: 90, neighbourPriceGbpPerMwh: 60 }).basis));

/* ── Energy and rent. ───────────────────────────────────────────────────── */

check('IFA at 2 GW and 70% utilisation over a year moves 12,264 GWh',
    near(energyTransferredGwh({ capacityGw: 2.0, hours: 8760, utilisation: 0.7 }).value, 12264, 1));

check('a full year at full utilisation on 1 GW is 8,760 GWh',
    energyTransferredGwh({ capacityGw: 1, hours: 8760, utilisation: 1 }).value === 8760);

{
    /* 1 GW, one hour, full utilisation, £30/MWh spread = 1,000 MWh x 30 = £30,000. */
    const r = congestionRentGbp({ capacityGw: 1, hours: 1, utilisation: 1, spreadGbpPerMwh: 30 });
    check('one GW-hour across a £30/MWh spread is £30,000 of gross rent',
        near(r.value, 30000, 1e-6));
    check('the energy moved is reported alongside the money', r.energyGwh === 1);
    check('the basis says gross, and names losses, outages, cost and cap-and-floor as excluded',
        /GROSS/.test(r.basis) && /losses/i.test(r.basis) && /cap-and-floor/i.test(r.basis));
    check('the basis states plainly that it is not profit',
        /not profit/i.test(r.basis));
}

/* Scale check against the real fleet: the whole operational fleet, at a
   plausible utilisation and spread, for a year. */
check('the operational fleet at 10.3 GW and 40% for a year moves about 36 TWh',
    near(energyTransferredGwh({ capacityGw: 10.3, hours: 8760, utilisation: 0.4 }).value / 1000, 36.1, 0.2));

/* ── The fleet, and the distinction the BMRS codes mark. ────────────────── */
{
    const f = fleetCapacity({ links: FLEET });
    check('the sixteen links total 17.95 GW', near(f.value, 17.95, 1e-9));
    check('ten operational links total 10.3 GW', near(f.byStatus.operational, 10.3, 1e-9));
    check('six future links total 7.65 GW', near(f.byStatus.future, 7.65, 1e-9));
    check('capacity with a BMRS code is observable; capacity without one is a plan',
        near(f.observableGw, 10.3, 1e-9) && near(f.unobservableGw, 7.65, 1e-9));
    check('France is the largest single-country connection at 4 GW',
        near(f.byCountry.France, 4.0, 1e-9));
    check('Ireland and Northern Ireland are counted separately, because they are different systems',
        'Ireland' in f.byCountry && 'Northern Ireland' in f.byCountry);
    check('the basis warns that capacity is not energy',
        /Capacity is not energy/i.test(f.basis));
    check('the basis distinguishes an observable flow from a planned capacity',
        /observable/i.test(f.basis) && /plan rather than a measurement/i.test(f.basis));
}

/* ── Share of demand, which is meaningless without the demand. ──────────── */
{
    const s = shareOfDemand({ transferGw: 6, gbDemandGw: 40 });
    check('6 GW against a 40 GW demand is 15%', near(s.percent, 15, 1e-9));
    check('the demand used is returned with the share', s.from.gbDemandGw === 40);
    check('the basis says the same link is a different share of a summer minimum and a winter peak',
        /summer minimum and a winter peak/i.test(s.basis));
}

/* ── Input discipline. ──────────────────────────────────────────────────── */

check('a utilisation of 70 is refused, and the message says to pass 0.7',
    throws(() => energyTransferredGwh({ capacityGw: 2, hours: 8760, utilisation: 70 }), /fraction.*0\.7/s));

check('a non-numeric price is refused by type rather than coerced',
    throws(() => flowDirection({ gbPriceGbpPerMwh: '90', neighbourPriceGbpPerMwh: 60 }), /finite number/));

check('an empty fleet is refused', throws(() => fleetCapacity({ links: [] }), /non-empty array/));

check('a link without a status is refused, naming the index',
    throws(() => fleetCapacity({ links: [{ capacityGw: 1, country: 'France' }] }), /links\[0\]\.status/));

check('a zero-capacity link is refused, naming the index',
    throws(() => fleetCapacity({ links: [{ capacityGw: 0, country: 'X', status: 'operational' }] }),
        /links\[0\]\.capacityGw/));

/* ── The refusal that matters most here. ────────────────────────────────── */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function returns geometry, a route, or coordinates',
        callable.every(n => !/geometry|route|coordinate|latitude|longitude|draw|map/i.test(n)));
    check('no export carries a coordinate of any kind',
        !JSON.stringify(Object.entries(mod).filter(([, v]) => typeof v !== 'function'))
            .match(/"(lat|lon|lng|coordinates|geometry)"/i));
    check('the geometry refusal names the licensing reason rather than leaving a gap',
        /licensed/i.test(NOT_COMPUTED.cableGeometry) && /TeleGeography/i.test(NOT_COMPUTED.cableGeometry));
    check('the geometry refusal says neither NESO nor National Grid publishes an alternative',
        /NESO/.test(NOT_COMPUTED.cableGeometry) && /National Grid/.test(NOT_COMPUTED.cableGeometry));
    check('the geometry refusal says what to do if terms ever change, and warns against a screenshot',
        /deliberately/i.test(NOT_COMPUTED.cableGeometry) && /screenshot/i.test(NOT_COMPUTED.cableGeometry));
    check('no function forecasts a price',
        callable.every(n => !/forecast|predict|project(ion)?Price/i.test(n)));
    check('the refusals name geometry, price forecasting, scheduled flow, profit and losses',
        ['cableGeometry', 'priceForecast', 'scheduledFlow', 'profit', 'lossesAndAvailability']
            .every(k => k in NOT_COMPUTED));
}

if (failures.length) {
    console.error('interconnector-economics proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('interconnector-economics proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
