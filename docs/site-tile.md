# Wireframe rule R5: the site tile. Stream the measured ground where you arrive; never download in bulk.

Version 2, 27 September 2026. The owner's question: why download a country when a map only fetches the area in view?

## The rule
A wireframe is built where someone arrives: a searched place, a substation, a register project, a field or a route. The measured ground under it is the LiDAR terrain (DTM) and surface (DSM). It is streamed for the tiles that place touches, the way a map fetches only the tiles in view.

1. **Tiles, like a map.**
   - Measured ground is asked for in fixed 2,048 m x 2,048 m tiles, on a 2,048 m lattice of the British National Grid (EPSG:27700), clipped to the service's envelope.
   - A site or a route takes the tiles it touches.
   - A tile's corner is a cell corner: cell k has its south-west corner at e0 + k metres and its centre at e0 + k + 0.5 metres.
2. **One request per product per tile, once per visit.** DTM once and DSM once. The same ground is never asked for in smaller pieces.
3. **Polite pace.**
   - One request at a time to a public service, at least 40 s apart, and at most 16 requests per client per day (a chosen cap, not a measured limit).
   - A refusal (HTTP 403 or 429) starts a 5-minute pause, which doubles on each further refusal up to 1 hour.
   - A refusal after the 1-hour pause stops the fetcher until a person restarts it.
   - Past the daily cap, the fetcher stops and says which tiles are missing.
   - Source: the service refused a client that asked about ten times in three minutes, 18 s apart on average (recorded in the client code on 27 September 2026). 40 s is more than twice that spacing.
4. **Stream, don't download.**
   - A tile streams from the service straight into memory, onto the GPU where possible. It is processed there.
   - Only the derived wireframe and a receipt are kept. The receipt names the source, product, release, survey year, tile, request, fetch time and sha256: enough to request the identical tile again. The sha256 is of the decoded cell values, not the file bytes, so a change of file encoding is not a change of source. It also carries the licence and attribution (Open Government Licence v3.0, Environment Agency), which are shown wherever the wireframe is displayed.
   - The only raw cache is the HTTP cache, or a page cache of stated size and expiry. There is no local mirror of raw heights.
5. **Stored wireframe first.** Where a derived wireframe for a tile is already stored, it is drawn from that. The service is asked only where none exists.
6. **Arrival fetches; movement never does.** Walking, flying, panning and zooming draw from what has arrived. They never ask the service.
7. **No bulk.**
   - No national, county or tile-set downloads.
   - No pre-fetching of places nobody has arrived at.
   - A national screen uses light national layers. 1 m LiDAR is streamed only for the shortlisted sites, under rules 1 to 6.
8. **Provenance by receipt.** Every derived value carries its receipt id. A re-fetch whose sha256 differs from the receipt is labelled "source changed" and re-derived.
9. **Survey year before scanning.**
   - The survey year comes from the service's survey index, read before streaming.
   - The heights are "pre-construction ground" if either of these holds:
     - an asset's build year is the same as or later than any survey year under it;
     - either year is unknown.
   - Pre-construction ground is used for ground work (piles, earthworks, drainage, slope) and is never scanned for the asset.
   - Rows are scanned only where both the DSM and the DTM postdate the build.
10. **Outside coverage is said, not filled.** "No measured ground here" covers three cases, and none of them is ever 0 m:
    - an error;
    - a box outside the envelope;
    - exact zeros with no nodata tag, or a run of exact zeros (at borders and at sea).

    The wireframe then falls back to a labelled coarser layer, and to procedural fill labelled "estimated".
11. **Scope.** Rules 1 to 6 govern measured ground (LiDAR). Imagery map tiles follow the map's own tile rules.
12. **Where the code lives.**
    - The tile maths is pure, with no network and no DOM, and belongs in the grid engine.
    - The fetcher belongs to the client.
    - The service is described once, in a source card.

## Why (27 September 2026)
- **One request for a 2,048 m DTM box, at a solar farm in England:** HTTP 200 in 1.6 s (reported by the fetcher). It was 16.8 MB (4,194,304 cells of 32-bit float) and 100 % valid.
- **One request for a 4,096 m DTM box, at the same solar farm:** HTTP 200 in 7.9 s. It was 67.1 MB and 100 % valid, and its middle 2,048 m was identical to the first box, cell for cell (21:53 UTC). The tile size is therefore a choice, not a limit of the service.
- **Small pieces:** the same 2,048 m area in 256 m pieces is 64 requests.
- **Transfer per visit:** 16.8 MB per tile for the DTM. The DSM is not yet measured.
- **Bulk for England** was projected at 577 GB (130,310 km², DTM and DSM). It was never done.
- **The GPU maths** ran at about 250 km² a second, and a whole ingest at 24 km² a second. The fetch is the limit, and fetching only what is needed removes it.

## How it can fail (the negative twin)
Amend this rule if any of these is observed:
- the service refuses a single tile request where smaller requests succeed;
- a re-fetch of the same tile changes its sha256 with no new release;
- the survey index cannot give a survey year for a tile. Rule 9 then blocks row scans there, and the wireframe says so.

## Countersigned (27 September 2026)
Three independent witnesses were each asked to refute this rule. Version 1 was refused by two of them. Version 2 took in every fix they asked for, and all three signed it:
- **Witness 1, measurement: SIGN.**
  - It re-decoded the measured tile on the GPU, with a NumPy witness that agreed exactly.
  - It measured the 4,096 m request itself: HTTP 200, 67.1 MB, 100 % valid, and identical to the 2,048 m tile where they overlap.
  - It corrected four numbers and three wordings.
- **Witness 2, logic: SIGN.**
  - It asked for fixed lattice tiles, a 40 s pace with a daily cap, a stop that needs a person, "same as or later" for survey years, stored wireframe first, and arrival-only fetching.
  - It asked for the sha256 to be taken over decoded cells.
- **Witness 3, conformance and public safety: SIGN.**
  - It checked the rule against the five repositories and found no conflicts.
  - It asked for pure maths only in the engine, a source card, sourced or labelled numbers, the licence and attribution on display, and no private wording.
