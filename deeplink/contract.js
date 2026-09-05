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
 * Which receiver a deep link must be built against.
 *
 * The contract used to take the base from the caller and say nothing about
 * which one was right. Every consumer therefore chose its own, and on
 * 2026-09-05 the MAP button in Pipeline News v9.7 was measured pointing at the
 * V8 overlay -- a page that still serves, so nothing 404'd, but which carries
 * no cartridge and no current.json, so no arrival there could ever compute a
 * nearest substation. The route was hard-coded in the consumer and the engine
 * published nothing for it to disagree with.
 *
 * These are the same values as deeplink/receivers.json, which is the published
 * form for anything that cannot import this module. The proof asserts the two
 * agree, so they cannot drift apart.
 */
export const CANONICAL_RECEIVER = 'https://ventusltd.github.io/gridatlas/atlas/';

export const RETIRED_RECEIVERS = Object.freeze([
    'https://globalgrid2050.com/repd_grid_atlasv8/'
]);

/**
 * True if a base is a receiver that cannot honour a deep link.
 *
 * Trailing slashes and query strings are ignored: a consumer that appends its
 * own parameters must still be caught, and the fault this exists to prevent
 * would have slipped past an equality test.
 */
export function isRetiredReceiver(base) {
    if (!base) return false;
    const strip = (value) => String(value).split('?')[0].split('#')[0].replace(/\/+$/, '');
    const target = strip(base);
    return RETIRED_RECEIVERS.some((route) => strip(route) === target);
}

/**
 * The query: every project row that carries an REPD identity, and the link it
 * should have.
 *
 * "define a query that targets all project rows on pipeline news that have an
 * REPD id and if they do then the algorithm or spiders or git via cvaa needs to
 * auto update each of those links" -- the architect, 2026-09-05.
 *
 * It is defined HERE, once, rather than in the updater, so that the thing which
 * proves the links offline and the workflow which rewrites them are running the
 * same code. An audit that uses different logic from the fix it gates is not a
 * gate.
 *
 * Returns one entry per row. `linkable` is false for a row with no REPD
 * identity or no usable geometry -- those are reported, never silently skipped,
 * because a row that quietly gets no link is exactly how 28 projects in the
 * v9.5.1 corpus ended up with a dead MAP button that nobody saw.
 *
 * @param {Array<object>} rows
 * @param {object} [options] { requireGeometry: true }
 */
export function auditProjectRows(rows, options) {
    const requireGeometry = !options || options.requireGeometry !== false;
    const list = Array.isArray(rows) ? rows : [];
    const entries = list.map((row) => {
        const identity = row ? row[IDENTITY_PARAM] : null;
        const hasIdentity = identity !== undefined && identity !== null && identity !== '';
        const hasGeometry = Boolean(row)
            && row.latitude !== undefined && row.latitude !== null && row.latitude !== ''
            && row.longitude !== undefined && row.longitude !== null && row.longitude !== '';
        const linkable = hasIdentity && (!requireGeometry || hasGeometry);
        return {
            [IDENTITY_PARAM]: hasIdentity ? identity : null,
            has_identity: hasIdentity,
            has_geometry: hasGeometry,
            linkable,
            current_href: row && row.href ? String(row.href) : null,
            current_is_retired: Boolean(row && row.href && isRetiredReceiver(row.href)),
            expected_href: linkable ? buildDeepLink(row) : null
        };
    });
    return {
        total: entries.length,
        with_identity: entries.filter((e) => e.has_identity).length,
        linkable: entries.filter((e) => e.linkable).length,
        no_geometry: entries.filter((e) => e.has_identity && !e.has_geometry).length,
        on_retired_receiver: entries.filter((e) => e.current_is_retired).length,
        needs_update: entries.filter((e) => e.linkable && e.current_href && e.current_href !== e.expected_href).length,
        entries
    };
}

/**
 * Build a deep link. The emitter's job, expressed once.
 *
 * Call it with one argument and the contract supplies the canonical receiver,
 * which is the form every consumer should use. The two-argument form is kept
 * for a caller that genuinely needs another base -- a local harness, a staged
 * copy -- and it REFUSES a retired receiver rather than quietly building a
 * link that lands somewhere inert.
 *
 * @param {string|object} base    the receiver, or the project when omitted
 * @param {object} [project]      { repd_ref, technology, latitude, longitude, zoom }
 * @returns {string}
 */
export function buildDeepLink(base, project) {
    if (project === undefined && base && typeof base === 'object') {
        project = base;
        base = CANONICAL_RECEIVER;
    }
    if (!project || project[IDENTITY_PARAM] == null || project[IDENTITY_PARAM] === '') {
        throw new Error('buildDeepLink: ' + IDENTITY_PARAM + ' is required and is the project identity');
    }
    if (isRetiredReceiver(base)) {
        throw new Error(
            'buildDeepLink: ' + base + ' is a retired receiver and carries no engine; '
            + 'a link built against it cannot compute anything. Use the canonical receiver '
            + CANONICAL_RECEIVER + ' (call buildDeepLink(project) and the contract supplies it).'
        );
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
