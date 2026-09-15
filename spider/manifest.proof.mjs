/* manifest.proof.mjs — every graph spider/manifest.json lists is fetched, and
 * every count the manifest states is compared with what that path serves.
 *
 * Fails if any path (or edges_path) does not load, if any entry states no
 * measured count, or if any stated count differs from the served count.
 * "Stated" means the entry's "measured" field and any "N nodes / M edges"
 * written in its description or verified line.
 *
 * Before the real manifest is checked, the checker is run against
 * spider/fixtures/manifest.negative.json, which carries one stale count and
 * one missing path beside one correct control entry. The checker must flag
 * exactly those two; if it does not, it cannot be trusted to pass anything,
 * and this proof fails.
 *
 * Counts are taken the way index.html's normaliseGenericGraph and
 * spider/update_manifest.py take them: nodes (or features) from path; edges
 * (or links) from edges_path when the entry has one, otherwise from path; a
 * bare JSON array is its own count.
 *
 * Needs the network for https paths, so it is NOT one of the offline proofs
 * verify.mjs runs. .github/workflows/spider-features.yml runs it after the
 * manifest is refreshed and before anything is committed.
 *
 *   node spider/manifest.proof.mjs
 *   node spider/manifest.proof.mjs --base=https://ventusltd.github.io/ventus-grid-engine/
 *       (read ./ paths from the published site instead of this checkout)
 *   node spider/manifest.proof.mjs --manifest=<file>
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const arg = name => (process.argv.find(a => a.startsWith('--' + name + '=')) || '').slice(name.length + 3) || null;
const base = arg('base');
const manifestPath = arg('manifest') || join(here, 'manifest.json');

async function load(path) {
    const stripBom = text => (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
    if (/^https?:\/\//.test(path) || base) {
        const url = /^https?:\/\//.test(path) ? path : new URL(path, base).href;
        const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return JSON.parse(stripBom(await r.text()));
    }
    let text;
    try { text = readFileSync(join(root, path), 'utf8'); }
    catch (err) { throw new Error(err.code === 'ENOENT' ? 'not found: ' + path : String(err.message)); }
    return JSON.parse(stripBom(text));
}

function count(raw) {
    if (Array.isArray(raw)) return [raw.length, raw.length];
    const nodes = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(raw.features) ? raw.features : [];
    const edges = Array.isArray(raw.edges) ? raw.edges : Array.isArray(raw.links) ? raw.links : [];
    return [nodes.length, edges.length];
}

function statedCounts(entry) {
    const stated = [];
    if (entry.measured) stated.push(['measured', entry.measured.nodes, entry.measured.edges]);
    for (const field of ['description', 'verified']) {
        const text = String(entry[field] || '').replace(/(\d),(\d)/g, '$1$2');
        for (const m of text.matchAll(/(\d+)\s+nodes?\s*\/\s*(\d+)\s+edges?/gi)) {
            stated.push([field, Number(m[1]), Number(m[2])]);
        }
    }
    return stated;
}

async function check(manifest) {
    const failures = [];
    const report = [];
    for (const entry of manifest.graphs || []) {
        if (!entry.id || !entry.path) { failures.push([entry.id || '?', 'no id or path']); continue; }
        let served;
        try {
            const [n, eFromPath] = count(await load(entry.path));
            const e = entry.edges_path ? count(await load(entry.edges_path))[1] : eFromPath;
            served = [n, e];
        } catch (err) {
            failures.push([entry.id, 'path does not load: ' + String(err.message || err).slice(0, 160)]);
            continue;
        }
        const stated = statedCounts(entry);
        if (!entry.measured) failures.push([entry.id, 'no measured count stated']);
        for (const [field, n, e] of stated) {
            if (n !== served[0] || e !== served[1]) {
                failures.push([entry.id, field + ' states ' + n + ' nodes / ' + e + ' edges; served ' + served[0] + ' / ' + served[1]]);
            }
        }
        report.push(entry.id + ': served ' + served[0] + ' nodes / ' + served[1] + ' edges');
    }
    return { failures, report };
}

/* 1. The checker must fail the negative fixture, and for the right reasons. */
const negative = await check(JSON.parse(readFileSync(join(here, 'fixtures', 'manifest.negative.json'), 'utf8')));
const flagged = new Set(negative.failures.map(f => f[0]));
console.log('negative fixture: ' + negative.failures.length + ' failures reported');
for (const [id, why] of negative.failures) console.log('  - ' + id + ': ' + why);
if (!flagged.has('stale-count') || !flagged.has('missing-path') || flagged.has('control')) {
    console.error('manifest proof FAILED: the checker did not flag exactly the stale count and the missing '
        + 'path in fixtures/manifest.negative.json, so its verdict on the real manifest cannot be trusted.');
    process.exit(1);
}

/* 2. The real manifest. */
const real = await check(JSON.parse(readFileSync(manifestPath, 'utf8')));
for (const line of real.report) console.log('  ' + line);
if (real.failures.length) {
    console.error('manifest proof FAILED (' + real.failures.length + '):');
    for (const [id, why] of real.failures) console.error('  - ' + id + ': ' + why);
    process.exit(1);
}
const checks = 3 + real.report.length;
console.log('manifest proof PASS — ' + checks + ' checks (' + real.report.length + ' graphs match their stated counts; negative fixture failed as it must)');
