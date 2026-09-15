# spider/ — assets for the receiver at ../index.html

`../index.html` (the GitHub Pages landing page) is an adaptation of the
living Spider Sandbox reference, `dashboard/sandbox/spider_full_po_test.html`
in the data-federation-map-for-globalgrid2050-all-repos repository,
confirmed byte-identical (module line endings aside) to the live copy at

    https://ventusltd.github.io/data-federation-map-for-globalgrid2050-all-repos/dashboard/sandbox/spider_full_po_test.html?utm_source=chatgpt.com

This folder holds everything that reference pulls in beside its own HTML,
copied verbatim, plus the small manifest this repo adds on top:

| file | copied verbatim from | notes |
|---|---|---|
| `federation_radial.css` | `dashboard/federation_radial.css` (94 lines) | the architect's gold spider-button glow override. Untouched. |
| `data/nodes.json` | `live_sandbox/federation_control_ledger/data/nodes.json` | the federation root graph (its current count is the `measured` field of the `federation` entry in `manifest.json`) |
| `data/edges.json` | `live_sandbox/federation_control_ledger/data/edges.json` | the federation root edges |
| `data/contents/manifest.json`, `nodes.json`, `edges.json` | `data/federation_map/contents/provenance=declared/repo=Ventusltd__globalgrid2050/` | the "globalgrid2050 contents" scope, reached in the page via the same "⊕ Contents" card the reference uses |
| `manifest.json` | new | lists every graph the page can load, among them `federation`, `globalgrid2050-contents`, `engine-graph` (genome/engine-graph.json, generated in this repo by genome/build-graph.mjs) and `genome-spider` (read live from spiders/species/genome-spider's published `data/nodes.json` + `data/edges.json`; an entry with `edges_path` takes its edges from that second file). Every entry carries a `measured` node/edge count, refreshed by `update_manifest.py` |
| `receiver.proof.mjs` | new | browser-driven proof of the page, see below |
| `manifest.proof.mjs`, `fixtures/` | new | fetches every manifest graph and fails if a stated count differs from the served count or a path does not load; proves first that it fails `fixtures/manifest.negative.json` (a stale count and a missing path) |

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

## How new graphs arrive (added 2026-09-14)

| file | what |
|---|---|
| `sources.yml` | the registries the dashboard reads: `features.yml` files published by other repositories (first: `Ventusltd/stars`), each listing graphs in the same shape as a `manifest.json` entry |
| `update_manifest.py` | run hourly by `.github/workflows/spider-features.yml` after `node verify.mjs` passes: fetches every registered graph, and adds it to `manifest.json` only when it is reachable and non-empty, with a `verified` line. Hand-written prose is never changed; nothing is deleted; `index.html` is not touched. On every run it also refreshes the `measured` count of every entry it can read, so no count is left to go stale in a description |
| `manifest.proof.mjs` | run by the same workflow after the manifest and overview are rewritten and before anything is committed: `node spider/manifest.proof.mjs` (add `--base=https://ventusltd.github.io/ventus-grid-engine/` to read `./` paths from the published site). It needs the network, so `verify.mjs` (offline) does not run it |

A manifest entry that carries a `registry` field was brought in this way and is kept up to date from that registry.
