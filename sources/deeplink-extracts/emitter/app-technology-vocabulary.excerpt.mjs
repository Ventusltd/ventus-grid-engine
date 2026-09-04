/*
 * PROVENANCE (excerpt, not the whole file)
 * source_repo: pipelinenews
 * source_path: releases/202609032329-pipelinenews/assets/202608291447-app.mjs
 * head_sha (pipelinenews): ade103ae2a2eec4f334e159b479f20b857d63515
 * This file has been unchanged (same filename, same content) since generation
 * 202608291447 and is still the app.mjs shipped in the latest release folder
 * (202609032329-pipelinenews) as of HEAD.
 *
 * Excerpt A: line 1 -- the import of the emitter (buildAtlasV9DeepLink) from
 *   ./202608312037-atlas-pointer-deep-link.mjs, i.e. the "ported" ACTIVE_TARGET
 *   version, not the 202608311343 sibling.
 */
import { buildAtlasV9DeepLink } from "./202608312037-atlas-pointer-deep-link.mjs";

/* Excerpt B: lines 105-118 -- the complete technology bucket vocabulary this
 * emitter can hold (LABELS/COLOURS/UNITS/TECHNOLOGIES). Four spine buckets:
 * solar, bess, wind_onshore, wind_offshore. (The wider-fleet cartridge, a
 * separate emitter, adds nine more buckets plus "other" -- see
 * wider-fleet-deep-link.mjs in this same directory.) */
const LABELS = Object.freeze({
  solar: "Solar",
  bess: "Battery Storage",
  wind_onshore: "Onshore Wind",
  wind_offshore: "Offshore Wind",
});
const COLOURS = Object.freeze({
  solar: "#ffff00",
  bess: "#ffae00",
  wind_onshore: "#00ffff",
  wind_offshore: "#0066ff",
});
const UNITS = Object.freeze({ solar: "MWp", bess: "MW", wind_onshore: "MW", wind_offshore: "MW" });
const TECHNOLOGIES = new Set(["all", "solar", "bess", "wind_onshore", "wind_offshore"]);

/* Excerpt C: lines 405-419 -- how project.technology is produced: a dictionary
 * lookup (dictionary("technology", row[FIELD.technology])), so the value
 * handed to buildAtlasV9DeepLink is always exactly one of the TECHNOLOGIES
 * bucket strings above, never a raw REPD technology-type string. */
function dictionary(name, index) {
  return dictionaries[name][index] ?? "";
}

function project(index) {
  const row = rows[index];
  return {
    index,
    row,
    repd_ref: row[FIELD.repdRef],
    gg_project_id: row[FIELD.projectId],
    name: row[FIELD.name],
    technology: dictionary("technology", row[FIELD.technology]),
    status: dictionary("status", row[FIELD.status]),
    capacity_mw: Number(row[FIELD.capacity]),

/* Excerpt D: lines 488-491 -- the MAP button's href is exactly this emitter's
 * output; nothing else in app.mjs builds the URL. */

function atlasUrl(item) {
  return buildAtlasV9DeepLink(item);
}
