/* deeplink.proof.mjs — the contract that broke a third of the register, held
 * to itself so it cannot break the same way twice.
 *
 * Run: node proofs/deeplink.proof.mjs
 */

import {
    IDENTITY_PARAM, PARAMS, BUCKETS, REPD_LAYER_IDS, LAYER_ID_FOR_BUCKET,
    layerIdForBucket, bucketHasLayer, buildDeepLink, parseDeepLink
} from '../deeplink/contract.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};

const BASE = 'https://ventusltd.github.io/gridatlas/atlas/';

/* ── Identity ───────────────────────────────────────────────────────────── */

check('the project identity parameter is repd_ref, not repd_id — both names '
    + 'exist in the estate and they are not interchangeable',
    IDENTITY_PARAM === 'repd_ref' && 'repd_ref' in PARAMS && !('repd_id' in PARAMS));

check('a link cannot be built without the identity, because a MAP button that '
    + 'names no project is a button that cannot be honoured',
    (() => { try { buildDeepLink(BASE, { technology: 'solar' }); return false; }
             catch { return true; } })());

/* ── The three buckets that failed 100% on v9.108 ───────────────────────── */

check('wind_onshore resolves to the engine layer that actually exists, `wind`',
    layerIdForBucket('wind_onshore') === 'wind' && bucketHasLayer('wind_onshore'));

check('wind_offshore resolves to the same real `wind` layer — this is the '
    + 'bucket Berwick Bank arrives on, the first MAP button on the page',
    layerIdForBucket('wind_offshore') === 'wind' && bucketHasLayer('wind_offshore'));

check('the engine has never had a layer named wind_onshore or wind_offshore, '
    + 'which is precisely why looking one up by that name failed every time',
    !REPD_LAYER_IDS.includes('wind_onshore') && !REPD_LAYER_IDS.includes('wind_offshore')
    && REPD_LAYER_IDS.includes('wind'));

check('`other` short-circuits honestly to null rather than searching for a '
    + 'layer that does not exist and then reporting success',
    layerIdForBucket('other') === null && bucketHasLayer('other') === false);

check('the failing case is distinguishable from the working one: a caller can '
    + 'tell "no layer exists" apart from "a layer exists and is enabled", '
    + 'which the v9.108 set-membership test could not',
    bucketHasLayer('other') === false && bucketHasLayer('solar') === true);

/* ── Every other bucket maps to itself, and that must stay true ─────────── */

const selfMapping = BUCKETS.filter(b => !(b in LAYER_ID_FOR_BUCKET));
check('every bucket outside the correction table maps to itself unchanged, '
    + 'because those names already match a real engine layer id',
    selfMapping.length > 0 && selfMapping.every(b => layerIdForBucket(b) === b));

check('and every one of those self-mapped buckets really does name a layer '
    + 'the engine has — if this fails, a new bucket was added to Pipeline News '
    + 'without a layer or a table entry, which is exactly the v9.108 shape',
    selfMapping.every(b => REPD_LAYER_IDS.includes(b)));

check('the correction table covers every bucket that does NOT name a real '
    + 'layer, so no bucket can fall through to a lookup that cannot succeed',
    BUCKETS.every(b => (b in LAYER_ID_FOR_BUCKET) || REPD_LAYER_IDS.includes(b)));

/* ── Round trip ─────────────────────────────────────────────────────────── */

const berwick = { repd_ref: '9873', technology: 'wind_offshore',
                  latitude: 56.05, longitude: -2.35, zoom: 9 };
const link = buildDeepLink(BASE, berwick);
const parsed = parseDeepLink(link);

check('a built link carries the identity under the name the receiver reads',
    link.includes('repd_ref=9873'));

check('a link round-trips: what the emitter sent is what the receiver reads',
    parsed.repd_ref === '9873' && parsed.technology === 'wind_offshore'
    && parsed.latitude === 56.05 && parsed.longitude === -2.35 && parsed.zoom === 9);

check('the receiver reports the resolved layer alongside the requested bucket, '
    + 'so the two are never confused for each other again',
    parsed.layer_id === 'wind' && parsed.technology === 'wind_offshore'
    && parsed.layer_exists === true);

check('an `other` arrival parses cleanly and says plainly that no layer exists',
    (() => { const p = parseDeepLink(buildDeepLink(BASE,
        { repd_ref: '1', technology: 'other' }));
        return p.layer_id === null && p.layer_exists === false && p.known_bucket === true; })());

check('an unknown technology is reported as unknown rather than silently '
    + 'accepted, so a new Pipeline News bucket surfaces here first',
    (() => { const p = parseDeepLink(BASE + '?repd_ref=1&technology=fusion');
        return p.known_bucket === false && p.layer_exists === false; })());

/* ── Absent and malformed parameters ────────────────────────────────────── */

check('optional coordinates are absent as null, never NaN and never zero — '
    + 'zero is a real coordinate off the coast of Ghana, not a missing value',
    (() => { const p = parseDeepLink(BASE + '?repd_ref=1&technology=solar');
        return p.latitude === null && p.longitude === null && p.zoom === null; })());

check('a malformed coordinate is null rather than NaN, so a camera never flies '
    + 'to nowhere',
    (() => { const p = parseDeepLink(BASE + '?repd_ref=1&technology=solar&latitude=abc');
        return p.latitude === null; })());

check('a genuine zero coordinate survives and is not mistaken for absent',
    parseDeepLink(BASE + '?repd_ref=1&technology=solar&latitude=0').latitude === 0);

check('empty optional values are dropped from the built URL rather than sent '
    + 'as empty strings the receiver has to special-case',
    !buildDeepLink(BASE, { repd_ref: '1', technology: 'solar', latitude: '' })
        .includes('latitude='));

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('deeplink proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('deeplink proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
