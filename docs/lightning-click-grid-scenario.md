# Lightning optical-click context — additive Ventus Grid Engine prototype

**Scope:** Read-only, no network/no DOM, no numerical transient solver, and never an automatic claim of damage. This module is a sidecar for the next independent Lightning explorer; it **does not** alter \`Ventusltd/gridatlas\`, \`Ventusltd/pipelinenews\`, the accepted production composition or immutable preview generation 202610262323.

The user requested that a click on a real EUMETSAT lightning optical pixel lead to nearby substations, real solar project identities and then engineer-selected *hypothetical* IT AC / floating PV DC fault scenarios. The substantial existing MAP deep-link and Grid Engine must be reused rather than duplicated.

## Implementation

\`engine/lightning-click-context.js\` imports and uses:

- \`engine/v9-geodesy.js:distanceKm\` for exact existing measured distances.
- \`engine/v9-nearest-search.js:index\` for an O(n) exhaustive correct search; index built once per loaded dataset.
- \`deeplink/contract.js:buildDeepLink\` for the canonical, real \`repd_ref\` MAP route; adds \`project\` and \`capacity_mw\` as **already-deployed Pipeline News emitter** context while keeping the real REPD identity.
- Genuine optical event ID, UTC, lon/lat; only actual located solar REPD sites and substations qualify.

The documented direct deployed emitter is \`Ventusltd/pipelinenews/releases/202608312037-pipelinenews/assets/202608312037-atlas-pointer-deep-link.mjs\` (\`buildAtlasV9DeepLink\`); receiver is \`gridatlas/atlas/parts/202609040229-sld-sandbox-arrival-identity.js\` / live SLD cartridge. Importing the core contract rather than running a parallel MAP emitter keeps normalisation and retired receiver checks single-owned. Confirm the additional \`capacity_mw\` and \`project\` advisory fields against the live receiver in browser tests.

### Input conversion

- Substations: \`{ name, voltages_kv, location:{lon,lat} }\`, adapted from \`data-grid-gb\` records. Missing coordinates are *excluded from distance sorting* but counted as unknown; all 886 published sites are NOT assumed located (489 current OSM-joined).
- Solar projects: real Pipeline News compact index/REPD rows \`{repd_ref,technology,capacity_mw,latitude,longitude,geometry_status}\`. Site ID must be authentic numeric REPD. No identity from flash ID. \`capacity_mw\` controls display size only, not footprint / generation / risk.
- Optical input: actual GeoJSON \`Feature\`, \`observation_kind==='optical_lightning_flash'\`, valid ID/time/coordinate.
- Build and cache solar and substation indexes once; do not force the whole 35.7 MB register to download at first tap.

\`selectFlash\` returns optical provenance, selected location, measured nearby real solar farms and nearest substation rows with denominator and straight-line km only. \`lightningElectricalScenario\` returns **parameter requirements and scenario families** only; \`solver_status=NOT_RUN\`, \`results=null\`, \`causation_established=false\`.

### Five scenario families

1. Assumed nearby induced surge on real cable runs; hypothetical electromagnetic coupling input.
2. Hypothetical direct attachment / earth potential rise with explicitly selected attachment point and waveform; **NOT asserted** to match EUMETSAT detection.
3. IT AC **first and second earth faults**, protection monitoring, possible absence of IMD, transformer/neutral arrangement and disconnection conditions.
4. Floating PV DC pole-to-earth, second fault, screen/PE and capacitive/inverter coupling; no anti-PID assumptions.
5. Combined AC/DC/inverter/earth transient propagation with manufacturer validated network topology inputs.

This is **not** a working electrical stress/transient solver, not a device commissioning check, BS 7671/IEC compliance assessment, site strike report or quantified asset risk. Electrical study needs actual plant SLD, cable network/derating, impedances, SPD placement/capabilities, insulation classes, inverter topology, earthing design and hypothetical current waveforms. No physical risk metric can be deduced from proximity alone.

## Phase 2 UI — separate GridAtlas draft

After Issue #32's visual fixes and V1–V15 release gates, use a NEW versioned GridAtlas Lightning build (never overwrite immutable candidates):
1. Make optical markers visible, distinguish markers from clusters; create separate accessible 44px tap targets while preserving exact locations. 44px is a hit target, not the geographic detection footprint.
2. Clicking opens read-only optical provenance with exact UTC, coverage UNKNOWN for unsearched periods.
3. Load genuine nearby solar projects; show capacity-coded sized **solar** markers, 5/10/20 km distance bands, nearest connected? **NO** — proximity only. Select an actual REPD plant to invoke existing MAP receiver.
4. Offer scenario presets labelled **HYPOTHETICAL** and a missing-input checklist. Do not show calculated voltage/current unless a separately validated future numerical model runs.
5. Use existing focus/nearest-substation/project selection, not a copy of the old menu; preserve original 63 controls, device swipe, keyboard hit testing, fullscreen and zoom. At 48h three real Scottish points may be offscreen; add explicit optional Fit selection instead of moving the user's map.

## Independent proof

Run \`node proofs/lightning-click-context.proof.mjs\` or \`node verify.mjs\`.

The proof includes one authentic EUMETSAT optical event dated 2026-10-25, with **SYNTHETIC, clearly labelled** mock substations and mock REPD sites for geometry and deep-link verification. No mock project location or name is presented as a real asset. Hard negative cases: missing ID, invalid coordinate, wrong observation_kind, time, invalid ranges, non-numeric REPD, missing geom, unproven grounding, no calculated fault result.

Real-device tests (next phase): iPhone Safari interaction, touch hit target and actual MAP deep-link arrival from a selected verified solar project, parcel capacity legend, HIDE LAYERS caption clearance, correct unknown vs zero 12M history. Feed scenario validity and actual electrical fault prediction remain separate acceptance gates.

Parent design: [GridAtlas Issue #36](https://github.com/Ventusltd/gridatlas/issues/36). Current Lightning visual veto/production STOP: [Issue #32](https://github.com/Ventusltd/gridatlas/issues/32).
