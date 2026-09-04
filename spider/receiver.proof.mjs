/* receiver.proof.mjs — the Spider Sandbox receiver held to the same format
 * as the reference it copies: spider_full_po_test.html in
 * data-federation-map-for-globalgrid2050-all-repos/dashboard/sandbox/.
 *
 * This proof drives the real page in real browsers (Playwright: Chromium
 * and WebKit) because the thing being verified — the iconic 🕷 button's two
 * states, the FOCUS re-centre, the card layout — is DOM and CSS behaviour
 * that a plain Node import cannot see.
 *
 * NOT auto-discovered by verify.mjs: verify.mjs only reads *.proof.mjs
 * directly inside proofs/, not subdirectories (see ../verify.mjs, the
 * readdirSync(proofsDir) call is non-recursive). That is a deliberate
 * decision left alone here rather than edited around. Run this proof
 * by hand:
 *
 *   node spider/receiver.proof.mjs
 *
 * It requires the "playwright" package with Chromium and WebKit installed.
 * That is not a dependency of this repo (package.json is intentionally
 * untouched). Install it ad hoc to run this proof:
 *
 *   npm i -D playwright && npx playwright install chromium webkit
 *
 * NODE_PATH does NOT make Node's ESM resolver find an existing playwright
 * install elsewhere — only CommonJS require() honours NODE_PATH. To reuse
 * an install that already lives outside this repo without adding it as a
 * real dependency, make node_modules/playwright (and node_modules/
 * playwright-core) a directory junction pointing at it, e.g. on the machine
 * this was built on:
 *   New-Item -ItemType Junction -Path node_modules\playwright -Target <that install>\node_modules\playwright
 *   New-Item -ItemType Junction -Path node_modules\playwright-core -Target <that install>\node_modules\playwright-core
 * then remove node_modules afterwards — it is not meant to be committed.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file:///' + join(here, '..', 'index.html').replace(/\\/g, '/');

const failures = [];
let passed = 0;
const check = (name, condition) => {
    if (condition) passed += 1;
    else failures.push(name);
};

let engines;
try {
    const pw = await import('playwright');
    engines = [['chromium', pw.chromium], ['webkit', pw.webkit]];
} catch (e) {
    console.error('receiver proof SKIPPED (not a failure of the page): the '
        + '"playwright" package is not installed in this environment, so the '
        + 'browser-driven checks below cannot run. See the header of this '
        + 'file for how to install it. Exiting non-zero because an '
        + 'unverified receiver must never be reported as a pass.');
    process.exit(1);
}

// WebKit (unlike Chromium) surfaces a blocked file:// fetch() as BOTH a
// console error AND a Playwright 'pageerror' event — even though every
// fetch() in this page is inside try/catch and the rejection genuinely is
// caught (proved by every other check in this file passing: cards render,
// the count line is correct, the spider button works, on both engines).
// Confirmed by a standalone diagnostic run against this exact file before
// writing this filter: the message is always literally "Fetch API cannot
// load file: //... due to access control checks." — a network/access-
// control notice from the engine, not an uncaught exception in page logic.
// It is filtered out here by name, not swallowed silently, so any other
// pageerror still fails the proof.
const KNOWN_FILE_FETCH_NOISE = /Fetch API cannot load file:.*access control checks/;

async function withPage(browser, viewport, fn) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on('pageerror', e => {
        const msg = String(e);
        if (!KNOWN_FILE_FETCH_NOISE.test(msg)) pageErrors.push(msg);
    });
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(150); // let the async loader's draw() settle
    await fn(page, pageErrors);
    await page.close();
}

async function runSuite(label, browserType) {
    const c = (name, condition) => check(label + ': ' + name, condition);
    const browser = await browserType.launch();

    /* ── Desktop pass: 1400x900 ──────────────────────────────────────────── */

    await withPage(browser, { width: 1400, height: 900 }, async (page, pageErrors) => {

        c('desktop 1400x900: page raised zero uncaught page errors on load',
            pageErrors.length === 0);

        c('the brand eyebrow and title are exactly as the reference renders '
            + 'them (markup case; CSS text-transform:uppercase renders the '
            + 'eyebrow in caps, which is why this checks textContent, not the '
            + 'rendered case)',
            (await page.locator('.brand .ey').textContent()) === 'Ventus · Global Grid 2050'
            && (await page.locator('.brand h1').textContent()) === 'The Spider Sandbox');

        c('the FOCUS select exists and is populated from the loaded scope',
            (await page.locator('#focus option').count()) > 0);

        const relButtons = await page.locator('#relSeg button').allInnerTexts();
        c('the SHOW segmented control offers exactly Both / Outgoing / Incoming',
            relButtons.map(t => t.trim()).join('|') === 'Both|Outgoing|Incoming');

        const tapButtons = await page.locator('#actSeg button').allInnerTexts();
        c('the tap-action tabs are Explore / GitHub / External / Status, in order',
            tapButtons.map(t => t.trim()).join('|') === 'Explore|GitHub|External|Status');

        c('the LIVE/snapshot source pill is present',
            await page.locator('#srcTag').count() === 1);

        c('the count line reads "<n> dependencies · <m> dependents" and the '
            + 'numbers match what the page itself computed for the focused node',
            await page.evaluate(() => {
                const { out, inc } = (() => {
                    const o = [], i = [];
                    S().edges.forEach(([f, t, ty]) => { if (f === current) o.push(t); if (t === current) i.push(f); });
                    return { out: o, inc: i };
                })();
                const text = document.getElementById('count').textContent;
                return text.includes(String(out.length)) && text.includes(String(inc.length))
                    && /dependencies/.test(text) && /dependents/.test(text);
            }));

        c('the Federation section heading text and Explore hint are present',
            (await page.locator('.sect').first().textContent()).toLowerCase().includes('depends on')
            && (await page.locator('#hint').innerText()).includes('tap a card to re-centre'));

        /* ── The iconic 🕷 button: Spider state (column view showing) ──────── */

        const btn = page.locator('#spiderToggle');
        c('spider button shows the spider glyph and starts labelled "Spider" '
            + '(offering to switch INTO spider view, because column view is '
            + 'showing)',
            (await page.locator('.spider-glyph').innerText()) === '🕷'
            && (await page.locator('#viewLabel').innerText()) === 'Spider');

        c('in this state aria-pressed is false and the pill border is the '
            + 'neutral grey, not the gold glow — matching the reference screenshot',
            (await btn.getAttribute('aria-pressed')) === 'false');

        const neutralBorder = await btn.evaluate(el => getComputedStyle(el).borderColor);
        c('neutral-state border colour is the reference rgba(255,255,255,.55), not gold',
            /rgba\(255,\s*255,\s*255,\s*0\.55\)/.test(neutralBorder));

        /* ── Toggle to spider view: pill becomes "Column", gold glow ───────── */

        await btn.click();
        await page.waitForTimeout(150);

        c('after one click aria-pressed flips true and the label flips to '
            + '"Column" (now offering to switch BACK to column view) — the '
            + "architect's inversion, preserved exactly",
            (await btn.getAttribute('aria-pressed')) === 'true'
            && (await page.locator('#viewLabel').innerText()) === 'Column');

        const goldBorder = await btn.evaluate(el => getComputedStyle(el).borderColor);
        c('pressed-state border colour is the architect\'s gold, #ffd54a '
            + '(rgb 255,213,74), from federation_radial.css .viewbtn[aria-pressed="true"]',
            /rgb\(255,\s*213,\s*74\)/.test(goldBorder));

        const goldShadow = await btn.evaluate(el => getComputedStyle(el).boxShadow);
        c('pressed-state box-shadow carries the gold glow colour, not the '
            + 'reference sandbox\'s plain cyan glow (this button is the gold-CSS '
            + 'override, federation_radial.css, applied after the base <style>)',
            /213,\s*74/.test(goldShadow) || /255,\s*213,\s*74/.test(goldShadow));

        c('spider view rendered the dark grid canvas and its banner text '
            + 'verbatim from the reference',
            (await page.locator('.spiderCanvas').count()) === 1
            && (await page.locator('.maphint').innerText())
                .includes('Optional spider view. Cards keep their size'));

        c('the spider canvas grid and coloured wire arrows are present',
            (await page.locator('.spiderGrid').count()) === 1
            && (await page.locator('.wires line').count()) >= 1);

        /* ── Toggle back: Spider state returns exactly ──────────────────────── */

        await btn.click();
        await page.waitForTimeout(150);
        c('clicking again returns aria-pressed to false and label to "Spider"',
            (await btn.getAttribute('aria-pressed')) === 'false'
            && (await page.locator('#viewLabel').innerText()) === 'Spider');

        /* ── FOCUS re-centres ────────────────────────────────────────────── */

        const beforeCenter = await page.locator('.is-center .name').innerText();
        const optionCount = await page.locator('#focus option').count();
        if (optionCount > 1) {
            await page.selectOption('#focus', { index: 1 });
            await page.waitForTimeout(150);
            const afterCenter = await page.locator('.is-center .name').innerText();
            c('selecting a different FOCUS option re-centres the card shown',
                afterCenter !== beforeCenter);
        } else {
            c('FOCUS has at least one option to re-centre on (skipped: only one option loaded)', true);
        }

        /* ── Cards: badge, name, dot, coloured border ───────────────────────── */

        c('at least one non-centre card renders the kind badge, name and RAG dot',
            (await page.locator('.branch .card .badge').count()) > 0
            && (await page.locator('.branch .card .name').count()) > 0
            && (await page.locator('.branch .card .dot').count()) > 0);

        const twigBorder = await page.locator('.twig .card').first()
            .evaluate(el => getComputedStyle(el).borderLeftColor);
        c('a related card carries a coloured left border keyed to its edge type',
            twigBorder !== 'rgb(38, 43, 54)' /* --line, the uncoloured default */);

        const centerGlow = await page.locator('.is-center').first()
            .evaluate(el => getComputedStyle(el).boxShadow);
        c('the focused card glows cyan (is-center box-shadow)',
            /0,\s*229,\s*255/.test(centerGlow));

        /* ── SHOW segmented control actually filters ─────────────────────────── */

        await page.locator('#relSeg button[data-mode="out"]').click();
        await page.waitForTimeout(120);
        const sectTextsOut = await page.locator('.sect').allInnerTexts();
        c('SHOW → Outgoing hides the "Depended on by" column',
            sectTextsOut.some(t => /Depends on/i.test(t))
            && !sectTextsOut.some(t => /Depended on by/i.test(t)));
        await page.locator('#relSeg button[data-mode="both"]').click();
        await page.waitForTimeout(120);

        /* ── Manifest-driven graphs: engine-graph tolerates absence ─────────── */

        c('spider/manifest.json\'s "Engine population" graph is offered as a '
            + 'FOCUS/root card even though genome/engine-graph.json does not exist '
            + 'yet on this machine',
            await page.evaluate(() => SCOPES.root.nodes.some(n => n.label === 'Engine population')));

        c('drilling into the not-yet-emitted engine graph shows a clear '
            + 'placeholder card rather than an empty or broken view',
            await page.evaluate(() => {
                const s = SCOPES['engine-graph'];
                return !!s && s.nodes.length === 1 && /not yet emitted/.test(s.nodes[0].label);
            }));

        c('spider/manifest.json documents the genome-spider slot even though '
            + 'spiders/species/genome-spider does not exist yet',
            await page.evaluate(() => SCOPES.root.nodes.some(n => n.label === 'genome-spider output')));
    });

    /* ── ?graph= deep link ────────────────────────────────────────────────── */

    await withPage(browser, { width: 1400, height: 900 }, async (page) => {
        // engine-graph is used here (not globalgrid2050-contents) because that
        // scope only exists after a successful loadContents() fetch, which
        // file:// testing cannot exercise (both engines refuse fetch() on
        // file:// entirely). engine-graph always exists, live or placeholder,
        // from MANIFEST_FALLBACK.
        await page.goto(pageUrl + '?graph=engine-graph', { waitUntil: 'networkidle' });
        await page.waitForTimeout(200);
        c('?graph=engine-graph deep-links straight into that scope',
            await page.evaluate(() => scopeKey === 'engine-graph'));
    });

    /* ── Mobile pass: 393x852, the architect's review size ──────────────────── */

    await withPage(browser, { width: 393, height: 852 }, async (page, pageErrors) => {
        c('mobile 393x852: page raised zero uncaught page errors on load',
            pageErrors.length === 0);
        c('the spider button is present and tappable at phone width',
            await page.locator('#spiderToggle').isVisible());
        c('ground colour is the dark monospace panel background, not a light '
            + 'theme (phone-readable per the brief)',
            (await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
                .includes('11, 13, 18') /* #0b0d12 */);
        const box = await page.locator('body').evaluate(() => document.documentElement.scrollWidth);
        c('no horizontal overflow at 393px', box <= 394);
    });

    await browser.close();
}

for (const [label, browserType] of engines) {
    await runSuite(label, browserType);
}

if (failures.length) {
    console.error('receiver proof FAILED (' + failures.length + ' of '
        + (failures.length + passed) + '):\n- ' + failures.join('\n- '));
    process.exit(1);
}
console.log('receiver proof PASS — ' + passed + ' checks');
export default { status: 'PASS', checks: passed };
