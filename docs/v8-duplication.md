# Duplicated maths in ventus-corev8engine.js

All numeric claims below were checked with a standalone Node harness that copied each
formula out **verbatim** (only wrapped in a named function) — see
`verify_area.js` in this same output folder for the exact script and full console output.

## The three area implementations

### Impl A — `_zoneDrawCalcArea`, lines 134-149
Spherical-excess (shoelace-on-sphere) polygon area, used by the Zone Draw tool.

```js
function _zoneDrawCalcArea(pts) {
    if (pts.length < 3) return { areaKm2: 0, areaHa: 0, areaAc: 0, areaMi2: 0, areaM2: 0, perimKm: 0, pitches: 0 };
    let area = 0;
    const R = EARTH_RADIUS_KM;
    for (let i = 0; i < pts.length; i++) {
        const j  = (i + 1) % pts.length;
        const xi = pts[i][0] * Math.PI / 180, yi = pts[i][1] * Math.PI / 180;
        const xj = pts[j][0] * Math.PI / 180, yj = pts[j][1] * Math.PI / 180;
        area += (xj - xi) * (2 + Math.sin(yi) + Math.sin(yj));
    }
    const areaKm2 = Math.abs(area) * R * R / 2;
    ...
    return { areaKm2, areaHa: areaM2 / 10000, areaAc: areaM2 / 4046.85642, areaMi2: areaKm2 * 0.386102, areaM2, perimKm, pitches: areaM2 / 7140 };
}
```

### Impl B — inline in `updateMeasureDisplay`, lines 481-490
The **identical** shoelace-on-sphere formula, copy-pasted into the Measure tool instead
of calling Impl A:

```js
let area = 0;
const R = EARTH_RADIUS_KM;
for (let i = 0; i < measurePoints.length; i++) {
    const j  = (i + 1) % measurePoints.length;
    const xi = measurePoints[i][0] * Math.PI / 180; const yi = measurePoints[i][1] * Math.PI / 180;
    const xj = measurePoints[j][0] * Math.PI / 180; const yj = measurePoints[j][1] * Math.PI / 180;
    area += (xj - xi) * (2 + Math.sin(yi) + Math.sin(yj));
}
const areaKm2 = Math.abs(area) * R * R / 2;
const areaHa  = areaKm2 * 100; const areaAc  = areaKm2 * 247.105;
```

### Impl C — inline in `doRadiusAreaMeasure`, lines 576-582
A **different formula for a different shape** — spherical-cap area from a radius
(circle), not a shoelace sum over vertices (polygon):

```js
const R = EARTH_RADIUS_KM;
const areaKm2  = 2 * Math.PI * R * R * (1 - Math.cos(km / R));
const areaM2   = areaKm2 * 1000000;
const areaHa   = areaM2 / 10000;
const areaAc   = areaM2 / 4046.85642;
const areaMi2  = areaKm2 * 0.386102;
const pitches  = areaM2 / 7140;
```

### Do they agree?

**A and B: yes, exactly** — they are the same formula. Worked examples:

- 1 km × 1 km square centred at 55°N (built as a true 1 km² square on the ground via
  local equirectangular offsets): **A = 1.00000000 km², B = 1.00000000 km²**, matching
  the planar 1 km² expectation (the shoelace-on-sphere formula reduces to the planar
  answer at this scale, as it should).
- Real 5-point irregular polygon near London (`[-0.1000,51.5000], [-0.0950,51.5020],
  [-0.0900,51.4995], [-0.0930,51.4960], [-0.0990,51.4965]`): **A = 0.30664823 km²,
  B = 0.30664823 km²** — identical to 8 decimal places.
- The only place A and B diverge at all is the **acres** conversion, and only in the
  6th significant figure: A divides through `areaM2 / 4046.85642` (exact acre-to-m²);
  B multiplies `areaKm2 * 247.105` (a rounded acres-per-km² constant). For the London
  polygon: A gives 75.774428 ac, B gives 75.774311 ac. Harmless at this precision, but
  it is a second, smaller inconsistency riding on top of the main duplication — a strong
  argument for one shared area function with one set of conversion constants.

**C is not comparable to A/B on the same input** — it solves a genuinely different
problem (area enclosed by a fixed geodesic radius vs. area enclosed by an arbitrary
polygon), so "do they agree" only makes sense as: does C reduce to the planar circle
formula at small scale, and diverge correctly at large scale (sphere, not plane)?
Checked for radius = 0.001, 1, 100, 1000, 5000 km against `π·r²`:

| radius (km) | Impl C areaKm² | planar π·r² | ratio |
|---|---|---|---|
| 0.001 | 0.0000033 | 0.0000031 | 1.0027 |
| 1 | 3.141593 | 3.141593 | 1.0000 |
| 100 | 31415.28 | 31415.93 | 0.99998 |
| 1000 | 3,135,162 | 3,141,593 | 0.99795 |
| 5000 | 74,599,137 | 78,539,816 | 0.94983 |

This is correct spherical-cap behaviour, not a bug — but it means Impl C **cannot be
substituted for A/B** (and vice versa) even though all three ultimately answer "how
many km²/ha/acres/football pitches is this area". The module split in `seams.md` keeps
them as two distinct, explicitly-named pure functions (`polygonAreaKm2` and
`circleCapAreaKm2`) rather than pretending they are one function.

## A fourth duplication found while looking: the circle-point (destination-point) formula

Not an area formula, but the same class of problem — two independent, byte-for-byte
identical implementations of "walk n points around a centre at radius r on a sphere":

- `_zoneDrawCirclePoints(lon, lat, radiusKm, n)` — lines 122-132 (Zone Draw tool; caller
  supplies `n`, fixed at `ZONE_DRAW_VERTICES = 24`).
- `createGeoJSONCircle(lon, lat, radiusKm)` — lines 727-740 (Radius tool and Radius-Area
  tool; picks its own point count — 64/96/128 — based on `radiusKm`, and additionally
  closes the ring and wraps the result as a `FeatureCollection`).

Both use the exact same destination-point-on-a-sphere maths:
```js
const ad = radiusKm / R;
const lat1 = lat * DEG;
const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ad) + Math.cos(lat1) * Math.sin(ad) * Math.cos(b));
const lon2 = lon * DEG + Math.atan2(Math.sin(b) * Math.sin(ad) * Math.cos(lat1), Math.cos(ad) - Math.sin(lat1) * Math.sin(lat2));
```
Verified: calling both with the same `(lon, lat, radiusKm, n)` produces points that
match to 0 absolute difference (max abs diff over 64 points = 0). This is the fourth
duplicate, and the cleanest one to collapse — `createGeoJSONCircle` should just call the
lower-level point generator and wrap it.

## `haversine` — checked, NOT duplicated

`haversine(lon1, lat1, lon2, lat2)` (lines 45-50) is the one distance primitive with a
single implementation, correctly reused everywhere a great-circle distance is needed:
the Zone Draw perimeter (line 146), the Measure tool's line/perimeter length (lines 469,
479), and the Radius-search filter (line 959, `haversine(lon, lat, flon, flat) <= km`).
No duplicate distance/haversine formula was found. This is the one piece of geodesy in
the file that was already done right — the module split should keep it that way rather
than let the area-function consolidation accidentally fork it too.

## Bearing

No bearing/initial-course calculation exists anywhere in the file (only the inverse use
of bearing, `b`, as the sweep variable when constructing circle points — that is a loop
angle 0..2π, not a computed bearing between two features). Nothing to deduplicate here.

## Degree↔metre conversion

No standalone degree-to-metre converter exists; each caller inlines its own local
version at the point of use:
- `_zoneDrawOnClick` (lines 294 and 317, the **same function**, two branches) computes
  `mpp = (km * 2000) / (window.innerWidth * 0.6)` then a target zoom from it — this is
  the same three lines pasted twice in one function rather than a cross-file duplicate,
  but it is exactly the kind of thing that disappears once the click handler stops
  branching on "first point vs. subsequent point".
- `snapLines` (line 689) converts its degree-tolerance window using `Math.cos(coord[1] *
  RAD)` — a local, self-contained equirectangular approximation for a tight tolerance
  check, not shared with anything else.
- `_zoneDrawGetRadius`/radius inputs work in km directly, never converting to metres.

None of these overlap enough to be called a duplicate; they're independent one-off
approximations rather than one algorithm copy-pasted, so they are left alone in the
proposed split rather than force-fitted into a shared converter.
