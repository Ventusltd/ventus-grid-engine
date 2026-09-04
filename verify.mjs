/* verify.mjs — the fail-closed gate.
 *
 * Every proof in proofs/ runs here. If any one of them fails, this process
 * exits non-zero, and the CI workflow runs this step BEFORE the step that
 * commits or publishes anything. That ordering — not the assertions
 * themselves — is what stops an unverified product reaching a consumer. It is
 * copied deliberately from data-grid-gb, where the same ordering is what makes
 * its fail-closed claim true rather than aspirational.
 *
 * Each proof runs in its own child process. That is not ceremony: a proof
 * signals failure by exiting non-zero, so importing them into one process
 * would let the first failure kill the run and hide the state of every proof
 * after it. A report that stops at the first problem is how a second problem
 * survives to production.
 *
 * Run: node verify.mjs
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const proofsDir = join(here, 'proofs');

const proofs = readdirSync(proofsDir)
    .filter(f => f.endsWith('.proof.mjs'))
    .sort();

if (proofs.length === 0) {
    console.error('verify FAILED: proofs/ contains no proof, so nothing was checked.');
    console.error('An empty proof set must never read as a pass — that is the one');
    console.error('failure mode a verifier cannot be allowed to have.');
    process.exit(1);
}

let totalChecks = 0;
const failed = [];

for (const file of proofs) {
    const run = spawnSync(process.execPath, [join(proofsDir, file)], {
        encoding: 'utf8'
    });
    const out = (run.stdout || '') + (run.stderr || '');
    process.stdout.write(out);

    if (run.status === 0) {
        const m = out.match(/PASS — (\d+) checks/);
        totalChecks += m ? Number(m[1]) : 0;
    } else {
        failed.push(file);
    }
}

console.log('');
if (failed.length) {
    console.error('verify FAILED — ' + failed.length + ' of ' + proofs.length
        + ' proofs did not pass:');
    for (const f of failed) console.error('  - ' + f);
    process.exit(1);
}

console.log('verify PASS — ' + proofs.length + ' proofs, ' + totalChecks + ' checks');
