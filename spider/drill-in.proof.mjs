/* drill-in.proof.mjs — lazy drill-in through child_path, proved in real browsers.
 *
 * A node may carry child_path. "⊕ Open" on its card fetches that graph file (resolved
 * against the URL of the graph file the node came from), pushes the current scope on
 * the stack and makes the child the scope; the crumbs lead back. ?open=a,b walks such
 * a chain on load. A child that cannot be fetched leaves the scope unchanged and says
 * so in the hint line. Fetched children are kept for the session.
 *
 * The page is driven over http, in Chromium and WebKit, with Playwright's real mouse.
 * This proof serves the repository root itself and mounts a fixture graph set it writes
 * to a temp directory at /drill-fixture/, then registers it with the page's test-only
 * ?manifest=<same-origin path> override (index.html, wireReceiver). The fixture is a
 * root graph → sub/child.json → grandchild.json, so the relative-to-previous rule is
 * exercised, plus a node whose child_path is a 404.
 *
 * Usage: node spider/drill-in.proof.mjs
 * A missing browser is a FAIL, never a skip.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (engine, name, ok, detail = '') => { results.push({ engine, name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ' — ' + detail : ''}`); };
const finish = () => { const failed = results.filter(r => !r.ok).length; console.log(`${results.length - failed}/${results.length} checks passed`); process.exit(failed ? 1 : 0); };

let pw;
try { pw = await import('playwright'); }
catch (e) { check('setup', 'playwright with Chromium and WebKit is installed', false, String(e).slice(0, 160)); finish(); }

/* ── fixture ─────────────────────────────────────────────────────────────── */
const FIX = mkdtempSync(path.join(os.tmpdir(), 'drill-fixture-'));
mkdirSync(path.join(FIX, 'sub'));
const write = (p, o) => writeFileSync(path.join(FIX, p), JSON.stringify(o, null, 1));
write('manifest.json', { schema_version: 'receiver-manifest-v1', graphs: [
  { id: 'drill-root', title: 'Drill root', path: './drill-fixture/root.json', source_spider: 'drill-in proof fixture', description: 'fixture' }
] });
write('root.json', { title: 'Drill root', nodes: [
  { id: 'a', label: 'Root A', type: 'data', rag: 'green', reason: 'opens the child graph', child_path: 'sub/child.json' },
  { id: 'b', label: 'Root B', type: 'data', rag: 'amber', reason: 'its child is missing', child_path: 'sub/missing.json' },
  { id: 'c', label: 'Root C', type: 'unknown', rag: 'grey', reason: 'opens nothing' }
], edges: [['a', 'b', 'data'], ['a', 'c', 'repo']] });
write('sub/child.json', { title: 'Child graph', nodes: [
  { id: 'c1', label: 'Child 1', type: 'data', rag: 'green', reason: 'opens the grandchild', child_path: 'grandchild.json' },
  { id: 'c2', label: 'Child 2' }, { id: 'c3', label: 'Child 3' }, { id: 'c4', label: 'Child 4' }, { id: 'c5', label: 'Child 5' }
], edges: [['c1', 'c2', 'data'], ['c1', 'c3', 'data'], ['c4', 'c1', 'repo'], ['c5', 'c1', 'repo']] });
write('sub/grandchild.json', { title: 'Grandchild graph', nodes: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].map(l => ({ id: l, label: l, type: 'unknown', rag: 'blue' })),
  edges: [['G1', 'G2', 'data'], ['G1', 'G3', 'data'], ['G3', 'G4', 'repo'], ['G5', 'G1', 'repo'], ['G6', 'G7', 'data']] });

/* ── server: repository root, plus the fixture at /drill-fixture/ ────────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.yml': 'text/yaml', '.md': 'text/markdown' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  let file;
  if (p.startsWith('/drill-fixture/')) file = path.join(FIX, p.slice('/drill-fixture/'.length));
  else file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(FIX) && !file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const PAGE = `${BASE}/index.html?manifest=./drill-fixture/manifest.json`;
console.log(`serving ${ROOT} and fixture ${FIX} at ${BASE}`);

/* ── the drive ───────────────────────────────────────────────────────────── */
// the count line appears at the first draw, which during an ?open= chain is before the chain has finished, so wait until the crumbs and hint stop changing
const ready = async page => { await page.waitForFunction(() => { const c = document.getElementById('count'); return c && /\d/.test(c.textContent); }, null, { timeout: 30000 }); let last = ''; for (let i = 0; i < 25; i++) { await page.waitForTimeout(400); const now = await page.$eval('#crumbs', c => c.textContent) + '|' + await page.$eval('#hint', h => h.textContent); if (now === last) break; last = now; } };
const crumbs = page => page.$$eval('#crumbs a, #crumbs strong', els => els.map(e => e.textContent));
const options = page => page.locator('#focus option').count();
const centreName = page => page.$eval('#overlay .is-center .name', e => e.textContent).catch(() => '');
const hint = page => page.$eval('#hint', h => h.textContent);
const mouseClick = async (page, locator) => { await locator.scrollIntoViewIfNeeded(); const b = await locator.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(700); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [engine, type] of [['chromium', pw.chromium], ['webkit', pw.webkit]]) {
  let browser;
  try { browser = await type.launch(); }
  catch (e) { check(engine, 'browser launches', false, String(e).slice(0, 160)); continue; }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('popup', p => p.close());
  const fetched = {};
  page.on('request', r => { const p = new URL(r.url()).pathname; if (p.startsWith('/drill-fixture/')) fetched[p] = (fetched[p] || 0) + 1; });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  try {
    /* 1. the fixture is registered and opened; nothing below it is fetched yet */
    await page.goto(`${PAGE}&graph=drill-root`); await ready(page);
    check(engine, 'fixture root opens as a scope', same(await crumbs(page), ['Federation', 'Drill root']) && await options(page) === 3, `crumbs ${JSON.stringify(await crumbs(page))}, ${await options(page)} nodes`);
    check(engine, 'no child graph is fetched before Open', !fetched['/drill-fixture/sub/child.json'], JSON.stringify(fetched));
    const openBtn = page.locator('#overlay .is-center .opengraph');
    check(engine, 'the focused card with child_path shows an Open control', await openBtn.count() === 1 && /⊕ Open/.test(await openBtn.first().textContent()));

    /* 2. Open twice: root → child → grandchild */
    await mouseClick(page, openBtn.first());
    check(engine, 'Open fetches the child and makes it the scope', same(await crumbs(page), ['Federation', 'Drill root', 'Child graph']) && await options(page) === 5, `crumbs ${JSON.stringify(await crumbs(page))}, ${await options(page)} nodes`);
    check(engine, 'the child was fetched relative to the root graph file', fetched['/drill-fixture/sub/child.json'] === 1, JSON.stringify(fetched));
    await mouseClick(page, page.locator('#overlay .is-center .opengraph').first());
    check(engine, 'Open again fetches the grandchild relative to the child', same(await crumbs(page), ['Federation', 'Drill root', 'Child graph', 'Grandchild graph']) && await options(page) === 7 && fetched['/drill-fixture/sub/grandchild.json'] === 1, `crumbs ${JSON.stringify(await crumbs(page))}, ${await options(page)} nodes`);

    /* 3. the crumbs pop back */
    await mouseClick(page, page.locator('#crumbs a', { hasText: 'Drill root' }));
    check(engine, 'a crumb pops back to the root scope with its focus restored', same(await crumbs(page), ['Federation', 'Drill root']) && await options(page) === 3 && await centreName(page) === 'Root A', `crumbs ${JSON.stringify(await crumbs(page))}, centre "${await centreName(page)}"`);

    /* 4. a fetched child is kept for the session */
    await mouseClick(page, page.locator('#overlay .is-center .opengraph').first());
    check(engine, 'reopening a child uses the session cache', same(await crumbs(page), ['Federation', 'Drill root', 'Child graph']) && fetched['/drill-fixture/sub/child.json'] === 1, `child fetched ${fetched['/drill-fixture/sub/child.json']} time(s)`);
    await mouseClick(page, page.locator('#crumbs a', { hasText: 'Drill root' }));

    /* 5. spider view: the neighbour with child_path carries a marker; a 404 child leaves the scope unchanged */
    await page.click('#spiderToggle'); await page.waitForTimeout(1000);
    const markedB = await page.locator('#overlay .place:not(.center) .card', { hasText: 'Root B' }).locator('.opens').count();
    const markedC = await page.locator('#overlay .place:not(.center) .card', { hasText: 'Root C' }).locator('.opens').count();
    check(engine, 'in spider view the neighbour with child_path shows the ⊕ marker and the one without does not', markedB === 1 && markedC === 0, `Root B ${markedB}, Root C ${markedC}`);
    await mouseClick(page, page.locator('#overlay .place:not(.center) .card', { hasText: 'Root B' }));
    check(engine, 'a mouse click re-centres on the neighbour', await centreName(page) === 'Root B', `centre "${await centreName(page)}"`);
    await mouseClick(page, page.locator('#overlay .place.center .opengraph').first());
    await page.waitForTimeout(500);
    const h404 = await hint(page);
    check(engine, 'a 404 child leaves the scope unchanged', same(await crumbs(page), ['Federation', 'Drill root']) && await options(page) === 3 && await centreName(page) === 'Root B', `crumbs ${JSON.stringify(await crumbs(page))}`);
    check(engine, 'the 404 is said in one plain sentence in the hint line', /Could not open sub\/missing\.json \(HTTP 404\); the current graph is unchanged\./.test(h404), h404.slice(-120));
    await page.click('#spiderToggle'); await page.waitForTimeout(400);
    check(engine, 'the sentence clears on the next action', !/Could not open/.test(await hint(page)));

    /* 6. deep link chain, then focus within the last scope */
    await page.goto(`${PAGE}&graph=drill-root&open=sub/child.json,grandchild.json&focus=G3`); await ready(page);
    check(engine, '?open= walks the chain on load and ?focus= applies in the last scope', same(await crumbs(page), ['Federation', 'Drill root', 'Child graph', 'Grandchild graph']) && await options(page) === 7 && await centreName(page) === 'G3', `crumbs ${JSON.stringify(await crumbs(page))}, centre "${await centreName(page)}"`);
    check(engine, 'a valid chain shows no note', !/could not be fetched|does not/.test(await hint(page)));
    await page.goto(`${PAGE}&graph=drill-root&open=sub/child.json,nope.json&focus=Child 2`); await ready(page);
    const hBad = await hint(page);
    check(engine, 'an unknown path stops the chain at the last good scope', same(await crumbs(page), ['Federation', 'Drill root', 'Child graph']) && await centreName(page) === 'Child 2', `crumbs ${JSON.stringify(await crumbs(page))}, centre "${await centreName(page)}"`);
    check(engine, 'the stopped chain is reported in the hint', /asked to open "nope\.json", which could not be fetched \(HTTP 404\); showing Child graph\./.test(hBad), hBad.slice(-160));
    await page.setViewportSize({ width: 900, height: 700 }); await page.waitForTimeout(400);
    check(engine, 'the note survives a resize redraw until the reader acts', /could not be fetched/.test(await hint(page)));

    /* 7. the manifest override refuses another origin */
    await page.goto(`${BASE}/index.html?manifest=https://example.com/manifest.json&graph=drill-root`); await ready(page);
    check(engine, 'a cross-origin ?manifest= is ignored', await page.evaluate(() => !SCOPES['drill-root']) && /does not list/.test(await hint(page)));

    check(engine, 'no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 160));
  } catch (e) {
    check(engine, 'proof ran to the end', false, String(e).slice(0, 240));
  } finally { await browser.close(); }
}
server.close();
finish();
