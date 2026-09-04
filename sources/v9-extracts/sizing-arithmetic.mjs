/**
 * Module: sizing-arithmetic
 *
 * Extracted verbatim from
 * gridatlas/atlas/modules/202609012205-sizing-arithmetic.js.
 *
 * The screening arithmetic of the SLD sandbox: physical inputs to array
 * statistics, the three named ratios (design, export, headroom), the
 * string and central topologies with their corrected nameplates, the
 * finance port of gis-sld-v5-finance.js, and the two-variable fit that
 * lands a layout on the capacity the register states.
 *
 * This is plant-sizing/financial screening arithmetic, not geodesy — it
 * is included because the task named it as one of the six extraction
 * targets. It has no dependency on geodesy, nearest-search,
 * network-topology, electrical-distance, rating-envelope or
 * corridor-estimate.
 *
 * fitToStatedCapacity is NOT pure: it mutates the `sld` object it is
 * handed (sld.inputs[outerKey/innerKey], sld.fitResidualPct,
 * sld.fitQuantumMw), exactly as the source does, and calls back into a
 * caller-supplied computeSldStats() closure. That is carried over
 * unchanged rather than "fixed" here, per the source's own note that this
 * is a mechanical, expression-for-expression port proven value-for-value
 * against the last inline copy.
 *
 * CHANGED: source is an IIFE registering itself on
 * `window.__GRIDATLAS_MODULES__.sizingArithmetic`. That wiring is
 * removed; every function is otherwise unchanged.
 */

function physicalInputs(inputs) {
  const i = inputs;
  if (i.mode === 'central') {
    return {
      mod_wp: i.mod_wp_c, mod_l: i.mod_l_c, mod_w: i.mod_w_c,
      gcr: i.gcr_c, gross_factor: i.gross_factor_c,
    };
  }
  return {
    mod_wp: i.mod_wp, mod_l: i.mod_l, mod_w: i.mod_w,
    gcr: i.gcr, gross_factor: i.gross_factor,
  };
}

function buildStats(inputs, o) {
  const p = physicalInputs(inputs);
  const dcMwp = (o.module_count * p.mod_wp) / 1e6;
  const acMw = o.ac_mw_direct != null ? o.ac_mw_direct
    : (o.dc_ac_ratio > 0 ? dcMwp / o.dc_ac_ratio : 0);
  const netModArea = o.module_count * p.mod_l * p.mod_w;
  const netArrayArea = p.gcr > 0 ? netModArea / p.gcr : 0;
  return {
    total_blocks: o.total_blocks,
    module_count: o.module_count,
    dc_mwp: dcMwp,
    ac_mw: acMw,
    dc_ac_ratio: acMw > 0 ? dcMwp / acMw : o.dc_ac_ratio,
    net_array_area_m2: netArrayArea,
    gross_site_area_m2: netArrayArea * p.gross_factor,
    block_ground_area_m2: o.total_blocks > 0 ? netArrayArea / o.total_blocks : 0,
    production_substation_ac_mva: o.production_substation_ac_mva || 0,
    ring_main_ac_mva: o.ring_main_ac_mva || 0,
    warning: o.warning || 'Check skid rating, transformer rating, cable ratings, protection, losses and grid compliance.'
  };
}

/* Three named ratios: design (DC/inverter-AC), export (DC/export-MVA) and
   headroom (inverter-AC/export-MVA). See source comment
   (sizing-arithmetic.js:66-97) for why collapsing them into one "DC/AC"
   number produced a plant specified at 1.2 being reported as 2.4. */
function consistency(inputs, stats) {
  const i = inputs;
  const string = i.mode === 'string';

  const inverterAcMw = string
    ? (stats.total_blocks * i.y_invs * i.string_inv_kva) / 1000
    : stats.total_blocks * i.inv_ac_mw_c;
  const skidAcMva = string
    ? stats.total_blocks * i.string_skid_mva
    : (i.mv_per_ring_c * i.rings_c) * i.central_skid_mva_c;
  const exportMva = Math.min(inverterAcMw, skidAcMva);

  const designRatio = inverterAcMw > 0 ? stats.dc_mwp / inverterAcMw : null;
  const exportRatio = exportMva > 0 ? stats.dc_mwp / exportMva : null;
  const headroomRatio = exportMva > 0 ? inverterAcMw / exportMva : null;
  const statedRatio = string ? Number(i.dc_ac_ratio) : (
    i.inv_ac_mw_c > 0 ? i.inv_dc_mw_c / i.inv_ac_mw_c : null);

  const notes = [];
  /* Descriptive, not a verdict. A design ratio below one is stated with
     its meaning, not graded: oversizing inverters against the
     transformer is a deliberate choice in some references, not an
     arithmetic fault. */
  if (Number.isFinite(designRatio) && designRatio < 1) {
    notes.push('Array DC divided by inverter AC is ' + designRatio.toFixed(2)
      + ' from the module, string and inverter counts shown.');
  }
  if (Number.isFinite(designRatio) && Number.isFinite(statedRatio)
      && statedRatio > 0 && Math.abs(designRatio - statedRatio) / statedRatio > 0.05) {
    notes.push('Stated DC/AC ' + statedRatio.toFixed(2) + ', but the module '
      + 'and inverter counts give ' + designRatio.toFixed(2)
      + '. The model displays both and does not rewrite either input.');
  }
  if (Number.isFinite(inverterAcMw) && Number.isFinite(skidAcMva)
      && inverterAcMw > skidAcMva * 1.001) {
    notes.push('Inverters total ' + inverterAcMw.toFixed(1) + ' MW against '
      + skidAcMva.toFixed(1) + ' MVA of skid transformer, a ratio of '
      + (headroomRatio || 0).toFixed(2) + '. Export is set by the '
      + 'lower nameplate in this screening model. The connection agreement '
      + 'and electrical design determine the applicable export constraint.');
  }
  return {
    dc_mwp: stats.dc_mwp,
    inverter_ac_mw: inverterAcMw,
    skid_ac_mva: skidAcMva,
    export_mva: exportMva,
    design_dc_ac: designRatio,
    export_dc_ac: exportRatio,
    inverter_to_export: headroomRatio,
    stated_dc_ac: Number.isFinite(statedRatio) ? statedRatio : null,
    notes,
  };
}

function stringStats(inputs) {
  const i = inputs;
  if (i.mod_wp <= 0 || i.mod_l <= 0 || i.mod_w <= 0 || i.x_mods <= 0) {
    return buildStats(i, { total_blocks: 0, module_count: 0, dc_ac_ratio: i.dc_ac_ratio });
  }
  const total_blocks = i.b_cols * i.s_subs;
  const module_count = total_blocks * i.y_invs * i.z_strings * i.x_mods;
  const inverterAcMaxMva = (i.y_invs * i.string_inv_kva) / 1000;
  const production = i.string_skid_mva;
  let warning;
  if (inverterAcMaxMva > production) {
    warning = 'Inverter ACmax exceeds the skid transformer rating. Verify temperature rating, overload strategy and clipping assumptions.';
  } else if (i.string_inv_kva > 500) {
    warning = 'Large string inverter rating selected. Verify LV switchgear, transformer, cable loading and protection.';
  }
  return buildStats(i, {
    total_blocks, module_count, dc_ac_ratio: i.dc_ac_ratio,
    ac_mw_direct: total_blocks * production,
    production_substation_ac_mva: production,
    ring_main_ac_mva: production * i.s_subs,
    warning
  });
}

function centralStats(inputs) {
  const i = inputs;
  if (i.mod_wp_c <= 0 || i.mod_l_c <= 0 || i.mod_w_c <= 0 || i.x_mods_c <= 0) {
    return buildStats(i, { total_blocks: 0, module_count: 0, dc_ac_ratio: 1.2 });
  }
  const strDcKwp = (i.x_mods_c * i.mod_wp_c) / 1000;
  const reqStrings = strDcKwp > 0 ? Math.ceil((i.inv_dc_mw_c * 1000) / strDcKwp) : 0;
  // total_blocks counts INVERTERS: inverters per MV skid, times skids per
  // ring, times rings. The skids are the level above it.
  const total_blocks = i.inv_per_mv_c * i.mv_per_ring_c * i.rings_c;
  const skid_count = i.mv_per_ring_c * i.rings_c;
  const module_count = reqStrings * i.x_mods_c * total_blocks;

  /* Two nameplates, and they are not the same number. See source comment
     (sizing-arithmetic.js:227-247): a prior version multiplied
     total_blocks (which already contains inv_per_mv_c) by inv_ac_mw_c a
     second time, and also multiplied an inverter count by a TRANSFORMER
     rating, producing 211.2 MW - larger than either real nameplate. The
     fault was in the sandbox this was ported from (gis-sld-v5-calculations.js
     line 147) and is carried across faithfully, not silently corrected,
     because this file's contract is to reproduce the corrected port, and
     the correction itself is documented here rather than assumed. */
  const inverter_ac_total = total_blocks * i.inv_ac_mw_c;
  const skid_ac_total = skid_count * i.central_skid_mva_c;
  const ac_mw_direct = Math.min(inverter_ac_total, skid_ac_total);

  // A skid carries every inverter fed into it, so the comparison that
  // matters is the whole MV block against its transformer, not one
  // inverter against it.
  const block_ac_mw = i.inv_ac_mw_c * i.inv_per_mv_c;
  let warning;
  if (block_ac_mw > i.central_skid_mva_c) {
    warning = `The ${i.inv_per_mv_c} inverters on each MV skid total `
      + `${block_ac_mw.toFixed(2)} MW against a skid rated `
      + `${i.central_skid_mva_c} MVA. Export is limited by the transformer, `
      + `not the inverters. Verify thermal rating, overload strategy and `
      + `the export limit in the connection agreement.`;
  } else if (i.inv_ac_mw_c > 10) {
    warning = 'Large central inverter or power block selected. Verify transformer, MV switchgear, harmonics, thermal loading, protection and grid code compliance.';
  }
  return buildStats(i, {
    total_blocks, module_count,
    dc_ac_ratio: i.inv_ac_mw_c > 0 ? i.inv_dc_mw_c / i.inv_ac_mw_c : 1.2,
    ac_mw_direct,
    production_substation_ac_mva: i.central_skid_mva_c,
    ring_main_ac_mva: i.central_skid_mva_c * i.mv_per_ring_c,
    central_inverter_ac_total: inverter_ac_total,
    central_skid_ac_total: skid_ac_total,
    warning
  });
}

const DEVELOPMENT_STAGES = Object.freeze({
  '0.003': 'Land Option Signed',
  '0.015': 'Grid Connection Application Accepted',
  '0.035': 'Planning Application Submitted',
  '0.055': 'Planning Permission Granted',
  '0.070': 'Grid Connection Terms Reviewed and Agreed',
  '0.080': 'Buyer or Revenue Agreement Reviewed (Power Purchase Agreement (PPA) / Offtaker)',
  '0.100': 'Construction Contract Signed and Finance Committed (Financial Close)',
});

const financeNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const DEVELOPMENT_SUCCESS = Object.freeze({
  '0.003': 10,
  '0.015': 15,
  '0.035': 30,
  '0.055': 55,
  '0.070': 70,
  '0.080': 80,
  '0.100': 95,
});

const BIFACIAL_BY_GCR = Object.freeze({
  '0.35': 8,
  '0.45': 5,
  '0.75': 2,
});

function applyDevelopmentStageDefaults(financeInputs, stageValue) {
  const stage = String(stageValue);
  if (!Object.prototype.hasOwnProperty.call(DEVELOPMENT_STAGES, stage)) return false;
  financeInputs.dev_stage = stage;
  financeInputs.dev_cost_mw = financeNumber(stage);
  financeInputs.dev_success = DEVELOPMENT_SUCCESS[stage];
  return true;
}

function applyMountingBifacial(financeByMode, mode, gcrValue) {
  const values = (financeByMode || {})[mode];
  if (!values) return false;
  const key = String(Number(gcrValue));
  if (!Object.prototype.hasOwnProperty.call(BIFACIAL_BY_GCR, key)) return false;
  values.bifacial = BIFACIAL_BY_GCR[key];
  return true;
}

/* Direct port of gis-sld-v5-finance.js computeFinance(). */
function screeningFinance(financeInputs, stats, context) {
  const f = financeInputs || (context && context.defaults) || {};
  const dcMwp = financeNumber(stats?.dc_mwp);
  const centralInverterAc = (stats?.mode || (context && context.fallbackMode)) === 'central'
    ? financeNumber(stats?.consistency?.inverter_ac_mw) : 0;
  const acMw = centralInverterAc > 0 ? centralInverterAc : financeNumber(stats?.ac_mw);
  const price = financeNumber(f.price);
  const other = financeNumber(f.other);
  const yieldVal = financeNumber(f.yield);
  const bifacial = financeNumber(f.bifacial);
  const baseLoss = financeNumber(f.losses);
  const deg = financeNumber(f.deg);
  const opexRate = financeNumber(f.opex);
  const epcEx = financeNumber(f.epc_ex);
  const floodRate = financeNumber(f.flood_rate);
  const floodAdder = f.flood ? floodRate : 0;
  const modules = financeNumber(f.modules);
  const otherCapex = financeNumber(f.other_capex);
  const fixedCapex = financeNumber(f.fixed_capex);
  const cont = financeNumber(f.cont);
  const lossExtras = financeNumber(f.loss_dc_string) + financeNumber(f.loss_lv_dc)
    + financeNumber(f.loss_lv_ac) + financeNumber(f.loss_tx) + financeNumber(f.loss_other);
  const totalLoss = baseLoss + lossExtras;
  const bessMw = financeNumber(f.bess_mw);
  const bessMwh = financeNumber(f.bess_mwh);
  const bessCapexRate = financeNumber(f.bess_capex);
  const bessCycles = financeNumber(f.bess_cycles);
  const bessRevenuePerMwh = financeNumber(f.bess_spread);
  const bessEffPercent = financeNumber(f.bess_eff);
  const safeLoss = Math.min(Math.max(totalLoss, 0), 100);
  const safeBessEff = Math.min(Math.max(bessEffPercent / 100, 0), 1);
  const effectiveYield = yieldVal * (1 + bifacial / 100);
  const year1Gen = dcMwp * effectiveYield * (1 - safeLoss / 100);
  let gen25 = 0;
  let gen35 = 0;
  for (let year = 1; year <= 35; year += 1) {
    const generation = year1Gen * Math.pow(1 - deg / 100, year - 1);
    if (year <= 25) gen25 += generation;
    gen35 += generation;
  }
  const annualSolarRevenue = year1Gen * (price + other);
  const bessAnnualValue = bessMwh * bessCycles * bessRevenuePerMwh * safeBessEff;
  const annualRevenue = annualSolarRevenue + bessAnnualValue;
  const revenue25 = gen25 * (price + other) + bessAnnualValue * 25;
  const revenue35 = gen35 * (price + other) + bessAnnualValue * 35;
  const annualOpex = acMw * opexRate;
  const baseCapexWp = epcEx + modules + otherCapex + floodAdder;
  const baseCapex = dcMwp * 1_000_000 * baseCapexWp;
  const contingency = baseCapex * (cont / 100);
  const bessCapex = bessMwh * bessCapexRate;
  const totalCapex = baseCapex + contingency + fixedCapex + bessCapex;
  const capexPerWp = dcMwp > 0 ? totalCapex / (dcMwp * 1_000_000) : 0;
  const surplus25 = revenue25 - annualOpex * 25 - totalCapex;
  const surplus35 = revenue35 - annualOpex * 35 - totalCapex;
  const devCostPerMw = financeNumber(f.dev_cost_mw);
  const devModulePerMwp = financeNumber(f.dev_module_mwp);
  const devEpcPerMw = financeNumber(f.dev_epc_mw);
  const devOwnerPerMw = financeNumber(f.dev_owner_mw);
  const devGridPerMw = financeNumber(f.dev_grid_mw);
  const devExitPerMwp = financeNumber(f.dev_exit_mwp);
  const devNpvPerMwp = financeNumber(f.dev_npv_mwp);
  const devSuccessPct = financeNumber(f.dev_success);
  const devYears = financeNumber(f.dev_years);
  const devStage = DEVELOPMENT_STAGES[String(f.dev_stage)] || 'Manual';
  const wpCapacity = dcMwp * 1_000_000;
  const devCapitalAtRisk = wpCapacity * devCostPerMw;
  const devModuleCost = wpCapacity * devModulePerMwp;
  const devEpcCost = wpCapacity * devEpcPerMw;
  const devOwnerCost = wpCapacity * devOwnerPerMw;
  const devGridCost = wpCapacity * devGridPerMw;
  const devTotalBuildCost = devCapitalAtRisk + devModuleCost + devEpcCost
    + devOwnerCost + devGridCost;
  const devExitValue = wpCapacity * devExitPerMwp;
  const devOperatingNpv = wpCapacity * devNpvPerMwp;
  const devGrossMargin = devExitValue - devTotalBuildCost;
  const devRiskAdjustedValue = devGrossMargin * (devSuccessPct / 100);
  const devReturnMultiple = devCapitalAtRisk > 0 ? devGrossMargin / devCapitalAtRisk : 0;
  return {
    annualRevenue, revenue25, revenue35, totalCapex, capexPerWp, surplus25, surplus35,
    devStage, devCostPerMw, devModulePerMwp, devEpcPerMw, devOwnerPerMw,
    devGridPerMw, devExitPerMwp, devNpvPerMwp, devSuccessPct, devYears,
    devCapitalAtRisk, devModuleCost, devEpcCost, devOwnerCost, devGridCost,
    devTotalBuildCost, devExitValue, devOperatingNpv, devGrossMargin,
    devRiskAdjustedValue, devReturnMultiple, price, other, yieldVal, bifacial,
    baseLoss, deg, opexRate, epcEx, floodActive: Boolean(f.flood), floodRate,
    modules, otherCapex, fixedCapex, cont, totalLoss, bessMw, bessMwh,
    bessCapexRate, bessCycles, bessSpread: bessRevenuePerMwh,
    bessEff: bessEffPercent, epcIncModules: epcEx + modules,
  };
}

function computeStats(inputs, financeByMode, defaults) {
  const stats = inputs.mode === 'string'
    ? stringStats(inputs) : centralStats(inputs);
  stats.mode = inputs.mode;
  stats.consistency = consistency(inputs, stats);
  stats.finance = screeningFinance((financeByMode || {})[inputs.mode], stats,
    { fallbackMode: inputs.mode, defaults });
  return stats;
}

/**
 * Size the array so its capacity lands on the figure the register states.
 * Fits over TWO integer topology counts (outer x inner) because a
 * one-variable fit cannot reach a small project - see source comment
 * (sizing-arithmetic.js:472-495) for the measured collapse of 5-50 MW
 * targets onto a single 44.8 MW layout under the one-variable version.
 *
 * fitToStatedCapacity is IMPURE: it mutates `sld.inputs[outerKey/innerKey]`,
 * `sld.fitResidualPct` and `sld.fitQuantumMw` in place, and calls the
 * caller-supplied `computeSldStats()` once per (outer, inner) candidate.
 */
const FIT_OUTER_MAX = 120;
const FIT_INNER_MAX = 12;

function fitToStatedCapacity(sld, computeSldStats) {
  sld.fitResidualPct = null;
  sld.fitQuantumMw = null;
  const target = Number(sld.targetMw);
  if (!Number.isFinite(target) || target <= 0) return;
  if (sld.targetBasis !== 'ac' && sld.targetBasis !== 'dc') return;

  const string = sld.inputs.mode === 'string';
  const outerKey = string ? 'b_cols' : 'rings_c';
  const innerKey = string ? 's_subs' : 'mv_per_ring_c';
  const outer0 = sld.inputs[outerKey];
  const inner0 = sld.inputs[innerKey];

  let best = null;
  for (let inner = 1; inner <= FIT_INNER_MAX; inner += 1) {
    sld.inputs[innerKey] = inner;
    for (let outer = 1; outer <= FIT_OUTER_MAX; outer += 1) {
      sld.inputs[outerKey] = outer;
      const s = computeSldStats();
      const got = sld.targetBasis === 'ac' ? s.ac_mw : s.dc_mwp;
      if (!Number.isFinite(got) || got <= 0) continue;
      const error = Math.abs(got - target);
      const drift = Math.abs(inner - inner0) + Math.abs(outer - outer0) / 100;
      if (!best
          || error < best.error - 1e-9
          || (Math.abs(error - best.error) <= 1e-9 && drift < best.drift)) {
        best = { outer, inner, error, got, drift };
      }
    }
  }
  if (!best) {
    sld.inputs[outerKey] = outer0;
    sld.inputs[innerKey] = inner0;
    return;
  }
  sld.inputs[outerKey] = best.outer;
  sld.inputs[innerKey] = best.inner;
  sld.fitResidualPct = ((best.got - target) / target) * 100;

  const oneMore = (() => {
    sld.inputs[outerKey] = best.outer + 1;
    const s = computeSldStats();
    sld.inputs[outerKey] = best.outer;
    const got = sld.targetBasis === 'ac' ? s.ac_mw : s.dc_mwp;
    return Number.isFinite(got) ? Math.abs(got - best.got) : null;
  })();
  sld.fitQuantumMw = oneMore;
}

export {
  DEVELOPMENT_STAGES,
  DEVELOPMENT_SUCCESS,
  BIFACIAL_BY_GCR,
  FIT_OUTER_MAX,
  FIT_INNER_MAX,
  financeNumber,
  physicalInputs,
  buildStats,
  consistency,
  stringStats,
  centralStats,
  applyDevelopmentStageDefaults,
  applyMountingBifacial,
  screeningFinance,
  computeStats,
  fitToStatedCapacity
};

export const generation = '202609012205';
