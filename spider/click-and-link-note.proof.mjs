/* click-and-link-note.proof.mjs — review-branch proof for two proposed fixes to index.html.
 *
 * 1. In the spider view, a real mouse click on a neighbour card must re-centre on it,
 *    and a drag of more than 6 px must pan without changing the focus.
 * 2. A link naming a graph or card the page does not have must say so in the hint line.
 *
 * Drives the page over http (not file://, so the real data loads) in Chromium and WebKit
 * with Playwright's real mouse, which is what exposed the pointer-capture fault.
 * Usage: PAGE_URL=http://127.0.0.1:8000/index.html node spider/click-and-link-note.proof.mjs
 * A missing browser or page is a FAIL, never a skip.
 */
const PAGE = process.env.PAGE_URL;
if (!PAGE) { console.error('FAIL: PAGE_URL not set'); process.exit(1); }
const pw = await import('playwright');
const results = [];
const check = (engine, name, ok, detail = '') => { results.push({ engine, name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ' — ' + detail : ''}`); };

const ready = async page => { await page.waitForFunction(() => { const c = document.getElementById('count'); return c && /\d/.test(c.textContent); }, null, { timeout: 30000 }); await page.waitForTimeout(800); };

for (const [engine, type] of [['chromium', pw.chromium], ['webkit', pw.webkit]]) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('popup', p => p.close());
  try {
    // Fix 1: a mouse click in the spider view re-centres
    await page.goto(`${PAGE}?graph=generated-apps`); await ready(page);
    await page.click('#spiderToggle'); await page.waitForTimeout(1200);
    const before = await page.$eval('#focus', s => s.value);
    const card = page.locator('#overlay .place:not(.center) .card').first();
    const n = await page.locator('#overlay .place:not(.center) .card').count();
    if (!n) { check(engine, 'spider view shows neighbour cards', false, '0 neighbour cards'); }
    else {
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1000);
      const after = await page.$eval('#focus', s => s.value);
      check(engine, 'mouse click on a neighbour card re-centres', after !== before, `focus ${before} -> ${after}`);

      // a drag must pan, not re-centre
      await page.waitForTimeout(600);
      const f0 = await page.$eval('#focus', s => s.value);
      const c2 = page.locator('#overlay .place:not(.center) .card').first();
      await c2.scrollIntoViewIfNeeded();
      const b2 = await c2.boundingBox();
      const s0 = await page.$eval('#overlay', o => [o.scrollLeft, o.scrollTop]);
      await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(b2.x + b2.width / 2 - i * 10, b2.y + b2.height / 2 - i * 6);
      await page.mouse.up();
      await page.waitForTimeout(800);
      const f1 = await page.$eval('#focus', s => s.value);
      const s1 = await page.$eval('#overlay', o => [o.scrollLeft, o.scrollTop]);
      check(engine, 'drag of 80 px does not change focus', f1 === f0, `focus ${f0} -> ${f1}`);
      check(engine, 'drag of 80 px pans the view', s1[0] !== s0[0] || s1[1] !== s0[1], `scroll ${s0} -> ${s1}`);
    }

    // Fix 2: unknown graph and unknown card are reported in the hint line
    await page.goto(`${PAGE}?graph=applications`); await ready(page);
    const hintG = await page.$eval('#hint', h => h.textContent);
    check(engine, 'unknown ?graph= is reported', /does not list/.test(hintG), hintG.slice(-140));
    await page.goto(`${PAGE}?graph=generated-apps&focus=NoSuchCardAnywhere`); await ready(page);
    const hintF = await page.$eval('#hint', h => h.textContent);
    check(engine, 'unknown ?focus= is reported', /does not contain/.test(hintF), hintF.slice(-140));

    // no regression: a known deep link still lands without a note
    await page.goto(`${PAGE}?graph=generated-apps`); await ready(page);
    const hintOk = await page.$eval('#hint', h => h.textContent);
    check(engine, 'a valid link shows no note', !/does not list|does not contain/.test(hintOk));
  } catch (e) {
    check(engine, 'proof ran to the end', false, String(e).slice(0, 200));
  } finally { await browser.close(); }
}
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
