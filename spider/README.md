# spider/ — assets for the receiver at ../index.html

`../index.html` (the GitHub Pages landing page) is an adaptation of the
living Spider Sandbox reference:

    C:\Users\vikra\OneDrive\Documents\GitHub\data-federation-map-for-globalgrid2050-all-repos\dashboard\sandbox\spider_full_po_test.html

confirmed byte-identical (module line endings aside) to the live copy at

    https://ventusltd.github.io/data-federation-map-for-globalgrid2050-all-repos/dashboard/sandbox/spider_full_po_test.html?utm_source=chatgpt.com

This folder holds everything that reference pulls in beside its own HTML,
copied verbatim, plus the small manifest this repo adds on top:

| file | copied verbatim from | notes |
|---|---|---|
| `federation_radial.css` | `dashboard/federation_radial.css` (94 lines) | the architect's gold spider-button glow override. Untouched. |
| `data/nodes.json` | `live_sandbox/federation_control_ledger/data/nodes.json` | the federation root graph (17 features) |
| `data/edges.json` | `live_sandbox/federation_control_ledger/data/edges.json` | the federation root edges |
| `data/contents/manifest.json`, `nodes.json`, `edges.json` | `data/federation_map/contents/provenance=declared/repo=Ventusltd__globalgrid2050/` | the "globalgrid2050 contents" scope, reached in the page via the same "⊕ Contents" card the reference uses |
| `manifest.json` | new | lists every graph the page can load: `federation`, `globalgrid2050-contents`, `engine-graph` (genome/engine-graph.json — may not exist yet), `genome-spider` (documented empty slot, spiders/species/genome-spider did not exist when this was built) |
| `receiver.proof.mjs` | new | browser-driven proof of the page, see below |

## Running the proof

`node verify.mjs` at the repo root does **not** pick up
`receiver.proof.mjs` — checked: `verify.mjs` calls
`readdirSync(join(here, 'proofs'))` and filters for `*.proof.mjs`, which
only reads the top level of `proofs/`, not this folder. That behaviour was
left alone rather than edited around. Run this proof directly instead:

```
node spider/receiver.proof.mjs
```

It needs the `playwright` package with Chromium installed, which is
deliberately not added to this repo's `package.json`. Install it ad hoc:

```
npm i -D playwright && npx playwright install chromium
```

The proof exits non-zero (and says so plainly) if `playwright` cannot be
found — an unverified receiver is never reported as a pass.

## What was changed versus the reference, exactly

Only three lines differ from `spider_full_po_test.html`, all path
repointing (the page now lives at the repo root instead of two directories
under `dashboard/sandbox/`):

- the stylesheet `<link>` now reads `./spider/federation_radial.css`
  (was `../federation_radial.css`)
- `DATA_BASE` now reads `"./spider/data/"`
  (was `"../../live_sandbox/federation_control_ledger/data/"`)
- `CONTENTS_BASE` now reads `"./spider/data/contents/"`
  (was `"../../data/federation_map/contents/provenance=declared/repo=Ventusltd__globalgrid2050/"`)

Everything else — every class name, every control, the 🕷 button markup and
behaviour, the card layout, the spider-canvas drawing code — is copied
character for character. The manifest-driven extra graphs (`engine-graph`,
`genome-spider`) are added as new functions appended after the reference's
own functions, and the reference's closing IIFE is replaced with an
equivalent one (`wireReceiver()`) that does the same `loadRoot()` /
`loadContents()` call and then layers the new graphs on top of the same
`SCOPES` / card / FOCUS machinery, unchanged.
