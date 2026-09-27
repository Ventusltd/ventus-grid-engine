/**
 * Module: site-tile
 *
 * NEW, not extracted. The code form of wireframe rule R5, "the site tile":
 * stream the measured ground where you arrive; never download in bulk. The
 * full rule is docs/site-tile.md. Three independent witnesses (measurement,
 * logic, conformance) were each asked to refute it, and all three signed
 * version 2.
 *
 * What this module owns is the pure maths of that rule: which fixed 2,048 m
 * lattice tiles a site or a route touches, the key and receipt fields of a
 * tile, the polite schedule of requests, the refusal back-off, and the
 * survey-year test that decides whether heights may be scanned for an asset.
 *
 * Depends on: nothing. Pure arithmetic on British National Grid metres
 * (EPSG:27700). No network and no DOM: the fetcher belongs to the client
 * (README: "engine/ — the pure maths, no DOM, no network").
 */

export const schema = 'gridatlas.module.site-tile.v1';

/** Rule 1: fixed tiles on a lattice of this pitch, in metres. */
export const TILE_M = 2048;

/** Rule 2: the products asked for, once each per tile per visit. */
export const PRODUCTS = Object.freeze(['dtm', 'dsm']);

/** Rule 3: pace. At least GAP_S seconds between requests to a public service. */
export const GAP_S = 40;

/** Rule 3: at most this many requests per client per day. A chosen cap, not a measured limit. */
export const DAILY_CAP = 16;

/** Rule 3: the first pause after a refusal, and the longest. */
export const BACKOFF_FIRST_S = 300;
export const BACKOFF_MAX_S = 3600;

/**
 * Where the numbers come from. The pace is derived from an observed refusal,
 * not chosen for convenience; the tile sizes were measured by one request each.
 */
export const BASIS = Object.freeze({
    refusal: Object.freeze({ requests: 10, within_s: 180, mean_spacing_s: 18,
        note: 'the service refused a client after about ten requests in three minutes' }),
    gap_over_refusal_spacing: 40 / 18,
    measured: Object.freeze({
        dtm_2048_http: 200, dtm_2048_bytes: 16777763, dtm_2048_cells: 4194304,
        dtm_4096_http: 200, dtm_4096_bytes: 67109795, dtm_4096_cells: 16777216,
        dsm_bytes: null,
        date: '2026-09-27',
    }),
    daily_cap: 'chosen, not measured',
});

const floorTo = (x, m) => Math.floor(x / m) * m;

/** Rule 1: the tile that contains the point (e, n). The tile corner is a cell corner. */
export function tileOf(e, n) {
    if (!Number.isFinite(e) || !Number.isFinite(n)) throw new RangeError('tileOf: e and n must be finite metres');
    return { e0: floorTo(e, TILE_M), n0: floorTo(n, TILE_M), size: TILE_M };
}

/** Rule 1: every tile a box (e0, n0)-(e1, n1) touches, west to east, then south to north. */
export function tilesForBox(e0, n0, e1, n1) {
    const a = tileOf(Math.min(e0, e1), Math.min(n0, n1));
    const b = tileOf(Math.max(e0, e1), Math.max(n0, n1));
    const out = [];
    for (let n = a.n0; n <= b.n0; n += TILE_M)
        for (let e = a.e0; e <= b.e0; e += TILE_M) out.push({ e0: e, n0: n, size: TILE_M });
    return out;
}

/**
 * Rule 1: every tile a route touches, where the route is a polyline of [e, n]
 * points with an optional half-width either side, in metres. Each segment is
 * sampled at a quarter of a tile or finer, so no tile the line crosses is
 * missed; the half-width widens each sample to a small box.
 */
export function tilesForRoute(points, halfWidth = 0) {
    if (!Array.isArray(points) || points.length === 0) return [];
    const seen = new Map();
    const add = (e, n) => {
        for (const t of tilesForBox(e - halfWidth, n - halfWidth, e + halfWidth, n + halfWidth))
            seen.set(t.e0 + ',' + t.n0, t);
    };
    add(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        const [ea, na] = points[i - 1], [eb, nb] = points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(eb - ea, nb - na) / (TILE_M / 4)));
        for (let s = 1; s <= steps; s++) add(ea + (eb - ea) * s / steps, na + (nb - na) * s / steps);
    }
    return [...seen.values()].sort((p, q) => p.n0 - q.n0 || p.e0 - q.e0);
}

/** The centre of cell (col, row) of a tile, counted from the south-west corner: e0 + col + 0.5. */
export function cellCentre(tile, col, row) {
    return [tile.e0 + col + 0.5, tile.n0 + row + 0.5];
}

/** Rule 4: the key a tile is known by, for one product. */
export function tileKey(product, tile) {
    if (!PRODUCTS.includes(product)) throw new RangeError('tileKey: unknown product ' + product);
    return `${product}/${tile.e0}/${tile.n0}/${tile.size}`;
}

/** Rule 4 and 8: the fields a receipt must carry. The sha256 is of the decoded cell values, not the file bytes. */
export const RECEIPT_FIELDS = Object.freeze(['source', 'product', 'release', 'survey_year', 'tile', 'request',
    'fetched_utc', 'sha256_cells', 'licence', 'attribution']);

/** The receipt fields that are missing or empty. survey_year may be null, but it must be present. */
export function missingReceiptFields(receipt) {
    return RECEIPT_FIELDS.filter(f => !(receipt && f in receipt)
        || (f !== 'survey_year' && (receipt[f] === '' || receipt[f] == null)));
}

/**
 * Rules 2, 3 and 5: turn the tiles a visit needs into a request schedule.
 * Tiles with a stored wireframe or a live receipt are skipped (stored first).
 * Requests are GAP_S apart, and the plan stops at the daily cap and names
 * what it could not fetch, rather than fetching it later without saying so.
 */
export function schedule(tiles, { products = PRODUCTS, have = new Set(), usedToday = 0, startS = 0 } = {}) {
    const requests = [], missing = [], skipped = [];
    let used = usedToday, at = startS;
    const asked = new Set();
    for (const t of tiles) for (const p of products) {
        const key = tileKey(p, t);
        if (asked.has(key)) continue;
        asked.add(key);
        if (have.has(key)) { skipped.push(key); continue; }
        if (used >= DAILY_CAP) { missing.push(key); continue; }
        requests.push({ key, product: p, tile: t, at_s: at });
        used += 1; at += GAP_S;
    }
    return { requests, skipped, missing, stopped_at_cap: missing.length > 0 };
}

/** Rule 3: the pause after the n-th refusal in a row, or 'stop' once the longest pause has been refused. */
export function backoff(refusals) {
    if (!Number.isInteger(refusals) || refusals < 0) throw new RangeError('backoff: refusals must be a count');
    if (refusals === 0) return 0;
    const s = BACKOFF_FIRST_S * 2 ** (refusals - 1);
    if (s <= BACKOFF_MAX_S) return s;
    const prev = BACKOFF_FIRST_S * 2 ** (refusals - 2);
    return prev < BACKOFF_MAX_S ? BACKOFF_MAX_S : 'stop';
}

/**
 * Rule 9: may the heights be scanned for the asset? Only when the survey
 * postdates the build. Same year, earlier, or either year unknown means the
 * heights are the ground before the asset: good for piles, earthworks,
 * drainage and slope, never scanned for rows.
 */
export function groundUse({ surveyYear = null, buildYear = null } = {}) {
    if (!Number.isInteger(surveyYear) || !Number.isInteger(buildYear)) return 'pre-construction ground';
    return surveyYear > buildYear ? 'as built' : 'pre-construction ground';
}

/**
 * Rule 10: "no measured ground here", never 0 m. True for an HTTP error, a
 * box outside the envelope, exact zeros with no nodata tag, or a run of exact
 * zeros.
 */
export function noMeasuredGround({ http = 200, outsideEnvelope = false, allZeroUntagged = false, zeroRun = false } = {}) {
    return http !== 200 || outsideEnvelope || allZeroUntagged || zeroRun;
}
