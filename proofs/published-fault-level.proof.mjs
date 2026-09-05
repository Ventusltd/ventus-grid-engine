/* published-fault-level.proof.mjs — a fault-level figure on an open map is
 * allowed to be exactly one thing: what a publisher said, on a date, under a
 * stated basis, by exact metric name. This proof holds the module to that,
 * and — more importantly — holds it to what it must NOT do.
 *
 * Run: node proofs/published-fault-level.proof.mjs
 */

import * as mod from '../engine/published-fault-level.js';
const { schema, ETYS_METRICS, LTDS_METRICS, METRIC_LABELS, REFUSED_GENERIC_NAMES,
    CAVEAT, NOT_COMPUTED, NO_HEADROOM, record, quote } = mod;

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};

/* A complete, honest record: the ETYS 2025 peak-demand figure for Abham
   132 kV, exactly as data-grid-gb normalises it, with the pinned artefact
   NESO publishes (fault_peak, sha256 from data-grid-gb/chatgpt/sources.json). */
const GOOD = {
    provenance: {
        publisher: 'NESO',
        publication: 'Electricity Ten Year Statement 2025, Appendix D',
        source_url: 'https://www.neso.energy/document/383951/download',
        sha256: 'ad8b54fa0b0562c34295514c150f33913a92fc756ff140e0154d53c181363440',
        published_date: '2025-11-27',
        study_basis: 'peak demand, winters 2025/26 to 2033/34',
        licence: 'as published by NESO'
    },
    site: { name: 'ABHAM', voltage_kv: 132, busbar: 'ABHA1 M2', operator: 'NGET' },
    metrics: {
        three_phase_rms_break_current_ka: { min: 12.78, max: 14.52 },
        three_phase_initial_peak_current_ka: { min: 31.28, max: 35.54 }
    }
};
const clone = () => JSON.parse(JSON.stringify(GOOD));

/* ── Identity and vocabulary ─────────────────────────────────────────────── */

check('the module identifies itself with a stable schema string',
    schema === 'ventus-grid-engine.published-fault-level.v1');

check('the ETYS vocabulary is the eight currents Appendix D publishes, named '
    + 'exactly as data-grid-gb normalises them — no more, no fewer',
    ETYS_METRICS.length === 8
    && ETYS_METRICS.includes('three_phase_rms_break_current_ka')
    && ETYS_METRICS.includes('single_phase_peak_break_current_ka')
    && ETYS_METRICS.every(n => METRIC_LABELS[n] && METRIC_LABELS[n].unit === 'kA'));

check('the LTDS vocabulary is kept separate from the ETYS eight, so a reader '
    + 'can see which publisher a name belongs to',
    LTDS_METRICS.length > 0
    && LTDS_METRICS.every(n => !ETYS_METRICS.includes(n) && METRIC_LABELS[n]));

check('every label a card may print names WHICH current it is — none of them '
    + 'is the bare phrase "fault level"',
    Object.values(METRIC_LABELS).every(m => m.label.toLowerCase() !== 'fault level'
        && m.label.toLowerCase() !== 'maximum fault level'));

check('generic names are refused by the vocabulary itself',
    REFUSED_GENERIC_NAMES.includes('fault_level')
    && REFUSED_GENERIC_NAMES.includes('short_circuit_level'));

/* ── A good record is accepted, frozen, and says it was not computed ─────── */

const good = record(clone());
check('a complete published record is accepted', good.ok === true && good.record !== null);
check('the accepted record is frozen — nothing downstream can quietly edit a '
    + 'published figure', good.ok && Object.isFrozen(good.record)
    && Object.isFrozen(good.record.metrics) && Object.isFrozen(good.record.provenance));
check('the accepted record states computed:false, so no consumer can mistake '
    + 'it for a study result', good.ok && good.record.computed === false);
check('the record carries the caveat text verbatim', good.ok && good.record.caveat === CAVEAT);
check('the record keeps the metric names exactly as given and attaches the unit '
    + 'and label from the vocabulary',
    good.ok && good.record.metrics.three_phase_rms_break_current_ka.unit === 'kA'
    && good.record.metrics.three_phase_rms_break_current_ka.label === 'three-phase RMS break current');

/* ── Provenance is not optional: each missing field is its own refusal ───── */

for (const key of ['publisher', 'publication', 'source_url', 'sha256', 'published_date', 'study_basis']) {
    const bad = clone(); delete bad.provenance[key];
    const r = record(bad);
    check('a record without provenance.' + key + ' is refused, and the refusal names the field',
        r.ok === false && typeof r.refused === 'string' && r.refused.includes(key));
}

{
    const bad = clone(); bad.provenance.sha256 = 'not-a-hash';
    check('a provenance hash that is not a 64-hex SHA-256 is refused',
        record(bad).ok === false);
}
{
    const bad = clone(); bad.provenance.published_date = '27/11/2025';
    check('a date that is not YYYY-MM-DD is refused — a figure with an '
        + 'ambiguous date is a figure with no date', record(bad).ok === false);
}
{
    const bad = clone(); bad.provenance.source_url = 'Appendix D';
    check('a source that is not a URL is refused — the reader must be able to '
        + 'go and read the same page', record(bad).ok === false);
}

/* ── The collapse the contract forbids ───────────────────────────────────── */

{
    const bad = clone(); bad.metrics = { fault_level: { min: 12, max: 14, unit: 'kA' } };
    const r = record(bad);
    check('a metric called "fault_level" is refused even with a unit — a '
        + 'number that does not say which current it is is not a measurement',
        r.ok === false && /generic/.test(r.refused));
}
{
    const bad = clone(); bad.metrics = { Maximum_Fault_Level: { min: 12, max: 14, unit: 'kA' } };
    check('the generic-name refusal is case-insensitive', record(bad).ok === false);
}
{
    const bad = clone(); bad.metrics = { some_new_metric: { min: 1, max: 2 } };
    check('an unknown metric with no declared unit and label is refused',
        record(bad).ok === false);
}
{
    const ok = clone(); ok.metrics = { some_new_metric: { min: 1, max: 2, unit: 'kA', label: 'a declared current' } };
    const r = record(ok);
    check('an unknown metric IS accepted when it declares its own unit and label, '
        + 'and is marked as declared rather than vocabulary',
        r.ok === true && r.record.metrics.some_new_metric.declared === true);
}
{
    const bad = clone(); bad.metrics.three_phase_rms_break_current_ka.unit = 'MVA';
    check('a vocabulary metric carrying the wrong unit is refused rather than '
        + 'silently relabelled', record(bad).ok === false);
}
{
    const bad = clone(); bad.metrics.three_phase_rms_break_current_ka = { min: 14.52, max: 12.78 };
    check('min above max is refused', record(bad).ok === false);
}
{
    const bad = clone(); bad.metrics.three_phase_rms_break_current_ka = { min: -1, max: 12 };
    check('a negative current is refused', record(bad).ok === false);
}
{
    const bad = clone(); bad.metrics = {};
    check('a record with no metrics at all is refused', record(bad).ok === false);
}
{
    const bad = clone(); delete bad.site.voltage_kv;
    check('a record that does not say which voltage level is refused',
        record(bad).ok === false);
}

/* ── quote(): the only line a card may print ─────────────────────────────── */

const line = good.ok ? quote(good.record, 'three_phase_rms_break_current_ka') : null;
check('quote() prints the metric label, the range and the unit',
    typeof line === 'string' && line.includes('three-phase RMS break current')
    && line.includes('12.78–14.52 kA'));
check('quote() prints the site, busbar and voltage the figure is for',
    typeof line === 'string' && line.includes('ABHAM ABHA1 M2 132 kV'));
check('quote() prints the publisher, publication, study basis and date',
    typeof line === 'string' && line.includes('NESO')
    && line.includes('Appendix D') && line.includes('peak demand')
    && line.includes('published 2025-11-27'));
check('quote() never prints the bare words "fault level" for a named current',
    typeof line === 'string' && !/\bfault level\b/i.test(line));
check('quote() has no default metric — asking for none returns null rather '
    + 'than a silently chosen figure',
    good.ok && quote(good.record) === null && quote(good.record, 'fault_level') === null);
check('quote() of a metric the record does not carry returns null, not a '
    + 'number from a different metric',
    good.ok && quote(good.record, 'single_phase_rms_break_current_ka') === null);

/* ── What the module must NOT be able to do ──────────────────────────────── */

/* CALLABLE exports only. The first version of this tested every export
   NAME and caught NOT_COMPUTED and NO_HEADROOM -- the two string constants
   that exist precisely to SAY these things are refused. The constraint is
   about capability a caller can reach, so it is asserted over functions. */
const callable = Object.keys(mod).filter(n => typeof mod[n] === 'function');
check('the module exports exactly two functions, record and quote -- validate '
    + 'and print, nothing else',
    callable.length === 2 && callable.includes('record') && callable.includes('quote'));
check('no callable computes, calculates, estimates or solves anything -- a '
    + 'fault current is the operator model, not this module arithmetic',
    callable.every(n => !/compute|calculat|estimat|solve|derive/i.test(n)));
check('no callable offers headroom against a rating -- matching a published '
    + 'metric to the right switchgear rating is engineering, not screening',
    callable.every(n => !/headroom|margin|capacity/i.test(n)));
check('the refusals are stated as text a card can print, not left implicit',
    typeof NOT_COMPUTED === 'string' && NOT_COMPUTED.length > 40
    && typeof NO_HEADROOM === 'string' && NO_HEADROOM.length > 40);

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('published-fault-level proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('published-fault-level proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
