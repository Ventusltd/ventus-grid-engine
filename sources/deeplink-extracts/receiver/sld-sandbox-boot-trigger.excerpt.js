/*
 * PROVENANCE (excerpt)
 * source_repo: gridatlas
 * source_path: atlas/parts/202609041234-sld-sandbox-technology-buckets.js
 * head_sha (gridatlas): 64268fd06a0da54ddffbcdaaaee382e314e829f7
 * lines: 4623-4650
 *
 * The visibility-gated boot trigger that calls runDeepLink() (see
 * sld-sandbox-run-deep-link.excerpt.js). Never starts the arrival while the
 * tab is hidden (iOS Safari does not tick requestAnimationFrame in a background
 * tab, which stalled MapLibre's flyTo entirely when Pipeline News' MAP button
 * opened target="_blank" on a touch device); retries up to
 * MAX_AUTO_ARRIVAL_ATTEMPTS=5 times whenever the tab becomes visible without a
 * visible outcome yet.
 */
       map.flyTo() there does not throw and is not a failure this cartridge
       can see: the animation is simply never given a frame to advance, so
       the camera stays exactly where it started, forever, even once the
       tab is later brought to the front -- because this function had
       already run to its own conclusion and nothing called it again.

       So: never START the arrival until the document is actually visible,
       and never leave an arrival that has not produced a visible outcome
       stranded -- run it again the first time the tab is genuinely seen. */
    let arrivalAttempts = 0;
    const MAX_AUTO_ARRIVAL_ATTEMPTS = 5;   // a real, non-visibility failure must still stop retrying
    function arrivalHasVisibleOutcome() {
      // Both already-published, already-relied-upon fields: links_drawn is
      // read the same way by the electron-flow visibility listener just
      // below, and the not-in-active-register message is this cartridge's
      // own genuine "nothing more to show" terminal state.
      return link.links_drawn > 0
        || link.origin_source === 'not-in-active-register-no-supplied-point';
    }
    function attemptArrival() {
      if (document.visibilityState !== 'visible') return;
      arrivalAttempts += 1;
      link.arrival_attempts = arrivalAttempts;
      void runDeepLink();
    }
    if (document.visibilityState === 'visible') {
      attemptArrival();
    } else {
