/* audit-receivers.mjs — run the query over real project rows and report.
 *
 * The query itself lives in deeplink/contract.js as auditProjectRows, so this
 * tool and the proof that gates it run the same code. An audit whose logic
 * differs from the fix it authorises is not a gate.
 *
 * READ-ONLY. It rewrites nothing, anywhere. The engine publishes the contract;
 * it does not edit its consumers. The fault this exists to prevent was a link
 * silently pointing at a receiver that carries no engine, and the cure must not
 * be a workflow that silently rewrites links across the estate.
 *
 *   node tools/audit-receivers.mjs --report
 *   node tools/audit-receivers.mjs --rows path/to/rows.json
 *
 * With no --rows it reads the published Pipeline News release contract if a
 * local copy is present, and otherwise audits nothing and says so — it does not
 * reach for the network, because this runs in the step that must work offline.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditProjectRows, CANONICAL_RECEIVER, RETIRED_RECEIVERS } from '../deeplink/contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(flag) {
    const i = process.argv.indexOf(flag);
    return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
        ? process.argv[i + 1] : null;
}

/* Rows come from a file, never from a socket. A gate that needs the network
   cannot gate anything when the network is what has changed. */
const rowsPath = arg('--rows');
let rows = [];
let source = 'none';

if (rowsPath && existsSync(rowsPath)) {
    const parsed = JSON.parse(readFileSync(rowsPath, 'utf8'));
    rows = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.projects || []);
    source = rowsPath;
} else {
    /* Known local locations, in order. Absent is a reported state, not a
       silent skip: a check that quietly finds nothing to check is the failure
       mode this estate has paid for repeatedly. */
    const candidates = [
        path.join(ROOT, 'sources', 'pipelinenews-rows.json'),
        path.join(ROOT, '..', 'globalgrid2050', 'uk_renewables_pipeline', 'v9.7', 'data', 'projects.json')
    ];
    const found = candidates.find((p) => existsSync(p));
    if (found) {
        const parsed = JSON.parse(readFileSync(found, 'utf8'));
        rows = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.projects || []);
        source = found;
    }
}

const audit = auditProjectRows(rows);

const report = {
    schema: 'ventus.grid-engine.receiver-audit.v1',
    generated_utc: new Date().toISOString(),
    canonical_receiver: CANONICAL_RECEIVER,
    retired_receivers: RETIRED_RECEIVERS,
    source,
    rows_read: audit.total,
    with_repd_identity: audit.with_identity,
    linkable: audit.linkable,
    identity_but_no_geometry: audit.no_geometry,
    currently_on_a_retired_receiver: audit.on_retired_receiver,
    needs_update: audit.needs_update,
    /* Sampled, not truncated silently: the count above is the whole truth and
       this is only what a reader needs to see the shape of it. */
    sample_needing_update: audit.entries
        .filter((e) => e.linkable && e.current_href && e.current_href !== e.expected_href)
        .slice(0, 20)
};

writeFileSync(path.join(process.cwd(), 'receiver-audit.json'),
    JSON.stringify(report, null, 2) + '\n');

console.log(`source                       ${report.source}`);
console.log(`rows read                    ${report.rows_read}`);
console.log(`with an REPD identity        ${report.with_repd_identity}`);
console.log(`linkable                     ${report.linkable}`);
console.log(`identity but no geometry     ${report.identity_but_no_geometry}`);
console.log(`on a retired receiver        ${report.currently_on_a_retired_receiver}`);
console.log(`needs update                 ${report.needs_update}`);

if (report.source === 'none') {
    console.log('\nNo rows were available locally, so nothing was audited. That is reported,');
    console.log('not passed: this step opens no socket by design, and a check that finds');
    console.log('nothing to check has not checked anything.');
}
