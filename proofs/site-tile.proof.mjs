/* site-tile.proof.mjs — wireframe rule R5, the site tile: stream the measured
 * ground where you arrive, never download in bulk. These checks hold the
 * tile maths to the rule's own words, so the rule and its code cannot drift.
 *
 * Run: node proofs/site-tile.proof.mjs
 */

import { schema, TILE_M, PRODUCTS, GAP_S, DAILY_CAP, BACKOFF_FIRST_S, BACKOFF_MAX_S, BASIS,
    tileOf, tilesForBox, tilesForRoute, cellCentre, tileKey, RECEIPT_FIELDS, missingReceiptFields,
    schedule, backoff, groundUse, noMeasuredGround } from '../engine/site-tile.js';

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};

/* ── The constants and where they come from ─────────────────────────────── */

check('tiles are a fixed 2,048 m on a 2,048 m lattice (rule 1)', TILE_M === 2048);
check('two products, the terrain and the surface, and nothing else (rule 2)',
    PRODUCTS.length === 2 && PRODUCTS[0] === 'dtm' && PRODUCTS[1] === 'dsm');
check('the pace is more than twice the spacing at which the service refused a client (rule 3)',
    GAP_S === 40 && GAP_S / BASIS.refusal.mean_spacing_s > 2);
check('the daily cap is 16 and says it was chosen, not measured (rule 3)',
    DAILY_CAP === 16 && BASIS.daily_cap === 'chosen, not measured');
check('the refusal back-off starts at 5 minutes and tops out at 1 hour (rule 3)',
    BACKOFF_FIRST_S === 300 && BACKOFF_MAX_S === 3600);
check('a 2,048 m tile of 1 m cells is 4,194,304 cells, as measured',
    TILE_M * TILE_M === BASIS.measured.dtm_2048_cells);
check('the surface product has not been measured yet, and the basis says so rather than guessing',
    BASIS.measured.dsm_bytes === null);

/* ── Rule 1: tiles, like a map ──────────────────────────────────────────── */

const t = tileOf(530624.4, 178388.9);
check('a point lands in the tile whose corner is the lattice point below and to the west of it',
    t.e0 === 530432 && t.n0 === 178176 && t.size === 2048);
check('a point exactly on a lattice line belongs to the tile that starts there',
    tileOf(4096, 6144).e0 === 4096 && tileOf(4096, 6144).n0 === 6144);
check('a small site inside one tile takes exactly one tile',
    tilesForBox(530500, 178200, 530900, 178900).length === 1);
check('a site straddling a tile corner takes the four tiles it touches, and no more',
    tilesForBox(532400, 180200, 532600, 180300).length === 4);
const route = tilesForRoute([[500000, 200000], [520000, 200000]]);
check('a 20 km straight route east, from 500,000 to 520,000 m, takes the ten tiles its line crosses (lattice columns 244 to 253)',
    route.length === 10 && route[0].e0 === 244 * 2048 && route[9].e0 === 253 * 2048 && route.every(r => r.n0 === 198656));
check('a route never skips a tile between two far points (sampled at a quarter tile or finer)',
    route.map(r => r.e0).every((e, i, a) => i === 0 || e - a[i - 1] === TILE_M));
check('a route with a half-width takes the tiles its corridor touches as well',
    tilesForRoute([[500000, 198700]], 100).length === 2);
check('an empty route takes no tiles', tilesForRoute([]).length === 0);
check('the tile corner is a cell corner: cell (0, 0) has its centre half a metre in',
    cellCentre({ e0: 1000, n0: 2000 }, 0, 0)[0] === 1000.5 && cellCentre({ e0: 1000, n0: 2000 }, 0, 0)[1] === 2000.5);

/* ── Rules 4 and 8: stream, and keep a receipt ──────────────────────────── */

check('a tile key names the product, the corner and the size',
    tileKey('dtm', t) === 'dtm/530432/178176/2048');
let threw = false;
try { tileKey('imagery', t); } catch { threw = true; }
check('a key for anything but measured ground is refused (rule 11: imagery follows the map\'s rules)', threw);
check('the receipt hashes the decoded cells, not the file bytes',
    RECEIPT_FIELDS.includes('sha256_cells') && !RECEIPT_FIELDS.includes('sha256_bytes'));
check('the receipt carries the licence and the attribution',
    RECEIPT_FIELDS.includes('licence') && RECEIPT_FIELDS.includes('attribution'));
const full = Object.fromEntries(RECEIPT_FIELDS.map(f => [f, 'x']));
full.survey_year = null;
check('a receipt may say the survey year is unknown, but must say it',
    missingReceiptFields(full).length === 0);
const noYear = { ...full }; delete noYear.survey_year;
check('a receipt that leaves the survey year out altogether is incomplete',
    missingReceiptFields(noYear).includes('survey_year'));

/* ── Rules 2, 3 and 5: the schedule ─────────────────────────────────────── */

const one = schedule([t]);
check('one tile is two requests, the terrain first, 40 s apart',
    one.requests.length === 2 && one.requests[0].product === 'dtm' && one.requests[1].at_s - one.requests[0].at_s === 40);
check('the same tile asked twice in one visit is asked once',
    schedule([t, t]).requests.length === 2);
check('a tile with a stored wireframe or live receipt is drawn from that, not asked again (rule 5)',
    schedule([t], { have: new Set(['dtm/530432/178176/2048']) }).requests.length === 1);
const long = schedule(route);
check('past the daily cap the plan stops and names every tile it could not fetch',
    long.requests.length === DAILY_CAP && long.stopped_at_cap && long.missing.length === route.length * 2 - DAILY_CAP);
check('requests already made today count against the cap',
    schedule([t], { usedToday: 15 }).requests.length === 1);

/* ── Rule 3: refusals ───────────────────────────────────────────────────── */

check('no refusal, no pause', backoff(0) === 0);
check('the pause doubles: 5, 10, 20 and 40 minutes',
    backoff(1) === 300 && backoff(2) === 600 && backoff(3) === 1200 && backoff(4) === 2400);
check('the pause tops out at one hour', backoff(5) === 3600);
check('a refusal after the one-hour pause stops the fetcher until a person restarts it',
    backoff(6) === 'stop' && backoff(9) === 'stop');

/* ── Rule 9: survey year before scanning ────────────────────────────────── */

check('a survey after the build may be scanned for the asset',
    groundUse({ surveyYear: 2024, buildYear: 2021 }) === 'as built');
check('a survey in the build year is the ground before the asset (the flight may predate the build)',
    groundUse({ surveyYear: 2022, buildYear: 2022 }) === 'pre-construction ground');
check('a survey before the build is the ground before the asset',
    groundUse({ surveyYear: 2022, buildYear: 2025 }) === 'pre-construction ground');
check('an unknown year on either side never permits a scan',
    groundUse({ surveyYear: null, buildYear: 2020 }) === 'pre-construction ground'
    && groundUse({ surveyYear: 2022 }) === 'pre-construction ground');

/* ── Rule 10: say it, do not fill it ────────────────────────────────────── */

check('an error is no measured ground', noMeasuredGround({ http: 500 }));
check('untagged all-zero cells are no measured ground, never 0 m', noMeasuredGround({ allZeroUntagged: true }));
check('a run of exact zeros is no measured ground', noMeasuredGround({ zeroRun: true }));
check('a good tile is measured ground', noMeasuredGround({}) === false);

check('the module identifies itself with a stable schema string',
    schema === 'gridatlas.module.site-tile.v1');

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
    console.error('site-tile proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('site-tile proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
