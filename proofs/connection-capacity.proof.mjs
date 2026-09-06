/* connection-capacity.proof.mjs — sizing an asset against a stated cap.
 *
 * The case that drives every check: a site capped at 30 MW whose profile
 * exceeds it. Peak excess sets the power; the AREA above the cap sets the
 * store. Two profiles with an identical peak and very different shapes must
 * produce the same power and very different energy — that is the whole reason
 * this module takes a profile rather than a peak.
 *
 * Run: node proofs/connection-capacity.proof.mjs
 */

import * as mod from '../engine/connection-capacity.js';
const { schema, NOT_COMPUTED, exceedance, batteryForPeakShaving, clippedEnergy, netAtConnection } = mod;

const failures = [];
let passed = 0;
const check = (n, c) => { c ? passed += 1 : failures.push(n); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn, p) => { try { fn(); return false; } catch (e) { return p.test(e.message); } };

const HALF_HOUR = 0.5;

check('schema is declared', schema === 'ventus-grid-engine.connection-capacity.v1');

/* ── Exceedance. ────────────────────────────────────────────────────────── */
{
    /* Four half-hours: 20, 42, 36, 20 MW against a 30 MW cap. */
    const ex = exceedance({ profileKw: [20, 42, 36, 20], capKw: 30, intervalHours: HALF_HOUR });
    check('peak and peak excess are found', ex.peakKw === 42 && ex.peakExcessKw === 12);
    check('two of four intervals are above the cap', ex.intervalsAboveCap === 2);
    check('energy above the cap is the area, not the peak: (12 + 6) x 0.5 = 9',
        near(ex.energyAboveCapKwh, 9, 1e-9));
    check('fraction of time above the cap is reported', near(ex.fractionOfTimeAboveCap, 0.5, 1e-12));
    check('site load factor is computed from the profile',
        near(ex.siteLoadFactor, (20 + 42 + 36 + 20) * 0.5 / (42 * 2), 1e-12));
    check('a profile inside the cap reports withinCap and needs no shaving',
        exceedance({ profileKw: [10, 20, 25], capKw: 30, intervalHours: HALF_HOUR }).withinCap === true);
}

/* THE point of taking a profile: same peak, different shape, same power,
   very different store. A spike and a plateau are not the same asset. */
{
    const spike = exceedance({ profileKw: [30, 42, 30, 30, 30, 30, 30, 30], capKw: 30, intervalHours: HALF_HOUR });
    const plateau = exceedance({ profileKw: [42, 42, 42, 42, 42, 42, 42, 42], capKw: 30, intervalHours: HALF_HOUR });
    check('a spike and a plateau share the same peak excess',
        spike.peakExcessKw === plateau.peakExcessKw && spike.peakExcessKw === 12);
    check('but the plateau needs eight times the energy above the cap',
        near(plateau.energyAboveCapKwh / spike.energyAboveCapKwh, 8, 1e-9));
    check('so sizing from the peak alone would under-size the store eightfold — '
        + 'the basis says the two can differ by a factor of forty in cost',
        /factor of forty/i.test(spike.basis));
}

/* ── Battery sizing. ────────────────────────────────────────────────────── */
{
    const b = batteryForPeakShaving({
        profileKw: [20, 42, 36, 20], capKw: 30, intervalHours: HALF_HOUR,
        roundTripEfficiency: 0.88, depthOfDischarge: 0.9
    });
    check('power comes from the peak excess', b.powerKw === 12);
    check('usable energy is the area above the cap', near(b.usableEnergyKwh, 9, 1e-9));
    check('stored energy divides by round-trip efficiency: 9 / 0.88',
        near(b.chargeEnergyRequiredKwh, 9 / 0.88, 1e-9));
    check('installed energy divides again by depth of discharge: 9 / 0.88 / 0.9',
        near(b.installedEnergyKwh, 9 / 0.88 / 0.9, 1e-9));
    check('efficiency and depth of discharge only ever make the asset bigger',
        b.installedEnergyKwh > b.usableEnergyKwh);
    check('duration is installed energy over power', near(b.durationHours, b.installedEnergyKwh / 12, 1e-12));
    check('the basis says this sizes a physical duty and is not an optimised dispatch',
        /not an optimised revenue dispatch/i.test(b.basis));

    const none = batteryForPeakShaving({
        profileKw: [10, 20], capKw: 30, intervalHours: HALF_HOUR,
        roundTripEfficiency: 0.88, depthOfDischarge: 0.9
    });
    check('a site inside its cap needs no battery for shaving, and the basis says a battery '
        + 'may still be worth having for reasons this function does not assess',
        none.powerKw === 0 && none.installedEnergyKwh === 0 && /does not assess them/i.test(none.basis));
}

/* ── Solar clipping. ────────────────────────────────────────────────────── */
{
    const c = clippedEnergy({ generationKw: [0, 5, 12, 14, 12, 5, 0], exportCapKw: 10, intervalHours: 1 });
    check('clipped energy is the area above the export cap: 2 + 4 + 2 = 8',
        near(c.clippedKwh, 8, 1e-9));
    check('delivered energy caps each clipped interval at the export limit',
        near(c.deliveredKwh, 0 + 5 + 10 + 10 + 10 + 5 + 0, 1e-9));
    check('potential is delivered plus clipped', near(c.potentialKwh, c.deliveredKwh + c.clippedKwh, 1e-9));
    check('the clipped fraction is reported as a proportion of what the array would have made',
        near(c.clippedFraction, 8 / 48, 1e-9));
    check('an array inside its cap clips nothing',
        clippedEnergy({ generationKw: [0, 5, 9], exportCapKw: 10, intervalHours: 1 }).clippedKwh === 0);
}

/* ── Net position, with separate import and export caps. ────────────────── */
{
    const n = netAtConnection({
        loadKw: [10, 10, 10, 40], generationKw: [0, 25, 5, 0],
        importCapKw: 30, exportCapKw: 10, intervalHours: HALF_HOUR
    });
    check('peak import is the worst net demand', n.peakImportKw === 40);
    check('peak export is the worst net generation', n.peakExportKw === 15);
    check('an import breach is counted', n.importBreaches === 1);
    check('an export breach is counted separately', n.exportBreaches === 1);
    check('a site breaching either cap is not within both', n.withinBothCaps === false);
    check('the basis warns that netting import and export into one figure hides a breach',
        /hides a breach in either direction/i.test(n.basis));

    check('a site inside both caps says so',
        netAtConnection({ loadKw: [10, 10], generationKw: [0, 5], importCapKw: 30, exportCapKw: 10, intervalHours: HALF_HOUR })
            .withinBothCaps === true);
}

/* ── Input discipline. ──────────────────────────────────────────────────── */

check('an efficiency of 88 is refused, and the message says to pass 0.88',
    throws(() => batteryForPeakShaving({ profileKw: [40], capKw: 30, intervalHours: 0.5, roundTripEfficiency: 88, depthOfDischarge: 0.9 }),
        /fraction.*0\.88/s));

check('an empty profile is refused', throws(() => exceedance({ profileKw: [], capKw: 30, intervalHours: 0.5 }), /non-empty array/));

check('a negative profile value is refused, naming the index',
    throws(() => exceedance({ profileKw: [10, -5], capKw: 30, intervalHours: 0.5 }), /profileKw\[1\].*not be negative/s));

check('mismatched load and generation profiles are refused, naming both lengths',
    throws(() => netAtConnection({ loadKw: [1, 2, 3], generationKw: [1], importCapKw: 10, exportCapKw: 10, intervalHours: 0.5 }),
        /3 intervals.*generationKw has 1;.*same period/s));

check('an interval longer than a day is refused',
    throws(() => exceedance({ profileKw: [10], capKw: 5, intervalHours: 48 }), /at most 24/));

/* ── Refusals. ──────────────────────────────────────────────────────────── */
{
    const callable = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    check('no function returns available connection capacity, headroom or a cost',
        callable.every(n => !/available|headroom|spare|cost|price/i.test(n)));
    check('no function claims to optimise a dispatch',
        callable.every(n => !/optimi[sz]e|dispatch|revenue|arbitrage/i.test(n)));
    check('the refusals name all four boundaries',
        ['availableConnectionCapacity', 'connectionCost', 'optimisedDispatch', 'degradationAndWarranty']
            .every(k => k in NOT_COMPUTED));
    check('the refusal on available capacity says it is commercial, not physical, '
        + 'and that nothing on a map implies it',
        /commercial parameter, not a physical property/i.test(NOT_COMPUTED.availableConnectionCapacity)
        && /nothing on a map implies it/i.test(NOT_COMPUTED.availableConnectionCapacity));
}

if (failures.length) {
    console.error('connection-capacity proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('connection-capacity proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
