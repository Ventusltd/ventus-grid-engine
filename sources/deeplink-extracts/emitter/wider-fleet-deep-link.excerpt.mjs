/*
 * PROVENANCE
 * source_repo: pipelinenews
 * source_path: tools/intelligence/cartridges/wider-fleet/assets/{GEN}-wider-fleet.mjs
 * head_sha (pipelinenews): bab117e4bff007939a9230079788b8643c650a4e
 * lines: 1-80 of the file (atlasLink() and its immediate context); full file is ~300 lines
 * of DOM mounting code not part of the deep-link contract.
 *
 * This is a SECOND, separate emitter from atlas-pointer-deep-link.mjs. It builds
 * MAP links for the ~20 REPD technology types the main product spine (solar/bess/
 * wind_onshore/wind_offshore) does not carry, appended as extra tabs in the same
 * technology row. It emits technology=row.t where row.t comes from
 * build_payload.py: props.get("tech") or "other" -- i.e. it can emit "other",
 * confirmed live.
 */
/**
 * WIDER FLEET — the REPD technology types the spine does not carry, as tabs
 * in the product's own technology row.
 *
 * The DESNZ Renewable Energy Planning Database carries 24 technology types.
 * The spine admits four — Solar Photovoltaics, Battery, Wind Onshore, Wind
 * Offshore — and those four are its four tabs. This adds the other twenty to
 * the SAME row, as more tabs, under the REPD's own names. Vikram, on the
 * first attempt, which hid them behind a button in a panel of their own:
 * "I dont see the options for other tech they are not on the UI like solar,
 * BEss onshroe and offshore wind". They are on the UI now.
 *
 * HOW THIS STAYS ADDITIVE
 * -----------------------
 * The spine binds its technology handler once, at boot:
 *
 *     document.querySelectorAll("#tech .btn").forEach(...)
 *
 * to the buttons present at that moment. Tabs appended afterwards therefore
 * carry NO spine listener, and the spine's `technology` variable is never set
 * to a value its TECHNOLOGIES whitelist would reject. The four original tabs
 * keep their own handler, their own payload and their own render path,
 * untouched and unwrapped.
 *
 * When a wider tab is chosen this renders its own rows into the product's
 * table. When a spine tab is chosen the spine's own apply() runs and repaints
 * from its own data, so going back is the spine restoring itself rather than
 * this cartridge putting anything back.
 *
 * It reads no spine payload, binds no project and emits no news signal.
 */

export const WIDER_FLEET_CONTRACT = Object.freeze({
  schema: "pipelinenews.wider-fleet-cartridge.v2",
  generation: "{GEN}",
  additive_only: true,
  tabs_in_product_technology_row: true,
  reads_spine_payload: false,
  project_bindings: 0,
  eligible_for_news_signal: false,
});

/* Engine layer colours, so a technology reads the same here as on the Atlas.
   Keyed by the family the REPD updater already assigns — no second table. */
const FAMILY_COLOUR = Object.freeze({
  biomass: "#39ff14", hydro: "#00aaff", hydrogen: "#ffffff", tidal: "#00bfff",
  act: "#ff6600", caes: "#88aaff", geothermal: "#ff3300", flywheel: "#ff69b4",
  other: "#888888",
});

const ATLAS = "https://ventusltd.github.io/gridatlas/atlas/";
const PAGE = 50;

const esc = (value) => String(value == null ? "" : value)
  .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* The Atlas resolves an arrival by REPD ref and nothing else
   (identity_rule: EXACT_REPD_REF_ONLY). Without one it reports status ABSENT
   and its place-search cartridge returns before its own flyTo, so the card
   opens and the measurement runs while the camera stays on the default UK
   view -- which reads as "the map cannot find it". Watched live for Rainham
   Phase II on 2026-09-02. A row that genuinely has no resolved ref still
   links without one: the card and the measurement work, only the camera
   does not move, and that is better than sending a guessed identity. */
function atlasLink(row) {
  const query = new URLSearchParams();
  if (row.ref) query.set("repd_ref", row.ref);
  query.set("project", row.n);
  query.set("technology", row.t);
  query.set("capacity_mw", String(row.c));
  query.set("latitude", String(row.ll[1]));
  query.set("longitude", String(row.ll[0]));
  query.set("zoom", "12");
  return `${ATLAS}?${query.toString()}`;
}

const num = (value) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export async function mountWiderFleet({ host, payloadAsset }) {
  const techRow = document.getElementById("tech");
  const tableBody = document.querySelector(".tablewrap tbody");
