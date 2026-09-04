/*
 * PROVENANCE (excerpt)
 * source_repo: gridatlas
 * source_path: atlas/parts/202609041234-sld-sandbox-technology-buckets.js
 * head_sha (gridatlas): 64268fd06a0da54ddffbcdaaaee382e314e829f7
 * lines: 2912-3053
 *
 * The layer-control wait/enable machinery, and the two named failure modes:
 *   - waitForLayerControls(budgetMs): the 12-second grid-data budget (called
 *     with 12000 at the arrival call site, see sld-sandbox-run-deep-link
 *     excerpt). On timeout with nothing drawn yet it shows the banner
 *     'The grid data has not finished loading yet. The distances below are
 *     already measured; the layers will switch on by themselves if it arrives.'
 *     (line ~3000). A MutationObserver (watchForLayerControls) keeps watching
 *     after the budget expires and switches layers on whenever they do arrive --
 *     late is not never.
 *   - enableTechnologyLayer(tech): resolves the bucket through
 *     layerIdForBucket() (see sld-sandbox-technology-vocabulary.excerpt.js), then
 *     searches the DOM for input[type=checkbox][data-layer-id=<resolved id>].
 *     If not found, records the failure 'layer control not found: <layerId>'
 *     (line ~3036) -- this is the other named failure mode from the task brief.
 */
  // Resolve when the engine has rendered its layer dashboard, or when the
  // wait is up. Returning false is a fact worth having, not an error: it says
  // the engine had not finished, which is a different problem from the layer
  // being missing.
  /* Watch for the controls; do not guess how long they will take.
     ----------------------------------------------------------------------
     A fixed budget is always the wrong number. Twelve seconds was generous on
     one load and hopeless on the next: the engine builds its layer dashboard
     from its own data, and that has been measured arriving in two seconds and
     not arriving at all in eighty-six.

     Giving up after a budget also gave up permanently. If the dashboard
     appeared at thirteen seconds -- which it often does -- the layers the
     arrival depends on stayed off for the rest of the session, with a card on
     screen saying the grid data had not loaded while the controls sat there.

     So: the wait still bounds how long the user is asked to look at a spinner,
     because that is a promise about the interface. But an observer keeps
     watching afterwards, and switches the layers on whenever they arrive,
     however late. The status line is cleared at the same moment, because a
     failure notice that outlives the failure is its own bug.

     The observer disconnects the first time it fires. It is not a subscription
     to the page; it is one deferred question. */

  const LAYER_CONTROL = 'input[type=checkbox][data-layer-id]';
  let layerWatcher = null;

  function watchForLayerControls(onReady) {
    if (layerWatcher || typeof MutationObserver !== 'function') return;
    try {
      layerWatcher = new MutationObserver(() => {
        if (!document.querySelector(LAYER_CONTROL)) return;
        layerWatcher.disconnect();
        layerWatcher = null;
        link.layer_controls_arrived_late = true;
        recoverFailures(/^the engine had not rendered its layer controls within/);
        clearStatus();
        try { onReady(); } catch (error) {
          link.failures.push('late layers: ' + String(error?.message || error));
        }
      });
      layerWatcher.observe(document.body, { childList: true, subtree: true });
    } catch (error) {
      link.failures.push('layer watcher: ' + String(error?.message || error));
      layerWatcher = null;
    }
  }

  /* iOS Safari, reported live by the architect and reproduced independently
     against a page opened hidden: this budget used to be charged in WALL
     CLOCK time regardless of whether anyone could see the result of
     spending it. Pipeline News' MAP control opens on touch devices with
     target="_blank", and on iOS Safari a background tab is not guaranteed
     to be composited while the reader is still looking at the page they
     tapped from -- requestAnimationFrame does not tick there, so the
     engine's own dashboard build (which the boot trigger gates behind
     style.load/load, both paint-driven) can stall for the WHOLE budget
     without ever having had a real chance. Elapsed time while hidden buys
     nothing observable and is not charged against the budget; only time
     the tab was actually visible counts down. */
  async function waitForLayerControls(budgetMs) {
    let elapsed = 0;
    if (!document.querySelector(LAYER_CONTROL)) {
      injectStatusStyle();
      showStatus('Switching the grid layers on as soon as the map\u2019s own '
        + 'controls appear. The distances do not wait for them.', 'waiting');
    }
    while (elapsed < budgetMs) {
      if (document.querySelector(LAYER_CONTROL)) {
        link.layer_controls_ready_ms = elapsed;
        clearStatus();
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      if (document.visibilityState === 'visible') elapsed += 200;
    }
    link.layer_controls_ready_ms = null;
    link.failures.push(
      'the engine had not rendered its layer controls within '
      + Math.round(budgetMs / 1000) + 's; still watching, and the layers will '
      + 'be switched on if they arrive');
    if (link.links_drawn > 0) {
      // The answer is already on the map. Late layers are not a failure the
      // reader has to act on, and a red notice over a working map is noise.
      clearStatus();
    } else {
      injectStatusStyle();
      showStatus('The grid data has not finished loading yet. The distances '
        + 'below are already measured; the layers will switch on by themselves '
        + 'if it arrives.', 'failed');
    }
    return false;
  }

  function enableTechnologyLayer(tech) {
    if (!tech) return false;
    // Resolved through the ONE table above. 'wind_onshore' and
    // 'wind_offshore' are Pipeline buckets, not layer ids -- searching the
    // DOM for a control literally named that always failed. 'other' has no
    // layer at all, and is said plainly rather than searched for.
    const layerId = layerIdForBucket(tech);
    if (layerId === null) {
      link.technology_layer = Object.assign({}, link.technology_layer, {
        requested: tech, layer_id: null, enabled: false,
        reason: 'GridAtlas has no map layer for the "' + tech + '" technology; '
          + 'nothing to switch on. The card and the distances above it are '
          + 'unaffected.'
      });
      return false;
    }
    try {
      const boxes = [...document.querySelectorAll('input[type=checkbox]')];
      let box = boxes.find((input) => input.dataset?.layerId === layerId);
      if (!box) {
        const label = TECH_LABEL_FALLBACK[layerId];
        if (label) {
          box = boxes.find((input) => {
            const text = (input.closest('label') || input.parentElement)?.textContent || "";
            return text.replace(/\s+/g, " ").trim().toLowerCase()
              .startsWith(label.toLowerCase());
          });
        }
      }
      if (!box) { noteFailure('layer control not found: ' + layerId); return false; }
      if (!box.checked) box.click();
      link.project_layer_enabled = layerId;
      // The field a reader (and every prior proof) actually trusted must
      // say what happened, not what the request's bucket merely belonged
      // to. Set here, on the ONE path that turns a control on, rather than
      // synthesised from set membership before this ever ran.
      link.technology_layer = Object.assign({}, link.technology_layer, {
        requested: tech, layer_id: layerId, enabled: true, reason: null
      });
      recoverFailures(new RegExp('^layer control not found: '
        + String(layerId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
      return true;
    } catch (error) {
      link.failures.push('layer: ' + String(error?.message || error));
      return false;
    }
  }
