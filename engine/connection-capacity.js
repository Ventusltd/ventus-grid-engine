/**
 * Module: connection-capacity
 *
 * APPLIED ENGINEERING for the people who actually have to build something: a
 * developer, an EPC, or a heavy energy user with an agreed capacity at a
 * connection and a load or generation profile that does not fit inside it.
 *
 * THE QUESTION THIS ANSWERS.
 * "My site is capped at 30 MVA. My demand peaks at 42. How much battery, in MW
 * and in MWh, keeps me inside the cap — and how often would it have to work?"
 * That is a real, daily, commercially decisive calculation, and it is ordinary
 * arithmetic over a profile once the cap is stated. It is offered here in full.
 *
 * WHY THE CAP IS AN INPUT AND NEVER AN INFERENCE.
 * An agreed import or export capacity is a commercial parameter written into a
 * connection agreement. It is not a physical property of the network and it
 * cannot be derived from a map, a rating, or a fault level. So every function
 * here takes the cap from the caller. Nothing in this module will ever tell you
 * what cap you could get — that is an application and an offer.
 *
 * WHY A PROFILE AND NOT A PEAK.
 * Sizing a battery from the peak alone gives you the POWER and tells you
 * nothing about the ENERGY. A site that exceeds its cap by 12 MW for six
 * minutes needs a very different asset from one that exceeds it by 12 MW for
 * four hours, and the difference is a factor of forty in cost. The energy comes
 * from the area above the cap, which needs the shape. These functions therefore
 * take an interval profile and an interval length, and report both power and
 * energy, plus how many intervals were involved.
 *
 * ROUND-TRIP EFFICIENCY IS APPLIED WHERE IT ACTUALLY BITES.
 * A battery discharging E kWh to the site must have stored E / eta kWh, so the
 * charging requirement — and the grid energy bought to do it — is larger than
 * the energy delivered. Sizing the usable energy without dividing by efficiency
 * under-sizes the asset. Depth of discharge is applied on top, because an
 * installed pack is never fully usable.
 *
 * SOLAR CLIPPING IS THE SAME ARITHMETIC POINTING THE OTHER WAY.
 * A DC array behind a smaller AC connection loses the area above the cap, every
 * time. That loss is often acceptable and sometimes deliberate — oversizing DC
 * against a constrained export limit is a normal design choice — but it has to
 * be quantified rather than assumed away.
 *
 * WHAT THIS MODULE REFUSES.
 * It will not tell you what connection capacity is available, what it would
 * cost, whether an offer would be made, or what the network can accept. Those
 * are the operator's answers. It also will not optimise a dispatch: the
 * shaving here is the simple, physically necessary one — discharge exactly the
 * excess — which is the right basis for SIZING. A revenue-stacking dispatch is
 * a different problem with commercial inputs this module does not have.
 *
 * Schema: ventus-grid-engine.connection-capacity.v1
 */

export const schema = 'ventus-grid-engine.connection-capacity.v1';

function positive(name, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, received ${v === null ? 'null' : typeof v}`);
    }
    if (v <= 0) throw new RangeError(`${name} must be greater than zero, received ${v}`);
    return v;
}

function ratio(name, v) {
    positive(name, v);
    if (v > 1) throw new RangeError(
        `${name} must be a fraction in (0, 1], received ${v}. A percentage such as 88 must be passed as 0.88.`);
    return v;
}

function profileOf(name, p) {
    if (!Array.isArray(p) || p.length === 0) {
        throw new TypeError(`${name} must be a non-empty array of interval values`);
    }
    p.forEach((v, i) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new TypeError(`${name}[${i}] must be a finite number, received ${typeof v}`);
        }
        if (v < 0) throw new RangeError(`${name}[${i}] must not be negative, received ${v}`);
    });
    return p;
}

/**
 * How far, how often and how much a profile exceeds a stated cap.
 *
 * The foundation of everything below: peak excess sets the POWER, the area
 * above the cap sets the ENERGY, and the interval count says how often it
 * matters.
 */
export function exceedance({ profileKw, capKw, intervalHours }) {
    profileOf('profileKw', profileKw);
    positive('capKw', capKw);
    positive('intervalHours', intervalHours);
    if (intervalHours > 24) throw new RangeError(`intervalHours must be at most 24, received ${intervalHours}`);

    let peakExcess = 0, energyKwh = 0, intervals = 0, peakKw = 0, totalKwh = 0;
    for (const v of profileKw) {
        totalKwh += v * intervalHours;
        if (v > peakKw) peakKw = v;
        const over = v - capKw;
        if (over > 0) {
            intervals += 1;
            energyKwh += over * intervalHours;
            if (over > peakExcess) peakExcess = over;
        }
    }
    const spanHours = profileKw.length * intervalHours;
    return {
        schema,
        quantity: 'exceedance_above_cap',
        peakKw,
        capKw,
        peakExcessKw: peakExcess,
        energyAboveCapKwh: energyKwh,
        intervalsAboveCap: intervals,
        intervalCount: profileKw.length,
        fractionOfTimeAboveCap: intervals / profileKw.length,
        spanHours,
        siteEnergyKwh: totalKwh,
        siteLoadFactor: totalKwh / (peakKw * spanHours),
        withinCap: peakExcess === 0,
        basis: peakExcess === 0
            ? `The profile peaks at ${peakKw} kW and never exceeds the ${capKw} kW cap. No shaving is required.`
            : `The profile peaks at ${peakKw} kW against a ${capKw} kW cap: a peak excess of ` +
              `${peakExcess} kW, exceeded in ${intervals} of ${profileKw.length} intervals ` +
              `(${((intervals / profileKw.length) * 100).toFixed(1)}% of the time), with ` +
              `${energyKwh.toFixed(1)} kWh above the cap across ${spanHours} hours. The peak excess ` +
              `sizes the POWER; the energy above the cap sizes the STORE. Sizing from the peak alone ` +
              `says nothing about the second, and the two can differ by a factor of forty in cost.`
    };
}

/**
 * The battery that keeps a profile inside its cap.
 *
 * Power from the peak excess. Usable energy from the area above the cap.
 * Installed energy from usable energy after round-trip efficiency and depth of
 * discharge — both of which make the asset BIGGER, never smaller.
 */
export function batteryForPeakShaving({ profileKw, capKw, intervalHours, roundTripEfficiency, depthOfDischarge }) {
    const ex = exceedance({ profileKw, capKw, intervalHours });
    ratio('roundTripEfficiency', roundTripEfficiency);
    ratio('depthOfDischarge', depthOfDischarge);

    const usableKwh = ex.energyAboveCapKwh;
    const storedKwh = usableKwh / roundTripEfficiency;
    const installedKwh = storedKwh / depthOfDischarge;
    const powerKw = ex.peakExcessKw;

    return {
        schema,
        quantity: 'battery_for_peak_shaving',
        powerKw,
        usableEnergyKwh: usableKwh,
        installedEnergyKwh: installedKwh,
        durationHours: powerKw > 0 ? installedKwh / powerKw : 0,
        chargeEnergyRequiredKwh: storedKwh,
        cyclesImplied: ex.intervalsAboveCap > 0 ? 1 : 0,
        from: {
            capKw, roundTripEfficiency, depthOfDischarge,
            peakExcessKw: ex.peakExcessKw, energyAboveCapKwh: ex.energyAboveCapKwh,
            intervalsAboveCap: ex.intervalsAboveCap
        },
        basis: ex.withinCap
            ? `The profile never exceeds the ${capKw} kW cap, so no battery is required for shaving. ` +
              `A battery may still be worth having for other reasons; this function does not assess them.`
            : `To hold the site inside ${capKw} kW: ${powerKw} kW of power, set by the worst interval, ` +
              `and ${usableKwh.toFixed(1)} kWh delivered, set by the area above the cap. Delivering ` +
              `that requires ${storedKwh.toFixed(1)} kWh stored at ${roundTripEfficiency} round-trip, ` +
              `and an installed ${installedKwh.toFixed(1)} kWh at ${depthOfDischarge} depth of ` +
              `discharge — about a ${(installedKwh / powerKw).toFixed(2)}-hour asset. Efficiency and ` +
              `depth of discharge only ever make it bigger. This sizes for the simple physical duty ` +
              `of discharging exactly the excess; it is not an optimised revenue dispatch.`
    };
}

/**
 * Energy lost when generation behind a connection exceeds its export cap.
 *
 * Oversizing DC against a constrained AC connection is a normal design choice.
 * It is only a good one when the loss is quantified.
 */
export function clippedEnergy({ generationKw, exportCapKw, intervalHours }) {
    profileOf('generationKw', generationKw);
    positive('exportCapKw', exportCapKw);
    positive('intervalHours', intervalHours);

    let clippedKwh = 0, deliveredKwh = 0, intervals = 0, peakKw = 0;
    for (const v of generationKw) {
        if (v > peakKw) peakKw = v;
        const over = v - exportCapKw;
        if (over > 0) { clippedKwh += over * intervalHours; intervals += 1; deliveredKwh += exportCapKw * intervalHours; }
        else deliveredKwh += v * intervalHours;
    }
    const potentialKwh = clippedKwh + deliveredKwh;
    return {
        schema,
        quantity: 'clipped_energy',
        clippedKwh,
        deliveredKwh,
        potentialKwh,
        clippedFraction: potentialKwh > 0 ? clippedKwh / potentialKwh : 0,
        intervalsClipped: intervals,
        peakGenerationKw: peakKw,
        exportCapKw,
        basis: clippedKwh === 0
            ? `Generation peaks at ${peakKw} kW and never exceeds the ${exportCapKw} kW export cap. Nothing is clipped.`
            : `Generation peaks at ${peakKw} kW against a ${exportCapKw} kW export cap. ` +
              `${clippedKwh.toFixed(1)} kWh is clipped across ${intervals} intervals — ` +
              `${((clippedKwh / potentialKwh) * 100).toFixed(2)}% of what the array would otherwise ` +
              `have produced. Oversizing behind a constrained connection is a legitimate design ` +
              `choice; it is only a good one once this number is known rather than assumed away.`
    };
}

/**
 * Net position at the connection point for a site with both load and
 * generation, against separate import and export caps.
 */
export function netAtConnection({ loadKw, generationKw, importCapKw, exportCapKw, intervalHours }) {
    profileOf('loadKw', loadKw);
    profileOf('generationKw', generationKw);
    if (loadKw.length !== generationKw.length) {
        throw new RangeError(
            `loadKw has ${loadKw.length} intervals and generationKw has ${generationKw.length}; ` +
            `they must describe the same period at the same resolution.`);
    }
    positive('importCapKw', importCapKw);
    positive('exportCapKw', exportCapKw);
    positive('intervalHours', intervalHours);

    let peakImport = 0, peakExport = 0, importKwh = 0, exportKwh = 0;
    let importBreaches = 0, exportBreaches = 0;
    for (let i = 0; i < loadKw.length; i++) {
        const net = loadKw[i] - generationKw[i];
        if (net >= 0) {
            importKwh += net * intervalHours;
            if (net > peakImport) peakImport = net;
            if (net > importCapKw) importBreaches += 1;
        } else {
            const exp = -net;
            exportKwh += exp * intervalHours;
            if (exp > peakExport) peakExport = exp;
            if (exp > exportCapKw) exportBreaches += 1;
        }
    }
    return {
        schema,
        quantity: 'net_position_at_connection',
        peakImportKw: peakImport,
        peakExportKw: peakExport,
        importKwh,
        exportKwh,
        importCapKw,
        exportCapKw,
        importBreaches,
        exportBreaches,
        withinBothCaps: importBreaches === 0 && exportBreaches === 0,
        basis:
            `Net of load against generation, interval by interval: peak import ${peakImport.toFixed(1)} kW ` +
            `against a ${importCapKw} kW cap (${importBreaches} breaches), peak export ` +
            `${peakExport.toFixed(1)} kW against a ${exportCapKw} kW cap (${exportBreaches} breaches). ` +
            `Import and export caps are separate commercial parameters and are frequently different ` +
            `numbers; netting them into one figure hides a breach in either direction.`
    };
}

export const NOT_COMPUTED = Object.freeze({
    availableConnectionCapacity:
        'What capacity you could be offered is the network operator\'s answer, from an application. It is a commercial parameter, not a physical property, and nothing on a map implies it.',
    connectionCost:
        'Reinforcement cost depends on the works the operator specifies and on cost apportionment rules. It cannot be derived from a demand profile.',
    optimisedDispatch:
        'The shaving here is the simple physical duty — discharge exactly the excess — which is the correct basis for SIZING. Revenue-stacked dispatch across markets is a different problem needing commercial inputs this module does not have.',
    degradationAndWarranty:
        'Cycle life, calendar ageing and warranty terms belong to the cell supplier and the contract. This module sizes for the duty; it does not tell you what that duty costs the asset.'
});
