# Browser computation receipts

`node tools/build-browser-observer.mjs <output-file>` produces a deterministic
browser bundle from the owned geodesy, compute observer and presentation module.
Consumers must pin the source commit and output SHA256. The output exposes
`globalThis.VentusGridCompute`; it does not fetch data or replace the consumer's
nearest-search algorithm. It exposes the owned `distanceKm(lon1, lat1, lon2, lat2)`
for real distance calculation in kilometres; consumers retain their selection
and ranking logic.

Call `request({entity, location})` for the current selection, then `run(id,
actualCalculation)` at the actual computation call site. The callback must
return the same entity and origin plus measured node coordinates and unrounded
`km` distances. The observer checks distances against the owned geodesy. A link
click or loaded page is never a completed calculation.

`describeComputeReceipt(receipt)` distinguishes queued, calculating, failed,
unsupported, empty and completed states. Only a completed finite distance gets
the `km` unit. It makes no conversion between project MW, PV DC, inverter AC,
export MW, storage MWh or transformer nameplate ratings. Every result retains
the geometric-screening limitation; proximity is not electrical connection,
capacity, route feasibility or an offer.

Run `npm test` for the owner proofs. Browser bundle parity is tested against
the ESM implementation. GridAtlas owns the separate actual-map browser tests,
visible-card tests and project identity tests; these owner proofs alone do not
prove a live integration.
