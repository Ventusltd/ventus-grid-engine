/* deeplink/contract.js — the MAP-button deep link, as one testable thing.
 *
 * Before this repo, the contract existed only as an agreement between two
 * codebases that never imported each other: Pipeline News built a URL, and
 * GridAtlas parsed it, and nothing checked that the two still matched. They
 * stopped matching, and it cost a third of the register (see BUCKETS below).
 *
 * So the contract lives here once, as data plus two pure functions. The
 * emitter and the receiver are both meant to import it. Until they do, the
 * proof in proofs/deeplink.proof.mjs at least holds it to itself.
 *
 * Sources, all at their committed HEADs at extraction time:
 *   emitter   pipelinenews @ ade103ae
 *             releases/.../assets/202608312037-atlas-pointer-deep-link.mjs
 *   receiver  gridatlas @ 64268fd0
 *             atlas/parts/.../sld-sandbox-technology-buckets.js  (runDeepLink)
 *             ventus-corev8engine-exact-repd-delegation.js:66    (REPD_IDS)
 */

/* ── Identity ─────────────────────────────────────────────────────────────
 * The project is identified by repd_ref. NOT repd_id. Both names appear in
 * the estate and they are not interchangeable; the emitter sends repd_ref
 * and the receiver reads repd_ref, and the proof asserts that they agree
 * rather than leaving it to memory.
 */
export const IDENTITY_PARAM = 'repd_ref';

/* ── Parameters the link carries ─────────────────────────────────────────── */
export const PARAMS = Object.freeze({
    repd_ref:   { type: 'string', required: true,  note: 'REPD reference; the project identity' },
    technology: { type: 'string', required: true,  note: 'a bucket from BUCKETS, not a layer id' },
    latitude:   { type: 'number', required: false, units: 'degrees north' },
    longitude:  { type: 'number', required: false, units: 'degrees east' },
    zoom:       { type: 'number', required: false, note: 'MapLibre zoom level' }
});

/* ── The bucket vocabulary the emitter may send ───────────────────────────
 * These are Pipeline News' technology names. They are NOT the engine's layer
 * ids, and the difference is the whole bug.
 */
export const BUCKETS = Object.freeze([
    'solar', 'wind_onshore', 'wind_offshore', 'bess', 'biomass', 'hydro',
    'hydrogen', 'tidal', 'geothermal', 'flywheel', 'caes', 'act', 'other'
]);

/* ── The engine's real layer ids ──────────────────────────────────────────
 * Verbatim from REPD_IDS, ventus-corev8engine-exact-repd-delegation.js:66.
 * Note what is absent: there is no `wind_onshore`, no `wind_offshore`, and
 * no `other`. There is one `wind`.
 */
export const REPD_LAYER_IDS = Object.freeze([
    'solar', 'solar_operational', 'solar_roof', 'wind',
    'wind_onshore_operational', 'wind_offshore_operational',
    'bess', 'bess_operational', 'biomass', 'tidal', 'hydrogen',
    'hydro', 'flywheel', 'act', 'geothermal', 'caes'
]);

/* ── The table that fixed it ──────────────────────────────────────────────
 * Introduced in gridatlas generation 202609041244 (v9.109); first carried to
 * production in generation 202609041330 (v9.111), because live had been
 * sitting on v9.108.
 *
 * What it replaced: a set-membership test. The old code asked "is
 * wind_onshore one of the project technologies?", got true, and reported
 * technology_layer.enabled = true — while the DOM lookup for a checkbox
 * literally named `wind_onshore` failed every single time, because no such
 * control has ever existed. Measured blast radius: 2,508 of 7,680 register
 * rows, a third of the register, reporting green while the layer sat off.
 *
 * `other` maps to null deliberately. No layer exists for it. A caller must
 * say so rather than search for one and then quietly claim success — that
 * short-circuit is the honest branch, and the proof asserts it stays honest.
 */
export const LAYER_ID_FOR_BUCKET = Object.freeze({
    wind_onshore:  'wind',
    wind_offshore: 'wind',
    other:         null
});

/**
 * The engine layer id a Pipeline News bucket resolves to.
 * Returns null when no layer exists (the `other` case) — never a guess.
 * Any bucket not in the table maps to itself, which is correct for every
 * bucket whose name already matches a real layer id.
 */
export function layerIdForBucket(tech) {
    const id = String(tech == null ? '' : tech);
    return Object.prototype.hasOwnProperty.call(LAYER_ID_FOR_BUCKET, id)
        ? LAYER_ID_FOR_BUCKET[id] : id;
}

/** True when this bucket resolves to a layer the engine can actually show. */
export function bucketHasLayer(tech) {
    const id = layerIdForBucket(tech);
    return id !== null && REPD_LAYER_IDS.includes(id);
}

/**
 * Build a deep link. The emitter's job, expressed once.
 *
 * @param {string} base    e.g. 'https://ventusltd.github.io/gridatlas/atlas/'
 * @param {object} project { repd_ref, technology, latitude, longitude, zoom }
 * @returns {string}
 */
export function buildDeepLink(base, project) {
    if (!project || project[IDENTITY_PARAM] == null || project[IDENTITY_PARAM] === '') {
        throw new Error('buildDeepLink: ' + IDENTITY_PARAM + ' is required and is the project identity');
    }
    const url = new URL(base);
    for (const key of Object.keys(PARAMS)) {
        const value = project[key];
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
    }
    return url.toString();
}

/**
 * Parse a deep link. The receiver's job, expressed once.
 *
 * Returns what the link asked for AND what the engine can honour, separately.
 * `layer_id` is the resolved engine layer; `layer_exists` says whether one
 * exists at all. A receiver that conflates those two is the v9.108 bug.
 */
export function parseDeepLink(href) {
    const url = new URL(href);
    const get = (k) => url.searchParams.get(k);
    const num = (k) => {
        const raw = get(k);
        if (raw === null || raw.trim() === '') return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    };
    const technology = get('technology');
    return {
        repd_ref:     get(IDENTITY_PARAM),
        technology,
        latitude:     num('latitude'),
        longitude:    num('longitude'),
        zoom:         num('zoom'),
        layer_id:     technology === null ? null : layerIdForBucket(technology),
        layer_exists: technology === null ? false : bucketHasLayer(technology),
        known_bucket: technology !== null && BUCKETS.includes(technology)
    };
}
