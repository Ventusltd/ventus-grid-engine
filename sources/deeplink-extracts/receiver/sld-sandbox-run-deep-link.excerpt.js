/*
 * PROVENANCE (excerpt)
 * source_repo: gridatlas
 * source_path: atlas/parts/202609041234-sld-sandbox-technology-buckets.js
 * head_sha (gridatlas): 64268fd06a0da54ddffbcdaaaee382e314e829f7
 * lines: 4178-4607
 *
 * runDeepLink(): the function that actually acts on the deep link once it
 * reaches this, the LAST-loaded cartridge. Boot trigger per current.json's
 * sld-sandbox.boot: 'whichever of style.load or load arrives first, then an
 * 8s timer' -- then void runDeepLink() (line 4646, not included in this excerpt;
 * see sld-sandbox-boot-trigger.excerpt.js).
 *
 * In reading order within this excerpt:
 *   1. reads longitude/latitude/repd_ref via deepLinkPlan(), technology (raw,
 *      NOT yet passed through layerIdForBucket), project, capacity_mw, status
 *   2. reads zoom (q.get('zoom')) -- honoured via honourRequestedZoom(), which
 *      is itself new as of a fix noted inline: PipelineNews sends zoom, and
 *      until this fix nothing in the repo ever called get('zoom')
 *   3. enters fullscreen on touch/coarse-pointer arrival
 *   4. branches on receiverPlan.route:
 *      MEASURE_LINK_FIRST -> measures/draws immediately on the link's own
 *        point, register identity verifies concurrently (identityVerification)
 *      WAIT_FOR_REGISTER  -> awaits the search-lane's resolved identity before
 *        doing anything (owner.status RESOLVED / NOT_IN_ACTIVE_REGISTER / other)
 *   5. map.flyTo the supplied/resolved point
 *   6. arrive(): waitForLayerControls(12000) THEN enableBoth() (substation +
 *      technology layer), with late-arrival recovery via watchForLayerControls
 *   7. runArrivalSelection(): card before lines (ensureArrivalCard, then
 *      measurement)
 *   8. if register identity resolves to a DIFFERENT point than the link
 *      supplied, reconciles: re-flies, re-measures, re-enables layers
 */
    async function runDeepLink(expectedArrivalEpoch = null) {
      try {
        const q = new URLSearchParams(window.location.search);
        const epoch = Number.isInteger(expectedArrivalEpoch)
          ? expectedArrivalEpoch : claimPendingArrival(window.location.search);
        if (!arrivalGate.isCurrent(epoch)) return false;
        link.arrival_reconciliation = {
          status: 'MEASUREMENT_CLAIMED', epoch,
          owner_epoch: window.__GRIDATLAS_PLACE_SEARCH__?.deep_link?.owner_epoch ?? null
        };
        /* Number(null) is 0, not NaN, so a link with no coordinates used to
           pass the finite guard as Null Island and only the technology
           guard stopped it. Absent now means absent. */
        const rawLon = q.get('longitude');
        const rawLat = q.get('latitude');
        const receiverPlan = deepLinkPlan(rawLon, rawLat, q.get('repd_ref'));
        let lon = receiverPlan.longitude;
        let lat = receiverPlan.latitude;
        const repdRef = receiverPlan.repd_ref;
        let tech = String(q.get('technology') || '');
        let name = q.get('project') || 'Deep-linked project';
        let stated = Number(q.get('capacity_mw'));
        const suppliedStatus = String(q.get('status') || '').trim();
        currentCapacityMw = Number.isFinite(stated) && stated > 0 ? stated : null;

        /* zoom: set on every deep link, and until now read by nobody.
           ------------------------------------------------------------------
           The deep scan of 202609012230 compared both sides of the contract:
           Pipeline News sets seven parameters and GridAtlas read six. There is
           no get('zoom') anywhere in this repository. Arrival zoom came from
           `map.flyTo({ zoom: 12 })` hard-coded in the immutable shell, and
           Pipeline News happens to send 12 - so the two agreed by coincidence,
           and the day somebody tuned the sending side nothing would have moved.

           The shell cannot be edited, so the cartridge honours the parameter
           after the shell has finished its own move. Bounded to what MapLibre
           and the payload can actually render, and a value outside that range
           is recorded rather than clamped silently. */
        const rawZoom = q.get('zoom');
        const requestedZoom = rawZoom === null ? null : Number(rawZoom);
        const zoomUsable = requestedZoom !== null && Number.isFinite(requestedZoom)
          && requestedZoom >= 3 && requestedZoom <= 18;
        if (rawZoom !== null && !zoomUsable) {
          link.failures.push('deep link: unusable zoom "' + rawZoom + '"');
        }
        link.requested_zoom = zoomUsable ? requestedZoom : null;

        /* 12 shows 3.6x more ground at 1400 px than at 393, so a shared
           link opens wide on a desktop. Frame by viewport, not by number. */
        const framed = () => Math.min(18, Math.max(3, requestedZoom
          + Math.log2(Math.max(innerWidth, 320) / 393)));
        function honourRequestedZoom(map) {
          if (!zoomUsable) return;
          /* One shot, after the shell's own flyTo has settled. Racing it
             would be a fight the shell wins, and re-applying on every idle
             would take the map away from a user who has since zoomed. */
          let done = false;
          const apply = () => {
            if (done) return;
            done = true;
            try {
              map.off('idle', apply);
              if (Math.abs(map.getZoom() - framed()) < 0.01) {
                link.zoom_applied = 'already there';
                return;
              }
              map.easeTo({ zoom: framed(), duration: 400 });
              link.zoom_applied = framed();
            } catch (error) {
              noteFailure('deep link zoom: ' + String(error?.message || error));
            }
          };
          try { map.once('idle', apply); } catch (_) { /* shimmed map in a proof */ }
          // A map that never goes idle must not swallow the request.
          setTimeout(apply, 2600);
        }
        const coordsUsable = () => Number.isFinite(lon) && Number.isFinite(lat)
          && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
          && !(Math.abs(lon) < 1e-9 && Math.abs(lat) < 1e-9);

        /* Vikram, phone acceptance 13:01: "arrive in full screen mode from
           pipeline news with all the clutter minimised". On a touch screen
           the normal page is a small map fighting a popup, chips, a HUD and
           a panel below; fullscreen is the only honest arrival surface. The
           shell's own control does it - CSS classes, and on an iPhone the
           element fullscreen API simply does not exist, so nothing here is
           gesture-gated - and the tray keeps the tool buttons collapsed. */
        if ((q.get('repd_ref') !== null || coordsUsable()) && trayTarget()) {
          try {
            window.enterFullscreen?.();
            link.arrival_fullscreen = true;
            setTimeout(() => { try { map.resize(); } catch (_) { /* cosmetic */ } }, 120);
          } catch (error) {
            link.failures.push('arrival fullscreen: ' + String(error?.message || error));
          }
        }

        /* A VALID LINK POINT ANSWERS FIRST; THE REGISTER VERIFIES IT.
           ---------------------------------------------------------
           v9.91 put `await waitForResolvedIdentity()` before selectAt for every
           repd_ref. Across Pipeline News that serialized a 35.7 MB query
           engine ahead of 8,743 links that already carried a usable point;
           2,430 then waited only to fall back to that same point. Coordinates
           are enough for a geometric measurement. They are therefore used at
           once, explicitly as link-supplied, while the one identity owner
           verifies them concurrently. A different resolved point replaces the
           selection and is measured again; FAILED/ABSENT never erases a valid
           supplied point. A ref-only link still waits because it has no point
           from which an honest measurement can be made. */
        let identityVerification = null;
        if (receiverPlan.route === 'MEASURE_LINK_FIRST' && repdRef) {
          link.origin_source = 'link-supplied';
          link.deep_link_identity = 'verifying-concurrently';
          link.identity_verification = {
            status: 'PENDING', repd_ref: repdRef, supplied_coordinates_used: true
          };
          identityVerification = waitForResolvedIdentity({ announce: false })
            .then((owner) => ({
              resolved: owner?.status === 'RESOLVED' ? owner : null,
              terminal: owner?.status || 'UNKNOWN'
            }))
            .catch((error) => ({ resolved: null, terminal: 'FAILED', error }));
        } else if (receiverPlan.route === 'WAIT_FOR_REGISTER') {
          /* A ref-only link has no safe provisional geometry. This is the one
             case that must await the identity owner before measuring. */
          const owner = await waitForResolvedIdentity();
          if (!arrivalGate.isCurrent(epoch) || owner?.status === 'CANCELLED') return;
          if (owner?.status === 'RESOLVED') {
            const resolved = owner;
            const rLon = Number(resolved.longitude);
            const rLat = Number(resolved.latitude);
            if (Number.isFinite(rLon) && Number.isFinite(rLat)
              && Math.abs(rLon) <= 180 && Math.abs(rLat) <= 90
              && !(Math.abs(rLon) < 1e-9 && Math.abs(rLat) < 1e-9)) {
              lon = rLon;
              lat = rLat;
              link.origin_source = 'register';
            }
            if (typeof resolved.technology === 'string' && resolved.technology) {
              tech = resolved.technology;
            }
            if (resolved.name) name = String(resolved.name);
            const cap = Number(resolved.capacity_mw);
            if (Number.isFinite(cap) && cap > 0) stated = cap;
            currentCapacityMw = Number.isFinite(stated) && stated > 0 ? stated : null;
            link.deep_link_identity = 'resolved-by-search-lane';
          } else if (owner?.status === 'NOT_IN_ACTIVE_REGISTER') {
            link.origin_source = 'not-in-active-register-no-supplied-point';
            link.deep_link_identity = 'terminal-not-in-active-register';
            link.identity_verification = {
              status: 'NOT_IN_ACTIVE_REGISTER', repd_ref: repdRef,
              supplied_coordinates_kept: false,
              official_active_register_match: false
            };
            injectStatusStyle();
            showStatus('REPD ' + repdRef + ' is not in the active-register '
              + 'snapshot, and this link supplies no coordinates from which '
              + 'to measure. No official status or location is inferred.',
              'unavailable');
            return;
          } else {
            injectStatusStyle();
            const message = String(owner?.message || 'identity loader unavailable');
            showStatus('The active-register identity check failed: ' + message
              + '. No location was supplied, so the grid measurement cannot '
              + 'start until the check succeeds.', 'failed');
            retryArrival = retryIdentityOwnerThenArrival;
            return;
          }
        } else {
          link.origin_source = 'link-supplied';
        }

        if (!coordsUsable()) return;

        /* Put the supplied point on screen with the supplied-point answer.
           The old rule flew only links without repd_ref and therefore left a
           valid coordinate link waiting for the register just to move the
           camera. If verification later finds a different point, the identity
           lane and the reconciliation below replace it together. */
        try {
          const arrivalZoom = zoomUsable ? requestedZoom : 12;
          map.flyTo({ center: [lon, lat], zoom: arrivalZoom,
            duration: 1200, essential: true });
          link.camera_from_link = { longitude: lon, latitude: lat,
            zoom: arrivalZoom, reason: identityVerification
              ? 'supplied coordinates while register verification runs'
              : (repdRef ? 'resolved repd_ref coordinates'
                : 'no repd_ref, so no other lane flies') };
        } catch (error) {
          noteFailure('deep link camera: ' + String(error?.message || error));
        }
        honourRequestedZoom(map);
        /* An unrecognised technology used to abandon the whole arrival.
           `return` cost the card, the ring, the nearest-substation
           measurement, the declared connection and the substation layer -
           all arithmetic over two coordinates and a register row. Only the
           one technology layer needs the id, so that is all it costs now.
           PROJECT_TECHS accepts 11,065 of the 11,069 ids the register
           writes. What the guard really catches is a link that omits or
           garbles the parameter, or carries an id from a newer register,
           and for all three the answer is the map, not a blank. Recorded on
           its own surface, not in `link.failures`, which since 202609011434
           means the arrival lost something. This one did not. */
        let technologyKnown = isProjectTech(tech);
        /* enabled starts false and STAYS false until enableTechnologyLayer()
           actually turns a control on -- that is the one place the truth
           lives. It used to read `enabled: technologyKnown`, which is
           membership of PROJECT_TECHS, not the state of any control: for
           wind_onshore, wind_offshore and other, that set says true while
           no such data-layer-id has ever existed, so the field read green
           on 2,508 of 7,680 register rows while the layer sat off. A field
           nothing else corrects is a field that lies for as long as the
           page is open, and this was read by every prior proof. */
        link.technology_layer = {
          requested: tech || null,
          layer_id: technologyKnown ? layerIdForBucket(tech) : null,
          enabled: false,
          reason: technologyKnown ? null
            : 'deep link: unknown technology "' + tech + '" - the arrival '
              + 'continues and this layer alone is not switched on'
        };
        // Turn the substations on. Arriving from the MAP button in Pipeline
        // News, the whole point is to see the project against the network, and
        // a user who has to find a checkbox first has been handed a puzzle
        // rather than an answer. The engine owns the layer, so this ticks its
        // own control rather than reaching past it into the map.
        // The dashboard is built from the engine's own data and does not
        // exist yet on a cold load -- measured at zero checkboxes twenty
        // seconds in. Ticking a control that has not been rendered silently
        // did nothing, and the layers the arrival depends on stayed off.
        // Named, so Try again re-runs exactly the arrival rather than
        // reloading and paying for the whole engine a second time.
        let currentArrival = Object.freeze({ lon, lat, name, tech, stated, repdRef, suppliedStatus });
        const enableBoth = () => {
          if (!arrivalGate.isCurrent(epoch)) return false;
          enableSubstationLayer();
          if (technologyKnown) enableTechnologyLayer(currentArrival.tech);
          return true;
        };
        const arrive = async () => {
          clearStatus();
          const ready = await waitForLayerControls(12000);
          enableBoth();
          // Late is not never. If the dashboard turns up after the budget, the
          // layers still go on, without the user having to do anything.
          if (!ready) watchForLayerControls(enableBoth);
          return ready;
        };
        retryArrival = () => { runDeepLink(); };
        /* Measure first. The distances are arithmetic over substation
           coordinates and need no layer control, no dashboard and no
           painted basemap; only the layers need the engine's controls.
           Until v9.54 this awaited arrive() - up to twelve seconds - before
           the measurement was even attempted, and Vikram's West Burton
           journey on a phone showed exactly what that buys: a card, and
           nothing beside it, for long enough to conclude the map is
           broken. The layer switch-on runs alongside and finishes whenever
           the engine is ready. */
        const layersReady = arrive();
        async function runArrivalSelection(arrival, waitForOwnerCard = false,
          expectedArrivalEpoch = epoch) {
          if (!arrivalGate.isCurrent(expectedArrivalEpoch)) return false;
          /* A ref-only arrival already paid for canonical identity, so it can
             briefly yield to that owner's richer card. A supplied coordinate
             arrival must not wait for a card before it can measure: it creates
             the explicit link-provenance card below on the same turn. */
          if (waitForOwnerCard) {
            for (let i = 0; i < 40; i += 1) {
              if (document.querySelector('.maplibregl-popup-content')) break;
              const idStatus = window.__GRIDATLAS_PLACE_SEARCH__?.deep_link?.status;
              if (idStatus === 'FAILED' || idStatus === 'ABSENT') break;
              await new Promise(resolve => setTimeout(resolve, 250));
              if (!arrivalGate.isCurrent(expectedArrivalEpoch)) return false;
            }
          }
          /* The card must exist BEFORE the lines. The popup watcher enforces
             "the lines belong to the card" and clears any drawing standing
             with no card on screen - watched live: a register-absent arrival
             drew five links and the watcher wiped them in the same breath,
             because the fallback card was opened after the measurement.
             ensureArrivalCard is a no-op when a card is already up, so the
             resolved-register path is unchanged. */
          currentRepdRef = arrival.repdRef;
          ensureArrivalCard(arrival.lon, arrival.lat, arrival.name,
            arrival.tech, arrival.stated, arrival.repdRef, arrival.suppliedStatus);
          /* Answer now, measure next. Everything in this block came from
             the made Order and the link; nothing here waits on a network. */
          currentDeclared = provisionalDeclaredConnection(currentRepdRef);
          if (currentDeclared) injectDeclaredOnly();
          try {
            if (capturedMap) setPin(capturedMap,
              [arrival.lon, arrival.lat], arrival.name, arrival.tech);
          }
          catch (_) { /* the measurement will draw it */ }
          link.deep_linked = true;
          const selected = await selectAt([arrival.lon, arrival.lat], arrival.name,
            arrival.tech, false,
            Number.isFinite(arrival.stated) && arrival.stated > 0
              ? arrival.stated : null, expectedArrivalEpoch);
          return selected !== false && arrivalGate.isCurrent(expectedArrivalEpoch);
        }
        const firstStarted = performance.now();
        const firstSelectionCurrent = await runArrivalSelection(currentArrival,
          Boolean(repdRef && !identityVerification), epoch);
        if (!firstSelectionCurrent) return;
        link.first_coordinate_answer_ms = Math.round((performance.now() - firstStarted) * 10) / 10;
        link.first_coordinate_origin = link.origin_source;

        if (identityVerification) {
          /* Attach reconciliation only after the supplied-point selection has
             completed. A warm identity can resolve on the first microtask;
             sequencing it here prevents two selections racing each other. */
          continueVerifiedArrival(arrivalGate, epoch, identityVerification,
            async ({ resolved, terminal, error }) => {
            if (!resolved) {
              const ownerState = window.__GRIDATLAS_PLACE_SEARCH__?.deep_link || null;
              const message = error ? String(error?.message || error)
                : String(ownerState?.message || '');
              link.origin_source = terminal === 'NOT_IN_ACTIVE_REGISTER'
                ? 'link-supplied-not-in-active-register'
                : 'link-supplied-register-' + String(terminal).toLowerCase();
              link.deep_link_identity = 'terminal-' + String(terminal).toLowerCase();
              link.identity_verification = {
                status: terminal, repd_ref: repdRef,
                supplied_coordinates_kept: true,
                arrival_fields: {
                  name: currentArrival.name,
                  technology: currentArrival.tech,
                  capacity_mw: Number.isFinite(currentArrival.stated)
                    ? currentArrival.stated : null,
                  supplied_status: currentArrival.suppliedStatus || null
                },
                official_active_register_match: false,
                message: message || null
              };
              markArrivalIdentityState(terminal, repdRef, message);
              if (terminal === 'FAILED') {
                injectStatusStyle();
                retryArrival = retryIdentityOwnerThenArrival;
                showStatus('The active-register identity check failed'
                  + (message ? ': ' + message : '.')
                  + ' The supplied point and measurement remain on the map.',
                  'failed');
              }
              return;
            }

            const rLon = Number(resolved.longitude);
            const rLat = Number(resolved.latitude);
            const resolvedPointUsable = Number.isFinite(rLon) && Number.isFinite(rLat)
              && Math.abs(rLon) <= 180 && Math.abs(rLat) <= 90
              && !(Math.abs(rLon) < 1e-9 && Math.abs(rLat) < 1e-9);
            if (!resolvedPointUsable) {
              link.origin_source = 'link-supplied-register-without-point';
              link.deep_link_identity = 'resolved-without-usable-point';
              link.identity_verification = {
                status: 'RESOLVED_WITHOUT_USABLE_POINT', repd_ref: repdRef,
                supplied_coordinates_kept: true
              };
              return;
            }

            const discrepancyKm = Math.round(
              distanceKm(currentArrival.lon, currentArrival.lat, rLon, rLat) * 1000
            ) / 1000;
            link.origin_discrepancy_km = discrepancyKm;
            link.deep_link_identity = 'resolved-by-search-lane';
            if (discrepancyKm <= 0.001) {
              link.origin_source = 'link-supplied-register-verified';
              markArrivalIdentityState('VERIFIED', repdRef);
              link.identity_verification = {
                status: 'VERIFIED', repd_ref: repdRef,
                discrepancy_km: discrepancyKm, recomputed: false
              };
              return;
            }

            const rTech = typeof resolved.technology === 'string' && resolved.technology
              ? resolved.technology : currentArrival.tech;
            const rName = resolved.name ? String(resolved.name) : currentArrival.name;
            const rCap = Number(resolved.capacity_mw);
            const rStated = Number.isFinite(rCap) && rCap > 0 ? rCap : currentArrival.stated;
            const verifiedArrival = Object.freeze({
              lon: rLon, lat: rLat, name: rName, tech: rTech,
              stated: rStated, repdRef, suppliedStatus: currentArrival.suppliedStatus
            });
            currentArrival = verifiedArrival;
            technologyKnown = isProjectTech(verifiedArrival.tech);
            currentCapacityMw = Number.isFinite(verifiedArrival.stated)
              && verifiedArrival.stated > 0 ? verifiedArrival.stated : null;
            link.origin_source = 'register-corrected-after-link';
            link.identity_verification = {
              status: 'RECOMPUTING', repd_ref: repdRef,
              discrepancy_km: discrepancyKm, recomputed: false
            };
            try {
              map.flyTo({ center: [verifiedArrival.lon, verifiedArrival.lat],
                zoom: zoomUsable ? requestedZoom : 12,
                duration: 800, essential: true });
              await runArrivalSelection(verifiedArrival, false, epoch);
              enableBoth();
              link.identity_verification.status = 'RECOMPUTED';
              link.identity_verification.recomputed = true;
            } catch (reconcileError) {
              link.identity_verification.status = 'RECOMPUTE_FAILED';
              link.identity_verification.message =
                String(reconcileError?.message || reconcileError);
              noteFailure('deep link identity reconciliation: '
                + link.identity_verification.message);
            }
          }).catch((reconcileError) => {
            if (!arrivalGate.isCurrent(epoch)) return;
            link.identity_verification = {
              status: 'RECONCILIATION_FAILED', repd_ref: repdRef,
              supplied_coordinates_kept: true,
              message: String(reconcileError?.message || reconcileError)
            };
            noteFailure('deep link identity reconciliation: '
              + link.identity_verification.message);
          });
        }
        await layersReady;
        return arrivalGate.isCurrent(epoch);
      } catch (error) {
        link.failures.push('deep link: ' + String(error?.message || error));
        return false;
      }
    }
    rerunDeepLink = runDeepLink;
