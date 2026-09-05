/* deeplink-receiver.proof.mjs — a deep link is built against a receiver that
 * carries the engine, and the query that finds every row needing one.
 *
 * WHY THIS EXISTS, measured 2026-09-05
 * ------------------------------------
 * The MAP button in Pipeline News v9.7 pointed at
 * https://globalgrid2050.com/repd_grid_atlasv8/ — the V8 overlay. That page
 * still serves, so nothing 404'd and no monitor complained. It carries no
 * cartridge, no current.json and no nearest-substation path: 21,045 bytes with
 * zero engine markers, against 20 cartridge references in the v9 shell. Every
 * MAP click from Pipeline News therefore landed somewhere that could not
 * compute a nearest substation, a corridor estimate or a rating envelope.
 *
 * It was not intermittent and it was not the browser. The route was hard-coded
 * in the consumer, in atlasUrlV9_5_1(), and the contract published nothing
 * about which receiver was canonical for that route to disagree with. This
 * proof is the thing that was missing.
 *
 * It runs OFFLINE. No socket is opened. That is deliberate: the workflow that
 * rewrites links is only permitted to run after this has passed on the
 * machine, and a gate that needs the network cannot gate anything when the
 * network is what has changed.
 *
 * Run: node proofs/deeplink-receiver.proof.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CANONICAL_RECEIVER,
    RETIRED_RECEIVERS,
    isRetiredReceiver,
    buildDeepLink,
    auditProjectRows
} from '../deeplink/contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

/* 1. The contract states a canonical receiver at all. */
check('the contract names a canonical receiver',
    typeof CANONICAL_RECEIVER === 'string' && CANONICAL_RECEIVER.length > 0,
    CANONICAL_RECEIVER);
check('the canonical receiver is the v9 Atlas, which is what carries the cartridges',
    CANONICAL_RECEIVER === 'https://ventusltd.github.io/gridatlas/atlas/',
    CANONICAL_RECEIVER);

/* 2. The retired one is named, so it can be refused rather than remembered. */
check('the V8 overlay is named as retired',
    RETIRED_RECEIVERS.includes('https://globalgrid2050.com/repd_grid_atlasv8/'),
    RETIRED_RECEIVERS.join(', '));
check('a retired receiver is recognised with or without a trailing slash',
    isRetiredReceiver('https://globalgrid2050.com/repd_grid_atlasv8')
    && isRetiredReceiver('https://globalgrid2050.com/repd_grid_atlasv8/'),
    'trailing slash ignored');
check('a retired receiver is recognised when the consumer has appended parameters',
    isRetiredReceiver('https://globalgrid2050.com/repd_grid_atlasv8/?repd_ref=8162&technology=solar'),
    'this is the exact shape atlasUrlV9_5_1 produced');
check('the canonical receiver is not itself flagged retired',
    !isRetiredReceiver(CANONICAL_RECEIVER), CANONICAL_RECEIVER);

/* 3. The single-argument form, which is what every consumer should use. */
const longfield = {
    repd_ref: '8162', project: 'Longfield', technology: 'solar',
    capacity_mw: '500', latitude: '51.7831862', longitude: '0.5449877', zoom: '12'
};
const built = buildDeepLink(longfield);
check('buildDeepLink(project) supplies the canonical receiver itself',
    built.startsWith(CANONICAL_RECEIVER), built.slice(0, 64));
check('it carries the REPD identity, which is what the arrival resolves on',
    built.includes('repd_ref=8162'), 'repd_ref=8162');
check('it carries the supplied point',
    built.includes('latitude=51.7831862') && built.includes('longitude=0.5449877'),
    'latitude and longitude preserved');

/* 4. The refusal. This is the check that would have caught the live fault. */
let refused = false;
let refusalMessage = '';
try {
    buildDeepLink('https://globalgrid2050.com/repd_grid_atlasv8/', longfield);
} catch (error) {
    refused = true;
    refusalMessage = String(error.message);
}
check('building against the retired receiver throws rather than returning a dead link',
    refused, refusalMessage.slice(0, 96));
check('the refusal names the receiver to use instead',
    refusalMessage.includes(CANONICAL_RECEIVER),
    'the message is actionable, not just a rejection');

/* 5. receivers.json and the module must not drift apart. The JSON is the form
      a consumer reads when it cannot import this module, so a difference
      between them is two contracts wearing one name. */
const published = JSON.parse(readFileSync(path.join(ROOT, 'deeplink', 'receivers.json'), 'utf8'));
check('receivers.json agrees with the module on the canonical route',
    published.canonical && published.canonical.route === CANONICAL_RECEIVER,
    published.canonical && published.canonical.route);
check('receivers.json agrees with the module on what is retired',
    Array.isArray(published.retired)
    && published.retired.map((r) => r.route).sort().join('|') === [...RETIRED_RECEIVERS].sort().join('|'),
    (published.retired || []).map((r) => r.route).join(', '));
check('the retired entry records that it carries no engine',
    (published.retired || []).every((r) => r.carries_engine === false),
    'carries_engine: false');

/* 6. The query: every row with an REPD identity, and the link it should have.
      Asserted on a fixture that contains each case the live corpus contains —
      a good row, a row already on the retired receiver, a row with an identity
      but no geometry (28 of the 7,680 in v9.5.1), and a row with no identity
      at all. A check built only from rows that already pass cannot fail. */
const audit = auditProjectRows([
    longfield,
    { ...longfield, repd_ref: '12588', href: 'https://globalgrid2050.com/repd_grid_atlasv8/?repd_ref=12588' },
    { repd_ref: '9999', project: 'No geometry' },
    { project: 'No identity', latitude: '51', longitude: '0' }
]);
check('the query finds every row carrying an REPD identity', audit.with_identity === 3, `${audit.with_identity} of ${audit.total}`);
check('a row with an identity but no geometry is reported, never silently skipped',
    audit.no_geometry === 1 && audit.entries[2].linkable === false, `${audit.no_geometry} without geometry`);
check('a row with no REPD identity is not given a link',
    audit.entries[3].expected_href === null, 'no identity, no link');
check('a row already pointing at the retired receiver is counted',
    audit.on_retired_receiver === 1, `${audit.on_retired_receiver} on a retired receiver`);
check('that row is marked as needing an update, with the link it should have',
    audit.needs_update === 1 && audit.entries[1].expected_href.startsWith(CANONICAL_RECEIVER),
    audit.entries[1].expected_href.slice(0, 64));

/* 7. Offline. The workflow that rewrites links may only run after this has
      passed on the machine, so the code it gates must not need a network to
      reach a verdict.

      Assert it of the CONTRACT — the module the audit and the updater both
      run — rather than of this file. The first version of this check read its
      own source and failed on the regex literal inside itself, which is the
      same class of mistake as a check that fails on its own prose. */
const contractSource = readFileSync(path.join(ROOT, 'deeplink', 'contract.js'), 'utf8');
check('the contract opens no socket, so the audit runs offline',
    !/\bfetch\s*\(|node:https|node:http\b|XMLHttpRequest/.test(contractSource),
    'no network call in deeplink/contract.js');

let failed = 0;
for (const c of checks) {
    if (!c.ok) failed += 1;
    console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? '  -- ' + c.detail : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) {
    console.error(`${failed} FAILED`);
    process.exit(1);
}
