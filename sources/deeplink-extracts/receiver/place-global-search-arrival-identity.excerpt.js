/*
 * PROVENANCE (excerpt)
 * source_repo: gridatlas
 * source_path: atlas/parts/202609040229-place-global-search-arrival-identity.js
 * head_sha (gridatlas): 2d8cc7bacf80a3f20ecfb96ea24548fcea43a19d (this file's last commit;
 *   repo HEAD is 64268fd06a0da54ddffbcdaaaee382e314e829f7, file unchanged since)
 * lines: 566-747
 *
 * Assembled into the LIVE cartridge "uk-gazetteer-flyto" (current.json generation
 * 202609040337, capability "exact-repd-first") via
 * atlas/manifests/202609040337-place-global-search-v9-5-parts.json, which lists
 * this file as its only 'part'. Loaded as the SECOND script in the shell (replaces
 * 202608291818-place-postcode-search.js), fires on DOMContentLoaded -- i.e. this
 * is the FIRST code to read the deep link's repd_ref.
 *
 * This is the identity/parse path: reads repd_ref (identity anchor,
 * EXACT_REPD_REF_ONLY), plus project/technology/capacity_mw/latitude/longitude/
 * status as advisory fields (suppliedArrivalFields), then queries the pinned
 * active-register product for the exact repd_ref and publishes
 * state.deep_link.status = ABSENT | RECEIVING | NOT_IN_ACTIVE_REGISTER | RESOLVED |
 * FAILED. The sld-sandbox cartridge (arrival-run excerpt, this same directory)
 * consumes this published state rather than re-parsing the URL for identity.
 * NOTE: identity regex here is /^[A-Za-z0-9-]{1,40}$/ -- broader than the
 * emitter's own /^\d+$/ numeric-only check.
 */
  function suppliedArrivalFields(params, repdRef) {
    const numberOrNull = (name) => {
      const raw = params.get(name);
      if (raw === null || String(raw).trim() === '') return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    const textOrNull = (name) => {
      const value = String(params.get(name) || '').trim();
      return value || null;
    };
    return Object.freeze({
      repd_ref: repdRef,
      name: textOrNull('project'),
      technology: textOrNull('technology'),
      capacity_mw: numberOrNull('capacity_mw'),
      longitude: numberOrNull('longitude'),
      latitude: numberOrNull('latitude'),
      // Pipeline News 0144 does not send status. Retain it only when another
      // authorised producer explicitly supplies it; never present it as an
      // official active-register value.
      supplied_status: textOrNull('status')
    });
  }

  async function receiveExactRepdDeepLink(input, resultsEl,
    expectedOwnerEpoch = null) {
    const params = new URLSearchParams(window.location.search);
    const repdRef = String(params.get('repd_ref') || '').trim();
    if (!repdRef) {
      state.deep_link = { status: 'ABSENT', repd_ref: null, resolved: false, mapped: false };
      return;
    }

    const arrival = suppliedArrivalFields(params, repdRef);
    let coordinator = null;
    let ownerEpoch = null;
    try {
      invariant(/^[A-Za-z0-9-]{1,40}$/.test(repdRef), 'invalid exact REPD deep-link identity');
      coordinator = arrivalCoordinator();
      invariant(coordinator, 'shared arrival coordinator unavailable');
      if (Number.isInteger(expectedOwnerEpoch)) {
        if (!coordinator.arrivalGate.isCurrent(expectedOwnerEpoch)) return;
        ownerEpoch = expectedOwnerEpoch;
      } else {
        ownerEpoch = coordinator.claimPendingArrival(window.location.search);
      }
      state.deep_link = {
        ...arrival, owner_epoch: ownerEpoch, status: 'RECEIVING',
        resolved: false, mapped: false,
        identity_source: 'ACTIVE_REGISTER_PENDING'
      };
      const stillOwned = () => coordinator.arrivalGate.isCurrent(ownerEpoch);
      const querySerial = ++activeQuerySerial;
      input.value = repdRef;
      const results = await queryOfficialRepd(repdRef, querySerial, stillOwned);
      if (!stillOwned() || querySerial !== activeQuerySerial) return;
      const exact = results.find(result => String(result.repd_ref) === repdRef);
      if (!exact) {
        // A successful query with no exact row is evidence about this active
        // snapshot, not a network failure and not evidence that the supplied
        // project never existed. Keep the link's point and identity separate.
        renderResults(results, resultsEl);
        document.body.dataset.gridatlasRepdRef = repdRef;
        document.body.dataset.gridatlasRepdDeepLink = 'not-in-active-register';
        state.deep_link = {
          ...arrival,
          owner_epoch: ownerEpoch,
          status: 'NOT_IN_ACTIVE_REGISTER',
          resolved: false,
          mapped: false,
          supplied_point_usable: hasSafeMapPoint(arrival),
          identity_source: 'ARRIVAL_LINK',
          official_active_register_match: false,
          statement: 'No exact identity in the active-register snapshot; supplied arrival fields retained.'
        };
        return;
      }
      renderResults(results, resultsEl);
      await waitForCapturedMap();
      if (!stillOwned()) return;
      if (!selectResult(exact, { deepLinkEpoch: ownerEpoch })) return;
      if (!stillOwned()) return;
      invariant(state.last_selection?.repd_ref === repdRef, 'exact REPD selection was not retained');
      invariant(state.last_selection?.mapped === true, 'exact REPD identity did not fly to a safe map point');
      document.body.dataset.gridatlasRepdRef = repdRef;
      document.body.dataset.gridatlasRepdDeepLink = 'resolved';
      state.deep_link = {
        status: 'RESOLVED',
        owner_epoch: ownerEpoch,
        repd_ref: repdRef,
        resolved: true,
        mapped: true,
        name: exact.name,
        postcode: exact.postcode,
        longitude: exact.longitude,
        latitude: exact.latitude,
        technology: exact.technology,
        capacity_mw: exact.capacity_mw,
        status_value: exact.status,
        identity_source: 'OFFICIAL_ACTIVE_REGISTER',
        official_active_register_match: true
      };
    } catch (error) {
      if (coordinator && Number.isInteger(ownerEpoch)
          && !coordinator.arrivalGate.isCurrent(ownerEpoch)) return;
      const message = String(error?.message || error);
      state.failures.push({ phase: 'exact_repd_deep_link', repd_ref: repdRef, message });
      state.deep_link = {
        ...arrival, owner_epoch: ownerEpoch, status: 'FAILED',
        resolved: false, mapped: false, message,
        identity_source: 'ACTIVE_REGISTER_CHECK_FAILED'
      };
      document.body.dataset.gridatlasRepdDeepLink = 'failed';
      console.error('[V9 EXACT REPD DEEP LINK]', error);
    }
  }

  async function retryExactRepdDeepLink(input, resultsEl, ownerEpoch) {
    const coordinator = arrivalCoordinator();
    invariant(coordinator, 'shared arrival coordinator unavailable for retry');
    invariant(Number.isInteger(ownerEpoch), 'identity retry requires one shared owner epoch');
    if (!coordinator.arrivalGate.isCurrent(ownerEpoch)) return state.deep_link;
    state.identity_retry_count += 1;
    await resetOfficialRuntime();
    if (!coordinator.arrivalGate.isCurrent(ownerEpoch)) return state.deep_link;
    return receiveExactRepdDeepLink(input, resultsEl, ownerEpoch);
  }

  function bindSearch() {
    const input = document.getElementById('search-input');
    const button = document.getElementById('search-btn');
    const resultsEl = document.getElementById('search-results');
    invariant(input && button && resultsEl, 'V8 search controls missing');
    input.setAttribute('placeholder', 'Search project, address, postcode or place...');
    input.setAttribute('aria-label', 'Search project, address, postcode or place');

    input.addEventListener('input', event => {
      event.stopImmediatePropagation();
      invalidatePendingDeepLink('user-search-input');
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => executeSearch(input, resultsEl, false), 180);
    }, true);

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        invalidatePendingDeepLink('user-search-submit');
        clearTimeout(debounceTimer);
        executeSearch(input, resultsEl, true);
      } else if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        invalidatePendingDeepLink('user-search-dismiss');
        resultsEl.style.display = 'none';
      }
    }, true);

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      invalidatePendingDeepLink('user-search-submit');
      clearTimeout(debounceTimer);
      executeSearch(input, resultsEl, true);
    }, true);

    state.retry_exact_deep_link = (ownerEpoch) =>
      retryExactRepdDeepLink(input, resultsEl, ownerEpoch);
    state.ready = true;
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      bindSearch();
      const input = document.getElementById('search-input');
      const resultsEl = document.getElementById('search-results');
      void receiveExactRepdDeepLink(input, resultsEl);
    } catch (error) {
      state.failures.push({ phase: 'bind', message: String(error?.message || error) });
      console.error('[V9 PLACE SEARCH INIT]', error);
    }
  }, { once: true });
