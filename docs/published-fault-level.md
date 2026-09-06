# Published fault level

`engine/published-fault-level.js` is a validation and quoting contract for
fault-level figures that OTHER publishers produced. It carries no formula. It
exists so that a figure reaches a map only when it is published, dated, named
by exact metric and attributed to a stated study basis — and never when it was
calculated here.

The paper that explains why, with the engineering, the regulation and what
each GB network publishes:
https://globalgrid2050.com/papers/202609060045-published-fault-level/

## Why one number is not one

The short-circuit current at a busbar is set by the network's Thevenin
impedance there, `Z = R + jX`. `|Z|` sets the symmetrical current; `X/R` sets
how fast the DC offset decays, so the first-cycle peak ("make") and the RMS
current at contact separation ("break") differ for the same bus, and
three-phase and single-phase-to-earth faults differ again. NESO's ETYS
Appendix D publishes eight separately named currents for this reason.
data-grid-gb's contract: "A consumer must not collapse them into a single
generic 'fault level'."

## The API

```js
import { record, quote, ETYS_METRICS, LTDS_METRICS, METRIC_LABELS }
  from './engine/published-fault-level.js';

const r = record({
  provenance: {
    publisher: 'NESO',
    publication: 'Electricity Ten Year Statement 2025, Appendix D',
    source_url: 'https://www.neso.energy/document/383951/download',
    sha256: 'ad8b54fa0b0562c34295514c150f33913a92fc756ff140e0154d53c181363440',
    published_date: '2026-06-30',
    study_basis: 'peak demand, winters 2025/26 to 2033/34'
  },
  site: { name: 'ABHAM', voltage_kv: 132, busbar: 'ABHA1 M2', operator: 'NGET' },
  metrics: { three_phase_rms_break_current_ka: { min: 12.78, max: 14.52 } }
});
// r = { ok: true, record: <frozen, computed:false>, refused: null }

quote(r.record, 'three_phase_rms_break_current_ka');
// "three-phase RMS break current 12.78–14.52 kA · ABHAM ABHA1 M2 132 kV
//  · NESO, Electricity Ten Year Statement 2025, Appendix D
//  · peak demand, winters 2025/26 to 2033/34 · published 2026-06-30"
```

| Input | Refused when |
|---|---|
| `provenance.*` | any of publisher, publication, source_url, sha256, published_date, study_basis is missing; URL not http(s); hash not 64 hex; date not `YYYY-MM-DD` |
| `site` | no name or no positive `voltage_kv` |
| `metrics` | empty; a name in `REFUSED_GENERIC_NAMES` (`fault_level`, `short_circuit_level`, `scl`, `maximum_fault_level`, …); an unknown name with no declared unit and label; a vocabulary name carrying a different unit; min > max; negative |

A refusal is returned, not thrown: `{ ok:false, refused:'<reason naming the field>' }`.

## What it must not do — a tested property

The proof asserts the only callables are `record` and `quote`, and that none
computes, calculates, estimates, solves, or offers headroom or margin. A
negative control on a scratch copy (accept generic names, export
`computeHeadroom`) turns three checks red. `NOT_COMPUTED` and `NO_HEADROOM`
are exported strings a card may print to say so.

## Vocabulary

`ETYS_METRICS` — the eight Appendix D currents, copied byte-for-byte from
data-grid-gb `chatgpt/ingest_etys.py` `FAULT_COLUMNS` at `b91e45b`.
`LTDS_METRICS` — names a DNO Long Term Development Statement commonly
publishes, kept as a separate list so a reader sees which publisher a name
belongs to. `METRIC_LABELS` — unit and the only label a card may print.

## Not yet

No distribution figure is on the Atlas. The contract refuses anything without
a date, a basis and an exact name; the next step is a data-lane product that
pins each network's LTDS Table 4 by bytes and hash, as the ETYS workbooks are
pinned. The transmission product's own ledger currently records no publication
date or licence, so it too must be extended at source before it passes
`record()`.
