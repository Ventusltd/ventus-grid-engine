/**
 * Module: published-fault-level
 *
 * PUBLISHED, DATED, NEVER CALCULATED.
 *
 * This module is the estate's contract for carrying a fault-level figure on
 * an open map. It exists because a domain expert asked, on 2026-09-05,
 * whether the Atlas had "maximum fault level currents for substations in the
 * UK", and the honest answer was in three parts: it already carried a
 * published transmission figure; it would never carry a computed one; and
 * the number that binds anyone is the one the DNO produces at their point of
 * connection and writes into the offer.
 *
 * WHAT A FAULT LEVEL IS, AND WHY ONE NUMBER IS NOT ONE.
 * The short-circuit current at a busbar is set by the Thevenin equivalent
 * impedance the network presents there, Z = R + jX. The magnitude sets the
 * symmetrical current; the X/R ratio sets how quickly the DC offset decays,
 * which is why the first-cycle peak ("make") and the RMS current at contact
 * parting ("break") are different figures for the same bus, and why a
 * three-phase and a single-phase-to-earth fault differ again. NESO's ETYS
 * Appendix D publishes EIGHT separately named currents for this reason, and
 * data-grid-gb's contract says the consumer "must not collapse them into a
 * single generic fault level". This module enforces that: a record carries
 * named metrics, and nothing here will ever call any of them "the fault
 * level".
 *
 * WHY IT IS A NETWORK-STATE PROPERTY AND NOT A SUBSTATION ATTRIBUTE.
 * Open a bus section and the impedance changes; connect another generator
 * and it changes again; the transmission contribution upstream changes with
 * demand case. A published figure is therefore a snapshot under a stated
 * study basis on a stated date. This module refuses a record that does not
 * carry that basis and that date, because a figure without them is not a
 * measurement, it is a rumour.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO.
 * It has no function that computes a fault current. It has no function that
 * computes headroom against a switchgear rating. Both are the tempting next
 * step and both are wrong here: a computed current needs the DNO's model and
 * running arrangement, which are not public; a headroom figure needs the
 * asset's several ratings (make, break, short-time withstand, peak withstand)
 * matched to the RIGHT published metric, and mismatching them is how a
 * screening tool becomes a false connection assessment. The proof asserts
 * these functions are ABSENT, so their absence is a tested property rather
 * than an omission.
 *
 * The boundary, in the architect's words to a peer the same day: "we can
 * definitely analyse private wires but the implementation is way beyond what
 * AI can do as it needs engineering with electrical network impedance
 * analysis". A published figure narrows a search. It never makes a decision.
 *
 * Depends on: nothing. Pure validation and formatting of caller-supplied,
 * already-published data. No network, no DOM, no arithmetic on currents.
 *
 * Schema: ventus-grid-engine.published-fault-level.v1
 */

export const schema = 'ventus-grid-engine.published-fault-level.v1';

/* The eight currents NESO publishes in ETYS Appendix D, named exactly as
   data-grid-gb normalises them (chatgpt/ingest_etys.py FAULT_COLUMNS). A
   distribution publication may use a subset, or add the metrics DNOs commonly
   publish in an LTDS; those must be DECLARED with a unit rather than smuggled
   in under a generic name. */
export const ETYS_METRICS = Object.freeze([
  'three_phase_initial_peak_current_ka',
  'three_phase_rms_break_current_ka',
  'three_phase_dc_break_current_ka',
  'three_phase_peak_break_current_ka',
  'single_phase_initial_peak_current_ka',
  'single_phase_rms_break_current_ka',
  'single_phase_dc_break_current_ka',
  'single_phase_peak_break_current_ka'
]);

/* Metrics a DNO Long Term Development Statement commonly publishes. Kept
   separate from the ETYS eight so a reader can see which publisher a name
   belongs to; the two sets are never merged into one "fault level". */
export const LTDS_METRICS = Object.freeze([
  'three_phase_fault_level_mva',
  'three_phase_fault_current_ka',
  'single_phase_earth_fault_current_ka',
  'x_over_r_ratio'
]);

/* Every known metric with its unit and the plain-English label a card may
   print. The label is the ONLY string this module will ever put next to a
   number. */
export const METRIC_LABELS = Object.freeze({
  three_phase_initial_peak_current_ka: { unit: 'kA', label: 'three-phase initial peak current' },
  three_phase_rms_break_current_ka: { unit: 'kA', label: 'three-phase RMS break current' },
  three_phase_dc_break_current_ka: { unit: 'kA', label: 'three-phase DC break current' },
  three_phase_peak_break_current_ka: { unit: 'kA', label: 'three-phase peak break current' },
  single_phase_initial_peak_current_ka: { unit: 'kA', label: 'single-phase initial peak current' },
  single_phase_rms_break_current_ka: { unit: 'kA', label: 'single-phase RMS break current' },
  single_phase_dc_break_current_ka: { unit: 'kA', label: 'single-phase DC break current' },
  single_phase_peak_break_current_ka: { unit: 'kA', label: 'single-phase peak break current' },
  three_phase_fault_level_mva: { unit: 'MVA', label: 'three-phase fault level (published as MVA)' },
  three_phase_fault_current_ka: { unit: 'kA', label: 'three-phase fault current' },
  single_phase_earth_fault_current_ka: { unit: 'kA', label: 'single-phase-to-earth fault current' },
  x_over_r_ratio: { unit: '', label: 'X/R ratio' }
});

/* Names that are refused outright, because each is exactly the collapse the
   contract forbids: a number with no statement of WHICH current it is. */
export const REFUSED_GENERIC_NAMES = Object.freeze([
  'fault_level', 'fault_current', 'fault_level_ka', 'fault_level_mva',
  'short_circuit_level', 'scl', 'fault', 'max_fault_level', 'maximum_fault_level'
]);

export const CAVEAT = 'A published figure under a stated study basis on a stated '
  + 'date. Not a connection assessment. The current that applies to a '
  + 'connection is produced by the network operator at the point of '
  + 'connection and stated in the connection offer.';

export const NOT_COMPUTED = 'No fault current is calculated here. The network '
  + 'impedance and running arrangement that determine it are the operator\'s '
  + 'model, not a public dataset.';

export const NO_HEADROOM = 'No headroom against a switchgear rating is '
  + 'calculated here. Switchgear carries several ratings (making, breaking, '
  + 'short-time withstand, peak withstand) and each must be matched to the '
  + 'right published metric by an engineer with the asset data.';

const ALLOWED_UNITS = new Set(['kA', 'MVA', '']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const URL_RE = /^https?:\/\/\S+$/;

function refuse(reason) {
  return { ok: false, record: null, refused: reason };
}

/**
 * Validate and freeze one published fault-level record.
 *
 * Accepts only what a publisher actually said, with enough provenance that a
 * reader can go and read the same page: publisher, publication, the exact
 * artefact URL and its SHA-256, the publication date, the study basis, the
 * site and busbar the figure is for, and the metrics by exact name with a
 * min, a max and a unit.
 *
 * Returns {ok:true, record} with the record frozen and carrying
 * `computed:false`, or {ok:false, refused:<reason>}. A refusal is the answer,
 * not an exception: a caller that cannot distinguish "no figure" from "a
 * figure that failed validation" prints the wrong thing.
 */
export function record(input) {
  if (!input || typeof input !== 'object') return refuse('no input');

  const p = input.provenance;
  if (!p || typeof p !== 'object') return refuse('no provenance');
  for (const key of ['publisher', 'publication', 'source_url', 'sha256', 'published_date', 'study_basis']) {
    if (typeof p[key] !== 'string' || p[key].trim() === '') return refuse('provenance.' + key + ' missing');
  }
  if (!URL_RE.test(p.source_url)) return refuse('provenance.source_url is not a URL');
  if (!SHA256_RE.test(p.sha256)) return refuse('provenance.sha256 is not a 64-hex SHA-256');
  if (!DATE_RE.test(p.published_date)) return refuse('provenance.published_date is not YYYY-MM-DD');

  const site = input.site;
  if (!site || typeof site !== 'object') return refuse('no site');
  if (typeof site.name !== 'string' || site.name.trim() === '') return refuse('site.name missing');
  if (!Number.isFinite(site.voltage_kv) || site.voltage_kv <= 0) return refuse('site.voltage_kv missing');
  const busbar = typeof site.busbar === 'string' && site.busbar.trim() !== '' ? site.busbar : null;

  const metrics = input.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return refuse('no metrics');
  const names = Object.keys(metrics);
  if (names.length === 0) return refuse('metrics is empty');

  const out = {};
  for (const name of names) {
    const lower = String(name).toLowerCase();
    if (REFUSED_GENERIC_NAMES.includes(lower)) {
      return refuse('metric "' + name + '" is a generic name; state which current it is');
    }
    const m = metrics[name];
    if (!m || typeof m !== 'object') return refuse('metric "' + name + '" is not an object');
    const known = METRIC_LABELS[name];
    const unit = known ? known.unit : m.unit;
    if (!known) {
      /* An undeclared metric is allowed ONLY if it declares its own unit and
         label, so a reader is never shown a bare number. */
      if (typeof m.unit !== 'string' || !ALLOWED_UNITS.has(m.unit)) return refuse('metric "' + name + '" is unknown and declares no allowed unit');
      if (typeof m.label !== 'string' || m.label.trim() === '') return refuse('metric "' + name + '" is unknown and declares no label');
    } else if (typeof m.unit === 'string' && m.unit !== known.unit) {
      return refuse('metric "' + name + '" unit ' + m.unit + ' disagrees with ' + known.unit);
    }
    const min = Number(m.min);
    const max = Number(m.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return refuse('metric "' + name + '" min/max not finite');
    if (min < 0 || max < 0) return refuse('metric "' + name + '" is negative');
    if (min > max) return refuse('metric "' + name + '" min exceeds max');
    out[name] = Object.freeze({
      min, max, unit,
      label: known ? known.label : m.label,
      declared: !known
    });
  }

  const frozen = Object.freeze({
    schema,
    computed: false,
    provenance: Object.freeze({
      publisher: p.publisher,
      publication: p.publication,
      source_url: p.source_url,
      sha256: p.sha256,
      published_date: p.published_date,
      study_basis: p.study_basis,
      licence: typeof p.licence === 'string' ? p.licence : null
    }),
    site: Object.freeze({
      name: site.name,
      voltage_kv: site.voltage_kv,
      busbar,
      operator: typeof site.operator === 'string' ? site.operator : null
    }),
    metrics: Object.freeze(out),
    caveat: CAVEAT
  });
  return { ok: true, record: frozen, refused: null };
}

/**
 * The one line a card may print for ONE named metric of a record.
 *
 * Always the label, the range, the unit, the publisher and the date. Never
 * the words "fault level" on their own. A caller that wants a different
 * metric asks for it by name; there is no "default" metric, because a
 * default is a silent choice a reader cannot see.
 */
export function quote(rec, metricName) {
  if (!rec || rec.schema !== schema) return null;
  const m = rec.metrics[metricName];
  if (!m) return null;
  const range = m.min === m.max
    ? formatNumber(m.min)
    : formatNumber(m.min) + '–' + formatNumber(m.max);
  const unit = m.unit ? ' ' + m.unit : '';
  const where = rec.site.busbar ? rec.site.name + ' ' + rec.site.busbar : rec.site.name;
  return m.label + ' ' + range + unit
    + ' · ' + where + ' ' + rec.site.voltage_kv + ' kV'
    + ' · ' + rec.provenance.publisher + ', ' + rec.provenance.publication
    + ' · ' + rec.provenance.study_basis
    + ' · published ' + rec.provenance.published_date;
}

function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
