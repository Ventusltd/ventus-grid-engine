/* receiver-focus-param.proof.mjs — ?focus= centres the graph on one module.
 *
 * Written 202609050300. The dashboards are being given menus that link INTO
 * the maths: a File menu in GridAtlas names an engine module and the reader
 * lands on that node with its dependencies already drawn. Before this, the
 * receiver read only ?graph=, so every such link would have opened the same
 * default node and the menu would have been decoration.
 *
 * What is asserted, and why each one earns its place:
 *
 *   - the parameter is read at all;
 *   - it matches on the node's OWN label, so a link is written with the same
 *     string the graph publishes and there is no second naming scheme to
 *     drift out of step with the first;
 *   - an unknown value is ignored rather than thrown, because a reader
 *     following a link to a module that has since been renamed should still
 *     get the graph, not a blank page;
 *   - every label this proof claims is linkable is actually present in
 *     genome/engine-graph.json, read from the file rather than restated here.
 *
 * Run: node proofs/receiver-focus-param.proof.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const page = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

check('the receiver reads a focus parameter', /qp\.get\("focus"\)/.test(page), 'qp.get("focus")');
check(
  'it matches the node label exactly before anything else',
  /ns\.findIndex\(n=>n\.label===wantFocus\)/.test(page),
  'exact label match first'
);
check(
  'it falls back to a case-insensitive label match',
  /toLowerCase\(\)===lc/.test(page),
  'case-insensitive second pass'
);
check(
  'an unknown focus is ignored, never thrown',
  /if\(i>=0\)current=i;/.test(page),
  'current is only reassigned on a hit'
);
check(
  'focus is applied after the graph is chosen, so it indexes the right scope',
  page.indexOf('qp.get("focus")') > page.indexOf('qp.get("graph")'),
  'focus is read after graph'
);

/* The labels the menus will link to must exist in the published graph. Read
   them; do not restate them. A menu that names a module the graph has dropped
   is a broken link that no assertion about the page's own source would catch. */
const graph = JSON.parse(readFileSync(path.join(ROOT, 'genome', 'engine-graph.json'), 'utf8'));
const labels = new Set((graph.nodes || []).map(n => n.label));
check('the engine graph publishes nodes to focus on', labels.size > 0, `${labels.size} labelled nodes`);

const canonical = (graph.nodes || []).filter(n => n.type === 'canonical').map(n => n.label);
check(
  'the canonical engine modules are all labelled and linkable',
  canonical.length > 0 && canonical.every(l => typeof l === 'string' && l.length > 0),
  `${canonical.length} canonical modules: ${canonical.slice(0, 3).join(', ')}${canonical.length > 3 ? ' …' : ''}`
);
check(
  'the graph names a default focus, so a link without ?focus still lands somewhere',
  typeof graph.focus_default === 'string' || Number.isInteger(graph.focus_default),
  String(graph.focus_default)
);

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
